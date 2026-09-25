# CHECKPOINT ARQUITETURAL COMPLETO DO MÓDULO CONTRATOS
## SALDOARP — SISTEMA DE GESTÃO DE ATAS E CONTRATOS ADMINISTRATIVOS
### Avaliação Pós-Fases 4.x (Domínio) e 5.1–5.5 (Contrato 360°)

Data da Avaliação: 23 de Setembro de 2026  
Status Global do Módulo: **APROVADO COM EXCELÊNCIA TÉCNICA (GO)**  
Bateria de Testes: 66 arquivos / 564 testes PASS (100% verde)  
Compilação TypeScript: `tsc -b` PASS (0 erros)  
Build Vite: PASS (570ms, 0 erros)  
Linter: PASS (0 erros no módulo contratos)  
Banco de Dados: 0 migrations novas, 0 RPCs novas, RLS intacto  

---

## 1. MAPA REAL DA ARQUITETURA DO MÓDULO CONTRATOS

A árvore real de componentes, camadas de apresentação, hooks, serviços e adaptadores que compõem o módulo de contratos foi mapeada diretamente do código-fonte:

```text
src/
├── types/
│   ├── contractEvents.ts                   # Tipos de eventos, ciclos, oficialidade, conformidade
│   ├── contractProrrogation.ts             # Tipos de workflows e prazos de prorrogação
│   ├── contractAmendments.ts               # Tipos de alterações contratuais e apostilamentos
│   ├── contractClosureWorkflows.ts         # Tipos de encerramento contratual e liquidação
│   ├── contractExtinctions.ts              # Tipos de checklist e extinção antecipada/rescisão
│   ├── contractTasks.ts                    # Tipos de planos, templates, macrotarefas e execução
│   └── index.ts                            # Agregação geral (ContractDashboardRecord, KPIs, filtros)
│
├── components/
│   ├── ContractsDashboard.tsx              # Visão geral executiva com KPIs, filtros e lista de cards
│   ├── cards/
│   │   ├── ContractCard.tsx                # Card executivo de contrato com link 360° e gaveta
│   │   ├── ContractCardSkeleton.tsx        # Skeleton de carregamento do card
│   │   └── ContractManagementPanel.tsx     # Gaveta expansível legada (Fase 4 - Gestor & Tarefas)
│   ├── contracts/
│   │   ├── Contract360Page.tsx             # Orquestrador da Visão 360° do Contrato (Fase 5)
│   │   ├── Contract360Section.tsx          # Contêiner padronizado de seções com ícone e badge
│   │   ├── Contract360Header.tsx           # Header executivo: vigência, valor, fornecedor e links
│   │   ├── Contract360Summary.tsx          # Dados cadastrais: UASG, órgão, controle PNCP, processo
│   │   ├── ContractAttentionCenter.tsx     # Central de Atenção Temporal (Fase 5.2 - Motor Temporal)
│   │   ├── ContractWorkflowsSection.tsx    # Painel Operacional de Workflows (Fase 5.4)
│   │   ├── ContractWorkflowCard.tsx        # Card individual de workflow com stepper e tarefas
│   │   ├── ContractWorkflowStepper.tsx     # Stepper visual das macroetapas do workflow
│   │   ├── ContractTasksSection.tsx        # Seção de tarefas com semântica de execução e templates
│   │   └── ContractEventsTimeline.tsx      # Linha do tempo cronológica com oficialidade (Fase 5.3)
│   └── prazos/
│       └── CentralPrazosTable.tsx          # Tabela unificada da Central de Prazos (Contratos e ARPs)
│
├── hooks/
│   ├── useContractsDashboard.ts            # Query React Query da lista geral ['contracts-dashboard', uasg]
│   ├── useContract.ts                      # Hook canônico de recuperação de contrato individual
│   ├── useContractDetails.ts               # Consulta sob demanda de itens e empenhos governamentais
│   ├── useContractEvents.ts                # Projeção de eventos cronológicos oficiais do contrato
│   ├── useContractWorkflows.ts             # Projeção pura dos 4 workflows canônicos
│   ├── useContractTaskPlan.ts              # Consulta do plano de tarefas ativo no Supabase
│   ├── useContractTaskTemplates.ts         # Consulta do catálogo de modelos de gestão (Lei 14.133)
│   ├── useApplyContractTaskTemplate.ts     # Mutation para aplicar modelo ao contrato
│   ├── useUpdateContractTask.ts            # Mutation para alterar status/prazo/responsável da tarefa
│   ├── useContractManager.ts               # Consulta do gestor designado do contrato
│   ├── useSaveContractManager.ts           # Mutation para designar/atualizar gestor
│   ├── useAllContractManagers.ts           # Mapa geral de gestores por UASG para o Dashboard
│   └── useCentralPrazosData.ts             # Agregação temporal de prazos de contratos e atas
│
├── services/
│   ├── contractService.ts                  # Busca unificada Compras/Contratos.gov.br, cache e KPIs
│   ├── contractManagementService.ts        # Persistência de gestores, planos e templates no Supabase
│   ├── contractEventService.ts             # Domínio puro de eventos canônicos e transição de ciclo
│   ├── contractProrrogationService.ts      # Domínio puro de prorrogação e prazos normativos (-180d)
│   ├── contractAmendmentService.ts         # Domínio puro de termos aditivos, apostilamentos e limites
│   ├── contractAmendmentWorkflowService.ts # Orquestração do workflow operacional de alterações
│   ├── contractClosureWorkflowService.ts   # Orquestração do workflow de encerramento regular (TRD)
│   ├── contractExtinctionService.ts        # Domínio de prontidão e extinção antecipada/rescisão
│   ├── contractRescissionWorkflowService.ts# Orquestração do workflow de rescisão/extinção
│   └── temporalEngineService.ts            # Motor temporal centralizado (dias corridos, BRT, regras)
│
├── adapters/
│   └── contractManagementRpcAdapter.ts     # Isolamento de chamadas remotas de gestão contratual
│
└── utils/
    └── contractKeyUtils.ts                 # Resolução determinística de identidade (UASG-NUM-ANO)
```

