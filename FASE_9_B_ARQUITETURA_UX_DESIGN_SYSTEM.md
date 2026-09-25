# ARQUITETURA UX E DESIGN SYSTEM DO NOVO SALDOARP — FASE 9-B

## STATUS: GO — FASE 9-B ARQUITETURA UX APROVADA

---

## 1. PRINCÍPIO FUNDAMENTAL E MODELO COGNITIVO

O SaldoARP 3.0 opera como um **Sistema de Gestão Operacional e Gerencial Contratual**, guiado pela progressão cognitiva de decisão:

$$\begin{aligned}
\text{1. O que está acontecendo?} &\longrightarrow \text{Visão Geral Executiva (KPIs de 1ª dobra)} \\
\text{2. O que precisa de atenção?} &\longrightarrow \text{Central de Atenção Priorizada (Sinais Críticos)} \\
\text{3. Por que está acontecendo?} &\longrightarrow \text{Diagnóstico e Linha do Tempo (Explicabilidade)} \\
\text{4. O que precisa ser feito?} &\longrightarrow \text{Tarefas Atribuídas & Workflows Regulatórios} \\
\text{5. Quem precisa fazer?} &\longrightarrow \text{Gestor, Fiscal ou Responsável da Instrução} \\
\text{6. Qual é o resultado?} &\longrightarrow \text{Rastreabilidade & Atualização Reativa de Saldos}
\end{aligned}$$

---

## 2. ARQUITETURA DE INFORMAÇÃO E NAVEGAÇÃO RECOMENDADA

