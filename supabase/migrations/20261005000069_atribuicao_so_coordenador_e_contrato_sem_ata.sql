-- ==============================================================================
-- MIGRATION 69: DISTRIBUIÇÃO — ATRIBUIÇÃO SÓ DO COORDENADOR, HERANÇA DO GESTOR
--               DA ATA E CONTRATO QUE NÃO PERTENCE A ATA
-- Versão: 20261005000069_atribuicao_so_coordenador_e_contrato_sem_ata.sql
--
-- Regra da CGLIC: quem cuida da ata cuida de todos os contratos vinculados a ela.
-- O coordenador atribui a ATA (Central de Distribuição); o servidor vincula os
-- contratos aos itens da ata (Ata 360 / item); o banco leva o gestor junto.
--
-- 1) Atribuição de gestor só para o coordenador (admin): save_ata_manager_atomic e
--    save_contract_manager_atomic deixam de aceitar o perfil "gestor".
-- 2) Um contrato pertence a UMA ata: vincular o contrato a item de outra ata é
--    recusado (vários itens da mesma ata continuam permitidos).
-- 3) Herança do gestor:
--    a) ao vincular contrato a item de ata que tem gestor, o contrato recebe esse
--       gestor (a ata prevalece sobre um gestor anterior do contrato);
--    b) ao trocar o gestor da ata, todos os contratos vinculados acompanham.
--    A troca fica em audit_logs (trigger de auditoria de contract_managers).
-- 4) contract_sem_ata_confirmacoes: o coordenador marca que o contrato não
--    pertence a ata (sai das sugestões de vínculo e da fila da Central). Não é
--    permitido marcar contrato já vinculado; vincular depois apaga a marcação.
-- 5) Acerto inicial: alinha os contratos já vinculados ao gestor da ata.
--
-- Chave do gestor da ata = número da ata ("00059/2025"), como em ata_managers
-- (sem UASG). Chave do item = "00059/2025-200331-00001". Chave do contrato =
-- "200331-00160-2026" (UASG-NÚMERO-ANO).
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
-- 1b) Gestor do contrato — só admin (corpo idêntico ao da migration 37, fora a checagem)
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
-- Auxiliares internas (sem permissão de execução para usuários)
-- ------------------------------------------------------------------------------

