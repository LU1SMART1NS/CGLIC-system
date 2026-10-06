# Plano — Contratos persistidos no banco e cache de leitura

Data: 06/10/2026 · Branch de referência: `v3.0`

Escopo deste plano: itens 1 (persistir contratos no Supabase) e 5 (ajustar o React Query) do diagnóstico de lentidão. Os itens 2, 3, 4 e 6 aparecem no fim como etapas seguintes, só para mostrar como este trabalho se encaixa nelas.

---

## 1. Problema que este plano resolve

Hoje a lista de contratos não existe no banco. Ela é montada no navegador a cada carga, juntando duas APIs do governo:

| Fonte | Chamada | Custo |
| :--- | :--- | :--- |
| Contratos.gov.br | `/contrato/ug/{uasg}` | ~3 MB, 18 a 37 s, limite de 45 s |
| Compras.gov.br | `1_consultarContratos`, 3 anos, até 5 páginas por ano | várias chamadas de até 8 s |

Isso roda para as duas UASGs (200330 e 200331). O resultado fica só na memória da aba por 5 minutos, então recarregar a página refaz tudo. Quase todas as telas dependem dessa lista pela query `['contracts-dashboard', uasg]`: Visão Geral, Carteira de Contratos, Contrato 360, Ata 360, Item, Central de Distribuição, Pagamentos, Execução Financeira e o modal de vínculo.

Com 10 pessoas usando, são 10 navegadores repetindo as mesmas chamadas, sem nada compartilhado.

## 2. Resultado esperado

- **Toda tela lê contratos do Supabase.** Nenhuma tela espera API do governo para abrir.
- **A atualização roda em segundo plano**, uma vez para todos, e só quando os dados passaram da validade.
- **Coordenador tem o botão "Atualizar"**, que força a sincronização na hora.
- **A tela mostra "Atualizado em"** com a data da última sincronização bem-sucedida e avisa se uma fonte falhou.

Critérios de aceite, medidos na aba Rede do navegador:

| Situação | Hoje | Meta |
| :--- | :--- | :--- |
| Abrir /contratos com a página recarregada | 20 a 45 s | menos de 2 s |
| Chamadas a `/api-contratos-gov` ao abrir qualquer tela | 2 ou mais | 0 |
| Chamadas a `/api-arp/modulo-contratos` ao abrir qualquer tela | 6 ou mais | 0 |
| Sincronizações por janela de validade, somando todos os usuários | 1 por usuário | 1 no total |

---

## 3. Parte A — Contratos persistidos (item 1)

### A1. Migration `20261006000072_contratos_oficiais.sql`

**Tabela `contratos_oficiais`** — uma linha por contrato em cada carteira. A chave é a UASG consultada junto com o `id` que o sistema já usa em `contract_managers`, planos de tarefa e vínculos. Assim a leitura reproduz exatamente as listas por UASG de hoje.

> Versão final escrita e testada em `supabase/migrations/20261006000072_contratos_oficiais.sql`. O esboço abaixo é só a ideia; vale o arquivo.

```sql
CREATE TABLE IF NOT EXISTS public.contratos_oficiais (
  contract_key        TEXT PRIMARY KEY,           -- ContractDashboardRecord.id
  uasg                TEXT NOT NULL,              -- UASG da carteira consultada (200330/200331)
  numero              TEXT NOT NULL,
  ano                 TEXT NOT NULL,
  data_vigencia_fim   DATE,
  fornecedor_cnpj_cpf TEXT,
  id_compra           TEXT,
  numero_controle_pncp TEXT,
  contrato_id_gov     TEXT,                       -- id no Contratos.gov.br, quando houver
  fonte_dados         TEXT NOT NULL,
  registro            JSONB NOT NULL,             -- ContractDashboardRecord completo, inclusive raw
  sincronizado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contratos_oficiais_uasg_idx ON public.contratos_oficiais (uasg);
CREATE INDEX IF NOT EXISTS contratos_oficiais_id_compra_idx ON public.contratos_oficiais (id_compra);
```

Decisões:

