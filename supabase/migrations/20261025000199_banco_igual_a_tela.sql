-- ==============================================================================
-- Migration 199: o banco recusa o que a tela já esconde
--
-- Continuação da revisão de visibilidade por perfil (migration 198). Protótipo
-- aprovado em 25/10/2026, com a opção A para os Modelos de Gestão. Regra de
-- 14/10/2026 (migration 126): o gestor só altera o que é dele, o coordenador
-- altera tudo, a leitura continua aberta a quem está logado.
--
-- 1. save_empenho_soberano_atomic (botão "Atualizar empenhos" do Contrato 360):
--    o gestor grava nota nova ou nota ligada a algum contrato dele. Nota que já
--    existe sem contrato (emendas) ou só em contratos de outro gestor fica com o
--    servidor e o coordenador. As seis RPCs antigas de nota → item já saíram do
--    banco na migration 99.
-- 2. link_contract_to_items_atomic: o alcance era conferido só pelo primeiro
--    item; agora cada item (basta o contrato ou a ata daquele item ser dele).
-- 3. resolver_aviso / reexibir_aviso: o gestor de saldo só marca avisos de saldo
--    (os que a tela dele mostra); o gestor só os dos contratos e atas dele (o
--    contrato ou a ata vêm na chave do aviso). Emendas como antes.
-- 4. gravar_cadastro_uasgs: nenhuma tela grava o cadastro; só o servidor.
-- 5. Modelos de Gestão: só o coordenador cria, edita e exclui. Aplicar o modelo
--    no plano do contrato ou da ata não muda (já confere o alcance).
--
-- Só regras: nenhum dado é alterado. As RPCs trocadas por pg_get_functiondef
-- mantêm as permissões que tinham (CREATE OR REPLACE não mexe nelas).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Nota de empenho: o gestor só regrava nota de contrato dele
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exigir_alcance_da_nota(p_canonical_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_empenho_id UUID;
BEGIN
  IF auth.uid() IS NULL OR public.eh_service_role() THEN
    RETURN;
  END IF;

  -- Só o perfil gestor (sem ser coordenador) tem alcance limitado, como em exigir_alcance_do_gestor.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_id = 'gestor')
     OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_id = 'admin') THEN
    RETURN;
  END IF;

  SELECT e.id INTO v_empenho_id FROM public.empenhos e WHERE e.canonical_key = p_canonical_key;
  IF v_empenho_id IS NULL THEN
    RETURN;  -- nota nova: vem da fonte do contrato; o vínculo ao contrato confere o alcance
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contrato_empenhos ce
     WHERE ce.empenho_id = v_empenho_id
       AND public.gestor_alcanca_contrato(ce.contract_key)
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'FORA_DO_ALCANCE: Esta nota é de contrato de outro gestor ou das emendas. Só o gestor do contrato ou o coordenador pode atualizar.'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.exigir_alcance_da_nota(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exigir_alcance_da_nota(TEXT) TO authenticated, service_role;

DO $$
DECLARE
  v_def TEXT;
  v_alvo CONSTANT TEXT := E'  SELECT * INTO v_existing FROM public.empenhos WHERE canonical_key = v_canonical_key;\n';
BEGIN
  v_def := pg_get_functiondef('public.save_empenho_soberano_atomic(jsonb)'::regprocedure);
  IF v_def LIKE '%exigir_alcance_da_nota%' THEN
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, v_alvo, ''))) / length(v_alvo) <> 1 THEN
    RAISE EXCEPTION 'save_empenho_soberano_atomic: leitura da nota existente não encontrada com segurança';
  END IF;
  -- Antes da leitura da nota: o FOUND que vem logo depois continua sendo o dessa leitura.
  EXECUTE replace(v_def, v_alvo,
    E'  PERFORM public.exigir_alcance_da_nota(v_canonical_key);  -- alcance do gestor (migration 199)\n' || v_alvo);
END
$$;

-- ------------------------------------------------------------------------------
-- 2. Contrato aos itens da ata: alcance conferido em cada item
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_def TEXT;
  v_antes CONSTANT TEXT := E'  PERFORM public.exigir_alcance_do_gestor((p_contract_key)::text, (public.ata_key_from_item_key(p_item_keys->>0))::text);  -- alcance do gestor (migration 126)\n';
  v_depois CONSTANT TEXT :=
    E'  -- Alcance do gestor em cada item: basta o contrato ou a ata daquele item ser dele (migrations 126 e 199).\n'
    || E'  IF jsonb_typeof(p_item_keys) = ''array'' AND jsonb_array_length(p_item_keys) > 0 THEN\n'
    || E'    PERFORM public.exigir_alcance_do_gestor((p_contract_key)::text, (public.ata_key_from_item_key(btrim(k.valor)))::text)\n'
    || E'       FROM jsonb_array_elements_text(p_item_keys) AS k(valor);\n'
    || E'  ELSE\n'
    || E'    PERFORM public.exigir_alcance_do_gestor((p_contract_key)::text, NULL);\n'
    || E'  END IF;\n';