-- Número da ata a partir da chave do item ("00059/2025-200331-00001" → "00059/2025").
CREATE OR REPLACE FUNCTION public.ata_key_from_item_key(p_item_key TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT substring(TRIM(COALESCE(p_item_key, '')) FROM '^(\d{5}/\d{4})-\d{6}-[0-9]+$');
$$;

-- Ata com UASG a partir da chave do item ("00059/2025-200331-00001" → "00059/2025-200331").
CREATE OR REPLACE FUNCTION public.ata_uasg_from_item_key(p_item_key TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT substring(TRIM(COALESCE(p_item_key, '')) FROM '^(\d{5}/\d{4}-\d{6})-[0-9]+$');
$$;

-- Grava o gestor herdado da ata no contrato. Não regrava quando já é o mesmo
-- (evita linhas repetidas na auditoria). Chave fora do padrão UASG-NÚMERO-ANO:
-- não grava (a divergência continua visível na Central). Devolve TRUE se gravou.
CREATE OR REPLACE FUNCTION public.herdar_gestor_da_ata(
  p_contract_key TEXT,
  p_gestor_nome TEXT,
  p_gestor_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parts TEXT[];
BEGIN
  IF p_gestor_nome IS NULL OR TRIM(p_gestor_nome) = '' THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contract_managers cm
    WHERE cm.contract_key = p_contract_key
      AND cm.gestor_nome = p_gestor_nome
      AND cm.gestor_user_id IS NOT DISTINCT FROM p_gestor_user_id
  ) THEN
    RETURN FALSE;
  END IF;

  v_parts := regexp_match(TRIM(COALESCE(p_contract_key, '')), '^(\d{6})-(.+)-(\d{4})$');
  IF v_parts IS NULL THEN
    RAISE NOTICE 'herdar_gestor_da_ata: chave de contrato fora do padrão, não herdado: %', p_contract_key;
    RETURN FALSE;
  END IF;

  INSERT INTO public.contract_managers (contract_key, uasg, numero, ano, gestor_nome, gestor_user_id, created_at, updated_at)
  VALUES (p_contract_key, v_parts[1], v_parts[2], v_parts[3]::INTEGER, p_gestor_nome, p_gestor_user_id, NOW(), NOW())
  ON CONFLICT (contract_key) DO UPDATE SET
    gestor_nome = EXCLUDED.gestor_nome,
    gestor_user_id = EXCLUDED.gestor_user_id,
    updated_at = NOW();
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.ata_key_from_item_key(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ata_uasg_from_item_key(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.herdar_gestor_da_ata(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4) Contrato que não pertence a ata (marcação do coordenador)
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
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador desfaz a marcação de contrato que não pertence a ata.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.contract_sem_ata_confirmacoes WHERE contract_key = TRIM(COALESCE(p_contract_key, ''));
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'removed', v_removidos > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_contract_sem_ata(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_contract_sem_ata(VARCHAR) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2) Um contrato, uma ata — checagem ANTES de gravar o vínculo
-- (o vínculo é gravado com ON CONFLICT; a checagem roda também nesse caso)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_vinculo_contrato_uma_ata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata TEXT;
  v_outra TEXT;
BEGIN
  v_ata := public.ata_uasg_from_item_key(NEW.item_key);
  IF v_ata IS NULL THEN
    RETURN NEW; -- chave de item fora do padrão: não há como comparar
  END IF;

  SELECT public.ata_uasg_from_item_key(l.item_key) INTO v_outra
  FROM public.arp_item_contract_links l
  WHERE l.contract_key = NEW.contract_key
    AND public.ata_uasg_from_item_key(l.item_key) IS DISTINCT FROM v_ata
    AND (TG_OP = 'INSERT' OR l.id IS DISTINCT FROM NEW.id)
  LIMIT 1;

  IF v_outra IS NOT NULL THEN
    RAISE EXCEPTION 'CONTRATO_OUTRA_ATA: O contrato % já está vinculado à ata %. Um contrato pertence a uma só ata.',
      NEW.contract_key, split_part(v_outra, '-', 1)
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vinculo_contrato_uma_ata ON public.arp_item_contract_links;
CREATE TRIGGER trg_vinculo_contrato_uma_ata
BEFORE INSERT OR UPDATE OF item_key, contract_key ON public.arp_item_contract_links
FOR EACH ROW EXECUTE FUNCTION public.trg_vinculo_contrato_uma_ata();

-- ------------------------------------------------------------------------------
-- 3a) Herança ao vincular — DEPOIS de gravar um vínculo novo
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_vinculo_herda_gestor_da_ata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_manager RECORD;
BEGIN
  -- Vinculado a uma ata: deixa de ser "não pertence a ata".
  DELETE FROM public.contract_sem_ata_confirmacoes WHERE contract_key = NEW.contract_key;

  SELECT am.gestor_nome, am.gestor_user_id INTO v_manager
  FROM public.ata_managers am
  WHERE am.ata_key = public.ata_key_from_item_key(NEW.item_key);

  IF FOUND THEN
    PERFORM public.herdar_gestor_da_ata(NEW.contract_key, v_manager.gestor_nome, v_manager.gestor_user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vinculo_herda_gestor_da_ata ON public.arp_item_contract_links;
CREATE TRIGGER trg_vinculo_herda_gestor_da_ata
AFTER INSERT ON public.arp_item_contract_links
FOR EACH ROW EXECUTE FUNCTION public.trg_vinculo_herda_gestor_da_ata();

-- ------------------------------------------------------------------------------
-- 3b) Herança ao trocar o gestor da ata — contratos vinculados acompanham
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_ata_manager_propaga_contratos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contrato TEXT;
BEGIN
  FOR v_contrato IN
    SELECT DISTINCT l.contract_key
    FROM public.arp_item_contract_links l
    WHERE public.ata_key_from_item_key(l.item_key) = NEW.ata_key
  LOOP
    PERFORM public.herdar_gestor_da_ata(v_contrato, NEW.gestor_nome, NEW.gestor_user_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ata_manager_propaga_contratos ON public.ata_managers;
CREATE TRIGGER trg_ata_manager_propaga_contratos
AFTER INSERT OR UPDATE OF gestor_nome, gestor_user_id ON public.ata_managers
FOR EACH ROW EXECUTE FUNCTION public.trg_ata_manager_propaga_contratos();

-- ------------------------------------------------------------------------------
-- 5) Acerto inicial: contratos já vinculados passam a ter o gestor da ata
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_par RECORD;
  v_alterados INTEGER := 0;
  v_conflitos INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_conflitos FROM (
    SELECT l.contract_key
    FROM public.arp_item_contract_links l
    GROUP BY l.contract_key
    HAVING COUNT(DISTINCT public.ata_uasg_from_item_key(l.item_key)) > 1
  ) c;
  IF v_conflitos > 0 THEN
    RAISE NOTICE 'Atenção: % contrato(s) já vinculado(s) a mais de uma ata (a regra nova vale para os próximos vínculos).', v_conflitos;
  END IF;

  FOR v_par IN
    SELECT DISTINCT l.contract_key, am.gestor_nome, am.gestor_user_id
    FROM public.arp_item_contract_links l
    JOIN public.ata_managers am ON am.ata_key = public.ata_key_from_item_key(l.item_key)
  LOOP
    IF public.herdar_gestor_da_ata(v_par.contract_key, v_par.gestor_nome, v_par.gestor_user_id) THEN
      v_alterados := v_alterados + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Acerto inicial: % contrato(s) passaram a ter o gestor da ata.', v_alterados;
END;
$$;
