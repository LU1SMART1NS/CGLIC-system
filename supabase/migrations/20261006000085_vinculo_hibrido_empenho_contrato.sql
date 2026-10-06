-- ==============================================================================
-- MIGRATION 85: VÍNCULO HÍBRIDO EMPENHO ↔ CONTRATO
-- Versão: 20261006000085_vinculo_hibrido_empenho_contrato.sql
--
-- Contexto (06/10/2026): o vínculo vem do Contratos.gov.br e está certo em quase todos os contratos,
-- mas a fonte também erra. Ex.: a NE 2024NE000765 da HPE Automotores está listada no contrato
-- 00145/2025, da Equilíbrio, e nenhuma fatura desse contrato a cita. Hoje a equipe não tem como
-- recusar o vínculo: a sincronização (migration 81) substitui o conjunto pelo que a fonte lista e o
-- recolocaria. Também não há como registrar uma NE que a fonte não lista.
--
-- O que muda (a sincronização automática continua sendo a regra; o manual é a exceção)
-- 1) contrato_empenhos.origem: FONTE (veio do Contratos.gov.br) ou MANUAL (a equipe vinculou), com
--    quem vinculou e o motivo. A sincronização nunca remove um vínculo MANUAL; se a fonte passar a
--    listar a NE, o vínculo vira FONTE.
-- 2) contrato_empenho_descartes: "este empenho não é deste contrato". A sincronização do contrato
--    (sync_contract_empenhos_atomic) e a do item (link_empenho_to_contract_atomic) pulam o par
--    descartado, então o vínculo não volta. Uma linha por contrato + empenho, com motivo e autor.
-- 3) RPCs, todas para gestor ou coordenador (mesmo perfil da sincronização):
--      descartar_empenho_do_contrato        remove o vínculo e grava o descarte
--      restaurar_empenho_do_contrato        apaga o descarte e refaz o vínculo
--      vincular_empenho_manual_ao_contrato  vincula NE já gravada ou grava a NE informada à mão
--      desvincular_empenho_manual_do_contrato  remove um vínculo MANUAL
--    Toda mudança grava evento em empenho_eventos_historico e passa pela auditoria padrão.
-- 4) sync_contract_empenhos_atomic devolve também ignorados_descartados, ignorados_numeros e
--    promovidos. Lista vazia continua sem remover nada.
--
-- Nada é apagado nesta migration: os vínculos existentes ficam com origem FONTE.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Origem do vínculo
-- ------------------------------------------------------------------------------
ALTER TABLE public.contrato_empenhos
  ADD COLUMN IF NOT EXISTS origem VARCHAR(10) NOT NULL DEFAULT 'FONTE',
  ADD COLUMN IF NOT EXISTS vinculado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vinculado_por_nome VARCHAR(150),
  ADD COLUMN IF NOT EXISTS motivo_manual TEXT;

ALTER TABLE public.contrato_empenhos DROP CONSTRAINT IF EXISTS contrato_empenhos_origem_valida;
ALTER TABLE public.contrato_empenhos
  ADD CONSTRAINT contrato_empenhos_origem_valida CHECK (origem IN ('FONTE', 'MANUAL'));

CREATE INDEX IF NOT EXISTS contrato_empenhos_vinculado_por_idx
  ON public.contrato_empenhos (vinculado_por_user_id) WHERE vinculado_por_user_id IS NOT NULL;

COMMENT ON COLUMN public.contrato_empenhos.origem IS
  'FONTE: listado pelo Contratos.gov.br (a sincronização remove se a fonte deixar de listar). MANUAL: vinculado pela equipe (a sincronização não remove).';

-- ------------------------------------------------------------------------------
-- 2) Descartes
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contrato_empenho_descartes (
  contract_key VARCHAR(100) NOT NULL,
  empenho_id UUID NOT NULL REFERENCES public.empenhos(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  -- ON DELETE SET NULL: excluir o usuário não é bloqueado (mesma regra da migration 67); o nome fica.
  descartado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  descartado_por_nome VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contract_key, empenho_id),
  CONSTRAINT contrato_empenho_descartes_contract_key_formato
    CHECK (contract_key ~ '^[0-9]{6}-(NE)?[0-9]{5}-[0-9]{4}$'),
  CONSTRAINT contrato_empenho_descartes_motivo_tamanho
    CHECK (char_length(btrim(motivo)) BETWEEN 5 AND 500)
);

