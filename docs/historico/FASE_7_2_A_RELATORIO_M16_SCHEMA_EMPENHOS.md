# FASE 7.2-A — RELATÓRIO DE APLICAÇÃO E HOMOLOGAÇÃO DA MIGRATION 16

**Sistema**: SaldoARP — Gestão Avançada de Atas de Registro de Preços e Contratos  
**Data**: 23 de Setembro de 2026  
**Status**: CONCLUÍDO — GO (SCHEMA SOBERANO DE EMPENHOS HOMOLOGADO EM BANCO REAL)  
**Ambiente**: Supabase PostgreSQL 17.6 (`bouutpmxexvwppcmmhdi`)  
**Arquivo de Migration**: `supabase/migrations/20260924000016_canonical_empenhos_schema.sql`  

---

## 1. MIGRATION CRIADA E APLICADA

Em observância estrita ao escopo cirúrgico da Fase 7.2-A, foi criada e aplicada ao banco PostgreSQL remoto a migration:
- **Arquivo**: `supabase/migrations/20260924000016_canonical_empenhos_schema.sql`
- **Mecanismo de Aplicação**: Aplicador oficial DDL do Supabase MCP (`apply_migration`);
- **Resultado da Aplicação**: `{"success": true}` sem conflitos, sem warnings e com rollback atômico preservado.

Nenhuma RPC, view, serviço, hook ou componente UI foi alterado nesta etapa.

---

## 2. TABELAS CRIADAS NO POSTGRESQL

Foram criadas 4 tabelas relacionais organizadas segundo o modelo em 3 camadas aprovado no plano 7.1:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ CAMADA 1: public.empenhos                                              │
│ Entidade soberana e canônica da Nota de Empenho (SSOT relacional).     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         ▼                                                     ▼
┌─────────────────────────────────────────┐   ┌────────────────────────────────────────┐
│ CAMADA 2A: public.arp_item_empenhos     │   │ CAMADA 2B: public.contrato_empenhos    │
│ Débito físico-quantitativo do Item.     │   │ Lastro orçamentário do Contrato.       │
│ Suporta Cenário B (compra direta s/ ctr)│   │ Suporta Cenário C (contrato s/ Ata).   │
└─────────────────────────────────────────┘   └────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ CAMADA 3: public.empenho_eventos_historico                             │
│ Trilha temporal append-only imutável de eventos e snapshots.           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. COLUNAS E TIPOS DE DADOS COMPROVADOS NO BANCO REAL

A inspeção via `information_schema.columns` comprovou a correta criação de todas as colunas:

### 3.1 `public.empenhos` (20 colunas)
- `id`: `UUID` (PK);
- `canonical_key`: `VARCHAR(100)` (Chave Canônica estável: `{uasg}-{ano}-{numeroNormalizado}`);
- `numero_oficial`: `VARCHAR(50)`;
- `ano_exercicio`: `INTEGER`;
- `uasg_emitente`: `VARCHAR(10)`;
- `numero_normalizado`: `VARCHAR(50)`;
- `data_emissao`: `DATE`;
- `valor_empenhado`: `NUMERIC(18, 4)`;
- `valor_liquidado`: `NUMERIC(18, 4)`;
- `valor_pago`: `NUMERIC(18, 4)`;
- `valor_rpinscrito`: `NUMERIC(18, 4)`;
- `credor_nome`: `VARCHAR(255)`;
- `credor_cnpj_cpf`: `VARCHAR(20)`;
- `situacao`: `VARCHAR(50)`;
- `fonte_origem`: `VARCHAR(20)`;
- `informado_manualmente_inicialmente`: `BOOLEAN`;
- `identificador_fonte`: `VARCHAR(100)`;
- `url_oficial`: `TEXT`;
- `last_synced_at`: `TIMESTAMPTZ`;
- `created_at`: `TIMESTAMPTZ`;
- `updated_at`: `TIMESTAMPTZ`.

