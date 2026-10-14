# SALDOARP — FASE 5.4: AUDITORIA E PLANEJAMENTO DE ARQUITETURA
## PAINEL DE WORKFLOWS OPERACIONAIS DO CONTRATO 360°

**Data de Realização:** 2026-09-23  
**Status do Projeto:** Fase 5.3 Homologada (61 arquivos / 545 testes PASS)  
**Objetivo desta Etapa:** Auditoria exaustiva e planejamento arquitetural dos workflows operacionais no Contrato 360°, sem alteração de banco, migrations, RPCs ou implementação de código de produção.

---

## 1. ESTADO ATUAL

### 1.1 O que já existe no Núcleo de Domínio (Fases 4.1 a 4.4C)
O SaldoARP consolidou nas fases anteriores uma suíte completa de serviços de domínio puros e determinísticos para a gestão do ciclo de vida contratual:

* **Fase 4.1 — Contract Events (`contractEvents.ts`, `contractEventService.ts`):**  
  Modelagem imutável de eventos com distinção formal entre `FATO_OFICIAL`, `DECISAO_INTERNA` e `PROPOSTA_SOLICITACAO`.
* **Fase 4.2 — Prorrogação Contratual (`contractProrrogation.ts`, `contractProrrogationService.ts`):**  
  Cronograma preventivo (180d, 120d, 90d, 60d, 15d), checklist de prontidão (Art. 106/107 da Lei 14.133/2021) e cálculo de tempestividade.
* **Fase 4.3A e 4.3B — Alterações / Apostilamentos (`contractAmendments.ts`, `contractAmendmentWorkflows.ts`, `contractAmendmentWorkflowService.ts`):**  
  Workflows para acréscimo, supressão, reajuste, repactuação e apostilamentos, com controle estrito de limites legais e rastreabilidade orçamentária.
* **Fase 4.3C — Task Execution Semantics:**  
  Semântica formal de execução para tarefas (`INTERNA`, `EXTERNA`, `CONFIRMACAO`).
* **Fase 4.4A, 4.4B e 4.4C — Extinção Contratual Regular e Antecipada (`contractExtinctions.ts`, `contractClosureWorkflows.ts`, `contractClosureWorkflowService.ts`, `contractRescissionWorkflows.ts`, `contractRescissionWorkflowService.ts`):**  
  Workflows para encerramento regular (TRD, garantias, liquidação) e extinção antecipada/rescisão (motivações legais do Art. 137 da Lei 14.133/2021, contraditório, parecer jurídico).

### 1.2 O que já existe na Interface do Contrato 360° (Fases 5.1 a 5.3)
A página `src/components/contracts/Contract360Page.tsx` possui a estrutura modular organizada em 6 blocos:

* **Bloco 1:** Central de Atenção (`ContractAttentionCenter.tsx` — Fase 5.2).
* **Bloco 2 (Placeholder):** `id="contract-workflows-section"`, com título *"Workflows do Contrato"* e subtitle *"Instrução e acompanhamento de Prorrogações (4.2), Alterações/Apostilamentos (4.3B) e Rescisões (4.4C)"*, renderizando atualmente um banner informativo estático de aviso de aguardo da Fase 5.4.
* **Bloco 3:** Tarefas e Providências (`ContractTasksSection.tsx` — Fase 5.2).
* **Bloco 4:** Linha do Tempo Contratual (`ContractEventsTimeline.tsx` — Fase 5.3).
* **Bloco 5:** Resumo e Dados Cadastrais (`Contract360Summary.tsx` — Fase 5.1).
* **Bloco 6 (Placeholder):** Informações Complementares (Itens, Empenhos, Processo SEI — previsto para Fase 5.5).

### 1.3 Baseline de Testes e Confiabilidade
* **Vitest:** 61 arquivos de teste / 545 testes PASS (100% verde).
* **TypeScript:** `tsc -b` sem erros.
* **Bundle:** `vite build` sem erros.
* **Linter:** `oxlint` 0 erros e 0 warnings.
* **Banco:** 0 migrations novas, 0 RPCs novas.

