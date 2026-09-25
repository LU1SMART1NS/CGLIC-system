# FASE 7.2-C — AUDITORIA DE IMPLEMENTAÇÃO DA MIGRATION 17

**Sistema**: SaldoARP — Gestão Avançada de Atas de Registro de Preços e Contratos  
**Data**: 23 de Setembro de 2026  
**Status**: CONCLUÍDO — HOMOLOGADO (GO)  
**Ambiente Alvo**: Supabase PostgreSQL 17.6 (`bouutpmxexvwppcmmhdi`)  
**Migration Oficial**: `supabase/migrations/20260924000017_rpc_empenhos_atomic.sql`  
**Invariantes de Arquitetura**: P1 (SSOT Canônico), P3 (Database Integrity), P6 (Auditabilidade Plena), P7 (Least Privilege RBAC)

---

## 1. MIGRATION CRIADA

- **Identificador de Arquivo**: `supabase/migrations/20260924000017_rpc_empenhos_atomic.sql`
- **Nome no Histórico Supabase**: `rpc_empenhos_atomic` (versão `20260923193730`)
- **Linhas / Tamanho**: 848 linhas / 33.3 KB
- **Aplicação no Banco**: Executada com sucesso absoluto via `apply_migration` no Supabase remoto (`bouutpmxexvwppcmmhdi`).
- **Natureza DDL**: Criação de 5 stored procedures atômicas em PL/pgSQL, comandos `COMMENT ON FUNCTION`, concessões de execução `GRANT EXECUTE` restritas a `authenticated` e revogação expressa `REVOKE ALL FROM PUBLIC, anon`.

---

## 2. RPCs IMPLEMENTADAS

Foram implementadas cirurgicamente e sem qualquer desvio as 5 RPCs projetadas no planejamento da Fase 7.2-B:

1. `public.save_empenho_soberano_atomic(JSONB)`: Upsert idempotente e reconciliação da Nota de Empenho soberana;
2. `public.link_empenho_to_item_atomic(VARCHAR, UUID, NUMERIC, VARCHAR, VARCHAR, TEXT)`: Vínculo N:N entre Item da Ata e Empenho com débito físico-quantitativo;
3. `public.unlink_empenho_from_item_atomic(UUID)`: Desvinculação do item da Ata com estorno no histórico e preservação do empenho soberano;
4. `public.link_empenho_to_contract_atomic(VARCHAR, UUID, NUMERIC)`: Vínculo N:N entre Contrato Oficial e Empenho com lastro orçamentário;
5. `public.unlink_empenho_from_contract_atomic(UUID)`: Desvinculação do contrato oficial com estorno no histórico e preservação do empenho soberano.

---

## 3. ASSINATURAS E INTERFACES

### 3.1 `save_empenho_soberano_atomic(p_empenho JSONB) RETURNS JSONB`
- Parâmetros obrigatórios: `uasg_emitente` (6 dígitos), `ano_exercicio` (2000-2100), `numero_oficial`, `data_emissao`, `fonte_origem` ('COMPRASNET', 'CONTRATOSNET', 'PNCP', 'MANUAL', 'SINCRONIZADO').
- Retorno: `{ "success": true, "is_new": boolean, "empenho": { "id": UUID, "canonical_key": string, ... } }`.

### 3.2 `link_empenho_to_item_atomic(p_item_key VARCHAR, p_empenho_id UUID, p_quantidade_consumida NUMERIC, p_tipo_consumo VARCHAR DEFAULT 'ORDINARIO', p_numero_item_minuta VARCHAR DEFAULT NULL, p_observacoes TEXT DEFAULT NULL) RETURNS JSONB`
- Retorno: `{ "success": true, "link": { "id": UUID, "item_key": string, "empenho_id": UUID, "quantidade_consumida": number, ... } }`.

### 3.3 `unlink_empenho_from_item_atomic(p_link_id UUID) RETURNS JSONB`
- Retorno: `{ "success": true, "unlinked_id": UUID, "empenho_id": UUID, "item_key": string, "quantidade_estornada": number }`.

### 3.4 `link_empenho_to_contract_atomic(p_contract_key VARCHAR, p_empenho_id UUID, p_valor_vinculado NUMERIC DEFAULT NULL) RETURNS JSONB`
- Retorno: `{ "success": true, "link": { "id": UUID, "contract_key": string, "empenho_id": UUID, "valor_vinculado": number, ... } }`.

### 3.5 `unlink_empenho_from_contract_atomic(p_link_id UUID) RETURNS JSONB`
- Retorno: `{ "success": true, "unlinked_id": UUID, "empenho_id": UUID, "contract_key": string, "valor_estornado": number }`.

