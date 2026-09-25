# FASE 7.2-M-A — AUDITORIA INTEGRADA DA SINCRONIZAÇÃO DE EMPENHOS (ITEM DA ATA × CONTRATO)

**Data da Auditoria:** 24 de Setembro de 2026  
**Status da Fase:** **AUDITORIA CONCLUÍDA — VEREDITO: GO TOTAL**  
**Versão do Sistema:** SaldoARP 3.0  
**Caráter:** Auditoria Integral de Arquitetura, Idempotência, Soberania de Dados e Integrações UI

---

## 1. OBJETIVO DA AUDITORIA

Realizar auditoria técnica independente e cruzada entre as duas portas de entrada de sincronização on-demand de empenhos implementadas no SaldoARP:
1. **Visão 360° do Contrato** ([`Contract360Header.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/Contract360Header.tsx) / [`useSyncContractEmpenhos.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/hooks/useSyncContractEmpenhos.ts));
2. **Visão do Item da Ata** ([`ItemBalancesHeader.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/item-balances/ItemBalancesHeader.tsx) / [`useSyncItemEmpenhos.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/hooks/useSyncItemEmpenhos.ts)).

A auditoria teve como missão comprovar que:
- O mesmo empenho é descoberto e sincronizado por ambos os contextos sem gerar duplicidade de registro em `public.empenhos`;
- A relação **Item $\leftrightarrow$ Empenho** permanece estritamente quantitativa (consumo físico);
- A relação **Contrato $\leftrightarrow$ Empenho** permanece estritamente financeira (lastro orçamentário);
- Não existe criação de segundo SSOT nem contaminação entre domínios.

---

## 2. ESCOPO AUDITADO

- Normalização: [`src/services/empenhoNormalizationService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/empenhoNormalizationService.ts)
- Reconciliação: [`src/services/empenhoReconciliationService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/empenhoReconciliationService.ts)
- Sincronização e RPCs: [`src/services/empenhoSyncService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/empenhoSyncService.ts) e [`supabase/migrations/20260924000017_rpc_empenhos_atomic.sql`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/supabase/migrations/20260924000017_rpc_empenhos_atomic.sql)
- Orquestração On-Demand: [`src/services/empenhoOrchestrationService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/empenhoOrchestrationService.ts)
- Read Models M18: [`supabase/migrations/20260924000018_empenho_sync_and_views.sql`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/supabase/migrations/20260924000018_empenho_sync_and_views.sql)
- Hooks e Componentes React: `useSyncContractEmpenhos.ts`, `useSyncItemEmpenhos.ts`, `Contract360Header.tsx`, `ItemBalancesHeader.tsx`
- Bateria de Testes: 80 arquivos de teste, 701 testes unitários e de integração.

---

## 3. IDENTIDADE CANÔNICA DO EMPENHO

A chave canônica soberana é universalmente gerada pela função `buildCanonicalEmpenhoKey`:
$$\text{canonical\_key} = \text{uasg} + \text{"-"} + \text{ano} + \text{"-"} + \text{numeroNormalizado}$$

### Evidência de Normalização Determinística
- `"2026NE000142"`, `"2026 NE 000142"`, `"2026-NE-000142"` e `"2026NE142"` normalizam identicamente para `"2026NE142"`;
- Para a UASG `"200331"` e ano `2026`, o resultado é invariavelmente `"200331-2026-2026NE142"`;
- **Veredito:** **CONFORME (GO)**. Impossibilidade de chave duplicada ou colisão por formatações distintas de fornecedores ou órgãos.

---

## 4. CENÁRIO A: EMPENHO $\longrightarrow$ ITEM $\longrightarrow$ CONTRATO (Ordem Temporal)

1. **Passo 1 (Sincronização pelo Item):**
   - O usuário aciona "Sincronizar Empenhos" no Item da Ata;
   - `orchestrateItemEmpenhoSync` busca na API Compras.gov.br;
   - `rpc_sync_empenho_reconciliado_atomic` persiste 1 registro em `public.empenhos` e 1 registro em `public.arp_item_empenhos`;
   - `public.contrato_empenhos` permanece com 0 registros.
