# SALDOARP — FASE 5.0
## AUDITORIA UX E ARQUITETURA DA EXPERIÊNCIA DO CONTRATO (VISÃO 360°)

**Data**: 23 de Setembro de 2026  
**Status**: AUDITORIA E DESENHO DE ARQUITETURA UX (Zero Código Funcional / Zero Migrations)  
**Objetivo**: Realizar o diagnóstico da experiência atual do contrato no frontend e propor a arquitetura de informação da **Visão 360° do Contrato**, traduzindo o núcleo puro consolidado nas Fases 4.1 → 4.4C em uma experiência simples, intuitiva e orientada à tomada de decisão.

---

## 1. RESUMO EXECUTIVO

O SaldoARP 3.0 consolidou um robusto núcleo de domínio para gestão de contratos públicos (eventos imutáveis, prorrogações, alterações/apostilamentos, semântica de tarefas e extinções/rescisões). A auditoria transversal (Fase 4.X) homologou essa camada com 511 testes passando e 0 migrations adicionadas.

No entanto, **no frontend atual**, a representação de contratos ainda está restrita a uma listagem de *cards expansíveis* (`ContractCard`), onde o usuário precisa navegar por abas internas para visualizar tarefas genéricas, sem acesso integrado a:
1. **Histórico e Linha do Tempo de Eventos**: Eventos contratuais formais (Fase 4.1) não são visualizados em timeline.
2. **Workflows Especializados**: Não há interface dedicada para acompanhar e instruir Prorrogações (4.2), Alterações (4.3B), Encerramento Regular (4.4B) ou Rescisões (4.4C).
3. **Semântica de Execução**: A lista de tarefas não explicita o modo de ação (`TaskExecutionMode`: `INTERNA`, `EXTERNA`, `AUTOMATICA`, `CONFIRMACAO`).
4. **Distinção de Oficialidade**: Propostas internas e decisões administrativas não são visualmente diferenciadas de Fatos Oficiais Soberanos (PNCP/Contratos.gov.br).

A **Visão 360° do Contrato** proposta nesta Fase 5.0 resolve essas lacunas transformando a experiência do usuário de uma "tabela de tarefas burocráticas" para um **Painel de Gestão Focado em Ação e Atenção**.

---

## 2. ESTADO ATUAL DO FRONTEND

O frontend é uma SPA em React 19 com Vite, React Query (@tanstack/react-query), React Router v7, Lucide Icons e CSS puro/inline estruturado.

### Mapa de Páginas e Componentes Relacionados a Contratos:
```text
Routes & Pages:
 ├── App.tsx (Configuração de Rotas e Providers)
 ├── /contratos → ContractsDashboard.tsx
 │    ├── ContractFilterParams (UASG, número/ano, status, fornecedor, datas)
 │    ├── useContractsDashboard (Hook: busca dados nas APIs oficiais / Compras.gov / PNCP)
 │    ├── useAllContractManagers (Hook: busca atribuição de gestores no Supabase)
 │    └── Lista de Cards:
 │         └── ContractCard.tsx (Card retrátil sanfonado)
 │              ├── Header: Identificação, status vigência, valor, link PNCP
 │              ├── useContractDetails (Hook: busca itens e empenhos sob demanda)
 │              └── Abas Internas (quando expandido):
 │                   ├── Aba 'gestao' → ContractManagementPanel.tsx
 │                   │    ├── Seletor de Gestor do Contrato (useContractManager / useSaveContractManager)
 │                   │    ├── Seletor de Template de Tarefas (useContractTaskPlan / useApplyContractTaskTemplate)
 │                   │    └── Lista de Tarefas (TaskRow / useUpdateContractTask)
 │                   ├── Aba 'itens' → Tabela de Itens Contratados
 │                   └── Aba 'empenhos' → Tabela de Empenhos Vinculados
 ├── /prazos → CentralPrazosRoute.tsx / CentralPrazosDashboard.tsx
 │    └── CentralPrazosTable.tsx (Tabela consolidada de prazos do motor temporal)
 └── / → HomeRoute.tsx (Dashboard Executivo)
      ├── ImmediateAttentionBanner.tsx (Contadores críticos)
      └── ActionableAttentionCenter.tsx (Tarefas e prazos prioritários)
```

---

## 3. DADOS EXISTENTES E RESPECTIVAS FONTES