- **`registro` guarda o objeto inteiro**, como a tela já usa hoje. Assim nenhum dos consumidores precisa mudar. O `raw` é lido em vários lugares, por exemplo aditivos no radar de reajuste, categoria no cabeçalho do contrato e valor acumulado na faixa de saúde.
- **As colunas soltas servem para filtro e conferência**, não para a tela.
- **`statusVigencia` não é gravado.** Ele depende da data de hoje e é recalculado na leitura com `calculateStatusVigencia`.
- **Nada é apagado na sincronização.** Contrato que some de uma resposta continua no banco. É a mesma regra de hoje de "a carteira não encolhe por falha momentânea".

**Tabela `sincronizacao_fontes`** — substitui os metadados que hoje ficam no localStorage de cada navegador.

```sql
CREATE TABLE IF NOT EXISTS public.sincronizacao_fontes (
  recurso              TEXT NOT NULL,             -- 'contratos' (depois 'atas', 'vigencias_pncp'...)
  uasg                 TEXT NOT NULL,
  em_andamento_desde   TIMESTAMPTZ,               -- trava: quem está sincronizando
  em_andamento_por     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ultima_tentativa_em  TIMESTAMPTZ,
  ultimo_sucesso_em    TIMESTAMPTZ,               -- última vez que TODAS as fontes responderam
  ultimo_status        TEXT,                      -- 'SUCESSO' | 'PARCIAL' | 'ERRO'
  fontes_com_falha     TEXT[] NOT NULL DEFAULT '{}',
  total_registros      INTEGER,
  mensagem             TEXT,
  PRIMARY KEY (recurso, uasg)
);
```

**Regras de acesso (RLS)**

- Leitura das duas tabelas: `TO authenticated USING (true)`, no padrão da migration 65.
- **Nenhuma política de escrita direta.** Toda gravação passa pelas funções abaixo, com checagem de perfil. Isso evita o problema que existe hoje em `atas_registro_preco`, onde qualquer usuário logado pode gravar.

**Funções (RPC), todas `SECURITY DEFINER` com `search_path` fixo**

1. `reservar_sincronizacao(p_recurso TEXT, p_uasg TEXT, p_validade INTERVAL, p_forcar BOOLEAN) RETURNS BOOLEAN`
   - Exige `has_role('admin')` ou `has_role('gestor')`. `p_forcar = true` exige `has_role('admin')`, que é o coordenador.
   - Numa única instrução `INSERT ... ON CONFLICT DO UPDATE ... WHERE`, marca `em_andamento_desde = now()` somente se não houver outra sincronização com menos de 10 minutos e, quando não forçada, se `ultimo_sucesso_em` for mais antigo que `p_validade` (mínimo de 1 hora) e a última tentativa tiver mais de 30 minutos. Esta última regra evita que todos tentem de novo sem parar enquanto uma fonte está fora do ar.
   - Devolve `true` para quem ganhou a reserva. Os outros navegadores recebem `false` e não fazem nada.
2. `gravar_contratos_oficiais(p_uasg TEXT, p_registros JSONB) RETURNS INTEGER`
   - Mesma checagem de perfil, e exige que o chamador seja quem está com a reserva.
   - Faz upsert por `contract_key`, atualizando `registro`, as colunas soltas e `sincronizado_em`.
   - O cliente envia em lotes de 100 contratos por chamada, para não estourar o limite de tamanho da requisição.
3. `atualizar_contrato_oficial(p_contract_key, p_registro)` — grava o contrato completado pelo Contrato 360. Só atualiza linha existente e mantém `id` e `uasg` do registro.
4. `concluir_sincronizacao(p_recurso TEXT, p_uasg TEXT, p_status TEXT, p_fontes_com_falha TEXT[], p_total INTEGER, p_mensagem TEXT)`
   - Libera a trava e grava o resultado. `ultimo_sucesso_em` só avança quando o status é `SUCESSO`.

Aplicação: `supabase db push --linked --dry-run` antes, depois `supabase db push --linked`. A migration e os testes de gravação só rodam com autorização explícita.

### A2. Serviço de sincronização (cliente, provisório)

Novo arquivo `src/services/contratosSyncService.ts`:

```ts
export async function sincronizarContratos(uasg: string, opts: { forcar?: boolean }): Promise<ResultadoSync>
```