CREATE INDEX IF NOT EXISTS contrato_empenho_descartes_empenho_idx
  ON public.contrato_empenho_descartes (empenho_id);
CREATE INDEX IF NOT EXISTS contrato_empenho_descartes_user_idx
  ON public.contrato_empenho_descartes (descartado_por_user_id) WHERE descartado_por_user_id IS NOT NULL;

COMMENT ON TABLE public.contrato_empenho_descartes IS
  'Empenho que a equipe disse não ser do contrato, embora o Contratos.gov.br o liste nele. A sincronização não recria o vínculo.';

ALTER TABLE public.contrato_empenho_descartes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: contrato_empenho_descartes" ON public.contrato_empenho_descartes;
CREATE POLICY "Authenticated Read: contrato_empenho_descartes"
  ON public.contrato_empenho_descartes FOR SELECT TO authenticated USING (true);
-- Leitura para logados; escrita só pelas RPCs abaixo.
REVOKE ALL ON public.contrato_empenho_descartes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contrato_empenho_descartes FROM authenticated;
GRANT SELECT ON public.contrato_empenho_descartes TO authenticated;

DROP TRIGGER IF EXISTS trg_audit_contrato_empenho_descartes ON public.contrato_empenho_descartes;
CREATE TRIGGER trg_audit_contrato_empenho_descartes
AFTER INSERT OR UPDATE OR DELETE ON public.contrato_empenho_descartes
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- ------------------------------------------------------------------------------
-- 3a) Descartar: "este empenho não é deste contrato"
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.descartar_empenho_do_contrato(
  p_contract_key VARCHAR,
  p_empenho_id UUID,
  p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(100) := TRIM(COALESCE(p_contract_key, ''));
  v_motivo TEXT := btrim(COALESCE(p_motivo, ''));
  v_link public.contrato_empenhos%ROWTYPE;
  v_numero TEXT;
  v_nome VARCHAR(150);
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador descarta empenho de contrato.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT (v_contract_key ~ '^[0-9]{6}-(NE)?[0-9]{5}-[0-9]{4}$') THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: Chave do contrato fora do formato canônico. Valor: "%"', v_contract_key
      USING ERRCODE = '22023';
  END IF;
  IF p_empenho_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_EMPENHO_ID: Informe o empenho.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_motivo) < 5 OR char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'INVALID_MOTIVO: Explique em 5 a 500 caracteres por que o empenho não é deste contrato.'
      USING ERRCODE = '22023';
  END IF;

  -- Mesma trava da sincronização do contrato: descartar e sincronizar não se cruzam.
  PERFORM pg_advisory_xact_lock(hashtext('sync_contract_empenhos:' || v_contract_key));

  SELECT * INTO v_link FROM public.contrato_empenhos
   WHERE contract_key = v_contract_key AND empenho_id = p_empenho_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VINCULO_INEXISTENTE: Este empenho não está vinculado ao contrato %.', v_contract_key
      USING ERRCODE = 'P0002';
  END IF;
  IF v_link.origem = 'MANUAL' THEN
    RAISE EXCEPTION 'VINCULO_MANUAL: Este vínculo foi feito pela equipe; use Desvincular.'
      USING ERRCODE = '22023';
  END IF;

  SELECT numero_oficial INTO v_numero FROM public.empenhos WHERE id = p_empenho_id;
  v_nome := public.nome_do_usuario_logado();

  INSERT INTO public.empenho_eventos_historico (
    empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
  ) VALUES (
    p_empenho_id, v_contract_key, CURRENT_DATE, 'CANCELAMENTO_TOTAL', -COALESCE(v_link.valor_vinculado, 0),
    jsonb_build_object(
      'evento', 'DESVINCULADO_CONTRATO',
      'motivo', 'DESCARTADO_PELA_EQUIPE',
      'justificativa', v_motivo,
      'por', v_nome,
      'link_id', v_link.id,
      'valor_estornado', v_link.valor_vinculado
    )
  );
  DELETE FROM public.contrato_empenhos WHERE id = v_link.id;

  INSERT INTO public.contrato_empenho_descartes (contract_key, empenho_id, motivo, descartado_por_user_id, descartado_por_nome)
  VALUES (v_contract_key, p_empenho_id, v_motivo, auth.uid(), v_nome)
  ON CONFLICT (contract_key, empenho_id) DO UPDATE SET
    motivo = EXCLUDED.motivo,
    descartado_por_user_id = EXCLUDED.descartado_por_user_id,
    descartado_por_nome = EXCLUDED.descartado_por_nome,
    created_at = NOW();

  RETURN jsonb_build_object('success', true, 'numero_oficial', v_numero);
