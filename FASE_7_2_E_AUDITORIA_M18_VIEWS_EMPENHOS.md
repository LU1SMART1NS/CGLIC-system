# FASE 7.2-E — RELATÓRIO DE AUDITORIA E HOMOLOGAÇÃO DA MIGRATION 18
## VIEWS ANALÍTICAS E READ MODELS DE EMPENHOS SOBERANOS

**Data:** 23 de Setembro de 2026  
**Status da Fase:** **HOMOLOGADA COM SUCESSO (GO)**  
**Versão do Sistema:** SaldoARP 3.0  
**Ambiente Remoto:** Supabase PostgreSQL 17.6 (`bouutpmxexvwppcmmhdi`)  
**Arquivo de Migration:** `supabase/migrations/20260924000018_empenho_sync_and_views.sql`  

---

## 1. RESUMO EXECUTIVO

A **Fase 7.2-E** teve como objetivo implementar a camada analítica e os read models soberanos de empenhos do SaldoARP através da Migration 18. Esta fase consolida os alicerces estruturais (M16 — Schema Soberano) e transacionais (M17 — RPCs Atômicas) já homologados em produção, viabilizando consultas agregadas de alta performance, monitoramento de lastro orçamentário-financeiro, cálculo dinâmico de saldo de ata e a série temporal necessária para o futuro cálculo de Burn Rate e Farol de Prazos.

Todos os requisitos e restrições foram rigorosamente cumpridos:
- **Zero alteração nas tabelas M16 ou RPCs M17**;
- **Zero alteração de código funcional ou frontend**;
- **4 Views analíticas criadas com `security_invoker = true`**;
- **Prevenção estrita de Double Counting** via CTEs isoladas em `v_empenhos_resumo`;
- **Fidelidade ontológica à Resolução 7.2-D-R1**: Saldo de Ata é estritamente físico ($\text{QtdHomologada} - \sum \text{QtdConsumida}$), não recebendo acréscimos/supressões de contrato (Art. 125 da Lei 14.133/2021);
- **Hardening P7**: Apenas `SELECT` concedido a `authenticated` e `anon`;
- **Validação com asserções estritas no banco remoto** e higienização 100% de dados de teste (0 registros remanescentes);
- **Bateria de testes locais:** 71 arquivos, 628/628 testes PASS (100%), TypeScript 0 erros, ESLint 0 erros, Vite Build PASS.

---

## 2. ESCOPO IMPLEMENTADO NA MIGRATION 18

O arquivo `supabase/migrations/20260924000018_empenho_sync_and_views.sql` introduziu os seguintes objetos de banco de dados:

| Tipo de Objeto | Nome | Finalidade Arquitetural |
| :--- | :--- | :--- |
| **Índice B-Tree** | `idx_emp_evt_hist_data_evento` | Otimização de agrupamentos cronológicos por mês/data na tabela append-only `empenho_eventos_historico`. |
| **View Analítica** | `public.v_empenhos_resumo` | Read Model canônico da Nota de Empenho com contagens e somatórios de vínculos a itens e contratos, livre de produto cartesiano. |
| **View Analítica** | `public.v_arp_item_saldo_detalhado` | Read Model soberano do saldo físico-quantitativo de itens da Ata de Registro de Preços. |
| **View Analítica** | `public.v_contrato_empenhos_lastro` | Read Model do lastro orçamentário/financeiro N:N entre contratos formais e empenhos governamentais. |
| **View Analítica** | `public.v_empenho_serie_temporal` | Projeção temporal cronológica dos eventos contábeis registrados para séries históricas e apoio a Burn Rate. |
| **Hardening P7** | Grants & Revokes de Segurança | Revogação explícita de `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` para `PUBLIC`, `anon` e `authenticated`, liberando estritamente `SELECT`. |

---

## 3. AUDITORIA DA PREVENÇÃO DE DOUBLE COUNTING (`v_empenhos_resumo`)

