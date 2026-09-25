-- ==============================================================================
-- MIGRATION 16: SCHEMA SOBERANO DE EMPENHOS E SÉRIE TEMPORAL — SALDOARP 3.0
-- Versão: 20260924000016_canonical_empenhos_schema.sql
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P6 (Auditabilidade), P7 (Least Privilege)
-- Resoluções: GAP-7.0 (Soberania de Empenhos), GAP-7.1 (Modelagem em 3 Camadas)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABELA SOBERANA: public.empenhos (CAMADA 1: ENTIDADE PURA)
-- ------------------------------------------------------------------------------
-- Representa a Nota de Empenho oficial do SIAFI/Orçamento Federal.
-- Atua como o Single Source of Truth (SSOT) relacional soberano.
-- Não embute lógicas de ata, contratos ou burn rate.
CREATE TABLE IF NOT EXISTS public.empenhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key VARCHAR(100) NOT NULL,
  numero_oficial VARCHAR(50) NOT NULL,
  ano_exercicio INTEGER NOT NULL CHECK (ano_exercicio >= 2000 AND ano_exercicio <= 2100),
  uasg_emitente VARCHAR(10) NOT NULL,
  numero_normalizado VARCHAR(50) NOT NULL,
  data_emissao DATE NOT NULL,
  valor_empenhado NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (valor_empenhado >= 0),
  valor_liquidado NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (valor_liquidado >= 0),
  valor_pago NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0),
  valor_rpinscrito NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (valor_rpinscrito >= 0),
  credor_nome VARCHAR(255),
  credor_cnpj_cpf VARCHAR(20),
  situacao VARCHAR(50),
  fonte_origem VARCHAR(20) NOT NULL CHECK (fonte_origem IN ('COMPRASNET', 'CONTRATOSNET', 'PNCP', 'MANUAL', 'SINCRONIZADO')),
  informado_manualmente_inicialmente BOOLEAN NOT NULL DEFAULT false,
  identificador_fonte VARCHAR(100),
  url_oficial TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_empenho_canonical_key UNIQUE (canonical_key)
);

COMMENT ON TABLE public.empenhos IS 'Entidade soberana e canônica de Notas de Empenho (SSOT). Registra dados oficiais do SIAFI/compras federais.';
COMMENT ON COLUMN public.empenhos.canonical_key IS 'Chave determinística e estável no formato {uasg}-{ano}-{numeroNormalizado}.';
COMMENT ON COLUMN public.empenhos.informado_manualmente_inicialmente IS 'Sinaliza se o registro nasceu como entrada manual antes de ser reconciliado com a fonte oficial.';

-- Índices de Alta Performance para public.empenhos
CREATE INDEX IF NOT EXISTS idx_empenhos_canonical_key ON public.empenhos(canonical_key);
CREATE INDEX IF NOT EXISTS idx_empenhos_uasg_ano ON public.empenhos(uasg_emitente, ano_exercicio);
CREATE INDEX IF NOT EXISTS idx_empenhos_credor_cnpj ON public.empenhos(credor_cnpj_cpf);
CREATE INDEX IF NOT EXISTS idx_empenhos_data_emissao ON public.empenhos(data_emissao);

-- ------------------------------------------------------------------------------
-- 2. TABELA ASSOCIATIVA ITEM DA ATA ↔ EMPENHO: public.arp_item_empenhos (CAMADA 2A)
-- ------------------------------------------------------------------------------
-- Registra o débito quantitativo físico no item da Ata de Registro de Preços.
-- Suporta formalmente o Cenário B (compra direta sem contrato formal - Art. 95 da Lei 14.133/2021).
-- A regra de saldo é estritamente: Saldo = QuantidadeHomologada - SUM(quantidade_consumida).
CREATE TABLE IF NOT EXISTS public.arp_item_empenhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key VARCHAR(100) NOT NULL, -- Chave Canônica: {numeroAta}-{uasg}-{Pad5(itemNum)}
  empenho_id UUID NOT NULL REFERENCES public.empenhos(id) ON DELETE CASCADE,
  quantidade_consumida NUMERIC(18, 4) NOT NULL CHECK (quantidade_consumida >= 0),
  tipo_consumo VARCHAR(20) NOT NULL DEFAULT 'ORDINARIO' CHECK (tipo_consumo IN ('ORDINARIO', 'REFORCO', 'AJUSTE_MANUAL')),
  numero_item_minuta VARCHAR(10),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_arp_item_empenho UNIQUE (item_key, empenho_id)
);

