# FASE 10-A.2.1 — Fechamento e Homologação das Pendências

**Sistema:** CGLIC-system 3.0
**Tipo de execução:** Fechamento das 3 pendências explicitamente documentadas ao final da Fase 10-A.2, mais uma pendência adicional descoberta durante este fechamento (Seção 6). Nenhuma automação, notificação, cron, Edge Function, e-mail, WhatsApp, scheduler, worker ou fila foi criada. A Fase 10-B não foi iniciada.

**Metodologia desta fase** (diferença central em relação às fases anteriores): sempre que possível, a validação deixou de ser apenas revisão estática de código e passou a ser **execução real** — um Postgres genuinamente provisionado, migrations genuinamente aplicadas, políticas de RLS genuinamente exercitadas por usuários simulados, RPCs genuinamente chamadas. Isso é detalhado na Seção 4 e produziu, inclusive, a descoberta e correção de um defeito real que a revisão estática não havia capturado (Seção 5.1).

---

## 1. Pendências encontradas

Revalidação das 3 pendências herdadas da Fase 10-A.2, mais 1 pendência nova descoberta nesta execução:

| # | Pendência | Origem | Status ao final desta fase |
|---|---|---|---|
| 1 | `tsc --noEmit` identificado como inadequado neste repositório | Fase 10-A.2 | **Fechada** — confirmado e documentado (Seção 2) |
| 2 | Severidade do Contrato 360 não migrada visualmente | Fase 10-A.2 | **Fechada** — migrado (Seção 3) |
| 3 | RLS de `contract_payment_cycles` não homologado contra Postgres real | Fase 10-A.2 | **Fechada** — homologado com testes reais A–H (Seção 4) |
| 4 | Visão consolidada do Dashboard Gerencial ainda lia `localStorage` para ciclos de pagamento, divergindo da visão por contrato já corrigida | **Descoberta nesta fase** (Seção 6) | **Fechada** — corrigida nesta execução |

---

## 2. TypeScript

### 2.1 Confirmação do comando oficial

`npx tsc -b` é o comando oficial de typecheck deste repositório — idêntico ao que `npm run build` executa (`tsc -b && vite build`).

### 2.2 Por que `tsc --noEmit` não validava o projeto

O `tsconfig.json` raiz tem:
```json
{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }
```
Sem a flag `-b` (modo de build de projetos referenciados), o TypeScript não sabe que deve descer para os projetos referenciados — ele vê `files: []` e **compila zero arquivos**, retornando exit code 0 independentemente de haver erros reais no código. Isso foi descoberto na Fase 10-A.2 quando `npm run build` falhou com 3 erros reais que `tsc --noEmit` jamais havia acusado (novos códigos de erro ausentes do union type `MutationErrorCode`).

### 2.3 Qual configuração efetivamente compila o código

`tsconfig.app.json` (todo o código de aplicação em `src/`) e `tsconfig.node.json` (configuração de build), ambos referenciados pelo `tsconfig.json` raiz e só efetivamente compilados quando invocados via `-b`.

### 2.4 Execução e resultado

```
npx tsc -b
```
**Resultado: 0 erros.** Executado repetidamente ao longo desta fase, após cada bloco de alterações (migração de severidade do Contrato 360, correção do bug de `v_uasg`, correção do GAP de localStorage do dashboard) — sempre limpo.

---

## 3. Contrato 360

### 3.1 Auditoria — todos os pontos onde severidade é calculada/convertida/exibida/comparada

Localizados 3 blocos em `src/components/contracts/ContractAttentionCenter.tsx` que calculavam severidade via ternários próprios, com cores hexadecimais hardcoded, independentes da taxonomia canônica:

1. **Card de Radar de Reajuste/Repactuação** (linhas ~256–388) — usava `computedReajusteAlert.nivel` (`ReajusteRadarPriorityLevel`) diretamente em 3 blocos de ternários repetidos (fundo do card, badge, cor do texto).
2. **Alertas de Acompanhamento de Pagamento** (linhas ~390–460) — usava `alert.nivel` (`PaymentAlertNivel`) via `isCritico`/`isAtencao`.
3. **Itens de Tarefa do Plano de Gestão** (linhas ~487–680) — usava `level` (`AttentionPriorityLevel`, de `classifyTaskAttention`) via um objeto `urgencyBadge` com cores/ícone próprios.

