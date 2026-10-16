# FASE 10-A — Auditoria e Arquitetura de Automação e Notificações

**Sistema:** CGLIC-system 3.0
**Tipo de execução:** Auditoria e desenho. Nenhum código, migration, RPC, Edge Function, tabela, cron ou canal de notificação foi criado nesta fase.
**Método:** cinco auditorias de código independentes (contratos/prazos, pagamentos/financeiro, Atas/saldo/alocações, tarefas/workflows, Central de Atenção + canais + RBAC/RLS), cada uma lendo o código-fonte integralmente e tratando os documentos `FASE_*.md` anteriores apenas como pista — nunca como fonte de verdade. Toda afirmação abaixo é rastreável a `arquivo:linha`.

---

## 1. Objetivo

Mapear, com evidência de código (não de planejamento), tudo que o CGLIC-system já é capaz de detectar de forma confiável hoje, e classificar o que dessas detecções é candidato realista a virar automação, tarefa ou notificação — mantendo a separação:

```
FATO OFICIAL → REGRA/MOTOR TEMPORAL → DETECÇÃO → ALERTA → TAREFA/WORKFLOW → NOTIFICAÇÃO → AÇÃO HUMANA
```

A auditoria confirma a hipótese de trabalho da Fase 10: **o sistema hoje para em "ALERTA"**. Ele nunca chega a "NOTIFICAÇÃO" em nenhum domínio. Isso não é uma suposição de planejamento — é um fato verificado por busca exaustiva no repositório (ver Seção 9).

---

## 2. Arquitetura atual

O CGLIC-system é, hoje, um sistema **100% "pull"**: todo cálculo de prazo, saldo ou severidade é uma função TypeScript pura, sem I/O, que roda no navegador do usuário no momento em que uma tela é aberta (via React Query, com `staleTime` de 1–10 minutos). Não existe nenhum mecanismo "push": nenhum cron, nenhum `pg_cron`, nenhum webhook, nenhum job agendado, nenhuma Supabase Edge Function de notificação. As únicas duas Edge Functions do repositório (`supabase/functions/invite-user`, `supabase/functions/manage-user`) são de gestão de contas de usuário (convite, ativação/desativação, troca de papel) e não têm qualquer relação com alertas de negócio.

Cadeia de composição real, confirmada lendo o código de baixo para cima:

```
temporalEngineService.ts        (motor de datas genérico: dias corridos/úteis, status temporal, nível de atenção)
   ├─▶ centralPrazosService.ts        ("Central de Prazos" — tela /prazos — tarefas humanas + gatilhos de vigência)
   ├─▶ contractReajusteRadarService.ts  (radar de reajuste/repactuação — INDEPENDENTE do centralPrazosService)
   ├─▶ contractProrrogationService.ts   (cronograma + checklist de prontidão de prorrogação)
   ├─▶ contractEventService.ts          (classificação de eventos contratuais, limites legais de aditamento)
   └─▶ ataEventService.ts               (classificação de eventos de Ata + prontidão de prorrogação de Ata — ÓRFÃO, zero consumidores)

paymentFollowUpService.ts      (prazos/alertas de fatura e CGOFI — dados vivem só em localStorage, nunca no Postgres)
balanceService.ts              (saldo de Ata/Item e de alocação interna — função pura, sem persistência própria)
dashboardService.calculateAttentionSummary()   ← O AGREGADOR ÚNICO REAL ("Atenção Agora"/Dashboard Gerencial)
   re-lê e reclassifica os outputs de TODOS os motores acima em um vocabulário de severidade próprio
        │
        ▼
ManagementAttentionNow.tsx / HomeAttentionNow.tsx / ContractAttentionCenter.tsx   (apresentação)
```

**Achado estrutural mais importante da auditoria**: apesar do nome "Funil Único de Atenção" usado nos documentos de planejamento da Fase 9, **existem hoje três implementações paralelas e não sincronizadas** do conceito de "atenção":

| Implementação | Onde | Taxonomia de severidade própria | Alimenta o Funil Único? |
|---|---|---|---|
| **Central de Prazos** (`/prazos`) | `centralPrazosService.buildCentralPrazosItems` | `AtencaoNivel`: NORMAL/ATENCAO/CRITICO | Parcialmente — não inclui o radar de reajuste |
| **Atenção Agora / Dashboard Gerencial** (o funil testado, `funnelAttentionIntegration.test.ts`) | `dashboardService.calculateAttentionSummary` | `DashboardAttentionSeverity`: CRITICA/URGENTE/ATENCAO/INFO | É o funil (mas com sinais divergentes da Central de Prazos) |
| **Contrato 360 → Central de Atenção do contrato** | `ContractAttentionCenter.tsx` (`classifyTaskAttention`) | `AttentionPriorityLevel`: VENCIDA/HOJE/URGENTE/PROXIMA/SEM_PRAZO (thresholds próprios, reimplementados no componente) | **Não** — roda por conta própria, sem passar por `calculateAttentionSummary` |

No total, o código contém **seis vocabulários de severidade/estado distintos**, cada um com seu próprio enum e thresholds hard-coded em arquivo diferente, sem uma função única de derivação de severidade compartilhada:

1. `TemporalStatus` (`src/types/temporal.ts:5`): FUTURO / VENCE_EM_BREVE / VENCE_HOJE / ATRASADO / CONCLUIDO
2. `AtencaoNivel` (`src/types/temporal.ts:7`, regra em `temporalEngineService.ts:161-171`): NORMAL / ATENCAO / CRITICO (≤15d=CRITICO, ≤60d=ATENCAO, dias corridos)
3. `DashboardAttentionSeverity` (`src/types/managementDashboard.ts:57`): CRITICA / URGENTE / ATENCAO / INFO
4. `ReajusteRadarPriorityLevel` (`src/types/contractReajusteRadar.ts`, regra em `contractReajusteRadarService.ts:171-180`): PROXIMA / URGENTE / HOJE / VENCIDA
5. `AttentionPriorityLevel` (`ContractAttentionCenter.tsx:35-64`): VENCIDA / HOJE / URGENTE / PROXIMA / SEM_PRAZO
6. `PaymentCyclePrazos.statusPrazo` / `PaymentAlert.nivel` (`paymentFollowUpService.ts:83-99,131-192`): NORMAL/ATENCAO/CRITICO/VENCIDO e CRITICO/ATENCAO (thresholds em **dias úteis**, não corridos)

Isso é uma fragilidade estrutural de primeira ordem para a Fase 10: **não há hoje uma única "linguagem de severidade" que uma automação/notificação central possa consumir**. Qualquer motor de notificação built sobre isso herdaria a fragmentação, a menos que 10-B comece por unificá-la.

---

## 3. Motores existentes (inventário consolidado)

Tabela mestra de todos os mecanismos confirmados em código (colunas conforme solicitado: entrada, fonte, regra, saída, periodicidade, persistência, responsável, possibilidade de automação, dependências).

### 3.1 Domínio Contratual / Prazos

