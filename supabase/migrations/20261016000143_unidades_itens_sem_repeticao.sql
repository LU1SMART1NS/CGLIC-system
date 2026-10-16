-- Migration 143: cópia dos órgãos do item sem linhas repetidas (16/10/2026)
--
-- Desde 09/10/2026 o Compras.gov.br às vezes devolve cada órgão duas vezes na consulta 3_consultarUnidadesItem
-- (as cópias só mudam o codigoPdm). Com a página de 50 linhas, a cópia ficou com órgãos faltando, a soma do
-- registrado dobrou e o histórico anotou mudanças falsas. O servidor passa a ler todas as páginas e tirar as
-- cópias (src/utils/unidadesRepetidas.ts); aqui, a defesa do banco:
--
-- 1) registrado_por_uasg ignora linhas iguais repetidas (órgão, fornecedor, quantidade e datas). Corrige já a
--    soma das cópias gravadas em dobro (ex.: 00069/2025-200331-00005). Item com dois fornecedores continua
--    somando uma linha por fornecedor.
-- 2) gravar_unidades_itens não grava lista com o mesmo órgão duas vezes para o mesmo fornecedor (cópia e
--    histórico ficam como estão). Resto igual à migration 109.
--
-- Mesmas assinaturas: CREATE OR REPLACE mantém as permissões e as views que usam registrado_por_uasg.

CREATE OR REPLACE FUNCTION public.registrado_por_uasg(p_unidades JSONB)
RETURNS TABLE (uasg VARCHAR, nome_orgao TEXT, tipo_unidade TEXT, quantidade NUMERIC, incluido_em TIMESTAMP, atualizado_em TIMESTAMP)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT x.uasg::VARCHAR,
         max(x.nome) AS nome_orgao,
         max(x.tipo) AS tipo_unidade,
         sum(x.qtd) AS quantidade,
         min(x.inc) AS incluido_em,
         max(x.atu) AS atualizado_em
    FROM (
      -- Migration 143: DISTINCT tira linhas iguais repetidas pela fonte (o mesmo órgão, fornecedor, quantidade
      -- e datas); linhas de fornecedores diferentes continuam somando.
      SELECT DISTINCT
             regexp_replace(COALESCE(u->>'codigoUnidade', ''), '\D', '', 'g') AS uasg,
             btrim(COALESCE(u->>'fornecedor', '')) AS fornecedor,
             u->>'nomeUnidade' AS nome,
             u->>'tipoUnidade' AS tipo,
             CASE WHEN btrim(u->>'quantidadeRegistrada') ~ '^[0-9]+(\.[0-9]+)?$'
                  THEN btrim(u->>'quantidadeRegistrada')::NUMERIC ELSE 0 END AS qtd,
             CASE WHEN u->>'dataHoraInclusao' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
                  THEN left(u->>'dataHoraInclusao', 19)::TIMESTAMP END AS inc,
             CASE WHEN u->>'dataHoraAtualizacao' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
                  THEN left(u->>'dataHoraAtualizacao', 19)::TIMESTAMP END AS atu
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_unidades) = 'array' THEN p_unidades ELSE '[]'::JSONB END) AS u
       WHERE jsonb_typeof(u) = 'object'
         AND COALESCE(u->>'dataHoraExclusao', '') = ''
    ) x
   WHERE x.uasg ~ '^[0-9]{6}$'
   GROUP BY x.uasg;
$$;

