# FASE 7.2-I-A — AUDITORIA FINAL DA ORQUESTRAÇÃO ON-DEMAND DE EMPENHOS

**Data:** 24 de Setembro de 2026  
**Status da Fase:** **HOMOLOGADA COM SUCESSO (GO)**  
**Versão do Sistema:** SaldoARP 3.0  
**Ambiente Remoto:** Supabase PostgreSQL 17.6 (`bouutpmxexvwppcmmhdi`)  
**Especificação Auditada:** `FASE_7_2_H_PLANEJAMENTO_ORQUESTRACAO_ON_DEMAND.md`  
**Implementação Auditada:** `FASE_7_2_I_IMPLEMENTACAO_ORQUESTRACAO_ON_DEMAND.md`

---

## 1. ESCOPO DA AUDITORIA

A **Fase 7.2-I-A** auditou a implementação da camada de Orquestração On-Demand de Empenhos (`src/services/empenhoOrchestrationService.ts`), validando o despacho determinístico de sincronização por alvo de negócio, a inviolabilidade da cadeia de persistência M17/M16, o controle de concorrência por micro-lotes e a integridade ontológica do SaldoARP.

---

## 2. ARQUITETURA AUDITADA

$$\text{ALVO (ITEM / ATA / CONTRATO / EMPENHO)} \longrightarrow \text{ORQUESTRADOR ON-DEMAND} \longrightarrow \text{ADAPTERS} \longrightarrow \text{NORMALIZAÇÃO} \longrightarrow \text{RECONCILIAÇÃO} \longrightarrow \text{M17 RPCs} \longrightarrow \text{M16 SSOT} \longrightarrow \text{M18 READ MODELS}$$

- **Zero persistência paralela:** O orquestrador não realiza escrita direta nem cria tabelas intermediárias.
- **Isolamento de Domínio:** Adapters permanecem puros (leitura externa $\rightarrow$ `NormalizedEmpenho`).
- **Inviolabilidade M17:** Toda mutação de empenhos ou vínculos passa exclusivamente por `save_empenho_soberano_atomic`, `link_empenho_to_item_atomic` e `link_empenho_to_contract_atomic`.

---

## 3. AUDITORIA DO ROTEADOR CENTRAL (`orchestrateOnDemandSync`)

Auditou-se o ponto de entrada unificado:
- **Despacho estritamente discriminado:** `ITEM` $\rightarrow$ `orchestrateItemEmpenhoSync`, `ATA` $\rightarrow$ `orchestrateAtaEmpenhoSync`, `CONTRATO` $\rightarrow$ `orchestrateContractEmpenhoSync`, `EMPENHO` $\rightarrow$ `orchestrateEmpenhoSync`.
- **Tratamento de Alvo Inválido/Desconhecido:** Rejeição explícita com `INVALID_ORCHESTRATION_TARGET`, sem fallbacks silenciosos ou inferências ambíguas.

---

## 4. OPERAÇÃO POR ITEM DE ATA (`orchestrateItemEmpenhoSync`)

- **Validação:** Valida `itemKey` via `parseItemKey`, exigindo chave no formato canônico `{numeroAta}-{uasg}-{Pad5(numeroItem)}`.
- **Fontes:** Consulta Compras.gov.br como autoridade primária de consumo físico. Se houver contratos vinculados informados no payload, consulta Contratos.gov.br e PNCP.
- **Ontologia:** Vínculo `arp_item_empenhos` debita exclusivamente quantidade física. Nenhum débito financeiro afeta a Ata.

---

## 5. OPERAÇÃO POR ATA COMPLETA (`orchestrateAtaEmpenhoSync`)

- **Reutilização Canônica:** Reutiliza estritamente `orchestrateItemEmpenhoSync` para cada item, sem criar código de sync paralelo.
- **Micro-Lotes Controlados:** Processamento em blocos com `concurrencyLimit = 3` (padrão), prevenindo rate limit (HTTP 429) e saturação de requisições.
- **Consolidação:** Agrega com precisão totalizadores de itens salvos, empenhos processados, conflitos e pendências.

---

## 6. OPERAÇÃO POR CONTRATO (`orchestrateContractEmpenhoSync`)

- **Contrato com Ata:** Vincula o lastro financeiro em `contrato_empenhos` sem duplicar o vínculo físico da Ata.
- **Contrato sem Ata (Cenário C):** Funciona com total autonomia, consultando Contratos.gov.br e PNCP e persistindo em `contrato_empenhos`, sem dependência de registros em `itens_ata`.

---

