# Auditoria dos vínculos pelo SEI: plano em fases

Plano de 24/10/2026. Pergunta do usuário: o sistema está vinculando certo? Contrato na ata certa, quantidade do item do contrato igual à do Contratos.gov.br (ou ao termo assinado), nota de empenho no contrato certo e nota no item certo. A prova de cada vínculo vem do processo SEI da ata e dos documentos dele (termo de contrato, nota de empenho, ata assinada).

Nada aqui muda o sistema. Os números são de uma contagem só de leitura no banco de produção em 24/10/2026 (arquivos `estado.sql`, `estado2.sql`, `amostras.sql` e `proc.sql` no scratchpad da sessão).

## Resposta curta

- São **quatro vínculos**, um por fase, sempre na mesma ordem: contrato → ata, quantidade do item, nota → contrato, nota → item. Cada fase depende da anterior (uma nota só pode estar no item certo se o contrato estiver na ata certa).
- A auditoria anda **por ata**, uma de cada vez. Para cada ata, abro o processo no SEI, listo o que ele prova (contratos, termos, notas) e comparo com o que o sistema gravou.
- **Começa por um piloto de 3 atas**, para medir o tempo por ata e ajustar a planilha. Só depois vamos às 155 atas vigentes.
- O SEI entra como **fonte de prova**, não como fonte de dados: o sistema continua lendo Compras.gov.br, Contratos.gov.br, PNCP e Portal da Transparência. O que o SEI mostra diferente vira uma de três coisas: erro do sistema, erro do sistema estruturante (corrige-se lá) ou erro no próprio processo.

## Ponto de partida (24/10/2026)

| O que | Quanto |
|---|---|
| Atas no banco · vigentes | 214 · 155 |
| Atas vigentes com algum contrato vinculado · sem nenhum | 128 · 27 |
| Atas com processo da compra lido do PNCP | 195 de 214 |
| Contratos no banco · vigentes | 1.137 · 437 |
| Contratos com número de processo (vem do Contratos.gov.br) | 1.137 (todos) |
| Vínculos item da ata ↔ contrato | 1.036 (1.024 automáticos, 12 manuais) |
| Contratos vigentes sem ata | 33 |
| Vínculos com quantidade ajustada pelo gestor | 3 |
| Vínculos com quantidade diferente da fonte | 5 (num só contrato, 00062/2026, item 15 lido duas vezes) |
| Notas de empenho · vínculos nota ↔ contrato | 2.076 · 2.143 (todos vindos da fonte) |
| Notas em mais de um contrato na fonte | 67 |
| Notas com credor diferente do fornecedor | 9 (Claro/Embratel, CEB/Neoenergia, Protecop: sucessão ou nome) |
| Notas citadas em fatura fora do contrato | 4 |
| Nota → item, contratos vigentes: vinculadas · a vincular · sem valor | 1.166 · 87 · 47 |
| Origem das parcelas nota → item | 1.301 automáticas (1 item), 491 pela nota do SIAFI, 2 pelo valor, 1 do gestor |
| Notas em conferência: contrato sem itens · item fora · preço diferente | 178 · 7 · 6 |

**Achado que muda o plano:** o processo do contrato no Contratos.gov.br é o mesmo da ata em 306 dos 377 contratos vigentes vinculados. Os outros **71 contratos (em 39 atas) têm processo próprio**, geralmente da unidade que contratou (prefixos 08129, 08106, 08001). Então a leitura por ata precisa, nesses casos, abrir também o processo do contrato: as notas de empenho dele estarão lá, não no processo da ata.

## Como o SEI entra

O que já sabemos de ler o SEI do MJ (memória `sei-mj-leitura-chrome`):

- Só funciona pelo **Chrome do usuário, já logado**. Nunca digito senha. A pesquisa pública não serve.
- A árvore do processo lista os documentos com tipo, número e número SEI. Para a auditoria, bastam os nomes da árvore na maior parte do tempo: "Termo de Contrato nº 00061/2026", "Nota de Empenho 2026NE000032", "Ata de Registro de Preços nº 47/2024".
- Documentos gerados no SEI (termo, ata, despacho) têm texto legível, com assinatura e data no fim.
- **Nota de empenho é PDF anexado**: a ferramenta do Chrome não extrai o texto. O número da nota vem do nome na árvore; os **itens e quantidades da nota** vêm da leitura do SIAFI que o sistema já faz pelo Portal da Transparência (491 parcelas de origem SIAFI). Baixar o PDF só para os casos duvidosos, e só com autorização.
- Abrir documento de outra unidade **troca a unidade atual do usuário no SEI**. Aviso antes de começar cada rodada e no fim.
- Ler em lote pela tela de Pesquisa funciona (tipo do documento + texto + data), mas paginação e acentos têm armadilhas já mapeadas.

