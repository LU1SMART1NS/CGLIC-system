# Emendas: carga das etapas a partir do SEI

Estudo de 24/10/2026. Leitura no SEI do MJ pelo Chrome do usuário, já logado, só leitura. Nada foi gravado no banco nem no SEI.

## 1. Onde está cada etapa no SEI

O pedido de emenda passa por dois processos diferentes:

| Processo | O que tem | Exemplo (emenda 28130013, Dep. A) |
|---|---|---|
| Do ofício (08027…) | Ofício do parlamentar (PDF), ofícios circulares da SAL, despachos da SPO, CGOF/CORFIN (consulta no SIOP), Gabinete da Senasp, DGFNSP e CGLIC até chegar à ComprasSusp | 08027.000153/2026-16: ofício 253/2026 (34886668); despacho 358 da CGLIC para a ComprasSusp em 16/03/2026 |
| Da ata (08020…) | Autorização de DDO e NE, despacho para a CGOFI, despachos da CGOFI e da COR, nota de empenho (PDF), despacho para a CCGA | 08020.003516/2025-46: autorização 34924234 assinada pela Diretora em 18/03/2026 15:50; despacho 84 para a CGOFI em 26/03; NE 2026NE000032 (35059560) emitida em 27/03 |

O processo gravado hoje no pedido é o do ofício. A solicitação de autorização de empenho não fica nele. Ela fica no processo da ata, junto com as autorizações de outros parlamentares para a mesma ata. Por isso a busca é pelo tipo de documento, e não processo a processo.

### A autorização (solicitação de empenho)

Documento "Autorização - Emissão de DDO e NE - <parlamentar>", gerado pela ComprasSusp e assinado só pela Diretora de Gestão do Fundo Nacional (Camila Kühl Pintarelli). Ele traz:

- a tabela "Detalha-se as pretensões dos Parlamentares": ARP, item, objeto, beneficiário, quantidade, parlamentar, **número da emenda**, valor unitário e total;
- o ofício do parlamentar pelo número SEI (quadro "Unidade · Documento SEI");
- a assinatura da Diretora com data e hora.

Há uma autorização por ata e parlamentar. Um pedido com itens de várias atas tem várias autorizações, com datas diferentes. A emenda 28130013, por exemplo, tem autorizações de 18/03 e 20/03.

### Os outros documentos

| Etapa do sistema | Documento no SEI | Data | Como liga ao pedido |
|---|---|---|---|
| Ofício recebido | Ofício do parlamentar (PDF) | Inclusão no SEI, ou "Processo público gerado" no andamento | Citado na autorização pelo número SEI |
| Emenda conferida no SIOP | Não há documento da CAEP. A CGOF/CORFIN faz a consulta no SIOP antes da ComprasSusp receber | Despacho da CORFIN, se você aceitar como data | Processo do ofício |
| Empenho solicitado | Autorização (a ComprasSusp elabora) | Data de inclusão no SEI | Número da emenda + ata + item na tabela |
| Empenho autorizado | A mesma autorização | Assinatura da Diretora | Idem |
| Processo enviado à CGOFI | Despacho da ComprasSusp, destino CGOFI, assunto "Solicitação de emissão de DDO e NE - Emenda Parlamentar" | Assinatura | Cita as autorizações pelo número SEI |
| Nota de empenho emitida | Nota de empenho (PDF) | Data de emissão (já está na tabela de notas do sistema) | Nome na árvore traz o número da nota; despacho da COR de volta à ComprasSusp cita o documento |
| Processo enviado à CCGA | Despacho para contratação (já carregado da planilha) | Assinatura | Cita as notas pelo número SEI |

## 2. Medição de 24/10/2026

| Medida | Número |
|---|---|
| Autorizações de DDO e NE em 2026 (tipo Autorização, data do documento) | 604, em 64 processos |
| Geradas no SEI, com tabela e assinatura da Diretora | 416 (1.178 linhas de emenda) |
| Em PDF anexado (modelo de janeiro, ex.: "Autorização - Dep. B - …") | 188 |
| Despachos "Solicitação de emissão de DDO e NE" em 2026 | 396 |
| Pedidos do sistema com número da emenda | 103 de 144 (os outros 41 são reservas) |
| Pedidos com ao menos uma autorização achada | 74 de 103 |
| Linhas do pedido (ata e item) casadas com a autorização | 191 de 528 |
| Delas, com a mesma quantidade | 139 (52 diferentes) |
| Emendas nas autorizações | 174; 66 das nossas 72 aparecem |
| Emendas autorizadas no SEI sem pedido no sistema | 108 (errado; o certo é 5, ver a seção 6) |

