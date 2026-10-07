-- ==============================================================================
-- MIGRATION 87: CICLO DE PAGAMENTO NA PORTARIA DGFNSP 50/2025 E NA IN SEGES 77/2022
-- Versão: 20261007000087_ciclo_pagamento_portaria50.sql
--
-- 1. Empenho guarda a natureza de despesa e o plano interno do Contratos.gov.br (a API manda; eram
--    descartados). Bens a incorporar = ND 449052 (equipamentos e material permanente) → COLOG.
--    gravar_classificacao_empenhos: chamada pela sincronização do servidor depois de gravar os empenhos.
-- 2. Ciclo:
--    - abertura com data do atesto (início dos prazos), processo SEI de pagamento e os itens "DO PAGAMENTO"
--      (Anexo II: NF, SEI, atesto, empenho, subelemento, bruto, juros/multa, glosa, desconto, a pagar);
--    - conferência com o checklist do Anexo I (Sim / Não / Não se aplica + SEI); "Conferido" só sem "Não";
--    - devolução diz a quem (FORNECEDOR = contratado: o prazo legal da liquidação para, IN 77 art. 7º § 4º;
--      FISCAL = área: só o prazo da CGLIC para) e "Recebido de volta" (RETORNO) reabre a conferência;
--    - envio à CGOFI liga o ciclo às faturas do Contratos.gov.br e pode enviar à COLOG no mesmo passo;
--    - etapa LIQUIDADO; prorrogação justificada do prazo de liquidação (IN 77 art. 7º § 3º).
-- 3. conciliar_ciclos_pagamento: liga sozinho a fatura única (mesmo contrato, empenho do ciclo e valor),
--    passa a LIQUIDADO quando todas as faturas do ciclo estão liquidadas e a PAGO quando todas têm OB válida;
--    OB cancelada devolve o ciclo pago pelo sistema a LIQUIDADO. Agendada nos minutos 29 e 59 (depois das
--    buscas de faturas, 20/22, e de ordens bancárias, 55/57).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Classificação do empenho
-- ------------------------------------------------------------------------------
ALTER TABLE public.empenhos
  ADD COLUMN IF NOT EXISTS natureza_despesa VARCHAR(6),
  ADD COLUMN IF NOT EXISTS natureza_despesa_descricao TEXT,
  ADD COLUMN IF NOT EXISTS plano_interno TEXT;

COMMENT ON COLUMN public.empenhos.natureza_despesa IS 'Natureza de despesa (6 dígitos) do Contratos.gov.br, ex.: 449052. Sem subelemento.';
COMMENT ON COLUMN public.empenhos.plano_interno IS 'Plano interno do Contratos.gov.br (mostra, por exemplo, quando o empenho é de emenda parlamentar).';

