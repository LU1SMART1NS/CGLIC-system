# Módulo de Fiscalização — plano de desenvolvimento

Estudo de 10/11/2026. Fontes: fluxo operacional do Setor de Fiscalização de Contratos (SFC/CGLIC), em dois fluxogramas (padrão e produtos controlados), e a planilha de controle da equipe de 05/11/2026. Nada foi gravado no banco.

## 1. O que a planilha mostra

| Medida | Valor |
|---|---|
| Linhas (contrato × item × destinatário) | 3.716 |
| Contratos | 420 (2023: 9 · 2024: 17 · 2025: 164 · 2026: 230) |
| Itens distintos / destinatários distintos | 276 / 958 |
| Valor contratado | R$ 1,005 bi |
| Fiscais | 7, **um por contrato** (nenhum contrato tem dois) |
| Contratos com vários destinatários | 207 |
| Contratos com vários itens | 101 |
| Contratos com data prevista de entrega diferente entre linhas | 211 |
| Contratos com data real de entrega diferente entre linhas | 58 |
| Contratos com status diferente entre linhas | 20 |
| Linhas de programa (BNDES, Fogo Zero etc.), não emenda | ~90 linhas, 12 contratos |

Conclusões:
- **A unidade de trabalho é a linha contrato × item × destinatário**, a mesma do pedido de emenda (`emenda_pedido_linhas`: item × beneficiário × quantidade). Os prazos e as entregas variam por linha em metade dos contratos.
- **O fiscal é do contrato** (portaria), não da linha.
- **O status quase sempre anda em bloco** (só 20 contratos misturam). A tela precisa mudar muitas linhas de uma vez sem perder o detalhe por linha.
- As colunas calculadas da planilha estão quebradas: "Status_Execucao" tem 418 "Invalid Date" e grafias diferentes ("entregue", "Enm andamento"); "Local de Entrega" está vazio em 90% das linhas; a busca do destinatário termina em `#REF!`. No sistema o farol e o semáforo saem de datas e não são digitados.

Status usados pela equipe (lista da aba Listas, com a contagem de linhas):

| Status | Linhas |
|---|---|
| Ord. Fornecimento Enviada | 1.225 (+4 grafia diferente) |
| Envio para pagamento/doação | 673 |
| Em Produção/Adaptação | 464 |
| Ordem de Fornecimento em produção | 432 |
| Of. SAL/Finalizado | 323 |
| Finalizado | 265 |
| Em Trânsito para local de entrega | 44 |
| Aguardando info. ComprasSusp | 35 |
| Entregue/Retirado | 33 |
| TRD e Relatório Contratual em andamento | 28 |
| Deferimento LCI/Solic. LE | 24 |
| TRP em elaboração | 22 |
| Processo em Autuação · Empenhado, em Contratação | 12 · 12 |
| Aguardando Emplacamento / Retirada (3 grafias) | 27 |
| Aguardando Autorização do EB/IGPM/DFPC · EB/LI | 4 · 3 |
| Em Separação/Faturado/Aguardando transporte | 4 |
| Aguardando Planej. Estratégico | 1 |
| Sem status | 81 |

## 2. O que o sistema já tem

Cruzamento feito em 10/11/2026 (só leitura):
- **393 dos 420 contratos da planilha já estão em `contratos_oficiais`** (todos os de 2023–2025 e 203 dos 230 de 2026). Os 27 que faltam são de 2026 e precisam ser conferidos (contrato novo ainda não sincronizado ou número digitado diferente).
- **136 contratos de 2026 já estão ligados a pedidos de emenda** (`emenda_linha_notas.contract_key`), com 2.008 linhas no sistema contra 1.653 na planilha. Das emendas citadas na planilha nesses contratos, 230 de 363 batem com a emenda do pedido.
- Antes de 2026 não há pedido de emenda no sistema: essas linhas só existem na planilha.
- A **Informação da ComprasSUSP e a Ordem de Fornecimento já são registradas** por pedido × contrato (`emenda_pedido_ordens`, migration 250, 242 Ordens carregadas do SEI). É o passo 3–4 do fluxo da SFC.
- Faturas, liquidação e pagamento já vêm das fontes e já aparecem por linha do pedido (`emenda_linha_notas.faturado_em`, `liquidado_em`, `pago_em`).
- O Pedido 360 › Andamento já tem o quadro "Onde está cada item" por beneficiário, com o trilho Nota · Na CCGA · Contrato · Faturado · Liquidado · Pago.

