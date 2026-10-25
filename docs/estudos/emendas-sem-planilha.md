# Emendas sem a planilha: o que veio fixo da carga e o que falta para o módulo andar sozinho

Auditoria de 23/10/2026. Só leitura no banco; nenhum código alterado.

## 1. De onde vem a nota "A conferir: Número em vermelho na planilha…"

A carga das planilhas da CAEP (migration 160) gravou, em cada linha do pedido, um texto comparando a planilha de saldo com a de execução (coluna `a_conferir`) e a referência da célula (`planilha_ref`). A tela mostra o texto como está (peça `AConferirDaLinha`), conta as linhas como aviso "a conferir" e oferece um filtro para elas. Nada disso é regra do sistema: é uma anotação do dia da carga, que nunca muda e que ninguém consegue resolver pela tela.

| Texto gravado (padrão) | Linhas |
|---|---|
| "Planilha de saldo indica N; a execução soma N" | 246 |
| "Número em preto na planilha de saldo, mas não está na planilha de execução: confirmar se já houve ofício" | 134 |
| "Número em vermelho na planilha de saldo, mas já está na planilha de execução" | 109 |
| Os dois textos juntos | 97 |
| **Total** | **586** (134 em reservas, 10 em ofícios, 442 em empenhados) |

A conta "saldo indica 17; a execução soma 25" compara totais da célula da planilha, enquanto a linha do sistema tem a quantidade de uma execução só (2, 1…). Para quem lê a tela, a frase não tem como ser conferida.

## 2. Tudo o que veio fixo da planilha

### 2.1 No banco

| O que | Onde | Quanto | O que fazer |
|---|---|---|---|
| Texto "a conferir" e referência da célula | `emenda_pedido_linhas.a_conferir`, `planilha_ref` | 586 textos; 2.570 referências | Apagar as duas colunas. O que era pendência real vira a revisão do pedido importado (entrega 1). |
| Observação da carga ("Carga das planilhas de saldo e de execução da CAEP (23/10/2026).") | `emenda_pedidos.observacao` | 144 pedidos | Apagar o texto. A origem já fica em `origem = 'PLANILHA'`. |
| Data da reserva = dia da carga | `emenda_pedidos.reservado_em` | 144 pedidos, uma única data (23/10/2026) | Em 22/11/2026 as 41 reservas importadas vão ganhar o aviso "30 dias sem ofício" de uma vez, sem ser verdade. A CAEP informa a data real na revisão; até lá o prazo não conta. |
| Datas das etapas | `minuta_em`, `oficio_em`, `conferido_em`, `autorizado_em`, `empenhado_em` | 0 preenchidas em 144 | A linha do tempo diz "sem data na planilha". A CAEP completa na revisão; o empenho pode vir da data de emissão da nota achada. |
| Número do ofício e contato da assessoria | `oficio_numero`, `contato_*` | 0 em 144 (processo SEI em 103) | A CAEP completa na revisão (o processo SEI já está). |
| Número do contrato da planilha | `emenda_pedido_linhas.contrato_numero` | 1.936 linhas | Hoje é a pista principal para achar a nota (regra CONTRATO: 1.377 notas). Depois que a nota é conhecida, o contrato certo é o da nota (`contrato_empenhos`). Fica como pista da carga; para pedidos novos não existe. |
| Documento SEI do empenho | `emenda_pedido_linhas.empenho_documento_sei` | 2.134 linhas | Só pista; some da tela quando a nota aparece. Fica. |
| Nome do beneficiário como veio | `emenda_pedido_linhas.beneficiario_nome` | 0 em uso (todos viraram cadastro) | Apagar a coluna. |
| Beneficiários criados pela carga | `emenda_beneficiarios.origem = 'PLANILHA'` | 556 de 556 | Cadastro legítimo, fica. Faltam: 30 sem CNPJ, 519 sem CEP de entrega, 556 sem responsável. |
| Nome curto e GND dos itens | `emenda_itens_dados` | 134 de 135 | Gravados pela RPC como cadastro da CAEP, ficam. Falta 1 item (monitor 00010/2025-200342-7). |
| UASG fixa dos contratos | `emendas_ligar_notas()` (CTE `ctr`, `uasg = '200331'`) | 1 constante | Procurar o contrato pelas duas UASGs da CGLIC, ou direto pela nota (entrega 2). |

### 2.2 No código das telas

| Onde | O que está fixo | Troca |
|---|---|---|
| `emendasPartes.tsx` | Peça `AConferirDaLinha` | Sai. |
| `emendasPedidos.ts` | Aviso `aConferir`; `UASG_DOS_CONTRATOS_DAS_EMENDAS = '200331'`; "Reserva da planilha"; motivo `SEM_CONTRATO` = "a planilha não traz o contrato" | Aviso vira `aRevisar` (pedido importado sem revisão); UASG sai com a entrega 2; "Reserva importada"; "sem contrato ligado à linha". |
| `EmendasPedidosPage.tsx` | Filtro "Linhas a conferir (planilhas da CAEP)"; "sem data na planilha"; dica da tela cita as planilhas | Filtro "Importados a revisar"; "data não informada"; dica sem planilha. |
| `EmendasInicioPage.tsx`, `emendasInicio.ts` | Tipo "A conferir"; prazo "conferir com as planilhas da CAEP" | "A revisar"; "completar o pedido importado". |
| Testes | `emendasPedidos.test.ts` (3 casos), `emendasInicio.test.ts` (1), `EmendasPedidosPage.test.tsx` (campos) | Ajustar junto. |

Kits: nenhum em produção; nada veio da planilha. Pedidos criados pelo sistema: só 2 (cancelados, de teste). Ou seja, tudo o que a CAEP vê hoje em Pedidos é importado.