CREATE OR REPLACE FUNCTION public.gravar_unidades_itens(p_uasg character varying, p_itens jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item     JSONB;
  v_key      TEXT;
  v_unidades JSONB;
  v_adesoes  JSONB;
  v_total    INTEGER := 0;
  v_anteriores JSONB;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador sincroniza com as fontes oficiais.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sincronizacao_fontes
     WHERE recurso = 'unidades_itens'
       AND uasg = p_uasg
       AND em_andamento_por IS NOT DISTINCT FROM auth.uid()
       AND em_andamento_desde >= NOW() - INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'SYNC_NOT_RESERVED: Sincronização dos órgãos dos itens da UASG % não reservada por este usuário.', p_uasg
      USING ERRCODE = '55000';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_itens deve ser um array JSON.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_itens) > 100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 100 itens por chamada.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT valor FROM jsonb_array_elements(p_itens) AS e(valor) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN CONTINUE; END IF;
    v_key := left(btrim(COALESCE(v_item->>'item_key', '')), 100);
    IF v_key = '' THEN CONTINUE; END IF;

    -- Só objetos entram nas listas; o resto é descartado sem derrubar o lote.
    SELECT COALESCE(jsonb_agg(u.valor ORDER BY u.ordem), '[]'::jsonb)
      INTO v_unidades
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_item->'unidades') = 'array' THEN v_item->'unidades' ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS u(valor, ordem)
     WHERE jsonb_typeof(u.valor) = 'object';

    IF jsonb_array_length(v_unidades) > 500 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 500 unidades por item (%).', v_key
        USING ERRCODE = '22023';
    END IF;

    v_adesoes := NULL;
    IF jsonb_typeof(v_item->'adesoes') = 'array' THEN
      SELECT COALESCE(jsonb_agg(a.valor ORDER BY a.ordem), '[]'::jsonb)
        INTO v_adesoes
        FROM jsonb_array_elements(v_item->'adesoes') WITH ORDINALITY AS a(valor, ordem)
       WHERE jsonb_typeof(a.valor) = 'object';
      IF jsonb_array_length(v_adesoes) > 1000 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 1000 adesões por item (%).', v_key
          USING ERRCODE = '22023';
      END IF;
    END IF;

    -- Migration 143: a lista não pode ter o mesmo órgão duas vezes para o mesmo fornecedor (a fonte repetia
    -- cada órgão desde 09/10/2026; o servidor tira as cópias antes de gravar). Lista assim fica de fora: a
    -- cópia anterior e o histórico não mudam.
    IF EXISTS (
      SELECT 1
        FROM jsonb_array_elements(v_unidades) u
       GROUP BY regexp_replace(COALESCE(u->>'codigoUnidade', ''), '\D', '', 'g'), btrim(COALESCE(u->>'fornecedor', ''))
      HAVING count(*) > 1
    ) THEN
      RAISE WARNING 'gravar_unidades_itens: item % com órgão repetido na lista; não gravado.', v_key;
      CONTINUE;
    END IF;

    IF jsonb_array_length(v_unidades) > 0 THEN
      -- Migration 109: histórico do registrado. Compara com a cópia anterior, órgão a órgão, e grava cada
      -- quantidade que mudou (a primeira cópia do item é só o ponto de partida).
      v_anteriores := NULL;
      SELECT c.unidades INTO v_anteriores FROM public.itens_ata_unidades_copia c WHERE c.item_key = v_key;
      IF v_anteriores IS NOT NULL AND jsonb_typeof(v_anteriores) = 'array' AND jsonb_array_length(v_anteriores) > 0 THEN
        INSERT INTO public.itens_ata_unidades_historico (item_key, uasg, quantidade_anterior, quantidade_nova, atualizado_na_fonte)
        SELECT v_key, COALESCE(n.uasg, a.uasg), a.quantidade, n.quantidade, COALESCE(n.atualizado_em, a.atualizado_em)
          FROM public.registrado_por_uasg(v_anteriores) a
          FULL JOIN public.registrado_por_uasg(v_unidades) n ON n.uasg = a.uasg
         WHERE a.quantidade IS DISTINCT FROM n.quantidade;
      END IF;

      INSERT INTO public.itens_ata_unidades_copia AS c
        (item_key, unidades, total_unidades, copiado_em, lido_em, ultima_leitura_vazia)
      VALUES (v_key, v_unidades, jsonb_array_length(v_unidades), NOW(), NOW(), FALSE)
      ON CONFLICT (item_key) DO UPDATE
        SET unidades = EXCLUDED.unidades,
            total_unidades = EXCLUDED.total_unidades,
            copiado_em = EXCLUDED.copiado_em,
            lido_em = EXCLUDED.lido_em,
            ultima_leitura_vazia = FALSE;
      v_total := v_total + 1;
    ELSE
      INSERT INTO public.itens_ata_unidades_copia AS c (item_key, lido_em, ultima_leitura_vazia)
      VALUES (v_key, NOW(), TRUE)
      ON CONFLICT (item_key) DO UPDATE
        SET lido_em = EXCLUDED.lido_em, ultima_leitura_vazia = TRUE;
    END IF;

    IF v_adesoes IS NOT NULL THEN
      UPDATE public.itens_ata_unidades_copia
         SET adesoes = v_adesoes,
             total_adesoes = jsonb_array_length(v_adesoes),
             adesoes_copiado_em = NOW()
       WHERE item_key = v_key;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$function$;
