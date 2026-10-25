-- ==============================================================================
-- MIGRATION 152: "Desfazer" do "não pertence a ata" devolve o contrato à fila de Vínculos
--
-- Problema (22/10/2026): ao marcar "não pertence a nenhuma ata", o coordenador escolhe o gestor do contrato. O
-- "Desfazer" (clear_contract_sem_ata) só apagava a marca; o gestor ficava. A fila "Contratos à ata" só mostra
-- contrato sem ata provável quando ele não tem gestor, então o contrato sumia da tela (caso do 00002/2025).
--
-- Correção: a marca desfeita fica registrada em contract_sem_ata_desfeitos (quem e quando). A fila mostra o
-- contrato de novo, com o gestor atual, até o coordenador decidir:
--   - marcar de novo "não pertence" (confirm_contract_sem_ata apaga o registro);
--   - ou vincular a uma ata (gatilho em arp_item_contract_links apaga o registro).
-- As marcas desfeitas antes desta migration voltam pelo histórico (audit_logs).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.contract_sem_ata_desfeitos (
  contract_key VARCHAR(100) PRIMARY KEY, -- chave canônica do contrato (a mesma de contract_sem_ata_confirmacoes)
  desfeito_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  desfeito_por_nome VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.contract_sem_ata_desfeitos IS
  'Contratos cuja marca "não pertence a ata" o coordenador desfez: voltam à fila de Vínculos até nova decisão. Grava só por RPC.';

CREATE INDEX IF NOT EXISTS idx_contract_sem_ata_desfeitos_desfeito_por_user_id
  ON public.contract_sem_ata_desfeitos (desfeito_por_user_id);

ALTER TABLE public.contract_sem_ata_desfeitos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: contract_sem_ata_desfeitos" ON public.contract_sem_ata_desfeitos;
CREATE POLICY "Authenticated Read: contract_sem_ata_desfeitos"
  ON public.contract_sem_ata_desfeitos FOR SELECT TO authenticated USING (true);

-- Mesma trava das outras tabelas (migration 124): usuário desativado não lê nada.
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.contract_sem_ata_desfeitos;
CREATE POLICY "Somente usuario ativo" ON public.contract_sem_ata_desfeitos AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));

REVOKE ALL ON public.contract_sem_ata_desfeitos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contract_sem_ata_desfeitos TO authenticated;
GRANT ALL ON public.contract_sem_ata_desfeitos TO service_role;

DROP TRIGGER IF EXISTS trg_audit_contract_sem_ata_desfeitos ON public.contract_sem_ata_desfeitos;
CREATE TRIGGER trg_audit_contract_sem_ata_desfeitos
AFTER INSERT OR UPDATE OR DELETE ON public.contract_sem_ata_desfeitos
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- ------------------------------------------------------------------------------
-- Marcar de novo: igual à migration 69, e apaga a marca desfeita.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_contract_sem_ata(p_contract_key VARCHAR(100))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key VARCHAR(100);
  v_nome VARCHAR(150);
  v_ata TEXT;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador marca que o contrato não pertence a ata.'
      USING ERRCODE = '42501';
  END IF;

  v_key := TRIM(COALESCE(p_contract_key, ''));
  IF v_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A chave do contrato é obrigatória.' USING ERRCODE = '22023';
  END IF;

  SELECT public.ata_key_from_item_key(l.item_key) INTO v_ata
  FROM public.arp_item_contract_links l
  WHERE l.contract_key = v_key
  LIMIT 1;
  IF v_ata IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O contrato % já está vinculado à ata %; desvincule antes de marcar que não pertence a ata.', v_key, v_ata
      USING ERRCODE = '22023';
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

  DELETE FROM public.contract_sem_ata_desfeitos WHERE contract_key = v_key;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- Desfazer: apaga a marca e registra quem desfez (o contrato volta à fila com o gestor atual).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_contract_sem_ata(p_contract_key VARCHAR(100))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key VARCHAR(100);
  v_nome VARCHAR(150);
  v_removidos INTEGER;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador desfaz a marcação de contrato que não pertence a ata.'
      USING ERRCODE = '42501';
  END IF;

  v_key := TRIM(COALESCE(p_contract_key, ''));
  DELETE FROM public.contract_sem_ata_confirmacoes WHERE contract_key = v_key;
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  IF v_removidos > 0 THEN
    SELECT LEFT(COALESCE(
      NULLIF(u.raw_user_meta_data->>'nome', ''),
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      split_part(u.email, '@', 1)
    ), 150)
    INTO v_nome
    FROM auth.users u
    WHERE u.id = auth.uid();

    INSERT INTO public.contract_sem_ata_desfeitos (contract_key, desfeito_por_user_id, desfeito_por_nome)
    VALUES (v_key, auth.uid(), v_nome)
    ON CONFLICT (contract_key) DO UPDATE SET
      desfeito_por_user_id = EXCLUDED.desfeito_por_user_id,
      desfeito_por_nome = EXCLUDED.desfeito_por_nome,
      created_at = NOW();
  END IF;

  RETURN jsonb_build_object('success', true, 'removed', v_removidos > 0);
END;
$$;

-- ------------------------------------------------------------------------------
-- Vinculado a uma ata: deixa de ser "marca desfeita" (o gestor passa a vir da ata, como hoje).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_vinculo_limpa_sem_ata_desfeito()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.contract_sem_ata_desfeitos WHERE contract_key = NEW.contract_key;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_vinculo_limpa_sem_ata_desfeito() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_vinculo_limpa_sem_ata_desfeito ON public.arp_item_contract_links;
CREATE TRIGGER trg_vinculo_limpa_sem_ata_desfeito
AFTER INSERT ON public.arp_item_contract_links
FOR EACH ROW EXECUTE FUNCTION public.trg_vinculo_limpa_sem_ata_desfeito();

-- ------------------------------------------------------------------------------
-- Marcas desfeitas antes desta migration: pelo histórico. Entra o contrato cujo último registro em
-- contract_sem_ata_confirmacoes foi um DELETE feito por uma pessoa, que não está marcado de novo e não tem vínculo
-- com ata (o vínculo também apaga a marca, mas aí o contrato tem link e fica de fora).
-- ------------------------------------------------------------------------------
INSERT INTO public.contract_sem_ata_desfeitos (contract_key, desfeito_por_user_id, desfeito_por_nome, created_at)
SELECT
  ult.contract_key,
  u.id,
  LEFT(COALESCE(NULLIF(u.raw_user_meta_data->>'nome', ''), NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)), 150),
  ult.created_at
FROM (
  SELECT DISTINCT ON (k.contract_key) k.contract_key, a.action, a.user_id, a.created_at
  FROM public.audit_logs a
  CROSS JOIN LATERAL (SELECT COALESCE(a.old_data->>'contract_key', a.new_data->>'contract_key') AS contract_key) k
  WHERE a.entity_type = 'contract_sem_ata_confirmacoes'
    AND k.contract_key IS NOT NULL
  -- Empate de horário: fica o DELETE (se houve nova marca, o NOT EXISTS abaixo já tira o contrato).
  ORDER BY k.contract_key, a.created_at DESC, (a.action = 'DELETE') DESC
) ult
LEFT JOIN auth.users u ON u.id = ult.user_id
WHERE ult.action = 'DELETE'
  AND ult.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.contract_sem_ata_confirmacoes s WHERE s.contract_key = ult.contract_key)
  AND NOT EXISTS (SELECT 1 FROM public.arp_item_contract_links l WHERE l.contract_key = ult.contract_key)
ON CONFLICT (contract_key) DO NOTHING;
