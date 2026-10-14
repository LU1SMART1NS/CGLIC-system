# FASE 10-A.1 — Saneamento dos Pré-requisitos para Automação

**Sistema:** CGLIC-system 3.0
**Tipo de execução:** Saneamento arquitetural (desenho). Nenhuma migration, RPC, Edge Function, tabela, cron, canal de notificação, novo sistema de identidade ou novo sistema de alertas foi criado nesta fase. Nenhum arquivo de código de produção foi alterado — apenas leitura, verificação e desenho.
**Pré-condição:** Fase 10-A concluída com veredito **HOLD**, apontando 7 GAPs estruturais que precisam de arquitetura definida antes de uma automação/notificação de escopo amplo.
**Baseline de saúde do repositório (antes de qualquer alteração futura ser avaliada)**: `npx tsc --noEmit` → 0 erros. `npx vitest run` → 119 arquivos de teste, 1021 passando, 3 skipped, 0 falhas. `npm run lint` (oxlint) → apenas warnings pré-existentes, exit code 0. `npm run build` → sucesso. Este baseline serve de referência para qualquer implementação futura do saneamento aqui desenhado.

---

## 1. Revalidação dos achados da 10-A

Cada um dos 7 achados foi reconfirmado diretamente no código atual (grep + leitura de arquivo), não a partir do resumo do relatório anterior.

| # | Achado da 10-A | Veredito | Evidência de revalidação |
|---|---|---|---|
| 1 | Taxonomias de severidade divergentes | **CONFIRMADO, com uma correção relevante** | Confirmado que existem 6 tipos distintos (`TemporalStatus`, `AtencaoNivel`, `DashboardAttentionSeverity`, `ReajusteRadarPriorityLevel`, `AttentionPriorityLevel`, `PaymentAlertNivel`/`PaymentCyclePrazos.statusPrazo`). **Correção importante**: a 10-A não havia identificado que `src/design-system/tokens.ts:89` já define `SeverityLevel = 'CRITICA'\|'URGENTE'\|'ATENCAO'\|'INFO'` — **literalmente idêntico** a `DashboardAttentionSeverity` — com tokens visuais completos (`severityTokens`) e componentes prontos (`SeverityBadge.tsx`, `AlertCard.tsx`), já consumidos por `HomeAttentionNow.tsx` e `CentralAttentionQueue.tsx`. Ou seja, **já existe uma taxonomia canônica de fato, parcialmente adotada** — o problema não é "não existe uma taxonomia consolidada", é "nem todo o sistema a adotou". Ver Seção 2. |
| 2 | Ciclo de pagamento/CGOFI só em localStorage | **CONFIRMADO** | `grep supabase\|localStorage src/services/paymentFollowUpService.ts src/hooks/useContractPaymentFollowUp.ts` → zero ocorrências de `supabase`, 2 ocorrências de `localStorage` (`useContractPaymentFollowUp.ts:37,50`). `grep -rli "fatura\|cgofi\|payment_cycle" supabase/migrations/*.sql` → zero resultados. |
| 3 | Ausência de identidade real para responsáveis | **CONFIRMADO** | `contract_managers.gestor_nome VARCHAR(150) NOT NULL` sem FK (`20260922000013_contract_management_schema.sql:23`); `contract_tasks.responsavel_nome`/`concluido_por` idem (linhas 84,90); `processos_sei.responsavel_nome VARCHAR(150)` idem (`20260917000001_canonical_schema.sql:64`) — e o comentário da própria migration de `contract_managers` (linha 14) confirma que essa é uma **convenção deliberada e sistêmica**, não um esquecimento isolado: "Esta é a mesma convenção já usada em `processos_sei.responsavel_nome`". **Achado adicional relevante**: `user_roles.user_id UUID NOT NULL REFERENCES auth.users(id)` (`20260917000002_rbac_and_rls.sql:9`) — ou seja, **o Supabase Auth já existe e já é referenciado por FK real** na camada de RBAC administrativo; só não há ponte entre essa identidade e os campos operacionais de "responsável". Isso muda a natureza da solução (ver Seção 4): não falta identidade no sistema, falta a **ponte** entre identidade de sistema e responsabilidade operacional. |
| 4 | `TaskExecutionMode` nunca persistido | **CONFIRMADO** | `grep "execution_mode\|executionMode" supabase/migrations/*.sql` → zero ocorrências em todas as migrations. `INSERT INTO public.contract_tasks (id, macrotask_id, nome, ordem, status, criado_em, atualizado_em)` (`20260922000014_rpc_contract_management.sql:622-623`) confirma que a única via de inserção real nunca grava esse campo. |
| 5 | Regras de saldo crítico da Ata duplicadas | **CONFIRMADO** | `≥85` aparece de forma independente em `dashboardService.ts:261,394,635` (3 ocorrências de regra, 2 delas em funções diferentes — `calculateAttentionSummary` e o cálculo de resumo de ARP), `centralPrazosService.ts:446`, e ainda recalculado na UI em `ManagementArpBalances.tsx:435,452,589` (que também usa o limiar `70` para "próximo do limite"). Nenhuma constante compartilhada — cada ocorrência tem o número mágico escrito à mão. |
| 6 | Regras de vigência da Ata duplicadas | **CONFIRMADO** | `src/components/ArpSearch.tsx:19-27` (`checkArpExpiration`), `src/components/cards/AtaCardHeader.tsx:44-51` e `src/components/InternalAllocationsDashboard.tsx:168-208` — todos os três usam `new Date()` cru e uma variável `ninetyDaysFromNow` calculada manualmente, **sem** importar `temporalEngineService`. Nenhum dos três usa o motor oficial (`ARP_VIGENCIA_90D`) que `centralPrazosService.ts` usa. |
| 7 | `ataEventService.ts` órfão | **CONFIRMADO** | `grep -rln "ataEventService" src --include="*.ts" --include="*.tsx" | grep -v __tests__` → **zero resultados**. O arquivo (447 linhas) só é referenciado pelo seu próprio arquivo de teste (301 linhas) e por `src/types/ataEvents.ts`. Nenhum componente, hook ou outro serviço o importa. |

