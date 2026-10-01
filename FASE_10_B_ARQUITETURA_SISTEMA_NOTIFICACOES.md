# FASE 10-B — Arquitetura do Sistema Único de Notificações

**Sistema:** CGLIC-system 3.0
**Tipo de execução:** Auditoria + Desenho Arquitetural. Nenhuma migration, tabela, RPC, Edge Function, cron, scheduler, worker, fila, serviço de notificações, hook, componente, e-mail, WhatsApp ou push foi criado. Nenhuma RLS ou regra de negócio foi alterada. A Fase 10-C não foi iniciada.

---

## 1. Objetivo

Definir uma arquitetura única, simples, segura, auditável e idempotente para notificações do CGLIC-system, capaz de atender no futuro — sem criar subsistemas paralelos — contratos, tarefas, workflows, prazos, reajustes, prorrogações, Atas, saldos e pagamentos/CGOFI, respeitando a cadeia:

```
FATO OFICIAL → REGRA → DETECÇÃO → ALERTA → TAREFA/WORKFLOW (se aplicável) → NOTIFICAÇÃO (se aplicável) → RESPONSÁVEL IDENTIFICADO → AÇÃO HUMANA
```

---

## 2. Baseline

Executado antes de qualquer análise, para confirmar que a base homologada nas Fases 10-A.2/10-A.2.1 permanece íntegra (o repositório recebeu commits externos volumosos entre sessões — ver Seção 3):

- `npm test -- --run`: **123 arquivos, 1133 testes, 3 skipped (rede, pré-existente), 0 falhas.**
- `npx tsc -b`: encontrado **1 erro pré-existente** (`ContractTasksSectionEditing.test.tsx`, import `React` não utilizado), introduzido por um commit externo não relacionado à Fase 10. Corrigido como higiene trivial de baseline (uma linha, remoção de import morto) — não é implementação de arquitetura, apenas manutenção do bar "TypeScript limpo" que todas as fases anteriores estabeleceram. Após a correção: **0 erros.**
- `npm run lint`: exit 0, apenas warnings pré-existentes.
- `npm run build`: sucesso.

**Comando oficial de typecheck confirmado, reiterado**: `npx tsc -b` (nunca `tsc --noEmit` isolado — ver Fase 10-A.2, Seção 14, para o motivo estrutural).

---

## 3. Arquitetura atual (reauditada no código, não em documentação)

### 3.1 Drift relevante desde a Fase 10-A.2.1

Entre a Fase 10-A.2.1 e esta execução, uma trilha de trabalho externa (não relacionada à Fase 10, parcialmente também assistida por Claude) fez um commit volumoso (`bb1f164`, 170 arquivos, hoje 2026-09-30) que **reestrutura profundamente** a Central de Atenção por contrato. Isso foi reauditado no código atual antes de qualquer proposta:

- `ContractAttentionCenter.tsx` (o componente que migrei na Fase 10-A.2.1) foi **removido** e substituído por **`ContractActionQueue.tsx`** + **`ContractHealthStrip.tsx`**.
- Nasceu uma tabela real, persistida no Postgres: **`reminder_dismissals`** — a peça mais relevante para esta fase (ver 3.3).
- Nasceu **`ResponsavelField.tsx`** — um seletor de responsável que já resolve identidade real (`responsavelUserId`) quando o responsável é um usuário do sistema, com fallback a texto livre.
- O módulo de processos SEI (UI) foi removido; a **tabela `processos_sei` foi mantida** (confirmado: nenhum `DROP TABLE` — a migration `20260930000041` documenta explicitamente que a mantém porque `contract_payment_cycles` tem FK para ela). Nenhum impacto nas fases anteriores.
- Atas ganharam um espelho completo de gestão (`ata_managers_schema`, `ata_management_schema`, `ata_task_plan_crud`) — **incluindo `ata_managers.gestor_user_id`**, nascida já com a ponte de identidade (mesmo modelo de `contract_managers.gestor_user_id`, da Fase 10-A.2.1).

### 3.2 `ContractActionQueue` — a nova Central de Atenção por contrato

`src/services/contractActionQueueService.ts` + `useContractActionQueue.ts` + `ContractActionQueue.tsx`: **projeção 100% client-side, sem persistência própria** (mesmo padrão do extinto `useContractWorkflows`). Consome diretamente `dashboardService.calculateAttentionSummary()` (mesmo funil único usado pelo Dashboard Gerencial — garantia explícita de paridade de contagem entre as duas telas) e `centralPrazosService.buildCentralPrazosItems()` (para os itens `LEMBRETE`, os antigos `GATILHO_OPERACIONAL` de vigência). Reutiliza `SeverityLevel` do design system — não inventa uma segunda taxonomia de severidade para os itens que já vêm com severidade do funil único.

`ContractHealthStrip.tsx` consome os mesmos `counts` calculados pela mesma chamada (sem segunda fonte) — nenhuma duplicação de contagem entre os dois componentes.

### 3.3 `reminder_dismissals` — o precedente mais importante para esta arquitetura

Migration `20261002000046_reminder_dismissals.sql` (lida integralmente):

```sql
CREATE TABLE public.reminder_dismissals (
  entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('CONTRATO', 'ATA')),
  entity_key VARCHAR(100) NOT NULL,
  item_id VARCHAR(200) NOT NULL,
  dismissed_by UUID DEFAULT auth.uid(),
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_type, entity_key, item_id)
);
```