1. Chama `reservar_sincronizacao('contratos', uasg, '6 hours', forcar)`. Se voltar `false`, encerra sem erro.
2. Reaproveita o `loadContractsForDashboard` atual, que já junta Contratos.gov.br e Compras.gov.br e informa se a lista saiu parcial.
3. Grava em lotes com `gravar_contratos_oficiais`.
4. Chama `concluir_sincronizacao` com `SUCESSO`, `PARCIAL` ou `ERRO`, sempre num bloco `finally`.
5. Invalida no React Query as chaves `contracts-dashboard` e `management-dashboard`.

Este serviço roda no navegador só até a Edge Function agendada existir (item 2). O código de busca e junção fica igual e será movido para a função depois.

**Gatilho em segundo plano.** Um hook `useSincronizacaoContratosEmSegundoPlano()` montado uma vez no `AppShell`:

- Só age para `gestor`, `coordenador` e `admin`. Perfil de consulta nunca dispara.
- Lê `sincronizacao_fontes` e, se a validade passou, chama `sincronizarContratos` sem bloquear nada.
- A trava no banco garante que, com 10 pessoas abrindo o sistema, só um navegador sincroniza.

**Botão "Atualizar" do coordenador.** Os botões que já existem nos cabeçalhos da Carteira de Contratos e da Visão Geral passam a chamar `sincronizarContratos(uasg, { forcar: true })` para coordenador. Para os outros perfis o botão só relê o banco.

**Enriquecimento do Contrato 360.** Quando `useContratoGov` completa um contrato com dados do Contratos.gov.br, o resultado mesclado também é gravado por `gravar_contratos_oficiais`. Assim o próximo usuário já abre o contrato completo, sem nova consulta.

### A3. Leitura pelo banco

Novo `fetchContratosFromDb(uasg)` em `contractService.ts`:

- Seleciona `registro` de `contratos_oficiais` filtrando por `uasg`.
- **Paginação obrigatória com `.range()`**, em páginas de 1000. O Supabase devolve no máximo 1000 linhas por consulta e corta o resto sem avisar.
- Recalcula `statusVigencia` de cada registro e ordena como hoje.

`getContractsDashboardQueryOptions` troca a `queryFn` para `fetchContratosFromDb`. A chave `['contracts-dashboard', uasg]` não muda, então os consumidores continuam funcionando sem alteração.

**Primeira carga, com o banco vazio.** Se `sincronizacao_fontes` nunca registrou sucesso para a UASG, a `queryFn` usa o caminho atual pela API uma única vez e grava o resultado. Depois da implantação, o coordenador clica em "Atualizar" uma vez para popular as duas UASGs.

### A4. Quem chama a API direto e precisa trocar

| Arquivo | Hoje | Passa a |
| :--- | :--- | :--- |
| `src/services/dashboardService.ts` | `fetchContractsForDashboard` dentro de `fetchManagementDashboardData` | `fetchContratosFromDb` |
| `src/services/itemSaldoRefreshService.ts` | `fetchContractsForDashboard` para montar o mapa de contratos | `fetchContratosFromDb` |
| `src/hooks/useContractsDashboard.ts` | `refresh` limpa o cache e reconsulta a API | `refresh` só invalida a query |
| `src/components/atas/distribuicao/DistribuicaoEquipePage.tsx` | `contratos.refresh()` | sem mudança, herda o novo `refresh` |

`fetchContractsForDashboard` continua existindo, mas só o serviço de sincronização o chama.

### A5. "Atualizado em" e aviso de fonte com falha

- Novo hook `useSincronizacaoStatus('contratos')`, que lê `sincronizacao_fontes` das duas UASGs.
- Os cabeçalhos mostram "Atualizado em 06/10 14:32" a partir de `ultimo_sucesso_em`, e não mais da hora em que a tela consultou.
- `ContractsPartialNotice` passa a ler `ultimo_status = 'PARCIAL'` e `fontes_com_falha` do banco. Ele deixa de depender do estado em memória `CONTRATOS_PARCIAIS`, que será removido junto com `useContractsListPartial`.
- Enquanto uma sincronização roda, um indicador discreto "Atualizando em segundo plano" aparece no cabeçalho, sem bloquear a tela.

---

## 4. Parte B — Ajustes do React Query (item 5)

### B1. Lista de contratos sem recarga automática

Em `src/hooks/useContractsDashboard.ts`:

- Remover `refetchInterval`, que hoje tenta de novo a cada 30 s quando a lista sai parcial.
- Remover `refetchOnWindowFocus`, que hoje sobrepõe o padrão global e reconsulta ao voltar para a aba.
- `staleTime` de 30 minutos e `gcTime` de 60 minutos. Os dados só mudam quando há sincronização, e ela invalida a query ao terminar.

### B2. Visão Geral sem carga dupla

Hoje a chave de `useManagementDashboard` inclui o escopo do gestor. A query dispara antes do escopo carregar e de novo depois.

- Adicionar a opção `enabled` em `useManagementDashboard` e passar `enabled: !scope.isLoading` em `GestaoInstrumentosDashboard.tsx` e `useContractsPortfolio.ts`.
- Subir o `staleTime` do dashboard de 2 para 10 minutos, já que as fontes passam a ser todas do banco.

### B3. Padrões globais

Em `src/lib/queryClient.ts`, manter `refetchOnWindowFocus: false` e `retry: 1`. Corrigir o comentário, que hoje fala em dados de API externa como base do `staleTime`.

### B4. Cache persistido no navegador (opcional, decidir após medir)

Depois das partes A e B1 a B3, medir o tempo de abertura com a página recarregada. Se a leitura do banco ficar abaixo de 1 s, este passo não é necessário.

Se for necessário:

- Adicionar `@tanstack/react-query-persist-client` e um persister em IndexedDB. O localStorage não comporta a lista com o `raw`.
- Persistir só as chaves de leitura pesada, como `contracts-dashboard` e `ata-detail-source`.
- Usar o id do usuário e a versão do app como `buster`, e apagar o cache no logout. Sem isso, um usuário poderia ver dados do escopo de outro no mesmo computador.

---

## 5. Ordem de execução e entregas

| Etapa | Entrega | Depende de |
| :--- | :--- | :--- |
| 1 | Migration 72 escrita e revisada, com dry-run | autorização para aplicar |
| 2 | `contratosSyncService` e testes unitários | etapa 1 aplicada |
| 3 | Leitura pelo banco com paginação e queda para a API no banco vazio | etapa 2 |
| 4 | Troca dos consumidores diretos (A4) | etapa 3 |
| 5 | Ajustes do React Query (B1 a B3) | etapa 3 |
| 6 | "Atualizado em", aviso de falha, botão do coordenador e gatilho em segundo plano | etapas 2 e 3 |
| 7 | Medição antes e depois, e decisão sobre B4 | etapas 1 a 6 |

As etapas 1 a 6 cabem num único conjunto de commits na `v3.0`. A etapa 5 pode ir antes das outras como ganho rápido, mas sozinha ela só reduz as repetições e não elimina a espera da primeira carga.

## 6. Testes

**Unitários (vitest)**

- Conversão entre registro e linha: o objeto volta igual, e `statusVigencia` é recalculado pela data de hoje.
- Paginação: com 2.300 linhas simuladas, a leitura faz 3 páginas e devolve tudo.
- Sincronização: reserva negada não chama API; falha numa fonte grava `PARCIAL` e não avança `ultimo_sucesso_em`; erro no meio sempre libera a trava.
- Banco vazio: a `queryFn` cai para a API uma vez e grava.
- Atualizar `useContractsDashboard.test.ts`, `contractServiceFetch.test.ts`, `dashboardService.test.ts` e `useManagementDashboard.test.ts`.

**Banco (com autorização)**

- Perfil de consulta não consegue reservar nem gravar.
- Duas reservas simultâneas: só uma recebe `true`.
- Gestor não consegue forçar, coordenador consegue.

**Checagem de tipos:** `npx tsc -p tsconfig.app.json`.

**Medição no navegador:** contar chamadas a `/api-contratos-gov` e `/api-arp` ao abrir Visão Geral, Carteira de Contratos e Contrato 360, antes e depois.

## 7. Riscos e cuidados

- **Tamanho do `registro`.** A lista completa com o `raw` deve ficar entre 2 e 4 MB por UASG, servida compactada pelo Supabase. Se pesar demais, o passo seguinte é enxugar o `raw` para os campos que o sistema usa: aditivos, categoria, valor acumulado, data de publicação, unidade de origem e dados de prorrogação.
- **Navegador fechado no meio da sincronização.** A trava expira em 10 minutos e a próxima reserva assume.
- **Dados com até 6 horas de atraso.** É o comportamento desejado. O coordenador força a atualização quando precisar.
- **Contratos que deixam de existir na fonte** ficam no banco. Se isso virar problema, marcar com uma coluna `ausente_desde` em vez de apagar.
- **Sincronização ainda no navegador.** Enquanto o item 2 não sai, quem tem perfil de gravação e abre o sistema depois de 6 horas carrega o custo da sincronização em segundo plano. A tela dessa pessoa não trava, mas a aba faz o download.