CREATE OR REPLACE FUNCTION public.gravar_classificacao_empenhos(p_itens JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item JSONB;
  v_nd TEXT;
  v_total INTEGER := 0;
  v_n INTEGER;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito.' USING ERRCODE = '42501';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a lista de empenhos.' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_nd := NULLIF(TRIM(COALESCE(v_item->>'natureza_despesa', '')), '');
    UPDATE public.empenhos
       SET natureza_despesa = COALESCE(substring(v_nd FROM '^\s*(\d{6})'), natureza_despesa),
           natureza_despesa_descricao = COALESCE(NULLIF(TRIM(substring(v_nd FROM '^\s*\d{6}\s*-\s*(.*)$')), ''), natureza_despesa_descricao),
           plano_interno = COALESCE(NULLIF(TRIM(COALESCE(v_item->>'plano_interno', '')), ''), plano_interno)
     WHERE id = NULLIF(v_item->>'empenho_id', '')::UUID
       AND (v_nd IS NOT NULL OR NULLIF(TRIM(COALESCE(v_item->>'plano_interno', '')), '') IS NOT NULL);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END LOOP;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_classificacao_empenhos(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gravar_classificacao_empenhos(JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2) Ciclo: colunas, situações e tabelas novas
-- ------------------------------------------------------------------------------
ALTER TABLE public.contract_payment_cycles
  ADD COLUMN IF NOT EXISTS data_liquidacao DATE,
  ADD COLUMN IF NOT EXISTS numero_np VARCHAR(60),
  ADD COLUMN IF NOT EXISTS colog_enviado_em DATE,
  ADD COLUMN IF NOT EXISTS colog_sei VARCHAR(100),
  ADD COLUMN IF NOT EXISTS liquidacao_prorrogada BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.contract_payment_cycles.data_liquidacao IS 'Liquidação no SIAFI (lida da fatura pela conciliação). Fim do prazo de liquidação (IN 77 art. 7º, I).';
COMMENT ON COLUMN public.contract_payment_cycles.colog_enviado_em IS 'Envio à COLOG (bens a incorporar, Portaria DGFNSP 50/2025 art. 5º § 5º).';

ALTER TABLE public.contract_payment_cycles DROP CONSTRAINT IF EXISTS contract_payment_cycles_status_check;
ALTER TABLE public.contract_payment_cycles
  ADD CONSTRAINT contract_payment_cycles_status_check
  CHECK (status IN ('RECEBIDO', 'COM_PENDENCIA', 'CONFERIDO', 'ENVIADO_CGOFI', 'DEVOLVIDO', 'LIQUIDADO', 'PAGO', 'CANCELADO'));

ALTER TABLE public.contract_payment_cycle_events DROP CONSTRAINT IF EXISTS contract_payment_cycle_events_tipo_check;
ALTER TABLE public.contract_payment_cycle_events
  ADD CONSTRAINT contract_payment_cycle_events_tipo_check
  CHECK (tipo IN (
    'RECEBIDO', 'CONFERIDO', 'PENDENCIA', 'RETORNO', 'ENVIADO_CGOFI', 'DEVOLVIDO', 'LIQUIDADO', 'PAGO', 'OB_CANCELADA',
    'CANCELADO', 'PRAZO_ALONGADO', 'PRORROGACAO_LIQUIDACAO', 'ENVIADO_COLOG', 'FATURA_VINCULADA'
  ));

ALTER TABLE public.contract_payment_cycle_events
  ADD COLUMN IF NOT EXISTS automatico BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN public.contract_payment_cycle_events.automatico IS 'Registrado pela conciliação do sistema (liquidação, OB, fatura ligada sozinha).';

-- Itens "DO PAGAMENTO" (Portaria 50, Anexo II)
CREATE TABLE IF NOT EXISTS public.contract_payment_cycle_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.contract_payment_cycles(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 1,
  nota_fiscal VARCHAR(60) NOT NULL,
  nota_fiscal_sei VARCHAR(100),
  atesto_sei VARCHAR(100) NOT NULL,
  empenho_canonical_key VARCHAR(150) NOT NULL,
  subelemento VARCHAR(8),
  valor_bruto NUMERIC(18, 2) NOT NULL CHECK (valor_bruto >= 0),
  juros_multa NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (juros_multa >= 0),
  glosa NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (glosa >= 0),
  desconto NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  valor_a_pagar NUMERIC(18, 2) GENERATED ALWAYS AS (valor_bruto + juros_multa - glosa - desconto) STORED,
  justificativa_juros TEXT,
  CONSTRAINT contract_payment_cycle_itens_juros_justificados CHECK (juros_multa = 0 OR NULLIF(TRIM(COALESCE(justificativa_juros, '')), '') IS NOT NULL),
  CONSTRAINT contract_payment_cycle_itens_a_pagar_positivo CHECK (valor_bruto + juros_multa - glosa - desconto >= 0),
  CONSTRAINT contract_payment_cycle_itens_subelemento_formato CHECK (subelemento IS NULL OR subelemento ~ '^\d{2}$' OR subelemento ~ '^\d{8}$')
);
CREATE INDEX IF NOT EXISTS idx_payment_cycle_itens_cycle ON public.contract_payment_cycle_itens (cycle_id, ordem);

-- Checklist da conferência (Portaria 50, Anexo I)
CREATE TABLE IF NOT EXISTS public.contract_payment_cycle_checklist (
  cycle_id UUID NOT NULL REFERENCES public.contract_payment_cycles(id) ON DELETE CASCADE,
  item VARCHAR(40) NOT NULL,
  resposta VARCHAR(3) NOT NULL CHECK (resposta IN ('SIM', 'NAO', 'NA')),
  sei VARCHAR(100),
  conferido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  conferido_por UUID DEFAULT auth.uid(),
  conferido_por_nome VARCHAR(150),
  PRIMARY KEY (cycle_id, item)
);

-- Faturas do Contratos.gov.br pagas pelo ciclo (uma fatura, um ciclo em aberto ou pago)
CREATE TABLE IF NOT EXISTS public.contract_payment_cycle_faturas (
  cycle_id UUID NOT NULL REFERENCES public.contract_payment_cycles(id) ON DELETE CASCADE,
  id_fatura BIGINT NOT NULL REFERENCES public.contrato_faturas(id_fatura) ON DELETE CASCADE,
  vinculado_por VARCHAR(10) NOT NULL DEFAULT 'USUARIO' CHECK (vinculado_por IN ('USUARIO', 'SISTEMA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cycle_id, id_fatura)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_cycle_faturas_fatura ON public.contract_payment_cycle_faturas (id_fatura);

-- Leitura para quem lê os ciclos; escrita só pelas RPCs.
DO $$
DECLARE v_tabela TEXT;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY['contract_payment_cycle_itens', 'contract_payment_cycle_checklist', 'contract_payment_cycle_faturas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabela);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated Read: ' || v_tabela, v_tabela);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_role(''leitor'') OR public.has_role(''gestor'') OR public.has_role(''admin''))',
      'Authenticated Read: ' || v_tabela, v_tabela
    );
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM PUBLIC, anon, authenticated', v_tabela);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_tabela);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_audit_' || v_tabela, v_tabela);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture()',
      'trg_audit_' || v_tabela, v_tabela);
  END LOOP;
END;
$$;

-- Itens do checklist do Anexo I (a ordem é a da Portaria).
CREATE OR REPLACE FUNCTION public.itens_checklist_pagamento()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'CONTRATO_VIGENTE', 'NOTA_EMPENHO', 'PORTARIA_FISCAIS', 'RECEBIMENTO_PROVISORIO', 'RECEBIMENTO_DEFINITIVO',
    'SIMPLES_NACIONAL', 'NOTA_FISCAL', 'ATESTO', 'RELATORIO_ACOMPANHAMENTO', 'RELATORIO_ANS', 'GPS', 'GRF',
    'CNDT', 'SICAF', 'CADIN', 'CEIS'
  ]::TEXT[];
$$;

-- ------------------------------------------------------------------------------
-- 3) Abrir ciclo
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_payment_cycle_atomic(
  VARCHAR, VARCHAR, DATE, DATE, NUMERIC, JSONB, DATE, DATE, TEXT, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, VARCHAR, BOOLEAN
);