Escrita via 2 RPCs `SECURITY DEFINER` (`dismiss_reminder_atomic`/`restore_reminder_atomic`, gated por `has_role('gestor') OR has_role('admin')`), leitura pública. O `item_id` é literalmente o id idempotente já produzido por `centralPrazosService.generateIdempotentItemId()` (formato `{tipo}::{entidade}::{evento}::{regra}::{ciclo}`, ex.: `CONTRATO::{contractKey}::PRORROGACAO::GATILHO_180D::VIG_{dataFim}`) — o próprio comentário da migration documenta que o ciclo de vigência está embutido na chave, então uma prorrogação (mudança de `dataVigenciaFim`) gera um novo ciclo e o lembrete "renasce" para o novo período.

**Por que isso importa tanto para a Fase 10-B**: `reminder_dismissals` **já é** uma prova de conceito real, homologada e em produção, do padrão de chave determinística que esta fase precisa generalizar. Mas ela **não é uma notificação** — é um bit de estado compartilhado ("já resolvi, para todo mundo que olhar esta Ata/contrato"), sem destinatário, sem canal, sem "lido vs. não lido" por pessoa. A Seção 6/29 detalha essa distinção.

### 3.4 `ResponsavelField` — identidade de destinatário já parcialmente resolvida na prática

`src/components/contracts/ResponsavelField.tsx`, usado em `ContractTasksSection`, `ContractPaymentFollowUpSection` e `AtaTasksSection`: ao salvar um responsável, grava `responsavelNome` (sempre) e `responsavelUserId` (só quando o responsável selecionado é uma conta ativa do sistema; `undefined` no modo texto livre). Isso confirma, na prática de uso — não apenas na definição de schema — que a ponte de identidade das Fases 10-A.2/10-A.2.1 já está sendo usada por humanos reais, com cobertura parcial (depende de o usuário escolher a conta em vez de digitar texto livre).

### 3.5 Confirmado, de novo, por busca ampla e fresca: zero infraestrutura de envio

Repetida a busca exaustiva (Seção 3 desta fase pede explicitamente para não assumir nada da documentação anterior): `whatsapp`, `sendgrid`, `resend`, `nodemailer`, `smtp`, `twilio` — **zero ocorrências** em todo `src/`/`supabase/`. `pg_cron`/`cron.`/`scheduler`/`setInterval` — **zero ocorrências**. Edge Functions existentes: apenas `invite-user` e `manage-user` (gestão de contas, confirmado novamente). As únicas ocorrências de "notif"/"notify" no código são (a) `NOTIFICACAO_RESCISAO`, um tipo de **notificação extrajudicial formal** prevista na Lei 14.133 (art. 137) — vocabulário jurídico, não um mecanismo de entrega do sistema — e (b) rótulos genéricos de UI ("Fechar notificação" em toasts). Nenhuma automação, nenhum canal de negócio.

### 3.6 GAP de severidade ainda não 100% fechado (achado novo)

`contractActionQueueService.ts` já usa `SeverityLevel` (não inventa taxonomia nova), mas a classificação ATENCAO/INFO dos itens `TAREFA` (8–30 dias) e `LEMBRETE` é feita por **threshold inline no próprio serviço**, não por chamada às funções canônicas de `severityService.ts` (`severityFromAtencaoNivel` etc.) — porque `centralPrazosService.buildCentralPrazosItems` continua emitindo `AtencaoNivel`/`TemporalStatus` (uma taxonomia diferente), não `SeverityLevel` diretamente. Isso **não é uma segunda taxonomia nova** (o valor final gravado é sempre um `SeverityLevel` válido), mas é uma pequena inconsistência de proveniência que a futura geração de notificações deve resolver — ao gerar uma notificação a partir de um item `LEMBRETE`/`TAREFA`, a conversão deve passar pelo conversor canônico, não reimplementar o threshold pela terceira vez. Documentado como GAP (Seção 32), não bloqueante.

---

## 4. Princípios

Reiterados e adotados como restrições de desenho:

- **ALERTA ≠ NOTIFICAÇÃO ≠ TAREFA ≠ WORKFLOW.** Uma notificação pode referenciar qualquer um desses, nunca substituí-los.
- **Notificação é uma entrega dirigida**, não um fato, não uma regra, não uma decisão administrativa.
- **Nenhum segundo motor.** O mecanismo de notificação é **consumidor** de `centralPrazosService`, `temporalEngineService`, `severityService`, `contract_tasks`, `contract_payment_cycles`, `contractEventService`, `balanceService`, `dashboardService` — nunca uma reimplementação paralela de nenhum deles.
- **Identidade real acima de texto livre.** Destinatário técnico de notificação é sempre um `auth.users.id` resolvido — nunca `responsavel_nome` cru.

---

## 5. Modelo conceitual

**Menor modelo possível avaliado: 1 tabela para o MVP, com um 2º ponto de extensão claramente identificado para quando houver mais de um canal.**

Diferente da hipótese inicial de 4 tabelas (`Notification`/`NotificationRecipient`/`NotificationDelivery`/`NotificationPreference`), a análise mostra:

- **`NotificationRecipient` como tabela separada não é necessária no MVP.** Como o próprio formato de chave conceitual já inclui o destinatário (Seção 6), a linha de notificação já É por (evento, destinatário) — um evento com múltiplos destinatários gera múltiplas linhas (uma por destinatário), cada uma com sua própria `notification_key`. Isso é exatamente o que `reminder_dismissals` já faz de forma análoga (uma linha por `entity_key`+`item_id`; no caso de notificação, uma linha por `entity_key`+`item_id`+`destinatário`).
- **`NotificationDelivery` como tabela separada só se justifica quando existir mais de um canal.** Para IN_APP isolado (o MVP, Seção 26), a existência da própria linha de notificação **é** a entrega — não há tentativa, retry ou latência de canal externo a rastrear. A tabela viraria necessária no momento em que um segundo canal (e-mail/WhatsApp) for implementado, porque aí sim uma notificação lógica pode ter múltiplas tentativas de entrega (idempotência da notificação ≠ idempotência da entrega, Seção 17). **Proposta**: manter esse conceito documentado como extensão futura, não implementar agora.
- **`NotificationPreference` não faz parte do MVP** — Seção 15 já instrui não implementar preferências ainda; é matéria de uma futura Fase 10-G.

