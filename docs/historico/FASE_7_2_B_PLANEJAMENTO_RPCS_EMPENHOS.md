# FASE 7.2-B — PLANEJAMENTO DAS RPCs TRANSACIONAIS DE EMPENHOS (MIGRATION 17)

**Sistema**: SaldoARP — Gestão Avançada de Atas de Registro de Preços e Contratos  
**Data**: 23 de Setembro de 2026  
**Status**: CONCLUÍDO — GO (PLANEJAMENTO TÉCNICO E AUDITORIA DE TRANSAÇÕES HOMOLOGADO)  
**Ambiente Alvo**: Supabase PostgreSQL 17.6 (`bouutpmxexvwppcmmhdi`)  
**Metodologia**: Transações Atômicas ACID, Princípio do Menor Privilégio (P7), Backend Authority e Imutabilidade Histórica  

---

## 1. AUDITORIA DO SCHEMA M16 REAL NO BANCO DE PRODUÇÃO

Antes de qualquer desenho transacional, a estrutura real das 4 tabelas criadas na Migration 16 (`20260924000016_canonical_empenhos_schema.sql`) foi inspecionada no PostgreSQL de produção:

```text
┌─────────────────────────────────┬───────────────────┬──────────────────────────────────────────┐
│ Tabela Soberana M16             │ PK Type           │ Constraints & Chaves Ativas no Banco     │
├─────────────────────────────────┼───────────────────┼──────────────────────────────────────────┤
│ public.empenhos                 │ UUID              │ UNIQUE (canonical_key), Checks >= 0      │
│ public.arp_item_empenhos        │ UUID              │ FK empenho_id, UNIQUE (item_key, emp_id) │
│ public.contrato_empenhos        │ UUID              │ FK empenho_id, UNIQUE (ctr_key, emp_id)  │
│ public.empenho_eventos_historico│ UUID              │ FK empenho_id, Trigger de Imutabilidade  │
└─────────────────────────────────┴───────────────────┴──────────────────────────────────────────┘
```

### Confirmações Cruciais do Schema Real:
1. **SSOT Único**: `public.empenhos` possui `canonical_key VARCHAR(100) UNIQUE`, garantindo unicidade em formato `{uasg}-{ano}-{numeroNormalizado}`;
2. **Separação Físico-Financeira Preservada**: `public.arp_item_empenhos` contém **estritamente `quantidade_consumida`**, sem o campo ambíguo `valor_imputado`;
3. **Imutabilidade Operacional**: O trigger `trg_protect_empenho_eventos_immutability` está ativo em `empenho_eventos_historico`, bloqueando qualquer `UPDATE` ou `DELETE` com erro `23514`;
4. **Backend Authority Ativo**: Todas as 4 tabelas possuem RLS habilitado e `REVOKE INSERT, UPDATE, DELETE` aplicado. Nenhuma escrita direta client-side é permitida.

---

## 2. AUDITORIA DOS PADRÕES DE RPC EXISTENTES NO SALDOARP

Pesquisou-se exaustivamente a base de migrations do projeto (`20260917000004` a `20260924000015`). As seguintes invariantes governam todas as RPCs corporativas do SaldoARP:

1. **`SECURITY DEFINER SET search_path = public`**: Todas as RPCs operam com privilégios de banco elevados para contornar o `REVOKE` client-side, mas com `search_path` fixo para impedir ataques de sequestro de schema;
2. **Autorização Rígida RBAC**:
   ```sql
   IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
     RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
       USING ERRCODE = '42501';
   END IF;
   ```
3. **Higienização e Validação Sintática de Parâmetros**:
   - `item_key` validada com regex `^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$` (erro `22023`);
   - `contract_key` validada como não nula e não vazia;
   - Quantidades físicas validadas com `CHECK (quantidade >= 0)`;
4. **Idempotência por UPSERT Nativo**: Uso de `ON CONFLICT (...) DO UPDATE SET ...` para garantir que chamadas simultâneas ou repetidas não causem exceção de chave duplicada nem duplicação de dados;
5. **Retorno Estruturado em JSONB**: Padronizado com `{ "success": true, "id": ..., "timestamp": ... }`;
6. **Auditoria Transparente**: As operações DML disparadas pelas RPCs acionam automaticamente o trigger `trg_audit_log_capture()`, gravando o diff antes/depois e o autor em `public.audit_logs`.

---

## 3. SELEÇÃO E SEGREGAÇÃO DAS RPCs DA MIGRATION 17

Rejeita-se categoricamente a criação de uma "RPC monolítica gigante". A gestão do ciclo de vida de empenhos é segregada em **5 operações atômicas cirúrgicas**:

```text
                               CAMADA DE RPCs (MIGRATION 17)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. save_empenho_soberano_atomic       --> Upsert idempotente e reconciliação da NE     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. link_empenho_to_item_atomic        --> Associação N:N Item ↔ Empenho (Consumo)      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. unlink_empenho_from_item_atomic    --> Desassociação cirúrgica Item ↔ Empenho       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. link_empenho_to_contract_atomic    --> Associação N:N Contrato ↔ Empenho (Lastro)   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. unlink_empenho_from_contract_atomic--> Desassociação cirúrgica Contrato ↔ Empenho   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. ESPECIFICAÇÃO DETALHADA DAS ASSINATURAS

### 4.1 `save_empenho_soberano_atomic`
- **Propósito**: Inserir, atualizar ou reconciliar uma Nota de Empenho soberana em `public.empenhos`.
- **Assinatura**:
  ```sql
  FUNCTION public.save_empenho_soberano_atomic(
    p_empenho JSONB
  ) RETURNS JSONB
  ```
- **Campos Obrigatórios no JSONB**:
  - `uasg_emitente` (`VARCHAR(10)`)
  - `ano_exercicio` (`INTEGER`)
  - `numero_oficial` (`VARCHAR(50)`)
  - `numero_normalizado` (`VARCHAR(50)`)
  - `data_emissao` (`DATE`)
  - `fonte_origem` (`VARCHAR(20)`: `'COMPRASNET'`, `'CONTRATOSNET'`, `'PNCP'`, `'MANUAL'`)
- **Campos Opcionais no JSONB**:
  - `valor_empenhado`, `valor_liquidado`, `valor_pago`, `valor_rpinscrito` (default 0)
  - `credor_nome`, `credor_cnpj_cpf`, `situacao`, `url_oficial`, `identificador_fonte`

### 4.2 `link_empenho_to_item_atomic`
- **Propósito**: Vincular um empenho ao item da Ata de Registro de Preços, debitando fisicamente o quantitativo.
- **Assinatura**:
  ```sql
  FUNCTION public.link_empenho_to_item_atomic(
    p_item_key VARCHAR,
    p_empenho_id UUID,
    p_quantidade_consumida NUMERIC,
    p_tipo_consumo VARCHAR DEFAULT 'ORDINARIO',
    p_numero_item_minuta VARCHAR DEFAULT NULL,
    p_observacoes TEXT DEFAULT NULL
  ) RETURNS JSONB
  ```

### 4.3 `unlink_empenho_from_item_atomic`
- **Propósito**: Remover o vínculo entre o item da Ata e o empenho, estornando o consumo físico do item sem jamais apagar o empenho soberano.
- **Assinatura**:
  ```sql
  FUNCTION public.unlink_empenho_from_item_atomic(
    p_link_id UUID
  ) RETURNS JSONB
  ```

### 4.4 `link_empenho_to_contract_atomic`
- **Propósito**: Vincular um empenho como lastro orçamentário de um Contrato Oficial (`contract_key`).
- **Assinatura**:
  ```sql
  FUNCTION public.link_empenho_to_contract_atomic(
    p_contract_key VARCHAR,
    p_empenho_id UUID,
    p_valor_vinculado NUMERIC DEFAULT NULL
  ) RETURNS JSONB
  ```

### 4.5 `unlink_empenho_from_contract_atomic`
- **Propósito**: Remover o vínculo de lastro entre contrato e empenho sem jamais apagar o empenho soberano.
- **Assinatura**:
  ```sql
  FUNCTION public.unlink_empenho_from_contract_atomic(
    p_link_id UUID
  ) RETURNS JSONB
  ```

---

## 5. RECONCILIAÇÃO E PROVENIÊNCIA: MANUAL $\longrightarrow$ OFICIAL

Um dos requisitos mais sensíveis do domínio é garantir que a inserção manual possa ser posteriormente confirmada por fontes governamentais sem perder a trilha de auditoria:

```text
[Entrada Manual] ────► INSERT (fonte_origem='MANUAL', informado_manualmente_inicialmente=true)
                              │
[API Federal Detecta] ────────┴──► UPDATE ON CONFLICT (canonical_key)
                                   SET fonte_origem = 'SINCRONIZADO',
                                       valor_empenhado = EXCLUDED.valor_empenhado,
                                       valor_liquidado = EXCLUDED.valor_liquidado,
                                       valor_pago = EXCLUDED.valor_pago,
                                       credor_nome = EXCLUDED.credor_nome,
                                       last_synced_at = NOW()
                                   -- NOTA: informado_manualmente_inicialmente PERMANECE TRUE!
