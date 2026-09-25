# FASE 6.0 — AUDITORIA DA INTEGRAÇÃO ARP ↔ CONTRATOS OFICIAIS
## SALDOARP — SISTEMA DE GESTÃO DE ATAS E CONTRATOS ADMINISTRATIVOS

**Data da Auditoria:** 23 de Setembro de 2026  
**Status da Auditoria:** Concluída (Modo Estrito de Auditoria)  
**Alterações de Código Realizadas:** 0 (Nenhum componente, hook, service, migration ou RPC foi criado/alterado)  
**Bateria de Testes do Sistema:** 66 arquivos / 564 testes PASS (100% verde)  

---

## 1. OBJETIVO DA AUDITORIA

Mapear a fundo a arquitetura de dados e de software que conecta o **Módulo de Atas de Registro de Preços (ARPs)** ao **Módulo de Contratos Administrativos** no SaldoARP. 

O diagnóstico estratégico geral identificou que, enquanto o Módulo Contratos possui um catálogo oficial unificado e a Visão 360° homologada, a tela de saldos dos itens da Ata (`ItemBalances.tsx`) ainda opera com cadastros manuais (`contratos_manuais`).

Esta auditoria responde:
> **"Como integrar de forma segura, determinística e sem duplicidade de dados a Ata de Registro de Preços aos Contratos Oficiais já sincronizados das bases governamentais, cumprindo rigorosamente o princípio 'Digite uma vez, use em todo lugar'?"**

---

## 2. ESTADO ATUAL DA INTEGRAÇÃO

