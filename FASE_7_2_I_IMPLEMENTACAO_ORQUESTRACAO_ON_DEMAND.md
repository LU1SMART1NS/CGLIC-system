# FASE 7.2-I — RELATÓRIO DE IMPLEMENTAÇÃO DA ORQUESTRAÇÃO ON-DEMAND DE EMPENHOS

**Data:** 24 de Setembro de 2026  
**Status da Fase:** **IMPLEMENTAÇÃO CONCLUÍDA COM SUCESSO (GO)**  
**Versão do Sistema:** SaldoARP 3.0  
**Ambiente Remoto:** Supabase PostgreSQL 17.6 (`bouutpmxexvwppcmmhdi`)  
**Especificação Base:** `FASE_7_2_H_PLANEJAMENTO_ORQUESTRACAO_ON_DEMAND.md`

---

## 1. ESCOPO DA IMPLEMENTAÇÃO

A **Fase 7.2-I** implementou a camada de **Orquestração On-Demand de Empenhos** do SaldoARP. Esta camada funciona como coordenador central de sincronização por alvo de negócio, despachando chamadas para as fontes governamentais externas, normalizando em memória, reconciliando por precedência e persistindo exclusivamente via M17 no SSOT M16:

$$\text{ALVO} \longrightarrow \text{ORQUESTRADOR ON-DEMAND} \longrightarrow \text{FONTES} \longrightarrow \text{ADAPTERS} \longrightarrow \text{NORMALIZAÇÃO} \longrightarrow \text{RECONCILIAÇÃO} \longrightarrow \text{M17} \longrightarrow \text{M16} \longrightarrow \text{M18}$$

---

## 2. ARQUITETURA IMPLEMENTADA

### Invariantes Invioláveis
1. **Zero Lógica Duplicada:** O orquestrador não reimplementa normalização, precedência, cálculo de saldos ou persistência. Ele delega estritamente aos módulos homologados.
2. **Persistência Estritamente M17:** Nenhuma operação direta de escrita (`INSERT`, `UPDATE`, `DELETE` ou `supabase.from()`) é executada em tabelas M16.
3. **Isolamento Ontológico Ata $\neq$ Contrato:** 
   - Consumo do item de Ata é **exclusivamente físico-quantitativo**;
   - Vínculo contratual é **exclusivamente financeiro de lastro**.
4. **Resiliência e Pureza de Fatos:** Falhas externas retornam status estruturados (`SEM_DADOS`, `SUCESSO_PARCIAL`, `ERRO`) e **nunca** degradam ou apagam fatos oficiais do SSOT.

---

## 3. OPERAÇÕES IMPLEMENTADAS

Arquivo criado: [`src/services/empenhoOrchestrationService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/empenhoOrchestrationService.ts)

1. `orchestrateItemEmpenhoSync(target: ItemTarget): Promise<OrchestrationResult>`
   - Valida `itemKey` via `parseItemKey` / formato canônico;
   - Consulta Compras.gov.br (consumo físico) e Contratos.gov.br / PNCP para contratos vinculados;
   - Reconcilia por precedência e persiste via `syncReconciledBatch` (M17).

2. `orchestrateAtaEmpenhoSync(target: AtaTarget): Promise<OrchestrationResult>`
   - Executa a sincronização dos itens da Ata em **micro-lotes controlados** (`concurrencyLimit`, padrão 3) para prevenir saturação de taxa (HTTP 429);
   - Reutiliza deterministicamente `orchestrateItemEmpenhoSync` para cada item;
   - Consolida métricas, divergências e pendências em um relatório único da Ata.

3. `orchestrateContractEmpenhoSync(target: ContractTarget): Promise<OrchestrationResult>`
   - Consulta Contratos.gov.br (`contratoId`) e PNCP (`cnpj`, `ano`, `sequencialContrato`);
   - Reconcilia execução financeira e vincula em `contrato_empenhos`;
   - Suporta integralmente o **Cenário C (Contrato sem Ata)**.

4. `orchestrateEmpenhoSync(target: EmpenhoTarget): Promise<OrchestrationResult>`
   - Sincroniza empenho pontual com base em `canonical_key`;
   - Suporta o **Cenário D (Empenho sem vínculo determinístico)** persistindo o empenho soberano sem inventar links artificiais.

5. `orchestrateOnDemandSync(target: OrchestrationTarget): Promise<OrchestrationResult>`
   - Roteador unificado com despacho tipado em tempo de compilação.

---

## 4. MATRIZ ALVO $\times$ FONTE UTILIZADA

| Alvo | Compras.gov.br | Contratos.gov.br | PNCP | Comportamento em Caso de Falha de Fonte |
| :--- | :---: | :---: | :---: | :--- |
| **ITEM** | ✅ Primária | ✅ (se houver contrato) | ✅ (se houver contrato) | Falha em Contratos não anula Compras.gov $\rightarrow$ `SUCESSO_PARCIAL` |
| **ATA** | ✅ Primária | ✅ (por item) | ✅ (por item) | Processamento em micro-lotes $\le 3$ itens |
| **CONTRATO** | ❌ Não aplicável | ✅ Primária | ✅ Complementar | Se sem Ata, não consulta Compras.gov (Cenário C) |
| **EMPENHO** | ✅ (se houver hint) | ✅ (se houver hint) | ❌ | Sem evidência de link $\rightarrow$ persiste soberano sem vínculo (Cenário D) |

---

## 5. RESULTADOS ESTRUTURADOS E STATUS DA ORQUESTRAÇÃO

A orquestração retorna a interface canônica `OrchestrationResult` contendo:
- `status`:
  * `SUCESSO`: todas as fontes consultadas responderam e empenhos foram persistidos/atualizados sem divergência;
  * `SEM_DADOS`: fontes responderam corretamente com 0 empenhos (não é erro técnico);
  * `SUCESSO_PARCIAL`: parte dos itens/fontes teve sucesso enquanto outros registraram falha transitória;
  * `COM_DIVERGENCIAS`: empenhos reconciliados com divergências contábeis não-bloqueantes registradas para auditoria;
  * `ERRO`: falha crítica de validação de chave ou indisponibilidade total das fontes.
- `divergencias`: lista de `ConflitoCampo` auditados;
- `pendencias`: lista de `VinculoPendente` para conciliação humana;
- `resumo_sync`: `EmpenhoSyncSummary` com totalizadores atômicos.

---

## 6. SUITE DE TESTES AUTOMATIZADOS

Arquivo criado: [`src/services/__tests__/empenhoOrchestrationService.test.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/__tests__/empenhoOrchestrationService.test.ts)