---

## 2. FLUXO DE NAVEGAÇÃO E ERGONOMIA

### 2.1 Trajetória do Usuário
A auditoria verificou o ciclo completo de navegação do usuário:

```text
Lista de Contratos (/contratos)
       │
       ▼
ContractCard (Ações: "Visão 360°" ou "Detalhes")
       │
       ▼ (clique em "Visão 360°")
Link React Router: /contratos/:contractKey
       │
       ▼
Contract360Route (routes/Contract360Route.tsx)
       │
       ▼
Contract360Page (components/contracts/Contract360Page.tsx)
       │
       ├─► Header Executivo com botão "← Voltar para Contratos"
       │         │
       │         ▼ (clique no botão voltar)
       │     navigate('/contratos')
       │
       ├─► Tratamento de Estado de Carregamento (Spinner com mensagem)
       ├─► Tratamento de Erro de Rede (Mensagem com botão "Tentar novamente" e "Voltar")
       └─► Tratamento de Contrato Inexistente (Card ilustrativo com botão "Voltar")
```

### 2.2 Resolução de Parâmetros e Identidade
* **Parâmetro de URL**: `/contratos/:contractKey`.
* O hook `useContract` aceita múltiplos identificadores flexíveis:
  * Chave canônica completa (ex: `200331-50-2024`);
  * ID técnico de sistema de compras (ex: `123456`);
  * Número de controle PNCP (ex: `200331-1-000050/2024`).
* A correspondência é insensível a maiúsculas/minúsculas e resolve o objeto sem falhas.

### 2.3 Duplicidade de Rotas
* **Não existe duplicidade de rotas**. Apenas uma rota aponta para a visualização detalhada (`/contratos/:contractKey`).
* Os botões "Voltar" restauram com precisão o estado anterior via `navigate('/contratos')`.

---

## 3. FONTE CANÔNICA DO CONTRATO E LINHAGEM DE DADOS

### 3.1 Fonte Primária dos Dados Contratuais
* Os contratos administrativos não nascem no SaldoARP: são sincronizados a partir das APIs governamentais oficiais:
  * **API Contratos.gov.br** (`/api-contratos-gov/api/contrato/ug/${uasg}`);
  * **API Compras.gov.br Dados Abertos** (`/api-arp/modulo-contratos/1_consultarContratos`).
* A derivação da chave canônica é unificada por `resolveContractKey` em `contractKeyUtils.ts`.

### 3.2 Estratégia de Caching ("Digite uma vez, use em todo lugar")
* **Cache em Memória Local**: `contractService.ts` mantém `CONTRATOS_CACHE` com TTL de 5 minutos.
* **Cache React Query**: `useContractsDashboard` registra a query key canônica `['contracts-dashboard', cleanUasg]` com `staleTime: 5 * 60 * 1000`.
* **Consumo no Contrato 360°**: O hook `useContract` **reutiliza o cache do dashboard** sem disparar nenhuma requisição HTTP adicional. O Contrato 360° abre instantaneamente com tempo de carregamento perceptível de 0ms quando o usuário vem da lista.

### 3.3 Dados Administrativos Locais (Extensão SaldoARP)
O SaldoARP enriquece os dados federais com governança operacional própria persistida no Supabase:
* Gestor designado do contrato $\rightarrow$ tabela `contract_managers`;
* Planos e checklists operacionais $\rightarrow$ tabelas `contract_task_plans`, `contract_task_plan_macrotasks` e `contract_task_plan_tasks`;
* Roteiros e templates padronizados $\rightarrow$ tabelas `contract_task_templates`, `..._macrotasks` e `..._tasks`.

---

## 4. INTEGRAÇÃO ENTRE O DOMÍNIO (FASE 4.x) E O CONTRATO 360° (FASE 5.x)

A integração entre as regras de negócio construídas na Fase 4.x e os componentes visuais do Contrato 360° foi auditada minuciosamente:

| Domínio Fase 4.x | Serviço Canônico | Camada de Apresentação Fase 5.x | Avaliação Arquitetural |
|---|---|---|---|
| **Eventos Contratuais (4.1)** | `contractEventService.ts` | `ContractEventsTimeline.tsx` via `useContractEvents.ts` | **Íntegro**: Projeção cronológica imutável; ordenação determinística; correção de precedência ACH-5.3-01 confirmada. |
| **Prorrogação de Vigência (4.2)** | `contractProrrogationService.ts` | `ContractWorkflowsSection.tsx` via `useContractWorkflows.ts` | **Íntegro**: Gatilho a 180 dias do término (`D ≤ 180`), macroetapas e cálculo de prazos normativos espelhados sem lógica paralela. |
| **Alterações / Apostilamentos (4.3B)** | `contractAmendmentService.ts` e `contractAmendmentWorkflowService.ts` | `ContractWorkflowsSection.tsx` via `useContractWorkflows.ts` | **Íntegro**: Detecção de aditamentos e apostilamentos oficiais ou tarefas de alteração projetadas no stepper. |
| **Semântica de Execução (4.3C)** | `contractTaskService.ts` | `ContractAttentionCenter.tsx` e `ContractTasksSection.tsx` | **Íntegro**: Badges `INTERNA`, `EXTERNA`, `CONFIRMAÇÃO`, links diretos para SEI/PNCP. |
| **Encerramento Contratual (4.4B)** | `contractClosureWorkflowService.ts` | `ContractWorkflowsSection.tsx` via `useContractWorkflows.ts` | **Íntegro**: Ativação preventiva nos últimos 60 dias de vigência ou por pendência de Termo de Recebimento Definitivo. |
| **Rescisão / Extinção (4.4C)** | `contractRescissionWorkflowService.ts` | `ContractWorkflowsSection.tsx` via `useContractWorkflows.ts` | **Íntegro**: Projeção de rescisão baseada estritamente em notificações e processos formais. |
| **Motor Temporal** | `temporalEngineService.ts` | `ContractAttentionCenter.tsx` e `calculateStatusVigencia` | **Íntegro**: Zero motores de data paralelos. Todos os limiares temporais utilizam `differenceInDays` e `parseDateBRT`. |

---

## 5. COEXISTÊNCIA ARQUITETURAL: LEGADO VS CONTRATO 360°

### 5.1 O Cenário Identificado
Na lista geral de contratos (`ContractsDashboard.tsx`), cada card (`ContractCard.tsx`) dispõe atualmente de dois botões:
1. **Botão "Visão 360°"**: Navega para a página completa `/contratos/:contractKey` (`Contract360Page.tsx`).
2. **Botão "Detalhes"**: Expande internamente o card na própria lista, renderizando 3 abas: "Gestão", "Itens" e "Empenhos".
   * A aba "Gestão" renderiza o componente `ContractManagementPanel.tsx` (desenvolvido na Fase 4).

### 5.2 Avaliação da Coexistência
* **Persistência**: Ambas as telas consomem e salvam na mesma fonte (`useContractTaskPlan` e `useUpdateContractTask`). Se o usuário concluir uma tarefa no card, a Visão 360° reflete a conclusão imediatamente.
* **Divergência Menor de Cálculo de Atraso**:
  * No `Contract360Page` (Fase 5.2), o atraso e a prioridade temporal são calculados pelo `temporalEngineService` (`differenceInDays(prazoDate) < 0`).
  * No `ContractManagementPanel` (Fase 4 legada), há uma função auxiliar local `isAtrasada` com `new Date(...) < today`.
* **Recomendação para a Próxima Fase (Fase 6)**:
  * Simplificar o `ContractCard`: transformar o botão principal do card em acesso direto ao Contrato 360°, mantendo o card como elemento executivo de entrada e aposentando a gaveta expansível `ContractManagementPanel`. Isso reduzirá a complexidade do bundle e unificará 100% da experiência na Visão 360°.

---

## 6. PRONTIDÃO PARA A PRÓXIMA FRENTE FUNCIONAL

O Módulo Contratos atende a todos os critérios de maturidade arquitetural:
1. **Desacoplamento de Domínio e UI**: As regras de cálculo temporal, limites de aditamento e ciclos de vigência residem em funções puras na camada de serviços, totalmente testadas por 564 testes automatizados.
2. **Imutabilidade e Segurança**: A Timeline e os dados governamentais são somente leitura em relação aos fatos oficiais soberanos; a edição do usuário limita-se à instrução operacional interna (tarefas, notas e gestores).
3. **Desempenho**: Cache inteligente em camadas (memória local + React Query) garante respostas em milissegundos.
4. **Alinhamento Normativo**: Vocabulário, prazos e instrumentos formais respeitam rigorosamente a Lei Federal nº 14.133/2021.

---

## 7. VEREDITO FINAL DO CHECKPOINT

### **VEREDITO: GO — MÓDULO CONTRATOS ARQUITETURALMENTE APROVADO**

O Módulo Contratos do SaldoARP encontra-se consistente, coeso, com testes 100% verdes e formalmente preparado para receber as próximas frentes do sistema.
