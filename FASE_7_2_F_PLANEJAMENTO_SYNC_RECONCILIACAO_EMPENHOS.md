# FASE 7.2-F — PLANEJAMENTO TÉCNICO DO SYNC E RECONCILIAÇÃO DE EMPENHOS

**Data:** 23 de Setembro de 2026  
**Status da Fase:** **PLANEJAMENTO — EM REVISÃO**  
**Versão do Sistema:** SaldoARP 3.0  
**Tipo:** Exclusivamente Auditoria + Planejamento (zero implementação)

---

## 1. RESUMO EXECUTIVO

Esta fase planeja a futura camada de sincronização e reconciliação de empenhos do SaldoARP — a ponte entre as fontes governamentais externas e o schema soberano M16/M17/M18 já implantado em produção.

A cadeia vertical já homologada é:

```
FONTES OFICIAIS
│
├── Compras.gov.br  (/modulo-arp/4_consultarEmpenhosSaldoItem)
├── Contratos.gov.br  (/api/contrato/{id}/empenhos + /api/v1/contrato/empenho/consultar/{id})
└── PNCP  (/api/pncp/v1/orgaos/{cnpj}/contratos/{ano}/{seq}/empenhos)
│
▼
ADAPTERS / NORMALIZAÇÃO   [a criar — Fase futura]
│
▼
RECONCILIAÇÃO             [a criar — Fase futura]
│
▼
M17 — RPCs ATÔMICOS       [implantado — intocável]
│
▼
M16 — SSOT DE EMPENHOS    [implantado — intocável]
│
▼
M18 — READ MODELS         [implantado — intocável]
│
▼
FRONTEND
```

O objetivo desta fase é produzir o plano técnico preciso de cada camada acima da M17.

---

## 2. AUDITORIA DO CÓDIGO EXISTENTE

### 2.1 Mapa Geral de Arquivos Auditados

| Arquivo | Relevância | Classificação |
|:---|:---|:---|
| `src/services/api.ts` (L793-841) | `fetchEmpenhosSaldoItem` — consulta à Compras.gov.br | **A** — reutilizável |
| `src/services/api.ts` (L976-988) | `fetchContratosGovEmpenhos` — consulta à Contratos.gov.br | **A** — reutilizável |
| `src/services/api.ts` (L995-1007) | `fetchContratoEmpenhoDetalhe` — detalhe individual de empenho | **A** — reutilizável |
| `src/services/api.ts` (L1656-1679) | `fetchPncpContractEmpenhos` — consulta ao PNCP | **A** — reutilizável |
| `src/services/api.ts` (L847-900) | `getCanonicalContractKey` — canonical key de **contrato** | **B** — precisa ser adaptada |
| `src/services/balanceService.ts` (L7-18) | `normalizeEmpenhoNumero` — normalização do número | **A** — reutilizável diretamente |
| `src/services/balanceService.ts` (L24-29) | `getEmpenhoCanonicalKey` — chave canônica legada de empenho | **C** — precisa ser aposentada |
| `src/services/balanceService.ts` (L322-359) | `matchAndMergeEmpenhos` — lógica de merge MANUAL→SINCRONIZADO | **B** — precisa ser adaptada |
| `src/services/balanceService.ts` (L241-308) | `reconcileBalances` — relatório de divergência | **B** — precisa ser adaptada |
| `src/services/balanceService.ts` (L465-541) | `deduceEmpenhoQuantity` — dedução de quantidade via valor | **A** — reutilizável |
| `src/services/balanceService.ts` (L427-459) | `parseMoneyValue` | **A** — reutilizável |
| `src/services/balanceService.ts` (L451-458) | `getEmpenhoEffectiveValue` | **A** — reutilizável |
| `src/services/syncService.ts` | Sync atual de Atas/Itens (Compras.gov + PNCP) | **D** — escopo diferente, não reutilizar |
| `src/adapters/manualEmpenhoRpcAdapter.ts` | Adapter para `save_manual_empenhos_atomic` (RPC legada) | **C** — aposentar; substituir por M17 |
| `src/adapters/empenhoLinkRpcAdapter.ts` | Adapter para `save_empenho_links_atomic` (RPC legada) | **C** — aposentar; substituir por M17 |
| `src/hooks/useItemEmpenhos.ts` | Hook React Query para Compras.gov (SIASG) | **A** — continua válido para exibição |
| `src/hooks/useItemManualEmpenhos.ts` | Hook para empenhos manuais (tabela legada) | **C** — aposentar; migrar para M16 |
| `src/components/ItemBalances.tsx` (L919-999) | Mapeamento e merge de empenhos oficiais + manuais | **B** — será substituído pela M17 |
| `src/types/index.ts` | `EmpenhoSaldoItemRecord`, `ContratosGovEmpenhoRecord`, `PncpContractEmpenho`, `Empenho` | **A** — reutilizáveis como tipos de entrada |

### 2.2 Classificações Detalhadas

#### A — Reutilizáveis

**`normalizeEmpenhoNumero(numero?: string): string`** `balanceService.ts:7`  
Transforma `"2026NE000142"` → `"2026NE142"`. Regex correta e testada. Idêntica à lógica necessária para a `canonical_key` do M16. Usar diretamente no `empenhoNormalizationService.ts` futuro.

**`fetchEmpenhosSaldoItem`** `api.ts:796`  
Faz paginação automática contra `4_consultarEmpenhosSaldoItem`. Tolerante a falhas. Retorna `resultado: EmpenhoSaldoItemRecord[]`. É a base do `comprasGovEmpenhoAdapter.ts` futuro — a lógica de paginação já é correta.

**`fetchContratosGovEmpenhos`** `api.ts:976`  
Consulta simples contra `/api/contrato/{id}/empenhos`. Retorna array bruto. Usável sem alteração como base do `contratosGovEmpenhoAdapter.ts`.

**`fetchContratoEmpenhoDetalhe`** `api.ts:995`  
Consulta `itens_minuta` do empenho individual — campo `quantidade` por `numero_item_compra`. Essencial para identificação de quantidade física oficial. Reutilizar integralmente.

**`fetchPncpContractEmpenhos`** `api.ts:1656`  
Tratamento correto de dois formatos de resposta (`data` array e array direto). Reutilizável como base do `pncpEmpenhoAdapter.ts`.

**`deduceEmpenhoQuantity`** `balanceService.ts:465`  
Algoritmo temporal de dedução de quantidade física via valor empenhado / valor unitário, respeitando histórico de reajustes. Lógica precisa e testada. Reutilizar no `empenhoNormalizationService.ts`.

**`parseMoneyValue`** / **`getEmpenhoEffectiveValue`** `balanceService.ts:427,451`  
Regra contábil (Lei 4.320/64): exercício corrente usa `empenhado`; restos a pagar usa `rpinscrito`. Reutilizar diretamente.

#### B — Precisam ser Adaptadas

**`getEmpenhoCanonicalKey(empenho)`** `balanceService.ts:24`  
A chave atual inclui `itemId` no hash: `normNum-ano-uasg-itemId`. Isso é incompatível com a canonical_key do M16, que é `uasg-ano-numeroNormalizado` (independente do item). O item é relação N:N em `arp_item_empenhos`, não parte da identidade do empenho soberano.  
→ A chave para o M16 DEVE ser apenas `{uasg}-{ano}-{numeroNormalizado}`.  
→ A função legada continua válida para seu uso atual (deduplicação na tela), mas não deve alimentar o M16.

**`matchAndMergeEmpenhos`** `balanceService.ts:322`  
Lógica correta de promoção MANUAL→SINCRONIZADO. Porém opera sobre tipos `Empenho[]` antigos (tabela legada `empenhos_manuais`) e atualiza estado React in-memory. Para o sync futuro, a lógica de promoção será chamada pelo `empenhoSyncService.ts` que por sua vez chamará `save_empenho_soberano_atomic` do M17. Os campos preservados (origem manual, `unidadeInternaId`, `observacao`) devem ser mapeados para o payload JSON do M17.

