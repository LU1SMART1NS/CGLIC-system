# Validação visual da auditoria mobile (Fase 1) — 375px

Método: navegador embutido emulando 375x812, usuário logado, medições via DOM (`getBoundingClientRect`, `scrollWidth`) e prints. Nada foi alterado no sistema; o modal de atesto foi aberto e cancelado sem salvar.

## Confirmado

| Achado do relatório | Medição / observação |
|---|---|
| Sidebar 280px deixa ~95px ao conteúdo | aside = 280px, main = 95px (expandida, estado inicial) |
| Recolhida ainda estoura a página | aside = 64px, main = 311px, mas `scrollWidth` da página = 396–444px (viewport 375px) |
| Header gov.br/CGLIC não quebra bem | links "Acesso à Informação" etc. cortados à direita em todas as rotas |
| Paginação corta "Próxima" | `/contratos`: botão "Próxima" com `right` = 511px, dentro de caixa `overflow:hidden` de 197px |
| Tabelas sem modo mobile | `/contratos`, `/atas`, `/instrumentos`, `/pagamentos`, `/empenhos`, `/admin/*`: janela visível de ~197px para tabela de ~1000–1900px; ação "Ver Detalhes" fica em x ≈ 995px |
| `/admin/departamentos`: coluna Ações cortada | botões Editar/Excluir em x 416–440 (fora dos 375px) |
| `/admin/feriados`: botão do cabeçalho cortado | "Nova data" com `right` = 444px |
| `/atas/modelos`: botões "Adicionar"/"Adicionar Macrotarefa" cortados | `right` = 420–432px |
| Pagamentos do Contrato 360: não dá para incluir documento | no modal "Registrar documentos recebidos" (365px) a linha de documento vai até x = 546px: Id. SEI, valor do documento e botão remover ficam fora do modal (limite 357px) |
| Alvos de toque pequenos | 57/61 controles < 44px em `/contratos`; 84/88 em `/instrumentos`; 67/68 em `/admin/regras-alertas` |
| Inputs < 16px (zoom no iOS) | 33 inputs em `/admin/regras-alertas`; 4 em `/contratos` e `/atas` |
| Fontes < 12px | 78 nós em `/contratos`, 64 em `/atas`, 44 em `/instrumentos` |

## Observações novas ou nuances

- **Ata 360**: as abas empilham verticalmente (usáveis, mas ocupam muito espaço), os rótulos "Prorrogação"/"Licitação" da linha do tempo se sobrepõem, e o texto dos cartões de item é cortado à direita.
- **Contrato 360**: coluna de texto muito estreita (palavras quebradas uma por linha). As 5 abas somam ~547px num contêiner de 215px.
- **Carregamento**: `/contratos` levou ~15s para exibir dados em dev; não é problema de layout, mas pesa mais no celular.
- Tela de **login** está boa em 375px.

## Não verificado

Rotas com perfis restritos, `/admin/usuarios`, `/admin/perfis`, `/atas/saldos-unidade`, `/atas/modelos`→edição, `/contratos/modelos`, página de Item e demais modais. As medições de `/admin/usuarios` e `/admin/perfis` foram interrompidas por tempo limite.

## Conclusão

Os achados críticos verificados se confirmaram; nenhum foi refutado. O diagnóstico de causas-raiz do relatório está validado, e a Fase 2 (base comum) pode começar pelo P0: Sidebar em gaveta e Header responsivo.