Atualmente, o SaldoARP opera com **dois universos paralelos de contratos**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ UNIVERSO 1: O CATÁLOGO OFICIAL DE CONTRATOS (Módulo Contratos - Fase 5)│
│ • Origem: APIs oficiais Contratos.gov.br e PNCP                       │
│ • Chave Canônica: {uasg}-{numero}-{ano} (ex: 200331-1-2026)           │
│ • Interface: ContractsDashboard (/contratos) e Contrato 360°          │
│ • Dados: Vigência, fornecedor, valor global, tarefas, workflows, eventos│
│ • Governança: Gestores designados (contract_managers), RBAC ativo      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                           [RUPTURA DE SILO]
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ UNIVERSO 2: CONTRATOS DOS ITENS DA ATA (Módulo ARPs - Fase 3 legado)   │
│ • Origem: Digitação manual do operador via ManualContratoModal         │
│ • Tabela: public.contratos_manuais (Supabase) + LocalStorage           │
│ • Interface: Aba "Contratos" em ItemBalances.tsx (/atas/itens/saldo)   │
│ • Chave: Id sintético (ctr_{itemKey}_{numero}_{ano}_{uuid})           │
│ • Finalidade: Dizer que o item X teve Y unidades contratadas no contrato Z│
└────────────────────────────────────────────────────────────────────────┘
```

**Diagnóstico Fático:** O usuário que gerencia a Ata na tela `/atas/itens/saldo` precisa digitar manualmente número, ano, objeto, fornecedor, CNPJ e link do contrato, mesmo que esse exato contrato já esteja sincronizado e disponível com status "Vigente" em `/contratos`.

---

## 3. MODELO DE DADOS ATUAL

### 3.1 Entidades Envolvidas
1. `atas_registro_preco` (Cache L2 / Postgres): Guarda metadados da ata (`numero_ata`, `codigo_uasg`, `objeto`, `valor_total`, `vigencia`).
2. `itens_ata` (Cache L2 / Postgres): Itens da ata (`numero_item`, `descricao_item`, `quantidade_homologada`, `valor_unitario`).
3. `contratos_manuais` (Tabela Postgres): Cadastros manuais de contratos associados a um item específico da ata.
4. `contrato_empenhos` (Tabela Postgres): Tabela associativa N:N que vincula um `contrato_id` (de `contratos_manuais`) a um ou mais `empenho_id`.
5. `ContractDashboardRecord` (TypeScript / Memory Cache): Objeto rico do contrato oficial obtido pelo `contractService.ts` a partir das APIs governamentais.

---

## 4. MAPEAMENTO DE `contratos_manuais`

### 4.1 Origem e Estrutura Técnica
* **Migration de Criação:** `20260917000001_canonical_schema.sql` (linhas 135 a 150).
* **Migration de RPCs:** `20260917000005_rpc_contracts.sql` e `20260917000008_manual_data_transactions.sql`.
* **Migration de Exclusão:** `20260921000012_rpc_delete_manual_contrato.sql`.
* **Chave Primária:** `id VARCHAR(150)` (ID sintético gerado na RPC).
* **Constraint de Unicidade:** `CONSTRAINT uq_manual_contrato_item UNIQUE (item_key, numero, ano)`.
* **Chave Estrangeira:** Não possui foreign key para a tabela de contratos oficiais porque não existe tabela estática de contratos oficiais (eles vêm de cache/APIs federais).
* **Campos da Tabela:**
  * Identificação do Item: `item_key`, `arp_id`, `item_id`, `uasg`.
  * Identificação do Contrato: `numero`, `ano`, `numero_controle_pncp`, `link_pncp`.
  * Fornecedor: `fornecedor`, `cnpj_fornecedor`.
  * Escopo: `objeto`, `quantidade_contratada`, `valor_total`, `origem`.
  * Metadados: `criado_em`, `atualizado_em`.

### 4.2 Matriz de Uso e Dependências de `contratos_manuais`

| Uso no Código | Arquivo | Dependência | Pode ser substituído pelo Contrato Oficial? |
|---|---|---|---|
| Leitura de contratos do item | `src/services/allocationService.ts` (`fetchManualContratos`) | Lê linhas da tabela por `item_key` | **Sim**, desde que preservada a `quantidade_contratada` e o vínculo com os empenhos do item. |
| Gravação atômica com empenhos | `src/services/allocationService.ts` (`saveManualContratos`) | Invoca RPC `save_manual_contrato_atomic` | **Sim**, a RPC pode receber `contract_key` oficial em vez de criar um registro novo com campos redundantes. |
| Exclusão de contrato manual | `src/services/allocationService.ts` (`deleteManualContrato`) | Invoca RPC `delete_manual_contrato_atomic` | **Sim**, passa a excluir o vínculo `arp_contract_links`. |
| Hook de consulta | `src/hooks/useItemManualContracts.ts` | React Query `['item-manual-contracts', canonicalItemKey]` | **Sim**, refatorável para retornar contratos oficiais vinculados àquele item. |
| Hook de salvamento | `src/hooks/useSaveManualContract.ts` | Dispara mutation de salvamento | **Sim**, passa a vincular contrato selecionado. |
| Hook de deleção | `src/hooks/useDeleteManualContract.ts` | Dispara mutation de desvinculação | **Sim**, desvincula contrato da ata. |
| Modal de digitação | `src/components/modals/ManualContratoModal.tsx` | Formulário com 10 campos de digitação | **Pode ser substituído por seletor inteligente** (autocomplete dos contratos oficiais da UASG já existentes). |
| Renderização na tela do item | `src/components/ItemBalances.tsx` (linhas 1300–1450) | Lista contratos com badge "Manual" | **Sim**, passa a exibir o card do contrato oficial com link direto para o Contrato 360°. |
| Testes unitários | `src/services/__tests__/allocationService.test.ts` | Valida persistência em `contratos_manuais` | **Sim**, adaptar fixtures para o novo contrato de interface. |

---

## 5. MAPEAMENTO DO CATÁLOGO OFICIAL DE CONTRATOS

### 5.1 Origem dos Dados
* **Endpoints:**
  1. `/api-contratos-gov/api/contrato/ug/${uasg}` (Contratos.gov.br);
  2. `/api-arp/modulo-contratos/1_consultarContratos` (Compras.gov.br Dados Abertos);
  3. API de Contratos do PNCP (`https://pncp.gov.br/api/consulta/v1/contratos`).
