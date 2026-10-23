# Projeção de reajuste dos itens das atas

Estudo de 23/10/2026. Nada foi gravado no banco e nenhum código foi alterado.

## 1. O que a AGU recomenda

Base: Orientação Normativa AGU nº 100, de 13/08/2025 (Parecer nº 00022/2025/DECOR/CGU/AGU), Lei 14.133/2021 (art. 25, § 7º; art. 82, VI; art. 92, § 3º) e Decreto 11.462/2023 (art. 25).

| Regra | O que diz | Efeito na projeção |
|---|---|---|
| Cabe reajuste na ata | Pela Lei 14.133, reajuste, repactuação e revisão valem para a ata (ON 100, II) | O preço registrado pode mudar, não só o do contrato |
| Só com cláusula no edital | Reajuste e repactuação exigem previsão expressa no edital (ON 100, III) | Sem cláusula, a ata não entra na projeção |
| Reajuste é de ofício | A Administração aplica o índice sem pedido do fornecedor; não há preclusão (ON 100, IV) | O sistema pode avisar a data e calcular sozinho |
| Data-base | Um ano contado da data do orçamento estimado (Lei, art. 25, § 7º; cláusula do modelo AGU) | A data-base é a do orçamento, não a da ata nem da proposta |
| Reajustes seguintes | Um ano a partir dos efeitos financeiros do último reajuste | Cada apostilamento reinicia a contagem |
| Alcance | Só para obrigações iniciadas e concluídas depois da anualidade | O impacto incide sobre o saldo ainda não contratado |
| Forma | Apostilamento | O sistema registra o apostilamento como fato |
| Repactuação | Só a pedido; preclui se o fornecedor não pedir até a prorrogação da ata (ON 100, V) | Fora da projeção automática; serve só para serviços com mão de obra |
| Revisão por álea extraordinária | A qualquer tempo, sem previsão no edital (ON 100, VI) | Fora da projeção, porque não é previsível |
| Prorrogação sem cláusula | Pode prorrogar sem reajuste, com anuência formal do fornecedor (ON 100, VII) | Vira um aviso na prorrogação, não uma conta |

Cláusula padrão encontrada nos editais da SENASP (modelo da Câmara Nacional de Modelos da CGU): preços fixos por um ano contados da data do orçamento estimado; depois, reajuste de ofício pelo índice indicado; índice provisório se o definitivo atrasar; reajuste por apostilamento.

## 1.1 Data-base usada pela CGLIC: Termo de Conformidade da pesquisa de preços

Informação do usuário em 23/10/2026: depois da pesquisa de preços, o setor competente emite o Termo de Conformidade da pesquisa de preços. A contagem do reajuste começa na data desse termo.

Verificação nos documentos das atas publicados no PNCP:

- Seis termos aditivos de janeiro de 2026 dizem "considerando o período do orçamento estimado de 10/2024 a 09/2025, de acordo com a conformidade da pesquisa de preços à época", seguido do número SEI do termo.
- Em 80 apostilamentos e termos aditivos, o texto traz o período do IPCA e, logo depois, um número de documento SEI.
- Os números de documento do SEI crescem com o tempo. Com 400 pares de número e data tirados dos próprios PDFs, foi possível estimar a data de cada documento citado.

| Resultado da comparação | Documentos |
|---|---|
| Documento citado é do mesmo mês em que começa o período do IPCA | 37 |
| Documento citado é do mês vizinho, dentro da margem da estimativa | 23 |
| Documento citado é bem posterior, provavelmente a memória de cálculo do reajuste | 16 |
| Não confere | 4 |

Conclusão: a data-base é o Termo de Conformidade, e o período do IPCA vai do mês do termo até o mês anterior ao aniversário. A chave dos 12 meses do protótipo foi retirada.

Consequências para o sistema:

- O Termo de Conformidade fica no SEI, que não é público. O sistema não consegue ler o termo sozinho.
- Para a ata já reajustada, o apostilamento dá o mês do termo e, quase sempre, o número SEI dele.
- Para a ata ainda sem reajuste, o gestor informa a data e o número SEI do termo. A data do orçamento escrita no edital serve só de sugestão. Ela coincidiu com o termo em alguns casos, mas não em outros: na ata 00079/2024 o edital diz 30/07/2024 e o termo é de setembro de 2024.
- O percentual do apostilamento está no PDF mesmo quando o título não traz. Na ata 00032/2025, o PDF diz 4,44% com período de 02/2025 a 01/2026.