Ou seja: a Fiscalização preenche o buraco **entre "Contrato" e "Faturado"** (produção, entrega, recebimento) e o que vem **depois de "Pago"** (doação e encerramento).

## 3. Modelo proposto

### 3.1 Perfil
- Novo papel `gestor_fiscalizacao` em `public.roles`, com `fiscalizacao.view` e `fiscalizacao.manage`, no padrão do `gestor_emendas`.
- O fiscal vê "Meus contratos" (contratos em que é fiscal) e a fila de tudo que está com ele. O chefe do SFC distribui contratos entre os fiscais (proposta: o coordenador faz, como na Central de Distribuição; ou um sub-papel "chefe da fiscalização" — decisão D3).
- Consulta (leitor) lê tudo da fiscalização, sem filas.
- Gestor de emendas lê a situação das entregas; grava só a etapa "Informações enviadas" (D8).

### 3.2 Dois níveis

**Contrato** (`fisc_contratos`, uma linha por `contract_key`):
- fiscal, portaria de designação (SEI)
- processo de acompanhamento/fiscalização (SEI) e data da autuação
- análise inicial feita (data)
- termo de encerramento (data + SEI)
- marca "produto controlado" (abre os passos do fluxo 2)

**Entrega** (`fisc_entregas`, contrato × item × destinatário × quantidade):
- `emenda_linha_id` quando vem de pedido de emenda (nula para programa ou contrato antigo)
- origem: `EMENDA`, `PROGRAMA` (BNDES, Fogo Zero…), `CARGA` (planilha)
- beneficiário (`emenda_beneficiarios`), local de entrega (cidade/UF)
- data prevista e data real da entrega
- etapa atual (lista fixa, item 3.3) e histórico de movimentos com quem, quando e SEI quando há documento
- uma linha de emenda pode ter **várias entregas** (entrega parcial); a soma das quantidades não passa a da linha

### 3.3 Etapas da entrega

Proposta de juntar os 18 status da planilha em fases, no mesmo estilo das etapas das emendas (fase · etapa, SEI só onde há documento):

| Fase | Etapa | Status da planilha | Documento |
|---|---|---|---|
| Preparação | Processo autuado | Processo em Autuação; Empenhado, em Contratação | processo SEI (no contrato) |
| | Informações pedidas à ComprasSUSP | Aguardando info. ComprasSusp; Aguardando Planej. Estratégico | — |
| | Informações recebidas | — | Informação da ComprasSUSP (já existe) |
| | Ordem de Fornecimento emitida | Ordem de Fornecimento em produção → Enviada | Ordem (já existe) |
| Execução | Em produção/adaptação | Em Produção/Adaptação | — |
| | Autorização de produto controlado (só controlados) | Aguardando Autorização EB/DFPC, EB/LI; Deferimento LCI/Solic. LE | — |
| | Pronto / em trânsito | Em Separação/Faturado/Aguardando transporte; Em Trânsito | — |
| | Aguardando emplacamento/retirada | Aguardando Emplacamento / Retirada | — |
| Recebimento | Entregue | Entregue/Retirado | data real |
| | Recebimento provisório (TRP) | TRP em elaboração | TRP (SEI) |
| | Recebimento definitivo (TRD) e relatório | TRD e Relatório Contratual em andamento | TRD (SEI) |
| Pagamento e doação | Enviado para pagamento e doação | Envio para pagamento/doação | despacho + Nota Técnica à COLOG (SEI) |
| | Faturado · Liquidado · Pago | — (vem das fontes, automático) | — |
| | Ofício à SAL (Secretaria Nacional de Assuntos Legislativos) | Of. SAL/Finalizado | ofício (SEI) |
| Encerrado | Finalizado | Finalizado | termo de encerramento (no contrato) |

A doação (termo, DOU, baixa contábil) é da COLOG (D5): a Fiscalização termina no envio à COLOG e não acompanha os passos de lá.

Regras que vêm do fluxo:
- **Doação só depois de entregue, recebido e pago** (observação do fluxo): o sistema não deixa a entrega passar a "Nota Técnica e envio à COLOG" sem TRD e sem pagamento.
- **Contrato só encerra** quando todas as entregas estão Finalizadas (ou canceladas com motivo).
- Prazo de execução: farol da entrega = data prevista × hoje (no prazo / vence em 30 dias / vencido / entregue com atraso). Vigência do contrato vem de `contratos_oficiais`.
- **Impasse do DFPC**: o Exército pede o Termo de Doação para autorizar, e a doação só sai depois da entrega. Proposta: etapa "Autorização de produto controlado" com o motivo "Aguarda termo de doação (exigência do DFPC)", que conta à parte nos painéis, para dar números ao pedido de revisão da exigência.