**Entidade única proposta para o MVP: `notifications`.**

| Por que existe | Resolve "o que foi dirigido a mim", distinto da Central de Atenção ("o que exige atenção agora") |
|---|---|
| Cardinalidade | 1 linha por (evento lógico × destinatário) — nunca por evento sozinho |
| Ciclo de vida | ENVIADA → LIDA → ARQUIVADA (ou CANCELADA, ver Seção 8) |
| Quem escreve | Exclusivamente um mecanismo de geração interno (RPC `SECURITY DEFINER`), nunca o usuário final diretamente |
| Quem lê | O próprio destinatário (RLS por `recipient_user_id = auth.uid()`) |
| Relação com Auth | `recipient_user_id UUID NOT NULL REFERENCES auth.users(id)` — nunca nullable, nunca texto livre |
| Relação com RBAC | Geração restrita a papéis com escrita (mesmo padrão de `has_role('gestor')/('admin')` já usado em todas as RPCs do sistema) |
| Relação com RLS | `SELECT`/`UPDATE` (só para marcar lida/arquivada) restritos ao próprio destinatário; sem policy de `INSERT` (escrita só via RPC) |

---

## 6. Notificação × Alerta × Tarefa × Workflow

| Conceito | Onde vive hoje | Persistido? | Por destinatário? | Tem canal? |
|---|---|---|---|---|
| Fato oficial | Contratos.gov/PNCP/Compras.gov, `contract_payment_cycles`, `empenhos` | Sim (fonte externa ou Postgres) | N/A | N/A |
| Regra/Detecção | `temporalEngineService`, `contractReajusteRadarService`, `balanceService`, `paymentFollowUpService` | Não (função pura) | N/A | N/A |
| Alerta (efêmero) | `dashboardService.calculateAttentionSummary`, `ContractActionQueue` | **Não** — recalculado a cada leitura | Não — visível a quem tiver acesso à tela | Não — é só apresentação |
| Lembrete dispensável | `reminder_dismissals` | Sim, mas só 1 bit compartilhado ("dispensado ou não") | **Não** — dispensa é global por entidade, não por usuário | Não |
| Tarefa | `contract_tasks`/`contract_task_plans` (e espelho de Ata) | Sim | Tem um `responsavel_user_id` opcional, mas não é uma "entrega" | Não |
| Workflow | Projeção client-side (`useContractWorkflows`, extinto; hoje embutido no `ContractActionQueue`) | Não | N/A | N/A |
| **Notificação (proposta)** | **Nova** | **Sim, dedicada** | **Sim — sempre, por construção** | **Sim (mesmo que só IN_APP no MVP)** |

---

## 7. Identidade

### 7.1 `notification_key`

Composição adotada, generalizando o padrão já validado por `reminder_dismissals` e por `generateIdempotentItemId`:

```
{ENTITY_TYPE}::{ENTITY_KEY}::{EVENT_TYPE}::{MARCO_OU_CICLO}::{RECIPIENT_USER_ID}
```

Exemplo concreto (não implementado, apenas ilustrativo):
```
CONTRATO::200331-00099-2026::REAJUSTE_ANIVERSARIO::ANO_1::a1b2c3d4-...
PAGAMENTO::200331-00099-2026-PGTO-202609-DOC1::CGOFI_SEM_RESPOSTA::D5::a1b2c3d4-...
```

O `{MARCO_OU_CICLO}` reaproveita exatamente os identificadores de regra que já existem (`GATILHO_180D`, `ANO_{ciclo}`, `VIG_{dataFim}`, etc.) — nenhum novo vocabulário de marco é inventado.

### 7.2 Por que o destinatário faz parte da chave

Um mesmo evento lógico pode ter mais de um destinatário legítimo (ex.: gestor do contrato E responsável da tarefa). Incluir o destinatário na chave garante que cada um receba sua própria linha, idempotente independentemente, sem exigir uma tabela de junção separada.

---

## 8. Destinatários

| Categoria | Situação |
|---|---|
| Responsável de tarefa (`contract_tasks.responsavel_user_id` / espelho de Ata) | **RESOLVÍVEL HOJE, COM COBERTURA PARCIAL** — preenchido quando o responsável foi selecionado via `ResponsavelField` como conta do sistema; `NULL` quando digitado como texto livre |
| Gestor do contrato (`contract_managers.gestor_user_id`) | **RESOLVÍVEL HOJE, COM COBERTURA PARCIAL** — mesma ressalva |
| Gestor da Ata (`ata_managers.gestor_user_id`) | **RESOLVÍVEL HOJE, COM COBERTURA PARCIAL** — confirmado nesta fase que a tabela já nasceu com a ponte de identidade, simétrica à de contratos |
| Responsável do ciclo de pagamento (`contract_payment_cycles.responsavel_user_id`) | **RESOLVÍVEL HOJE, COM COBERTURA PARCIAL** — mesma ressalva, ponte criada na Fase 10-A.2 |
| Unidade/setor (destinatário coletivo) | **NÃO RESOLVÍVEL HOJE** — não existe hoje nenhuma tabela que associe uma unidade a um conjunto de contas de usuário membros dela para fins de notificação em lote |
| Usuário específico (busca manual) | **RESOLVÍVEL HOJE** — via `user_roles`/`auth.users`, mesmo mecanismo já usado por `ResponsavelField` |
| Múltiplos destinatários por evento | **RESOLVÍVEL HOJE, POR CONSTRUÇÃO** — o modelo de chave (Seção 7) já suporta gerar uma linha por destinatário sem mudança de schema |