---

## 2. ARQUITETURA ATUAL

### 2.1 Princípio Fundamental da Arquitetura
A arquitetura do SaldoARP estabelece uma fronteira ontológica estrita:

$$\text{FATO OFICIAL SOBERANO} \neq \text{EVENTO FORMAL} \neq \text{WORKFLOW OPERACIONAL} \neq \text{TAREFA INDIVIDUAL}$$

* **Fato Oficial:** Acontecimentos registrados em diários oficiais e plataformas soberanas (PNCP, Contratos.gov.br).
* **Evento Contratual:** Projeção imutável do histórico contratual na linha do tempo.
* **Workflow Operacional:** Processo colaborativo de trabalho e instrução administrativa (atos preparatórios, pareceres, despachos).
* **Tarefa:** Providência atômica com responsável, prazo e semântica de execução (`INTERNA`, `EXTERNA`, `CONFIRMACAO`).

### 2.2 Diagrama da Cadeia de Dados Atual

```text
┌────────────────────────────────────────────────────────────────────────┐
│             SISTEMAS OFICIAIS SOBERANOS (PNCP / Contratos.gov.br)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Carga canônica
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│            DADO CANÔNICO DO CONTRATO (ContractDashboardRecord)          │
└─────────┬─────────────────────────┬──────────────────────────┬─────────┘
          │                         │                          │
          ▼                         ▼                          ▼
┌──────────────────┐      ┌──────────────────┐       ┌──────────────────┐
│  MOTOR TEMPORAL  │      │ EVENTOS OFICIAIS │       │ PLANO DE TAREFAS │
│ (temporalEngine) │      │  (Fase 4.1 / 5.3)│       │ (Fase 4.3C / 5.2)│
└─────────┬────────┘      └─────────┬────────┘       └─────────┬────────┘
          │                         │                          │
          ▼                         ▼                          ▼
┌──────────────────┐      ┌──────────────────┐       ┌──────────────────┐
│  ALERTAS / PRAZOS│      │ TIMELINE 360°    │       │CENTRAL DE ATENÇÃO│
│ (Vigência/Ciclo) │      │(Histórico Oficial│       │E TAREFAS DO 360° │
└─────────┬────────┘      └──────────────────┘       └─────────┬────────┘
          │                                                    │
          └─────────────────────────┬──────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             SERVIÇOS DE DOMÍNIO DE WORKFLOWS (Fases 4.2 / 4.3B / 4.4)  │
│  - contractProrrogationService.assembleProrrogationWorkflow           │
│  - contractAmendmentWorkflowService.assembleAmendmentWorkflow         │
│  - contractClosureWorkflowService.assembleClosureWorkflow             │
│  - contractRescissionWorkflowService.assembleRescissionWorkflow       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Entidades em memória
                                    ▼
                         [ BLOCO 2 DO 360° ]
                  (Atualmente Placeholder Estático)
```

---

## 3. WORKFLOWS EXISTENTES NO DOMÍNIO