### 3.4 O que o módulo de Emendas passa a ver

- O trilho "Onde está cada item" do Pedido 360 ganha os passos da fiscalização entre Contrato e Faturado: **Ordem · Em produção · Entregue · Recebido (TRD)** e, depois de Pago, **À COLOG · Ofício à SAL**.
- Linha com entrega parcial: "Entregue 3 de 10".
- Na lista de Pedidos, o filtro "+ Etapa" da Contratação/Execução ganha as etapas da fiscalização; o painel do Início mostra "entregas vencidas" dos pedidos.
- A leitura é pelo `emenda_linha_id` da entrega: o pedido não guarda cópia da etapa (evita duas verdades).
- O parlamentar: o status mostrado ao parlamentar (relatório ou exportação) usa as fases (Contratado · Em produção · Entregue · Recebido · Finalizado), sem as etapas internas.

### 3.5 Telas (mesma trilha dos outros perfis)

Correção do usuário (10/11/2026): o Início do fiscal fica no **Início** do sistema, e a Distribuição é segundo nível do Início para o coordenador. É o mesmo arranjo de hoje: Início em grupos (Atas e Contratos: Painel · Distribuição; Emendas) e, para cada gestor, o Painel do seu trabalho.

| Lugar | Coordenador | Gestor de fiscalização | Consulta |
|---|---|---|---|
| Início | grupos Atas e Contratos · Emendas · **Fiscalização** (Painel · Distribuição) | só o **Painel** dele, sem abas (como o gestor de emendas) | grupos, Fiscalização só com Painel |
| Menu Fiscalização (trabalho) | Entregas · Programas | Entregas · Programas | Entregas · Programas (só leitura) |
| Carteira › Contratos | já tem | entra, para abrir o Contrato 360 | já tem |
| Contrato 360 | aba **Fiscalização** nova, ao lado de Ações, Itens, Empenhos e Pagamentos | idem | idem, só leitura |
| Pedido 360 (Emendas) | régua por item com os passos da Fiscalização | — | idem |

1. **Início › Fiscalização › Painel**: cartões (vencidas, a vencer, aguardando o Exército, para encerrar), Com você e Com outros. O do coordenador soma todos os fiscais e traz "Distribuir contratos sem fiscal".
2. **Início › Fiscalização › Distribuição** (coordenador): contratos sem fiscal, fiscal, carga por fiscal, transferir e transferir temporariamente.
3. **Fiscalização › Entregas**: trilho de fases, filtros Fiscal · Origem · Prazo · UF, linha abre o Contrato 360 (rota `/contratos/...`).
4. **Fiscalização › Programas**: um programa por vez no trilho, comprado × entregue por item.
5. **Contrato 360 › Fiscalização**: entregas do contrato, mudar etapa em lote, dividir entrega, encerrar.
6. Exportação para o Power BI e calendário de vencimentos.

## 4. Carga inicial pela planilha

- Contrato: número/ano → `contract_key` (393 de 420 achados; nenhum número repetido entre as UASGs).
- Fiscal: um por contrato, pelo nome da planilha → usuário do sistema (os 7 fiscais precisam ter conta com o novo perfil antes da carga).
- Entrega: contrato + item + destinatário. Para os 136 contratos com pedido, casar com a linha do pedido pelo item e beneficiário (nome do destinatário × `emenda_beneficiarios`; 958 nomes escritos à mão, então a carga gera uma lista "a conferir" em vez de adivinhar). Para 2023–2025 e programas, entrega sem pedido (origem CARGA).
- Status → etapa pela tabela 3.3; linhas sem status (81) ficam "a conferir".
- Datas: só as válidas (há datas 1900 e "Invalid Date"), o resto em branco.
- Arquivo de carga fica no scratchpad (a planilha tem nomes e e-mails; o repositório é público).

## 5. Entregas (ordem sugerida)