### 3.2 Migração realizada

Para os 3 blocos: a **regra de negócio permanece idêntica** (mesmos níveis, mesmos thresholds, mesma função `classifyTaskAttention`/`evaluateContractReajusteRadar`/`derivePaymentCycleAlerts` — nenhuma dessas foi tocada). Apenas a **representação visual** passou a ser derivada via `severityService.ts` (`severityFromReajusteRadarNivel`, `severityFromPaymentAlertNivel`, `severityFromAttentionPriorityLevel`) e renderizada com o componente canônico `SeverityBadge` (usando seu prop `customLabel` para preservar o texto específico de domínio — ex.: "Xd atrasada", "Urgente (20d)", "Marco Transcorrido" — que carrega informação além da severidade pura).

Ícones `AlertTriangle`/`AlertCircle`/`Clock`, antes usados manualmente em cada badge, foram removidos (agora vêm do próprio `SeverityBadge`, que já define seu ícone por severidade).

### 3.3 O que NÃO mudou

- `classifyTaskAttention()`, `evaluateContractReajusteRadar()`, `derivePaymentCycleAlerts()` —零 alteração.
- Ordenação das tarefas por prioridade — inalterada.
- Textos específicos de cada badge — preservados exatamente (verificado pelos testes existentes, que checam texto, não cor).

### 3.4 Testes

- Os 4 testes pré-existentes de `ContractAttentionCenterRadar.test.tsx` (que verificam textos como "Urgente (20d)", "Marco Transcorrido") **passaram sem nenhuma alteração** — confirmando que a regra de negócio não mudou.
- 3 novos testes adicionados, verificando explicitamente a presença do `data-testid="severity-badge-{severidade}"` canônico para os 3 blocos (reajuste URGENTE/PROXIMA/VENCIDA), mais 2 novos testes para alertas de pagamento (CRITICO/ATENCAO) e 1 novo teste para tarefa VENCIDA — total **7 testes**, todos passando.
- `ContractAttentionCenter.test.ts` (20 testes de `classifyTaskAttention`/`getExecutionModeDisplay`) — inalterado, todos passando.

### 3.5 Verificação visual em navegador

Tentada via `preview_start` — a aplicação exige login real (Supabase Auth, tela "ComprasSUSP... Acesso soberano protegido por Gov.br/Supabase Auth"). Sem credenciais reais disponíveis neste ambiente (e sem tentativa de contorná-las), a verificação visual ao vivo não foi possível. Mitigação: os testes de renderização estática (`renderToStaticMarkup`) verificam tanto o texto exato quanto o `data-testid` do componente canônico, o que garante que a estrutura e o conteúdo estão corretos mesmo sem captura de tela.

---

## 4. RLS

Esta foi a pendência mais crítica e recebeu o maior esforço de validação real desta fase.

### 4.1 Ambiente de teste provisionado

Constatado que o Docker Desktop do usuário está ativo, rodando um stack Supabase local **completo e não relacionado** (projeto "ASSIS-system", 12 dias no ar, portas 54321–54327) mais um gateway WhatsApp (Evolution API) — infraestrutura viva do usuário, **intocada** durante todo este trabalho.

Em vez de usar `supabase start` (que colidiria nas mesmas portas), foi provisionado um **container Postgres isolado, avulso**, reaproveitando a mesma imagem já em cache localmente (`public.ecr.aws/supabase/postgres:17.6.1.063`), em uma porta livre (55432), sem qualquer relação com os containers do usuário. Todas as 38 migrations do projeto (incluindo as 3 desta fase e as 6 novas de RBAC/permissões que chegaram por trabalho paralelo entre fases) foram aplicadas em sequência — **sucesso total, 0 erros** — prova independente e real de que o SQL é sintaticamente e semanticamente correto.

Papéis `anon`/`authenticated`/`service_role` foram recriados manualmente (o container avulso não roda o CLI de setup completo do Supabase) e os `GRANT`/`REVOKE` específicos de cada migration foram cuidadosamente restaurados para não maquiar o modelo real de permissões (um `GRANT` genérico inicial foi corrigido para não sobrescrever os `REVOKE ... FROM anon` que as próprias migrations definem).

