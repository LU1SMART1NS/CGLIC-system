# Informação guardada em dois lugares: ligações que faltam entre os módulos

Estudo de 11/11/2026. Pergunta: onde o sistema guarda a mesma informação em mais de um lugar, ou onde um módulo mantém sua própria cópia em vez de ler o dado de outro módulo?

Nada aqui muda o sistema. O estudo é leitura do código da main (migrations até a 268, `src/`, `server/` e `supabase/functions`) mais três consultas **só de leitura** no banco de produção (`SELECT`, nada gravado):

- catálogo de tabelas e colunas;
- contagem exata de linhas;
- contagem de chaves órfãs e de cópias divergentes.

## Resposta curta

- **Hoje os dados estão íntegros.** Nenhuma chave órfã foi encontrada em 31 tabelas conferidas (itens, atas e contratos), nenhum nome de gestor ou fiscal diverge do perfil, e nenhuma entrega da fiscalização diverge da linha do pedido (2.046 conferidas).
- **O risco está na estrutura.** As ligações entre módulos são feitas por texto (`item_key`, `ata_key`, `contract_key`, nome do gestor), sem chave estrangeira. Qualquer mudança na fonte ou num cadastro deixa cópias para trás sem aviso.
- **Quatro pontos já dão ou podem dar erro e merecem conserto primeiro** (seção 1).
- **Há 42 tabelas vazias.** Parte delas é estrutura paralela ou recurso abandonado (seção 4).

## Números de produção usados (11/11/2026)

| O que | Resultado |
|---|---|
| Tabelas no banco | 156 (42 vazias) |
| Chaves `item_key` órfãs (14 tabelas, 29.966 linhas) | 0 |
| Chaves `contract_key` órfãs (14 tabelas, 22.590 linhas) | 0 |
| Chaves `ata_key` órfãs na gestão da ata e nos planos | 0 |
| `ata_key` dos documentos SEI das emendas que não batem com a chave da gestão | **418 de 1.243** (outro formato, ver 2.1) |
| Gestores de ata/contrato e fiscais com nome diferente do perfil | 0 |
| Gestores sem `gestor_user_id` | 0 |
| Entregas da fiscalização com quantidade ou beneficiário diferente da linha do pedido | 0 de 2.046 |
| Atas com `valor_total` diferente da soma dos itens | 38: 18 de participação ou adesão (só a parte da SENASP, de propósito) e 20 da CGLIC (total da fonte; 15 delas com preço apostilado), ver 1.1 |

---

## 1. Consertar primeiro (erro hoje ou na próxima vez que acontecer)

### 1.1 Valor total da ata tem dois significados
- **Onde:** `atas_registro_preco.valor_total`.
- **O conflito:** a sincronização grava o total da fonte (`src/services/dbCacheService.ts:35`). Três funções regravam a mesma coluna com a soma da parte da SENASP:
  - `informar_preco_apostilamento` (migration 247, linha 159);
  - `aplicar_preco_do_termo` (migration 258, linhas 104 e 442);
  - `espelhar_participacao_na_carteira` (migration 145).
- **Os dois significados são de propósito por tipo de ata** (migration 114): ata da CGLIC = total da fonte; ata de participação ou adesão = parte da SENASP. As 18 de participação/adesão divergentes estão certas.
- **O erro:** o apostilamento e o preço do termo aplicam a conta da SENASP também às atas da CGLIC. A sincronização das atas (a cada hora, minuto 15) devolve o total da fonte. O valor fica errado por até 1 h depois de cada apostilamento. O painel Distribuição lê esse campo (`useDistribuicaoDaCarteira.ts:40`).
- **Hoje:** nenhuma ata da CGLIC está com o valor errado, porque a sincronização já corrigiu. Mas 15 atas da CGLIC com preço apostilado (06/11/2026) mostram o total da fonte, que usa o preço antigo, enquanto os itens já mostram o preço novo.
- **Ligação certa:** decidir o que é o "valor" da ata da CGLIC depois do apostilamento (total da fonte ou soma homologada × preço vigente). Em seguida, uma regra só para as três funções e para a sincronização.

