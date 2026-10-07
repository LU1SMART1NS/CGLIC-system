-- ==============================================================================
-- MIGRATION 89: EXPECTATIVA DE PAGAMENTO DO CONTRATO (FASE A DA PREVISÃO MENSAL)
-- Versão: 20261007000089_expectativa_pagamento_contrato.sql
--
-- Cada contrato diz como se espera pagá-lo:
--   MENSAL   serviço contínuo: uma nota por mês (valor = média dos 3 últimos pagamentos, ou o valor mensal informado);
--   ENTREGA  bens / ordens de fornecimento: as entregas previstas que o gestor cadastra (data, valor, empenho);
--   EVENTUAL sob demanda, sem calendário.
-- Sem linha = automático (o sistema sugere pela regra: pago nos 3 últimos meses = mensal).
-- Usada pela previsão mensal da Portaria DGFNSP 50/2025 (art. 5º, § 2º, III) e, depois, pelos avisos de nota mensal
-- que não chegou e de entrega prevista sem nota. Leitura para logados; escrita só pelas RPCs (coordenador e gestor).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.contrato_expectativa_pagamento (
  contract_key VARCHAR(150) PRIMARY KEY,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('MENSAL', 'ENTREGA', 'EVENTUAL')),
  valor_mensal NUMERIC(18, 2) CHECK (valor_mensal IS NULL OR valor_mensal > 0),
  observacao TEXT,
  atualizado_por UUID DEFAULT auth.uid(),
  atualizado_por_nome VARCHAR(150),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contrato_expectativa_valor_so_mensal CHECK (valor_mensal IS NULL OR tipo = 'MENSAL')
);

CREATE TABLE IF NOT EXISTS public.contrato_entregas_previstas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_key VARCHAR(150) NOT NULL,
  data_prevista DATE NOT NULL,
  valor NUMERIC(18, 2) NOT NULL CHECK (valor > 0),
  empenho_canonical_key VARCHAR(150),
  descricao TEXT NOT NULL CHECK (length(trim(descricao)) > 0),
  situacao VARCHAR(10) NOT NULL DEFAULT 'PREVISTA' CHECK (situacao IN ('PREVISTA', 'CANCELADA')),
  motivo_cancelamento TEXT,
  criado_por UUID DEFAULT auth.uid(),
  criado_por_nome VARCHAR(150),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_entregas_previstas_contrato ON public.contrato_entregas_previstas (contract_key, data_prevista);

DO $$
DECLARE v_tabela TEXT;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY['contrato_expectativa_pagamento', 'contrato_entregas_previstas'] LOOP
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

-- Tipo do contrato; p_tipo NULL volta ao automático (apaga a marca).
CREATE OR REPLACE FUNCTION public.definir_expectativa_pagamento(
  p_contract_key VARCHAR(150),
  p_tipo VARCHAR(10),
  p_valor_mensal NUMERIC DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL,
  p_registrado_por_nome VARCHAR(150) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key VARCHAR(150) := TRIM(COALESCE(p_contract_key, ''));
  v_tipo VARCHAR(10) := NULLIF(UPPER(TRIM(COALESCE(p_tipo, ''))), '');
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contratos_oficiais WHERE contract_key = v_key) THEN
    RAISE EXCEPTION 'CONTRACT_NOT_FOUND: Contrato "%" não encontrado.', v_key USING ERRCODE = 'P0002';
  END IF;
  IF v_tipo IS NULL THEN
    DELETE FROM public.contrato_expectativa_pagamento WHERE contract_key = v_key;
    RETURN jsonb_build_object('success', true, 'contract_key', v_key, 'tipo', NULL);
  END IF;
  IF v_tipo NOT IN ('MENSAL', 'ENTREGA', 'EVENTUAL') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Tipo inválido ("%").', p_tipo USING ERRCODE = '22023';
  END IF;
  IF p_valor_mensal IS NOT NULL AND (v_tipo <> 'MENSAL' OR p_valor_mensal <= 0) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Valor mensal só para contrato mensal, e maior que zero.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.contrato_expectativa_pagamento (contract_key, tipo, valor_mensal, observacao, atualizado_por, atualizado_por_nome, atualizado_em)
  VALUES (v_key, v_tipo, ROUND(p_valor_mensal, 2), NULLIF(TRIM(COALESCE(p_observacao, '')), ''), auth.uid(), NULLIF(TRIM(COALESCE(p_registrado_por_nome, '')), ''), NOW())
  ON CONFLICT (contract_key) DO UPDATE
    SET tipo = EXCLUDED.tipo, valor_mensal = EXCLUDED.valor_mensal, observacao = EXCLUDED.observacao,
        atualizado_por = EXCLUDED.atualizado_por, atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();
  RETURN jsonb_build_object('success', true, 'contract_key', v_key, 'tipo', v_tipo);
END;
$$;

-- Inclui (p_id NULL) ou corrige uma entrega prevista.
CREATE OR REPLACE FUNCTION public.salvar_entrega_prevista(
  p_id UUID,
  p_contract_key VARCHAR(150),
  p_data_prevista DATE,
  p_valor NUMERIC,
  p_descricao TEXT,
  p_empenho_canonical_key VARCHAR(150) DEFAULT NULL,
  p_registrado_por_nome VARCHAR(150) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key VARCHAR(150) := TRIM(COALESCE(p_contract_key, ''));
  v_id UUID;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contratos_oficiais WHERE contract_key = v_key) THEN
    RAISE EXCEPTION 'CONTRACT_NOT_FOUND: Contrato "%" não encontrado.', v_key USING ERRCODE = 'P0002';
  END IF;
  IF p_data_prevista IS NULL OR p_valor IS NULL OR p_valor <= 0 OR NULLIF(TRIM(COALESCE(p_descricao, '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data prevista, o valor e o que será entregue.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.contrato_entregas_previstas (contract_key, data_prevista, valor, empenho_canonical_key, descricao, criado_por_nome)
    VALUES (v_key, p_data_prevista, ROUND(p_valor, 2), NULLIF(TRIM(COALESCE(p_empenho_canonical_key, '')), ''), TRIM(p_descricao),
            NULLIF(TRIM(COALESCE(p_registrado_por_nome, '')), ''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.contrato_entregas_previstas
       SET data_prevista = p_data_prevista, valor = ROUND(p_valor, 2),
           empenho_canonical_key = NULLIF(TRIM(COALESCE(p_empenho_canonical_key, '')), ''), descricao = TRIM(p_descricao), atualizado_em = NOW()
     WHERE id = p_id AND contract_key = v_key AND situacao = 'PREVISTA'
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: Entrega prevista não encontrada (ou já cancelada).' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_entrega_prevista(p_id UUID, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o motivo do cancelamento.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.contrato_entregas_previstas
     SET situacao = 'CANCELADA', motivo_cancelamento = TRIM(p_motivo), atualizado_em = NOW()
   WHERE id = p_id AND situacao = 'PREVISTA';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Entrega prevista não encontrada (ou já cancelada).' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.definir_expectativa_pagamento(VARCHAR, VARCHAR, NUMERIC, TEXT, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_expectativa_pagamento(VARCHAR, VARCHAR, NUMERIC, TEXT, VARCHAR) TO authenticated;
REVOKE ALL ON FUNCTION public.salvar_entrega_prevista(UUID, VARCHAR, DATE, NUMERIC, TEXT, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_entrega_prevista(UUID, VARCHAR, DATE, NUMERIC, TEXT, VARCHAR, VARCHAR) TO authenticated;
REVOKE ALL ON FUNCTION public.cancelar_entrega_prevista(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_entrega_prevista(UUID, TEXT) TO authenticated;