| Mecanismo | Entrada | Fonte de dados | Regra | Saída | Periodicidade | Persistência | Automatizável | Dependências |
|---|---|---|---|---|---|---|---|---|
| `temporalEngineService.calculateDeadline` (`src/services/temporalEngineService.ts:232-277`) | data-base, `RegraPrazoConfig`, `currentDate?` | datas já carregadas do contrato/ARP | soma/subtrai offset (dias corridos ou úteis); deriva `TemporalStatus`+`AtencaoNivel` | `CalculatedDeadline` com `explicabilidade` | on-demand, puro | Não | Sim — já determinístico e sem I/O | função-base, sem dependências |
| Catálogo `REGRAS_OPERACIONAIS_PADRAO` (`temporalEngineService.ts:177-226`) | — | config estática | 6 regras fixas: PRORROGACAO_180D, CONSULTA_FORNECEDOR_120D, REMESSA_JURIDICA_60D, RESPOSTA_FORNECEDOR_10DU, ARP_PRORROGACAO_180D, ARP_VIGENCIA_90D | catálogo em memória | — | Não | Sim | — |
| `centralPrazosService.buildCentralPrazosItems` (`src/services/centralPrazosService.ts:86-519`) | contratos, ARPs, gestores, planos de tarefas, itens de ARP | `ContractDashboardRecord`, `ArpRecord`, `contract_managers`/`contract_task_plans`/`contract_tasks` (Postgres), `v_arp_item_saldo_detalhado` | (A) tarefas humanas com prazo; (B) gatilho 180d/60d vigência de contrato; (C) gatilho 180d/90d vigência de ARP; (D) saldo físico de item ≥85% | `CentralPrazosItem[]` + KPIs, com id idempotente (`generateIdempotentItemId`) | on-demand (staleTime 60s–5min) | Não (recalculado sempre) | Sim | temporalEngineService |
| `contractReajusteRadarService.evaluateContractReajusteRadar` (`src/services/contractReajusteRadarService.ts:48-214`) | contrato, eventos (opcional) | `ContractDashboardRecord`, eventos construídos em memória a partir de aditivos oficiais | data-base hierárquica (último evento reajuste/repactuação → data proposta → assinatura); marco = aniversário anual; janela -60d a +30d | `ReajusteRadarAlert` com id `ALERT::ANIVERSARIO_REAJUSTE::{contractKey}::ANO_{ciclo}` | on-demand | Não | Sim | temporalEngineService, contractValueEvolutionService |
| `contractProrrogationService.calculateProrrogationDeadlines` (`:57-89`) | vigência final | contrato | cronograma fixo -180/-120/-90/-60/-15/0 dias | `ProrrogationDeadlinesPlan` | on-demand | Não | Sim | temporalEngineService |
| `contractProrrogationService.evaluateProrrogationReadiness` (`:240-416`) | checklist de 5 condições (vantajosidade, concordância, regularidade fiscal, parecer jurídico) | **entrada manual, nunca alimentada hoje** (ver GAP §16.1) | guarda de tempestividade + guarda cruzada de reajuste | `ProrrogationReadinessChecklist` | on-demand | **Não há campo persistido** | Depende — lógica pronta, falta captura de dado real | contractReajusteRadarService |
| `contractEventService.classifyContractEvent` / `calculateAditamentoLimits` (`:53-227`) | descrição textual do termo, variação de valor | aditivos oficiais (PNCP) ou manuais | classificação por *string matching*; limites Art. 125/126 Lei 14.133 (25%/50%/25%) | badges de conformidade | on-demand | Não | Depende — heurística de texto é frágil para produção | — |
| `dashboardService.calculateAttentionSummary` (`src/services/dashboardService.ts:197-470`) | contratos, ARPs, gestores, planos, eventos, ciclos de pagamento, itens de ARP | agrega TODOS os motores acima | reclassifica cada sinal em `DashboardAttentionSeverity` própria, deduplica por `id` exato | `ManagementDashboardAttentionSummary` — **é o único ponto que hoje gera algo visível como "alerta consolidado"** | on-demand (staleTime 2min) | Não | Depende — lógica pura e automatizável, mas precisa de refatoração para rodar fora do navegador e sem duplicar taxonomia | todos os motores de prazo/pagamento/ARP |
| `contractManagementService.ts` | contract_key | Postgres: `contract_managers`, `contract_task_plans`, `contract_tasks`, templates | CRUD de gestores/planos; `calculateContractTaskPlanProgress` marca "atrasada" só por `prazo<hoje` (sem nível de atenção) | estruturas de gestor/plano | on-demand | **Sim** — é a única camada com persistência real de tarefas | — | única fonte real de "tarefas humanas" do funil | — |
| `contractManagementRpcAdapter.ts` (`src/adapters/contractManagementRpcAdapter.ts`) | — | RPCs Postgres | CRUD transacional (não é motor de alerta) | — | escrita | Sim (Postgres) | N/A | — |
| `contractValueEvolutionService`, `contractAmendmentService`, `contractExtinctionService` | eventos formais | — | read models de evolução de valor / matriz jurídica de compatibilidade / checklist de prontidão de encerramento | modelos de leitura | on-demand | Não | N/A — não têm regra temporal/alerta própria | contractEventService |

### 3.2 Domínio Pagamentos / CGOFI / Execução Financeira

