# Auditoria: vínculo Empenho ↔ Contrato (06/10/2026)

Escopo: como o CGLIC lê as Notas de Empenho (NE) de um contrato, as grava e as liga ao contrato; o que a tela mostra; estado real do banco de produção; e o que as APIs abertas devolvem hoje. Somente leitura: nenhum dado ou código foi alterado.

## 1. Veredito

**Onde a sincronização rodou, o vínculo está correto.** Em 13 contratos amostrados (403 empenhos), o conjunto gravado em `contrato_empenhos` + `empenhos` é idêntico ao que `GET /api/contrato/{id}/empenhos` devolve: mesmos números, mesma UG emitente, mesmos valores empenhado, liquidado e pago. Em 14 contratos, todas as NEs citadas nas faturas (`/faturas`) já estavam vinculadas ao contrato certo.

**O problema não é o dado gravado, é o que acontece quando algo falha ou muda.** O fluxo engole erros (vira "sem dados"), não tem timeout, não remove vínculos obsoletos, consulta o PNCP com parâmetros inválidos, só cobre a UASG 200331 e não registra, por contrato, se a sincronização de fato aconteceu.

## 2. Como funciona hoje

```
contratos_oficiais.contrato_id_gov  (id interno do Contratos.gov.br, 1098 de 1099 contratos têm)
   └─ GET /api/contrato/{id}/empenhos          (aberto)            api.ts:1137
        └─ normalizeFromContratosGov            chave = {UG emitente}-{ano}-{AAAANEnnn}
             └─ reconcileNormalizedEmpenhos     funde fontes por chave canônica
                  └─ save_empenho_soberano_atomic (RPC, M17)       grava/atualiza a NE
                       └─ link_empenho_to_contract_atomic (RPC, M17) grava (contract_key, empenho_id)
```

Gatilhos: só manuais. Botão "Atualizar empenhos" no Contrato 360 (`Contract360Header.tsx:95-111`) e "Sincronizar Todos os Empenhos" na Execução Financeira (`FinancialExecutionRoute.tsx:46-53`, só UASG 200331 e só contratos não expirados). A tela do contrato lê exclusivamente do banco (`contractEmpenhosDbService.ts`), nunca da API. A Edge Function `sincronizar-fontes` não trata empenhos (só contratos, atas e itens).

## 3. Evidências (produção, 06/10/2026)

| Medida | Valor |
|---|---|
| Empenhos gravados | 1.225 (649 da UG 200331, 576 da UG 200330) |
| Vínculos contrato↔empenho | 1.228, em 346 contratos; todos criados em out/2026 |
| Contratos oficiais | 1.099 (1.057 na 200331, 42 na 200330) |
| Contratos vigentes 200331 com empenho | 344 de 408 |
| Contratos da 200330 com empenho | 0 de 42 |
| Vínculos órfãos (sem contrato oficial) | 0 |
| Empenhos ligados a mais de um contrato | 4 (espelham a API) |
| Empenhos com valor empenhado 0 | 94 (a API devolve 0 em todos os campos) |
| Pares (ano, número) existentes nas duas UGs | 132, com valores diferentes: são NEs distintas |

Checagens contra a API:

- 13 contratos, 403 empenhos: API = banco em número, UG, empenhado, liquidado e pago. Contratos: 00004/2017, 00005/2017, 00011/2026, 00030/2024 (279 NEs), 00065/2021, 00083/2024, 00098/2023, 00154/2026, 00165/2025, 00175/2025, 00213/2025, 00216/2025, 00296/2026.
- 14 contratos via `/faturas`: nenhuma fatura cita NE ausente do contrato no banco. Os 8 contratos vigentes sem empenho amostrados têm 0 faturas.
- `/api/contrato/22571/empenhos` (00021/2017) não respondeu em 300 s. O mesmo endpoint para 745812 responde em 0,3 s. O travamento é por contrato, não geral.
- PNCP `/orgaos/00394494000136/contratos/{ano}/{seq}/empenhos`: 404 "Nenhum empenho do contrato encontrado" nos 3 contratos testados do MJSP.
- `/api/v1/contrato/empenho/consultar/{id}` (minuta): 401, exige token.