### 3.2 `public.arp_item_empenhos` (9 colunas)
- `id`: `UUID` (PK);
- `item_key`: `VARCHAR(100)`;
- `empenho_id`: `UUID` (FK para `public.empenhos.id`);
- `quantidade_consumida`: `NUMERIC(18, 4)` (Débito físico estrito);
- `tipo_consumo`: `VARCHAR(20)`;
- `numero_item_minuta`: `VARCHAR(10)`;
- `observacoes`: `TEXT`;
- `created_at`: `TIMESTAMPTZ`;
- `updated_at`: `TIMESTAMPTZ`.

### 3.3 `public.contrato_empenhos` (6 colunas)
- `id`: `UUID` (PK);
- `contract_key`: `VARCHAR(150)` (Universal da Fase 6);
- `empenho_id`: `UUID` (FK para `public.empenhos.id`);
- `valor_vinculado`: `NUMERIC(18, 4)` (Lastro financeiro);
- `created_at`: `TIMESTAMPTZ`;
- `updated_at`: `TIMESTAMPTZ`.

### 3.4 `public.empenho_eventos_historico` (10 colunas)
- `id`: `UUID` (PK);
- `empenho_id`: `UUID` (FK para `public.empenhos.id`);
- `item_key`: `VARCHAR(100)`;
- `contract_key`: `VARCHAR(150)`;
- `data_evento`: `DATE`;
- `tipo_evento`: `VARCHAR(30)`;
- `delta_quantidade`: `NUMERIC(18, 4)`;
- `delta_valor`: `NUMERIC(18, 4)`;
- `metadados`: `JSONB`;
- `registrado_em`: `TIMESTAMPTZ`.

---

## 4. PRIMARY KEYS (PKs)
- `empenhos_pkey`: `public.empenhos(id)`;
- `arp_item_empenhos_pkey`: `public.arp_item_empenhos(id)`;
- `contrato_empenhos_pkey`: `public.contrato_empenhos(id)`;
- `empenho_eventos_historico_pkey`: `public.empenho_eventos_historico(id)`.

Todas utilizam `UUID DEFAULT gen_random_uuid()` para alta performance e desacoplamento.

---

## 5. FOREIGN KEYS (FKs) E INTEGRIDADE REFERENCIAL
- `arp_item_empenhos.empenho_id` $\longrightarrow$ `public.empenhos(id) ON DELETE CASCADE`;
- `contrato_empenhos.empenho_id` $\longrightarrow$ `public.empenhos(id) ON DELETE CASCADE`;
- `empenho_eventos_historico.empenho_id` $\longrightarrow$ `public.empenhos(id) ON DELETE CASCADE`.

> [!NOTE]
> **Correção Arquitetural Comprovada**: Nenhuma foreign key aponta para tabelas legadas instáveis ou campos textuais ambíguos. As chaves de contexto (`item_key` e `contract_key`) utilizam strings canônicas padronizadas consistentes com a Migration 15 (`arp_item_contract_links`).

---

## 6. CONSTRAINTS DE UNICIDADE (UNIQUE)
- `uq_empenho_canonical_key`: `UNIQUE (canonical_key)` em `public.empenhos` (garante idempotência e unicidade universal da Nota de Empenho);
- `uq_arp_item_empenho`: `UNIQUE (item_key, empenho_id)` em `public.arp_item_empenhos` (impede que o mesmo empenho debite duas vezes o mesmo item da Ata);
- `uq_contrato_empenho_soberano`: `UNIQUE (contract_key, empenho_id)` em `public.contrato_empenhos` (impede duplicação de lastro do mesmo contrato).

---

## 7. CHECK CONSTRAINTS VALIDADAS
- `ano_exercicio`: $2000 \le \text{ano} \le 2100$;
- `valor_empenhado`, `valor_liquidado`, `valor_pago`, `valor_rpinscrito`: $\ge 0$;
- `quantidade_consumida`: $\ge 0$;
- `valor_vinculado`: $\ge 0$;
- `fonte_origem`: `IN ('COMPRASNET', 'CONTRATOSNET', 'PNCP', 'MANUAL', 'SINCRONIZADO')`;
- `tipo_consumo`: `IN ('ORDINARIO', 'REFORCO', 'AJUSTE_MANUAL')`;
- `tipo_evento`: `IN ('EMISSAO_INICIAL', 'REFORCO', 'ANULACAO_PARCIAL', 'CANCELAMENTO_TOTAL', 'LIQUIDACAO_SNAPSHOT', 'PAGAMENTO_SNAPSHOT', 'AJUSTE_AUDITORIA')`.