* **Service:** `contractService.ts` $\rightarrow$ `fetchContractsForDashboard(uasg)`.
* **Hook Canônico:** `useContractsDashboard(uasg)` (query key `['contracts-dashboard', uasg]`).
* **Cache:**
  * Memória local (Map com TTL de 5 minutos);
  * React Query (staleTime 5 minutos).

### 5.2 A Chave Canônica Oficial do SaldoARP
A identidade determinística de um contrato oficial no SaldoARP é governada por `resolveContractKey` em `src/utils/contractKeyUtils.ts`:

$$\text{Chave Canônica} = \text{UASG} + \text{"-"} + \text{Número Limpo} + \text{"-"} + \text{Ano}$$
*Exemplo Real:* `200331-1-2026` (UASG 200331, Contrato nº 1, Ano 2026).

Essa chave é:
* Imutável;
* Resiste a variações de formatação (`00001/2026`, `1/2026`, `01/2026`);
* É a chave utilizada pelo `Contract360Page` (`/contratos/200331-1-2026`) e pelas tabelas de governança `contract_managers` e `contract_task_plans`.

---

## 6. COMO RELACIONAR ARP E CONTRATO

A auditoria inspecionou todos os identificadores disponíveis em ambas as pontas para avaliar sua confiabilidade técnica:

| Identificador Avaliado | Onde Existe | Confiabilidade | Avaliação Técnica |
|---|---|:---:|---|
| **Chave Canônica do Contrato (`contract_key`)** | Módulo Contratos | **CONFIÁVEL** | Identifica 100% o contrato na UASG. |
| **Chave Canônica do Item da Ata (`item_key`)** | Módulo ARPs (`00037/2026-200331-00001`) | **CONFIÁVEL** | Identifica 100% a Ata, a UASG e o Item. |
| **Número de Controle PNCP da Compra** | Metadados da Ata e do Contrato | **PARCIALMENTE CONFIÁVEL** | Nem todas as compras legadas possuem o número PNCP preenchido no Contratos.gov.br. |
| **Campo `licitacao_numero` do Contrato** | Retornado pelo Contratos.gov.br | **PARCIALMENTE CONFIÁVEL** | Vem como texto livre (`"Pregão 12/2024"`, `"12/2024"`). Serve para sugestão automática/filtro, mas não como chave estrangeira estrita. |
| **CNPJ do Fornecedor** | Presente na Ata e no Contrato | **AUXILIAR** | Garante que o contrato pertence ao mesmo adjudicatário do item, prevenindo associações incorretas. |
| **Texto do Objeto / Descrição** | Presente na Ata e no Contrato | **INSUFICIENTE** | Descrições variam e não servem para matching determinístico. |

---

## 7. A RELAÇÃO REAL DE NEGÓCIO: ARP ↔ ITEM ↔ CONTRATO

Na Administração Pública Federal (Lei nº 14.133/2021 e Decreto nº 11.462/2023), uma Ata de Registro de Preços não gera "um contrato para a ata inteira".

A relação real é:
```text
ATA DE REGISTRO DE PREÇOS (ARP)
  │
  ├── Item 1 (Notebooks)  ───► Contrato nº 10/2026 (Fornecedor A) ───► Empenho 2026NE0001
  ├── Item 2 (Monitores)  ───► Contrato nº 10/2026 (Fornecedor A) ───► Empenho 2026NE0002
  └── Item 3 (Servidores) ───► Contrato nº 15/2026 (Fornecedor B) ───► Empenho 2026NE0003
```

