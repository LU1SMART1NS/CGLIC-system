# SALDOARP — FASE 4.4C
## RELATÓRIO DE IMPLEMENTAÇÃO: WORKFLOW MÍNIMO DE EXTINÇÃO ANTECIPADA E RESCISÃO CONTRATUAL

### 1. Resumo Executivo
A **Fase 4.4C** implementou o workflow operacional para o acompanhamento assistido e estruturado de procedimentos de **Extinção Antecipada e Rescisão Contratual** (unilateral, consensual/distrato e judicial/arbitral), integrando o modelo de domínio puro da Fase 4.4A com a infraestrutura de `contract_tasks` e a semântica de execução da Fase 4.3C (`TaskExecutionMode`).

---

### 2. Princípios e Regras Rigorosamente Respeitados

1. **Separação Ontológica Estrita**:
   $$\text{FATO/MOTIVO} \to \text{INSTRUÇÃO INTERNA} \to \text{DECISÃO/FORMALIZAÇÃO} \to \text{CONFIRMAÇÃO OFICIAL} \to \text{EVENTO OFICIAL SOBERANO}$$
   - Conclusão interna ou assinatura de despacho/termo **NÃO** torna o contrato extinto nem soberano.
   - O status soberano e o evento formal de extinção só são gerados com a confirmação oficial via API governamental (PNCP/Contratos.gov.br).

2. **Princípio "Digite Uma Vez, Use em Todo Lugar" (Template 100% Condicional)**:
   - Se o processo SEI já estiver vinculado $\to$ tarefa de autuação é omitida.
   - Se o contraditório/ampla defesa ou parecer jurídico já tiverem sido registrados $\to$ tarefas respectivas são omitidas.
   - Se a decisão administrativa ou a publicação oficial já tiverem ocorrido $\to$ tarefas de formalização são omitidas.
   - Tarefas financeiras e de garantia só são geradas se houver pendências reais apontadas no checklist.

3. **Semântica de Execução (`TaskExecutionMode`)**:
   - `INTERNA`: Trabalho intelectual, instrução processual e decisões no SaldoARP / SEI.
   - `EXTERNA`: Ações executadas nos sistemas oficiais externos (Contratos.gov.br, SICAF, PNCP).
   - `CONFIRMACAO`: Monitoramento e captura do fato oficial retornado pelas APIs públicas governamentais.

4. **Zero Duplicação e Zero Modificações de Banco**:
   - 0 novas migrations (preservando a integridade do banco).
   - 0 novas tabelas ou RPCs.
   - Reutilização exclusiva da infraestrutura de `contract_tasks`, `processos_sei` e `Central de Prazos`.

---

### 3. Artefatos Criados e Modificados

1. `src/types/contractRescissionWorkflows.ts` (NOVO):
   - Tipos canônicos de status: `ContractRescissionWorkflowStatus` (`NAO_INICIADO`, `EM_ANALISE`, `COM_PENDENCIAS`, `EM_INSTRUCAO`, `AGUARDANDO_DECISAO`, `EM_FORMALIZACAO`, `AGUARDANDO_CONFIRMACAO`, `CONCLUIDO_INTERNAMENTE`, `CONCLUIDO_OFICIALMENTE`, `CANCELADO`).
   - Interfaces: `RescissionDecisionRecord`, `RescissionFormalizationRecord`, `RescissionOfficialConfirmation`, `ContractRescissionWorkflow`.

2. `src/services/contractRescissionWorkflowService.ts` (NOVO):
   - `generateRescissionWorkflowId(...)`: Chave determinística canônica (`WF::EXTINCAO::{contractKey}::{tipoExtincao}::{cycleRef}{::identificador}`).
   - `buildConditionalRescissionTemplate(...)`: Gera template adaptativo com macrotarefas e tarefas mapeadas por `TaskExecutionMode`.
   - `deriveRescissionWorkflowStatus(...)`: Máquina de estados determinística pura.
   - `assembleRescissionWorkflow(...)`: Montador funcional do workflow e sua classificação de oficialidade.
   - `confirmRescissionWorkflowOfficially(...)`: Transiciona para `CONCLUIDO_OFICIALMENTE`, gera `ContractEvent` com impacto `EXTINGUE_CONTRATO` e projeta o estado do contrato.

3. `src/types/contractExtinctions.ts` (ATUALIZADO):
   - Ajustada a interface `ExtinctionMotivation` com propriedades opcionais e suporte a `documentoSeiComprobatorio`.

4. `src/types/index.ts` (ATUALIZADO):
   - Exportação pública dos tipos do workflow de rescisão.

5. `src/services/__tests__/contractRescissionWorkflowService.test.ts` (NOVO):
   - 16 testes cobrindo todas as modalidades (Unilateral, Consensual, Judicial/Arbitral), não duplicação de tarefas, ciclo de vida progressivo, conclusão interna vs. confirmação soberana e geração idempotente de eventos.

---

### 4. Resultados da Validação

- **Vitest**: **57 arquivos de teste / 511 testes PASS (100% sucesso)**.
- **TypeScript Build (`tsc -b && vite build`)**: **Aprovado com 0 erros**.
- **Migrations**: **0 migrations adicionadas**.