---

## 8. ÍNDICES DE ALTA PERFORMANCE HOMOLOGADOS
- `idx_empenhos_canonical_key` ON `empenhos(canonical_key)`;
- `idx_empenhos_uasg_ano` ON `empenhos(uasg_emitente, ano_exercicio)`;
- `idx_empenhos_credor_cnpj` ON `empenhos(credor_cnpj_cpf)`;
- `idx_empenhos_data_emissao` ON `empenhos(data_emissao)`;
- `idx_arp_item_empenhos_item_key` ON `arp_item_empenhos(item_key)`;
- `idx_arp_item_empenhos_empenho_id` ON `arp_item_empenhos(empenho_id)`;
- `idx_contrato_empenhos_contract_key` ON `contrato_empenhos(contract_key)`;
- `idx_contrato_empenhos_empenho_id` ON `contrato_empenhos(empenho_id)`;
- `idx_emp_evt_hist_empenho_id` ON `empenho_eventos_historico(empenho_id)`;
- `idx_emp_evt_hist_item_data` ON `empenho_eventos_historico(item_key, data_evento)`;
- `idx_emp_evt_hist_contract_data` ON `empenho_eventos_historico(contract_key, data_evento)`.

---

## 9. ROW LEVEL SECURITY (RLS)
- RLS habilitado com sucesso nas 4 tabelas:
  - `ALTER TABLE public.empenhos ENABLE ROW LEVEL SECURITY;`
  - `ALTER TABLE public.arp_item_empenhos ENABLE ROW LEVEL SECURITY;`
  - `ALTER TABLE public.contrato_empenhos ENABLE ROW LEVEL SECURITY;`
  - `ALTER TABLE public.empenho_eventos_historico ENABLE ROW LEVEL SECURITY;`

---

## 10. POLICIES CRIADAS NO BANCO REAL
Foram criadas 8 políticas de leitura aberta (`SELECT`) transparentes para consultas authenticated e anon:
1. `Permitir leitura de empenhos para autenticados` (FOR SELECT TO authenticated USING (true));
2. `Permitir leitura anon de empenhos` (FOR SELECT TO anon USING (true));
3. `Permitir leitura de arp_item_empenhos para autenticados` (FOR SELECT TO authenticated USING (true));
4. `Permitir leitura anon de arp_item_empenhos` (FOR SELECT TO anon USING (true));
5. `Permitir leitura de contrato_empenhos para autenticados` (FOR SELECT TO authenticated USING (true));
6. `Permitir leitura anon de contrato_empenhos` (FOR SELECT TO anon USING (true));
7. `Permitir leitura de eventos de empenhos para autenticados` (FOR SELECT TO authenticated USING (true));
8. `Permitir leitura anon de eventos de empenhos` (FOR SELECT TO anon USING (true)).

### Hardening de Backend Authority (P7)
O comando `REVOKE INSERT, UPDATE, DELETE ... FROM authenticated, anon` foi executado com sucesso sobre as 4 tabelas, garantindo que nenhum cliente PostgREST possa alterar dados diretamente.

---

## 11. TRIGGERS OPERACIONAIS HOMOLOGADOS

### 11.1 Triggers de Auditoria Técnica
Conectados à função institucional `trg_audit_log_capture()` para registrar todo ciclo de vida em `public.audit_logs`:
- `trg_audit_empenhos` em `public.empenhos`;
- `trg_audit_arp_item_empenhos` em `public.arp_item_empenhos`;
- `trg_audit_contrato_empenhos` em `public.contrato_empenhos`.

### 11.2 Trigger de Imutabilidade do Histórico
- `trg_protect_empenho_eventos_immutability` em `public.empenho_eventos_historico`:
  - Executa `BEFORE UPDATE OR DELETE`;
  - Dispara a exception `IMMUTABLE_HISTORICAL_LOG (23514)`;
  - Testado e comprovado no banco: tentativas de UPDATE são bloqueadas imediatamente pelo PostgreSQL.

