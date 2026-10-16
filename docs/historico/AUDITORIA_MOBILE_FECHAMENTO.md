# Auditoria mobile — fechamento (Fases 1 a 3)

Validação final em 375x812, navegador embutido, usuário logado, dados reais de desenvolvimento. Critérios do relatório (seção 5): sem rolagem horizontal da página, ação principal alcançável sem rolagem lateral, alvos de toque ≥ 44px, inputs ≥ 16px. Medidos também: controles inalcançáveis (fora da tela e fora de qualquer rolagem) e texto < 12px.

## Resultado por rota

| Rota / estado | Largura | Inalcançáveis | Em rolagem, fora da tela | Alvos < 44px | Inputs < 16px | Texto < 12px |
|---|---|---|---|---|---|---|
| `/instrumentos` | 375 | 0 | 0 | 0 | 0 | 0 |
| `/atas` | 375 | 0 | 0 | 0/56 | 0 | 0 |
| `/atas/saldos-unidade` | 375 | 0 | 0 | 0/9 | 0 | 0 |
| `/contratos` | 375 | 0 | 0 | 0/56 | 0 | 0 |
| `/pagamentos`, `/empenhos` | 375 | 0 | 0 | 0 | 0 | 0 |
| `/admin/*` (5 telas) | 375 | 0 | 0 | 0 | 0 | 0 |
| `/atas/modelos`, `/contratos/modelos` | 375 | 0 | 0 | 0 | 0 | 0 |
| Ata 360 (Ações, Plano, Itens, Contratos) | 375 | 0 | 0 | 0 | 0 | 0 |
| Contrato 360 (Ações, Plano, Pagamentos, Financeiro, Histórico) | 375 | 0 | 0 | 0 | 0 | 0 |
| Item (Órgãos, Alocação, Contratos e empenhos, Adesões) | 375 | 0 | 0 | 0 | 0 | 0 |

"Em rolagem, fora da tela" exclui as barras de abas, que rolam de propósito.

## Antes (Fase 1, estático) e depois

- 41 telas/estados avaliados: 15 quebravam, 15 ruins, 10 aceitáveis, 1 boa.
- Hoje, nas rotas acima, nenhuma ação principal fica fora do alcance em 375px.

## Limitações conhecidas

- Dados de desenvolvimento sem plano de gestão aplicado, sem ciclos de pagamento em volume, sem linha do tempo extensa: seletor de status do plano, confirmações inline e cartões da linha do tempo foram revisados por código e testes, não visualmente.
- Aba Financeiro do contrato 200331-00033-2024 não carregou (APIs externas de empenhos com erro 500/404): validada por testes do `DataTable`.
- Fluxos que gravam dados (vincular contrato, registrar ciclo, atribuir gestor) foram abertos e medidos, mas não submetidos.
- Tablet (768px) e 320px não foram percorridos nesta validação.
- Sem teste automatizado de layout (a suíte roda sem DOM); as verificações visuais foram manuais.
- Hero compacto (metadados em `<details>`) não foi feito.