CREATE OR REPLACE FUNCTION public.create_payment_cycle_atomic(
  p_contract_key VARCHAR(150),
  p_data_assinatura_atesto DATE,
  p_data_recebimento DATE,
  p_data_vencimento_fatura DATE,
  p_numero_processo_pagamento_sei VARCHAR(50),
  p_itens JSONB,
  p_prazo_conferencia_ate DATE DEFAULT NULL,
  p_prazo_padrao DATE DEFAULT NULL,
  p_justificativa_prazo TEXT DEFAULT NULL,
  p_responsavel_nome VARCHAR(150) DEFAULT NULL,
  p_responsavel_user_id UUID DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL,
  p_registrado_por_nome VARCHAR(150) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(150) := TRIM(COALESCE(p_contract_key, ''));
  v_processo VARCHAR(50) := NULLIF(TRIM(COALESCE(p_numero_processo_pagamento_sei, '')), '');
  v_competencia VARCHAR(7);
  v_item JSONB;
  v_ordem INTEGER := 0;
  v_atesto_sei VARCHAR(100);
  v_empenho VARCHAR(150);
  v_total NUMERIC(18, 2) := 0;
  v_cycle_key VARCHAR(180);
  v_record RECORD;
  v_justificativa TEXT := NULLIF(TRIM(COALESCE(p_justificativa_prazo, '')), '');
  v_nome VARCHAR(150) := NULLIF(TRIM(COALESCE(p_registrado_por_nome, '')), '');
  v_alongado BOOLEAN := FALSE;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores.' USING ERRCODE = '42501';
  END IF;
  IF v_contract_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha o contrato.' USING ERRCODE = '22023';
  END IF;
  IF p_data_assinatura_atesto IS NULL OR p_data_recebimento IS NULL OR p_data_vencimento_fatura IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data do atesto, a chegada à CGLIC e o vencimento são obrigatórios.' USING ERRCODE = '22023';
  END IF;
  IF p_data_recebimento < p_data_assinatura_atesto THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A chegada à CGLIC não pode ser anterior ao atesto.' USING ERRCODE = '22023';
  END IF;
  IF v_processo IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o processo SEI de pagamento (um processo por pagamento, Portaria 50 art. 5º § 1º).' USING ERRCODE = '22023';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe ao menos uma nota fiscal no item "DO PAGAMENTO".' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_itens) > 50 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: No máximo 50 notas fiscais por ciclo.' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    IF NULLIF(TRIM(COALESCE(v_item->>'nota_fiscal', '')), '') IS NULL
       OR NULLIF(TRIM(COALESCE(v_item->>'atesto_sei', '')), '') IS NULL
       OR NULLIF(TRIM(COALESCE(v_item->>'empenho_canonical_key', '')), '') IS NULL
       OR NULLIF(v_item->>'valor_bruto', '') IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Cada nota fiscal precisa do número, do SEI do atesto, do empenho e do valor bruto.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(NULLIF(v_item->>'juros_multa', '')::NUMERIC, 0) > 0 AND NULLIF(TRIM(COALESCE(v_item->>'justificativa_juros', '')), '') IS NULL THEN
      RAISE EXCEPTION 'JUROS_JUSTIFICATIVA_REQUIRED: Pagamento com juros ou multa exige justificativa (Portaria 50 art. 5º § 7º).' USING ERRCODE = '22023';
    END IF;
    v_atesto_sei := COALESCE(v_atesto_sei, TRIM(v_item->>'atesto_sei'));
    v_empenho := COALESCE(v_empenho, TRIM(v_item->>'empenho_canonical_key'));
    v_total := v_total + (v_item->>'valor_bruto')::NUMERIC + COALESCE(NULLIF(v_item->>'juros_multa', '')::NUMERIC, 0)
             - COALESCE(NULLIF(v_item->>'glosa', '')::NUMERIC, 0) - COALESCE(NULLIF(v_item->>'desconto', '')::NUMERIC, 0);
  END LOOP;

  IF p_prazo_conferencia_ate IS NOT NULL THEN
    IF p_prazo_conferencia_ate < p_data_recebimento THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O prazo de conferência não pode ser anterior à chegada.' USING ERRCODE = '22023';
    END IF;
    v_alongado := p_prazo_padrao IS NOT NULL AND p_prazo_conferencia_ate > p_prazo_padrao;
    IF v_alongado AND v_justificativa IS NULL THEN
      RAISE EXCEPTION 'PRAZO_JUSTIFICATIVA_REQUIRED: Prazo além do padrão exige justificativa.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- O processo SEI de pagamento entra no cadastro de processos se ainda não estiver lá.
  INSERT INTO public.processos_sei (id, numero_processo_sei, descricao_objeto)
  VALUES (v_processo, v_processo, 'Processo de pagamento')
  ON CONFLICT (numero_processo_sei) DO NOTHING;

  v_competencia := to_char(p_data_assinatura_atesto, 'YYYY-MM');
  v_cycle_key := public.build_payment_cycle_key(v_contract_key, v_competencia, v_atesto_sei);
  IF EXISTS (SELECT 1 FROM public.contract_payment_cycles WHERE cycle_key = v_cycle_key) THEN
    RAISE EXCEPTION 'PAYMENT_CYCLE_ALREADY_EXISTS: Já existe um ciclo deste contrato com este atesto ("%").', v_cycle_key USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.contract_payment_cycles (
    cycle_key, contract_key, competencia, empenho_canonical_key, numero_processo_pagamento_sei,
    documento_atesto_sei, numero_notas_fiscais, valor_atesto,
    data_assinatura_atesto, data_recebimento, data_vencimento_fatura, prazo_conferencia_ate,
    responsavel_nome, responsavel_user_id, observacoes, origem_dado, status
  ) VALUES (
    v_cycle_key, v_contract_key, v_competencia, v_empenho, v_processo,
    v_atesto_sei, jsonb_array_length(p_itens), v_total,
    p_data_assinatura_atesto, p_data_recebimento, p_data_vencimento_fatura, p_prazo_conferencia_ate,
    NULLIF(TRIM(COALESCE(p_responsavel_nome, '')), ''), p_responsavel_user_id, NULLIF(TRIM(COALESCE(p_observacoes, '')), ''), 'MANUAL', 'RECEBIDO'
  )
  RETURNING * INTO v_record;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_ordem := v_ordem + 1;
    INSERT INTO public.contract_payment_cycle_itens (
      cycle_id, ordem, nota_fiscal, nota_fiscal_sei, atesto_sei, empenho_canonical_key, subelemento,
      valor_bruto, juros_multa, glosa, desconto, justificativa_juros
    ) VALUES (
      v_record.id, v_ordem, TRIM(v_item->>'nota_fiscal'), NULLIF(TRIM(COALESCE(v_item->>'nota_fiscal_sei', '')), ''),
      TRIM(v_item->>'atesto_sei'), TRIM(v_item->>'empenho_canonical_key'), NULLIF(TRIM(COALESCE(v_item->>'subelemento', '')), ''),
      (v_item->>'valor_bruto')::NUMERIC, COALESCE(NULLIF(v_item->>'juros_multa', '')::NUMERIC, 0),
      COALESCE(NULLIF(v_item->>'glosa', '')::NUMERIC, 0), COALESCE(NULLIF(v_item->>'desconto', '')::NUMERIC, 0),
      NULLIF(TRIM(COALESCE(v_item->>'justificativa_juros', '')), '')
    );
    -- Os documentos do ciclo continuam sendo a NF e o atesto de cada item.
    INSERT INTO public.contract_payment_cycle_documents (cycle_id, tipo, numero, sei, valor, data_recebimento)
    VALUES (v_record.id, 'Termo de Atesto', NULL, TRIM(v_item->>'atesto_sei'), NULL, p_data_recebimento);
    IF NULLIF(TRIM(COALESCE(v_item->>'nota_fiscal_sei', '')), '') IS NOT NULL THEN
      INSERT INTO public.contract_payment_cycle_documents (cycle_id, tipo, numero, sei, valor, data_recebimento)
      VALUES (v_record.id, 'Nota Fiscal Eletrônica', TRIM(v_item->>'nota_fiscal'), TRIM(v_item->>'nota_fiscal_sei'),
              (v_item->>'valor_bruto')::NUMERIC, p_data_recebimento);
    END IF;
  END LOOP;

  INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, sei, registrado_por_nome)
  VALUES (v_record.id, 'RECEBIDO', p_data_recebimento, v_atesto_sei, v_nome);

  IF v_alongado THEN
    INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, prazo_anterior, prazo_novo, justificativa, registrado_por_nome)
    VALUES (v_record.id, 'PRAZO_ALONGADO', p_data_recebimento, p_prazo_padrao, p_prazo_conferencia_ate, v_justificativa, v_nome);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_record.id, 'cycle_key', v_record.cycle_key, 'contract_key', v_record.contract_key,
      'competencia', v_record.competencia, 'status', v_record.status, 'valor_atesto', v_record.valor_atesto,
      'criado_em', v_record.criado_em
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_cycle_atomic(
  VARCHAR, DATE, DATE, DATE, VARCHAR, JSONB, DATE, DATE, TEXT, VARCHAR, UUID, TEXT, VARCHAR
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payment_cycle_atomic(
  VARCHAR, DATE, DATE, DATE, VARCHAR, JSONB, DATE, DATE, TEXT, VARCHAR, UUID, TEXT, VARCHAR
) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4) Marcos do ciclo
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_payment_cycle_marco_atomic(
  VARCHAR, VARCHAR, DATE, VARCHAR, VARCHAR, TEXT, VARCHAR, DATE, DATE, TEXT, VARCHAR, BOOLEAN
);