## 8. Etapas seguintes (fora deste plano)

- **Item 2 — sincronização no servidor.** Mover `contratosSyncService` para uma Edge Function agendada com pg_cron. O gatilho do navegador sai, e as funções de gravação passam a aceitar só a `service_role`. Levar junto a sincronização de atas, que hoje consulta a API antes do banco e guarda a validade no localStorage de cada usuário.
- **Item 3 — botão do coordenador** chamando a Edge Function em vez do navegador.
- **Item 4 — sincronizações ao abrir telas.** Tirar os disparos automáticos do Contrato 360 (empenhos), do Item (SENASP e contratos vinculados), da Ata 360 (SENASP) e da Visão Geral (quantidades contratadas).
- **Segurança.** Fechar a política "Sync Write" de `atas_registro_preco` e `itens_ata`, que hoje deixa qualquer usuário logado gravar.

---

## 9. Andamento

**06/10/2026 — etapas 1 a 6 implementadas, sem commit.**

- Migration 72 aplicada no Supabase.
- `src/services/contratosOficiaisService.ts`: leitura paginada pelo banco (com consulta às fontes só quando o banco está vazio ou fora do ar), sincronização com trava e gravação em lotes de 100, gravação do contrato completado pelo Contrato 360.
- `src/hooks/useSincronizacaoContratos.ts`: situação da sincronização, botão "Atualizar" (coordenador força; demais perfis releem o banco) e sincronização em segundo plano montada no `AppShell` (gestor e coordenador, na abertura e a cada 30 minutos).
- `contractService.ts`: a busca nas fontes foi separada (`buscarContratosNasFontes`) e aceita uma base; a sincronização parte do que já está no banco.
- Visão Geral, Carteira, Central de Distribuição, painel gerencial e atualização de saldos dos itens leem do banco.
- React Query: lista de contratos com validade de 30 minutos, sem recarga a cada 30 s nem ao voltar para a aba; painel gerencial com 10 minutos e só depois do escopo do gestor.
- Cabeçalhos mostram a data da última sincronização completa ("Atualizado em 05/10 às 14:32" quando não é de hoje). O aviso de lista incompleta lê a situação do banco.
- Testes: 1.816 passando, inclusive os novos do serviço e do hook. Tipos sem erro.

**Pendente:** verificação logada no navegador, primeira sincronização real (grava no banco de produção) e medição antes e depois. O aviso de lista incompleta não aparece mais no modo de queda para as APIs (banco vazio); ele volta a valer depois da primeira sincronização.

**06/10/2026 — botão "Atualizar" só para o coordenador.** Visão Geral, Carteira de Contratos, Carteira de Atas e Central de Distribuição mostram aos demais perfis só a data da última atualização. A aba confere a situação da sincronização no banco a cada 5 minutos e relê os contratos quando outra pessoa sincronizou.

**Achado:** a regra de sincronização das atas a cada 3 horas (`checkAndTriggerAutoSync`) só dispara com o banco de atas vazio, então na prática não roda. Com o botão restrito ao coordenador, as atas só se atualizam quando ele clica. Corrigir junto com o item 2 (atas na mesma trava e validade dos contratos).

**06/10/2026 — atas no mesmo modelo dos contratos, sem commit.**

- `sincronizacaoFontesService.ts`: trava, conclusão e estado local compartilhados por contratos e atas (`executarComReserva`).
- `syncService.ts` reescrito: `sincronizarAtas` reserva o recurso `atas`, limpa os caches em memória, consulta as fontes sem cair para o banco (`fetchArpsDasFontes`) e grava atas e itens. Falha na lista de atas vira ERRO; falha ao gravar itens vira PARCIAL. A regra antiga (localStorage, 3 horas, só com banco vazio) foi removida.
- `cacheArpsInDb` e `cacheArpItemsInDb` passam a conferir o erro do Supabase e devolvem se gravaram.
- `useSincronizacaoEmSegundoPlano` (no `AppShell`) sincroniza contratos e depois atas para gestor e coordenador, ao abrir e a cada 30 minutos, com validade de 6 horas.
- Carteira de Atas: "Atualizado em" vem do banco; botão só para o coordenador, que força a sincronização.
- Sem migration nova: a 72 já aceita o recurso `atas`.

