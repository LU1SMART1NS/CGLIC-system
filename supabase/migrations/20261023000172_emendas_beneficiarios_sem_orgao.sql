-- ==============================================================================
-- MIGRATION 172: EMENDAS — SAI O CAMPO ÓRGÃO DO BENEFICIÁRIO
-- Versão: 20261023000172_emendas_beneficiarios_sem_orgao.sql
--
-- Decisão de 23/10/2026: o órgão (Polícia Militar, Corpo de Bombeiros Militar... da migration 165) deixa de existir.
-- O quadro do Anexo sai sem a coluna ÓRGÃO e, nas listas, embaixo do nome aparece a razão social do CNPJ vinculado.
-- salvar_beneficiario_emenda e juntar_beneficiarios_emenda deixam de gravar o órgão (mesmas assinaturas e
-- permissões) e a coluna é apagada com a sua conferência. Aplicar depois que o site novo, que não lê nem envia o
-- órgão, estiver publicado.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.salvar_beneficiario_emenda(p_beneficiario JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b        JSONB := p_beneficiario;
  v_id     UUID;
  v_cnpj   TEXT;
  v_cep    TEXT;
  v_nome   TEXT;
  v_chave  TEXT;
  v_quem   TEXT;
  v_versao INTEGER;
  v_atual  INTEGER;
  v_antigo TEXT;
  v_tel    TEXT;
  v_uf     TEXT;
  v_igual  TEXT;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador cadastram beneficiários.' USING ERRCODE = '42501';
  END IF;
  IF b IS NULL OR jsonb_typeof(b) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o beneficiário deve ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;

  v_nome := left(regexp_replace(btrim(COALESCE(b->>'nome', '')), '\s+', ' ', 'g'), 300);
  IF public.chave_nome_beneficiario(v_nome) IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o nome do beneficiário.' USING ERRCODE = '22023';
  END IF;
  v_cnpj := NULLIF(regexp_replace(COALESCE(b->>'cnpj', ''), '\D', '', 'g'), '');
  IF v_cnpj IS NOT NULL AND NOT public.cnpj_valido(v_cnpj) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: CNPJ inválido.' USING ERRCODE = '22023';
  END IF;
  v_cep := NULLIF(regexp_replace(COALESCE(b->>'entrega_cep', ''), '\D', '', 'g'), '');
  IF v_cep IS NOT NULL AND v_cep !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o CEP de entrega tem 8 números.' USING ERRCODE = '22023';
  END IF;
  v_uf := NULLIF(upper(btrim(COALESCE(b->>'entrega_uf', ''))), '');
  IF v_uf IS NOT NULL AND v_uf !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: UF de entrega inválida.' USING ERRCODE = '22023';
  END IF;
  v_tel := NULLIF(regexp_replace(COALESCE(b->>'responsavel_telefone', ''), '\D', '', 'g'), '');
  v_quem := left(public.nome_do_usuario_logado(), 200);
  v_id := NULLIF(b->>'id', '')::UUID;
  v_chave := public.chave_nome_beneficiario(v_nome || ' ' || COALESCE(NULLIF(btrim(b->>'entrega_municipio'), ''), '') || ' ' || COALESCE(v_uf, ''));

  -- Repetido: mesmo nome e local de outro cadastro, ou igual a uma grafia guardada nele.
  SELECT e.nome || COALESCE(' (' || e.entrega_municipio || COALESCE('/' || e.entrega_uf, '') || ')', ' (' || e.entrega_uf || ')', '') INTO v_igual
    FROM public.emenda_beneficiarios e
   WHERE e.id IS DISTINCT FROM v_id
     AND (e.chave_identidade = v_chave OR EXISTS (SELECT 1 FROM unnest(e.outros_nomes) o WHERE public.chave_nome_beneficiario(o) = v_chave))
   LIMIT 1;
  IF v_igual IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICADO: Já existe o beneficiário "%". Abra esse cadastro em vez de criar outro.', v_igual USING ERRCODE = '23505';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.emenda_beneficiarios (
      nome, nome_curto, sigla, cnpj, razao_social, natureza_juridica, ente_federativo, situacao_cadastral, sede_endereco,
      sede_municipio, sede_uf, sede_cep, sede_telefone, sede_email, receita_lida_em, entrega_cep, entrega_logradouro,
      entrega_numero, entrega_complemento, entrega_bairro, entrega_municipio, entrega_uf, responsavel_nome,
      responsavel_cargo, responsavel_telefone, responsavel_whatsapp, responsavel_email, ativo, origem,
      criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (
      v_nome, NULLIF(btrim(b->>'nome_curto'), ''), NULLIF(left(btrim(b->>'sigla'), 40), ''), v_cnpj, NULLIF(btrim(b->>'razao_social'), ''),
      NULLIF(btrim(b->>'natureza_juridica'), ''), NULLIF(btrim(b->>'ente_federativo'), ''),
      NULLIF(btrim(b->>'situacao_cadastral'), ''), NULLIF(btrim(b->>'sede_endereco'), ''), NULLIF(btrim(b->>'sede_municipio'), ''),
      NULLIF(upper(btrim(b->>'sede_uf')), ''), NULLIF(regexp_replace(COALESCE(b->>'sede_cep', ''), '\D', '', 'g'), ''),
      NULLIF(btrim(b->>'sede_telefone'), ''), NULLIF(btrim(b->>'sede_email'), ''), NULLIF(b->>'receita_lida_em', '')::TIMESTAMPTZ,
      v_cep, NULLIF(btrim(b->>'entrega_logradouro'), ''), NULLIF(btrim(b->>'entrega_numero'), ''),
      NULLIF(btrim(b->>'entrega_complemento'), ''), NULLIF(btrim(b->>'entrega_bairro'), ''),
      NULLIF(btrim(b->>'entrega_municipio'), ''), v_uf, NULLIF(btrim(b->>'responsavel_nome'), ''),
      NULLIF(btrim(b->>'responsavel_cargo'), ''), v_tel, COALESCE((b->>'responsavel_whatsapp')::BOOLEAN, FALSE),
      NULLIF(lower(btrim(b->>'responsavel_email')), ''), COALESCE((b->>'ativo')::BOOLEAN, TRUE), 'CADASTRO',
      auth.uid(), v_quem, auth.uid(), v_quem)
    RETURNING id, versao INTO v_id, v_versao;
    RETURN jsonb_build_object('id', v_id, 'versao', v_versao);
  END IF;

  SELECT versao, nome INTO v_atual, v_antigo FROM public.emenda_beneficiarios WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Beneficiário não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF (b->>'versao')::INTEGER IS DISTINCT FROM v_atual THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este beneficiário. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;

  UPDATE public.emenda_beneficiarios SET
    nome = v_nome, nome_curto = NULLIF(btrim(b->>'nome_curto'), ''), sigla = NULLIF(left(btrim(b->>'sigla'), 40), ''),
    -- O nome antigo continua valendo como grafia: a busca acha e ninguém cria outro com ele.
    outros_nomes = CASE WHEN public.chave_nome_beneficiario(v_antigo) = public.chave_nome_beneficiario(v_nome) OR v_antigo = ANY(outros_nomes)
                        THEN outros_nomes ELSE array_append(outros_nomes, v_antigo::TEXT) END,
    cnpj = v_cnpj, razao_social = NULLIF(btrim(b->>'razao_social'), ''), natureza_juridica = NULLIF(btrim(b->>'natureza_juridica'), ''),
    ente_federativo = NULLIF(btrim(b->>'ente_federativo'), ''), situacao_cadastral = NULLIF(btrim(b->>'situacao_cadastral'), ''),
    sede_endereco = NULLIF(btrim(b->>'sede_endereco'), ''), sede_municipio = NULLIF(btrim(b->>'sede_municipio'), ''),
    sede_uf = NULLIF(upper(btrim(b->>'sede_uf')), ''), sede_cep = NULLIF(regexp_replace(COALESCE(b->>'sede_cep', ''), '\D', '', 'g'), ''),
    sede_telefone = NULLIF(btrim(b->>'sede_telefone'), ''), sede_email = NULLIF(btrim(b->>'sede_email'), ''),
    receita_lida_em = CASE WHEN v_cnpj IS NULL THEN NULL ELSE COALESCE(NULLIF(b->>'receita_lida_em', '')::TIMESTAMPTZ, receita_lida_em) END,
    entrega_cep = v_cep, entrega_logradouro = NULLIF(btrim(b->>'entrega_logradouro'), ''),
    entrega_numero = NULLIF(btrim(b->>'entrega_numero'), ''), entrega_complemento = NULLIF(btrim(b->>'entrega_complemento'), ''),
    entrega_bairro = NULLIF(btrim(b->>'entrega_bairro'), ''), entrega_municipio = NULLIF(btrim(b->>'entrega_municipio'), ''),
    entrega_uf = v_uf, responsavel_nome = NULLIF(btrim(b->>'responsavel_nome'), ''),
    responsavel_cargo = NULLIF(btrim(b->>'responsavel_cargo'), ''), responsavel_telefone = v_tel,
    responsavel_whatsapp = COALESCE((b->>'responsavel_whatsapp')::BOOLEAN, FALSE),
    responsavel_email = NULLIF(lower(btrim(b->>'responsavel_email')), ''), ativo = COALESCE((b->>'ativo')::BOOLEAN, ativo),
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_quem, atualizado_em = NOW()
  WHERE id = v_id
  RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', v_id, 'versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_beneficiario_emenda(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_beneficiario_emenda(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.juntar_beneficiarios_emenda(
  p_fica UUID, p_fica_versao INTEGER, p_sai UUID, p_sai_versao INTEGER, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  f       public.emenda_beneficiarios%ROWTYPE;
  s       public.emenda_beneficiarios%ROWTYPE;
  v_quem  TEXT;
  v_linhas INTEGER;
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador juntam beneficiários.' USING ERRCODE = '42501';
  END IF;
  IF p_fica IS NULL OR p_sai IS NULL OR p_fica = p_sai THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha dois beneficiários diferentes.' USING ERRCODE = '22023';
  END IF;
  IF btrim(COALESCE(p_motivo, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: diga por que os dois são o mesmo beneficiário.' USING ERRCODE = '22023';
  END IF;

  -- Trava na ordem do id: duas junções ao mesmo tempo não se prendem uma à outra.
  PERFORM 1 FROM public.emenda_beneficiarios WHERE id IN (p_fica, p_sai) ORDER BY id FOR UPDATE;
  SELECT * INTO f FROM public.emenda_beneficiarios WHERE id = p_fica;
  SELECT * INTO s FROM public.emenda_beneficiarios WHERE id = p_sai;
  IF f.id IS NULL OR s.id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Beneficiário não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF f.versao IS DISTINCT FROM p_fica_versao OR s.versao IS DISTINCT FROM p_sai_versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou um dos beneficiários. Recarregue e refaça a junção.' USING ERRCODE = '40001';
  END IF;
  IF f.cnpj IS NOT NULL AND s.cnpj IS NOT NULL AND f.cnpj <> s.cnpj THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: os dois têm CNPJ diferentes. Confira antes de juntar.' USING ERRCODE = '22023';
  END IF;
  v_quem := left(public.nome_do_usuario_logado(), 200);

  UPDATE public.emenda_pedido_linhas SET beneficiario_id = f.id WHERE beneficiario_id = s.id;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  INSERT INTO public.emenda_beneficiarios_juntados (ficou_id, ficou_nome, saiu_id, saiu_nome, saiu_cnpj, linhas, motivo, juntado_por, juntado_por_nome)
  VALUES (f.id, f.nome, s.id, s.nome, s.cnpj, v_linhas, btrim(p_motivo), auth.uid(), v_quem);

  DELETE FROM public.emenda_beneficiarios WHERE id = s.id;

  -- O que fica guarda as grafias do outro e herda o que só o outro tinha.
  UPDATE public.emenda_beneficiarios SET
    outros_nomes = ARRAY(SELECT DISTINCT x FROM unnest(f.outros_nomes || s.outros_nomes || ARRAY[s.nome::TEXT]) x
                          WHERE x <> f.nome ORDER BY x),
    nome_curto = COALESCE(f.nome_curto, s.nome_curto),
    sigla = COALESCE(f.sigla, s.sigla),
    cnpj = COALESCE(f.cnpj, s.cnpj),
    razao_social = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.razao_social ELSE f.razao_social END,
    natureza_juridica = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.natureza_juridica ELSE f.natureza_juridica END,
    ente_federativo = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.ente_federativo ELSE f.ente_federativo END,
    situacao_cadastral = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.situacao_cadastral ELSE f.situacao_cadastral END,
    sede_endereco = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.sede_endereco ELSE f.sede_endereco END,
    sede_municipio = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.sede_municipio ELSE f.sede_municipio END,
    sede_uf = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.sede_uf ELSE f.sede_uf END,
    sede_cep = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.sede_cep ELSE f.sede_cep END,
    sede_telefone = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.sede_telefone ELSE f.sede_telefone END,
    sede_email = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.sede_email ELSE f.sede_email END,
    receita_lida_em = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.receita_lida_em ELSE f.receita_lida_em END,
    -- Endereço de entrega e responsável vão juntos (um endereço pela metade não serve).
    entrega_cep = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_cep ELSE f.entrega_cep END,
    entrega_logradouro = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_logradouro ELSE f.entrega_logradouro END,
    entrega_numero = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_numero ELSE f.entrega_numero END,
    entrega_complemento = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_complemento ELSE f.entrega_complemento END,
    entrega_bairro = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_bairro ELSE f.entrega_bairro END,
    entrega_municipio = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_municipio ELSE COALESCE(f.entrega_municipio, s.entrega_municipio) END,
    entrega_uf = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_uf ELSE COALESCE(f.entrega_uf, s.entrega_uf) END,
    responsavel_nome = CASE WHEN f.responsavel_nome IS NULL THEN s.responsavel_nome ELSE f.responsavel_nome END,
    responsavel_cargo = CASE WHEN f.responsavel_nome IS NULL THEN s.responsavel_cargo ELSE f.responsavel_cargo END,
    responsavel_telefone = CASE WHEN f.responsavel_nome IS NULL THEN s.responsavel_telefone ELSE f.responsavel_telefone END,
    responsavel_whatsapp = CASE WHEN f.responsavel_nome IS NULL THEN s.responsavel_whatsapp ELSE f.responsavel_whatsapp END,
    responsavel_email = CASE WHEN f.responsavel_nome IS NULL THEN s.responsavel_email ELSE f.responsavel_email END,
    ativo = f.ativo OR s.ativo,
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_quem, atualizado_em = NOW()
  WHERE id = f.id
  RETURNING versao INTO v_versao;

  RETURN jsonb_build_object('id', f.id, 'versao', v_versao, 'linhas', v_linhas);
END;
$$;
REVOKE ALL ON FUNCTION public.juntar_beneficiarios_emenda(UUID, INTEGER, UUID, INTEGER, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.juntar_beneficiarios_emenda(UUID, INTEGER, UUID, INTEGER, TEXT) TO authenticated;

ALTER TABLE public.emenda_beneficiarios DROP CONSTRAINT IF EXISTS emenda_beneficiarios_orgao;
ALTER TABLE public.emenda_beneficiarios DROP COLUMN IF EXISTS orgao;