---

## 12. RELAÇÃO COM TABELAS LEGADAS

As tabelas legadas permaneceram **100% intactas, inalteradas e preservadas**:
- `public.empenhos_manuais`: 0 linhas, schema original preservado;
- `public.empenho_links`: 0 linhas, schema original preservado;
- `public.contrato_empenho_links`: 0 linhas, schema original preservado;
- `public.empenho_manual_quantidades`: 0 linhas, schema original preservado.

Zero colisões de nomes ou foreign keys cruzadas.

---

## 13. VALIDAÇÃO ESTRUTURAL NO BANCO REAL

A integridade do banco foi comprovada através de queries diretas:
```sql
SELECT 
  (SELECT count(*) FROM public.empenhos) as count_empenhos,
  (SELECT count(*) FROM public.arp_item_empenhos) as count_arp_item_empenhos,
  (SELECT count(*) FROM public.contrato_empenhos) as count_contrato_empenhos,
  (SELECT count(*) FROM public.empenho_eventos_historico) as count_empenho_eventos_historico,
  (SELECT count(*) FROM public.empenhos_manuais) as count_empenhos_manuais;
-- Retorno: todos com 0 linhas (estrutura limpa e pronta)
```

---

## 14. TESTES DE REGRESSÃO DA APLICAÇÃO

A aplicação mantém integridade absoluta após a aplicação da Migration 16:
```bash
npm test -- --run
# Test Files  70 passed (70)
# Tests       611 passed (611)

npx tsc --noEmit
# 0 erros (PASS)

npm run lint
# 0 erros (43 warnings benignos de hooks preexistentes)

npm run build
# vite v8.2.2 building client environment for production...
# ✓ built in 597ms (PASS)
```

---

## 15. RISCOS MITIGADOS
1. **Risco de mutação de histórico**: Mitigado pelo trigger de imutabilidade `trg_protect_empenho_eventos_immutability`;
2. **Risco de escrita client-side indevida**: Mitigado pelo `REVOKE DML` em todas as 4 tabelas;
3. **Risco de duplicidade contábil**: Mitigado pelas constraints `UNIQUE(canonical_key)` e `UNIQUE(item_key, empenho_id)`;
4. **Risco de quebra de legados**: Mitigado pela criação de novas tabelas sem acoplamento a tabelas legadas.

---

## 16. ACHADOS DA IMPLEMENTAÇÃO
- O PostgreSQL 17.6 remoto suporta plenamente o trigger de imutabilidade e o particionamento temporal append-only;
- A ausência de dados nas tabelas legadas simplifica enormemente a transição na M17 (não há necessidade de scripts complexos de data-backfill).

---

## 17. DIVERGÊNCIAS EM RELAÇÃO AO PLANO 7.1

Em observância à recomendação explícita da Seção 8 do prompt da Fase 7.2-A:
> *"Se houver risco de ambiguidade, preferir não criar o campo [valor_imputado] nesta M16 e registrar como GAP para uma fase posterior."*

- **Decisão Adotada**: O campo `valor_imputado` **NÃO foi criado** na tabela `public.arp_item_empenhos` nesta M16.
- **Justificativa**: Evitar qualquer contaminação entre a dimensão física do item da Ata (`quantidade_consumida`) e a dimensão monetária da despesa. O valor financeiro do empenho pertence estritamente a `public.empenhos(valor_empenhado)` e o lastro contratual a `public.contrato_empenhos(valor_vinculado)`.

---

## 18. VEREDITO FINAL DA FASE 7.2-A

### **FASE 7.2-A — VEREDITO: GO (SCHEMA M16 HOMOLOGADO)**

- As 4 tabelas soberanas estão ativas no PostgreSQL 17.6 remoto;
- Constraints, foreign keys e índices de alta performance operacionais;
- RLS e trigger de imutabilidade testados e comprovados;
- Aplicação 100% verde (611 testes, TypeScript 0 erros, Build PASS);
- O banco de dados está pronto para receber a **Fase 7.2-B (Migration 17 — RPCs Transacionais de Empenhos)**.