**`reconcileBalances`** `balanceService.ts:241`  
Calcula divergência entre total empenhado interno e saldo retornado pela API. A lógica é correta conceitualmente, mas está acoplada ao estado in-memory. O equivalente no sync futuro operará sobre dados do SSOT M16 e das views M18, não sobre estado React.

**`getCanonicalContractKey`** `api.ts:847`  
Normaliza chave de **contrato** (não de empenho). Lógica robusta para o domínio contratual. Reutilizável no `contratosGovEmpenhoAdapter.ts` para resolver o `contract_key` antes de chamar `link_empenho_to_contract_atomic`.

#### C — Devem ser Aposentadas Futuramente

**`manualEmpenhoRpcAdapter.ts`**  
Chama `save_manual_empenhos_atomic` — RPC que persiste em `empenhos_manuais` (tabela legada). Após migração completa para M17, este adapter deixa de ser necessário.

**`empenhoLinkRpcAdapter.ts`**  
Chama `save_empenho_links_atomic` — RPC que persiste em `empenho_links` (tabela legada). Substituída por `link_empenho_to_item_atomic` do M17.

**`useItemManualEmpenhos.ts`**  
Lê de `empenhos_manuais` + `item_manual_empenho_state`. Quando a migração para M16 ocorrer, este hook deve passar a ler de `v_arp_item_saldo_detalhado` ou de uma query direta ao M16.

#### D — Não Devem ser Reutilizadas

**`syncService.ts`** (`runFullSync`, `checkAndTriggerAutoSync`)  
Este serviço sincroniza **Atas e Itens de Ata** (Compras.gov → `atas_registro_preco` + `itens_ata`). Escopo completamente diferente do sync de empenhos. Não criar confusão de nomenclatura. O sync de empenhos será um serviço independente.

### 2.3 Estado das Tabelas Legadas (banco remoto confirmado)

| Tabela | Linhas | Status |
|:---|:---:|:---|
| `empenhos_manuais` | 0 | Vazia; preservada por integridade |
| `empenho_links` | 0 | Vazia; preservada por integridade |
| `empenho_manual_quantidades` | 0 | Vazia; preservada por integridade |
| `contrato_empenho_links` | 0 | Vazia; preservada por integridade |
| `item_empenho_link_state` | 0 | Vazia; preservada por integridade |
| `item_manual_empenho_state` | 0 | Vazia; preservada por integridade |

Todas estão zeradas. Não há dados a migrar. A aposentadoria futura das tabelas legadas será uma migration separada, fora do escopo desta fase.

---

## 3. FONTES OFICIAIS

### 3.1 Compras.gov.br — Fonte de Consumo Físico do Item de Ata

**Endpoint:**
```
GET /modulo-arp/4_consultarEmpenhosSaldoItem
Params: numeroAta, unidadeGerenciadora, pagina, tamanhoPagina
```

**Autoridade:** Saldo físico do item de Ata (quantidade homologada, quantidade empenhada, saldo remanescente, empenhos individuais com `numeroEmpenho`, `quantidadeEmpenhada`, `dataEmpenho`, `fornecedorNome`, `valorEmpenhado`).

**Natureza:** Paginada. Resposta inclui `paginasRestantes`. A implementação existente em `fetchEmpenhosSaldoItem` já lida corretamente com múltiplas páginas.

**Limitações conhecidas:** Retorna apenas empenhos da unidade gerenciadora consultada. Empenhos de caronas/adesões requerem consulta separada via `5_consultarAdesoesItem`. A UASG presente nos registros deve ser validada contra a lista permitida (200331/200330).

**Schema de retorno relevante (`EmpenhoSaldoItemRecord`):**
```typescript
numeroEmpenho?: string;       // Número da NE
dataEmpenho?: string;         // Data de emissão
quantidadeIncluida?: number;  // Quantidade física do empenho
valorEmpenhado?: number;      // Valor monetário
fornecedorNome?: string;
fornecedorCnpj?: string;
unidade: string;              // UASG da unidade executora
```

**Observação arquitetural:** Esta fonte é a **única com autoridade sobre quantidade física consumida por item de Ata**. Não inferir quantidade física a partir de dados do Contratos.gov.br ou PNCP sem esta fonte ou sem a minuta individual.

---

### 3.2 Contratos.gov.br — Fonte de Execução Financeira Contratual

**Endpoints:**
```
GET /api/contrato/{contratoId}/empenhos
GET /api/v1/contrato/empenho/consultar/{empenhoId}
```

**Autoridade:** Execução financeira do contrato: `empenhado`, `liquidado`, `pago`, `rpinscrito`, `rpaliquidar`, `rpliquidado`, `rppago`. Reflete dados SIAFI. A minuta individual (`itens_minuta`) contém a quantidade física por item de compra, quando disponível.

**Schema de retorno relevante (`ContratosGovEmpenhoRecord`):**
```typescript
id: number;              // ID interno do Contratos.gov.br (usado para busca de detalhe)
numero: string;          // Número do empenho (ex: "2026NE000142")
data_emissao: string;
credor?: string;
unidade_gestora?: string;
empenhado: string | number;
liquidado?: string | number;
pago?: string | number;
rpinscrito?: string | number;
credor_obj?: { cnpj_cpf_idgener?: string; nome?: string };
itens_minuta?: EmpenhoItemMinuta[];
```

**Observação arquitetural:** A quantidade física está na minuta (`itens_minuta[].quantidade` filtrado por `numero_item_compra`). Se a minuta não está disponível, a quantidade pode ser deduzida temporalmente via `deduceEmpenhoQuantity` — mas essa dedução é **estimativa**, não fonte oficial de quantidade.

---

### 3.3 PNCP — Fonte de Lastro e Publicidade Contratual

**Endpoint:**
```
GET /api/pncp/v1/orgaos/{cnpj}/contratos/{ano}/{sequencialContrato}/empenhos
```

**Autoridade:** Lastro de publicidade PNCP de empenhos contratuais. Campos disponíveis: `numeroEmpenho`, `valorTotal`, `dataEmissaoEmpenho`, `sequencialEmpenho`.

**Schema de retorno relevante (`PncpContractEmpenho`):**
```typescript
numeroEmpenho: string;
valorTotal: number;
dataEmissaoEmpenho: string;
sequencialEmpenho: number;
```

**Observação arquitetural:** O PNCP não fornece quantidade física. É fonte complementar para confirmar existência do empenho, data e valor total empenhado. Não é fonte primária para nenhum campo quantitativo.

---

### 3.4 Síntese Comparativa das Fontes

| Dimensão | Compras.gov.br | Contratos.gov.br | PNCP |
|:---|:---:|:---:|:---:|
| Quantidade física por item de Ata | ✅ PRIMÁRIA | ⚠️ Minuta (quando disponível) | ❌ |
| Saldo físico remanescente de Ata | ✅ PRIMÁRIA | ❌ | ❌ |
| Valor empenhado | ✅ complementar | ✅ PRIMÁRIA | ✅ complementar |
| Valor liquidado | ❌ | ✅ PRIMÁRIA | ❌ |
| Valor pago | ❌ | ✅ PRIMÁRIA | ❌ |
| Restos a pagar | ❌ | ✅ PRIMÁRIA | ❌ |
| CNPJ do credor | ✅ | ✅ | ❌ |
| Data de emissão | ✅ | ✅ | ✅ |
| Vínculo com item de Ata | ✅ PRIMÁRIA | ⚠️ via minuta | ❌ |
| Vínculo com contrato | ❌ indireto | ✅ PRIMÁRIA | ✅ |

---

## 4. MATRIZ DE PRECEDÊNCIA POR CAMPO

A regra geral é: **a fonte com maior autoridade para determinado campo vence naquele campo**. Não existe fonte universal.

