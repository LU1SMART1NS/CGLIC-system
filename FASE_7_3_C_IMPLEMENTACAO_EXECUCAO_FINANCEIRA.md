# FASE 7.3-C — IMPLEMENTAÇÃO DOS READ MODELS E ADAPTERS

## EXECUÇÃO FINANCEIRA — LIQUIDAÇÕES, PAGAMENTOS E RESTOS A PAGAR

**Data:** 24 de Setembro de 2026  
**Status da Fase:** CONCLUÍDA / APROVADA (GO)  
**Natureza:** IMPLEMENTAÇÃO TÉCNICA PURA DE DOMÍNIO E ADAPTERS  
**Cenário de Implementação:** CENÁRIO A (Zero Novas Tabelas / Zero Mutações em M16, M17 e M18)  
**Suíte de Testes:** 81 arquivos de teste | 716/716 testes PASS (100%)  
**Tipagem e Build:** TypeScript `tsc -b` PASS | `oxlint` 0 erros | Vite Build PASS  
**Integridade das Migrations:** M16, M17 e M18 100% íntegras e estáveis  

---

## 1. OBJETIVO DA FASE

Implementar a camada técnica e de serviços para suportar os cálculos de **Execução Orçamentária e Financeira** (estágios de Liquidação, Pagamento e Restos a Pagar) no SaldoARP, garantindo:
1. Normalização de dados financeiros oficiais oriundos da API Contratos.gov.br (espelho SIAFI);
2. Dedução determinística de saldos contábeis puros ($\text{Saldo a Liquidar}$, $\text{Saldo a Pagar}$, $\text{Saldo Não Executado}$, $\text{Saldo RP}$);
3. Cálculo de deltas ($\Delta$) e fingerprints de idempotência para snapshots de execução financeira;
4. Consolidação financeira por Contrato com proteção rigorosa contra *double counting*;
5. Isolamento absoluto do domínio físico-quantitativo do Item da Ata (`public.arp_item_empenhos`);
6. Cobertura completa de testes automatizados para os 15 cenários planejados (T1 a T15).

---

## 2. ARQUIVOS CRIADOS E MODIFICADOS

### A. Arquivos Criados
* `src/types/financialExecution.ts`: Definição de tipos canônicos de snapshots, saldos contábeis, deltas e agregados de contratos (`FinancialExecutionSnapshot`, `FinancialBalances`, `FinancialSnapshotDelta`, `RestosAPagarTipo`, `ContractFinancialExecutionSummary`).
* `src/services/financialExecutionService.ts`: Funções puras de cálculo matemático de saldos, deltas de snapshots, fingerprints e agregação de execução financeira.
* `src/services/__tests__/financialExecutionService.test.ts`: Suíte de testes unitários contendo os 15 cenários canônicos (T1 a T15).

### B. Arquivos Atualizados
* `src/types/index.ts`: Re-exportação dos tipos de execução financeira (`financialExecution.ts`).
* `src/types/empenhoSync.ts`: Inclusão dos campos detalhados de RP (`valor_rp_a_liquidar`, `valor_rp_liquidado`, `valor_rp_pago`) nas interfaces `NormalizedEmpenho` e `EmpenhoReconciliado`.
* `src/services/empenhoNormalizationService.ts`: Extração e parse monetário de `rpaliquidar`, `rpliquidado` e `rppago` no adaptador de Contratos.gov.br.
* `src/services/empenhoReconciliationService.ts`: Repasse determinístico dos campos detalhados de Restos a Pagar para a estrutura reconciliada final.

---

## 3. FÓRMULAS MATEMÁTICAS E SALDOS CANÔNICOS

Implementadas em `calculateFinancialBalances` (`src/services/financialExecutionService.ts`):

1. **Saldo a Liquidar (Exercício Corrente):**
   $$\text{Saldo a Liquidar} = \max(0, \text{valor\_empenhado} - \text{valor\_liquidado})$$
2. **Saldo a Pagar (Despesa Liquidada Pendente de Desembolso):**
   $$\text{Saldo a Pagar} = \max(0, \text{valor\_liquidado} - \text{valor\_pago})$$
3. **Saldo Total Não Executado do Empenho:**
   $$\text{Saldo Não Executado} = \max(0, \text{valor\_empenhado} - \text{valor\_pago})$$
4. **Saldo de Restos a Pagar Pendente:**
   $$\text{Saldo RP Pendente} = \max(0, \text{valor\_rpinscrito} - \text{valor\_rp\_pago})$$
5. **Taxa de Liquidação e Pagamento:**
   $$\text{Taxa Liquidação} = \left(\frac{\text{valor\_liquidado}}{\text{valor\_empenhado}}\right) \times 100$$
   $$\text{Taxa Pagamento} = \left(\frac{\text{valor\_pago}}{\text{valor\_liquidado}}\right) \times 100$$

---

## 4. ESTRATÉGIA DE SNAPSHOTS E IDEMPOTÊNCIA

* **Cálculo de Deltas:** A função `calculateFinancialSnapshotDelta(previous, current)` computa:
  $$\Delta \text{Empenhado}, \Delta \text{Liquidado}, \Delta \text{Pago}, \Delta \text{RP Inscrito}, \Delta \text{RP a Liquidar}, \Delta \text{RP Liquidado}, \Delta \text{RP Pago}$$
