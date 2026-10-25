# Saldo contábil do Tesouro como fonte do pago e dos restos a pagar

Estudo de 14/10/2026. Pergunta: dá para usar o saldo contábil do SIAFI, publicado pela API aberta do Tesouro (STA), para saber quanto de cada nota de empenho está a liquidar, liquidado a pagar e pago? Resposta: sim. A fonte é aberta, rápida, atualizada todo dia e cobre todos os empenhos do sistema. Ela resolve três problemas de hoje e tem limites que a implementação precisa respeitar.

Nada aqui muda o sistema. A medição se reproduz com `scripts/estudo-saldo-contabil.sql` e `scripts/estudo-saldo-contabil.mjs` (instruções no fim).

## A fonte

- **Consulta:** `GET https://sta.api.gov.br/api/saldocontabil/ano/{ano}/ug/{ug}/gestao/00001/contacontabil/{conta}`. Aberta, sem login. Documentação em `https://sta.api.gov.br/docs/api-docs.json`.
- **Resposta:** linhas com `saldo`, `debito_mensal`, `credito_mensal` e `created_at`. A conta corrente é a nota de empenho seguida do subitem: `2025NE00047152` é a 2025NE000471, subitem 52.
  - **Ano corrente: uma linha por período (mês) de cada conta corrente**, com o movimento do período (saldo = crédito − débito; débito e crédito iniciais zerados; `tiposaldo` sempre `C`; sem campo de mês). O saldo da conta corrente é a **soma de todas as linhas**. Ex.: 2026NE00001233 na 622920101 vem com +71.996,00 (empenho) e −71.996,00 (liquidação). Achado de 25/10/2026: a gravação guardava uma linha só e 2.260 das 7.020 contas correntes de 2026 ficaram erradas; corrigido na migration 195. Com a soma, o empenhado bate com o Portal da Transparência em 40 de 40 notas sorteadas.
  - **Anos fechados:** uma linha por conta corrente (2016 a 2025 conferidos).
  - A consulta por conta corrente (`…/contacorrente/{cc}`) devolve só a primeira linha; o `POST /api/saldocontabil` devolve todas.
  - Os itens de `/api/empenho` não servem para o valor da nota: a lista repete as linhas e o total vem em dobro em 450 de 624 notas de 2026.
- **Atualização:** diária. Em 14/10/2026 os dados de 2026 eram de 13/10/2026 08:36. Os anos fechados ficam congelados (2025 parou em 05/01/2026).
- **Desempenho:** cada consulta leva menos de meio segundo. As duas UGs da CGLIC em 11 anos (2016 a 2026) e 10 contas deram 220 consultas, 51.351 linhas, em 33 segundos. Para o ano corrente bastam 20 consultas.

Contas usadas:

| Conta | O que é |
|---|---|
| 622920101 | Empenho do ano, a liquidar |
| 622920102 | Empenho do ano, em liquidação |
| 622920103 | Empenho do ano, liquidado a pagar |
| 622920104 | Empenho do ano, pago |
| 631100000 | Restos a pagar não processados, a liquidar |
| 631200000 | Restos a pagar não processados, em liquidação |
| 631300000 | Restos a pagar não processados, liquidado a pagar |
| 631400000 | Restos a pagar não processados, pago |
| 632100000 | Restos a pagar processados, a pagar |
| 632200000 | Restos a pagar processados, pago |

O pago de cada ano fica no ano em que ocorreu. O total pago de um empenho é a soma das contas de pago de todos os anos, do ano do empenho até hoje.

## Medição (14/10/2026)

**Cobertura.** Os 2.025 empenhos das UGs 200330 e 200331 no banco aparecem no Tesouro, todos. Três estavam com o número fora do padrão no banco ("2025NE000278 HPE", "2025ne000215", "2026ne000048"); normalizados, foram encontrados. O Tesouro tem mais 8.423 empenhos dessas UGs que o sistema não acompanha.

**Pago por empenho, Tesouro × faturas.** Nos 1.502 empenhos com fatura no Contratos.gov.br:

| | Empenhos | Diferença |
|---|---|---|
| Pago igual (diferença até 1%) | 1.141 | — |
| Tesouro pagou mais | 283 | R$ 158,0 mi |
| Faturas dão mais pago | 78 | R$ 4,4 mi |

- **Tesouro pagou mais:** R$ 48,6 mi da diferença são faturas "a conferir" cujo empenho o Tesouro mostra pago; em 105 empenhos isso cobre a diferença inteira. O resto são pagamentos sem fatura no Contratos.gov.br (ex.: 2023NE000139 da 200331, R$ 63,9 mi pagos e R$ 16,1 mi faturados).
- **Faturas dão mais pago:** diferença pequena, de defasagem de um dia e de casos residuais.
- **Pago sem fatura:** 67 empenhos sem nenhuma fatura no banco têm R$ 14,7 mi pagos no Tesouro.