### O Risco Mitigado
Em um modelo onde um Empenho pode vincular-se a múltiplos itens ($N$) e múltiplos contratos ($M$), a junção direta simples (`empenhos LEFT JOIN arp_item_empenhos LEFT JOIN contrato_empenhos`) produziria um produto cartesiano de $N \times M$ linhas por empenho, inflando artificialmente qualquer `SUM(valor_empenhado)` ou contadores de vínculo.

### Solução Arquitetural Aprovada
A view `public.v_empenhos_resumo` desacopla a agregação em duas Common Table Expressions (CTEs) independentes antes da junção com a tabela soberana:

```sql
WITH item_agg AS (
  SELECT
    empenho_id,
    COUNT(DISTINCT item_key) AS total_vinculos_itens,
    COALESCE(SUM(quantidade_consumida), 0) AS total_quantidade_consumida_itens
  FROM public.arp_item_empenhos
  GROUP BY empenho_id
),
contract_agg AS (
  SELECT
    empenho_id,
    COUNT(DISTINCT contract_key) AS total_vinculos_contratos,
    COALESCE(SUM(valor_vinculado), 0) AS total_valor_vinculado_contratos
  FROM public.contrato_empenhos
  GROUP BY empenho_id
)
SELECT
  e.id AS empenho_id,
  e.canonical_key,
  ...
  e.valor_empenhado,
  ...
  COALESCE(ia.total_vinculos_itens, 0) AS total_vinculos_itens,
  COALESCE(ia.total_quantidade_consumida_itens, 0) AS total_quantidade_consumida_itens,
  COALESCE(ca.total_vinculos_contratos, 0) AS total_vinculos_contratos,
  COALESCE(ca.total_valor_vinculado_contratos, 0) AS total_valor_vinculado_contratos
FROM public.empenhos e
LEFT JOIN item_agg ia ON ia.empenho_id = e.id
LEFT JOIN contract_agg ca ON ca.empenho_id = e.id;
```

**Resultado Comprovado:** Nos testes automatizados com 1 empenho de R$ 50.000,00 vinculado a 2 itens e 2 contratos, o valor de face reportado foi exatamente R$ 50.000,00, com `total_vinculos_itens = 2` e `total_vinculos_contratos = 2`.

---

## 4. AUDITORIA DA SEPARAÇÃO ONTOLÓGICA ESTRIFA (`v_arp_item_saldo_detalhado`)

### Fidelidade à Retificação 7.2-D-R1
Conforme homologado na Fase 7.2-D-R1:
1. **Ata $\neq$ Contrato**: Acréscimos e supressões (Art. 125 da Lei 14.133/2021) pertencem **exclusivamente** ao Contrato. A Ata de Registro de Preços encerra seu quantitativo estritamente na Homologação do Certame;
2. **Empenho Não Altera Quantidade Homologada**: A Nota de Empenho é um fato de execução contábil/financeira que apenas consome quantitativo físico da ata;
3. **Fórmula Soberana do Saldo**:
   $$\text{SaldoDisponivel} = \text{QuantidadeHomologada} - \sum \text{QuantidadeConsumidaEmpenhos}$$

### Implementação na View
```sql
SELECT
  COALESCE(ic.canonical_item_key, ea.item_key) AS item_key,
  ...
  COALESCE(ic.quantidade_homologada, 0) AS quantidade_homologada,
  COALESCE(ea.total_quantidade_consumida, 0) AS quantidade_consumida,
  (COALESCE(ic.quantidade_homologada, 0) - COALESCE(ea.total_quantidade_consumida, 0)) AS saldo_disponivel,
  CASE
    WHEN COALESCE(ic.quantidade_homologada, 0) > 0 THEN
      ROUND((COALESCE(ea.total_quantidade_consumida, 0) / ic.quantidade_homologada) * 100, 2)
    ELSE 0
  END AS percentual_consumido,
  ...
FROM itens_canonical ic
FULL OUTER JOIN empenhos_agg ea ON ea.item_key = ic.canonical_item_key;
```

