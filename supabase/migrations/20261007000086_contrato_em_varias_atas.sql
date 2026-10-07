-- ==============================================================================
-- MIGRATION 86: CONTRATO EM MAIS DE UMA ATA — CADA ITEM DO CONTRATO EM UMA ATA
-- Versão: 20261007000086_contrato_em_varias_atas.sql
--
-- Caso real: o contrato 00033/2026 tem os itens 10 e 11; o item 10 está registrado na
-- Ata 00053/2025 e o item 11 em outra ata da mesma compra e do mesmo fornecedor. A regra
-- "um contrato pertence a uma só ata" (migration 69) impedia o segundo vínculo.
--
-- 1) Regra nova do vínculo: cada ITEM do contrato pertence a uma só ata.
--    - O contrato pode estar em várias atas, desde que sejam da mesma compra
--      (UASG + número + ano da compra). Sem a compra de alguma das atas no banco, não há
--      como conferir: o vínculo é recusado.
--    - O mesmo número de item não pode estar em duas atas do mesmo contrato (o número do
--      item da ata é o número do item na compra, então seria o mesmo item do contrato).
--
-- 2) Gestor (decisão da CGLIC de 07/10/2026):
--    - Contrato numa ata só: nada muda (migrations 69 e 70).
--    - Contrato já em outra ata, vinculado a uma ata de OUTRO gestor: o contrato continua
--      com o gestor que tem. Quem vincula não decide o gestor; o coordenador recebe o aviso
--      GESTORES_DIFERENTES e decide na Central. Quando é o próprio coordenador que vincula,
--      ele escolhe na tela, na hora, e não há aviso.
--    - Ata sem gestor: assume o gestor do contrato, como já era (migration 70).
--    - Troca do gestor de uma ata: o contrato acompanha só se as outras atas dele não têm
--      outro gestor; senão o contrato fica como está e o coordenador é avisado.
--
-- 3) marcar_avisos_distribuicao_lidos(p_ids): marca avisos escolhidos. Sem ids, marca todos
--    menos os GESTORES_DIFERENTES, que só saem quando o coordenador decide.
--
-- Nada é regravado nos vínculos existentes.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0) Novo tipo de aviso
-- ------------------------------------------------------------------------------
ALTER TABLE public.distribuicao_avisos DROP CONSTRAINT IF EXISTS distribuicao_avisos_tipo_check;
ALTER TABLE public.distribuicao_avisos ADD CONSTRAINT distribuicao_avisos_tipo_check
  CHECK (tipo IN ('CONTRATO_REALINHADO', 'ATA_ASSUMIU_GESTOR', 'GESTORES_DIFERENTES'));