1. **Perfil e base**: papel `gestor_fiscalizacao`, permissões, menu e rotas vazias; `fisc_contratos` com fiscal e processo; distribuição de contratos.
2. **Entregas e etapas**: `fisc_entregas`, movimentos, RPCs de mudar etapa (uma e em lote), Contrato 360 › Fiscalização.
3. **Carga da planilha** (com a lista "a conferir") e Carteira da Fiscalização.
4. **Emendas enxergam a fiscalização**: trilho do Pedido 360, filtros, painel.
5. **Início da Fiscalização**, farol de prazos e avisos (vencidas, impasse DFPC, pronto para encerrar).
6. **Recebimento, pagamento e doação**: TRP/TRD com SEI, ligação com as faturas, Nota Técnica/COLOG, termo de encerramento.
7. Exportação BI e calendário.

Cada entrega segue o fluxo de sempre: protótipo aprovado → migration testada no PGlite e ensaiada → PR → autorização → aplicar.

## 6. Decisões do usuário (10/11/2026)

- **D1** — Sim, a linha do pedido pode ter entregas parciais.
- **D2** — Sim, etapas da tabela 3.3. "Of. SAL" = Ofício à Secretaria Nacional de Assuntos Legislativos (SAL).
- **D3** — O coordenador distribui os contratos aos fiscais.
- **D4** — Agrupar contratos e entregas por programa (ex.: Projeto Pegasus: itens comprados e entregues). Na planilha o Pegasus aparece escrito de 3 formas ("PEGASUS", "Projeto PEGASUS", "Projeto PEGASUS - PCRS") em 14 contratos e 24 linhas; BNDES/Fogo Zero em 12 contratos. Proposta: cadastro `fisc_programas`, programa na entrega (marcado em lote pelo contrato) e tela Programa com itens comprados × entregues por UF.
- **D5** — Doação é da COLOG.
- **D6** — Sem resposta; mantida a proposta (o fiscal registra o TRP com data e SEI).
- **D7** — Local de entrega = endereço de entrega do cadastro do beneficiário (`emenda_beneficiarios.entrega_*`). A entrega não guarda endereço. Destinatários da planilha fora do cadastro (2023–2025, programas) precisam ser cadastrados ou casados na carga.
- **D8** — Gestor de emendas só lê. A única etapa dele é **Informações enviadas** (a CAEP ou outro setor manda à SFC as informações do processo de fiscalização; hoje é a Informação da ComprasSUSP em `emenda_pedido_ordens`). Para programa, o setor responsável pelo programa faz essa etapa.

Protótipo aprovado em 10/11/2026 (versão 6). Entrega 1 (perfil, fiscalização do contrato, Distribuição e Painel): migration 259. Entrega 2 (entregas e etapas): migration 260 — as entregas de emenda nascem das linhas do pedido quando o contrato fica com a SFC/CGLIC (e de hora em hora, às :04); a Ordem registrada pela SFC/CGLIC grava também no pedido de emenda.

## 7. Perguntas da rodada (respostas de 10/11/2026)

- **P1** — Ofício à SAL só para entregas de emenda: **sim**.
- **P2** — Programa por entrega, marcado em lote pelo contrato: aprovado com o protótipo (depois virou etiqueta no item, seção 8).
- **P4** — Farol pela data prevista da entrega; sem ela, pelo prazo de execução do contrato: aprovado com o protótipo.
- **D6** — O fiscal registra o TRP (data e SEI); sem acesso do beneficiário: aprovado com o protótipo.
- **P3** — Quem registra "Informações enviadas" para programa: **em aberto** (entra na entrega das informações).

## 8. Quem fiscaliza e programas (decisões de 10/11/2026)

**Nome:** nas telas, "SFC/CGLIC".

**Quem fiscaliza.** A SFC/CGLIC fiscaliza os contratos de emenda e, em caráter extraordinário, outros que o coordenador indicar. Os demais ficam com a área requisitante. A fiscalização pode ser **mista**: parte das entregas com a SFC/CGLIC e parte com a área requisitante, ou um dos lados com tudo.
- O contrato guarda a decisão do coordenador (`fisc_contratos.fiscalizacao` = SFC · MISTA · AREA, migration 259); sem linha, contrato de emenda é "a definir" e sem emenda é área requisitante. Na fiscalização mista, cada entrega diz de quem é (`fisc_entregas.responsavel`, entrega 2).
- Contrato de emenda chega "A definir" com sugestão SFC/CGLIC; contrato sem emenda chega com sugestão área requisitante. O coordenador decide em Início › Fiscalização › Distribuição (trilho A definir · SFC/CGLIC · Mista · Área requisitante · Todos). Contrato sem emenda com SFC/CGLIC pede motivo.
- Para passar só parte de uma entrega, ela é dividida antes (mesma janela da entrega parcial). A entrega da área requisitante continua no contrato, sem etapa, para a conta do contrato e dos programas fechar.