## As fases

### Fase 0: preparação (sem SEI)

1. Gerar a lista das atas vigentes, ordenada por quantidade de contratos e notas, com o processo da compra e os processos próprios dos contratos. Marcar as 19 atas sem processo lido do PNCP (cron ainda completa; se não completar, o processo vem do SEI).
2. Criar a planilha de conferência (CSV em `docs/estudos/auditoria-vinculos/`), uma linha por fato conferido, com estas colunas: ata, processo, fase, o que o sistema diz, o que o SEI diz, situação (confere · difere · sem prova no SEI), onde corrigir (sistema · Contratos.gov.br · Compras.gov.br · PNCP · processo), observação.
3. Fixar o critério de "certo" de cada fase (abaixo), para não decidir caso a caso.

### Fase 1: contrato → ata

**O que confere:** cada contrato do processo da ata (termo de contrato assinado) está vinculado no sistema a essa ata, e só a ela; nenhum contrato vinculado à ata falta no processo.

**Fontes:** árvore do processo da ata (termos de contrato e, quando houver, processo próprio do contrato) × `arp_item_contract_links` (origem, quem vinculou) × fila Vínculos › Contratos à ata.

**Casos a olhar com atenção:**

- 33 contratos vigentes sem ata: pela amostra, a maioria é contrato de serviço contínuo (Caixa, Neoenergia, Caesb, Serpro, Telefônica) sem ata nenhuma, ou carona de compra de outra UASG (200334, 200342). O SEI confirma qual é qual, e o sistema deveria ter como marcar "não vem de ata" para não ficar na fila para sempre.
- 12 vínculos manuais: conferir um a um (quem vinculou e por quê).
- Contrato em várias atas da mesma compra (regra da migration 86): o SEI mostra o termo com os itens; cada item tem de estar na ata certa.
- Contrato cuja regra automática não quis vincular (motivos "mesma compra, outro fornecedor", "item em várias atas"): o termo de contrato desempata.

**Critério de certo:** termo de contrato cita a ata (ou a compra) e o fornecedor; os itens do termo estão nessa ata.

### Fase 2: quantidade do item do contrato

**O que confere:** a quantidade de cada item do contrato que o sistema usa para consumir o saldo da ata (`quantidade_contratada_api`, ou a ajustada pelo gestor) é a do termo de contrato assinado no SEI, e a fonte (Contratos.gov.br ou Compras.gov.br) não trouxe número errado.

**Fontes:** termo de contrato no SEI (quadro de itens) × `itens_contrato` (fonte e data da leitura) × vínculo (quantidade da API, ajustada e justificativa).

**Casos a olhar com atenção:**

- Os 3 ajustes do gestor (contrato 00061/2026, itens 18, 27 e 62: fonte com quantidade quebrada 79.573,04, ajustada para 80.308): o termo diz qual está certa.
- Quantidades quebradas vindas da fonte (serviço por valor, energia) em item de material: sinal de que a fonte gravou valor no lugar de quantidade.
- Contrato 00062/2026: item 15 aparece duas vezes na fonte (4 e 10) e o vínculo tem 14. Conferir no termo.
- Contrato sem itens na fonte (178 notas na conferência "contrato sem itens"): o termo traz os itens; hoje nada consome a ata.

**Critério de certo:** quantidade do termo = quantidade usada pelo sistema. Quando a fonte difere do termo, a correção é no Contratos.gov.br (o gestor do contrato corrige lá); o ajuste no sistema é provisório e precisa ficar registrado como tal.

### Fase 3: nota de empenho → contrato

**O que confere:** toda nota de empenho do processo (da ata ou do contrato) está no contrato certo no sistema, e nenhuma nota do contrato no sistema pertence a outro processo.

**Fontes:** árvore do processo (nome "Nota de Empenho 2026NE000032") × `contrato_empenhos` (todos vêm da fonte; o vínculo à mão foi desligado em 14/10/2026) × filas Vínculos › Empenhos ao contrato e conferência da nota do SIAFI.

**Casos a olhar com atenção:**