**Pendente:** a trava expira em 10 minutos. Se a sincronização das atas de uma UASG passar disso, outro navegador pode começar uma segunda. Medir na primeira execução real. Edge Function agendada para contratos e atas continua como próximo passo.

**06/10/2026 — primeira sincronização real das atas.**

- As duas primeiras tentativas falharam com "Failed to fetch" porque o servidor de desenvolvimento da aba (porta 5175) tinha sido encerrado; as chamadas ao Supabase funcionavam, as do proxy local não.
- A sincronização expôs falhas antigas que eram engolidas: 7 atas nunca tinham itens no banco (fornecedor estrangeiro com identificador maior que a coluna, item publicado duas vezes pela fonte, item sem descrição) e dezenas de consultas de itens recusadas com 429 eram tratadas como "ata sem itens".
- Correções: itens repetidos ficam com a publicação mais recente; descrição vazia usa o nome do material; identificador que não é CNPJ/CPF fica vazio; consultas de itens repetidas são compartilhadas; 429/5xx esperam e tentam de novo (2, 4, 8 s); na sincronização a recusa conta como falha (PARCIAL); 2 atas em paralelo em vez de 5.
- Resultado às 12:48: SUCESSO nas duas UASGs, nenhuma recusa 429, 191 atas e 657 itens, nenhuma ata sem itens, cerca de 1 min 40 s.
- Pendente: ampliar `itens_ata.fornecedor_cnpj_cpf` (VARCHAR(20)) exige recriar `v_arp_item_saldo_detalhado`; hoje o identificador estrangeiro fica vazio.

**06/10/2026 — item 4: telas não sincronizam mais ao abrir.**

Removidos os disparos automáticos que consultavam as APIs do governo e gravavam no banco ao abrir uma tela (antes, em cada navegador e a cada abertura):

| Tela | Disparo removido | Como fica |
| :--- | :--- | :--- |
| Visão Geral | releitura dos saldos dos itens, uma vez por sessão | atualização global em segundo plano, sob a trava (recurso `saldos_itens`, validade 6 h); o coordenador força pelo botão |
| Ata 360 | gravação do quantitativo SENASP item a item | coberto pela atualização global |
| Item | quantitativo SENASP; quantidade contratada e empenhos de cada contrato vinculado | botão Atualizar do Item (gestor e coordenador); quantidade e SENASP também pela atualização global |
| Contrato 360 | busca dos empenhos quando o contrato não tinha nenhum | botão Atualizar empenhos do contrato e atualização em lote da Execução Financeira |

- `saldosItensSyncService.ts`: relê a quantidade contratada dos vínculos vencidos (mais de 6 h) e grava o quantitativo SENASP pendente. Falhas parciais ficam registradas no banco e aparecem como PARCIAL. Usa `UASG_TODAS = '000000'` na tabela de controle.
- `useSincronizacaoEmSegundoPlano`: terceira etapa (saldos), depois de contratos e atas. Troquei a guarda de "uma vez por sessão" por uma execução única em andamento: no modo de desenvolvimento do React o efeito roda duas vezes e a segunda era ignorada, deixando a primeira pela metade.
- Verificado no navegador, navegando entre telas: abrir Item, Ata 360, Contrato 360 e Visão Geral não faz mais nenhuma chamada de gravação (RPC) nem consulta de empenhos; a Visão Geral abre sem nenhuma chamada às APIs.

**Achado, fora do item 4: leituras ao vivo nas telas de detalhe.** Ainda há consultas de leitura (não de gravação) às APIs ao abrir:
- Item: unidades do item (Compras.gov.br), contratos no PNCP e adesões.
- Ata 360: data de assinatura (Compras.gov.br) e dados da compra no PNCP.
- Contrato 360: cerca de 10 chamadas (garantias, histórico e responsáveis no Contratos.gov.br; contrato no PNCP; adesões; busca de contratos por compra, 4 chamadas ao Compras.gov.br).
Esses dados não estão no banco. Resolver é o item de persistir esses painéis (próximo passo).

