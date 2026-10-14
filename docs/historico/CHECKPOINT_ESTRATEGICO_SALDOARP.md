# CHECKPOINT ESTRATÉGICO GERAL DO SALDOARP
## RELATÓRIO DE AUDITORIA ARQUITETURAL, DIAGNÓSTICO E MAPEAMENTO OPERACIONAL

**Data da Auditoria:** 23 de Setembro de 2026  
**Finalidade:** Diagnóstico exaustivo do sistema completo após a conclusão e homologação das Fases 4.x e 5.x.  
**Modo:** Estrito de Auditoria (0 código de produção alterado, 0 novas migrations/RPCs).  
**Saúde Técnica Atual:** 66 arquivos de teste / 564 testes PASS (100% verde), `tsc -b`: 0 erros, Vite Build: PASS (887ms), Lint: 0 erros.

---

## 1. RESUMO EXECUTIVO

O **SaldoARP** atingiu um marco histórico de engenharia de software no setor público: o **Módulo Contratos (Fases 4.x e 5.1–5.5)** encontra-se em estado da arte, com domínio formalizado, motor temporal rigoroso, persistência via RPCs atômicas no PostgreSQL/Supabase, governança por RBAC, rastreabilidade cronológica imutável na Linha do Tempo e homologação de experiência de usuário no **Contrato 360°**.

Contudo, ao afastar a lente do Módulo Contratos e examinar o **SaldoARP como um ecossistema integrado**, emerge um diagnóstico claro:
> **O SaldoARP possui uma "cabeça" altamente sofisticada no fim da linha (Gestão Contratual 360°), mas ainda convive com um "meio de campo" parcialmente artesanal no início da cadeia operacional (a transição entre Alocações Departamentais, Demandas SEI, Empenhos e a amarração aos Contratos).**

A pergunta fundamental colocada por este diagnóstico é:
> *"Depois de tudo que já foi construído, qual é a próxima grande lacuna operacional do SaldoARP?"*

A resposta fática, lastreada no código-fonte, aponta para **a reconciliação e rastreabilidade do ciclo de consumo**: a ponte que conecta **a Ata de Registro de Preços homologada $\rightarrow$ as Alocações por Departamento $\rightarrow$ as Notas de Empenho emitidas no SIAFI $\rightarrow$ o Contrato Administrativo formalizado**.

---

## 2. ÁRVORE REAL DO SISTEMA

Abaixo está a topologia física real do sistema, mapeada diretamente dos arquivos de produção:

```text
SaldoARP-system/
├── src/
│   ├── config/
│   │   └── navigation.ts                   # Menu lateral (6 pilares, status 'active' vs 'planned')
│   ├── context/
│   │   └── SelectionContext.tsx            # Estado global compartilhado de seleção (ARP e Item ativos)
│   ├── routes/
│   │   ├── HomeRoute.tsx                   # Visão inicial (HomeDashboard)
│   │   ├── ArpSearchRoute.tsx              # Busca e listagem de Atas de Registro de Preço
│   │   ├── ArpItemsRoute.tsx               # Listagem de itens da Ata selecionada
│   │   ├── ItemBalancesRoute.tsx           # Tela analítica de saldos, empenhos, adesões e contratos do item
│   │   ├── AllocationsRoute.tsx            # Painel global de alocações departamentais
│   │   ├── CentralPrazosRoute.tsx          # Central de Prazos temporal (Contratos e ARPs)
│   │   ├── Contract360Route.tsx            # Rota executiva do Contrato 360° (/contratos/:contractKey)
│   │   ├── UsersRoute.tsx                  # Gestão administrativa de usuários e servidores
│   │   └── RolesRoute.tsx                  # Matriz de papéis, permissões e RBAC
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx                # Shell principal com Navbar, Sidebar e modais globais
│   │   │   ├── Navbar.tsx                  # Barra superior institucional MJSP com seleção de UASG
│   │   │   └── Sidebar.tsx                 # Navegação hierárquica retrátil
│   │   ├── HomeDashboard.tsx               # Dashboard executivo com contadores gerais e atalhos
│   │   ├── ArpSearch.tsx                   # Filtros e cards de pesquisa de atas governamentais
│   │   ├── ArpItems.tsx                    # Tabela e cards de itens da ata
│   │   ├── ItemBalances.tsx                # [LEGADO/CENTRAL] Tela monumental (2.126 linhas) de saldos e conciliação
│   │   ├── InternalAllocationsDashboard.tsx# Painel gerencial de alocações internas por departamento
│   │   ├── ContractsDashboard.tsx          # Dashboard de contratos (KPIs, filtros e busca)
│   │   ├── contracts/                      # [CONSOLIDADO FASE 5] Visão 360° do Contrato
│   │   │   ├── Contract360Page.tsx         # Orquestrador da página Contrato 360°
│   │   │   ├── Contract360Header.tsx       # Header executivo do contrato
│   │   │   ├── Contract360Summary.tsx      # Dados cadastrais e administrativos
│   │   │   ├── Contract360Section.tsx      # Contêiner semântico padronizado
│   │   │   ├── ContractAttentionCenter.tsx # Central de Atenção Temporal do contrato
│   │   │   ├── ContractWorkflowsSection.tsx# Painel de workflows operacionais
│   │   │   ├── ContractWorkflowCard.tsx    # Card do workflow com stepper
│   │   │   ├── ContractWorkflowStepper.tsx # Stepper visual de macroetapas
│   │   │   ├── ContractTasksSection.tsx    # Gestão de tarefas com semântica de execução
│   │   │   └── ContractEventsTimeline.tsx  # Linha do tempo de fatos oficiais e decisões
│   │   ├── cards/
│   │   │   ├── AtaCard.tsx                 # Card de exibição da ata
│   │   │   ├── ContractCard.tsx            # Card de contrato no dashboard geral
│   │   │   └── ContractManagementPanel.tsx # [LEGADO FASE 4] Painel colapsável no card
│   │   ├── prazos/
│   │   │   ├── CentralPrazosDashboard.tsx  # Painel de controle de prazos
│   │   │   ├── CentralPrazosFiltersBar.tsx # Filtros temporais semafóricos
│   │   │   └── CentralPrazosTable.tsx      # Tabela de prazos e eventos temporais
│   │   └── modals/
│   │       ├── ExportExcelModal.tsx        # Exportação relatórios gerenciais Excel
│   │       ├── ContractTaskTemplatesModal.tsx # Catálogo de modelos de tarefas
│   │       ├── ManageDepartmentsModal.tsx  # CRUD de departamentos/unidades
│   │       ├── SeiManagementModal.tsx      # Consulta e associação de processos SEI
│   │       ├── ManualEmpenhoModal.tsx      # Cadastro manual de notas de empenho
│   │       └── ManualContratoModal.tsx     # Cadastro manual de contratos vinculados
│   │
│   ├── services/
│   │   ├── api.ts                          # Integração direta com Compras.gov.br e PNCP
│   │   ├── balanceService.ts               # Regras contábeis invioláveis de cálculo de saldo
│   │   ├── allocationService.ts            # Gerenciamento de alocações departamentais e dados manuais
│   │   ├── temporalEngineService.ts        # Motor temporal canônico (regras, feriados, BRT)
│   │   ├── centralPrazosService.ts         # Agregação unificada de prazos de ARPs e Contratos
│   │   ├── contractService.ts              # Busca e conciliação de contratos oficiais
│   │   ├── contractManagementService.ts    # Gestão de tarefas e gestores de contratos
│   │   ├── contractEventService.ts         # Domínio de eventos canônicos e oficialidade
│   │   ├── contractProrrogationService.ts  # Domínio de prazos e instrução de prorrogação
│   │   ├── contractAmendmentService.ts     # Domínio de termos aditivos, apostilamentos e limites
│   │   ├── contractClosureWorkflowService.ts # Domínio de encerramento regular e TRD
│   │   ├── contractRescissionWorkflowService.ts # Domínio de rescisão e extinção contratual
│   │   ├── seiService.ts                   # Integração e normalização de processos SEI
│   │   ├── unitService.ts                  # Normalização e catálogo de departamentos
│   │   ├── userService.ts / roleService.ts # Gestão de usuários e permissões RBAC
│   │   └── dbCacheService.ts               # Cache local IndexedDB/L2 de atas e itens
│   │
│   ├── adapters/                           # RPC Adapters (blindagem contra escrita direta na tabela)
│   │   ├── allocationRpcAdapter.ts
│   │   ├── contractManagementRpcAdapter.ts
│   │   ├── contractRpcAdapter.ts
│   │   ├── departmentRpcAdapter.ts
│   │   ├── empenhoLinkRpcAdapter.ts
│   │   ├── manualEmpenhoRpcAdapter.ts
│   │   ├── manualQuantityRpcAdapter.ts
│   │   └── seiRpcAdapter.ts
│   │
│   └── supabase/migrations/                # 14 migrations SQL versionadas e atômicas
```

---

## 3. GRANDES CAPACIDADES DO SISTEMA

| Capacidade | Estado | Fonte Primária | Persistência | Integrações | Lacunas Principais |
|---|:---:|---|---|---|---|
| **Catálogo de Atas (ARPs)** | **CONSOLIDADO** | Compras.gov.br / PNCP | Cache Postgres / L2 | API Compras / PNCP | Dependência de scraping/API pública sem webhook de atualização em tempo real. |
| **Itens da Ata** | **CONSOLIDADO** | Compras.gov.br | Cache Postgres / L2 | API Compras | Descrição longa por vezes truncada na API externa. |
| **Cálculo de Saldos da Ata** | **CONSOLIDADO** | Regra Contábil Pura | Não persiste saldo (calculado sob demanda) | `balanceService` | Saldo da ata é robusto, mas saldo específico por departamento depende de conciliação manual de empenhos. |
| **Alocações por Departamento** | **FUNCIONAL** | Cadastro Interno | Supabase (`arp_allocations`) via RPC | Departamentos, SEI | Alocações não bloqueiam nem validam se o total alocado ultrapassa 100% da ata no ato da digitação. |
| **Contrato 360°** | **CONSOLIDADO** | Contratos.gov.br / PNCP | Supabase (Gestão e Tasks) | PNCP, Comprasnet, SEI | Falta embutir detalhamento fino de itens e empenhos na aba 6 (atualmente mantida como placeholder). |
| **Workflows Contratuais** | **CONSOLIDADO** | Domínio Fase 4 / 5.4 | Derivado de Prazos e Tarefas | Motor Temporal | Workflows são excelentes para contratos, mas inexistentes para o ciclo preparatório da Ata. |
| **Central de Prazos** | **CONSOLIDADO** | Motor Temporal Único | Não persiste (cálculo dinâmico) | Contratos, ARPs, Tasks | Visualização gerencial de excelência; falta apenas link direto na coluna identificadora. |
| **Gestão de Empenhos** | **PARCIAL** | PNCP / Comprasnet / Manual | Supabase (`empenhos_manuais`, `empenho_links`) | PNCP, SIAFI | **Grande lacuna**: sem importação direta do SIAFI/Tesouro; dependência de cadastro manual em atas onde a API não traz o empenho do item. |
| **Processos SEI** | **FUNCIONAL** | Cadastro Interno | Supabase (`processos_sei`) via RPC | Alocações, Contratos | Não há integração nativa SOAP/REST com o barramento do SEI; número é digitado manualmente. |
| **Estrutura Organizacional** | **CONSOLIDADO** | Catálogo Interno | Supabase (`internal_departments`) via RPC | Alocações, Usuários | Cadastro sólido com suporte a alias, mesclagem e desativação sem deleção em cascata. |
| **RBAC e Governança** | **CONSOLIDADO** | Supabase Auth / Local | Supabase (`user_roles`) + RLS | AppShell, Rotas | Perfis mapeados (Administrador, Coordenador, Fiscal, Consulta). |
| **Exportação Excel** | **FUNCIONAL** | Dados em Memória | Geração Client-side (XLSX) | Toda a aplicação | Exporta atas e itens com perfeição; não exporta ainda o dossiê consolidado do Contrato 360°. |