| Workflow | Identificador Canônico | Serviço de Domínio | Status Canônicos | Macroetapas e Templates |
| :--- | :--- | :--- | :--- | :--- |
| **Prorrogação Contratual (4.2)** | `WF::PRORROGACAO::{contractKey}::{cycleRef}` | `contractProrrogationService.ts` | `NAO_INICIADO`<br>`EM_ANALISE_INTERESSE`<br>`AGUARDANDO_FORNECEDOR`<br>`EM_PESQUISA_PRECOS`<br>`EM_INSTRUCAO_MINUTA`<br>`EM_ANALISE_JURIDICA`<br>`AGUARDANDO_ASSINATURA_PUBLICACAO`<br>`CONCLUIDO_PRORROGADO`<br>`CONCLUIDO_NAO_PRORROGADO`<br>`CANCELADO` | **5 Macroetapas:**<br>1. Análise Preliminar e Interesse (D-180)<br>2. Consulta Fornecedor (D-120)<br>3. Pesquisa de Preços/Vantajosidade (D-90)<br>4. Minuta e Parecer Conjur (D-60)<br>5. Assinatura e Publicação PNCP (D-15) |
| **Alterações e Apostilamentos (4.3B)** | `WF::ALTERACAO::{contractKey}::{tipo}::{cycleRef}{::id}` | `contractAmendmentWorkflowService.ts` | `NAO_INICIADO`<br>`EM_ANALISE`<br>`EM_INSTRUCAO`<br>`AGUARDANDO_DOCUMENTACAO`<br>`AGUARDANDO_ANALISE_JURIDICA`<br>`AGUARDANDO_DECISAO`<br>`AGUARDANDO_FORMALIZACAO`<br>`AGUARDANDO_PUBLICACAO`<br>`AGUARDANDO_CONFIRMACAO_OFICIAL`<br>`CONCLUIDO_CONFIRMADO`<br>`NAO_APROVADO`<br>`CANCELADO` | **4 Macroetapas:**<br>1. Motivação e Justificativa Técnica<br>2. Análise Jurídica e Parecer Conjur<br>3. Decisão e Formalização do Termo Aditivo / Apostilamento<br>4. Publicação PNCP e Confirmação Oficial |
| **Encerramento Regular (4.4B)** | `WF::ENCERRAMENTO::{contractKey}::{cycleRef}{::id}` | `contractClosureWorkflowService.ts` | `NAO_INICIADO`<br>`EM_ANALISE`<br>`COM_PENDENCIAS`<br>`EM_FORMALIZACAO`<br>`AGUARDANDO_CONFIRMACAO`<br>`CONCLUIDO_INTERNAMENTE`<br>`CONCLUIDO_OFICIALMENTE`<br>`CANCELADO` | **3 Macroetapas:**<br>1. Verificação de Pendências e Obrigações (TRD, Garantias, Saldo)<br>2. Formalização do Termo de Encerramento Interno<br>3. Publicação e Confirmação Oficial |
| **Extinção Antecipada / Rescisão (4.4C)** | `WF::EXTINCAO::{contractKey}::{tipo}::{cycleRef}{::id}` | `contractRescissionWorkflowService.ts` | `NAO_INICIADO`<br>`EM_ANALISE`<br>`COM_PENDENCIAS`<br>`EM_INSTRUCAO`<br>`AGUARDANDO_DECISAO`<br>`EM_FORMALIZACAO`<br>`AGUARDANDO_CONFIRMACAO`<br>`CONCLUIDO_INTERNAMENTE`<br>`CONCLUIDO_OFICIALMENTE`<br>`CANCELADO` | **4 Macroetapas:**<br>1. Motivação Fática e Notificação (Contraditório Art. 137/138 Lei 14.133)<br>2. Análise Jurídica Conjur<br>3. Decisão da Autoridade e Liquidação de Haveres<br>4. Termo de Rescisão e Confirmação Soberana |

---

## 4. FONTE CANÔNICA DOS WORKFLOWS

### 4.1 Natureza da Persistência Atual
* **Não existe uma tabela `contract_workflows` no Supabase.** Essa decisão arquitetural das Fases 4.2 a 4.4C foi intencional para evitar duplicação do estado do contrato e dos sistemas oficiais.
* A persistência física de dados de workflows ocorre através de duas âncoras canônicas:
  1. **Plano de Tarefas (`contract_task_plans` e `contract_tasks`):** As tarefas que realizam as macroetapas dos workflows são gravadas no banco de dados com seus respectivos prazos, status (`PENDENTE`, `EM_ANDAMENTO`, `CONCLUIDA`, `NAO_APLICAVEL`) e semântica de execução (`TaskExecutionMode`).
  2. **Metadados Administrativos:** O responsável pelo contrato reside em `contract_managers` e os autos administrativos residem na integração com `processos_sei` / número do processo do contrato.
* Os workflows são **agregados determinísticos** gerados pelos serviços puros de domínio (`assembleProrrogationWorkflow`, etc.) que cruzam o estado atual do contrato (`ContractDashboardRecord`), os prazos calculados e o plano de tarefas persistido.