| Campo do M16 | Fonte Primária | Fonte Secundária | Fonte Complementar | Regra de Conflito |
|:---|:---|:---|:---|:---|
| `canonical_key` (`uasg-ano-numero`) | Construída internamente | — | — | Determinística: não há conflito possível se a normalização for idempotente |
| `uasg` | Compras.gov.br (`unidade`) | Contratos.gov.br (`unidade_gestora`) | — | UASG da fonte primária do campo em questão |
| `ano` | Extraído do número normalizado | Data de emissão (ano) | — | Ano presente no número NE (`2026NE142` → `2026`) |
| `numero` (normalizado) | Compras.gov.br | Contratos.gov.br | PNCP | Todas as fontes normalizadas devem convergir para a mesma `canonical_key` |
| `data_emissao` | Contratos.gov.br | Compras.gov.br | PNCP | Conflito de data → registrar divergência temporal; não apagar valor existente |
| `credor_nome` | Contratos.gov.br (`credor_obj.nome`) | Compras.gov.br (`fornecedorNome`) | — | Preferência Contratos.gov.br (reflete SIAFI); conflito → registrar |
| `credor_cnpj` | Contratos.gov.br (`credor_obj.cnpj_cpf_idgener`) | Compras.gov.br (`fornecedorCnpj`) | — | Preferência Contratos.gov.br; conflito → registrar |
| `valor_empenhado` | Contratos.gov.br (`empenhado`) | PNCP (`valorTotal`) | Compras.gov.br | Conflito de valor → registrar divergência financeira; entrar com valor Contratos.gov.br |
| `valor_liquidado` | Contratos.gov.br (`liquidado`) | — | — | Única fonte; se ausente, `NULL` |
| `valor_pago` | Contratos.gov.br (`pago`) | — | — | Única fonte; se ausente, `NULL` |
| `restos_a_pagar_inscrito` | Contratos.gov.br (`rpinscrito`) | — | — | Regra Lei 4.320/64: mutuamente exclusivo com `valor_empenhado` |
| `quantidade_fisica_item` (em `arp_item_empenhos`) | Compras.gov.br (`quantidadeIncluida`) | Contratos.gov.br (minuta `itens_minuta.quantidade`) | Dedução temporal (estimativa) | Prioridade 1: Compras.gov; Prioridade 2: minuta; Prioridade 3: dedução (marcada como estimativa) |
| `item_key` (em `arp_item_empenhos`) | Compras.gov.br (vínculo direto) | Identificador explícito | — | Sem evidência → não criar vínculo |
| `contract_key` (em `contrato_empenhos`) | Contratos.gov.br (ID interno + normalização) | PNCP (sequencial) | — | Sem evidência determinística → não criar vínculo |
| `valor_vinculado` (em `contrato_empenhos`) | Contratos.gov.br (`empenhado` contextual) | — | — | Registrar apenas quando vínculo contratual for determinístico |
| `origem` | Construída pelo sync | — | — | `SINCRONIZADO` quando confirmado por fonte oficial; `MANUAL` quando inserção humana |
| `status` | Construído pelo sync | — | — | `CONFIRMADO` após validação; `PENDENTE` quando incompleto; `DIVERGENTE` quando conflito não resolvido |

---

## 5. IDENTIDADE CANÔNICA DO EMPENHO

### 5.1 Definição Homologada

A `canonical_key` já definida no M16 é:

```
{uasg}-{ano}-{numeroNormalizado}
```

Exemplo:
```
200331-2026-2026NE142
```

### 5.2 Algoritmo de Normalização do Número

Baseado em `normalizeEmpenhoNumero` (já existente e testado em `balanceService.ts:7`):

```
Entrada: string bruta (ex: "2026NE000142", "142", "NE142", "2026 NE 000142")

Passo 1: trim() + toUpperCase()

Passo 2: Remover espaços internos (regex: /\s+/g → '')

Passo 3: Remover pontuação não alfanumérica (guardar apenas letras e dígitos)

Passo 4: Detectar padrão NExx:
  Regex: /^(\d{4})NE0*(\d+)$/
  Resultado: "{ano}NE{numero_sem_zeros_a_esquerda}"
  Ex: "2026NE000142" → "2026NE142"

Passo 5: Se não é NExx, verificar apenas dígitos:
  Regex: /^0*(\d+)$/
  Resultado: número sem zeros à esquerda
  Ex: "000142" → "142"

Passo 6: Se nenhum padrão se aplica:
  Retornar string trimada como está (preservar para inspeção humana)

Passo 7: Casos de incerteza:
  - Número vazio → não criar registro
  - Número que não converge para um padrão reconhecido → marcar como PENDENTE_IDENTIDADE
  - Número com múltiplos separadores ambíguos → rejeitar e registrar como pendência
```

### 5.3 Normalização da UASG

```
Entrada: string bruta (ex: "200331", "200 331", "0000200331")

Passo 1: Remover qualquer caractere não-dígito
Passo 2: Remover zeros à esquerda
Resultado: dígitos puros sem zeros iniciais

Ex: "0000200331" → "200331"
Ex: "200 331" → "200331"
```

### 5.4 Normalização do Ano

```
Entrada: derivado do número normalizado OU da data de emissão

Prioridade 1: Extrair ano do padrão NE ("2026NE142" → "2026")
Prioridade 2: Extrair ano da data_emissao ("2026-03-15" → "2026")
Prioridade 3: Ano corrente como fallback (somente para empenhos sem data e sem padrão NE)

Validação: ano deve ser um inteiro de 4 dígitos >= 2000.
```

### 5.5 Construção da canonical_key

```typescript
// Algoritmo determinístico:
function buildCanonicalKey(uasg: string, ano: string | number, numero: string): string {
  const normUasg = uasg.replace(/\D/g, '').replace(/^0+/, '');
  const normAno = String(ano).replace(/\D/g, '');
  const normNum = normalizeEmpenhoNumero(numero); // função existente
  return `${normUasg}-${normAno}-${normNum}`;
}
// Exemplo: ("200331", "2026", "2026NE000142") → "200331-2026-2026NE142"
```

### 5.6 Tratamento de Casos sem Identidade Determinística

| Situação | Ação |
|:---|:---|
| Número ausente ou vazio | Não criar registro no M16 |
| Número não reconhecível por nenhum regex | Marcar `status = PENDENTE`; registrar `numero_raw` no evento histórico |
| UASG ausente | Tentar derivar da Ata gerenciadora; se impossível, não criar |
| Ano não extraível | Usar data_emissao; se ausente, usar ano corrente com flag de incerteza |
| canonical_key já existente com dados conflitantes | Executar algoritmo de reconciliação (Seção 7) |

---

## 6. NORMALIZAÇÃO

### 6.1 Responsabilidades do `empenhoNormalizationService.ts`

Este serviço (a criar) será responsável por:
1. Receber um registro bruto de qualquer fonte (tipado como `EmpenhoSaldoItemRecord | ContratosGovEmpenhoRecord | PncpContractEmpenho`);
2. Extrair e normalizar `uasg`, `ano`, `numero`;
3. Construir a `canonical_key`;
4. Extrair campos financeiros usando `getEmpenhoEffectiveValue` e `parseMoneyValue` (já existentes);
5. Retornar um objeto tipado `NormalizedEmpenho` pronto para ser alimentado ao reconciliador.

### 6.2 Tipo `NormalizedEmpenho` (proposto)