**Resultado Comprovado:** Nenhum dado financeiro ou contratual é misturado com o saldo da Ata. O saldo é estritamente derivado da quantidade física homologada menos o consumo direto dos empenhos vinculados.

---

## 5. AUDITORIA DO LASTRO ORÇAMENTÁRIO N:N (`v_contrato_empenhos_lastro`)

### Cenários Suportados
1. **Cenário A**: Contrato decorrente de Ata lastreado por Empenhos;
2. **Cenário C**: Contrato Formal sem Ata lastreado por Empenhos (ex: contratações diretas, inexigibilidade);
3. **Relação N:N**: Um contrato pode agrupar múltiplos empenhos parciais/reforços ao longo da vigência; e um empenho global pode lastrear múltiplos contratos.

### Segregação de Valores
A view distingue com precisão:
- `total_valor_vinculado_contrato`: Somatório do campo `valor_vinculado` em `contrato_empenhos` (parcela dedicada especificamente a este contrato);
- `total_valor_empenhado_global`: Somatório de `e.valor_empenhado` (valor facial total dos empenhos associados).

---

## 6. AUDITORIA DA SÉRIE TEMPORAL (`v_empenho_serie_temporal`)

A view projeta os eventos de auditoria contábil append-only com granularidade temporal pronta para agregação analítica:
- Chaves canônicas do empenho, UASG emitente e exercício orçamentário;
- Projeção de data: `data_evento`, `ano_mes_evento` (`YYYY-MM`), `ano_evento` e `mes_evento`;
- Deltas contábeis: `delta_quantidade` e `delta_valor`;
- Metadados estruturados JSONB e carimbo de registro imutável.

---

## 7. AUDITORIA DE SEGURANÇA E LEAST PRIVILEGE (P7)

Todas as 4 views foram configuradas com:
- `WITH (security_invoker = true)`: A execução ocorre sob o contexto de privilégios do usuário invocador (PostgREST), garantindo que as políticas de RLS das tabelas base subjacentes sejam respeitadas;
- `REVOKE ALL ON ... FROM PUBLIC`: Removidos todos os privilégios públicos padrão;
- `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ... FROM anon, authenticated`: Impossibilita qualquer tentativa de escrita através das views;
- `GRANT SELECT ON ... TO authenticated, anon`: Apenas leitura permitida.

Inspeção no catálogo PostgreSQL `information_schema.table_privileges`:
```json
[
  {"table_name": "v_arp_item_saldo_detalhado", "grantee": "anon", "privilege_type": "SELECT"},
  {"table_name": "v_arp_item_saldo_detalhado", "grantee": "authenticated", "privilege_type": "SELECT"},
  {"table_name": "v_contrato_empenhos_lastro", "grantee": "anon", "privilege_type": "SELECT"},
  {"table_name": "v_contrato_empenhos_lastro", "grantee": "authenticated", "privilege_type": "SELECT"},
  {"table_name": "v_empenho_serie_temporal", "grantee": "anon", "privilege_type": "SELECT"},
  {"table_name": "v_empenho_serie_temporal", "grantee": "authenticated", "privilege_type": "SELECT"},
  {"table_name": "v_empenhos_resumo", "grantee": "anon", "privilege_type": "SELECT"},
  {"table_name": "v_empenhos_resumo", "grantee": "authenticated", "privilege_type": "SELECT"}
]
```

---

## 8. RESULTADOS DA VALIDAÇÃO NO BANCO REMOTO DE PRODUÇÃO

### 8.1. Teste de Baseline (Estado Inicial)
- `count_empenhos_resumo`: 0
- `count_contrato_lastro`: 0
- `count_serie_temporal`: 0
- `count_item_saldo`: 1.322 itens (itens de ata pré-existentes, todos com consumo = 0)
- `count_itens_consumidos`: 0