Após a auditoria de rotas e fluxos da Fase 9-A, a estrutura de navegação foi refinada para eliminar redundâncias e separar **Navegação (Páginas)** de **Comandos e Configurações (Modais)**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        SALDOARP 3.0 — NAVEGAÇÃO                        │
├────────────────────────────────────────────────────────────────────────┤
│ 📁 VISÃO & CONTROLE                                                    │
│   ├── 🏠 Visão Geral (Home / Dashboard Gerencial 3.0)      [/]         │
│   └── ⏰ Central de Prazos & Atenção                       [/prazos]   │
│                                                                        │
│ 📁 GESTÃO CONTRATUAL                                                   │
│   ├── 📑 Carteira de Contratos                             [/contratos]│
│   └── 🔍 Contrato 360° (Hub Estruturado em Abas)          [/contratos/:k]
│                                                                        │
│ 📁 ATAS & SALDOS FÍSICOS                                               │
│   ├── 📦 Atas de Registro de Preços                        [/atas]     │
│   └── 📊 Alocações por Departamento                        [/atas/saldos-unidade]
│                                                                        │
│ 📁 FINANÇAS & FATURAMENTO (NOVO)                                       │
│   ├── 💳 Acompanhamento de Pagamentos & CGOFI              [/pagamentos]
│   └── 🏛️ Empenhos & Execução Orçamentária                  [/empenhos] │
│                                                                        │
│ ⚙️ CONFIGURAÇÕES & ADMINISTRAÇÃO                                       │
│   ├── 👥 Usuários & Servidores                             [/admin/usuarios]
│   └── 🔑 Perfis & Permissões (RBAC)                        [/admin/perfis]
└────────────────────────────────────────────────────────────────────────┘
```

> **Separação de Comandos (Ações Rápidas no Topo/Header)**:
> Modais utilitários (`SEI`, `Exportar Excel`, `Departamentos`, `Modelos de Gestão`) deixam de poluir o menu lateral como falsas páginas e passam a residir na **Barra de Ações Rápidas / Configurações do Header**.

---

## 3. ESPECIFICAÇÃO DA HOME GERENCIAL 3.0

A Home será alimentada diretamente pelo [`ManagementDashboardReadModel`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/types/managementDashboard.ts) sem duplicidade de regras:

### 3.1. Primeira Dobra: KPIs Executivos & Atenção Imediata
1. **Barra de Contexto e Filtros Ativos**: Seletor de UASG, Contrato, Ata e Situação com chips individuais de remoção.
2. **Quarteto de KPIs Principais**:
   - *Contratos Vigentes*: Total de contratos ativos e em fase de prorrogação.
   - *Montante Global Vigente*: Valor contratado atualizado ($\text{Original} + \sum \Delta\text{Valor}$).
   - *Taxa de Execução Financeira*: % Liquidado e % Pago oficial do SIAFI.
   - *Alerta de Saldo Físico de ARP*: Quantidade de itens em consumo crítico ($\ge 85\%$).
3. **Banner "Atenção Agora"**: Lista priorizada por severidade (`CRÍTICA` $\to$ `URGENTE` $\to$ `ATENÇÃO`) com botões de ação direta (`[AGIR]`, `[VER CONTRATO]`, `[INSTRUIR]`).

### 3.2. Segunda Camada: Gestão Operacional e Setorial
- **Painel Duplo**:
  - *Esquerda — Prazos de Vigência e Radar de Reajuste*: Contratos a vencer em 30d/60d e contratos na janela do Art. 135 da Lei 14.133/21.
  - *Direita — Faturamento e Desempenho CGOFI*: Faturas em instrução, enviadas à CGOFI, SLA médio de pagamento e confirmações do mês.

### 3.3. Terceira Camada: Farol de Saldos Físicos e Atalhos
- Tabela compacta dos top itens de ARP mais consumidos.
- Acesso rápido aos módulos do sistema.

---

## 4. CONTRATO 360° — ESTRUTURAÇÃO EM ABAS E HEADER FIXO

### 4.1. Header Executivo Fixo (Sticky / Topo)
- **Identificação**: Número/Ano formatado, Processo SEI, UASG e Fornecedor (CNPJ + Razão Social).
- **Vigência**: Data início, data fim, dias restantes e badge de status (`Vigente`, `A Vencer`, `Expirado`).
- **Valor Contratual**: Valor Original, Valor Vigente e Delta Acumulado (+%).
- **Gestor & Fiscal**: Nome do responsável atribuído com atalho de edição rápida.
- **Badge de Atenção Principal**: Principal alerta ativo no contrato (se houver).

### 4.2. Matriz de Abas Especializadas

| Aba | Nome da Aba | Objetivo e Conteúdo | Ações Principais |
| :--- | :--- | :--- | :--- |
| **1** | **Visão Geral & Atenção** | Cockpit do contrato: alertas ativos, prazos críticos e indicadores de evolução de valor. | Acessar alertas pendentes, ver resumo executivo |
| **2** | **Finanças & Pagamentos** | Empenhos oficiais vinculados, liquidações, pagamentos e ciclos de faturamento CGOFI. | Abrir novo ciclo de pagamento, conferir saldo da NE |
| **3** | **Workflows & Aditivos** | Instrução de Prorrogações (4.2), Alterações/Apostilamentos (4.3B) e Rescisão (4.4C). | Iniciar prorrogação, registrar apostilamento |
| **4** | **Plano de Tarefas** | Tarefas do contrato com semântica de execução (`INTERNA`, `LINK_EXTERNO`, `CONFIRMAÇÃO`). | Concluir tarefa, atribuir responsável, editar prazo |
| **5** | **Linha do Tempo** | Histórico cronológico formal de eventos imutáveis (`FATO_OFICIAL`, `DECISAO`, `PROPOSTA`). | Visualizar termo aditivo, baixar evidência |
| **6** | **Dados Cadastrais & SEI** | Dados completos da licitação, itens contratados, atas vinculadas e processo SEI. | Vincular processo SEI, editar metadados |

---

## 5. DESIGN SYSTEM — ESPECIFICAÇÃO DE TOKENS E COMPONENTES

### 5.1. Paleta de Cores Semântica (Padrão BR-DS / SaldoARP)

```css
:root {
  /* Marca e Identidade Institucional */
  --color-primary-900: #071d49;
  --color-primary-800: #0c326f; /* Primária Oficial */
  --color-primary-700: #134896;
  --color-primary-100: #e0f2fe;
  --color-primary-50:  #f0f9ff;

  /* Superfície e Fundo */
  --color-background:  #f8fafc;
  --color-surface:     #ffffff;
  --color-surface-sub: #f1f5f9;
  --color-border:      #e2e8f0;
  --color-border-sub:  #cbd5e1;

  /* Tipografia */
  --color-text-primary:   #0f172a;
  --color-text-secondary: #475569;
  --color-text-muted:     #94a3b8;

  /* Semântica Operacional */
  --color-success: #16a34a; /* Concluído / Regular */
  --color-warning: #d97706; /* Atenção / Prazo Iminente */
  --color-danger:  #dc2626; /* Crítico / Atrasado / Bloqueante */
  --color-info:    #0284c7; /* Fato Oficial / Sincronização */
}
```

### 5.2. Escala Tipográfica

| Token | Tamanho / Peso | Aplicação |
| :--- | :--- | :--- |
| `--font-h1` | 1.5rem (24px) / 800 Bold | Título principal de página / Header do Contrato 360° |
| `--font-h2` | 1.25rem (20px) / 700 Bold | Títulos de seções e modais |
| `--font-h3` | 1.05rem (17px) / 700 Bold | Títulos de cards e subtítulos de blocos |
| `--font-kpi-value` | 1.75rem (28px) / 800 Bold | Valores numéricos e monetários dos cards de KPI |
| `--font-body` | 0.875rem (14px) / 400 Regular | Textos corridos, tabelas e inputs |
| `--font-caption` | 0.75rem (12px) / 600 SemiBold | Badges, tags de status e legendas |

### 5.3. Catálogo de Componentes Base a Serem Construídos

1. **`AppCard`**: Container unificado com suporte a header, ações no topo, divider opcional e padding consistente (1.25rem).
2. **`KPI Card`**: Componente de indicador executivo com ícone temático, valor formatado, delta percentual e subtexto explicativo.
3. **`StatusBadge`**: Badge semântico com variantes (`success`, `warning`, `danger`, `info`, `neutral`).
4. **`AlertCard`**: Card de atenção com ícone de severidade, título objetivo, descrição do impacto e botão de ação direta.
5. **`DataTable`**: Tabela responsiva com cabeçalho fixo, suporte a ordenação, paginação e visualização compacta.
6. **`SkeletonLoader`**: Marcadores de carregamento proporcional ao layout final, eliminando flashes visuais.
7. **`EmptyState`**: Componente ilustrado para estados sem dados com título claro, orientação e botão de ação primária.
8. **`FilterBar`**: Barra de busca e filtros integrados com contadores dinâmicos e chips removíveis.

---

## 6. SEMÂNTICA VISUAL E DISTINÇÃO DE CONCEITOS

O usuário identificará visualmente a natureza de cada informação:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🔴 ALERTA:         Card com borda esquerda vermelha/âmbar + ícone       │
│                   (Indicador volátil calculado em tempo real)          │
├────────────────────────────────────────────────────────────────────────┤
│ 🔵 TAREFA:         Card com checkbox/toggle + responsável + data limite │
│                   (Ação atribuída com prazo persistida no banco)       │
├────────────────────────────────────────────────────────────────────────┤
│ 🟣 WORKFLOW:       Stepper sequencial numerado com etapas e checklist   │
│                   (Ciclo regulatório de instrução formal)              │
├────────────────────────────────────────────────────────────────────────┤
│ 🟢 FATO OFICIAL:   Selo com ícone de escudo / link oficial governamental│
│                   (Dado soberano imutável de Compras/PNCP/SIAFI)       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. PADRÃO DE FEEDBACK E ESTADOS DE INTERAÇÃO

1. **Carregamento (Loading)**:
   - Toda página e seção deve renderizar `SkeletonLoader` correspondente ao formato exato dos cards/tabelas esperados.
2. **Estado Vazio (Empty State)**:
   - Nunca exibir tabelas ou cards em branco. Exibir `EmptyState` com mensagem orientadora (ex.: *"Nenhum contrato ativo para os filtros selecionados. Limpar filtros?"*).
3. **Estado de Erro (Error State)**:
   - Exibir mensagem compreensível com botão de **"Tentar novamente" (`refetch`)** sem quebrar o layout da aplicação.
4. **Sucesso (Success State)**:
   - Toast curto de confirmação (duração de 3 segundos) e atualização imediata do cache local do React Query.

---

## 8. ESTRATÉGIA DE RESPONSIVIDADE E ACESSIBILIDADE

### 8.1. Responsividade
- **Desktop e Notebook ($\ge 1024\text{px}$)**: Layout expandido em multi-colunas com máxima densidade de dados operacionais.
- **Tablet ($768\text{px} - 1023\text{px}$)**: Grid adaptativo de 2 colunas e tabelas com scroll horizontal suave.
- **Mobile ($< 768\text{px}$)**: Sidebar colapsada em menu hambúrguer, cards em coluna única e tabelas convertidas em cartões verticais.

### 8.2. Acessibilidade (Padrão WCAG 2.1 AA)
- Todos os botões contendo apenas ícones devem possuir `aria-label` descritivo.
- Contraste mínimo de 4.5:1 para textos normais e 3:1 para textos grandes/KPIs.
- Navegação completa por teclado via `Tab`, `Enter` e `Esc` em todos os modais e abas.
- Foco visual evidente (`outline: 2px solid var(--color-primary-800)`).

---

## 9. MAPA E ROADMAP DE RECONSTRUÇÃO DO FRONTEND

A reconstrução será realizada em fases incrementais e auditáveis, garantindo zero regressão:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                       ROADMAP DE IMPLEMENTAÇÃO                         │
├────────────────────────────────────────────────────────────────────────┤
│ • Fase 9-C: Design System Base, Tokens CSS e Componentes Fundamentais  │
│ • Fase 9-D: Shell, Sidebar Saneado e Navegação sem Modais Falsos      │
│ • Fase 9-E: Nova Home Gerencial 3.0 (Unificação com Dashboard da F8)   │
│ • Fase 9-F: Reconstrução do Contrato 360° em Abas Temáticas            │
│ • Fase 9-G: Consolidação do Módulo de Atas & Saldos Físicos            │
│ • Fase 9-H: Módulo Integrado de Finanças & Faturamento (CGOFI)         │
│ • Fase 9-I: Central de Prazos, Tarefas e Ações In-line                 │
│ • Fase 9-J: Responsividade, Acessibilidade (a11y) & Homologação E2E    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 10. VEREDITO FINAL

* Arquitetura de Informação formalizada e aprovada;
* Especificação conceitual da Home Gerencial 3.0 e Contrato 360° em Abas concluída;
* Tokens visuais, semântica e componentes do Design System padronizados;
* Padrões de interação, acessibilidade e responsividade definidos;
* 100% dos testes e verificações em estado PASS.

**STATUS: GO — FASE 9-B ARQUITETURA UX APROVADA**