**Programa = etiqueta no item do contrato, com quantidade.** Um item pode ter só parte no programa (ex.: 00256/2026, 4 camionetas, 2 do Projeto Pegasus).
- `fisc_programas` (cadastro) e `fisc_item_programas` (contrato × item × programa × quantidade; soma ≤ contratado). Cada entrega do item aponta para a parcela do programa (`fisc_entregas.programa_id`), escolhida na janela Montar entregas; o que sobra fica sem programa.
- Contrato 360 › Fiscalização: bloco "Itens e programas" com "Marcar programa" e a coluna Programa nas entregas.
- Fiscalização › Programas: um programa por vez no trilho e o alternador Por item · Por contrato · Por UF, com no programa × entregue. Conta todas as entregas do programa: as da SFC/CGLIC pela etapa e as da área requisitante como **sem acompanhamento** (P5).

**P5 decidida (10/11/2026): sem acompanhamento.** A área requisitante não informa nada no sistema. Nos programas, as unidades dela aparecem como "Com a área requisitante · sem acompanhamento": contam no total do programa, mas não em Entregue, Em andamento nem Sem início, e o percentual de entregue é sobre o que a SFC/CGLIC acompanha.

## 9. Telas em abas, vocabulário e item da ata (decisões de 11/11/2026)

Protótipo: https://claude.ai/artifact/HEJqKuqmZckYKnHowS6tzX (versão 4; feito com as peças do sistema e dados de exemplo). Aprovação em andamento, tela por tela.

**Vocabulário.** A linha contrato × item × beneficiário se chama **item** nas telas ("3 itens com prazo vencido", "Nenhum item ainda"). **Entrega** e **Entregue** são só o status do item. "Destinação" foi tentada e recusada: confunde com beneficiário. Os nomes no banco (`fisc_entregas`) não mudam.

**Menu Fiscalização.** Programas · Contratos · Beneficiários · Itens, nessa ordem; o menu abre em **Contratos** (o trabalho do fiscal). A antiga aba Entregas virou a aba Itens, sem alternador.
- **Contratos:** trilho por fase (a do item mais atrasado), fiscal, entregue × total, próximo prazo, processo. O fiscal abre filtrado nos contratos dele.
- **Beneficiários:** um órgão por linha com tudo somado; trilho A entregar · Tudo entregue · Todos; o beneficiário da planilha aparece com a etiqueta "Sem cadastro".
- **Itens:** a lista de sempre, um item de um contrato para um beneficiário por linha.
- **Programas:** um programa por linha.

**Telas 360 (Beneficiário 360 aprovado; Programa 360 no mesmo desenho).** Sem abas: uma lista só, **Itens por contrato**, no padrão dos "Itens por ata" do Pedido 360 (bloco por contrato que abre e fecha: Contrato nº com link · fornecedor · fiscal | N itens · un · entregues | etiquetas "N com prazo vencido" e "aguardando o Exército"; tabela Item · Beneficiário (só no Programa) · Qtd. · Situação). Trilho A entregar · Entregues · Todos. No Programa, Beneficiário e UF são filtros; no Beneficiário não há filtro de UF (um órgão, uma UF). Indicadores: Entregue % · A entregar · Prazo vencido · Contratos. O Beneficiário 360 mostra o endereço de entrega do cadastro e as emendas e programas que destinaram itens.

**Situação numa coluna só.** A etapa e uma linha: entregue em X (com os dias de atraso e o pagamento); a entregar, o prazo e a data prevista; sem data prevista, desde quando está na etapa. Antes, "Entregue desde 20/10" (data do registro) e "entregue em 02/10" (data do fato) apareciam juntas e pareciam contradizer-se. Na etapa Entregue, a data da etapa é a data da entrega informada.

**Programas: cadastro e itens.** O cadastro fica em **Ajustes › Gestão › Programas**, a primeira aba de Gestão, antes de Modelos de Gestão (Novo programa: nome, setor responsável, observação; Editar; programa com itens só se desativa). Os itens entram pela tela do programa, no botão **Incluir itens no programa**: escolhe o contrato, diz quantas unidades de cada item são do programa (até o contratado menos o que está em outro programa) e vê o que já está no programa, com Retirar. Grava em `fisc_item_programas`. A marcação sai do Contrato 360, onde o programa só aparece como informação.

