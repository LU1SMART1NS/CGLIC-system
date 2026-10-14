# FASE 7.2-K-B — SANEAMENTO PONTUAL DAS QUERY KEYS DA SINCRONIZAÇÃO DE EMPENHOS

**Data:** 24 de Setembro de 2026  
**Status da Fase:** **CONCLUÍDA COM SUCESSO (GO)**  
**Versão do Sistema:** SaldoARP 3.0  
**Escopo:** Saneamento Cirúrgico de Query Keys e Invalidação de Cache no Hook `useSyncContractEmpenhos.ts`

---

## 1. RESUMO EXECUTIVO

A **Fase 7.2-K-B** executou o saneamento estrito e pontual dos dois achados classificados como `LOW` na auditoria **Fase 7.2-K-A**:

1. **F72KA-01 (Grafia da Query Key):** Correção da chave de invalidação de eventos contratuais para a assinatura canônica exata `['contract-events', contractKey]`.
2. **F72KA-02 (Over-Invalidation de Saldo da Ata):** Remoção da invalidação desnecessária de `['v_arp_item_saldo_detalhado']` na sincronização com origem em Contrato.

Nenhuma regra de negócio, schema de banco (M16), RPC (M17), view (M18), adapter, normalizador ou regra de RBAC foi alterada.

---

## 2. DETALHAMENTO DAS ALTERAÇÕES REALIZADAS

### 2.1. F72KA-01 — Correção da Query Key de Eventos do Contrato
- **Diagnóstico:** O hook canônico [`src/hooks/useContractEvents.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/hooks/useContractEvents.ts) registra `['contract-events', contractKey]` (com hífen). O hook de sincronização continha `['contract_events', contractKey]` (com sublinhado).
- **Ação:** Atualizado [`src/hooks/useSyncContractEmpenhos.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/hooks/useSyncContractEmpenhos.ts) para utilizar exclusivamente `['contract-events', contractKey]`.

### 2.2. F72KA-02 — Avaliação e Remoção de Invalidação Indevida da Ata
- **Diagnóstico Arquitetural:** O fluxo `orchestrateContractEmpenhoSync` cria/atualiza o vínculo financeiro entre Contrato e Empenho (`public.contrato_empenhos`), sem afetar o consumo quantitativo físico do item da Ata (`public.arp_item_empenhos`).
- **Ação:** A chamada `queryClient.invalidateQueries({ queryKey: ['v_arp_item_saldo_detalhado'] })` foi **removida** de `useSyncContractEmpenhos.ts`, preservando o isolamento ontológico Ata $\neq$ Contrato e eliminando refetches desnecessários.

---

## 3. LISTA FINAL DE QUERY KEYS INVALIDADAS NO CONTRATO 360°

Após o saneamento, as seguintes 4 chaves canônicas são cirurgicamente invalidadas no `onSuccess`:

1. `['contract', contractKey]` (Metadados do contrato)
2. `['v_contrato_empenhos_lastro', contractKey]` (Painel de lastro orçamentário M18)
3. `['v_empenhos_resumo']` (Listagem analítica global de empenhos M18)
4. `['contract-events', contractKey]` (Linha do tempo de eventos do contrato)

---

## 4. ARQUIVOS MODIFICADOS

1. [`src/hooks/useSyncContractEmpenhos.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/hooks/useSyncContractEmpenhos.ts): Atualização cirúrgica das chamadas ao `queryClient.invalidateQueries`.
2. [`src/hooks/__tests__/useSyncContractEmpenhos.test.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/hooks/__tests__/useSyncContractEmpenhos.test.ts): Ajuste dos testes unitários com asserções estritas comprovando o uso de `contract-events`, a não-utilização de `contract_events` e a ausência de invalidação de `v_arp_item_saldo_detalhado`.

---

## 5. RESULTADOS DE VALIDAÇÃO E AUDITORIA

- **Vitest Unit & Integration Tests:** 78 arquivos de teste, **691/691 testes PASS** (100% de aprovação).
- **TypeScript Compiler (`tsc -b`):** 0 erros.
- **Linter (`oxlint`):** 0 erros.
- **Vite Build (`npm run build`):** Bundle de produção gerado com sucesso.
- **Banco de Dados (M16/M17/M18):** 100% íntegros e inalterados (0 migrations).

---

## 6. GIT FORENSICS

```text
Modificados na 7.2-K-B:
- src/hooks/useSyncContractEmpenhos.ts
- src/hooks/__tests__/useSyncContractEmpenhos.test.ts
- FASE_7_2_K-B_SANEAMENTO_CACHE_UI_EMPENHOS.md

Zero alterações em:
- M16 / M17 / M18
- RBAC / userService / user.ts
- empenhoOrchestrationService / Adapters
```

---

## 7. CONCLUSÃO

O saneamento foi executado com precisão cirúrgica. A integração de sincronização de empenhos na Visão 360° do Contrato encontra-se com governança de cache limpa, canônica e auditada.