**06/10/2026 — medição das telas de detalhe e correção do gargalo do Item.**

Medido no navegador, por tela, depois de recarregar a página (cache em memória vazio):

| Tela | Chamadas às APIs | Mais lenta | Termina em |
| :--- | :--- | :--- | :--- |
| Visão Geral e carteiras | 0 | , | , |
| Ata 360 | 2 | 250 ms | 0,3 s |
| Contrato 360 | 5 | 260 ms | 2,4 s |
| Item | 26 a 28 | **34 s** (lista completa de contratos da UG no Contratos.gov.br, ~3 MB) | 34 s |

O gargalo era uma só chamada: para sugerir contratos ao item, `fetchComprasGovContratosByPurchase` baixava `/contrato/ug/{uasg}` inteiro e filtrava no navegador pelo número da compra. Essa mesma lista já está no banco (campo `raw` de `contratos_oficiais`). Agora a busca recebe um provedor (`criarProvedorListaContratosGov`) que lê do cache da tela e do banco; só baixa da API se o banco não tiver a lista ou se a UASG não for da CGLIC.

- Resultado idêntico ao antigo para a mesma compra (4 contratos nos dois caminhos); 32,7 s caiu para 3,8 s com o cache frio (inclui a primeira leitura do banco) e o pior caso da tela passou a ser uma chamada de 1,5 s.
- **Conclusão sobre persistir os painéis de detalhe:** com a medição, não é necessário agora. Ata 360 e Contrato 360 fazem poucas chamadas pequenas; o Item ainda faz cerca de 26, mas nenhuma passa de 1,5 s. Só vale revisitar se o uso real mostrar lentidão nessas telas.

---

## 10. Sincronização agendada no servidor (item 2)

**06/10/2026 — construída e testada; falta ativar em produção (um comando).**

### Como funciona
```
pg_cron (de hora em hora) ──► public.disparar_sincronizacao() ──► pg_net (POST) ──► Edge Function sincronizar-fontes
                                   lê do Vault o endereço                              │ confere o segredo do agendamento
                                   e o segredo                                         ▼
                                                                          reserva a trava (sincronizacao_fontes)
                                                                          consulta Compras.gov.br / Contratos.gov.br / PNCP
                                                                          grava no banco e registra o resultado
```
- **Jobs** (migration 77): contratos 200330 e 200331 às :05, atas 200330 e 200331 às :15, saldos dos itens às :35, nessa ordem porque os saldos usam o que as outras duas acabaram de atualizar. Cada chamada é uma execução separada, para caber no tempo máximo de uma Edge Function. A cada hora a função confere a validade (6 h) e a trava; na maior parte das horas a resposta é "nada a fazer".
- **Mesma lógica do app.** A função não reimplementa nada: `scripts/build-sincronizar-fontes.mjs` empacota (rolldown) os mesmos serviços de `src/services` num arquivo só, trocando o cliente do navegador por um cliente de service role (`server/sincronizar-fontes/supabaseServidor.ts`) e traduzindo os endereços `/api-*` para os servidores reais (`proxyDeFontes.ts`, os mesmos destinos do `vite.config.ts` e do `vercel.json`).
- **Acesso do servidor** (migration 76): `reservar_sincronizacao`, `gravar_contratos_oficiais`, `concluir_sincronizacao` e as duas funções de saldo (`sync_contract_item_quantity_atomic`, `sync_item_senasp_quantity_atomic`) passam a aceitar a chave de service role (`eh_service_role()`). A trava do servidor tem `em_andamento_por` nulo e só o servidor grava e conclui nela; a de um usuário, só ele. As regras de gestor, coordenador e consulta não mudam.
- **Quem pode chamar a função** (`verify_jwt = false`, a autenticação é feita dentro dela): o agendamento, com o segredo em `x-cron-secret` (só sincroniza o que venceu, nunca força), ou o coordenador, com o token da sessão (também força). Qualquer outra chamada recebe 401 ou 403. O segredo fica no Vault (`sincronizacao_segredo`) e como secret da função (`CRON_SECRET`); o endereço, no Vault (`sincronizacao_url`). Nada disso vai para o git.
- **Atas incrementais.** O servidor sempre relê a lista de atas (uma consulta), mas só relê os **itens** das atas que precisam: sem itens gravados, itens lidos há mais de 7 dias, ou ata alterada na fonte nos últimos 2 dias. O coordenador força a releitura de todas. Antes, cada execução relia os itens das 191 atas (cerca de 100 s). Há também um orçamento de 100 s para consultar itens: se acabar, grava o que tem como PARCIAL e o resto fica para a próxima hora, em vez de a função ser interrompida no meio.
- **Teste de acesso** (`"dry": true`): consulta as fontes e conta, sem gravar. É o que o script de ativação usa para provar que o servidor do Supabase alcança as fontes do governo.