## 2. O que foi medido

Leitura dos editais publicados no PNCP das compras com ata vigente em que a SENASP é gerenciadora.

| Medida | Quantidade |
|---|---|
| Atas vigentes no banco | 155 |
| Itens dessas atas | 493 |
| Compras gerenciadas pela SENASP com ata vigente | 64 |
| Editais lidos com texto | 62 |
| Índice IPCA | 50 |
| Índice ICTI (tecnologia da informação) | 5 |
| Cláusula sem índice reconhecido | 2 |
| Sem cláusula de reajuste encontrada | 5 |
| Data do orçamento preenchida no edital | 40 |
| Data do orçamento em branco no edital | 10 |
| Data do orçamento não encontrada | 12 |

Outros fatos:

- A data do orçamento costuma ficar cerca de 2 meses antes da abertura das propostas. O menor intervalo foi de 10 dias e o maior de 247 dias.
- Por isso o primeiro aniversário chega cedo. Na ata 00031/2025, o orçamento é de abril de 2024 e a ata começou em junho de 2025: o preço já tinha mais de um ano quando a ata foi assinada.
- A leitura automática erra às vezes. Duas datas lidas ficaram depois do início da ata, o que é impossível. A data lida precisa de confirmação humana.
- Na minuta de contrato do edital, a data do orçamento muitas vezes fica como "__/__/__". A data correta está no processo SEI, no mapa de preços.

Fontes de índice testadas:

| Fonte | O que entrega | Situação |
|---|---|---|
| Banco Central, série 433 do SGS | IPCA mensal oficial | Aberta, sem chave; último mês publicado: setembro de 2026 |
| Banco Central, Focus mensal | Mediana do mercado para o IPCA de cada mês futuro | Aberta, sem chave; projeção até outubro de 2028 |
| Ipea | ICTI | Não testada |

## 3. Como a projeção funcionaria

Para cada item da ata com cláusula de reajuste:

1. Data-base = data do orçamento estimado, ou a data de efeito do último reajuste apostilado.
2. Próximo aniversário = data-base + 1 ano, depois + 2 anos, até o fim da vigência da ata.
3. Percentual = variação acumulada do índice em 12 meses. Meses já publicados usam o índice oficial; meses futuros usam a mediana do Focus. A tela mostra quantos meses são reais e quantos são estimados.
4. Preço projetado = preço registrado × (1 + percentual).
5. Impacto = saldo do item × preço registrado × percentual.

Situações do item:

| Situação | Quando |
|---|---|
| Reajuste devido | O aniversário passou e não há apostilamento registrado |
| Reajuste em N dias | Aniversário dentro da vigência da ata |
| Sem reajuste na vigência | O próximo aniversário cai depois do fim da ata |
| Data-base a informar | Edital com cláusula, mas sem data do orçamento confirmada |
| Sem cláusula | Edital sem reajuste; na prorrogação, pedir a anuência do fornecedor |

## 4. Exemplos com dados reais

Índice oficial do Banco Central até setembro de 2026 e Focus de 16/10/2026. Janela usada: do mês da data-base até o mês anterior ao aniversário.

| Ata e item | Data do orçamento | Aniversário | IPCA de 12 meses | Preço registrado | Preço reajustado | Saldo | Impacto no saldo |
|---|---|---|---|---|---|---|---|
| 00024/2026 item 2 | 26/09/2025 | 26/09/2026, já passou | 4,22%, 12 meses reais | R$ 75.000,00 | R$ 78.167,59 | 6 | R$ 19 mil |
| 00024/2026 item 3 | 26/09/2025 | 26/09/2026, já passou | 4,22%, 12 meses reais | R$ 65.650,00 | R$ 68.422,70 | 37 | R$ 103 mil |
| 00044/2026 item 1 | 11/06/2026 | 11/06/2027, ata vai até 08/09/2027 | 4,33%, 4 meses reais e 8 do Focus | R$ 45.200,00 | R$ 47.158,83 | 1.838 | R$ 3,6 milhões |

## 4.1 Projeção item a item

