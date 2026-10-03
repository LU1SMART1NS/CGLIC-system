# Auditoria Mobile — Fase 1: Diagnóstico de todas as telas

> Objetivo: medir o quanto cada tela do sistema funciona num celular de **375px** (e, de passagem, num tablet de 768px), achar as causas comuns e preparar as duas fases seguintes. A **Fase 2** cria uma base responsiva comum no shell e no design system. A **Fase 3** corrige as telas em lotes.
>
> Método: seis auditores fizeram a leitura estática do código, um por grupo de telas, e cada achado passou por um verificador independente. Nenhum achado foi refutado. Parte deles foi **ajustada**, ou seja, a severidade ou a descrição foi corrigida, e os verificadores acrescentaram 19 achados que tinham passado despercebidos. Esses aparecem marcados como *(adicionado na verificação)*.

---

## 1. Sumário executivo

### 1.1 Estado geral

**Hoje o sistema não pode ser usado em 375px.** A causa não está em cada tela. Ela vem do **shell**: a Sidebar ocupa 280px fixos e abre **expandida por padrão**, sem modo gaveta. No primeiro acesso, a coluna de conteúdo fica com cerca de 95px, e o padding do `main` ainda sai desse valor. A Sidebar recolhida (64px) cabe na tela, mas nesse modo quatro dos cinco grupos de navegação deixam de ser acessíveis.

Mesmo com a Sidebar recolhida, os paddings laterais se empilham (`main` 24px + página 32px + Hero/TabPanel/cartão) e sobram de **~140 a ~200px úteis**. Nesse espaço estouram larguras mínimas fixas de 190 a 280px e linhas flex sem quebra. Como o `body` tem `overflow-x: hidden`, o excesso é **cortado sem aviso** em vez de gerar rolagem. Assim, botões como "Próxima" (paginação), "Salvar" (Regras de Alertas), "Nova data" (Feriados) e "+" (incluir documento de pagamento) ficam fora de alcance.

Há pontos positivos. As telas de autenticação já têm layout correto (card com `maxWidth 440` / `width 100%`). Quase todas as tabelas ficam em wrappers com `overflowX: auto`. O `Modal` do design system tem uma casca responsiva. Vários componentes já usam `flexWrap` e `auto-fit/minmax`. Corrigida a base, boa parte das telas melhora sem precisar de mudança local.

### 1.2 Números

| Origem | Quantidade |
| :--- | ---: |
| Achados mantidos após verificação | 152 |
| Achados refutados | 0 |
| Achados adicionados na verificação | 19 |
| **Total consolidado** | **171** |

| Severidade | Quantidade | Leitura |
| :--- | ---: | :--- |
| **Crítico** | 20 | Bloqueia a tarefa ou torna conteúdo/ação inalcançável |
| **Alto** | 47 | A tarefa é possível, mas penosa (rolagem lateral longa, corte parcial, alvos minúsculos em ações principais) |
| **Médio** | 68 | Degrada a experiência (zoom do iOS, densidade, rolagem aninhada) |
| **Baixo** | 36 | Polimento (tipografia, acessibilidade de tooltip, código morto) |

> Observação: a Sidebar foi apontada por cinco grupos e o `overflow-x: hidden` do body por dois. No mapa por grupo esses achados aparecem repetidos de propósito, para mostrar onde cada um impacta, mas a correção é **uma só** e está na Fase 2.

### 1.3 As cinco causas-raiz

1. **O shell não tem modo mobile.** A Sidebar tem 280px fixos com `flexShrink: 0`, abre expandida e não reage à largura da janela. Recolhida, ela esconde as rotas filhas. O Header fixo não quebra linha e corta o botão "Sair". Isso afeta 100% das rotas protegidas.
2. **Não existe uma base responsiva e os estilos são inline.** Os tokens não definem breakpoints, não há `useMediaQuery`/`matchMedia` e o `index.css` tem só 3 media queries, quase todas em classes mortas. Como o layout é `style={{}}`, nenhum `@media` consegue alcançá-lo. Por fim, `body { overflow-x: hidden }` esconde o sintoma.
3. **Os gutters se empilham.** O `main` usa 1.5rem, cada rota acrescenta mais 2rem inline (ou 1.5rem no `Instrument360Page`) e Hero/TabPanel/cartões somam 1–1.5rem. No celular isso consome entre 30% e 45% da largura em margens.
4. **Há larguras mínimas fixas e flex sem quebra, muitas vezes dentro de `overflow: hidden`.** Exemplos: `minmax(190–280px)` sem `min()`, `minWidth 200–260px` em buscas, títulos e selects, e as ações do `PageHeader`, a `CarteiraPagination` e o `HeaderRefreshAction` sem `flexWrap`. Quando o container tem `overflow: hidden` (`carteiraTableShell`, cartão de ciclo, fila de ações), o conteúdo é cortado.
5. **Os padrões de interação foram pensados só para desktop.** As tabelas de 6 a 10 colunas não têm modo cartão. Os alvos de toque têm de 14 a 32px (AppButton `sm`/`iconOnly`, botões de ícone sem padding). Há fontes de 10,9 a 11,8px (token `caption` de 11px), inputs com menos de 16px (que fazem o iOS dar zoom no foco) e informação disponível só por `title` (hover).

### 1.4 Telas em pior estado

| Tela | Por quê |
| :--- | :--- |
| `(shell)` todas as rotas | Sidebar de 280px deixa ~47px úteis; recolhida, esconde Atas/Contratos/Execução/Administração |
| `/contratos/:contractKey?aba=pagamentos` | Formulário "incluir documento" com ~514px mínimos dentro de cartão com `overflow: hidden`: impossível incluir documento |
| `/atas/detalhe/:ataKey` (Hero, Ações, Plano) | Gutters em cascata (~167px úteis), grid de indicadores e `minWidth 220–260px` estouram, e os rótulos da linha da vida se sobrepõem |
| `/instrumentos`, `/atas`, `/contratos`, `/pagamentos`, `/empenhos` | Filtros e cards estouram, e a paginação corta "Próxima" |
| `/admin/departamentos` | Tabela sem wrapper rolável: a coluna Ações (editar/excluir) fica cortada |
| `/admin/feriados`, `/admin/regras-alertas` | Ações do `PageHeader` sem quebra: botões principais cortados |
| `/atas/modelos`, `/contratos/modelos` | Grids e inputs com mínimos fixos e alvos de ~18px |

---

## 2. Mapa de prontidão por tela (375px)

Legenda: **quebra** = conteúdo ou ação inalcançável, ou rolagem lateral da página; **ruim** = usável com muito esforço; **aceitável** = funciona com ressalvas; **boa** = sem problemas relevantes.

| Rota | Grupo | Prontidão em 375px | Nota |
| :--- | :--- | :--- | :--- |
| `(shell)` AppShell + Sidebar + Header + AppFooter | Shell / DS / Auth | **quebra** | Sidebar de 280px expandida por padrão deixa ~95px. Recolhida (64px) cabe, mas 4 dos 5 grupos ficam inacessíveis. Header sticky alto e sem quebra de linha |
| `/login` | Shell / DS / Auth | aceitável | Card correto. Alvos de 18–24px, inputs de 14,4px (zoom no iOS), label de recuperação sem `htmlFor` |
| `/definir-senha` | Shell / DS / Auth | aceitável | Layout ok. Inputs de ~36px com 13,6px, labels sem `htmlFor`, falta `autoComplete="new-password"` |
| `/redefinir-senha` | Shell / DS / Auth | aceitável | Igual a `/definir-senha` |
| Estados de carregamento (ProtectedLayout / AlertRulesGate) | Shell / DS / Auth | boa | Centralizado, só texto |
| `/instrumentos` | Instrumentos | **quebra** | ~199px úteis com a sidebar recolhida. Filtros com `minWidth 320px` e cards com `minmax(250px)` cortados. Tabela de 9 colunas |
| `/instrumentos` (vazio/erro/loading) | Instrumentos | aceitável | Componentes se adaptam. Resta o padding duplicado |
| Componentes de carteira (compartilhados) | Instrumentos | ruim | Paginação sem quebra e cortada. ManagerAssign fixo em 340px e fecha em qualquer scroll. Fontes < 12px |
| Skeleton de cards de Ata | Instrumentos | aceitável | `.skeleton-subtitle` de 240px cortado só visualmente |
| `/atas` | Atas | **quebra** | Busca de 260px, cards de 210px e ações do cabeçalho estouram. Tabela de 8 colunas. Paginação cortada |
| `/atas/saldos-unidade` | Atas | **quebra** | Ações do cabeçalho e FilterBar estouram. Resumo da unidade (`dl` sem wrap) e paginação cortados |
| `/atas/detalhe/:ataKey` (Hero e abas) | Atas | **quebra** | ~167px no Hero. Grid de indicadores estoura, linha da vida se sobrepõe, abas em várias linhas |
| `/atas/detalhe/:ataKey?aba=acoes` | Atas | **quebra** | Título com `minWidth 220px` num painel de ~173px. Botões de ícone de 32px |
| `/atas/detalhe/:ataKey?aba=plano` | Atas | **quebra** | Tarefa e selects com 240–260px. Botões de status de 24px |
| `/atas/detalhe/:ataKey?aba=itens` | Atas | ruim | 7 colunas com rolagem interna. Descrição só por `title` |
| `/atas/detalhe/:ataKey?aba=contratos` | Atas | ruim | Bloco de 260px em painel de ~173px. Botões continuam visíveis |
| `/atas/detalhe/:ataKey/itens/:numeroItem` (topo) | Item | aceitável | Hero se empilha bem. Gutters reduzem a área, botão Voltar com ~32px, abas em 2–3 linhas |
| `…/itens/:numeroItem?aba=unidades` | Item | ruim | DataTable de 5 colunas (180px fixos) com rolagem desde a primeira tela |
| `…/itens/:numeroItem?aba=alocacao` | Item | ruim | 6 colunas, ações de 32px fora da vista. Modal Alocar bom |
| `…/itens/:numeroItem?aba=contratos` | Item | ruim | Pior aba do item: 9 colunas com tabela de 6 colunas aninhada, input de 72px e select de ~24px |
| `…/itens/:numeroItem?aba=adesoes` | Item | ruim | 4 colunas, uma de 200px fixos |
| Modal LinkContractModal | Item | ruim | Selos sem wrap, cartões `div onClick`, rolagem dentro de rolagem, "Trocar contrato" com ~24px |
| Modal ExportExcelModal | Item | aceitável | Grid fixo `1fr 1fr`, botões de ~22px, `minmax(260px)` estoura em 320px |
| Modais ManualContrato / ManualEmpenho | Item | ruim (não renderizados) | Código morto. Grids fixos de 2 e 3 colunas se reativados |
| `/contratos` | Contratos | ruim | Tabela de 8 colunas com nowrap, "Ver Detalhes" fora da tela, paginação cortada. Com a sidebar, busca de 260px estoura |
| `/contratos/:contractKey` (cabeçalho + Ações) | Contratos | ruim | Hero ocupa ~1,5 tela, linha da vida se sobrepõe, título da fila cortado, ações só por `title` |
| `/contratos/:contractKey?aba=plano` | Contratos | **quebra** | `minWidth 240/260px` e `minmax(200px)` sem overflow geram rolagem lateral da página |
| `/contratos/:contractKey?aba=pagamentos` | Contratos | **quebra** | Formulário de documento cortado (ação inalcançável), stepper de 480px, modal com grid de 514px |
| `/contratos/:contractKey?aba=financeiro` | Contratos | ruim | 10 colunas. O aviso manda "usar a seta da linha", que está na última coluna |
| `/contratos/:contractKey?aba=historico` | Contratos | aceitável | Tudo quebra linha. Polimento de fonte e recuo |
| `/pagamentos` | Financeiro / Admin | **quebra** | HeaderRefreshAction e busca estouram. Paginação cortada |
| `/empenhos` | Financeiro / Admin | **quebra** | Botão "Sincronizar Todos" (~220px) cortado. 9 colunas, 7 KPIs empilhados |
| `/admin/departamentos` | Financeiro / Admin | **quebra** | Tabela sem `overflowX`: coluna Ações cortada. Select de mesclagem empurra o botão |
| `/admin/usuarios` | Financeiro / Admin | ruim | Ações em `inline-flex` sem wrap, e-mail sem quebra, inputs de 13,6px |
| `/admin/perfis` | Financeiro / Admin | ruim | Grid `minmax(260px)` cortado. Drawer ok |
| `/admin/regras-alertas` | Financeiro / Admin | ruim | Botão "Salvar" cortado no cabeçalho. Colunas fixas |
| `/admin/feriados` | Financeiro / Admin | **quebra** | Três botões do cabeçalho (~380px) cortados. Ações de ~22px |
| `/atas/modelos` | Financeiro / Admin | **quebra** | `minmax(280px)` e `minWidth 240/260px` estouram. Alvos de ~18px |
| `/contratos/modelos` | Financeiro / Admin | **quebra** | Mesmo componente de `/atas/modelos` |

