-- Fiscalização: o beneficiário escrito à mão na planilha da SFC/CGLIC (origem CARGA, beneficiario_id nulo) ganha o
-- cadastro de beneficiários (o mesmo das Emendas). Medição de 11/11/2026: 1.959 itens, nenhum ligado; 581 nomes × UF.
-- 1) fisc_chave_do_nome(texto): fisc_normalizar sem a UF no fim ("Polícia Civil - DF" → "policia civil").
-- 2) ligar_entregas_ao_beneficiario(ids, beneficiário): quem registra a fiscalização escolhe o cadastro. Liga os itens
--    escolhidos e todos os outros com o mesmo nome escrito e a mesma UF (em qualquer contrato); o nome escrito entra nas
--    outras grafias do cadastro; histórico tipo BENEFICIARIO com quem ligou.
-- 3) fisc_ligar_beneficiarios_automaticos(): liga sozinho quando um único cadastro ativo da mesma UF tem o nome, a
--    sigla, a razão social ou outra grafia igual ao escrito. Roda agora e de hora em hora (nova carga, grafia nova).

ALTER TABLE public.fisc_entrega_movimentos DROP CONSTRAINT IF EXISTS fisc_entrega_movimentos_tipo;
ALTER TABLE public.fisc_entrega_movimentos ADD CONSTRAINT fisc_entrega_movimentos_tipo
  CHECK (tipo IN ('CRIADA', 'ETAPA', 'DIVISAO', 'PREVISTA', 'RESPONSAVEL', 'AUTOMATICA', 'CARGA', 'PROGRAMA', 'ITEM', 'BENEFICIARIO'));

