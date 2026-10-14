-- ==============================================================================
-- Conflito de edição: quem salva por último não apaga mais o trabalho do outro
--
-- Antes, nestas gravações o último a salvar vencia em silêncio (a tela tinha
-- dados de até alguns minutos atrás e regravava a lista inteira):
--   - nota de empenho aos itens do contrato (vincular, informar quantidade,
--     desfazer) — inclusive o lote "Vincular pela sugestão", que sobrescrevia
--     a nota que outro gestor acabara de vincular à mão;
--   - quantidades da ata assinada e das adesões;
--   - divisão do contrato entre as unidades (dividir e desfazer).
--
-- Agora a tela lê uma "versão" junto com os dados e a devolve ao salvar
-- (p_versao_vista). A RPC pega a mesma trava que já usava, recalcula a versão
-- e, se mudou, recusa com CONFLITO_EDICAO (40001). Sem p_versao_vista (servidor,
-- tela antiga), tudo funciona como antes.
--
-- Versão = md5 do estado que a tela edita (vazio também tem versão):
--   versao_nota_itens(nota)          vínculo + parcelas da nota no contrato
--   versao_ata_assinada(item)        lista da ata assinada + último registro
--   versao_adesoes(item)             adesões com quantidade informada
--   versao_divisao(item, contrato)   divisão + unidades
-- Leitura pela tela:
--   - coluna calculada versao_edicao em v_contrato_empenho_distribuicao e em
--     v_arp_item_contrato_quantidade (vem na mesma consulta dos dados);
--   - versao_quantitativos_item(item), lida ANTES dos quantitativos.
--
-- As RPCs ganham o parâmetro por DROP + CREATE a partir de pg_get_functiondef
-- (mantém o corpo, a conferência do gestor da migration 126 e as permissões).
-- ==============================================================================