**Restos a pagar hoje**, nos empenhos do sistema: R$ 339,0 mi a liquidar e R$ 179,0 mi liquidados a pagar, em 647 empenhos. No exercício de 2026: R$ 299,8 mi a liquidar e R$ 7,1 mi liquidados a pagar.

**Caso General Motors (00269/2025).** 425 veículos, R$ 122,8 mi, empenhos da UG 200330. No Tesouro: nada pago; 162 veículos liquidados a pagar (R$ 46,8 mi); 263 a liquidar (R$ 76,0 mi). O Contratos.gov.br mostra 262 dessas faturas como apropriadas no SIAFI, o que o saldo contábil não confirma.

## O que o saldo contábil resolve

1. **Pago e saldo por empenho na tela Financeiro.** Hoje o pago soma o valor de cada empenho informado na fatura. Em 318 faturas pagas, a fonte manda o valor do empenho inteiro no lugar da parte da fatura. Resultado: 215 empenhos com o pago inflado em R$ 248,1 mi, e 157 deles aparecem com o saldo zerado. O saldo contábil é a fonte oficial e não depende das faturas.
2. **Restos a pagar.** O tema estava adiado por falta de fonte (o banco só guarda o valor inscrito). O saldo contábil dá, por empenho, quanto do resto a pagar está a liquidar, liquidado a pagar e pago, todo dia.
3. **Faturas "a conferir".** Quando o Tesouro mostra o empenho pago no valor das faturas, o pagamento está confirmado no nível do empenho. Isso cobre 105 empenhos e R$ 48,6 mi hoje.

## Limites

- **Por empenho, não por fatura.** Num empenho com várias faturas, o saldo diz quanto foi pago, não qual fatura. Para a fatura, a confirmação continua sendo a OB (migration 123); o saldo serve de segunda prova, no nível do empenho.
- **Saldo sem data.** O sistema guarda o saldo acumulado no ano (a soma dos períodos); os períodos não trazem a data. Para "liquidado a pagar há X dias", seria preciso guardar a série diária ou continuar usando a data da fatura.
- **Defasagem de um dia** em relação ao SIAFI.
- **Só as UGs consultadas.** Empenho emitido por outra UG (órgão participante, por exemplo) precisa de consulta à UG dele.
- **Valor empenhado.** O valor empenhado do Contratos.gov.br às vezes está defasado (a 2025NE000471 aparece com R$ 38,2 mi; no Tesouro, R$ 109,8 mi foram inscritos em restos a pagar). O saldo contábil também permite reconstituir o empenhado, mas isso não foi medido aqui.

## Proposta de implementação

1. **Base (migration e servidor).** Tabela `empenho_saldo_contabil` (UG, NE, subitem, ano, conta, saldo, atualizado em) e recurso novo na função `sincronizar-fontes`, uma vez por dia depois das 9h, lendo o ano corrente das duas UGs (20 consultas). Os anos anteriores são carregados uma vez e só mudam se o Tesouro republicar. Uma view por empenho com: pago total, a liquidar, liquidado a pagar e restos a pagar.
2. **Financeiro → Empenhos.** Pago e saldo pelo Tesouro, com a data da atualização. Corrigir também a soma pelas faturas, dividindo a fatura entre os empenhos na proporção quando as partes passam do valor dela.
3. **Pagamentos → A conferir.** Mostrar na linha quando o empenho da fatura está pago no Tesouro no valor das faturas dele ("empenho pago no Tesouro"), sem mudar a regra da fatura.
4. **Restos a pagar.** Tela ou seção com os restos a pagar por contrato e por empenho, a liquidar e liquidados a pagar, a partir da mesma tabela.

Cada fase é um PR. A fase 1 não muda nenhuma tela.

## Decisões para o coordenador

- O "pago" do empenho no Financeiro passa a ser o do Tesouro? (Recomendado: sim, com a soma das faturas ao lado para comparação.)
- A fatura "a conferir" com o empenho pago no Tesouro continua "a conferir", só com o aviso, ou passa a "paga"? (Recomendado: continua a conferir com o aviso, porque o Tesouro não diz qual fatura foi paga.)
- Restos a pagar entram como seção do Financeiro ou como tela própria?

## Como reproduzir

```bash
supabase db query --linked -f scripts/estudo-saldo-contabil.sql > empenhos.txt
```

Extraia o JSON da saída (campo `rows[0].json_agg`) para `empenhos.json` e rode:

```bash
node scripts/estudo-saldo-contabil.mjs empenhos.json estudo.json
```

O resumo sai na tela; `estudo.json` traz também a comparação de cada empenho e as maiores diferenças.
