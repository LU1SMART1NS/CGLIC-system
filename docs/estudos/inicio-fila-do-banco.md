# Início lento: o que entra na fila do banco ao abrir

Estudo de 16/10/2026. Pergunta: o Início (rota `/instrumentos`) abre completo, mas leva cerca de 15 s para encher. As consultas pesadas já foram aceleradas (saldo dos itens ~0,45 s, empenhado acima ~0,12 s). O que ainda pesa, e o que dá para cortar?

Resposta curta: o tempo não está em uma consulta lenta. Está na **quantidade** de pedidos que saem juntos (~83) para um banco pequeno (Nano). Cerca de metade desses pedidos é repetição, é coisa do menu lateral que não precisa sair junto com o Início, ou traz bem mais do que a tela usa. Dá para tirar de 30 a 40 pedidos da abertura só com mudanças no navegador, sem mexer no banco.

Nada aqui muda o sistema. É só leitura de código e números do banco.

## O que foi medido e o que falta medir

- **Medido no banco (16/10/2026, só leitura):** tamanho das tabelas. Contratos: 1.081 na 200331 (JSON `registro` de ~4 kB cada, **4,1 MB no total**) e 42 na 200330. Empenhos: 2.049. Vínculos nota×contrato: 2.116. Faturas: 7.142. Gestores de contrato: 537. Atas: 214. Itens de ata: 667. Alocações: 42.
- **Medido antes (14/10/2026, `pg_stat_statements`):** custo médio próprio no banco de `contratos_oficiais.registro` ~485 ms e de `v_empenhos_resumo` ~640 ms por página.
- **Medido no navegador (16/10/2026):** essas mesmas páginas levaram de 9 a 10 s.
- **Conclusão:** mais de 90% do tempo de cada pedido é **espera na fila**, não trabalho do banco.
- **Não medido:** o `EXPLAIN ANALYZE` como usuário logado de cada consulta. O verificador automático do Claude Code bloqueou as leituras no banco de produção nesta sessão. O script está pronto em `scripts/estudo-inicio-fila.sql`: roda como usuário logado, mede tempo e tamanho de cada consulta e termina em `RAISE EXCEPTION`, então nada fica gravado. Ele confirma os números de custo próprio, principalmente o das faturas (ver corte 2).

## De onde vêm os pedidos ao abrir o Início

Coordenador, sem filtro. "Pág." é página de mil linhas.

| Leitura | Quem dispara | Pedidos | Observação |
|---|---|---|---|
| Contratos (`contratos_oficiais?select=registro`) | Painel do Início (`dashboardService.fetchManagementDashboardData`) **e** menu lateral (`useContractsPortfolio` → `useContractsDashboard`) | 6 (3 + 3) | A leitura do painel passa por fora do cache. São 4,1 MB lidos duas vezes. Um 5º pedido da 200331 deve ser nova tentativa (`retry: 2`). |
| Empenhos (`v_empenhos_resumo?select=*`) + vínculos (`contrato_empenhos`) | Painel do Início, uma vez **por UASG** | 12 (6 + 6) | A view não depende da UASG, mas usa `ler()` e não `lerSemUasg()`. As duas leituras são iguais. Só servem para um número da tela: "Empenhado" no cartão de contratos. |
| Faturas (`v_contrato_faturas`, 21 colunas) + conferência do Tesouro | Número do **Financeiro no menu** (`useContagemFinanceiro`) e avisos de pagamento do Início (`useAvisosPagamentoGerais`) | 8 + 1 a 8 | São 7.142 faturas. A view recalcula OBs e notas para todas as faturas, e cada página com `OFFSET` refaz o cálculo. Os avisos só usam 4 colunas da tabela (`contract_key, emissao, referencia, cancelada`). |
| Atas (`atas_registro_preco?select=*`) | Painel do Início, por UASG | 2 | |
| Atas com itens (`select=*,itens_ata(*)`) | Contagens do menu (`ContagensDaCarteira`), 3 s depois de abrir | 2 | Chega no meio da carga do Início, que dura 15 s. |
| Gestores (`contract_managers`) | Painel do Início **e** `useAllContractManagers` (página e menu) | 4 (2 + 2) | Mesmo motivo dos contratos: o painel lê por fora do cache. |
| Alocações (`arp_allocations`) | Painel do Início + duas consultas das contagens do menu | 3 | São 42 linhas, custo baixo. Ocupa lugar na fila. |
| Fila de vínculos (`v_contrato_empenho_distribuicao`, notas SIAFI, empenhos fora do contrato) | Número de Vínculos no menu (`useContagemVinculacao`) | ~4 | |
| Carteira do menu (vínculos item×contrato, empenhado por item, saldos, contratos sem ata, `prever_vinculos_automaticos` etc.) | `ContagensDaCarteira`, depois que atas e contratos estão no cache | ~10 | |
| Demais (planos, avisos resolvidos, saldo, vínculos a conferir, ausentes, empenhado acima, ciclos, perfil, regras, feriados, situação da sincronização) | Painel, página e app | ~25 | Leves. Já foram otimizados ou são lidos uma vez. |