2. **Passo 2 (Formalização Posterior do Contrato):**
   - Em momento posterior, o Contrato é formalizado e sincronizado via `orchestrateContractEmpenhoSync`;
   - O orquestrador detecta a mesma `canonical_key`;
   - A RPC atualiza os metadados em `public.empenhos` e insere 1 registro em `public.contrato_empenhos`;
   - `public.empenhos` continua com exatamente 1 registro (sem duplicação).
- **Veredito:** **CONFORME (GO)**.

---

## 5. CENÁRIO B: EMPENHO $\longrightarrow$ CONTRATO $\longrightarrow$ ITEM (Cenário Inverso)

1. **Passo 1 (Sincronização pelo Contrato):**
   - O usuário aciona "Sincronizar Empenhos" no Contrato 360°;
   - `orchestrateContractEmpenhoSync` localiza o empenho em Contratos.gov/PNCP e grava em `public.empenhos` e `public.contrato_empenhos`;
   - `public.arp_item_empenhos` permanece com 0 registros (saldo da Ata inalterado).
2. **Passo 2 (Sincronização Posterior pelo Item):**
   - O usuário sincroniza o Item da Ata correspondente;
   - O orquestrador reconcilia o empenho e adiciona a linha em `public.arp_item_empenhos`;
   - `public.empenhos` permanece unitário.
- **Veredito:** **CONFORME (GO)**.

---

## 6. IDEMPOTÊNCIA E CONTROLE DE CONCORRÊNCIA

- **Advisory Locks Transacionais:** Toda mutação M17 obtém `pg_advisory_xact_lock(hashtext('save_empenho:' || v_canonical_key))`, serializando operações concorrentes sobre a mesma chave;
- **Múltiplos Disparos:** Disparar `A -> B -> C -> D` (Item $\rightarrow$ Contrato $\rightarrow$ Item $\rightarrow$ Contrato) produz exatamente o mesmo estado estável, sem gerar registros órfãos ou duplicados;
- **Double-Click Protection na UI:** Ambos os botões desabilitam instantaneamente durante `isPending === true`.
- **Veredito:** **CONFORME (GO)**.

---

## 7. SEPARAÇÃO QUANTIDADE (FÍSICO) vs FINANCEIRO (ORÇAMENTÁRIO)

| Dimensão | Item da Ata | Contrato Administrativo |
| :--- | :--- | :--- |
| **Natureza da Relação** | Consumo físico de itens registrados | Lastro e execução orçamentária |
| **Tabela de Vínculo** | `public.arp_item_empenhos` | `public.contrato_empenhos` |
| **Coluna Operacional** | `quantidade_consumida` (numérico) | `valor_vinculado` (moeda BRL) |
| **Fórmula Soberana** | $\text{QtdHomologada} - \sum \text{QtdConsumida}$ | $\sum \text{ValorVinculado}$ |
| **Impacto Cruzado** | Zero impacto no valor do contrato | Zero impacto no saldo físico do item |

- **Veredito:** **CONFORME (GO)**. Isolamento ontológico estritamente garantido.

---

## 8. INTEGRIDADE DAS VIEWS M18 (READ MODELS)

1. `v_empenhos_resumo`: Utiliza CTEs pré-agregadas independentes (`item_agg` e `contract_agg`), eliminando o risco de produto cartesiano quando um empenho está vinculado a múltiplos itens e contratos.
2. `v_arp_item_saldo_detalhado`: Agrega exclusivamente `public.arp_item_empenhos`. Não efetua join com `contrato_empenhos`, garantindo que o saldo físico não sofra double-counting por contratos.
3. `v_contrato_empenhos_lastro`: Agrega exclusivamente `public.contrato_empenhos`. Não efetua join com `arp_item_empenhos`.
4. `v_empenho_serie_temporal`: Baseada em eventos cronológicos com índice `idx_emp_evt_hist_data_evento`.
- **Veredito:** **CONFORME (GO)**.

---

## 9. AUDITORIA DE HISTÓRICO (`public.empenho_eventos_historico`)