Nenhum destinatário técnico deve ser resolvido a partir de `gestor_nome`/`responsavel_nome` (texto). Quando a identidade não puder ser resolvida (campo `_user_id` nulo), a notificação correspondente **não deve ser gerada** — a situação continua visível na Central de Atenção (pull), mas não é empurrada (push) a ninguém, para não inventar um destinatário técnico a partir de texto livre.

---

## 9. Autorização

Cadeia adotada: `DESTINATÁRIO → IDENTIDADE → AUTORIZAÇÃO → ESCOPO → ENTREGA`.

**Realidade confirmada (reiterando GAP já documentado desde a Fase 10-A)**: a RLS do sistema hoje é, para a maioria das tabelas de negócio, `USING (true)` — sem escopo por contrato/unidade. Isso significa que uma verificação de "este destinatário tem autorização granular para ver ESTE contrato específico" **não pode ser feita de forma confiável hoje**, porque essa informação de escopo simplesmente não existe no modelo de dados atual (fora dos poucos vínculos diretos: gestor do contrato, responsável da tarefa, responsável do ciclo).

**Mitigação adotada para o desenho (não uma solução do GAP, uma forma de conviver com ele com segurança)**: notificações só devem ser geradas para destinatários que já possuem um **vínculo estrutural direto e existente** com a entidade (`responsavel_user_id`/`gestor_user_id` da própria linha) — nunca por um critério amplo como "todo usuário com papel gestor". Isso limita a superfície de exposição ao que o sistema já reconhece como relação legítima, sem fingir resolver o escopo de RLS mais amplo. Fan-out por unidade/papel amplo é classificado como **NÃO RESOLVÍVEL HOJE** (Seção 8) e depende da futura Fase 10-G fechar o GAP de escopo antes de ser seguro.

---

## 10. Severidade

`SeverityLevel` (`CRITICA`/`URGENTE`/`ATENCAO`/`INFO`) é reutilizado integralmente, sem paralela. Toda notificação carrega a severidade do evento que a originou (via `severityService.ts`, nunca recalculada ad-hoc — ver GAP da Seção 3.6, que deve ser corrigido no momento da implementação real da geração).

**Prioridade de entrega vs. severidade do evento**: nesta fase, **nenhuma diferença é adotada** — não há evidência de necessidade real de um conceito de "prioridade de fila de envio" distinto da severidade, porque o único canal do MVP (IN_APP) não tem fila de envio (a escrita da linha é a entrega). Se um canal assíncrono futuro precisar de uma fila com prioridade própria (ex.: e-mails críticos furando fila), essa distinção deve ser reavaliada no momento em que `notification_deliveries` (Seção 5) for criada — não antes.

---

## 11. Canais

| Canal | Status |
|---|---|
| IN_APP | **NÃO IMPLEMENTADO** (mas é o alvo do MVP — arquitetura pronta, nada construído) |
| EMAIL (negócio) | **NÃO IMPLEMENTADO** — distinto do e-mail de autenticação (Seção 13) |
| WHATSAPP | **NÃO IMPLEMENTADO** — nenhuma integração pertencente ao CGLIC-system |
| Outro | Nenhum candidato identificado |

---

## 12. Canal IN_APP

Recomendado como primeiro canal pelos motivos já antecipados pela própria instrução da fase, todos confirmados no código atual:

- Autenticação já existe (Supabase Auth, `auth.uid()` já usado em toda RLS do sistema).
- Menor dependência externa (nenhum provedor de terceiros).
- Rastreabilidade trivial (uma linha de banco, sem retry/latência de rede).
- Deep link determinístico a partir de `entity_type`+`entity_key` (Seção 20).

**Central de Atenção ≠ Caixa de Notificações, explicitamente**: a Central (hoje: `ContractActionQueue`/`AtaAttentionCenter`/o funil do Dashboard Gerencial) responde "o que exige atenção agora" e é 100% efêmera/recalculada. Uma caixa de notificações responderia "o que foi dirigido a mim" e exigiria persistência e uma UI própria — **não implementada nesta fase**. Determinado que uma UI separada (provavelmente um sino/contador no cabeçalho, com uma lista dedicada) será necessária no futuro, mas seu desenho fica para a fase de implementação do MVP (Seção 26), não para esta.

---

## 13. Email

Auditado: o único e-mail que o sistema envia hoje é via Supabase Auth (`supabase/functions/invite-user/index.ts`, `inviteUserByEmail`, e `userService.resetUserPassword`, `auth.resetPasswordForEmail`) — **e-mail de conta**, não de negócio. Nenhum SMTP próprio, nenhum provedor transacional (Resend/SendGrid/etc.), nenhuma Edge Function de envio de e-mail de negócio. **NÃO IMPLEMENTADO** como canal de notificação. Dependência futura: qualquer implementação de e-mail de negócio precisará de um provedor transacional configurado independentemente do e-mail de autenticação do Supabase — não reaproveitável.

---

## 14. WhatsApp

Confirmado por busca exaustiva: **nenhuma integração de WhatsApp pertence ao CGLIC-system hoje.** (Observação incidental, fora do escopo: existem containers Docker de um gateway WhatsApp/Evolution API rodando na máquina do usuário durante o trabalho desta fase — mas pertencem a infraestrutura de outro projeto, não ao CGLIC-system, e não foram tocados nem devem ser presumidos reaproveitáveis.) Registrado como infraestrutura futura, não implementado.