### Verificado antes de ativar
- Pacote real executado em Node contra as fontes do governo, em modo dry: 1.057 contratos (200331), 42 (200330) e 191 atas, em 28 s, 1 s e 17 s; 0,55 s de processador no total.
- Migration 76 em Postgres 17 local: ciclo completo do servidor, a trava não é invadida por usuários nem pelo servidor, regras de gestor, coordenador e consulta preservadas, troca de autorização das funções de saldo e aborto se a linha mudar.
- Migrations 76 e 77 no banco real, dentro de uma transação desfeita: extensões criadas, 6 jobs agendados, disparo sem secrets devolve nulo, o `pg_net` enfileira o POST com o endereço, o corpo e o tempo certos. Nada ficou gravado.
- 1.896 testes, tipos (app e servidor) e build ok.

### Ativar (uma vez)
```bash
npm run ativar:sincronizacao-no-servidor
```
Pede confirmação e, em ordem: define o secret da função, implanta a função, aplica as migrations 76 e 77, grava endereço e segredo no Vault e faz o teste de acesso às fontes (modo dry). Se o teste não retornar 200, a função e o agendamento ficam instalados, mas o script avisa para conferir os logs antes de confiar nele.

### Operar
- Situação: `select * from sincronizacao_fontes;` (último sucesso, última tentativa, falhas) e `select * from cron.job_run_details order by start_time desc limit 10;`
- Logs da função: `supabase functions logs sincronizar-fontes`
- Disparar agora: `select public.disparar_sincronizacao('contratos', '200331');`
- Pausar tudo: `update cron.job set active = false where jobname like 'sincronizar-%';`

### Falta (próximo PR, depois de ver o agendamento rodando em produção)
- Tirar a sincronização do navegador de gestor e coordenador (`useSincronizacaoEmSegundoPlano`); enquanto isso, as duas convivem sem problema, pela trava.
- O botão "Atualizar" do coordenador passar a chamar a função (`forcar: true`) em vez de rodar no navegador.
- Fechar a escrita aberta a qualquer usuário logado em `atas_registro_preco` e `itens_ata` (a sincronização no servidor deixa de precisar dela).

### Ativado em produção (06/10/2026, 14:3x)
`npm run ativar:sincronizacao-no-servidor` rodou sem erro:
- função `sincronizar-fontes` implantada e secret `CRON_SECRET` definido; migrations 76 e 77 aplicadas; `sincronizacao_url` e `sincronizacao_segredo` no Vault; 6 jobs ativos.
- **Acesso às fontes a partir do Supabase (us-west-2): funciona.** O teste dry da UASG 200330 retornou HTTP 200 com 42 contratos e nenhuma fonte com falha, em 1,2 s. O medo de bloqueio de região não se confirmou.
- **Caminho do agendamento ponta a ponta:** `disparar_sincronizacao()` → `pg_net` → função respondeu 202 "aceito, origem agendamento".
- Como os dados estavam em dia (contratos 14:30, atas 12:48, saldos 13:21), as próximas execuções reais do agendamento só agem quando vencer a validade de 6 h: atas a partir do :15 depois das 18:48, saldos depois das 19:21, contratos depois das 20:30. Até lá, a hora cheia só confere e responde "nada a fazer".
- O script ganhou `--sim` sem perguntas (também no `db push --yes`), para rodar sem terminal interativo.
- **Primeira sincronização real feita pelo servidor (14:40):** com a validade de contratos 200330 marcada como vencida, o disparo do agendamento reservou a trava, leu as fontes, gravou 42 contratos pela chave de service role e concluiu com SUCESSO em cerca de 5 s. Caminho de gravação do servidor comprovado em produção.