Ao final, o container foi **completamente removido** (`docker stop && docker rm`) e nenhum arquivo temporário foi deixado no disco do usuário. Os 17 containers do usuário permaneceram rodando sem qualquer interferência (confirmado antes e depois).

### 4.2 Cenários testados (A–H), todos com usuários e dados reais

| Cenário | Execução | Resultado |
|---|---|---|
| A. Usuário autorizado (gestor) acessa ciclo permitido | `SELECT` como `gestor`, `SET request.jwt.claim.sub` + `SET ROLE authenticated` | ✅ 2 ciclos visíveis |
| B. Usuário não autorizado (autenticado, sem nenhum papel) não acessa | idem, usuário sem linha em `user_roles` | ✅ **0 linhas** retornadas |
| — Extra: `anon` (não autenticado) | `SET ROLE anon` | ✅ **0 linhas** retornadas |
| C. Usuário autorizado não deveria acessar dados fora do seu escopo | `leitor` (sem vínculo com nenhum dos 2 contratos de teste) lê os ciclos | ⚠️ **Vê ambos** — confirma ao vivo o GAP de escopo por contrato já documentado nas Fases 10-A/10-A.1/10-A.2 (não é uma falha desta implementação; é a ausência, em todo o sistema, de RLS por contrato/unidade — não inventada, apenas **confirmada empiricamente** nesta fase) |
| D. Criação | `create_payment_cycle_atomic` como `gestor` | ✅ Ciclo + plano de tarefas (11 tarefas/5 macrotarefas) criados atomicamente |
| E. Atualização | `update_payment_cycle_atomic` (envio CGOFI) como `gestor` | ✅ Status e campos atualizados |
| F. Conclusão | idem, status `CONCLUIDO` | ✅ `concluido_em`/`concluido_por` carimbados automaticamente só na transição |
| G. Leitura | `SELECT` como `leitor` | ✅ Todos os campos, incluindo `responsavel_user_id`, corretos |
| H1. Tentativa de escrita por `leitor` | `update_payment_cycle_atomic` como `leitor` | ✅ Bloqueado: `UNAUTHORIZED` |
| H2. Tentativa de criação por usuário sem papel | `create_payment_cycle_atomic` como usuário sem role | ✅ Bloqueado: `UNAUTHORIZED` |
| H3. `gestor` tenta `INSERT` direto na tabela (contornando a RPC) | `INSERT INTO contract_payment_cycles ...` como `gestor` autenticado | ✅ Bloqueado: **RLS nega** (não existe policy de INSERT — escrita só via RPC `SECURITY DEFINER`, mesmo para papéis autorizados) |

### 4.3 Contraste com o padrão legado (`contract_tasks`)

Testado ao vivo: `anon` e um usuário autenticado sem papel algum **conseguem ler todas as 22 linhas** de `contract_tasks` (política antiga `USING (true)`, sem restrição de papel). Isso confirma, por execução real (não suposição), que a nova política de `contract_payment_cycles` (`TO authenticated` + `has_role`) é genuinamente mais restritiva que o padrão legado do restante do sistema — exatamente a intenção documentada na Fase 10-A.2.

### 4.4 Nenhuma política permissiva foi inventada

Conforme instruído: o GAP de escopo por contrato (cenário C) foi **confirmado, não mascarado**. Nenhuma policy nova foi criada para "passar no teste" — a política já implementada na Fase 10-A.2 foi testada como está.

---

## 5. Payment cycles — Integridade

Todos os itens abaixo foram validados **ao vivo**, no mesmo Postgres provisionado (Seção 4.1), não apenas revisados estaticamente.

### 5.1 Defeito real encontrado e corrigido

Ao testar a criação de um ciclo com um `contract_key` que não segue estritamente o formato `{uasg}-{numero}-{ano}` (ex.: `TESTCONTRACT-01`), a RPC `create_payment_cycle_atomic` **falhou de verdade**: `ERROR: value too long for type character varying(10)`. Causa: a derivação de `v_uasg` (`split_part(contract_key, '-', 1)`) pode produzir uma string maior que 10 caracteres, violando `contract_task_plans.uasg VARCHAR(10)`.

