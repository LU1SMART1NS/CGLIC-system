# Pago das notas: Contratos.gov.br × Tesouro

Estudo de 17/11/2026. Pergunta: por que o pago gravado em `empenhos.valor_pago` (vindo do Contratos.gov.br e exposto por `v_empenhos_resumo`) fica abaixo do pago do Tesouro, e o que as telas devem usar?

Resposta curta: o Contratos.gov.br não acompanha a execução das notas. Na UG 200331 a nota fica como foi emitida (tudo "a liquidar", liquidado e pago zerados) em todas as notas de 2026. Na UG 200330 a fonte traz o pago, mas sem o empenho e às vezes em dobro. O pago e o liquidado da nota devem vir do Tesouro, como o empenhado já vem (migration 196). A maioria das telas já faz isso; faltam dois cálculos e o próprio banco.

Nada aqui muda o sistema. As consultas usadas estão no fim.

## Achado à parte: o Tesouro não é lido desde 15/11

O certificado de segurança do STA (`sta.api.gov.br`) venceu em 15/11/2026 às 16:34 UTC. Desde então toda leitura do saldo contábil falha. Em `sincronizacao_fontes`, o recurso `saldo_contabil` das duas UGs está como PARCIAL ("0 de 10 contas lidas, 10 com falha… error sending request"), com o último sucesso em 15/11/2026 às 12:09 (200330) e 12:27 UTC (200331). O banco guarda o retrato do Tesouro de 13/11/2026, 17:03 (o Tesouro não atualizou no fim de semana).

Esse é o "parcial" da sincronização da UASG 200331. O conserto depende do Tesouro renovar o certificado. Desligar a checagem do certificado na função não é recomendado. Enquanto isso, todas as telas que leem o Tesouro mostram os números de 13/11.

## Medição (17/11/2026, Tesouro de 13/11)

### Notas de 2026 no banco (678)

| | Notas | Pago na fonte | Pago no Tesouro (conta 622920104) |
|---|---|---|---|
| Sem pagamento nos dois | 491 | 0 | 0 |
| Pago igual | 13 | — | — |
| Fonte zerada, Tesouro pago | 160 | 0 | R$ 202,9 mi |
| Fonte menor | 4 | — | — |
| Fonte maior | 10 | — | — |
| **Total** | **678** | **R$ 1,95 mi** | **R$ 205,6 mi** |

Das 187 notas de 2026 que o Tesouro mostra pagas, só 13 têm o mesmo pago no banco. (A contagem de "14 iguais" da medição anterior era de outro recorte; com as notas sem pagamento dos dois lados, são 504 "iguais".)

O liquidado também não serve: só 28 notas de 2026 têm liquidado da fonte acima de zero, e só 18 batem com o "liquidado a pagar" do Tesouro (622920103). O liquidado somado do banco, em todas as notas, é R$ 5,1 mi; pelo Tesouro (pago + liquidado a pagar) é R$ 1.701,8 mi.

### O que a API devolve hoje

Leitura ao vivo de `/api/contrato/{id}/empenhos` em 17/11/2026, nos 55 contratos das 187 notas de 2026 pagas no Tesouro:

| UG | Notas | Banco igual à API | Pago da API | Pago do Tesouro | Como a API mostra a nota |
|---|---|---|---|---|---|
| 200331 | 157 | 157 | 0 em todas | R$ 202,6 mi | 157 de 157 como na emissão: "a liquidar" = empenhado; liquidado, pago e restos a pagar zerados |
| 200330 | 30 | 26 | R$ 2,6 mi | R$ 3,0 mi | 27 com empenhado zero ou negativo e "a liquidar" negativo; pago igual em 15, **o dobro em 11**, menor em 4 |

Exemplos:

- **2026NE000111/200331:** a API mostra empenhado 1.157.164,59, a liquidar 1.157.164,59, liquidado 0, pago 0. No Tesouro: empenhado 4.749.710,40, pago 3.592.545,81, liquidado a pagar 166.645,17. A nota teve reforço e pagamentos, e a fonte não registrou nenhum dos dois.
- **2026NE000231/200330:** a API mostra empenhado 0, a liquidar −312.112,64, pago 312.112,64. No Tesouro: empenhado e pago 156.056,32. A fonte não registrou a emissão e contou o pagamento duas vezes.
- **2026NE000368/200330:** a API mostra empenhado 0, a liquidar −65.540,65, pago 65.540,65. No Tesouro: pago 65.540,65 e 322.703,35 a liquidar.

