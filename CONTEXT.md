# CONTEXT.md — Documentação e Arquitetura Geral do SaldoARP

---

## 1. Visão Geral e Propósito

O **SaldoARP** é uma aplicação web moderna e de alta confiabilidade voltada à **auditoria, governança, consulta e reconciliação contábil de Atas de Registro de Preços (ARP)** da Administração Pública Federal brasileira.

O sistema atua consolidando dados públicos de múltiplos portais estruturantes governamentais:
- **Compras.gov.br (SIASG / módulo-arp)**: Consulta de atas homologadas, itens, quantitativos e saldos por órgão participante/gerenciador.
- **Portal Nacional de Contratações Públicas (PNCP)**: Consulta oficial de atas publicadas e contratos administrativos celebrados.
- **Contratos.gov.br**: Detalhamento de contratos, itens de contratação e histórico de execução financeira de notas de empenho.

---

## 2. Invariantes Contábeis e Regras de Negócio Fundamentais

### 2.1. Hierarquia e Cardinalidade Canônica
A estrutura do domínio segue estritamente a hierarquia orçamentária e contratual pública:

$$\text{ARP (Ata de Registro de Preços)} \longrightarrow \text{Itens da Ata} \longrightarrow \text{Órgãos / UASGs} \longrightarrow \text{Notas de Empenho (NE)} \longleftrightarrow \text{Contratos}$$

- **Item $\to$ Empenhos**: Relação de $1 : N$. Um item da ata pode ser empenhado através de múltiplas Notas de Empenho ao longo de sua vigência.
- **Contrato $\longleftrightarrow$ Empenhos**: Relação $N : N$ modelada através da entidade associativa `contrato_empenho`. Um contrato pode vincular 1 ou mais empenhos, e um empenho pode estar associado a um contrato ou ser uma execução direta por Nota de Empenho.

### 2.2. A Fórmula Oficial do Saldo da Ata
O saldo remanescente de um item de Ata de Registro de Preços é consumido **exclusivamente por Notas de Empenho**:

$$\mathbf{SaldoARP} = \mathbf{QuantidadeRegistrada} - \sum \mathbf{Empenhos}$$

> [!IMPORTANT]
> **Contratos e Alocações NÃO reduzem o saldo da Ata de Registro de Preços:**
> 1. **Contratos**: São instrumentos jurídicos formais que formalizam a relação com o fornecedor e agrupam/lastreiam notas de empenho. Subtrair contratos e empenhos simultaneamente geraria contagem dupla.
> 2. **Alocações Internas (Departamentais)**: Representam divisões administrativas/planejamento interno de cotas entre diretorias ou coordenações. O saldo da alocação departamental é $\text{SaldoAlocação} = \text{CotaAlocada} - \sum \text{EmpenhosDoDepartamento}$, não afetando o saldo global da Ata.

### 2.3. Reconciliação Contábil (`reconcileBalances`)
O sistema realiza conferência contínua entre duas fontes:
- **Fonte 1**: Saldo reportado diretamente pela API do Compras.gov.br.
- **Fonte 2**: Saldo calculado matematicamente pelo somatório das Notas de Empenho apuradas.

**Regra de Não-Interferência Destrutiva**: Em caso de divergência entre o saldo calculado e o saldo da API, o sistema **NÃO** altera nenhum dos valores arbitrariamente; ele exibe um alerta explícito com o delta numérico (ex: `⚠️ Divergência de 7 unidades`) e classifica o item com status `DIVERGENTE`.

### 2.4. Matriz de Confiança dos Registros
Todos os registros de empenho e contrato são classificados de forma visual e auditável:

| Indicador | Classificação | Descrição |
| :--- | :--- | :--- |
| 🟢 | **Oficial** | Registro retornado diretamente pela API oficial (SIASG/PNCP/Contratos.gov). |
| 🟡 | **Manual** | Inserido manualmente pelo usuário por ausência momentânea nos dados abertos. |
| 🔵 | **Sincronizado** | Inserido manualmente e posteriormente confirmado e vinculado pela API oficial. |
| 🔴 | **Divergente** | Registro com discrepância de quantidade ou valor entre fontes. |

### 2.5. Promoção Automática (`matchAndMergeEmpenhos`)
Quando uma Nota de Empenho cadastrada como `MANUAL` passa a ser retornada pela API do Compras.gov.br / Contratos.gov.br com a mesma chave canônica ($\text{número normalizado} + \text{ano} + \text{UASG} + \text{item}$), o sistema **promove** o registro para `SINCRONIZADO`, preservando vínculos departamentais e evitando duplicidade.