---

## 15. Preferências

Não implementado nesta fase, conforme instruído. Distinção conceitual adotada para quando isso for desenhado (Fase 10-G):

- **OBRIGATÓRIA**: nunca desativável (ex.: nenhuma identificada ainda com certeza absoluta — candidata: notificação de vencimento peremptório de contrato, D-0).
- **CONFIGURÁVEL**: canal/horário/digest ajustável pelo usuário, mas o evento em si sempre gera algum registro.
- **INFORMATIVA**: pode ser silenciada por completo sem risco operacional (ex.: lembretes de planejamento de baixa severidade).

Nenhuma tabela de preferências é proposta nesta fase.

---

## 16. Frequência

| Classe | Candidatos |
|---|---|
| Por evento (síncrono) | Tarefa atribuída, mudança de status de ciclo de pagamento, conclusão de tarefa |
| Antes do prazo (varredura) | D-30/D-7 de contrato, aniversário de reajuste, vigência de Ata |
| Após atraso (varredura) | Tarefa vencida, fatura vencida, CGOFI sem resposta > N dias |
| Mudança de estado (síncrono) | Status de pagamento avança (ex.: ENVIADO_CGOFI → AGUARDANDO_CGOFI) |

Nenhum scheduler é criado. A classe "varredura" **depende de infraestrutura de agendamento que hoje não existe** (Seção 28) — isso é um bloqueador explícito para qualquer evento temporal, documentado como dependência, não resolvido aqui.

---

## 17. Idempotência

- **Idempotência da notificação**: `UNIQUE(notification_key)` + `INSERT ... ON CONFLICT (notification_key) DO NOTHING` — mesmo padrão exato já em produção em `reminder_dismissals`.
- **Idempotência da entrega**: para o MVP (IN_APP único), **colapsada na mesma linha** — a existência da linha já é a entrega, não há uma segunda dimensão de "tentativa" a rastrear. Uma vez que um segundo canal existir, a idempotência de entrega passa a viver em `notification_deliveries` (Seção 5), chaveada por `(notification_id, canal)`, permitindo múltiplas tentativas por notificação lógica sem duplicar a notificação em si.

---

## 18. Anti-spam

O principal mecanismo é a própria chave idempotente (Seção 17): uma varredura periódica reexecutando a mesma regra sobre a mesma situação produz a mesma `notification_key`, logo não duplica. Isso só funciona se o "marco" embutido na chave for granular o suficiente (ex.: um contador de dias contínuo como "CGOFI sem resposta" precisa de um marco discreto — ex. `D5`, `D10` — em vez de um valor contínuo, para não gerar uma chave nova a cada execução). Esse desenho de granularidade de marco é responsabilidade de cada regra específica (10-C/10-D/10-E/10-F), não desta arquitetura geral. Cooldown/digest são reconhecidos como mecanismos secundários possíveis, mas não há evidência hoje de que sejam necessários além da própria chave — não adotados agora.

---

## 19. Escalonamento

**Decisão adotada**: preferir **registrar um novo marco notificável** a **atualizar uma notificação existente**, porque:
1. Cada limiar de severidade já corresponde, na prática atual do sistema, a uma regra/marco com identificador próprio (ex.: `GATILHO_180D` vs. `GATILHO_60D` já são marcos distintos, não uma "mesma regra escalando") — a arquitetura de regras existente já modela escalonamento como marcos discretos, não como mutação de um único registro.
2. Preserva histórico e auditabilidade completos (Seção 21) sem ambiguidade sobre "isso já foi lido antes de escalar?".
3. Evita a complexidade de UX de reabrir como "não lida" uma notificação que o destinatário já havia lido em um nível de severidade menor.

Atualizar em vez de criar só deveria ser considerado no futuro para uma regra específica cujo desenho explicitamente modele um único alerta multi-nível contínuo (nenhuma identificada hoje com essa necessidade).

---

## 20. Deep links

**Decisão**: não persistir uma URL arbitrária. Persistir apenas `entity_type` + `entity_key` (já parte da chave, Seção 7) e derivar a URL determinística no frontend, exatamente como `dashboardService.ts` já faz hoje para os itens do funil único (`targetUrl: pItem.contractKey ? `/contratos/${pItem.contractKey}` : undefined`). Isso evita um campo que pode apodrecer se as rotas mudarem, e reaproveita uma função de mapeamento já existente em espírito.

---

## 21. Auditoria

Campos mínimos a existir na própria linha de notificação (sem duplicar log): destinatário (`recipient_user_id`), origem/regra (`event_type`), severidade, timestamps de criação/leitura/arquivamento, e a chave idempotente em si (que já registra entidade+marco). Não é necessário um log separado — a própria tabela, por ser um registro de fatos imutáveis exceto por transições de estado bem definidas, já cumpre esse papel, no mesmo espírito de `reminder_dismissals` (que também não tem log próprio).

---

## 22. Observabilidade

Métricas futuras úteis, não implementadas: notificações geradas por tipo/severidade, notificações lidas vs. não lidas, tempo até leitura, duplicações bloqueadas pela chave idempotente (contável via tentativas de `INSERT` que colidem), destinatário não resolvido (contável na camada de geração, antes mesmo de uma linha existir — quantas vezes uma regra disparou mas não gerou notificação por falta de `_user_id`). Nenhum dashboard de observabilidade é proposto aqui.

---

## 23. Segurança/RLS (conceitual — nenhuma RLS foi alterada)