Casos que parecem erro mas são fiéis à fonte:

- 2025NE000373 aparece duas vezes no contrato 00030/2024: uma da UG 200330 (id 14084410, R$ 0, 02/12/2025) e outra da UG 200331 (id 13208901, R$ 45.000, 08/05/2025). São dois documentos distintos no Contratos.gov.br. A chave canônica incluir a UG emitente é o que evita colapsá-los.
- 2024NE000028, 2024NE000029 e 2025NE000300 (Neoenergia) estão nos contratos 00004/2017 e 00005/2017; 2022NE000169 (Caixa, R$ 2,32 mi) está em 00065/2021 e 00083/2024. O Contratos.gov.br lista a mesma NE (mesmo id) nos dois contratos.

## 4. Problemas encontrados

Ordem: impacto no vínculo primeiro.

### 4.1 Falha vira "sem dados" (alta)

- `fetchContratosGovEmpenhos` devolve `[]` em qualquer erro HTTP ou exceção (`api.ts:1137-1150`); o adapter faz o mesmo (`contratosGovEmpenhoAdapter.ts:83-86`); o PNCP idem (`api.ts:1902-1916`, `pncpEmpenhoAdapter.ts:52-55`).
- O orquestrador marca a fonte como consultada e nunca registra erro (`empenhoOrchestrationService.ts:359-372`). O resultado é `SEM_DADOS` e a tela diz "Nenhum empenho".
- Vínculo que falha em `link_empenho_to_contract_atomic` vira `console.warn` e o empenho conta como salvo com sucesso (`empenhoSyncService.ts:149-157`, `itemContractEmpenhoService.ts:87-93`).
- Nenhum `fetch` de empenho tem timeout. O caso 22571 mostra que a API pode não responder; no lote (`useBatchSyncContractEmpenhos.ts:121`, `Promise.all` por bloco) um contrato travado para o bloco inteiro.
- Não existe registro por contrato de "última sincronização de empenhos" nem do resultado. Hoje é impossível distinguir, para os 64 vigentes sem empenho, "não tem NE" de "a API falhou".

### 4.2 PNCP consultado com parâmetros errados (alta, mas sem dano)

- `cnpj: contract.codigoOrgao` manda `'30911'` (código de órgão, não CNPJ) e `sequencialContrato: contract.numero` manda `'00052/2018'` (`Contract360Header.tsx:97-104`, `useBatchSyncContractEmpenhos.ts:36-43`). A URL fica inválida e devolve `[]`.
- Mesmo com parâmetros certos, o PNCP não tem empenhos para os contratos do MJSP testados. Hoje a fonte só gera ruído no resultado ("fontes consultadas: PNCP").
- Já existe `parseNumeroControlePncpContrato` (`pncpContratoService.ts:36`) e `cnpjDaUasg` (`unidadesGestoras.ts`) que resolveriam isso.

### 4.3 Chave interna usada como id do Contratos.gov.br (alta em conceito, baixa hoje)

- `contratoId: contract.contratoId || contract.id` (`Contract360Header.tsx:107`, `useBatchSyncContractEmpenhos.ts:48`). Sem o id, a chamada vira `/api/contrato/200331-00052-2018/empenhos` e cai em 4.1.
- Hoje só 1 dos 1.099 contratos está sem `contrato_id_gov`. O fluxo de item faz o certo: busca o id via `/ugorigem` e lança erro se não achar (`itemContractEmpenhoService.ts:133-140`).

### 4.4 Vínculo não tem ciclo de vida (média)

- Só há inserção/atualização. `unlink_empenho_from_contract_atomic` não é chamada em `src/`. Se o Contratos.gov.br deixar de listar uma NE no contrato, o vínculo fica para sempre.
- A RPC preserva o `valor_vinculado` antigo quando recebe NULL (`20260924000017:667`) e o cliente manda NULL quando a NE está zerada. Ao mesmo tempo grava um evento `ANULACAO_PARCIAL` com delta negativo (`:663, :672-691`): histórico e estado divergem.
- Hoje não há vínculo obsoleto (todos criados neste mês e a amostra API = banco), mas vai aparecer na primeira reclassificação na fonte.
- `contract_key` é texto livre: sem FK, sem checagem de existência na RPC (`20260924000017:625-648`). Zero órfãos hoje, mas nada impede.