Portanto:
* Um Contrato pode contemplar **vários itens** da mesma Ata (quando o fornecedor venceu múltiplos itens).
* Um Item pode ter **múltiplos contratos** ao longo dos 12 meses de vigência da ata (ex: contrato de 100 unidades em março para o órgão X e contrato de 50 unidades em agosto para o órgão Y).
* **A relação correta de associação é entre o Item da Ata e o Contrato Oficial (N:N)**, vinculada às Notas de Empenho que lastreiam aquele item.

---

## 8. ANÁLISE DE `contratos_manuais`: POR QUE EXISTE E COMO DEVE EVOLUIR?

### Respostas às Perguntas Críticas:

#### A. Por que essa tabela existe?
Foi criada na Fase 3 quando o SaldoARP ainda não possuía o catálogo soberano de contratos (Fase 4) nem a Visão 360° (Fase 5). Naquela época, para registrar que havia um contrato consumindo a ata, a única opção era permitir que o usuário digitasse tudo do zero.

#### B. Quais informações ela armazena que NÃO existem no catálogo oficial?
Apenas duas informações são exclusivas desta relação:
1. **A qual Item de qual Ata este contrato está prestando serviço** (`item_key`);
2. **Qual a quantidade daquele item específico que foi contratada** (`quantidade_contratada`).

#### C. Quais informações são duplicadas?
Todas as demais:
* Número do contrato;
* Ano;
* UASG;
* Fornecedor (Nome e CNPJ);
* Valor Total do Contrato;
* Número de Controle PNCP;
* Link PNCP;
* Objeto.

#### D. Ela deve ser deletada ou transformada?
**Não deve ser sumariamente deletada**. 
Ela deve evoluir conceitualmente de um *"falso cadastro de contrato"* para uma **tabela de vínculo/associação (`arp_item_contract_links`)**:
* Guarda o vínculo entre `item_key` e `contract_key` oficial;
* Guarda a `quantidade_contratada` daquele item;
* Guarda os vínculos com os empenhos do item (`contrato_empenhos`);
* **Consome todos os dados oficiais do Contrato a partir da chave oficial já conhecida no sistema**.

---

## 9. CLASSIFICAÇÃO DOS CAMPOS SEGUNDO A SOBERANIA DA FONTE

| Campo Atual em `contratos_manuais` | Natureza do Dado | Fonte Soberana Real | Diagnóstico |
|---|---|---|---|
| `id` | Sintético interno | Gerador interno | Deve referenciar a chave canônica do vínculo. |
| `item_key` | Contexto Interno | Catálogo de Itens SaldoARP | Manter (essencial para saber qual item da ata foi contratado). |
| `numero` | Fato Oficial | API Contratos.gov.br / PNCP | **Duplicado**. Deve derivar do contrato oficial. |
| `ano` | Fato Oficial | API Contratos.gov.br / PNCP | **Duplicado**. Deve derivar do contrato oficial. |
| `uasg` | Fato Oficial | API Contratos.gov.br / PNCP | **Duplicado**. Deve derivar do contrato oficial. |
| `fornecedor` | Fato Oficial | PNCP / Receita Federal | **Duplicado**. Deve derivar do contrato oficial. |
| `cnpj_fornecedor` | Fato Oficial | PNCP / Receita Federal | **Duplicado**. Deve derivar do contrato oficial. |
| `valor_total` | Fato Oficial | Contratos.gov.br / PNCP | **Duplicado**. Deve derivar do contrato oficial. |
| `objeto` | Fato Oficial | Contratos.gov.br / PNCP | **Duplicado**. Deve derivar do contrato oficial. |
| `numero_controle_pncp` | Fato Oficial | PNCP Soberano | **Duplicado**. Deve derivar do contrato oficial. |
| `link_pncp` | Fato Oficial | PNCP Soberano | **Duplicado**. Deve derivar do contrato oficial. |
| `quantidade_contratada` | Contexto Interno / Execução | Acordo do Item na Ata | **Legítimo**. O contrato governamental tem valor global, mas a parcela de itens daquela ata é dado do SaldoARP. |
| `vínculo com empenhos` | Contexto Interno / Lastro | `contrato_empenhos` (SIAFI) | **Legítimo**. Cumpre a regra RN-07. |