Nos mesmos 55 contratos, as notas da 200331 sem nenhuma execução na API (liquidado, pago e restos a pagar zerados) são 188 de 188 em 2026, 68 de 127 em 2025 e 25 de 113 em 2024. A fonte deixou de receber a execução da 200331 ao longo de 2025. O banco reproduz a API: a diferença não vem da sincronização do sistema.

### Outros anos (pago total = soma das contas de pago de todos os anos)

| UG | Ano | Notas pagas no Tesouro | Fonte zerada | Pago na fonte | Pago no Tesouro |
|---|---|---|---|---|---|
| 200330 | 2023 | 111 | 108 | R$ 0,8 mi | R$ 36,8 mi |
| 200330 | 2024 | 222 | 206 | R$ 16,5 mi | R$ 143,5 mi |
| 200330 | 2025 | 203 | 194 | R$ 1,2 mi | R$ 137,0 mi |
| 200331 | 2023 | 70 | 49 | R$ 59,2 mi | R$ 219,6 mi |
| 200331 | 2024 | 372 | 217 | R$ 79,0 mi | R$ 448,4 mi |
| 200331 | 2025 | 239 | 162 | R$ 9,8 mi | R$ 294,0 mi |

Nas notas de anos anteriores há ainda outro problema: o pago de restos a pagar vem no campo `rppago`, que o sistema lê mas não grava (não há coluna para ele em `empenhos`).

## Causa provável

O Contratos.gov.br não copia o saldo do SIAFI. Ele monta os valores da nota com o que passa por ele (emissão, apropriação das faturas, pagamentos), e essa integração falha de dois jeitos:

1. **UG 200331:** a execução não chega. A nota fica com o valor da emissão, sem reforço, liquidação ou pagamento. Já era o motivo do empenhado baixo ([estudo do saldo contábil](saldo-contabil-tesouro.md), migration 136).
2. **UG 200330:** o pagamento chega, mas a emissão não (empenhado zero, "a liquidar" negativo), e em 11 de 30 notas pagas o pagamento entra duas vezes. São as mesmas notas do PR #588 (migration 321), que já troca o valor negativo pelo Tesouro.

Nenhum dos dois se corrige do lado do sistema: o campo da fonte está errado na origem.

## Onde o sistema usa o pago e o liquidado da nota

Já usam o Tesouro:

| Onde | Desde |
|---|---|
| Financeiro → Empenhos (pago, saldo, restos a pagar) | PR #201 e #210 |
| Pagamentos → A conferir (aviso de empenho pago no Tesouro) | migration 132 |
| Contrato 360 → aba Empenhos e resumo financeiro do contrato | PR #581 (`fetchContractEmpenhosFromDb`); 5 notas fora do Tesouro ficam "pela fonte" |
| Emendas (notas das linhas do pedido) | migration 318 |
| Notas criadas pelo Tesouro ou pelo Portal (`fonte_origem` TESOURO/PORTAL) | `aplicar_empenhado_do_tesouro` grava pago e liquidado do Tesouro |

Ainda usam o pago da fonte:

| Onde | Efeito hoje |
|---|---|
| `contratosComEmpenhoAPagar` (`empenhosCarteiraService.ts`): escolhe quais contratos encerrados continuam na sincronização de empenhos e faturas | Como o pago da fonte é quase sempre zero, 700 de 732 contratos com nota contam como "com empenho a pagar". Pelo Tesouro (a liquidar + liquidado a pagar > 0) seriam 391. Não mostra número errado: faz o servidor reler 309 contratos sem necessidade. |
| `calculateFinancialSummary` (Início, `dashboardService.ts`) | Soma liquidado e pago da fonte, mas o Início só mostra o empenhado. Sem efeito em tela hoje; fica errado para quem usar depois. |
| `v_empenhos_resumo`, `v_contrato_empenhos_lastro`, `v_notas_fora_do_contrato`, `v_empenhos_citados_fora_do_contrato` | Expõem `valor_pago` da fonte. Nenhuma tela lê essa coluna dessas views hoje (o Contrato 360 a substitui pelo Tesouro). |
| Cartão do contrato (`ContractHealthStrip`) | Usa o pago das faturas, não o da nota (mudado em 16/11/2026 porque a nota mostrava 0%). |

## Regra proposta