-- Número do item a partir da chave do item ("00059/2025-200331-00011" → 11).
CREATE OR REPLACE FUNCTION public.numero_item_from_item_key(p_item_key TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(substring(TRIM(COALESCE(p_item_key, '')) FROM '^\d{5}/\d{4}-\d{6}-([0-9]+)$'), '')::INTEGER;
$$;

REVOKE ALL ON FUNCTION public.numero_item_from_item_key(TEXT) FROM PUBLIC, anon, authenticated;

-- Compra da ata ("00059/2025-200331" → "200331-90-2025"); nula quando a ata não tem a compra no banco.
CREATE OR REPLACE FUNCTION public.compra_da_ata(p_ata_uasg TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.codigo_uasg || '-' || COALESCE(NULLIF(ltrim(TRIM(a.numero_compra), '0'), ''), '0') || '-' || TRIM(a.ano_compra)
  FROM public.atas_registro_preco a
  WHERE a.numero_ata || '-' || a.codigo_uasg = p_ata_uasg
    AND COALESCE(TRIM(a.numero_compra), '') <> ''
    AND COALESCE(TRIM(a.ano_compra), '') <> ''
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.compra_da_ata(TEXT) FROM PUBLIC, anon, authenticated;

-- Aviso GESTORES_DIFERENTES, sem repetir um que ainda não foi lido para o mesmo par ata × contrato.
CREATE OR REPLACE FUNCTION public.avisar_gestores_diferentes(
  p_ata_key TEXT,
  p_contract_key TEXT,
  p_gestor_contrato TEXT,
  p_gestor_ata TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.distribuicao_avisos d
    WHERE d.tipo = 'GESTORES_DIFERENTES' AND d.lido_em IS NULL
      AND d.ata_key = p_ata_key AND d.contract_key = p_contract_key
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.distribuicao_avisos (tipo, ata_key, contract_key, gestor_anterior, gestor_novo, feito_por_user_id, feito_por_nome)
  VALUES ('GESTORES_DIFERENTES', p_ata_key, p_contract_key, p_gestor_contrato, p_gestor_ata, auth.uid(), public.nome_do_usuario_logado());
END;
$$;

REVOKE ALL ON FUNCTION public.avisar_gestores_diferentes(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 1) Cada item do contrato, uma ata — checagem ANTES de gravar o vínculo
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_vinculo_contrato_uma_ata ON public.arp_item_contract_links;
DROP FUNCTION IF EXISTS public.trg_vinculo_contrato_uma_ata();

CREATE OR REPLACE FUNCTION public.trg_vinculo_item_do_contrato_uma_ata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata TEXT;
  v_item INTEGER;
  v_compra TEXT;
  v_outro RECORD;
BEGIN
  v_ata := public.ata_uasg_from_item_key(NEW.item_key);
  IF v_ata IS NULL THEN
    RETURN NEW; -- chave de item fora do padrão: não há como comparar
  END IF;
  v_item := public.numero_item_from_item_key(NEW.item_key);

  FOR v_outro IN
    SELECT DISTINCT public.ata_uasg_from_item_key(l.item_key) AS ata, public.numero_item_from_item_key(l.item_key) AS item
    FROM public.arp_item_contract_links l
    WHERE l.contract_key = NEW.contract_key
      AND public.ata_uasg_from_item_key(l.item_key) IS DISTINCT FROM v_ata
      AND (TG_OP = 'INSERT' OR l.id IS DISTINCT FROM NEW.id)
  LOOP
    IF v_item IS NOT NULL AND v_outro.item = v_item THEN
      RAISE EXCEPTION 'ITEM_EM_OUTRA_ATA: O item % do contrato já está vinculado à ata %. Cada item do contrato pertence a uma só ata.',
        v_item, split_part(v_outro.ata, '-', 1)
        USING ERRCODE = '23514';
    END IF;

    v_compra := COALESCE(v_compra, public.compra_da_ata(v_ata));
    IF v_compra IS NULL OR public.compra_da_ata(v_outro.ata) IS DISTINCT FROM v_compra THEN
      RAISE EXCEPTION 'CONTRATO_OUTRA_COMPRA: O contrato já está vinculado à ata %, que não é da mesma compra desta ata (ou a compra de uma delas não está no banco). Um contrato só fica em várias atas da mesma compra.',
        split_part(v_outro.ata, '-', 1)
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_vinculo_item_do_contrato_uma_ata() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_vinculo_item_do_contrato_uma_ata() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_vinculo_item_do_contrato_uma_ata ON public.arp_item_contract_links;
CREATE TRIGGER trg_vinculo_item_do_contrato_uma_ata
BEFORE INSERT OR UPDATE OF item_key, contract_key ON public.arp_item_contract_links
FOR EACH ROW EXECUTE FUNCTION public.trg_vinculo_item_do_contrato_uma_ata();

-- ------------------------------------------------------------------------------
-- 2a) Herança ao vincular (substitui a da migration 70)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_vinculo_herda_gestor_da_ata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata TEXT;
  v_manager RECORD;
  v_contrato RECORD;
  v_outro RECORD;
  v_nome VARCHAR(150);
  v_em_outra_ata BOOLEAN;
BEGIN
  -- Vinculado a uma ata: deixa de ser "não pertence a ata".
  DELETE FROM public.contract_sem_ata_confirmacoes WHERE contract_key = NEW.contract_key;

  v_ata := public.ata_key_from_item_key(NEW.item_key);
  v_nome := public.nome_do_usuario_logado();

  SELECT am.gestor_nome, am.gestor_user_id INTO v_manager
  FROM public.ata_managers am
  WHERE am.ata_key = v_ata;

  SELECT cm.gestor_nome, cm.gestor_user_id INTO v_contrato
  FROM public.contract_managers cm
  WHERE cm.contract_key = NEW.contract_key;

  v_em_outra_ata := EXISTS (
    SELECT 1 FROM public.arp_item_contract_links l
    WHERE l.contract_key = NEW.contract_key
      AND l.id <> NEW.id
      AND public.ata_uasg_from_item_key(l.item_key) IS DISTINCT FROM public.ata_uasg_from_item_key(NEW.item_key)
  );

  IF v_manager.gestor_nome IS NOT NULL THEN
    IF v_em_outra_ata AND v_contrato.gestor_nome IS NOT NULL AND v_contrato.gestor_nome <> v_manager.gestor_nome THEN
      -- O contrato já está em outra ata e com outro gestor: fica como está. Quem decide é o coordenador;
      -- se foi ele quem vinculou, já decidiu na tela.
      IF NOT public.has_role('admin') THEN
        PERFORM public.avisar_gestores_diferentes(v_ata, NEW.contract_key, v_contrato.gestor_nome, v_manager.gestor_nome);
      END IF;

    -- A ata tem gestor: o contrato passa a ser dele. Só avisa quando tirou o contrato de outra pessoa.
    ELSIF public.herdar_gestor_da_ata(NEW.contract_key, v_manager.gestor_nome, v_manager.gestor_user_id)
       AND v_contrato.gestor_nome IS NOT NULL
       AND v_contrato.gestor_nome <> v_manager.gestor_nome THEN
      INSERT INTO public.distribuicao_avisos (tipo, ata_key, contract_key, gestor_anterior, gestor_novo, feito_por_user_id, feito_por_nome)
      VALUES ('CONTRATO_REALINHADO', v_ata, NEW.contract_key, v_contrato.gestor_nome, v_manager.gestor_nome, auth.uid(), v_nome);
    END IF;

  ELSIF v_contrato.gestor_nome IS NOT NULL AND v_ata IS NOT NULL THEN
    -- A ata não tem gestor e o contrato tem: a ata passa a ser do gestor do contrato.
    -- Os outros contratos já vinculados a ela vão acompanhar (gatilho de propagação, no INSERT abaixo);
    -- avisa antes, enquanto ainda mostram o gestor de antes.
    FOR v_outro IN
      SELECT DISTINCT l.contract_key, cm.gestor_nome
      FROM public.arp_item_contract_links l
      JOIN public.contract_managers cm ON cm.contract_key = l.contract_key
      WHERE public.ata_key_from_item_key(l.item_key) = v_ata
        AND l.contract_key <> NEW.contract_key
        AND cm.gestor_nome <> v_contrato.gestor_nome
    LOOP
      INSERT INTO public.distribuicao_avisos (tipo, ata_key, contract_key, gestor_anterior, gestor_novo, feito_por_user_id, feito_por_nome)
      VALUES ('CONTRATO_REALINHADO', v_ata, v_outro.contract_key, v_outro.gestor_nome, v_contrato.gestor_nome, auth.uid(), v_nome);
    END LOOP;

    INSERT INTO public.distribuicao_avisos (tipo, ata_key, contract_key, gestor_anterior, gestor_novo, feito_por_user_id, feito_por_nome)
    VALUES ('ATA_ASSUMIU_GESTOR', v_ata, NEW.contract_key, NULL, v_contrato.gestor_nome, auth.uid(), v_nome);

    INSERT INTO public.ata_managers (ata_key, gestor_nome, gestor_user_id, created_at, updated_at)
    VALUES (v_ata, v_contrato.gestor_nome, v_contrato.gestor_user_id, NOW(), NOW())
    ON CONFLICT (ata_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2b) Troca do gestor da ata (substitui a da migration 69)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_ata_manager_propaga_contratos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contrato TEXT;
  v_gestor_contrato TEXT;
BEGIN
  FOR v_contrato IN
    SELECT DISTINCT l.contract_key
    FROM public.arp_item_contract_links l
    WHERE public.ata_key_from_item_key(l.item_key) = NEW.ata_key
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.arp_item_contract_links l
      JOIN public.ata_managers am ON am.ata_key = public.ata_key_from_item_key(l.item_key)
      WHERE l.contract_key = v_contrato
        AND am.ata_key <> NEW.ata_key
        AND am.gestor_nome <> NEW.gestor_nome
    ) THEN
      -- O contrato está também numa ata de outro gestor: não troca sozinho; o coordenador decide.
      SELECT cm.gestor_nome INTO v_gestor_contrato FROM public.contract_managers cm WHERE cm.contract_key = v_contrato;
      IF v_gestor_contrato IS DISTINCT FROM NEW.gestor_nome THEN
        PERFORM public.avisar_gestores_diferentes(NEW.ata_key, v_contrato, v_gestor_contrato, NEW.gestor_nome);
      END IF;
    ELSE
      PERFORM public.herdar_gestor_da_ata(v_contrato, NEW.gestor_nome, NEW.gestor_user_id);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3) Marcar avisos como lidos
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.marcar_avisos_distribuicao_lidos();

CREATE OR REPLACE FUNCTION public.marcar_avisos_distribuicao_lidos(p_ids UUID[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_qtd INTEGER;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador lê os avisos de distribuição.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.distribuicao_avisos
  SET lido_em = NOW(), lido_por_user_id = auth.uid()
  WHERE lido_em IS NULL
    AND (CASE WHEN p_ids IS NULL THEN tipo <> 'GESTORES_DIFERENTES' ELSE id = ANY (p_ids) END);
  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'lidos', v_qtd);
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_avisos_distribuicao_lidos(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_avisos_distribuicao_lidos(UUID[]) TO authenticated;