BEGIN
  v_def := pg_get_functiondef('public.link_contract_to_items_atomic(varchar,jsonb,text)'::regprocedure);
  IF v_def LIKE '%migrations 126 e 199%' THEN
    RETURN;
  END IF;
  IF position(v_antes IN v_def) = 0 THEN
    RAISE EXCEPTION 'link_contract_to_items_atomic: conferência da migration 126 não encontrada';
  END IF;
  EXECUTE replace(v_def, v_antes, v_depois);
END
$$;

-- ------------------------------------------------------------------------------
-- 3. Avisos resolvidos: gestor de saldo só os de saldo; gestor só os dele
-- ------------------------------------------------------------------------------
-- Formatos (src/services/avisosResolvidosService.ts e centralPrazosService.ts):
--   SALDO::<ata>-<uasg>::…          FONTE::<contrato>::…
--   REAJUSTE::<contrato>::<ciclo>   REAJUSTE::ATA-<ata>-<uasg>::…
--   LEMBRETE::CONTRATO::<contrato>::…   LEMBRETE::ARP::<ata>-<uasg>[-<item>]::…
-- Chave que não se reconhece vai inteira como ata: para o gestor, não é dele.
CREATE OR REPLACE FUNCTION public.exigir_alcance_do_aviso(p_chave TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo TEXT := split_part(p_chave, '::', 1);
  v_alvo TEXT := split_part(p_chave, '::', 2);
  v_contrato TEXT;
  v_ata TEXT;
BEGIN
  IF v_tipo = 'SALDO' THEN
    v_ata := public.chave_gestao_ata(v_alvo);
  ELSIF v_tipo = 'FONTE' THEN
    v_contrato := v_alvo;
  ELSIF v_tipo = 'REAJUSTE' AND v_alvo LIKE 'ATA-%' THEN
    v_ata := public.chave_gestao_ata(substr(v_alvo, 5));
  ELSIF v_tipo = 'REAJUSTE' THEN
    v_contrato := v_alvo;
  ELSIF v_tipo = 'LEMBRETE' AND v_alvo = 'CONTRATO' THEN
    v_contrato := split_part(p_chave, '::', 3);
  ELSIF v_tipo = 'LEMBRETE' AND v_alvo = 'ARP' THEN
    v_ata := public.chave_gestao_ata((regexp_match(split_part(p_chave, '::', 3), '^(\d{5}/\d{4}-\d{6})'))[1]);
  END IF;

  IF NULLIF(v_contrato, '') IS NULL AND NULLIF(v_ata, '') IS NULL THEN
    v_ata := p_chave;
  END IF;

  PERFORM public.exigir_alcance_do_gestor(NULLIF(v_contrato, ''), NULLIF(v_ata, ''));
END;
$$;

REVOKE ALL ON FUNCTION public.exigir_alcance_do_aviso(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exigir_alcance_do_aviso(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolver_aviso(p_chave text, p_tipo text, p_justificativa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_chave TEXT := btrim(COALESCE(p_chave, ''));
  v_tipo TEXT := upper(btrim(COALESCE(p_tipo, '')));
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
BEGIN
  -- Migration 187: empenhado × pedido das emendas é resolvido por quem gere as emendas.
  IF v_tipo = 'EMPENHO' THEN
    IF public.has_permission('emendas.manage') IS NOT TRUE THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador marcam este aviso como resolvido.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (public.has_role('gestor') OR public.has_role('admin') OR public.has_role('gestor_saldos')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor, coordenador ou gestor de saldo marcam aviso como resolvido.'
      USING ERRCODE = '42501';
  END IF;
  -- Migration 199: o gestor de saldo só vê os avisos de saldo (has_role('gestor') vale também para o coordenador).
  IF v_tipo NOT IN ('SALDO', 'EMPENHO') AND NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: O gestor de saldo só marca como resolvidos os avisos de saldo.'
      USING ERRCODE = '42501';
  END IF;
  -- Migration 142: registrado acima do homologado é conferido e corrigido pelo gestor da ata.
  IF v_chave LIKE '%::REGISTRADO-ACIMA-%' AND NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Este aviso é resolvido pelo gestor da ata ou pelo coordenador.'
      USING ERRCODE = '42501';
  END IF;

  IF v_tipo NOT IN ('SALDO', 'REAJUSTE', 'LEMBRETE', 'FONTE', 'EMPENHO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Este tipo de aviso não pode ser marcado como resolvido.' USING ERRCODE = '22023';
  END IF;
  IF v_chave = '' OR length(v_chave) > 300 OR v_chave NOT LIKE v_tipo || '::%' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Aviso não identificado.' USING ERRCODE = '22023';
  END IF;
  -- Migration 199: o gestor só resolve os avisos dos contratos e atas dele.
  IF v_tipo <> 'EMPENHO' THEN
    PERFORM public.exigir_alcance_do_aviso(v_chave);
  END IF;
  IF char_length(v_just) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escreva a justificativa com pelo menos 10 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A justificativa pode ter no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.avisos_resolvidos (chave, tipo, justificativa, resolvido_por, resolvido_por_nome, resolvido_em)
  VALUES (v_chave, v_tipo, v_just, auth.uid(), public.nome_do_usuario_logado(), NOW())
  ON CONFLICT (chave) DO UPDATE
    SET justificativa = EXCLUDED.justificativa,
        resolvido_por = EXCLUDED.resolvido_por,
        resolvido_por_nome = EXCLUDED.resolvido_por_nome,
        resolvido_em = EXCLUDED.resolvido_em;

  RETURN jsonb_build_object('success', true, 'chave', v_chave);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reexibir_aviso(p_chave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_chave TEXT := btrim(COALESCE(p_chave, ''));
BEGIN
  IF v_chave LIKE 'EMPENHO::%' THEN
    IF public.has_permission('emendas.manage') IS NOT TRUE THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador reexibem este aviso.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (public.has_role('gestor') OR public.has_role('admin') OR public.has_role('gestor_saldos')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor, coordenador ou gestor de saldo reexibem aviso.'
      USING ERRCODE = '42501';
  END IF;
  -- Migration 199: o gestor de saldo só vê os avisos de saldo.
  IF v_chave NOT LIKE 'SALDO::%' AND v_chave NOT LIKE 'EMPENHO::%' AND NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: O gestor de saldo só reexibe os avisos de saldo.'
      USING ERRCODE = '42501';
  END IF;
  IF v_chave LIKE '%::REGISTRADO-ACIMA-%' AND NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Este aviso é reexibido pelo gestor da ata ou pelo coordenador.'
      USING ERRCODE = '42501';
  END IF;
  -- Migration 199: o gestor só reexibe os avisos dos contratos e atas dele.
  IF v_chave NOT LIKE 'EMPENHO::%' THEN
    PERFORM public.exigir_alcance_do_aviso(v_chave);
  END IF;

  DELETE FROM public.avisos_resolvidos WHERE chave = v_chave;

  RETURN jsonb_build_object('success', true, 'chave', v_chave);
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4. Cadastro de UASGs: só o servidor grava (a sincronização da noite)
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.gravar_cadastro_uasgs(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_cadastro_uasgs(jsonb) TO service_role;

-- ------------------------------------------------------------------------------
-- 5. Modelos de Gestão: só o coordenador cria, edita e exclui
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_nome TEXT;
  v_oid OID;
  v_def TEXT;
  v_corpo INT;
  v_pos INT;
  v_novas INT := 0;
  v_linha CONSTANT TEXT :=
    E'  IF NOT public.has_role(''admin'') THEN  -- só o coordenador altera os modelos (migration 199)\n'
    || E'    RAISE EXCEPTION ''UNAUTHORIZED: Só o coordenador altera os modelos de gestão.''\n'
    || E'      USING ERRCODE = ''42501'';\n'
    || E'  END IF;\n';
BEGIN
  FOREACH v_nome IN ARRAY ARRAY[
    'save_contract_task_template_atomic', 'delete_contract_task_template_atomic',
    'save_contract_task_template_macrotask_atomic', 'delete_contract_task_template_macrotask_atomic',
    'save_contract_task_template_task_atomic', 'delete_contract_task_template_task_atomic',
    'save_ata_task_template_atomic', 'delete_ata_task_template_atomic',
    'save_ata_task_template_macrotask_atomic', 'delete_ata_task_template_macrotask_atomic',
    'save_ata_task_template_task_atomic', 'delete_ata_task_template_task_atomic'
  ] LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = v_nome) <> 1 THEN
      RAISE EXCEPTION 'RPC % não encontrada ou com mais de uma versão', v_nome;
    END IF;
    SELECT p.oid INTO v_oid
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'public' AND p.proname = v_nome AND l.lanname = 'plpgsql';
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'RPC % não é plpgsql', v_nome;
    END IF;

    v_def := pg_get_functiondef(v_oid);
    CONTINUE WHEN v_def LIKE '%só o coordenador altera os modelos (migration 199)%';

    -- BEGIN principal: a primeira palavra BEGIN do corpo, sozinha na linha (como na migration 126).
    v_corpo := position('$function$' IN v_def);
    v_pos := position(E'\nBEGIN\n' IN substr(v_def, v_corpo));
    IF v_pos = 0 OR v_pos <> regexp_instr(substr(v_def, v_corpo), '\mBEGIN\M') - 1 THEN
      RAISE EXCEPTION 'RPC %: BEGIN principal não encontrado com segurança', v_nome;
    END IF;
    v_pos := v_corpo - 1 + v_pos + length(E'\nBEGIN\n');

    EXECUTE substr(v_def, 1, v_pos - 1) || v_linha || substr(v_def, v_pos);
    v_novas := v_novas + 1;
    v_oid := NULL;
  END LOOP;

  RAISE NOTICE 'Modelos de gestão só com o coordenador: % RPCs', v_novas;
END
$$;
