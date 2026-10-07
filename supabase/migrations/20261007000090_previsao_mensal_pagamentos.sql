-- ==============================================================================
-- MIGRATION 90: PREVISÃO MENSAL DE PAGAMENTOS (PORTARIA DGFNSP 50/2025, ART. 5º, § 2º, III) — FASE B
-- Versão: 20261007000090_previsao_mensal_pagamentos.sql
--
-- A CGLIC informa, até o último dia útil de cada mês, os pagamentos previstos para o mês seguinte (contrato,
-- contratada, UG do empenho, nota de empenho, subitem, valor). As linhas são montadas pela tela (faturas em aberto,
-- ciclos, contratos mensais, entregas previstas); aqui ficam:
--   previsao_pagamentos_ajustes  o que o usuário mudou no mês (retirar, corrigir valor/subitem, marcar emenda, incluir);
--   previsao_pagamentos          o envio do mês (SEI, data) com a foto das linhas enviadas, para comparar com o pago;
--   prazos_emendas               o prazo próprio das emendas parlamentares (§ 3º), que vem de portaria anual.
-- Leitura para logados; escrita só pelas RPCs (coordenador e gestor; prazos das emendas, só coordenador).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.previsao_pagamentos (
  mes DATE PRIMARY KEY CHECK (EXTRACT(DAY FROM mes) = 1),
  situacao VARCHAR(10) NOT NULL DEFAULT 'ENVIADA' CHECK (situacao IN ('ENVIADA')),
  sei VARCHAR(100) NOT NULL,
  enviado_em DATE NOT NULL,
  linhas JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  enviado_por UUID DEFAULT auth.uid(),
  enviado_por_nome VARCHAR(150),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.previsao_pagamentos_ajustes (
  mes DATE NOT NULL CHECK (EXTRACT(DAY FROM mes) = 1),
  chave_linha VARCHAR(200) NOT NULL,
  retirada BOOLEAN NOT NULL DEFAULT FALSE,
  valor NUMERIC(18, 2) CHECK (valor IS NULL OR valor > 0),
  subitem VARCHAR(8),
  emenda BOOLEAN,
  -- Linha incluída à mão (chave começa com "manual-"): os dados dela.
  contract_key VARCHAR(150),
  empenho_canonical_key VARCHAR(150),
  descricao TEXT,
  ajustado_por UUID DEFAULT auth.uid(),
  ajustado_por_nome VARCHAR(150),
  ajustado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mes, chave_linha),
  CONSTRAINT previsao_ajuste_manual_completo CHECK (
    chave_linha NOT LIKE 'manual-%' OR (contract_key IS NOT NULL AND valor IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.prazos_emendas (
  ano INTEGER NOT NULL CHECK (ano BETWEEN 2021 AND 2100),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  data_limite DATE NOT NULL,
  portaria TEXT NOT NULL CHECK (length(trim(portaria)) > 0),
  atualizado_por UUID DEFAULT auth.uid(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ano, mes)
);

DO $$
DECLARE v_tabela TEXT;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY['previsao_pagamentos', 'previsao_pagamentos_ajustes', 'prazos_emendas'] LOOP
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

-- Grava (ou apaga, com p_remover) o ajuste de uma linha da previsão do mês.
CREATE OR REPLACE FUNCTION public.salvar_ajuste_previsao(
  p_mes DATE,
  p_chave_linha VARCHAR(200),
  p_retirada BOOLEAN DEFAULT FALSE,
  p_valor NUMERIC DEFAULT NULL,
  p_subitem VARCHAR(8) DEFAULT NULL,
  p_emenda BOOLEAN DEFAULT NULL,
  p_contract_key VARCHAR(150) DEFAULT NULL,
  p_empenho_canonical_key VARCHAR(150) DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL,
  p_registrado_por_nome VARCHAR(150) DEFAULT NULL,
  p_remover BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mes DATE := date_trunc('month', p_mes)::DATE;
  v_chave VARCHAR(200) := TRIM(COALESCE(p_chave_linha, ''));
  v_sub VARCHAR(8) := NULLIF(regexp_replace(COALESCE(p_subitem, ''), '\D', '', 'g'), '');
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores.' USING ERRCODE = '42501';
  END IF;
  IF p_mes IS NULL OR v_chave = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o mês e a linha.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_remover, FALSE) THEN
    DELETE FROM public.previsao_pagamentos_ajustes WHERE mes = v_mes AND chave_linha = v_chave;
    RETURN jsonb_build_object('success', true, 'removido', true);
  END IF;
  IF p_valor IS NOT NULL AND p_valor <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O valor deve ser maior que zero.' USING ERRCODE = '22023';
  END IF;
  IF v_sub IS NOT NULL AND NOT (v_sub ~ '^\d{2}$' OR v_sub ~ '^\d{8}$') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Subitem com 2 ou 8 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF v_chave LIKE 'manual-%' THEN
    IF NULLIF(TRIM(COALESCE(p_contract_key, '')), '') IS NULL OR p_valor IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Linha incluída precisa do contrato e do valor.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.contratos_oficiais WHERE contract_key = TRIM(p_contract_key)) THEN
      RAISE EXCEPTION 'CONTRACT_NOT_FOUND: Contrato "%" não encontrado.', p_contract_key USING ERRCODE = 'P0002';
    END IF;
  END IF;
  INSERT INTO public.previsao_pagamentos_ajustes (
    mes, chave_linha, retirada, valor, subitem, emenda, contract_key, empenho_canonical_key, descricao, ajustado_por, ajustado_por_nome, ajustado_em
  ) VALUES (
    v_mes, v_chave, COALESCE(p_retirada, FALSE), ROUND(p_valor, 2), v_sub, p_emenda,
    NULLIF(TRIM(COALESCE(p_contract_key, '')), ''), NULLIF(TRIM(COALESCE(p_empenho_canonical_key, '')), ''),
    NULLIF(TRIM(COALESCE(p_descricao, '')), ''), auth.uid(), NULLIF(TRIM(COALESCE(p_registrado_por_nome, '')), ''), NOW()
  )
  ON CONFLICT (mes, chave_linha) DO UPDATE SET
    retirada = EXCLUDED.retirada, valor = EXCLUDED.valor, subitem = EXCLUDED.subitem, emenda = EXCLUDED.emenda,
    contract_key = EXCLUDED.contract_key, empenho_canonical_key = EXCLUDED.empenho_canonical_key, descricao = EXCLUDED.descricao,
    ajustado_por = EXCLUDED.ajustado_por, ajustado_por_nome = EXCLUDED.ajustado_por_nome, ajustado_em = NOW();
  RETURN jsonb_build_object('success', true, 'mes', v_mes, 'chave_linha', v_chave);
END;
$$;

-- Registra o envio do mês com a foto das linhas enviadas (registrar de novo substitui a anterior).
CREATE OR REPLACE FUNCTION public.registrar_envio_previsao(
  p_mes DATE,
  p_sei VARCHAR(100),
  p_enviado_em DATE,
  p_linhas JSONB,
  p_registrado_por_nome VARCHAR(150) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mes DATE := date_trunc('month', p_mes)::DATE;
  v_total NUMERIC(18, 2);
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores.' USING ERRCODE = '42501';
  END IF;
  IF p_mes IS NULL OR NULLIF(TRIM(COALESCE(p_sei, '')), '') IS NULL OR p_enviado_em IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o mês, o SEI e a data do envio.' USING ERRCODE = '22023';
  END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A previsão enviada precisa de ao menos uma linha.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(SUM((l->>'valor')::NUMERIC), 0) INTO v_total FROM jsonb_array_elements(p_linhas) l;
  INSERT INTO public.previsao_pagamentos (mes, situacao, sei, enviado_em, linhas, total, enviado_por, enviado_por_nome, atualizado_em)
  VALUES (v_mes, 'ENVIADA', TRIM(p_sei), p_enviado_em, p_linhas, v_total, auth.uid(), NULLIF(TRIM(COALESCE(p_registrado_por_nome, '')), ''), NOW())
  ON CONFLICT (mes) DO UPDATE SET
    sei = EXCLUDED.sei, enviado_em = EXCLUDED.enviado_em, linhas = EXCLUDED.linhas, total = EXCLUDED.total,
    enviado_por = EXCLUDED.enviado_por, enviado_por_nome = EXCLUDED.enviado_por_nome, atualizado_em = NOW();
  RETURN jsonb_build_object('success', true, 'mes', v_mes, 'total', v_total, 'linhas', jsonb_array_length(p_linhas));
END;
$$;

-- Prazo das emendas de um mês (portaria anual); só o coordenador.
CREATE OR REPLACE FUNCTION public.salvar_prazo_emenda(p_ano INTEGER, p_mes INTEGER, p_data_limite DATE, p_portaria TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Somente o coordenador altera os prazos das emendas.' USING ERRCODE = '42501';
  END IF;
  IF p_ano IS NULL OR p_mes IS NULL OR p_mes NOT BETWEEN 1 AND 12 OR p_data_limite IS NULL OR NULLIF(TRIM(COALESCE(p_portaria, '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe ano, mês, data limite e a portaria.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.prazos_emendas (ano, mes, data_limite, portaria, atualizado_por, atualizado_em)
  VALUES (p_ano, p_mes, p_data_limite, TRIM(p_portaria), auth.uid(), NOW())
  ON CONFLICT (ano, mes) DO UPDATE SET data_limite = EXCLUDED.data_limite, portaria = EXCLUDED.portaria,
    atualizado_por = EXCLUDED.atualizado_por, atualizado_em = NOW();
  RETURN jsonb_build_object('success', true, 'ano', p_ano, 'mes', p_mes);
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_ajuste_previsao(DATE, VARCHAR, BOOLEAN, NUMERIC, VARCHAR, BOOLEAN, VARCHAR, VARCHAR, TEXT, VARCHAR, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_ajuste_previsao(DATE, VARCHAR, BOOLEAN, NUMERIC, VARCHAR, BOOLEAN, VARCHAR, VARCHAR, TEXT, VARCHAR, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_envio_previsao(DATE, VARCHAR, DATE, JSONB, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_envio_previsao(DATE, VARCHAR, DATE, JSONB, VARCHAR) TO authenticated;
REVOKE ALL ON FUNCTION public.salvar_prazo_emenda(INTEGER, INTEGER, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_prazo_emenda(INTEGER, INTEGER, DATE, TEXT) TO authenticated;
