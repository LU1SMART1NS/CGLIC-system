# SALDOARP — FASE 3.5: ARQUITETURA DA HOME E NAVEGAÇÃO

**Data:** 23 de Setembro de 2026  
**Status:** IMPLEMENTADO E VALIDADO COM SUCESSO  
**Métricas de Qualidade:**
* **49 arquivos de teste aprovados** (100% da suíte);
* **363 testes unitários e de integração passando** (0 falhas);
* **Build de produção aprovado** (`tsc -b && vite build` sem erros de compilação);
* **Zero migrations adicionais**, sem alteração de banco ou RPCs.

---

## 1. IMPLEMENTAÇÃO REALIZADA

A Fase 3.5 reestruturou a navegação do SaldoARP em **6 pilares funcionais** orientados ao ciclo de vida governamental da SENASP/MJSP e transformou a tela inicial em um verdadeiro **Cockpit Gerencial**.

### Principais Entregas:
1. **Nova Arquitetura de Navegação (6 Pilares):**
   * `Início` (Cockpit Gerencial);
   * `Central de Prazos` (Painel Unificado de Prazos e Tarefas);
   * `Atas de Registro de Preços` (Consulta/Vigência e Alocações);
   * `Contratos` (Acompanhamento, Modelos de Gestão e Prorrogações);
   * `Execução & Processos` (Processos SEI, Exportação Excel, Empenhos);
   * `Administração` (Departamentos, Usuários e Perfis RBAC).
2. **Resgate e Integração de Módulos Órfãos:**
   * Conectado o modal de **Processos Administrativos (SEI)** (`SeiManagementModal.tsx`) diretamente ao menu lateral e aos atalhos da Home;
   * Conectado o gerenciamento de **Departamentos e Unidades** (`ManageDepartmentsModal.tsx`) à seção de Administração;
   * Separados os **Modelos de Gestão Contratual** (`ContractTaskTemplatesModal.tsx`) do menu de Administração, posicionando-os no pilar de Contratos.
3. **Home como Cockpit Gerencial Integrado à Central de Prazos:**
   * Criado o componente `ImmediateAttentionBanner.tsx` com 4 cards de atenção imediata:
     - 🔴 **Atrasadas**
     - 🟠 **Vencendo Hoje**
     - 🟡 **Próximos 7 Dias**
     - 🔵 **Próximos 30 Dias**
   * Cada card consome os números canônicos de `useCentralPrazosData` e navega para `/prazos?tab=...` com a aba correspondente pré-selecionada;
   * Atualizado `ActionableAttentionCenter.tsx` para listar as 5 ações mais críticas da Central de Prazos com prioridade para itens atrasados e prazos imediatos;
   * Atualizado `QuickAccessGrid.tsx` com 6 atalhos operacionais rápidos.

---

## 2. ROTAS E COMPONENTES

| Rota / Ação | Componente / Modal | Pilar | Finalidade |
|---|---|---|---|
| `/` | `HomeRoute` | `Início` | Cockpit Gerencial com Banner de Atenção, Resumo e Ações Prioritárias |
| `/prazos` | `CentralPrazosDashboard` | `Central de Prazos` | Central de Prazos, Obrigações e Tarefas com Ficha de Explicabilidade |
| `/atas` | `ArpSearch` | `Atas de RP` | Consulta e Vigência de Atas de Registro de Preços |
| `/atas/saldos-unidade` | `InternalAllocationsDashboard` | `Atas de RP` | Alocações e cotas por unidade/departamento |
| `/contratos` | `ContractsDashboard` | `Contratos` | Painel de Contratos, Gestores, Fiscais e Planos de Trabalho |
| `open-contract-templates` | `ContractTaskTemplatesModal` | `Contratos` | Modelos de Gestão Contratual e Macrotarefas |
| `open-sei-modal` | `SeiManagementModal` | `Execução & Processos` | Gestão interna de Processos Administrativos / SEI |
| `open-export-modal` | `ExportExcelModal` | `Execução & Processos` | Exportação de relatórios gerenciais em Excel |
| `open-departments-modal` | `ManageDepartmentsModal` | `Administração` | Cadastro e fusão de Departamentos da SENASP |
| `/admin/usuarios` | `UsersManagement` | `Administração` | Gestão de Usuários e Servidores |
| `/admin/perfis` | `RolesPermissions` | `Administração` | Matriz RBAC de Perfis e Permissões |

---

## 3. INVENTÁRIO DE COMPONENTES REUTILIZADOS E CRIADOS

### Componentes Reutilizados:
* `src/components/home/DashboardExecutiveSummary.tsx` (Resumo de contratos, atas e valores sob gestão);
* `src/components/home/LifecycleFlowDiagram.tsx` (Fluxo do ciclo de vida governamental);
* `src/components/home/SyncActivityCard.tsx` (Cartão de sincronização com APIs governamentais);
* `src/components/home/QuickAccessGrid.tsx` (Refatorado para os novos atalhos);
* `src/components/home/ActionableAttentionCenter.tsx` (Refatorado para priorizar itens da Central de Prazos);
* `src/components/prazos/*` (Central de Prazos, KPIs, Filtros, Tabela e Modal de Explicabilidade);
* `src/components/SeiManagementModal.tsx` (Conectado à navegação);
* `src/components/ManageDepartmentsModal.tsx` (Conectado à navegação);
* `src/components/modals/ContractTaskTemplatesModal.tsx` (Conectado à navegação);
* `src/components/modals/ExportExcelModal.tsx` (Conectado à navegação).

### Componentes Criados:
* `src/components/home/ImmediateAttentionBanner.tsx`: Top banner com 4 cards de atenção imediata integrados à Central de Prazos.

---

## 4. RELAÇÃO HOME ↔ CENTRAL DE PRAZOS (ZERO DUPLICAÇÃO)

1. **Fonte Única de Verdade:** A Home consome `useCentralPrazosData('200331')`, compartilhando a mesma cache do React Query que a tela `/prazos`.
2. **Transição Transparente com Filtro Ativo:** Ao clicar em qualquer um dos 4 cards de atenção imediata, a Home dispara:
   ```typescript
   navigate(`/prazos?tab=${tab}`, { state: { tab } });
   ```
   E `CentralPrazosDashboard` sincroniza automaticamente seu estado local `filters.tab`.

---

## 5. TESTES E VERIFICAÇÃO DE BUILD

* **Execução Vitest:** 49 arquivos de teste executados com **363 testes passando** (0 falhas).
* **Compilação TypeScript / Vite Build:** Aprovada sem erros de tipagem.
* **Integridade Visual & Responsividade:** Layout testado em desktop, notebook e telas menores com recolhimento harmônico da barra lateral.

---

## 6. CONCLUSÃO

A **Fase 3.5** transformou o SaldoARP em uma plataforma com arquitetura clara e orientada ao ciclo de vida de compras governamentais, sem introduzir overengineering, sem duplicação de regras e preparando o terreno para a **Fase 4 (Workflows de Renovação e Prorrogação)**.
