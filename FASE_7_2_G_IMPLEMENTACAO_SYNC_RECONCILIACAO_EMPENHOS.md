# FASE 7.2-G — RELATÓRIO DE IMPLEMENTAÇÃO CONTROLADA DO SYNC E RECONCILIAÇÃO DE EMPENHOS

**Data:** 24 de Setembro de 2026  
**Status da Fase:** **IMPLEMENTAÇÃO CONCLUÍDA COM SUCESSO (GO)**  
**Versão do Sistema:** SaldoARP 3.0  
**Ambiente Remoto:** Supabase PostgreSQL 17.6 (`bouutpmxexvwppcmmhdi`)  
**Especificação Base:** `FASE_7_2_F_PLANEJAMENTO_SYNC_RECONCILIACAO_EMPENHOS.md`

---

## 1. RESUMO EXECUTIVO

A **Fase 7.2-G** implementou o núcleo determinístico de:

```
FONTES OFICIAIS (Compras.gov, Contratos.gov, PNCP)
        ↓
ADAPTERS OFICIAIS (src/adapters/)
        ↓
NORMALIZAÇÃO DETERMINÍSTICA (src/services/empenhoNormalizationService.ts)
        ↓
RECONCILIAÇÃO POR PRECEDÊNCIA (src/services/empenhoReconciliationService.ts)
        ↓
M17 — RPCs TRANSACIONAIS ATÔMICAS (save_empenho_soberano_atomic, link_item, link_contract)
        ↓
M16 — SSOT DE EMPENHOS (public.empenhos, arp_item_empenhos, contrato_empenhos)
        ↓
M18 — READ MODELS ANALÍTICOS (v_empenhos_resumo, v_arp_item_saldo_detalhado, etc.)
```

### Invariantes Invioláveis Preservados
- **Zero migrations novas** (banco remoto intacto).
- **Zero tabelas, views ou RPCs novas** (utilização estrita de M16, M17 e M18).
- **Zero DML direto no frontend/adapters/services** (toda persistência passa exclusivamente pelas RPCs M17).
- **Separação Ontológica Ata ≠ Contrato** estritamente preservada (Art. 125 não contamina Atas; consumo de Ata é exclusivamente quantitativo).
- **Promoção MANUAL → SINCRONIZADO** preservando a flag `informado_manualmente_inicialmente = true`.

---

## 2. ARQUIVOS IMPLEMENTADOS

### 2.1 Tipos Canônicos
- `src/types/empenhoSync.ts`:
  - `EmpenhoFonteOrigem`: `'COMPRASNET' | 'CONTRATOSNET' | 'PNCP' | 'MANUAL' | 'SINCRONIZADO'`
  - `NormalizedEmpenho`: representação transitória em memória produzida pelos adapters.
  - `EmpenhoReconciliado`: modelo consolidado pós-reconciliação com conflitos e links discriminados.
  - `ConflitoCampo`: estrutura de auditoria de divergências entre fontes.
  - `EmpenhoSyncSummary`: relatório estruturado de sincronização.

### 2.2 Normalização Determinística
- `src/services/empenhoNormalizationService.ts`:
  - `normalizeUasgEmitente(rawUasg)`: sanitiza e garante 6 dígitos numéricos (`^[0-9]{6}$`).
  - `normalizeEmpenhoNumero(numeroRaw)`: normaliza variações (ex: `2026NE000142` → `2026NE142`, `000142` → `142`, `2026 NE 142` → `2026NE142`).
  - `normalizeAnoExercicio(anoRaw, fallbackDate, numeroRaw)`: extrai ano de padrão NE, ano de exercício ou data de emissão.
  - `buildCanonicalEmpenhoKey(uasg, ano, numeroNormalizado)`: gera chave canônica `{uasg}-{ano}-{numeroNormalizado}`.
  - `normalizeFromComprasGov(record, context)`: mapeia `EmpenhoSaldoItemRecord` → `NormalizedEmpenho`.
  - `normalizeFromContratosGov(record, context)`: mapeia `ContratosGovEmpenhoRecord` → `NormalizedEmpenho`.
  - `normalizeFromPncp(record, context)`: mapeia `PncpContractEmpenho` → `NormalizedEmpenho`.

