-- ==============================================================================
-- MIGRATION 46: LEMBRETES DE PRAZO LEGAL DISPENSADOS PELO GESTOR
-- Versão: 20261002000046_reminder_dismissals.sql
--
-- Os lembretes de prazo legal (Contrato: D-180/D-60; Ata: D-180/D-90) do 360
-- são calculados em memória a partir da vigência. Esta tabela guarda apenas a
-- DISPENSA manual ("já resolvi / não se aplica"). O item_id embute o ciclo de
-- vigência (VIG_<data fim>), então a dispensa vale só para aquele ciclo: se a
-- vigência for alterada (ex.: prorrogação), o lembrete do novo ciclo volta.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.reminder_dismissals (
  entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('CONTRATO', 'ATA')),
  entity_key VARCHAR(100) NOT NULL,
  item_id VARCHAR(200) NOT NULL,
  dismissed_by UUID DEFAULT auth.uid(),
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_type, entity_key, item_id)
);

ALTER TABLE public.reminder_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read: reminder_dismissals"
  ON public.reminder_dismissals FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.dismiss_reminder_atomic(
  p_entity_type VARCHAR(10),
  p_entity_key VARCHAR(100),
  p_item_id VARCHAR(200)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do CGLIC.'
      USING ERRCODE = '42501';
  END IF;

  IF p_entity_type NOT IN ('CONTRATO', 'ATA')
     OR TRIM(COALESCE(p_entity_key, '')) = '' OR TRIM(COALESCE(p_item_id, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Tipo, chave e lembrete são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.reminder_dismissals (entity_type, entity_key, item_id)
  VALUES (p_entity_type, TRIM(p_entity_key), TRIM(p_item_id))
  ON CONFLICT (entity_type, entity_key, item_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'entity_key', TRIM(p_entity_key), 'item_id', TRIM(p_item_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_reminder_atomic(
  p_entity_type VARCHAR(10),
  p_entity_key VARCHAR(100),
  p_item_id VARCHAR(200)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do CGLIC.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.reminder_dismissals
  WHERE entity_type = p_entity_type
    AND entity_key = TRIM(COALESCE(p_entity_key, ''))
    AND item_id = TRIM(COALESCE(p_item_id, ''));

  RETURN jsonb_build_object('success', true, 'entity_key', TRIM(p_entity_key), 'item_id', TRIM(p_item_id));
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_reminder_atomic(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_reminder_atomic(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_reminder_atomic(VARCHAR, VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_reminder_atomic(VARCHAR, VARCHAR, VARCHAR) TO authenticated;