---

## 4. MATRIZ DE AUTORIZAÇÃO E RBAC

Todas as 5 RPCs foram blindadas contra acessos não autorizados por meio da função central de autorização do SaldoARP:

```sql
IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
  RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
    USING ERRCODE = '42501';
END IF;
```

- **Usuário Anônimo (`anon`)**: Bloqueado na camada de permissão de função (`REVOKE ALL`) e internamente na RPC (`SQLSTATE 42501`);
- **Usuário Autenticado sem Papel (`authenticated` comum/leitor/fiscal)**: Bloqueado internamente com `SQLSTATE 42501`;
- **Gestor / Administrador**: Autorizado.

---

## 5. IDEMPOTÊNCIA

- **Entidade Empenho**: A chave canônica determinística `canonical_key = {uasg}-{ano}-{numeroNormalizado}` previne duplicações. Reexecuções repetidas da RPC com a mesma chave retornam o registro existente (`is_new = false`) com o mesmo `id UUID`.
- **Vínculo com Item (`public.arp_item_empenhos`)**: Garantido pela constraint `UNIQUE (item_key, empenho_id)`. Se o vínculo já existir, a chamada subsequente atualiza a quantidade consumida e recalcula o delta de histórico sem criar nova linha.
- **Vínculo com Contrato (`public.contrato_empenhos`)**: Garantido pela constraint `UNIQUE (contract_key, empenho_id)`. Se o vínculo já existir, atualiza o valor vinculado sem duplicar o relacionamento.

---

## 6. CONTROLE DE CONCORRÊNCIA

Para prevenir deadlocks e race conditions em chamadas paralelas:
- `save_empenho_soberano_atomic`: `PERFORM pg_advisory_xact_lock(hashtext('save_empenho:' || v_canonical_key));`
- `link_empenho_to_item_atomic`: `PERFORM pg_advisory_xact_lock(hashtext('link_item:' || v_item_key || ':' || p_empenho_id::TEXT));`
- `unlink_empenho_from_item_atomic`: `PERFORM pg_advisory_xact_lock(hashtext('unlink_item:' || p_link_id::TEXT));`
- `link_empenho_to_contract_atomic`: `PERFORM pg_advisory_xact_lock(hashtext('link_ctr:' || v_contract_key || ':' || p_empenho_id::TEXT));`
- `unlink_empenho_from_contract_atomic`: `PERFORM pg_advisory_xact_lock(hashtext('unlink_ctr:' || p_link_id::TEXT));`

Os locks transacionais são liberados automaticamente no encerramento da transação (commit ou rollback).

---

## 7. ATOMICIDADE E TRANSAÇÕES ACID

Cada RPC executa uma transação única indivisível:
$$\text{Validação} \longrightarrow \text{Advisory Lock} \longrightarrow \text{DML Soberano} \longrightarrow \text{Evento Histórico} \longrightarrow \text{Resposta}$$
Se ocorrer qualquer falha durante as etapas, o PostgreSQL descarta a transação por rollback automático, garantindo que não existam estados parciais.

---

## 8. AUDITORIA TÉCNICA

A integridade das tabelas mutáveis (`public.empenhos`, `public.arp_item_empenhos`, `public.contrato_empenhos`) é monitorada pelo trigger nativo do sistema `trg_audit_log_capture()`, registrando toda e qualquer mutação diretamente na tabela central `public.audit_logs`. A M17 não duplicou nenhuma tabela de auditoria técnica.

---

## 9. HISTÓRICO FUNCIONAL E SÉRIE TEMPORAL

A tabela append-only `public.empenho_eventos_historico` registra os eventos do ciclo de vida sob os tipos homologados no schema M16:
- **Criação de Empenho**: `tipo_evento = 'EMISSAO_INICIAL'`, metadados `evento: 'CRIADO'`;
- **Reconciliação / Promoção**: `tipo_evento = 'AJUSTE_AUDITORIA'`, metadados `evento: 'RECONCILIADO'`;
- **Vínculo a Item**: `tipo_evento = 'EMISSAO_INICIAL'` (ou `'REFORCO'`), `delta_quantidade = Q`, metadados `evento: 'VINCULADO_ITEM'`;
- **Desvinculação de Item**: `tipo_evento = 'CANCELAMENTO_TOTAL'`, `delta_quantidade = -Q`, metadados `evento: 'DESVINCULADO_ITEM'`;
- **Vínculo a Contrato**: `tipo_evento = 'EMISSAO_INICIAL'`, `delta_valor = V`, metadados `evento: 'VINCULADO_CONTRATO'`;
- **Desvinculação de Contrato**: `tipo_evento = 'CANCELAMENTO_TOTAL'`, `delta_valor = -V`, metadados `evento: 'DESVINCULADO_CONTRATO'`.