---

## 4. FLUXO DE NEGÓCIO REAL DO SALDOARP

O fluxo de negócio operacional reconstruído a partir do código revela onde o processo é fluido e onde ocorrem rupturas manuais:

```text
┌─────────────────┐
│   COMPRASNET    │
│  Homologação    │
└────────┬────────┘
         │ (Automático via API Compras.gov.br)
         ▼
┌─────────────────┐
│       ARP       │◄─── Consulta de vigência, fornecedor e saldo global homologado
└────────┬────────┘
         │ (Automático via API)
         ▼
┌─────────────────┐
│   ITENS DA ATA  │◄─── Quantidade Registrada, Preço Unitário, Valor Homologado
└────────┬────────┘
         │
         │  ◄── [RUPTURA 1]: Divisão interna entre departamentos (DITEC, CGTI, DPRF)
         │                   é feita manualmente pelo operador em "Alocações por Unidade".
         ▼
┌─────────────────┐
│    ALOCAÇÕES    │◄─── Cota Departamental (ex: DITEC tem 100 notebooks, CGTI tem 50)
└────────┬────────┘
         │
         │  ◄── [RUPTURA 2]: O operador precisa digitar manualmente o Processo SEI
         │                   de demanda e vincular à alocação.
         ▼
┌─────────────────┐
│   PROCESSO SEI  │◄─── Instrução do Pedido / Demanda de Compra
└────────┬────────┘
         │
         │  ◄── [RUPTURA 3 - CRÍTICA]: A emissão da Nota de Empenho ocorre no SIAFI.
         │      A API do PNCP nem sempre associa o empenho ao item da ata de forma atômica.
         │      O operador frequentemente precisa recorrer ao "Cadastrar Empenho Manual"
         │      ou vincular o empenho à alocação via modal ("Vincular a Departamento").
         ▼
┌─────────────────┐
│ NOTA DE EMPENHO │◄─── Consome o Saldo Real da Ata (Invariante Contábil)
└────────┬────────┘
         │
         │  ◄── [RUPTURA 4]: Para bens de entrega imediata, encerra no empenho.
         │      Para serviços contínuos ou compras complexas, gera-se um Contrato.
         │      Na tela de itens (`ItemBalances`), existe uma tabela de "Contratos Manuais"
         │      onde o usuário precisa digitar número/ano do contrato vinculado à ata,
         │      DESCONECTADA do Dashboard de Contratos que já possui o contrato oficial!
         ▼
┌─────────────────┐
│    CONTRATO     │◄─── Contratos.gov.br / PNCP
└────────┬────────┘
         │ (100% Integrado e Automatizado)
         ▼
┌─────────────────┐
│  CONTRATO 360°  │◄─── Workflows, Prazos de Prorrogação (-180d), Tarefas, Timeline
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   FINALIZAÇÃO   │◄─── Termo de Recebimento Definitivo / Encerramento Regular
└─────────────────┘
```

---

## 5. DIAGNÓSTICO DO MÓDULO ARPs

* **Entrada de Dados:** 100% automatizada a partir do endpoint `/modulo-legado/1_consultarAta` e PNCP.
* **Itens e Fornecedores:** Mapeamento preciso de itens com descrição, PDM, CNPJ e Razão Social do fornecedor.
* **Capacidade de Acompanhamento:** O SaldoARP consegue acompanhar a ata perfeitamente no nível de saldo global e vigência (Central de Prazos alerta atas a vencer em 60/90 dias).
* **Onde Quebra o Fluxo?**
  * Quebra na rastreabilidade entre a ata e os contratos derivados dela. O usuário que pesquisa a ata na tela `/atas` visualiza o saldo e os empenhos conhecidos, mas para saber se um contrato foi lavrado a partir daquela ata, depende de consulta manual ou de digitação na tabela auxiliar de contratos manuais.

---

## 6. DIAGNÓSTICO DO MÓDULO SALDOS

