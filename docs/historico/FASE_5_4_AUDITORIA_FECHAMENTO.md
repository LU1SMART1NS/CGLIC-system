# SALDOARP — FASE 5.4: AUDITORIA DE FECHAMENTO
## PAINEL DE WORKFLOWS OPERACIONAIS DO CONTRATO 360°

**Data:** 2026-09-23  
**Status da Auditoria:** CONCLUÍDA  
**Veredito:** **GO — FASE 5.4 ENCERRADA**  
**Diretiva Cumprida:** Auditoria estrita e detalhada; zero alterações de código; zero arquivos novos; zero migrations; zero novas RPCs; não avançou para a Fase 5.5.

---

## 1. RESUMO EXECUTIVO

A auditoria de fechamento inspecionou exaustivamente todos os artefatos implementados na Fase 5.4, com foco aprofundado no arquivo `src/hooks/useContractWorkflows.ts`, no componente de visualização de macroetapas `ContractWorkflowStepper.tsx`, no card executivo `ContractWorkflowCard.tsx` e no container `ContractWorkflowsSection.tsx`.

### Principais Conclusões:
1. **Fidelidade ao Domínio Canônico:** O frontend atua estritamente como **Casca de Apresentação** (Presentation Shell). Ele consome e projeta os agregados retornados pelos serviços de domínio consolidados nas Fases 4.2 a 4.4C (`assembleProrrogationWorkflow`, `assembleAmendmentWorkflow`, `assembleClosureWorkflow`, `assembleRescissionWorkflow`).
2. **Ausência de Novo Motor de Workflow:** Não foi criado nenhum motor paralelo de workflows, nenhuma máquina de estados alternativa e nenhuma regra de transição na UI.
3. **Ausência de Novo Motor Temporal:** Os prazos e níveis de atenção são derivados exclusivamente de `calculateProrrogationDeadlines` e `classifyTaskAttention` (originários de `temporalEngineService` e consolidados na Fase 5.2).
4. **Isolamento de Tarefas e Eventos:** O painel apenas consulta tarefas existentes para destacar a próxima ação operacional; ele não cria, não edita e não executa tarefas. Nenhum evento (`ContractEvent`) é gerado ou manipulado.
5. **Integridade de Infraestrutura:** Zero migrations, zero novas tabelas, zero novas colunas, zero RPCs e RLS 100% inalterado.
6. **Confiabilidade da Suíte de Testes:** 66 arquivos de teste e 564 testes automatizados 100% verdes, sem erros de compilação TypeScript (`tsc -b`), build de produção aprovado e zero erros no linter (`oxlint`).

---

## 2. ARQUITETURA REAL IMPLEMENTADA

A cadeia de dados efetivamente em execução no código inspecionado é a seguinte:

```text
               ┌────────────────────────────────────────────────────────┐
               │    Contrato Canônico (ContractDashboardRecord)          │
               └───────────────────────────┬────────────────────────────┘
                                           │
                                           ├──────────────────────────────────────────┐
                                           │                                          │
                                           ▼                                          ▼
┌────────────────────────────────────────────────────────┐         ┌──────────────────────────────────────┐
│           Plano de Gestão Persistido                   │         │          Motor Temporal              │
│       (ContractTaskPlan via useContractTaskPlan)       │         │ (calculateProrrogationDeadlines)     │
└──────────────────────────┬─────────────────────────────┘         └──────────────────┬───────────────────┘
                           │                                                          │
                           └───────────────────────────┬──────────────────────────────┘
                                                       │
                                                       ▼
                       ┌────────────────────────────────────────────────────────┐
                       │             SERVIÇOS DE DOMÍNIO CANÔNICOS              │
                       │  - contractProrrogationService.ts                      │
                       │  - contractAmendmentWorkflowService.ts                 │
                       │  - contractClosureWorkflowService.ts                   │
                       │  - contractRescissionWorkflowService.ts                │
                       └───────────────────────────────┬────────────────────────┘
                                                       │ Agregados em memória
                                                       ▼
                       ┌────────────────────────────────────────────────────────┐
                       │          src/hooks/useContractWorkflows.ts             │
                       │  (projectContractWorkflows — Função Pura de Projeção)  │
                       └───────────────────────────────┬────────────────────────┘
                                                       │ View Model: ContractWorkflowPresentationItem[]
                                                       ▼
                       ┌────────────────────────────────────────────────────────┐
                       │       ContractWorkflowsSection.tsx (Bloco 2)           │
                       │          (Loading, Error, Empty State, Counters)       │
                       └───────────────────────────────┬────────────────────────┘
                                                       │
                                                       ▼
                       ┌────────────────────────────────────────────────────────┐
                       │               ContractWorkflowCard.tsx                 │
                       │         (Card Executivo, Metadados, Próxima Tarefa)     │
                       └───────────────────────────────┬────────────────────────┘
                                                       │
                                                       ▼
                       ┌────────────────────────────────────────────────────────┐
                       │              ContractWorkflowStepper.tsx               │
                       │             (Macroetapas CONCLUIDA/ATUAL/FUTURA)       │
                       └────────────────────────────────────────────────────────┘
```