| Mecanismo | Entrada | Fonte de dados | Regra | Saída | Periodicidade | Persistência | Automatizável | Dependências |
|---|---|---|---|---|---|---|---|---|
| `calculatePaymentCyclePrazos` (`src/services/paymentFollowUpService.ts:48-100`) | datas de atesto/vencimento/envio CGOFI/OB | objeto do ciclo, vindo do **localStorage** | dias úteis (`differenceInBusinessDays`); `statusPrazo`: VENCIDO/CRITICO(≤3du)/ATENCAO(≤7du)/NORMAL | `PaymentCyclePrazos` | on-demand, a cada render | **NÃO — só localStorage do navegador** | Depende (⚠️ ver §16.2 — barreira arquitetural nº1) | temporalEngineService |
| `derivePaymentCycleAlerts` (`:105-201`) | idem | idem | 5 regras: fatura vencida (CRITICO), vencimento iminente ≤3du (CRITICO), atesto sem atribuição >2du (ATENCAO), CGOFI sem resposta >5du (ATENCAO), saldo de empenho insuficiente (ATENCAO) | `PaymentAlert[]` | idem | Não | Depende | calculatePaymentCyclePrazos |
| `determinePaymentCycleStatus` (`:206-236`) | presença de campos (OB, envio CGOFI, despacho, responsável) | idem | máquina de estados por evidência, não por tempo | `PaymentWorkflowStatus` | on-demand | Não | Sim (função pura, portável) | — |
| `buildPaymentFollowUpTemplate` (`paymentFollowUpTemplateService.ts:17-180`) | — | hardcoded (5 macrotarefas / 11 tarefas) | checklist estático; rótulo `executionMode:'AUTOMATICA'` em 3 tarefas é **apenas rótulo visual**, não executa nada sozinho | `ContractTaskTemplate` estático | 1x por ciclo | salvo dentro do objeto do ciclo, no localStorage | Não (conteúdo estático) | — |
| `calculateFinancialBalances`/`aggregateContractFinancialExecution` (`financialExecutionService.ts:33-62,187-290`) | agregados de empenho | view `v_empenhos_resumo` (Postgres) + `contrato_empenhos` | fórmulas puras de saldo; **não gera alerta** — é FATO OFICIAL por design (comentário do próprio arquivo) | `FinancialBalances` | on-demand | fatos-base sim (Postgres); saldo calculado não | Sim (fonte já é BD) | empenhoSyncService |
| `empenhoNormalizationService` / `empenhoReconciliationService` | registros brutos de Compras.gov/Contratos.gov/PNCP | APIs externas via adapters | sanitização determinística + merge por precedência de fonte, detecta divergências (`conflitos`) | `NormalizedEmpenho`/`EmpenhoReconciliado` | on-demand | **Zero persistência** (comentário explícito no código) | N/A (não são motores de alerta); `conflitos` gerados **não são hoje expostos como alerta na Central de Atenção** | — |
| `empenhoSyncService.persistReconciledEmpenhoM17` | `EmpenhoReconciliado[]` | RPCs `save_empenho_soberano_atomic` etc. | persistência exclusiva via RPC | grava tabelas M16/M17 | **100% on-demand, disparado manualmente** — sem cron | **Sim, Postgres** | Sim, mecanismo já é servidor; falta só agendamento | adapters + reconciliation |
| `empenhoOrchestrationService` (`orchestrateItemEmpenhoSync` etc.) | alvo (item/ata/contrato) | coordena adapters+reconciliation+sync | pipeline completo | `OrchestrationResult` | **100% on-demand**, nenhum caller automático encontrado | delega ao sync (BD) | Sim/depende — já reaproveitável por um job agendado, mas nada o agenda hoje | todos os 3 adapters |
| `calculatePaymentsSummary` (`dashboardService.ts:698-850`) | `PaymentFollowUpCycle[]` (localStorage) | idem | contadores agregados: faturas vencidas/vence hoje/próximas, envio CGOFI atrasado, margem de envio estreita, ciclos de atraso CGOFI, tempo médio CGOFI | `ManagementDashboardPaymentsSummary` | on-demand | Não | Depende (mesma limitação de localStorage) | paymentFollowUpService |

> **Nota terminológica importante**: "fatura vence hoje", "envio CGOFI atrasado" e "margem de envio estreita" — termos citados no escopo desta auditoria — **existem apenas como contadores agregados do dashboard**, não como alertas individuais com id/mensagem por fatura. Só "CGOFI sem resposta" e "vencimento iminente/vencida" são de fato alertas individuais (`PaymentAlert` com id, nível, mensagem).

### 3.3 Domínio Ata / Saldo / Alocações Internas

| Mecanismo | Entrada | Fonte de dados | Regra | Saída | Periodicidade | Persistência | Automatizável | Dependências |
|---|---|---|---|---|---|---|---|---|
| Saldo físico crítico de item de Ata (≥85%) / próximo do limite (70–84%) | `quantidade_homologada`/`percentual_consumido` | view `v_arp_item_saldo_detalhado` (`supabase/migrations/20260924000018_...sql:85-137`) | thresholds hardcoded, **duplicados em 3 lugares de serviço + 1 na UI** (ver §16.3) | flags/contadores | on-demand | Não | Sim | view SQL |
| Vigência de Ata — exaustão (D-90) e planejamento de prorrogação (D-180) | `arp.dataVigenciaFinal` | `atas_registro_preco` | regras `ARP_VIGENCIA_90D`/`ARP_PRORROGACAO_180D` | gatilho operacional | on-demand | Não | Sim — motor genérico já com explicabilidade | temporalEngineService |
| `evaluateAtaProrrogationReadiness` (`ataEventService.ts:277-447`) | vantajosidade, concordância do fornecedor, saldo, previsão editalícia | parâmetros manuais | 4 requisitos (Art. 84, Parecer 75/2024/AGU) | badges + recomendações | — | — | **Motor órfão — zero consumidores em produção** (ver §16.4) | — |
| `classifyAtaEvent` (`ataEventService.ts:56-178`) | descrição/flags do evento | — | vedação de acréscimo (Dec. 11.462/2023 art. 23), classificação de tipo/natureza/impacto | `AtaEvent` | — | — | **Mesmo motor órfão** | — |
| `calculateSaldo`/`calculateSaldoWithContratos` (`balanceService.ts:85-121`) | quantidade registrada, empenhos | empenhos (API/manual/sync) | `Saldo = QuantidadeRegistrada − ΣEmpenhos` (pode ficar negativo) | número | on-demand | Não | Sim — base determinística | — |
| `reconcileBalances` (`balanceService.ts:241-309`) | saldo calculado vs. saldo informado pela API | idem | `DIVERGENTE`/`CONSISTENTE`/`NAO_INFORMADO` | `ReconciliationReport` | on-demand | Não | Sim | — |
| Saldo departamental de alocação interna (`balanceService.ts:174-233`) | cota alocada, empenhos do departamento | empenhos vinculados | `SaldoAlocacao = CotaAlocada − ΣEmpenhosDoDepartamento` | número + percentual | on-demand | Não | Depende — não há farol crítico definido para alocação | — |
| Validação de limite de alocação (`src/components/ItemBalances.tsx:797-808`) | soma de alocações + nova quantidade | estado local do componente | bloqueia se excede quantitativo da UG | erro de formulário | ao submeter | **Só client-side** | **Não sem reforço no servidor** (ver §16.5) | — |
| `save_allocations_atomic` (RPC, `supabase/migrations/20260917000004_rpc_allocations.sql`) | alocações | — | valida RBAC, formato, unicidade, `qty>=0`, concorrência otimista — **não valida soma ≤ quantitativo homologado** | linhas em `arp_allocations` | on-demand | Sim, Postgres | já é RPC; falta o `CHECK`/`RAISE` do limite | `internal_departments` |
| RN-07 — contrato exige ≥1 empenho vinculado (`supabase/migrations/20260917000005_rpc_contracts.sql:89-92`) | `empenhoIds[]` | — | `RAISE EXCEPTION` se vazio, blindado em 3 camadas (RPC + adapter + UI) | erro estruturado | on-demand | **Sim** — invariante de banco | **Já automatizado — padrão-referência** | `contrato_empenhos` |
| `arpContractLinkService.ts` | vínculos Ata↔Contrato | `arp_item_contract_links` | CRUD + enriquecimento visual; **nenhuma verificação de consistência cruzada** | lista enriquecida | on-demand | Sim, Postgres | Depende — regra ainda não existe (ver §16.5) | — |
| `allocationService.ts` | todo o CRUD de alocação | RPCs + fallback localStorage | **puramente CRUD, sem regra de negócio própria** | persistência | on-demand | Sim | N/A — não é motor | RPCs/adapters |

### 3.4 Central de Atenção / Tarefas / Workflows

Ver Seções 4, 5 e 6 para o detalhamento completo — resumo dos motores aqui:

| Mecanismo | Entrada | Fonte | Regra | Saída | Persistência | Automatizável |
|---|---|---|---|---|---|---|
| `dashboardService.calculateAttentionSummary` | ver §3.1 | agrega tudo | funil único real (mas com sinais divergentes da Central de Prazos) | `DashboardAttentionItem[]` | Não | Depende |
| `useContractWorkflows.projectContractWorkflows` (`src/hooks/useContractWorkflows.ts:601-678`) | dados do contrato + `ContractTaskPlan` | client-side | elegibilidade por data/status decide qual card de workflow mostrar | projeção em memória | **Não — nunca grava nada** | N/A (é projeção, não motor de detecção) |
| `apply_contract_task_template_atomic` (RPC) | template + contrato | Postgres | copia template → plano → macrotarefas → tarefas | linhas em `contract_tasks` | **Sim, Postgres** | já é a base real de persistência de tarefas | — |
| `update_contract_task_atomic` (RPC) | task id, novo status | Postgres | ao concluir, carimba `concluido_em`/`concluido_por` | update de linha | Sim | — | — |

---

## 4. Alertas existentes (inventário)

### 4.1 Origens confirmadas do funil real (`dashboardService.calculateAttentionSummary`)

| Origem | Fonte de dados | Severidade possível | Chave de dedup | Persistente? | file:line |
|---|---|---|---|---|---|
| Tarefa contratual atrasada | `buildCentralPrazosItems` | CRITICA | `ATT-TASK-OVERDUE-{id}` | Não | `dashboardService.ts:276-290` |
| Tarefa vence hoje | idem | URGENTE | `ATT-TASK-TODAY-{id}` | Não | `dashboardService.ts:291-305` |
| Tarefa próxima (≤7 dias) | idem | URGENTE | `ATT-TASK-UPCOMING-{id}` | Não | `dashboardService.ts:306-320` |
| Prorrogação de contrato/ARP (janela 8–60 dias) | `buildCentralPrazosItems` | ATENCAO | `ATT-PRORROG-{id}` | Não | `dashboardService.ts:321-336` |
| Pagamento/fatura crítico ou vencido | `paymentCycles` (**localStorage**) | CRITICA/URGENTE | `ATT-PGTO-{cycleKey\|contractKey}-{competencia}` | **Não — nem no banco** | `dashboardService.ts:340-365` |
| Reajuste/repactuação (Radar) | `evaluateContractReajusteRadar` | CRITICA/URGENTE/ATENCAO | `ATT-REAJUSTE-{contractKey}-{ciclo}` | Não | `dashboardService.ts:367-387` |
| Saldo físico crítico de item de Ata (≥85%) | `arpItems` (view SQL) | CRITICA/URGENTE | `ATT-ARP-ITEM-{itemKey}` | Não | `dashboardService.ts:389-414` |

Deduplicação: `Set<string> seenAttentionIds` comparando **apenas por `id` exato** (`dashboardService.ts:417-424`) — não há deduplicação semântica. Isso já produz um duplicado real confirmado: o gatilho `SALDO_CRITICO` do Central de Prazos e o filtro direto de `arpItems ≥85%` no agregador geram **dois itens com IDs diferentes para o mesmo item de Ata** (ver §16.3).

### 4.2 Alertas de pagamento individuais (`derivePaymentCycleAlerts`, `paymentFollowUpService.ts:105-201`)

1. `PAGAMENTO_FATURA_VENCIDA` (CRITICO)
2. `PAGAMENTO_VENCIMENTO_IMINENTE` (CRITICO, ≤3 dias úteis)
3. `ATESTO_PENDENTE_ATRIBUICAO` (ATENCAO, >2 dias úteis sem responsável)
4. `CGOFI_SEM_RESPOSTA` (ATENCAO, >5 dias úteis)
5. `EMPENHO_SEM_SALDO_SUFICIENTE` (ATENCAO)

Todos calculados em memória a partir de dados que só existem no localStorage — **nenhum é visível fora do navegador de quem preencheu o ciclo**.

### 4.3 Alertas/badges implementados fora do funil (ad-hoc, não reutilizáveis)

| Local | O que faz | Por que é um problema |
|---|---|---|
| `ManagementArpBalances.tsx:435,452` | Recalcula `≥85%`/`≥70%` diretamente no JSX | Duplica a regra de serviço sem reaproveitar `isCriticoGlobal` |
| `ArpSearch.tsx:19-27` (`checkArpExpiration`) | Reimplementa vigência D-90 com `new Date()` cru | Não usa `temporalEngineService` — pode divergir da Central de Prazos (fuso, bissexto) |
| `AtaCardHeader.tsx:44-51` | Mesma reimplementação | idem |
| `InternalAllocationsDashboard.tsx:168-208` | Mesma reimplementação | idem |
| `ContractAttentionCenter.tsx:48-65` (`classifyTaskAttention`) | 3ª taxonomia de severidade própria | Não passa pelo funil único; Contrato 360 pode mostrar severidade diferente do Dashboard Gerencial para o mesmo contrato |

### 4.4 Alertas "planejados" mas não implementados

- "Alerta recorrente de remanejamento a cada 2 dias" com badges `EM_NEGOCIACAO`/`ESTAGNADO` — descrito em `PLANO_GESTAO_ATA_LEI14133_CONSOLIDADO.md:215-226`. Busca por esses termos no código: **zero ocorrências fora do próprio texto do plano**. 100% proposta, 0% implementação.
- "Contrato sem Ata vinculada" / "Ata vencendo com contratos ativos" — não existe em nenhuma camada (nem serviço, nem RLS, nem UI).
- Conflitos de reconciliação de empenho (`empenhoReconciliationService`) — calculados mas **não expostos como alerta** na Central de Atenção hoje.

---

## 5. Tarefas existentes

### 5.1 Schema real de `contract_tasks`

`supabase/migrations/20260922000013_contract_management_schema.sql:77-91`:

```sql
CREATE TABLE IF NOT EXISTS public.contract_tasks (
  id VARCHAR(60) PRIMARY KEY,
  macrotask_id VARCHAR(60) NOT NULL REFERENCES public.contract_task_macrotasks(id) ON DELETE CASCADE,
  nome VARCHAR(300) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'NAO_APLICAVEL')),
  responsavel_nome VARCHAR(150),
  prazo DATE,
  observacao TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  concluido_em TIMESTAMPTZ,
  concluido_por VARCHAR(150)
);
```

**Não existe coluna `execution_mode`, nem qualquer vínculo a workflow.** `responsavel_nome`/`concluido_por` são texto livre — a própria migration documenta em comentário (linhas 12-14) que **o frontend não possui nenhum fluxo de autenticação hoje**.

Tabelas de apoio (mesmo arquivo): `contract_task_templates`, `contract_task_template_macrotasks`, `contract_task_template_tasks` (também sem `execution_mode`), `contract_task_plans` (um plano por `contract_key`, `UNIQUE`), `contract_task_macrotasks`.

### 5.2 `TaskExecutionMode` (INTERNA/EXTERNA/AUTOMATICA/CONFIRMACAO) — real no TypeScript, mas nunca persistido