A projeção é por item. A ata, ou o edital, dá só a data-base e o índice, que valem para todos os itens da mesma compra. Cada item tem o seu preço, o seu saldo e o seu fornecedor, e por isso tem o seu próprio preço reajustado e o seu próprio impacto. Quando o edital usa índices diferentes por item ou grupo, o índice também fica no item. Quando um reajuste é apostilado só para alguns itens, a data-base seguinte também passa a ser do item.

Cálculo feito em 23/10/2026 para os 484 itens das compras lidas. Arquivo com todos os itens: `docs/estudos/projecao-reajuste-itens.csv`.

Para cada item o cálculo compara três números:

- preço homologado na licitação, lido do resultado do item no PNCP;
- preço atual no banco, que a fonte já atualiza depois do apostilamento;
- preço devido hoje, que é o homologado corrigido por todos os aniversários já passados.

| Situação do item | Itens | Atas | Impacto no saldo |
|---|---|---|---|
| Em dia: preço atual igual ao devido | 54 | 24 | nenhum |
| Reajuste devido, não aplicado | 71 | 37 | R$ 10,7 milhões |
| Parte aplicada, há um ciclo devido | 68 | 24 | R$ 3,4 milhões |
| Data-base a informar | 116 | | |
| Sem cláusula encontrada | 147 | | |
| Índice a informar, ICTI ou data lida errada | 26 | | |
| Preço homologado não lido | 2 | | |

O próximo aniversário dentro da vigência dos itens calculados soma R$ 45,5 milhões de impacto estimado no saldo.

Exemplos:

| Ata e item | Homologado | Atual | Já aplicado | Devido hoje | Situação |
|---|---|---|---|---|---|
| 00018/2025 item 2, automóvel | R$ 289.017,00 | R$ 301.912,31 | 4,46% | 4,26% | Em dia |
| 00031/2025 item 1, arma de fogo | R$ 5.304,53 | R$ 5.578,90 | 5,17% | 9,85% em dois ciclos | Parte aplicada |
| 00032/2025 item 1, automóvel | R$ 355.230,00 | R$ 355.230,00 | 0% | 4,44% | Devido, não aplicado no banco |

**Correção de 23/10/2026.** A tabela acima conta todos os ciclos a partir da data do orçamento. Pela cláusula do edital, cada reajuste seguinte conta um ano a partir dos efeitos do reajuste anterior. Como a CGLIC aplica o reajuste na prorrogação, o ciclo seguinte também anda para frente. Com essa contagem, os 68 itens com "parte aplicada" ficam em dia, e o impacto de R$ 3,4 milhões deixa de existir. O protótipo já usa a contagem correta.

O protótipo da aba Reajuste na Ata 360 foi aprovado pelo usuário em 23/10/2026.

## 4.2 Projeção com as regras aprovadas (23/10/2026)

Regras aprovadas pelo usuário:

- a data-base é o Termo de Conformidade da pesquisa de preços;
- o IPCA conta do mês do termo até o mês anterior ao aniversário;
- o reajuste vale na assinatura da ata, se o aniversário já passou, ou senão na prorrogação, para o novo ciclo de vigência;
- cada reajuste seguinte conta um ano a partir dos efeitos do anterior.

A regra da assinatura foi conferida nas atas 00007/2026 a 00011/2026: o termo é de fevereiro de 2025, as atas começaram em março de 2026 e foram reajustadas por apostilamento poucos dias depois. Há exceções reajustadas no meio da vigência, como a 00033/2025 e a 00059/2025.

Cálculo refeito para os 484 itens, com o preço homologado de cada item lido no PNCP e os percentuais lidos nos PDFs de 90 atas com reajuste publicado. Planilha: `docs/estudos/projecao-reajuste-itens.csv`.

| Situação do item | Itens | Atas | Impacto no saldo |
|---|---|---|---|
| Em dia | 280 | 64 | nenhum |
| Reajuste publicado, preço do banco sem o reajuste | 17 | 14 | R$ 9,4 milhões |
| Prorrogada sem reajuste encontrado, a conferir | 13 | 5 | R$ 0,1 milhão |
| Reajuste previsto dentro da vigência | 8 | 4 | R$ 0,1 milhão no próximo |
| Reajuste só se a ata for prorrogada | 83 | 35 | R$ 5,4 milhões no próximo |
| Termo de Conformidade a informar | 69 | 20 | sem cálculo |
| ICTI ou sem cláusula | 14 | 9 | sem cálculo |