COMMENT ON TABLE public.arp_item_empenhos IS 'Relacionamento N:N entre Item da Ata e Nota de Empenho para débito físico-quantitativo de fornecimento.';
COMMENT ON COLUMN public.arp_item_empenhos.quantidade_consumida IS 'Quantidade física homologada consumida pelo empenho (não confundir com valor financeiro R$).';

-- Índices para public.arp_item_empenhos
CREATE INDEX IF NOT EXISTS idx_arp_item_empenhos_item_key ON public.arp_item_empenhos(item_key);
CREATE INDEX IF NOT EXISTS idx_arp_item_empenhos_empenho_id ON public.arp_item_empenhos(empenho_id);

-- ------------------------------------------------------------------------------
-- 3. TABELA ASSOCIATIVA CONTRATO OFICIAL ↔ EMPENHO: public.contrato_empenhos (CAMADA 2B)
-- ------------------------------------------------------------------------------
-- Registra o lastro orçamentário/financeiro de Contratos Oficiais.
-- Suporta formalmente o Cenário C (contratos autônomos sem Ata) e Cenário A (contratos decorrentes de Ata).
-- O vínculo utiliza a contract_key universal padronizada na Fase 6.
CREATE TABLE IF NOT EXISTS public.contrato_empenhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_key VARCHAR(150) NOT NULL, -- Chave Canônica: {uasg}-{numero}-{ano} ou ID PNCP
  empenho_id UUID NOT NULL REFERENCES public.empenhos(id) ON DELETE CASCADE,
  valor_vinculado NUMERIC(18, 4) CHECK (valor_vinculado >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_contrato_empenho_soberano UNIQUE (contract_key, empenho_id)
);

COMMENT ON TABLE public.contrato_empenhos IS 'Relacionamento N:N entre Contrato Oficial e Nota de Empenho como lastro orçamentário da contratação.';

-- Índices para public.contrato_empenhos
CREATE INDEX IF NOT EXISTS idx_contrato_empenhos_contract_key ON public.contrato_empenhos(contract_key);
CREATE INDEX IF NOT EXISTS idx_contrato_empenhos_empenho_id ON public.contrato_empenhos(empenho_id);

-- ------------------------------------------------------------------------------
-- 4. TABELA DE EVENTOS E SÉRIE TEMPORAL: public.empenho_eventos_historico (CAMADA 3)
-- ------------------------------------------------------------------------------
-- Trilha temporal append-only de eventos discretos e snapshots de execução.
-- Fundação da série temporal S(t) e das futuras projeções de consumo (Burn Rate / Farol).
CREATE TABLE IF NOT EXISTS public.empenho_eventos_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empenho_id UUID NOT NULL REFERENCES public.empenhos(id) ON DELETE CASCADE,
  item_key VARCHAR(100),
  contract_key VARCHAR(150),
  data_evento DATE NOT NULL,
  tipo_evento VARCHAR(30) NOT NULL CHECK (tipo_evento IN (
    'EMISSAO_INICIAL',
    'REFORCO',
    'ANULACAO_PARCIAL',
    'CANCELAMENTO_TOTAL',
    'LIQUIDACAO_SNAPSHOT',
    'PAGAMENTO_SNAPSHOT',
    'AJUSTE_AUDITORIA'
  )),
  delta_quantidade NUMERIC(18, 4) NOT NULL DEFAULT 0,
  delta_valor NUMERIC(18, 4) NOT NULL DEFAULT 0,
  metadados JSONB,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.empenho_eventos_historico IS 'Histórico append-only imutável de eventos de consumo e snapshots da execução orçamentária.';