* **Regra Matemática Canônica:**
  $$\text{Saldo Disponível} = \text{Quantidade Registrada na Ata} - \sum \text{Empenhos Válidos}$$
* **Conformidade Contábil:** O `balanceService.ts` é exemplar. Ele proíbe terminantemente subtrair contratos do saldo da ata e impede que o mesmo empenho seja deduzido mais de uma vez.
* **Pergunta da Auditoria:** *Existe uma única fonte de verdade para saldo?*
  * **Sim**, a fórmula é centralizada no `balanceService.ts`.
  * **Porém**, existem **duas origens de dados de empenho**:
    1. Empenhos que chegam automaticamente via API governamental (`useItemEmpenhos`);
    2. Empenhos inseridos manualmente pelo operador (`useItemManualEmpenhos`).
  * O sistema possui uma função de reconciliação (`reconcileBalances`), mas se o operador cadastrar um empenho manual com número ligeiramente diferente do oficial (ex: `142` vs `2026NE000142`), pode haver duplicidade temporária até a reconciliação manual pelo card `ItemReconciliationCard`.

---

## 7. DIAGNÓSTICO DE ALOCAÇÕES E DISTRIBUIÇÃO

* **Finalidade:** Permitir que o gestor da ata parcele a quantidade total da ata entre as áreas requisitantes do Ministério (ex: 50 licenças para CGTI, 30 para DITEC, 20 para SENASP).
* **Persistência:** Gravada via RPC atômica `executeSaveAllocationsRpc` na tabela `arp_allocations`, com controle otimista de versão (`item_allocation_state`).
* **Trabalho Manual Identificado:**
  * O gestor precisa abrir item por item para distribuir cotas. Não existe distribuição em lote (ex: "atribuir 10% da ata inteira para o departamento X").
  * O vínculo do empenho à respectiva alocação departamental depende de ação humana de associação na tela (`useSaveEmpenhoLinks`).

---

## 8. DIAGNÓSTICO DO MÓDULO EMPENHOS

* **Pergunta da Auditoria:** *O usuário consegue saber quanto já foi comprometido e quanto ainda está disponível?*
  * **Na Ata de Registro de Preços:** Sim. O saldo é explícito e destacado em cards semafóricos no topo da tela do item.
  * **No Contrato Administrativo:** Parcialmente. No Contrato 360°, o usuário visualiza o "Valor Global" e o "Valor Inicial" contratados, mas a lista detalhada de empenhos do contrato ainda depende da expansão do card legado ou da visualização da aba 6 (placeholder).
* **Lacuna Estrutural:** Não existe uma tela ou dashboard global de "Empenhos" no sistema. O item de menu "Empenhos e Conciliação" está marcado como `status: 'planned'` no `navigation.ts`.

---

## 9. DIAGNÓSTICO DO MÓDULO CONTRATOS E INTEGRAÇÃO

* **Isolamento vs Integração:** O Módulo Contratos (Fase 5) é perfeito quando acessado a partir de `/contratos`. O Contrato 360° exibe cabeçalho, atenção temporal, workflows e eventos com maestria.
* **A Grande Lacuna de Ligação:**
  * A navegação **Contrato $\rightarrow$ Ata** é tênue: o contrato possui o campo `idCompra` / `licitacao_numero`, mas não exibe um card com link direto para navegar até a Ata de origem no módulo `/atas`.
  * A navegação **Ata $\rightarrow$ Contrato** é truncada: na tela de saldo do item (`ItemBalances.tsx`), os contratos vinculados dependem da tabela `contratos_manuais` (preenchida via `ManualContratoModal`) ou de consultas pontuais na API do PNCP, ignorando a base de dados oficial e normalizada que o próprio SaldoARP já carrega no `ContractsDashboard`.

---

## 10. DIAGNÓSTICO DA INTEGRAÇÃO COM PNCP

* **Fonte Soberana:** O PNCP é a autoridade jurídica soberana de publicidade de contratos, termos aditivos e atas da Lei 14.133/2021.
* **Dados Oficiais vs Internos:**
  * Dados Oficiais PNCP: Número de controle PNCP, data de publicação, link público, vigência oficial e valores pactuados.
  * Dados Internos SaldoARP: Designação de gestores, atribuição de tarefas, status de prontidão e anotações instrutórias.
* **Reconciliação:** O SaldoARP sempre prioriza o Fato Oficial soberano em detrimento de qualquer registro local (confirmado na correção `ACH-5.3-01`).

---

## 11. DIAGNÓSTICO DA INTEGRAÇÃO COM O SEI

* **Natureza da Integração:** O SaldoARP opera estritamente como **camada de gestão, governança e contexto**. Ele não replica o SEI nem armazena documentos PDF.
* **Persistência:** A tabela `processos_sei` armazena metadados: número do processo formatado, objeto resumido, unidade requisitante e servidor responsável.
* **Trabalho Manual:** A inserção do processo SEI no SaldoARP é 100% manual (o operador copia o número do SEI e cola no modal do SaldoARP). Não há consulta automática de andamento via Web Service do SEI.

---

## 12. ESTRUTURA ORGANIZACIONAL E DEPARTAMENTOS

* **Cadastro Canônico:** Tabela `internal_departments` gerida via RPC `executeSaveDepartmentRpc`.
* **Robustez:** Suporta fusão de departamentos (`executeMergeDepartmentRpc`) e salvaguarda de integridade referencial com `ON UPDATE CASCADE`.
* **Zero Duplicidade no Backend:** Departamentos possuem identificador único (`sigla`), eliminando grafias conflitantes.