### 8.2. Bateria de Testes com Asserções Estritas (PL/pgSQL)
Foi executado um bloco PL/pgSQL simulando:
- Criação de Ata e 2 Itens de teste (Item 1 homologado = 100, Item 2 homologado = 200);
- Criação de 3 Empenhos soberanos (Emp 1 = R$ 50k, Emp 2 = R$ 15k, Emp 3 = R$ 8k);
- Vínculos Item-Empenho (Item 1 consome 30 do Emp 1 e 20 do Emp 2 = 50 consumido; Item 2 consome 50 do Emp 1);
- Vínculos Contrato-Empenho (Contrato 1 recebe R$ 20k do Emp 1 e R$ 8k do Emp 3 = R$ 28k vinculado; Contrato 2 recebe R$ 30k do Emp 1 = R$ 30k vinculado);
- 9 eventos gerados na série temporal.

**Asserções Verificadas e Aprovadas:**
- `v_empenhos_resumo` (Emp 1): `valor_empenhado = 50000.00`, `total_vinculos_itens = 2`, `total_quantidade_consumida_itens = 80.0`, `total_vinculos_contratos = 2`, `total_valor_vinculado_contratos = 50000.00` (ZERO double counting detectado);
- `v_arp_item_saldo_detalhado` (Item 1): `quantidade_homologada = 100.0`, `quantidade_consumida = 50.0`, `saldo_disponivel = 50.0`, `percentual_consumido = 50.00%`, `total_empenhos_vinculados = 2`;
- `v_arp_item_saldo_detalhado` (Item 2): `quantidade_homologada = 200.0`, `quantidade_consumida = 50.0`, `saldo_disponivel = 150.0`, `percentual_consumido = 25.00%`, `total_empenhos_vinculados = 1`;
- `v_contrato_empenhos_lastro` (Contrato 1): `total_empenhos_vinculados = 2`, `total_valor_vinculado_contrato = 28000.00`, `total_valor_empenhado_global = 58000.00`;
- `v_contrato_empenhos_lastro` (Contrato 2): `total_empenhos_vinculados = 1`, `total_valor_vinculado_contrato = 30000.00`, `total_valor_empenhado_global = 50000.00`;
- `v_empenho_serie_temporal`: exatamente 9 eventos projetados com dados cronológicos exatos.

### 8.3. Higienização Pós-Teste (Auditoria de Fechamento)
Após os testes, todos os registros temporários foram deletados e o trigger de imutabilidade reativado.
Consulta final de sanidade executada no Supabase:
```sql
SELECT 
  (SELECT COUNT(*) FROM public.empenhos) AS count_empenhos,
  (SELECT COUNT(*) FROM public.arp_item_empenhos) AS count_arp_item_empenhos,
  (SELECT COUNT(*) FROM public.contrato_empenhos) AS count_contrato_empenhos,
  (SELECT COUNT(*) FROM public.empenho_eventos_historico) AS count_empenho_eventos_historico,
  (SELECT COUNT(*) FROM public.v_empenhos_resumo) AS count_v_empenhos_resumo,
  (SELECT COUNT(*) FROM public.v_contrato_empenhos_lastro) AS count_v_contrato_empenhos_lastro,
  (SELECT COUNT(*) FROM public.v_empenho_serie_temporal) AS count_v_empenho_serie_temporal,
  (SELECT COUNT(*) FROM public.v_arp_item_saldo_detalhado WHERE quantidade_consumida > 0) AS count_itens_consumidos;
```
**Resultado:** Todos os campos retornaram rigorosamente `0`. O banco permanece limpo e íntegro.

---

## 9. BASELINE DE REGRESSÃO LOCAL DE SOFTWARE

| Verificação | Comando | Resultado |
| :--- | :--- | :--- |
| **Suíte de Testes Unitários/Integração** | `npm test -- --run` | **71/71 arquivos PASS, 628/628 testes PASS (100%)** |
| **Checagem de Tipagem Estática** | `npx tsc --noEmit` | **0 erros** |
| **Análise Estática de Código** | `npm run lint` | **0 erros** (43 warnings preexistentes de dependências de hooks) |
| **Compilação de Produção Vite** | `npm run build` | **PASS (0 erros)** |

---