- `SELECT`: `TO authenticated USING (recipient_user_id = auth.uid())` — cada usuário só vê as suas.
- `UPDATE`: mesmo predicado, mas restrito a transições de estado permitidas (marcar como lida/arquivada) — nunca a mudança de `recipient_user_id`, `notification_key`, severidade ou conteúdo.
- Nenhuma policy de `INSERT`/`DELETE` para `authenticated` — criação é exclusiva de uma RPC `SECURITY DEFINER` interna (o "mecanismo"), nunca uma ação de usuário final.
- Impossibilidade de forjar notificação: garantida pela ausência de `INSERT` direto e pela RPC de criação nunca aceitar `recipient_user_id` arbitrário sem validação de vínculo estrutural (Seção 9).
- Impossibilidade de marcar notificação de terceiro como lida: garantida pelo predicado de `UPDATE` já restringir a linha ao próprio destinatário.

---

## 24-25. Eventos candidatos e matriz completa

| Evento | Fonte | Severidade | Destinatário | Canal futuro | Frequência | Chave idempotente (ilustrativa) | Deep link | Situação |
|---|---|---|---|---|---|---|---|---|
| Tarefa vencida/próxima (contrato) | `contract_tasks` | CRITICA/URGENTE (funil único) | `responsavel_user_id` da tarefa | IN_APP | Evento (status) + varredura (prazo) | `TAREFA::{taskId}::{estado}::{userId}` | `/contratos/{contractKey}` | **PRONTO** |
| Tarefa vencida/próxima (Ata) | `ata_task_plan_crud` (espelho) | idem | `responsavel_user_id` da tarefa | IN_APP | idem | idem | `/atas/detalhe/{ataKey}` | **PRONTO** |
| Janela de prorrogação de contrato (180d/60d) | `centralPrazosService` (GATILHO_OPERACIONAL) | ATENCAO/INFO (via GAP §3.6) | `contract_managers.gestor_user_id` | IN_APP | Varredura periódica | `CONTRATO::{key}::PRORROGACAO::GATILHO_180D::VIG_{dataFim}::{userId}` | `/contratos/{contractKey}` | **DEPENDE DE INFRAESTRUTURA** (scheduler) |
| Reajuste/repactuação (aniversário) | `contractReajusteRadarService` | Canônica (`severityFromReajusteRadarNivel`, já correta) | `contract_managers.gestor_user_id` | IN_APP | Varredura periódica | `ALERT::ANIVERSARIO_REAJUSTE::{key}::ANO_{ciclo}::{userId}` | `/contratos/{contractKey}` | **DEPENDE DE INFRAESTRUTURA** |
| Fatura vencida / vencimento iminente | `paymentFollowUpService`/`contract_payment_cycles` | Canônica (`severityFromPaymentStatusPrazo`) | `contract_payment_cycles.responsavel_user_id` | IN_APP | Evento + varredura | `PGTO::{cycleKey}::FATURA_VENCIDA::{userId}` | `/contratos/{contractKey}` | **PRONTO** |
| CGOFI sem resposta | idem | Canônica (`severityFromPaymentAlertNivel`) | idem | IN_APP | Varredura (marco discreto D5/D10) | `PGTO::{cycleKey}::CGOFI_SEM_RESPOSTA::D5::{userId}` | `/contratos/{contractKey}` | **DEPENDE DE INFRAESTRUTURA** |
| Documentação pendente / margem estreita | idem | Canônica | idem | IN_APP | Evento | idem | idem | **DEPENDE DE DADO** (alertas hoje são contadores agregados, não eventos individuais — ver Fase 10-A) |
| Vigência de Ata (180d/90d) | `centralPrazosService` | ATENCAO/INFO (via GAP §3.6) | `ata_managers.gestor_user_id` | IN_APP | Varredura periódica | `ATA::{ataKey}::VIGENCIA::GATILHO_90D::VIG_{dataFim}::{userId}` | `/atas/detalhe/{ataKey}` | **DEPENDE DE INFRAESTRUTURA** |
| Saldo crítico de item de Ata (≥85%) | `balanceService.classifyArpItemSaldo` | Canônica | `ata_managers.gestor_user_id` | IN_APP | Evento (mudança de saldo) | `ATA::{itemKey}::SALDO_CRITICO::{userId}` | `/atas/detalhe/{ataKey}` | **PRONTO** |
| Saldo próximo do limite (70–84%) | idem | ATENCAO | idem | IN_APP | Evento | idem | idem | **DEPENDE DE DADO** (decisão de produto: notificar "próximo" ou só "crítico"?) |

**Situação legenda**: PRONTO (regra+dado+destinatário resolvíveis hoje, falta só o mecanismo genérico desta arquitetura) · DEPENDE DE DADO (falta decisão/granularidade de regra) · DEPENDE DE INFRAESTRUTURA (falta scheduler, que não será criado nesta fase) · NÃO NOTIFICAR (Seção 31).

---

## 26. MVP

**Confirmado no código como o corte correto**: IN_APP, escopo mínimo:

- Tabela única `notifications` (Seção 27).
- Destinatário sempre `auth.users` real (nunca texto).
- Severidade canônica (`SeverityLevel`).
- Estados: ENVIADA/LIDA/ARQUIVADA (+ CANCELADA, Seção 8).
- Deep link determinístico a partir de `entity_type`/`entity_key`.
- Idempotência via `notification_key` único.
- **Sem e-mail, sem WhatsApp, sem preferências.**
- **Eventos iniciais do MVP restritos aos classificados como PRONTO na matriz** (tarefas vencidas/próximas de contrato e Ata, fatura vencida, saldo crítico de Ata) — todos **evento-síncronos**, não dependem do scheduler inexistente. Os eventos "DEPENDE DE INFRAESTRUTURA" ficam para quando um mecanismo de varredura periódica for resolvido (fora do escopo desta fase e do MVP).