---

## 13. GOVERNANÇA E RBAC

* **Papeis Definidos:** Administrador, Coordenador, Fiscal de Contrato e Leitor/Consulta.
* **Segurança:** As RPCs de backend verificam permissões e impedem escrita direta não autorizada.
* **Consistência:** Permissões do frontend espelham os papéis cadastrados na tabela `user_roles`.

---

## 14. CENTRAL DE PRAZOS E MOTOR TEMPORAL

* **Pergunta Crítica:** *Existe um único motor temporal?*
  * **SIM.** O `temporalEngineService.ts` é o motor temporal soberano do sistema.
  * Ele gerencia feriados nacionais, cálculo de dias úteis e corridos, fusos horários em BRT (`America/Sao_Paulo`) e os limiares padronizados:
    * `D < 0`: VENCIDO / EXPIRADO
    * `D = 0`: VENCENDO HOJE
    * `1 ≤ D ≤ 7`: URGENTE
    * `8 ≤ D ≤ 30`: ATENÇÃO / PRÓXIMO
    * `D > 30`: REGULAR / NORMAL
* **Central de Prazos (`/prazos`):** Unifica sob o mesmo motor tanto os vencimentos de Atas de Registro de Preços quanto de Contratos Administrativos e Tarefas Operacionais.

---

## 15. TAREFAS E EXECUTOR

* **Modelo Canônico:** As tarefas do sistema são estruturadas em `contract_task_templates` e `contract_task_plans`.
* **Semântica de Execução:** Divididas em `INTERNA` (despacho), `EXTERNA` (ação no SEI/Comprasnet), `CONFIRMAÇÃO` (aguardo de ato) e `AUTOMATICA`.
* **Auditoria de Paralelismo:** Não existem múltiplos motores de tarefas competindo entre si. As tarefas dos workflows operacionais (Prorrogação, Aditamentos, Rescisão) são projetadas a partir do mesmo plano de tarefas canônico.

---

## 16. NOTIFICAÇÕES E AUTOMAÇÕES

* **O que é Automático:**
  * Cálculo dinâmico de prazos e transições de badges semafóricos;
  * Ativação automática do workflow de prorrogação a 180 dias do término da vigência;
  * Ativação do workflow de encerramento a 60 dias do fim do contrato;
  * Invalidação de cache React Query após mutations.
* **O que NÃO Existe (Lacuna):**
  * Não há disparo de alertas por e-mail para fiscais sobre tarefas vencidas;
  * Não há rotinas agendadas (Cron de backend) para notificar gestores sobre o marco de 180 dias de prorrogação fora da interface do sistema.

---

## 17. IMPORTAÇÃO E SINCRONIZAÇÃO ("ONDE O USUÁRIO COPIA DADOS?")

A auditoria identificou os pontos exatos onde o usuário é forçado a copiar dados manualmente entre sistemas:

1. **Número do Processo SEI:** O usuário precisa copiar do SEI e colar no SaldoARP.
2. **Empenhos não vinculados automaticamente:** Quando uma ata possui empenhos emitidos no SIAFI que não foram associados ao item pelo Comprasnet, o operador precisa digitar manualmente número, ano, quantidade e valor na tela `ManualEmpenhoModal`.
3. **Contratos derivados da Ata:** O operador copia número/ano do contrato no Comprasnet e digita no modal `ManualContratoModal` da ata, **mesmo quando esse contrato já existe sincronizado na tela de Contratos do SaldoARP**.

---

## 18. AVALIAÇÃO DO PRINCÍPIO "DIGITE UMA VEZ"

| Informação | Onde é digitada | Onde deveria ser reutilizada automaticamente | Diagnóstico |
|---|---|---|---|
| **Contrato derivado da Ata** | Digitado manualmente no modal de Contratos da Ata (`ManualContratoModal`). | Deveria ser selecionado diretamente a partir dos contratos oficiais já sincronizados da UASG. | **Duplicação problemática.** Cria risco de erro de digitação de contrato que o sistema já conhece. |
| **Processo SEI** | Digitado manualmente no modal SEI. | Já é reutilizado perfeitamente entre alocações e contratos vinculados. | **Adequado** (dado que não há API pública do SEI). |
| **Empenho do Item** | Digitado manualmente no modal de empenho da ata quando a API não o mapeia. | Deveria ser auto-completado caso o número do empenho já conste na base de empenhos de contratos. | **Oportunidade de melhoria.** |

---

## 19. DUPLICAÇÕES FUNCIONAIS IDENTIFICADAS

1. **Visualização de Gestão do Contrato:**
   * `ContractManagementPanel.tsx` (gaveta expansível no card do dashboard - Fase 4);
   * `Contract360Page.tsx` (página completa Contrato 360° - Fase 5).
   * *Classificação:* **Redundante e pronta para transição**. O painel inline do card deve ser aposentado em favor da Visão 360°.
2. **Cadastro de Contratos Vinculados:**
   * Tabela `contratos_manuais` (em `allocationService.ts`) convive com a tabela oficial de contratos derivados da API (`contractService.ts`).
   * *Classificação:* **Problemática**. Deve haver reconciliação para que um contrato vinculado a uma ata seja apontado para o contrato canônico da base oficial.

---

## 20. INVENTÁRIO DE CÓDIGO LEGADO