```

### Regras de Proteção Contábil na Reconciliação:
1. **Blindagem contra Adulteração Manual**: Se um empenho já existe no banco com fonte oficial (`COMPRASNET`, `CONTRATOSNET`, `PNCP` ou `SINCRONIZADO`), uma tentativa de salvar manualmente **não sobrescreverá** os valores financeiros oficiais;
2. **Promoção Auditável**: Quando a API oficial confirma uma nota manual, o trigger de auditoria registra a transição de status em `audit_logs`, preservando quem digitou e quando a nota foi chancelada pelo governo;
3. **Preservação de Vínculos**: A reconciliação preserva o `id UUID` do empenho e seus vínculos em `arp_item_empenhos` e `contrato_empenhos` sem qualquer necessidade de recriação de chaves.

---

## 6. MECANISMOS DE IDEMPOTÊNCIA E CONTROLE DE CONCORRÊNCIA

### 6.1 Idempotência da Entidade Empenho
- Baseada na constraint `UNIQUE (canonical_key)`;
- A RPC calcula deterministicamente:
  $$v\_canonical\_key := v\_uasg || '-' || v\_ano || '-' || v\_norm\_num$$
- O `INSERT ... ON CONFLICT (canonical_key) DO UPDATE` garante que requisições paralelas (ex: dois navegadores abrindo a mesma Ata ou dois cron jobs de sync) atualizem a mesma linha sem lançar exceção de colisão.

### 6.2 Idempotência dos Vínculos N:N
- Em `public.arp_item_empenhos`: `ON CONFLICT (item_key, empenho_id) DO UPDATE SET quantidade_consumida = EXCLUDED.quantidade_consumida, updated_at = NOW()`;
- Em `public.contrato_empenhos`: `ON CONFLICT (contract_key, empenho_id) DO UPDATE SET valor_vinculado = EXCLUDED.valor_vinculado, updated_at = NOW()`;
- Em ambas as RPCs de vínculo, a chamada repetida com os mesmos parâmetros atualiza os metadados e retorna sucesso (`id` existente preservado).

---

## 7. VALIDAÇÃO DE QUANTIDADE E PRESERVAÇÃO DO SALDO

A regra fundamental de saldo permanece inviolável:

$$\text{SaldoQuantitativoItem} = \text{QuantidadeHomologadaItem} - \sum \text{QuantidadeConsumida}$$

### Invariantes Verificadas na RPC `link_empenho_to_item_atomic`:
1. **Não-Negatividade**:
   ```sql
   IF p_quantidade_consumida IS NULL OR p_quantidade_consumida < 0 THEN
     RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade consumida não pode ser negativa.'
       USING ERRCODE = '22023';
   END IF;
   ```
2. **Independência de Saldo**: A RPC **não armazena nem calcula saldo estático** na tabela. O saldo é obtido como agregação dinâmica do SSOT. Isso impede qualquer descompasso por dados desatualizados.
3. **Verificação de Teto do Item**:
   - Se o item existir na tabela `public.itens_ata`, a RPC verifica se a quantidade solicitada é compatível;
   - Se a quantidade consumida exceder a homologada, a RPC **permite o registro com flag** `tipo_consumo = 'AJUSTE_MANUAL'`, garantindo que o sistema reporte a inconsistência contábil real sem bloquear a verificação administrativa de fraudes ou excessos no órgão.

---

## 8. POLÍTICA DE SEGURANÇA E MATRIZ RBAC

Seguindo o padrão das Migrations 02, 06, 09, 10, 14 e 15:

| Perfil de Acesso | `save_empenho_soberano` | `link_empenho_to_item` | `unlink_from_item` | `link_to_contract` | `unlink_from_contract` |
|---|---|---|---|---|---|
| **Anon (Não Autenticado)** | ❌ Bloqueado (42501) | ❌ Bloqueado (42501) | ❌ Bloqueado (42501) | ❌ Bloqueado (42501) | ❌ Bloqueado (42501) |
| **Authenticated (Leitor)** | ❌ Bloqueado (42501) | ❌ Bloqueado (42501) | ❌ Bloqueado (42501) | ❌ Bloqueado (42501) | ❌ Bloqueado (42501) |
| **Gestor** | ✅ Permitido | ✅ Permitido | ✅ Permitido | ✅ Permitido | ✅ Permitido |
| **Admin** | ✅ Permitido | ✅ Permitido | ✅ Permitido | ✅ Permitido | ✅ Permitido |

Todas as 5 RPCs concedem execução estritamente a `authenticated`:
```sql
GRANT EXECUTE ON FUNCTION public.save_empenho_soberano_atomic(JSONB) TO authenticated;
-- Jamais GRANT TO anon
```

---

## 9. ALIMENTAÇÃO DA SÉRIE TEMPORAL E HISTÓRICO FUNCIONAL

Diferencia-se expressamente:
- **Auditoria Técnica**: Gerada pelo trigger `trg_audit_log_capture()` em `public.audit_logs`;
- **Histórico Funcional Contábil**: Registrado em `public.empenho_eventos_historico`.

### Ações na RPC `link_empenho_to_item_atomic`:
Ao vincular ou alterar uma cota de item, a RPC insere um evento imutável na tabela histórica:
```sql
INSERT INTO public.empenho_eventos_historico (
  empenho_id,
  item_key,
  data_evento,
  tipo_evento,
  delta_quantidade,
  metadados
) VALUES (
  p_empenho_id,
  v_item_key,
  CURRENT_DATE,
  CASE WHEN p_tipo_consumo = 'REFORCO' THEN 'REFORCO' ELSE 'EMISSAO_INICIAL' END,
  p_quantidade_consumida,
  jsonb_build_object('tipo_consumo', p_tipo_consumo, 'observacoes', p_observacoes)
);
```

### Ações na RPC `unlink_empenho_from_item_atomic`:
Ao remover o vínculo do item, a RPC insere o evento de cancelamento antes da exclusão da linha em `arp_item_empenhos`:
```sql
INSERT INTO public.empenho_eventos_historico (
  empenho_id,
  item_key,
  data_evento,
  tipo_evento,
  delta_quantidade,
  metadados
) VALUES (
  v_empenho_id,
  v_item_key,
  CURRENT_DATE,
  'CANCELAMENTO_TOTAL',
  -v_quantidade_consumida,
  jsonb_build_object('acao', 'desvinculacao_manual', 'link_id', p_link_id)
);
```

---

## 10. MATRIZ CONSOLIDADA DAS RPCs DA MIGRATION 17

| Nome da RPC | Entidade Alvo | Parâmetros | Tipo de DML | RBAC Exigido | Idempotência | Auditoria |
|---|---|---|---|---|---|---|
| `save_empenho_soberano_atomic` | `empenhos` | `p_empenho JSONB` | UPSERT | `gestor` / `admin` | Por `canonical_key` | Trigger `trg_audit_empenhos` |
| `link_empenho_to_item_atomic` | `arp_item_empenhos` | `item_key, empenho_id, qtd, tipo, minuta, obs` | UPSERT + INSERT Evento | `gestor` / `admin` | Por `(item_key, empenho_id)` | Trigger `arp_item_empenhos` + Histórico |
| `unlink_empenho_from_item_atomic` | `arp_item_empenhos` | `p_link_id UUID` | DELETE + INSERT Evento | `gestor` / `admin` | Idempotente por verificação de ROW_COUNT | Trigger `arp_item_empenhos` + Histórico |
| `link_empenho_to_contract_atomic` | `contrato_empenhos` | `contract_key, empenho_id, valor` | UPSERT | `gestor` / `admin` | Por `(contract_key, empenho_id)` | Trigger `contrato_empenhos` |
| `unlink_empenho_from_contract_atomic` | `contrato_empenhos` | `p_link_id UUID` | DELETE | `gestor` / `admin` | Idempotente por verificação de ROW_COUNT | Trigger `contrato_empenhos` |

---

## 11. ISOLAMENTO DOS LEGADOS DURANTE A M17

Nenhuma das 5 RPCs projetadas lê, atualiza ou apaga dados em:
- `public.empenhos_manuais`
- `public.empenho_links`
- `public.contrato_empenho_links`
- `public.empenho_manual_quantidades`

O ecossistema legado continuará funcionando em paralelo sem interferência, assegurando risco zero de regressão para os testes existentes e telas legadas.

---

## 12. PLANO DE TESTES AUTOMATIZADOS PARA A MIGRATION 17

Quando a M17 for implementada, os seguintes testes unitários e de integração serão obrigatórios:

### 12.1 Testes de `save_empenho_soberano_atomic`:
1. Deve criar novo empenho com dados válidos e retornar `canonical_key`;
2. Deve rejeitar chamada de usuário sem papel de gestor ou admin (`UNAUTHORIZED / 42501`);
3. Deve ser idempotente: duas chamadas consecutivas com o mesmo número/ano/uasg retornam o mesmo ID;
4. Reconciliação: chamada com dados oficiais para empenho manual preexistente deve promover `fonte_origem` para `'SINCRONIZADO'` e preservar `informado_manualmente_inicialmente = true`;
5. Proteção de integridade: chamada com dados manuais para empenho oficial já existente não pode sobrescrever os valores oficiais.

### 12.2 Testes de `link_empenho_to_item_atomic`:
1. Deve vincular empenho a item de Ata com quantidade válida;
2. Deve rejeitar vinculação com quantidade negativa (`INVALID_QUANTITY / 22023`);
3. Deve rejeitar `item_key` fora do formato canônico (`INVALID_ITEM_KEY / 22023`);
4. Deve rejeitar `empenho_id` inexistente (`NOT_FOUND / P0002`);
5. Idempotência: chamadas repetidas para o mesmo par `(item_key, empenho_id)` atualizam a quantidade sem criar linha duplicada;
6. Deve registrar evento em `empenho_eventos_historico`.

### 12.3 Testes de `unlink_empenho_from_item_atomic`:
1. Deve excluir o vínculo de item e registrar evento de estorno no histórico;
2. Deve preservar o empenho pai em `public.empenhos` intacto;
3. Deve falhar com `NOT_FOUND` se o ID do vínculo não existir.

### 12.4 Testes de `link_empenho_to_contract_atomic` e `unlink`:
1. Deve vincular empenho a `contract_key` sem exigir `arp_id` (Cenário C);
2. Deve suportar múltiplos empenhos para o mesmo contrato (relação N:N);
3. Desvinculação remove o link em `contrato_empenhos` sem afetar a Nota de Empenho soberana.

---

## 13. RISCOS TÉCNICOS E MITIGAÇÕES

| Risco Mapeado | Impacto | Mitigação Arquitetural |
|---|---|---|
| **Concorrência em Upsert de Empenhos** | Médio | Uso estrito de `ON CONFLICT (canonical_key) DO UPDATE` nativo do PostgreSQL com bloqueio a nível de linha gerenciado pelo engine. |
| **Exclusão Acidental de Empenho Soberano ao Desvincular** | Alto | As RPCs de desvinculação (`unlink`) operam estritamente sobre as tabelas associativas (`arp_item_empenhos` e `contrato_empenhos`), nunca executando `DELETE` em `empenhos`. |
| **Sobrescrita Indevida de Dados Oficiais por Manuais** | Alto | Lógica condicional expressa na RPC impedindo que payloads com `fonte_origem = 'MANUAL'` alterem campos oficiais de empenhos já chancelados por APIs federais. |
| **Regressão na Aplicação** | Zero | As RPCs novas coexistirão com as antigas; nenhuma chamada do frontend atual será alterada durante a M17. |

---

## 14. ESTRUTURA DO ARQUIVO DA MIGRATION M17 PLANEJADA

A migration será criada na fase seguinte como:
`supabase/migrations/20260924000017_rpc_empenhos_atomic.sql`

Com a sequência interna:
1. `CREATE OR REPLACE FUNCTION public.save_empenho_soberano_atomic(JSONB) ...`
2. `CREATE OR REPLACE FUNCTION public.link_empenho_to_item_atomic(...) ...`
3. `CREATE OR REPLACE FUNCTION public.unlink_empenho_from_item_atomic(UUID) ...`
4. `CREATE OR REPLACE FUNCTION public.link_empenho_to_contract_atomic(...) ...`
5. `CREATE OR REPLACE FUNCTION public.unlink_empenho_from_contract_atomic(UUID) ...`
6. `GRANT EXECUTE` de todas as funções estritamente para `authenticated`.

---

## 15. VEREDITO FINAL DA FASE 7.2-B

### **FASE 7.2-B — VEREDITO: GO (PLANEJAMENTO DE RPCs HOMOLOGADO)**

- As 5 RPCs foram individualmente projetadas com suas assinaturas, validações sintáticas e tratamentos de exceção;
- A regra fundamental de saldo quantitativo permanece inviolável e sem motores redundantes no banco;
- O ciclo de reconciliação manual $\rightarrow$ oficial está blindado contra adulterações;
- O histórico funcional contábil foi segregado da auditoria técnica;
- As permissões RBAC (`gestor`/`admin`) e o padrão `SECURITY DEFINER SET search_path = public` foram respeitados;
- **Nenhum arquivo de código ou banco foi alterado nesta fase**.

> O desenho técnico transacional está **pronto e aprovado para implementação controlada na Fase 7.2-C (Migration 17)** mediante autorização.