---

## 27. Modelo de banco proposto (conceitual — nenhuma migration criada)

**Tabela `notifications`** (nome final a confirmar na implementação):

| Coluna | Tipo | Nullable | FK/Unique/Índice | Função |
|---|---|---|---|---|
| `id` | UUID | Não | PK | Identidade técnica da linha |
| `notification_key` | VARCHAR(250) | Não | UNIQUE | Idempotência (Seção 7) |
| `recipient_user_id` | UUID | Não | FK `auth.users(id)`, índice | Destinatário real |
| `entity_type` | VARCHAR(20) | Não | CHECK IN ('CONTRATO','ATA','PAGAMENTO') | Para deep link e agrupamento |
| `entity_key` | VARCHAR(150) | Não | índice | Para deep link |
| `event_type` | VARCHAR(60) | Não | — | Qual regra originou (auditoria) |
| `severity` | VARCHAR(10) | Não | CHECK IN SeverityLevel | Canônica, nunca recalculada |
| `title` | VARCHAR(300) | Não | — | Snapshot do texto no momento da geração |
| `description` | TEXT | Sim | — | idem |
| `status` | VARCHAR(20) | Não, default `'ENVIADA'` | CHECK IN ('ENVIADA','LIDA','ARQUIVADA','CANCELADA') | Ciclo de vida (Seção 8) |
| `created_at` | TIMESTAMPTZ | Não, default `NOW()` | — | Auditoria |
| `read_at` | TIMESTAMPTZ | Sim | — | Auditoria/observabilidade |
| `archived_at` | TIMESTAMPTZ | Sim | — | Auditoria |

**RLS conceitual**: `SELECT`/`UPDATE` restritos a `recipient_user_id = auth.uid()`; sem policy de `INSERT`/`DELETE` (escrita só via RPC interna, não detalhada aqui — sua definição é implementação, fora do escopo desta fase).

**Extensão futura, não criada agora**: `notification_deliveries` (`notification_id` FK, `channel`, `status`, `attempted_at`, `delivered_at`, `error`) — só quando um segundo canal existir.

---

## 28. Estratégia de geração

**Ambos os modelos são necessários, não um só**:
- **A. Evento síncrono**: mudança de estado que já passa por uma RPC existente (conclusão de tarefa, avanço de status de ciclo de pagamento) — a própria RPC, ao final de sua transação, poderia (no momento da implementação futura) chamar a rotina de geração de notificação. Cobre os eventos "PRONTO" da matriz.
- **B. Varredura periódica**: prazos temporais (D-30, aniversários, contadores de dias) — **exige um agendador que hoje não existe** (nenhum `pg_cron`, nenhuma Edge Function agendada). Este é um GAP de infraestrutura explícito, não resolvido nesta fase, e não deve ser presumido resolvido só porque a arquitetura o descreve.

---

## 29. Relação com a Central de Atenção

Central de Atenção = projeção atual de riscos/situações (hoje: funil único do Dashboard Gerencial + `ContractActionQueue`/`AtaAttentionCenter`), **100% efêmera**. Notificação = registro dirigido, persistido. Uma situação pode existir na Central sem nunca gerar notificação (ex.: qualquer coisa classificada "NÃO NOTIFICAR", Seção 31, ou qualquer evento "DEPENDE DE INFRAESTRUTURA"). Uma notificação deve sempre poder apontar de volta para a situação que a originou (via `entity_type`/`entity_key`/deep link), mas a Central nunca deve ser persistida inteira como notificações — isso inflaria a tabela com todo alerta efêmero, contrariando o princípio da Seção 4.

---

## 30. Relação com tarefas

Eventos de tarefa recomendados para gerar notificação: **atribuição** (responsável mudou e passou a ter um `_user_id` real), **prazo próximo/vencido** (já coberto pelo funil único), **conclusão por terceiro** (quando quem conclui não é o responsável original — informa o responsável que outra pessoa fechou por ele). **Não recomendado**: notificar cada edição de campo secundário (observação, reordenação) — risco de ruído sem ação necessária, contrariando o princípio de que notificação sempre implica potencial ação humana.

---

## 31. O que NÃO notificar automaticamente

- Decisões jurídicas, decisão de prorrogar, de reajustar, de repactuar, de reequilibrar — são atos administrativos humanos, o sistema no máximo alerta a janela, nunca decide ou anuncia a decisão em nome de ninguém.
- Aprovação, julgamento administrativo.
- Criação de fato oficial sem regra de comunicação explícita associada.
- Eventos puramente informativos sem ação necessária (ex.: sincronização de empenhos concluída com sucesso).
- Qualquer situação cujo destinatário não seja resolvível por identidade real (Seção 8) — preferir não notificar a inventar um destinatário técnico a partir de texto livre.

---

## 32. GAPs

1. **Fragmentação residual de severidade** (Seção 3.6): `contractActionQueueService.ts` deriva ATENCAO/INFO por threshold inline para itens `TAREFA(8-30d)`/`LEMBRETE`, em vez de chamar os conversores canônicos de `severityService.ts`. Não bloqueante para esta arquitetura, mas deve ser corrigido no momento em que esses mesmos itens alimentarem geração de notificação (para não herdar uma terceira reimplementação do mesmo threshold).
2. **Ausência de scheduler** — bloqueia toda a classe "varredura periódica" da matriz (Seção 16/28). Não resolvido nesta fase, nem deveria ser (regra absoluta desta fase).
3. **Cobertura parcial de identidade de destinatário** — `_user_id` só é preenchido quando o responsável é escolhido via `ResponsavelField` como conta do sistema; cobertura real depende de adoção operacional, não de código.
4. **Escopo de RLS por contrato/unidade continua inexistente** (GAP transversal desde a Fase 10-A) — limita quão amplamente uma notificação pode ser gerada com segurança (Seção 9).
5. **Destinatário coletivo (unidade)** não é resolvível hoje — nenhuma tabela associa unidade a usuários-membros.
6. **`ataEventService.ts` continua órfão** (zero consumidores, reconfirmado nesta fase) — não é um bloqueador de Fase 10-B (não gera nenhum evento notificável específico próprio), mas segue como dependência da Fase 10-F, agora com a infraestrutura de Ata (gestores, planos de tarefas) já mais madura ao seu redor.