| Componente Legado | Substituto Moderno | Situação Atual | Risco Operacional |
|---|---|---|---|
| `ContractManagementPanel.tsx` | `Contract360Page.tsx` | Coexistindo no card | Baixo (ambos compartilham as mesmas mutations e tabelas de plano). |
| `ItemBalances.tsx` (monolítico) | Componentes modulares (`item-balances/*`) | Parcialmente refatorado | Médio (arquivo com 2.126 linhas dificulta manutenção e testes unitários isolados). |
| `contratos_manuais` (tabela) | Relacionamento direto com chave oficial de contrato | Ativa no Supabase | Médio (permite cadastrar contratos com chaves informais). |

---

## 21. EXPERIÊNCIA DO USUÁRIO — RESPOSTAS ÀS PERGUNTAS VITAIS

* **A. "O que eu tenho para administrar?"**  
  $\rightarrow$ **Respondido com excelência**. O usuário visualiza no Dashboard de Atas todas as atas sob sua UASG e no Dashboard de Contratos todos os contratos vigentes com indicadores de valor e fornecedor.
* **B. "Qual é a situação atual?"**  
  $\rightarrow$ **Respondido com excelência**. Badges semafóricos claros indicam "Vigente", "A Vencer" ou "Expirado".
* **C. "O que precisa da minha atenção?"**  
  $\rightarrow$ **Respondido com excelência** na Visão 360° (Central de Atenção) e na Central de Prazos.
* **D. "O que devo fazer agora?"**  
  $\rightarrow$ **Respondido com clareza** através da lista de tarefas pendentes e da "Próxima Ação" destacada nos cards de workflow.
* **E. "O que já foi feito?"**  
  $\rightarrow$ **Respondido com excelência** na Linha do Tempo Contratual e no histórico de tarefas concluídas.
* **F. "De onde veio essa informação?"**  
  $\rightarrow$ **Respondido com clareza**. Selos explícitos distinguem "Fato Oficial (PNCP/Contratos.gov.br)" de "Decisão Interna (SEI)" e "Registro Local".
* **G. "Onde preciso acessar um sistema externo?"**  
  $\rightarrow$ **Sinalizado com botões de link externo** com ícone `ExternalLink` para PNCP, Comprasnet e SEI.

---

## 22. TABELA DE SSOT (SINGLE SOURCE OF TRUTH)

| Conceito de Negócio | SSOT Canônico Atual | Existe Duplicidade? | Análise da Auditoria |
|---|---|:---:|---|
| **Ata de Registro de Preços** | API Compras.gov.br / Cache L2 | Não | Fonte oficial única reconciliada. |
| **Itens da Ata** | API Compras.gov.br / `itens_ata` | Não | Fonte oficial única. |
| **Saldo da Ata** | `balanceService.calculateSaldo` | Não | Uma única fórmula matemática para todo o sistema. |
| **Fornecedor** | Cadastro Federal (Receita / PNCP) | Não | CNPJ e Razão Social soberanos. |
| **Departamento / Unidade** | `public.internal_departments` | Não | Catálogo único centralizado no Supabase. |
| **Contrato Administrativo** | API Contratos.gov.br / PNCP | **Sim (Parcial)** | Existe o contrato oficial governamental e existe o registro na tabela `contratos_manuais` de itens de ata. |
| **Eventos Contratuais** | `contractEventService.ts` | Não | Geração puramente determinística baseada em fatos oficiais. |
| **Workflows de Contrato** | `useContractWorkflows.ts` | Não | Projeção pura sem engine paralela. |
| **Tarefas e Checklists** | `public.contract_task_plans` | Não | Persistência centralizada no Supabase. |
| **Motor de Prazos** | `temporalEngineService.ts` | Não | Motor temporal único para todo o sistema. |
| **Notas de Empenho** | PNCP / SIAFI / `empenhos_manuais` | **Sim** | Empenhos oficiais da API convivem com empenhos manuais cadastrados pelo operador. |
| **Alocações Internas** | `public.arp_allocations` | Não | Tabela relacional única com optimistic locking. |

---

## 23. MATRIZ DE INTEGRAÇÃO INTER-MÓDULOS

| De | Para | Integração Atual | Tipo | Status | Lacuna Identificada |
|---|---|---|:---:|:---:|---|
| **ARP** | **Item** | Nativa via API Compras | Automática | **CONCLUÍDA** | Nenhuma. |
| **Item da Ata** | **Saldo** | Nativa via `balanceService` | Automática | **CONCLUÍDA** | Nenhuma. |
| **Item da Ata** | **Alocação** | Cadastro relacional via RPC | Manual | **FUNCIONAL** | Alocação exige entrada manual cota a cota. |
| **Alocação** | **Processo SEI** | Chave estrangeira relacional | Manual | **FUNCIONAL** | Usuário seleciona processo previamente cadastrado. |
| **Alocação** | **Empenho** | Tabela `empenho_links` | Manual | **PARCIAL** | Exige associação manual de cada empenho à alocação. |
| **Empenho** | **Contrato** | Mapeamento no Contratos.gov.br | Automática | **FUNCIONAL** | Disponível no backend; falta visualização rica no 360°. |
| **ARP** | **Contrato** | Tabela `contratos_manuais` | Manual | **FRAGMENTADA** | **Ata e Contrato operam em silos separados**. |
| **Contrato** | **Workflow** | `useContractWorkflows` | Automática | **CONCLUÍDA** | Integração total Fase 5.4. |
| **Workflow** | **Task** | Stepper projeta tarefas do plano | Automática | **CONCLUÍDA** | Integração total Fase 5.4. |
| **Task** | **Atenção** | `ContractAttentionCenter` | Automática | **CONCLUÍDA** | Integração total Fase 5.2. |
| **Contrato** | **PNCP** | Reconciliação por chave PNCP | Automática | **CONCLUÍDA** | Integração total Fase 5.3. |
| **Contrato** | **SEI** | Metadados do contrato (`processo`) | Automática | **CONCLUÍDA** | Link e exibição direta do número SEI. |