## 7. OPERAÇÃO POR EMPENHO PONTUAL (`orchestrateEmpenhoSync`)

- **Identidade:** Valida `canonical_key` (`{uasg}-{ano}-{numeroNormalizado}`).
- **Cenário D (Sem vínculo determinístico):** Quando um empenho é localizado nas fontes oficiais mas não possui evidência inequívoca de vínculo com Item ou Contrato, a nota de empenho é persistida soberanamente no M16 (`public.empenhos`) e os vínculos permanecem em `vinculos_pendentes`, sem criação de vínculos inventados.

---

## 8. MATRIZ ALVO $\times$ FONTE EFETIVAMENTE AUDITADA

| Alvo | Compras.gov.br | Contratos.gov.br | PNCP | Observação de Conformidade |
| :--- | :---: | :---: | :---: | :--- |
| **ITEM** | **PRIMÁRIA** | COMPLEMENTAR | COMPLEMENTAR | Contratos consultados somente se vinculados ao item |
| **ATA** | **PRIMÁRIA** | COMPLEMENTAR | COMPLEMENTAR | Processada item a item em micro-lotes $\le 3$ |
| **CONTRATO** | NÃO APLICÁVEL | **PRIMÁRIA** | COMPLEMENTAR | Compras.gov não é consultada para contratos avulsos |
| **EMPENHO** | COMPLEMENTAR | COMPLEMENTAR | NÃO APLICÁVEL | Utiliza `contextHints` quando informados |

---

## 9. REUTILIZAÇÃO DE SERVIÇOS CANÔNICOS

Confirmou-se que o orquestrador não duplicou nenhuma das seguintes responsabilidades:
- `normalizeEmpenhoNumero`, `buildCanonicalEmpenhoKey` $\rightarrow$ `empenhoNormalizationService`
- `reconcileNormalizedEmpenhos` $\rightarrow$ `empenhoReconciliationService`
- `syncReconciledBatch`, `persistReconciledEmpenhoM17` $\rightarrow$ `empenhoSyncService`
- `parseItemKey`, `normalizeItemKey` $\rightarrow$ `itemKeyUtils`
- `formatPncpContractUrl` $\rightarrow$ `pncpUtils`

---

## 10. AUDITORIA DOS CENÁRIOS A, B, C E D

| Cenário | Descrição | Comportamento Auditado | Status |
| :---: | :--- | :--- | :---: |
| **A** | Ata $\rightarrow$ Item $\rightarrow$ Contrato $\rightarrow$ Empenho | Vínculo físico em `arp_item_empenhos` + vínculo financeiro em `contrato_empenhos` | ✅ HOMOLOGADO |
| **B** | Ata $\rightarrow$ Item $\rightarrow$ Empenho (Art. 95) | Vínculo físico ao item de Ata; zero vínculo contratual artificial | ✅ HOMOLOGADO |
| **C** | Contrato sem Ata $\rightarrow$ Empenho | Vínculo financeiro ao contrato; zero vínculo a item de Ata | ✅ HOMOLOGADO |
| **D** | Empenho sem vínculo determinístico | Empenho registrado no SSOT M16; zero vínculos artificiais | ✅ HOMOLOGADO |

---

## 11. AUDITORIA DE RESULTADOS E STATUS ESTRUTURADOS

Confirmou-se a segregação semântica estrita:
- **`SEM_DADOS` $\neq$ `ERRO`:** Quando as APIs governamentais retornam array vazio (200 OK sem registros), o status é `SEM_DADOS` (não é tratado como falha de sistema).
- **`ERRO`:** Reservado para falhas técnicas (HTTP 500, falha de rede, chave de negócio inválida).
- **`SUCESSO_PARCIAL`:** Aplicado quando parte dos itens de uma Ata falha enquanto outros são sincronizados com sucesso.
- **`COM_DIVERGENCIAS`:** Aplicado quando os empenhos são persistidos mas existem divergências contábeis não-bloqueantes registradas para auditoria.

---

## 12. FALHAS PARCIAIS E RATE LIMITING

- **Micro-Lotes:** A execução em lotes de 3 itens preserva a responsividade e mitiga o risco de esgotamento de quota (HTTP 429).
- **Não-Degradação do SSOT:** Se um item em lote falhar, os itens anteriores persistem no banco e o erro é registrado estruturadamente sem apagar dados pré-existentes.

---

## 13. AUDITORIA DE IDEMPOTÊNCIA E CONCORRÊNCIA