END;
$$;

REVOKE ALL ON FUNCTION public.descartar_empenho_do_contrato(VARCHAR, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.descartar_empenho_do_contrato(VARCHAR, UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3b) Restaurar: apaga o descarte e refaz o vínculo (a próxima sincronização confere com a fonte)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restaurar_empenho_do_contrato(
  p_contract_key VARCHAR,
  p_empenho_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(100) := TRIM(COALESCE(p_contract_key, ''));
  v_removidos INTEGER;
  v_valor NUMERIC(18, 4);
  v_revinculado BOOLEAN := false;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador restaura empenho de contrato.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sync_contract_empenhos:' || v_contract_key));

  DELETE FROM public.contrato_empenho_descartes
   WHERE contract_key = v_contract_key AND empenho_id = p_empenho_id;
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  IF v_removidos > 0 AND NOT EXISTS (
    SELECT 1 FROM public.contrato_empenhos WHERE contract_key = v_contract_key AND empenho_id = p_empenho_id
  ) THEN
    SELECT COALESCE(valor_empenhado, 0) INTO v_valor FROM public.empenhos WHERE id = p_empenho_id;
    INSERT INTO public.contrato_empenhos (contract_key, empenho_id, valor_vinculado, origem)
    VALUES (v_contract_key, p_empenho_id, v_valor, 'FONTE');
    INSERT INTO public.empenho_eventos_historico (
      empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
    ) VALUES (
      p_empenho_id, v_contract_key, CURRENT_DATE, 'EMISSAO_INICIAL', v_valor,
      jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'origem', 'RESTAURADO_PELA_EQUIPE', 'por', public.nome_do_usuario_logado())
    );
    v_revinculado := true;
  END IF;

  RETURN jsonb_build_object('success', true, 'removed', v_removidos > 0, 'revinculado', v_revinculado);
END;
$$;

REVOKE ALL ON FUNCTION public.restaurar_empenho_do_contrato(VARCHAR, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurar_empenho_do_contrato(VARCHAR, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3c) Vincular à mão: NE já gravada (p_empenho = {"empenho_id": ...}) ou NE informada pela equipe
--     (p_empenho = dados da NE, gravada por save_empenho_soberano_atomic com fonte MANUAL)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vincular_empenho_manual_ao_contrato(
  p_contract_key VARCHAR,
  p_empenho JSONB,
  p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(100) := TRIM(COALESCE(p_contract_key, ''));
  v_motivo TEXT := btrim(COALESCE(p_motivo, ''));
  v_empenho_id UUID;
  v_salvo JSONB;
  v_valor NUMERIC(18, 4);
  v_numero TEXT;
  v_nome VARCHAR(150);
  v_link_id UUID;
  v_criado BOOLEAN := false;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador vincula empenho a contrato.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT (v_contract_key ~ '^[0-9]{6}-(NE)?[0-9]{5}-[0-9]{4}$') THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: Chave do contrato fora do formato canônico. Valor: "%"', v_contract_key
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contratos_oficiais WHERE contract_key = v_contract_key) THEN
    RAISE EXCEPTION 'CONTRATO_DESCONHECIDO: O contrato "%" não está na carteira de contratos oficiais.', v_contract_key
      USING ERRCODE = 'P0002';
  END IF;
  IF char_length(v_motivo) < 5 OR char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'INVALID_MOTIVO: Explique em 5 a 500 caracteres por que o empenho é deste contrato.'
      USING ERRCODE = '22023';
  END IF;
  IF p_empenho IS NULL OR jsonb_typeof(p_empenho) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o empenho.' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(TRIM(COALESCE(p_empenho->>'empenho_id', '')), '') IS NOT NULL THEN
    BEGIN
      v_empenho_id := (p_empenho->>'empenho_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_EMPENHO_ID: Identificador de empenho inválido.' USING ERRCODE = '22023';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.empenhos WHERE id = v_empenho_id) THEN
      RAISE EXCEPTION 'EMPENHO_NOT_FOUND: Empenho com ID "%" não encontrado.', v_empenho_id
        USING ERRCODE = 'P0002';
    END IF;
  ELSE
    -- NE que o sistema ainda não tem: grava com fonte MANUAL. Se ela já existir com fonte oficial,
    -- save_empenho_soberano_atomic preserva os dados oficiais e devolve o mesmo registro.
    v_salvo := public.save_empenho_soberano_atomic((p_empenho - 'empenho_id') || jsonb_build_object('fonte_origem', 'MANUAL'));
    v_empenho_id := (v_salvo->'empenho'->>'id')::UUID;
    v_criado := COALESCE((v_salvo->>'is_new')::BOOLEAN, false);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sync_contract_empenhos:' || v_contract_key));

  IF EXISTS (SELECT 1 FROM public.contrato_empenhos WHERE contract_key = v_contract_key AND empenho_id = v_empenho_id) THEN
    RAISE EXCEPTION 'JA_VINCULADO: Este empenho já está vinculado ao contrato %.', v_contract_key
      USING ERRCODE = '23505';
  END IF;

  SELECT COALESCE(valor_empenhado, 0), numero_oficial INTO v_valor, v_numero FROM public.empenhos WHERE id = v_empenho_id;
  v_nome := public.nome_do_usuario_logado();

  -- Vincular desfaz um descarte anterior do mesmo par.
  DELETE FROM public.contrato_empenho_descartes WHERE contract_key = v_contract_key AND empenho_id = v_empenho_id;

  INSERT INTO public.contrato_empenhos (contract_key, empenho_id, valor_vinculado, origem, vinculado_por_user_id, vinculado_por_nome, motivo_manual)
  VALUES (v_contract_key, v_empenho_id, v_valor, 'MANUAL', auth.uid(), v_nome, v_motivo)
  RETURNING id INTO v_link_id;

  INSERT INTO public.empenho_eventos_historico (
    empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
  ) VALUES (
    v_empenho_id, v_contract_key, CURRENT_DATE, 'EMISSAO_INICIAL', v_valor,
    jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'origem', 'MANUAL', 'justificativa', v_motivo, 'por', v_nome)
  );

  RETURN jsonb_build_object(
    'success', true,
    'link_id', v_link_id,
    'empenho_id', v_empenho_id,
    'numero_oficial', v_numero,
    'empenho_criado', v_criado
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_empenho_manual_ao_contrato(VARCHAR, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_empenho_manual_ao_contrato(VARCHAR, JSONB, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3d) Desvincular um vínculo MANUAL (os da fonte se recusam com "descartar")
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desvincular_empenho_manual_do_contrato(
  p_contract_key VARCHAR,
  p_empenho_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(100) := TRIM(COALESCE(p_contract_key, ''));
  v_link public.contrato_empenhos%ROWTYPE;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador desvincula empenho de contrato.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sync_contract_empenhos:' || v_contract_key));

  SELECT * INTO v_link FROM public.contrato_empenhos
   WHERE contract_key = v_contract_key AND empenho_id = p_empenho_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VINCULO_INEXISTENTE: Este empenho não está vinculado ao contrato %.', v_contract_key
      USING ERRCODE = 'P0002';
  END IF;
  IF v_link.origem <> 'MANUAL' THEN
    RAISE EXCEPTION 'VINCULO_DA_FONTE: Este vínculo veio do Contratos.gov.br; use Não é deste contrato.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.empenho_eventos_historico (
    empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
  ) VALUES (
    p_empenho_id, v_contract_key, CURRENT_DATE, 'CANCELAMENTO_TOTAL', -COALESCE(v_link.valor_vinculado, 0),
    jsonb_build_object(
      'evento', 'DESVINCULADO_CONTRATO',
      'motivo', 'DESVINCULADO_PELA_EQUIPE',
      'por', public.nome_do_usuario_logado(),
      'link_id', v_link.id,
      'valor_estornado', v_link.valor_vinculado
    )
  );
  DELETE FROM public.contrato_empenhos WHERE id = v_link.id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.desvincular_empenho_manual_do_contrato(VARCHAR, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desvincular_empenho_manual_do_contrato(VARCHAR, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4) Sincronização do contrato: pula descartados, não remove MANUAL, promove MANUAL listado
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_contract_empenhos_atomic(
  p_contract_key VARCHAR,
  p_empenhos JSONB,
  p_remover_ausentes BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(150) := TRIM(COALESCE(p_contract_key, ''));
  v_elem JSONB;
  v_empenho_id UUID;
  v_valor NUMERIC(18, 4);
  v_existing public.contrato_empenhos%ROWTYPE;
  v_seen UUID[] := ARRAY[]::UUID[];
  v_removed RECORD;
  v_inseridos INTEGER := 0;
  v_atualizados INTEGER := 0;
  v_promovidos INTEGER := 0;
  v_removidos INTEGER := 0;
  v_removidos_numeros TEXT[] := ARRAY[]::TEXT[];
  v_ignorados INTEGER := 0;
  v_ignorados_numeros TEXT[] := ARRAY[]::TEXT[];
  v_existentes INTEGER;
  v_remocao_bloqueada INTEGER := 0;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (v_contract_key ~ '^[0-9]{6}-(NE)?[0-9]{5}-[0-9]{4}$') THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: Chave do contrato fora do formato canônico (ex.: 200331-00012-2026). Valor: "%"', v_contract_key
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contratos_oficiais WHERE contract_key = v_contract_key) THEN
    RAISE EXCEPTION 'CONTRATO_DESCONHECIDO: O contrato "%" não está na carteira de contratos oficiais.', v_contract_key
      USING ERRCODE = 'P0002';
  END IF;

  IF p_empenhos IS NULL OR jsonb_typeof(p_empenhos) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A lista de empenhos deve ser um array.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_empenhos) > 1000 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Limite de 1000 empenhos por contrato.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sync_contract_empenhos:' || v_contract_key));

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_empenhos)
  LOOP
    BEGIN
      v_empenho_id := (v_elem->>'empenho_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_empenho_id := NULL;
    END;
    IF v_empenho_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_EMPENHO_ID: Empenho sem identificador válido na lista.'
        USING ERRCODE = '22023';
    END IF;
    IF v_empenho_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Empenho repetido na operação: "%"', v_empenho_id
        USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_empenho_id);

    IF NOT EXISTS (SELECT 1 FROM public.empenhos WHERE id = v_empenho_id) THEN
      RAISE EXCEPTION 'EMPENHO_NOT_FOUND: Empenho com ID "%" não encontrado.', v_empenho_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Valor vinculado obrigatório; 0 é valor (NE anulada ou ainda sem valor no SIAFI).
    BEGIN
      v_valor := (v_elem->>'valor_vinculado')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_valor := NULL;
    END;
    IF v_valor IS NULL OR v_valor < 0 THEN
      RAISE EXCEPTION 'INVALID_VALUE: Valor vinculado ausente ou negativo para o empenho "%".', v_empenho_id
        USING ERRCODE = '22023';
    END IF;

    -- A equipe disse que este empenho não é deste contrato: a fonte lista, mas não vincula.
    IF EXISTS (
      SELECT 1 FROM public.contrato_empenho_descartes
       WHERE contract_key = v_contract_key AND empenho_id = v_empenho_id
    ) THEN
      v_ignorados := v_ignorados + 1;
      v_ignorados_numeros := array_append(v_ignorados_numeros, (SELECT numero_oficial::TEXT FROM public.empenhos WHERE id = v_empenho_id));
      CONTINUE;
    END IF;

    SELECT * INTO v_existing
      FROM public.contrato_empenhos
     WHERE contract_key = v_contract_key AND empenho_id = v_empenho_id;

    IF NOT FOUND THEN
      INSERT INTO public.contrato_empenhos (contract_key, empenho_id, valor_vinculado, origem)
      VALUES (v_contract_key, v_empenho_id, v_valor, 'FONTE');
      v_inseridos := v_inseridos + 1;

      INSERT INTO public.empenho_eventos_historico (
        empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
      ) VALUES (
        v_empenho_id, v_contract_key, CURRENT_DATE, 'EMISSAO_INICIAL', v_valor,
        jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'contract_key', v_contract_key, 'origem', 'SYNC_CONTRATO')
      );

    ELSE
      -- Vínculo feito à mão que a fonte passou a listar: vira FONTE (a fonte confirmou).
      IF v_existing.origem = 'MANUAL' THEN
        UPDATE public.contrato_empenhos SET origem = 'FONTE', updated_at = NOW() WHERE id = v_existing.id;
        v_promovidos := v_promovidos + 1;
      END IF;

      IF v_existing.valor_vinculado IS DISTINCT FROM v_valor THEN
        UPDATE public.contrato_empenhos
           SET valor_vinculado = v_valor,
               updated_at = NOW()
         WHERE id = v_existing.id;
        v_atualizados := v_atualizados + 1;

        IF v_valor - COALESCE(v_existing.valor_vinculado, 0) <> 0 THEN
          INSERT INTO public.empenho_eventos_historico (
            empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
          ) VALUES (
            v_empenho_id, v_contract_key, CURRENT_DATE,
            CASE WHEN v_valor > COALESCE(v_existing.valor_vinculado, 0) THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
            v_valor - COALESCE(v_existing.valor_vinculado, 0),
            jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'acao', 'ATUALIZACAO_VALOR', 'contract_key', v_contract_key, 'origem', 'SYNC_CONTRATO')
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF COALESCE(p_remover_ausentes, TRUE) THEN
    -- Só os vínculos que vieram da fonte saem quando ela deixa de listá-los; os MANUAIS ficam.
    SELECT COUNT(*) INTO v_existentes
      FROM public.contrato_empenhos
     WHERE contract_key = v_contract_key AND origem = 'FONTE' AND NOT (empenho_id = ANY (v_seen));

    IF jsonb_array_length(p_empenhos) = 0 AND v_existentes > 0 THEN
      -- A fonte não listou nenhum empenho, mas o contrato tem vínculos: não remove (id errado devolve
      -- lista vazia no Contratos.gov.br). O cliente avisa e a equipe confere.
      v_remocao_bloqueada := v_existentes;
    ELSE
      FOR v_removed IN
        SELECT ce.*, e.numero_oficial
          FROM public.contrato_empenhos ce
          JOIN public.empenhos e ON e.id = ce.empenho_id
         WHERE ce.contract_key = v_contract_key AND ce.origem = 'FONTE' AND NOT (ce.empenho_id = ANY (v_seen))
      LOOP
        INSERT INTO public.empenho_eventos_historico (
          empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
        ) VALUES (
          v_removed.empenho_id, v_contract_key, CURRENT_DATE, 'CANCELAMENTO_TOTAL',
          -COALESCE(v_removed.valor_vinculado, 0),
          jsonb_build_object(
            'evento', 'DESVINCULADO_CONTRATO',
            'motivo', 'AUSENTE_NA_FONTE',
            'link_id', v_removed.id,
            'valor_estornado', v_removed.valor_vinculado,
            'origem', 'SYNC_CONTRATO'
          )
        );
        DELETE FROM public.contrato_empenhos WHERE id = v_removed.id;
        v_removidos := v_removidos + 1;
        v_removidos_numeros := array_append(v_removidos_numeros, v_removed.numero_oficial::TEXT);
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'contract_key', v_contract_key,
    'inseridos', v_inseridos,
    'atualizados', v_atualizados,
    'promovidos', v_promovidos,
    'removidos', v_removidos,
    'removidos_numeros', to_jsonb(v_removidos_numeros),
    'ignorados_descartados', v_ignorados,
    'ignorados_numeros', to_jsonb(v_ignorados_numeros),
    'remocao_bloqueada', v_remocao_bloqueada
  );