```typescript
interface NormalizedEmpenho {
  // Identidade
  canonical_key: string;          // "uasg-ano-numeroNormalizado"
  uasg: string;
  ano: number;
  numero_normalizado: string;
  numero_raw: string;             // número bruto original
  fonte: 'COMPRAS_GOV' | 'CONTRATOS_GOV' | 'PNCP';

  // Campos financeiros (autoridade por fonte — ver Seção 4)
  valor_empenhado?: number;
  valor_liquidado?: number;
  valor_pago?: number;
  restos_a_pagar_inscrito?: number;

  // Campos de identificação
  data_emissao?: string;
  credor_nome?: string;
  credor_cnpj?: string;

  // Vínculos (evidência)
  item_key?: string;              // Apenas quando a fonte confirma o item
  contract_key?: string;          // Apenas quando a fonte confirma o contrato

  // Quantidade (apenas quando disponível com autoridade)
  quantidade_fisica?: number;
  quantidade_e_estimada: boolean; // true quando derivada de deduceEmpenhoQuantity

  // Metadados de normalização
  normalized_at: string;          // ISO timestamp
  normalization_warnings: string[]; // Ex: "ano derivado da data_emissao"
}
```

### 6.3 Regras de Normalização por Fonte

**Compras.gov.br → `NormalizedEmpenho`:**
```
numero_raw = EmpenhoSaldoItemRecord.numeroEmpenho
numero_normalizado = normalizeEmpenhoNumero(numero_raw)
uasg = EmpenhoSaldoItemRecord.unidade (normalizado)
ano = extraído do numero_normalizado || arp.anoCompra
valor_empenhado = EmpenhoSaldoItemRecord.valorEmpenhado
data_emissao = EmpenhoSaldoItemRecord.dataEmpenho
credor_nome = EmpenhoSaldoItemRecord.fornecedorNome
credor_cnpj = EmpenhoSaldoItemRecord.fornecedorCnpj
quantidade_fisica = EmpenhoSaldoItemRecord.quantidadeIncluida (autoridade primária)
item_key = construída a partir do contexto (numeroAta + uasg + numeroItem)
contract_key = NULL (Compras.gov não fornece)
```

**Contratos.gov.br → `NormalizedEmpenho`:**
```
numero_raw = ContratosGovEmpenhoRecord.numero
numero_normalizado = normalizeEmpenhoNumero(numero_raw)
uasg = ContratosGovEmpenhoRecord.unidade_gestora (normalizado)
valor_empenhado = getEmpenhoEffectiveValue(emp.empenhado, emp.rpinscrito)
valor_liquidado = parseMoneyValue(emp.liquidado)
valor_pago = parseMoneyValue(emp.pago)
restos_a_pagar_inscrito = parseMoneyValue(emp.rpinscrito)
credor_nome = emp.credor_obj?.nome
credor_cnpj = emp.credor_obj?.cnpj_cpf_idgener
quantidade_fisica = itens_minuta.find(i => i.numero_item_compra === targetItem)?.quantidade
quantidade_e_estimada = false (se minuta) | true (se deduced)
contract_key = derivada do contexto do contrato consultado
item_key = NULL (Contratos.gov não confirma item de Ata diretamente)
```

**PNCP → `NormalizedEmpenho`:**
```
numero_raw = PncpContractEmpenho.numeroEmpenho
numero_normalizado = normalizeEmpenhoNumero(numero_raw)
valor_empenhado = PncpContractEmpenho.valorTotal
data_emissao = PncpContractEmpenho.dataEmissaoEmpenho
contract_key = derivada do contexto PNCP (cnpj + ano + sequencial)
item_key = NULL
quantidade_fisica = NULL
```

---

## 7. ALGORITMO DE RECONCILIAÇÃO

### 7.1 Visão Geral

```
Fonte A (Compras.gov) → normalize → NormalizedEmpenho_A
Fonte B (Contratos.gov) → normalize → NormalizedEmpenho_B
Fonte C (PNCP) → normalize → NormalizedEmpenho_C
                                      │
                              AGRUPAR por canonical_key
                                      │
                              MESCLAR por campo (precedência)
                                      │
                              DETECTAR conflitos
                                      │
                     ┌────────────────┴────────────────┐
                     │                                 │
              RESOLVER automaticamente         ENCAMINHAR para
              (regras determinísticas)         conciliação humana
                     │
              RESULTADO: EmpenhoReconciliado
                     │
               save_empenho_soberano_atomic (M17)
```

### 7.2 Etapas do Algoritmo

#### Etapa 1 — Identificação

Para cada registro bruto de cada fonte:
1. Normalizar número (`normalizeEmpenhoNumero`);
2. Normalizar UASG;
3. Extrair ano;
4. Construir `canonical_key`;
5. Rejeitar se `canonical_key` for vazia (número inidentificável).

#### Etapa 2 — Agrupamento

```typescript
// Agrupar todos os NormalizedEmpenho por canonical_key
const groups = new Map<string, NormalizedEmpenho[]>();
for (const ne of allNormalized) {
  const group = groups.get(ne.canonical_key) ?? [];
  group.push(ne);
  groups.set(ne.canonical_key, group);
}
```

#### Etapa 3 — Merge por Campo

Para cada grupo com a mesma `canonical_key`, aplicar a Matriz de Precedência (Seção 4):

```
valor_empenhado = primeiro não-nulo em ordem: Contratos.gov → PNCP → Compras.gov
valor_liquidado = Contratos.gov (único)
valor_pago = Contratos.gov (único)
restos_a_pagar = Contratos.gov (único)
credor_nome = Contratos.gov → Compras.gov
credor_cnpj = Contratos.gov → Compras.gov
data_emissao = Contratos.gov → Compras.gov → PNCP
quantidade_fisica = Compras.gov (primário) → minuta Contratos.gov → dedução (estimativa)
```

#### Etapa 4 — Detecção de Conflito

Após o merge, verificar inconsistências entre fontes:

| Tipo de Conflito | Definição | Ação |
|:---|:---|:---|
| Conflito de identidade | `canonical_key` ambígua (mesmo número, UASGs diferentes que podem ser a mesma) | Encaminhar para conciliação humana; não criar associação automática |
| Conflito de atributo | Mesmo campo com valores diferentes entre fontes | Registrar divergência no `empenho_eventos_historico`; usar fonte de maior precedência |
| Ausência de atributo | Campo presente em uma fonte e ausente nas outras | Usar o valor disponível; não imputar |
| Divergência temporal | Datas inconsistentes entre fontes (> 1 dia) | Registrar; usar data da fonte de maior autoridade |
| Divergência financeira | `valor_empenhado` com diferença > tolerância (R$ 0,01) | Registrar divergência; usar Contratos.gov; status = DIVERGENTE |
| Divergência quantitativa | `quantidade_fisica` diferindo entre Compras.gov e minuta | Usar Compras.gov (primária); registrar divergência com a minuta |

#### Etapa 5 — Resolução Automática vs. Conciliação Humana

**Resolver automaticamente quando:**
- Conflito é apenas de formatação (normalização resolve);
- Diferença financeira menor que tolerância (ex: < R$ 0,01 por arredondamento);
- Um campo está ausente em uma fonte mas presente em outra (sem conflito real).

**Encaminhar para conciliação humana quando:**
- Identidade ambígua (dois empenhos com números parecidos, UASGs diferentes não coincidentes);
- Divergência financeira significativa (> R$ 0,01) e persistente após múltiplas consultas;
- Quantidade física oficial inconsistente entre fontes primárias;
- Vínculo com item de Ata ou contrato não determinístico.

**Registro de conciliação pendente:**  
O empenho soberano é criado com `status = PENDENTE` e um evento no `empenho_eventos_historico` do tipo `PENDENCIA_CONCILIACAO` contendo o payload completo das fontes em conflito. Nenhuma associação automática é criada.

### 7.3 Resultado: `EmpenhoReconciliado`

```typescript
interface EmpenhoReconciliado {
  canonical_key: string;
  uasg: string;
  ano: number;
  numero: string;
  data_emissao?: string;
  credor_nome?: string;
  credor_cnpj?: string;
  valor_empenhado?: number;
  valor_liquidado?: number;
  valor_pago?: number;
  restos_a_pagar_inscrito?: number;
  origem: 'SINCRONIZADO';
  status: 'CONFIRMADO' | 'PENDENTE' | 'DIVERGENTE';
  fontes_consultadas: ('COMPRAS_GOV' | 'CONTRATOS_GOV' | 'PNCP')[];
  conflitos_detectados: ConflitoCampo[];
  item_key?: string;              // Apenas se determinístico
  contract_key?: string;          // Apenas se determinístico
  quantidade_fisica?: number;     // Apenas se item_key foi determinado
}
```