| Informação | Existe Hoje na UI? | Onde? | Fonte Canônica | Reutilizável na Visão 360°? |
| :--- | :---: | :--- | :--- | :---: |
| **Identificação & Objeto** | SIM | `ContractCard` | PNCP / Compras.gov.br | **SIM (100%)** |
| **Fornecedor & CNPJ** | SIM | `ContractCard` | Contratos.gov.br / SICAF | **SIM (100%)** |
| **Valor Global & Inicial** | SIM | `ContractCard` | APIs Governamentais | **SIM (100%)** |
| **Vigência & Dias Restantes**| SIM | `ContractCard` / `CentralPrazos` | `temporalEngineService` | **SIM (100%)** |
| **Gestor Atribuído** | SIM | `ContractManagementPanel` | `contract_managers` (DB) | **SIM (100%)** |
| **Tarefas & Macrotarefas** | SIM (Básico)| `ContractManagementPanel` | `contract_tasks` (DB) | **SIM (Necessita enriquecer)**|
| **Itens & Empenhos** | SIM | `ContractCard` (abas) | APIs Governamentais | **SIM (100%)** |
| **Linha do Tempo / Eventos**| NÃO | Apenas no serviço 4.1 | `contractEvents.ts` | **Criar Componente de UI** |
| **Workflows de Alteração** | NÃO | Apenas no serviço 4.3B | `contractAmendmentWorkflows` | **Criar Painel de Workflow** |
| **Workflow de Prorrogação** | NÃO | Apenas no serviço 4.2 | `contractProrrogation` | **Criar Painel de Workflow** |
| **Workflow de Extinção** | NÃO | Apenas nos serviços 4.4B/C | `contractRescissionWorkflows` | **Criar Painel de Workflow** |
| **Semântica de Execução** | NÃO | Apenas nos tipos 4.3C | `TaskExecutionMode` | **Integrar à visualização** |
| **Processo SEI** | PARCIAL | Exibe texto do número | `processos_sei` / API | **Integrar com link/status** |
| **Link & Dados Soberanos** | SIM | Badge discreto no card | PNCP / Contratos.gov.br | **Elevar para bloco oficial**|

---

## 4. DIAGNÓSTICO DE PROBLEMAS DE UX ENCONTRADOS

1. **Falta de Página Dedicada ("Contrato 360°")**: O usuário precisa operar contratos complexos dentro de cards sanfonados que competem por espaço na listagem geral.
2. **Sobrecarga Cognitiva de Tarefas**: O usuário abre o card e é confrontado com uma lista de 15 a 30 tarefas estáticas, sem destaque sobre *qual é a próxima providência indispensável*.
3. **Ausência de Contexto dos Workflows**: Se um contrato está em processo de prorrogação ou reajuste, não há nenhum indicador no card mostrando o estado desse workflow (ex: "Em elaboração de termo", "Aguardando parecer jurídico", "Aguardando publicação").
4. **Invisibilidade do Histórico de Alterações**: O usuário não consegue ver quantos aditivos já foram feitos, quanto do limite de 25% já foi consumido, ou se houve apostilamento de reajuste recente.
5. **Ambiguidade de Oficialidade**: O usuário não sabe se um dado exibido é oficial e soberano do PNCP ou se foi anotado manualmente no SaldoARP.

---

## 5. PROPOSTA DA VISÃO 360° DO CONTRATO

A **Visão 360° do Contrato** será uma rota dedicada (`/contratos/:contractKey`) projetada em torno de 3 perguntas fundamentais:

```text
1. O QUE É ESTE CONTRATO?
   ↳ Identificação, fornecedor, vigência atual, valor atualizado e fonte oficial.

2. COMO ELE ESTÁ AGORA?
   ↳ Situação operacional assistida, workflows em andamento e consumo de limites legais.

3. O QUE PRECISA DA MINHA ATENÇÃO HOJE?
   ↳ Pendências impeditivas, prazos iminentes, tarefas atribuídas e confirmações aguardadas.
```

---

## 6. HIERARQUIA VISUAL DA INFORMAÇÃO

