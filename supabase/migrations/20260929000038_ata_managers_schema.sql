-- ==============================================================================
-- MIGRATION 38: GESTOR DA ATA (ata_managers) — ATRIBUIÇÃO POR ATA
-- Versão: 20260929000038_ata_managers_schema.sql
--
-- Contexto: o perfil "gestor" (Gestor de Atas e Contratos) só tinha atribuição
-- por contrato individual (contract_managers, migration 13 + ponte de
-- identidade da migration 37). Isso deixava de fora o caso comum de uma Ata
-- de Registro de Preços com vários contratos vinculados (arp_item_contract_links,
-- migration 15): atribuir o gestor contrato a contrato era repetitivo e ainda
-- deixava a Ata em si (e os itens/saldos que não têm contrato vinculado) fora
-- do escopo do gestor nas telas de Ata (/atas, /atas/itens).
--
-- Esta migration cria o equivalente de contract_managers para o nível de Ata,
-- já nascendo com a ponte de identidade (gestor_user_id) — mesmo modelo da
-- migration 37, sem a etapa intermediária de texto livre.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ata_managers (
  ata_key VARCHAR(50) PRIMARY KEY, -- = numeroAtaRegistroPreco, ex. "00037/2026"
  gestor_nome VARCHAR(150) NOT NULL,
  gestor_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ata_managers_gestor_user_id ON public.ata_managers (gestor_user_id);

ALTER TABLE public.ata_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read: ata_managers" ON public.ata_managers FOR SELECT USING (true);

DROP TRIGGER IF EXISTS trg_audit_ata_managers ON public.ata_managers;
CREATE TRIGGER trg_audit_ata_managers
AFTER INSERT OR UPDATE OR DELETE ON public.ata_managers
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- ------------------------------------------------------------------------------
-- save_ata_manager_atomic — cópia estrutural de save_contract_manager_atomic
-- (migration 37), trocando a chave de contrato pela chave de Ata.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_ata_manager_atomic(
  p_ata_key VARCHAR(50),
  p_gestor_nome VARCHAR(150),
  p_gestor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata_key VARCHAR(50);
  v_gestor_nome VARCHAR(150);
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_ata_key := TRIM(COALESCE(p_ata_key, ''));
  v_gestor_nome := TRIM(COALESCE(p_gestor_nome, ''));

  IF v_ata_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O número da Ata é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF v_gestor_nome = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome do gestor é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF LENGTH(v_gestor_nome) > 150 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome do gestor não pode exceder 150 caracteres.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ata_managers (ata_key, gestor_nome, gestor_user_id, created_at, updated_at)
  VALUES (v_ata_key, v_gestor_nome, p_gestor_user_id, NOW(), NOW())
  ON CONFLICT (ata_key) DO UPDATE SET
    gestor_nome = EXCLUDED.gestor_nome,
    gestor_user_id = EXCLUDED.gestor_user_id,
    updated_at = NOW()
  RETURNING ata_key, gestor_nome, gestor_user_id, created_at, updated_at
  INTO v_record;

  RETURN jsonb_build_object(
    'success', true,
    'manager', jsonb_build_object(
      'ata_key', v_record.ata_key,
      'gestor_nome', v_record.gestor_nome,
      'gestor_user_id', v_record.gestor_user_id,
      'created_at', v_record.created_at,
      'updated_at', v_record.updated_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_ata_manager_atomic(VARCHAR, VARCHAR, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ata_manager_atomic(VARCHAR, VARCHAR, UUID) TO authenticated;