Definido em `src/types/index.ts:561-565`, testado (`taskExecutionSemantics.test.ts`), com mapeamento de exibição em `ContractAttentionCenter.tsx:70-107`. **Confirmado que é decorativo**: `apply_contract_task_template_atomic` (o único caminho de inserção em `contract_tasks`) nunca grava esse campo (`supabase/migrations/20260922000014_rpc_contract_management.sql:622-623`), e `contractManagementService.ts` nunca o popula ao mapear linhas do banco de volta para `ContractTask`. Na prática, **em toda tarefa real aplicada via "Aplicar plano", `task.executionMode` é sempre `undefined`**, e o badge cai no branch padrão ("Providência Interna"), independentemente da natureza real da tarefa.

`executionMode` só existe de fato dentro de catálogos hardcoded em memória usados para os cards de workflow (preview), nunca nas tarefas reais: `contractAmendmentWorkflowService.ts`, `contractClosureWorkflowService.ts`, `contractRescissionWorkflowService.ts`, `contractProrrogationService.ts`, `paymentFollowUpTemplateService.ts`.

> **GAP de documentação confirmado**: `FASE_5_4_AUDITORIA_WORKFLOWS.md:115` afirma que as tarefas são gravadas "com... semântica de execução (TaskExecutionMode)". Isso é falso no código atual.

### 5.3 Ciclo de vida

- **Nascimento**: manual, exclusivamente via botão "Aplicar plano" → `apply_contract_task_template_atomic`. Nenhum motor cria tarefas automaticamente.
- **Prazo**: `prazo` (DATE) é editado manualmente, sem fórmula/trigger a partir de datas do contrato; templates não têm prazo-padrão nem offset.
- **Responsável**: `responsavel_nome`, texto livre, sem FK a nenhuma tabela de usuário.
- **Conclusão**: humano muda `status` para `CONCLUIDA` via `update_contract_task_atomic`, que auto-carimba `concluido_em`/`concluido_por`.
- **Alerta hoje**: apenas visual/passivo (cor por `nivelAtencao` na Central de Prazos e no Contrato 360) — nenhum envio real.

### 5.4 Terceiro sistema de "tarefas": Ciclo de Acompanhamento de Pagamento

Instancia um catálogo fixo de 5 macrotarefas / 11 tarefas na criação do ciclo (`paymentFollowUpTemplateService.ts`), mas **tudo vive em `localStorage`** (`useContractPaymentFollowUp.ts:28-54`), arquitetonicamente desconectado do sistema de tarefas em Postgres. Não compartilha tabela, RLS, auditoria nem visibilidade multiusuário com `contract_tasks`.

### 5.5 Tabela-resumo

| Tipo | Como nasce | Responsável | Quando vence | Como é concluído | Alerta hoje? | Execution mode persistido? |
|---|---|---|---|---|---|---|
| Tarefa de Plano de Gestão (`contract_tasks`) | Manual — "Aplicar plano" | texto livre, sem FK | `prazo` editado manualmente, sem cálculo automático | humano muda status | Visual/passivo | **Não** |
| Ciclo de Acompanhamento de Pagamento | Manual, template instanciado automaticamente na 1ª criação | não persistido em servidor | calculado via dias úteis | humano atualiza status | Visual (`derivePaymentCycleAlerts`) | Sim, mas **isolado por navegador** |

---

## 6. Workflows existentes

**Achado estrutural**: os workflows de Prorrogação, Alteração/Apostilamento, Encerramento e Rescisão/Extinção **não são entidades persistidas** — são projeções client-side puras (`useContractWorkflows.ts`, 715 linhas, `useMemo`, zero mutations, zero chamadas Supabase). Confirmado por grep: nenhum `supabase`/`localStorage` em `contractProrrogationService.ts`, `contractAmendmentWorkflowService.ts`, `contractClosureWorkflowService.ts`, `contractRescissionWorkflowService.ts`.

| Workflow | Como nasce | Persistência própria |
|---|---|---|
| Prorrogação | Híbrido: card aparece automaticamente por elegibilidade de data (`diasRestantesVigencia<=180 && >=-30`); tarefas reais só existem se humano aplicou template | Não — só o plano de tarefas subjacente (se aplicado) |
| Alteração/Apostilamento | Card só aparece se um template de alteração já foi aplicado manualmente | Não |
| Encerramento | Automático quando `statusVigencia === 'Expirado'` | Não |
| Rescisão/Extinção | Manual — só aparece se `tpl-rescisao-padrao-14133` foi aplicado | Não |

Nenhum workflow tem seu `contract_tasks` criado por job em background, trigger de banco ou engine — confirmado por grep (`pg_cron`/`cron.schedule`: zero hits; `INSERT INTO public.contract_tasks` fora da única RPC: zero hits). O **checklist de prontidão de prorrogação** (`evaluateProrrogationReadiness`) é chamado sem dados reais (`useContractWorkflows.ts:128-131` não passa `overrideData`/`events`), portanto sempre mostra o checklist "tudo pendente" em produção — está testado isoladamente, mas desconectado da experiência real.

---

## 7. Matriz completa de automação

| Evento/Condição | Fonte | Regra existente | Detecção | Alerta | Tarefa | Workflow | Persistente | Notificação | Responsável determinável hoje? |
|---|---|---|---|---|---|---|---|---|---|
| Vencimento de contrato (D-60 remessa jurídica) | `dataVigenciaFim` | Sim (`temporalEngineService`) | Sim | Sim (funil) | Não (nasce só se humano aplicar plano) | Card automático | Não | Não | Não (texto livre) |
| Janela de prorrogação de contrato (D-180) | idem | Sim | Sim | Sim | Idem | Card automático | Não | Não | Não |
| Aniversário de reajuste/repactuação | Eventos oficiais + data-base hierárquica | Sim | Sim | Sim (só no funil, não na Central de Prazos) | Não | Não | Não | Não | Não |
| Tarefa contratual atrasada/vence hoje/próxima | `contract_tasks` (Postgres) | Sim | Sim | Sim | **Já existe** (é o próprio fato) | N/A | **Sim** (a tarefa em si) | Não | Não (`responsavel_nome` texto livre) |
| Vigência de Ata (D-90/D-180) | `atas_registro_preco` | Sim | Sim | Sim | Não | Card automático | Não | Não | Não |
| Saldo físico de item de Ata ≥85% | view `v_arp_item_saldo_detalhado` | Sim (triplicada) | Sim | Sim (com duplicação potencial) | Não | Não | Não | Não | Não |
| Fatura vencida / vencimento iminente | `PaymentFollowUpCycle` (**localStorage**) | Sim | Sim, mas só no navegador de quem preencheu | Sim, mas invisível a terceiros | Sim (checklist do ciclo, mesmo problema) | Não | **Não — nem no banco** | Não | Não |
| CGOFI sem resposta >5 dias úteis | idem | Sim | idem | Sim | idem | Não | Não | Não | Não |
| Prontidão de prorrogação (checklist Art. 84) | Campos manuais nunca capturados | Sim (função), mas sem dado real | **Não, efetivamente** (sempre "tudo pendente") | Não | Não | Card mostra estado fixo | Não | Não | Não |
| Prontidão de prorrogação de Ata | `ataEventService.evaluateAtaProrrogationReadiness` | Sim, mas **órfão** | Não (zero consumidores) | Não | Não | Não | Não | Não | Não |
| Conflitos de reconciliação de empenho (fontes divergentes) | `empenhoReconciliationService` | Sim | Sim (calculado) | **Não exposto** | Não | Não | Não | Não | Não |
| Alocação interna excede quantitativo | `ItemBalances.tsx` (client-side) | Sim, só na UI | Sim, só na UI | Não | Não | Não | Não (RPC não reforça) | Não | Não |
| Contrato exige ≥1 empenho vinculado (RN-07) | RPC `save_manual_contract_atomic` | **Sim, em 3 camadas** | Sim | N/A (é bloqueio, não alerta) | N/A | N/A | **Sim, Postgres** | N/A | N/A — é o padrão-referência de regra bem blindada |