END;
$$;

COMMENT ON FUNCTION public.sync_contract_empenhos_atomic(VARCHAR, JSONB, BOOLEAN) IS
  'Substitui os vínculos de origem FONTE do contrato pelo que o Contratos.gov.br listou: insere, atualiza o valor e remove os ausentes. Pula os descartados pela equipe e mantém os vínculos MANUAIS.';

REVOKE ALL ON FUNCTION public.sync_contract_empenhos_atomic(VARCHAR, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_contract_empenhos_atomic(VARCHAR, JSONB, BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5) Vínculo um a um (fluxo do item e reserva da sincronização): respeita o descarte
--    Corpo da migration 81 com a autorização da migration 82 (servidor aceito).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_empenho_to_contract_atomic(
  p_contract_key VARCHAR,
  p_empenho_id UUID,
  p_valor_vinculado NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(150);
  v_empenho_id_check UUID;
  v_existing_link RECORD;
  v_record RECORD;
  v_novo_valor NUMERIC(18, 4);
  v_delta_valor NUMERIC(18, 4);
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_contract_key := TRIM(COALESCE(p_contract_key, ''));
  IF v_contract_key = '' THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: A contract_key é obrigatória e não pode ser vazia.'
      USING ERRCODE = '22023';
  END IF;

  IF p_empenho_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_EMPENHO_ID: O identificador do empenho é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  IF p_valor_vinculado IS NOT NULL AND p_valor_vinculado < 0 THEN
    RAISE EXCEPTION 'INVALID_VALUE: O valor vinculado não pode ser negativo.'
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_empenho_id_check FROM public.empenhos WHERE id = p_empenho_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EMPENHO_NOT_FOUND: Empenho com ID "%" não encontrado.', p_empenho_id
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('link_ctr:' || v_contract_key || ':' || p_empenho_id::TEXT));

  -- Descartado pela equipe: não vincula, sem erro (o fluxo do item segue com os demais).
  IF EXISTS (
    SELECT 1 FROM public.contrato_empenho_descartes
     WHERE contract_key = v_contract_key AND empenho_id = p_empenho_id
  ) THEN
    RETURN jsonb_build_object('success', true, 'descartado', true, 'link', NULL);
  END IF;

  SELECT * INTO v_existing_link
  FROM public.contrato_empenhos
  WHERE contract_key = v_contract_key AND empenho_id = p_empenho_id;

  IF FOUND THEN
    -- NULL mantém o valor anterior: o evento compara o valor que de fato fica gravado.
    v_novo_valor := COALESCE(p_valor_vinculado, v_existing_link.valor_vinculado);
    v_delta_valor := COALESCE(v_novo_valor, 0) - COALESCE(v_existing_link.valor_vinculado, 0);

    UPDATE public.contrato_empenhos
    SET
      valor_vinculado = v_novo_valor,
      -- A fonte listou a NE: um vínculo feito à mão passa a ser da fonte.
      origem = 'FONTE',
      updated_at = NOW()
    WHERE id = v_existing_link.id
    RETURNING * INTO v_record;

    IF v_delta_valor <> 0 THEN
      INSERT INTO public.empenho_eventos_historico (
        empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
      ) VALUES (
        p_empenho_id, v_contract_key, CURRENT_DATE,
        CASE WHEN v_delta_valor > 0 THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
        v_delta_valor,
        jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'acao', 'ATUALIZACAO_VALOR', 'contract_key', v_contract_key)
      );
    END IF;

  ELSE
    INSERT INTO public.contrato_empenhos (contract_key, empenho_id, valor_vinculado, origem)
    VALUES (v_contract_key, p_empenho_id, p_valor_vinculado, 'FONTE')
    RETURNING * INTO v_record;

    INSERT INTO public.empenho_eventos_historico (
      empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
    ) VALUES (
      p_empenho_id, v_contract_key, CURRENT_DATE, 'EMISSAO_INICIAL', COALESCE(p_valor_vinculado, 0),
      jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'contract_key', v_contract_key)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'link', jsonb_build_object(
      'id', v_record.id,
      'contract_key', v_record.contract_key,
      'empenho_id', v_record.empenho_id,
      'valor_vinculado', v_record.valor_vinculado,
      'created_at', v_record.created_at,
      'updated_at', v_record.updated_at
    )
  );
END;
$$;

COMMENT ON FUNCTION public.link_empenho_to_contract_atomic(VARCHAR, UUID, NUMERIC) IS
  'Vincula empenho como lastro financeiro de contrato oficial (N:N). Valor NULL mantém o anterior, sem evento. Par descartado pela equipe não é vinculado.';

REVOKE ALL ON FUNCTION public.link_empenho_to_contract_atomic(VARCHAR, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_empenho_to_contract_atomic(VARCHAR, UUID, NUMERIC) TO authenticated, service_role;