### 1.2 Juntar beneficiários falha quando o beneficiário já está na Fiscalização ou numa emenda
- **Onde:** `juntar_beneficiarios_emenda` (última versão na migration 172, linhas 168 a 174). A função só repassa `emenda_pedido_linhas.beneficiario_id` e depois apaga o beneficiário que sai.
- **O que ficou de fora:** depois dela nasceram outras ligações sem `ON DELETE`: `emendas_siop.beneficiario_id` (migration 206) e `fisc_entregas.beneficiario_id` (migration 260, 4.005 entregas). Além disso, `emenda_beneficiario_grupo` apaga em cascata e perde o grupo confirmado do beneficiário que sai.
- **Efeito:** a junção dá erro de chave estrangeira, ou perde o grupo.
- **Ligação certa:** a função repassa todas as tabelas que apontam para o beneficiário, inclusive o grupo.

### 1.3 A Mesa e o Andamento do pedido leem a Ordem de Fornecimento de uma coluna abandonada
- **Onde:** `emenda_pedidos.ordem_fornecimento_em` e `ordem_fornecimento_documento_sei` (migration 245). A migration 250 passou a Ordem para `emenda_pedido_ordens` (242 registros, um por pedido × contrato) e diz que as colunas antigas "saem numa limpeza depois que o código deixar de lê-las".
- **O código ainda lê:** `emendasService.ts:1001` → `emendasMesa.ts:487, 610, 834, 856`, `emendasAndamento.ts:323, 389` e `EtapaPedidoModal.tsx:192`.
- **Efeito:** a etapa "Ordem" da Mesa e do Andamento olha uma coluna que nenhum pedido preencheu, e ignora as Ordens registradas por contrato.
- **Há ainda um terceiro lugar:** `fisc_entregas.etapa = 'ORDEM'`. A RPC da fiscalização devolve a ORDEM a `emenda_pedido_ordens`, mas não a INFO_ENVIADA.
- **Ligação certa:** `emenda_pedido_ordens` como fonte única. Mesa, Andamento e Fiscalização leem dali. Depois, apagar as duas colunas e a RPC antiga.

### 1.4 Entregas da fiscalização são cópia da linha do pedido e nunca se atualizam
- **Onde:** `fisc_criar_entregas_do_contrato` (migration 260, linhas 125 a 140). A função copia `item_key`, `beneficiario_id`, `quantidade` e `contract_key` da linha do pedido e da nota. Só cria entregas, não atualiza as que já existem.
- **O que pode mudar depois:** a linha pode ser cancelada ou anulada, ou mudar pelo ofício retificador. `emendas_ligar_notas` refaz a nota e o contrato da linha de hora em hora.
- **Hoje:** 0 divergências em 2.046 entregas de emenda. O risco é a próxima retificação.
- **Ligação certa:** nas entregas de origem EMENDA, ler quantidade, beneficiário e contrato da linha (por `emenda_linha_id`), ou ter uma conferência hora a hora com aviso. A cópia só se justifica na origem CARGA (planilha da SFC) e no fracionamento.

---

## 2. Ligações estruturais (fonte única)

### 2.1 Chaves de texto sem chave estrangeira
- **`item_key`:** "NÚMERO-UASG-ITEM" em cerca de 27 tabelas.
- **`ata_key`:** em 6 tabelas.
- **`contract_key`:** em mais de 30 tabelas, com tamanhos diferentes: `varchar(100)` em `contract_managers` e `varchar(150)` em `contrato_empenhos` e `contrato_faturas`.
- **Risco:** a identidade da ata é o `numero_controle_pncp` (migration 145). Quando a fonte troca o número (caso "90068" → "00068"), a ata é atualizada, mas gestor, alocações, ata assinada (11.068 linhas), remanejamentos e vínculos ficam presos à chave antiga. Nenhum erro aparece.
- **Dois formatos da chave da ata:**
  - a gestão (`ata_managers`, `ata_task_plans`) usa `chave_gestao_ata`, que tira a UASG quando é 200330/200331;
  - `emenda_pedido_documentos_sei.ata_key` grava sempre "número-200331" (418 documentos).

  Quem cruzar as duas tabelas pela chave não acha nada.