### 2.3 Adapters Oficiais
- `src/adapters/comprasGovEmpenhoAdapter.ts`:
  - `fetchAndNormalizeComprasGovEmpenhos(options)`: consome `/modulo-arp/4_consultarEmpenhosSaldoItem` e normaliza.
- `src/adapters/contratosGovEmpenhoAdapter.ts`:
  - `fetchAndNormalizeContratosGovEmpenhos(options)`: consome `/api/contrato/{id}/empenhos` + `/consultar/{id}` (minuta) e normaliza.
- `src/adapters/pncpEmpenhoAdapter.ts`:
  - `fetchAndNormalizePncpEmpenhos(options)`: consome `/api/pncp/v1/orgaos/.../empenhos` e normaliza.

### 2.4 Reconciliação por Precedência de Campos
- `src/services/empenhoReconciliationService.ts`:
  - `reconcileNormalizedEmpenhos(records)`: agrupa por `canonical_key` e aplica a matriz oficial:
    * **Quantidade física de Item:** Compras.gov (primária) > Minuta Contratos.gov > Estimativa temporal.
    * **Execução financeira:** Contratos.gov / SIAFI (primária) > PNCP > Compras.gov.
    * **Credor e CNPJ:** Contratos.gov > Compras.gov.
    * **Data de emissão:** Contratos.gov > Compras.gov > PNCP.
    * **Detecção de divergências:** registra conflitos `VALOR`, `DATA`, `CREDOR`, `QUANTIDADE`.
    * **Status de reconciliação:** `CONFIRMADO`, `PENDENTE` ou `DIVERGENTE`.

### 2.5 Orquestração e Persistência M17
- `src/services/empenhoSyncService.ts`:
  - `persistReconciledEmpenhoM17(reconciled)`: persiste soberanamente via `save_empenho_soberano_atomic`, vincula itens via `link_empenho_to_item_atomic` e contratos via `link_empenho_to_contract_atomic`.
  - `syncReconciledBatch(reconciledList)`: processa lotes reconciliados de forma segura e idempotente.
  - `syncEmpenhosForItem(options)`: orquestra adapters, normalização, reconciliação e persistência para um item de Ata.

---

## 3. SUITE DE TESTES AUTOMATIZADOS IMPLEMENTADA

Foram criados 4 novos arquivos de testes unitários totalizando **40 novos testes**:

1. `src/services/__tests__/empenhoNormalizationService.test.ts` (19 testes)
   - Normalização de UASG (6 dígitos, padding, fallbacks)
   - Normalização de Número (padrões NE, dígitos, espaços, pontuação)
   - Extração determinística de Ano
   - Construção de `canonical_key`
   - Normalização de datas ISO e brasileiras
   - Mapeamento das 3 fontes (Compras.gov, Contratos.gov, PNCP)

2. `src/services/__tests__/empenhoReconciliationService.test.ts` (11 testes)
   - Matriz de precedência campo a campo
   - Detecção de divergências de valor, data e credor (CNPJ)
   - Promoção MANUAL → SINCRONIZADO
   - Cenários A, B, C e D
   - Idempotência e ordem de leituras

3. `src/adapters/__tests__/empenhoAdapters.test.ts` (7 testes)
   - Adapters de Compras.gov, Contratos.gov e PNCP
   - Resiliência contra HTTP 429, 500, timeout e respostas vazias

4. `src/services/__tests__/empenhoSyncService.test.ts` (3 testes)
   - Inviolabilidade M17: verificação de que `supabase.from` NUNCA é chamado, apenas `supabase.rpc`
   - Chamadas atômicas para `save_empenho_soberano_atomic`, `link_empenho_to_item_atomic`, `link_empenho_to_contract_atomic`
   - Tratamento resiliente de erros na persistência

---

## 4. RESULTADOS DE VALIDAÇÃO TÉCNICA

```text
============================================================
FASE 7.2-G — RESULTADO DA VERIFICAÇÃO
============================================================
Arquivos de Teste: 75 passed (75)
Total de Testes: 668 passed (668/668 PASS)
TypeScript: PASS (0 erros)
Lint (oxlint): PASS (0 erros, 43 warnings pré-existentes)
Build Vite: PASS (dist gerado com sucesso em 664ms)
Migrations alteradas: NÃO
Tabelas alteradas: NÃO
RPCs alteradas: NÃO
Views alteradas: NÃO
Frontend alterado: NÃO
============================================================
```
