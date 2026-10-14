# FASE 7.2-G-A — AUDITORIA FINAL DO SYNC E RECONCILIAÇÃO DE EMPENHOS

**Data:** 24 de Setembro de 2026  
**Status da Fase:** **HOMOLOGADA COM SUCESSO (GO)**  
**Versão do Sistema:** SaldoARP 3.0  
**Ambiente Remoto:** Supabase PostgreSQL 17.6 (`bouutpmxexvwppcmmhdi`)  
**Especificação Auditada:** `FASE_7_2_F_PLANEJAMENTO_SYNC_RECONCILIACAO_EMPENHOS.md`  
**Implementação Auditada:** `FASE_7_2_G_IMPLEMENTACAO_SYNC_RECONCILIACAO_EMPENHOS.md`

---

## 1. ESCOPO DA AUDITORIA

A **Fase 7.2-G-A** executou a auditoria técnica, arquitetural, contábil e transacional do fluxo completo de sincronização e reconciliação de empenhos do SaldoARP:

$$\text{Fontes Oficiais} \longrightarrow \text{Adapters} \longrightarrow \text{Normalização} \longrightarrow \text{Reconciliação} \longrightarrow \text{M17 RPCs} \longrightarrow \text{M16 SSOT} \longrightarrow \text{M18 Read Models}$$

A auditoria teve caráter **estritamente probatório e documental**, sem alterações de código funcional, sem novas migrations e sem modificações no schema M16, nas RPCs M17 ou nas Views M18.

---

## 2. ARQUITETURA AUDITADA

| Camada | Arquivos Auditados | Responsabilidade Verificada | Status |
| :--- | :--- | :--- | :---: |
| **Modelos Transitórios** | `src/types/empenhoSync.ts` | Tipos puros em memória (`NormalizedEmpenho`, `EmpenhoReconciliado`, `ConflitoCampo`) | ✅ APROVADO |
| **Normalização** | `src/services/empenhoNormalizationService.ts` | Sanitização determinística de UASG, Ano, Número e mapeamento | ✅ APROVADO |
| **Adapters Oficiais** | `src/adapters/comprasGovEmpenhoAdapter.ts`<br>`src/adapters/contratosGovEmpenhoAdapter.ts`<br>`src/adapters/pncpEmpenhoAdapter.ts` | Consumo de endpoints externos e delegação à normalização | ✅ APROVADO |
| **Reconciliação** | `src/services/empenhoReconciliationService.ts` | Agrupamento por `canonical_key`, matriz de precedência e conflitos | ✅ APROVADO |
| **Persistência M17** | `src/services/empenhoSyncService.ts` | Orquestração do lote e chamada atômica exclusiva via RPCs M17 | ✅ APROVADO |
| **Schema M16 (SSOT)** | `public.empenhos`, `arp_item_empenhos`, `contrato_empenhos`, `empenho_eventos_historico` | Tabelas soberanas imutáveis e relacionais em produção | ✅ INTACTO |
| **RPCs M17** | `save_empenho_soberano_atomic`, `link_empenho_to_item_atomic`, etc. | Persistência transacional com advisory lock e proteção contábil | ✅ INTACTO |
| **Read Models M18** | `v_empenhos_resumo`, `v_arp_item_saldo_detalhado`, etc. | Projeções analíticas sem double counting e `security_invoker=true` | ✅ INTACTO |

---

## 3. AUDITORIA DOS ADAPTERS

Confirmou-se nos três adapters (`comprasGovEmpenhoAdapter.ts`, `contratosGovEmpenhoAdapter.ts`, `pncpEmpenhoAdapter.ts`):
1. **Zero persistência no banco de dados:** Nenhum adapter realiza operações de `INSERT`, `UPDATE`, `DELETE` ou invoca `supabase.from()` / `supabase.rpc()`.
2. **Zero decisão de precedência:** Os adapters apenas convertem a resposta bruta para a estrutura `NormalizedEmpenho`.
3. **Resiliência isolada:** Falhas de rede, HTTP 429, HTTP 500 ou respostas vazias são capturadas localmente retornando `[]`, sem propagar exceções destrutivas.

---

## 4. AUDITORIA DE NORMALIZAÇÃO E IDENTIDADE

A regra de identidade canônica soberana foi verificada em:
$$\text{canonical\_key} = \text{UASG (6 dígitos)} - \text{Ano (4 dígitos)} - \text{Número Normalizado}$$

### Exemplos Auditados
- `"2026NE000142"` $\longrightarrow$ `200331-2026-2026NE142`
- `"2026 NE 000142"` $\longrightarrow$ `200331-2026-2026NE142`
- `"2026-NE-000142"` $\longrightarrow$ `200331-2026-2026NE142`
- `"000142"` $\longrightarrow$ `200331-2026-142`
- `"142"` $\longrightarrow$ `200331-2026-142`