- **Recomendação, em passos:**
  1. Uma view "chaves órfãs" ligada a um aviso. O ponto de partida é a consulta deste estudo, que hoje dá 0.
  2. Um gatilho em `atas_registro_preco` que, ao mudar `numero_ata`, regrava as chaves derivadas.
  3. Um formato só de `ata_key`, usando `chave_gestao_ata` também nos documentos SEI.
  4. A médio prazo: `item_id uuid` com chave estrangeira para `itens_ata`, e chave única em `contratos_oficiais.contract_key` para permitir chave estrangeira.

### 2.2 Gestor e fiscal identificados pelo nome
- **Onde:** `ata_managers.gestor_nome`, `contract_managers.gestor_nome`, `fisc_contratos.fiscal_nome`, `ata_tasks.responsavel_nome`, `contract_tasks.responsavel_nome` e `contract_payment_cycles.titular_nome`/`responsavel_nome`.
- **Filtros e buscas pelo nome:**
  - `carteiraGestor.ts:16`;
  - `ContratosSemVinculoFila.tsx:310` e `ConferenciaAtaModal.tsx:128` (acham o usuário pelo nome);
  - `emendasCcga.ts:122`;
  - `GestaoInstrumentosDashboard.tsx:146`;
  - migration 086 (regra de conflito `gestor_nome <> gestor_nome`).
- **O furo:** renomear um usuário (`supabase/functions/manage-user/index.ts:133`) só muda o perfil no Auth. Nenhuma dessas colunas acompanha. A carteira do gestor some do filtro e o mesmo usuário aparece com dois nomes. Homônimos também se confundem.
- **Hoje:** 0 nomes divergentes e todos têm `gestor_user_id`. A troca é segura.
- **Ligação certa:** filtrar e atribuir por `*_user_id`, e trazer o nome atual do perfil. Ao todo há 97 colunas de nome de pessoa em 72 tabelas. Cerca de 83 são registro de "quem fez" e devem ficar. Só as ~14 de "responsável atual" acima são o problema.

### 2.3 Perfis e permissões definidos em dois lugares
- **No banco:** `roles` (6), `role_permissions` (41), `permissions` (17), `role_domain_scopes`. São eles que o RLS aplica.
- **Na tela:** `SYSTEM_ROLES` em `src/types/user.ts:339`, com ids diferentes (`coordenador`/`consulta` × `admin`/`leitor`) e matriz própria. `roleService.ts:130` lê do `localStorage` ou do código.
- **Efeito:** a tela Perfis pode mostrar uma matriz que não é a que o banco aplica.
- **Mais um:** `user_roles.role` (antiga) convive com `user_roles.role_id`. O banco já usa `role_id` (migration 124), mas `invite-user` (linha 60) e `manage-user` (linha 84) ainda checam admin por `role`.
- **Ligação certa:** a tela lê `roles`/`role_permissions`. As funções usam `role_id`. Depois, aposentar `role` e o caminho do `localStorage`.

### 2.4 Quantidade contratada do item em dois lugares
- **Onde:** `itens_contrato.quantidade`/`valor_unitario` (sincronização dos itens) e `arp_item_contract_links.quantidade_contratada_api`/`valor_unitario_api`, gravados por `itemSaldoRefreshService.ts` e pelo vínculo automático (migrations 106 e 112). O vínculo automático só atualiza os de origem AUTOMATICO.
- **Quem lê a cópia:** `carteiraItensService.ts:39` e a Fiscalização (migration 268, linha 62).
- **Efeito:** a Carteira e a Fiscalização podem mostrar uma quantidade diferente da do Contrato 360.
- **Ligação certa:** `itens_contrato` como fonte. O vínculo guarda só a ligação e a correção humana (`quantidade_ajustada`).

### 2.5 Divisão por unidade não acompanha a quantidade do contrato
- **Onde:** `contrato_item_divisoes.quantidade_contrato` e `contrato_item_divisao_unidades.quantidade`. O gatilho da migration 110 só refaz as divisões automáticas. A do gestor "nunca é tocada", e nada compara a quantidade de quando dividiu com a atual.
- **Efeito:** o "livre por unidade" (`v_arp_item_unidade_contratado`) soma valores velhos, sem aviso.
- **Ligação certa:** aviso "divisão desatualizada" quando `quantidade_contrato` ≠ quantidade atual do vínculo. A decisão de não refazer a divisão do gestor fica.