**Contrato 360 › Fiscalização como mesa de trabalho** (o desenho da aba Andamento do Pedido 360):
- faixa com Fiscalização · Fiscal · Portaria · Processo · Origem e o menu ⋯ (Alterar quem fiscaliza, Corrigir o processo);
- **Com você:** o próximo passo juntando os itens que estão no mesmo ponto, com um botão que age em todos (Registrar o processo, Cobrar o fornecedor, Emitir a Ordem, Informar a data prevista, Receber provisoriamente, Receber em definitivo, Enviar para pagamento e doação, Enviar o Ofício à SAL, Finalizar);
- **Com outros:** CAEP (informações), Exército/DFPC (controlados), Fornecedor (entregar, com a data), Financeiro (pagar), Área requisitante;
- **Onde está cada item:** por beneficiário, com a régua Informações › Ordem › Produção › Entregue › Recebido › Pagamento › Ofício à SAL;
- saem as caixinhas de marcar; o histórico do contrato fica na aba Histórico. "Dividir entrega" vira **Entrega parcial** ("Quantas unidades foram entregues?").

**Janela do item.** O item não ganha tela 360 (Item 360 já é o item da ata, e a linha do contrato não tem abas próprias). Em qualquer lista (Programa 360, Beneficiário 360, aba Itens, Contrato 360 e Item 360) o clique abre a mesma janela: régua e prazo, contrato ("Abrir o contrato"), item da ata ("Abrir o item da ata", quando ligado), origem, fiscal, endereço de entrega, histórico com SEI e as ações (Entrega parcial, Data prevista, Quem fiscaliza, Mudar etapa).

**Item 360 › Emendas.** Sem aba nova: na aba Emendas, cada beneficiário de cada pedido mostra o passo da fiscalização ("70× GCM Taboão · Aguardando o Exército · passo 3 de 7 · contrato 00055/2026"); o clique abre a janela do item.

**Ligar os itens da planilha ao item da ata** (incluído no plano em 11/11/2026). Os 2.046 itens de emenda já têm `item_key`. Os 1.959 da carga têm o contrato, mas não o item. Medição no banco (11/11/2026), pelos itens da ata ligados a cada contrato (`arp_item_contract_links`):

| Itens da carga | Quantos | Como ligar |
|---|---|---|
| Contrato com um só item ligado à ata | 662 itens · 153 contratos | automático |
| Contrato com vários itens | 1.184 itens · 53 contratos (214 nomes contrato × texto) | pelo nome; o que não casar vai para a lista "a conferir" |
| Contrato sem item ligado à ata | 113 itens · 19 contratos | não liga até o contrato ser ligado à ata |

Migration (número livre na hora): grava `fisc_entregas.item_key` nos itens da carga casados, com movimento no histórico; nada é adivinhado (sem casamento único, fica a conferir). Fila "Itens a conferir" para o coordenador ou o fiscal escolherem o item do contrato. Depois disso, o Item 360 mostra também esses itens e a aba Itens deixa de separar o mesmo produto em várias grafias.

**Ordem das próximas entregas de tela:** (a) vocabulário "item" e abas do menu; (b) Contrato 360 › Fiscalização como mesa e janela do item; (c) Programa 360 e Beneficiário 360; (d) Item 360 › Emendas; (e) ligação dos itens da carga ao item da ata (migration + fila a conferir). Programas dependem do cadastro `fisc_programas`/`fisc_item_programas` (seção 8).

**Aba Contratos (11/11/2026, com especialista em telas e em fiscalização de contratos).** "Próximo passo" e "Próximo prazo" em colunas separadas confundiam: os dois respondem "o que falta e com que urgência". Viram uma coluna, **Situação**: o próximo passo do contrato (o mesmo do "Com você" da mesa; sem nada com o fiscal, "Com outros" com bolinha vazada), com o prazo desse passo numa etiqueta (vencido há N dias / vence em N dias) e "+N passos". Colunas: Contrato (com "vigência acaba em N dias · item a entregar" só quando faltam até 90 dias) · Situação · Entrega (em itens: "6 de 9 itens", com a barra e as unidades embaixo; o título da coluna já diz que é entrega) · Fiscal (texto simples, sempre visível, como a coluna Gestor da Carteira). Trilho por quem está com o contrato: **Com você** (o fiscal abre aqui) · Com outros · Todos (o coordenador abre aqui) · Finalizados; a fase vira filtro. Filtros: Fiscal · Prazo (Vencido / Vence em 15 dias / Em dia) · Fase · Programa. Ordem: vencidos mais antigos primeiro. A lista não tem botões (ficam no Contrato 360) nem detalhe por item ou beneficiário.