Resumo do mapa: **15 telas quebram**, **15 estão ruins**, **10 estão aceitáveis** e **1 está boa** (41 telas e estados avaliados).

---

## 3. Causas-raiz transversais e proposta de BASE COMUM (Fase 2)

A Fase 2 não corrige telas. Ela cria as peças que as telas vão consumir na Fase 3. A ordem abaixo é a de execução, e cada item diz quais achados resolve, total ou parcialmente.

### P0 — Pré-requisitos (sem eles nenhuma tela fica utilizável)

**F2-01. Breakpoints e tokens de mobile em `tokens.ts`** (resolve tokens-01 e é a base de todo o resto)

```ts
export const breakpoints = { sm: 480, md: 768, lg: 1024, xl: 1280 } as const;
export const touchTarget = { min: '44px' } as const;
export const inputFontSizeMobile = '16px';
export const pageGutter = { mobile: '1rem', tablet: '1.5rem', desktop: '2rem' } as const;
```

- Espelhar no CSS como variáveis em `:root` (`--bp-md` serve só como documentação, porque `@media` não aceita `var()`) e como gutters: `--page-gutter: 1rem` em ≤480, `1.5rem` em ≤1024, `2rem` acima.
- Subir `typography.fontSize.caption` de 11px para **12px** (tokens-02).

**F2-02. Hook `useMediaQuery` / `useBreakpoint`** em `src/design-system/hooks/`

- `useMediaQuery(query)` com `matchMedia` e `addEventListener('change')`, seguro para SSR e testes (retorna `false` quando `matchMedia` não existe).
- `useBreakpoint()` retorna `'sm' | 'md' | 'lg' | 'xl'` a partir de `breakpoints`.
- Usar **só para decisões estruturais** (drawer × sidebar, cartões × tabela, orientação do stepper). Ajustes de espaçamento, fonte e quebra ficam em CSS.
- Remover o `window.innerWidth` pontual de `ManagerAssign.tsx:117` na migração.

**Regra CSS-first:** tudo que for estilo (padding, fonte, `flex-wrap`, `grid-template-columns`, altura mínima) vai para classe CSS com `@media`. O hook entra só quando a árvore de componentes muda.

**F2-03. Shell responsivo** (resolve shell-01, shell-02, shell-03, shell-04, shell-05 e todos os achados repetidos de Sidebar/AppShell, além de header-01, header-02 e header-03)

- **< 768px:** Sidebar vira drawer off-canvas (`position: fixed`, `transform: translateX`, overlay, foco preso, Esc fecha, fecha ao navegar, `height: 100dvh`), aberta por um botão de menu de 44px no Header. A largura do fluxo é zero, e a preferência salva no `localStorage` é ignorada.
- **768–1024px:** começa recolhida. Grupos com filhos abrem em flyout/popover ancorado no ícone (corrige shell-02 também no desktop recolhido).
- **≥ 1024px:** comportamento atual, com a preferência persistida.
- Header: em < 768px esconder os links da topbar (criar a regra que falta para `.gov-topbar-links`), padding de 1rem, ocultar o subtítulo e trocar e-mail + "Sair" por um menu de usuário. Avaliar manter sticky só a barra principal.
- AppFooter passa para classe `.app-footer` com padding `1.5rem 1rem` e alinhamento à esquerda em < 768px (app-01).

**F2-04. Gutter único e fim do padding duplicado** (resolve css-01, instrumentos-02, atas-01, atas-12, item-03, contratos-17 e pagadm-01)

- Trocar o seletor de tag `main {}` por `.app-main` com `padding-inline: var(--page-gutter)`. Fazer o mesmo com `footer {}` → `.app-footer`, para que o `<footer>` do Modal deixe de herdar regras.
- Criar `PageContainer` no design system (`maxWidth`, `margin: 0 auto`, **sem padding lateral próprio**) e substituir os ~12 containers inline com `padding: '1.5rem 2rem 3rem'` (PaymentsRoute, FinancialExecutionRoute, ContractsRoute, ArpSearch, InternalAllocationsDashboard, GestaoInstrumentosDashboard, telas admin, TaskTemplatesPage, Instrument360Page).
- Reduzir o padding de `Instrument360Hero`, `Instrument360TabPanel` e dos cartões para 0.75–1rem em ≤480px, via classe.
- Meta: em 375px, **343px úteis** na página e **~311px** dentro de Hero e abas.

**F2-05. Tirar a dependência do `overflow-x: hidden` do body** (css-02 e o achado adicionado em `index.css:67`)

- Durante a Fase 3, desligar a regra num build de diagnóstico para enxergar os estouros.
- Ao final, manter só `overflow-x: clip` na coluna de conteúdo do AppShell como rede de segurança, e garantir que todo bloco largo tenha o próprio `overflow-x: auto`.

### P1 — Primitivas de layout (resolvem a maior parte dos estouros locais)

**F2-06. Camada de utilitários CSS** (css-03)

- `.stack` (coluna com gap), `.cluster` (flex com `flex-wrap: wrap` e gap), `.grid-auto` com `--min` (`grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--min)), 1fr))`), `.hide-below-md`, `.show-below-md`, `.table-scroll` (overflow-x com sombra de borda).
- Helper TS `responsiveGrid(minPx)`, que devolve a string `repeat(auto-fit, minmax(min(100%, Npx), 1fr))`, para os casos que continuarem inline.
- **Regra de lint/revisão:** proibir `minmax(Npx` sem `min(` e `minWidth: 'Npx'` acima de 160px em código novo.
- Apagar o CSS morto: `kpi-grid`, `grid-2-cols`, `grid-3-cols`, `item-metadata`, `balances-header-grid`, `modal-backdrop`, `modal-content`, `glass-card`, `search-grid`.
- Envolver os hovers com `transform` em `@media (hover: hover)`.

**F2-07. Ajustes de quebra de linha nos componentes do DS e compartilhados**

- `PageHeader`: `flexWrap` nas actions e na linha do título, `minWidth: 0` no bloco do título, actions com 100% de largura em ≤480px e h1 de 1.25rem (ds-pageheader-01, atas-04, pagadm-02).
- `HeaderRefreshAction`: `flexWrap`, e em ≤480px esconder o texto "Atualizado às" e mostrá-lo via `aria-live`/tooltip (ds-headerrefresh-01, instrumentos-10).
- `CarteiraPagination`: `flexWrap`, modo compacto "Anterior · p/N · Próxima" em ≤480px e botões de 44px. Substituir também a paginação duplicada de `GestaoInstrumentosTable` (carteira-04, atas-06, contratos-05, pagadm-03, instrumentos-06).
- `FilterBar`: busca com `minWidth: 0`, rótulo acima do select e select com 100% em ≤480px, controles de 44px e fonte de 16px. Opcional: botão "Filtros" que abre um painel (ds-filterbar-01, atas-11, pagadm-07).
- `carteiraSelect`: `width: 100%; maxWidth: 190px; flex: 1 1 160px` (carteira-05).
- `HealthTileGrid` e `CarteiraSummaryCards`: `minmax(min(100%, 140px), 1fr)`, com 2 colunas compactas no celular (atas-03, atas-13, item-22, carteira-08, contratos-24, pagadm-23).
- `StatusBadge`/`SeverityBadge`: `maxWidth: 100%` com ellipsis e `title` (achado adicionado).

### P2 — Tabela responsiva

**F2-08. `DataTable` com modo mobile** (resolve ds-datatable-01 e item-09, e é a base de cerca de 20 achados de tabela)

API proposta:

```ts
interface Column<T> {
  key: string; header: string; width?: string;
  minWidth?: string; nowrap?: boolean;
  priority?: 'primary' | 'secondary' | 'tertiary'; // no cartão: título, corpo, oculto
  hideBelow?: 'sm' | 'md';
  mobileLabel?: string;
}
interface DataTableProps<T> {
  mobileLayout?: 'cards' | 'scroll'; // padrão: 'cards' abaixo de md
  stickyFirstColumn?: boolean;
  minTableWidth?: string;
  renderMobileCard?: (row: T) => ReactNode; // escape para casos ricos
  rowActions?: (row: T) => ReactNode;       // rodapé do cartão, alvos de 44px
}
```

- Abaixo de `md`, o modo `cards` renderiza um `<ul>` de cartões. A coluna `primary` vira título, as `secondary` viram um `dl` rótulo/valor e as ações ficam no rodapé com largura total.
- O modo `scroll` mantém a tabela, com sombra de rolagem nas bordas, primeira coluna sticky e padding de `0.5rem 0.75rem` (vindo de classe, não inline).
- Migrar as tabelas manuais da carteira (`ContractsPortfolioTable`, `ArpPortfolioList`, `GestaoInstrumentosTable`, `ManagementPaymentsOverview`, `ManagementFinancialExecution`, `AllocationsPortfolioContent`, telas admin, tabela "Vinculados" de `ItemBalances`) para o `DataTable`, ou ao menos para o mesmo padrão de cartão.
- Linhas expandidas (empenhos do contrato, itens da ata) passam a abrir **fora** da tabela no mobile: seção abaixo do cartão ou bottom sheet (item-02, contratos-20).

### P3 — Sobreposições

**F2-09. `Modal` responsivo** (ds-modal-01, item-17, pagadm-24 e os achados adicionados em `Modal.tsx:75` e `:126`)

- `maxHeight: min(90vh, 90dvh)`, `flexWrap` no footer e botões empilhados com largura total em ≤480px, botão de fechar de 44×44 e `minWidth: 0` no título.
- Em ≤480px, abrir como tela cheia ou bottom sheet, com overlay sem padding e padding interno de 12–16px.
- Orientação de uso: as ações ficam na prop `footer` (fixa), não no fim do corpo (item-12).

**F2-10. `Popover`/`Sheet` do DS** para substituir o painel do `ManagerAssign` (carteira-01, carteira-02, contratos-13, atas-25)

- No celular (`pointer: coarse` ou < md), bottom sheet que não fecha em resize/scroll.
- No desktop, popover com detecção de colisão, `width: min(340px, calc(100vw - 16px))` e `maxHeight` com rolagem. Fecha só no scroll de ancestrais da âncora, ignorando o scroll interno do painel.

**F2-11. `Toast`**: botão de fechar de 44px; em ≤480px, `left`/`right` de 16px e respeito a `env(safe-area-inset-bottom)` (ds-toast-01).

### P4 — Toque, formulários e tipografia

**F2-12. Alvos de toque**

- `AppButton`: em `@media (pointer: coarse)`, área mínima de 44×44 via pseudo-elemento, mantendo o visual compacto. Trocar o hover por estado React (`onMouseEnter`) por CSS em `@media (hover: hover)` (ds-appbutton-01). **Isso exige que o AppButton passe a ter classe CSS. É a primeira migração de estilo inline.**
- Novo `IconButton` com área de 44px, `aria-label` obrigatório e `aria-pressed`/`aria-expanded` opcionais. Ele substitui os ~30 botões `background: none; padding: 2px` (TaskTemplatesPage, admin, Sidebar, LinkContractModal, ItemBalances).
- Em telas de toque, rótulo de texto visível nas ações hoje só com ícone (contratos-21, item-19).

**F2-13. Campos de formulário**

- `AppInput`, `AppSelect` e `AppTextarea` com `font-size: 16px` e `min-height: 44px` abaixo de md, `id` automático (`useId`) e `label` associado.
- Regra global de transição: `@media (max-width: 768px) { .form-input, input, select, textarea { font-size: 16px } }` (item-18, contratos-22, pagadm-20).
- `AuthLayout`/`AuthInput` compartilhado pelas 3 telas de autenticação (definir-01, redefinir-01).

**F2-14. Tipografia:** piso de 12px para texto informativo (token `label`/`caption`). Os valores soltos de 0.68 a 0.74rem são trocados por tokens (atas-22, item-20, pagadm-22, instrumentos-09).

**F2-15. Tooltip acessível** acionável por toque e foco, para substituir `title` como única fonte de informação (atas-23, item-23, contratos-23).

### P5 — Navegação interna