- 67 notas em mais de um contrato na fonte: o processo diz de qual contrato é. Erro conhecido: 2024NE000765 (HPE) no 00145/2025 (Equilíbrio).
- 9 notas com credor diferente do fornecedor: confirmar as sucessões (Embratel→Claro, CEB→Neoenergia) e o nome curto (Protecop), para o aviso parar de aparecer nos casos certos.
- 4 notas citadas em fatura fora do contrato: já têm veredito na fila; o SEI fecha a dúvida.
- 47 notas vigentes "sem valor" na fonte: ver se a nota existe no processo e com que valor.
- Notas de 2024/2025/2026 (1.750 das 2.076) são o foco; as anteriores só se a ata ainda estiver vigente.

**Critério de certo:** a nota está no processo do contrato (ou da ata, citando o contrato) e no mesmo contrato no sistema. Correção é sempre no Contratos.gov.br; o sistema só marca "corrigindo na fonte".

### Fase 4: nota de empenho → item

**O que confere:** a parcela de cada nota por item (quantidade por item) bate com a nota de empenho real. Como o sistema deve vincular: pela nota do SIAFI quando ela traz o item (hoje 491), automático quando o contrato tem um item só (1.301), pelo valor só em último caso (2), e o gestor informa a quantidade no resto.

**Fontes:** itens da nota lidos do SIAFI (`v_empenho_nota_siafi`) e, nos casos duvidosos, o PDF da nota no SEI (com autorização para baixar) × `contrato_empenho_distribuicoes` e `contrato_empenho_itens` × fila Vínculos › Empenhos aos itens.

**Casos a olhar com atenção:**

- 87 notas vigentes a vincular: 45 com quantidade quebrada na própria nota, 16 sem leitura, 14 com linha sem número de item, outras com soma que não fecha. Para cada grupo, decidir uma regra ou deixar para o gestor.
- 7 notas com item fora do contrato e 6 com item de outro preço (contrato 00043/2026, estabilizador): o PDF da nota e o termo decidem.
- Parcelas automáticas de contrato de 1 item com quantidade quebrada (504 em 09/10): conferir uma amostra; se a nota é por valor (serviço), a quantidade não tem sentido e a tela deveria dizer isso.
- As 2 pelo valor e a 1 do gestor: conferir todas.

**Critério de certo:** quantidade por item na parcela = quantidade do item na nota (SIAFI ou PDF). Divergência da leitura do SIAFI é problema do sistema; divergência do Contratos.gov.br com a nota é problema da fonte.

### Fase 5: consolidação

1. Resumo por tipo de erro e por fase, com os números: quantos conferem, quantos diferem, onde corrigir.
2. Lista de correções, separada em três: (a) o gestor corrige no Contratos.gov.br; (b) o sistema corrige (dado errado, regra que falhou); (c) regra nova ou aviso novo (por exemplo, "contrato sem ata" marcado de vez; sucessão de credor confirmada).
3. Cada correção no sistema vira um PR separado, com ensaio no banco e autorização, como sempre.

## Piloto: 3 atas antes de tudo

Sugestão (atas vigentes com mais contratos e notas, para forçar todos os casos):

| Ata | Contratos vinculados | Notas | Por que |
|---|---|---|---|
| 00018/2025 (200331) | 11 | 38 | muitos contratos e notas, processo único |
| 00051/2024 (200331) | 8 | 76 | mais notas de todas; testa a fase 4 a fundo |
| 00033/2025 (200331) | 12 | 19 | contratos com processo próprio (08129); testa a leitura de dois processos |

Entrega do piloto: a planilha preenchida para as 3 atas, o tempo gasto por ata e a lista do que a planilha precisou mudar. Com isso, estimamos as 155 atas e decidimos se vale automatizar partes da leitura (lista de documentos da árvore por processo, pela tela de Pesquisa).

## O que preciso do usuário

- **Login no SEI pelo Chrome** antes de cada rodada (e aceitar que a unidade atual no SEI pode mudar enquanto leio).
- **Ordem das atas**: a sugerida acima, ou outra (por gestor, por GTI, por valor).
- **Autorização para baixar PDF de nota** só quando o SIAFI não resolver.
- **Decisão sobre o escopo:** faturas e ordens bancárias ficam de fora desta auditoria (são o passo seguinte, pagamento); contratos encerrados entram só se a ata estiver vigente.

## O que não vai mudar

- Nenhuma gravação no banco durante a auditoria. Correções só depois, com PR e autorização.
- Não volto a vincular nota a contrato à mão no sistema (decisão de 13/10/2026): o que estiver errado na fonte se corrige na fonte.
- "Nada inventado": o que o SEI não prova fica como "sem prova no SEI", não como "certo".
