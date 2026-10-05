-- ==============================================================================
-- MIGRATION 69: ATRIBUIÇÃO DE GESTOR SÓ PARA O COORDENADOR + CONTRATO SEM ATA
-- Versão: 20261005000069_atribuicao_so_coordenador_e_contrato_sem_ata.sql
--
-- 1) A atribuição de gestor passa a ser centralizada na Central de Distribuição
--    e restrita ao coordenador (perfil admin). Até aqui as RPCs aceitavam também
--    o perfil "gestor" (migrations 37 e 38). Só muda a checagem de perfil; o resto
--    das duas funções é idêntico.
--
-- 2) contract_sem_ata_confirmacoes: o coordenador confirma que um contrato não tem
--    ata de registro de preços. Sem a confirmação, o contrato sem vínculo continua
--    na fila "Contratos sem ata" da Central; com ela, sai da fila e segue direto
--    para a atribuição de gestor. Não cria vínculo nenhum (o vínculo ata ↔ contrato
--    continua sendo o de arp_item_contract_links).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1a) Gestor da ata — só admin
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
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador atribui gestor.'
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

-- ------------------------------------------------------------------------------
-- 1b) Gestor do contrato — só admin
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_contract_manager_atomic(
  p_uasg VARCHAR(10),
  p_numero VARCHAR(50),
  p_ano INTEGER,
  p_gestor_nome VARCHAR(150),
  p_gestor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(100);
  v_uasg VARCHAR(10);
  v_numero VARCHAR(50);
  v_gestor_nome VARCHAR(150);
  v_record RECORD;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador atribui gestor.'
      USING ERRCODE = '42501';
  END IF;

  v_uasg := TRIM(COALESCE(p_uasg, ''));
  v_numero := TRIM(COALESCE(p_numero, ''));
  v_gestor_nome := TRIM(COALESCE(p_gestor_nome, ''));

  IF v_uasg = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O código da UASG é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF v_numero = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O número do contrato é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O ano do contrato deve estar entre 2000 e 2100 (recebido: %).', p_ano
      USING ERRCODE = '22023';
  END IF;
  IF v_gestor_nome = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome do gestor é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF LENGTH(v_gestor_nome) > 150 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome do gestor não pode exceder 150 caracteres.' USING ERRCODE = '22023';
  END IF;

  -- Identidade canônica: o ano vem do próprio v_numero quando possível
  -- (p_ano só é usado como fallback). Ver public.normalize_contract_key
  -- (migration 14) e src/utils/contractKeyUtils.ts.
  v_contract_key := public.normalize_contract_key(v_uasg, v_numero, p_ano);

  INSERT INTO public.contract_managers (contract_key, uasg, numero, ano, gestor_nome, gestor_user_id, created_at, updated_at)
  VALUES (v_contract_key, v_uasg, v_numero, p_ano, v_gestor_nome, p_gestor_user_id, NOW(), NOW())
  ON CONFLICT (contract_key) DO UPDATE SET
    gestor_nome = EXCLUDED.gestor_nome,
    gestor_user_id = EXCLUDED.gestor_user_id,
    updated_at = NOW()
  RETURNING contract_key, uasg, numero, ano, gestor_nome, gestor_user_id, created_at, updated_at
  INTO v_record;

  RETURN jsonb_build_object(
    'success', true,
    'manager', jsonb_build_object(
      'contract_key', v_record.contract_key,
      'uasg', v_record.uasg,
      'numero', v_record.numero,
      'ano', v_record.ano,
      'gestor_nome', v_record.gestor_nome,
      'gestor_user_id', v_record.gestor_user_id,
      'created_at', v_record.created_at,
      'updated_at', v_record.updated_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_contract_manager_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_contract_manager_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2) Contrato sem ata (confirmação do coordenador)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_sem_ata_confirmacoes (
  contract_key VARCHAR(100) PRIMARY KEY, -- chave canônica do contrato (mesma de contract_managers)
  -- ON DELETE SET NULL: excluir o usuário não é bloqueado (mesma regra da migration 67); o nome fica.
  confirmado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmado_por_nome VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.contract_sem_ata_confirmacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: contract_sem_ata_confirmacoes" ON public.contract_sem_ata_confirmacoes;
CREATE POLICY "Authenticated Read: contract_sem_ata_confirmacoes"
  ON public.contract_sem_ata_confirmacoes FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_audit_contract_sem_ata_confirmacoes ON public.contract_sem_ata_confirmacoes;
CREATE TRIGGER trg_audit_contract_sem_ata_confirmacoes
AFTER INSERT OR UPDATE OR DELETE ON public.contract_sem_ata_confirmacoes
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

CREATE OR REPLACE FUNCTION public.confirm_contract_sem_ata(p_contract_key VARCHAR(100))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key VARCHAR(100);
  v_nome VARCHAR(150);
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador confirma que o contrato não tem ata.'
      USING ERRCODE = '42501';
  END IF;

  v_key := TRIM(COALESCE(p_contract_key, ''));
  IF v_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A chave do contrato é obrigatória.' USING ERRCODE = '22023';
  END IF;

  SELECT LEFT(COALESCE(
    NULLIF(u.raw_user_meta_data->>'nome', ''),
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    split_part(u.email, '@', 1)
  ), 150)
  INTO v_nome
  FROM auth.users u
  WHERE u.id = auth.uid();

  INSERT INTO public.contract_sem_ata_confirmacoes (contract_key, confirmado_por_user_id, confirmado_por_nome)
  VALUES (v_key, auth.uid(), v_nome)
  ON CONFLICT (contract_key) DO UPDATE SET
    confirmado_por_user_id = EXCLUDED.confirmado_por_user_id,
    confirmado_por_nome = EXCLUDED.confirmado_por_nome,
    created_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_contract_sem_ata(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_contract_sem_ata(VARCHAR) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_contract_sem_ata(p_contract_key VARCHAR(100))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_removidos INTEGER;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador desfaz a confirmação de contrato sem ata.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.contract_sem_ata_confirmacoes WHERE contract_key = TRIM(COALESCE(p_contract_key, ''));
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'removed', v_removidos > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_contract_sem_ata(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_contract_sem_ata(VARCHAR) TO authenticated;