**O que falta registrar para fiscalizar bem (proposta do especialista, por prioridade; a decidir).**
1. Data em que o fornecedor recebeu a Ordem de Fornecimento e o prazo de entrega em dias: é a base do atraso e de eventual multa.
2. Ocorrências (cobrança, notificação, pedido de prorrogação, defeito, recusa), com data, SEI e texto curto, gravadas pelo próprio botão do passo ("Cobrar o fornecedor" grava a ocorrência).
3. Prorrogação do prazo de entrega: pedido, decisão, nova data e SEI, sem apagar a data antiga.
4. Prazos de recebimento provisório e definitivo do contrato (dias), para os alertas "entregue sem TRP" e "TRP sem TRD".
5. Nota fiscal: número, chegada e envio para pagamento (faturado e pago continuam vindo do Tesouro).
6. Garantia contratual e garantia do produto; 7. Sanções e aditivos (só número, SEI e data).
Alertas sugeridos: item atrasado sem cobrança registrada; vigência acabando com item a entregar; entregue sem TRP no prazo; TRP sem TRD; TRD sem envio para pagamento; pago sem Ofício à SAL; parado no Exército ou à espera da CAEP há mais de N dias; substituto sem portaria. Os "N dias" ficam para a CGLIC definir conforme os contratos e o TR; as normas citadas (Lei 14.133, arts. 111, 140 e 141) devem ser conferidas no texto.

**Aba Itens (11/11/2026), alinhada à aba Contratos.** Trilho por quem está com o item: Com você (o fiscal abre aqui) · Com outros · Todos (o coordenador abre aqui) · Finalizados, pela mesma regra da mesa do contrato (comQuemEstaOItem). A fase vira filtro. Filtros: Fiscal · Prazo (Vencido / Vence em 15 dias / Em dia ou sem prazo / Entregue) · Fase · Programa · UF · Quem fiscaliza. Colunas (correção de 11/11/2026: a primeira coluna é o que a linha representa): Item (nº · Ata, nome e, embaixo, a emenda ou o programa) · Contrato · Beneficiário · Qtd. · Situação (etapa e prazo). A coluna Origem saiu: foi para baixo do nome do item, como nos Itens por contrato. A linha abre a janela do item.

**Coluna Item igual aos "Itens por ata" do Pedido 360 (11/11/2026).** Em cima, o número do item em azul e "· Ata 00031/2025"; embaixo, o nome (nome curto da CAEP; sem ele, a descrição da ata), com a descrição inteira ao passar o mouse. A ata e o número saem da chave do item da ata (`ata-UASG-item`), sem dado novo. Item da planilha ainda sem ligação mostra "da planilha · sem item da ata" e o nome escrito na planilha. Na aba Itens a ata sai da célula do contrato para não aparecer duas vezes na linha.

**Beneficiário em todas as telas da Fiscalização (11/11/2026).** Como no Pedido 360 (NomeComSigla): nome por extenso em negrito com "· SIGLA" em cinza, até duas linhas, CNPJ e razão social ao passar o mouse; embaixo, a cidade/UF de entrega. Sem cadastro: o nome da planilha e a etiqueta "Sem cadastro". Vale nas abas Beneficiários e Itens, nos Itens por contrato, na mesa do contrato e na janela do item.

**Aba Beneficiários alinhada à aba Contratos.** Colunas: Beneficiário · Itens · Contratos · Entrega ("0 de 3 itens", barra, unidades) · Situação (etiqueta: "3 itens com prazo vencido" com "2 no Exército", "vence em 9 dias", "Tudo entregue"; sem etiqueta, "no prazo" ou "sem data prevista"). Trilho A entregar · Tudo entregue · Todos; filtros UF · Prazo · Programa · Cadastro.

**Aba Programas alinhada (11/11/2026).** Colunas Programa · Itens · Entrega (em itens) · Situação (etiqueta), como Beneficiários e Contratos.

**Mesa do Contrato 360, ajustes (11/11/2026).** Em "Onde está cada item": beneficiários com pendência primeiro (os com prazo vencido no topo) e os concluídos por último e fechados; acima de 5 beneficiários, "Com pendência · Todos" e "E mais N beneficiários sem pendência", como no Andamento do Pedido 360; quando todos os itens do beneficiário são da mesma emenda, a emenda vai para o título do grupo e sai das linhas.