CREATE OR REPLACE FUNCTION public.fisc_chave_do_nome(p_texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT btrim(regexp_replace(public.fisc_normalizar(p_texto),
    ' (ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)$', ''));
$function$;

-- A UF do item da planilha e a do cadastro batem (ou falta uma delas).
CREATE OR REPLACE FUNCTION public.fisc_mesma_uf(p_a text, p_b text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NULLIF(btrim(COALESCE(p_a, '')), '') IS NULL OR NULLIF(btrim(COALESCE(p_b, '')), '') IS NULL
      OR upper(btrim(p_a)) = upper(btrim(p_b));
$function$;

CREATE OR REPLACE FUNCTION public.ligar_entregas_ao_beneficiario(p_ids uuid[], p_beneficiario_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_b     public.emenda_beneficiarios%ROWTYPE;
  v_n     INTEGER;
  v_nome  TEXT := left(public.nome_do_usuario_logado(), 200);
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem permissão para registrar a fiscalização.' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 OR p_beneficiario_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha os itens e o beneficiário do cadastro.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_b FROM public.emenda_beneficiarios WHERE id = p_beneficiario_id FOR UPDATE;
  IF NOT FOUND OR NOT v_b.ativo THEN
    RAISE EXCEPTION 'NOT_FOUND: Beneficiário não encontrado no cadastro (ou desativado).' USING ERRCODE = 'P0002';
  END IF;
  SELECT count(*) INTO v_n FROM public.fisc_entregas WHERE id = ANY (p_ids);
  IF v_n <> cardinality(ARRAY(SELECT DISTINCT unnest(p_ids))) THEN
    RAISE EXCEPTION 'NOT_FOUND: Item não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_ids) AND (beneficiario_id IS NOT NULL OR NULLIF(btrim(COALESCE(beneficiario_texto, '')), '') IS NULL)) THEN
    RAISE EXCEPTION 'JA_LIGADO: Algum dos itens já tem beneficiário do cadastro. Atualize a tela.' USING ERRCODE = '22023';
  END IF;

  -- Os escolhidos e os outros com o mesmo nome escrito e a mesma UF.
  CREATE TEMP TABLE IF NOT EXISTS fisc_ligar_benef (id uuid, texto text) ON COMMIT DROP;
  TRUNCATE fisc_ligar_benef;
  INSERT INTO fisc_ligar_benef
  SELECT e.id, e.beneficiario_texto
    FROM public.fisc_entregas e
   WHERE e.beneficiario_id IS NULL
     AND (public.fisc_chave_do_nome(e.beneficiario_texto), upper(btrim(COALESCE(e.uf_texto, '')))) IN (
           SELECT public.fisc_chave_do_nome(x.beneficiario_texto), upper(btrim(COALESCE(x.uf_texto, '')))
             FROM public.fisc_entregas x WHERE x.id = ANY (p_ids))
     FOR UPDATE OF e;

  UPDATE public.fisc_entregas e SET beneficiario_id = v_b.id, atualizado_por_nome = v_nome, atualizado_em = NOW()
    FROM fisc_ligar_benef l WHERE e.id = l.id;
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, observacao, criado_por, criado_por_nome)
  SELECT l.id, 'BENEFICIARIO', 'Ligado a ' || v_b.nome || ' (na planilha: "' || l.texto || '")', auth.uid(), v_nome
    FROM fisc_ligar_benef l;

  -- O nome escrito vira outra grafia do cadastro (sem repetir o nome nem o que já está lá).
  UPDATE public.emenda_beneficiarios b
     SET outros_nomes = ARRAY(
           SELECT DISTINCT x FROM unnest(COALESCE(b.outros_nomes, ARRAY[]::TEXT[]) || ARRAY(SELECT DISTINCT btrim(l.texto) FROM fisc_ligar_benef l)) x
            WHERE public.fisc_normalizar(x) <> public.fisc_normalizar(b.nome))
   WHERE b.id = v_b.id;

  SELECT count(*) INTO v_n FROM fisc_ligar_benef;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.ligar_entregas_ao_beneficiario(uuid[], uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ligar_entregas_ao_beneficiario(uuid[], uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fisc_ligar_beneficiarios_automaticos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_n INTEGER;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS fisc_benef_auto (id uuid, beneficiario_id uuid) ON COMMIT DROP;
  TRUNCATE fisc_benef_auto;

  WITH nomes AS (
    SELECT b.id, b.entrega_uf::TEXT AS uf, public.fisc_chave_do_nome(n) AS chave
      FROM public.emenda_beneficiarios b
      CROSS JOIN LATERAL unnest(ARRAY[b.nome::TEXT, b.sigla::TEXT, b.razao_social::TEXT] || COALESCE(b.outros_nomes, ARRAY[]::TEXT[])) n
     WHERE b.ativo AND NULLIF(btrim(COALESCE(n, '')), '') IS NOT NULL
  ),
  casam AS (
    SELECT e.id, array_agg(DISTINCT n.id) AS ids
      FROM public.fisc_entregas e
      JOIN nomes n ON n.chave <> '' AND n.chave = public.fisc_chave_do_nome(e.beneficiario_texto) AND public.fisc_mesma_uf(n.uf, e.uf_texto)
     WHERE e.beneficiario_id IS NULL AND NULLIF(btrim(COALESCE(e.beneficiario_texto, '')), '') IS NOT NULL
     GROUP BY e.id
  )
  INSERT INTO fisc_benef_auto SELECT id, ids[1] FROM casam WHERE cardinality(ids) = 1;

  UPDATE public.fisc_entregas e SET beneficiario_id = a.beneficiario_id, atualizado_por_nome = 'Ligação automática', atualizado_em = NOW()
    FROM fisc_benef_auto a WHERE e.id = a.id AND e.beneficiario_id IS NULL;
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, observacao, criado_por_nome)
  SELECT a.id, 'BENEFICIARIO', 'Ligado sozinho a ' || b.nome || ': mesmo nome no cadastro (na planilha: "' || e.beneficiario_texto || '")', 'Ligação automática'
    FROM fisc_benef_auto a
    JOIN public.emenda_beneficiarios b ON b.id = a.beneficiario_id
    JOIN public.fisc_entregas e ON e.id = a.id;

  SELECT count(*) INTO v_n FROM fisc_benef_auto;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.fisc_ligar_beneficiarios_automaticos() FROM PUBLIC, anon, authenticated, service_role;

SELECT public.fisc_ligar_beneficiarios_automaticos();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fiscalizacao-ligar-beneficiarios') THEN
      PERFORM cron.unschedule('fiscalizacao-ligar-beneficiarios');
    END IF;
    PERFORM cron.schedule('fiscalizacao-ligar-beneficiarios', '14 * * * *', 'SELECT public.fisc_ligar_beneficiarios_automaticos()');
  END IF;
END $$;