```text
┌───────────────────────────────────────────────────────────────────────────────────┐
│ 1. HEADER DO CONTRATO & SITUAÇÃO OPERACIONAL                                      │
│    • Número/Ano • UASG • Fornecedor (CNPJ) • Badge Situação Operacional • Link PNCP│
│    • Vigência (Início → Fim) • Dias Restantes • Valor Global Atualizado           │
├───────────────────────────────────────────────────────────────────────────────────┤
│ 2. CENTRAL "O QUE PRECISA DA MINHA ATENÇÃO?" (Prioridade Máxima)                 │
│    • Alertas de Prazos do Motor Temporal (ex: "Vence em 45 dias — Iniciar Prorrogação")│
│    • Pendências Impeditivas do Checklist (TRD, Garantia, Parecer, Contraditório) │
│    • Confirmações Oficiais Externas Aguardadas (Publicação PNCP)                  │
├───────────────────────────────────────────────────────────────────────────────────┤
│ 3. PAINEL DE WORKFLOWS CONTRATUAIS ATIVOS                                         │
│    • Cards de fluxos ativos: [Prorrogação] | [Alteração/Reajuste] | [Encerramento]│
│    • Etapa atual, responsável e progresso (ex: "Em Formalização • 3/4 providências")│
├───────────────────────────────────────────────────────────────────────────────────┤
│ 4. PLANO DE TAREFAS DINÂMICO & CONDICIONAL                                        │
│    • Agrupamento por Macrotarefa com semântica (INTERNA, EXTERNA, CONFIRMACAO)   │
│    • Ações contextuais: [Abrir no SEI] | [Acessar Contratos.gov] | [Checar PNCP]  │
├───────────────────────────────────────────────────────────────────────────────────┤
│ 5. TIMELINE CONTRATUAL SOBERANA & EVENTOS IMUTÁVEIS                              │
│    • Linha do tempo visual com filtros: [Todos] [Oficiais] [Internos]            │
│    • Eventos: Contrato Inicial → Aditivo 1 (25%) → Reajuste (IPCA) → Encerramento  │
├───────────────────────────────────────────────────────────────────────────────────┤
│ 6. DETALHAMENTO TÉCNICO & REGISTROS COMPLEMENTARES (Abas)                         │
│    • [Itens Contratados] • [Empenhos e Liquidações] • [Processo SEI] • [Auditoria]│
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. MODELO "O QUE PRECISA DA MINHA ATENÇÃO?"

Este bloco responde imediatamente ao usuário o que deve ser feito sem exigir navegação profunda:

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ⚠ ATENÇÃO NECESSÁRIA NESTE CONTRATO                                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│ [ALERTA TEMPORAL]                                                               │
│ • Vigência expira em 52 dias (14/11/2026). Decisão de prorrogação recomendada. │
│   ↳ Ação sugerida: [Iniciar Workflow de Prorrogação]                            │
│                                                                                 │
│ [PENDÊNCIA DE WORKFLOW: ENCERRAMENTO REGULAR]                                   │
│ • Termo de Recebimento Definitivo (TRD) pendente no SEI.                        │
│   ↳ Responsável: Maria Gestora | Prazo: 30/09/2026 | [Ver Tarefa]               │
│                                                                                 │
│ [CONFIRMAÇÃO OFICIAL EXTERNA AGUARDADA]                                         │
│ • Termo Aditivo nº 02/2026 assinado internamente. Aguardando publicação no PNCP.│
│   ↳ Fonte: PNCP / Contratos.gov.br | [Verificar Atualização da API]             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. MODELO DE EVENTOS E TIMELINE CONTRATUAL

A Linha do Tempo apresentará visualmente a história formal do contrato, utilizando a classificação canônica da Fase 4.1:

```text
● 23/09/2026 — FATO OFICIAL SOBERANO [PNCP]
  Termo Aditivo nº 02/2026 (Acréscimo 15% / R$ 150.000,00)
  Publicação PNCP nº 2026/00045 • Vigência mantida até 31/12/2026

○ 15/09/2026 — DECISÃO INTERNA [SaldoARP / SEI]
  Despacho Decisório nº 123/2026 assinado pelo Ordenador de Despesas
  Parecer Jurídico nº 45/2026/CONJUR Aprovado

● 10/01/2026 — FATO OFICIAL SOBERANO [Compras.gov.br]
  Assinatura do Contrato Inicial nº 15/2026
  Valor Global: R$ 1.000.000,00 • Vigência: 10/01/2026 a 09/01/2027