**Conclusão da revalidação**: todos os 7 achados se sustentam. Nenhum foi superestimado. Um deles (severidade) ficou **mais tratável** do que parecia, porque já existe uma base canônica pronta — só não foi adotada de forma universal.

---

## 2. Taxonomia canônica de severidade

### 2.1 Decisão

**A taxonomia canônica é `SeverityLevel` (`src/design-system/tokens.ts:89`), idêntica a `DashboardAttentionSeverity` (`src/types/managementDashboard.ts:57`): `'CRITICA' | 'URGENTE' | 'ATENCAO' | 'INFO'`.**

Não se está criando uma segunda taxonomia — está se **formalizando e generalizando** a que já existe e já tem tokens visuais, ícones e componentes prontos (`severityTokens`, `SeverityBadge`, `AlertCard`) e já é a taxonomia do funil testado (`funnelAttentionIntegration.test.ts`).

### 2.2 Origem, significado e uso atual de cada taxonomia hoje existente

| Taxonomia | Origem (arquivo) | Significado | Uso atual | Já mapeia para `SeverityLevel`? |
|---|---|---|---|---|
| `SeverityLevel` / `DashboardAttentionSeverity` | `design-system/tokens.ts:89`, `types/managementDashboard.ts:57` | Severidade final exibida ao usuário no funil de atenção | `dashboardService.calculateAttentionSummary`, `HomeAttentionNow.tsx`, `CentralAttentionQueue.tsx` | **É a própria taxonomia canônica** |
| `AtencaoNivel` | `types/temporal.ts:7` | Nível de atenção derivado por dias restantes (`NORMAL/ATENCAO/CRITICO`), calculado por `temporalEngineService.deriveAtencaoNivel` (≤15d=CRITICO, ≤60d=ATENCAO, dias corridos) | `centralPrazosService.ts` (todos os gatilhos de vigência e tarefas humanas) | **Não formalmente** — `dashboardService.calculateAttentionSummary` faz uma tradução manual e implícita ao reclassificar cada `CentralPrazosItem` (linhas 274-336), mas não existe uma função nomeada e reutilizável para isso |
| `ReajusteRadarPriorityLevel` | `types/contractReajusteRadar.ts:10` | Prioridade do radar de reajuste (`PROXIMA/URGENTE/HOJE/VENCIDA`) | `contractReajusteRadarService.ts` | Traduzido manualmente dentro de `calculateAttentionSummary` (linhas 367-387) |
| `AttentionPriorityLevel` | `src/components/contracts/ContractAttentionCenter.tsx:35` (local ao componente) | Prioridade de tarefa no Contrato 360 (`VENCIDA/HOJE/URGENTE/PROXIMA/SEM_PRAZO`) | Só dentro de `ContractAttentionCenter.tsx`, via `classifyTaskAttention` (linhas 48-65) | **Não** — reimplementação isolada, thresholds próprios, nunca convertida |
| `PaymentCyclePrazos.statusPrazo` / `PaymentAlertNivel` | `types/paymentFollowUp.ts` | Estado de prazo de pagamento (`NORMAL/ATENCAO/CRITICO/VENCIDO`) e nível de alerta (`CRITICO/ATENCAO/ACOMPANHAMENTO/NORMAL`) | `paymentFollowUpService.ts` | Traduzido manualmente dentro de `calculateAttentionSummary` (linhas 340-365), mas só para os itens que entram no funil — o `ContractAttentionCenter.tsx` consome os `PaymentAlert` originais, sem tradução |

### 2.3 Mapeamento de conversão proposto (documentado, não implementado)

```
REGRA (taxonomia de origem)                    →  SEVERIDADE CANÔNICA (SeverityLevel)
─────────────────────────────────────────────────────────────────────────────────────
AtencaoNivel.CRITICO                           →  CRITICA   (se atrasado/vencido) ou URGENTE (se só "crítico" por proximidade)
AtencaoNivel.ATENCAO                           →  ATENCAO
AtencaoNivel.NORMAL                            →  INFO

ReajusteRadarPriorityLevel.VENCIDA             →  CRITICA
ReajusteRadarPriorityLevel.HOJE                →  URGENTE
ReajusteRadarPriorityLevel.URGENTE             →  URGENTE
ReajusteRadarPriorityLevel.PROXIMA             →  ATENCAO

AttentionPriorityLevel.VENCIDA                 →  CRITICA
AttentionPriorityLevel.HOJE                    →  URGENTE
AttentionPriorityLevel.URGENTE                 →  URGENTE
AttentionPriorityLevel.PROXIMA                 →  ATENCAO
AttentionPriorityLevel.SEM_PRAZO               →  INFO

PaymentCyclePrazos.statusPrazo.VENCIDO         →  CRITICA
PaymentCyclePrazos.statusPrazo.CRITICO         →  CRITICA (ou URGENTE, a decidir na homologação visual)
PaymentCyclePrazos.statusPrazo.ATENCAO         →  ATENCAO
PaymentCyclePrazos.statusPrazo.NORMAL          →  INFO
PaymentAlertNivel.CRITICO                      →  CRITICA
PaymentAlertNivel.ATENCAO                      →  ATENCAO
PaymentAlertNivel.ACOMPANHAMENTO               →  INFO
```