CREATE OR REPLACE FUNCTION public.register_payment_cycle_marco_atomic(
  p_cycle_key VARCHAR(180),
  p_marco VARCHAR(30),
  p_data DATE,
  p_sei VARCHAR(100) DEFAULT NULL,
  p_numero_ob VARCHAR(60) DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL,
  p_origem_pendencia VARCHAR(12) DEFAULT NULL,
  p_prazo_novo DATE DEFAULT NULL,
  p_prazo_padrao DATE DEFAULT NULL,
  p_justificativa TEXT DEFAULT NULL,
  p_registrado_por_nome VARCHAR(150) DEFAULT NULL,
  p_checklist JSONB DEFAULT NULL,
  p_faturas BIGINT[] DEFAULT NULL,
  p_enviar_colog BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cycle_key VARCHAR(180) := TRIM(COALESCE(p_cycle_key, ''));
  v_marco VARCHAR(30) := TRIM(COALESCE(p_marco, ''));
  v_cycle RECORD;
  v_record RECORD;
  v_sei VARCHAR(100) := NULLIF(TRIM(COALESCE(p_sei, '')), '');
  v_ob VARCHAR(60) := NULLIF(TRIM(COALESCE(p_numero_ob, '')), '');
  v_motivo TEXT := NULLIF(TRIM(COALESCE(p_motivo, '')), '');
  v_justificativa TEXT := NULLIF(TRIM(COALESCE(p_justificativa, '')), '');
  v_nome VARCHAR(150) := NULLIF(TRIM(COALESCE(p_registrado_por_nome, '')), '');
  v_prazo_anterior DATE;
  v_alongado BOOLEAN := FALSE;
  v_item JSONB;
  v_respostas INTEGER;
  v_nao INTEGER;
  v_fatura BIGINT;
  v_soma_faturas NUMERIC(18, 2);
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores.' USING ERRCODE = '42501';
  END IF;
  IF v_marco NOT IN ('CONFERIDO', 'PENDENCIA', 'RETORNO', 'ENVIADO_CGOFI', 'DEVOLVIDO', 'PAGO', 'CANCELADO',
                     'ENVIADO_COLOG', 'PRORROGACAO_LIQUIDACAO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Marco inválido ("%").', v_marco USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data do marco é obrigatória.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cycle FROM public.contract_payment_cycles WHERE cycle_key = v_cycle_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_CYCLE_NOT_FOUND: Ciclo de pagamento "%" não encontrado.', v_cycle_key USING ERRCODE = 'P0002';
  END IF;
  IF v_cycle.status = 'CANCELADO' OR (v_cycle.status = 'PAGO' AND v_marco <> 'ENVIADO_COLOG') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: O ciclo já está encerrado (%).', v_cycle.status USING ERRCODE = '22023';
  END IF;
  IF p_data < v_cycle.data_recebimento THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data do marco não pode ser anterior à chegada à CGLIC (%).', v_cycle.data_recebimento USING ERRCODE = '22023';
  END IF;

  IF p_prazo_novo IS NOT NULL THEN
    IF p_prazo_novo < p_data THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O prazo novo não pode ser anterior à data do marco.' USING ERRCODE = '22023';
    END IF;
    v_alongado := p_prazo_padrao IS NOT NULL AND p_prazo_novo > p_prazo_padrao;
    IF v_alongado AND v_marco IN ('CONFERIDO', 'ENVIADO_CGOFI', 'RETORNO') AND v_justificativa IS NULL THEN
      RAISE EXCEPTION 'PRAZO_JUSTIFICATIVA_REQUIRED: Prazo além do padrão exige justificativa.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Checklist do Anexo I: gravado na conferência e na devolução (o "Não" fica registrado).
  IF p_checklist IS NOT NULL THEN
    IF v_marco NOT IN ('CONFERIDO', 'PENDENCIA') OR jsonb_typeof(p_checklist) <> 'array' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O checklist só se registra na conferência ou na devolução.' USING ERRCODE = '22023';
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_checklist) LOOP
      IF NOT (v_item->>'item' = ANY (public.itens_checklist_pagamento())) OR COALESCE(v_item->>'resposta', '') NOT IN ('SIM', 'NAO', 'NA') THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Item do checklist inválido (%).', v_item USING ERRCODE = '22023';
      END IF;
    END LOOP;
    INSERT INTO public.contract_payment_cycle_checklist (cycle_id, item, resposta, sei, conferido_por_nome)
    SELECT v_cycle.id, i->>'item', i->>'resposta', NULLIF(TRIM(COALESCE(i->>'sei', '')), ''), v_nome
      FROM jsonb_array_elements(p_checklist) i
    ON CONFLICT (cycle_id, item) DO UPDATE
      SET resposta = EXCLUDED.resposta, sei = EXCLUDED.sei, conferido_em = NOW(),
          conferido_por = auth.uid(), conferido_por_nome = EXCLUDED.conferido_por_nome;
  END IF;

  IF v_marco = 'CONFERIDO' THEN
    IF v_cycle.status NOT IN ('RECEBIDO', 'COM_PENDENCIA', 'DEVOLVIDO') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Só é possível conferir um ciclo em conferência (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
    END IF;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE resposta = 'NAO') INTO v_respostas, v_nao
      FROM public.contract_payment_cycle_checklist
     WHERE cycle_id = v_cycle.id AND item = ANY (public.itens_checklist_pagamento());
    IF v_respostas < array_length(public.itens_checklist_pagamento(), 1) THEN
      RAISE EXCEPTION 'CHECKLIST_INCOMPLETO: Responda todos os itens do checklist (Portaria 50, Anexo I).' USING ERRCODE = '22023';
    END IF;
    IF v_nao > 0 THEN
      RAISE EXCEPTION 'CHECKLIST_COM_NAO: Há item do checklist marcado "Não": devolva o processo em vez de concluir a conferência.' USING ERRCODE = '22023';
    END IF;
    v_prazo_anterior := v_cycle.prazo_envio_ate;
    UPDATE public.contract_payment_cycles
       SET status = 'CONFERIDO', data_conferencia = p_data, prazo_envio_ate = p_prazo_novo, atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;

  ELSIF v_marco = 'PENDENCIA' THEN
    IF v_cycle.status NOT IN ('RECEBIDO', 'COM_PENDENCIA', 'DEVOLVIDO') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: A devolução só se registra durante a conferência (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
    END IF;
    IF v_motivo IS NULL OR COALESCE(p_origem_pendencia, '') NOT IN ('FORNECEDOR', 'FISCAL') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A devolução exige o motivo e a quem foi devolvido (contratado ou área).' USING ERRCODE = '22023';
    END IF;
    UPDATE public.contract_payment_cycles
       SET status = 'COM_PENDENCIA', atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;

  ELSIF v_marco = 'RETORNO' THEN
    IF v_cycle.status <> 'COM_PENDENCIA' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Só um processo devolvido pode ser recebido de volta (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
    END IF;
    IF p_prazo_novo IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o novo prazo de conferência.' USING ERRCODE = '22023';
    END IF;
    v_prazo_anterior := v_cycle.prazo_conferencia_ate;
    UPDATE public.contract_payment_cycles
       SET status = 'RECEBIDO', prazo_conferencia_ate = p_prazo_novo, atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;

  ELSIF v_marco = 'ENVIADO_CGOFI' THEN
    IF v_cycle.status <> 'CONFERIDO' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: O envio à CGOFI exige o ciclo conferido (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
    END IF;
    IF v_sei IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número do SEI do despacho.' USING ERRCODE = '22023';
    END IF;
    IF v_cycle.data_conferencia IS NOT NULL AND p_data < v_cycle.data_conferencia THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O envio não pode ser anterior à conferência (%).', v_cycle.data_conferencia USING ERRCODE = '22023';
    END IF;
    IF p_faturas IS NOT NULL AND array_length(p_faturas, 1) > 0 THEN
      FOREACH v_fatura IN ARRAY p_faturas LOOP
        IF NOT EXISTS (SELECT 1 FROM public.contrato_faturas WHERE id_fatura = v_fatura AND contract_key = v_cycle.contract_key AND NOT cancelada) THEN
          RAISE EXCEPTION 'INVALID_PAYLOAD: A fatura % não é deste contrato ou está cancelada.', v_fatura USING ERRCODE = '22023';
        END IF;
        IF EXISTS (SELECT 1 FROM public.contract_payment_cycle_faturas WHERE id_fatura = v_fatura AND cycle_id <> v_cycle.id) THEN
          RAISE EXCEPTION 'FATURA_EM_OUTRO_CICLO: A fatura % já está em outro ciclo de pagamento.', v_fatura USING ERRCODE = '23505';
        END IF;
      END LOOP;
      SELECT COALESCE(SUM(valor_liquido), 0) INTO v_soma_faturas FROM public.contrato_faturas WHERE id_fatura = ANY (p_faturas);
      IF abs(v_soma_faturas - v_cycle.valor_atesto) >= 0.01 AND v_justificativa IS NULL THEN
        RAISE EXCEPTION 'VALOR_DIVERGENTE: As faturas somam % e o ciclo % : justifique a diferença.', v_soma_faturas, v_cycle.valor_atesto USING ERRCODE = '22023';
      END IF;
      DELETE FROM public.contract_payment_cycle_faturas WHERE cycle_id = v_cycle.id;
      INSERT INTO public.contract_payment_cycle_faturas (cycle_id, id_fatura, vinculado_por)
      SELECT v_cycle.id, f, 'USUARIO' FROM unnest(p_faturas) f;
    END IF;
    v_prazo_anterior := v_cycle.cobrar_cgofi_ate;
    UPDATE public.contract_payment_cycles
       SET status = 'ENVIADO_CGOFI', documento_despacho_sei = v_sei, data_envio_cgofi = p_data, cobrar_cgofi_ate = p_prazo_novo,
           colog_enviado_em = CASE WHEN COALESCE(p_enviar_colog, FALSE) THEN p_data ELSE colog_enviado_em END,
           colog_sei = CASE WHEN COALESCE(p_enviar_colog, FALSE) THEN v_sei ELSE colog_sei END,
           atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;

  ELSIF v_marco = 'DEVOLVIDO' THEN
    IF v_cycle.status NOT IN ('ENVIADO_CGOFI', 'LIQUIDADO') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Só um ciclo enviado à CGOFI pode ser devolvido (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
    END IF;
    IF v_motivo IS NULL OR p_prazo_novo IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A devolução exige o motivo e o novo prazo de conferência.' USING ERRCODE = '22023';
    END IF;
    v_prazo_anterior := v_cycle.prazo_conferencia_ate;
    UPDATE public.contract_payment_cycles
       SET status = 'DEVOLVIDO', documento_despacho_sei = NULL, data_envio_cgofi = NULL, data_conferencia = NULL,
           data_liquidacao = NULL, numero_np = NULL,
           prazo_conferencia_ate = p_prazo_novo, prazo_envio_ate = NULL, cobrar_cgofi_ate = NULL, atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;

  ELSIF v_marco = 'PAGO' THEN
    -- Lançamento à mão (a conciliação faz sozinha quando a fatura tem OB): a OB tem de existir no Tesouro,
    -- ou o lançamento precisa de justificativa.
    IF v_cycle.status NOT IN ('ENVIADO_CGOFI', 'LIQUIDADO') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: O pagamento só se confirma depois do envio à CGOFI (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
    END IF;
    IF v_ob IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número da ordem bancária.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ordens_bancarias WHERE numero = UPPER(v_ob) AND NOT cancelada) AND v_justificativa IS NULL THEN
      RAISE EXCEPTION 'OB_NAO_ENCONTRADA: A ordem bancária % não foi encontrada no Tesouro: confira o número ou justifique.', v_ob USING ERRCODE = '22023';
    END IF;
    UPDATE public.contract_payment_cycles
       SET status = 'PAGO', numero_ordem_bancaria = UPPER(v_ob), data_ordem_bancaria = p_data,
           concluido_em = NOW(), concluido_por = COALESCE(v_nome, responsavel_nome), atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;

  ELSIF v_marco = 'ENVIADO_COLOG' THEN
    IF v_cycle.status NOT IN ('ENVIADO_CGOFI', 'LIQUIDADO', 'PAGO') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: O envio à COLOG é feito junto ou depois do envio à CGOFI (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
    END IF;
    IF v_sei IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número do SEI do despacho à COLOG.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.contract_payment_cycles
       SET colog_enviado_em = p_data, colog_sei = v_sei, atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;

  ELSIF v_marco = 'PRORROGACAO_LIQUIDACAO' THEN
    IF v_cycle.status NOT IN ('RECEBIDO', 'COM_PENDENCIA', 'CONFERIDO', 'DEVOLVIDO', 'ENVIADO_CGOFI') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Só se prorroga a liquidação antes de ela acontecer (situação atual: %).', v_cycle.status USING ERRCODE = '22023';
    END IF;
    IF v_cycle.liquidacao_prorrogada THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: O prazo de liquidação já foi prorrogado uma vez (IN 77 art. 7º § 3º).' USING ERRCODE = '22023';
    END IF;
    IF v_justificativa IS NULL THEN
      RAISE EXCEPTION 'PRAZO_JUSTIFICATIVA_REQUIRED: A prorrogação exige justificativa (diligência).' USING ERRCODE = '22023';
    END IF;
    UPDATE public.contract_payment_cycles
       SET liquidacao_prorrogada = TRUE, atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;

  ELSE -- CANCELADO
    IF v_motivo IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O cancelamento exige o motivo.' USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.contract_payment_cycle_faturas WHERE cycle_id = v_cycle.id;
    UPDATE public.contract_payment_cycles
       SET status = 'CANCELADO', concluido_em = NOW(), concluido_por = COALESCE(v_nome, responsavel_nome), atualizado_em = NOW()
     WHERE id = v_cycle.id RETURNING * INTO v_record;
  END IF;

  INSERT INTO public.contract_payment_cycle_events (
    cycle_id, tipo, data_evento, sei, numero_ob, motivo, origem_pendencia, prazo_anterior, prazo_novo, justificativa,
    registrado_por_nome, regularidade_verificada
  ) VALUES (
    v_cycle.id, v_marco, p_data, v_sei, UPPER(v_ob), v_motivo, NULLIF(TRIM(COALESCE(p_origem_pendencia, '')), ''),
    v_prazo_anterior, p_prazo_novo, v_justificativa, v_nome,
    CASE WHEN v_marco = 'CONFERIDO' THEN TRUE ELSE NULL END
  );

  IF v_marco = 'ENVIADO_CGOFI' AND COALESCE(p_enviar_colog, FALSE) THEN
    INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, sei, registrado_por_nome)
    VALUES (v_cycle.id, 'ENVIADO_COLOG', p_data, v_sei, v_nome);
  END IF;

  IF v_alongado AND v_justificativa IS NOT NULL AND v_marco IN ('CONFERIDO', 'ENVIADO_CGOFI', 'RETORNO') THEN
    INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, prazo_anterior, prazo_novo, justificativa, registrado_por_nome)
    VALUES (v_cycle.id, 'PRAZO_ALONGADO', p_data, p_prazo_padrao, p_prazo_novo, v_justificativa, v_nome);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cycle', jsonb_build_object(
      'id', v_record.id, 'cycle_key', v_record.cycle_key, 'status', v_record.status,
      'data_conferencia', v_record.data_conferencia, 'data_envio_cgofi', v_record.data_envio_cgofi,
      'documento_despacho_sei', v_record.documento_despacho_sei,
      'numero_ordem_bancaria', v_record.numero_ordem_bancaria, 'data_ordem_bancaria', v_record.data_ordem_bancaria,
      'prazo_conferencia_ate', v_record.prazo_conferencia_ate, 'prazo_envio_ate', v_record.prazo_envio_ate,
      'cobrar_cgofi_ate', v_record.cobrar_cgofi_ate, 'colog_enviado_em', v_record.colog_enviado_em,
      'atualizado_em', v_record.atualizado_em
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_payment_cycle_marco_atomic(
  VARCHAR, VARCHAR, DATE, VARCHAR, VARCHAR, TEXT, VARCHAR, DATE, DATE, TEXT, VARCHAR, JSONB, BIGINT[], BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_payment_cycle_marco_atomic(
  VARCHAR, VARCHAR, DATE, VARCHAR, VARCHAR, TEXT, VARCHAR, DATE, DATE, TEXT, VARCHAR, JSONB, BIGINT[], BOOLEAN
) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5) Conciliação: fatura → liquidação → ordem bancária
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conciliar_ciclos_pagamento()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_sistema CONSTANT VARCHAR(150) := 'Sistema · conciliação';
  v_cycle RECORD;
  v_candidatas BIGINT[];
  v_ligadas INTEGER := 0;
  v_liquidados INTEGER := 0;
  v_pagos INTEGER := 0;
  v_desfeitos INTEGER := 0;
  v_info RECORD;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor') OR public.has_role('admin') OR session_user IN ('postgres', 'supabase_admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito.' USING ERRCODE = '42501';
  END IF;

  -- a) Ciclo enviado sem fatura: liga a única fatura do contrato, não cancelada e sem ciclo, que cite um empenho
  --    do ciclo e tenha o valor do ciclo. Mais de uma candidata: a equipe escolhe na tela.
  FOR v_cycle IN
    SELECT c.* FROM public.contract_payment_cycles c
     WHERE c.status IN ('ENVIADO_CGOFI', 'LIQUIDADO')
       AND NOT EXISTS (SELECT 1 FROM public.contract_payment_cycle_faturas cf WHERE cf.cycle_id = c.id)
     FOR UPDATE
  LOOP
    SELECT array_agg(DISTINCT f.id_fatura) INTO v_candidatas
      FROM public.contrato_faturas f
      JOIN public.fatura_empenhos fe ON fe.id_fatura = f.id_fatura
      JOIN public.empenhos e ON e.identificador_fonte = fe.id_empenho_gov
     WHERE f.contract_key = v_cycle.contract_key
       AND NOT f.cancelada
       AND abs(f.valor_liquido - v_cycle.valor_atesto) < 0.01
       AND NOT EXISTS (SELECT 1 FROM public.contract_payment_cycle_faturas x WHERE x.id_fatura = f.id_fatura)
       AND e.canonical_key IN (
         SELECT i.empenho_canonical_key FROM public.contract_payment_cycle_itens i WHERE i.cycle_id = v_cycle.id
         UNION SELECT v_cycle.empenho_canonical_key WHERE v_cycle.empenho_canonical_key IS NOT NULL
       );
    IF array_length(v_candidatas, 1) = 1 THEN
      INSERT INTO public.contract_payment_cycle_faturas (cycle_id, id_fatura, vinculado_por) VALUES (v_cycle.id, v_candidatas[1], 'SISTEMA');
      INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, motivo, registrado_por_nome, automatico)
      VALUES (v_cycle.id, 'FATURA_VINCULADA', CURRENT_DATE,
              'Fatura ' || (SELECT COALESCE(numero, id_fatura::TEXT) FROM public.contrato_faturas WHERE id_fatura = v_candidatas[1])
              || ' ligada pelo empenho e pelo valor.', c_sistema, TRUE);
      v_ligadas := v_ligadas + 1;
    END IF;
  END LOOP;

  -- b) e c) Situação das faturas de cada ciclo em andamento.
  FOR v_cycle IN
    SELECT c.* FROM public.contract_payment_cycles c
     WHERE c.status IN ('ENVIADO_CGOFI', 'LIQUIDADO', 'PAGO')
       AND EXISTS (SELECT 1 FROM public.contract_payment_cycle_faturas cf WHERE cf.cycle_id = c.id)
     FOR UPDATE
  LOOP
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE vf.data_liquidacao IS NOT NULL) AS liquidadas,
           COUNT(*) FILTER (WHERE vf.paga) AS pagas,
           MAX(vf.data_liquidacao) AS data_liquidacao,
           string_agg(DISTINCT vf.np, ', ') AS nps,
           string_agg(DISTINCT vf.ordens_bancarias, ', ') AS obs,
           MAX(vf.ob_emissao) AS ob_emissao
      INTO v_info
      FROM public.contract_payment_cycle_faturas cf
      JOIN public.v_contrato_faturas vf ON vf.id_fatura = cf.id_fatura
     WHERE cf.cycle_id = v_cycle.id AND NOT vf.cancelada;

    IF v_info.total = 0 THEN
      CONTINUE;
    END IF;

    IF v_cycle.status <> 'PAGO' AND v_info.pagas = v_info.total THEN
      UPDATE public.contract_payment_cycles
         SET status = 'PAGO', data_liquidacao = COALESCE(data_liquidacao, v_info.data_liquidacao), numero_np = COALESCE(numero_np, v_info.nps),
             numero_ordem_bancaria = v_info.obs, data_ordem_bancaria = COALESCE(v_info.ob_emissao, CURRENT_DATE),
             concluido_em = NOW(), concluido_por = c_sistema, atualizado_em = NOW()
       WHERE id = v_cycle.id;
      IF v_cycle.status = 'ENVIADO_CGOFI' AND v_info.data_liquidacao IS NOT NULL THEN
        INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, motivo, registrado_por_nome, automatico)
        VALUES (v_cycle.id, 'LIQUIDADO', v_info.data_liquidacao, 'NP ' || COALESCE(v_info.nps, '—'), c_sistema, TRUE);
      END IF;
      INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, numero_ob, registrado_por_nome, automatico)
      VALUES (v_cycle.id, 'PAGO', COALESCE(v_info.ob_emissao, CURRENT_DATE), v_info.obs, c_sistema, TRUE);
      v_pagos := v_pagos + 1;

    ELSIF v_cycle.status = 'ENVIADO_CGOFI' AND v_info.liquidadas = v_info.total THEN
      UPDATE public.contract_payment_cycles
         SET status = 'LIQUIDADO', data_liquidacao = v_info.data_liquidacao, numero_np = v_info.nps, atualizado_em = NOW()
       WHERE id = v_cycle.id;
      INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, motivo, registrado_por_nome, automatico)
      VALUES (v_cycle.id, 'LIQUIDADO', v_info.data_liquidacao, 'NP ' || COALESCE(v_info.nps, '—'), c_sistema, TRUE);
      v_liquidados := v_liquidados + 1;

    ELSIF v_cycle.status = 'PAGO' AND v_cycle.concluido_por = c_sistema AND v_info.pagas < v_info.total THEN
      -- OB cancelada no Tesouro: o pagamento que o sistema registrou é desfeito e o ciclo volta a esperar a OB.
      UPDATE public.contract_payment_cycles
         SET status = 'LIQUIDADO', numero_ordem_bancaria = NULL, data_ordem_bancaria = NULL,
             concluido_em = NULL, concluido_por = NULL, atualizado_em = NOW()
       WHERE id = v_cycle.id;
      INSERT INTO public.contract_payment_cycle_events (cycle_id, tipo, data_evento, numero_ob, motivo, registrado_por_nome, automatico)
      VALUES (v_cycle.id, 'OB_CANCELADA', CURRENT_DATE, v_cycle.numero_ordem_bancaria,
              'A ordem bancária deixou de ser válida no Tesouro; o ciclo voltou a aguardar o pagamento.', c_sistema, TRUE);
      v_desfeitos := v_desfeitos + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('faturas_ligadas', v_ligadas, 'liquidados', v_liquidados, 'pagos', v_pagos, 'ob_canceladas', v_desfeitos);
END;
$$;

REVOKE ALL ON FUNCTION public.conciliar_ciclos_pagamento() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conciliar_ciclos_pagamento() TO authenticated, service_role;

-- Depois das faturas (20/22) e das ordens bancárias (55/57).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'conciliar-ciclos-pagamento';
    PERFORM cron.schedule('conciliar-ciclos-pagamento', '29,59 * * * *', 'SELECT public.conciliar_ciclos_pagamento()');
  END IF;
END;
$$;