---

## 8. TRATAMENTO DE CONFLITOS

### 8.1 Hierarquia de Gravidade

```
NÍVEL 1 (Resolvível automaticamente):
  • Diferença de formatação normalizada para a mesma canonical_key
  • Campo ausente em uma fonte, presente em outra
  • Diferença financeira < R$ 0,01

NÍVEL 2 (Registrar, usar fonte primária):
  • Datas divergentes por 1 a 7 dias
  • Credor com grafia levemente diferente
  • Valor empenhado com diferença > R$ 0,01

NÍVEL 3 (Encaminhar para conciliação humana):
  • Identidade ambígua (canonical_key não determinística)
  • Divergência de quantidade física entre fontes primárias
  • Credor CNPJ diferente entre fontes
  • Divergência de valor > 5% do valor empenhado

NÍVEL 4 (Bloquear criação de vínculo):
  • Evidência insuficiente para item_key
  • Evidência insuficiente para contract_key
  • Empenho encontrado mas sem qualquer identificador oficial confiável
```

### 8.2 Registro de Conflito no Histórico

Cada conflito de Nível 2+ gera um evento append-only no `empenho_eventos_historico`:

```sql
-- Tipo de evento para conflito de atributo:
DIVERGENCIA_ATRIBUTO

-- Payload JSON:
{
  "campo": "valor_empenhado",
  "valor_fonte_primaria": 50000.00,
  "valor_fonte_secundaria": 50001.50,
  "fonte_primaria": "CONTRATOS_GOV",
  "fonte_secundaria": "PNCP",
  "diferenca": 1.50,
  "resolucao": "valor_fonte_primaria_aplicado"
}
```

---

## 9. PROMOÇÃO MANUAL → SINCRONIZADO

### 9.1 Regra Existente (preservada do M17)

O `empenho.status` segue o ciclo:
```
MANUAL (inserção humana)
  ↓
confirmação por fonte oficial (mesmo canonical_key encontrado)
  ↓
SINCRONIZADO (origem atualizada)
```

### 9.2 Como o Sync Executará a Promoção

O `empenhoSyncService.ts` (futuro) seguirá esta sequência:

1. Consultar M16 para verificar se a `canonical_key` já existe;
2. Se existente com `origem = MANUAL`:
   a. Construir o payload `p_empenho` para `save_empenho_soberano_atomic` com `origem = SINCRONIZADO`;
   b. Preservar campos de origem manual que não são fornecidos pela API: `observacao`, `unidade_interna_id` (se aplicável);
   c. Validar se `quantidade_fisica` (oficial) diverge da quantidade registrada manualmente;
   d. Se divergente: definir `status = DIVERGENTE` e registrar evento `DIVERGENCIA_QUANTIDADE_MANUAL_OFICIAL`;
   e. Se convergente: definir `status = CONFIRMADO` e registrar evento `SINCRONIZACAO_CONFIRMADA`;
3. Chamar `save_empenho_soberano_atomic(p_empenho := payload_jsonb)`;
4. Interpretar o resultado: `{"success": true, "empenho_id": "...", "action": "updated"}`.

### 9.3 Proteção contra Regressão

Após a promoção para SINCRONIZADO, nenhuma inserção manual posterior pode reverter para MANUAL. A RPC `save_empenho_soberano_atomic` deve implementar essa proteção (verificar lógica atual do M17 quando implementar).

### 9.4 Preservação de Metadados Manuais

| Campo | Comportamento na Promoção |
|:---|:---|
| `observacao` | Preservado (dado humano, não substituído pela API) |
| `numero_raw` original | Preservado no evento histórico |
| `data_lancamento_manual` | Preservada no evento histórico de tipo `CRIACAO_MANUAL` |
| `quantidade` (manual) | Substituída pela oficial após confirmação; valor original preservado no evento |

---

## 10. ASSOCIAÇÃO ITEM ↔ EMPENHO

### 10.1 Regra Ontológica (invariante)

```
Associação Item ↔ Empenho
=
CONSUMO FÍSICO (quantidade de unidades)

NÃO é vínculo financeiro.
NÃO utiliza valor_imputado.
NÃO usa deduções de valor para determinar o vínculo.
```

### 10.2 Critérios de Criação do Vínculo

A associação `arp_item_empenhos` (M16) só pode ser criada quando existir:

**Evidência Nível 1 (mais forte):**
- A API Compras.gov.br retornou o empenho **no contexto de consulta de um item específico** (`4_consultarEmpenhosSaldoItem` com `numeroAta` e `unidadeGerenciadora` definidos). Nesse caso, a `item_key` é construída a partir do contexto da consulta.

**Evidência Nível 2:**
- A minuta do empenho (`itens_minuta`) contém `numero_item_compra` que corresponde determinísticamente ao `numeroItem` da Ata consultada.

**Nenhuma associação quando:**
- Empenho encontrado apenas no Contratos.gov.br ou PNCP sem referência ao item de Ata;
- Texto de descrição do empenho menciona um item — inferência textual não é evidência suficiente;
- Valor empenhado coincide com valor unitário × quantidade — coincidência financeira não é evidência suficiente.

### 10.3 Como o Sync Chamará `link_empenho_to_item_atomic`

```typescript
// Somente após:
// 1. save_empenho_soberano_atomic ter retornado empenho_id
// 2. item_key ter sido determinada com Evidência Nível 1 ou 2

await supabase.rpc('link_empenho_to_item_atomic', {
  p_item_key: item_key,            // Ex: "99999/2026-200331-00001"
  p_empenho_id: empenho_id,        // UUID retornado pela RPC anterior
  p_quantidade_consumida: quantidade_fisica,
  // Nota: demais parâmetros conforme assinatura real do M17
});
```

### 10.4 Quantidade Física Consumida

```
Prioridade 1: quantidadeIncluida (Compras.gov — PRIMÁRIA)
Prioridade 2: itens_minuta[item].quantidade (Contratos.gov — minuta oficial)
Prioridade 3: deduceEmpenhoQuantity (estimativa temporal — marcar como estimativa)

NUNCA: valor / valor_unitario como quantidade oficial
```

### 10.5 Saldo do Item

A fórmula soberana **não se altera**:

```
SaldoDisponivel = QuantidadeHomologadaAta - Σ QuantidadeConsumidaEmpenhos
```

Esta fórmula é implementada pela view `v_arp_item_saldo_detalhado` (M18). O sync não cria novos mecanismos de cálculo de saldo.

---

## 11. ASSOCIAÇÃO CONTRATO ↔ EMPENHO

### 11.1 Regra Ontológica (invariante)

```
Associação Contrato ↔ Empenho
=
VÍNCULO FINANCEIRO (valor monetário vinculado)

NÃO altera valor_empenhado do empenho soberano.
O valor_vinculado pertence à relação contrato_empenhos, não ao empenho.
```

### 11.2 Identificação do Contrato

O `contract_key` é identificado por pelo menos um dos seguintes:

| Fonte | Identificador | Regra |
|:---|:---|:---|
| Contratos.gov.br | `contratoId` interno + `numero` | Usar `getCanonicalContractKey` existente |
| PNCP | `cnpj + anoContrato + sequencialContrato` | Normalizar para `canonical_contract_key` |
| Ambas | Convergirem para o mesmo `canonical_key` | Determinístico |

**Nenhuma associação quando:**
- Empenho encontrado sem referência de contrato;
- Número de contrato ambíguo ou não normalizável.