### 4.5 Cobertura parcial (média)

- Lote só para `'200331'` (`FinancialExecutionRoute.tsx:36`). A 200330 tem 42 contratos e nenhum empenho.
- Lote exclui `statusVigencia === 'Expirado'`. O contrato 00021/2017 tem `vigencia_fim` 2022-12-01 no cadastro, mas teve 6 faturas liquidadas em out/2025 (NP 2025NP000545, OB 2025OB088173). Está "Ativo" na fonte e continua pagando, mas nunca entra no lote.
- `situacao` da fonte não serve de filtro: 646 dos 647 vencidos estão "Ativo".

### 4.6 Empenho compartilhado entre contratos (média)

- Os 4 casos de NE em dois contratos recebem 100% do valor em cada um (`valor_vinculado = valor_empenhado`). A tela do contrato e `v_contrato_empenhos_lastro` somam o total nos dois. O painel geral não duplica porque soma por empenho (`dashboardService.ts:697-703`).

### 4.7 Fórmulas de chave fora do canônico (baixa)

- `${uasg}-${numero}-${ano}` inline em `Contract360Header.tsx:69-73`, `useBatchSyncContractEmpenhos.ts:30-34`, `LinkContractModal.tsx:182`, `dashboardService.ts:152`. Só acionadas sem `contract.id`, mas produzem chave diferente de `resolveContractKey` (sem padding).
- Fallback de UASG emitente diverge entre fluxos: `'200331'` fixo no fluxo do contrato (`empenhoNormalizationService.ts:27-31`) e UASG do contrato no fluxo do item (`itemContractEmpenhoService.ts:54-57`). Sem efeito hoje (a API trouxe `unidade_gestora` em 100% dos 403), mas é uma fonte latente de NE duplicada.

### 4.8 Permissão e mensagem (baixa)

- `Contract360Page.tsx:140` não passa `userRole` nem `canSync`; o botão fica habilitado para todos. Para leitor/gestor_saldos as RPCs recusam (`has_role('gestor')`) e a mensagem vira "bases externas indisponíveis".

### 4.9 Valor 0 (baixa)

- 94 NEs com empenhado, liquidado, pago e RP iguais a 0 (ex.: 2026NE000294-296 da 200330, 2017NE800067). A fonte devolve 0; o sistema não diferencia "anulada" de "SIAFI ainda não carregado".

## 5. Soluções propostas

### Fase 1: tornar a falha visível e o lote robusto (implementada na branch feat/empenhos-sync-fase-1)

1. `fetchContratosGovEmpenhos` com `AbortController` (30 s) e **lançando** erro em vez de devolver `[]`; adapter propaga. Padrão já usado em `contratosGovContratoService.ts:36-39`.
2. Orquestrador registra `erros[]` por fonte e devolve `ERRO`/`SUCESSO_PARCIAL` quando a fonte falhou; vínculo falho entra em `erros` e não conta como salvo.
3. Registrar resultado por contrato: coluna `empenhos_sincronizados_em` + `empenhos_sync_status` (OK, SEM_NE, ERRO, mensagem) em `contratos_oficiais`, gravada pela RPC já existente `atualizar_contrato_oficial`. A tela mostra "atualizado em …" ou "falhou em …" em vez de "Nenhum empenho".
4. Lote: `Promise.allSettled`, uma nova tentativa para timeouts, lista final dos contratos que falharam com botão "tentar só estes".

### Fase 2: parâmetros corretos