### 2.6 Documentos SEI do pedido de emenda em colunas e numa tabela
- **Onde:** `emenda_pedidos` tem 10 colunas de SEI (`minuta_`, `oficio_`, `autorizado_`, `solicitado_`, `cgofi_documento_sei`, `empenhado_documentos_sei[]`…). Elas convivem com `emenda_pedido_documentos_sei` (1.243 linhas).
- **Como sincroniza:** o gatilho copia da coluna para a tabela. Nada volta da tabela para a coluna. A tela junta as duas origens (`emendasPedidos.ts:876`).
- **Já aconteceu:** correções feitas direto na tabela (25/10) ficaram diferentes da coluna.
- **Ligação certa:** a tabela como fonte única. As colunas viram uma view "documento que fecha a etapa".

### 2.7 Notas da emenda: valores copiados de `empenhos`
- **Onde:** `emenda_linha_notas` guarda `nota` (texto) junto com `empenho_id`, e ainda `valor_empenhado`/`liquidado`/`pago`, `contract_key` e datas de fatura e pagamento. O cron refaz tudo a cada hora (migration 235).
- **Efeito:**
  - a tela de Emendas fica até 1 h atrás do Financeiro;
  - o valor da nota inteira se repete em cada linha, e uma consulta que some sem deduplicar conta em dobro.
- **Ligação certa:** guardar só o vínculo (linha, `empenho_id`, regra, motivo) e ler valores e contrato de `empenhos`/`contrato_empenhos` numa view.

### 2.8 Contrato e parlamentar do pedido por texto
- **Contrato:** `emenda_pedido_linhas.contrato_numero` (texto da planilha) é casado com `contratos_oficiais.numero`, que não é único entre UASGs (migration 235, linha 175). A tela adivinha a chave (`chaveDoContratoDaEmenda`). **Ligação certa:** gravar a `contract_key` resolvida.
- **Emenda:** `emenda_pedidos.siop_emenda`/`siop_emenda_ano` repetem o número que já vem por `emenda_id`, e `emenda_pedido_emendas` (emendas complementares) liga só por número e ano. **Ligação certa:** chave estrangeira por `emenda_id`.
- **Parlamentar:** `salvar_emenda_siop` troca o parlamentar da emenda sem conferir os pedidos (migration 243, linha 346). O pedido continua com o parlamentar antigo. **Ligação certa:** o parlamentar do pedido vem da emenda, ou a troca fica bloqueada quando há pedido.
- **Sobras da decisão D1:** `siop_valor` e `siop_gnd` no pedido ainda aparecem como reserva (`emendasSobra.ts:113`, `Pedido360Header.tsx:226`).

### 2.9 Base da SENASP e adesões com dois gravadores
- **`itens_ata.quantidade_senasp`** é gravada:
  - pelo gatilho que lê `itens_ata_unidades_copia` (migration 102);
  - por `espelhar_participacao_na_carteira` (atas como participante).

  Vale o último que rodou.
- **Adesões:** ficam em `itens_ata_participacao.adesoes` (só as da SENASP) e em `itens_ata_unidades_copia.adesoes` (todas). A aba Adesões e a base do saldo podem divergir até a outra leitura chegar.
- **Ligação certa:** um gravador por tipo de ata. A parte da SENASP derivada da cópia completa por view.

### 2.10 Pagamento: cópias da fatura
- **Ciclo de pagamento:** `contract_payment_cycles` recopia NP, OB e datas de `v_contrato_faturas` e congela a primeira NP lida (migration 087). As tabelas do ciclo estão vazias, então o risco é latente.
- **Notas citadas na fatura:** `fatura_empenhos.numero_empenho` e `ordens_bancarias.empenhos[]` citam a nota só por número em texto. O pago já foi inflado por isso uma vez (estudo do saldo contábil).
- **Ligação certa:** gravar o `empenho_id` resolvido ao lado do número da fonte. NP e OB do ciclo devem vir por view.