Leitura: as 416 autorizações geradas no SEI levam 5 minutos. A busca do SEI devolve o texto completo de cada documento, sem clicar.

O que falta para cobrir tudo:

- As 188 autorizações em PDF. O texto não sai direto no navegador. Mas o índice da busca do SEI lê o PDF: pesquisar o número da emenda com o tipo Autorização acha o documento e a data de inclusão.
- Os itens dos kits das atas 00090 a 00094 de 2024. Muitas linhas não casaram, e é preciso ver se a autorização lista o kit ou cada item.
- Um pedido tem "elef" no lugar do número da emenda (pedido 511): erro da carga.

## 3. Número da nota de empenho

- **A digitação já saiu.** A migration 174 tirou a nota da janela "Registrar o empenho". Ficou a coluna `emenda_pedido_linhas.nota_empenho`, sem nenhuma linha preenchida, e a tela ainda dá preferência a ela se existir.
- **O dado é necessário, mas não precisa ser digitado.** É pela nota que o pedido mostra empenhado, liquidado e pago, acha o contrato e a entrega prevista. Hoje o sistema acha a nota de 1.406 de 2.134 linhas pelo plano interno da nota.
- **O SEI acrescenta um caminho mais firme.** A nota de empenho no SEI tem o número no nome da árvore e é citada pelo despacho para a CCGA, que a CAEP já tem gravado. Uma regra nova "pelo SEI" liga a linha à nota quando o documento SEI da nota está no pedido.
- **Proposta:** apagar a coluna `nota_empenho` e a preferência na tela. A nota vem só do sistema: pelo SEI e pelo plano interno.

## 4. Plano de carga

### Passo 1 — Leitura completa e relatório (só leitura, sem gravar)

Pelo Chrome, com você logado:

1. As 416 autorizações geradas no SEI: tabela, ofício citado, data de inclusão e assinatura da Diretora.
2. As 188 em PDF: busca pelo número de cada emenda com tipo Autorização, para ter o número do documento, o processo e a data de inclusão. Se a data da assinatura não sair, fica a de inclusão, marcada como "data de inclusão".
3. Os 396 despachos "Solicitação de emissão de DDO e NE": os da ComprasSusp para a CGOFI dão a data do envio; os da COR de volta dão as notas.
4. O ofício citado em cada autorização: data de inclusão no SEI.
5. Os despachos para a CCGA já gravados (contratação): data da assinatura.

Saída: relatório em `.claude/relatorios/emendas-sei-2026-10-24.csv`, uma linha por pedido e etapa, com documento, data, quem assinou, e as linhas cuja quantidade difere. O relatório também lista as 108 emendas autorizadas que não têm pedido no sistema. Você confere antes de gravar.

### Passo 2 — Banco (migration 177)

A 175 é da sessão da revisão dos importados e a 176 já está em produção.

- **Documentos SEI do pedido:** tabela nova `emenda_pedido_documentos_sei`, com pedido, etapa, documento SEI, processo SEI, data e hora da assinatura, quem assinou, cargo e origem (SEI ou digitado). Um pedido passa a ter vários documentos por etapa: uma autorização por ata, um envio à CGOFI por lote, uma nota por fornecedor. As colunas de hoje (`solicitado_documento_sei`, `cgofi_documento_sei` e as listas) passam a ser lidas dessa tabela.
- **Data da etapa:** a última data dos documentos da etapa, quando todos os itens do pedido estão cobertos. Exemplo: a etapa "Empenho autorizado" só fecha quando a última ata do pedido foi autorizada.
- **Linha do pedido:** ganha `autorizacao_documento_sei`, a autorização que cobre aquela ata e item.
- **Nota pelo SEI:** `emendas_ligar_notas()` ganha a regra "SEI", que vale antes das outras: a nota cujo documento SEI está no pedido e cujo item bate.
- **Sai `nota_empenho`** da linha, como no item 3.