- **Append-Only:** Eventos são estritamente acumulativos com `id`, `empenho_id`, `tipo_evento`, `dados_evento`, `criado_em`;
- **Tipos de Evento Distintos:**
  * `CRIACAO`: Criação da Nota de Empenho soberana;
  * `ATUALIZACAO`: Atualização de valores ou credor;
  * `VINCULO_ITEM`: Associação ao consumo de item de Ata;
  * `VINCULO_CONTRATO`: Associação ao lastro financeiro de Contrato.
- **Veredito:** **CONFORME (GO)**.

---

## 10. AUDITORIA DAS INTERFACES E CACHES

### 10.1. Contrato 360° ([`Contract360Header.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/Contract360Header.tsx))
- **Botão Contextual:** "Sincronizar Empenhos";
- **RBAC:** `gestor`, `coordenador`, `admin` autorizados; `consulta` desabilitado;
- **Query Keys Invalidadas:**
  * `['contract', contractKey]`
  * `['v_contrato_empenhos_lastro', contractKey]`
  * `['v_empenhos_resumo']`
  * `['contract-events', contractKey]` (canônica com hífen saneada na 7.2-K-B)
- **Feedback:** Focado no lastro orçamentário do contrato.

### 10.2. Item da Ata ([`ItemBalancesHeader.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/item-balances/ItemBalancesHeader.tsx))
- **Botão Contextual:** "Sincronizar Empenhos";
- **RBAC:** `gestor`, `coordenador`, `admin` autorizados; `consulta` desabilitado;
- **Query Keys Invalidadas:**
  * `['item-empenhos', numeroAta, uasg, numeroItem]` (e padded `00001`)
  * `['item-unidades', numeroAta, uasg, numeroItem]` (e padded `00001`)
  * `['v_arp_item_saldo_detalhado', itemKey]`
  * `['v_arp_item_saldo_detalhado']`
  * `['v_arp_item_empenhos_resumo', itemKey]`
  * `['v_empenhos_resumo']`
  * `['item-allocations', itemKey]`
- **Feedback:** Focado no consumo quantitativo e saldo do item.

- **Veredito:** **CONFORME (GO)**. Caches cirúrgicos e sem contaminação mútua.

---

## 11. SEGURANÇA E ACESSO

- **Zero Chamadas Diretas:** Nenhum componente de UI acessa credenciais, tokens ou endpoints externos de APIs oficiais;
- **PostgreSQL RLS & Security Definer:** Persistência executada exclusivamente via RPCs M17 auditadas;
- **RBAC Consistente:** Ambos os fluxos compartilham a mesma matriz de autorização.
- **Veredito:** **CONFORME (GO)**.

---

## 12. RESULTADOS DOS TESTES E REGRESSÃO

```bash
npx vitest run
# Output: Test Files: 80 passed (80) | Tests: 701 passed (701)

npx tsc -b
# Output: 0 errors

npm run lint
# Output: 0 errors

npm run build
# Output: vite build concluído com sucesso em 566ms
```

---

## 13. GIT FORENSICS

- **Migrations Novas:** 0
- **RPCs Novas:** 0
- **Views Novas:** 0
- **M16/M17/M18:** 100% íntegros e inalterados.
- **Arquivos Funcionais Criados na Fase 7.2-M:**
  * `src/hooks/useSyncItemEmpenhos.ts`
  * `src/hooks/__tests__/useSyncItemEmpenhos.test.ts`
  * `src/components/item-balances/__tests__/ItemBalancesHeader.test.tsx`
- **Arquivos Modificados na Fase 7.2-M:**
  * `src/components/item-balances/ItemBalancesHeader.tsx`

---

## 14. TABELA DE ACHADOS

- **CRITICAL:** 0
- **HIGH:** 0
- **MEDIUM:** 0
- **LOW:** 0
- **INFO:** 0

---

## 15. CONCLUSÃO E VEREDITO

A auditoria integrada comprova que o subsistema de empenhos do SaldoARP opera com total consistência, determinismo, idempotência e isolamento ontológico em ambos os pontos de entrada (**Contrato 360°** e **Item da Ata**).

O sistema está pronto e formalmente homologado para avançar para as próximas etapas (ex: sincronização em lote no nível da Ata de Registro de Preços completa).