---

## 3. Estruturas paralelas (mesmo papel, tabelas diferentes)

Nenhuma dá erro hoje. Toda regra nova, porém, precisa ser escrita duas vezes, e as cópias tendem a divergir.

| Assunto | Tabelas | Situação |
|---|---|---|
| Transferência temporária (férias) | `transferencias_temporarias(+_itens)` × `fisc_transferencias_temporarias(+_itens)` | Mesmas colunas e mesmo Desfazer. As 4 estão vazias. Unificar com `tipo = 'FISCAL'`. |
| Tarefas | 7 tabelas `ata_task_*` × 7 tabelas `contract_task_*` | Colunas idênticas. Unificar com `tipo` quando houver refatoração. |
| Decisões e descartes | `avisos_resolvidos`, `registrado_acima_decisoes`, `vinculo_automatico_decisoes`, `ausente_da_fonte_decisoes`, `contract_ata_descartes`, `arp_item_contract_dismissals`, `contrato_empenho_descartes`, `contrato_empenho_vinculo_recusado`, `contract_sem_ata_confirmacoes/_desfeitos`, `correcoes_*`, `notas_inclusao_na_fonte` | Cada uma tem efeito próprio, o que é aceitável. Padronizar quem, quando e justificativa, e não criar mais uma: usar uma tabela única de decisões (tipo, chave, decisão, autor). |
| Grupo GTI | `emenda_beneficiario_grupo` × `uasgs_grupo_gti` | Mesma forma, com listas de grupos em CHECK separados que já divergem (CNGM só em emendas). Uma lista única de grupos. Os cadastros continuam separados, porque são entidades diferentes. |
| Número SEI | `processos_sei` (vazia, só alvo de chave estrangeira de `arp_allocations`) × cerca de 60 colunas SEI em 30 tabelas | O "processo do contrato" está em `fisc_contratos.processo_sei`, `contract_payment_cycles.numero_processo_contrato_sei` e `contract_task_modulos.processo_sei`. Fonte: `fisc_contratos.processo_sei` (decisão da migration 266). Apagar `processos_sei`. |
| Data prevista de entrega | `fisc_entregas.prevista`, `emenda_linha_notas.entrega_prevista`, `contrato_entregas_previstas` (vazia) | Definir qual vale depois que a entrega passa à Fiscalização. |
| Registros de leitura | `contrato_empenhos_sincronizacao`, `contrato_faturas_sincronizacao`, `itens_contrato_leituras`, `saldo_contabil_cargas`, `np_consultas` × `sincronizacao_fontes` | Faz sentido por contrato nas notas e nos itens. A de faturas é só uma contagem e pode virar view. |

## 4. Limpeza: o que guarda cópia velha ou não é usado

| O quê | Por quê |
|---|---|
| `arp_allocations.empenhada_qty` | A tela manda 0 e o valor é recalculado na memória (`balanceService.ts:226`). |
| `localStorage` `saldoarp-item-meta-*` (`ItemBalances.tsx:444`) | Gravado e nunca lido. A primeira chave não tem UASG. |
| `itens_ata.quantidade_senasp_lida_em`, `itens_ata_unidades_copia.total_unidades`/`total_adesoes` | Sem leitura. Os totais são só o tamanho do JSON. |
| `ata_reajuste_parametros.termo_mes_apostilamento`/`termo_sei_apostilamento` | Copiados do 1º reajuste. `excluir_reajuste` não recalcula. Passar a view. |
| `contrato_faturas_sincronizacao.faturas` | Contagem que dá para tirar de `contrato_faturas`. |
| Colunas repetidas nas tabelas filhas de `contrato_empenhos` (`contract_key`, `empenho_id`) | Já têm a chave estrangeira `contrato_empenho_id`. |
| `fisc_entregas.programa_texto` nas entregas de emenda | Redundante com `programa_id`. |
| RPCs sem chamada: `descartar_empenho_do_contrato`, `restaurar_empenho_do_contrato`, `vincular_empenho_manual_ao_contrato`, `desvincular_empenho_manual_do_contrato`, `aplicar_vinculo_pelo_valor` | Conferir no banco se outra função ainda chama, antes de apagar. |

