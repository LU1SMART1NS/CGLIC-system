# As outras telas: leituras que falham caladas, param em 1.000 ou pesam demais

Estudo de 16/10/2026. Pergunta: o Início foi consertado em camadas (#241, #244, #248, #250 e migrations 147 a 149). As outras telas precisam da mesma revisão?

**Resposta curta: sim.**

- O conserto no banco (views mais rápidas, permissões) já vale para todas as telas.
- O aviso de falha (`lerFonte` + faixa "não carregou") existe **só no Início**, e lá ainda tem buracos.
- Nas outras nove telas, quando uma leitura falha, a tela mostra quase sempre "nenhum", "0", "Não atribuído" ou "Ata não encontrada", como se fosse verdade.
- Há **um caso que pode gravar dado velho** no Item 360.
- Há **duas leituras paginadas com ordem não única** que já hoje podem repetir ou pular linhas.

Nada aqui muda o sistema. É só leitura de código. A contagem de linhas no banco ficou pronta num script, mas não rodou (ver abaixo).

Telas olhadas:

- Carteira de Atas, Contratos e Itens
- Alocação
- Vínculos: Contratos à ata, Empenhos aos itens, Empenhos ao contrato
- Financeiro: Pagamentos, Previsão, Empenhos
- Ata 360, Contrato 360 e Item 360

O menu lateral ficou de fora: já foi tratado no estudo do Início (`docs/estudos/inicio-fila-do-banco.md`). O desvio de `fetchContratosParaTela` para as fontes oficiais no navegador também ficou de fora: outra sessão está consertando. Basta saber que Contratos, Vínculos, Financeiro e as três telas 360 passam por ele.

## O que foi medido e o que falta medir

- **Lido no código:** toda a árvore rota → componente → hook → serviço → tabela, view ou API de cada tela.
- **Não medido no banco:** o verificador automático do Claude Code bloqueou a leitura do banco de produção nesta sessão, como no estudo anterior. O script está pronto em `scripts/estudo-telas-contagem.sql`. É um único `SELECT`, que não grava nada. Ele devolve:
  - para cada fonte sem paginação: as linhas de hoje e quanto falta para 1.000;
  - as linhas repetidas nas duas páginas com ordem não única;
  - o tamanho da URL do `IN` de ciclos.
- **Números já conhecidos (16/10/2026, estudo do Início):**

  | Tabela | Linhas |
  |---|---|
  | Itens de ata | 667 |
  | Atas | 214 |
  | Contratos (200331) | 1.081 |
  | Gestores de contrato | 537 |
  | Empenhos | 2.049 |
  | Vínculos nota×contrato (`contrato_empenhos`) | 2.116 |
  | Faturas | 7.142 |
  | Alocações | 42 |

- **Não medido no navegador:** o número de pedidos de cada tela. O sistema exige login (ver "Como medir").

## Achados, do mais grave ao mais leve

### 1. Pode gravar dado velho (Item 360)

`fetchAllocationsWithState` e `fetchEmpenhoLinksWithState` (`src/services/allocationService.ts:92-150` e `:217-270`) tratam uma falha do banco assim:

1. Devolvem a cópia guardada no navegador (`localStorage`), ou uma lista vazia.
2. Marcam essa cópia com **versão 1**.
3. A consulta termina como **sucesso**.

O Item 360 tem uma limpeza automática (`src/components/ItemBalances.tsx:548-565`). Ela **grava** os vínculos nota↔unidade "que sobram", calculados sobre essa cópia.

A trava de versão do banco segura quase todos os casos: se o item já foi salvo alguma vez, a versão real é maior que 1 e o banco recusa. O risco fica nos itens que ainda estão na versão 1. Ali, uma cópia antiga do navegador pode sobrescrever o que outra pessoa gravou.

A mesma cópia do navegador também aparece, sem aviso, na Carteira de Itens e na Alocação (`fetchAllAllocationsGlobal`, `:26-85`).

### 2. Dado errado hoje, mesmo sem falha

Na tela **Empenhos** (`fetchEmpenhosCarteira`, `src/services/financeiroCarteiraService.ts:394-395`), duas tabelas são lidas em páginas de mil com ordem **que não é única**:

- `contrato_empenhos` por `empenho_id`: são 2.116 linhas, logo 3 páginas;
- `fatura_empenhos` por `id_fatura`: a chave é `id_fatura + id_empenho_gov`.

Sem ordem única, o banco pode devolver as linhas empatadas em outra ordem a cada página. Aí repete umas e pula outras. Uma nota pode sair sem o contrato, ou o "pago" pode sair a mais ou a menos. O painel do Início lê a mesma `contrato_empenhos` por `id`, que é o certo.

### 3. Falha vira "nenhum" sem aviso

Nenhuma das nove telas usa o padrão do Início. Os casos abaixo valem para várias telas de uma vez, porque elas dividem as mesmas leituras.

| # | Leitura que engole o erro | Onde (arquivo:linha) | O que a pessoa vê | Telas |
|---|---|---|---|---|
| 3a | Atas e itens do banco | `dbCacheService.ts:182-184` e `:284-289` (`fetchArpsWithItemsFromDb`); `:93-156` (`fetchArpsFromDb`) | "0 atas", "Nenhum item…", **"Ata não encontrada"** | Carteira de Atas, Itens, Alocação, Contratos à ata, Ata 360, Item 360 **e Início** |
| 3b | Gestores das atas e dos contratos, e vínculos item↔contrato | `ataManagerService.ts:61-64`, `contractManagementService.ts:149-152`, `arpContractLinkService.ts:246-249` e `:287-290` | Coluna Gestor vazia. O **perfil gestor vê a carteira vazia** e "Acesso não autorizado" nas telas 360. Em Contratos à ata, **todos os contratos aparecem sem ata**. | Todas |
| 3c | Decisões já tomadas | `avisosResolvidosService.ts:130-133`, `contratoSemAtaService.ts:27-30`, `contratoAtaDescarteService.ts:36-39`, `complexidadeAjusteService.ts:45-48` | Avisos resolvidos, contratos "sem ata", atas descartadas e "deixar como está" **voltam a aparecer** | Início, Vínculos, Ata 360, Contrato 360 |
| 3d | Saldo dos itens: o serviço lança o erro, mas a tela ignora | `useAta.ts:113` (`useAtaItemSaldos`), `ItensUnidadesPage.tsx:117` | Ata 360: item com 0% consumido e saldo cheio. Item 360: a base do saldo vira o homologado. Alocação: "Nenhum item com quantitativo SENASP". | Ata 360, Item 360, Alocação |
| 3e | Erro só aparece se a lista inteira vier vazia | `PagamentosCarteira.tsx:155`, `EmpenhosItensPage.tsx:233`, `EmpenhosCarteira.tsx:156`, `ContratosAtaPage.tsx:72`, `ContractsRoute.tsx:123` | Uma fonte falha e outra carrega: dado parcial calado. Ex.: faturas falham e ciclos carregam. Ex.: contratos falham e Contratos à ata diz "Todos os contratos têm ata". | Financeiro, Vínculos, Contratos |
| 3f | Hooks que não repassam o erro | `useContratosDoFinanceiro.ts:37`, `usePrevisaoMensal.ts:96-105`, `useFinanceiroCarteira.ts:66`, `useCarteiraItens.ts:63-65`, `useContractPaymentFollowUp`, `useQuantitativosDoItem.ts:27`, `useGruposGti.ts:21/27` | Gestor vê o Financeiro todo zerado. Previsão sai "nada a pagar". Ciclos do contrato vazios. Contratado e empenhado do item zerados. GTI some. | Financeiro, Carteiras, Contrato 360, Item 360 |
| 3g | Conferência do Tesouro | `financeiroCarteiraService.ts:96` (`.catch(() => new Map())`) | Contadores do Tesouro zeram | Pagamentos, Empenhos, Previsão |
| 3h | Adesões do item na API | `api.ts:1795-1797` (`break` no erro) e `:1818-1821`; `useItemAdesoes.ts:29` | Lista de adesões **pela metade**, ou "nenhuma adesão" | Item 360 |
| 3i | Itens de ata buscados no Compras.gov.br/PNCP **pelo navegador** | `ArpSearch.tsx:215-219` → `useAtasPortfolio.ts:109-113` → `api.ts:1058`, `:1184-1188` | A ata fica sem itens e o `[]` fica guardado até recarregar | Carteira de Atas |
| 3j | Outros menores | `contratoEmpenhosSincronizacaoService.ts:260-263` ("nunca sincronizado"); `distribuicaoEmpenhoService.ts:191-194` (some a nota do SIAFI); `contractEmpenhosDbService.ts:49` (lista parcial); planos e gestor das telas 360 mostram "sem plano" e "Não atribuído" | — | Telas 360, Vínculos |

**O Início também tem buracos.** Seis das 14 fontes do painel devolvem vazio **antes** de chegar ao `lerFonte` e por isso nunca entram na faixa "não carregou":

- atas: 3a, via `fontesDoPainelNoCache` → `getAtaSourceQueryOptions`;
- gestores e planos dos contratos: `contractManagementService.ts:149` e `:381`;
- planos das atas: `ataManagementService.ts:286`;
- avisos resolvidos: 3c;
- ciclos de pagamento: `dashboardService.ts:1849-1852`.

Ex.: se a leitura das atas falha, o Início perde todos os avisos de atas sem dizer nada.

**Telas que já fazem certo:** no Contrato 360, responsáveis, garantias e histórico (`lerComCopia` com `falharSeErro: true`). Também os erros de itens, empenhos e faturas do contrato, e o gestor no cabeçalho do Item 360.

### 4. Leituras que param em 1.000 sem avisar

O PostgREST corta em 1.000 linhas. Ele não avisa: a tela recebe as primeiras mil e segue.

"Hoje" = número conhecido; "a contar" = sai do script.

| Fonte e filtro | Onde | Telas | Hoje | Folga |
|---|---|---|---|---|
| `v_arp_item_saldo_detalhado`, uma UASG (13 colunas ou todas) | `dashboardService.ts:1962-1973` | Carteiras de Atas e Itens, Alocação, Contratos, Ata 360, Item 360, Início | até 667 (total de itens das duas UASGs) | ~330. **É o maior risco**: cresce com cada ata nova. |
| `contract_payment_cycle_checklist`, `_events`, `_documents`, `_itens`, `_faturas` por `IN` de ciclos de **um** contrato | `paymentCycleRpcAdapter.ts:81-85` | Contrato 360 | a contar | 16 linhas de checklist por ciclo: passa de 1.000 com ~63 ciclos num contrato |
| `contrato_entregas_previstas` (tudo, por data crescente) e `contrato_expectativa_pagamento` | `expectativaPagamentoService.ts:41-42` | Previsão, Contrato 360, avisos de pagamento | a contar | O corte tira as **entregas mais novas** |
| `v_contrato_empenho_distribuicao`, tudo | `distribuicaoEmpenhoService.ts:248` | Empenhos (coluna Itens) | a contar (uma linha por NE ligada a contrato: perto das 2.116 de `contrato_empenhos`) | **Provavelmente já passou de 1.000.** Conferir primeiro. |
| `v_contrato_empenho_distribuicao`, fila (A_DISTRIBUIR/REVISAR, pelo valor, equipe em 30 dias) | `distribuicaoEmpenhoService.ts:226` | Vínculos › Empenhos aos itens | a contar (308 a distribuir em 08/10) | — |
| `contract_payment_cycles` por `IN` de **todos** os contratos da UASG (1.081 chaves numa URL de ~19 kB), sem lotes | `paymentCycleRpcAdapter.ts:59-63`, via painel | Início e toda tela que carrega o painel | a contar | Além do corte, a URL pode ser recusada. A falha vira `[]` calado (3, Início). **Conferir ao vivo.** |
| `contract_payment_cycles` em aberto + `contract_payment_cycle_itens` por `IN` | `financeiroCarteiraService.ts:521-535` | Pagamentos, Previsão | a contar | — |
| RPC `prever_vinculos_automaticos`, situação MANUAL | `vinculoAutomaticoService.ts:69` | Contratos à ata | a contar (407 sem ata em 08/10) | ~600 |
| `ata_managers`, tudo | `ataManagerService.ts:44` | Todas (escopo do gestor) | até 214 (uma por ata) | ~790 |
| `v_vinculos_a_conferir`, `v_contrato_itens_empenhado_acima` (38), `atas_fornecedor_pncp` | serviços de mesmo nome | Início e telas que carregam o painel; filas de Ações das telas 360 | pequenas | folgadas hoje |
| Tarefas por `IN` (`contract_tasks`, `ata_tasks`, `*_macrotasks`), `ata_task_plans` | `contractManagementService.ts:304/317`, `ataManagementService.ts:206-225` | painel | a contar | URL longa com muitos planos |

Os itens embutidos nas atas (`itens_ata(*)`) vêm dentro de cada ata, e as atas já são paginadas: sem risco hoje.

### 5. Leituras repetidas ou pesadas demais para o que a tela mostra

1. **O painel inteiro do Início, duas vezes, em telas que não o mostram.** `useContractsPortfolio` (`src/hooks/useContractsPortfolio.ts:60-67`) monta o painel das duas UASGs: 13 fontes cada, com saldo `*`, empenhos, ciclos e vínculos a conferir.
   - Telas que passam por ele: Contratos, as três de Vínculos e as três do Financeiro (via `useContratosDoFinanceiro` e `usePendenciasVinculoAta`).
   - Financeiro e Empenhos aos itens/ao contrato só usam número, fornecedor, gestor e vigência.
   - Contratos à ata só usa o painel no modal "Atribuir gestor"; a Carteira de Contratos, na coluna "Pendências".
   - É o corte 5 do estudo do Início, que ainda não foi feito. **É o maior ganho de fila fora do Início.**
2. **As telas 360 leem a carteira inteira para mostrar um instrumento:**
   - contratos: 1.081 registros, 4,1 MB;
   - todas as atas da UASG com todos os itens;
   - o saldo de todos os itens da UASG com todas as colunas;
   - `v_ata_gti_fatias` inteira;
   - no Item 360, `arp_item_contract_links` inteira.
   Isso vale até para o perfil gestor de saldo no Item 360, que nem vê contratos.
3. **O saldo dos itens com duas chaves de cache** (13 colunas na carteira, todas nas telas 360 e no painel). Na Carteira de Contratos ele é lido 4 vezes, e 2 dessas leituras são jogadas fora (`useCarteiraItens.ts:47-48` roda mesmo com `apenasUnidadesDeContratos`).
4. **Leituras sem uso:**
   - `useAtasPortfolio.ts:127-128` lê `empenho_links` e `arp_allocations` inteiras e ninguém usa o resultado (Atas, Itens, Alocação, Contratos à ata);
   - a Alocação lê `v_arp_item_contrato_empenhado` inteira sem mostrar, e ainda espera por ela para sair do "Carregando".
5. **Contrato 360:** `v_contrato_faturas` é lida 3 vezes com chaves diferentes, e `contrato_empenhos` 2 vezes.
6. **Modal fechado:** o "Vincular contrato" (`LinkContractModal`) dispara 5 consultas mesmo fechado. Na Ata 360 isso acontece para coordenador e gestor; no Item 360, para todos os perfis.
7. **Previsão:** carrega os empenhos inteiros (6 fontes, inclusive o saldo do Tesouro) e relê tudo cada vez que as faturas são relidas (`useFinanceiroCarteira.ts:38`).
8. **Carteira de Atas:** a cada troca de filtro, até 15 atas sem itens no banco disparam chamadas ao Compras.gov.br e ao PNCP pelo navegador, fora do cache. Isso contraria "navegador só lê".
9. **Escopo do gestor:** `useAssignedManagementScope` lê os gestores de contratos e de atas em todos os perfis, mesmo quando o resultado não é usado.

## Consertos propostos, em ordem

Todos dão para fazer **só no navegador**, sem migration. Cada um cabe num PR pequeno.

### 1. Item 360 sem cópia do navegador (achado 1)

- **O quê:**
  - `fetchAllocationsWithState`, `fetchEmpenhoLinksWithState` e `fetchAllAllocationsGlobal` lançam o erro em vez de usar o `localStorage`.
  - A limpeza automática só roda com as duas leituras vindas do banco.
  - A cópia no navegador pode ser apagada: o sistema não funciona fora do ar.
- **Arquivos:** `src/services/allocationService.ts`, `src/components/ItemBalances.tsx` e os testes de `allocationService`.
- **Risco:** baixo. Sem banco, a aba mostra erro em vez de números velhos.

### 2. Ordem única nas páginas de Empenhos (achado 2)

- **O quê:** `contrato_empenhos` passa a ser lida por `id`, e `fatura_empenhos` por `id_fatura, id_empenho_gov`. Com isso `lerTudo` precisa aceitar mais de uma coluna de ordem.
- **Arquivo:** `src/services/financeiroCarteiraService.ts`.
- **Risco:** baixo. Conferir que os totais da tela Empenhos ficam iguais ou mais certos.

### 3. Atas, gestores, vínculos e decisões param de engolir o erro (achados 3a a 3c)

- **O quê:** tirar os `catch` que devolvem `[]` ou `{}` em:
  - `fetchArpsWithItemsFromDb` e `fetchArpsFromDb` (separar "o banco não tem" de "falhou");
  - `fetchAllAtaManagers` e `fetchAllContractManagers`;
  - `fetchAllContractTaskPlans` e `fetchAllAtaTaskPlans`;
  - `fetchAllArpItemContractLinks` e `fetchArpItemContractLinksByAta`;
  - `fetchAvisosResolvidos`, `fetchContratosSemAta`, `fetchDescartesAtaContrato` e o ajuste de complexidade;
  - `fetchAllPaymentCyclesForDashboard`.
- **Ganho no Início:** as 6 fontes que hoje escapam passam a cair no `lerFonte`, que já usa a última leitura boa e avisa na faixa.
- **Arquivos:** os serviços acima. Também os hooks que os usam, que ficam com `isError`.
- **Risco:** médio.
  - Muitas telas usam essas leituras. Uma tela que hoje "funciona com vazio" passa a mostrar erro e precisa de um estado de erro (passo 4).
  - Conferir os testes que esperam `[]`.
  - Na sincronização, `api.ts:281` usa `fetchArpsFromDb` como reserva: lá o erro precisa continuar tratado.

### 4. Aviso de leitura falha em cada tela (achados 3d a 3j)

- **O quê:** levar o padrão do Início às outras telas, com uma peça comum:
  - um hook `useLeiturasComFalha([{ rotulo, query }])` junta as consultas da tela e devolve as que falharam;
  - o mesmo `FontesComFalhaAviso` (hoje em `src/components/instrumentos/`, a mover para `src/components/fonte/`) mostra "Não carregou: gestores, saldo dos itens…" com "Tentar novamente".
- **Mudanças nas telas:**
  - Trocar os `ErrorState` que só aparecem com a lista vazia por essa faixa.
  - Expor o erro em `useContratosDoFinanceiro`, `usePrevisaoMensal`, `useFinanceiroCarteira` (ligações), `useCarteiraItens` (vínculos e empenhos), `useContractPaymentFollowUp`, `useAtaItemSaldos`, `useQuantitativosDoItem` e `useGruposGti`.
  - No Item 360, `fetchAdesoesItem` com `falharSeErro`, e não aceitar uma lista parcial.
  - A conferência do Tesouro entra na faixa em vez de zerar.
- **Ordem sugerida:** Financeiro e Vínculos primeiro (contagens que orientam trabalho), depois as Carteiras e a Alocação, por último as telas 360.
- **Arquivos:** novo `src/components/fonte/useLeiturasComFalha.ts`. Também os hooks acima e as páginas das nove telas.
- **Risco:** baixo por tela. Nenhum número muda quando tudo carrega.

### 5. Paginação onde falta (achado 4)

- **O quê:** pôr `lerTodasAsPaginas`, com ordem por coluna única, em:
  - `fetchArpItemSaldosFromDb` (por `item_key`);
  - `fetchAllAtaManagers` (por `ata_key`);
  - as três leituras de `v_contrato_empenho_distribuicao`;
  - `fetchExpectativasPagamento`;
  - `fetchCiclosEmAberto`;
  - `fetchPaymentCycleDetails`;
  - `fetchVinculosAConferir`, `fetchEmpenhadoAcima` e `fetchRegistrosFornecedorPncp`;
  - a RPC `prever_vinculos_automaticos`.
- **IN longos:** os `IN` grandes passam a ir em lotes de 100 a 200, como já fazem `itens_contrato` e `uasgs_grupo_gti`. São os ciclos por contrato do painel, os itens dos ciclos e as tarefas.
- **Arquivos:** os serviços citados na tabela do achado 4.
- **Risco:** baixo. Cada view precisa de uma coluna única para ordenar; conferir na view antes.
- **Antes:** rodar o script de contagem. O que já estiver perto de 1.000 vai primeiro.

### 6. Cortar leituras pesadas e sem uso (achado 5)

- **a. Telas sem o painel do Início (corte 5 do estudo anterior):**
  - `useContratosDoFinanceiro` e `usePendenciasVinculoAta` usam uma versão leve de `useContractsPortfolio`, sem `useManagementDashboard`;
  - o modal "Atribuir gestor" de Contratos à ata lê o painel só quando abre.
  - **Ganho:** some o painel duplo de 6 telas. É o maior ganho fora do Início.
- **b. Leituras sem uso:**
  - tirar os conjuntos `empenhosDbSet`/`allocationsDbSet` de `useAtasPortfolio`;
  - `enabled` no saldo de `useCarteiraItens` quando é só para unidades de contratos;
  - a Alocação sem `v_arp_item_contrato_empenhado`;
  - o `LinkContractModal` só lê quando abre.
- **c. Telas 360 leem um instrumento só:**
  - contrato por `contract_key`;
  - ata por número e UASG;
  - saldo por `numero_ata` ou `item_key`;
  - fatias de GTI e vínculos do item filtrados.
  - **Risco:** médio. Hoje elas dividem o cache com as carteiras, e quem vem da carteira abre na hora. Medir com `EXPLAIN` a view de saldo filtrada por uma ata: o estudo da migration 148 mostrou que o filtro muda o plano.
- **d. Contrato 360:** uma leitura de `v_contrato_faturas` e uma de `contrato_empenhos`, repartidas entre as seções.
- **e. Carteira de Atas sem chamadas ao Compras.gov.br/PNCP pelo navegador:** quem preenche os itens é a sincronização do servidor.
- **Arquivos:**
  - `src/hooks/useContractsPortfolio.ts`, `src/components/financeiro/useContratosDoFinanceiro.ts`, `src/components/vinculacao/usePendenciasVinculoAta.ts`;
  - `src/hooks/useAtasPortfolio.ts`, `src/hooks/useCarteiraItens.ts`, `src/hooks/useAta.ts`, `src/hooks/useContract.ts`;
  - `src/components/ArpSearch.tsx` e o modal.

### O que não precisa de migration

Nada acima precisa mudar o banco.

O que pode vir depois, se a medição mostrar que vale: uma RPC com o total empenhado por UASG (passo 3b do estudo do Início).

## Como medir

1. **Contagem (só leitura):** rodar o comando abaixo fora do minuto dos jobs do cron. A resposta diz quantas linhas cada fonte tem e quanto falta para 1.000.

   ```bash
   supabase db query --linked -f scripts/estudo-telas-contagem.sql
   ```

2. **Pedidos por tela, no navegador:** abrir cada tela com a aba Rede filtrada por `/rest/v1` e anotar quantos pedidos saem e quanto tempo leva até encher. Medir antes e depois dos passos 3 e 6.
3. **URL dos ciclos:** no Início, procurar o pedido `contract_payment_cycles?contract_key=in.(…)` da 200331. Se vier com erro (414 ou 400), os ciclos do painel estão vazios hoje sem aviso.
4. **Teste de falha:** com o navegador em modo "Offline" logo depois de a tela abrir, apertar "Atualizar". Cada tela deve mostrar o que não carregou em vez de zerar.