---

## 8. Responsáveis

**GAP transversal e crítico**: não há hoje, em nenhuma tabela do sistema, uma coluna que ligue um contrato/tarefa a uma conta real de `auth.users`. Confirmado:

- `contract_managers.gestor_nome` — `VARCHAR(150) NOT NULL`, sem FK (`supabase/migrations/20260922000013_contract_management_schema.sql:18-26`).
- `contract_tasks.responsavel_nome`/`concluido_por` — mesma situação.
- A própria migration documenta que **o frontend não tem nenhum fluxo de autenticação de usuário final hoje** (o RBAC existe para papéis administrativos do sistema, não para "quem é o fiscal do contrato X").
- `getContractManagementKey()` gera a chave canônica de contrato (`contract_key`), mas essa chave não resolve identidade de usuário.

**Consequência prática**: qualquer notificação dirigida ("avisar o gestor do contrato X") não tem hoje como resolver "gestor do contrato X" para um e-mail/conta verificada — precisaria de correspondência frágil por nome de texto, como já ocorre de forma limitada em `userService.ts:112`.

**Perfis existentes que podem ser reaproveitados** (não criar novos): `coordenador`/`gestor`/`consulta` (camada UI, `src/types/user.ts`) mapeados para `admin`/`gestor`/`leitor` na tabela real `public.user_roles`. Esses papéis servem para **autorização de sistema**, não para **atribuição de responsabilidade operacional por contrato** — são conceitos diferentes que a Fase 10 não deve confundir.

**Onde o responsável NÃO pode ser determinado de forma confiável hoje → GAP explícito**:
- Responsável por tarefa individual.
- Gestor/fiscal de contrato (como conta de login).
- Destinatário institucional de uma notificação de CGOFI/Ata.

---

## 9. Canais de notificação

| Canal | Status | Evidência |
|---|---|---|
| E-mail transacional de negócio (Resend/SendGrid/SMTP próprio/Nodemailer) | **NÃO IMPLEMENTADO** | Zero ocorrências em `src/`, `supabase/`, `package.json` (dependências: apenas `@supabase/supabase-js`, `@tanstack/react-query`, `exceljs`, `lucide-react`, `react`, `react-dom`, `react-router-dom`) |
| E-mail via Supabase Auth (convite de conta) | **IMPLEMENTADO, mas só onboarding, não alerta de negócio** | `supabase/functions/invite-user/index.ts:98-107` (`inviteUserByEmail`) |
| E-mail via Supabase Auth (redefinição de senha) | **IMPLEMENTADO, mesmo escopo (conta)** | `src/services/userService.ts:335-345` |
| WhatsApp (Twilio, Meta Business API, Evolution API) | **NÃO IMPLEMENTADO** | Zero ocorrências em todo o repositório |
| Web Push | **NÃO IMPLEMENTADO** | Nenhum service worker de push |
| Supabase Realtime (canais push in-app) | **NÃO IMPLEMENTADO** | Zero ocorrências de `.channel(` |
| Central de Atenção (feed interno) | **IMPLEMENTADO como alerta efêmero, NÃO como notificação** | Ver Seção 4 — é computado em leitura, não é "entregue" a ninguém |

Não há divergência entre os documentos de planejamento e o código quanto a este ponto: `FASE_9_A_AUDITORIA_PLANEJAMENTO_AUTOMACAO.md` já classificava corretamente WhatsApp/e-mail de negócio/push como "INEXISTENTE" — este é um dos poucos pontos em que a documentação prévia já estava precisa.

---

## 10. Frequência (conceitual, por candidato)

| Candidato | Frequência conceitual sugerida |
|---|---|
| Vencimento/prorrogação de contrato e Ata | Diária (varredura batch, já que os gatilhos são por data corrida) |
| Reajuste/repactuação | Diária (aniversário anual, mas verificação diária é barata e simples) |
| Saldo físico de Ata ≥85% | Após mudança de estado (evento de novo empenho vinculado) — mais preciso que polling diário |
| Fatura vencida/CGOFI sem resposta | Diária (dias úteis) — mas **bloqueada** até existir persistência em BD (ver §16.2) |
| Tarefa atrasada/vence hoje | Diária |
| Conflito de reconciliação de empenho | Imediata por evento (no momento da sincronização) |
| Alocação excede quantitativo | Imediata por evento (no momento da tentativa de gravação) — deveria ser bloqueio, não alerta |

Nenhum cron deve ser criado nesta fase — a tabela acima é insumo conceitual para 10-B/10-C.

---

## 11. Idempotência (conceitual)

Boa notícia: **o sistema já usa chaves determinísticas em vários motores**, um padrão pronto para reaproveitar em uma futura tabela de notificações:

- `generateIdempotentItemId()` (`centralPrazosService.ts:38-47`): `{tipoEntidade}::{idEntidade}::{eventoId}::{regraId}::{cicloRef}`
- `ALERT::ANIVERSARIO_REAJUSTE::{contractKey}::ANO_{ciclo}` (radar de reajuste)
- `ATT-PGTO-{cycleKey|contractKey}-{competencia}`, `ATT-REAJUSTE-{contractKey}-{ciclo}`, `ATT-ARP-ITEM-{itemKey}` (agregador)

Candidato de chave para automação futura, generalizando o padrão já existente: **`CONTRATO/ATA + TIPO_EVENTO + MARCO_TEMPORAL`** (ou `+ COMPETENCIA` para pagamentos). Isso é suficiente para deduplicar notificação, tarefa e alerta — mas hoje **nenhuma dessas chaves é persistida**; elas só existem para deduplicar itens dentro de uma única renderização (`Set<string>` em memória, descartado a cada fetch).

---

## 12. Alertas efêmeros vs. 13. Notificações persistentes

| Conceito | Situação hoje |
|---|---|
| **Alerta efêmero** (calculado pelo motor, exibido na Central de Atenção) | É o único conceito que existe hoje, em 100% dos casos. Nada é persistido. |
| **Notificação** (entrega dirigida a um destinatário, com controle de envio/leitura) | **Não existe absolutamente nenhuma implementação.** Não há tabela, não há canal, não há destinatário resolvível. |

Recomendação explícita para 10-B: **não transformar a Central de Atenção em banco de notificações** e **não persistir todos os alertas indiscriminadamente** — como o próprio escopo desta fase exige. A introdução de uma tabela de notificações deve ser desenhada como camada nova e deliberadamente seletiva (poucos tipos de evento, alto determinismo), não como "salvar tudo que hoje é efêmero".