**Corrigido**: `v_uasg := LEFT(COALESCE(NULLIF(split_part(v_contract_key, '-', 1), ''), '000000'), 10);` — trunca com segurança em vez de falhar (o campo é só metadado descritivo do plano, nunca usado em regra de negócio). Reaplicado no Postgres de teste e reconfirmado: o mesmo `contract_key` atípico agora cria o ciclo com sucesso. Contratos reais (formato `{uasg de 6 dígitos}-...`) nunca acionavam este caminho — mas a robustez agora cobre entradas atípicas sem quebrar.

### 5.2 Demais verificações (todas confirmadas ao vivo)

| Item | Verificação | Resultado |
|---|---|---|
| `cycle_key` único | Criar o mesmo contrato+competência+documento duas vezes | ✅ Segunda tentativa rejeitada: `PAYMENT_CYCLE_ALREADY_EXISTS` |
| Idempotência | idem | ✅ |
| Contrato existente | Testado com contrato realista (`200331-00099-2026`) e atípico (`TESTCONTRACT-01`) | ✅ Ambos funcionam após a correção da Seção 5.1 |
| Estados válidos | Transições RECEBIDO → ENVIADO_CGOFI → CONCLUIDO | ✅ |
| Relação com tarefas | Verificado `contract_tasks` real criado sob o `cycle_key`, com 11 tarefas/5 macrotarefas | ✅ |
| Responsável | `responsavel_user_id` setado para um UUID real de `auth.users` | ✅ Persistido e refletido no retorno da RPC |
| Timestamps | `criado_em`, `atualizado_em`, `concluido_em` | ✅ Carimbados corretamente, `concluido_em` só na transição para estado final |
| Referências SEI | FK para `processos_sei.numero_processo_sei` | ✅ Funciona com processo existente |
| Isolamento do fato financeiro | `SELECT count(*) FROM public.empenhos` após todas as operações | ✅ **0** — tabela nunca tocada |

### 5.3 Confirmação explícita: alterar/concluir um payment cycle NÃO altera fatos financeiros

Confirmado por execução real (Seção 5.2, última linha): nenhuma das operações de criação, atualização ou conclusão de ciclo escreveu em `public.empenhos`, liquidações ou pagamentos oficiais. O isolamento arquitetural desenhado na Fase 10-A.1 e implementado na Fase 10-A.2 foi validado com dados reais, não apenas por inspeção de código.

---

## 6. localStorage

### 6.1 Confirmação: `contract_payment_cycles` é a fonte canônica para a visão por contrato

`useContractPaymentFollowUp.ts` (visão por contrato, usada em `ContractPaymentFollowUpSection.tsx` e `ContractAttentionCenter.tsx`) lê/escreve exclusivamente via `paymentCycleRpcAdapter.ts` (Supabase) desde a Fase 10-A.2. Confirmado nesta fase: zero ocorrência de `localStorage` nesse hook.

### 6.2 GAP encontrado: a visão consolidada do Dashboard Gerencial ainda lia `localStorage`

Busca ampla por `payment-cycles`/`loadPersistedCycles`/`savePersistedCycles` encontrou um segundo caminho funcional, **não migrado na Fase 10-A.2**: `dashboardService.fetchAllPaymentCyclesFromStorage()`, chamada dentro de `fetchManagementDashboardData()` — a função que alimenta o Dashboard Gerencial inteiro (KPIs, "Atenção Agora", card de pagamentos consolidado). Essa função:
- Iterava `localStorage` procurando por chaves `saldoarp:payment-cycles:*`.
- Era **LEGADO NECESSÁRIO** (não código órfão — era ativamente chamada e alimentava dados reais na tela), mas **desatualizada em relação à fonte de verdade** já migrada para a visão por contrato: após a Fase 10-A.2, um ciclo criado via Supabase **não aparecia** no Dashboard Gerencial (que só via o que estivesse no `localStorage` daquele navegador específico), criando uma divergência ativa entre as duas telas.

### 6.3 Correção aplicada