-- Índices para public.empenho_eventos_historico
CREATE INDEX IF NOT EXISTS idx_emp_evt_hist_empenho_id ON public.empenho_eventos_historico(empenho_id);
CREATE INDEX IF NOT EXISTS idx_emp_evt_hist_item_data ON public.empenho_eventos_historico(item_key, data_evento);
CREATE INDEX IF NOT EXISTS idx_emp_evt_hist_contract_data ON public.empenho_eventos_historico(contract_key, data_evento);

-- ------------------------------------------------------------------------------
-- 5. TRIGGER DE IMUTABILIDADE PARA O HISTÓRICO (APPEND-ONLY)
-- ------------------------------------------------------------------------------
-- Impede categoricamente UPDATE e DELETE na tabela empenho_eventos_historico.
CREATE OR REPLACE FUNCTION public.trg_prevent_empenho_eventos_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_HISTORICAL_LOG: Registros em empenho_eventos_historico são append-only e não podem ser alterados ou excluídos.'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_empenho_eventos_immutability ON public.empenho_eventos_historico;
CREATE TRIGGER trg_protect_empenho_eventos_immutability
  BEFORE UPDATE OR DELETE ON public.empenho_eventos_historico
  FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_empenho_eventos_mutation();

-- ------------------------------------------------------------------------------
-- 6. TRILHA DE AUDITORIA DO SISTEMA
-- ------------------------------------------------------------------------------
-- Registra automaticamente todas as inserções, alterações e deleções nas tabelas mutáveis.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_empenhos ON public.empenhos;
    CREATE TRIGGER trg_audit_empenhos
      AFTER INSERT OR UPDATE OR DELETE ON public.empenhos
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

    DROP TRIGGER IF EXISTS trg_audit_arp_item_empenhos ON public.arp_item_empenhos;
    CREATE TRIGGER trg_audit_arp_item_empenhos
      AFTER INSERT OR UPDATE OR DELETE ON public.arp_item_empenhos
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

    DROP TRIGGER IF EXISTS trg_audit_contrato_empenhos ON public.contrato_empenhos;
    CREATE TRIGGER trg_audit_contrato_empenhos
      AFTER INSERT OR UPDATE OR DELETE ON public.contrato_empenhos
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) E HARDENING DE BACKEND AUTHORITY
-- ------------------------------------------------------------------------------
-- Habilita RLS em todas as tabelas. Leitura transparente e mutações reservadas para RPCs.
ALTER TABLE public.empenhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arp_item_empenhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_empenhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empenho_eventos_historico ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura (SELECT)
CREATE POLICY "Permitir leitura de empenhos para autenticados"
  ON public.empenhos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir leitura anon de empenhos"
  ON public.empenhos FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir leitura de arp_item_empenhos para autenticados"
  ON public.arp_item_empenhos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir leitura anon de arp_item_empenhos"
  ON public.arp_item_empenhos FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir leitura de contrato_empenhos para autenticados"
  ON public.contrato_empenhos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir leitura anon de contrato_empenhos"
  ON public.contrato_empenhos FOR SELECT TO anon USING (true);

CREATE POLICY "Permitir leitura de eventos de empenhos para autenticados"
  ON public.empenho_eventos_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir leitura anon de eventos de empenhos"
  ON public.empenho_eventos_historico FOR SELECT TO anon USING (true);

-- Revogação estrita de mutações diretas via PostgREST para clientes (Princípio do Menor Privilégio - P7)
REVOKE INSERT, UPDATE, DELETE ON public.empenhos FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.arp_item_empenhos FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.contrato_empenhos FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.empenho_eventos_historico FROM authenticated, anon;