5. `pncpParams` derivados de `parseNumeroControlePncpContrato(contract.numeroControlePncp)` e `cnpjDaUasg(contract.uasg)`; sem id PNCP, fonte "não aplicável". Como o PNCP não devolve empenhos do MJSP, considerar desligar a fonte até mostrar valor.
6. Nunca usar `contract.id` como `contratoId`. Sem id: resolver via `/ugorigem/{ug}/numeroano/{n}` como o fluxo de item, e gravar o id obtido em `contratos_oficiais`.
7. Substituir as 4 fórmulas inline por `resolveContractKey`; unificar o fallback de UASG emitente (usar a UASG do contrato nos dois fluxos, ou rejeitar registro sem `unidade_gestora`).

### Fase 3: ciclo de vida do vínculo

8. Nova RPC `sync_contract_empenhos_atomic(p_contract_key, p_empenhos jsonb[])` que substitui o conjunto do contrato (mesmo padrão de `sync_item_contract_empenhos_atomic`, M52): insere novos, atualiza `valor_vinculado` (inclusive para 0), remove os que a fonte não lista mais e grava evento `CANCELAMENTO_TOTAL` para cada remoção. Corrigir o delta de `ANULACAO_PARCIAL` em `link_empenho_to_contract_atomic` enquanto ela existir.
9. Marcar na tela a NE presente em mais de um contrato ("compartilhada com 00005/2017") e não somar 100% em cada um; `v_contrato_empenhos_lastro` passa a somar `valor_vinculado` rateado ou a expor a contagem de contratos por NE.
10. Opcional: `CHECK (contract_key ~ '^[0-9]{6}-(NE)?[0-9]{5}-[0-9]{4}$')` em `contrato_empenhos` e checagem de existência em `contratos_oficiais` na RPC.

### Fase 4: cobertura

11. Lote por UASG (incluir 200330) e critério de inclusão "vigente OU com fatura nos últimos 12 meses" em vez de só `statusVigencia`.
12. Mover o lote para a Edge Function. Pré-requisito: as RPCs de empenho usam `has_role`, que falha com service role (`auth.uid()` nulo). A migration 72 já avisa que isso precisa de adaptação.

### Fase 5: novo elo Fatura → NP → OB (dados que o sistema ainda não lê)

`GET /api/contrato/{id}/faturas` é aberto e rápido. Cada fatura traz `dados_empenho[] {id_empenho, numero_empenho, valor_empenho}`, `data_liquidacao`, `valor`, `situacao` ("Siafi Apropriado") e `sfadrao_id` (a NP). `GET https://sta.api.gov.br/api/ordembancaria/documento/{UG}{gestão}{NP}` é aberto e devolve a OB com valor, data, banco, agência, conta e o empenho.

Usos concretos para o CGLIC:

- **Cross-check automático do vínculo**: fatura que cita NE não vinculada ao contrato gera alerta "NE X paga no contrato Y mas não vinculada". Hoje o cruzamento manual deu zero divergências em 14 contratos; automatizado, vira guarda permanente.
- **Liquidação e pagamento reais por contrato**: hoje só existe o agregado liquidado/pago por NE vindo de `/empenhos`. As faturas dão o detalhe por documento e por data, e alimentam o módulo de acompanhamento de pagamentos (ciclos) com dados oficiais em vez de lançamentos manuais.
- **OB**: fecha a cadeia Empenho → Liquidação → Pagamento. Atenção: a NP agrupa várias faturas (2025NP000545 cobre 6 faturas, R$ 182.142,86) e a OB pode ser menor (R$ 164.930,36, provável retenção). Guardar a OB por NP, não por fatura, e não tentar ratear.

Modelo mínimo: `contrato_faturas (id_fatura PK, contract_key, empenho_id, numero, valor, data_liquidacao, situacao, np, raw)` e `ordens_bancarias (ug, gestao, np, numero_ob PK, valor, emissao, banco, agencia, conta, favorecido, raw)`. Leitura via Edge Function ou lote, depois da Fase 1.

## 6. Não verificado

- O que significa "empenhado = 0" na fonte (anulação ou carga pendente do SIAFI).
- Os 56 contratos vigentes sem empenho fora da amostra de 8.
- PNCP com todos os contratos (só 3 testados, todos 404).
- Se o travamento do endpoint de 22571 é permanente.
- A Edge Function em produção (o repositório indica que suas RPCs recusam service role, mas não executei).