### Passo 3 — Gravação (com sua autorização)

Numa transação, como nas cargas anteriores, com ensaio antes:

- documentos e datas das etapas dos 103 pedidos com emenda;
- `oficio_documento_sei` e `oficio_em` pelo ofício citado;
- etapa de cada pedido recalculada pelo que o SEI mostra. Um pedido em "Ofício recebido" que já tem autorização assinada avança;
- quantidades diferentes ficam como estão e vão para a sua decisão, pela lista do relatório.

### Passo 4 — Telas

- Linha do tempo com cada documento, data, hora e quem assinou, em pílula SEI (`NumeroSeiEtiqueta`).
- Etiqueta "lido do SEI em dd/mm".
- A janela de revisão dos importados (sessão emendas-revisao, migration 175) fica só para o que o SEI não tem: data da reserva, minuta, contato e as 41 reservas. A revisão e esta carga precisam ser combinadas antes de a 175 ser aplicada.

### Passo 5 — Depois da carga

- **Pedidos novos:** a CAEP registra no sistema como hoje, e o SEI só confere.
- **Reler o SEI:** quando você pedir, eu refaço a leitura (5 a 10 minutos) e mostro o que mudou antes de gravar. O servidor não consegue ler o SEI sozinho: precisa de login, e o MJ não tem API aberta. Para ser automático, seria preciso pedir à CGTI acesso aos web services do SEI.

## 5. Para você decidir

1. **108 emendas autorizadas sem pedido no sistema.** Sugestão: criar os pedidos a partir da autorização, com origem SEI, depois de você ver a lista. Elas podem ser de antes da planilha ou de outras áreas.
2. **Data da conferência no SIOP.** Sugestão: deixar vazia. Não há documento da CAEP, e a consulta da CORFIN é de outra unidade.
3. **Quantidade diferente entre o pedido e a autorização (52 linhas).** Sugestão: vale a autorização, que é o documento assinado, depois de você ver a lista.
4. **Data do "Empenho solicitado".** Sugestão: data de inclusão da autorização no SEI, que é quando a ComprasSusp a elaborou.
5. **Uma etapa com várias datas, uma por ata.** Sugestão: a etapa fecha na última data, e a tela mostra cada documento com a sua data.

## 6. Resultado do passo 1 (leitura completa, 24/10/2026)

Leitura só pelo Chrome logado; nada gravado no banco. Relatórios em `.claude/relatorios/` (fora do git):

- `emendas-sei-pedidos-2026-10-24.csv`: uma linha por pedido, com o que o SEI mostra em cada etapa;
- `emendas-sei-linhas-2026-10-24.csv`: um item (ata e item) por pedido, com a quantidade do sistema e a das autorizações;
- `emendas-sei-sem-pedido-2026-10-24.csv`: emendas autorizadas que não têm pedido;
- `emendas-sei-dados-2026-10-24/`: o que foi lido do SEI e o script do cruzamento, para refazer sem voltar ao SEI.

### O que foi lido

| Documento | Lidos |
|---|---|
| Autorizações de DDO e NE (2026 e as achadas pelo número da emenda) | 632 (445 com texto, 187 em PDF) |
| Despachos da ComprasSusp para a CGOFI | 172 |
| Despachos para a CCGA, com o número de cada nota | 160 (415 notas) |
| Processos do ofício (data em que foi gerado e em que chegou à ComprasSusp) | 95 |

Correção da leitura: nas autorizações com vários itens, as colunas de beneficiário, parlamentar e emenda vêm mescladas entre linhas. A primeira leitura desalinhava essas linhas, e daí vieram as "108 emendas sem pedido", que eram valores lidos como número de emenda. Relidas as 168 autorizações com células mescladas, o resultado ficou como abaixo.

### Pedidos com número de emenda (103)

| Etapa | Pedidos com dado do SEI |
|---|---|
| Processo do ofício gerado em | 78 |
| Chegou à ComprasSusp em | 61 |
| Autorização, data e assinatura da Diretora | 95 |
| Envio à CGOFI, documento e data | 95 |
| Notas de empenho (número) | 96 |
| Data de emissão da nota (do banco) | 71 |
| Despacho para a CCGA, data | 96 |