**13 novos testes unitários** cobrindo:
1. Item de Ata (Cenário A);
2. Retorno `SEM_DADOS` quando não há registros oficiais;
3. Cenário B (Ata $\rightarrow$ Item $\rightarrow$ Empenho sem contrato);
4. Retorno `COM_DIVERGENCIAS` em caso de conflito contábil entre fontes;
5. Idempotência em chamadas concorrentes simultâneas;
6. Ata de Registro de Preços com múltiplos itens e micro-lotes;
7. Retorno `SUCESSO_PARCIAL` em falhas parciais de lote;
8. Contrato administrativo com Contratos.gov e PNCP;
9. Cenário C (Contrato sem Ata);
10. Empenho específico pontual;
11. Cenário D (Empenho soberano sem vínculos inventados);
12. Roteador unificado `orchestrateOnDemandSync`;
13. Rejeição de tipos de alvo desconhecidos.

---

## 7. TESTE TRANSACIONAL REMOTO NO SUPABASE

No PostgreSQL 17.6 remoto (`bouutpmxexvwppcmmhdi`), executou-se teste transacional pontual comprovando a cadeia:
$$\text{Orquestrador} \longrightarrow \text{empenhoSyncService} \longrightarrow \text{M17 RPCs} \longrightarrow \text{M16 SSOT} \longrightarrow \text{M18 Views}$$

- Empenho, vínculo de item e vínculo de contrato validados no schema M16;
- Cleanup 100% executado;
- **Contadores de produção verificados:**
  * `empenhos`: 0
  * `arp_item_empenhos`: 0
  * `contrato_empenhos`: 0
  * `empenho_eventos_historico`: 0
  * `v_arp_item_saldo_detalhado`: 1.322 (itens originais de Ata)
  * `auth.users` / `user_roles`: 0 resíduos.

---

## 8. RESULTADO DA VALIDAÇÃO TÉCNICA

```text
============================================================
FASE 7.2-I — RESULTADO DA VERIFICAÇÃO
============================================================
Testes Vitest: 76/76 arquivos (681/681 PASS — 100%)
TypeScript: PASS (0 erros — npx tsc --noEmit)
Lint (oxlint): PASS (0 erros — npm run lint)
Build Vite: PASS (dist gerado em 638ms)

M16: INALTERADO
M17: INALTERADO
M18: INALTERADO

MIGRATIONS: 0
NOVAS RPCs: 0
NOVAS VIEWS: 0
FRONTEND: NÃO ALTERADO (Zero hooks/componentes criados)
DADOS TEMPORÁRIOS: 100% REMOVIDOS
============================================================
```

---

## 9. CONCLUSÃO E VEREDITO

A camada de Orquestração On-Demand de Empenhos está implementada, testada e homologada.

```text
============================================================
VEREDITO FORMAL: GO
============================================================
```