## 3. O que o sistema já faz sozinho

| Função | Situação em 23/10/2026 |
|---|---|
| Autores (Câmara e Senado) | Lidos toda segunda (cron 06:40). |
| Saldo da CAEP e trava de reserva | Pela alocação do gestor de saldo (migration 157). |
| Prazo de indicação (60/35 dias) | Pelas regras de alertas (migration 162). |
| Nota de empenho da linha | 1.406 de 2.134 linhas empenhadas (66%), de hora em hora (cron :58): 1.377 pelo contrato, 22 pelo item, 7 pelo autor. |
| Execução (empenhado, liquidado, pago) | Copiada da nota achada. |
| Quadro para o gabinete | Com reajuste previsto (migration 165). |

Sem nota, 728 linhas:

| Motivo | Linhas | O que é de verdade |
|---|---|---|
| Contrato sem nota ligada no sistema | 424 (37 contratos) | Pendência da Vinculação (Empenhos ao contrato), não das Emendas. 834 notas têm emenda no plano interno e todas já estão ligadas a algum contrato: ou a nota ainda não chegou, ou está ligada a outro contrato. |
| Planilha não traz o contrato | 198 | Só a nota resolve: pelo Portal da Transparência (código da emenda) ou digitada pela CAEP. |
| Contrato fora do sistema | 71 | 00276/2026 sozinho tem 60 linhas; os outros são 1 a 4 linhas (00117/2016 é erro de digitação). Esperar a sincronização ou corrigir o número. |
| Só notas de outras emendas | 33 | A nota da emenda está em outro contrato: a regra do contrato da planilha atrapalha. Procurar pela nota, não pelo contrato. |
| Mais de uma nota possível | 2 | Escolha da CAEP. |

Das 72 emendas com número nos pedidos, 32 não aparecem no plano interno de nenhuma nota do sistema: não há como achar essas notas por dentro.

## 4. O que falta para funcionar sem a planilha

### Entrega 1 — Tirar o que veio fixo e revisar os pedidos importados

- Migration: apaga `a_conferir`, `planilha_ref` e `beneficiario_nome`; limpa a observação da carga; cria `emenda_pedidos.revisado_em` e `revisado_por_nome`.
- Nova ação "Revisar pedido importado" no detalhe do pedido (só origem PLANILHA sem revisão): data real da reserva (ou "não sei"), número do ofício, datas das etapas já cumpridas, contato da assessoria; confirma itens, quantidades e beneficiários de cada linha. Grava pela RPC `revisar_pedido_importado`.
- Aviso "A revisar" (144 pedidos) no lugar de "A conferir"; o prazo de 30 dias sem ofício só conta depois da revisão ou da data informada.
- Textos das telas sem "planilha" (tabela 2.2).

Resultado: nenhuma frase fixa; a pendência passa a ser uma ação com fim.

### Entrega 2 — Nota pela nota, contrato pela nota

- `emendas_ligar_notas()` ganha a regra NOTA: a nota digitada pela CAEP (`nota_empenho`) ou achada pelo Portal (entrega 3) vale antes das demais e o contrato da linha passa a ser o da nota em `contrato_empenhos`.
- Sem UASG fixa: o contrato citado é procurado nas duas UASGs da CGLIC.
- Motivos renomeados sem a palavra planilha.
- Data do empenho do pedido importado = data de emissão da nota achada, quando a CAEP não informou.

Resultado: pedidos novos (criados pelo sistema) fecham o ciclo sozinhos ao digitar a nota; os 33 "outras emendas" têm chance.

### Entrega 3 — Nota pelo Portal da Transparência

- Recurso `emendas_portal` deixa de ser medição: para cada pedido empenhado com número da emenda e linha sem nota, lê `/emendas/documentos/{codigo}`, fica com as NEs das UGs 200330 e 200331 e casa com `empenhos`. Uma consulta a cada 0,7 s, só as emendas pendentes (hoje 32 emendas sem nota no plano interno).
- Motivo novo `PORTAL_SEM_NE` quando o Portal não traz nota da SENASP.
- Risco medido em 23/10/2026: nas 8 emendas lidas, as NEs eram de outras UGs do MJSP. Primeiro passo é medir com as 32 pendentes; se nenhuma vier, a entrega vira "a CAEP digita a nota" (a janela já existe).

### Entrega 4 — Pendências que não são das Emendas, mostradas no lugar certo

- Início do gestor de emendas: "N contratos das emendas sem nota ligada" (37) com link para a fila da Vinculação, e "N contratos citados que não estão no sistema" (8).
- Cadastro de beneficiários: fila "Cadastro incompleto" (30 sem CNPJ, 519 sem CEP, 556 sem responsável) na tela de Beneficiários, com o que falta em cada um.

### Fora do alcance do módulo

- Conferência com o SIOP: o SIOP exige login; o Portal só lista emendas já empenhadas. Continua digitada pela CAEP.
- Entrega ao beneficiário: nenhuma entrega prevista nos contratos das emendas (0). Fica para o módulo de Fiscalização e para o gestor do contrato.

## 5. Ordem e custo

| Entrega | Banco | Servidor | Telas | Depende de |
|---|---|---|---|---|
| 1 | migration (apaga colunas, campos de revisão, RPC) | não | janela de revisão, avisos, textos | aprovação do desenho da janela |
| 2 | migration (função `emendas_ligar_notas`) | não | rótulos | 1 |
| 3 | migration (motivo novo) | função `sincronizar-fontes` e chave do Portal | nada novo | medição com as 32 emendas |
| 4 | não | não | Início e Beneficiários | 1 |