**"Onde está cada item" no padrão dos "Itens por ata" (11/11/2026, pedido do usuário).** Na mesa do Contrato 360, um bloco por beneficiário que abre e fecha (nome · SIGLA · cidade/UF · emenda | N itens · un · entregues | etiquetas "N com prazo vencido", "aguardando o Exército", "concluído"), com a tabela Item (nº · Ata, nome) · Qtd. · Situação; Abrir todos · Recolher todos. A régua longa fica só na janela do item. Assim Programa 360, Beneficiário 360 e Contrato 360 usam a mesma peça, mudando só o agrupamento (por contrato ou por beneficiário).

**Janela do item (11/11/2026).** Título "70× nome do item" e "para nome · SIGLA · cidade/UF"; quadro com a régua, desde quando está na etapa e o prazo; campos Contrato (como na Carteira: número em azul que abre o contrato, fornecedor em maiúsculas) · Item da ata (número em azul que abre o Item 360 › Emendas, "· Ata X", descrição da ata) · Origem · Fiscal; Endereço de entrega numa linha (logradouro, bairro, cidade/UF, CEP do cadastro); Histórico com SEI; botões Entrega parcial · Data prevista · Quem fiscaliza (só na mista) · Mudar etapa. Saíram os links soltos "Abrir o contrato" e "Abrir o item da ata".

**Colunas por pergunta (11/11/2026, a pedido do usuário: "parece que estamos sempre olhando a mesma coisa").** Cada aba responde uma pergunta e tem a coluna que só ela tem; "Situação" deixa de ser nome genérico.
| Aba | Pergunta | Colunas |
|---|---|---|
| Programas | Quanto do programa já chegou, e onde? | Programa · Contratado (os itens maiores e "N itens · un. em N contratos") · Entrega · Beneficiários ("6 beneficiários" e as UFs embaixo) |
| Contratos | O que o fiscal precisa fazer hoje? | Contrato · Próximo passo (com o prazo do passo) · Entrega · Fiscal |
| Beneficiários | O que o órgão recebe, e quem mandou? | Beneficiário · O que recebe · Quem destinou (parlamentar e emenda, programa ou planilha) · Entrega |
| Itens | Em que etapa está cada item? | Item · Beneficiário · Contrato · Qtd. · Etapa |
Entrega é o único indicador repetido, de propósito, sempre igual: "2 de 8 itens", %, barra e o alerta embaixo ("2 itens com prazo vencido", "tudo entregue"). Nas tabelas dos 360 e na mesa, a coluna do item também se chama Etapa. O parlamentar vem do pedido de emenda (campo novo parlamentarNome na lista da Fiscalização).

**Cadastro do programa (11/11/2026, decisão do usuário).** Campos: Nome · Área responsável (lista das Unidades Internas, não texto livre) · Origem do recurso (Emenda parlamentar · Fundo Nacional de Segurança Pública (FNSP) · BNDES ou outro fundo · Outro) · Situação (Ativo/Inativo, só na edição). Sem processo SEI, período ou observação. Lista em Ajustes › Gestão › Programas: Programa · Área responsável · Origem do recurso · Itens no programa · Situação; menu ⋯ com Editar, Inativar/Ativar e Excluir (só para programa sem item ligado; com itens, só inativar, como em Usuários e Unidades Internas). Programa inativo sai das listas da Fiscalização; itens e histórico ficam. Tabela `fisc_programas`: nome único, unidade_interna_id, origem_recurso, ativo.

**Item 360 › Emendas (11/11/2026).** Na coluna "Beneficiários e entrega", cada beneficiário (pela sigla, como nas listas de pedidos) com a etiqueta da etapa, a mesma das tabelas da Fiscalização, e o atraso em vermelho quando vencido ("70× GCM · Aguardando o Exército · vencida há 256 dias · contrato 00055/2026"); o clique abre a janela do item. Saiu o texto "passo N de 7".

## 10. Sem substituto (decisão de 11/11/2026)

O módulo deixa de ter substituto. Quem age no contrato é o fiscal (e o coordenador); na ausência do fiscal, o coordenador passa os contratos a um colega pela transferência temporária e o Desfazer devolve. A migration 267 recria as funções sem o substituto e apaga as colunas (nenhum contrato tinha substituto preenchido).