**F2-16. Abas roláveis:** variante `scrollable` em `Tabs` e em `Instrument360Tabs` (`flex-wrap: nowrap`, `overflow-x: auto`, scroll-snap, gradiente nas bordas, `scrollIntoView` da aba ativa, altura de 44px). Aplicar também a `GestaoInstrumentosCategoryTabs` (atas-19, item-21, contratos-12, ds-tabs-01, instrumentos-07).

**F2-17. `WorkflowStepper` com `orientation="auto"`**, que fica vertical abaixo de md (ds-stepper-01, contratos-16).

**F2-18. Linha da vida (`HealthStripParts`)**: em ≤480px, lista vertical de marcos (nome, data, "em N dias") abaixo da barra. A colisão passa a ser calculada em px com `ResizeObserver` (atas-14, contratos-10).

### Estratégia para os estilos inline

O app é quase todo `style={{}}`, e não vale reescrever tudo. A proposta:

1. **Não migrar por migrar.** Só vai para classe o estilo que precisa variar por breakpoint ou por `pointer`/`hover`. Cores e espaçamentos fixos continuam inline usando tokens.
2. **Mecanismo:** classes globais com prefixo (`.ds-*`, `.app-*`) num arquivo `src/design-system/responsive.css` importado uma vez, ou CSS Modules por componente do DS. Sem dependência nova. Os valores vêm das variáveis CSS geradas a partir de `tokens.ts`.
3. **Ordem:** (a) componentes do DS (AppButton, Modal, DataTable, FilterBar, PageHeader, Tabs, Toast); (b) compartilhados (`carteira/*`, `instrument360/*`, `plan/TaskPlanSection`); (c) telas. Cada componente migrado corrige todas as telas que o usam.
4. **Padrão para o que ficar inline:** `minmax(min(100%, Npx), 1fr)` em grids, `minWidth: 0` em itens flex com texto e `flexWrap: 'wrap'` em toda linha com mais de um controle.
5. **Critério de pronto da Fase 2:** com o `overflow-x: hidden` do body desligado, nenhuma rota tem `document.documentElement.scrollWidth > 375`. Isso pode ser verificado com um teste Playwright simples em 375×812, a ser criado na Fase 2.

---

## 4. Achados por grupo

Colunas: **Sev.** (C = crítico, A = alto, M = médio, B = baixo), **Base?** = depende da base da Fase 2 (sim/não). Os IDs com sufixo `-v` foram atribuídos neste relatório aos achados *(adicionado na verificação)*. Os achados com o veredito "ajustado" já trazem a severidade e a descrição corrigidas pelo verificador.

### 4.1 Shell, navegação, design system e autenticação