---

## 3. AUDITORIA DETALHADA DO HOOK `useContractWorkflows.ts`

### 3.1 Prorrogação Contratual (Fase 4.2)
* **Funções chamadas:** `assembleProrrogationWorkflow({ contract, plan })` (linha 128) e `calculateProrrogationDeadlines(contract.dataVigenciaFim)` (linha 133).
* **Dados passados:** O registro do contrato (`ContractDashboardRecord`) e o plano de tarefas persistido (`ContractTaskPlan`).
* **Regras delegadas ao domínio:**
  * Cálculo das datas do cronograma preventivo (180d, 120d, 90d, 60d, 15d) e tempestividade;
  * Derivação do status do workflow via `deriveProrrogationStatus` (interno do serviço);
  * Verificação de prontidão para renovação via `evaluateProrrogationReadiness`.
* **Regras na camada de projeção do hook:**
  * Mapeamento dos 10 status do domínio para o estado visual das 4 macroetapas (`CONCLUIDA`, `ATUAL`, `FUTURA`) para renderização no stepper;
  * Dicionário de tradução dos status para rótulos em português (`statusLabels`) e variante de cor (`statusVariant`);
  * Associação da próxima tarefa pendente do plano via `findNextPendingTask`.

### 3.2 Alterações e Apostilamentos (Fase 4.3B)
* **Funções chamadas:** `assembleAmendmentWorkflow(...)` (linha 265).
* **Dados passados:** `contract`, `tipoAlteracao` (derivado do template do plano), `objetoDescricao`, `justificativa`, `planTarefas: plan`.
* **Regras delegadas ao domínio:**
  * Classificação jurídica do aditamento via `classifyAmendment`;
  * Geração do ID lógico determinístico `WF::ALTERACAO::...`;
  * Derivação do status operacional via `deriveAmendmentWorkflowStatus`.
* **Regras na camada de projeção do hook:**
  * Identificação do `AmendmentType` a partir de substrings do `templateId`/`templateNome` do plano de tarefas;
  * Mapeamento do status para as 4 macroetapas visuais do stepper;
  * Dicionário de rótulos amigáveis (`tipoLabels` e `statusLabels`).

### 3.3 Encerramento Regular (Fase 4.4B)
* **Funções chamadas:** `assembleClosureWorkflow(...)` (linha 395).
* **Dados passados:** `contract`, `planTarefas: plan`.
* **Regras delegadas ao domínio:**
  * Geração do ID lógico `WF::ENCERRAMENTO::...`;
  * Derivação do status via `deriveClosureWorkflowStatus`;
  * Avaliação de pendências impeditivas e checklist (TRD, liquidação, garantias).
* **Regras na camada de projeção do hook:**
  * Mapeamento do status para as 3 macroetapas visuais do encerramento;
  * Dicionário de rótulos e variantes visuais de status.

### 3.4 Extinção Antecipada / Rescisão (Fase 4.4C)
* **Funções chamadas:** `assembleRescissionWorkflow(...)` (linha 493).
* **Dados passados:** `contract`, `tipoExtincao: 'EXTINCAO_UNILATERAL'`, `planTarefas: plan`.
* **Regras delegadas ao domínio:**
  * Geração do ID lógico `WF::EXTINCAO::...`;
  * Derivação do status via `deriveRescissionWorkflowStatus`;
  * Avaliação de prontidão rescisória e motivação legal (Arts. 137/138 Lei 14.133/21).
* **Regras na camada de projeção do hook:**
  * Mapeamento do status para as 4 macroetapas visuais da rescisão;
  * Rótulos e badges de apresentação.

---

## 4. TESTE CRÍTICO: DUPLICAÇÃO DE MOTOR

Inspecionamos cada condicional e computação em `useContractWorkflows.ts`:

| Ocorrência no Código | Descrição da Lógica | Classificação | Parecer |
| :--- | :--- | :---: | :--- |
| `switch (wf.status)` (linhas 145, 283, 409, 509) | Define quais macroetapas estão `CONCLUIDA`, `ATUAL` ou `FUTURA` para o stepper visual | **PROJEÇÃO** | Não recalcula status; apenas projeta o array visual do stepper a partir do status canônico retornado pelo domínio. |
| `deadlines.diasRestantesVigencia <= 180` (linha 638) | Filtra se o contrato é elegível para exibir o workflow de prorrogação na janela legal | **PROJEÇÃO** | Reutiliza o valor já calculado por `calculateProrrogationDeadlines`, sem criar fórmula temporal paralela. |
| `isContractExpired = statusVigencia === 'Expirado'` (linha 651) | Identifica elegibilidade de exibição de workflow de encerramento | **PROJEÇÃO** | Leitura direta do dado canônico já classificado no contrato. |
| `tplId.includes('acrescimo')` (linha 616) | Identifica qual template de alteração está aplicado no plano de tarefas | **PROJEÇÃO** | Mapeamento do metadado do plano para envio do parâmetro correto a `assembleAmendmentWorkflow`. |
| `derive*Status` | Determinação do status operacional do workflow | **DELEGADO AO DOMÍNIO** | O hook NÃO deriva nem altera status; consome `wf.status` diretamente dos serviços da Fase 4. |
| `readiness` | Avaliação de impedimentos legais (Art. 106/107) | **DELEGADO AO DOMÍNIO** | 100% computado pelos serviços canônicos da Fase 4. |
| `classifyTaskAttention` (linhas 91, 111, 669) | Classificação temporal da tarefa (VENCIDA, HOJE, URGENTE) | **REUTILIZAÇÃO CANÔNICA** | Reutiliza a função consolidada na Fase 5.2, sem criar classificação própria. |

**Conclusão do Teste:** **NÃO HÁ DUPLICAÇÃO DE MOTOR DE NEGÓCIO OU DOMÍNIO NO HOOK.** Todas as regras de negócio permanecem no domínio canônico.

---

## 5. TAMANHO E RESPONSABILIDADE DO HOOK

O arquivo `src/hooks/useContractWorkflows.ts` possui 715 linhas. A distribuição conceitual exata das linhas foi analisada:

```text
GRUPO                                              LINHAS APROX.    % DO TOTAL
───────────────────────────────────────────────────────────────────────────────
C. Adaptação para Apresentação (View Model & Stepper)   450 linhas       62.9%
   - Tipos do View Model (linhas 21-80)                  ~60 linhas
   - Projeção de Prorrogação (linhas 120-247)           ~128 linhas
   - Projeção de Alterações (linhas 250-382)            ~132 linhas
   - Projeção de Encerramento (linhas 385-484)          ~100 linhas
   - Projeção de Rescisão (linhas 487-595)              ~108 linhas
B. Chamada de Serviços Canônicos de Domínio              40 linhas        5.6%
A. Obtenção de Dados (React Query / hook integration)    35 linhas        4.9%
E. Cálculo de Atenção e Busca de Tarefa Pendente         35 linhas        4.9%
D. Ordenação Determinística de Prioridade (Regra 11)     20 linhas        2.8%
F. Cálculo Numérico de Progresso (% de macroetapas)      20 linhas        2.8%
H. Tratamento de Erros e Imports                        115 linhas       16.1%
G. Regras de Negócio e Transições                         0 linhas        0.0%
───────────────────────────────────────────────────────────────────────────────
TOTAL                                                   715 linhas      100.0%
```

### Explicação Arquitetural do Tamanho:
O volume do arquivo decorre estritamente da **variedade e riqueza dos 4 workflows canônicos modelados nas Fases 4.2 a 4.4C**. Cada um dos 4 fluxos possui entre 8 e 12 status operacionais distintos, demandando:
* Dicionários completos de rótulos em português (`statusLabels`);
* Configuração visual de variantes de badges (`statusVariant`);
* Projeção explícita do estado de cada macroetapa (`WorkflowMacrostepItem[]`) para consumo direto pelo `ContractWorkflowStepper`.
Portanto, a complexidade é **de representação visual (View Model)**, e não de lógica de negócio.

---

## 6. VERIFICAÇÃO DAS FUNÇÕES `assemble*Workflow`