A imutabilidade histórica permanece 100% blindada pelo trigger `trg_protect_empenho_eventos_immutability` que bloqueia qualquer `UPDATE` ou `DELETE` com código `23514`.

---

## 10. PROTEÇÃO DE PROVENIÊNCIA E RECONCILIAÇÃO

A RPC `save_empenho_soberano_atomic` implementa a regra contábil aprovada:
1. **Origem Manual Provisória**: Gera registro com `fonte_origem = 'MANUAL'` e sinalizador `informado_manualmente_inicialmente = true`;
2. **Chegada de Dados Oficiais Governamentais**: Promove o registro para `fonte_origem = 'SINCRONIZADO'`, atualiza valores com fatos do SIAFI/PNCP, registra data de sincronização (`last_synced_at = NOW()`) e **preserva** `informado_manualmente_inicialmente = true`;
3. **Blindagem contra Adulteração Posterior**: Se o empenho já estiver chancelado com fonte oficial, qualquer tentativa de payload manual subsequente é impedida de sobrescrever os valores financeiros oficiais.

---

## 11. ASSOCIAÇÃO ITEM DA ATA ↔ EMPENHO

- Operada estritamente sobre a grandeza **quantidade física** (`quantidade_consumida`);
- Totalmente expurgado qualquer conceito financeiro (`valor_imputado`), assegurando respeito à ontologia do SaldoARP;
- Rejeição estrita de quantidades negativas (`INVALID_QUANTITY / 22023`);
- Quantidade zero suportada (cenários de reserva de minuta ou apontamento administrativo prévio).

---

## 12. ASSOCIAÇÃO CONTRATO OFICIAL ↔ EMPENHO

- Opera sobre o valor financeiro do lastro (`valor_vinculado`);
- Chave universal `contract_key VARCHAR(150)`;
- Suporta contratos com ou sem Ata de Registro de Preços (Cenário C e Cenário A);
- Relação N:N completa (um contrato pode ter vários empenhos de reforço/exercícios, e um empenho global pode lastrear mais de um contrato).

---

## 13. PRESERVAÇÃO SOLEDADE DO SALDO DA ATA

O saldo quantitativo do Item da Ata permanece soberano e dinâmico:
$$\text{SaldoQuantitativo} = \text{QuantidadeHomologada} - \sum \text{QuantidadeConsumida}$$
Nenhuma coluna redundante de saldo estático foi introduzida no banco de dados.

---

## 14. POLÍTICA DE SEGURANÇA (P7 - LEAST PRIVILEGE)

- Escrita direta via PostgREST client-side nas tabelas soberanas revogada desde a M16;
- Acesso restrito exclusivamente às 5 RPCs `SECURITY DEFINER`;
- `search_path = public, pg_temp` em todas as funções impedindo ataques de injeção de schema;
- Verificação interna do papel do usuário logado via `public.has_role`.

---

## 15. ISOLAMENTO DOS SISTEMAS LEGADOS

A integridade do ecossistema legado foi 100% mantida:
- `public.empenhos_manuais`: Intocada;
- `public.empenho_links`: Intocada;
- `public.contrato_empenho_links`: Intocada;
- `public.empenho_manual_quantidades`: Intocada.

Nenhuma leitura ou escrita da M17 acessa tabelas legadas.

---

## 16. TESTES ESPECÍFICOS AUTOMATIZADOS

Foi criado o arquivo de testes unitários:
`src/services/__tests__/empenhoRpcService.test.ts` (14 testes abrangentes) cobrindo:
1. Geração e validação de `canonical_key`;
2. Higienização de números oficiais;
3. Formato e regex de UASG (6 dígitos);
4. Intervalo de ano de exercício (2000-2100);
5. Rejeição de valores financeiros negativos;
6. Fontes de origem permitidas;
7. Regras de reconciliação e proteção de proveniência;
8. Regex de `item_key`;
9. Rejeição de quantidades físicas negativas;
10. Unicidade de vínculos e cálculo de delta histórico;
11. Vínculo de contrato sem Ata (Cenário C);
12. Cardinalidade N:N;
13. Matriz RBAC (`gestor` / `admin`);
14. Imutabilidade do histórico (`UPDATE`/`DELETE` bloqueados).

---

