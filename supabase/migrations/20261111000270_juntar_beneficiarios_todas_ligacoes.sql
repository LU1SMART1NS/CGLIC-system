-- ==============================================================================
-- Versão: 20261111000270_juntar_beneficiarios_todas_ligacoes.sql
-- Juntar beneficiários de emenda passa a repassar TUDO o que aponta para o beneficiário que sai.
--
-- A função (última versão na migration 172) só repassava emenda_pedido_linhas e depois apagava o que sai.
-- Ligações que nasceram depois ficaram de fora:
--   - emendas_siop.beneficiario_id (migration 206) e fisc_entregas.beneficiario_id (migration 260): sem ON DELETE,
--     a junção dava erro de chave estrangeira quando o que sai tinha emenda sem pedido ou entrega na Fiscalização;
--   - emenda_beneficiario_grupo (218) e emenda_beneficiarios_diferentes (166): ON DELETE CASCADE, o grupo
--     confirmado e os pares "não são o mesmo" do que sai se perdiam.
-- Achado 1.2 da auditoria de informação duplicada (docs/estudos/auditoria-duplicacao-modulos.md).
--
-- Mesma assinatura: CREATE OR REPLACE mantém as permissões. O retorno ganha "emendas" e "entregas".
-- emenda_beneficiarios_juntados.ficou_id (ON DELETE SET NULL) é histórico e não muda.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.juntar_beneficiarios_emenda(p_fica uuid, p_fica_versao integer, p_sai uuid, p_sai_versao integer, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  f       public.emenda_beneficiarios%ROWTYPE;
  s       public.emenda_beneficiarios%ROWTYPE;
  v_quem  TEXT;
  v_linhas INTEGER;
  v_emendas INTEGER;
  v_entregas INTEGER;
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

  -- Tudo o que aponta para o que sai passa para o que fica (migration 270): sem isso a junção dava erro de
  -- chave estrangeira (emendas sem pedido, entregas da Fiscalização) ou perdia o grupo e os pares "diferentes".
  UPDATE public.emendas_siop SET beneficiario_id = f.id WHERE beneficiario_id = s.id;
  GET DIAGNOSTICS v_emendas = ROW_COUNT;
  UPDATE public.fisc_entregas SET beneficiario_id = f.id WHERE beneficiario_id = s.id;
  GET DIAGNOSTICS v_entregas = ROW_COUNT;
  -- Grupo: vale o do que fica; o do que sai só entra se o que fica não tinha.
  INSERT INTO public.emenda_beneficiario_grupo (beneficiario_id, grupo, confirmado_por, confirmado_por_nome, confirmado_em)
  SELECT f.id, g.grupo, g.confirmado_por, g.confirmado_por_nome, g.confirmado_em
    FROM public.emenda_beneficiario_grupo g WHERE g.beneficiario_id = s.id
  ON CONFLICT (beneficiario_id) DO NOTHING;
  -- Pares "não são o mesmo" do que sai valem para o que fica (menos o par entre os dois, que some com ele).
  INSERT INTO public.emenda_beneficiarios_diferentes (a_id, b_id, decidido_por, decidido_por_nome, decidido_em)
  SELECT LEAST(f.id, o.outro), GREATEST(f.id, o.outro), d.decidido_por, d.decidido_por_nome, d.decidido_em
    FROM public.emenda_beneficiarios_diferentes d
   CROSS JOIN LATERAL (SELECT CASE WHEN d.a_id = s.id THEN d.b_id ELSE d.a_id END AS outro) o
   WHERE (d.a_id = s.id OR d.b_id = s.id) AND o.outro <> f.id
  ON CONFLICT (a_id, b_id) DO NOTHING;

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

  RETURN jsonb_build_object('id', f.id, 'versao', v_versao, 'linhas', v_linhas, 'emendas', v_emendas, 'entregas', v_entregas);
END;
$function$;