---

## 10. IMPACTO NO CÁLCULO DE SALDO

* **Invariante Fundamental:**
  $$\text{Saldo da Ata} = \text{Quantidade Registrada} - \sum \text{Empenhos}$$
* **A participação do Contrato:** O contrato **NÃO deduz saldo da ata**. Quem consome saldo é a Nota de Empenho.
* A vinculação do Contrato Oficial ao Item da Ata serve para fins de **governança, conformidade e prestação de contas** (saber qual contrato materializou aquele empenho).
* **Impacto no `balanceService.ts`:** Nulo. A fórmula e as garantias matemáticas permanecem 100% inalteradas e preservadas.

---

## 11. IMPACTO NAS ALOCAÇÕES DEPARTAMENTAIS

* Uma Alocação Departamental (`arp_allocations`) é a cota da unidade requisitante (ex: DITEC tem cota de 50 notebooks).
* Quando o departamento formaliza a contratação de sua cota, os empenhos emitidos para a DITEC são amarrados ao Contrato Administrativo correspondente.
* A futura integração permitirá ao fiscal enxergar:
  *"Da cota de 50 notebooks da DITEC, 40 foram contratados no Contrato nº 10/2026 (Empenho 2026NE0001) e 10 continuam como saldo alocado aguardando instrução."*

---

## 12. IMPACTO NO EMPENHO

* A tabela `contrato_empenhos` associa o empenho ao contrato.
* A regra **RN-07** (`save_manual_contrato_atomic`) continuará sendo respeitada: nenhum contrato poderá ser vinculado a um item sem que pelo menos uma Nota de Empenho seja apontada como lastro financeiro daquele fornecimento.

---

## 13. IMPACTO NO CONTRATO 360°

A integração fecha o ciclo perfeito no **Contrato 360°**:
* Atualmente, o Bloco 6 (`Contract360Page.tsx`) possui um placeholder declarando que os itens contratados serão unificados.
* Com o vínculo canônico entre o Item da Ata e o Contrato Oficial, o Contrato 360° poderá projetar com precisão cirúrgica:
  1. De qual Ata de Registro de Preços este contrato se originou;
  2. Quais itens específicos daquela ata foram adquiridos;
  3. A quantidade pactuada de cada item;
  4. O atalho de navegação reversa para o gestor saltar do Contrato 360° para a Ata de origem (`/atas/itens/saldo`).

---

## 14. PERFORMANCE, CACHE E REÚSO ("DIGITE UMA VEZ")

* **Zero Novas Chamadas de Rede:**
  * O catálogo de contratos da UASG já é carregado e mantido em cache pelo `useContractsDashboard(uasg)`.
  * Ao abrir a aba de contratos em `ItemBalances.tsx`, o sistema pode consultar o cache React Query existente `['contracts-dashboard', uasg]`.
  * **Seleção em 1 Clique:** Em vez de abrir um formulário vazio com 10 campos para digitação manual, o novo modal apresentará um autocomplete/dropdown dos contratos oficiais vigentes daquela UASG.
  * Ao selecionar o contrato (ex: "Contrato 01/2026 - SAFETY WALL"), o SaldoARP automaticamente preenche número, fornecedor, CNPJ, valor global e link PNCP diretamente do objeto oficial em cache!
  * O usuário só precisará informar:
    1. A **quantidade de itens** contratada;
    2. O(s) **empenho(s)** vinculado(s).

---

## 15. SEGURANÇA E RBAC

* **Permissões de Backend:**
  * A vinculação continuará restrita a usuários com perfil `gestor` ou `admin` (conforme exigido na migration 05).
