-- ==============================================================================
-- Relatório da ata do Contratos.gov.br importado pelo gestor (17/11/2026).
--
-- Medição 17/11/2026: a consulta 3 do Compras.gov.br (3_consultarUnidadesItem) não publica mudança de quantidade
-- desde 05/11/2026 17:14. Na ata 00027/2026 (200331) item 15, o "Relatório Ata de Registro de Preços" do
-- Contratos.gov.br mostra 14 un. remanejadas da PM-ES (925794, 46 → 32) para a SENASP (1 → 15) e a SDS/PE
-- (452386) com 6; a consulta 3 segue com SENASP 1, PM-ES 46 e sem a SDS/PE. A API do Contratos.gov.br não tem
-- rota de atas: o relatório em PDF é a única fonte.
--
-- 1. itens_ata_relatorio_unidades: quantidade registrada e saldo de cada órgão, como no relatório, com a data
--    em que o relatório foi gerado (hora de Brasília, sem fuso, como as datas do Compras.gov.br).
-- 2. registrado_efetivo: o registrado do item é o do Compras.gov.br, órgão a órgão, menos onde o relatório é
--    mais novo que a última atualização do órgão na consulta 3. Quando o Compras.gov.br publicar uma mudança
--    depois do relatório, ela volta a valer sozinha. A coluna "registrado" da cópia (lida pelas views) passa a
--    guardar esse resultado, com "origem" (COMPRAS ou RELATORIO).
-- 3. A quantidade SENASP do item (itens_ata.quantidade_senasp) e o histórico de mudanças seguem o mesmo
--    registrado: a importação grava no histórico cada órgão que mudou, com a data do relatório.
-- 4. importar_relatorio_ata: grava o relatório (gestor ou coordenador). Relatório mais antigo que o já
--    importado para o item fica de fora.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.itens_ata_relatorio_unidades (
  item_key            VARCHAR(100) NOT NULL,
  uasg                VARCHAR(6)   NOT NULL CHECK (uasg ~ '^[0-9]{6}$'),
  nome_orgao          TEXT,
  tipo_unidade        TEXT,
  quantidade          NUMERIC      NOT NULL CHECK (quantidade >= 0),
  saldo               NUMERIC,
  gerado_em           TIMESTAMP    NOT NULL,
  importado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  importado_por       UUID,
  importado_por_nome  TEXT,
  PRIMARY KEY (item_key, uasg)
);

COMMENT ON TABLE public.itens_ata_relatorio_unidades IS
  'Órgãos do item pelo "Relatório Ata de Registro de Preços" do Contratos.gov.br, importado pelo gestor (migration 325). Grava só por importar_relatorio_ata.';

ALTER TABLE public.itens_ata_relatorio_unidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: itens_ata_relatorio_unidades" ON public.itens_ata_relatorio_unidades;
CREATE POLICY "Authenticated Read: itens_ata_relatorio_unidades"
  ON public.itens_ata_relatorio_unidades FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.itens_ata_relatorio_unidades FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.itens_ata_relatorio_unidades TO authenticated;
GRANT ALL ON public.itens_ata_relatorio_unidades TO service_role;

-- Registrado do item, órgão a órgão: Compras.gov.br, ou o relatório quando ele é mais novo.
CREATE OR REPLACE FUNCTION public.registrado_efetivo(p_item_key text, p_unidades jsonb)
RETURNS TABLE(uasg character varying, nome_orgao text, tipo_unidade text, quantidade numeric,
              incluido_em timestamp without time zone, atualizado_em timestamp without time zone, origem text)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(b.uasg, r.uasg)::VARCHAR,
         COALESCE(b.nome_orgao, r.nome_orgao),
         COALESCE(b.tipo_unidade, upper(r.tipo_unidade)),
         CASE WHEN x.usa THEN r.quantidade ELSE b.quantidade END,
         b.incluido_em,
         CASE WHEN x.usa THEN r.gerado_em ELSE b.atualizado_em END,
         CASE WHEN x.usa THEN 'RELATORIO' ELSE 'COMPRAS' END
    FROM public.registrado_por_uasg(p_unidades) b
    FULL JOIN (SELECT * FROM public.itens_ata_relatorio_unidades WHERE item_key = p_item_key) r ON r.uasg = b.uasg
   CROSS JOIN LATERAL (
     SELECT r.uasg IS NOT NULL
            AND (b.uasg IS NULL OR b.atualizado_em IS NULL OR b.atualizado_em < r.gerado_em) AS usa
   ) x;