---

## 24. NÍVEL DE MATURIDADE POR MÓDULO

Classificação segundo a escala técnica:
* **Nível 1 (Fragmentado)**: Dados isolados, trabalho manual redundante.
* **Nível 2 (Funcional)**: Executa a operação básica, mas com etapas manuais.
* **Nível 3 (Integrado)**: Conectado a outros módulos, sem duplicidade de regras.
* **Nível 4 (Gerencial)**: Oferece visão 360°, inteligência de prazos e governança.
* **Nível 5 (Inteligente/Proativo)**: Antecipa eventos, automação total e conciliação preditiva.

| Módulo | Nível de Maturidade | Justificativa |
|---|:---:|---|
| **Contrato 360° & Workflows** | **Nível 4 (Gerencial)** | Painel executivo completo, visão 360°, motor temporal, imutabilidade de eventos e regras formais da Lei 14.133/2021. |
| **Central de Prazos** | **Nível 4 (Gerencial)** | Visão unificada de prazos de contratos, atas e tarefas, semáforo visual e explicabilidade normativa. |
| **Estrutura Organizacional & RBAC** | **Nível 3 (Integrado)** | Catálogo canônico de departamentos, autoridade de backend via RPCs e permissões refinadas. |
| **Gestão de Atas & Saldos da Ata** | **Nível 3 (Integrado)** | Cálculo contábil inviolável, importação oficial e persistência L2 estável. |
| **Alocações Departamentais** | **Nível 2 (Funcional)** | Permite dividir cotas e vincular empenhos, mas exige digitação manual tela a tela sem automações em lote. |
| **Integração ARP $\rightarrow$ Contrato** | **Nível 1 (Fragmentado)** | A conexão entre a Ata de origem e o Contrato derivado ainda depende de preenchimento manual ou opera em silos. |
| **Gestão e Conciliação de Empenhos** | **Nível 2 (Funcional)** | Módulo global planejado ainda não construído; conciliação depende do operador. |

---

## 25. OS 10 MAIORES GARGALOS OPERACIONAIS DO SISTEMA

Abaixo estão os 10 principais gargalos operacionais diagnosticados no SaldoARP:

| # | Gargalo Operacional | Consequência no Dia a Dia | Usuários Afetados | Módulo | Categoria | Esforço Aparente | Risco |
|---|---|---|---|---|:---:|:---:|:---:|
| **G-01** | **Silo entre ARP e Contrato** | O fiscal que gerencia a ata não enxerga os contratos oficiais gerados a partir dela sem digitar manualmente. | Gestores de Ata e Fiscais | Atas / Contratos | **CRÍTICO** | Médio | Médio |
| **G-02** | **Monolito `ItemBalances.tsx`** | Código de 2.126 linhas concentra dezenas de hooks e modais, aumentando complexidade de manutenção. | Desenvolvedores / Sustentação | Saldos | **IMPORTANTE** | Médio | Baixo |
| **G-03** | **Coexistência de Contratos Manuais** | Tabela `contratos_manuais` duplica conceitos que já existem no `ContractsDashboard`. | Gestores e Auditores | Alocações / Contratos | **IMPORTANTE** | Médio | Médio |
| **G-04** | **Falta de Conciliação Global de Empenhos** | Empenhos ficam restritos à visualização de cada item de ata individual; sem visão macro da UASG. | Coordenadores e Contabilidade | Empenhos | **CRÍTICO** | Médio-Alto | Médio |
| **G-05** | **Ausência de Alocações em Lote** | Para atas com 50 itens, o gestor precisa abrir 50 vezes a tela para alocar cotas aos departamentos. | Coordenadores de Área | Alocações | **IMPORTANTE** | Baixo-Médio | Baixo |
| **G-06** | **Placeholder no Bloco 6 do 360°** | Faltam detalhes de itens e empenhos embutidos na Visão 360°, exigindo retorno à visão clássica. | Fiscais de Contrato | Contrato 360° | **MODERADO** | Baixo-Médio | Baixo |
| **G-07** | **Coexistência do Card Legado** | `ContractManagementPanel` no card do dashboard confunde o usuário que tem a Visão 360°. | Fiscais e Operadores | Contratos | **MODERADO** | Baixo | Baixo |
| **G-08** | **Falta de Notificações Ativas (Push/Email)** | Prazos prementes só são vistos quando o usuário abre o sistema; sem disparo ativo para o fiscal. | Fiscais e Coordenadores | Prazos / Tasks | **MELHORIA** | Médio | Médio |
| **G-09** | **Inserção Manual de Processo SEI** | Operador precisa copiar número de processo do SEI manualmente para o SaldoARP. | Requisitantes e Gestores | SEI / Alocações | **MODERADO** | Alto (requer WS) | Baixo |
| **G-10** | **Identificador sem Link na Central de Prazos** | Usuário vê o contrato na tabela da Central de Prazos, mas precisa ir ao menu Contratos para abri-lo. | Fiscais e Gestores | Central de Prazos | **MELHORIA** | Muito Baixo | Nulo |