| ID | Sev. | Rota | Local | Problema e evidência | Impacto em 375px | Correção sugerida | Base? |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| shell-01 | C | (shell) | [Sidebar.tsx:195](src/components/layout/Sidebar.tsx#L195) | Sidebar com 280px fixos (64 recolhida), `flexShrink: 0`, sticky, `100vh`. Sem drawer nem hambúrguer. `readStoredCollapsed` retorna `false` (expandida) por padrão (AppShell.tsx:18-24) | Coluna de conteúdo com ~95px, ~47px úteis após o padding do main. Tela inutilizável até achar o botão de 28px | Drawer off-canvas < 1024px aberto por botão de 44px no Header, fechando ao navegar. Recolhida entre 768 e 1024 | sim |
| shell-02 | C | (shell) | [Sidebar.tsx:156](src/components/layout/Sidebar.tsx#L156) | Recolhida, os filhos só aparecem com `!collapsed`. Atas, Contratos, Execução Financeira e Administração não têm `route` (navigation.ts:79/115/142/168), então o clique não faz nada | No único modo que cabe, só "Visão Geral" é navegável | Flyout ancorado ao ícone ou expansão temporária. No mobile, o drawer resolve | sim |
| shell-v1 *(adicionado na verificação)* | A | (shell) | [AppShell.tsx:30](src/components/layout/AppShell.tsx#L30) | `collapsed` vem só do localStorage e do clique. Não reage a largura, resize ou rotação e não fecha ao navegar | Nenhum estado funciona em 375px: expandida espreme o conteúdo, recolhida esconde as rotas | Derivar o modo de `useMediaQuery`. Persistir a preferência só no desktop | sim |
| header-01 | A | (shell) | [Header.tsx:14](src/components/Header.tsx#L14) | Topbar `space-between` sem `flexWrap`, padding de 2rem e 3 links. `.gov-topbar-links` não tem CSS. Barra principal com padding 2rem. Wrapper sticky (AppShell.tsx:59-62) | Min-content de ~300px contra ~247px disponíveis: links cortados pelo `overflow-x` do body. Bloco fixo de ~150px de altura | < 768px: esconder links, padding de 1rem, ocultar subtítulo, menu de usuário. Avaliar sticky só na barra principal | sim |
| header-02 | A | (shell) | [Header.tsx:95](src/components/Header.tsx#L95) | "Sair" com padding `0.25rem 0.5rem` e 0.72rem. E-mail em `span` sem quebra num flex sem wrap (85-94) | Bloco de ~270px contra ~247px: o botão Sair fica parcialmente cortado. Alvo de ~24px | AppButton com 44px. E-mail com ellipsis ou dentro de menu de usuário | não |
| tokens-01 | A | (base) DS | [tokens.ts:193](src/design-system/tokens.ts#L193) | Sem `breakpoints`, alvo de toque mínimo ou fonte mínima de input, embora o cabeçalho prometa "responsividade" (linha 5). Nenhum `matchMedia`/`useMediaQuery` em `src` | Causa raiz: nenhuma tela se adapta | Ver F2-01 e F2-02 | sim |
| ds-datatable-01 | A | (base) DS, 9 telas | [DataTable.tsx:44](src/design-system/components/DataTable.tsx#L44) | Só `overflowX: auto`. Sem cards, prioridade, coluna sticky, `minWidth` ou `nowrap`. `width: 100%` espreme as colunas antes de rolar. Padding `0.75rem 1rem` inline (72, 115). `Column` só tem `width` | Colunas estreitíssimas ou rolagem sem indicação e sem coluna de referência | Ver F2-08 | sim |
| shell-04 | M | (shell) | [Sidebar.tsx:240](src/components/layout/Sidebar.tsx#L240) | Botão de recolher com 28×28 (240-241). Subitens com padding 0.48rem (~36px, 90). Badge com 0.68rem (137) | O controle que destrava o layout é difícil de acertar. Subitens < 44px | Toggle/menu de 44×44. Itens com `minHeight 44px`. Badge ≥ 0.75rem | sim |
| css-01 | M | (shell) | [index.css:108](src/index.css#L108) | `main { padding: 2rem 3rem; max-width: 1800px }`, que só cai para 1.5rem em ≤768 (706-709). Seletor de tag | 48px de calha (~13%) | `.app-main` com `padding-inline: clamp(1rem, 4vw, 3rem)` | sim |
| css-02 | M | (shell) | [index.css:67](src/index.css#L67) | `body { overflow-x: hidden }` esconde o estouro em vez de evitá-lo | Conteúdo largo cortado e inalcançável. Dificulta o diagnóstico | Ver F2-05 | não |
| css-03 | M | (base) CSS | [index.css:705](src/index.css#L705) | Só 3 media queries (706, 1105, 1134). Classes responsivas sem uso (`kpi-grid`, `grid-2-cols`, `modal-backdrop`, …). Hovers com `transform` (159, 744) | Quase nenhuma regra responde ao celular | Remover CSS morto e criar utilitários (F2-06) | sim |
| tokens-02 | M | (base) DS | [tokens.ts:224](src/design-system/tokens.ts#L224) | `caption: '0.6875rem'` (11px) em badges, Timeline, AlertCard, TaskCard, WorkflowStepper e contadores | Informação de triagem em 11px | Subir para 0.75rem | sim |
| ds-modal-01 | M | (base) DS | [Modal.tsx:94](src/design-system/components/Modal.tsx#L94) | `maxHeight: 90vh` sem dvh. Footer sem `flexWrap` (136). Fechar com padding 4px e X de 18 (~26px). Título sem `minWidth: 0` (113) | Com o teclado no iOS, o rodapé some. Footer estoura com 3 ou mais botões | Ver F2-09 | sim |
| ds-filterbar-01 | M | (base) DS | [FilterBar.tsx:90](src/design-system/components/FilterBar.tsx#L90) | Input e select com padding 4/8px e 13px (~28px). Chips de ~22px (177). Rótulo `nowrap` (108). "Filtrar por:" em 11px (164) | Alvos de 22–28px, zoom no iOS, selects com largura irregular | 44px, 16px, grupo label+select com 100%. Painel "Filtros" | sim |
| ds-appbutton-01 | M | (base) DS | [AppButton.tsx:70](src/design-system/components/AppButton.tsx#L70) | `sm` com ~26px, `md` com ~34px, `iconOnly` com 32/36px. Hover por `onMouseEnter`/`onMouseLeave` (122-123) | Botões difíceis de acertar e com hover "grudado" após o toque | Ver F2-12 | sim |
| ds-pageheader-01 | M | (base) DS | [PageHeader.tsx:65](src/design-system/components/PageHeader.tsx#L65) | Actions sem `flexWrap`. Linha do título sem wrap (37) e sem `minWidth: 0` | Com 2 ou mais ações, a linha passa de 343px e é cortada | `flexWrap` em actions e título. ≤480: actions com 100%, h1 de 1.25rem | não |
| ds-toast-01 | M | (base) DS | [Toast.tsx:90](src/design-system/components/Toast.tsx#L90) | Fechar com padding 0 e X de 14. Container `right/bottom` de 16px, `maxWidth 380`, sem `left` (53-60) | Alvo de ~14px. Toast encosta na borda esquerda e cobre o rodapé | Ver F2-11 | não |
| ds-taskcard-01 | M | (base) DS | [TaskCard.tsx:166](src/design-system/components/TaskCard.tsx#L166) | "Tratar" com padding `2px 8px` e 12px (~22px). Grupo contexto+status sem wrap (78) | Ação principal minúscula. Nome longo estoura | AppButton de 44px e `flexWrap` | não |
| login-01 | M | /login | [LoginRoute.tsx:242](src/routes/LoginRoute.tsx#L242) | "Esqueci minha senha" com padding 0 e 0.75rem (~18px). Olho de ~24px (286, 292). Cancelar/Enviar de ~32px (396, 412). "Voltar" com 0.45rem (353) | Ações secundárias difíceis de tocar | 44px de alvo. Olho de 40–44px ajustando o `padding-right` do input | não |
| login-02 | M | /login | [LoginRoute.tsx:221](src/routes/LoginRoute.tsx#L221) | Inputs com 0.9rem (221, 271) e 0.85rem (385). Label de recuperação sem `htmlFor` (369) | Zoom no iOS. Campo não associado | 16px. `id` + `htmlFor` | sim |
| definir-01 | M | /definir-senha | [DefinirSenhaRoute.tsx:173](src/routes/DefinirSenhaRoute.tsx#L173) | Inputs com 0.85rem e padding 0.55rem (~36px). Labels sem `htmlFor` (158, 180). Sem `autoComplete`. Topbar com 2rem/0.72rem (71-72). Form com padding lateral de 2rem (129) | Zoom, alvos pequenos, sem sugestão de senha forte | 16px, 44px, `id`/`htmlFor`, `autoComplete="new-password"`, AuthLayout/AuthInput | sim |
| redefinir-01 | M | /redefinir-senha | [RedefinirSenhaRoute.tsx:189](src/routes/RedefinirSenhaRoute.tsx#L189) | Igual: 0.85rem (189, 211), labels sem `htmlFor` (174, 196), botão com 0.55rem (155), topbar (68-69), form com 2rem (126) | Zoom, alvos pequenos, rótulos não associados | Mesma correção de definir-01 | sim |
| ds-badge-v1 *(adicionado na verificação)* | M | (base) DS | [StatusBadge.tsx:68](src/design-system/components/StatusBadge.tsx#L68) | StatusBadge e SeverityBadge (SeverityBadge.tsx:48) com `nowrap` sem `maxWidth`/ellipsis | Rótulos longos forçam a largura da coluna ou da linha | `maxWidth: 100%` com ellipsis e `title`, ou quebra em ≤480 | sim |
| export-v1 *(adicionado na verificação)* | M | (shell) modal global | [ExportExcelModal.tsx:369](src/components/modals/ExportExcelModal.tsx#L369) | Grid `1fr 1fr` fixo e fonte de 0.82rem (380, 398) no modal aberto pela Sidebar | Campos de ~147px e zoom no iOS | `repeat(auto-fit, minmax(min(100%, 200px), 1fr))` e 16px | não |
| header-03 | B | (shell) | [Header.tsx:18](src/components/Header.tsx#L18) | Topbar e Sair em 0.72rem (18, 108) | Texto de ~11,5px | Mínimo de 0.75rem | não |
| shell-03 | B | (shell) | [Sidebar.tsx:84](src/components/layout/Sidebar.tsx#L84) | Recolhida, o rótulo só existe no `title` (84) e o texto some (130). O `title` serve de nome acessível | Sem hover no toque: o usuário vê só ícones | `aria-label` explícito. Drawer com rótulos. Flyout no tablet | não |
| shell-05 | B | (shell) | [Sidebar.tsx:204](src/components/layout/Sidebar.tsx#L204) | `height: 100vh` com sticky | Últimos itens atrás da barra do Safari | `100dvh` com fallback | não |
| ds-alertcard-01 | B | (base) DS | [AlertCard.tsx:152](src/design-system/components/AlertCard.tsx#L152) | Conteúdo com `minWidth 240px`. Ação `nowrap` com ~28px (196, 205) | Estoura ~13px em contextos estreitos | `minWidth: min(100%, 240px)`. Ação de 44px com 100% em ≤480 | não |
| ds-stepper-01 | B | (base) DS | [WorkflowStepper.tsx:97](src/design-system/components/WorkflowStepper.tsx#L97) | Passo horizontal com `minWidth 120px` e `overflowX: auto` (41). Sem troca para vertical. Caption de 11px | Com 4 ou mais passos, o final fica oculto sem pista | `orientation="auto"` (F2-17) | sim |
| ds-tabs-01 | B | (base) DS | [Tabs.tsx:70](src/design-system/components/Tabs.tsx#L70) | `overflowX` + `nowrap` sem indicação de mais abas. Aba ativa não rola para a vista. ~36px | Abas ocultas sem pista | Gradiente, `scrollIntoView`, 44px | não |
| ds-headerrefresh-01 | B | (base) DS | [HeaderRefreshAction.tsx:52](src/design-system/components/HeaderRefreshAction.tsx#L52) | Container sem wrap (52-56). Status `nowrap` (83). ~200px fixos | Empurra as ações para fora | `flexWrap`. Esconder o texto em ≤480 | não |
| app-01 | B | (shell) | [App.tsx:79](src/App.tsx#L79) | AppFooter com padding `2.5rem 3rem`. Segundo bloco `textAlign: right` mesmo quebrado (97) | 96px de calha, leitura irregular | `.app-footer` com `1.5rem 1rem` e texto à esquerda em < 768 | sim |
| login-03 | B | /login | [LoginRoute.tsx:133](src/routes/LoginRoute.tsx#L133) | Topbar com 2rem e 0.72rem. Rodapé com 0.72rem em `rgba(255,255,255,0.65)` (437-438). `minHeight: 100vh` (101) | Contraste e tamanho baixos. Rodapé atrás da barra do iOS | 0.75rem, mais opacidade, 1rem, `100dvh` | não |
| css-v1 *(adicionado na verificação)* | B | (base) CSS | [index.css:108](src/index.css#L108) | Seletores de tag `main` (108) e `footer` (118) atingem o `<footer>` do Modal (Modal.tsx:134) | Impede usar elementos semânticos sem herdar regras | `.app-main` e `.app-footer` | sim |

### 4.2 Gestão de Instrumentos (home) e componentes de carteira

| ID | Sev. | Rota | Local | Problema e evidência | Impacto em 375px | Correção sugerida | Base? |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| instrumentos-01 | C | /instrumentos | [GestaoInstrumentosDashboard.tsx:305](src/components/instrumentos/GestaoInstrumentosDashboard.tsx#L305) | Wrapper dos filtros com `flex: '1 1 360px', minWidth: '320px'` | Em ~199px, passa ~120px da borda: select de prioridade e "Limpar" cortados | Remover o `minWidth` (ou usar 0). `flex-basis: 100%` em ≤480 | não |
| instr-v1 *(adicionado na verificação)* | C | /instrumentos e todo o AppShell | [Sidebar.tsx:195](src/components/layout/Sidebar.tsx#L195) | Mesmo problema de shell-01. As contas do grupo supõem a sidebar recolhida | No primeiro acesso, a área útil fica negativa (~-17px) | Ver F2-03 | sim |
| instrumentos-02 | A | /instrumentos | [GestaoInstrumentosDashboard.tsx:272](src/components/instrumentos/GestaoInstrumentosDashboard.tsx#L272) | Padding inline de `1.5rem 2rem 3rem` sobre o main. Erro com `padding: 2rem` (258) | 56px por lado, ~199px de conteúdo | `PageContainer` sem padding lateral (F2-04) | sim |
| instrumentos-03 | A | /instrumentos | [GestaoInstrumentosSummaryCards.tsx:79](src/components/instrumentos/GestaoInstrumentosSummaryCards.tsx#L79) | `repeat(auto-fit, minmax(250px, 1fr))` sem `min()` | ~51px de cada card cortados. Números à direita somem | `minmax(min(250px, 100%), 1fr)` | não |
| instrumentos-04 | A | /instrumentos | [GestaoInstrumentosTable.tsx:131](src/components/instrumentos/GestaoInstrumentosTable.tsx#L131) | 9 colunas, `th` `nowrap`, pill e ação `nowrap` (196, 222). Só `overflowX` (130) | Botão "Ação" a mais de 1000px de rolagem | Cartões < 768 (DataTable `cards`) ou ação sticky à direita | sim |
| instrumentos-05 | A | /instrumentos | [GestaoInstrumentosCompactFilters.tsx:39](src/components/instrumentos/GestaoInstrumentosCompactFilters.tsx#L39) | Busca com `minWidth 240px`, select com 160px (65), fonte de 0.8rem, ~31px de altura | Não cabe. Zoom no iOS. Alvos < 44 | `minWidth: 0; flex: 1 1 240px`, select com 100% em ≤480, 16px, 44px | sim |
| carteira-01 | A | Carteiras (ManagerCell) | [ManagerAssign.tsx:87](src/components/carteira/ManagerAssign.tsx#L87) | `scroll` em captura e `resize` chamam `onClose`. `autoFocus` (159, 185) com 0.82rem. O verificador ajustou o motivo: qualquer scroll de qualquer elemento fecha o painel (wrapper da tabela, rolagem do iOS até o campo, zoom) | Atribuir gestor no celular fica muito difícil | Bottom sheet no mobile (F2-10). Fechar só em scroll fora do painel. 16px | sim |
| carteira-04 | A | Carteiras (paginação) | [CarteiraPagination.tsx:51](src/components/carteira/CarteiraPagination.tsx#L51) | `space-between` sem wrap, 7 botões de 28px dentro de `carteiraTableShell` com `overflow: hidden` (carteiraStyles.ts:42). Severidade elevada na verificação | "Próxima" e últimas páginas cortadas, mesmo com 2 páginas | `flexWrap`, modo compacto, 44px (F2-07) | sim |
| carteira-02 | M | Carteiras (ManagerCell) | [ManagerAssign.tsx:117](src/components/carteira/ManagerAssign.tsx#L117) | Fixo em 340px, posição por `innerWidth`/`innerHeight`, sem `maxHeight`/`overflowY`, `openUp` com 320 fixo. Verificação: só passa da borda em viewport < 356px | Com avisos ou em paisagem, o rodapé "Salvar" sai da tela | `width: min(340px, calc(100vw - 16px))`, `maxHeight: calc(100dvh - 16px)`, rolagem | sim |
| carteira-03 | M | Carteiras (ManagerCell) | [ManagerAssign.tsx:152](src/components/carteira/ManagerAssign.tsx#L152) | X de 15px sem padding. Lápis de 13px com 0.15rem (282). "Atribuir" com 0.25rem e 0.72rem (292) | Alvos de 15, 18 e 24px. Toque errado | IconButton de 44px | sim |
| instrumentos-06 | M | /instrumentos | [GestaoInstrumentosTable.tsx:249](src/components/instrumentos/GestaoInstrumentosTable.tsx#L249) | Paginação própria, um botão por página, sem janela e sem wrap, em container com `overflow: hidden` (127) | Com 6 ou mais páginas, as últimas ficam inacessíveis | Usar `CarteiraPagination` | não |
| instrumentos-07 | M | /instrumentos | [GestaoInstrumentosCategoryTabs.tsx:57](src/components/instrumentos/GestaoInstrumentosCategoryTabs.tsx#L57) | Pills de 0.4rem/0.8rem (~32px) com wrap | 6 pills em 3 linhas, alvos < 44 | Faixa rolável com 44px ou select (F2-16) | sim |
| carteira-05 | M | Carteiras (filtros) | [carteiraStyles.ts:46](src/components/carteira/carteiraStyles.ts#L46) | `carteiraSelect` com `width: 190px` e 0.8rem. Verificação: cabe em 199px, o problema é zoom e altura | Zoom no iOS. ~31px. Largura não acompanha | `width: 100%; maxWidth: 190px; flex: 1 1 160px`, 16px, 44px | sim |
| carteira-v1 *(adicionado na verificação)* | M | Carteiras (ManagerCell) | [ManagerAssign.tsx:87](src/components/carteira/ManagerAssign.tsx#L87) | Listener em captura fecha o painel na rolagem horizontal do wrapper da tabela. Posição calculada uma vez (117-121) | Arrastar a tabela até a coluna Gestor fecha o painel | Fechar só em scroll de ancestrais da âncora (`panelRef.contains`). Bottom sheet | sim |
| instrumentos-08 | B | /instrumentos | [GestaoInstrumentosSummaryCards.tsx:94](src/components/instrumentos/GestaoInstrumentosSummaryCards.tsx#L94) | Títulos em 0.74rem. `rowStyle` em `space-between` sem gap/wrap (59) | < 12px. Rótulo e valor encostam | 0.75rem. `gap` e `flexWrap` | sim |
| instrumentos-09 | B | /instrumentos | [GestaoInstrumentosTable.tsx:28](src/components/instrumentos/GestaoInstrumentosTable.tsx#L28) | `th` com 0.7rem, tipo com 0.7rem (166), fornecedor e motivo com 0.72rem (175, 190) | Difícil de ler | Mínimo de 0.75rem via token | sim |
| instrumentos-10 | B | /instrumentos | [HeaderRefreshAction.tsx:51](src/design-system/components/HeaderRefreshAction.tsx#L51) | Bloco de ações sem wrap e texto `nowrap` (83) | ~220px contra ~199px: "Atualizar" cortado | `flexWrap` ou esconder o texto em ≤480 | sim |
| carteira-06 | B | Carteiras (tabelas) | [carteiraStyles.ts:5](src/components/carteira/carteiraStyles.ts#L5) | `carteiraTh` com 0.7rem e `nowrap`. `carteiraButton` com ~30px e `nowrap`. Positivo: consumidores com `overflowX: auto` | Cabeçalho de 11,2px, botões < 44 | 0.75rem. 44px em `pointer: coarse`. Cartões | sim |
| carteira-07 | B | Carteiras (linha expandida) | [CarteiraDetailLabel.tsx:5](src/components/carteira/CarteiraDetailLabel.tsx#L5) | Rótulo de 0.68rem. Célula expandida com `padding-left: 2.5rem` (12) | Rótulo ilegível. Recuo de 40px | 0.75rem. 1rem no mobile | sim |
| carteira-08 | B | Carteiras (resumo) | [CarteiraSummaryCards.tsx:61](src/components/carteira/CarteiraSummaryCards.tsx#L61) | `minmax(210px, 1fr)` sem `min()`. Rótulos de 0.72rem e dicas de 0.74rem (86, 96-97) | ~11px de estouro em 199px. 4 cards de ~110px de altura | `minmax(min(210px, 100%), 1fr)`. 2 colunas compactas | sim |
| sync-01 | B | (componente não usado) | [SyncStatusBadge.tsx:29](src/components/SyncStatusBadge.tsx#L29) | Não é importado em lugar nenhum (código morto) | Nenhum hoje | Remover | não |
| cards-01 | B | /atas (skeleton) | [index.css:1064](src/index.css#L1064) | `.skeleton-subtitle { width: 240px }` | Corte só visual | `width: min(240px, 80%)` | não |
| instr-v2 *(adicionado na verificação)* | B | /instrumentos | [GestaoInstrumentosCompactFilters.tsx:107](src/components/instrumentos/GestaoInstrumentosCompactFilters.tsx#L107) | "Exibindo X de Y instrumentos" com `nowrap` e 0.78rem | ~200px em ~199px: cortado | Remover o `nowrap` | não |

### 4.3 Atas: carteira, saldos por unidade e Ata 360

| ID | Sev. | Rota | Local | Problema e evidência | Impacto em 375px | Correção sugerida | Base? |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| atas-01 | C | /atas, /atas/saldos-unidade | [ArpSearch.tsx:367](src/components/ArpSearch.tsx#L367) | Padding de `1.5rem 2rem 3rem` sobre o main. Idem em InternalAllocationsDashboard.tsx:331 e no erro (353) | ~199px de conteúdo (menos ainda com a sidebar aberta) | `PageContainer` (F2-04) | sim |
| atas-02 | C | /atas | [ArpPortfolioFilters.tsx:46](src/components/atas/ArpPortfolioFilters.tsx#L46) | Busca com `minWidth 260px`. Selects com 190px. Controles com ~30px. "Limpar" com ~26px | Input passa ~60px e há rolagem/corte na página | `minWidth: 0; flex: 1 1 100%`, selects com 100% em ≤480, 44px | sim |
| atas-03 | C | /atas | [CarteiraSummaryCards.tsx:61](src/components/carteira/CarteiraSummaryCards.tsx#L61) | `minmax(210px, 1fr)` em ~199px | Cards maiores que a página. 4 cards altos antes da lista | `minmax(min(100%, 160px), 1fr)`. 2 colunas | sim |
| atas-11 | C | /atas/saldos-unidade | [FilterBar.tsx:68](src/design-system/components/FilterBar.tsx#L68) | Busca com `flex 1 1 220px`, `minWidth 200px` em ~165px. Label `nowrap` + select ("Vigência da Ata:" + "Expiradas / Canceladas" ≈ 270px) | Rolagem/corte na página, selects cortados | `minWidth: 0`, label acima, select com 100% (F2-07) | sim |
| atas-12 | C | /atas/detalhe/:ataKey | [Instrument360Page.tsx:8](src/components/instrument360/Instrument360Page.tsx#L8) | Casca com padding 1.5rem, Hero com 1.5rem (Instrument360Hero.tsx:66), TabPanel com 1.25rem (Instrument360TabPanel.tsx:32), tudo inline | ~167px no Hero e ~173px nas abas. Raiz dos estouros do 360 | Zerar o padding da casca no mobile. 0.75–1rem em ≤480 via classe | sim |
| atas-13 | C | /atas/detalhe/:ataKey, /atas/saldos-unidade | [HealthStripParts.tsx:76](src/components/instrument360/HealthStripParts.tsx#L76) | `HealthTileGrid` com `minmax(190px, 1fr)` | No Hero (~167px) os 4 indicadores estouram | `minmax(min(100%, 140px), 1fr)`. Valor de ~1.1rem | sim |
| atas-16 | C | ?aba=plano | [TaskPlanSection.tsx:192](src/components/plan/TaskPlanSection.tsx#L192) | Tarefa com `minWidth 240px`. Selects de modelo com 260/240px (440, 555). ~140px no cartão. Sem `overflow: hidden` | Cada tarefa estoura ~100px. Não dá para aplicar modelo com conforto | `minWidth: 0`, base de 100%, selects com 100% | não |
| atas-v1 *(adicionado na verificação)* | C | Shell (afeta todo o grupo) | [AppShell.tsx:18](src/components/layout/AppShell.tsx#L18) | `readStoredCollapsed()` retorna `false` e a sidebar abre com 280px no fluxo | ~95px antes do padding do main. As contas do grupo subestimam o estouro | Ver F2-03. `overflow-x: clip` na coluna como rede de segurança | sim |
| atas-04 | A | /atas, /atas/saldos-unidade | [PageHeader.tsx:65](src/design-system/components/PageHeader.tsx#L65) | Actions sem wrap. HeaderRefreshAction (Atas). 2 AppButton (Alocações, AllocationsPortfolioHeader.tsx:25-44). Verificação: min-content de ~240px | Passa dos 199px. Cabe depois da F2-04 | `flexWrap`. Menu "Mais" no celular | sim |
| atas-05 | A | /atas | [ArpPortfolioList.tsx:162](src/components/atas/ArpPortfolioList.tsx#L162) | 8 colunas, `nowrap` em 226/241/247/261/271, Fornecedor com `minWidth 170` (230). Só `overflowX` (161) | ~700px de rolagem para chegar à ação | Cartão por Ata (padrão `.ata-card`) ou DataTable `cards` | sim |
| atas-06 | A | /atas, /atas/saldos-unidade | [CarteiraPagination.tsx:51](src/components/carteira/CarteiraPagination.tsx#L51) | Sem wrap, dentro do shell com `overflow: hidden` | "Próxima" cortado. Alvos de 28px | `flexWrap`, modo compacto, 44px | não |
| atas-08 | A | /atas | [ArpPortfolioList.tsx:221](src/components/atas/ArpPortfolioList.tsx#L221) | Chevron de 15px com 0.2rem (~23px). `carteiraButton` com ~30px. Lápis com 0.15rem (ManagerAssign.tsx:282) | Toque cai na linha vizinha | 44px (IconButton). 40–44px no `carteiraButton` | sim |
| atas-09 | A | /atas/saldos-unidade | [AllocationsPortfolioContent.tsx:88](src/components/atas/allocations/AllocationsPortfolioContent.tsx#L88) | `dl` em flex sem wrap (gap de 1.25rem) dentro de `overflow: hidden` | "Saldo livre" (dado principal) cortado | `flexWrap` ou grid de 2–3 colunas `minmax(0, 1fr)` | não |
| atas-10 | A | /atas/saldos-unidade | [AllocationsPortfolioContent.tsx:107](src/components/atas/allocations/AllocationsPortfolioContent.tsx#L107) | 6 colunas, `nowrap` em 151/156/161/177, barra de 90px (166) | "Abrir item" fora da tela. Comparar exige rolagem | Cartão por linha com 3 métricas | sim |
| atas-14 | A | /atas/detalhe/:ataKey | [HealthStripParts.tsx:221](src/components/instrument360/HealthStripParts.tsx#L221) | Rótulos absolutos `nowrap` de 0.68rem. Colisão a 14% da largura (137). Data só em `title` (186, 225) | Rótulos sobrepostos e ilegíveis. Sem data no toque | Lista vertical de marcos em ≤480. Colisão em px (F2-18) | não |
| atas-15 | A | ?aba=acoes | [AtaActionQueue.tsx:166](src/components/atas/AtaActionQueue.tsx#L166) | Título com `minWidth 220px`, badge com 120, data com 80. Verificação: lista com `overflow: hidden` (146) corta o título. Dispensados (188) estouram a página | Título cortado na aba padrão do 360 | `minWidth: 0`. Ações em linha própria | não |
| atas-17 | A | ?aba=contratos | [AtaLinkedContracts.tsx:78](src/components/atas/AtaLinkedContracts.tsx#L78) | Bloco com `minWidth 260px` num painel de ~173px. Verificação: os botões continuam visíveis (wrap na linha 75) | Rolagem horizontal da página | `minWidth: 0` (ou `min(100%, 260px)`) | não |
| atas-18 | A | ?aba=itens | [AtaItemsTable.tsx:48](src/components/atas/AtaItemsTable.tsx#L48) | 7 colunas. Primeira com `min 200` / `max 320` (71). Descrição `nowrap` só em `title` (76-78) | Saldo e ação só com rolagem. Descrição ilegível no toque | Cartão por item com `line-clamp` e 3 métricas | sim |
| atas-21 | A | /atas/detalhe/:ataKey | [TaskPlanSection.tsx:173](src/components/plan/TaskPlanSection.tsx#L173) | Status de 24×24 com gap de 2px. `iconOnly sm` de 32px em AtaActionQueue, AtaItemsTable, AtaLinkedContracts e TaskPlanSection:243. `pncpLinkStyle` com ~26px (Ata360Header.tsx:40) | Status errado com facilidade. Ações < 44 | 44px em `pointer: coarse`. Select ou segmented control | sim |
| atas-v2 *(adicionado na verificação)* | A | ?aba=plano | [TaskPlanSection.tsx:277](src/components/plan/TaskPlanSection.tsx#L277) | Formulário de detalhes com `minmax(200px, 1fr)` em ~140px | Rolagem lateral ao editar prazo ou responsável | `minmax(min(100%, 200px), 1fr)`. Reduzir o padding | não |
| atas-19 | M | /atas/detalhe/:ataKey | [Instrument360Tabs.tsx:30](src/components/instrument360/Instrument360Tabs.tsx#L30) | Abas com `flexWrap`. Indicador com `marginBottom -1px` só alinha na última linha | Abas empilhadas de forma irregular | Abas roláveis e rótulos curtos (F2-16) | sim |
| atas-20 | M | /atas/detalhe/:ataKey | [InstrumentPageState.tsx:86](src/components/instrument360/InstrumentPageState.tsx#L86) | Erro e não encontrado: 2 botões sem wrap. Cartão com `3rem 2rem` (47) | ~210px em ~150px | `flexWrap` (ou coluna). Reduzir o padding | não |
| atas-22 | M | /atas, saldos, 360 | [carteiraStyles.ts:6](src/components/carteira/carteiraStyles.ts#L6) | Muito texto entre 0.68 e 0.72rem (th, UASG, rótulos, hints, linha da vida, R$, badges, form do plano) | Valores secundários ilegíveis | Piso de 12px via tokens (F2-14) | sim |
| atas-23 | M | /atas, 360 | [ArpPortfolioList.tsx:234](src/components/atas/ArpPortfolioList.tsx#L234) | Texto com ellipsis só por `title` (234-235, 299, AtaItemsTable:77, HealthStripParts:186/225, HeaderRefreshAction:98) | Objeto, descrição e data inacessíveis no toque | `line-clamp` (como em AllocationsPortfolioContent:136) ou lista | não |
| atas-24 | M | /atas/saldos-unidade | [ExportExcelModal.tsx:369](src/components/modals/ExportExcelModal.tsx#L369) | Seções em `1fr 1fr` fixo. Grid de colunas com `minmax(260px)` (491) | Selects espremidos em ~130px | `minmax(min(100%, 220px), 1fr)` | não |
| atas-v3 *(adicionado na verificação)* | M | /atas, saldos | [ArpPortfolioFilters.tsx:60](src/components/atas/ArpPortfolioFilters.tsx#L60) | Busca e selects com 0.8rem. FilterBar com 13px | Zoom no iOS sobre um layout que já estoura | 16px em toque / ≤768 (F2-13) | sim |
| atas-07 | B | /atas | [ArpPortfolioList.tsx:296](src/components/atas/ArpPortfolioList.tsx#L296) | Linha expandida em grid de 5 colunas fixas. Verificação: tudo depende da rolagem da tabela | "Ver saldo" só com rolagem | Empilhar no cartão. Reduzir o `padding-left` | não |
| atas-25 | B | /atas | [ManagerAssign.tsx:134](src/components/carteira/ManagerAssign.tsx#L134) | Painel fixo de 340px, ancorado numa célula rolável, sem reposicionar | Desalinha se a tabela rolar | Bottom sheet ou `min(340px, calc(100vw - 16px))` | sim |
| atas-v4 *(adicionado na verificação)* | B | ?aba=plano | [TaskPlanSection.tsx:212](src/components/plan/TaskPlanSection.tsx#L212) | Metadados "Prazo"/"Resp" em flex sem wrap | Nomes longos estouram | `flexWrap` com `rowGap` pequeno | não |

### 4.4 Item da Ata (saldos/empenhos) e modais

| ID | Sev. | Rota | Local | Problema e evidência | Impacto em 375px | Correção sugerida | Base? |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| item-v1 *(adicionado na verificação)* | C | Item e todo o AppShell | [AppShell.tsx:30](src/components/layout/AppShell.tsx#L30) | Sidebar expandida por padrão (Sidebar.tsx:195), sem breakpoint. Os 237px do auditor supõem que não há sidebar. Recolhida, sobram ~173px nas abas | Largura do item quase nula no primeiro acesso | Ver F2-03 | sim |
| item-01 | A | ?aba=contratos | [ItemBalances.tsx:972](src/components/ItemBalances.tsx#L972) | Tabela "Vinculados" manual de 9 colunas, `nowrap` (983, 1020, 1071), até 4 botões de 32px sem wrap (1093) | ~800px em ~237px. Ações fora da vista | Cartão por contrato ou DataTable `cards` | sim |
| item-02 | A | ?aba=contratos | [ItemBalances.tsx:1142](src/components/ItemBalances.tsx#L1142) | `td colSpan=9` com `marginLeft 2.5rem` aninha o ContractEmpenhosPanel (6 colunas, input, select): tabela dentro de tabela | Confirmar e vincular empenho exige rolar várias telas | Painel próprio ou bottom sheet no mobile. Cartão por empenho | sim |
| item-03 | A | Item (casca) | [Instrument360Page.tsx:8](src/components/instrument360/Instrument360Page.tsx#L8) | Paddings inline empilhados: main + página + Hero (66) + TabPanel (34) | ~279px no topo, ~237px nas abas (~173px com a sidebar). ~37% em margens | Gutter responsivo (F2-04) | sim |
| item-04 | A | ?aba=unidades | [UnidadesTab.tsx:71](src/components/item-balances/UnidadesTab.tsx#L71) | 5 colunas, consumo com 180px. UASG + selo sem wrap (31). É a aba padrão | Saldo e Consumo fora da vista já na primeira tela | Modo cartão. Sem largura fixa | sim |
| item-05 | A | ?aba=alocacao | [AllocationsTab.tsx:172](src/components/item-balances/AllocationsTab.tsx#L172) | 6 colunas (180 + 110px fixos, 184). Editar/excluir com `iconOnly sm` de 32px (187-188) | Ações fora da vista e com 32px | Cartão com ações de 44px no rodapé | sim |
| item-06 | A | ?aba=contratos | [ContractSuggestionsPanel.tsx:100](src/components/item-balances/ContractSuggestionsPanel.tsx#L100) | 6 colunas. Número com `nowrap` (52). Vincular/Descartar em flex sem wrap (~26px) | Ações principais só com rolagem | Cartões com botões 1fr 1fr de 44px | sim |
| item-07 | A | ?aba=contratos | [ContractEmpenhosPanel.tsx:152](src/components/item-balances/ContractEmpenhosPanel.tsx#L152) | Select com 0.2rem/0.75rem (~24px), `maxWidth 200`. PendingConfirm: input de 72px com 0.8rem + botão sem wrap (52, 61) | Alvos minúsculos. Zoom no iOS no meio da rolagem | Cartão com select a 100%/44px, input de 16px, botão com 100% | sim |
| item-09 | A | Item (todas as abas) | [DataTable.tsx:41](src/design-system/components/DataTable.tsx#L41) | DataTable só com `overflowX`. Padding inline impede a regra de index.css:715 | Todas as tabelas rolam sem indicador | Ver F2-08 | sim |
| item-08 | M | ?aba=adesoes | [AdesoesTab.tsx:72](src/components/item-balances/AdesoesTab.tsx#L72) | Coluna de percentual com 200px fixos | Data só com rolagem | Cartão. Sem largura fixa < 768 | sim |
| item-10 | M | LinkContractModal | [LinkContractModal.tsx:396](src/components/modals/LinkContractModal.tsx#L396) | Linha de selos sem wrap. "Valor Global" `nowrap` (435). Verificação: com 3 ou mais selos, rolagem lateral dentro da lista | Rolagem lateral na lista | `flexWrap`. Valor em linha própria | não |
| item-11 | M | LinkContractModal | [LinkContractModal.tsx:372](src/components/modals/LinkContractModal.tsx#L372) | Cartões `div onClick` sem `role`/`tabIndex`/teclado. Destaque via `onMouseEnter` | Sem estado de pressionado. Não anunciado como acionável | `<button>` ou `role="option"` com `:focus-visible`/`:active` em CSS | não |
| item-12 | M | LinkContractModal | [LinkContractModal.tsx:368](src/components/modals/LinkContractModal.tsx#L368) | Lista com `maxHeight 280` (e 260 em 510) dentro do corpo rolável. Botões no fim do corpo (578). Verificação: o `autoFocus` (343) não abre o teclado sozinho | Rolagem presa. "Vincular" só aparece rolando | Sem `maxHeight` no mobile. Botões na prop `footer` | não |
| item-13 | M | LinkContractModal | [LinkContractModal.tsx:463](src/components/modals/LinkContractModal.tsx#L463) | "Trocar contrato" com ~24px. Checkbox (521) sem `label` envolvente. Cancelar/Vincular com ~35px. Descrição `nowrap` (535) | Checkbox de ~13px. Descrição cortada | AppButton de 44px. `<label>` na linha. `line-clamp` | sim |
| item-14 | M | ExportExcelModal | [ExportExcelModal.tsx:369](src/components/modals/ExportExcelModal.tsx#L369) | Grid `1fr 1fr` fixo nos selects | ~118px por select, opção truncada | `minmax(min(220px, 100%), 1fr)` | não |
| item-15 | M | ExportExcelModal | [ExportExcelModal.tsx:419](src/components/modals/ExportExcelModal.tsx#L419) | Marcar/Desmarcar/Padrão com ~22px, sem wrap (418) | Toque errado entre ações opostas | AppButton de 44px. `flexWrap` | sim |
| item-16 | M | ExportExcelModal | [ExportExcelModal.tsx:489](src/components/modals/ExportExcelModal.tsx#L489) | `minmax(260px)` sem `min()` e `maxHeight 230` com rolagem própria. Presets empilhados (253) | Estoura em 320px. Rolagem aninhada | `minmax(min(260px, 100%), 1fr)`. Presets em chips roláveis | não |
| item-17 | M | Todos os modais | [Modal.tsx:94](src/design-system/components/Modal.tsx#L94) | `90vh`, fechar com ~26px (126), footer sem wrap (136), sem tela cheia | Rodapé atrás da barra. Teclado sem área útil | Ver F2-09 | sim |
| item-18 | M | Formulários | [index.css:298](src/index.css#L298) | `.form-input` com 0.9rem. Inline com 0.75–0.88rem (LinkContractModal:337, AllocationsTab:297/320, ContractEmpenhosPanel:61) | Zoom em todo foco | 16px em ≤768. AppInput (F2-13) | sim |
| item-19 | M | Item (todas as abas) | [ItemBalances.tsx:1012](src/components/ItemBalances.tsx#L1012) | Expandir com padding 6px (~28px), só `title`, sem `aria-expanded`. Ações `iconOnly sm` de 32px (1095-1134) | Ícones sem significado no toque | 44px, `aria-expanded`/`controls`, rótulos de texto ou menu | sim |
| item-21 | M | Item | [Instrument360Tabs.tsx:31](src/components/instrument360/Instrument360Tabs.tsx#L31) | Rótulos longos com contagem em `flexWrap`. Indicador para uma linha só (49) | ~130px verticais de abas desalinhadas | Abas roláveis e rótulos curtos (F2-16) | sim |
| item-v2 *(adicionado na verificação)* | M | Todos os modais | [Modal.tsx:75](src/design-system/components/Modal.tsx#L75) | Padding do overlay (16px) somado ao de header, corpo e footer, inline | ~311px úteis, ~279px dentro de cartões | Tela cheia ou bottom sheet com padding de 12–16px via classe | sim |
| item-20 | B | Item (todas as abas) | [ItemBalances.tsx:1040](src/components/ItemBalances.tsx#L1040) | Texto auxiliar entre 0.68 e 0.74rem (1040, 1060, 1027 e outros arquivos) | ~11px em cinza, ilegível | Token de 12px | sim |
| item-22 | B | Item (Hero) | [HealthStripParts.tsx:85](src/components/instrument360/HealthStripParts.tsx#L85) | `minmax(190px)` sem `min()`. Voltar com ~32px (Hero:80-90) | Estoura com a sidebar ou em 320px | `min(190px, 100%)`. 2 colunas compactas. Voltar com 44px | não |
| item-23 | B | ?aba=contratos | [ContractEmpenhosPanel.tsx:122](src/components/item-balances/ContractEmpenhosPanel.tsx#L122) | Explicações só em `title` ("sug.", "pendentes", "N/D") | O usuário não entende os números | Texto visível ou Tooltip acessível (F2-15) | sim |
| item-24 | B | Modais manuais (não usados) | [ManualEmpenhoModal.tsx:180](src/components/modals/ManualEmpenhoModal.tsx#L180) | ManualEmpenho, ManualContrato, EmpenhoDetail e ItemReconciliationPanel não são importados. Grids fixos. Labels sem `htmlFor` | Nenhum hoje | Remover, ou corrigir grid e labels se reativados | não |

### 4.5 Contratos: carteira e Contrato 360

| ID | Sev. | Rota | Local | Problema e evidência | Impacto em 375px | Correção sugerida | Base? |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| contratos-01 | C | ?aba=pagamentos | [PaymentCycleDetails.tsx:70](src/components/contracts/payment/PaymentCycleDetails.tsx#L70) | Form "incluir documento" em grid de 5 colunas (~514px mínimos) dentro de cartão com `overflow: hidden` (ContractPaymentFollowUpSection.tsx:197) | Id. SEI (obrigatório), Valor e "+" invisíveis: não dá para incluir documento | `repeat(auto-fit, minmax(140px, 1fr))` com botão em `1 / -1`. Botão com texto "Incluir" | não |
| contratos-v1 *(adicionado na verificação)* | C | /contratos e 360 | [Sidebar.tsx:195](src/components/layout/Sidebar.tsx#L195) | Mesmo problema de shell-01. As contas de 199–263px supõem que não há sidebar | Com 280px nenhuma tela do escopo é utilizável | Ver F2-03 | sim |
| contratos-02 | A | ?aba=plano | [TaskPlanSection.tsx:192](src/components/plan/TaskPlanSection.tsx#L192) | `minWidth` de 240 (192), 260 (440), 240 (555) e `minmax(200px)` (277), sem `overflow: hidden`. Verificação: rebaixado de crítico | Rolagem lateral da página. O estado vazio já nasce estourando | `flex: 1 1 240px; minWidth: 0`, selects com 100%/max 360, `min(200px, 100%)` | não |
| contratos-03 | A | ?aba=pagamentos | [ContractPaymentFollowUpSection.tsx:200](src/components/contracts/ContractPaymentFollowUpSection.tsx#L200) | Info do ciclo com `minWidth 260px` dentro de cartão com `overflow: hidden` (197) | ~60px de cada linha somem | `minWidth: 0`. Coluna em telas estreitas | não |
| contratos-04 | A | /contratos/:contractKey | [ContractActionQueue.tsx:199](src/components/contracts/ContractActionQueue.tsx#L199) | Título com 220px, badge com 120, data com 80, em lista com `overflow: hidden` (178). Dispensados (222) estouram a página | Título e subtítulo cortados | `minWidth: 0`. Empilhar badge/data, título e ação | não |
| contratos-05 | A | /contratos | [CarteiraPagination.tsx:63](src/components/carteira/CarteiraPagination.tsx#L63) | Botões sem wrap (51, 63) dentro do shell com `overflow: hidden`. ~26px | "Próxima" cortado | `flexWrap`, modo compacto, 44px | não |
| contratos-06 | A | /contratos | [ContractsPortfolioTable.tsx:159](src/components/contracts/portfolio/ContractsPortfolioTable.tsx#L159) | 8 colunas, `nowrap` em 5 células, Fornecedor com `minWidth 170` (207). "Ver Detalhes" no fim, linha não clicável | ~900px. Abrir o contrato exige rolar | Cartões clicáveis < 768. Mínimo: coluna sticky com a ação junto do número | sim |
| contratos-08 | A | ?aba=plano | [TaskPlanSection.tsx:172](src/components/plan/TaskPlanSection.tsx#L172) | 4 status de 24×24 com gap de 2px, só ícone/`title`, sem `aria-pressed` | Marca "Concluída" por engano | 44px, gap ≥ 8, `aria-pressed`, select no mobile | sim |
| contratos-10 | A | /contratos/:contractKey | [HealthStripParts.tsx:137](src/components/instrument360/HealthStripParts.tsx#L137) | Colisão a 14%, rótulos absolutos `nowrap` de 0.68rem (229-231), nome só no `title` (225) | Marcos e "Hoje" sobrepostos | `ResizeObserver` e px. Lista vertical em ≤480 (F2-18) | não |
| contratos-07 | M | ?aba=pagamentos | [PaymentCycleModals.tsx:191](src/components/contracts/payment/PaymentCycleModals.tsx#L191) | Linhas de documento no grid de ~514px dentro do modal. Rótulos só na primeira linha. Verificação: rolagem interna sem corte | Valor e remover exigem rolagem lateral no modal | Mini-cartão em 2 colunas com rótulos em todas as linhas | não |
| contratos-09 | M | ?aba=pagamentos | [ContractPaymentFollowUpSection.tsx:235](src/components/contracts/ContractPaymentFollowUpSection.tsx#L235) | Até 4 `iconOnly sm` (32px) com gap de 4px. Cancelar e Excluir lado a lado. Ação principal é uma seta | Ícones sem significado no toque. Destrutivos colados | Ação principal com texto. Menu "⋯". 44px, gap ≥ 8 | sim |
| contratos-11 | M | /contratos/:contractKey | [Instrument360Hero.tsx:61](src/components/instrument360/Instrument360Hero.tsx#L61) | Hero sem modo compacto: título, objeto, 6 metadados, 4 tiles e linha da vida, com padding de 1.5rem | Mais de 1,5 tela antes das abas | 1rem, tiles em 2 colunas, metadados em `<details>`, `line-clamp`, abas sticky | sim |
| contratos-12 | M | /contratos/:contractKey | [Instrument360Tabs.tsx:30](src/components/instrument360/Instrument360Tabs.tsx#L30) | 5 abas com `flexWrap` | Abas em 2–3 linhas, sublinhado no meio | Abas roláveis (F2-16) | sim |
| contratos-13 | M | /contratos | [ManagerAssign.tsx:87](src/components/carteira/ManagerAssign.tsx#L87) | Fecha em scroll (captura) e resize. `autoFocus` (159, 185). 340px fixos | Painel some ao digitar e ao rolar a tabela | Bottom sheet (F2-10) | sim |
| contratos-14 | M | ?aba=plano | [planTaskEditing.tsx:69](src/components/contracts/planTaskEditing.tsx#L69) | Confirmação inline em `inline-flex` sem wrap. AddTaskForm com `minmax(200px)` (140) | ~330px em ~207px: estouro da página | `flexWrap` ou `useConfirmDialog`. `min(200px, 100%)` | não |
| contratos-15 | M | ?aba=financeiro | [ContractFinancialExecutionSection.tsx:108](src/components/contracts/ContractFinancialExecutionSection.tsx#L108) | 10 colunas. O aviso (168) manda "usar a seta da linha", que está na última coluna | Só empenho e credor visíveis | DataTable `cards` ou colunas prioritárias | sim |
| contratos-16 | M | ?aba=pagamentos | [ContractPaymentFollowUpSection.tsx:278](src/components/contracts/ContractPaymentFollowUpSection.tsx#L278) | WorkflowStepper horizontal, 4 × 120px | "Enviado à CGOFI" e "Pago" ocultos sem pista | `orientation="auto"` (F2-17) | sim |
| contratos-17 | M | /contratos | [ContractsRoute.tsx:234](src/routes/ContractsRoute.tsx#L234) | Padding `1.5rem 2rem 3rem` (234, 216) sobre o main, e cascata no 360 | 112px de gutters. ~199px num cartão de pagamento | Gutter único (F2-04) | sim |
| contratos-18 | M | /contratos | [ContractsPortfolioFilters.tsx:51](src/components/contracts/portfolio/ContractsPortfolioFilters.tsx#L51) | Busca com `minWidth 260`. Selects com 190px. 0.8rem. ~30px | Estoura com a sidebar. Zoom no iOS | `flex: 1 1 260px; minWidth: 0`. Selects flexíveis. 16px. Botão "Filtros" | sim |
| contratos-19 | M | /contratos | [ContractsPortfolioTable.tsx:196](src/components/contracts/portfolio/ContractsPortfolioTable.tsx#L196) | Expansor de 15px com 0.2rem (~22px). "Ver Detalhes" com ~30px. Lápis com 0.15rem | Difícil de acertar | 44px ou célula clicável | sim |
| contratos-20 | M | /contratos | [ContractsPortfolioTable.tsx:265](src/components/contracts/portfolio/ContractsPortfolioTable.tsx#L265) | `colSpan={8}` com ~900px, `padding-left 2.5rem`. Pendências sem wrap. Verificação: alarga a tabela, não trunca | Detalhes espalhados em ~900px | Detalhe dentro do cartão. Ou conteúdo sticky com largura de viewport | não |
| contratos-21 | M | /contratos/:contractKey | [ContractActionQueue.tsx:80](src/components/contracts/ContractActionQueue.tsx#L80) | Todas as ações em `iconOnly sm` (32px) só com `title`. Idem em FinancialExecution:150, PaymentCycleDetails:54/79, TaskPlanSection:247 | O ✓ conclui sem confirmação e sem rótulo visível | Texto curto em ≤768. 44px em `pointer: coarse` | sim |
| contratos-v2 *(adicionado na verificação)* | M | /contratos/:contractKey | [HealthStripParts.tsx:76](src/components/instrument360/HealthStripParts.tsx#L76) | `minmax(190px)` no Hero sem overflow. ~165px com a sidebar recolhida | Rolagem lateral logo no cabeçalho | `minmax(min(190px, 100%), 1fr)` | não |
| contratos-22 | B | ?aba=pagamentos | [index.css:303](src/index.css#L303) | `.form-input` com 0.9rem. Inputs do plano com 0.8rem/0.35rem (~28px) | Zoom no iOS. Alvos pequenos | `@media` com 16px e 44px. Migrar para `.form-input` | sim |
| contratos-23 | B | /contratos | [ContractsPortfolioTable.tsx:209](src/components/contracts/portfolio/ContractsPortfolioTable.tsx#L209) | Fornecedor e objeto com ellipsis só por `title`. Tile compact (HealthStripParts:49/56) | Texto completo inacessível no toque | Exibir no expandido ou cartão. `line-clamp: 2` | não |
| contratos-24 | B | /contratos | [CarteiraSummaryCards.tsx:61](src/components/carteira/CarteiraSummaryCards.tsx#L61) | `minmax(210px)` (1 coluna). Rótulos de 0.72/0.74rem | ~440px de cards antes da tabela | 2 colunas compactas ou carrossel | não |
| contratos-25 | B | ?aba=historico | [ContractEventsTimeline.tsx:502](src/components/contracts/ContractEventsTimeline.tsx#L502) | Badges de 0.72rem. Recuo de 1.75rem (416) + cartão de 1.25rem (475). Link com ~24px (553) | Texto em ~171px. Link difícil de tocar | Recuo de 1rem, cartão de 0.75rem, 0.75rem, 44px | sim |

### 4.6 Pagamentos, Empenhos, administração e modelos de tarefa

| ID | Sev. | Rota | Local | Problema e evidência | Impacto em 375px | Correção sugerida | Base? |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| pagadm-01 | C | /pagamentos, /empenhos, /admin/*, modelos | [PaymentsRoute.tsx:29](src/routes/PaymentsRoute.tsx#L29) | Container inline `1.5rem 2rem 3rem` repetido (FinancialExecutionRoute:57, Departments:177, Users:217, Roles:210, AlertRules:84, Holidays:154, TaskTemplates:510) | ~199px (ou negativo com a sidebar). Excesso **cortado** pelo `overflow-x` do body | `PageContainer` com classe. Drawer (F2-03/04) | sim |
| pagadm-02 | C | /pagamentos, /empenhos, regras, feriados | [PageHeader.tsx:65](src/design-system/components/PageHeader.tsx#L65) | Actions sem wrap e sem `minWidth: 0`. HeaderRefreshAction `nowrap` (51, 83). Feriados com 3 botões md (161-176). Regras com 2 (91-107) | "Nova data" e "Salvar" cortados. Empenhos: botão de mais de 199px | `flexWrap`, `minWidth: 0`, empilhar em ≤480 (F2-07) | sim |
| pagadm-03 | C | /pagamentos, /empenhos | [CarteiraPagination.tsx:51](src/components/carteira/CarteiraPagination.tsx#L51) | Sem wrap dentro do shell com `overflow: hidden` (carteiraStyles.ts:42). Botões de ~26px | Não dá para passar da página 1 (mais de 15 itens). Persiste mesmo com 343px | `flexWrap`, "Anterior · p/N · Próxima", 44px | sim |
| pagadm-04 | C | /admin/departamentos | [DepartmentsManagementPage.tsx:286](src/components/admin/DepartmentsManagementPage.tsx#L286) | `<table>` sem wrapper `overflowX` dentro do shell com `overflow: hidden`. Sigla com 180px (289), Ações com 120px (291) | Coluna Ações (editar/excluir) cortada, inclusive com 343px | Cartões no mobile. No mínimo, wrapper `overflowX: auto` e remover os 180px | sim |
| pagadm-v1 *(adicionado na verificação)* | C | Todo o grupo | [index.css:67](src/index.css#L67) | `body { overflow-x: hidden }` transforma todo estouro do grupo em corte silencioso | Botões e campos somem sem indício | Ver F2-05 | sim |
| pagadm-05 | A | /atas/modelos, /contratos/modelos | [TaskTemplatesPage.tsx:539](src/components/task-templates/TaskTemplatesPage.tsx#L539) | `minmax(280px)` (539), `minWidth 240` (317), input de edição com 260 (337). Verificação: rebaixado de crítico, depende em boa parte da base | Formulário e cabeçalho do card cortados (~159px úteis) | `minmax(min(280px, 100%), 1fr)`, `minWidth: min(240px, 100%)`, input com 100% | não |
| pagadm-06 | A | /admin/perfis | [RolesPermissions.tsx:219](src/components/admin/RolesPermissions.tsx#L219) | `minmax(260px)` | ~61px de cada card cortados | `minmax(min(260px, 100%), 1fr)` (helper `responsiveGrid`) | sim |
| pagadm-08 | A | /pagamentos | [ManagementPaymentsOverview.tsx:382](src/components/dashboard/ManagementPaymentsOverview.tsx#L382) | 7 colunas, `th` e botão `nowrap`. Só `overflowX` | ~1,5 coluna visível, sem referência do contrato | Cartão por ciclo ou primeira coluna sticky (F2-08) | sim |
| pagadm-09 | A | /empenhos | [ManagementFinancialExecution.tsx:252](src/components/dashboard/ManagementFinancialExecution.tsx#L252) | 9 colunas, 5 monetárias (256-264, 282-285) | ~900px. Número do empenho some ao rolar | Cartão com grade 2×2 e barra de %. Coluna sticky | sim |
| pagadm-13 | A | /admin/departamentos | [DepartmentsManagementPage.tsx:208](src/components/admin/DepartmentsManagementPage.tsx#L208) | "mesclar para: [select] [Mesclar]" sem wrap. Select sem `width` com a largura da opção mais longa (214, 217) | Botão Mesclar cortado | `flexWrap`, select com 100%, botão abaixo | não |
| pagadm-14 | A | /atas/modelos, /contratos/modelos | [TaskTemplatesPage.tsx:449](src/components/task-templates/TaskTemplatesPage.tsx#L449) | Linhas input + botão sem wrap. Inputs `flex: 1` sem `minWidth: 0` (449-471, 233, 83). Ações do card sem wrap (372) | "Adicionar" sai do card. 4 ações estouram em edição | `minWidth: 0`, `flexWrap`, botão com 100% abaixo, placeholders curtos | não |
| pagadm-15 | A | /atas/modelos, /contratos/modelos | [TaskTemplatesPage.tsx:76](src/components/task-templates/TaskTemplatesPage.tsx#L76) | Botões de ícone com padding 2px e ícones de 13–18px (76, 93, 109, 128, 186, 202, 223, 321). Lixeira com ~26px (410-430) | Alvos de ~17–22px. Excluir colado em renomear | IconButton de 44px, 8px entre ações destrutivas | sim |
| pagadm-17 | A | departamentos, feriados, regras | [HolidaysPage.tsx:151](src/components/admin/HolidaysPage.tsx#L151) | `iconButton` com 0.2rem (151, 250/260/270). Departments:304/307 sem padding. AlertRules:173. Ano com 32px (194/196) | Toques errados entre Desativar, Editar e Excluir | IconButton de 44px. Ação destrutiva separada | sim |
| pagadm-v2 *(adicionado na verificação)* | A | /empenhos | [FinancialExecutionRoute.tsx:65](src/routes/FinancialExecutionRoute.tsx#L65) | "Sincronizar Todos os Empenhos" (AppButton sm, `nowrap`) com ~220px | Cortado mesmo com `flexWrap` no wrapper | Rótulo curto no mobile ou 100% com `whiteSpace: normal` | não |
| pagadm-07 | M | /pagamentos, /empenhos, /admin/usuarios | [FilterBar.tsx:68](src/design-system/components/FilterBar.tsx#L68) | Busca com `minWidth 200`. Label `nowrap` (108). Select sem `width` (112-124). Verificação: estouro de ~25–40px, utilizável | Barra estoura e placeholder truncado | `minWidth: 0`, select com 100% e rótulo acima em ≤480 | sim |
| pagadm-10 | M | /admin/feriados | [HolidaysPage.tsx:215](src/components/admin/HolidaysPage.tsx#L215) | Larguras de 120/110/170/220/120px (215-220). Badges `nowrap`. Verificação: rebaixado (rola) | ~740px. Ações no fim da rolagem | Cartões. Unir Data e Dia | sim |
| pagadm-11 | M | /admin/regras-alertas | [AlertRulesPage.tsx:125](src/components/admin/AlertRulesPage.tsx#L125) | Colunas 220/110/70px (125-127). Input de 96px (26). Verificação: o input fica quase todo visível | Padrão e restaurar só com rolagem | Bloco por regra. Sem larguras fixas | não |
| pagadm-12 | M | /admin/departamentos | [DepartmentsManagementPage.tsx:239](src/components/admin/DepartmentsManagementPage.tsx#L239) | Formulário com `1fr 2fr` fixo | Colunas de ~50/105px, rótulos em várias linhas | `minmax(min(200px, 100%), 1fr)` | não |
| pagadm-16 | M | /atas/modelos, /contratos/modelos | [TaskTemplatesPage.tsx:73](src/components/task-templates/TaskTemplatesPage.tsx#L73) | Toggles expandir (73-79, 318-324) sem `title`, `aria-label` ou `aria-expanded`. Verificação: os outros botões têm `title` como nome | Leitor de tela anuncia "botão" sem nome e sem estado | `aria-label` e `aria-expanded` | não |
| pagadm-18 | M | /admin/usuarios | [UsersManagement.tsx:358](src/components/admin/UsersManagement.tsx#L358) | Ações em `inline-flex` sem wrap (358). E-mail sem `overflowWrap` (309). `overflowX` (285) | ~600px. Editar no fim da linha | Cartão por usuário. `overflowWrap: anywhere`. Menu "⋯" | sim |
| pagadm-20 | M | Formulários do grupo | [UsersManagement.tsx:511](src/components/admin/UsersManagement.tsx#L511) | Inputs com 0.8–0.88rem (Users:511/525/536, Departments:167, TaskTemplates:555/580/243/459, AlertRules:30, Holidays:36, FilterBar:94) | Zoom em todo foco | AppInput/AppSelect com 16px (F2-13) | sim |
| pagadm-21 | M | /pagamentos, /empenhos, admin | [carteiraStyles.ts:23](src/components/carteira/carteiraStyles.ts#L23) | `carteiraButton` com ~27px e `nowrap` (ManagementPaymentsOverview:470, ManagementFinancialExecution:300) | Alvo pequeno no fim da rolagem | 44px em ≤768. Largura total no cartão | sim |
| pagadm-22 | M | /pagamentos, /empenhos, admin | [carteiraStyles.ts:6](src/components/carteira/carteiraStyles.ts#L6) | `th` com 0.7rem em caixa alta. Estágios com 0.7rem (ManagementPaymentsOverview:282-317). Hints com 0.72rem | 11px em caixa alta, ilegível | Piso de 12px. `carteiraTh` com 0.75rem | sim |
| pagadm-23 | M | /empenhos | [ManagementFinancialExecution.tsx:159](src/components/dashboard/ManagementFinancialExecution.tsx#L159) | 7 KPIs em 1 coluna (`minmax(190px)`). Em /pagamentos, 4 KPIs + 6 estágios (`minmax(130px)`, :277) | ~550–700px de rolagem antes da lista | 2 colunas compactas ou carrossel. "Ver mais" | sim |
| pagadm-25 | M | /empenhos | [FinancialExecutionRoute.tsx:143](src/routes/FinancialExecutionRoute.tsx#L143) | Fechar o painel de sincronização: X de 14px, sem padding, opacidade 0.6 | Alvo de ~14px | IconButton de 44px. `flexWrap` no painel | sim |
| pagadm-v3 *(adicionado na verificação)* | M | /empenhos | [HealthStripParts.tsx:50](src/components/instrument360/HealthStripParts.tsx#L50) | Valor do tile com 1.3rem e espaço não separável após "R$" | "R$ 12.345.678,90" (~200px) cortado em ~170px | `clamp()` na fonte. `overflowWrap` ou ellipsis com valor acessível | não |
| pagadm-19 | B | /admin/usuarios | [UsersManagement.tsx:425](src/components/admin/UsersManagement.tsx#L425) | UserX/Trash2 com ~25px, só `title` (425-462). Badge do Gestor de Saldo com permissões no `title` (319). Verificação: o `title` serve de nome | Pouca descoberta no toque | `aria-label`. `iconOnly` de 44px. Permissões em texto | não |
| pagadm-24 | B | /admin/usuarios | [Modal.tsx:134](src/design-system/components/Modal.tsx#L134) | Footer sem wrap. Verificação: os botões atuais cabem (~293px de 311) | Risco só com textos maiores | `flexWrap`. Botões empilhados em ≤480 (F2-09) | sim |
| pagadm-26 | B | /admin/departamentos | [DepartmentsManagementPage.tsx:241](src/components/admin/DepartmentsManagementPage.tsx#L241) | Labels sem `htmlFor`/`id` (241, 245). Idem em Users:502-536 e TaskTemplates:541-587 | O rótulo não foca o campo. Campo sem nome | `useId` com `htmlFor`, ou `label` envolvente | não |
| pagadm-27 | B | /atas/modelos, /contratos/modelos | [TaskTemplatesPage.tsx:621](src/components/task-templates/TaskTemplatesPage.tsx#L621) | Cabeçalho da lista em `space-between` sem wrap | Título e dica em colunas estreitas | `flexWrap` ou coluna < 600 | não |
| pagadm-28 | B | /admin/perfis | [RolesPermissions.tsx:192](src/components/admin/RolesPermissions.tsx#L192) | Fechar o drawer com ~26px (187-195). Linhas de área em `space-between` (117-121) | Fechar exige precisão (o overlay fica invisível com o drawer em 100%) | 44×44. Empilhar rótulo e descrição | não |
| pagadm-v4 *(adicionado na verificação)* | B | /admin/usuarios, /admin/feriados | [Modal.tsx:126](src/design-system/components/Modal.tsx#L126) | Fechar do Modal com padding 4px (~24–26px) | Alvo abaixo de 44px em todos os modais | 44×44 com o ícone centralizado (F2-09) | sim |

---

## 5. Lotes para a Fase 3

A Fase 3 só começa quando os itens **P0 e P1 da Fase 2** estiverem prontos. Sem o drawer e o gutter único, qualquer correção local continua quebrada no primeiro acesso. Os lotes estão em ordem de valor e de dependência.

| Lote | Escopo | Achados principais | Depende da Fase 2 | Observação |
| :--- | :--- | :--- | :--- | :--- |
| **L0. Validação da base** | Aplicar F2-03/04/05 e medir de novo todas as rotas em 375px | shell-*, header-*, css-*, pagadm-01, atas-01, atas-12, item-03, contratos-17 e duplicatas | F2-01 a F2-05 | Refazer as contas de largura útil. Parte dos achados "alto"/"médio" deve cair |
| **L1. Autenticação** | `/login`, `/definir-senha`, `/redefinir-senha` | login-01..03, definir-01, redefinir-01 | F2-13 (AuthInput) | Lote pequeno e independente. Bom piloto de AppInput |
| **L2. Carteiras compartilhadas** | `carteira/*`, `/instrumentos`, `/atas`, `/contratos` (listas) | instrumentos-01..10, carteira-01..08, atas-02..06, atas-08, contratos-05/06/18/19/20/24 | F2-07, F2-08, F2-10 | Maior retorno: `CarteiraPagination`, `carteiraStyles`, `CarteiraSummaryCards` e ManagerAssign servem as três carteiras e Pagamentos |
| **L3. Casca 360 + Ata 360 + Contrato 360** | `instrument360/*`, `TaskPlanSection`, `planTaskEditing`, AtaActionQueue, ContractActionQueue, AtaLinkedContracts, AtaItemsTable, Timeline | atas-13..23, contratos-02/04/08/10/11/12/14/21/23/25, item-21/22 | F2-04, F2-12, F2-16, F2-17, F2-18 | `TaskPlanSection` e `HealthStripParts` são compartilhados entre Ata e Contrato: corrigir uma vez |
| **L4. Pagamentos do contrato** | `contracts/payment/*`, `ContractPaymentFollowUpSection`, `ContractFinancialExecutionSection` | contratos-01/03/07/09/15/16, contratos-22 | F2-08, F2-09, F2-17 | contratos-01 é crítico e **independe da base**: pode ser antecipado como correção pontual |
| **L5. Item da Ata e modais** | `ItemBalances`, `item-balances/*`, LinkContractModal, ExportExcelModal | item-01..24, atas-24, export-v1 | F2-08 (cards e expansão fora da tabela), F2-09 | Mais trabalhoso: a tabela manual "Vinculados" migra para o DataTable |
| **L6. Execução financeira** | `/pagamentos`, `/empenhos` | pagadm-02/03/07/08/09/21/22/23/25, pagadm-v2/v3 | F2-07, F2-08 | Reaproveita L2 (paginação e estilos de carteira) |
| **L7. Administração e modelos** | `/admin/*`, `/atas/modelos`, `/contratos/modelos` | pagadm-04..06, 10..20, 24, 26..28 | F2-06, F2-08, F2-12, F2-13 | pagadm-04 (tabela sem wrapper) pode ser antecipado: é uma linha de código |
| **L8. Limpeza** | Código morto e CSS morto | sync-01, item-24, css-03, cards-01 | — | Remover SyncStatusBadge, ManualContratoModal, ManualEmpenhoModal, EmpenhoDetailModal, ItemReconciliationPanel e classes não usadas |

**Correções rápidas** que valem antes mesmo da Fase 2, porque não dependem da base e removem bloqueios:

- contratos-01 (formulário de documento) e contratos-03.
- pagadm-04 (wrapper `overflowX` em Departamentos).
- `flexWrap` em CarteiraPagination, PageHeader actions e HeaderRefreshAction (carteira-04 / pagadm-02 / pagadm-03).
- Trocar `minmax(Npx, 1fr)` por `minmax(min(Npx, 100%), 1fr)` nos 8 grids citados.

**Critério de aceite por lote:**

- Sem rolagem horizontal da página em 375×812 com o `overflow-x: hidden` desligado.
- Ação principal de cada tela alcançável sem rolagem lateral.
- Alvos de toque das ações principais com pelo menos 44px.
- Nenhum input com fonte abaixo de 16px no mobile.
- Print em 375px anexado ao relatório do lote.

---

## 6. Limitações

- **Esta é uma auditoria estática de código.** Os valores de largura útil (~47, ~95, ~167, ~199, ~237px) foram calculados a partir dos estilos declarados e do `box-sizing: border-box`, sem medição no navegador. Fontes reais, larguras de min-content de textos e o comportamento do layout automático de tabelas podem mudar os números em algumas dezenas de pixels. Vários ajustes dos verificadores vieram justamente dessa diferença: rolagem interna em vez de corte, botões que quebram texto, `title` usado como nome acessível.
- **Não houve validação visual nem teste em dispositivo real.** Os efeitos de iOS Safari (zoom em inputs com menos de 16px, `100vh` contra a barra dinâmica, teclado virtual e `visualViewport`) e de Android Chrome foram inferidos de comportamento documentado, não observados.
- **Estados dependentes de dados** (muitas páginas, selos múltiplos, nomes e e-mails longos, valores na casa dos milhões) foram estimados. A gravidade real depende dos dados de produção.
- **Paisagem e 320px** foram citados só de passagem. O foco foi 375px retrato, com observações pontuais em 768px.
- **Recomendação:** antes de começar a Fase 2, gerar **prints em 375×812** (e 768×1024) das telas críticas, de preferência por um script Playwright reutilizável na Fase 3 como teste de regressão (`scrollWidth <= innerWidth`). As telas são `/instrumentos`, `/atas`, `/atas/saldos-unidade`, `/atas/detalhe/:ataKey` (abas Ações e Plano), `/atas/detalhe/:ataKey/itens/:numeroItem?aba=contratos`, `/contratos`, `/contratos/:contractKey?aba=pagamentos`, `/pagamentos`, `/empenhos`, `/admin/departamentos`, `/admin/feriados` e `/atas/modelos`. Cada print deve ter duas versões: Sidebar no estado padrão e Sidebar recolhida. Os prints confirmam ou recalibram as severidades e servem de "antes" para comparar com os resultados da Fase 3.