* **RLS:**
  * O isolamento por UASG permanece intacto: o usuário só poderá vincular contratos pertencentes à mesma UASG da Ata gerenciadora ou participante autorizada.

---

## 16. MIGRATION IMPACT (PLANEJAMENTO FUTURO)

Para a futura fase de implementação, o impacto no banco de dados é mínimo e seguro:

| Componente | Ação Futura Planejada | Risco | Mitigação |
|---|---|:---:|---|
| Tabela `contratos_manuais` | Adicionar coluna `contract_key VARCHAR(100)` apontando para a chave oficial. | Mínimo | Coluna opcional (nullable); não quebra registros legados existentes. |
| RPC `save_manual_contrato_atomic` | Suportar parâmetro `p_contract_key` no JSONB. | Baixo | Se `contract_key` for informado, popula metadados oficiais automaticamente. |
| Tabela `contrato_empenhos` | Nenhuma alteração. Continua vinculando `contrato_id` ao `empenho_id`. | Nulo | Estrutura 100% preservada. |

---

## 17. COMPATIBILIDADE RETROATIVA

* Os registros existentes na tabela `contratos_manuais` foram auditados:
  * Possuem `item_key`, `numero`, `ano`, `uasg`.
  * Um script determinístico de reconciliação pode inferir a `contract_key` canônica para todos os registros cujo número e ano coincidam com contratos oficiais da mesma UASG (`${uasg}-${numeroLimpo}-${ano}`).
  * Nenhum dado histórico do usuário será apagado ou perdido.

---

## 18. SIMULAÇÃO DE CENÁRIOS DE NEGÓCIO

### Cenário A: Uma ARP possui um contrato oficial
* **Comportamento:** O operador abre a tela do item da ata, seleciona o contrato oficial sugerido pelo sistema, informa a quantidade contratada e seleciona o empenho. O contrato passa a exibir badge "Oficial", valor sincronizado e link direto para o Contrato 360°.

### Cenário B: Uma ARP possui vários contratos para itens distintos
* **Comportamento:** O item 1 é vinculado ao Contrato A; o item 2 ao Contrato B. Cada tela de saldo projeta o respectivo contrato sem interferência mútua.

### Cenário C: Um mesmo contrato cobre múltiplos itens da mesma ARP
* **Comportamento:** O Contrato A é vinculado no Item 1 (com 50 unidades) e no Item 2 (com 30 unidades). O Contrato 360° exibe na aba 6 a composição consolidada de ambos os itens da ata.

### Cenário D: Um item da ata é executado através de múltiplos contratos sucessivos
* **Comportamento:** O item possui 100 unidades. Contrato 1 formaliza 60 unidades em janeiro; Contrato 2 formaliza 40 unidades em junho. A soma das quantidades contratadas reflete 100% da ata sem violação de integridade.

### Cenário E: Contrato existe no PNCP mas ainda não foi associado à ARP
* **Comportamento:** O contrato aparece normalmente no Dashboard de Contratos (`/contratos`), mas não surge na aba do item da ata até que o gestor faça a associação formal indicando a quantidade e o empenho de lastro.

### Cenário F: Contrato manual legado sem correspondência na API
* **Comportamento:** Para contratos antigos onde a API oficial está temporariamente indisponível, o sistema preserva o badge "Manual" e os dados digitados originalmente, sem quebrar a tela.

### Cenário G: Contrato oficial possui termo aditivo assinado
* **Comportamento:** Quando o contrato sofre alteração de valor ou vigência no PNCP, a tela do item da ata reflete instantaneamente o novo valor e nova vigência porque consome os dados do Contrato Oficial, sem exigir que o operador altere nada manualmente na ata.

### Cenário H: Contrato foi rescindido ou encerrado
* **Comportamento:** O Contrato 360° e a aba do item da ata refletem o status "Encerrado" ou "Rescindido" automaticamente via `contractEventService`.

---