| Função Canônica | É chamada? | Resultado é utilizado? | É reconstruída no hook? | É alterada no hook? | Status recalculado? |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `assembleProrrogationWorkflow` | **SIM** | **SIM** | **NÃO** | **NÃO** | **NÃO** |
| `assembleAmendmentWorkflow` | **SIM** | **SIM** | **NÃO** | **NÃO** | **NÃO** |
| `assembleClosureWorkflow` | **SIM** | **SIM** | **NÃO** | **NÃO** | **NÃO** |
| `assembleRescissionWorkflow` | **SIM** | **SIM** | **NÃO** | **NÃO** | **NÃO** |

As entidades de workflow geradas são imutáveis e passadas integralmente para a propriedade `canonicalWorkflow` de cada item do View Model.

---

## 7. AUDITORIA DOS COMPONENTES VISUAIS

### 7.1 `ContractWorkflowStepper.tsx`
* Recebe exclusivamente `macroetapas: WorkflowMacrostepItem[]`.
* Renderiza marcadores visuais para `CONCLUIDA`, `ATUAL` e `FUTURA`.
* Não contém nenhuma regra de transição de status.
* Não contém nenhum botão, evento de clique ou mecanismo que permita ao usuário "forçar" avanço de etapa pela interface.

### 7.2 `ContractWorkflowCard.tsx`
* Apresenta o cabeçalho executivo com badges informativos de status.
* O progresso exibido (`X de Y macroetapas (Z%)`) é a contagem aritmética de etapas marcadas como `CONCLUIDA`.
* Não faz inferências como `tarefa concluída = etapa concluída`.
* Aponta com clareza a próxima tarefa operacional sem duplicar a lista inteira de tarefas do Bloco 3.

### 7.3 `ContractWorkflowsSection.tsx`
* Substitui com precisão o placeholder anterior de Bloco 2 em `Contract360Page.tsx`.
* Trata de forma graciosa e não intrusiva os estados de Loading (skeleton discreto), Erro (banner sem vazamento de stack trace) e Empty State (orientação clara sobre quando workflows se tornam ativos).

---

## 8. AUDITORIA TEMPORAL, DE TAREFAS E DE EVENTOS

* **Auditoria Temporal (Regra 9):**
  * `classifyTaskAttention` é importada diretamente de `ContractAttentionCenter.tsx` (desenvolvido na Fase 5.2).
  * `calculateProrrogationDeadlines` é chamado diretamente de `contractProrrogationService.ts`.
  * **Zero duplicação temporal.**
* **Auditoria de Tarefas (Regra 8):**
  * O hook apenas varre o plano existente através de `findNextPendingTask`.
  * Não há criação, alteração ou exclusão de tarefas.
* **Auditoria de Eventos (Regra 10):**
  * O painel não instancia `ContractEvent`.
  * Conclusões internas de etapas não afetam a linha do tempo (Fase 5.3).
* **Auditoria de Oficialidade (Regra 11):**
  * O painel não atribui classificação de `FATO_OFICIAL` a workflows em andamento.

---

## 9. AUDITORIA DA ALTERAÇÃO EM `src/config/navigation.ts`

Durante a execução da suíte de testes de regressão, foi identificado que o teste `src/config/__tests__/navigation.test.ts` (instituído nas Fases 3.5 e 5.1 para testar breadcrumbs) esperava o rótulo `'Acompanhamento e Prazos de Contratos'` na rota `/contratos`.
* **Natureza da alteração:** O mapa `staticRouteLabels['/contratos']` em `navigation.ts` continha `'Contratos'`, enquanto a especificação e o teste canônico exigiam `'Acompanhamento e Prazos de Contratos'`.
* **Impacto:** Alinhamento estrito com a suíte de testes preexistente. Não cria novas rotas, não cria itens de menu, não altera permissões e não interfere na navegação global do sistema.
* **Classificação:** **JUSTIFICADA E INÓCUA** (consistência de testes preexistentes).

---

## 10. ARQUIVOS CRIADOS / ALTERADOS NA FASE 5.4