---

## 33. Roadmap (revisado com base na evidência desta fase)

O roadmap original permanece majoritariamente válido, com um ajuste: a divisão entre "automação de prazos" e "automação contratual" (10-C/10-E) deve ser reconsiderada à luz de que ambas dependem do MESMO bloqueador (scheduler inexistente), enquanto pagamentos e tarefas (10-D parcial, e a parte de tarefas de 10-C) já estão **PRONTOS** e não dependem de scheduler — sugerindo começar por aí.

1. **10-C — Implementação do MVP de Notificações (IN_APP) + Automação de Tarefas/Pagamentos "PRONTO"**: cobre os eventos síncronos já resolvíveis hoje (tarefa vencida/próxima, fatura vencida, saldo crítico de Ata) — não depende de scheduler.
2. **10-D — Infraestrutura de varredura periódica**: resolver o bloqueador de scheduler (decisão de produto + arquitetura própria, incluindo segurança de execução) antes de qualquer evento "DEPENDE DE INFRAESTRUTURA" poder ser implementado.
3. **10-E — Automação contratual temporal** (prorrogação, reajuste, vigência de Ata) — depende de 10-D.
4. **10-F — Integração de `ataEventService.ts`** (classificação de eventos de Ata, prontidão de prorrogação) — agora mais barata dado que a infraestrutura de gestão de Ata já existe.
5. **10-G — Destinatários coletivos, preferências, fechamento do GAP de escopo por contrato/unidade.**
6. **10-H — Homologação geral e canais adicionais (e-mail/WhatsApp), se decidido.**

---

## 34. Critério para 10-C

10-C só deve iniciar quando:
- O modelo de `notifications` (Seção 27) estiver implementado e homologado (migration real, RLS real testada em Postgres — mesmo padrão de rigor da Fase 10-A.2.1).
- A geração síncrona (Seção 28-A) estiver conectada a pelo menos um evento "PRONTO" da matriz, ponta a ponta, sem depender do scheduler ainda inexistente.
- O GAP de severidade residual (Seção 32.1) estiver corrigido para os eventos que 10-C efetivamente implementar.

---

## 35. Conclusão

A base homologada pelas Fases 10-A a 10-A.2.1 permanece íntegra, mesmo após um volume substancial de trabalho externo paralelo que reestruturou a Central de Atenção por contrato. Essa reestruturação, na verdade, **antecipou e validou** boa parte do que esta fase precisava desenhar: `reminder_dismissals` já prova, em produção, o padrão de chave idempotente que a Seção 7 generaliza; `ResponsavelField` já prova, em uso real, que a ponte de identidade das fases anteriores é operacionalmente viável; `ata_managers.gestor_user_id` fecha, para Atas, o mesmo gap que já havia sido fechado para contratos.

O que falta — e é precisamente o que esta fase entrega — é a generalização desses padrões já comprovados em uma única entidade `notifications`, com destinatário sempre real, severidade sempre canônica, e separação explícita entre o que é apenas dispensável/efêmero (`reminder_dismissals`, Central de Atenção) e o que é, de fato, uma entrega dirigida e auditável a uma pessoa.

---

## STATUS FASE 10-B: **GO**

Todos os itens exigidos pelo critério de saída estão definidos, sem ambiguidade estrutural sobre identidade, destinatário, autorização, ownership, idempotência, persistência ou a fronteira alerta/tarefa/notificação:

- Conceito único de notificação — definido (Seção 6).
- Modelo mínimo — definido, 1 tabela para o MVP (Seção 5/27).
- Destinatário — definido, com classificação honesta de cobertura parcial (Seção 8).
- Autorização — definida conceitualmente, com o GAP de escopo de RLS explicitamente reconhecido como limite, não fingido resolvido (Seção 9).
- Severidade — reutilizada integralmente, sem taxonomia nova (Seção 10).
- Idempotência — definida, generalizando um padrão já em produção (Seção 7/17).
- Ciclo de vida — definido, 4 estados (Seção 8).
- Estratégia de entrega — definida, IN_APP único, sem canal assíncrono (Seção 26).
- Canal inicial — IN_APP (Seção 12).
- Deep link — determinístico, sem URL persistida (Seção 20).
- RLS conceitual — definida (Seção 23), sem alteração real de RLS.
- Auditoria — definida (Seção 21).
- Relação com Central de Atenção — definida, sem sobreposição (Seção 29).
- Relação com tarefas — definida (Seção 30).
- Eventos candidatos — classificados, matriz completa (Seção 24-25).
- MVP — definido, restrito aos eventos "PRONTO" (Seção 26).
- Roadmap — revisado com base em evidência real desta fase (Seção 33).

Nenhuma migration, tabela, RPC, Edge Function, cron, scheduler, worker, fila, e-mail, WhatsApp ou push foi criado. Nenhuma RLS ou regra de negócio foi alterada. A Fase 10-C não foi iniciada.

Aguardando autorização para prosseguir.