### 11.3 Como o Sync Chamará `link_empenho_to_contract_atomic`

```typescript
// Somente após save_empenho_soberano_atomic e identificação determinística do contrato:
await supabase.rpc('link_empenho_to_contract_atomic', {
  p_contract_key: contract_key,
  p_empenho_id: empenho_id,
  p_valor_vinculado: valor_vinculado  // Opcional; extraído de Contratos.gov
});
```

---

## 12. CENÁRIOS A/B/C/D

### Cenário A — Ata → Item → Contrato → Empenho

**Fluxo de sync:**
1. Compras.gov retorna empenhos do item de Ata → `canonical_key` construída com `item_key` do contexto;
2. `save_empenho_soberano_atomic` persiste o empenho;
3. `link_empenho_to_item_atomic` cria o vínculo quantitativo;
4. Contratos.gov retorna empenhos do contrato → confirma a mesma `canonical_key`;
5. `link_empenho_to_contract_atomic` cria o vínculo financeiro.

**Resultado:** empenho com dois vínculos (item + contrato). Double counting impossível pois as CTEs do M18 são independentes.

### Cenário B — Ata → Item → Empenho (instrumento substitutivo, Art. 95)

**Fluxo de sync:**
1. Compras.gov retorna empenhos do item de Ata com `item_key` determinística;
2. `save_empenho_soberano_atomic` + `link_empenho_to_item_atomic`;
3. Contratos.gov não retorna esse empenho em nenhum contrato conhecido;
4. `contract_key` permanece NULL.

**Resultado:** empenho soberano com vínculo ao item, sem vínculo contratual. Válido. Não forçar vínculo contratual.

### Cenário C — Contrato sem Ata → Empenho

**Fluxo de sync:**
1. Contratos.gov retorna empenhos do contrato;
2. `canonical_key` construída a partir do contrato;
3. `save_empenho_soberano_atomic` + `link_empenho_to_contract_atomic`;
4. `item_key` = NULL (não há item de Ata).

**Resultado:** empenho soberano com vínculo contratual, sem vínculo a item de Ata. Válido.

### Cenário D — Empenho Encontrado sem Vínculo Determinístico

**Situação:** Empenho aparece em consultas mas não é possível determinar nem o item de Ata nem o contrato.

**Fluxo de sync:**
1. `save_empenho_soberano_atomic` persiste o empenho soberano com campos disponíveis;
2. `item_key` = NULL;
3. `contract_key` = NULL;
4. `status = PENDENTE`;
5. Evento `PENDENCIA_VINCULO` registrado no histórico.

**Resultado:** empenho soberano criado. Vínculos permanecem pendentes para conciliação humana. O empenho existe como SSOT sem associações incorretas.

---

## 13. IDEMPOTÊNCIA

### 13.1 Garantia Principal

A `canonical_key` (`uasg-ano-numero`) é a chave de upsert do M17 (`save_empenho_soberano_atomic`). Executar o sync múltiplas vezes com os mesmos dados de entrada produz o mesmo estado final no M16.

### 13.2 Cenários de Idempotência

| Cenário | Comportamento |
|:---|:---|
| Mesma consulta repetida | A `canonical_key` já existe → M17 faz UPDATE dos campos (não INSERT) |
| Mesma resposta de API | Normalização idempotente → mesma `canonical_key` → mesmo resultado |
| Mesmo empenho de fontes diferentes | Agrupamento por `canonical_key` antes de persistir → apenas um registro no M16 |
| Execução simultânea do sync | M17 usa controles transacionais PostgreSQL (SERIALIZABLE ou FOR UPDATE) → sem duplicatas |
| Retry após timeout | `save_empenho_soberano_atomic` é idempotente por design de upsert |
| Retry após HTTP 429 | Não cria estado inconsistente; retry retoma do mesmo ponto |

### 13.3 Proteção contra Duplicatas

- **Nível 1:** `canonical_key` como `PRIMARY KEY` ou `UNIQUE` em `public.empenhos`;
- **Nível 2:** M17 usa `INSERT ... ON CONFLICT DO UPDATE` (upsert);
- **Nível 3:** O reconciliador agrupa por `canonical_key` antes de qualquer chamada ao M17.

### 13.4 Sequência Obrigatória de Chamadas

```
1. save_empenho_soberano_atomic   (cria ou atualiza empenho soberano)
        ↓ retorna empenho_id
2. link_empenho_to_item_atomic    (somente se item_key determinística)
        ↓
3. link_empenho_to_contract_atomic (somente se contract_key determinística)
```

Nunca inverter a ordem. Nunca chamar 2 ou 3 antes de 1.

---

## 14. CONCORRÊNCIA

### 14.1 Garantias do M17

O M17 já inclui mecanismos de controle de concorrência no PostgreSQL. As RPCs `link_empenho_to_item_atomic` e `link_empenho_to_contract_atomic` usam locks transacionais para evitar vínculos duplicados.

### 14.2 Estratégia no Sync

- O `empenhoSyncService.ts` deve executar os empenhos de um mesmo item de forma **sequencial** (não paralela) para evitar race conditions nos vínculos;
- Empenhos de itens diferentes podem ser processados em paralelo com `Promise.allSettled`;
- Batch size recomendado: ≤ 5 itens simultâneos (analogia ao `syncService.ts` existente).

### 14.3 Detecção de Concorrência

Se o M17 retornar erro de concorrência (ex: serialization failure, código `40001`):
- Aguardar backoff exponencial (ex: 100ms, 200ms, 400ms);
- Máximo 3 retries por empenho;
- Após 3 falhas: registrar como falha transitória e prosseguir com os demais.

---

## 15. RESILIÊNCIA

### 15.1 Comportamento por Tipo de Falha

| Falha | Comportamento |
|:---|:---|
| HTTP 429 (Rate limit) | Backoff exponencial com jitter; retry após cooldown |
| HTTP 500 (Erro servidor) | Retry 2x com backoff; após falha persistente, pular e continuar |
| Timeout | Tratar como falha temporária; retry; não criar estado inconsistente |
| API indisponível | Usar apenas as fontes disponíveis; não degradar dados já persistidos |
| Resposta incompleta | Processar apenas os campos presentes; campos ausentes = NULL |
| JSON inválido | Rejeitar o registro; registrar falha; continuar com próximo |
| Schema inesperado | Aplicar validação defensiva; campos desconhecidos são ignorados |
| Paginação interrompida | Salvar o que foi recebido; marcar consulta como parcial |
| Fonte parcialmente disponível | Usar as fontes disponíveis; não apagar dados da fonte indisponível |

### 15.2 Princípio Fundamental

```
Falha externa NUNCA degrada o SSOT.
```

- Dados já persistidos no M16 não são apagados por falha de API;
- Ausência de resposta ≠ exclusão do empenho no SSOT;
- O sync é aditivo e de atualização; nunca destrutivo por falha externa.

### 15.3 Distinção de Ausências

| Situação | Interpretação | Ação |
|:---|:---|:---|
| Empenho não retornado na consulta | Ausência temporária (timeout, paginação incompleta) | Manter no SSOT; não alterar |
| Empenho explicitamente cancelado/anulado pela API | Exclusão oficial | Registrar evento `ANULACAO_OFICIAL` no histórico; não deletar o registro |
| API retorna campo zerado | Atualização oficial para zero | Atualizar; registrar evento |
| API retornou 404 para o empenho | Investigar; pode ser exclusão ou erro | Não deletar automaticamente; aguardar confirmação |

---

## 16. ARQUITETURA PROPOSTA

### 16.1 Visão de Componentes

