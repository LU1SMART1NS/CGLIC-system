# Nome do item na ata assinada (leitura automática das atas novas)

16/11/2026. A carga da migration 312 gravou o nome de 478 dos 480 itens das atas vigentes, lido no PDF da ata assinada
(PNCP) e conferido pelo usuário. Para as atas que chegam depois, a função `sincronizar-fontes` passa a ler o nome sozinha
(recurso `nome_item_ata`, migration 313, `src/services/nomeItemAtaParser.ts`). Este estudo registra como a leitura foi
medida.

## Como a leitura funciona

- Fonte: `GET /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/atas/{seqAta}/arquivos`, o arquivo de menor sequencial
  (os seguintes são termos aditivos e apostilamentos), a partir de `atas_registro_preco.numero_controle_pncp`.
- O pdf.js devolve cada pedaço de texto com a posição. A tabela de preços é a que tem no cabeçalho ITEM, uma coluna
  de nome (ESPECIFICAÇÃO, DESCRIÇÃO, OBJETO…) e uma de valor; as tabelas dos participantes (sem valor) ficam de fora.
- Os títulos são lidos por coluna, empilhando as linhas: nas atas de 2026 o PDF parte as palavras ("ITE"/"M",
  "IT"/"E"/"M", "DESCRIÇÃO/ESPECIFI"/"CAÇÃO").
- As linhas da tabela são separadas pelo espaço entre as faixas de todas as colunas (a célula do nome pode ter várias
  linhas, alinhada no topo ou no meio, e algumas atas usam espaço duplo).
- Com duas numerações, vale a coluna "Item no PNCP". Só com "Item no TR" (atas de manutenção 00005/2026 e
  00023/2026), o nome só vale quando o preço do banco aponta para a mesma linha.
- O preço do banco é o de hoje (cerca de 5% acima do PDF pelo reajuste): serve de pista. Linha com preço fora de 0,6 a
  1,8 vez o do banco fica sem nome.
- O nome é cortado na marca, no modelo, em códigos, em "24 meses", em "com atualização/suporte/garantia" e no preço,
  até 80 letras.
- O PDF precisa trazer o número da ata no título: na 00037/2026 o PNCP tem o PDF da ata 27/2026.

## Em dúvida, sem nome

Célula partida na troca de página, texto solto entre dois números, número repetido com nomes diferentes, dois itens
que ficam com o mesmo nome depois do corte (a diferença estava no fim, como o equipamento), texto que não é nome
(R$, TOTAL, só código, começo em minúscula), duas numerações sem dizer qual é a do PNCP. O motivo de cada item fica em
`itens_nome_leituras.sem_nome` e a contagem entra na mensagem da sincronização.

## Medição nos 145 PDFs da carga (480 itens, os 478 nomes conferidos como gabarito)

| Resultado | Itens |
|---|---|
| Igual ao conferido | 353 |
| Parecido (o mesmo nome, cortado em outro ponto) | 19 |
| Diferente | 13 |
| Sem nome (dúvida) | 95 |

Nenhum dos 13 diferentes é o nome de outro item: são o mesmo produto escrito de outro jeito (a carga às vezes usou a
outra coluna de descrição, como na 00089/2024) ou erro da própria carga. A conferência pelo preço do banco mostrou que
a carga errou em:

- 00036/2026, item 3 ("mastro)"): na ata, "Suporte de Mastro de Bandeira (4 mastro)" (R$ 287,00).
- 00036/2026, item 4 ("mastro)"): na ata, "Mastro em alumínio de Bandeira" (R$ 111,00).
- 00036/2026, item 7 ("Mastro em madeira", que é o item 5): na ata, "Talabarte de Bandeira" (R$ 75,00).
- 00053/2024 item 11 ("spargidor…"), 00007/2025 item 1 ("coleta de material biológico") e 00036/2025 item 2
  ("over/polia…"): nome sem o começo (a célula estava partida). A leitura automática deixa esses três sem nome.

A carga não é reescrita pela leitura automática (as atas da carga entram como já lidas na migration 313); a correção
desses itens é à parte.