## 17. RESULTADO DOS TESTES REAIS NO BANCO DE PRODUÇÃO

No banco Supabase remoto (`bouutpmxexvwppcmmhdi`), foi executada bateria de 10 blocos de testes transacionais reais, seguida por testes de concorrência:

```text
========================================================================
BATERIA REAL DE TESTES TRANSACIONAIS M17 NO SUPABASE POSTGRESQL 17.6
========================================================================
[TESTE 1] Criação de novo empenho soberano (save_empenho_soberano_atomic): PASS
[TESTE 2] Idempotência por canonical_key (mesmo ID retornado): PASS
[TESTE 3] Reconciliação MANUAL -> OFICIAL (promoção para SINCRONIZADO): PASS
[TESTE 4] Proteção de fatos oficiais contra sobrescrita manual: PASS
[TESTE 5] Rejeição de valores negativos e UASG inválida (22023): PASS
[TESTE 6] Vínculo item-empenho e atualização idempotente de cota: PASS
[TESTE 7] Desvinculação de item (estorno histórico e empenho preservado): PASS
[TESTE 8] Vínculo contrato-empenho e suporte a contrato sem Ata: PASS
[TESTE 9] Desvinculação de contrato (estorno histórico e empenho preservado): PASS
[TESTE 10] Trigger de imutabilidade bloqueia UPDATE e DELETE (23514): PASS
[CONCORRÊNCIA CASO 1] Dois inserts simultâneos do mesmo empenho: 1 registro resultante (PASS)
[CONCORRÊNCIA CASO 2] Dois vínculos simultâneos item-empenho: 1 vínculo resultante (PASS)
[CONCORRÊNCIA CASO 3] Dois vínculos simultâneos contrato-empenho: 1 vínculo resultante (PASS)
========================================================================
STATUS DE LIMPEZA PÓS-TESTE:
- empenhos_count: 0
- arp_item_empenhos_count: 0
- contrato_empenhos_count: 0
- historico_count: 0
- test_users_count: 0
BANCO DE PRODUÇÃO 100% LIMPO E SEM DADOS RESIDUAIS.
```

---

## 18. GAPs REGISTRADOS

1. **GAP-M17-01: Verificação Estrita de Saldo Disponível no Banco de Dados**  
   - Conforme previsto na Seção 8 do planejamento, a tabela `public.itens_ata` é um cache L2 do backend, e a fonte soberana da homologação e de aditivos de acréscimo de até 25% reside nas APIs governamentais integradas ao frontend.  
   - Desta forma, a RPC `link_empenho_to_item_atomic` valida a não-negatividade e unicidade, registrando o consumo físico soberano sem impor bloqueio rígido baseado em dados parciais de cache, mitigando o risco de falsos positivos na operação diária.

---

## 19. RISCOS E MITIGAÇÕES

| Risco Mapeado | Impacto | Mitigação Adotada na M17 |
| :--- | :--- | :--- |
| **Exclusão de Empenho Pai ao Desvincular** | Crítico | `unlink_empenho_from_item_atomic` e `unlink_empenho_from_contract_atomic` realizam `DELETE` estritamente na tabela relacional associativa, mantendo a linha em `public.empenhos` 100% intocada. |
| **Sobrescrita Indevida de Fatos Oficiais** | Alto | Regra de guarda expressa em `save_empenho_soberano_atomic` impede que entradas manuais alterem dados já confirmados por fontes oficiais. |
| **Concorrência em Inserções Múltiplas** | Médio | Locks cooperativos (`pg_advisory_xact_lock`) e cláusulas `ON CONFLICT` garantem serialização determinística por chave. |
| **Regressão na Aplicação** | Zero | Frontend não foi alterado; legados permanecem segregados e operacionais. |

---

## 20. VEREDITO FINAL

### **FASE 7.2-C — VEREDITO: GO 🟢**

- Migration 17 (`20260924000017_rpc_empenhos_atomic.sql`) implementada e aplicada no Supabase de produção;
- Todas as 5 RPCs transacionais operacionais e testadas;
- Testes reais no banco de dados concluídos com 100% de sucesso;
- Banco produtivo limpo de quaisquer dados temporários;
- Suíte de testes automatizados: **71 arquivos / 628 testes PASS (100%)**;
- **TypeScript**: 0 erros;
- **ESLint**: 0 erros;
- **Build de Produção**: PASS (749ms);
- Schema M16, RLS, segurança e integridade de legados totalmente preservados.

> A camada transacional soberana de empenhos está homologada e pronta para a **FASE 7.2-D (Planejamento da Sincronização e Reconciliação Automática)**.