### 2.6. Integridade e Segurança dos Dados (Fim dos Dados Fictícios)
- Proibição estrita de gerar números de controle PNCP artificiais (`numeroControlePncp`). Se o PNCP não fornecer o identificador, o campo permanece vazio/nulo.
- Links e URLs do PNCP só são renderizados se oficiais e válidos.
- Remoção total de CNPJs ou identificadores mockados em código.
- Travas de formulário: **Impossível criar um Contrato Manual sem vincular previamente a pelo menos 1 Nota de Empenho**.

---

## 3. Entidades do Domínio

Todas as interfaces e contratos de tipo TypeScript estão centralizados em [`src/types/index.ts`](src/types/index.ts):

### 3.1. `Empenho`
Representa a Nota de Empenho emitida contra um item da Ata:
```typescript
export interface Empenho {
  id: string;
  numero: string;               // Ex: "2026NE000142"
  ano: number;                  // Ex: 2026
  arpId: string;                // Ex: "00003/2026"
  itemId: string;               // Ex: "1"
  uasg: string;                 // Ex: "200331"
  quantidade: number;           // Quantidade física consumida do item
  valorUnitario?: number;       // Valor unitário homologado
  valorTotal?: number;          // Valor total empenhado
  data?: string;                // Data de emissão (YYYY-MM-DD)
  fornecedor?: string;          // Razão social do fornecedor
  cnpjFornecedor?: string;      // CNPJ formatado
  unidadeInternaId?: string;    // ID da alocação interna vinculada
  origem: 'API' | 'MANUAL' | 'SINCRONIZADO';
  status?: 'CONFIRMADO' | 'PENDENTE' | 'DIVERGENTE';
  observacao?: string;
  criadoEm: string;
  atualizadoEm: string;
}
```

### 3.2. `Contrato`
Representa o Contrato Administrativo celebrado:
```typescript
export interface Contrato {
  id: string;
  numero: string;               // Ex: "12/2026"
  ano: number;                  // Ex: 2026
  uasg: string;                 // Ex: "200331"
  objeto?: string;
  fornecedor?: string;
  cnpjFornecedor?: string;
  quantidadeContratada?: number;
  valorTotal?: number;
  dataAssinatura?: string;
  dataVigenciaInicio?: string;
  dataVigenciaFim?: string;
  numeroControlePncp?: string;  // Apenas se fornecido oficialmente pelo PNCP
  linkPncp?: string;            // Apenas se fornecido oficialmente pelo PNCP
  origem: 'API' | 'MANUAL';
  criadoEm: string;
  atualizadoEm: string;
}
```

### 3.3. `ContratoEmpenho` (Tabela Associativa $N:N$)
```typescript
export interface ContratoEmpenho {
  id: string;
  contratoId: string;
  empenhoId: string;
  quantidadeVinculada?: number;
  dataVinculo: string;
  origem: 'API' | 'MANUAL';
}
```

### 3.4. `InternalAllocation` (Alocação Interna Departamental)
```typescript
export interface InternalAllocation {
  id: string;
  unitName: string;            // Sigla da Unidade (ex: "DITEL", "DTI", "CGTI")
  allocatedQty: number;        // Cota alocada
  empenhadaQty: number;        // Total de empenhos vinculados à unidade
}
```

### 3.5. `ReconciliationReport` (Relatório de Reconciliação)
```typescript
export interface ReconciliationReport {
  quantidadeRegistrada: number;
  totalEmpenhadoApi: number;
  totalEmpenhadoManual: number;
  totalEmpenhado: number;
  saldoCalculado: number;
  saldoApi: number | null;
  divergencia: number;
  status: 'CONSISTENTE' | 'DIVERGENTE' | 'SEM_DADOS_API';
  mensagem: string;
}
```

---

## 4. Arquitetura de Frontend

Construído com **React 18/19 + TypeScript + Vite**, priorizando performance e usabilidade:

```
src/
├── App.tsx                          # Roteamento global de estados (Busca -> Detalhes -> Alocações Globais)
├── components/
│   ├── ArpSearch.tsx                # Painel de busca e filtros de Atas (Vigência, UASG, Órgão, Número)
│   ├── Header.tsx                   # Barra de navegação institucional e alternância de visões
│   ├── ItemBalances.tsx             # Orquestrador da visualização do Item, saldos e abas
│   ├── ItemReconciliationCard.tsx   # Card executivo visual de Reconciliação Contábil
│   ├── InternalAllocationsDashboard.tsx # Painel de governança de cotas de todas as atas
│   ├── ManageDepartmentsModal.tsx   # Modal de gestão de siglas oficiais de unidades
│   ├── cards/                       # Componentes modulares para listagem de atas e itens
│   └── modals/
│       ├── ManualEmpenhoModal.tsx   # Modal de inclusão/edição de Nota de Empenho
│       └── ManualContratoModal.tsx  # Modal de Contrato com trava de empenho obrigatório
└── index.css                        # Design System Vanilla CSS (Tokens, Glassmorphism, Dark/Light)
```