```

### Diferenciação Visual de Oficialidade:
- **Badge Azul/Verde Escuro com Selo**: `FATO_OFICIAL` (Dados confirmados via API governamental soberana).
- **Badge Lilás/Roxo**: `DECISAO_INTERNA` (Despachos, relatórios e termos assinados internamente).
- **Badge Cinza/Amarelo**: `PROPOSTA_ADMINISTRATIVA` (Rascunhos, estudos e instruções em andamento).

---

## 9. MODELO DE WORKFLOWS NA INTERFACE

Tradução amigável dos estados técnicos dos serviços para a linguagem operacional do usuário:

| Estado Técnico | Tradução na UI | Cor / Ícone | Contexto / Significado |
| :--- | :--- | :--- | :--- |
| `NAO_INICIADO` | Não iniciado | Cinza (`#64748b`) | Nenhuma ação iniciada para este ciclo |
| `EM_ANALISE` / `EM_INSTRUCAO` | Em instrução | Azul (`#0284c7`) | Equipe reunindo documentos, justificativas e pesquisas |
| `COM_PENDENCIAS` | Com pendências | Amarelo (`#d97706`) | Faltam documentos obrigatórios (ex: parecer, contraditório, TRD) |
| `AGUARDANDO_DECISAO` | Aguardando decisão | Laranja (`#ea580c`) | Instrução pronta, submetida à autoridade competente |
| `EM_FORMALIZACAO` | Em formalização | Roxo (`#7c3aed`) | Despacho aprovado, lavrando termo aditivo / distrato no sistema |
| `AGUARDANDO_CONFIRMACAO` | Aguardando publicação | Âmbar (`#b45309`) | Termo assinado, aguardando envio/confirmação no PNCP |
| `CONCLUIDO_INTERNAMENTE` | Concluído internamente | Indigo (`#4338ca`) | Todos os atos internos finalizados; pendente apenas registro oficial |
| `CONCLUIDO_OFICIALMENTE` | Concluído oficialmente | Verde (`#059669`) | Fato oficial confirmado soberanamente no PNCP |
| `CANCELADO` | Cancelado | Vermelho (`#dc2626`) | Processo arquivado ou descontinuado |

---

## 10. MODELO DE TAREFAS E SEMÂNTICA DE EXECUÇÃO (`TaskExecutionMode`)

Cada tarefa exibirá visualmente seu modo de execução e o sistema de destino:

```text
[ ] Elaborar Nota Técnica de Justificativa da Prorrogação
    Modo: [INTERNA] • Sistema: SEI • Responsável: João Silva • Prazo: 10/10/2026
    [Botão: Abrir Processo no SEI ↗]

[ ] Cadastrar Termo Aditivo no Contratos.gov.br
    Modo: [EXTERNA] • Sistema: Contratos.gov.br • Responsável: Maria Santos • Prazo: 15/10/2026
    [Botão: Acessar Contratos.gov.br ↗]

[ ] Aguardar confirmação da publicação no PNCP
    Modo: [CONFIRMAÇÃO] • Sistema: PNCP • Automático
    [Botão: Checar Sincronização Agora ⟳]
```

---

## 11. MODELO DE FONTES OFICIAIS E TRANSPARÊNCIA

A UI incluirá em todos os cards e telas um **Bloco de Procedência dos Dados**:
- **Fonte Primária Soberana**: Ex: `PNCP (Portal Nacional de Contratações Públicas)`.
- **Identificador Soberano**: Ex: `Controle PNCP nº 160001-2-000015/2026`.
- **Status de Sincronização**: `Atualizado há 15 minutos • Em conformidade`.
- **Link Direto**: `Visualizar no PNCP ↗`.

---

## 12. INTEGRAÇÃO VISUAL COM O SEI

O SaldoARP **não duplicará o SEI**, mas fornecerá atalhos contextuais:
- **Número do Processo Formatado**: `23000.001234/2026-11`.
- **Unidade Geradora**: `DGP / Coordenação de Contratos`.
- **Último Andamento Conhecido**: `Processo em instrução técnica`.
- **Ação Rápida**: `Copiar Número` ou `Abrir no SEI ↗`.

---

## 13. DASHBOARD × CONTRATO 360°

| Dimensão | Dashboard de Contratos (`/contratos`) | Visão 360° do Contrato (`/contratos/:id`) |
| :--- | :--- | :--- |
| **Pergunta Central** | "O que está acontecendo com a minha carteira?" | "O que está acontecendo com este contrato específico?" |
| **Usuário Típico** | Gestor Geral, Coordenador, Fiscal com múltiplos contratos | Fiscal do Contrato, Gestor Operacional, Auditor |
| **Foco Visual** | KPIs agregados, filtros de busca, prazos iminentes | Detalhamento, histórico, tarefas, workflows e conciliação |
| **Ações Típicas** | Filtrar por vigência, atribuir gestor, exportar relatório | Executar tarefas, instruir prorrogação, verificar publicação |

---

## 14. PROPOSTA DE NAVEGAÇÃO E ROTAS

```text
/contratos                       → Lista Geral de Contratos (Dashboard da Carteira)
/contratos/:contractKey          → Visão 360° do Contrato (Rota Principal)
/contratos/:contractKey/prorrogacao → Painel Focado no Workflow de Prorrogação
/contratos/:contractKey/alteracoes  → Painel Focado no Workflow de Alterações/Aditivos
/contratos/:contractKey/encerramento→ Painel Focado no Workflow de Encerramento/Rescisão
```

---

