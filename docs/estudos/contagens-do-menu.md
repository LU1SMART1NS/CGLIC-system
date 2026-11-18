# Contagens do menu no banco

**Data:** 18/11/2026
**Pergunta:** vale trocar os números do menu, calculados no navegador a partir de listas inteiras, por uma função do banco que devolva só as contagens?

**Resposta curta:** em parte. Contar no banco só ganha muito onde o navegador hoje baixa listas grandes para chegar a um número: o Financeiro e duas filas de Vínculos. Nas filas de regra pesada (Emendas, Fiscalização, Contratos à ata, Alocação) a regra teria de existir duas vezes, em TypeScript e em SQL, e os números podem sair diferentes das telas. Antes disso, um passo sem migration ataca a causa medida: a onda do menu manda todas as consultas pesadas ao banco ao mesmo tempo.

## O que foi medido

### A onda do menu

Ao abrir a Carteira de Contratos como admin (18/11/2026, depois dos PRs #597 a #605), o site faz 104 leituras ao longo de 30 s. A lista aparece em 4 a 6 s. Cerca de 12 s depois de abrir, o menu lê os números dele de uma vez, porque espera a tela encher (`useTelaCarregada`). Nessa onda, as views de Financeiro e Vínculos levam de 8 a 14 s cada uma, e às vezes passam do limite de 8 s (erro 57014).

### Cada view sozinha é rápida

Medido no banco, uma de cada vez, como usuário logado (admin) e como dono do banco. Os dois deram o mesmo resultado, então as regras de acesso não pesam.

| View | Ler tudo | Contar | Tamanho em JSON |
|---|---|---|---|
| `v_contrato_faturas` | 0,30 s | 10 ms | ~5,2 MB |
| `v_contrato_empenho_distribuicao` | 0,20–0,33 s | 9 ms | ~1,9 MB |
| `v_notas_fora_do_contrato` | 0,62 s | 13 ms | ~0,5 MB |
| `v_fatura_conferencia_tesouro` | 0,18–0,21 s | 0,17–0,21 s | ~0,2 MB |
| `v_emendas_empenho_x_pedido` | 0,86 s | 0,39 s | ~0,25 MB |
| `prever_vinculos_automaticos` | — | 0,87 s | — |

Pelo site, as mesmas consultas levam em média de 0,6 a 3,5 s (`pg_stat_statements` desde 29/10/2026), com máximos perto de 8 s.

**Conclusão da medição:** o custo não está em calcular cada view. Está em três coisas:

1. **Tudo junto.** São umas 25 consultas pesadas no mesmo segundo, numa máquina pequena. Cada uma espera as outras, e todas se esticam até 8–14 s.
2. **Volume.** Só `v_contrato_faturas` manda 5 MB em 8 páginas para virar um número.
3. **A carteira inteira para o escopo do gestor.** O Financeiro e os Vínculos carregam `contratos_oficiais` das duas UASGs (cerca de 4 MB) só para saber quais contratos são do gestor e quais estão vigentes.

### Falhas do cron no mesmo horário

Nos picos, o cron falha com "job startup timeout": o banco não consegue nem abrir a conexão do job. Houve 11 casos de 10/11 a 17/11, 3 deles às 14:10, 14:17 e 14:25 UTC de 17/11, enquanto a Carteira era aberta seguidas vezes para medir. Desde o #602 houve um (17/11 às 15:28 UTC).

## Como cada número é calculado hoje

Nenhuma função ou view do banco devolve contagens para o menu. Todo número sai de listas inteiras no navegador e tem de bater com a fila que o clique abre: "número do menu = fila inteira que o perfil resolve".

| Número | Quem vê | O que lê | Regra (onde está) | Levar ao SQL |
|---|---|---|---|---|
| Carteira › Atas a montar | admin, gestor | `v_atas_a_montar` | quantidade de linhas | Fácil |
| Início › Emendas a contratar | admin, gestor | RPC `emendas_a_contratar` | pares pedido+ata distintos; coordenador só os sem gestor (`utils/emendasCcga.ts`, `enviosParaContratar`) | Fácil |
| Início do fiscal › Ordem a emitir | fiscal | RPC `fisc_entregas_lista` | SFC, etapa INFO_ENVIADA, fiscal = usuário | Fácil |
| Ajustes › Grupos de UASGs e de beneficiários | admin; admin e gestor de emendas | `v_uasgs_participantes_gti`; `emenda_beneficiarios` e grupos | sem grupo confirmado (a divisão por sugestão só decide para onde o clique vai) | Fácil no total |
| **Financeiro** | admin, gestor (só os dele) | `v_contrato_faturas` (21 colunas, ~7 mil linhas), `v_fatura_conferencia_tesouro`, ciclos abertos e ligações, carteira de contratos para o escopo | "Precisa de ação": ciclos RECEBIDO, CONFERIDO ou DEVOLVIDO, e faturas em Siafi Erro não pagas, não canceladas e sem liquidação; urgente = Siafi Erro ou prazo da CGLIC vencido (`financeiroCarteiraService.ts`, `resumirPrecisaDeAcao`) | Médio |
| **Vínculos › Notas aos itens e ao contrato** | admin, gestor (só os dele) | `v_contrato_empenho_distribuicao` e carteira de contratos | contrato vigente (`classifyPrazo`), escopo do gestor, situações A_DISTRIBUIR, REVISAR, A_CONFERIR e CORRECAO_NAO_CHEGOU (`vinculacaoEmpenhos.ts`) | Médio |
| Vínculos › Notas fora do contrato | admin, gestor | `v_notas_fora_do_contrato`, `v_empenhos_citados_fora_do_contrato` | tipo da nota, contrato novo do pedido, marca de 7 dias (`notasForaDoContrato.ts`) | Difícil |
| Vínculos › Contratos à ata; Início › atas sem gestor e gestor diferente | admin (e gestor na 1ª) | atas com itens, contratos, `prever_vinculos_automaticos` e mais umas 10 fontes | casamento por fornecedor, compra e item (`contratosSemAta.ts`) | Difícil |
| Alocação › Itens a alocar | admin, gestor de saldo | alocações, vínculos, saldo dos itens das duas UASGs, divisões | nível de alocação e vigência calculados em TS (`contagemExtras.ts`) | Difícil |
| Emendas | admin, gestor de emendas | cerca de 20 tabelas e views de pedidos, notas, SIOP | 22 tipos de aviso com contagem de dias (`emendasPedidos.ts`, 1.523 linhas) | Difícil |
| Fiscalização | fiscal | `fisc_contratos_para_distribuicao`, `fisc_entregas_lista` | próximo passo de cada contrato e dias até o prazo (`fiscalizacaoMesa.ts`) | Difícil |

Os números fáceis são justamente os que já leem pouco (a maior, `v_atas_a_montar`, leva cerca de 0,2 s). Levá-los ao banco quase não muda a carga. O ganho está no Financeiro e nos Vínculos, que são médios.

## Opções

### 1. Menu em etapas, sem migration (recomendado primeiro)

- **O quê:** os grupos do menu saem um depois do outro, e não todos juntos: Financeiro, depois Vínculos, depois Emendas, depois Carteira e Alocação. Cada grupo começa quando o anterior termina ou falha. Hoje todos são ligados pelo mesmo `useTelaCarregada`.
- **Por que:** sozinhas, as views levam menos de 1 s; juntas, 8–14 s e às vezes 57014. Com menos consultas pesadas ao mesmo tempo, cada uma deve voltar perto do tempo dela sozinha, e o banco deixa de engasgar.
- **Arquivos:** `src/components/layout/Sidebar.tsx` e os hooks de contagem (um `enabled` encadeado).
- **Risco:** baixo. Nenhum número muda; os últimos aparecem alguns segundos depois.
- **Como conferir:** a mesma medição no site (número de erros 500, tempo de cada view na onda, falhas "job startup timeout" do cron).

### 2. Financeiro contado no banco (migration)

- **O quê:** função `contagem_financeiro()`, `SECURITY INVOKER`, que devolve `{ total, urgente }` com a regra de "Precisa de ação" e o escopo do gestor feito no banco (pelos gestores dos contratos, como as RPCs que já limitam o gestor às atas dele).
- **Ganho:** o menu deixa de baixar os 5 MB de faturas e a carteira de contratos inteira. É a maior parte do volume da onda.
- **Risco:** médio. A regra passa a existir em dois lugares. Para não divergir: um teste que roda as duas versões sobre os mesmos dados (PGlite), e uma conferência no site depois da publicação (número do menu × tamanho da fila "Precisa de ação").

### 3. Vínculos (notas aos itens e ao contrato) contados no banco (migration)

- **O quê:** igual à opção 2, para as duas filas de notas.
- **Ganho:** menos que o Financeiro (~1,9 MB), mas também tira a carteira de contratos do menu, se a opção 2 já tiver tirado do Financeiro.
- **Risco:** médio. Exige a vigência do contrato no SQL. Hoje ela é `classifyPrazo` em TypeScript, então é mais uma regra em dois lugares.

### 4. Filas difíceis ficam no navegador

Notas fora do contrato, Contratos à ata, Alocação, Emendas e Fiscalização. Levar ao banco seria reescrever as regras inteiras. Antes valeria transformar cada regra numa view que a tela também use; aí o número e a fila sairiam do mesmo lugar.

### 5. Máquina do banco

Ver "Subir o plano do banco" em [inicio-fila-do-banco.md](inicio-fila-do-banco.md). As opções 1 a 3 diminuem os picos, mas o banco segue pequeno para vários usuários abrindo telas ao mesmo tempo. O plano atual não foi conferido neste estudo: a leitura pela API de gerenciamento foi bloqueada nesta sessão.

## Ordem sugerida

1. Opção 1 e medir.
2. Se os picos continuarem, opção 2 (Financeiro), com o teste de equivalência.
3. Opção 3 só se a 2 der resultado.

## Como medir de novo

- **Abertura no site:** no console da Carteira de Contratos, depois de uns 40 s, `performance.getEntriesByType('resource')` filtrado por `rest/v1` dá quantas leituras houve, o `responseStatus` (500 = tempo esgotado), o tempo de cada uma e as repetições.
- **Banco:** `cron.job_run_details` com `return_message = 'job startup timeout'` mostra os picos; `pg_stat_statements` por papel `authenticated` mostra o custo acumulado por view.
- **View sozinha:** bloco `DO` como usuário logado (`set_config('request.jwt.claims', ...)` + `SET LOCAL ROLE authenticated`) que mede `count(*)` e `sum(length(to_jsonb(x)::text))` de cada view e termina em `RAISE EXCEPTION`, para nada ficar gravado.