Total: ~80 a 90 pedidos, de acordo com os 83 vistos no navegador.

Os maiores achados:

1. **O menu lateral pesa tanto quanto o Início.** Os números do Financeiro e de Vínculos chamam `useContratosDoFinanceiro` → `useContractsPortfolio`. Esse hook carrega contratos, gestores, vínculos e o **painel inteiro das duas UASGs** em qualquer tela. No Início ele divide o cache com a página e não duplica. Nas outras telas, abrir o menu dispara o painel do Início em segundo plano.
2. **Toda sincronização de contratos relê tudo.** `useSituacaoSincronizacao` confere a situação a cada 5 min. Quando a sincronização do servidor termina (de hora em hora, uma por UASG), cada aba aberta relê os contratos e o painel inteiro, mesmo que nada tenha mudado. Isso não pesa na abertura, mas enche a fila de hora em hora com 10 usuários.

## Cortes propostos, por ordem de ganho na abertura

Os ganhos são estimativas, não medições: o tempo de fila cai mais ou menos na proporção do trabalho que sai dela.

### 1. Contagens do menu só depois que a tela enche

- **O quê:** o número do Financeiro (faturas, Tesouro, ciclos, ligações), o de Vínculos e as `ContagensDaCarteira` esperam a tela atual terminar de carregar (`useIsFetching() === 0`, ou o tempo de hoje contado a partir daí) em vez de sair junto ou em 3 s fixos.
- **Arquivos:** `src/components/layout/Sidebar.tsx`, `src/components/financeiro/useContagemFinanceiro.ts`, `src/components/vinculacao/useContagemVinculacao.ts`, `src/components/vinculacao/ContagensDaCarteira.tsx`, `src/components/vinculacao/cargaDaCarteiraDoMenu.ts`.
- **Ganho:** ~25 pedidos a menos na abertura. Entre eles as 8+ páginas de faturas, que são a consulta mais cara que sobrou.
- **Risco:** baixo. Os números do menu aparecem alguns segundos depois. Nenhum número muda.

### 2. Avisos de pagamento com faturas leves

- **O quê:** `useAvisosPagamentoGerais` passa a ler só `contract_key, emissao, referencia, cancelada` da tabela `contrato_faturas`, e só dos contratos marcados com expectativa de pagamento. Hoje lê as 21 colunas da view `v_contrato_faturas` e a conferência do Tesouro de todas as 7.142 faturas.
- **Arquivos:** `src/hooks/useAvisosPagamento.ts`, nova função em `src/services/financeiroCarteiraService.ts`.
- **Ganho:** junto com o corte 1, o Início deixa de esperar a view de faturas. Ficam 1 ou 2 pedidos leves no lugar de 9 a 16 pesados.
- **Risco:** baixo. A regra do aviso não muda; é preciso conferir que a tabela tem o mesmo `cancelada` da view (tem, é a mesma coluna).
- **Medir antes:** a linha `faturas_*` do script.

### 3. Empenhos lidos uma vez, só com o que o número usa

- **Passo a (só navegador):** em `fetchManagementDashboardData`, trocar `ler('empenhos', …)` por `lerSemUasg`. O recorte por UASG já é feito depois, no read model. Pedir só as colunas usadas por `calculateFinancialSummary` e pôr `.order('empenho_id')` nas duas leituras paginadas.
  - **Ganho:** 12 → 6 pedidos.
  - **Correção junto:** hoje as páginas não têm ordem fixa e podem repetir ou pular linhas. E um erro no meio vira lista parcial calada (`break`), contra a regra do PR #241.
  - **Arquivo:** `src/services/dashboardService.ts`.
  - **Risco:** baixo.
- **Passo b (migration, depois):** o Início só usa o **total empenhado**. Uma função no banco devolveria o total por UASG com a mesma regra (emitido pela UASG ou ligado a contrato/ata dela, com o recorte do gestor) em 1 pedido.
  - **Ganho:** 6 → 1.
  - **Risco:** médio. A regra precisa de teste lado a lado com o cálculo de hoje.

### 4. Painel usa o cache para contratos, gestores e atas

- **O quê:** dentro de `fetchManagementDashboardData`, ler contratos, gestores e atas com `queryClient.ensureQueryData(...)` usando as mesmas opções de `useContractsDashboard`, `useAllContractManagers` e `getAtaSourceQueryOptions`. Hoje são chamadas diretas que ignoram o cache.
- **Arquivos:** `src/services/dashboardService.ts` e `src/lib/queryClient.ts`.
- **Ganho:** −3 páginas de contratos (−4,1 MB), −2 de gestores e −2 de atas. Com isso as atas com itens saem uma vez só, e não duas leituras diferentes.
- **Risco:** baixo a médio. Os tempos de validade são diferentes (contratos 30 min, painel 10 min). A sincronização já invalida os dois. É preciso conferir que "Atualizar" continua relendo tudo.

### 5. Menu sem o painel inteiro