- Nova função `fetchPaymentCyclesForContracts()` em `paymentCycleRpcAdapter.ts` — busca em lote (`.in('contract_key', [...])`) para todos os contratos do dashboard.
- A lógica de conversão linha-do-banco → `PaymentFollowUpCycle` foi **extraída para uma função única e compartilhada** (`rowToPaymentFollowUpCycle`, em `paymentFollowUpService.ts`) — reutilizada tanto pelo hook por contrato quanto pela nova função do dashboard, para nunca haver duas versões da mesma regra de mapeamento.
- `dashboardService.fetchAllPaymentCyclesFromStorage()` (síncrona, lia `localStorage`) foi **substituída** por `dashboardService.fetchAllPaymentCyclesForDashboard()` (assíncrona, lê Supabase) — a função antiga foi removida (confirmado: nenhum outro consumidor além do único call site já atualizado).
- 3 novos testes cobrindo especificamente esta correção (array vazio sem contratos, busca em lote correta, resiliência a falha de rede sem lançar exceção).

### 6.4 Classificação final

- `useContractPaymentFollowUp.ts`: já migrado na Fase 10-A.2 — **sem fallback para localStorage**.
- `dashboardService.fetchAllPaymentCyclesFromStorage`: era **LEGADO NECESSÁRIO** — corrigido nesta fase, função removida.
- Nenhum outro caminho funcional restante lê/escreve/depende de `localStorage` para ciclos de pagamento (busca ampla confirmada, zero ocorrências restantes de `saldoarp:payment-cycles` em código de produção).

---

## 7. Responsáveis

Validado ao vivo (Seção 5.2): `responsavel_user_id` em `contract_payment_cycles`:
- É uma **FK real** para `auth.users(id)` — testado com UUID inexistente, rejeitado corretamente (`violates foreign key constraint`).
- É **nullable** — ciclos criados sem responsável funcionam normalmente.
- **Coexiste** com `responsavel_nome` (texto legado) sem substituí-lo — ambos os campos foram testados simultaneamente presentes na mesma linha.
- Quando não há responsável, o campo permanece `NULL` sem erro — comportamento padrão testado implicitamente em todos os cenários que não o preencheram.
- Relação com Auth: confirmada via FK real, não apenas por tipo de coluna.
- RLS: a coluna não tem política própria — herda a RLS da tabela (mesma testada na Seção 4).

`contract_tasks.responsavel_user_id` (Fase 10-A.2) não foi testado ao vivo nesta rodada (o foco de teste real foi `contract_payment_cycles`, a pendência mais crítica), mas sua definição (mesma FK, mesmo padrão) foi revisada estaticamente e é estruturalmente idêntica ao que foi validado ao vivo para `contract_payment_cycles`.

---

## 8. TaskExecutionMode

Validado ao vivo (Seção 5.2): consultando `contract_tasks` das tarefas reais criadas para um ciclo de pagamento real, todos os 11 registros com os 4 modos presentes:

| Modo | Ocorrências confirmadas |
|---|---|
| INTERNA | 4 |
| EXTERNA | 3 |
| AUTOMATICA | 3 |
| CONFIRMACAO | 1 |

Isso confirma, com dados reais (não hardcoded em teste unitário), que `template → task` preserva o modo corretamente — a cópia feita por `apply_contract_task_template_to_key_atomic` (chamada internamente por `create_payment_cycle_atomic`) leva `execution_mode` do template para a instância sem perda.

**Restrição de domínio confirmada**: tentativa de `UPDATE contract_tasks SET execution_mode = 'INVALIDO'` foi **rejeitada pelo banco** (`violates check constraint "contract_tasks_execution_mode_check"`) — não é possível gravar um valor fora do domínio permitido, nem contornando a RPC.

---

## 9. Saldo ARP

Re-pesquisa completa por `85`, `70`, `0.85`, `0.70`, `0.7` em todo `src/`:

- As ocorrências de `0.85`/`0.70`/`0.7` encontradas são **todas falsos positivos** (`opacity: 0.7`, `fontSize: '0.85rem'`, etc.) — nenhuma duplicação de regra de negócio.
- `src/types/managementDashboard.ts` — ocorrências de `85`/`70` são **apenas comentários de documentação de tipo** (`// percentualConsumido >= 85%`), não cálculo duplicado.
- **Achado real, mas não ativo**: `src/design-system/components/ProgressBar.tsx` tem seu próprio `if (percent >= 85) ... if (percent >= 70) ...` para o modo de cor `'auto'`. Investigado: **zero componentes de aplicação usam `<ProgressBar>`** hoje (busca confirmada: nenhum resultado em `src/components`/`src/routes`). É um componente de design system genérico e reutilizável (não amarrado a saldo de Ata especificamente) que está **atualmente órfão**. Semanticamente, não é uma duplicação da regra de saldo de ARP (é uma convenção genérica de UI para "barra de progresso com cor automática"), mas registra-se como **risco latente**: se um dia for usado para exibir `percentualConsumido` de Ata, deveria consumir `classifyArpItemSaldo()` em vez de seus thresholds locais. Não alterado (sem uso real hoje, sem impacto a corrigir).