-- 1. Versões --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.versao_nota_itens(p_contrato_empenho_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT md5(
    COALESCE((SELECT d.origem || '|' || COALESCE(d.valor_nota::TEXT, '') || '|' || COALESCE(d.distribuido_em::TEXT, '')
                FROM public.contrato_empenho_distribuicoes d
               WHERE d.contrato_empenho_id = p_contrato_empenho_id), '-')
    || '#' ||
    COALESCE((SELECT string_agg(i.numero_item::TEXT || ':' || COALESCE(i.valor::TEXT, '') || ':' || COALESCE(i.quantidade_informada::TEXT, ''),
                                ',' ORDER BY i.numero_item)
                FROM public.contrato_empenho_itens i
               WHERE i.contrato_empenho_id = p_contrato_empenho_id), '')
  );
$$;

CREATE OR REPLACE FUNCTION public.versao_ata_assinada(p_item_key TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT md5(
    COALESCE((SELECT string_agg(q.uasg || ':' || q.quantidade::TEXT, ',' ORDER BY q.uasg)
                FROM public.ata_item_quantidade_assinada q
               WHERE q.item_key = p_item_key), '')
    || '#' ||
    COALESCE((SELECT r.id::TEXT
                FROM public.ata_item_assinada_registros r
               WHERE r.item_key = p_item_key
               ORDER BY r.informado_em DESC, r.id DESC
               LIMIT 1), '')
  );
$$;

CREATE OR REPLACE FUNCTION public.versao_adesoes(p_item_key TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT md5(COALESCE((
    SELECT string_agg(a.uasg || ':' || a.aprovada_em::TEXT || ':' || a.quantidade::TEXT || ':' || a.informado_em::TEXT,
                      ',' ORDER BY a.uasg, a.aprovada_em)
      FROM public.adesao_quantidade_informada a
     WHERE a.item_key = p_item_key), ''));
$$;

CREATE OR REPLACE FUNCTION public.versao_divisao(p_item_key TEXT, p_contract_key TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT md5(
    COALESCE((SELECT d.origem || '|' || COALESCE(d.quantidade_contrato::TEXT, '') || '|' || COALESCE(d.dividido_em::TEXT, '')
                FROM public.contrato_item_divisoes d
               WHERE d.item_key = p_item_key AND d.contract_key = p_contract_key), '-')
    || '#' ||
    COALESCE((SELECT string_agg(u.unit_name || ':' || u.quantidade::TEXT, ',' ORDER BY u.unit_name)
                FROM public.contrato_item_divisao_unidades u
               WHERE u.item_key = p_item_key AND u.contract_key = p_contract_key), '')
  );
$$;

-- Colunas calculadas (PostgREST: select=*,versao_edicao).
CREATE OR REPLACE FUNCTION public.versao_edicao(r public.v_contrato_empenho_distribuicao)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$ SELECT public.versao_nota_itens(r.contrato_empenho_id) $$;

CREATE OR REPLACE FUNCTION public.versao_edicao(r public.v_arp_item_contrato_quantidade)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$ SELECT public.versao_divisao(r.item_key, r.contract_key) $$;

-- Quantitativos do item: a tela lê antes das demais consultas.
CREATE OR REPLACE FUNCTION public.versao_quantitativos_item(p_item_key TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'assinada', public.versao_ata_assinada(btrim(COALESCE(p_item_key, ''))),
    'adesoes', public.versao_adesoes(btrim(COALESCE(p_item_key, '')))
  );
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.versao_nota_itens(uuid)', 'public.versao_ata_assinada(text)', 'public.versao_adesoes(text)',
    'public.versao_divisao(text, text)', 'public.versao_edicao(public.v_contrato_empenho_distribuicao)',
    'public.versao_edicao(public.v_arp_item_contrato_quantidade)', 'public.versao_quantitativos_item(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$$;

-- 2. p_versao_vista nas RPCs ----------------------------------------------------
DO $$
DECLARE
  -- {RPC, trava (a mesma que o corpo já usa), versão atual}
  v_alvos TEXT[][] := ARRAY[
    ['vincular_empenho_aos_itens',
     'PERFORM pg_advisory_xact_lock(hashtext(''distribuir_empenho:'' || COALESCE(p_contrato_empenho_id::TEXT, '''')));',
     'public.versao_nota_itens(p_contrato_empenho_id)'],
    ['informar_quantidade_empenho_item',
     'PERFORM pg_advisory_xact_lock(hashtext(''distribuir_empenho:'' || COALESCE(p_contrato_empenho_id::TEXT, '''')));',
     'public.versao_nota_itens(p_contrato_empenho_id)'],
    ['desfazer_distribuicao_empenho',
     'PERFORM pg_advisory_xact_lock(hashtext(''distribuir_empenho:'' || COALESCE(p_contrato_empenho_id::TEXT, '''')));',
     'public.versao_nota_itens(p_contrato_empenho_id)'],
    ['informar_quantidades_ata_assinada',
     'PERFORM pg_advisory_xact_lock(hashtext(''ata_assinada:'' || btrim(COALESCE(p_item_key, ''''))));',
     'public.versao_ata_assinada(btrim(COALESCE(p_item_key, '''')))'],
    ['informar_quantidade_adesao',
     'PERFORM pg_advisory_xact_lock(hashtext(''adesao_informada:'' || btrim(COALESCE(p_item_key, ''''))));',
     'public.versao_adesoes(btrim(COALESCE(p_item_key, '''')))'],
    ['dividir_contrato_nas_unidades',
     'PERFORM 1 FROM public.arp_item_contract_links WHERE item_key = btrim(COALESCE(p_item_key, '''')) AND contract_key = btrim(COALESCE(p_contract_key, '''')) FOR UPDATE;',
     'public.versao_divisao(btrim(COALESCE(p_item_key, '''')), btrim(COALESCE(p_contract_key, '''')))'],
    ['desfazer_divisao_contrato_unidades',
     'PERFORM 1 FROM public.arp_item_contract_links WHERE item_key = btrim(COALESCE(p_item_key, '''')) AND contract_key = btrim(COALESCE(p_contract_key, '''')) FOR UPDATE;',
     'public.versao_divisao(btrim(COALESCE(p_item_key, '''')), btrim(COALESCE(p_contract_key, '''')))']
  ];
  i INT;
  v_oid OID;
  v_acl ACLITEM[];
  v_def TEXT;
  v_novo TEXT;
  v_pos INT;
  v_corpo INT;
  v_marca TEXT := '-- alcance do gestor (migration 126)';
  v_bloco TEXT;
  v_ass TEXT;
  g RECORD;
  v_n INT := 0;
BEGIN
  FOR i IN 1 .. array_length(v_alvos, 1) LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = v_alvos[i][1]) <> 1 THEN
      RAISE EXCEPTION 'RPC % não encontrada ou com mais de uma versão', v_alvos[i][1];
    END IF;
    SELECT p.oid, p.proacl INTO v_oid, v_acl
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_alvos[i][1];

    v_def := pg_get_functiondef(v_oid);
    CONTINUE WHEN v_def LIKE '%p_versao_vista%';

    -- Novo parâmetro no fim da lista.
    v_pos := position(E')\n RETURNS ' IN v_def);
    IF v_pos = 0 THEN
      RAISE EXCEPTION 'RPC %: fim da lista de parâmetros não encontrado', v_alvos[i][1];
    END IF;
    v_novo := substr(v_def, 1, v_pos - 1) || ', p_versao_vista text DEFAULT NULL::text' || substr(v_def, v_pos);

    -- Conferência depois da do gestor (126) ou, sem ela, logo após o BEGIN principal.
    v_bloco := format(
      E'  -- conflito de edição (migration 129)\n'
      '  IF p_versao_vista IS NOT NULL THEN\n'
      '    %s\n'
      '    IF %s IS DISTINCT FROM p_versao_vista THEN\n'
      '      RAISE EXCEPTION ''CONFLITO_EDICAO: Outra pessoa alterou isto enquanto você editava.'' USING ERRCODE = ''40001'';\n'
      '    END IF;\n'
      '  END IF;\n',
      v_alvos[i][2], v_alvos[i][3]
    );
    v_pos := position(v_marca IN v_novo);
    IF v_pos > 0 THEN
      v_pos := v_pos + length(v_marca) + 1;  -- depois do fim da linha
    ELSE
      v_corpo := position('$function$' IN v_novo);
      v_pos := position(E'\nBEGIN\n' IN substr(v_novo, v_corpo));
      IF v_pos = 0 OR v_pos <> regexp_instr(substr(v_novo, v_corpo), '\mBEGIN\M') - 1 THEN
        RAISE EXCEPTION 'RPC %: BEGIN principal não encontrado com segurança', v_alvos[i][1];
      END IF;
      v_pos := v_corpo - 1 + v_pos + length(E'\nBEGIN\n');
    END IF;
    v_novo := substr(v_novo, 1, v_pos - 1) || v_bloco || substr(v_novo, v_pos);

    EXECUTE format('DROP FUNCTION %s', v_oid::regprocedure);
    EXECUTE v_novo;

    -- Mesmas permissões de antes.
    SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) INTO v_ass
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_alvos[i][1];
    IF v_acl IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_ass);
      FOR g IN SELECT a.grantee FROM aclexplode(v_acl) a WHERE a.privilege_type = 'EXECUTE' LOOP
        IF g.grantee = 0 THEN
          EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', v_ass);
        ELSE
          EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_ass, g.grantee::regrole::TEXT);
        END IF;
      END LOOP;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'RPCs com conferência de conflito: % de %', v_n, array_length(v_alvos, 1);
END
$$;

NOTIFY pgrst, 'reload schema';