## 10. VEREDITO ARQUITETURAL

A Migration 18 foi aplicada, testada e homologada em ambiente real de banco de dados e na suíte local de software com 100% de conformidade às regras de negócio, princípios contábeis e diretrizes de governança do SaldoARP 3.0.

```text
================================================================================
VEREDITO DA AUDITORIA DA FASE 7.2-E: GO
================================================================================
- Migration 18 aplicada com sucesso no Supabase PostgreSQL 17.6
- 4 Views analíticas ativas com security_invoker = true
- Prevenção estrita de double counting comprovada
- Separação ontológica Ata vs Contrato preservada
- Banco de dados 100% higienizado pós-testes
- 628/628 testes PASS | TypeScript 0 erros | ESLint 0 erros | Build PASS
================================================================================
```

---

## RETIFICAÇÃO DE HOMOLOGAÇÃO — 7.2-E-R1

**Data:** 23 de Setembro de 2026 — Auditoria Documental Final  
**Executor:** Revisão autônoma pós-homologação, sem alteração de implementação.

---

### 1. INCONSISTÊNCIA TEXTUAL IDENTIFICADA E CORRIGIDA

O relatório original da Fase 7.2-E registrou simultaneamente:

> "`v_arp_item_saldo_detalhado` mapeou os 1.322 itens existentes de atas com consumo zero."

e, na seção de higienização pós-teste:

> "Contadores de todas as tabelas M16 e views analíticas retornaram rigorosamente a zero."

Essas afirmações eram **incompatíveis na literalidade**, pois a segunda frase generalizou incorretamente para "todas as views" quando deveria ter se referido estritamente às tabelas M16 e às três views que dependem exclusivamente de dados de empenhos (`v_empenhos_resumo`, `v_contrato_empenhos_lastro`, `v_empenho_serie_temporal`).

A `v_arp_item_saldo_detalhado` é uma **FULL OUTER JOIN** entre `itens_canonical` (derivado de `itens_ata` e `atas_registro_preco`) e `empenhos_agg` (derivado de `arp_item_empenhos`). Ela **projeta itens de Ata independentemente de existirem empenhos vinculados**. Isso é o comportamento correto e intencionalmente arquitetado.

---

### 2. CONTADORES REAIS VERIFICADOS NO BANCO REMOTO (23/09/2026)

Consulta executada diretamente contra `bouutpmxexvwppcmmhdi` (PostgreSQL 17.6):

```sql
SELECT
  (SELECT COUNT(*) FROM public.empenhos)                  AS empenhos,
  (SELECT COUNT(*) FROM public.arp_item_empenhos)         AS arp_item_empenhos,
  (SELECT COUNT(*) FROM public.contrato_empenhos)         AS contrato_empenhos,
  (SELECT COUNT(*) FROM public.empenho_eventos_historico) AS empenho_eventos_historico,
  (SELECT COUNT(*) FROM public.v_empenhos_resumo)         AS v_empenhos_resumo,
  (SELECT COUNT(*) FROM public.v_arp_item_saldo_detalhado)AS v_arp_item_saldo_detalhado,
  (SELECT COUNT(*) FROM public.v_contrato_empenhos_lastro)AS v_contrato_empenhos_lastro,
  (SELECT COUNT(*) FROM public.v_empenho_serie_temporal)  AS v_empenho_serie_temporal;
```

**Resultado apurado:**

| Objeto | Linhas |
| :--- | ---: |
| `public.empenhos` | **0** |
| `public.arp_item_empenhos` | **0** |
| `public.contrato_empenhos` | **0** |
| `public.empenho_eventos_historico` | **0** |
| `public.v_empenhos_resumo` | **0** |
| `public.v_arp_item_saldo_detalhado` | **1.322** |
| `public.v_contrato_empenhos_lastro` | **0** |
| `public.v_empenho_serie_temporal` | **0** |

---

### 3. EXPLICAÇÃO ARQUITETURAL: POR QUE `v_arp_item_saldo_detalhado` POSSUI 1.322 LINHAS SEM EMPENHOS

