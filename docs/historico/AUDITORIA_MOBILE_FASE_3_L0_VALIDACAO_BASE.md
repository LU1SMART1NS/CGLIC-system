# Fase 3 — Lote L0: validação da base (375px)

Método: navegador embutido em 375x812, usuário logado, **`overflow-x: hidden` do body removido** (F2-05) para expor qualquer estouro real. Para cada rota, um detector percorreu o DOM atrás de elementos com `right` além do viewport que não estão dentro de um contêiner com rolagem própria (testado: detecta uma `div` de 600px injetada). Os controles contados como "inalcançáveis" são os que estão fora da tela e fora de qualquer rolagem.

## Resultado por rota

| Rota | Largura da página | Estouros | Controles inalcançáveis |
|---|---|---|---|
| `/instrumentos` | 375 | 0 | 0 |
| `/atas` | 375 | 0 | 0 |
| `/atas/saldos-unidade` | 375 | 0 | 0 |
| `/contratos` | 375 | 0 | 0 |
| `/pagamentos` | 375 | 0 | 0 |
| `/empenhos` | 375 | 0 | 0 |
| `/admin/departamentos`, `/usuarios`, `/perfis`, `/regras-alertas`, `/feriados` | 375 | 0 | 0 |
| `/atas/modelos`, `/contratos/modelos` | 375 | 0 | 0 |
| Contrato 360 (abas Ações, Plano, Pagamentos, Financeiro, Histórico) | 375 | 0 | 0 |
| Ata 360 (abas Ações, Plano, Itens, Contratos vinculados) | 375 | 0 | 0 |
| Item da Ata (Órgãos, Alocação, Contratos e empenhos, Adesões) | 375 | 0 | 0 |

Conclusão: sem o `overflow-x: hidden`, nenhuma das rotas testadas estoura a página. Os achados de shell, header, gutter e containers (shell-*, header-*, css-01/02, atas-01, atas-12, item-03, contratos-17, pagadm-01 e duplicatas) estão resolvidos.

## F2-05 aplicado

- `body { overflow-x: hidden }` removido.
- `.app-content { overflow-x: clip }` na coluna de conteúdo do `AppShell` como rede de segurança (não cria contêiner de rolagem; o header sticky continua colado ao topo).
- Regra daqui em diante: bloco largo tem o próprio `overflow-x: auto`.

## Largura útil (375px)

| Elemento | Antes | Agora |
|---|---|---|
| `main` | 95px (Sidebar aberta) ou 311px | 375px |
| Contêiner de página | ~311px menos paddings somados | 343px |
| Hero e painel de abas do 360 | 136px | 343px (conteúdo interno 311 / 319px) |

## O que sobra (backlog dos próximos lotes)

Estouro de **página** acabou; o que resta é de **conteúdo dentro de tabelas** que ainda rolam em janelas de ~341px, com as ações principais fora da tela:

| Rota | Tabela (visível / total) | Ações fora da tela |
|---|---|---|
| `/instrumentos` | 343/700 e 341/1229 | 10 de 10 |
| `/atas` | 341/1017 | 30 de 45 |
| `/contratos` | 341/1061 | 30 de 45 |
| `/pagamentos` | 341/1019 | 1 de 1 |
| `/empenhos` | 341/1059 | 11 de 11 |

Isso é o escopo do **L2** (carteiras) e do **L6** (`/pagamentos`, `/empenhos`): migrar para `DataTable` com cartões.

## Limitações

- Estado dos dados: perfil com acesso amplo e dados reais do ambiente de desenvolvimento; estados vazios e de erro não foram percorridos.
- Medição só em 375px; tablet (768px) não foi percorrido neste lote.
- Prints: as capturas desta sessão foram feitas durante as fases anteriores; este lote usou medição por DOM.