Não há geração de chaves paralelas, nem uso de UUIDs sintéticos como identidade de negócio.

---

## 5. AUDITORIA DA MATRIZ DE PRECEDÊNCIA POR CAMPO

Auditou-se no código de `empenhoReconciliationService.ts` a aplicação estrita da Matriz de Precedência Oficial:

| Campo do Empenho | Fonte Vencedora (Precedência) | Justificativa Técnica / Contábil |
| :--- | :--- | :--- |
| **Quantidade Física do Item** | **Compras.gov.br** | Fonte primária com autoridade de consumo físico do item da Ata. Minuta do Contratos.gov é secundária. |
| **Valor Empenhado** | **Contratos.gov.br** | Reflete dados oficiais do SIAFI. PNCP é complementar; Compras.gov é terciário. |
| **Valor Liquidado / Pago / RP** | **Contratos.gov.br** | Autoridade exclusiva para grandezas de execução orçamentária. |
| **Credor / CNPJ** | **Contratos.gov.br** | Fonte prioritária (reflete SIAFI). Divergência de CNPJ gera status `DIVERGENTE`. |
| **Data de Emissão** | **Contratos.gov.br** | Contratos.gov > Compras.gov > PNCP. Divergência gera registro de conflito `DATA`. |
| **Vínculo com Item de Ata** | **Compras.gov.br** | Contexto determinístico do item na consulta. Sem fuzzy matching. |
| **Vínculo com Contrato** | **Contratos.gov.br / PNCP** | Identificador determinístico `contract_key`. Sem inferência textual. |

---

## 6. AUDITORIA DOS CENÁRIOS OBRIGATÓRIOS (A / B / C / D)

1. **Cenário A (Ata $\rightarrow$ Item $\rightarrow$ Contrato $\rightarrow$ Empenho):** Empenho recebe 1 vínculo físico em `arp_item_empenhos` e 1 vínculo financeiro em `contrato_empenhos`.
2. **Cenário B (Ata $\rightarrow$ Item $\rightarrow$ Empenho — Art. 95 / Instrumento Substitutivo):** Empenho recebe vínculo físico ao item, sem vínculo contratual forçado.
3. **Cenário C (Contrato sem Ata $\rightarrow$ Empenho):** Empenho recebe vínculo financeiro ao contrato, sem vínculo a item de Ata.
4. **Cenário D (Empenho sem vínculo determinístico):** Empenho é persistido soberanamente no M16 (`public.empenhos`) para fins de SSOT contábil, e os vínculos permanecem em `vinculos_pendentes` sem criação artificial de links.

---

## 7. AUDITORIA DO FLUXO MANUAL $\rightarrow$ SINCRONIZADO

1. **Criação Provisória:** Entrada manual cria registro com `fonte_origem = 'MANUAL'` e flag `informado_manualmente_inicialmente = true`.
2. **Promoção Automática:** Ao encontrar a mesma `canonical_key` em consulta oficial, `save_empenho_soberano_atomic` promove para `fonte_origem = 'SINCRONIZADO'`, atualiza dados oficiais e **preserva** `informado_manualmente_inicialmente = true`.
3. **Proteção contra Adulteração:** Chamada subsequente com `fonte_origem = 'MANUAL'` é rejeitada pelo M17 para atualização de fatos oficiais.

---

## 8. AUDITORIA DE PERSISTÊNCIA VIA M17 (INVIOLABILIDADE)

No arquivo `src/services/empenhoSyncService.ts`:
- Confirmou-se que a única forma de escrita no banco de dados ocorre através das funções:
  * `public.save_empenho_soberano_atomic`
  * `public.link_empenho_to_item_atomic`
  * `public.link_empenho_to_contract_atomic`
- O método `supabase.from()` **nunca** é invocado para mutação de tabelas M16.

---

## 9. RESULTADOS DOS TESTES UNITÁRIOS LOCAIS

Execução via Vitest: **75 arquivos de teste**, **668 testes PASS (100%)**.

### Detalhamento das Suites de Empenhos
- `empenhoNormalizationService.test.ts`: **19 testes PASS**
- `empenhoReconciliationService.test.ts`: **11 testes PASS**
- `empenhoAdapters.test.ts`: **7 testes PASS**
- `empenhoSyncService.test.ts`: **3 testes PASS**
- `empenhoRpcService.test.ts` (M17): **17 testes PASS**

---

## 10. RESULTADOS DOS TESTES REMOTOS NO SUPABASE (POSTGRESQL 17.6)

Bateria transacional executada via bloco PL/pgSQL anônimo autenticado:

```text
========================================================================
BATERIA REAL DE TESTES TRANSACIONAIS 7.2-G-A NO SUPABASE POSTGRESQL 17.6
========================================================================
[TESTE 1] Criação de empenho soberano (save_empenho_soberano_atomic): PASS
[TESTE 2] Idempotência de empenho soberano (is_new=false, 1 registro): PASS
[TESTE 3] Promoção MANUAL -> SINCRONIZADO e proteção contábil M17: PASS
[TESTE 4] Vínculo físico Item <-> Empenho (link_empenho_to_item_atomic): PASS
[TESTE 5] Idempotência de vínculo Item <-> Empenho (1 registro mantido): PASS
[TESTE 6] Vínculo financeiro Contrato <-> Empenho (link_contract): PASS
[TESTE 7] Idempotência de vínculo Contrato <-> Empenho (1 registro mantido): PASS
[TESTE 8] Histórico append-only (public.empenho_eventos_historico): PASS
[TESTE 9 & 10] Relação N:N e Prova Matemática Anti-Double Counting (M18): PASS
[TESTE 11] Cenário D (Empenho soberano sem vínculos artificiais): PASS
========================================================================
STATUS DA LIMPEZA PÓS-AUDITORIA:
- public.empenhos: 0
- public.arp_item_empenhos: 0
- public.contrato_empenhos: 0
- public.empenho_eventos_historico: 0
- public.v_empenhos_resumo: 0
- public.v_arp_item_saldo_detalhado: 1.322 (itens originais de Ata preservados)
- public.v_contrato_empenhos_lastro: 0
- public.v_empenho_serie_temporal: 0
- auth.users / public.user_roles: 0 registros residuais
- Trigger de imutabilidade (trg_protect_empenho_eventos_immutability): ATIVO (O)
========================================================================
```

---

## 11. AUDITORIA DE DOUBLE COUNTING

Para um empenho de R$ 50.000,00 vinculado a 2 itens e 2 contratos (produto cartesiano $2 \times 2 = 4$):
- A view `v_empenhos_resumo` retornou **exatamente R$ 50.000,00** de valor empenhado (zero duplicação);
- `total_vinculos_itens = 2`;
- `total_vinculos_contratos = 2`;
- `total_quantidade_consumida_itens = 100.0000`.

---

## 12. ISOLAMENTO ONTOLÓGICO ATA $\neq$ CONTRATO

Confirmou-se que:
- O vínculo `arp_item_empenhos` opera **exclusivamente sobre quantidade física** (`quantidade_consumida`);
- O vínculo `contrato_empenhos` opera **exclusivamente sobre valor financeiro** (`valor_vinculado`);
- Nenhuma coluna financeira fungível contamina a Ata de Registro de Preços;
- O saldo do Item da Ata permanece soberanamente:
$$\text{SaldoDisponivel} = \text{QuantidadeHomologada} - \sum \text{QuantidadeConsumida}$$

---

## 13. CORREÇÃO DA INCONSISTÊNCIA DOCUMENTAL DE TESTES

O relatório anterior da Fase 7.2-G continha um erro material na discriminação dos novos testes:
- **Texto anterior:** "14 + 9 + 6 + 3 = 32"
- **Contagem real auditada via Vitest:**
  * `empenhoNormalizationService.test.ts`: **19 testes**
  * `empenhoReconciliationService.test.ts`: **11 testes**
  * `empenhoAdapters.test.ts`: **7 testes**
  * `empenhoSyncService.test.ts`: **3 testes**
  * **Soma real:** $19 + 11 + 7 + 3 = \mathbf{40\text{ novos testes}}$.
- **Fechamento matemático:**
  $$\text{Testes Anteriores (7.2-E-R1)}: 628 \quad + \quad \text{Novos Testes (7.2-G)}: 40 \quad = \quad \mathbf{668\text{ Testes Atuais (75 arquivos)}}.$$

A inconsistência documental foi formalmente retificada.

---

## 14. RESUMO DE GAPs E RISCOS

- **Nenhum GAP bloqueante identificado.**
- **M16, M17 e M18:** 100% preservados e inalterados.
- **Ambiente de Produção:** 100% limpo e sem resíduos de teste.

---

## 15. CONCLUSÃO E VEREDITO

Todos os critérios de homologação foram rigorosamente auditados e aprovados.

```text
============================================================
FASE 7.2-G-A — RESULTADO
========================

IMPLEMENTAÇÃO: HOMOLOGADA (GO)

TESTES:
ANTERIORES: 628 (71 arquivos)
NOVOS: 40 (4 arquivos)
TOTAL: 668/668 PASS (75 arquivos)

TYPESCRIPT: PASS (0 erros)
LINT (oxlint): PASS (0 erros)
BUILD (Vite): PASS (dist gerado em 750ms)

TESTES REMOTOS:
PASS: 11/11
FAIL: 0

M16: INALTERADO
M17: INALTERADO
M18: INALTERADO

DADOS DE TESTE REMOVIDOS: SIM (100% limpo)

============================================================
VEREDITO FORMAL: GO
============================================================
```
