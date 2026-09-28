-- ==============================================================================
-- MIGRATION 37: PONTE DE IDENTIDADE (GESTOR → auth.users) EM contract_managers
-- Versão: 20260928000037_identity_bridge_contract_managers.sql
--
-- Contexto: contract_managers.gestor_nome é texto livre, sem FK (migration 13).
-- A migration 23 já abriu a mesma ponte para contract_tasks.responsavel_user_id
-- e documentou contract_managers como "próximo passo natural" quando o
-- enforcement de escopo ASSIGNED em contracts (role_domain_scopes, migration
-- 23, linha ~144) precisasse ser aplicado de fato — é o que esta migration faz.
--
-- Modelo idêntico ao já adotado (aditivo, não disruptivo):
--   gestor_user_id UUID NULL REFERENCES auth.users(id) = identidade canônica
--   gestor_nome VARCHAR                                 = informação legada/humana
-- O campo texto NUNCA é removido. USER_ID só é preenchido quando o gestor
-- selecionado no formulário corresponder a um usuário real do sistema (não
-- presume cobertura total — gestores digitados em modo "texto livre" ficam
-- com gestor_user_id NULL, mesma semântica de contract_tasks).
-- ==============================================================================

ALTER TABLE public.contract_managers
  ADD COLUMN IF NOT EXISTS gestor_user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_contract_managers_gestor_user_id ON public.contract_managers (gestor_user_id);

-- save_contract_manager_atomic passa a aceitar p_gestor_user_id (novo
-- parâmetro opcional, ao final da assinatura — chamadas existentes via
-- PostgREST usam argumentos nomeados, nenhuma chamada pré-existente quebra).
-- Comportamento preservado 1:1 para todos os demais campos.
DROP FUNCTION IF EXISTS public.save_contract_manager_atomic(VARCHAR, VARCHAR, INTEGER, VARCHAR);

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
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
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