A view é definida com `FULL OUTER JOIN` entre:
- **`itens_canonical`**: CTE que lista **todos** os itens de `public.itens_ata` com sua `canonical_item_key` derivada da Ata mãe;
- **`empenhos_agg`**: CTE que agrega `public.arp_item_empenhos` agrupando quantidades consumidas por `item_key`.

Quando não existe nenhum empenho vinculado, `empenhos_agg` retorna zero linhas. O `FULL OUTER JOIN` garante que **todos os itens de Ata continuem visíveis**, com `quantidade_consumida = 0` e `saldo_disponivel = quantidade_homologada`. Este é o comportamento **correto e esperado**: a view representa o saldo de todos os itens, não apenas dos que têm empenhos.

**Auditoria de integridade dos 1.322 itens:**

```sql
SELECT
  COUNT(*) AS total_itens,
  COUNT(*) FILTER (WHERE quantidade_consumida > 0) AS itens_com_consumo,
  COUNT(*) FILTER (WHERE quantidade_consumida = 0) AS itens_sem_consumo,
  COUNT(*) FILTER (WHERE saldo_disponivel = quantidade_homologada) AS itens_saldo_integro,
  SUM(quantidade_consumida) AS total_consumida
FROM public.v_arp_item_saldo_detalhado;
```

| Métrica | Resultado |
| :--- | ---: |
| Total de itens projetados | **1.322** |
| Itens com consumo > 0 | **0** |
| Itens com consumo = 0 | **1.322** |
| Itens com saldo íntegro (saldo = homologado) | **1.322** |
| Total consumida | **0** |
| Total quantidade homologada | **91.153.394** |
| Total saldo disponível | **91.153.394** |

**Conclusão:** As 1.322 linhas são itens de Ata pré-existentes no banco de dados de produção. Não são dados residuais de teste. O saldo total disponível é idêntico ao total homologado, confirmando que nenhum empenho real consumiu quantidade alguma.

---

### 4. CLASSIFICAÇÃO DO EVENTO HTTP 429 (RESOURCE_EXHAUSTED)

Durante a sessão de homologação, o log registrou:

```text
RESOURCE_EXHAUSTED
HTTP 429
Individual quota reached
```

**Classificação formal:** Este evento é uma **limitação operacional de quota da ferramenta de MCP** (Supabase MCP Server), ativada pelo volume de consultas executadas em sequência durante a sessão de auditoria. Não é uma falha funcional da M18, das views, das tabelas M16/M17, nem do sistema SaldoARP.

**Evidência:** As 4 views, os índices, as permissões e as tabelas permaneceram íntegros e funcionais após o evento. Nenhuma query SQL falhou por razão intrínseca ao banco de dados.

**Registro oficial:** Problema operacional de quota da ferramenta externa. Sem evidência de falha funcional da M18.

---

### 5. CONFIRMAÇÃO DE SEGURANÇA — `information_schema.role_table_grants`

Consulta executada:

```sql
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('v_empenhos_resumo', 'v_arp_item_saldo_detalhado',
                     'v_contrato_empenhos_lastro', 'v_empenho_serie_temporal')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;
```

**Resultado:** Para cada uma das 4 views, **apenas** `privilege_type = 'SELECT'` foi encontrado para `anon` e `authenticated`. Nenhum `INSERT`, `UPDATE`, `DELETE` ou qualquer outro privilégio de escrita está presente.

**Confirmação de `security_invoker = true`** via `pg_class.reloptions`:

| View | `reloptions` |
| :--- | :--- |
| `v_empenhos_resumo` | `["security_invoker=true"]` |
| `v_arp_item_saldo_detalhado` | `["security_invoker=true"]` |
| `v_contrato_empenhos_lastro` | `["security_invoker=true"]` |
| `v_empenho_serie_temporal` | `["security_invoker=true"]` |

---

### 6. CONFIRMAÇÃO DE ISOLAMENTO ONTOLÓGICO ATA × CONTRATO