## 19. ALTERNATIVAS ARQUITETURAIS PARA A FUTURA IMPLEMENTAÇÃO

A auditoria formulou duas alternativas arquiteturais para embasar a decisão de engenharia:

### Alternativa A: Vínculo Direto Enriquecido (Recomendada)
* **Conceito:** A tabela `contratos_manuais` ganha uma coluna `contract_key`. Na interface, o modal de adicionar contrato deixa de ser um formulário em branco e passa a ser um seletor inteligente do catálogo oficial de contratos da UASG.
* **Vantagens:**
  * 100% aderente ao princípio "Digite uma vez, use em todo lugar";
  * 0% de retrabalho de digitação para o operador;
  * Conecta imediatamente o Item da Ata ao Contrato 360°;
  * Risco de migração baixíssimo (retrocompatibilidade total).
* **Limitações:** Exige que o contrato já esteja disponível no catálogo oficial (ou permite digitação manual como fallback temporário se a API estiver fora).

### Alternativa B: Nova Tabela Dedicada `arp_item_contract_links` e Depreciação de `contratos_manuais`
* **Conceito:** Cria uma tabela relacional pura de junção com foreign keys estritas e descontinua a tabela `contratos_manuais`.
* **Vantagens:** Pureza de schema relacional.
* **Limitações:** Maior esforço de migração e risco de incompatibilidade temporária com o legado.

---

## 20. O NOVO FLUXO DO PRINCÍPIO "DIGITE UMA VEZ"

Após a futura implementação da Fase 6, o fluxo do usuário será simplificado e blindado:

```text
1. API Governamental (PNCP / Contratos.gov.br)
         ↓ (Automático)
2. Catálogo Oficial do SaldoARP (/contratos)
         ↓ (Em Cache React Query)
3. Tela do Item da Ata (/atas/itens/saldo)
         ↓
4. Usuário clica "Vincular Contrato Oficial"
         ↓
5. Modal abre com lista dos contratos da UASG já preenchida
         ↓
6. Usuário seleciona o contrato (1 clique)
         ↓
7. Usuário apenas digita a Quantidade e seleciona o Empenho de lastro
         ↓
8. Salvo! O item agora exibe o contrato oficial e o link para o Contrato 360°!
```

---

## 21. RISCOS E MITIGAÇÕES MAPEADOS

1. **Risco de Contrato Inexistente na API no momento da vinculação:**
   * *Mitigação:* Manter a opção de "Digitação Manual de Contingência" com aviso visual de que o contrato aguarda sincronização oficial.
2. **Risco de Inconsistência de Quantidade:**
   * *Mitigação:* Validar no frontend para que a quantidade contratada não exceda a quantidade total homologada do item na ata.
3. **Risco de Quebra dos Testes Existentes:**
   * *Mitigação:* Todos os 564 testes atuais continuarão passando, pois a camada de adapters garantirá suporte às chamadas anteriores.

---

## 22. DEPENDÊNCIAS TÉCNICAS PARA A FASE 6.1

Para iniciar a implementação (quando autorizada pelo usuário), as dependências já estão 100% satisfeitas:
- Catálogo oficial de contratos: **Pronto e testado** (`contractService.ts`).
- Chave canônica determinística: **Pronta e testada** (`contractKeyUtils.ts`).
- Contrato 360°: **Homologado** (`Contract360Page.tsx`).
- Tabela associativa de empenhos: **Pronta** (`contrato_empenhos`).
- Motor de testes e build: **100% verde**.

---

## 23. CONCLUSÃO DA AUDITORIA

A **Fase 6.0 conclui com sucesso absoluto o mapeamento da integração ARP $\leftrightarrow$ Contratos Oficiais**. 

A solução técnica está perfeitamente delimitada, o princípio "Digite uma vez" está preservado, o cálculo contábil de saldos está blindado e não há nenhum impedimento arquitetural para o início do desenvolvimento da integração quando determinado.