**Conclusão**: existe uma única regra canônica ativa e realmente em uso (`balanceService.classifyArpItemSaldo`), consumida por `dashboardService.ts` (3 pontos) e `centralPrazosService.ts` (1 ponto). Nenhuma duplicação ativa remanescente.

---

## 10. Vigência ARP

Re-pesquisa completa por `dataVigenciaFinal`/`vigenciaFinal` em todo `src/`:

- `ArpSearch.tsx`, `AtaCardHeader.tsx`, `InternalAllocationsDashboard.tsx` — todos os 3 confirmados usando `getArpVigenciaStatus()` (nenhum `new Date()` cru restante para cálculo de vigência).
- `EmpenhoDetailModal.tsx`, `AllocationsPortfolioContent.tsx` (apareceram na busca por mencionarem o campo) — confirmado que são apenas **exibição de texto formatado** (`formatDate(...)`) ou passagem de tipo, sem nenhum cálculo de dias/expiração duplicado.
- Todos os demais usos de `new Date()` encontrados na busca são para propósitos não relacionados (timestamps de sincronização, exportação Excel, ano fiscal corrente) — nenhum recalcula a regra de vigência de Ata.
- Timezone `America/Sao_Paulo`: preservado — `getArpVigenciaStatus` usa `parseDateBRT`/`differenceInDays`, os mesmos primitivos já usados por `centralPrazosService.ts` antes desta fase, sem nenhuma alteração de comportamento.

**Conclusão**: regra canônica única, sem duplicação remanescente.

---

## 11. AtaEventService

- Confirmado: **continua compilando** (`tsc -b` limpo).
- Confirmado: **zero regressão** — seus 20 testes próprios continuam passando, sem nenhuma alteração no arquivo.
- Confirmado: **zero consumidores** fora de teste (mesma busca da Fase 10-A.2, resultado idêntico).
- **Não integrado** nesta fase, conforme instruído — permanece preparado para a Fase 10-F.

---

## 12. Testes

`npm test -- --run`: **117 arquivos de teste, 1056 testes passando, 3 skipped (rede indisponível, pré-existente e sem relação com esta fase), 0 falhas.**

Novos testes desta fase: 3 (severidade do Contrato 360 — reajuste) + 2 (pagamento) + 1 (tarefa) + 3 (dashboard/localStorage) = **9 novos testes**, todos cobrindo diretamente as correções realizadas.

---

## 13. Lint

`npm run lint` (oxlint): exit code 0. Apenas warnings pré-existentes (mesmos arquivos/linhas da baseline anterior — `ContractAttentionCenter.tsx` mantém o mesmo warning de "fast refresh" que já existia antes desta fase, apenas deslocado de linha pela adição de imports). Nenhum warning novo introduzido.

---

## 14. Build

`npm run build` (`tsc -b && vite build`): **sucesso**. `dist/` gerado normalmente, mesmo warning pré-existente de tamanho de chunk (não relacionado a esta fase).

---

## 15. Dados financeiros

Confirmado por execução real contra Postgres (Seção 5.2/5.3): nenhuma operação desta fase ou das fases anteriores (10-A.2) escreve em `public.empenhos`, liquidações ou pagamentos oficiais. A tabela permaneceu com **0 registros** durante todo o ciclo de testes de criação/atualização/conclusão de ciclos de pagamento — prova direta, não inferida, do isolamento arquitetural.

---

## 16. Segurança