- **O quê:** `useContratosDoFinanceiro` usa uma versão leve da carteira de contratos, sem `useManagementDashboard`. O menu só precisa de número, fornecedor, gestor e vigência.
- **Arquivos:** `src/components/financeiro/useContratosDoFinanceiro.ts` e `src/hooks/useContractsPortfolio.ts`.
- **Ganho:** nenhum no Início, que já divide o cache. Nas **outras** telas, ~50 pedidos a menos a cada 10 min por usuário.
- **Risco:** baixo. A tela do Financeiro continua com a carteira completa.

### 6. Reler só quando a sincronização trouxe algo novo

- **O quê:** `useSituacaoSincronizacao` invalida contratos e painel só quando `ultimoSucessoEm` mudou e a sincronização gravou alguma mudança. Hoje basta a data da tentativa mudar.
- **Arquivos:** `src/hooks/useSituacaoSincronizacao.ts`. A função do servidor teria de gravar "mudou ou não" em `sincronizacao_fontes`.
- **Ganho:** some a releitura cheia de hora em hora de cada aba aberta.
- **Risco:** médio. É preciso a informação do servidor.

### 7. Contratos sem o JSON inteiro (por último)

- **O quê:** `select=registro` traz ~4 kB por contrato. Dá para pedir só as chaves do JSON que as telas usam (`registro->campo` no PostgREST) ou criar uma coluna resumida.
- **Ganho:** o maior em bytes (4,1 MB por leitura).
- **Risco:** médio a alto. A mesma lista serve várias telas, e um campo esquecido some em silêncio. Fazer só depois do corte 4, que já tira uma das duas leituras.

### Pequenos

- **Alocações:** `arp_allocations` é lida 3 vezes com chaves diferentes. Uma consulta `*` resolve as três. Ganho de 2 pedidos.
- **Ciclos:** `contract_payment_cycles` é lida pelo painel com `IN` de todos os contratos (URL longa, sem lotes) e pelo Financeiro por situação. Dá para juntar.

Juntos, os cortes 1 a 4 levam a abertura de ~83 para ~45 pedidos. As consultas grandes que sobram são todas únicas. A estimativa é encher em bem menos da metade do tempo de hoje, com o banco como está.

## Riscos encontrados de passagem (fora deste estudo)

- Leituras sem paginação, que param em 1.000 linhas sem avisar:
  - `v_arp_item_saldo_detalhado` (hoje 667 itens)
  - `contract_payment_cycles`
  - `ata_managers`
  - `v_contrato_empenho_distribuicao`
  - `v_vinculos_a_conferir`
  - `v_contrato_itens_empenhado_acima`
  - `atas_fornecedor_pncp`
  - leituras de tarefas por `IN`
- `fetchEmpenhosResumoFromDb` esconde erro e devolve lista parcial (corrigido no corte 3a).

## Subir o plano do banco (Nano → Micro ou Small)

Plano gratuito hoje: Nano, CPU compartilhada, até 0,5 GB de memória. Nos planos pagos (Pro, US$ 25/mês por organização, com US$ 10 de crédito de computação):

- **Micro:** ~US$ 10/mês (coberto pelo crédito), 1 GB de memória, CPU compartilhada, 60 conexões diretas e 200 no pooler.
- **Small:** ~US$ 15/mês (US$ 5 além do crédito), 2 GB, CPU compartilhada, 90 conexões e 400 no pooler.

**O que muda:**

- Mais memória: as tabelas e views do Início cabem inteiras no cache do banco, e cada consulta deixa de ir ao disco.
- Fim do estrangulamento visto em 14/10/2026 (503 `PGRST002`, cron com "job startup timeout"). Ele vinha do limite de máquina do Nano.
- Mais folga para o cron de hora em hora e para vários usuários ao mesmo tempo.
- Os ~83 pedidos andam mais rápido na fila. A abertura deve cair bastante, mas sem medição não dá para dizer quanto.

**O que não muda:**

- Micro e Small continuam com CPU **compartilhada**. CPU dedicada só a partir do Large (~US$ 110).
- O número de pedidos e os bytes continuam os mesmos: 4,1 MB de contratos lidos duas vezes, empenhos duas vezes e faturas em 8 páginas. Com mais usuários, a fila volta.
- As releituras do menu e da sincronização de hora em hora continuam.
- Os riscos de corte em 1.000 linhas continuam.

**Recomendação:** fazer os cortes 1 a 4 primeiro. São só no navegador, risco baixo, e tiram cerca de metade da fila. Subir para Micro ao mesmo tempo, porque ele vem no Pro sem custo extra de computação, se a organização aceitar o plano pago. Assim o problema de 14/10 não volta com mais usuários. O Small só vale se, depois dos cortes, o painel de uso mostrar memória ou CPU no limite.

## Como medir de novo

1. Trocar `<UID>` em `scripts/estudo-inicio-fila.sql` pelo `user_id` de um coordenador.
2. Rodar `supabase db query --linked -f scripts/estudo-inicio-fila.sql` fora do minuto dos jobs do cron.
3. A resposta vem no texto do erro `ENSAIO {...}`, com `ms_real`, `ms_explain` e `kB` de cada consulta.
4. No navegador, contar os pedidos a `/rest/v1` na aba Rede ao abrir o Início, antes e depois de cada corte.