---

## 14. Situações que NÃO devem ser automatizadas

| Situação | Motivo | Informação possível | Decisão humana |
|---|---|---|---|
| Decisão de prorrogar contrato/Ata | Julgamento administrativo (vantajosidade, interesse público) | Lembrar prazo, mostrar checklist de requisitos (Art. 84/57) | Sim, sempre |
| Decisão de reajustar/repactuar | Depende de análise de índice, negociação, parecer | Lembrar aniversário, calcular data-base | Sim |
| Decisão de repactuação por CCT/dissídio | Classificação de evento hoje é heurística de texto, não confiável para decisão automática | Sinalizar candidato a revisão | Sim |
| Aprovação de pagamento / confirmação de OB | Exige fonte oficial (CGOFI/SIAFI), não deve ser inferida | Lembrar prazo, alertar atraso | Sim |
| Alteração de valor oficial de contrato/empenho | Só pode vir de fonte oficial (Compras.gov/Contratos.gov/PNCP) — `financialExecutionService` já impõe isso por design | Mostrar saldo calculado | Sim |
| Reequilíbrio econômico-financeiro | Decisão jurídica/administrativa complexa | Alertar prazo/elegibilidade | Sim |
| Julgamento sobre regularidade fiscal (SICAF) | Fonte externa, não determinística no sistema | Exibir status coletado | Sim |
| Remanejamento de saldo entre unidades | Envolve negociação institucional | Alertar estagnação (quando existir) | Sim |
| Encerramento formal do contrato | Requer confirmação de pendências (TRD, garantia, fiscal) | Checklist de prontidão | Sim |

O CGLIC-system pode **lembrar, alertar, organizar, encaminhar, registrar acompanhamento** — nunca tomar a decisão administrativa.

---

## 15. Dependências (para qualquer automação real)

1. Unificação das 6 taxonomias de severidade em uma só (pré-requisito transversal).
2. Persistência em Postgres do ciclo de pagamento (hoje 100% localStorage) — pré-requisito específico do domínio de pagamentos/CGOFI.
3. Coluna/estratégia de identidade real (`responsavel_id`/`gestor_user_id` com FK a `auth.users`) — pré-requisito para qualquer notificação dirigida.
4. Definição de RLS por contrato/unidade (hoje é `USING (true)` na maioria das tabelas) — pré-requisito de segurança antes de expor dados por notificação.
5. Escolha de canal de notificação (e-mail é o mais barato de habilitar via Supabase, mas exige config de domínio/provedor fora deste repo).
6. Dedup key persistida (tabela própria), reaproveitando o padrão já usado em memória.

---

## 16. GAPs (consolidado)

1. **Checklist de prontidão de prorrogação nunca é alimentado por dados reais** — `useContractWorkflows.ts:128-131` não passa `overrideData`/`events`; o card sempre mostra "tudo pendente". Testado isoladamente, desconectado em produção.
2. **Barreira arquitetural nº1: ciclos de pagamento/fatura/CGOFI vivem exclusivamente em `localStorage`** — zero tabela no Postgres (`fatura`, `pagamento`, `cgofi`: zero ocorrências em 21 migrations). Nenhum backend consegue hoje ler ou agir sobre esses dados.
3. **Regra de saldo crítico de Ata (≥85%) duplicada em 3 lugares de serviço + 1 na UI**, todos com o número mágico hardcoded, sem constante compartilhada — risco de duplicação de alerta (já ocorre: `SALDO_CRITICO` do Central de Prazos vs. filtro direto de `arpItems` no agregador geram dois IDs distintos para o mesmo item).
4. **Vigência de Ata (D-90) reimplementada com `new Date()` cru em 3 componentes de UI** (`ArpSearch.tsx`, `AtaCardHeader.tsx`, `InternalAllocationsDashboard.tsx`), fora do motor oficial `temporalEngineService` — pode divergir sutilmente (fuso, bissexto) da Central de Prazos.
5. **`ataEventService.ts` — motor mais sofisticado do domínio Ata (classificação de eventos + prontidão de prorrogação, com base legal) está 100% órfão** — zero consumidores fora dos testes.
6. **Limite de alocação interna só é reforçado no client-side** (`ItemBalances.tsx`); a RPC `save_allocations_atomic` não valida soma ≤ quantitativo homologado — pode ser contornado por chamada direta.
7. **Sem identidade real** — `gestor_nome`/`responsavel_nome`/`concluido_por` são texto livre; não há fluxo de autenticação de usuário final no frontend.
8. **RLS praticamente sem escopo por contrato/unidade** — leitura pública (`USING(true)`) na maioria das tabelas de negócio; o conceito de "gestor só vê contratos atribuídos" é convenção de UI, não imposição de banco.
9. **Sem tabela de preferências de notificação** — nenhuma coluna/tabela de opt-in/opt-out existe.
10. **`TaskExecutionMode` nunca persistido** — coluna não existe em `contract_tasks`; qualquer automação que planeje decidir "modo de execução" a partir do banco encontrará sempre `undefined`.
11. **Divergência entre Central de Prazos e Atenção Agora**: a primeira não inclui o radar de reajuste; a segunda inclui. As duas telas mostram conjuntos de sinais diferentes para o mesmo contrato.
12. **Conflitos de reconciliação de empenho calculados mas nunca expostos como alerta.**
13. **`burnRateMensalDisponivel: false`** — o próprio código já se autodocumenta como GAP futuro (Fase 8-F) em `dashboardService.ts:594`.
14. **Doc `FASE_5_4_AUDITORIA_WORKFLOWS.md:115`** afirma persistência de `TaskExecutionMode` — contradito pelo código atual (ver item 10).
15. **Classificação de eventos contratuais/Ata por *string matching*** em texto livre de fontes oficiais — frágil, risco de falso positivo/negativo em qualquer automação que dependa dela.

Pontos onde a documentação de planejamento já estava correta (não são GAPs, é bom registrar): `FASE_9_A_AUDITORIA_PLANEJAMENTO_AUTOMACAO.md` (canais inexistentes), `FASE_9_E_CENTRAL_ATENCAO.md`/`FASE_8_D_ATENCAO_AGORA.md` (camada de leitura pura, 0 tabelas novas), `FASE_8_G_SALDOS_ARP.md` (badge de saldo crítico ≥85% realmente entregue), `PLANO_GESTAO_ATA_LEI14133_CONSOLIDADO.md` (já identificava corretamente o gatilho D-180 de Ata sem checar saldo, e a falta de "espelho" do `ataEventService` em produção).

---

## 17. Candidatos à implementação

**PRONTA PARA IMPLEMENTAÇÃO** (regra determinística já existe, dado disponível em Postgres, falta só agendamento/entrega):
- Vencimento/janela de prorrogação de contrato (D-180/D-60) — dado em Postgres via API oficial, regra centralizada em `temporalEngineService`.
- Aniversário de reajuste/repactuação — regra determinística, dado já reconstruído de aditivos oficiais.
- Tarefa contratual atrasada/vence hoje — a única entidade 100% persistida em Postgres desde já (`contract_tasks`).
- Saldo físico de Ata ≥85% — dado em view SQL, regra simples (mas exige antes deduplicar as 3 implementações, item 16.3).