- RLS de `contract_payment_cycles` **validada com usuários reais e papéis reais** (Seção 4) — não apenas revisada estaticamente.
- Confirmado ao vivo: escrita só é possível via RPC `SECURITY DEFINER`, mesmo para um usuário com papel `gestor` tentando `INSERT` direto (Seção 4.2, H3).
- Confirmado ao vivo: `anon` e usuários autenticados sem papel são bloqueados tanto de leitura quanto de escrita.
- **GAP de escopo por contrato/unidade permanece real e agora confirmado por execução** (Seção 4.2, cenário C) — não foi mascarado nem uma política permissiva foi inventada para disfarçá-lo. Este GAP é transversal a todo o sistema (não específico de `contract_payment_cycles`) e está documentado desde a Fase 10-A como pré-requisito de uma futura Fase 10-G (Destinatários e Preferências).
- RBAC: confirmado que a nova camada paralela de `has_permission()` (introduzida por trabalho não relacionado à Fase 10, migrations `20260925000023`–`20260926000033`) **não afeta** as RPCs desta fase — `has_role()` permanece o mecanismo de autorização usado, consistente com todas as RPCs irmãs do domínio de Gestão de Contratos (nenhuma delas foi migrada para `has_permission()` até o momento).

---

## 17. Pendências remanescentes

1. **GAP de escopo por contrato/unidade** (RLS) — confirmado real e ativo em todo o sistema, não específico desta implementação. Pré-requisito de uma futura Fase 10-G, não desta fase de fechamento.
2. **Migrations não aplicadas em ambiente de homologação/produção real** — validadas em um Postgres local avulso e descartável nesta sessão; recomenda-se aplicá-las (as 3 migrations da Fase 10-A.2, já corrigidas nesta fase) em um ambiente de homologação real do projeto antes de produção.
3. **`ProgressBar.tsx`** — risco latente documentado (Seção 9), não corrigido por estar hoje sem uso real; deve ser lembrado caso um dia seja conectado a saldo de Ata.
4. **`contract_tasks.responsavel_user_id`** não foi testado ao vivo nesta rodada (só `contract_payment_cycles` foi); estruturalmente idêntico ao que foi validado, mas sem prova de execução direta.
5. **Verificação visual em navegador do Contrato 360** não foi possível (exige login real) — mitigado por testes de renderização estática que verificam texto e `data-testid` exatos.
6. **`contract_managers`/`processos_sei`** continuam sem `_user_id` — já documentado como fora do escopo priorizado desde a Fase 10-A.2 (Seção 9 daquela fase), não uma regressão desta.

---

## STATUS FASE 10-A.2.1: **GO**

Critérios de saída, um a um:

| Critério | Atendido? |
|---|---|
| `npx tsc -b` PASS | ✅ 0 erros |
| Testes PASS | ✅ 1056 passando, 0 falhas reais |
| Lint sem novos problemas | ✅ Apenas warnings pré-existentes |
| Build PASS | ✅ |
| Contrato 360 usa severidade canônica | ✅ 3 blocos migrados, regra de negócio inalterada, 7 testes (4 preservados + 3 novos) |
| RLS de payment cycles validado | ✅ **Validado com Postgres real e usuários reais** (não apenas estático) — cenários A–H todos executados e confirmados, incluindo um defeito real encontrado e corrigido |
| Payment cycles idempotente | ✅ Confirmado ao vivo (`PAYMENT_CYCLE_ALREADY_EXISTS`) |
| localStorage não é fonte canônica | ✅ **GAP adicional encontrado e corrigido** nesta fase (visão consolidada do dashboard) |
| Responsáveis corretamente vinculados | ✅ FK real, nullable, compatível com legado — validado ao vivo |
| execution_mode íntegro | ✅ Confirmado ao vivo (11 tarefas reais, 4 modos, CHECK constraint ativo) |
| Saldo ARP com regra única | ✅ Re-pesquisado, confirmado, 1 risco latente documentado (não ativo) |
| Vigência ARP com regra única | ✅ Re-pesquisado, confirmado, zero duplicação ativa |
| Fatos financeiros intactos | ✅ Confirmado por execução real (0 registros em `empenhos` durante todos os testes) |

Nenhuma divergência estrutural foi encontrada que justifique HOLD. O único GAP identificado (escopo por contrato/unidade na RLS) é transversal, pré-existente, já documentado desde a Fase 10-A, e explicitamente fora do escopo de fechamento desta fase (pertence a uma futura Fase 10-G).

Não iniciar a Fase 10-B. Nenhuma automação, notificação, cron ou Edge Function foi criada nesta execução.

Aguardando autorização para prosseguir.
