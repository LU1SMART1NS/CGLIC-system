# FASE 7.2-K-A — AUDITORIA FINAL DA INTEGRAÇÃO UI DE EMPENHOS NO CONTRATO 360°

**Data da Auditoria:** 24 de Setembro de 2026  
**Status:** **AUDITORIA CONCLUÍDA — VEREDITO: GO (COM RECOMENDAÇÃO TÉCNICA CLASSIFICADA)**  
**Auditor:** Agente Independente de Auditoria e Qualidade de Software SaldoARP  
**Versão do Sistema:** SaldoARP 3.0  

---

## 1. OBJETIVO DA AUDITORIA

Realizar auditoria arquitetural, contábil, de segurança (RBAC) e funcional independente sobre a implementação da **Fase 7.2-K** (Integração UI de Sincronização de Empenhos no Contrato 360°), verificando a aderência ao planejamento **Fase 7.2-J** e a preservação irrestrita das invariantes de **M16**, **M17**, **M18** e das Fases **7.2-A a 7.2-I-A**.

---

## 2. ESCOPO DA AUDITORIA

A inspeção cobriu:
- [`src/hooks/useSyncContractEmpenhos.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/hooks/useSyncContractEmpenhos.ts)
- [`src/components/contracts/Contract360Header.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/Contract360Header.tsx)
- [`src/hooks/__tests__/useSyncContractEmpenhos.test.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/hooks/__tests__/useSyncContractEmpenhos.test.ts)
- [`src/components/contracts/__tests__/Contract360Header.test.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/__tests__/Contract360Header.test.tsx)
- [`src/services/__tests__/empenhoOrchestrationService.test.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/__tests__/empenhoOrchestrationService.test.ts)
- Estrutura de migrações e banco de dados (`supabase/migrations/`)
- Integridade do fluxo assíncrono e controle de concorrência.

---

## 3. ARQUITETURA AUDITADA

```text
┌────────────────────────────────────────────────────────┐
│               VISÃO 360° DO CONTRATO                   │
│          (src/components/contracts/Contract360Header)  │
└───────────────────────────┬────────────────────────────┘
                            │ [Click: Sincronizar Empenhos]
                            ▼
┌────────────────────────────────────────────────────────┐
│            useSyncContractEmpenhos (Hook)              │
│       React Query useMutation + Invalidação Cirúrgica  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│         orchestrateContractEmpenhoSync (7.2-I)         │
│          Coordenação On-Demand por Alvo Canônico       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│            empenhoSyncService / Adapters (7.2-G)       │
│           PNCP / Contratos.gov.br / Normalização       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│          M17 — RPCs ATÔMICAS COM ADVISORY LOCKS        │
│          rpc_sync_empenho_reconciliado_atomic          │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│          M16 — SCHEMA SOBERANO (SSOT)                  │
│          public.empenhos / public.contrato_empenhos    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│          M18 — READ MODELS / VIEWS                     │
│          v_contrato_empenhos_lastro / v_empenhos_resumo│
└────────────────────────────────────────────────────────┘
```

---

## 4. AUDITORIA DO FLUXO REAL

1. **Inexistência de Caminhos Paralelos:** A UI (`Contract360Header`) não acessa diretamente `fetch()`, SDKs externos de APIs governamentais ou `supabase.from()` para persistência. Toda a comunicação trafega exclusivamente via `useSyncContractEmpenhos` $\rightarrow$ `orchestrateContractEmpenhoSync`.
2. **Separação de Responsabilidades:** O componente React cuida apenas da renderização e estados de interação (`isPending`, `feedback`, `disabled`).
3. **Idempotência e Segurança:** A chamada assíncrona é protegida contra duplo clique no cliente e por *PostgreSQL advisory locks* transacionais no banco (M17).

---

## 5. AUDITORIA DO HOOK (`useSyncContractEmpenhos.ts`)

- **Delegação Estrita:** Chama exclusivamente `orchestrateContractEmpenhoSync`.
- **Zero Lógica Contábil:** Não calcula saldos, não normaliza strings e não efetua regras de negócio contábeis.
- **Controle de Estado:** Retorna o objeto completo da mutação (`mutate`, `isPending`, `isError`, `isSuccess`, `data`, `error`).
- **Estado Transitório:** O retorno do orquestrador não cria um segundo estado concorrente nem é persistido em `localStorage`.

---

## 6. AUDITORIA CRÍTICA DAS QUERY KEYS

Auditamos cada query key presente no hook `useSyncContractEmpenhos.ts`:

1. `['contract', contractKey]`:
   - *Análise:* No sistema, `useContract` baseia-se em `useContractsDashboard`, que utiliza a chave `['contracts-dashboard', uasg]`. A invalidação de `['contract', contractKey]` é inócua (não há query registrada com essa assinatura exata), mantida preventivamente para futuras queries atomizadas por contrato.
2. `['v_contrato_empenhos_lastro', contractKey]`:
   - *Análise:* Query key legítima e essencial para atualizar os read models M18 do painel de lastro do contrato.
3. `['v_empenhos_resumo']`:
   - *Análise:* Query key legítima para refletir listagens analíticas globais de empenhos M18.
4. `['contract_events', contractKey]`:
   - *Análise (Achado F72KA-01):* O hook canônico [`useContractEvents.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/hooks/useContractEvents.ts#L22) define a query key canônica com hífen: `['contract-events', contractKey]`. A utilização de underscore (`contract_events`) não dispara invalidação real do hook existente. Adicionalmente, eventos de contrato refletem termos aditivos (`termos_aditivos`), não empenhos diretos.
5. `['v_arp_item_saldo_detalhado']`:
   - *Análise (Achado F72KA-02):* Sincronizar um Contrato vincula financeiramente o empenho em `public.contrato_empenhos`. O saldo físico de item de Ata (`v_arp_item_saldo_detalhado`) consome `public.arp_item_empenhos`. Portanto, a invalidação global de `v_arp_item_saldo_detalhado` a partir de uma ação de contrato constitui um *over-invalidation* inofensivo, porém conceitualmente desnecessário.

---

## 7. AUDITORIA CRÍTICA DE RBAC (SEGURANÇA E ACESSO)

### Perguntas e Respostas da Auditoria:
1. **`coordenador` possui explicitamente permissão para executar essa ação?**
   - **Sim.** No modelo de domínio do SaldoARP ([`src/types/user.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/types/user.ts#L37-L52)), o perfil `coordenador` representa o cargo de *Coordenador / Diretor* (com permissão de "Acesso total à pasta e gestão global"). Ele possui todas as permissões operacionais do `gestor` mais privilégios administrativos.
2. **Existe alguma regra central que determine essa capacidade?**
   - As permissões granulares em `RolePermissions` cobrem `editarTarefasContratuais`, `distribuirContratos`, `gerenciarUsuarios`, etc. Como a Fase 7 de empenhos é recente, ainda não existe um campo `sincronizarEmpenhos: boolean` no schema de permissões legadas.
3. **A implementação está reutilizando essa regra ou adicionando uma autorização específica?**
   - A implementação aplicou a regra conceitual de negócio: perfis ativos de gestão/administração (`gestor`, `coordenador`, `admin`) têm permissão de execução, enquanto perfis de leitura/auditoria (`consulta`, `auditor`) são bloqueados com exibição de tooltip explicativo.
4. **O `coordenador` possui a mesma permissão operacional que `gestor` para sincronização?**
   - Sim, o `coordenador` pode operar qualquer contrato da unidade gestora.
5. **Existe diferença entre visualizar, sincronizar e administrar?**
   - Sim: `consulta` apenas visualiza; `gestor` e `coordenador` operam e sincronizam; `coordenador` administra regras e usuários.

---

## 8. AUDITORIA DO CABEÇALHO (`Contract360Header.tsx`)

- **Posicionamento:** Perfeitamente alinhado na barra superior de ações contextuais.
- **Hierarquia:** Não corrompe o layout executivo nem polui os cards de vigência/valor.
- **Acessibilidade:** Botão possui `aria-label="Sincronizar Empenhos"` e `title` descritivo.
- **Controle de Clique:** `disabled={!isAuthorized || syncMutation.isPending}` impede disparos múltiplos ou não autorizados.
- **Animação:** `Loader2` com animação suave de rotação durante `isPending`.

---

## 9. AUDITORIA DOS 5 ESTADOS OPERACIONAIS

A interface mapeia os 5 estados do `OrchestrationStatus` com total fidelidade semântica:

| Estado | Significado Técnico | Projeção na Interface | Avaliação |
| :--- | :--- | :--- | :---: |
| **`SUCESSO`** | Empenhos baixados e persistidos no M16 | Banner verde informando total processado | **CONFORME** |
| **`SEM_DADOS`** | Contrato não possui empenhos nas APIs | Banner azul informativo (*não exibe como erro*) | **CONFORME** |
| **`SUCESSO_PARCIAL`** | Alguma fonte governamental instável | Banner amarelo informativo de aviso parcial | **CONFORME** |
| **`COM_DIVERGENCIAS`** | Divergência contábil entre fontes | Banner amarelo indicando divergência registrada | **CONFORME** |
| **`ERRO`** | Falha de rede ou timeout | Banner vermelho com opção de reexecução | **CONFORME** |

---

## 10. AUDITORIA DE INTEGRIDADE M16 / M17 / M18

- `supabase/migrations/20260924000016_canonical_empenhos_schema.sql`: **INTACTO (0 diff)**
- `supabase/migrations/20260924000017_rpc_empenhos_atomic.sql`: **INTACTO (0 diff)**
- `supabase/migrations/20260924000018_empenho_sync_and_views.sql`: **INTACTO (0 diff)**
- Nenhuma migration nova foi criada na Fase 7.2-K.
- Nenhuma alteração em tabelas, triggers, RLS ou views.

---

## 11. AUDITORIA DA SUÍTE DE TESTES

- [`src/hooks/__tests__/useSyncContractEmpenhos.test.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/hooks/__tests__/useSyncContractEmpenhos.test.ts): 3 testes com asserções reais sobre parâmetros do alvo e invalidações de cache.
- [`src/components/contracts/__tests__/Contract360Header.test.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/__tests__/Contract360Header.test.tsx): 7 testes cobrindo RBAC, estados desabilitados, spinner de progresso e todas as 5 variantes de banners operacionais.
- [`src/services/__tests__/empenhoOrchestrationService.test.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/__tests__/empenhoOrchestrationService.test.ts): Preservação de todos os 28 testes de orquestração (removido apenas import não utilizado).

---

## 12. TABELA CLASSIFICADA DE ACHADOS

### [ACHADO F72KA-01] Grafia da Query Key de Eventos do Contrato
- **Severidade:** `LOW`
- **Local:** `src/hooks/useSyncContractEmpenhos.ts` (linha 36)
- **Evidência:** O hook chama `queryClient.invalidateQueries({ queryKey: ['contract_events', contractKey] })`, enquanto o hook canônico `useContractEvents.ts` registra `['contract-events', contractKey]` com hífen.
- **Impacto:** O cache de eventos não é invalidado se estiver ativo em memória (embora eventos contratuais dependam de termos aditivos e não de empenhos).
- **Recomendação:** Ajustar para `['contract-events', contractKey]` em ciclo de refinamento técnico.

### [ACHADO F72KA-02] Over-Invalidation de Saldo de Item de Ata
- **Severidade:** `LOW`
- **Local:** `src/hooks/useSyncContractEmpenhos.ts` (linha 37)
- **Evidência:** O hook invalida `['v_arp_item_saldo_detalhado']` ao sincronizar um contrato isolado.
- **Impacto:** Causa um refetch desnecessário dos saldos de itens de Ata quando a ação foi puramente contratual. Não corrompe dados.
- **Recomendação:** Remover `['v_arp_item_saldo_detalhado']` do hook de Contrato ou manter apenas se houver `itemContext`.

### [ACHADO F72KA-03] Formalização de Permissão de Sincronização em `RolePermissions`
- **Severidade:** `INFO`
- **Local:** `src/types/user.ts`
- **Evidência:** A verificação de RBAC checa papéis nativos `['gestor', 'coordenador', 'admin']` por whitelist, em vez de consultar uma permissão booleana `permissoes.sincronizarEmpenhos`.
- **Impacto:** Nenhum impacto operacional ou de segurança imediato. O comportamento atual atende integralmente à regra de negócio.
- **Recomendação:** Em fases futuras de governança do painel de administração, adicionar a flag granular em `RolePermissions`.

---

## 13. TESTES REAIS E RESULTADOS DE COMPILAÇÃO

```bash
npx vitest run
# Output: Test Files: 78 passed (78) | Tests: 691 passed (691)

npx tsc -b
# Output: 0 errors

npm run lint
# Output: 0 errors

npm run build
# Output: vite build concluído com sucesso em 775ms
```

---

## 14. GIT FORENSICS

```text
Arquivos criados na 7.2-K:
- src/hooks/useSyncContractEmpenhos.ts
- src/hooks/__tests__/useSyncContractEmpenhos.test.ts
- src/components/contracts/__tests__/Contract360Header.test.tsx
- FASE_7_2_K_IMPLEMENTACAO_UI_CONTRATO_360.md

Arquivos modificados na 7.2-K:
- src/components/contracts/Contract360Header.tsx (apenas adição do botão, RBAC e feedback)
- src/services/__tests__/empenhoOrchestrationService.test.ts (remoção de import unused)

Zero modificações em migrations, RPCs, views ou schemas de banco de dados.
```

---

## 15. CONCLUSÃO E VEREDITO

A auditoria comprova que a **Fase 7.2-K** foi implementada com alto padrão de engenharia de software, respeitando rigorosamente o isolamento ontológico, a soberania do SSOT M16, as RPCs atômicas M17 e os read models M18.

Os 2 achados classificados como `LOW` (grafia de query key e over-invalidation menor) e 1 como `INFO` (granularidade RBAC) não comprometem a integridade, segurança ou funcionamento do sistema e podem ser saneados em fase subsequente de refinamento sem necessidade de bloqueio.

Portanto, o veredito final é **GO**.