**DEPENDE DE DEFINIÇÃO** (regra existe mas precisa de decisão de produto/negócio antes de automatizar):
- Checklist de prontidão de prorrogação (contratual e de Ata) — precisa decidir ONDE e COMO capturar os campos reais (hoje não há UI de escrita).
- Conflitos de reconciliação de empenho — precisa decidir se vira alerta e para quem.
- Alocação interna crítica — precisa definir se existe farol (%) análogo ao de Ata.

**DEPENDE DE INFRAESTRUTURA** (regra pronta, mas falta persistência/identidade/canal):
- Todo o domínio de pagamentos/CGOFI — precisa migrar de localStorage para Postgres antes de qualquer automação.
- Qualquer notificação dirigida a "responsável" — precisa de FK de identidade real.
- Qualquer envio de e-mail/WhatsApp — precisa de canal implementado (hoje zero).

**NÃO AUTOMATIZAR** — ver Seção 14 (decisões administrativas/jurídicas).

---

## 18. Arquitetura proposta (conceitual, para 10-B)

Reaproveitar, sem criar segunda fonte de verdade:
- `temporalEngineService` como único motor de cálculo de datas (todas as reimplementações ad-hoc em componentes — §16.4 — devem migrar para ele, não o contrário).
- `contract_tasks`/`contract_task_plans` como único sistema de tarefas (não criar um segundo — o ciclo de pagamento deveria, no futuro, também gerar linhas aqui, não em localStorage).
- `dashboardService.calculateAttentionSummary` como único agregador de atenção (a Central de Prazos e o Contrato 360 deveriam consumir o mesmo resultado, não recalcular).
- A chave idempotente já usada (`generateIdempotentItemId` / `ALERT::.../ATT-...`) como base do padrão de deduplicação de uma futura tabela de notificação.

Se qualquer entrega de 10-B exigir um segundo motor temporal, um segundo sistema de tarefas, um segundo sistema de alertas ou uma segunda fonte de verdade para saldo/vigência → **GAP ARQUITETURAL**, e não deve ser construído.

---

## 19. Segurança

- RBAC de sistema (`admin`/`gestor`/`leitor` via `has_role()`) está implementado e é a única camada real de controle de escrita.
- **RLS de leitura é, hoje, essencialmente pública** para usuários autenticados (`USING(true)`) em quase todas as tabelas de negócio (`atas_registro_preco`, `itens_ata`, `contract_managers`, `contract_task_plans/tasks`, `empenhos`, etc.) — nenhuma notificação deveria ser desenhada assumindo isolamento por contrato/unidade no banco, porque ele não existe.
- Nenhuma alteração de RLS deve ser feita nesta fase — apenas registrar que 10-G (destinatários/preferências) **não pode assumir** que "gestor só vê seus contratos" é garantido pelo banco.
- Nenhum dado de processo SEI teve controle de acesso diferenciado identificado além do RBAC de papel.

---

## 20. Observabilidade

Nenhuma infraestrutura de log/observabilidade de automação existe hoje (nem poderia, já que não há automação). Documentar como necessidade futura (não implementar agora): qualquer execução futura de automação precisará registrar, no mínimo — execução, sucesso/erro, destinatário, timestamp, chave de idempotência, motivo, origem do evento. Isso é responsabilidade de 10-B (arquitetura) e 10-H (homologação), não desta fase.

---

## 21. Roadmap da Fase 10

A ordem abaixo é baseada exclusivamente nas evidências desta auditoria — não assume que todas as subfases originalmente cogitadas sejam necessárias na forma proposta.

1. **10-B0 (novo, pré-requisito) — Fundação**: unificar as 6 taxonomias de severidade em uma só; decidir a estratégia de identidade (`responsavel_id`) para contratos/tarefas; decidir se/como migrar o ciclo de pagamento de localStorage para Postgres. Sem isso, qualquer notificação central herda a fragmentação hoje existente.
2. **10-B — Arquitetura do mecanismo de notificações**: desenhar a tabela de notificação (dirigida, com controle de envio/leitura) reaproveitando a chave idempotente já usada em memória; escolher canal inicial (e-mail via Supabase é o mais barato).
3. **10-C — Automação de prazos contratuais/Ata**: domínio mais maduro hoje (regra centralizada, dado em Postgres) — candidato a ir primeiro.
4. **10-D — Automação de pagamentos/CGOFI**: **bloqueada** até resolver a persistência (10-B0). Não deve ser sequenciada antes disso.
5. **10-E — Automação contratual (reajuste/repactuação/prorrogação)**: depende de resolver a captura real dos campos do checklist de prontidão (hoje sempre vazio) e de tornar a classificação de eventos menos dependente de string matching.
6. **10-F — Automação de Atas/Saldos**: depende de deduplicar as 3 implementações do threshold de 85% e decidir se conecta `ataEventService` (hoje órfão) ao pipeline real.
7. **10-G — Destinatários e preferências**: depende diretamente de 10-B0 (identidade) e da decisão sobre RLS por contrato — hoje inviável de forma segura.
8. **10-H — Homologação completa da automação**: ao final, cobrindo observabilidade e idempotência de ponta a ponta.

---

## 22. Conclusão

A auditoria confirma, com evidência de código, que o CGLIC-system tem hoje um conjunto de motores de detecção deterministas e bem desenhados (especialmente para prazos contratuais e de Ata), mas que **toda a cadeia para na etapa de "Alerta Efêmero"**. Não existe nenhuma automação, cron, webhook ou canal de notificação de negócio implementado em lugar nenhum do repositório. Além disso, a auditoria revelou três blocos de risco estrutural que os documentos de planejamento anteriores não haviam capturado com este nível de detalhe: (1) fragmentação em seis taxonomias de severidade não sincronizadas, (2) persistência do domínio de pagamentos inteiramente em `localStorage` (invisível a qualquer backend), e (3) ausência total de uma FK de identidade que ligue "responsável por contrato/tarefa" a uma conta de usuário real.

Todos os itens exigidos pelo critério de saída da Fase 10-A foram entregues: inventário de motores, inventário de alertas, inventário de tarefas, inventário de workflows, matriz de automação, responsáveis identificados (e o GAP de identidade documentado), canais identificados, frequências conceituais, idempotência conceitual, separação alerta/tarefa/workflow/notificação, lista explícita do que não deve ser automatizado, GAPs documentados, e roadmap das próximas subfases.

**Veredito: FASE 10-A — HOLD.**

A auditoria em si está completa e o roadmap pode ser considerado aprovado na sua sequência lógica, mas **não se deve avançar diretamente para uma 10-B de escopo total** sem antes resolver os três blocos estruturais acima (item 10-B0 do roadmap) — em especial, qualquer automação de pagamentos/CGOFI (10-D) seria construída sobre dados que hoje simplesmente não existem no servidor. A trilha de prazos contratuais/Ata (10-C) é a que está estruturalmente mais próxima de suportar automação real, mas mesmo ela se beneficia da unificação de taxonomia antes de qualquer notificação central ser construída sobre ela.

Aguardando autorização para prosseguir.