---

## 5. Arquitetura de Backend e Proxies (BFF Serverless)

A aplicação utiliza uma arquitetura **BFF (Backend-For-Frontend) Serverless**:

```
[ Frontend React (SPA) ] 
       │
       ▼
[ Proxy Vercel Edge (vercel.json) ] ──┬──► [ API Compras.gov.br (SIASG/módulo-arp) ]
                                      ├──► [ API PNCP (Portal Nac. Contratações) ]
                                      └──► [ API Contratos.gov.br ]
       │
       ▼
[ Supabase Backend (PostgreSQL) ]
```

### Arquivos Principais:
1. [`vercel.json`](vercel.json): Configura os proxies reversos em tempo de execução para contornar problemas de CORS:
   - `/api-arp/*` $\to$ `https://dadosabertos.compras.gov.br/*`
   - `/api-pncp/*` $\to$ `https://pncp.gov.br/*`
   - `/api-contratos-gov/*` $\to$ `https://contratos.comprasnet.gov.br/*`
2. [`src/services/api.ts`](src/services/api.ts): Camada de integração com sanitização de parâmetros, fallback por UASG/Ano e agregação de dados.
3. [`src/services/balanceService.ts`](src/services/balanceService.ts): **Motor matemático oficial** isolado (cálculo de saldo $\mathbf{Saldo} = \mathbf{Qtd} - \sum \mathbf{Empenhos}$, conciliação e matching inteligente).

---

## 6. Arquitetura de Banco de Dados (DB)

A persistência do sistema é **híbrida (Supabase PostgreSQL + LocalStorage Fallback)**:

### Serviços de Banco de Dados:
- [`src/services/dbCacheService.ts`](src/services/dbCacheService.ts): Cache relacional das Atas e Itens consultados.
- [`src/services/allocationService.ts`](src/services/allocationService.ts): CRUD de alocações departamentais, empenhos manuais, contratos manuais e tabela associativa `contrato_empenho`.
- [`src/services/unitService.ts`](src/services/unitService.ts): Gestão do catálogo oficial de unidades internas.

### Schema Relacional no Supabase (PostgreSQL):
```sql
-- 1. Catálogo Oficial de Departamentos
CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  sigla TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Alocações Internas (Cotas por Item da Ata)
CREATE TABLE allocations (
  item_key TEXT PRIMARY KEY, -- formato: {numeroAta}-{codigoUasg}-{numeroItem}
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Vínculos de Empenhos a Departamentos
CREATE TABLE empenho_links (
  item_key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Notas de Empenho Manuais
CREATE TABLE manual_empenhos (
  item_key TEXT PRIMARY KEY,
  data JSONB NOT NULL, -- Array de objetos Empenho
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Contratos Manuais
CREATE TABLE manual_contratos (
  item_key TEXT PRIMARY KEY,
  data JSONB NOT NULL, -- Array de objetos Contrato
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabela Associativa Contrato-Empenho (N:N)
CREATE TABLE contrato_empenho (
  item_key TEXT PRIMARY KEY,
  data JSONB NOT NULL, -- Array de objetos ContratoEmpenho
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Cache de Atas e Itens
CREATE TABLE arps_cache (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. Como Executar, Testar e Publicar

### 7.1. Instalação e Execução Local
```powershell
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento local
npm run dev
```

### 7.2. Execução da Suíte de Testes Unitários
```powershell
# Executar testes unitários com Vitest
npx vitest run
```

### 7.3. Build de Produção
```powershell
# Validar tipagem TypeScript e gerar pacote otimizado em dist/
npm run build
```

---

## 8. Links e Ambientes Oficiais

- **Ambiente de Produção (Vercel)**: [https://cglic.vercel.app](https://cglic.vercel.app)
- **Repositório GitHub**: [https://github.com/LU1SMART1NS/CGLIC-system](https://github.com/LU1SMART1NS/CGLIC-system)
- **Branch Principal de Produção**: `main`
- **Branch de Release da Versão 2**: `v2.0`