- **Itens (emenda, ata e item):** 503 com a mesma quantidade nas autorizações, 40 com quantidade diferente (8 deles em emendas que também têm autorização em PDF não lida) e 12 sem autorização achada.
- **Pedidos sem nenhuma autorização achada:** 8 (455, 458, 467 só PDF, 494, 511 com emenda "elef", 517, 518, 535).
- **Pedidos que avançam pelo SEI:** 5 pedidos em "Ofício recebido" no sistema já têm autorização assinada e envio à CGOFI (472, 473, 480, 504, 510).

### Processo do ofício errado em 42 pedidos

O número do processo gravado não existe no SEI em 42 pedidos. A maior parte é sequência criada ao arrastar a célula na planilha (08027.000243/2026-07 virou -08, -09… -16; o mesmo com 000220, 000135 e 000272). Para 31 o relatório sugere o processo certo: o primeiro da sequência ou o processo onde o ofício citado na autorização está. Os 11 restantes (incluindo 5 de outros órgãos, 08000 e 08001) ficam para a CAEP informar, pois podem ser de acesso restrito.

### Emendas autorizadas sem pedido (5)

| Emenda | Parlamentar | Linhas | Reserva do mesmo autor no sistema |
|---|---|---|---|
| 71200006 | Bancada RJ | 59 | pedido 447 (60 linhas, Reservado) |
| 71140003 | Bancada MG | 2 | pedido 469 (Reservado) |
| 44210002 | Marcos Tavares | 2 | pedido 538 (Reservado) |
| 44750013 | Sargento Portugal | 1 | nenhum (há outro pedido dele com a emenda 44750008) |
| 42390010 | Dra. Eudócia | 1 | nenhum |

Três das cinco são reservas que já estão no sistema sem número de emenda. Sugestão (muda a decisão 1 aprovada, que previa criar pedidos novos): completar a emenda nessas três reservas e levar a etapa pelo SEI; só as outras duas viram pedido novo, de origem SEI.

### Limites que ficam

- Data do ofício: 25 pedidos sem data (processo não achado e ofício não citado). A CAEP informa na revisão.
- Data da nota: 25 pedidos têm o número da nota, mas a nota não está na tabela de notas do sistema (a maioria de 2025 ou de outra UG).
- Autorizações em PDF: 187 lidas só pelo índice da busca (sem tabela).

## 7. Gravação do que tinha prova firme (24/10/2026, autorizada pelo usuário)

Gravado em produção num bloco único, depois de ensaio desfeito, só nos campos vazios, em 98 pedidos (marcados "Leitura do SEI (24/10/2026)"; cópia dos valores de antes e o script em `.claude/relatorios/emendas-sei-dados-2026-10-24/`).

| Dado | Pedidos |
|---|---|
| Despacho à CCGA (data da assinatura) | 94 |
| Empenho solicitado e autorizado (data, documento, assinatura da Diretora) | 44 |
| Envio à CGOFI (data e documento) | 43 |
| Nota emitida (data de emissão) | 24 |
| Ofício recebido (documento e data em que chegou ao MJ) | 21 |
| Processo do ofício corrigido | 4 |
| Etapa: "Ofício recebido" → "Processo enviado à CGOFI" | 3 (472, 473, 480) |

Regras para entrar: todo item do pedido coberto pela autorização; soma da autorização igual à quantidade da emenda no sistema (evita misturar rodadas da mesma emenda); emenda não repartida em pedidos com o mesmo item; um só ofício citado; nota com UG certa (o número se repete nas UGs 200330 e 200331, vale a de plano interno de emenda); datas em ordem. Conferido depois: nenhum pedido com datas fora de ordem.

Ficou de fora (lista com o motivo em `emendas-sei-carga-2026-10-24.csv`): emenda repartida em vários pedidos com o mesmo item (21), quantidade diferente da autorização (17), nota sem número ou fora da tabela de notas (62), mais de um ofício citado ou sem data (31), conflito de datas entre rodadas (10, só o despacho à CCGA entrou), sem autorização achada (8). Também não foram gravados: as 3 reservas que batem com emendas autorizadas e as 2 emendas sem pedido, à espera de decisão.