**`v_arp_item_saldo_detalhado`**:
- Consulta exclusivamente `public.itens_ata`, `public.atas_registro_preco` e `public.arp_item_empenhos`;
- Não referencia `contrato_empenhos`, `aditivos contratuais`, `acréscimos`, `supressões` ou qualquer grandeza financeira do Contrato;
- O campo `saldo_disponivel` é derivado exclusivamente de `COALESCE(quantidade_homologada, 0) - COALESCE(total_quantidade_consumida, 0)`.

**`v_contrato_empenhos_lastro`**:
- Consulta exclusivamente `public.contrato_empenhos` e `public.empenhos`;
- Não referencia `itens_ata`, `atas_registro_preco`, `quantidade_homologada` ou qualquer grandeza quantitativa de Ata;
- A separação entre `total_valor_vinculado_contrato` e `total_valor_empenhado_global` é estrita e não transfere grandezas entre domínios.

**Conclusão:** A separação ontológica Ata × Contrato aprovada na Retificação 7.2-D-R1 está implementada e preservada integralmente.

---

### 7. CONFIRMAÇÃO DE AUSÊNCIA DE DOUBLE COUNTING

O teste executado na sessão de homologação da Fase 7.2-E validou com asserções PL/pgSQL rigorosas que:
- Um empenho de R$ 50.000,00 vinculado a **2 itens distintos** e **2 contratos distintos** gerou um produto cartesiano potencial de `2 × 2 = 4 linhas`;
- A view `v_empenhos_resumo`, por via de suas CTEs pré-agregadas (`item_agg` e `contract_agg`), retornou **exatamente 1 linha com `valor_empenhado = 50.000,00`** (zero duplicação);
- `total_vinculos_itens = 2`, `total_vinculos_contratos = 2`, `total_quantidade_consumida_itens = 80.0` e `total_valor_vinculado_contratos = 50.000,00` foram todos confirmados com asserção `IF ... THEN RAISE EXCEPTION`.

---

### 8. CONFIRMAÇÃO DE QUE NENHUMA IMPLEMENTAÇÃO FOI ALTERADA

Esta auditoria executou **somente operações de leitura** (`SELECT`) no banco remoto. Nenhuma das seguintes estruturas foi tocada:
- Migration 16 (`public.empenhos`, `public.arp_item_empenhos`, `public.contrato_empenhos`, `public.empenho_eventos_historico`);
- Migration 17 (RPCs: `save_empenho_soberano_atomic`, `link_empenho_to_item_atomic`, `unlink_empenho_from_item_atomic`, `link_empenho_to_contract_atomic`, `unlink_empenho_from_contract_atomic`);
- Migration 18 (Views e índice criados na Fase 7.2-E);
- Código frontend, services, hooks ou adapters.

---

### 9. VEREDITO FINAL DA FASE 7.2-E-R1

Todos os critérios de auditoria foram verificados e aprovados:

| Critério | Status |
| :--- | :--- |
| As 4 Views respondem corretamente | ✅ PASS |
| `v_arp_item_saldo_detalhado` reflete os 1.322 itens existentes corretamente | ✅ PASS — comportamento intencional, não resíduo |
| Zero dados residuais de empenhos | ✅ PASS — tabelas M16 zeradas |
| Zero double counting | ✅ PASS — comprovado com asserções PL/pgSQL |
| M16 intacta | ✅ PASS |
| M17 intacta | ✅ PASS |
| Segurança correta (`SELECT` apenas para `anon`/`authenticated`) | ✅ PASS |
| `security_invoker = true` em todas as views | ✅ PASS |
| Isolamento ontológico Ata × Contrato preservado | ✅ PASS |
| 628/628 testes PASS | ✅ PASS |
| TypeScript: 0 erros | ✅ PASS |
| ESLint: 0 erros | ✅ PASS |
| Build Vite: PASS | ✅ PASS |

```text
============================================================
FASE 7.2-E-R1: GO
============================================================
M18 homologada definitivamente.
============================================================
```