Este mapeamento já existe **de forma implícita e espalhada** dentro de `dashboardService.calculateAttentionSummary` (linhas 274-414) — a proposta é **extrair essa lógica para uma função única e nomeada** (ex.: `deriveCanonicalSeverity(origem, nivelOriginal): SeverityLevel`, candidata a viver em `temporalEngineService.ts` ou em um novo módulo `severityService.ts`), e fazer com que:
- `ContractAttentionCenter.tsx` pare de calcular `AttentionPriorityLevel` por conta própria e passe a consumir a mesma função.
- `ManagementAttentionNow.tsx` pare de reimplementar cores (`severityConfig` local, linha 33) e passe a importar `severityTokens`/`SeverityBadge` do design system — hoje ele já usa o enum certo (`DashboardAttentionSeverity`), mas duplica a paleta de cores em vez de importar o token.

### 2.4 Consequência da mudança

- **Sem quebra de contrato de dados**: nenhuma tabela muda. É uma consolidação de código de apresentação/derivação, não de schema.
- **Efeito colateral positivo esperado**: elimina o duplicado confirmado no funil (ver GAP #3 da 10-A — mesmo item de Ata gerando dois IDs de severidade potencialmente diferentes vindos de `centralPrazosService` e do filtro direto de `arpItems`), porque ambos passariam a derivar a severidade pela mesma função.
- **Regra de ouro (Seção 4 do pedido original)**: a partir do saneamento, nenhuma regra de negócio deve inventar sua própria severidade — toda severidade deve nascer de `deriveCanonicalSeverity()` (ou equivalente), nunca de um `if` local reimplementando thresholds.

---

## 3. Arquitetura proposta para pagamentos/CGOFI

### 3.1 O que existe hoje (dados persistidos, derivados, estados, tarefas, deadlines, alertas)

| Categoria | O que é | Onde vive hoje |
|---|---|---|
| Dados persistidos (input do ciclo) | `PaymentCycleInput`: `contractKey`, `competencia` (YYYY-MM), `dataAssinaturaAtesto`, `dataVencimentoFatura`, `documentoAtestoSei`, `numeroProcessoPagamentoSei`, `numeroProcessoContratoSei`, `numeroNotasFiscais`, `valorAtesto`, `empenhoCanonicalKey`, `titularNome`, `responsavelNome`, `documentoDespachoSei`, `dataEnvioCgofi`, `numeroOrdemBancaria`, `dataOrdemBancaria`, `observacoes` | `localStorage`, chave `saldoarp:payment-cycles:{contractKey}` |
| Dados derivados (calculados, não persistidos) | `PaymentCyclePrazos` (dias úteis, `statusPrazo`), `PaymentAlert[]` | `paymentFollowUpService.ts`, recalculado a cada render |
| Estados do ciclo | `PaymentWorkflowStatus`: RECEBIDO → ATRIBUIDO → EM_INSTRUCAO → (PENDENTE_DOCUMENTACAO) → DESPACHO_ELABORADO → ENVIADO_CGOFI → AGUARDANDO_CGOFI → (DEVOLVIDO_FISCAL) → PAGAMENTO_CONFIRMADO → CONCLUIDO / CANCELADO | `types/paymentFollowUp.ts` |
| Tarefas | Checklist fixo de 5 macrotarefas / 11 tarefas, instanciado 1x por ciclo | `paymentFollowUpTemplateService.ts`, gravado dentro do próprio objeto do ciclo no localStorage |
| Deadlines | Vencimento de fatura, prazo de atribuição de atesto, SLA de resposta CGOFI | Calculados por `calculatePaymentCyclePrazos` |
| Alertas | 5 tipos (`PAGAMENTO_FATURA_VENCIDA`, `PAGAMENTO_VENCIMENTO_IMINENTE`, `ATESTO_PENDENTE_ATRIBUICAO`, `CGOFI_SEM_RESPOSTA`, `EMPENHO_SEM_SALDO_SUFICIENTE`) | `derivePaymentCycleAlerts` |
| Quem acessa | Qualquer usuário que abra a tela do contrato específico, **no mesmo navegador** onde o ciclo foi criado | `ContractPaymentFollowUpSection.tsx`, `ContractAttentionCenter.tsx` |
| Sobrevivência a troca de navegador/dispositivo | **Não sobrevive hoje** — é o problema central | — |
| Necessidade de processamento por backend | Sim — é exatamente o pré-requisito para qualquer automação/notificação de pagamento (10-D) | — |

### 3.2 Proposta de modelo canônico

**Decisão de reaproveitamento**: o **estado/fato do ciclo** (datas, documentos SEI, status CGOFI, número de OB) é uma entidade operacional própria — não é um "checklist de tarefas", é um registro de acompanhamento com campos tipados e regras de transição de estado. **Já o checklist de 11 tarefas fixas** é, por natureza, idêntico ao que `contract_task_plans`/`contract_task_macrotasks`/`contract_tasks` já resolvem — não deve ganhar uma segunda estrutura de tarefas.

Proposta:

**(A) Nova entidade (mínima, específica) — `contract_payment_cycles`**

| Campo | Tipo | Observação |
|---|---|---|
| `id` | UUID PK | — |
| `contract_key` | VARCHAR(150) NOT NULL | Chave canônica do contrato (mesma convenção de `contrato_empenhos.contract_key`) |
| `competencia` | VARCHAR(7) NOT NULL | Formato `YYYY-MM` |
| `empenho_canonical_key` | VARCHAR(150) NULL | FK conceitual ao empenho de lastro (mesma chave usada em `contrato_empenhos`) |
| `numero_processo_pagamento_sei` | VARCHAR(50) NULL, REFERENCES `processos_sei(numero_processo_sei)` | Reaproveita a chave natural já usada por `processos_sei` |
| `numero_processo_contrato_sei` | VARCHAR(50) NULL, REFERENCES `processos_sei(numero_processo_sei)` | idem |
| `data_assinatura_atesto`, `data_vencimento_fatura`, `data_envio_cgofi`, `data_ordem_bancaria` | DATE NULL | Fatos temporais do ciclo |
| `documento_atesto_sei`, `documento_despacho_sei`, `numero_ordem_bancaria` | VARCHAR NULL | Identificadores documentais (texto, como já é hoje) |
| `numero_notas_fiscais` | INTEGER NULL | — |
| `valor_atesto` | NUMERIC(18,4) NULL | — |
| `status` | VARCHAR(30) NOT NULL DEFAULT 'RECEBIDO', CHECK IN (os 11 valores de `PaymentWorkflowStatus`) | Máquina de estados existente, sem alteração de vocabulário |
| `titular_nome`, `responsavel_nome` | VARCHAR(150) NULL | **Mantidos como texto livre**, seguindo a convenção sistêmica já documentada (§4) |
| `responsavel_user_id` | UUID NULL, REFERENCES `auth.users(id)` | **Novo, opcional** — ponte de identidade (ver Seção 4) |
| `observacoes` | TEXT NULL | — |
| `origem_dado` | VARCHAR(20) NOT NULL DEFAULT 'MANUAL', CHECK IN ('MANUAL','OFICIAL') | Deixa explícito que este é um fato **registrado pelo servidor**, não um fato soberano de API externa — respeita o invariante do sistema que separa dado oficial de dado manual |
| `criado_em`, `atualizado_em` | TIMESTAMPTZ | — |
| — | `UNIQUE (contract_key, competencia)` | **Chave de idempotência natural** — impede dois ciclos para o mesmo contrato+competência |

**(B) Checklist de tarefas do ciclo — reaproveitar `contract_task_plans`/`contract_tasks` sem alteração estrutural**

Proposta: ao criar um `contract_payment_cycles`, aplicar o template padrão de pagamento (`tpl-pagamento-padrao`, hoje hardcoded em `paymentFollowUpTemplateService.ts`) através do **mesmo mecanismo já existente e testado** (`apply_contract_task_template_atomic`), usando como `contract_key` do plano uma **chave sintética derivada**: `{contract_key}::PGTO::{competencia}`. Isso:
- Não exige nenhuma alteração de schema em `contract_task_plans`/`contract_task_macrotasks`/`contract_tasks`.
- Reaproveita 100% da RLS, auditoria e RPCs já existentes e homologados.
- Preserva a regra "um plano por `contract_key`" sem modificação — a chave sintética já é única por natureza (`competencia` está embutida nela).
- Evita criar um segundo sistema de tarefas (proibido pelo desenho arquitetural da Fase 10).

**(C) Relacionamentos**

```
contract_payment_cycles
   ├─ contract_key         → (convenção, não FK física — contratos não são linhas no banco, vêm de API oficial)
   ├─ empenho_canonical_key → contrato_empenhos / empenhos (mesma convenção já usada)
   ├─ numero_processo_pagamento_sei → processos_sei.numero_processo_sei (FK real)
   ├─ numero_processo_contrato_sei  → processos_sei.numero_processo_sei (FK real)
   └─ responsavel_user_id  → auth.users.id (FK real, opcional)

contract_task_plans.contract_key = '{contract_key}::PGTO::{competencia}'  (reaproveita tarefas existentes)
```

**(D) RLS proposta**: mesmo padrão de `contract_tasks` — leitura pública para autenticados, escrita restrita a `has_role('gestor')`/`has_role('admin')`. Nenhuma novidade de modelo de segurança.

**(E) Auditoria**: reaproveitar o padrão de triggers já usado (`trg_audit_contract_tasks` e equivalentes) — não criar mecanismo de auditoria novo.

**(F) Idempotência**: `UNIQUE(contract_key, competencia)` na tabela nova, mais a chave sintética determinística no plano de tarefas — ambas seguem exatamente o padrão de chave já usado em `centralPrazosService.generateIdempotentItemId` (`{tipo}::{id}::{evento}::{regra}::{ciclo}`), generalizado como `CONTRATO + TIPO_EVENTO + COMPETENCIA`.

### 3.3 O que NÃO se propõe

- Não se propõe migrar dados hoje existentes em `localStorage` de usuários reais automaticamente (não há como acessar o localStorage de outros navegadores; a migração seria, na prática, um recadastro assistido).
- Não se propõe alterar `PaymentWorkflowStatus` nem os tipos de alerta — o vocabulário de negócio já é bom, só falta persistência.
- **Nenhuma migration será criada nesta fase.** Esta é apenas a arquitetura, pendente de autorização (ver Seção 10).

---

## 4. Arquitetura de identidade dos responsáveis

### 4.1 Estado atual (confirmado)

| Campo | Tabela | Tipo hoje |
|---|---|---|
| `gestor_nome` | `contract_managers` | Texto livre |
| `responsavel_nome`, `concluido_por` | `contract_tasks` | Texto livre |
| `responsavel_nome` | `processos_sei` | Texto livre |
| `user_id` | `user_roles` | **UUID, FK real para `auth.users(id)`** |

O Supabase Auth **já existe e já é a fonte de identidade do sistema** — usado para autorização (`has_role()`), não para atribuição operacional. Não existe (nem deve ser criada) uma tabela paralela de "servidores"/"pessoas" — confirmado por grep (`CREATE TABLE.*servidor|pessoa`: zero resultados).

### 4.2 Modelo mínimo proposto: RESPONSÁVEL → IDENTIDADE → DESTINATÁRIO

Não criar novo sistema de usuários. Não duplicar Supabase Auth. Não substituir RBAC. A proposta é **aditiva e não disruptiva**:

Para cada tabela que hoje tem um campo de responsável em texto livre (`contract_managers.gestor_nome`, `contract_tasks.responsavel_nome`/`concluido_por`, `processos_sei.responsavel_nome`, e a futura `contract_payment_cycles.responsavel_nome`), adicionar uma coluna **nova, nullable, não obrigatória**:

```sql
{campo}_user_id UUID NULL REFERENCES auth.users(id)
```

- O campo de texto livre **permanece** (compatibilidade retroativa, e cobre o caso real de servidor sem conta no sistema).
- O campo `_user_id` é preenchido **somente quando** o responsável de fato tiver uma conta Supabase Auth associada — resolução por e-mail no momento da atribuição (já existe um precedente parcial disso em `userService.ts:112`, hoje usado apenas para casamento local por e-mail).
- **Nenhuma automação pode assumir hoje que este campo estará preenchido** — enquanto nem todo servidor operacional tiver conta no sistema, notificação dirigida por e-mail depende de fallback (ex.: notificar o gestor da unidade, ou registrar como "sem destinatário resolvido" e listar em um painel de exceções).

### 4.3 O que isso habilita, e o que ainda não resolve

| Habilita | Não resolve sozinho |
|---|---|
| Join direto `contrato → responsável → e-mail de conta ativa`, quando o campo estiver preenchido | Cobertura de 100% dos responsáveis (depende de todo servidor ter conta) |
| Base para RLS por "sou o responsável deste contrato" no futuro (10-G) | RLS por contrato hoje continua `USING(true)` — mudança de RLS está fora do escopo desta fase (ver Seção 12) |
| Reaproveitamento total do RBAC existente | Preferências de notificação (opt-in/opt-out) — não existe tabela hoje; ficaria para 10-G |

### 4.4 Risco explícito

Esta é uma arquitetura correta, mas seu valor prático depende de uma condição operacional fora do controle do código: **que os gestores/fiscais de contrato de fato possuam conta ativa no CGLIC-system**. Hoje, o sistema é usado extensamente com nomes em texto livre — não foi possível confirmar, dentro do escopo desta auditoria de código, qual a cobertura real de contas ativas por responsável operacional. Isso é um **risco de adoção**, não uma ambiguidade arquitetural (ver Seção 13).

---

## 5. TaskExecutionMode

### 5.1 Onde é definido, onde é perdido

- **Definido**: `src/types/index.ts:561-565` (tipo TypeScript) e nos catálogos hardcoded de cada workflow (`contractAmendmentWorkflowService.ts`, `contractClosureWorkflowService.ts`, `contractRescissionWorkflowService.ts`, `contractProrrogationService.ts`, `paymentFollowUpTemplateService.ts`).
- **Perdido**: no único caminho real de persistência de tarefa — `apply_contract_task_template_atomic` (`20260922000014_rpc_contract_management.sql:622-623`) — que nunca inclui esse campo no `INSERT`. Também não existe em `contract_task_template_tasks` (a tabela de onde o template é copiado), então nem a fonte nem o destino da cópia têm o campo hoje.

### 5.2 Onde deveria ser persistido

Dois pontos, na ordem da cópia:
1. `contract_task_template_tasks.execution_mode` — o **campo canônico de origem**, definido uma vez por tarefa de template (os templates seedados em `20260924000019_seed_standard_contract_task_templates.sql` já têm nomes de tarefa idênticos aos dos catálogos hardcoded — o valor de `execution_mode` para backfill já existe, é só copiar do catálogo em memória).
2. `contract_tasks.execution_mode` — copiado de `contract_task_template_tasks.execution_mode` no momento do `apply_contract_task_template_atomic`, exatamente como hoje já se copia `nome`/`ordem`.

Tipo proposto: `VARCHAR(20) NULL CHECK (execution_mode IN ('INTERNA','EXTERNA','AUTOMATICA','CONFIRMACAO'))` — nullable para não quebrar linhas/templates já existentes sem backfill imediato.

### 5.3 Quais tarefas reais poderiam utilizá-lo hoje

Todas as tarefas nascidas de um dos 5 templates padrão (contratual e de pagamento) já têm, no catálogo hardcoded correspondente, um valor de `executionMode` definido por tarefa — o backfill é mecânico (mapear nome da tarefa → modo do catálogo), não uma decisão de negócio nova.

### 5.4 Todos os 4 modos são necessários?

Sim — confirmado uso real e distinto de cada um nos catálogos existentes (ex.: o template de pagamento usa os 4: INTERNA×4, EXTERNA×3, AUTOMATICA×3, CONFIRMACAO×1). Nenhum modo é redundante ou não utilizado.

### 5.5 Decisão

**Persistir.** Campo canônico: `execution_mode`, origem `contract_task_template_tasks` → copiado para `contract_tasks` no apply. Não implementar nesta fase (ver Seção 10 para a migration proposta).

---

## 6. Regra canônica de saldo crítico

### 6.1 Fonte canônica

View `v_arp_item_saldo_detalhado` (`supabase/migrations/20260924000018_empenho_sync_and_views.sql:85-137`) é a única fonte de dado (`percentual_consumido`). Isso já está correto e não muda.

### 6.2 Serviço responsável pelo cálculo

Proposta: `balanceService.ts` (já é o serviço de domínio de saldo) ganha uma função nova e única:

```ts
export const SALDO_CRITICO_THRESHOLD = 85;
export const SALDO_PROXIMO_LIMITE_THRESHOLD = 70;

export function classifyArpItemSaldo(percentualConsumido: number): {
  isCritico: boolean;
  isProximoLimite: boolean;
  severity: SeverityLevel; // CRITICA | ATENCAO | INFO
}
```

### 6.3 Quem hoje recalcula e deveria só consumir

| Local | Situação hoje | Ação proposta |
|---|---|---|
| `dashboardService.ts:261` (`atasCriticas` filter) | Recalcula `>=85` | Chamar `classifyArpItemSaldo` |
| `dashboardService.ts:394` (`calculateAttentionSummary`) | Recalcula com severidade própria (`>=100→CRITICA`, `>=85→URGENTE`) | Chamar `classifyArpItemSaldo` (ajustando o mapeamento de severidade para o canônico, ver Seção 2.3) |
| `dashboardService.ts:635-636` (`calculateArpSummary`) | Recalcula `isCritico`/`isProximoLimite` | Chamar `classifyArpItemSaldo` |
| `centralPrazosService.ts:446` (gatilho `GATILHO_85PCT`) | Recalcula `>=85` | Chamar `classifyArpItemSaldo` |
| `ManagementArpBalances.tsx:435,452,589` | Recalcula na UI (`percentualConsumoGlobal >= 85`/`>=70`) | Consumir o resultado já classificado vindo do read model (`ManagementDashboardArpSummary`), nunca recalcular no componente |

### 6.4 Arquitetura desejada (confirmada como correta e adotada nesta proposta)

```
v_arp_item_saldo_detalhado
        ↓
balanceService.classifyArpItemSaldo()   ← ÚNICA fonte da regra
        ↓
read models (dashboardService, centralPrazosService)
        ↓
Central de Atenção
        ↓
Home / Atas / Saldos (UI só exibe o que já veio classificado)
```

**Sem alteração de fórmula** — os thresholds 85/70 permanecem exatamente os mesmos, só deixam de estar duplicados. Homologação visual recomendada antes de qualquer implementação, para garantir que a troca de "severidade calculada em 4 lugares diferentes" por "severidade calculada em 1 lugar" não altere nenhuma cor/badge hoje exibida (efeito esperado: nenhuma mudança visível ao usuário, só remoção de duplicação de código e do risco de dessincronia).

---

## 7. Regra canônica de vigência de Ata

### 7.1 Fonte, timezone, data utilizada, janela

- **Fonte de dado**: `arp.dataVigenciaFinal` (de `ArpRecord`, oriundo de `atas_registro_preco`/API oficial).
- **Motor canônico já existente e correto**: `temporalEngineService.calculateDeadline` com a regra `ARP_VIGENCIA_90D` (offset -90 dias corridos) e `ARP_PRORROGACAO_180D` (offset -180 dias), já usado por `centralPrazosService.ts:333-425`. Esse motor já trata timezone (`parseDateBRT`) e usa `differenceInDays`/`addDays` de forma consistente — **não precisa de nenhuma alteração de fórmula**.
- **Classificação**: `AtencaoNivel` (a converter para `SeverityLevel` conforme Seção 2.3).

### 7.2 Componentes que duplicam a lógica (confirmados)

| Componente | Duplicação |
|---|---|
| `ArpSearch.tsx:19-27` (`checkArpExpiration`) | `new Date()` cru + `ninetyDaysFromNow` calculado manualmente |
| `AtaCardHeader.tsx:44-51` | Mesma reimplementação |
| `InternalAllocationsDashboard.tsx:168-208` | Mesma reimplementação |

### 7.3 Regra conceitual única proposta

Extrair um seletor/hook fino, ex. `useArpVigenciaStatus(arp: ArpRecord)`, que internamente chama `temporalEngineService.calculateDeadline(arp.dataVigenciaFinal, ARP_VIGENCIA_90D)` e devolve `{ isExpirada, isExpirandoEm90d, diasRestantes, severity }`. Os três componentes acima passam a consumir esse hook em vez de recalcular com `new Date()`.

**Consequência esperada**: elimina divergência sutil de fuso/bissexto entre a Central de Prazos/Dashboard (que usam o motor oficial) e as telas de Busca de Ata/Alocações Internas (que hoje usam `new Date()` cru) — hoje é teoricamente possível (embora improvável na prática) que uma Ata apareça "expirando" em uma tela e não em outra, por diferença de cálculo de dias.

---

## 8. Decisão sobre `ataEventService.ts`

### 8.1 Achados da investigação

- 447 linhas de serviço + 166 linhas de tipos (`ataEvents.ts`) + 301 linhas de teste — investimento substancial e testado.
- Estrutura **espelha deliberadamente** `contractEventService.ts` (mesmas funções, mesmo padrão: `generateAtaEventId`~`generateIdempotentEventId`, `classifyAtaEvent`~`classifyContractEvent`, `buildAtaEvent`~`buildContractEventsFromOfficialData`, `evaluateAtaProrrogationReadiness`~a lógica de prontidão de prorrogação contratual).
- Contém fundamentação legal específica (vedação de acréscimo por Dec. 11.462/2023 art. 23; prontidão de prorrogação por Art. 84 e Parecer 75/2024/AGU) — não é código genérico, é regra de negócio validada.
- `PLANO_GESTAO_ATA_LEI14133_CONSOLIDADO.md:164` já reconhecia, no próprio planejamento do projeto, que "falta o espelho para Ata" (comparando com `contractEvents.ts`, que tem consumidor real via `useContractWorkflows`) — ou seja, a lacuna já era conhecida e nomeada antes desta auditoria.
- Zero consumidores fora de teste — confirmado.

### 8.2 Decisão: **B — manter como domínio preparado para uso futuro**

Não é código morto para remover (opção C rejeitada): tem qualidade, testes e fundamentação legal equivalentes ao módulo irmão que É usado em produção. Removê-lo destruiria trabalho correto sem ganho algum de saneamento.

Não é para integrar agora (opção A adiada, não rejeitada): integrá-lo exigiria construir uma superfície de UI equivalente a `useContractWorkflows`/`ContractWorkflowsSection` para Atas (um "Ata 360" com cards de workflow de evento/prorrogação de Ata) — isso é trabalho de produto novo, fora do escopo de uma fase de saneamento de pré-requisitos de automação/notificação.

### 8.3 Encaminhamento concreto

Registrar como dependência explícita da **Fase 10-F (Automação de Atas/Saldos)** do roadmap da 10-A: se 10-F pretender automatizar "prontidão de prorrogação de Ata" ou "classificação de eventos de Ata", o motor já existe e está pronto — a integração de UI (mirror de `useContractWorkflows` para Atas) deve ser o primeiro passo de 10-F, não um novo desenvolvimento de regra de negócio.

---

## 9. Dependências para automação

1. Adoção universal de `SeverityLevel` como taxonomia única (Seção 2) — pré-requisito transversal para qualquer notificação central.
2. Implementação do modelo `contract_payment_cycles` + reaproveitamento de `contract_tasks` via chave sintética (Seção 3) — pré-requisito específico do domínio de pagamentos/CGOFI (10-D).
3. Coluna `_user_id` de identidade nas tabelas de responsável (Seção 4) — pré-requisito para qualquer notificação dirigida (10-G), condicionado à cobertura real de contas de usuário.
4. Persistência de `execution_mode` (Seção 5) — pré-requisito para qualquer automação que decida ação com base no modo de execução da tarefa.
5. Consolidação de `classifyArpItemSaldo` (Seção 6) e do seletor de vigência de Ata (Seção 7) — pré-requisito para que 10-F automatize saldo/vigência de Ata sobre uma fonte única e não duplicada.
6. Decisão de integração de `ataEventService.ts` (Seção 8) — pré-requisito específico de 10-F, não de 10-B/10-C/10-D.
7. Definição de RLS por contrato/unidade — **fora do escopo desta fase**, mas é pré-requisito de segurança antes de qualquer notificação expor dado por destinatário (10-G). Deve ser tratada como fase própria, não como efeito colateral do saneamento de severidade/pagamentos.

---

## 10. Mudanças de banco necessárias (propostas, não executadas — aguardando autorização)

| Mudança proposta | Justificativa | Impacto | RLS necessário | Auditoria | Migração proposta (alto nível) |
|---|---|---|---|---|---|
| Nova tabela `contract_payment_cycles` | Sanar a persistência 100% client-side do ciclo de pagamento (GAP #2) | Nova tabela, não quebra nada existente | Leitura pública para autenticados; escrita `has_role('gestor')`/`has_role('admin')`, mesmo padrão de `contract_tasks` | Reaproveitar padrão de trigger de auditoria já usado em `contract_tasks` | `CREATE TABLE` com colunas da Seção 3.2(A), `UNIQUE(contract_key, competencia)`, FKs para `processos_sei` |
| Coluna `execution_mode` em `contract_task_template_tasks` e `contract_tasks` | Sanar a desconexão do `TaskExecutionMode` (GAP #4) | Aditiva, nullable, não quebra linhas existentes | Nenhuma mudança de RLS | Nenhuma mudança de auditoria | `ALTER TABLE ... ADD COLUMN execution_mode VARCHAR(20) NULL CHECK (...)`; backfill dos templates seedados a partir dos catálogos hardcoded existentes; atualizar `apply_contract_task_template_atomic` para copiar o campo |
| Colunas `_user_id` (nullable) em `contract_managers`, `contract_tasks`, `processos_sei` (e na futura `contract_payment_cycles`) | Sanar a ausência de ponte de identidade (GAP #3) | Aditiva, nullable, 100% retrocompatível | Nenhuma mudança de RLS nesta etapa (RLS por identidade fica para 10-G) | Nenhuma | `ALTER TABLE ... ADD COLUMN {campo}_user_id UUID NULL REFERENCES auth.users(id)` |

**Nenhuma dessas migrations foi criada.** Aguardando autorização explícita antes de qualquer implementação, conforme instruído.

---

## 11. Mudanças de frontend necessárias (propostas, não executadas)

1. Extrair `deriveCanonicalSeverity()` e migrar `ContractAttentionCenter.tsx` (remover `classifyTaskAttention`/`AttentionPriorityLevel` local) e `ManagementAttentionNow.tsx` (remover `severityConfig` local, importar `severityTokens`/`SeverityBadge`) para consumi-la.
2. Extrair `useArpVigenciaStatus()` e migrar `ArpSearch.tsx`, `AtaCardHeader.tsx`, `InternalAllocationsDashboard.tsx` para consumi-lo em vez de `new Date()` cru.
3. Migrar `ManagementArpBalances.tsx` para consumir `isCritico`/`isProximoLimite` já calculados pelo read model, removendo o recálculo inline de `>=85`/`>=70`.
4. Reescrever `useContractPaymentFollowUp.ts` para ler/escrever em Supabase (via novo adapter/RPCs) em vez de `localStorage`, mantendo a mesma interface pública do hook sempre que possível para minimizar o raio de impacto em `ContractPaymentFollowUpSection.tsx`/`ContractAttentionCenter.tsx`.
5. Atualizar `getExecutionModeDisplay` (`ContractAttentionCenter.tsx`) para ler `task.executionMode` já populado de fato (hoje sempre cai no branch padrão).

Nenhuma dessas mudanças foi implementada nesta fase.

---

## 12. Mudanças de backend necessárias (propostas, não executadas)

1. Novas RPCs `SECURITY DEFINER` para `contract_payment_cycles` (`create_payment_cycle_atomic`, `update_payment_cycle_atomic`), seguindo exatamente o padrão de `apply_contract_task_template_atomic`/`update_contract_task_atomic` (mesma estrutura de validação de RBAC, mesmo padrão de erro estruturado).
2. Atualizar `apply_contract_task_template_atomic` para copiar `execution_mode` de `contract_task_template_tasks` para `contract_tasks`.
3. Nenhuma mudança de RLS é proposta nesta fase (ver Seção 9, item 7 — tratada como pré-requisito de uma fase própria, não desta).

---

## 13. Riscos

| Risco | Descrição | Mitigação proposta |
|---|---|---|
| Cobertura real de contas de usuário | A ponte de identidade (`_user_id`) só tem valor se os responsáveis operacionais tiverem conta ativa no sistema — não confirmado nesta auditoria de código (é um dado operacional, não de código) | Levantar, antes de 10-G, o percentual real de gestores/fiscais com conta ativa; desenhar fallback institucional (notificar unidade, não pessoa) para os que não tiverem |
| Migração de dados existentes em localStorage | Ciclos de pagamento já cadastrados por usuários reais em produção ficarão "presos" no navegador de origem quando a nova tabela existir | Não migrar automaticamente (tecnicamente impossível vindo do localStorage de terceiros); comunicar aos usuários a necessidade de recadastro assistido, ou aceitar que ciclos antigos fiquem congelados como histórico local |
| Regressão visual ao consolidar severidade | Trocar 4+ cálculos de severidade por 1 pode, por erro de mapeamento, mudar uma cor/badge que hoje o usuário já está acostumado a ver | Homologação visual lado a lado (antes/depois) antes de remover qualquer cálculo duplicado, não só teste automatizado |
| Escopo de `ataEventService` crescer sem controle | Se 10-F decidir integrar o serviço, o esforço real é "construir uma tela nova" (Ata Workflows), não "conectar uma função" | Tratar como item de escopo médio dentro de 10-F, não subestimar como tarefa trivial |
| Falso senso de "identidade resolvida" | Depois de adicionar `_user_id`, é tentador assumir que toda automação pode notificar por e-mail | Documentar explicitamente, em qualquer especificação de 10-G, que `_user_id` é opcional e que ausência dele é o caso normal, não a exceção, até que se prove o contrário |

---

## 14. Ordem recomendada de implementação

1. Consolidar `deriveCanonicalSeverity()` e migrar os componentes divergentes (Seção 11.1) — menor risco, maior alavancagem (destrava tudo o mais).
2. Consolidar `classifyArpItemSaldo()` e `useArpVigenciaStatus()` (Seções 6–7, 11.2–11.3) — mesmo padrão, baixo risco, com homologação visual.
3. Adicionar coluna `execution_mode` (backfill mecânico a partir dos catálogos já existentes) — baixo risco, aditivo.
4. Adicionar colunas `_user_id` de identidade (aditivo, nullable) — baixo risco, mas sem valor prático até que 10-G defina como resolver a atribuição.
5. Implementar `contract_payment_cycles` + reaproveitamento de `contract_tasks` via chave sintética, e migrar `useContractPaymentFollowUp.ts` — maior esforço, mas é o bloqueador mais crítico para 10-D.
6. Só então: liberar 10-B (arquitetura do mecanismo de notificações) sobre uma base já unificada.

Esta ordem coloca as mudanças de menor risco e maior alavancagem primeiro, e deixa a mudança mais trabalhosa (pagamentos) para quando a taxonomia e os padrões de RPC já estiverem exercitados nos itens 1–4.

---

## 15. Critérios para liberar a Fase 10-B

10-B pode ser liberada quando:
- Itens 1–4 da Seção 14 estiverem implementados e homologados (severidade, saldo, vigência, execution_mode) — porque 10-B (arquitetura de notificação) precisa de uma única taxonomia de severidade e de tarefas com modo de execução real para decidir o que/como notificar.
- O modelo de `contract_payment_cycles` (item 5) estiver ao menos implementado e homologado para o domínio de prazos contratuais/Ata, **mesmo que a automação de pagamentos (10-D) fique para depois** — ou seja, 10-B pode nascer com escopo inicial restrito a prazos/Ata (10-C), adiando pagamentos (10-D) sem bloquear o início de 10-B.
- A decisão sobre `ataEventService.ts` (Seção 8) estiver registrada no backlog de 10-F, sem exigir implementação imediata.

---

## STATUS 10-A.1: **GO**

Todos os sete bloqueios identificados na Fase 10-A têm hoje uma arquitetura definida e sem ambiguidade estrutural relevante:
- **Severidade**: fonte canônica já existe (`SeverityLevel`/design system) — falta adoção, não definição.
- **Pagamentos**: modelo de dados definido, com decisão clara de reaproveitamento (`contract_task_plans` via chave sintética) em vez de segundo sistema de tarefas.
- **Identidade**: ponte aditiva definida, reaproveitando o Supabase Auth já existente, sem novo sistema de usuários.
- **TaskExecutionMode**: campo canônico e ponto de cópia definidos, com backfill mecânico já mapeável.
- **Saldo crítico e vigência de Ata**: fonte, serviço responsável e regra de "UI não recalcula" definidos, sem alteração de fórmula.
- **`ataEventService.ts`**: decisão tomada (manter, integrar futuramente em 10-F), não fica em aberto.

O GO é sobre a **arquitetura**, não sobre a implementação — nenhuma migration, RPC, coluna ou refactor foi criada nesta fase, conforme instruído. A implementação do saneamento aqui desenhado (Seção 14) é o próximo passo físico, e deve ser concluída e homologada **antes** de se considerar a automação/notificação de escopo amplo em 10-B para o domínio de pagamentos — para prazos contratuais/Ata, 10-B pode nascer com escopo inicial já em paralelo à implementação dos itens 1–4.

Aguardando autorização para prosseguir com a implementação do saneamento aqui desenhado.