```
src/adapters/
├── comprasGovEmpenhoAdapter.ts    (envolve fetchEmpenhosSaldoItem → NormalizedEmpenho[])
├── contratosGovEmpenhoAdapter.ts  (envolve fetchContratosGovEmpenhos + fetchContratoEmpenhoDetalhe → NormalizedEmpenho[])
└── pncpEmpenhoAdapter.ts          (envolve fetchPncpContractEmpenhos → NormalizedEmpenho[])

src/services/
├── empenhoNormalizationService.ts (normaliza campos brutos de qualquer fonte → NormalizedEmpenho)
├── empenhoReconciliationService.ts (agrupa, mescla, detecta conflitos → EmpenhoReconciliado[])
└── empenhoSyncService.ts          (orquestra: adapters → normalização → reconciliação → M17 RPCs)
```

### 16.2 Interfaces de Responsabilidade Única

| Componente | Responsabilidade Única |
|:---|:---|
| `comprasGovEmpenhoAdapter` | Consultar Compras.gov.br; retornar `NormalizedEmpenho[]` (zero lógica de negócio) |
| `contratosGovEmpenhoAdapter` | Consultar Contratos.gov.br (lista + detalhe); retornar `NormalizedEmpenho[]` (zero lógica de negócio) |
| `pncpEmpenhoAdapter` | Consultar PNCP; retornar `NormalizedEmpenho[]` (zero lógica de negócio) |
| `empenhoNormalizationService` | Transformar registro bruto de qualquer tipo em `NormalizedEmpenho`; zero chamadas de API; zero persistência |
| `empenhoReconciliationService` | Receber `NormalizedEmpenho[]`; retornar `EmpenhoReconciliado[]`; zero chamadas de API; zero persistência |
| `empenhoSyncService` | Orquestrar adapters → normalização → reconciliação → chamar M17; único serviço que persiste |

### 16.3 Fluxo de Dados Detalhado

```
empenhoSyncService.syncEmpenhosPorItem(itemKey, arp, item)
  │
  ├── comprasGovEmpenhoAdapter.fetchNormalizedEmpenhos(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora)
  │     └── fetchEmpenhosSaldoItem → filtrar por item → normalizar → NormalizedEmpenho[]
  │
  ├── (para cada contrato do item)
  │   contratosGovEmpenhoAdapter.fetchNormalizedEmpenhos(contratoId, contractKey)
  │     └── fetchContratosGovEmpenhos → para cada empId: fetchContratoEmpenhoDetalhe → normalizar
  │
  ├── (para cada contrato PNCP do item)
  │   pncpEmpenhoAdapter.fetchNormalizedEmpenhos(cnpj, ano, sequencial, contractKey)
  │     └── fetchPncpContractEmpenhos → normalizar
  │
  ├── empenhoReconciliationService.reconcile([...allNormalized])
  │     └── agrupar por canonical_key → merge por precedência → detectar conflitos → EmpenhoReconciliado[]
  │
  └── para cada EmpenhoReconciliado:
        save_empenho_soberano_atomic(reconciled)
          ↓ (se item_key disponível)
        link_empenho_to_item_atomic(item_key, empenho_id, quantidade)
          ↓ (se contract_key disponível)
        link_empenho_to_contract_atomic(contract_key, empenho_id, valor_vinculado)
```

### 16.4 Integração com M17

O `empenhoSyncService` é o **único** componente que chama as RPCs M17. Todos os adapters e serviços de normalização/reconciliação são puros (sem chamadas de rede ao banco).

O payload de `save_empenho_soberano_atomic` é um JSONB construído a partir de `EmpenhoReconciliado`:

```typescript
const payload = {
  canonical_key: reconciled.canonical_key,
  uasg: reconciled.uasg,
  ano: reconciled.ano,
  numero: reconciled.numero,
  data_emissao: reconciled.data_emissao,
  credor_nome: reconciled.credor_nome,
  credor_cnpj: reconciled.credor_cnpj,
  valor_empenhado: reconciled.valor_empenhado,
  valor_liquidado: reconciled.valor_liquidado,
  valor_pago: reconciled.valor_pago,
  restos_a_pagar_inscrito: reconciled.restos_a_pagar_inscrito,
  origem: 'SINCRONIZADO',
  status: reconciled.status,
  fontes_consultadas: reconciled.fontes_consultadas,
  conflitos: reconciled.conflitos_detectados
};
```

---

## 17. COMPONENTES FUTUROS

### 17.1 `comprasGovEmpenhoAdapter.ts`

```
Entrada: numeroAta, unidadeGerenciadora, numeroItem (contexto)
Saída: NormalizedEmpenho[]
Dependências: fetchEmpenhosSaldoItem (api.ts), empenhoNormalizationService
Lógica: Filtro por numeroItem + normalização
Testes: unitários (sem rede)
```

### 17.2 `contratosGovEmpenhoAdapter.ts`

```
Entrada: contratoId (number), contractKey (string)
Saída: NormalizedEmpenho[]
Dependências: fetchContratosGovEmpenhos, fetchContratoEmpenhoDetalhe (api.ts), empenhoNormalizationService
Lógica: Lista empenhos → para cada um busca detalhe → normaliza → extrai quantidade de itens_minuta
Testes: unitários (sem rede)
```

### 17.3 `pncpEmpenhoAdapter.ts`

```
Entrada: cnpj, ano, sequencialContrato, contractKey
Saída: NormalizedEmpenho[]
Dependências: fetchPncpContractEmpenhos (api.ts), empenhoNormalizationService
Lógica: Consulta direta + normalização
Testes: unitários (sem rede)
```

### 17.4 `empenhoNormalizationService.ts`

```
Funções exportadas:
  normalizeFromComprasGov(record: EmpenhoSaldoItemRecord, context: ItemContext): NormalizedEmpenho
  normalizeFromContratosGov(record: ContratosGovEmpenhoRecord, contractKey: string): NormalizedEmpenho
  normalizeFromPncp(record: PncpContractEmpenho, contractKey: string): NormalizedEmpenho
  buildCanonicalKey(uasg, ano, numero): string

Sem chamadas de rede. Sem chamadas de banco. Puro TypeScript.
Testes: 100% unitários
```

### 17.5 `empenhoReconciliationService.ts`

```
Funções exportadas:
  reconcile(normalized: NormalizedEmpenho[]): EmpenhoReconciliado[]
  detectConflicts(group: NormalizedEmpenho[]): ConflitoCampo[]
  mergeByPrecedence(group: NormalizedEmpenho[]): Partial<EmpenhoReconciliado>

Sem chamadas de rede. Sem chamadas de banco. Puro TypeScript.
Testes: 100% unitários
```

### 17.6 `empenhoSyncService.ts`

```
Funções exportadas:
  syncEmpenhosPorItem(itemKey, arp, item, contratos): Promise<SyncEmpenhoResult>
  syncEmpenhosPorContrato(contractKey, contratoId, cnpj, ano, sequencial): Promise<SyncEmpenhoResult>

Dependências: adapters + reconciliationService + supabase (M17 RPCs)
Testes: integração (requerem banco remoto)
```

---

## 18. ESTRATÉGIA DE TESTES FUTUROS

### 18.1 Testes Unitários (sem banco, sem rede)