### 4.2 Derivação de Status Canônica
Os status operacionais não são "adivinhados" pelo frontend nem alterados livremente; eles decorrem estritamente das funções de domínio já consolidadas:
* `deriveProrrogationStatus(data)`
* `deriveAmendmentWorkflowStatus(data)`
* `deriveClosureWorkflowStatus(data)`
* `deriveRescissionWorkflowStatus(data)`

---

## 5. LACUNAS PARA A INTERFACE (UI)

Para transformar o placeholder do Bloco 2 em uma experiência rica e funcional, as seguintes lacunas devem ser supridas:

1. **Camada de Projeção / Hook Agregador (`useContractWorkflows`):**
   * Atualmente, o frontend tem `useContractTaskPlan` e `useContractEvents`, mas não possui um hook ou seletor para derivar quais workflows estão ativos ou são elegíveis para um contrato específico.
   * Necessidade: Uma função pura de projeção que combine `contract` + `plan` para montar instâncias determinísticas dos workflows em andamento.
2. **Componente de Painel de Workflows (`ContractWorkflowsSection`):**
   * Apresentação estruturada com visualização por cards operacionais.
   * Exibição de:
     * Badges de status com tipografia e cores padronizadas;
     * Identificador determinístico legível (`WF::PRORROGACAO::...`);
     * Barra de progresso / Stepper visual de macroetapas;
     * Metadados chave (Responsável, Processo SEI, Prazo limite);
     * Lista recolhível de tarefas vinculadas àquele workflow com link direto para ação;
     * Alertas de prontidão ou pendências impeditivas (ex: Checklist de prorrogação).
3. **Tratamento de Estado Vazio (Empty State):**
   * Quando um contrato não possuir workflows em andamento (ex: contrato recém-assinado sem vigência próxima de término e sem aditivos em instrução), o painel deve exibir um estado acolhedor e explicativo, esclarecendo os gatilhos para ativação futura.
4. **Respeito aos Limites Visuais:**
   * Evitar duplicação desnecessária com o Bloco 3 (Tarefas) — o Bloco 2 foca no **Processo / Workflow e Macroetapas**, enquanto o Bloco 3 foca na **Execução das Tarefas Individuais**.

---

## 6. MATRIZ DE RISCOS DA IMPLEMENTAÇÃO

| ID | Classificação | Risco | Mitigação Arquitetural |
| :--- | :--- | :--- | :--- |
| **RSK-01** | **CRÍTICO** | Criação de um segundo motor de workflow em React (duplicação de regras de transição na UI). | Proibir estritamente lógica de transição no componente. O componente deve apenas renderizar o que `assemble*Workflow` e `derive*Status` calcularem. |
| **RSK-02** | **ALTO** | Desalinhamento entre o status visual do Workflow e o status das tarefas em `contract_tasks`. | O hook projetor deve inspecionar as tarefas do `ContractTaskPlan` carregado pela query canônica para alimentar as flags dos serviços de domínio. |
| **RSK-03** | **MÉDIO** | Confundir decisão administrativa interna com publicação oficial em diário oficial / PNCP. | Utilizar badges de oficialidade distintos (`DECISAO_INTERNA` vs `FATO_OFICIAL`) preservando a regra de ouro das Fases 4.1 e 5.3. |
| **RSK-04** | **BAIXO** | Poluição visual se um contrato tiver múltiplos aditivos ou workflows simultâneos. | Adotar padrão visual de Accordion / Cards com resumo executivo e detalhamento expansível sob demanda. |

---

## 7. PROPOSTA DE IMPLEMENTAÇÃO FUTURA (FASE 5.4)

### 7.1 Arquitetura dos Novos Componentes
A futura implementação será composta exclusivamente por componentes de visualização e hooks de projeção, sem criar arquivos de banco nem tocar em RPCs:

```text
src/
├── hooks/
│   └── useContractWorkflows.ts       [NOVO HOOK] Deriva os workflows a partir de contract + plan
├── components/contracts/
│   ├── ContractWorkflowsSection.tsx  [NOVO COMPONENTE] Substitui o placeholder no Bloco 2
│   ├── ContractWorkflowCard.tsx      [NOVO COMPONENTE] Renderiza cada workflow individual
│   ├── ContractWorkflowStepper.tsx   [NOVO COMPONENTE] Linha de macroetapas visual
│   └── __tests__/
│       ├── useContractWorkflows.test.ts
│       └── ContractWorkflowsSection.test.tsx
```

### 7.2 Comportamento do Hook Projetor (`useContractWorkflows`)
* **Entradas:** `contract: ContractDashboardRecord`, `plan: ContractTaskPlan | null`.
* **Lógica Pura:**
  1. Se o contrato for passível de prorrogação (dias restantes <= 180 ou template de prorrogação aplicado), invoca `assembleProrrogationWorkflow(...)`.
  2. Se o template de tarefas for de aditivo/apostilamento ou houver registro correspondente, invoca `assembleAmendmentWorkflow(...)`.
  3. Se o contrato estiver no ciclo de encerramento, invoca `assembleClosureWorkflow(...)`.
  4. Se houver indicação de rescisão ou extinção antecipada, invoca `assembleRescissionWorkflow(...)`.
* **Saída:** `{ workflows: AnyContractWorkflow[], activeCount: number, isLoading: boolean }`.

---

## 8. PERSISTÊNCIA

* **A Fase 5.4 necessita de alterações no banco de dados?**  
  **NÃO.**
* **Justificativa:**  
  1. O Supabase já possui todas as tabelas necessárias: `contract_task_plans`, `contract_tasks`, `contract_managers` e `processos_sei`.
  2. Os fluxos de trabalho são modelos operacionais derivados das tarefas e dos dados oficiais do contrato.
  3. Não serão criadas tabelas, colunas, views, functions, triggers, índices, RPCs ou políticas RLS.

---

## 9. CRITÉRIOS DE ACEITE DA FUTURA IMPLEMENTAÇÃO

Quando a implementação da Fase 5.4 for autorizada, os seguintes critérios devem ser cumpridos rigorosamente:

1. **Substituição do Bloco 2:** O placeholder em `src/components/contracts/Contract360Page.tsx` deve ser substituído pelo componente `ContractWorkflowsSection.tsx`.
2. **Fidelidade ao Domínio:** Todos os 4 workflows canônicos devem ser suportados e montados exclusivamente via serviços de domínio existentes (`contractProrrogationService`, `contractAmendmentWorkflowService`, `contractClosureWorkflowService`, `contractRescissionWorkflowService`).
3. **Macroetapas Visuais:** Cada card de workflow ativo deve conter um stepper visual indicando a macroetapa atual, com distinção clara entre etapas concluídas, ativas e futuras.
4. **Semântica de Tarefas:** As tarefas vinculadas aos workflows devem exibir a semântica de execução canônica (`INTERNA`, `EXTERNA`, `CONFIRMACAO`) sem criar lógica divergente da Central de Atenção (Fase 5.2).
5. **Oficialidade Segregada:** Atos internos (despacho, parecer) e fatos oficiais (publicação PNCP) devem ser claramente distinguidos.
6. **Integridade da Suíte de Testes:** Todos os 545 testes atuais devem permanecer 100% verdes, e novos testes unitários com cobertura completa devem ser adicionados para o hook e os componentes.
7. **Qualidade de Código:** `tsc -b`, `vite build` e `oxlint` devem passar com zero erros e zero advertências.

---

## 10. PARECER GO / NO-GO

### PARECER DA AUDITORIA: **GO (APROVADO PARA PLANEJAMENTO)**

* **Diagnóstico:** O núcleo de domínio das Fases 4.2 a 4.4C é coeso, modular e perfeitamente aderente às necessidades da experiência do Contrato 360°. A integração na UI respeitará integralmente os princípios de não-duplicação e soberania do dado canônico.
* **Próximo Passo:** Submeter este relatório à apreciação do usuário. Mediante aprovação formal, iniciar a implementação da Fase 5.4.
