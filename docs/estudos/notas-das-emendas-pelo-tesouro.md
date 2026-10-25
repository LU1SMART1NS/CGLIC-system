# Notas das emendas que não chegam ao sistema

Medição de 25/10/2026, para a conferência dos pedidos de emendas com o empenho de fato (itens das notas lidos no
Portal da Transparência).

## O que faltava

Os despachos de empenho do SEI dos pedidos (`emenda_pedido_documentos_sei`, etapa EMPENHO) citam 306 notas distintas.

| Situação em `empenhos` | Notas |
|---|---|
| A nota da emenda está lá | 108 |
| Nenhuma nota com o número (UG 200330 ou 200331) | 127 |
| Só a nota de mesmo número da outra UG, que é outra despesa | 71 |

O número da nota se repete nas duas UGs. As notas das emendas são da UG 200330 (plano interno `SP999S9` + autor, com o
número da emenda na descrição). Nas 71 "homônimas", a nota que o sistema tem é da 200331 (diárias, agência de
viagens, outros contratos). A conta de 127 notas faltando escondia essas 71: na verdade faltavam 198.

Efeito colateral: a regra da migration 177 (nota do SEI → linha do pedido) aceitava nota sem número de emenda no plano
interno quando a certa não existia, e 41 linhas de pedidos ficaram ligadas a 15 dessas notas da 200331. A migration
183 (PR #332) corrigiu a regra: essas linhas ficaram sem nota até a nota certa da 200330 entrar em `empenhos`.

## A causa

`empenhos` só recebe nota pela lista de empenhos de cada contrato no Contratos.gov.br (recurso `empenhos` da
sincronização, `/api/contrato/{id}/empenhos`).

- Os contratos das emendas são da UASG 200331; as notas, da UG 200330. A nota só entra na lista do contrato quando o
  gestor a inclui no Contratos.gov.br.
- 182 das 184 notas achadas no Tesouro têm, no sistema, contrato do mesmo fornecedor ligado à ata do pedido. Esses
  contratos foram lidos com sucesso entre 21 e 24/10/2026 e a nota não estava na lista.
- O Tesouro tem 471 notas da UG 200330 em 2026; o sistema, 142 (todas vindas de contratos da 200331).
- Não é colisão de UG: nenhuma nota gravada está ligada a contrato de outro fornecedor.

Sem a nota em `empenhos`, a leitura do Portal (`notas_para_ler_no_siafi`, migration 182) não a lê, porque grava por
`empenho_id`.

## De onde dá para trazer

| Fonte | Resultado |
|---|---|
| Tesouro, saldo contábil (já no banco, migration 128) | As 198 aparecem, mas nas duas UGs e sem plano interno: não diz qual é a da emenda |
| Tesouro, `/api/empenho/{UG}00001{NE}` (aberta) | Credor, data, natureza e plano interno. 181 casam com a emenda do SEI na 200330 (165 pelo número da emenda, 16 pelo código do autor) |
| Portal da Transparência, `/despesas/documentos` | Precisa da chave (segredo da função); não testado aqui. Serve para confirmar as 13 que o STA não devolve |
| Contratos.gov.br | Só quando o gestor incluir a nota no contrato. Fora do ar durante a medição (sem resposta e 502 pelo proxy do site) |

As 17 que ficam de fora:

- 13: o STA não devolve a nota na 200330 (o saldo contábil tem a nota nas duas UGs; na 200331 é outra despesa).
- 3: na 200330 o plano interno é de outra emenda (citação do SEI com outro número ou dígito trocado).
- 1: nota de 2025, de outra despesa (citação provavelmente errada no despacho).

## Correção proposta

Migration 184 (`20261025000184_notas_das_emendas_pelo_tesouro.sql`):

1. `empenhos.fonte_origem` aceita `TESOURO`. A chave canônica é a do Contratos.gov.br: se a nota chegar depois por
   um contrato, a mesma linha é atualizada e vira `SINCRONIZADO`.
2. `nota_casa_com_emenda(plano_interno, emenda)`: a regra da 177 (número da emenda ou código do autor).
3. `emenda_notas_tesouro_tentativas`: o que já foi perguntado ao Tesouro e o resultado.
4. `notas_das_emendas_a_trazer()`: notas citadas no SEI sem a nota da emenda em `empenhos`.
5. `gravar_notas_do_tesouro(consultadas, notas)`: só o servidor; grava só a nota da UG cujo plano interno é o da
   emenda, que existe no saldo contábil e ainda não está em `empenhos`. Valores pelo saldo contábil.
6. `notas_para_ler_no_siafi`: a nota citada no SEI entra pela UG certa.

Notas sem contrato não aparecem no Financeiro (a tela só mostra nota com contrato) nem mexem em saldo de ata ou
contrato.

### Ensaio no banco (25/10/2026, desfeito)

Com as migrations 182 e 183 já em produção:

| Medida | Antes | Depois |
|---|---|---|
| Notas em `empenhos` | 2.076 | 2.257 (181 `TESOURO`, R$ 133,4 mi pelo Tesouro, nenhuma com valor zero) |
| Fila do Portal, UG 200330 | 1 | 182 (+ as 181 novas) |
| Fila do Portal, UG 200331 | 0 | 0 |
| Linhas dos pedidos com nota (`emendas_ligar_notas`) | 1.427 | 1.623 (197 com nota do Tesouro) |
| Linhas ligadas a nota que não é de emenda | 0 | 0 |

Tempo: gravação 1,2 s; religação das linhas 1,0 s.

### Próximos passos

1. Aplicar a migration 184 (a 182 e a 183 já estão na main e em produção; a 184 redefine `notas_para_ler_no_siafi`
   da 182).
2. Carga inicial das 181 pela própria `gravar_notas_do_tesouro`, com as respostas do STA já lidas (como na carga do
   saldo contábil).
3. Recurso `notas_emendas_tesouro` no servidor (`src/services/notasEmendasTesouroSyncService.ts`) para as notas
   citadas depois: pergunta ao STA as de `notas_das_emendas_a_trazer()` nas duas UGs, 4 por vez, e grava nota a nota
   por `gravar_notas_do_tesouro`; a nota que falha no Tesouro não é gravada como tentativa e volta na execução
   seguinte. Agendado uma vez por dia às 10h35 de Brasília (migration 185), depois do saldo contábil da 200330.
4. As 17 de fora: conferir no SEI ou pelo Portal (`/despesas/documentos`).