**Tabelas vazias que podem sair**, se a função foi mesmo abandonada (confirmar uma a uma):

- `processos_sei`
- `empenho_links` e `item_empenho_link_state` (a unidade vem da divisão desde a migration 103)
- `contract_payment_cycle*` (6 tabelas)
- `previsao_pagamentos(+_ajustes)`
- `contrato_expectativa_pagamento` e `contrato_entregas_previstas`
- `prazos_emendas`
- `distribuicao_avisos`
- `user_scope_assignments`
- `instrument_complexity_overrides`
- `emenda_kits`/`emenda_kit_itens` (recurso pronto, ainda sem uso: decidir)

As vazias usadas por funções do banco (`*_ausente_da_fonte`, `correcoes_*`, `vinculo_automatico_*`, `notas_inclusao_na_fonte`) **estão vivas**. Ficam vazias porque ainda não houve caso.

## 5. Cópias intencionais (não mexer)

- **Retratos das fontes oficiais**, guardados de propósito para comparar e para não depender da fonte no navegador:
  - `contratos_oficiais.registro`, `itens_contrato`, `contratos_detalhes_copia`, `contrato_faturas`, `ordens_bancarias`, `empenho_saldo_contabil`, `empenho_leituras_siafi`/`empenho_itens_siafi`;
  - `itens_ata_unidades_copia`/`_historico`, `atas_participacao`, `ata_item_quantidade_assinada`;
  - `siop_painel_emendas`, `emenda_execucao_portal`;
  - dados do SEI e da Receita.
- **Valores do momento**, guardados para detectar mudança: `contrato_empenho_distribuicoes.valor_nota`, `contrato_item_divisoes.quantidade_contrato` (falta só o aviso de 2.5), `itens_ata_preco_homologado`, `itens_ata_preco_apostilado`.
- **`empenhos.valor_empenhado`** (maior entre a fonte e o Tesouro) ao lado de `valor_empenhado_fonte`: migrations 136 e 196.
- **Documentos e decisões das emendas:**
  - ofício como documento histórico (`oficio_valor` ao centavo, minuta pelo preço do dia);
  - valor da emenda congelado quando já tem pedido (migration 252);
  - retrato do kit no pedido.
- **Registro de "quem fez"** (`*_por_nome`, `criado_por_nome`, `decidido_por_nome`…) e históricos: `empenho_eventos_historico`, `emenda_pedido_movimentos`, `emenda_beneficiarios_juntados`, `audit_logs`.
- **Fiscal separado do gestor** (papéis diferentes). O gestor do contrato herda o da ata pelo gatilho.
- **`fisc_entregas.*_texto` da origem CARGA:** grafia da planilha da SFC.
- **`atas_registro_preco.nome_uasg` × `uasgs_cadastro.nome`:** a tela mostra o do cadastro.
- **`uasgs_cadastro` × `internal_departments`:** órgãos externos e setores internos são coisas diferentes.
- **`fatura_pagamento`:** cache calculado no servidor por desempenho (migration 123).

## 6. Ordem sugerida de entregas

1. **Valor total da ata (1.1)**: decidir o valor da ata da CGLIC depois do apostilamento e usar uma regra só nas três funções e na sincronização.
2. **Juntar beneficiários (1.2)**: repassar `emendas_siop`, `fisc_entregas` e o grupo.
3. **Ordem de Fornecimento numa fonte só (1.3)**: Mesa, Andamento e Fiscalização lendo `emenda_pedido_ordens`. Depois, apagar as colunas antigas.
4. **Entregas × linha do pedido (1.4)**: leitura pela linha, ou conferência com aviso.
5. **Gestor e fiscal pelo id (2.2)**, que o dado de hoje permite trocar sem risco, e **perfis lidos do banco (2.3)**.
6. **Vigia de chaves órfãs e formato único da `ata_key` (2.1)**, depois o gatilho na troca do número da ata.
7. **Fontes únicas no meio do caminho**: 2.4, 2.5, 2.6, 2.7 e 2.8.
8. **Limpeza das seções 3 e 4**, com confirmação, tabela por tabela, do que foi abandonado.
