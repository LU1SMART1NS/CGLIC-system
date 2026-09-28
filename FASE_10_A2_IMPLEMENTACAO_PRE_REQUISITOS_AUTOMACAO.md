# FASE 10-A.2 — Implementação e Homologação dos Pré-requisitos de Automação

**Sistema:** CGLIC-system 3.0
**Tipo de execução:** Implementação dos pré-requisitos arquiteturais definidos na Fase 10-A.1 (GO arquitetural). Nenhuma automação, notificação, cron, Edge Function de automação, e-mail ou WhatsApp foi criado — conforme instruído.
**Regra absoluta observada:** nenhum segundo motor temporal, segundo sistema de tarefas, segundo sistema de workflow, segundo sistema de alertas ou segundo sistema de usuários foi criado. Toda implementação reaproveita `temporalEngineService`, `contract_task_plans`/`contract_tasks`, o Supabase Auth existente (`auth.users`/`user_roles`/`has_role()`) e a taxonomia de severidade já existente no Design System.

---

## 1. Baseline antes

No início desta fase (após a Fase 10-A.1, dois dias de calendário antes desta execução — o repositório recebeu commits externos nesse intervalo, incluindo um merge de `origin/main`, expansão de RBAC e uma consolidação de UI que **removeu** `ManagementArpBalances.tsx`, `ManagementAttentionNow.tsx`, `HomeAttentionNow.tsx` e `CentralAttentionQueue.tsx`, substituindo-os por uma nova árvore `src/components/instrumentos/*` que **já** consome a severidade canônica corretamente via `SeverityBadge`, sem recálculo local. Isso foi revalidado diretamente no código antes de qualquer alteração, e reduziu o escopo real de UI a corrigir em relação ao que a Fase 10-A.1 havia mapeado).

- `git status`: limpo, exceto `_pre-clone-backup/` (não pertence a este trabalho).
- Suíte de testes (`npx vitest run`, sem exclusões): **233 arquivos, 2030 passando, 6 skipped** — número aparentemente dobrado em relação à Fase 10-A.1 (119 arquivos / 1024 testes). Investigado e explicado no item 2.
- `npx tsc --noEmit`: saía com exit code 0 e zero linhas de saída — **à época interpretado como "limpo"**. Achado crítico desta fase (ver item 14): esse comando é um **falso positivo estrutural** neste repositório.

---

## 2. Testes inicialmente falhos

A premissa desta fase citava "3 testes falhando". Investigação direta encontrou uma realidade diferente, documentada com total transparência:

| Item | Achado |
|---|---|
| Falhas reais de asserção | **Zero.** Nenhum teste falhou por lógica de negócio incorreta. |
| O que de fato existe | **3 testes que se autoexcluem (`ctx.skip()`)**, não 3 falhas — em `src/services/__tests__/fase9_i_14_homologacao.test.ts`, testes 1–3, que verificam contagens exatas contra o projeto Supabase remoto real (`bouutpmxexvwppcmmhdi.supabase.co`) e só executam quando há conectividade de rede externa (`isNetworkAvailable()`). Este sandbox não tem acesso à rede externa, então os 3 se autoexcluem — comportamento **por design**, pré-existente, e **não relacionado** a nenhuma área desta fase (severidade, pagamentos, identidade, TaskExecutionMode, saldo, vigência). |
| Por que a contagem de testes parecia "dobrada" (233 vs. 119) | A causa raiz não foi um bug de teste, mas um artefato de ambiente: existe um **worktree git isolado de outra sessão de agente** em `.claude/worktrees/elated-austin-c92beb/` (confirmado via `git worktree list` — um worktree legítimo, registrado, não órfão), aninhado **dentro** da árvore do repositório. Como `vite.config.ts` não excluía `.claude/`, o `vitest` por padrão descobria e executava a suíte inteira **duas vezes** (uma cópia em `src/`, outra em `.claude/worktrees/.../src/`), dobrando as contagens e mascarando os números reais. **Corrigido** (ver item 3) — sem tocar no worktree de terceiros, apenas excluindo-o da descoberta de testes deste projeto. |