| Caso de Teste | Componente | Tipo |
|:---|:---|:---|
| Normalizar `"2026NE000142"` → `"2026NE142"` | `empenhoNormalizationService` | Unitário |
| Normalizar número com espaços `"2026 NE 142"` → `"2026NE142"` | `empenhoNormalizationService` | Unitário |
| Normalizar número apenas dígitos `"000142"` → `"142"` | `empenhoNormalizationService` | Unitário |
| Número vazio → canonical_key inválida | `empenhoNormalizationService` | Unitário |
| Número sem padrão → marcar como PENDENTE_IDENTIDADE | `empenhoNormalizationService` | Unitário |
| Mesma `canonical_key` de fontes diferentes → 1 registro | `empenhoReconciliationService` | Unitário |
| Fontes com atributos complementares → merge correto | `empenhoReconciliationService` | Unitário |
| Conflito de `valor_empenhado` → usar Contratos.gov, registrar conflito | `empenhoReconciliationService` | Unitário |
| Conflito de `data_emissao` → usar Contratos.gov, registrar conflito temporal | `empenhoReconciliationService` | Unitário |
| Conflito de `credor_cnpj` → encaminhar para conciliação humana | `empenhoReconciliationService` | Unitário |
| Conflito de quantidade física entre fontes primárias | `empenhoReconciliationService` | Unitário |
| Promoção MANUAL → SINCRONIZADO quando `canonical_key` coincide | `empenhoReconciliationService` | Unitário |
| Empenho manual sem correspondência oficial → mantém MANUAL | `empenhoReconciliationService` | Unitário |
| Execução repetida com mesmos dados → mesmo resultado | `empenhoReconciliationService` | Unitário |
| Empenho sem item_key → nenhum vínculo criado | `empenhoReconciliationService` | Unitário |
| Empenho sem contract_key → nenhum vínculo criado | `empenhoReconciliationService` | Unitário |
| Cenário A: item + contrato + empenho | `empenhoReconciliationService` | Unitário |
| Cenário B: item direto + empenho sem contrato | `empenhoReconciliationService` | Unitário |
| Cenário C: contrato sem ata + empenho | `empenhoReconciliationService` | Unitário |
| Cenário D: empenho sem vínculo determinístico | `empenhoReconciliationService` | Unitário |
| HTTP 429 → backoff e retry | `empenhoSyncService` (mock) | Unitário com mock |
| Timeout → sem corrupção de estado | `empenhoSyncService` (mock) | Unitário com mock |
| Fonte indisponível → usar fontes disponíveis | `empenhoSyncService` (mock) | Unitário com mock |
| JSON inválido → rejeitar, prosseguir | `adapters` | Unitário |
| `parseMoneyValue("1.530.000,00")` → `1530000.0` | `empenhoNormalizationService` | Unitário |
| `getEmpenhoEffectiveValue(0, 5000)` → `5000` (RP) | `empenhoNormalizationService` | Unitário |

### 18.2 Testes de Integração (requerem banco remoto)

| Caso de Teste | Componente | Tipo |
|:---|:---|:---|
| `save_empenho_soberano_atomic` com payload completo | `empenhoSyncService` | Integração |
| `save_empenho_soberano_atomic` repetido (idempotência) | `empenhoSyncService` | Integração |
| `link_empenho_to_item_atomic` com `item_key` válida | `empenhoSyncService` | Integração |
| `link_empenho_to_contract_atomic` com `contract_key` válida | `empenhoSyncService` | Integração |
| Concorrência: 2 execuções simultâneas do sync → sem duplicatas | `empenhoSyncService` | Integração |
| MANUAL → SINCRONIZADO com confirmação oficial | `empenhoSyncService` | Integração |
| Cenário A completo no banco (item + contrato + empenho) | `empenhoSyncService` | Integração |
| Cenário B completo no banco (item direto) | `empenhoSyncService` | Integração |
| Cenário C completo no banco (contrato sem ata) | `empenhoSyncService` | Integração |
| Higienização pós-teste (trigger de imutabilidade) | `empenhoSyncService` | Integração |
| `v_arp_item_saldo_detalhado` reflete quantidade consumida correta após sync | M18 | Integração |
| `v_contrato_empenhos_lastro` reflete vínculo financeiro após link | M18 | Integração |

---

## 19. RISCOS E GAPS

### 19.1 Riscos Identificados

| Risco | Probabilidade | Impacto | Mitigação |
|:---|:---:|:---:|:---|
| `save_empenho_soberano_atomic` não suporta todos os campos necessários | Média | Alto | Auditar assinatura completa da RPC antes de implementar; abrir M17-R1 se necessário |
| Limitação de quota (HTTP 429) das APIs externas durante sync | Alta | Médio | Backoff exponencial; processamento em batches pequenos |
| `canonical_key` colisão por normalização incorreta | Baixa | Alto | Testes exaustivos com variações reais de formato |
| Quantidade física indisponível em Contratos.gov (minuta vazia) | Média | Médio | Fallback para `deduceEmpenhoQuantity` com flag `quantidade_e_estimada = true` |
| Empenho de RP (Restos a Pagar) com `valor_empenhado = 0` | Alta | Médio | `getEmpenhoEffectiveValue` já trata esse caso |
| Número de empenho em formato desconhecido por UASG diferente | Média | Baixo | Registrar como PENDENTE; não rejeitar silenciosamente |
| Empenho de adesão (carona) consultado com contexto errado | Média | Alto | Sempre filtrar por UASG permitida (200331/200330) |

### 19.2 Gaps Identificados

| Gap | Descrição |
|:---|:---|
| Assinatura completa de `save_empenho_soberano_atomic` | Necessário auditar a RPC M17 para confirmar quais campos JSONB são suportados antes da implementação |
| Formato de `canonical_item_key` para o contexto de caronas | Empenhos de adesão têm UASG diferente da gerenciadora; definir item_key canônica para caronas |
| Conciliação humana — interface | Esta fase não planeja a UI de conciliação; registrar como escopo de fase posterior |
| Aposentadoria das tabelas legadas | Tabelas `empenhos_manuais`, `empenho_links` etc. precisarão de migration de aposentadoria; escopo futuro |
| Deduplicação de empenhos de reforço e anulação | Compras.gov retorna campos `reforco` e `anulacao`; o tratamento contábil desses casos precisa de regras explícitas na implementação |

---

## 20. CRITÉRIOS DE ACEITE DO PLANEJAMENTO

| Critério | Status |
|:---|:---|
| M16, M17 e M18 são respeitados | ✅ |
| Não existe segundo SSOT | ✅ |
| Não existe segunda chave canônica | ✅ |
| Não existe segundo histórico | ✅ |
| Não existe segundo mecanismo de persistência | ✅ |
| Fontes oficiais estão claramente diferenciadas | ✅ |
| Precedência definida campo a campo | ✅ |
| Conflitos tratados explicitamente | ✅ |
| Ambiguidade não gera associação automática | ✅ |
| MANUAL → SINCRONIZADO está definido | ✅ |
| Item ↔ Empenho continua quantitativo | ✅ |
| Contrato ↔ Empenho continua financeiro | ✅ |
| Ata ≠ Contrato preservado | ✅ |
| Art. 125 não atribuído à Ata | ✅ |
| ACRESCIMO/SUPRESSAO permanecem no domínio contratual | ✅ |
| Art. 95 tratado como instrumento substitutivo | ✅ |
| Indisponibilidade de fonte não degrada o SSOT | ✅ |
| Idempotência definida | ✅ |
| Concorrência definida | ✅ |
| Testes futuros definidos | ✅ |
| Nenhuma implementação realizada | ✅ |

---

## 21. CONCLUSÃO

```text
============================================================
FASE 7.2-F — RESULTADO
======================

PLANEJAMENTO: GO
IMPLEMENTAÇÃO REALIZADA: NÃO
MIGRATIONS CRIADAS: NÃO
TABELAS ALTERADAS: NÃO
RPCs ALTERADAS: NÃO
FRONTEND ALTERADO: NÃO
ARQUIVOS FUNCIONAIS CRIADOS: NÃO
============================================================
```

O planejamento está completo. A auditoria do código existente identificou as funções reutilizáveis, as que precisam de adaptação, as que devem ser aposentadas e as que não se aplicam ao escopo de empenhos soberanos.

A arquitetura proposta preserva todos os invariantes do SaldoARP:
- Único SSOT (M16);
- Única canonical_key (`uasg-ano-numero`);
- Único mecanismo de persistência (M17);
- Único mecanismo de histórico (append-only via M16);
- Separação ontológica Ata ≠ Contrato;
- Item ↔ Empenho = consumo quantitativo;
- Contrato ↔ Empenho = vínculo financeiro.

A próxima fase de implementação (7.2-G ou equivalente) poderá iniciar a partir deste documento com todos os contratos técnicos definidos.