$$;
REVOKE ALL ON FUNCTION public.registrado_efetivo(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrado_efetivo(text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrado_efetivo_json(p_item_key text, p_unidades jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.uasg), '[]'::jsonb)
    FROM public.registrado_efetivo(p_item_key, p_unidades) r;
$$;
REVOKE ALL ON FUNCTION public.registrado_efetivo_json(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrado_efetivo_json(text, jsonb) TO authenticated, service_role;

-- A coluna "registrado" da cópia passa a levar o relatório em conta.
CREATE OR REPLACE FUNCTION public.trg_registrado_da_copia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.registrado := public.registrado_efetivo_json(NEW.item_key, NEW.unidades);
  RETURN NEW;
END;
$function$;

-- Quantidade SENASP do item pelo mesmo registrado (mesma regra de senasp_das_unidades).
CREATE OR REPLACE FUNCTION public.acertar_senasp_do_item(p_item_key text, p_unidades jsonb, p_lida_em timestamptz)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF (p_unidades IS NULL OR jsonb_typeof(p_unidades) <> 'array' OR jsonb_array_length(p_unidades) = 0)
     AND NOT EXISTS (SELECT 1 FROM public.itens_ata_relatorio_unidades r WHERE r.item_key = p_item_key) THEN
    RETURN;
  END IF;

  UPDATE public.itens_ata i
     SET quantidade_senasp = x.qtd,
         quantidade_senasp_lida_em = COALESCE(p_lida_em, NOW())
    FROM public.atas_registro_preco a
    CROSS JOIN LATERAL (
      SELECT CASE WHEN count(*) = 0 THEN NULL ELSE COALESCE(sum(r.quantidade), 0) END AS qtd
        FROM public.registrado_efetivo(p_item_key, p_unidades) r
       CROSS JOIN (SELECT regexp_replace(COALESCE(a.codigo_uasg, ''), '\D', '', 'g') AS uasg) g
       WHERE r.uasg IN ('200330', '200331')
          OR ((g.uasg = '' OR g.uasg IN ('200330', '200331'))
              AND (r.tipo_unidade = 'GERENCIADORA' OR (g.uasg <> '' AND r.uasg = g.uasg)))
    ) x
   WHERE a.id = i.ata_id
     AND a.numero_ata = substring(p_item_key from '^(.*)-[^-]*-[^-]*$')
     AND a.codigo_uasg = substring(p_item_key from '^.*-([^-]*)-[^-]*$')
     AND (a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item::TEXT, 5, '0')) = p_item_key
     AND x.qtd IS NOT NULL
     AND i.quantidade_senasp IS DISTINCT FROM x.qtd;
END;
$$;
REVOKE ALL ON FUNCTION public.acertar_senasp_do_item(text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;

-- Mesmo corpo da migration 317; o histórico compara o registrado já com o relatório (ver "Migration 325").
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
      -- Migration 325: compara o registrado gravado com o novo, os dois já com o relatório do Contratos.gov.br.
      -- Migration 109: histórico do registrado. Compara com a cópia anterior, órgão a órgão, e grava cada
      -- quantidade que mudou (a primeira cópia do item é só o ponto de partida).
      v_anteriores := NULL;
      SELECT c.unidades INTO v_anteriores FROM public.itens_ata_unidades_copia c WHERE c.item_key = v_key;

      -- Migration 317: a mesma lista de antes não é regravada. Só as datas avançam (a fila de leitura usa lido_em),
      -- os gatilhos de "unidades" não rodam, e a quantidade SENASP do item é conferida como o gatilho faria.
      IF v_anteriores IS NOT DISTINCT FROM v_unidades THEN
        UPDATE public.itens_ata_unidades_copia
           SET copiado_em = NOW(), lido_em = NOW(), ultima_leitura_vazia = FALSE
         WHERE item_key = v_key;
        PERFORM public.acertar_senasp_do_item(v_key, v_unidades, NOW());
        v_total := v_total + 1;
      ELSE
        IF v_anteriores IS NOT NULL AND jsonb_typeof(v_anteriores) = 'array' AND jsonb_array_length(v_anteriores) > 0 THEN
          INSERT INTO public.itens_ata_unidades_historico (item_key, uasg, quantidade_anterior, quantidade_nova, atualizado_na_fonte)
          SELECT v_key, COALESCE(n.uasg, a.uasg), a.quantidade, n.quantidade, COALESCE(n.atualizado_em, a.atualizado_em)
            FROM (SELECT x.uasg, x.quantidade, x.atualizado_em
                    FROM public.itens_ata_unidades_copia c,
                         jsonb_to_recordset(c.registrado) x(uasg character varying, quantidade numeric, atualizado_em timestamp without time zone)
                   WHERE c.item_key = v_key) a
            FULL JOIN public.registrado_efetivo(v_key, v_unidades) n ON n.uasg = a.uasg
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
      END IF;
    ELSE
      INSERT INTO public.itens_ata_unidades_copia AS c (item_key, lido_em, ultima_leitura_vazia)
      VALUES (v_key, NOW(), TRUE)
      ON CONFLICT (item_key) DO UPDATE
        SET lido_em = EXCLUDED.lido_em, ultima_leitura_vazia = TRUE;
    END IF;

    IF v_adesoes IS NOT NULL THEN
      -- Migration 317: mesma lista de adesões, só a data avança.
      UPDATE public.itens_ata_unidades_copia
         SET adesoes = v_adesoes,
             total_adesoes = jsonb_array_length(v_adesoes),
             adesoes_copiado_em = NOW()
       WHERE item_key = v_key AND adesoes IS DISTINCT FROM v_adesoes;
      IF NOT FOUND THEN
        UPDATE public.itens_ata_unidades_copia SET adesoes_copiado_em = NOW() WHERE item_key = v_key;
      END IF;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$function$;

-- Grava o relatório do Contratos.gov.br. p_itens: [{ numero_item, unidades: [{ uasg, nome, tipo, quantidade, saldo }] }].
-- Devolve, por item, quantos órgãos mudaram; itens fora da ata e relatórios mais antigos que o já importado
-- ficam de fora, com o motivo.
CREATE OR REPLACE FUNCTION public.importar_relatorio_ata(
  p_numero_ata character varying,
  p_uasg character varying,
  p_gerado_em timestamp without time zone,
  p_itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ata_id     UUID;
  v_item       JSONB;
  v_u          JSONB;
  v_num        INTEGER;
  v_key        TEXT;
  v_antes      JSONB;
  v_unidades   JSONB;
  v_mudancas   INTEGER;
  v_ultimo     TIMESTAMP;
  v_nome       TEXT := COALESCE(public.nome_do_usuario_logado(), 'Usuário');
  v_importados JSONB := '[]'::jsonb;
  v_fora       JSONB := '[]'::jsonb;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador importa o relatório do Contratos.gov.br.'
      USING ERRCODE = '42501';
  END IF;

  IF p_numero_ata IS NULL OR btrim(p_numero_ata) !~ '^[0-9]{5}/[0-9]{4}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: número da ata inválido (%).', p_numero_ata USING ERRCODE = '22023';
  END IF;
  IF p_uasg IS NULL OR btrim(p_uasg) !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: UASG inválida (%).', p_uasg USING ERRCODE = '22023';
  END IF;
  IF p_gerado_em IS NULL OR p_gerado_em < '2020-01-01'
     OR p_gerado_em > (NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 hour' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: data do relatório inválida (%).', p_gerado_em USING ERRCODE = '22023';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o relatório não tem itens.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_itens) > 1000 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 1000 itens por relatório.' USING ERRCODE = '22023';
  END IF;

  SELECT a.id INTO v_ata_id
    FROM public.atas_registro_preco a
   WHERE a.numero_ata = btrim(p_numero_ata) AND a.codigo_uasg = btrim(p_uasg);
  IF v_ata_id IS NULL THEN
    RAISE EXCEPTION 'ATA_NAO_ENCONTRADA: a ata % da UASG % não está no sistema.', p_numero_ata, p_uasg
      USING ERRCODE = 'P0002';
  END IF;

  FOR v_item IN SELECT valor FROM jsonb_array_elements(p_itens) AS e(valor) LOOP
    IF jsonb_typeof(v_item) <> 'object' OR btrim(COALESCE(v_item->>'numero_item', '')) !~ '^[0-9]{1,5}$' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: item sem número.' USING ERRCODE = '22023';
    END IF;
    v_num := (v_item->>'numero_item')::INTEGER;
    v_key := btrim(p_numero_ata) || '-' || btrim(p_uasg) || '-' || lpad(v_num::TEXT, 5, '0');

    IF NOT EXISTS (SELECT 1 FROM public.itens_ata i WHERE i.ata_id = v_ata_id AND lpad(btrim(i.numero_item::TEXT), 5, '0') = lpad(v_num::TEXT, 5, '0')) THEN
      v_fora := v_fora || jsonb_build_object('numero_item', v_num, 'motivo', 'ITEM_FORA_DA_ATA');
      CONTINUE;
    END IF;

    v_unidades := CASE WHEN jsonb_typeof(v_item->'unidades') = 'array' THEN v_item->'unidades' ELSE '[]'::jsonb END;
    IF jsonb_array_length(v_unidades) = 0 OR jsonb_array_length(v_unidades) > 500 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: item % sem órgãos ou com mais de 500.', v_num USING ERRCODE = '22023';
    END IF;
    FOR v_u IN SELECT valor FROM jsonb_array_elements(v_unidades) AS e(valor) LOOP
      IF jsonb_typeof(v_u) <> 'object'
         OR COALESCE(v_u->>'uasg', '') !~ '^[0-9]{6}$'
         OR COALESCE(v_u->>'quantidade', '') !~ '^[0-9]+(\.[0-9]+)?$'
         OR (v_u ? 'saldo' AND v_u->>'saldo' IS NOT NULL AND v_u->>'saldo' !~ '^-?[0-9]+(\.[0-9]+)?$') THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: órgão inválido no item % (%).', v_num, v_u USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF (SELECT count(DISTINCT u->>'uasg') FROM jsonb_array_elements(v_unidades) u) <> jsonb_array_length(v_unidades) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: órgão repetido no item %.', v_num USING ERRCODE = '22023';
    END IF;

    SELECT max(r.gerado_em) INTO v_ultimo FROM public.itens_ata_relatorio_unidades r WHERE r.item_key = v_key;
    IF v_ultimo IS NOT NULL AND v_ultimo > p_gerado_em THEN
      v_fora := v_fora || jsonb_build_object('numero_item', v_num, 'motivo', 'RELATORIO_MAIS_ANTIGO', 'ja_importado', v_ultimo);
      CONTINUE;
    END IF;

    -- A cópia guarda o registrado; o item ainda sem cópia ganha uma linha vazia (o servidor completa depois).
    INSERT INTO public.itens_ata_unidades_copia (item_key) VALUES (v_key) ON CONFLICT (item_key) DO NOTHING;
    SELECT c.registrado INTO v_antes FROM public.itens_ata_unidades_copia c WHERE c.item_key = v_key FOR UPDATE;

    DELETE FROM public.itens_ata_relatorio_unidades WHERE item_key = v_key;
    INSERT INTO public.itens_ata_relatorio_unidades
      (item_key, uasg, nome_orgao, tipo_unidade, quantidade, saldo, gerado_em, importado_por, importado_por_nome)
    SELECT v_key, u->>'uasg', NULLIF(left(btrim(COALESCE(u->>'nome', '')), 200), ''),
           NULLIF(left(btrim(COALESCE(u->>'tipo', '')), 40), ''),
           (u->>'quantidade')::NUMERIC, NULLIF(u->>'saldo', '')::NUMERIC, p_gerado_em, auth.uid(), v_nome
      FROM jsonb_array_elements(v_unidades) u;

    UPDATE public.itens_ata_unidades_copia c
       SET registrado = public.registrado_efetivo_json(c.item_key, c.unidades)
     WHERE c.item_key = v_key;

    -- Histórico: cada órgão que mudou, com a data do relatório (o primeiro registrado do item é só o ponto de partida).
    v_mudancas := 0;
    IF jsonb_array_length(COALESCE(v_antes, '[]'::jsonb)) > 0 THEN
      WITH a AS (
        SELECT x.uasg, x.quantidade
          FROM jsonb_to_recordset(v_antes) x(uasg character varying, quantidade numeric)
      ), n AS (
        SELECT x.uasg, x.quantidade, x.atualizado_em
          FROM public.itens_ata_unidades_copia c,
               jsonb_to_recordset(c.registrado) x(uasg character varying, quantidade numeric, atualizado_em timestamp without time zone)
         WHERE c.item_key = v_key
      ), ins AS (
        INSERT INTO public.itens_ata_unidades_historico (item_key, uasg, quantidade_anterior, quantidade_nova, atualizado_na_fonte)
        SELECT v_key, COALESCE(n.uasg, a.uasg), a.quantidade, n.quantidade, COALESCE(n.atualizado_em, p_gerado_em)
          FROM a FULL JOIN n ON n.uasg = a.uasg
         WHERE a.quantidade IS DISTINCT FROM n.quantidade
        RETURNING 1
      )
      SELECT count(*) INTO v_mudancas FROM ins;
    END IF;

    PERFORM public.acertar_senasp_do_item(v_key, c.unidades, NOW())
       FROM public.itens_ata_unidades_copia c WHERE c.item_key = v_key;

    v_importados := v_importados || jsonb_build_object('numero_item', v_num, 'item_key', v_key, 'mudancas', v_mudancas);
  END LOOP;

  RETURN jsonb_build_object('importados', v_importados, 'fora', v_fora);
END;
$$;
REVOKE ALL ON FUNCTION public.importar_relatorio_ata(character varying, character varying, timestamp without time zone, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_relatorio_ata(character varying, character varying, timestamp without time zone, jsonb) TO authenticated, service_role;