**Liquidado e pago da nota vêm do Tesouro sempre que a nota está no saldo contábil.** O campo da fonte fica só como reserva, com o rótulo "pela fonte", para a nota que o Tesouro ainda não tem (5 de 2.396 hoje).

- **Pago** = `pago_total` de `v_empenho_saldo_contabil` (pago do exercício + restos a pagar pagos, de todos os anos).
- **Liquidado** = pago + liquidado a pagar (exercício + restos a pagar), a regra que o Contrato 360 já usa.
- **Saldo** = a liquidar + liquidado a pagar (exercício + restos a pagar), a regra do Financeiro.
- **Sem "o maior dos dois"**: diferente do empenhado da migration 136, aqui o maior é errado em 10 notas da 200330 em que a fonte dobra o pagamento (R$ 0,49 mi a mais).
- **Defasagem:** o Tesouro é lido com um dia de atraso, mais os fins de semana e as falhas (como agora). A fonte não é alternativa melhor, porque não atualiza nunca na 200331. As telas mostram "Tesouro em dd/mm" (já fazem) e passam a avisar quando a leitura tiver mais de 3 dias úteis. Para um pagamento de hoje, a prova continua sendo a OB da fatura (migration 123), que as telas de faturas já mostram.

### Duas formas de aplicar

**A. No banco (recomendada).** Uma migration que:

1. cria `valor_liquidado_fonte` e `valor_pago_fonte` em `empenhos` (como `valor_empenhado_fonte`), guardando o que a API mandou;
2. faz `aplicar_empenhado_do_tesouro` (cron a cada 6 h) gravar liquidado e pago do Tesouro em **todas** as notas que estão no saldo contábil, não só nas TESOURO/PORTAL;
3. faz `save_empenho_soberano_atomic` gravar o valor da fonte só nas colunas `_fonte` e manter o do Tesouro em `valor_liquidado`/`valor_pago` quando houver leitura (hoje ele já faz isso para valor negativo, migration 321).

Efeito medido: 1.367 notas mudam o pago (1.357 sobem, 10 descem); pago somado R$ 172,2 mi → R$ 1.524,0 mi; liquidado R$ 5,1 mi → R$ 1.701,8 mi; contratos "com empenho a pagar" 700 → 391. Todo leitor de `v_empenhos_resumo` passa a ver o mesmo número das telas ("banco igual à tela"), sem mudar código de tela. Cuidado: quando o Tesouro falha, os valores ficam como na última leitura boa, nunca voltam para os da fonte.

**B. Só nas telas.** Trocar `contratosComEmpenhoAPagar` e `calculateFinancialSummary` para lerem `v_empenho_saldo_contabil`, sem migration. Mais rápido, mas o banco continua com o pago da fonte e cada leitor novo precisa lembrar de juntar o Tesouro.

## Decisões para o usuário

1. Liquidado e pago da nota passam a ser os do Tesouro, sem "o maior dos dois"? (Recomendado: sim.)
2. Forma A (no banco, com migration) ou B (só no código)? (Recomendado: A.)
3. Aviso de leitura atrasada do Tesouro a partir de quantos dias úteis? (Sugestão: 3.)
4. Certificado do STA: esperar o Tesouro renovar, avisar o Tesouro, ou ambos? (Desligar a checagem do certificado não é recomendado.)

## Como reproduzir

Comparação das notas de 2026 (rodar com `supabase db query --linked -f arquivo.sql`; só leitura):

```sql
with b as (
 select e.valor_liquidado, e.valor_pago, s.pago_no_ano, s.exercicio_liquidado_a_pagar lap
 from empenhos e join v_empenho_saldo_contabil s on s.empenho_id = e.id
 where e.ano_exercicio = 2026
)
select json_build_object(
 'notas', count(*),
 'pago_igual', count(*) filter (where abs(valor_pago - pago_no_ano) < 0.01),
 'fonte_zero_tesouro_pago', count(*) filter (where valor_pago = 0 and pago_no_ano > 0.01),
 'pago_fonte', sum(valor_pago), 'pago_tesouro', sum(pago_no_ano)
) from b;
```

Leitura da API: `GET https://contratos.comprasnet.gov.br/api/contrato/{id}/empenhos` (campos `empenhado`, `aliquidar`, `liquidado`, `pago`, `rppago`), com o `contrato_id_gov` de `contratos_oficiais` dos contratos ligados às notas em `contrato_empenhos`.

Estado da leitura do Tesouro: `select * from sincronizacao_fontes where recurso = 'saldo_contabil'`.