1. **Idempotência:** A re-execução da sincronização para o mesmo alvo (empenho, item, contrato, ata) reutiliza os advisory locks do M17, garantindo zero duplicações.
2. **Concorrência:** Chamadas simultâneas são serializadas pelos advisory locks transacionais (`pg_advisory_xact_lock`).

---

## 14. PAGINAÇÃO E RESILIÊNCIA

- As consultas com paginação em Compras.gov (`fetchEmpenhosSaldoItem`) e Contratos.gov utilizam os adapters existentes que consomem as páginas sequencialmente.
- Resiliência contra HTTP 429 e 500 confirmada via captura de exceções nos adapters.

---

## 15. SEGURANÇA E LEAST PRIVILEGE (P7)

- Zero DML direto do client em `public.empenhos`, `arp_item_empenhos`, `contrato_empenhos`;
- Nenhuma service role exposta;
- Permissões de escrita restritas a usuários autenticados com papéis `gestor` ou `admin`.

---

## 16. TESTES UNITÁRIOS LOCAIS

Execução via Vitest: **76 arquivos de teste**, **681 testes PASS (100%)**.
- `empenhoOrchestrationService.test.ts`: **13 testes PASS**
- `empenhoSyncService.test.ts`: **3 testes PASS**
- `empenhoReconciliationService.test.ts`: **11 testes PASS**
- `empenhoNormalizationService.test.ts`: **19 testes PASS**
- `empenhoAdapters.test.ts`: **7 testes PASS**

---

## 17. TESTES TRANSACIONAIS REMOTOS NO SUPABASE (POSTGRESQL 17.6)

Executada bateria E2E no banco remoto (`bouutpmxexvwppcmmhdi`):
- Teste 1 (Empenho pontual - Cenário D): PASS
- Teste 2 (Item de Ata direto - Cenário B): PASS
- Teste 3 (Contrato sem Ata - Cenário C): PASS
- Teste 4 (Ata com múltiplos itens - Cenário A com prova anti-double counting): PASS
- Teste 5 (Idempotência completa): PASS

### Contadores de Produção Pós-Auditoria
| Objeto | Contagem Baseline | Contagem Pós-Auditoria | Status |
| :--- | :---: | :---: | :---: |
| `public.empenhos` | 0 | **0** | ✅ LIMPO |
| `public.arp_item_empenhos` | 0 | **0** | ✅ LIMPO |
| `public.contrato_empenhos` | 0 | **0** | ✅ LIMPO |
| `public.empenho_eventos_historico` | 0 | **0** | ✅ LIMPO |
| `public.v_empenhos_resumo` | 0 | **0** | ✅ LIMPO |
| `public.v_arp_item_saldo_detalhado` | 1.322 | **1.322** | ✅ PRESERVADO |
| `public.v_contrato_empenhos_lastro` | 0 | **0** | ✅ LIMPO |
| `public.v_empenho_serie_temporal` | 0 | **0** | ✅ LIMPO |
| `auth.users` / `user_roles` | 0 | **0** | ✅ LIMPO |
| Trigger de Imutabilidade Histórica | Ativo (`O`) | **Ativo (`O`)** | ✅ BLINDADO |

---

## 18. GAPs REGISTRADOS

- **GAP-7.2-I-01: Integração com Frontend (Camada React / UI)**  
  Conforme planejado, a criação de hooks React (`useSyncItemEmpenhos`, `useSyncContractEmpenhos`, etc.) e botões na interface foi intencionalmente postergada para a próxima fase.

---

## 19. CONCLUSÃO E VEREDITO

A camada de Orquestração On-Demand de Empenhos foi aprovada em todos os requisitos técnicos, arquiteturais, contábeis e de segurança.

```text
============================================================
FASE 7.2-I-A — RESULTADO
========================

HOMOLOGAÇÃO: GO

TESTES:
ANTERIORES: 668 (75 arquivos)
NOVOS: 13 (1 arquivo)
TOTAL: 681/681 PASS (76 arquivos)

TESTES REMOTOS:
PASS: 5 blocos E2E (100%)
FAIL: 0

TYPESCRIPT: PASS (0 erros)
LINT (oxlint): PASS (0 erros)
BUILD (Vite): PASS (dist gerado em 562ms)

M16: INALTERADO
M17: INALTERADO
M18: INALTERADO

MIGRATIONS: 0
NOVAS RPCs: 0
NOVAS VIEWS: 0
FRONTEND: INALTERADO (Zero hooks/componentes criados)
DADOS DE TESTE REMOVIDOS: SIM (100% limpo)

GAPS: 1 (Integração de UI planejada para fase seguinte)

============================================================
VEREDITO FORMAL: GO
============================================================
```