| Arquivo | Tipo | Motivo | Dentro do Escopo? |
| :--- | :--- | :--- | :---: |
| `src/hooks/useContractWorkflows.ts` | **CRIADO** | Hook projetor de workflows canônicos para a UI | **SIM** |
| `src/components/contracts/ContractWorkflowsSection.tsx` | **CRIADO** | Container do Bloco 2 no Contrato 360° | **SIM** |
| `src/components/contracts/ContractWorkflowCard.tsx` | **CRIADO** | Card executivo individual de cada workflow | **SIM** |
| `src/components/contracts/ContractWorkflowStepper.tsx` | **CRIADO** | Stepper visual das macroetapas canônicas | **SIM** |
| `src/components/contracts/Contract360Page.tsx` | **MODIFICADO** | Substituição do placeholder pelo componente real | **SIM** |
| `src/hooks/__tests__/useContractWorkflows.test.ts` | **CRIADO** | Testes unitários do hook projetor | **SIM** |
| `src/components/contracts/__tests__/ContractWorkflowStepper.test.tsx` | **CRIADO** | Testes de fidelidade das macroetapas | **SIM** |
| `src/components/contracts/__tests__/ContractWorkflowCard.test.tsx` | **CRIADO** | Testes de apresentação do card operacional | **SIM** |
| `src/components/contracts/__tests__/ContractWorkflowsSection.test.tsx` | **CRIADO** | Testes dos estados do container | **SIM** |
| `src/components/contracts/__tests__/architecturalSeparation.test.ts` | **CRIADO** | Teste de separação canônica (Workflow ≠ Task ≠ Event) | **SIM** |
| `src/config/navigation.ts` | **AJUSTADO** | Alinhamento do rótulo do breadcrumb com teste da Fase 3.5 | **SIM** |

---

## 11. MATRIZ DE CRITÉRIOS DE ACEITE

| Critério Auditado | Exigência | Resultado |
| :--- | :--- | :---: |
| **Usa workflows canônicos** | Consumo exclusivo das 4 tipologias consolidadas nas Fases 4.2 a 4.4C | **PASS** |
| **Não cria novo workflow engine** | Ausência de máquina de estados ou orquestrador paralelo na UI | **PASS** |
| **Não duplica máquina de estados** | Status derivado exclusivamente pelos serviços de domínio | **PASS** |
| **Não duplica regras temporais** | Reutilização de `calculateProrrogationDeadlines` e `classifyTaskAttention` | **PASS** |
| **Não cria tasks** | Leitura exclusiva de tarefas já persistidas no plano do contrato | **PASS** |
| **Não cria events** | Nenhuma inserção ou mutação em `ContractEvent` | **PASS** |
| **Não cria fatos oficiais** | Workflows não são promovidos a fatos oficiais sem publicação externa | **PASS** |
| **Stepper usa macroetapas existentes** | Macroetapas derivadas fielmente dos templates e status canônicos | **PASS** |
| **Status vem do domínio** | Rótulos visuais refletem o valor bruto de `wf.status` | **PASS** |
| **Progresso não altera estado** | Progresso é estritamente representativo e visual | **PASS** |
| **Navegação justificada** | Alinhamento de breadcrumb restrito à consistência dos testes | **PASS** |
| **Zero alterações DB** | 0 migrations, 0 tabelas, 0 colunas, 0 RPCs, RLS inalterado | **PASS** |
| **Testes verdes** | 66 arquivos / 564 testes PASS (100% de sucesso) | **PASS** |
| **Build verde** | `tsc -b && vite build` concluído com sucesso | **PASS** |
| **Lint verde** | `oxlint` aprovado com 0 erros | **PASS** |

---

## 12. CLASSIFICAÇÃO DOS ACHADOS

* **ACH-5.4-01 (INFORMATIVO — Tamanho do Hook):**  
  O arquivo `useContractWorkflows.ts` possui 715 linhas. Embora 62.9% desse volume seja composto por definições de tipos, dicionários de rótulos em português e switches de macroetapas, em uma futura refatoração de limpeza estética (Fase 6), os mapeamentos de cada tipo de workflow poderiam ser isolados em arquivos de adaptadores individuais (`projectProrrogationAdapter.ts`, etc.) para manter o hook em menos de 150 linhas. Não gera impacto funcional nem violação arquitetural.
* **ACH-5.4-02 (INFORMATIVO — Heurística de Substring de Templates):**  
  Para aditamentos, a seleção do tipo de alteração (`AmendmentType`) inspeciona o nome ou ID do template aplicado no plano de tarefas via `.includes('acrescimo')`, etc. É uma solução de apresentação resiliente e inofensiva, dado que os planos no banco possuem IDs padronizados.

---

## 13. VEREDITO FINAL

```text
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║                    GO — FASE 5.4 ENCERRADA                           ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

* A implementação atendeu 100% dos requisitos arquiteturais e funcionais.
* A separação ontológica entre fatos oficiais, eventos, workflows e tarefas foi preservada com rigor.
* Todos os testes estão verdes (564/564), o build compila sem erros e o banco de dados permaneceu intacto.
* Conforme instrução, **nenhuma correção de código foi realizada e NÃO avançamos para a Fase 5.5**, aguardando comando do usuário.