## 15. RESPONSIVIDADE E ADAPTAÇÃO MOBILE

- **Desktop (>= 1200px)**: Layout em duas colunas (Coluna Principal: Atenção + Workflows + Timeline; Coluna Lateral: Dados Gerais + Fornecedor + SEI + Sincronização).
- **Notebook / Tablet (768px - 1199px)**: Layout empilhado em coluna única com abas superiores de navegação rápida.
- **Mobile (< 768px)**: Priorização estrita da seção "O Que Precisa da Minha Atenção?", status de vigência e links externos, colapsando detalhes técnicos em drawers.

---

## 16. COMPONENTES REUTILIZÁVEIS EXISTENTES

1. `CentralPrazosKPIHeader.tsx` e `ImmediateAttentionBanner.tsx` $\to$ Padrões de cards de alerta e prazos.
2. `SyncStatusBadge.tsx` $\to$ Indicador de sincronização oficial e integridade de dados.
3. `ContractCardSkeleton.tsx` $\to$ Feedback visual de carregamento.
4. `ExplicabilidadeModal.tsx` $\to$ Modelo para explicação do cálculo de prazos e fundamentação jurídica.

---

## 17. COMPONENTES QUE SERÃO CRIADOS FUTURAMENTE (Fase 5.x)

1. `Contract360Header.tsx`: Cabeçalho executivo do contrato com dados oficiais e vigência.
2. `ContractAttentionBanner.tsx`: Central de alertas de pendências, prazos e confirmações do contrato.
3. `ContractWorkflowsPanel.tsx`: Visualizador de status e progresso dos workflows ativos.
4. `ContractSemanticTasksList.tsx`: Lista de tarefas dinâmicas enriquecida com `TaskExecutionMode`.
5. `ContractEventsTimeline.tsx`: Linha do tempo visual do histórico formal de eventos.
6. `ContractOfficialSourceCard.tsx`: Bloco de procedência, link PNCP e metadados de sincronização.

---

## 18. COMPONENTES QUE SERÃO REFATORADOS FUTURAMENTE

1. `ContractCard.tsx`: Simplificar para atuar como card de listagem enxuto na visão agregada, com botão direto "Abrir Visão 360°".
2. `ContractManagementPanel.tsx`: Migrar a visualização de tarefas para o novo componente com suporte a `TaskExecutionMode`.

---

## 19. GARANTIA DO PRINCÍPIO "DIGITE UMA VEZ, USE EM TODO LUGAR"

A interface garantirá que:
- O usuário **nunca** precise redigitar número de contrato, fornecedor, CNPJ ou vigência que já foram importados da API.
- O número do processo SEI seja herdado automaticamente em todas as telas de workflow.
- A conclusão de uma tarefa de formalização no Contratos.gov.br preencha automaticamente o número do termo no workflow interno.
- A confirmação oficial do PNCP feche automaticamente a tarefa de confirmação sem exigir duplo clique manual.

---

## 20. PLANO RECOMENDADO DE IMPLEMENTAÇÃO INCREMENTAL

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│ FASE 5.1 — Rota e Estrutura Base do Contrato 360°                                │
│   • Criação da rota /contratos/:contractKey                                     │
│   • Header executivo e blocos fundamentais de dados                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│ FASE 5.2 — Central de Atenção e Tarefas com Semântica de Execução                │
│   • Componente de Alertas Críticos e Pendências                                 │
│   • Lista de tarefas com badges INTERNA, EXTERNA, CONFIRMACAO                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│ FASE 5.3 — Timeline Visual de Eventos Contratuais                                │
│   • Renderização do histórico de ContractEvent com filtro de oficialidade        │
├─────────────────────────────────────────────────────────────────────────────────┤
│ FASE 5.4 — Painel de Workflows Operacionais                                     │
│   • Visualização e interação com Prorrogação, Alterações e Rescisões            │
├─────────────────────────────────────────────────────────────────────────────────┤
│ FASE 5.5 — Polimento UX, Responsividade e Homologação de Fechamento             │
│   • Testes de usabilidade, acessibilidade e refinamento visual                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 21. VALIDAÇÃO DA NÃO MODIFICAÇÃO DO CÓDIGO FUNCIONAL

Conforme a Regra Principal da Fase 5.0, esta etapa produziu exclusivamente diagnóstico e planejamento arquitetural:
- **Código funcional alterado**: NÃO
- **Banco de dados alterado**: NÃO
- **Migrations adicionadas**: 0
- **RPCs alteradas**: 0
- **Testes mantidos**: 57 arquivos / 511 testes PASS (100%)
- **Status do Build**: Aprovado (`tsc -b && vite build`)
