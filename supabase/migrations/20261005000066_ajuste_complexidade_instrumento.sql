-- ==============================================================================
-- MIGRATION 66: AJUSTE MANUAL DE COMPLEXIDADE (instrument_complexity_overrides)
-- Versão: 20261005000066_ajuste_complexidade_instrumento.sql
--
-- Contexto: a Central de Distribuição classifica cada ata e contrato vigente em
-- Alta / Média / Baixa por regras automáticas (itens e fornecedores da ata;
-- categoria e duração do contrato — ver src/components/atas/distribuicao/
-- complexidade.ts). Os dados não mostram alguns esforços reais, como mão de
-- obra com dedicação exclusiva. Esta migration guarda o ajuste manual do
-- coordenador, com motivo obrigatório e autoria, por cima da faixa automática.
--
-- - Uma linha por instrumento: tipo ('ATA' | 'CONTRATO') + chave
--   (número da ata, como em ata_managers; chave canônica do contrato,
--   como em contract_managers).
-- - Sem linha = complexidade automática. "Voltar à automática" apaga a linha.
-- - Escrita só pelas RPCs, só para admin (coordenador). Leitura para logados
--   (mesma regra da migration 65).
-- - Auditoria pelo trigger padrão (trg_audit_log_capture).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.instrument_complexity_overrides (
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ATA', 'CONTRATO')),
  chave VARCHAR(80) NOT NULL,
  nivel VARCHAR(10) NOT NULL CHECK (nivel IN ('ALTA', 'MEDIA', 'BAIXA')),
  motivo VARCHAR(300) NOT NULL CHECK (LENGTH(TRIM(motivo)) > 0),
  ajustado_por_user_id UUID REFERENCES auth.users(id),
  ajustado_por_nome VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tipo, chave)
);

ALTER TABLE public.instrument_complexity_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: instrument_complexity_overrides" ON public.instrument_complexity_overrides;
CREATE POLICY "Authenticated Read: instrument_complexity_overrides"
  ON public.instrument_complexity_overrides FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_audit_instrument_complexity_overrides ON public.instrument_complexity_overrides;
CREATE TRIGGER trg_audit_instrument_complexity_overrides
AFTER INSERT OR UPDATE OR DELETE ON public.instrument_complexity_overrides
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- ------------------------------------------------------------------------------
-- set_instrument_complexity — grava (ou troca) o ajuste de um instrumento.
-- A autoria vem do usuário logado (auth.uid()), com o nome no mesmo formato de
-- get_system_users (metadado "nome" / "full_name" ou o início do e-mail).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_instrument_complexity(
  p_tipo VARCHAR(10),
  p_chave VARCHAR(80),
  p_nivel VARCHAR(10),
  p_motivo VARCHAR(300)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo VARCHAR(10);
  v_chave VARCHAR(80);
  v_nivel VARCHAR(10);
  v_motivo VARCHAR(300);
  v_nome VARCHAR(150);
  v_record RECORD;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador ajusta a complexidade.'
      USING ERRCODE = '42501';
  END IF;

  v_tipo := UPPER(TRIM(COALESCE(p_tipo, '')));
  v_chave := TRIM(COALESCE(p_chave, ''));
  v_nivel := UPPER(TRIM(COALESCE(p_nivel, '')));
  v_motivo := TRIM(COALESCE(p_motivo, ''));

  IF v_tipo NOT IN ('ATA', 'CONTRATO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Tipo deve ser ATA ou CONTRATO.' USING ERRCODE = '22023';
  END IF;
  IF v_chave = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A chave do instrumento é obrigatória.' USING ERRCODE = '22023';
  END IF;
  IF v_nivel NOT IN ('ALTA', 'MEDIA', 'BAIXA') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Complexidade deve ser ALTA, MEDIA ou BAIXA.' USING ERRCODE = '22023';
  END IF;
  IF v_motivo = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o motivo do ajuste.' USING ERRCODE = '22023';
  END IF;
  IF LENGTH(v_motivo) > 300 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O motivo não pode exceder 300 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT LEFT(COALESCE(
    NULLIF(u.raw_user_meta_data->>'nome', ''),
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    split_part(u.email, '@', 1)
  ), 150)
  INTO v_nome
  FROM auth.users u
  WHERE u.id = auth.uid();

  INSERT INTO public.instrument_complexity_overrides
    (tipo, chave, nivel, motivo, ajustado_por_user_id, ajustado_por_nome, created_at, updated_at)
  VALUES (v_tipo, v_chave, v_nivel, v_motivo, auth.uid(), v_nome, NOW(), NOW())
  ON CONFLICT (tipo, chave) DO UPDATE SET
    nivel = EXCLUDED.nivel,
    motivo = EXCLUDED.motivo,
    ajustado_por_user_id = EXCLUDED.ajustado_por_user_id,
    ajustado_por_nome = EXCLUDED.ajustado_por_nome,
    updated_at = NOW()
  RETURNING tipo, chave, nivel, motivo, ajustado_por_user_id, ajustado_por_nome, created_at, updated_at
  INTO v_record;

  RETURN jsonb_build_object('success', true, 'override', to_jsonb(v_record));
END;
$$;

REVOKE ALL ON FUNCTION public.set_instrument_complexity(VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_instrument_complexity(VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO authenticated;

-- ------------------------------------------------------------------------------
-- clear_instrument_complexity — volta o instrumento à complexidade automática.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_instrument_complexity(
  p_tipo VARCHAR(10),
  p_chave VARCHAR(80)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_removidos INTEGER;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador ajusta a complexidade.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.instrument_complexity_overrides
  WHERE tipo = UPPER(TRIM(COALESCE(p_tipo, '')))
    AND chave = TRIM(COALESCE(p_chave, ''));
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'removed', v_removidos > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_instrument_complexity(VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_instrument_complexity(VARCHAR, VARCHAR) TO authenticated;