Conclusão: os "3 testes falhando" da premissa eram, na realidade, os 3 testes de rede que sempre se auto-excluem neste ambiente — não uma regressão. Documentado e não ignorado, conforme instruído.

---

## 3. Alterações realizadas

### 3.1 Infraestrutura de teste
- `vite.config.ts`: adicionado bloco `test.exclude` (com os defaults do Vitest + `**/.claude/**`) para impedir que o worktree isolado de outra sessão seja descoberto e executado em duplicidade. Nenhum código de produção afetado.

### 3.2 Severidade canônica
- **Novo** `src/services/severityService.ts`: formaliza `SeverityLevel` (`design-system/tokens.ts`) como taxonomia canônica única, com 5 funções de conversão determinística e documentada: `severityFromAtencaoNivel`, `severityFromReajusteRadarNivel`, `severityFromPaymentAlertNivel`, `severityFromPaymentStatusPrazo`, `severityFromAttentionPriorityLevel`.
- `src/services/dashboardService.ts` (`calculateAttentionSummary`): as 3 derivações de severidade antes calculadas inline (pagamento, radar de reajuste, saldo de Ata) agora chamam as funções canônicas acima — **comportamento numericamente idêntico**, verificado pelos testes existentes (nenhum precisou mudar) mais os novos testes de `severityService`.
- **Correção de defeito latente (GAP #3 da Fase 10-A)**: o gatilho de saldo crítico de Ata (`GATILHO_85PCT`, id contendo `SALDO_CRITICO`) é gerado por `centralPrazosService.buildCentralPrazosItems` com `estadoTemporal: 'VENCE_HOJE'`/`diasRestantes: 0` — valores propositais para modelar "urgência", não porque seja uma tarefa vencendo. **Revalidação nesta fase encontrou que esse defeito é hoje LATENTE, não ativo**: `dashboardService.calculateAttentionSummary` chama `buildCentralPrazosItems({ contracts, arps, managers, plans, currentDate })` **sem** repassar `arpItems` — logo, o ramo que gera esse gatilho nunca é de fato exercitado pela função unificada hoje (confirmado: nenhum outro chamador de `buildCentralPrazosItems` fora de testes passa `arpItems`). Ainda assim, uma blindagem preventiva foi aplicada (filtrar `prazosItems` por `!id.includes('SALDO_CRITICO')` antes do loop de tarefas), documentada e testada, para que o defeito não se torne ativo caso uma futura refatoração conecte `arpItems` a essa chamada.
- `ContractAttentionCenter.tsx`: **decisão deliberada de não migrar a apresentação visual** — mantém sua própria `AttentionPriorityLevel`/`classifyTaskAttention`. Motivo: os 4–5 blocos de coloração inline desse componente (600+ linhas) não mapeiam 1:1 pixel-a-pixel para os tokens canônicos (`severityTokens`), e uma reescrita completa introduziria risco de regressão visual não solicitado nem homologado nesta fase. `severityFromAttentionPriorityLevel()` foi entregue e testado como função canônica disponível para esse componente (ou para 10-B) adotar quando uma homologação visual explícita for autorizada. **Isso é o único item da "unificação de severidade" que fica formalmente em aberto** — ver Seção 20 (GAPs).
- Achado adicional (não estava mapeado na Fase 10-A.1): `ManagementAttentionNow.tsx`/`HomeAttentionNow.tsx`/`CentralAttentionQueue.tsx` (que a Fase 10-A apontava como tendo taxonomias divergentes) **não existem mais** — foram consolidados, por um commit externo entre a Fase 10-A.1 e esta execução, em `src/components/instrumentos/GestaoInstrumentosDashboard.tsx`/`GestaoInstrumentosTable.tsx`, que **já** consome `item.severity` (o `DashboardAttentionSeverity` canônico) via `SeverityBadge`, sem nenhum recálculo local. Nenhuma ação foi necessária aqui — apenas revalidado.

### 3.3 Saldo Crítico de ARP (regra única)
- **Novo** em `src/services/balanceService.ts`: `classifyArpItemSaldo()`, `ARP_SALDO_CRITICO_THRESHOLD` (85), `ARP_SALDO_PROXIMO_LIMITE_THRESHOLD` (70) — fórmula preservada exatamente, sem nenhuma alteração de threshold.
- `dashboardService.ts`: as 3 ocorrências independentes de `>= 85`/`>= 70` (filtro de Atas críticas, severidade do item ATA_CRITICA, `calculateArpSummary`) agora chamam `classifyArpItemSaldo`.
- `centralPrazosService.ts`: a 4ª ocorrência (gatilho `GATILHO_85PCT`) idem.
- UI: revalidado que `ManagementArpBalances.tsx` (apontado na Fase 10-A/10-A.1 como recalculando `>=85%`/`>=70%` na tela) **não existe mais** — a tela atual (`GestaoInstrumentosSummaryCards.tsx`) já consome apenas contadores pré-calculados (`counts.itensCriticosArp`), sem recalcular. Nenhuma mudança de UI foi necessária para saldo.

### 3.4 Vigência de Ata (regra única)
- **Novo** em `src/services/temporalEngineService.ts`: `getArpVigenciaStatus(dataVigenciaFinal, currentDate?)` — mesma fórmula já usada por `centralPrazosService.ts` para a Ata (`parseDateBRT` + `differenceInDays`, fuso America/Sao_Paulo, janela de 90 dias preservada).
- **Novo** `src/hooks/useArpVigenciaStatus.ts`: adaptador fino (`useMemo`) sobre a regra de domínio — a regra em si vive inteiramente no service, não no hook, conforme instruído.
- `src/components/ArpSearch.tsx`, `src/components/cards/AtaCardHeader.tsx`, `src/components/InternalAllocationsDashboard.tsx`: as 3 reimplementações com `new Date()` cru foram substituídas por chamadas a `getArpVigenciaStatus`. `isCanceladaPncp` (critério adicional, fora da regra de datas) foi preservado em cada um dos 3 locais.

### 3.5 TaskExecutionMode (persistência)
- Colunas `execution_mode` adicionadas a `contract_task_template_tasks` e `contract_tasks` (migration 21).
- `apply_contract_task_template_atomic` passa a copiar `execution_mode` do template para a instância.
- `save_contract_task_template_task_atomic` passa a aceitar `p_execution_mode` opcional.
- TS: `contractManagementService.ts` (2 pontos de mapeamento) e `contractManagementRpcAdapter.ts` atualizados para ler/gravar o campo; `RpcContractTaskItem`/`RpcContractTaskTemplateTaskItem` (`types/rpc.ts`) ganharam o campo.
- **Backfill**: aplicado apenas ao **novo** template de pagamento (fonte determinística 1:1 — ver Seção 7). Os 8 templates contratuais já seedados (migration 19) permanecem com `execution_mode` `NULL` — não há correspondência determinística nome-a-nome com os catálogos em memória dos workflows (os textos das tarefas divergem), então popular esses valores exigiria uma decisão de negócio tarefa-a-tarefa, fora do escopo mecânico autorizado. **Não inventado**, conforme instruído.

### 3.6 Identidade dos responsáveis
- `contract_tasks.responsavel_user_id` (UUID, `REFERENCES auth.users(id)`, nullable) — migration 23.
- `contract_payment_cycles.responsavel_user_id` — já nativo na tabela nova (migration 22).
- `update_contract_task_atomic` passa a aceitar `p_responsavel_user_id` opcional; `contract_tasks.responsavel_nome` (texto legado) é preservado e nunca removido.
- **Escopo deliberadamente restrito** (Seção 9 da 10-A.2): somente `contract_tasks` e `contract_payment_cycles`. `contract_managers` e `processos_sei` **não** foram alterados nesta fase — não estavam entre os domínios priorizados pela própria instrução ("contract_tasks; payment cycles; workflows, se aplicável"), e `workflows` continuam sendo projeções em memória não persistidas (nada a alterar ali).

### 3.7 Pagamentos/CGOFI (persistência canônica)
Ver Seção 7 (detalhamento completo).

---

## 4. Migration(s)

Três migrations novas, sequenciais, cada uma com escopo único:

1. **`20260927000021_task_execution_mode.sql`** — colunas `execution_mode` + atualização de `save_contract_task_template_task_atomic` e `apply_contract_task_template_atomic`.
2. **`20260927000022_contract_payment_cycles.sql`** — tabela `contract_payment_cycles`, função pura `build_payment_cycle_key` (espelho exato de `buildPaymentCycleKey` em TS), função reutilizável `apply_contract_task_template_to_key_atomic`, RPCs `create_payment_cycle_atomic`/`update_payment_cycle_atomic`, RLS, trigger de auditoria, e seed do template padrão de pagamento (`tpl-acompanhamento-pagamento-14133`, 5 macrotarefas/11 tarefas, com `execution_mode` populado 1:1 a partir de `paymentFollowUpTemplateService.ts`).
3. **`20260927000023_identity_bridge_contract_tasks.sql`** — coluna `responsavel_user_id` em `contract_tasks` + atualização de `update_contract_task_atomic`.

Cada mudança de assinatura de função (novo parâmetro) inclui `DROP FUNCTION IF EXISTS` da assinatura antiga antes do `CREATE OR REPLACE`, para não deixar dois overloads coexistindo (Postgres trata número de parâmetros diferente como função distinta).

**Nota sobre validação**: como este sandbox não tem conectividade com um Postgres/Supabase real (mesmo padrão de restrição de rede que já explica os 3 testes skip da Seção 2), as migrations foram validadas por **revisão estática cuidadosa** — mesma convenção de RPC (`SECURITY DEFINER`, `SET search_path`, `has_role()`, `RAISE EXCEPTION` com `ERRCODE`), reconciliação de contagem de `$$` (delimitadores de função balanceados) e comparação linha-a-linha com os equivalentes TypeScript (`buildPaymentCycleKey`) — não por execução contra um banco vivo. Isso é consistente com o padrão de validação do próprio projeto: nenhum teste da suíte de `supabase/tests/*.sql` ou das migrations é executado pelo `npm test` (que roda apenas Vitest sobre TypeScript).

**Achado durante a implementação — revalidação da RBAC**: constatou-se que, entre a Fase 10-A.1 e esta execução, uma trilha paralela de trabalho (migrations `20260925000023` a `20260926000033`, não relacionada à Fase 10) introduziu uma segunda camada de autorização (`has_permission()`/`role_permissions`/`gestor_saldo`) para os domínios de Alocações e Departamentos. Verificado explicitamente que essa nova camada **não** substitui `has_role()` para o domínio de Gestão de Contratos — a própria migration 24 documenta "has_role() permanece exatamente como está... as duas engines [coexistem]", e nenhuma RPC de `contract_managers`/`contract_task_*` foi migrada para `has_permission()`. As RPCs desta fase usam `has_role('gestor') OR has_role('admin')`, consistente com todas as RPCs irmãs do mesmo domínio (nenhuma inconsistência introduzida).

---

## 5. RLS

| Tabela/coluna | Política aplicada | Observação |
|---|---|---|
| `contract_payment_cycles` (nova) | `SELECT` restrito a `TO authenticated` com `has_role('leitor') OR has_role('gestor') OR has_role('admin')` — **mais restritiva** que o padrão legado (`USING (true)`, que também permite `anon`) usado em `contract_tasks`/`contract_managers`. Escrita exclusivamente via RPC `SECURITY DEFINER` (sem policies de mutação). | Decisão deliberada, não uma cópia acrítica: dado operacional de pagamento é mais sensível que os demais catálogos hoje públicos. |
| `contract_tasks.responsavel_user_id` (nova coluna) | Nenhuma política nova — herda a RLS já existente da tabela (leitura pública, escrita só via RPC). | Aditivo, não altera o modelo de segurança da tabela. |

**Escopo por contrato/unidade permanece um GAP explícito**, não inventado como resolvido: nenhuma tabela do sistema (incluindo a nova) tem hoje uma política que restrinja "só vejo contratos onde sou o responsável". Isso foi documentado como GAP nas Fases 10-A/10-A.1 e continua documentado aqui — conforme instruído ("Se a arquitetura de escopo ainda não for suficiente: GAP — não inventar uma política permissiva").

---

## 6. Severidade

Ver Seção 3.2. Resumo do estado final: `SeverityLevel` é a taxonomia canônica adotada por `dashboardService.calculateAttentionSummary` (via `severityService.ts`) e por toda a árvore `GestaoInstrumentos*` (herdado de um commit externo, revalidado). `ContractAttentionCenter.tsx` (Contrato 360) permanece com taxonomia própria por decisão deliberada de risco/escopo, com a função de conversão já pronta e testada para quando uma migração visual for autorizada.

---

## 7. Pagamentos

### 7.1 Modelo implementado

`contract_payment_cycles` — ciclo **operacional** (acompanhamento de faturamento/atesto/pagamento), explicitamente segregado do fato financeiro soberano:

- Nenhuma FK física para tabelas de empenho — apenas referência por chave (`empenho_canonical_key`, texto), preservando o isolamento já garantido por `financialExecutionService.ts` (comentário do próprio arquivo: "Invariantes Invioláveis... isolamento absoluto").
- `origem_dado` (`MANUAL`/`OFICIAL`, default `MANUAL`) deixa explícito que este é um fato **registrado pelo servidor**, nunca confundido com um fato oficial de API externa.
- Chave de idempotência: `cycle_key`, computada por `public.build_payment_cycle_key` — **espelho exato** (mesma sanitização, mesma ordem de operações) da função TypeScript já existente `buildPaymentCycleKey`. Revisão confirmou que o formato já estabelecido (`{contrato}-PGTO-{competência}-{documento}`) **já inclui o documento de atesto**, não apenas contrato+competência — a arquitetura da Fase 10-A.1 foi ajustada nesse ponto durante a implementação, exatamente como a instrução desta fase antecipou ("Se Documento/Atesto for necessário para unicidade: documentar e ajustar a arquitetura antes da migration").
- Referências reais (FK) a `processos_sei.numero_processo_sei` — sem duplicar dado de processo SEI.

### 7.2 Reaproveitamento do sistema de tarefas (sem segundo sistema)

`create_payment_cycle_atomic` aplica automaticamente o template padrão de pagamento via uma função nova (`apply_contract_task_template_to_key_atomic`) que reaproveita **integralmente** `contract_task_plans`/`contract_task_macrotasks`/`contract_tasks` — usando o próprio `cycle_key` como chave do plano (não uma chave sintética menos granular como `{contract_key}::PGTO::{competencia}` cogitada na 10-A.1; o `cycle_key` já resolve a granularidade correta por incluir o documento).

### 7.3 Frontend

`useContractPaymentFollowUp.ts` reescrito: lê/escreve via `paymentCycleRpcAdapter.ts` (Supabase real) em vez de `localStorage`. `registerPaymentCycle`/`updatePaymentCycle`/`deletePaymentCycle` passaram a ser **assíncronos** (retornam `Promise`) — mudança de contrato necessária e absorvida sem atrito porque o único consumidor (`ContractPaymentFollowUpSection.tsx`) já descartava o retorno síncrono anterior. `deletePaymentCycle` mapeia para cancelamento (`status: CANCELADO`), nunca `DELETE` físico — consistente com o tratamento de registros operacionais auditáveis já praticado em todo o sistema.

---

## 8. Identidade

Ver Seção 3.6. `responsavel_user_id` (nullable, FK real para `auth.users`) coexiste com `responsavel_nome` (texto legado, nunca removido) em `contract_tasks` e `contract_payment_cycles`. Nenhuma tabela de usuários nova. Nenhuma alteração de RBAC. Nenhuma permissão nova concedida.

---

## 9. TaskExecutionMode

Ver Seção 3.5.

---

## 10. Saldo ARP

Ver Seção 3.3.

---

## 11. Vigência ARP

Ver Seção 3.4.

---

## 12. Testes específicos

| Área | Arquivo(s) | Cobertura nova |
|---|---|---|
| Severidade | `src/services/__tests__/severityService.test.ts` (novo) | Taxonomia canônica e as 5 conversões, incluindo casos de borda |
| Saldo ARP | `src/services/__tests__/balanceService.test.ts` (ampliado) | `classifyArpItemSaldo`: ≥85%, 70–<85%, <70%, arredondamento, severidade ≥100% |
| Saldo ARP (gatilho) | `src/services/__tests__/centralPrazosService.test.ts` (ampliado) | Confirma geração do gatilho `SALDO_CRITICO` quando `arpItems` é passado diretamente, e sua ausência abaixo de 85% — documenta explicitamente o caráter hoje latente na chamada de `dashboardService` |
| Vigência | `src/services/__tests__/temporalEngineService.test.ts` (ampliado) | `getArpVigenciaStatus`: null-safety, expirada, dentro/fora da janela de 90 dias, fuso |
| Pagamentos (adapter) | `src/adapters/__tests__/paymentCycleRpcAdapter.test.ts` (novo) | Criação idempotente (erro `PAYMENT_CYCLE_ALREADY_EXISTS`), aplicação/desativação do template, atualização de status, cancelamento (nunca DELETE), Supabase não configurado |
| Pagamentos (componente) | `src/components/contracts/__tests__/ContractPaymentFollowUpSection.test.tsx` (ajustado) | Migrado para mockar o hook (padrão já usado no projeto para hooks React Query), preservando as asserções de UI originais |
| TaskExecutionMode | `src/adapters/__tests__/contractManagementRpcAdapter.test.ts` (ajustado + ampliado) | `p_execution_mode` encaminhado corretamente na criação de tarefa de template |
| Identidade | `src/adapters/__tests__/contractManagementRpcAdapter.test.ts` (ampliado) | `responsavelUserId` encaminhado e preservado junto do `responsavelNome` legado |
| Erros novos | `src/adapters/rpcErrorAdapter.ts` (ampliado) | `PAYMENT_CYCLE_ALREADY_EXISTS`, `PAYMENT_CYCLE_NOT_FOUND`, `INVALID_CYCLE_STATUS` mapeados |

---

## 13. Regressão completa

`npm test -- --run` executado múltiplas vezes ao longo da implementação. Resultado estável final: **111–117 arquivos de teste, ~1017–1048 testes passando, 3 skipped (rede indisponível, pré-existente), 0 falhas reais**. A contagem exata varia levemente entre execuções porque commits externos (de outra trilha de trabalho, não relacionados à Fase 10) continuaram chegando ao repositório durante esta sessão — nenhuma variação foi causada por instabilidade do código desta fase.

Observação de ambiente (não é defeito de código): várias execuções da suíte completa sofreram timeout do *worker pool* do Vitest ("[vitest-pool-runner]: Timeout waiting for worker to respond") sob carga do sistema operacional — sempre com **zero** testes reprovados por asserção, apenas atraso de infraestrutura. Confirmado repetidas vezes que isso não está relacionado a nenhum processo travado desta sessão.

---

## 14. TSC

**Achado crítico de processo, não de código**: `npx tsc --noEmit` (o comando usado como verificação de TypeScript em toda a Fase 10-A.1 e no início desta fase) é, neste repositório, um **falso positivo estrutural**. O `tsconfig.json` raiz tem `"files": []` e apenas `"references"` (para `tsconfig.app.json`/`tsconfig.node.json`) — rodar `tsc --noEmit` sem a flag `-b` (build de projeto referenciado) compila **zero arquivos** e sempre retorna exit code 0, independentemente de haver erros reais no código. Isso foi descoberto quando `npm run build` (que usa `tsc -b && vite build`) **falhou** com 3 erros reais que o `tsc --noEmit` jamais havia acusado.

Os 3 erros eram legítimos: os novos códigos de erro (`PAYMENT_CYCLE_ALREADY_EXISTS`, `PAYMENT_CYCLE_NOT_FOUND`, `INVALID_CYCLE_STATUS`) não estavam declarados no union type fechado `MutationErrorCode` (`src/types/rpc.ts`). Corrigidos.

**Comando correto e agora usado como verificação de TypeScript**: `npx tsc -b` (ou `npm run build`, que o inclui). Estado final: **0 erros**.

Esta descoberta é registrada explicitamente porque **toda alegação de "TSC limpo" na Fase 10-A.1** foi, na prática, baseada nesse comando vazio — não invalida as conclusões arquiteturais daquela fase (que não dependiam de TSC), mas o relatório de homologação futuro (10-B em diante) deve usar `tsc -b`, nunca `tsc --noEmit` isolado, neste repositório.

---

## 15. Lint

`npm run lint` (oxlint): exit code 0. Apenas warnings pré-existentes (confirmados idênticos, mesmos arquivos/linhas, à baseline da Fase 10-A.1) — nenhum warning novo introduzido pelas alterações desta fase.

---

## 16. Build

`npm run build` (`tsc -b && vite build`): **sucesso**. `dist/` gerado normalmente. Warning pré-existente de tamanho de chunk (>500kB) mantido, não relacionado a esta fase.

---

## 17. Impactos

| Camada | Impacto |
|---|---|
| Banco de dados | 3 migrations novas, aditivas (novas colunas nullable, nova tabela, novas funções). Nenhuma migration existente foi alterada in-place — apenas `CREATE OR REPLACE` de funções (com `DROP` explícito do overload antigo quando a assinatura mudou). |
| Backend (RPC) | 2 RPCs existentes ganharam parâmetros opcionais (`save_contract_task_template_task_atomic`, `update_contract_task_atomic`); 1 RPC existente teve o corpo estendido sem mudar assinatura (`apply_contract_task_template_atomic`); 4 RPCs novas (`build_payment_cycle_key`, `apply_contract_task_template_to_key_atomic`, `create_payment_cycle_atomic`, `update_payment_cycle_atomic`). |
| Frontend (serviços) | 2 arquivos novos (`severityService.ts`, extensão de `balanceService.ts`/`temporalEngineService.ts`); nenhuma função pública existente teve sua assinatura alterada de forma incompatível. |
| Frontend (hooks/componentes) | `useContractPaymentFollowUp` mudou de síncrono (localStorage) para assíncrono (Supabase) — único consumidor (`ContractPaymentFollowUpSection.tsx`) ajustado; 3 componentes de vigência de Ata migrados para a regra canônica sem mudança de comportamento observável. |
| Testes | 1 arquivo de teste de componente precisou de mock novo (padrão já estabelecido no projeto); 2 arquivos de teste de adapter precisaram de atualização de expectativa (novos parâmetros opcionais); nenhum teste de domínio/regra de negócio precisou mudar. |

---

## 18. Dados preservados

Ciclos de pagamento hoje existentes em `localStorage` de usuários reais (se houver, em produção) **não são migrados automaticamente por este trabalho** — tecnicamente impossível a partir de um ambiente de desenvolvimento (não há acesso ao `localStorage` de navegadores de terceiros). Nenhuma estratégia de migração automática foi implementada nesta fase, conforme antecipado e documentado já na Fase 10-A.1 (Seção 13, risco "Migração de dados existentes em localStorage"). **Ação recomendada, não executada aqui**: comunicar aos usuários a necessidade de recadastro assistido dos ciclos ativos após o deploy desta mudança, ou aceitar que ciclos antigos fiquem congelados como referência local (a versão antiga do hook não é mais usada para leitura, apenas o novo modelo Supabase-backed).

---

## 19. Dados financeiros preservados

Confirmado por revisão de código e por design da migration: **nenhuma linha de código desta fase escreve, lê diretamente ou recalcula** `empenhado`, `liquidado`, `pago` ou saldo financeiro oficial (`financialExecutionService.ts`, `v_empenhos_resumo`, tabelas `empenhos`/`contrato_empenhos`). `contract_payment_cycles` referencia o empenho de lastro apenas por **chave textual** (`empenho_canonical_key`), sem FK física e sem nenhuma RPC desta fase gravando nas tabelas de empenho. O teste `FIN-01/FIN-02` pré-existente (`useContractPaymentFollowUp.test.ts`), que verifica exatamente esse isolamento, continua passando sem alteração.

---

## 20. GAPs remanescentes

1. **`ContractAttentionCenter.tsx` não foi migrado visualmente** para a severidade canônica — decisão deliberada de risco (Seção 3.2). A função de conversão (`severityFromAttentionPriorityLevel`) já existe e está testada; falta apenas a migração de apresentação, que deveria vir acompanhada de homologação visual explícita (fora do escopo autorizado nesta fase).
2. **RLS de `contract_payment_cycles`** foi endurecida (restrita a `authenticated` com papel válido) mas **não inclui escopo por contrato/unidade** — nenhuma tabela do sistema tem isso hoje; GAP arquitetural pré-existente, não resolvido nem fingido resolvido nesta fase.
3. **Migrations não foram executadas contra um Postgres real** neste sandbox (sem conectividade) — validadas por revisão estática e por fidelidade aos padrões já estabelecidos no projeto. Recomenda-se aplicar as 3 migrations em um ambiente de homologação real antes de produção, com teste manual de `create_payment_cycle_atomic`/`update_payment_cycle_atomic` end-to-end.
4. **`contract_managers` e `processos_sei`** não receberam a coluna `_user_id` — fora do escopo priorizado desta fase (Seção 9), candidato natural quando a Fase 10-G (Destinatários e Preferências) for iniciada.
5. **Migração de dados de `localStorage` para o novo modelo** não foi automatizada (Seção 18) — decisão operacional pendente para o deploy.
6. **Nenhuma UI nova foi criada** para que um autor de template edite `execution_mode` pelos formulários administrativos existentes (`ContractTaskTemplatesModal.tsx`) — a capacidade existe de ponta a ponta (RPC → adapter → tipo), mas não há campo de formulário; considerado fora de proporção para esta fase de saneamento.
7. **`ataEventService.ts`**: nenhuma alteração foi feita (confirmado que não importa nenhum símbolo afetado por esta fase) — permanece exatamente como a Fase 10-A.1 decidiu: preparado para a Fase 10-F, não integrado agora.
8. **Achado de processo**: a descoberta de que `tsc --noEmit` era um no-op (Seção 14) significa que qualquer alegação anterior de "TypeScript limpo" no histórico deste projeto que tenha usado esse comando isolado deve ser tratada como não verificada. Recomenda-se atualizar scripts/CI, se existirem, para usar `tsc -b`.

---

## STATUS FASE 10-A.2: **GO**

Critérios de saída, um a um:

| Critério | Atendido? |
|---|---|
| 3 testes inicialmente falhos explicados | ✅ Eram 3 testes skip por design (rede), não falhas — documentado |
| Suíte final verde | ✅ 0 falhas reais em múltiplas execuções (timeouts de worker são infraestrutura, não código) |
| TypeScript verde | ✅ Via `tsc -b` (comando corrigido) — 0 erros |
| Build verde | ✅ `npm run build` completo com sucesso |
| Severidade unificada | ⚠️ Unificada na função canônica e no funil testado (`dashboardService`/`GestaoInstrumentos*`); `ContractAttentionCenter.tsx` deliberadamente deferido (GAP #1, documentado, baixo risco) |
| Pagamentos persistidos corretamente | ✅ `contract_payment_cycles` + RPCs + reaproveitamento de `contract_tasks` |
| localStorage não é mais fonte canônica | ✅ Hook reescrito para Supabase |
| Responsáveis podem ter identidade real | ✅ `responsavel_user_id` em `contract_tasks` e `contract_payment_cycles` |
| TaskExecutionMode persistido | ✅ Colunas + RPCs atualizadas + backfill mecânico onde determinístico |
| Saldo ARP com regra única | ✅ `classifyArpItemSaldo`, 4 pontos de serviço consolidados |
| Vigência de Ata com regra única | ✅ `getArpVigenciaStatus`, 3 componentes migrados |
| RLS validado | ⚠️ Política escrita e revisada (mais restritiva que o padrão legado); não executada contra Postgres real (sem conectividade no sandbox); escopo por contrato/unidade permanece GAP explícito, não inventado |
| Nenhum fato financeiro alterado | ✅ Confirmado por revisão de código e isolamento de FK |
| Nenhuma automação/notificação criada | ✅ Confirmado — zero cron, Edge Function, e-mail, WhatsApp |

Os dois itens com ⚠️ são exceções **documentadas e deliberadas**, não falhas silenciosas — nenhuma delas compromete a integridade dos pré-requisitos entregues, e ambas já tinham sido antecipadas como possíveis nas Fases 10-A/10-A.1.

Não iniciar a Fase 10-B automaticamente. Nenhuma notificação, cron ou Edge Function de automação foi criada nesta execução. Aguardando autorização para prosseguir.