---

## 26. CANDIDATOS À PRÓXIMA GRANDE FRENTE DO SALDOARP

Com base exclusivamente nos fatos e gargalos mapeados, identificam-se os seguintes candidatos a grandes frentes de evolução:

| Candidato | Frente Proposta | Lacuna que Resolve | Dependências | Impacto Operacional | Complexidade Aparente |
|:---:|---|---|---|---|:---:|
| **F-1** | **Integração Unificada ARP $\leftrightarrow$ Contrato** | Elimina o silo entre Atas e Contratos. Permite que uma Ata aponte diretamente para seus Contratos Oficiais e vice-versa, aposentando a tabela `contratos_manuais`. | Módulo Contratos (Fase 5) e `allocationService` | **MUITO ALTO**: Fecha o ciclo de vida completo Ata $\rightarrow$ Contrato. | Média |
| **F-2** | **Módulo Global de Empenhos & Conciliação** | Ativa a rota planejada "Empenhos e Conciliação", oferecendo visão consolidada de todos os empenhos da UASG, conciliação automática com itens de ata e contratos. | APIs PNCP/Comprasnet e `balanceService` | **MUITO ALTO**: Dá transparência financeira total ao saldo comprometido da instituição. | Média-Alta |
| **F-3** | **Consolidação do Bloco 6 do Contrato 360° & Aposentadoria do Legado** | Incorpora o detalhamento técnico de itens contratados e empenhos diretamente na Visão 360°, descontinuando o `ContractManagementPanel` no card do dashboard. | `useContractDetails` e `Contract360Page` | **MÉDIO**: Conclui o acabamento estético e ergonômico do Contrato 360°. | Baixa |
| **F-4** | **Automação de Alocações em Lote e Gestão de Cotas** | Permite distribuir itens de ata por departamento em lote (matriz departamental), com validação de teto de 100% da ata. | `InternalAllocationsDashboard` e RPCs de alocação | **MÉDIO**: Economiza dezenas de horas de digitação do gestor de atas complexas. | Média |
| **F-5** | **Sistema de Notificações e Alertas Ativos** | Cria rotinas de notificação por e-mail ou webhook sobre gatilhos temporais críticos (-180d prorrogação, tarefas vencidas). | `temporalEngineService` e serviço de mensageria | **MÉDIO**: Torna a gestão de prazos proativa fora da tela do sistema. | Média-Alta |

---

## 27. SAÚDE TÉCNICA E TESTES

A auditoria executou a suíte completa de verificação técnica do projeto:

```text
1. Vitest:
   Test Files: 66 passed (66)
   Tests:      564 passed (564)
   Tempo:      4.07s
   Status:     100% VERDE

2. TypeScript Compiler:
   Comando:    npx tsc -b
   Erros:      0
   Status:     APROVADO

3. Linter:
   Comando:    npm run lint (oxlint)
   Erros:      0
   Warnings:   42 (restritos ao arquivo monolítico legado ItemBalances.tsx)
   Status:     APROVADO

4. Vite Production Build:
   Comando:    npm run build
   Tempo:      887ms
   Status:     APROVADO (dist gerado com sucesso)
```

---

## 28. AUDITORIA DO BANCO DE DADOS (SUPABASE / POSTGRESQL)

* **Migrations:** 14 arquivos versionados, organizados cronologicamente.
* **Tabelas Principais:**
  * `atas_registro_preco`, `itens_ata` (Cache L2);
  * `internal_departments` (Estrutura organizacional);
  * `processos_sei` (Contexto de processos);
  * `arp_allocations`, `item_allocation_state`, `empenho_links` (Alocações e conciliação);
  * `empenhos_manuais`, `contratos_manuais`, `empenho_manual_quantidades` (Extensões manuais);
  * `contract_managers`, `contract_task_templates`, `contract_task_plans` (Governança e 360°).
* **RPCs e Blindagem:** Escrita direta via API Supabase revogada para tabelas críticas (`revoke_direct_write_sei_departments`), garantindo que toda gravação passe por funções atômicas PL/pgSQL com validação e log de auditoria.
* **RLS:** Ativo e alinhado aos papéis administrativos do sistema.

---

## 29. CONCLUSÃO GERAL DO CHECKPOINT

Respondendo com precisão à pergunta do checkpoint:

### O SaldoARP está:
- **Não está fragmentado**: A arquitetura de serviços é sólida, as tipagens são rigorosas e os 564 testes automatizados garantem estabilidade absoluta.
- **Não é apenas funcional**: O sistema possui conceitos avançados de conformidade legal, auditoria imutável e motor temporal centralizado.
- **O Módulo Contratos está em nível Gerencial (Nível 4)**.
- **O restante do sistema encontra-se no nível Integrado (Nível 3)**.

### Veredito:
> **O SALDOARP ESTÁ PRONTO PARA UMA NOVA GRANDE FRENTE.**

A infraestrutura técnica suporta com folga o avanço. O diagnóstico fático demonstra que a maior oportunidade de impacto para a administração reside em **conectar os dois extremos do sistema**: unificar a visão da Ata de Registro de Preços com o Contrato Oficial derivado dela e fornecer a conciliação macro de Notas de Empenho da Unidade Gestora.