* **Semântica Rígida (GAP-7.3-01):** Os deltas representam a **evolução observada entre coletas**, sugerindo eventos `LIQUIDACAO_SNAPSHOT` ou `PAGAMENTO_SNAPSHOT` para a série temporal sem simular ordens bancárias fictícias.
* **Fingerprint Determinístico:** A função `buildFinancialSnapshotFingerprint(snapshot)` produz uma hash estável `{canonical_key}|EMP:...|LIQ:...|PAG:...|RP:...` que garante idempotência e impede a geração de snapshots redundantes ($\Delta = 0$).

---

## 5. PROTEÇÃO CONTRA DUPLA CONTAGEM (DOUBLE COUNTING)

Implementada na função `aggregateContractFinancialExecution`:
* Os empenhos fornecidos são indexados por `canonical_key` única em um `Map` relacional em memória;
* Mesmo que o contrato possua múltiplos vínculos, junções redundantes ou itens associados ao mesmo empenho, cada Nota de Empenho é agregada **estritamente uma única vez**;
* As grandezas `totalValorEmpenhadoGlobal`, `totalValorLiquidadoGlobal`, `totalValorPagoGlobal` e saldos consolidados mantêm 100% de exatidão matemática.

---

## 6. COBERTURA DA SUÍTE DE TESTES (CENÁRIOS T1 A T15)

Todos os 15 cenários foram validados em `src/services/__tests__/financialExecutionService.test.ts`:

| Teste | Cenário Validado | Resultado |
| :---: | :--- | :---: |
| **T1** | Empenho sem liquidação (`empenhado = 1000, liq = 0, pag = 0`) | **PASS** |
| **T2** | Empenho parcialmente liquidado (`empenhado = 1000, liq = 400, pag = 0`) | **PASS** |
| **T3** | Empenho totalmente liquidado (`empenhado = 1000, liq = 1000, pag = 0`) | **PASS** |
| **T4** | Liquidação parcial + pagamento parcial (`empenhado = 1000, liq = 600, pag = 400`) | **PASS** |
| **T5** | Liquidado maior que pago (`liq = 800, pag = 500` $\to$ $\text{saldo a pagar} = 300$) | **PASS** |
| **T6** | Liquidado igual a pago (`liq = 800, pag = 800` $\to$ $\text{saldo a pagar} = 0$) | **PASS** |
| **T7** | Empenho inscrito em RPNP (`rpaliquidar > 0` $\to$ RPNP) | **PASS** |
| **T8** | RPNP posteriormente liquidado (`rpliquidado > 0` $\to$ RPP) | **PASS** |
| **T9** | RPNP / RPP posteriormente pago (`rpInscrito = 500, rpPago = 500` $\to$ $\text{saldo RP} = 0$) | **PASS** |
| **T10** | Snapshot idêntico (idempotência $\to$ `hasChanges = false`, $\Delta = 0$) | **PASS** |
| **T11** | Snapshot com aumento de liquidação ($\Delta \text{Liq} = +300$ $\to$ `LIQUIDACAO_SNAPSHOT`) | **PASS** |
| **T12** | Snapshot com aumento de pagamento ($\Delta \text{Pag} = +300$ $\to$ `PAGAMENTO_SNAPSHOT`) | **PASS** |
| **T13** | Múltiplos contratos / duplicatas (proteção anti *double counting*) | **PASS** |
| **T14** | Múltiplos itens para mesmo empenho (sem multiplicação de valores) | **PASS** |
| **T15** | Isolamento do saldo quantitativo da Ata (quantidades físicas intactas) | **PASS** |

---

## 7. AUDITORIA FINAL DE INTEGRIDADE

* **Suíte de Testes Geral:** 81 arquivos de teste | **716/716 testes PASS** (anterior: 701; novos: +15).
* **Compilação TypeScript:** `tsc -b` executado com 0 erros.
* **Linter de Código:** `oxlint` executado com 0 erros.
* **Build de Produção:** Vite build concluído em 653ms com bundle gerado sem falhas.
* **M16/M17/M18:** Inalteradas (0 novas migrations, 0 novas tabelas).

---

## 8. RESULTADO FORMAL

```
============================================================
FASE 7.3-C — RESULTADO
======================

ARQUITETURA IMPLEMENTADA: SIM

NOVAS TABELAS: 0
NOVAS RPCs: 0
NOVAS VIEWS: 0 (M18 reutilizada integralmente)
ADAPTERS: 1 (Estendido: contratosGovEmpenhoAdapter / normalization)
SERVIÇOS: 1 (Criado: financialExecutionService)

TESTES ANTES: 701
TESTES DEPOIS: 716

TESTES: 716/716 PASS (100%)

TYPESCRIPT: PASS
LINT: PASS
BUILD: PASS

M16: ÍNTEGRA
M17: ÍNTEGRA
M18: ÍNTEGRA

DOUBLE COUNTING: PASS (Comprovado em testes)
IDEMPOTÊNCIA: PASS (Fingerprint e deltas nulos)
SNAPSHOTS: PASS (Semanticamente precisos)
RESTOS A PAGAR: PASS (RPNP / RPP mapeados)
SALDO QUANTITATIVO: PRESERVADO (Isolamento total)

CRITICAL: 0
HIGH: 0
MEDIUM: 0
LOW: 0
INFO: 0

VEREDITO:
GO — IMPLEMENTAÇÃO DE READ MODELS E ADAPTERS CONCLUÍDA

PRÓXIMA FASE:
7.3-D — HOMOLOGAÇÃO REAL DA EXECUÇÃO FINANCEIRA
============================================================
```