Esta tabela substitui as contagens da seção 4.1. Lá, os ciclos foram contados pela data do orçamento, e os itens sem preço homologado lido usaram o preço atual como base.

### O que isso mostrou

- **A conta do sistema bate com a da CGLIC.** Nos cinco apostilamentos que trazem o período no título, o IPCA acumulado mês a mês deu exatamente o percentual publicado: 4,46%, 5,17%, 5,13%, 4,44% e 9,67%.
- **A CGLIC já publica os reajustes no PNCP.** São 21 documentos com "reajuste" no título, com o percentual e o período. O sistema pode ler esses documentos.
- **O preço do banco nem sempre acompanha o apostilamento.** As atas 00032/2025 e 00034/2025 têm o reajuste publicado em setembro de 2026, mas o banco ainda guarda o preço homologado. Por isso o sistema precisa ler o documento, e não só o preço.
- **A CGLIC reajusta na prorrogação.** Os textos dizem "para aplicação no novo ciclo de vigência da Ata". Por isso muitos itens aparecem com um segundo ciclo devido: pela contagem da lei ele já venceu, mas a prática espera a próxima prorrogação.
- **A janela dos 12 meses muda de uma ata para outra.** Comparando com a data do orçamento lida no edital, a ata 00011/2026 usou o mês do orçamento até o mês anterior ao aniversário. A ata 00093/2024 começou no mês seguinte ao orçamento. A ata 00018/2025 começou no mês anterior. A ata 00059/2025 juntou 21 meses num só reajuste.

## 5. Decisões em aberto

1. **Janela dos 12 meses: resolvida.** O período vai do mês do Termo de Conformidade até o mês anterior ao aniversário, como nos apostilamentos. Texto anterior: No exemplo da ata 00024/2026, contar de setembro de 2025 a agosto de 2026 dá 4,22%. Contar de outubro de 2025 a setembro de 2026 dá 4,58%. O edital não diz qual, e os apostilamentos da CGLIC usaram janelas diferentes. O sistema precisa de uma regra única, e o gestor pode ajustar a janela no caso concreto.
2. **Quem informa o Termo de Conformidade.** Proposta: o gestor da ata informa a data e o número SEI do termo quando a ata ainda não tem reajuste publicado.
3. **Reajuste no aniversário ou na prorrogação: decidido.** Vale na assinatura, se o aniversário já passou, ou na prorrogação. Texto anterior: Pela lei e pela cláusula, a contagem começa no orçamento, então o reajuste pode vencer no meio da vigência da ata. A prática da CGLIC é aplicar na prorrogação, para o novo ciclo. A escolha muda a situação de 68 itens e o impacto de R$ 3,4 milhões. O sistema pode seguir qualquer das duas regras; a decisão jurídica fica com a CONJUR.
4. **Contratos que saem da ata.** O contrato tem a mesma data-base, pela sua própria cláusula. Hoje o radar de reajuste dos contratos usa a data de assinatura, porque o campo da data da proposta nunca é preenchido pelas fontes. Assim o marco dos contratos tende a sair atrasado. Vale corrigir junto.
5. **ICTI e outros índices.** Cinco atas usam o ICTI. É preciso testar a série do Ipea. Sem projeção de mercado para o ICTI, a parte futura usaria a média dos últimos 12 meses.

## 6. Caminho proposto

1. **Protótipo** da gaveta "Reajuste" na Ata 360 e da coluna no Item 360, com os exemplos reais acima.
2. **Banco:** parâmetros de reajuste por ata, com exceção por item (índice, data do orçamento, origem da informação, documento SEI, quem e quando); reajustes apostilados por item (data de efeito, período, percentual, novo preço, documento); preço homologado de cada item; índices mensais oficiais e projetados.
3. **Servidor:** recurso novo no sincronizar-fontes que lê o IPCA e o Focus do Banco Central uma vez por dia, e outro que lê os documentos das atas no PNCP para achar apostilamentos de reajuste.
4. **Carga inicial:** gravar as datas e os índices lidos dos editais como "lido do edital, a confirmar", e os 21 reajustes já publicados.
5. **Telas e avisos:** gaveta na Ata 360, coluna no Item 360 e motivo "Reajuste da ata" no Início para o gestor da ata.

Fontes: ON AGU nº 100/2025 no Diário Oficial da União; página de Orientações Normativas da AGU; editais das compras no PNCP; API SGS e API Expectativas do Banco Central.
