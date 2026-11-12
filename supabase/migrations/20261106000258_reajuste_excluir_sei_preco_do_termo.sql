-- ==============================================================================
-- Migration 258: reajuste da ata — excluir o informado, SEI do termo, repetido e preço do termo
-- ==============================================================================
-- Caso de 06/11/2026 (ata 00056/2025): o gestor registrou "fora do PNCP" o reajuste que o sistema já tinha lido
-- do Termo Aditivo (SEI 36938954). O 2º ciclo virou cópia do 1º e a projeção contou 4,72% duas vezes.
--   1) ata_reajustes.sei_documento: SEI do próprio documento (rodapé do SEI), mostrado na aba Reajuste.
--      ata_reajustes.valores_documento: valores em reais lidos do documento, para achar o preço novo.
--   2) aplicar_preco_do_termo: o preço novo de cada item vem da tabela do termo quando há UM só valor a até
--      0,5% da conta (preço atual × (1 + percentual)); grava em itens_ata_preco_apostilado com origem PNCP e o
--      SEI do termo. O preço informado pelo gestor da ata não é trocado. Sem valor seguro, fica com o gestor.
--   3) gravar_reajuste_fontes grava os campos novos, aplica o preço do termo e, quando o PNCP publica os mesmos
--      meses do índice que o gestor informou, o publicado prevalece (o informado sai).
--   4) informar_reajuste_ata recusa um reajuste novo com os mesmos meses do índice de um já registrado.
--   5) excluir_reajuste_ata: gestor da ata ou coordenador exclui o reajuste que ele mesmo informou (nunca o do PNCP).
--   6) reajuste_ciclos_ata conta uma vez o mesmo reajuste com percentual igual ao centésimo (4,72491 e 4,72).
--   7) Carga dos 103 termos já lidos (06/11/2026): SEI do termo, primeiro dia da prorrogação escrito no termo
--      (34 efeitos mudam, em geral um dia) e preço do termo; sai o informado repetido da ata 00056/2025.
-- ==============================================================================

-- 1) Colunas -------------------------------------------------------------------
ALTER TABLE public.ata_reajustes ADD COLUMN IF NOT EXISTS sei_documento VARCHAR(10)
  CHECK (sei_documento ~ '^\d{7,10}$');
ALTER TABLE public.ata_reajustes ADD COLUMN IF NOT EXISTS valores_documento NUMERIC[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.ata_reajustes.sei_documento IS 'Número SEI do próprio documento publicado no PNCP (rodapé "Referência: Processo nº ... SEI nº ..."). Migration 258.';
COMMENT ON COLUMN public.ata_reajustes.valores_documento IS 'Valores em reais escritos no documento (tabela de preços), para achar o preço novo de cada item. Migration 258.';

ALTER TABLE public.itens_ata_preco_apostilado ADD COLUMN IF NOT EXISTS origem VARCHAR(10) NOT NULL DEFAULT 'GESTOR'
  CHECK (origem IN ('GESTOR', 'PNCP'));
COMMENT ON COLUMN public.itens_ata_preco_apostilado.origem IS 'GESTOR: informado pelo gestor da ata. PNCP: lido da tabela do termo publicado no PNCP (migration 258); o gestor pode trocar.';

-- 2) Preço novo pela tabela do termo ---------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_preco_do_termo(p_reajuste_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_r     public.ata_reajustes%ROWTYPE;
  v_it    RECORD;
  v_base  NUMERIC;
  v_conta NUMERIC;
  v_achou NUMERIC[];
  v_fator NUMERIC;
  v_n     INTEGER := 0;
BEGIN
  SELECT * INTO v_r FROM public.ata_reajustes WHERE id = p_reajuste_id;
  IF NOT FOUND OR v_r.origem <> 'PNCP' OR v_r.percentual IS NULL OR v_r.sei_documento IS NULL
     OR cardinality(v_r.valores_documento) = 0 THEN
    RETURN 0;
  END IF;
  -- Só o reajuste mais recente da ata muda o preço de hoje.
  IF EXISTS (SELECT 1 FROM public.ata_reajustes x WHERE x.ata_id = v_r.ata_id AND x.id <> v_r.id AND x.efeito_inicio > v_r.efeito_inicio) THEN
    RETURN 0;
  END IF;

  -- Fator dos reajustes anteriores a este (o mesmo reajuste em dois documentos conta uma vez).
  SELECT COALESCE(exp(sum(ln(1 + u.percentual / 100))), 1) INTO v_fator
    FROM (SELECT DISTINCT ON (round(x.percentual, 2), x.periodo_inicio, x.periodo_fim) x.percentual
            FROM public.ata_reajustes x
           WHERE x.ata_id = v_r.ata_id AND x.percentual IS NOT NULL AND x.efeito_inicio < v_r.efeito_inicio
             AND NOT (round(x.percentual, 2) = round(v_r.percentual, 2) AND x.periodo_inicio IS NOT DISTINCT FROM v_r.periodo_inicio)) u;

  FOR v_it IN
    SELECT i.numero_item, i.valor_unitario, h.valor AS homologado
      FROM public.itens_ata i
      LEFT JOIN public.itens_ata_preco_homologado h ON h.ata_id = i.ata_id AND h.numero_item = i.numero_item
     WHERE i.ata_id = v_r.ata_id AND COALESCE(i.valor_unitario, 0) > 0
       -- Já gravado para este reajuste, ou informado pelo gestor da ata depois dele: fica.
       AND NOT EXISTS (SELECT 1 FROM public.itens_ata_preco_apostilado a
                        WHERE a.ata_id = i.ata_id AND a.numero_item = i.numero_item
                          AND (a.ata_reajuste_id = v_r.id OR (a.origem = 'GESTOR' AND a.informado_em::DATE >= v_r.efeito_inicio)))
  LOOP
    v_base := v_it.valor_unitario;
    -- O preço de hoje tem de ser o de antes deste reajuste: com o homologado, homologado × reajustes anteriores;
    -- sem ele, o preço de hoje tem de estar escrito no termo (coluna do valor antigo). Se a fonte já trouxe o
    -- preço novo, nada muda (senão o reajuste entraria duas vezes).
    IF v_it.homologado IS NOT NULL THEN
      CONTINUE WHEN abs(v_base - v_it.homologado * v_fator) > v_it.homologado * v_fator * 0.005;
    ELSE
      CONTINUE WHEN NOT EXISTS (SELECT 1 FROM unnest(v_r.valores_documento) v WHERE abs(v - v_base) <= 0.005);
    END IF;
    v_conta := v_base * (1 + v_r.percentual / 100);
    SELECT array_agg(DISTINCT v ORDER BY v) INTO v_achou
      FROM unnest(v_r.valores_documento) v
     WHERE abs(v - v_conta) <= v_conta * 0.005 AND abs(v - v_base) > 0.005;
    CONTINUE WHEN cardinality(v_achou) IS DISTINCT FROM 1;

    INSERT INTO public.itens_ata_preco_apostilado AS x (ata_id, numero_item, preco, preco_antes, fonte_valor, ata_reajuste_id,
                                                       sei_apostilamento, informado_por, informado_por_nome, informado_em, origem)
    VALUES (v_r.ata_id, v_it.numero_item, round(v_achou[1], 2), v_base, v_base, v_r.id, v_r.sei_documento, NULL,
            'Leitura do termo no PNCP', NOW(), 'PNCP')
    ON CONFLICT (ata_id, numero_item) DO UPDATE
      SET preco = EXCLUDED.preco, ata_reajuste_id = EXCLUDED.ata_reajuste_id, sei_apostilamento = EXCLUDED.sei_apostilamento,
          informado_por = NULL, informado_por_nome = EXCLUDED.informado_por_nome, informado_em = EXCLUDED.informado_em,
          origem = 'PNCP';
    UPDATE public.itens_ata SET valor_unitario = round(v_achou[1], 2), valor_total = COALESCE(quantidade_homologada, 0) * round(v_achou[1], 2)
     WHERE ata_id = v_r.ata_id AND numero_item = v_it.numero_item;
    v_n := v_n + 1;
  END LOOP;

  IF v_n > 0 THEN
    UPDATE public.atas_registro_preco a
       SET valor_total = COALESCE((SELECT sum(COALESCE(i.quantidade_senasp, 0) * i.valor_unitario) FROM public.itens_ata i WHERE i.ata_id = a.id), 0)
     WHERE a.id = v_r.ata_id;
    UPDATE public.ata_reajuste_parametros SET versao = versao + 1, atualizado_em = NOW() WHERE ata_id = v_r.ata_id;
  END IF;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_preco_do_termo(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_preco_do_termo(UUID) TO service_role;

-- 3) Gravação pelo servidor ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_reajuste_fontes(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ind  INTEGER := 0;
  v_par  INTEGER := 0;
  v_hom  INTEGER := 0;
  v_rea  INTEGER := 0;
  v_a    JSONB;
  v_ata  UUID;
  v_n    INTEGER;
  v_pri  RECORD;
  v_rid  UUID;
  v_pre  INTEGER := 0;
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava as fontes do reajuste.' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_payload -> 'projetados_substituir') = 'array' THEN
    DELETE FROM public.indices_precos_mensais
     WHERE tipo = 'PROJETADO'
       AND indice IN (SELECT jsonb_array_elements_text(p_payload -> 'projetados_substituir'));
  END IF;

  INSERT INTO public.indices_precos_mensais (indice, mes, tipo, variacao, fonte, referencia, lido_em)
  SELECT x ->> 'indice', (x ->> 'mes')::DATE, x ->> 'tipo', (x ->> 'variacao')::NUMERIC, x ->> 'fonte',
         NULLIF(x ->> 'referencia', '')::DATE, NOW()
    FROM jsonb_array_elements(COALESCE(p_payload -> 'indices', '[]'::JSONB)) x
  ON CONFLICT (indice, mes, tipo) DO UPDATE
     SET variacao = EXCLUDED.variacao, fonte = EXCLUDED.fonte, referencia = EXCLUDED.referencia, lido_em = NOW();
  GET DIAGNOSTICS v_ind = ROW_COUNT;

  -- Um mês com OFICIAL não precisa mais do PROJETADO.
  DELETE FROM public.indices_precos_mensais p
   WHERE p.tipo = 'PROJETADO'
     AND EXISTS (SELECT 1 FROM public.indices_precos_mensais o WHERE o.indice = p.indice AND o.mes = p.mes AND o.tipo = 'OFICIAL');

  FOR v_a IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'atas', '[]'::JSONB)) LOOP
    v_ata := (v_a ->> 'ata_id')::UUID;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.atas_registro_preco WHERE id = v_ata);

    INSERT INTO public.ata_reajuste_parametros (ata_id, indice, clausula, data_orcamento_edital, edital_lido_em,
                                                termo_mes_apostilamento, termo_sei_apostilamento)
    VALUES (v_ata, NULLIF(v_a ->> 'indice', ''), COALESCE(NULLIF(v_a ->> 'clausula', ''), 'A_CONFERIR'),
            NULLIF(v_a ->> 'data_orcamento_edital', '')::DATE,
            CASE WHEN v_a ? 'clausula' THEN NOW() END,
            NULLIF(v_a ->> 'termo_mes_apostilamento', '')::DATE, NULLIF(v_a ->> 'termo_sei_apostilamento', ''))
    ON CONFLICT (ata_id) DO UPDATE
       SET indice = COALESCE(EXCLUDED.indice, ata_reajuste_parametros.indice),
           clausula = CASE WHEN v_a ? 'clausula' THEN EXCLUDED.clausula ELSE ata_reajuste_parametros.clausula END,
           data_orcamento_edital = COALESCE(EXCLUDED.data_orcamento_edital, ata_reajuste_parametros.data_orcamento_edital),
           edital_lido_em = COALESCE(EXCLUDED.edital_lido_em, ata_reajuste_parametros.edital_lido_em),
           termo_mes_apostilamento = COALESCE(EXCLUDED.termo_mes_apostilamento, ata_reajuste_parametros.termo_mes_apostilamento),
           termo_sei_apostilamento = COALESCE(EXCLUDED.termo_sei_apostilamento, ata_reajuste_parametros.termo_sei_apostilamento),
           atualizado_em = NOW();
    v_par := v_par + 1;

    -- Antes de ler o edital, o servidor marca a tentativa: se a leitura derrubar a função, a ata vai para o fim
    -- da fila e, depois de 2 tentativas, o edital fica "a conferir" (ver reajusteAtasSyncService).
    IF COALESCE((v_a ->> 'edital_tentativa')::BOOLEAN, FALSE) THEN
      UPDATE public.ata_reajuste_parametros SET edital_tentativas = edital_tentativas + 1 WHERE ata_id = v_ata;
    END IF;

    INSERT INTO public.itens_ata_preco_homologado (ata_id, numero_item, valor, lido_em)
    SELECT v_ata, h ->> 'numero_item', (h ->> 'valor')::NUMERIC, NOW()
      FROM jsonb_array_elements(COALESCE(v_a -> 'homologados', '[]'::JSONB)) h
     WHERE (h ->> 'valor') IS NOT NULL
    ON CONFLICT (ata_id, numero_item) DO UPDATE SET valor = EXCLUDED.valor, lido_em = NOW();
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hom := v_hom + v_n;

    INSERT INTO public.ata_reajustes (ata_id, origem, efeito_inicio, percentual, periodo_inicio, periodo_fim, indice,
                                      documento_pncp_sequencial, documento_titulo, documento_publicado_em, sei_citado,
                                      sei_citado_conformidade, sei_documento, valores_documento, lido_em)
    SELECT v_ata, 'PNCP', (r ->> 'efeito_inicio')::DATE, NULLIF(r ->> 'percentual', '')::NUMERIC,
           NULLIF(r ->> 'periodo_inicio', '')::DATE, NULLIF(r ->> 'periodo_fim', '')::DATE, NULLIF(r ->> 'indice', ''),
           (r ->> 'documento_pncp_sequencial')::INTEGER, r ->> 'documento_titulo', NULLIF(r ->> 'documento_publicado_em', '')::DATE,
           NULLIF(r ->> 'sei_citado', ''), COALESCE((r ->> 'sei_citado_conformidade')::BOOLEAN, FALSE),
           CASE WHEN r ->> 'sei_documento' ~ '^\d{7,10}$' THEN r ->> 'sei_documento' END,
           ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(r -> 'valores_documento') = 'array' THEN r -> 'valores_documento' ELSE '[]'::JSONB END)::NUMERIC),
           NOW()
      FROM jsonb_array_elements(COALESCE(v_a -> 'reajustes', '[]'::JSONB)) r
     -- O mesmo reajuste já gravado a partir de outro documento da ata não entra de novo (migration 258: o
     -- percentual com até 0,01 ponto de diferença é o mesmo; o informado pelo gestor não impede o publicado).
     WHERE NOT EXISTS (
       SELECT 1 FROM public.ata_reajustes x
        WHERE x.ata_id = v_ata
          AND x.origem = 'PNCP'
          AND x.documento_pncp_sequencial IS DISTINCT FROM (r ->> 'documento_pncp_sequencial')::INTEGER
          AND ((x.percentual IS NULL AND NULLIF(r ->> 'percentual', '') IS NULL)
               OR abs(x.percentual - NULLIF(r ->> 'percentual', '')::NUMERIC) < 0.01)
          AND x.periodo_inicio IS NOT DISTINCT FROM NULLIF(r ->> 'periodo_inicio', '')::DATE
          AND x.periodo_fim IS NOT DISTINCT FROM NULLIF(r ->> 'periodo_fim', '')::DATE
          AND (x.periodo_inicio IS NOT NULL OR x.efeito_inicio = (r ->> 'efeito_inicio')::DATE))
    ON CONFLICT (ata_id, documento_pncp_sequencial) WHERE documento_pncp_sequencial IS NOT NULL DO UPDATE
       SET documento_titulo = EXCLUDED.documento_titulo,
           documento_publicado_em = EXCLUDED.documento_publicado_em,
           sei_citado = COALESCE(EXCLUDED.sei_citado, ata_reajustes.sei_citado),
           sei_citado_conformidade = EXCLUDED.sei_citado_conformidade OR ata_reajustes.sei_citado_conformidade,
           sei_documento = COALESCE(EXCLUDED.sei_documento, ata_reajustes.sei_documento),
           valores_documento = CASE WHEN cardinality(EXCLUDED.valores_documento) > 0 THEN EXCLUDED.valores_documento
                                    ELSE ata_reajustes.valores_documento END,
           indice = COALESCE(EXCLUDED.indice, ata_reajustes.indice),
           -- O que o gestor informou fica.
           percentual = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.percentual ELSE ata_reajustes.percentual END,
           periodo_inicio = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.periodo_inicio ELSE ata_reajustes.periodo_inicio END,
           periodo_fim = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.periodo_fim ELSE ata_reajustes.periodo_fim END,
           efeito_inicio = CASE WHEN ata_reajustes.informado_por IS NULL THEN EXCLUDED.efeito_inicio ELSE ata_reajustes.efeito_inicio END,
           lido_em = NOW();
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rea := v_rea + v_n;

    -- Migration 258: o publicado no PNCP prevalece sobre o informado pelo gestor para os mesmos meses do índice.
    DELETE FROM public.ata_reajustes x
     WHERE x.ata_id = v_ata AND x.origem = 'INFORMADO' AND x.periodo_inicio IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.ata_reajustes y
                    WHERE y.ata_id = v_ata AND y.origem = 'PNCP'
                      AND y.periodo_inicio = x.periodo_inicio AND y.periodo_fim = x.periodo_fim);

    -- Migration 258: preço novo de cada item pela tabela do termo lido agora.
    FOR v_rid IN
      SELECT x.id FROM public.ata_reajustes x
       WHERE x.ata_id = v_ata AND x.origem = 'PNCP'
         AND x.documento_pncp_sequencial IN (SELECT (r ->> 'documento_pncp_sequencial')::INTEGER
                                                FROM jsonb_array_elements(COALESCE(v_a -> 'reajustes', '[]'::JSONB)) r)
    LOOP
      v_pre := v_pre + public.aplicar_preco_do_termo(v_rid);
    END LOOP;

    -- Migration 222: termos aditivos de prorrogação (o que dizem sobre o saldo).
    INSERT INTO public.ata_termos_prorrogacao (ata_id, documento_pncp_sequencial, documento_titulo, documento_publicado_em,
                                               cobertura, trecho, lido_em)
    SELECT v_ata, (t ->> 'documento_pncp_sequencial')::INTEGER, left(t ->> 'documento_titulo', 300),
           NULLIF(t ->> 'documento_publicado_em', '')::DATE,
           CASE WHEN t ->> 'cobertura' IN ('SALDO', 'RENOVA') THEN t ->> 'cobertura' ELSE 'A_CONFERIR' END,
           left(NULLIF(t ->> 'trecho', ''), 300), NOW()
      FROM jsonb_array_elements(COALESCE(v_a -> 'termos_prorrogacao', '[]'::JSONB)) t
     WHERE (t ->> 'documento_pncp_sequencial') IS NOT NULL
    ON CONFLICT (ata_id, documento_pncp_sequencial) DO UPDATE
       SET documento_titulo = EXCLUDED.documento_titulo, documento_publicado_em = EXCLUDED.documento_publicado_em,
           cobertura = EXCLUDED.cobertura, trecho = EXCLUDED.trecho, lido_em = NOW();

    -- Documentos lidos e preços homologados lidos.
    IF jsonb_typeof(v_a -> 'documentos_lidos') = 'array' THEN
      UPDATE public.ata_reajuste_parametros p
         SET documentos_pncp_lidos = ARRAY(
               SELECT DISTINCT s FROM unnest(p.documentos_pncp_lidos || ARRAY(SELECT (jsonb_array_elements_text(v_a -> 'documentos_lidos'))::INTEGER)) s
                ORDER BY s),
             documentos_lidos_em = NOW()
       WHERE p.ata_id = v_ata;
    END IF;
    IF COALESCE((v_a ->> 'homologados_completos')::BOOLEAN, FALSE) THEN
      UPDATE public.ata_reajuste_parametros SET homologados_lidos_em = NOW() WHERE ata_id = v_ata;
    END IF;

    -- Mês do Termo de Conformidade: o período do primeiro reajuste começa no mês do termo.
    SELECT r.periodo_inicio, r.sei_citado, r.sei_citado_conformidade INTO v_pri
      FROM public.ata_reajustes r
     WHERE r.ata_id = v_ata AND r.periodo_inicio IS NOT NULL
     ORDER BY r.efeito_inicio, r.periodo_inicio
     LIMIT 1;
    IF FOUND THEN
      UPDATE public.ata_reajuste_parametros
         SET termo_mes_apostilamento = v_pri.periodo_inicio,
             termo_sei_apostilamento = CASE WHEN v_pri.sei_citado_conformidade THEN v_pri.sei_citado ELSE termo_sei_apostilamento END
       WHERE ata_id = v_ata;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'indices', v_ind, 'atas', v_par, 'homologados', v_hom, 'reajustes', v_rea, 'precos_do_termo', v_pre);
END;
$function$;

-- 4) Reajuste repetido ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.informar_reajuste_ata(p_ata_id uuid, p_reajuste_id uuid, p_percentual numeric, p_periodo_inicio date, p_periodo_fim date, p_efeito_inicio date, p_sei text, p_versao_vista integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ata    public.atas_registro_preco%ROWTYPE;
  v_sei    TEXT := btrim(COALESCE(p_sei, ''));
  v_versao INTEGER;
  v_rec    public.ata_reajustes%ROWTYPE;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador informa o reajuste.'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ata FROM public.atas_registro_preco WHERE id = p_ata_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_NAO_ENCONTRADA: Ata não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(NULL, public.chave_gestao_ata(v_ata.numero_ata || '-' || v_ata.codigo_uasg));

  IF p_percentual IS NULL OR p_percentual <= -50 OR p_percentual >= 100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o percentual aplicado, por exemplo 4,44.' USING ERRCODE = '22023';
  END IF;
  IF p_periodo_inicio IS NULL OR p_periodo_fim IS NULL OR p_periodo_fim < p_periodo_inicio THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o primeiro e o último mês do índice.' USING ERRCODE = '22023';
  END IF;
  IF p_efeito_inicio IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data de início dos efeitos.' USING ERRCODE = '22023';
  END IF;
  IF v_sei !~ '^\d{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número do documento SEI do apostilamento, com 7 a 10 dígitos.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ata_reajuste_parametros (ata_id) VALUES (p_ata_id) ON CONFLICT (ata_id) DO NOTHING;
  SELECT versao INTO v_versao FROM public.ata_reajuste_parametros WHERE ata_id = p_ata_id FOR UPDATE;
  IF p_versao_vista IS NOT NULL AND p_versao_vista <> v_versao THEN
    RAISE EXCEPTION 'CONFLITO_EDICAO: Outra pessoa alterou isto enquanto você editava.' USING ERRCODE = '40001';
  END IF;

  IF p_reajuste_id IS NOT NULL THEN
    UPDATE public.ata_reajustes
       SET percentual = p_percentual,
           periodo_inicio = date_trunc('month', p_periodo_inicio)::DATE,
           periodo_fim = date_trunc('month', p_periodo_fim)::DATE,
           efeito_inicio = p_efeito_inicio,
           sei_apostilamento = v_sei,
           informado_por = auth.uid(),
           informado_em = NOW()
     WHERE id = p_reajuste_id AND ata_id = p_ata_id
    RETURNING * INTO v_rec;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'REAJUSTE_NAO_ENCONTRADO: Reajuste não encontrado nesta ata.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    -- Migration 258: o mesmo reajuste (mesmos meses do índice) não entra duas vezes.
    SELECT * INTO v_rec FROM public.ata_reajustes x
     WHERE x.ata_id = p_ata_id
       AND x.periodo_inicio = date_trunc('month', p_periodo_inicio)::DATE
       AND x.periodo_fim = date_trunc('month', p_periodo_fim)::DATE
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'REAJUSTE_REPETIDO: O reajuste destes meses do índice já está registrado (%). Para mudar o percentual ou a data, use Corrigir na linha dele.',
        CASE WHEN v_rec.origem = 'PNCP'
             THEN COALESCE(left(v_rec.documento_titulo, 80), 'documento do PNCP') || COALESCE(', SEI ' || v_rec.sei_documento, '')
             ELSE 'informado pelo gestor' || COALESCE(', SEI ' || v_rec.sei_apostilamento, '') END
        USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.ata_reajustes (ata_id, origem, efeito_inicio, percentual, periodo_inicio, periodo_fim, sei_apostilamento, informado_por, informado_em)
    VALUES (p_ata_id, 'INFORMADO', p_efeito_inicio, p_percentual,
            date_trunc('month', p_periodo_inicio)::DATE, date_trunc('month', p_periodo_fim)::DATE, v_sei, auth.uid(), NOW())
    RETURNING * INTO v_rec;
  END IF;

  UPDATE public.ata_reajuste_parametros SET versao = versao + 1, atualizado_em = NOW() WHERE ata_id = p_ata_id;
  RETURN jsonb_build_object('success', true, 'reajuste', to_jsonb(v_rec));
END;
$function$;

-- O gestor que informa o preço passa a ser a origem dele (troca o lido do termo).
CREATE OR REPLACE FUNCTION public.informar_preco_apostilamento(p_ata_id uuid, p_reajuste_id uuid, p_precos jsonb, p_sei text, p_versao_vista integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ata    public.atas_registro_preco%ROWTYPE;
  v_sei    TEXT := btrim(COALESCE(p_sei, ''));
  v_versao INTEGER;
  v_item   TEXT;
  v_valor  TEXT;
  v_preco  NUMERIC;
  v_atual  NUMERIC;
  v_nome   TEXT := public.nome_do_usuario_logado();
  v_n      INTEGER := 0;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador informa o preço do apostilamento.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ata FROM public.atas_registro_preco WHERE id = p_ata_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_NAO_ENCONTRADA: Ata não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(NULL, public.chave_gestao_ata(v_ata.numero_ata || '-' || v_ata.codigo_uasg));
  IF v_sei !~ '^\d{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número do documento SEI do apostilamento, com 7 a 10 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_precos) <> 'object' OR p_precos = '{}'::JSONB THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o preço de pelo menos um item.' USING ERRCODE = '22023';
  END IF;
  IF p_reajuste_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ata_reajustes WHERE id = p_reajuste_id AND ata_id = p_ata_id) THEN
    RAISE EXCEPTION 'REAJUSTE_NAO_ENCONTRADO: Reajuste não encontrado nesta ata.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.ata_reajuste_parametros (ata_id) VALUES (p_ata_id) ON CONFLICT (ata_id) DO NOTHING;
  SELECT versao INTO v_versao FROM public.ata_reajuste_parametros WHERE ata_id = p_ata_id FOR UPDATE;
  IF p_versao_vista IS NOT NULL AND p_versao_vista <> v_versao THEN
    RAISE EXCEPTION 'CONFLITO_EDICAO: Outra pessoa alterou isto enquanto você editava.' USING ERRCODE = '40001';
  END IF;

  FOR v_item, v_valor IN SELECT key, value #>> '{}' FROM jsonb_each(p_precos) LOOP
    BEGIN
      v_preco := round(v_valor::NUMERIC, 2);
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Preço inválido no item %.', v_item USING ERRCODE = '22023';
    END;
    IF v_preco IS NULL OR v_preco <= 0 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o preço do item %.', v_item USING ERRCODE = '22023';
    END IF;
    SELECT valor_unitario INTO v_atual FROM public.itens_ata
     WHERE ata_id = p_ata_id AND lpad(numero_item, 5, '0') = lpad(v_item, 5, '0');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ITEM_NAO_ENCONTRADO: O item % não está nesta ata.', v_item USING ERRCODE = 'P0002';
    END IF;
    -- O preço antes é o da fonte, não um apostilado anterior: guardado só na primeira vez.
    INSERT INTO public.itens_ata_preco_apostilado AS x (ata_id, numero_item, preco, preco_antes, fonte_valor, ata_reajuste_id, sei_apostilamento,
                                                       informado_por, informado_por_nome, informado_em)
    SELECT p_ata_id, i.numero_item, v_preco, v_atual, v_atual, p_reajuste_id, v_sei, auth.uid(), v_nome, NOW()
      FROM public.itens_ata i WHERE i.ata_id = p_ata_id AND lpad(i.numero_item, 5, '0') = lpad(v_item, 5, '0')
    ON CONFLICT (ata_id, numero_item) DO UPDATE
      SET preco = EXCLUDED.preco, ata_reajuste_id = EXCLUDED.ata_reajuste_id, sei_apostilamento = EXCLUDED.sei_apostilamento,
          informado_por = EXCLUDED.informado_por, informado_por_nome = EXCLUDED.informado_por_nome, informado_em = EXCLUDED.informado_em,
          origem = 'GESTOR';
    UPDATE public.itens_ata SET valor_unitario = v_preco, valor_total = COALESCE(quantidade_homologada, 0) * v_preco
     WHERE ata_id = p_ata_id AND lpad(numero_item, 5, '0') = lpad(v_item, 5, '0');
    v_n := v_n + 1;
  END LOOP;

  UPDATE public.atas_registro_preco a
     SET valor_total = COALESCE((SELECT sum(COALESCE(i.quantidade_senasp, 0) * i.valor_unitario) FROM public.itens_ata i WHERE i.ata_id = a.id), 0)
   WHERE a.id = p_ata_id;
  UPDATE public.ata_reajuste_parametros SET versao = versao + 1, atualizado_em = NOW() WHERE ata_id = p_ata_id;
  RETURN jsonb_build_object('success', true, 'itens', v_n);
END;
$function$;

-- 5) Excluir o reajuste informado pelo gestor --------------------------------------
CREATE OR REPLACE FUNCTION public.excluir_reajuste_ata(p_ata_id UUID, p_reajuste_id UUID, p_versao_vista INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata    public.atas_registro_preco%ROWTYPE;
  v_rec    public.ata_reajustes%ROWTYPE;
  v_versao INTEGER;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador exclui o reajuste.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ata FROM public.atas_registro_preco WHERE id = p_ata_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATA_NAO_ENCONTRADA: Ata não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.exigir_alcance_do_gestor(NULL, public.chave_gestao_ata(v_ata.numero_ata || '-' || v_ata.codigo_uasg));

  SELECT * INTO v_rec FROM public.ata_reajustes WHERE id = p_reajuste_id AND ata_id = p_ata_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REAJUSTE_NAO_ENCONTRADO: Reajuste não encontrado nesta ata.' USING ERRCODE = 'P0002';
  END IF;
  IF v_rec.origem <> 'INFORMADO' THEN
    RAISE EXCEPTION 'REAJUSTE_DO_PNCP: O reajuste lido do PNCP não pode ser excluído. Use Corrigir para mudar o percentual ou a data.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ata_reajuste_parametros (ata_id) VALUES (p_ata_id) ON CONFLICT (ata_id) DO NOTHING;
  SELECT versao INTO v_versao FROM public.ata_reajuste_parametros WHERE ata_id = p_ata_id FOR UPDATE;
  IF p_versao_vista IS NOT NULL AND p_versao_vista <> v_versao THEN
    RAISE EXCEPTION 'CONFLITO_EDICAO: Outra pessoa alterou isto enquanto você editava.' USING ERRCODE = '40001';
  END IF;

  DELETE FROM public.ata_reajustes WHERE id = p_reajuste_id;
  UPDATE public.ata_reajuste_parametros SET versao = versao + 1, atualizado_em = NOW() WHERE ata_id = p_ata_id;
  RETURN jsonb_build_object('success', true, 'reajuste', to_jsonb(v_rec));
END;
$$;
REVOKE ALL ON FUNCTION public.excluir_reajuste_ata(UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_reajuste_ata(UUID, UUID, INTEGER) TO authenticated, service_role;

-- 6) Ciclos: mesmo reajuste com percentual igual ao centésimo -----------------------
CREATE OR REPLACE FUNCTION public.reajuste_ciclos_ata(p_ata_id uuid, p_hoje date DEFAULT CURRENT_DATE)
 RETURNS TABLE(ciclo integer, data_base date, aniversario date, efeito_inicio date, situacao text, percentual numeric, percentual_calculado numeric, meses_estimados integer, periodo_inicio date, periodo_fim date, reajuste_id uuid)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ata      RECORD;
  v_par      public.ata_reajuste_parametros%ROWTYPE;
  v_base     DATE;
  v_limite   DATE;
  v_aniv     DATE;
  v_efeito   DATE;
  v_k        INTEGER;
  v_n        INTEGER := 0;
  v_calc     RECORD;
  v_aplic    public.ata_reajustes[];
  v_ap       public.ata_reajustes;
  v_i        INTEGER := 1;
BEGIN
  SELECT a.id, a.data_vigencia_inicial AS ini, a.data_vigencia_final AS fim
    INTO v_ata FROM public.atas_registro_preco a WHERE a.id = p_ata_id;
  IF NOT FOUND OR v_ata.ini IS NULL OR v_ata.fim IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO v_par FROM public.ata_reajuste_parametros WHERE ata_id = p_ata_id;
  IF NOT FOUND OR v_par.clausula = 'SEM_REAJUSTE' THEN
    RETURN;
  END IF;

  v_base := COALESCE(v_par.termo_data, v_par.termo_mes_apostilamento, v_par.data_orcamento_edital);
  IF v_base IS NULL THEN
    RETURN;
  END IF;
  v_limite := (v_ata.ini + INTERVAL '2 years')::DATE;
  -- O mesmo reajuste aparece em mais de um documento da ata (termo aditivo de prorrogação e apostilamento,
  -- ou o PDF republicado): mesmo percentual (ao centésimo) e período contam uma vez. O informado pelo gestor tem preferência.
  SELECT COALESCE(array_agg(u.reg ORDER BY u.efeito, u.rid), '{}') INTO v_aplic
    FROM (
      SELECT DISTINCT ON (round(COALESCE(r.percentual, -1), 2), r.periodo_inicio, r.periodo_fim,
                          CASE WHEN r.periodo_inicio IS NULL THEN r.efeito_inicio END)
             r AS reg, r.efeito_inicio AS efeito, r.id AS rid
        FROM public.ata_reajustes r
       WHERE r.ata_id = p_ata_id
       ORDER BY round(COALESCE(r.percentual, -1), 2), r.periodo_inicio, r.periodo_fim,
                CASE WHEN r.periodo_inicio IS NULL THEN r.efeito_inicio END,
                (r.informado_por IS NULL), r.efeito_inicio, r.documento_pncp_sequencial NULLS FIRST
    ) u;

  LOOP
    v_n := v_n + 1;
    EXIT WHEN v_n > 6;
    v_aniv := (v_base + INTERVAL '1 year')::DATE;
    EXIT WHEN v_aniv >= v_limite AND v_i > COALESCE(array_length(v_aplic, 1), 0);
    -- Na assinatura, se o aniversário já passou; senão, na prorrogação.
    v_k := 0;
    WHILE (v_ata.ini + make_interval(years => v_k))::DATE < v_aniv LOOP
      v_k := v_k + 1;
    END LOOP;
    v_efeito := (v_ata.ini + make_interval(years => v_k))::DATE;

    SELECT * INTO v_calc FROM public.reajuste_variacao_12_meses(COALESCE(v_par.indice, 'IPCA'), v_base);

    IF v_i <= COALESCE(array_length(v_aplic, 1), 0) THEN
      v_ap := v_aplic[v_i];
      v_i := v_i + 1;
      ciclo := v_n; data_base := v_base; aniversario := v_aniv; efeito_inicio := v_ap.efeito_inicio;
      situacao := CASE WHEN v_ap.percentual IS NULL THEN 'PUBLICADO_SEM_PERCENTUAL' ELSE 'APLICADO' END;
      percentual := v_ap.percentual; percentual_calculado := v_calc.percentual; meses_estimados := v_calc.meses_estimados;
      periodo_inicio := COALESCE(v_ap.periodo_inicio, v_calc.primeiro_mes); periodo_fim := COALESCE(v_ap.periodo_fim, v_calc.ultimo_mes);
      reajuste_id := v_ap.id;
      RETURN NEXT;
      v_base := v_ap.efeito_inicio;
      CONTINUE;
    END IF;

    EXIT WHEN v_efeito >= v_limite;
    ciclo := v_n; data_base := v_base; aniversario := v_aniv; efeito_inicio := v_efeito;
    situacao := CASE WHEN v_efeito >= v_ata.fim THEN 'SE_PRORROGAR'
                     WHEN v_efeito <= p_hoje THEN 'DEVIDO'
                     ELSE 'PREVISTO' END;
    percentual := v_calc.percentual; percentual_calculado := v_calc.percentual; meses_estimados := v_calc.meses_estimados;
    periodo_inicio := v_calc.primeiro_mes; periodo_fim := v_calc.ultimo_mes; reajuste_id := NULL;
    RETURN NEXT;
    v_base := v_efeito;
  END LOOP;
END;
$function$;

-- 7) Carga dos termos já lidos (06/11/2026) -----------------------------------------
-- (id do reajuste, SEI do termo, novo início dos efeitos ou NULL, valores em reais do termo)
UPDATE public.ata_reajustes r
   SET sei_documento = COALESCE(c.sei, r.sei_documento),
       efeito_inicio = CASE WHEN c.efeito IS NOT NULL AND r.informado_por IS NULL THEN c.efeito ELSE r.efeito_inicio END,
       valores_documento = c.valores
  FROM (VALUES
  ('fd3295cc-dfc0-449a-bd23-06167eeb4213'::UUID, '33692875', NULL::DATE, '{5.17,40,42.07}'::NUMERIC[]),
  ('718339cf-67c4-4595-af20-0097b5ce06f8'::UUID, '33704766', NULL::DATE, '{5.17,798,839.27}'::NUMERIC[]),
  ('9a428ce7-82e6-4c88-aef8-fe60a2594aed'::UUID, '33712795', NULL::DATE, '{5.17,950,999.14}'::NUMERIC[]),
  ('df8311a0-9924-4598-afc4-0b7512238fee'::UUID, '33717149', NULL::DATE, '{5.17,195,205.09}'::NUMERIC[]),
  ('06067812-4d5a-468c-927a-d11e79e11bba'::UUID, '33728529', NULL::DATE, '{4.68,1004424,1051438.15}'::NUMERIC[]),
  ('8a93f6ae-0023-4210-9e6a-dce21a3a107d'::UUID, '34552361', NULL::DATE, '{295200,5608800,310902.9,5907155.07}'::NUMERIC[]),
  ('dc64ee89-7903-4378-86c8-a8483c525dd7'::UUID, '34929310', NULL::DATE, '{2026.17,4.44,18.8,19.63}'::NUMERIC[]),
  ('4e64d432-92f0-4bf1-a784-274ebf98bd2c'::UUID, '34710389', '2026-03-25'::DATE, '{5.32,71,74.78}'::NUMERIC[]),
  ('284be349-7a1e-4a2f-a424-b43c903ec34b'::UUID, '35041052', NULL::DATE, '{4.44,2026.17,148.99,155.61,33.96,35.47,68.5,71.54,292.43,305.42,20.52,21.43,1.66,1.73,485.22,506.77,89,92.95,74.18,77.47,281.34,293.84,5.55,5.8,11,11.49}'::NUMERIC[]),
  ('b5e75ad5-b084-4bae-9316-cfe91fd98351'::UUID, '34710423', '2026-03-21'::DATE, '{5.32,19,20.01,14,14.74}'::NUMERIC[]),
  ('30d73174-00ca-43c2-bf4e-8f765858dc4a'::UUID, '35050905', NULL::DATE, '{4.44,2026.17,3.5,3.66}'::NUMERIC[]),
  ('4c22f7c6-6816-4dd4-a438-a7a302b95a1c'::UUID, '34710464', '2026-03-25'::DATE, '{5.32,7.31,7.7}'::NUMERIC[]),
  ('bb75fe3a-f8de-4152-ab22-8f2702e254bc'::UUID, '35081289', NULL::DATE, '{4.44,48.5,50.65,2026.17,68.9,71.96,21,21.93,179.9,187.89,109,113.84,139,145.17}'::NUMERIC[]),
  ('fb2c8a0e-d5ea-4490-af2f-5a0973c42d00'::UUID, '34748259', '2026-03-14'::DATE, '{63.23,1273.23}'::NUMERIC[]),
  ('5d546737-e262-4803-a06e-cc9a59ff84ee'::UUID, '35120528', NULL::DATE, '{2026.19,4.44,161.15,168.31,5.55,5.8,25.75,26.89,19.5,20.37,39,40.73,11.39,11.9}'::NUMERIC[]),
  ('28093b76-462c-41de-b026-c729677d3dce'::UUID, '35102380', '2026-04-04'::DATE, '{28621.26}'::NUMERIC[]),
  ('b3edcfc2-8b2f-4794-8c9e-55b36ff7d5c3'::UUID, '35131247', NULL::DATE, '{2026.19,4.44,44,45.95}'::NUMERIC[]),
  ('7b145926-2d84-49d0-8e69-5ce8e34c8e1a'::UUID, '34902875', '2026-03-27'::DATE, '{496,520.56}'::NUMERIC[]),
  ('e2a427e6-4dd6-4461-97b0-c90c7f6a4984'::UUID, '35083520', NULL::DATE, '{4.44,850,887.75,2026.17,3600,3759.89}'::NUMERIC[]),
  ('664b5d2f-80c5-449d-8471-db607eae785e'::UUID, '34902984', '2026-03-27'::DATE, '{5.13,344,361.65}'::NUMERIC[]),
  ('7f7d809a-2810-40f3-992d-5ebf6be990e2'::UUID, '35290100', NULL::DATE, '{4.44,200,208.88,2026.16,190,198.44,65,67.89}'::NUMERIC[]),
  ('2d2f873f-68f3-4827-ba55-8b2127ed367e'::UUID, '35438871', NULL::DATE, '{2026.15,4.44,5850,6109.82}'::NUMERIC[]),
  ('e3d650d3-dad1-4fa3-bb95-967482937f84'::UUID, '34951009', '2026-04-04'::DATE, '{5.17,3470.69}'::NUMERIC[]),
  ('cdede014-e8b7-4b4b-82c1-1236821b4dfa'::UUID, '35276476', NULL::DATE, '{2026.16,4.44,1220.66,1274.87}'::NUMERIC[]),
  ('8844d23f-ff0f-477c-bdd5-c1986186b1e2'::UUID, '35342040', NULL::DATE, '{4.44,6.1,6.37,2026.11}'::NUMERIC[]),
  ('71057f10-f3b6-4756-8b20-d0bd52173778'::UUID, '35001627', '2026-04-16'::DATE, '{4.46,289017,301912.31}'::NUMERIC[]),
  ('d44e4889-e5d4-419e-809f-45b93b80a954'::UUID, '35290105', NULL::DATE, '{4.44,97,101.31,2026.16}'::NUMERIC[]),
  ('1d448a4f-9394-4d38-bafe-0b33f03045a8'::UUID, '34992791', '2026-04-05'::DATE, '{4.26,2026,549790,573234.96}'::NUMERIC[]),
  ('59addbad-a20f-4c43-a3b3-f27a5aa9e5f5'::UUID, '35357192', NULL::DATE, '{4.44,32,33.42,2026.11}'::NUMERIC[]),
  ('17896158-d780-48bf-b4b2-fc5c72355b54'::UUID, '35051305', '2026-04-05'::DATE, '{5172,5442.25}'::NUMERIC[]),
  ('6dc3460f-80e2-4a18-899b-c041a30c12d3'::UUID, '35049296', NULL::DATE, '{2890,3041.01}'::NUMERIC[]),
  ('c0675a4f-b72a-4405-9a93-e636aab9113b'::UUID, '32728085', NULL::DATE, '{5.23,1987.47,2091.32}'::NUMERIC[]),
  ('366d5270-43d5-48f4-bc5e-2347cedf1b35'::UUID, '35148061', '2026-05-01'::DATE, '{279,292.82}'::NUMERIC[]),
  ('ed46be20-5141-4d1f-bda4-8d5ab1c335c3'::UUID, '35869708', NULL::DATE, '{5.17,5.56,5304.53,974.81,5578.9,5057.48,929.41,5319.07,977.48}'::NUMERIC[]),
  ('57d34b83-12d8-41ba-86d7-d46456cc0a1d'::UUID, '35890395', '2026-06-28'::DATE, '{4.44,371006.88}'::NUMERIC[]),
  ('ee54b778-e0d6-4706-bc2e-c3e6aa50e4a1'::UUID, '34942196', NULL::DATE, '{4.44,183657.24,191811.62}'::NUMERIC[]),
  ('d95a19a4-1203-4cf3-8f06-00b5f5861f61'::UUID, '35935310', NULL::DATE, '{4.44,99490,103908.66}'::NUMERIC[]),
  ('cb0a166f-1692-4c60-9a7c-44be481afa05'::UUID, '36084518', '2026-07-17'::DATE, '{4.46,2026,295700,308893.66}'::NUMERIC[]),
  ('de617b85-4ddd-4794-be5b-51a7c050d7bb'::UUID, '33689413', NULL::DATE, '{5.35,2025.17,7232.32,7619.34}'::NUMERIC[]),
  ('4f805695-84b8-4531-b1a1-e2a603433306'::UUID, '32838733', NULL::DATE, '{5.23,2025.12,1420000,1494198.62}'::NUMERIC[]),
  ('2af186de-29ee-443f-b8bf-d25f8e1c8dd6'::UUID, '33146384', NULL::DATE, '{5.23,2025.16,1500000,1578378.82}'::NUMERIC[]),
  ('1275d480-459b-44d2-84eb-662f8b4fbcbe'::UUID, '36138802', NULL::DATE, '{1099,1147.27}'::NUMERIC[]),
  ('58f8c9d4-4e86-4836-a488-be6f83f4fe5c'::UUID, '33448095', NULL::DATE, '{5.13,9.97,5.5,5.78}'::NUMERIC[]),
  ('00be3549-7482-47f2-8c78-ecf53d25d0df'::UUID, '36431393', '2026-08-28'::DATE, '{5.62,270,285.17,411.84,434.98}'::NUMERIC[]),
  ('5d9cb723-af82-49a2-a435-9c54b039cc97'::UUID, '33579114', NULL::DATE, '{139000,146438.13}'::NUMERIC[]),
  ('1d6b4bf2-6ac3-4750-969b-476938130ff5'::UUID, '36437421', '2026-08-20'::DATE, '{5.62,328,346.43}'::NUMERIC[]),
  ('6fb28f3c-399c-42c6-82c6-213894087fa2'::UUID, '36155731', '2026-08-05'::DATE, '{102.8,112.74}'::NUMERIC[]),
  ('622efaa5-a524-4356-b37c-1fcfe68139db'::UUID, '33838362', NULL::DATE, '{5.13,2.29,2.41,2.35,2.47,2.44,2.57,2.5,2.63,2.68,2.82,2.92,3.07,3.01,3.16,3.06,3.22,3.08,3.24,3.11,3.27,3.32,3.21,3.37,2.01,2.11,2.06,2.17,2.13,2.24,2.19,2.3,2.34,2.46,2.56,2.69,2.72,2.86,2.77,2.91,2.81,2.95,3.76,3.95,3.85,4.05,4,4.21,4.1,4.31,4.39,4.62,4.79,5.04,4.94,5.19,5.02,5.28,5.06,5.32,5.1,5.36,5.46,5.27,5.54,2.7,2.76,2.73,2.87,2.8,2.94,3,3.15,3.44,3.54,3.42,3.6,3.45,3.63,3.72,3.78,4.53,4.42,4.65,4.58,4.81,4.7,5.03,5.29,5.49,5.77,5.66,5.95,5.75,6.04,5.8,6.1,5.85,6.15,5.94,6.24,6.35,5.56,3.23,3.14,3.3,3.26,3.43,3.52,3.7,3.58,3.91,4.11,4.03,4.24,4.09,4.3,4.13,4.34,4.16,4.37,4.23,4.45,4.52,7.62,3.98,4.18,4.07,4.28,4.56,4.64,4.88,5.22,5.3,5.57,5.35,5.62,5.39,5.67,5.48,5.76,5.86,3.56,3.74,3.86,4.06,4.15,4.43,4.5,4.73,4.91,5.16,5.07,5.33,5.15,5.41,5.23,5.5,5.59,5.69,5.93,6.23,6.08,6.39,6.31,6.63,6.48,6.81,6.93,7.29,7.56,7.95,7.8,8.2,7.92,8.33,7.98,8.39,8.05,8.46,8.32,8.75,4.85,4.97,5.42,6.17,6.49,6.52,6.85,6.57,6.91,6.68,7.02,6.79,7.14,3.48,3.66}'::NUMERIC[]),
  ('eb20f1de-c094-473b-a5cd-cae6638668d5'::UUID, '36176198', '2026-08-05'::DATE, '{91.9,100.79}'::NUMERIC[]),
  ('94fc9e7f-0ec4-45f2-82eb-830bb0944576'::UUID, '33593441', NULL::DATE, '{132000,139063.54}'::NUMERIC[]),
  ('443f62c5-4b13-441c-963a-0c87972f5206'::UUID, '36555313', '2026-08-20'::DATE, '{9.36,686.9,751.19,131.86}'::NUMERIC[]),
  ('dd85e644-ce2a-480b-9794-f89111b89812'::UUID, '33263479', NULL::DATE, '{5.17,2025.16,2439990,2566192.35}'::NUMERIC[]),
  ('11537754-4c18-4fa1-9244-3fe55d6cc40b'::UUID, '36585394', '2026-08-30'::DATE, '{8.33,700,758.31,800,866.64,1170,1267.46,415,449.57,1300,1408.29,1328,1438.62,1152,1247.96,1422,1540.45,1476,1598.95,1928,2088.6}'::NUMERIC[]),
  ('ae391448-7d85-45a2-ab27-042b9de57296'::UUID, '33537545', NULL::DATE, '{5.17,2025.16,1697800,1785614.44}'::NUMERIC[]),
  ('9b5cc81c-a8c7-407d-a832-3024e7b64ffb'::UUID, '34028867', NULL::DATE, '{5.13,143.2,150.55,328.96,345.84,690,725.4,130.56,137.26,609.42,640.68,73,76.74,368.42,387.32,35,36.8}'::NUMERIC[]),
  ('1585a073-7b17-4fa1-a943-a14f96359e46'::UUID, '33819542', NULL::DATE, '{5.13,80,84.1,98,103.03}'::NUMERIC[]),
  ('b8e0a29b-32ed-4f43-9a8f-4d9c9dd0bea5'::UUID, '33567870', NULL::DATE, '{5.13,2025.17,585000,615012.9}'::NUMERIC[]),
  ('2b03b513-9a88-492f-ab60-838c092fb76d'::UUID, '36154937', '2026-09-23'::DATE, '{2026.17,17999,4.99,18898.44}'::NUMERIC[]),
  ('8a9bed24-df8c-4272-96ad-3f371382ec54'::UUID, '33956432', NULL::DATE, '{2741000,2898064.78,2539000,2684489.78}'::NUMERIC[]),
  ('55bd9419-2519-4747-a4d7-7821e0925fbf'::UUID, '36938954', '2026-09-17'::DATE, '{4.72,285899,1.6,403403489}'::NUMERIC[]),
  ('588bc23e-2b8f-41d9-8cc7-e6288a537899'::UUID, '36760840', '2026-09-17'::DATE, '{7.24,182304.53}'::NUMERIC[]),
  ('2ce8981a-e33d-40e1-873c-50c1d8204438'::UUID, '33925556', NULL::DATE, '{5.17,2025.16,3899.75,4101.37,5771.25,6069.62,5695.25,5989.69,1148.96,1208.37,2945,3097.26}'::NUMERIC[]),
  ('12523909-6d28-424b-86ad-5d025dc36cf4'::UUID, '36135669', NULL::DATE, '{9.67,1394,1528.8}'::NUMERIC[]),
  ('51d65e23-b455-47dd-b2d0-09e11c5dc7b8'::UUID, '33963503', NULL::DATE, '{5.23,1183333.4,1245165.58,37368.6,39321.2}'::NUMERIC[]),
  ('0827e584-cecd-41d7-b47f-a16f60ed36e2'::UUID, '37022849', '2026-11-04'::DATE, '{}'::NUMERIC[]),
  ('c13ff96e-6e98-4af9-ba3a-77e8b5cf4ca4'::UUID, '33788476', NULL::DATE, '{5.17,517.51,18344176.97,544.28,19293093.16,95.1,3371092.38,100.02,3545408.94}'::NUMERIC[]),
  ('3a2657ab-425b-408b-825b-3eed8a9f3ef3'::UUID, '33655742', NULL::DATE, '{5.32,2025.1,119399,125750.78}'::NUMERIC[]),
  ('1e394263-4723-4684-893c-04014540b438'::UUID, '37059466', NULL::DATE, '{7.33,1990,2135.89}'::NUMERIC[]),
  ('bc6e5413-bcbf-4236-9c6c-99531c7b7bfb'::UUID, '33963459', NULL::DATE, '{5.32,2025.1,9798,10319.23}'::NUMERIC[]),
  ('f9be8c37-d111-4f8e-8d1c-41186be08e88'::UUID, '37066424', '2026-11-07'::DATE, '{}'::NUMERIC[]),
  ('6576360a-4d77-4c1a-83d4-bb7b9ee5c28d'::UUID, '33823912', NULL::DATE, '{21500,10000,34000,2229,7500,26430,19600}'::NUMERIC[]),
  ('eb276ee1-5d7e-438d-ad3f-42a7b757fe8e'::UUID, '37086880', '2026-11-04'::DATE, '{}'::NUMERIC[]),
  ('9657a44e-5fcc-49fe-9c46-2ef8c0860fbd'::UUID, '33852634', NULL::DATE, '{1977.6}'::NUMERIC[]),
  ('38e16ab2-08f5-4316-8944-86746f17e3bb'::UUID, '36977282', NULL::DATE, '{}'::NUMERIC[]),
  ('d3c32ae0-537d-402b-b227-4639ae6c28a2'::UUID, '33963350', '2025-12-27'::DATE, '{1550,5.13,1629.52,1088,1143.81,2880,3027.75,596,626.58}'::NUMERIC[]),
  ('f633e1b8-3733-4853-b240-8d80c9517db0'::UUID, '33963364', '2025-12-27'::DATE, '{95,5.13,99.87,698,733.81,229,240.74}'::NUMERIC[]),
  ('29f4f7ec-5125-4cee-9b6e-0d96991b9692'::UUID, '36977321', NULL::DATE, '{}'::NUMERIC[]),
  ('3a9d0970-3755-4595-b778-59d0eff73659'::UUID, '33963367', '2025-12-31'::DATE, '{38,5.13}'::NUMERIC[]),
  ('62436525-dfeb-4fc3-9c53-5ee07d2f5107'::UUID, '33963371', '2025-12-31'::DATE, '{113.26}'::NUMERIC[]),
  ('ec33a2f7-3a3d-47d5-b797-68c95a16e324'::UUID, '33963376', '2025-12-31'::DATE, '{1580,1661.06}'::NUMERIC[]),
  ('00be8aa2-d3e0-46e6-aa71-79d061eb5036'::UUID, '33963380', '2025-12-27'::DATE, '{159,5.13,167.16}'::NUMERIC[]),
  ('0b705543-b11e-4964-83bd-4b1419032150'::UUID, '33963384', '2025-12-27'::DATE, '{40270,42336.05}'::NUMERIC[]),
  ('cf764e10-3abd-407c-a12c-8df5557a1df3'::UUID, '34033143', NULL::DATE, '{2026.12,5.23,2890,3041.01}'::NUMERIC[]),
  ('75b456e3-664c-4880-a3c1-b72b8ca02f75'::UUID, '34033333', NULL::DATE, '{5.23,22500,23675.68}'::NUMERIC[]),
  ('83cf4d15-c4d3-4cca-9f29-7308fb0a39ef'::UUID, '33969353', NULL::DATE, '{5.17,13685.25,2025.16,44661.5}'::NUMERIC[]),
  ('5f83ed86-2a11-44c1-aaa4-c8e7a8c0d7fe'::UUID, '34063772', NULL::DATE, '{5.13,2025.17,32400,34062.25}'::NUMERIC[]),
  ('2db9e35b-c9ff-462c-aa71-fd852086acbb'::UUID, '33471815', NULL::DATE, '{5.17,645.7,679.1}'::NUMERIC[]),
  ('92a3d665-68d0-404c-b92b-bbf988e5af68'::UUID, '33636546', NULL::DATE, '{4.68,28.1,29.42}'::NUMERIC[]),
  ('cc127641-0742-4dfd-aa4c-deae524f49a3'::UUID, '33645389', NULL::DATE, '{5.17,36.99,38.9}'::NUMERIC[]),
  ('e058d334-ae2c-4dd9-9662-242803232b33'::UUID, '33926589', NULL::DATE, '{5.17,2025.16,26443.25,22977,26473.5,3003.12,3045.8,766.36,1418.87,5669.33,9075.35,12095.1,196.91,254.23,1343.2,775.38,1032.34}'::NUMERIC[]),
  ('a7397207-6a66-479c-b9d3-4d6b76b1b207'::UUID, '34108828', NULL::DATE, '{5.17,7000,7361.9,7600,7992.92,4000,4206.8,7690,8087.57,8100,8518.77,3600,3786.12,8000,8413.6,7800,8203.26,7900,8308.43,3500,3680.95,3100,3260.27,2980,3134.07,2900,3049.93,2970,3123.55}'::NUMERIC[]),
  ('6621aaf3-27f5-4090-987e-7d6832519b6b'::UUID, '34109389', NULL::DATE, '{5.17,445,468.01,235,247.15,178,187.2,210,220.86,195,205.08,93,97.81,88.87,132,138.82,209,219.81,256,269.24,356.22,374.64,458.02}'::NUMERIC[]),
  ('a984f15d-09b7-4b6d-8796-bebb3552613a'::UUID, '34109586', NULL::DATE, '{5.17,25.9,27.24,39.5,41.54,65.9,69.31,130,136.72,200,210.34,270,283.96,365,383.87,1700,1787.89}'::NUMERIC[]),
  ('a7707fc5-564a-45be-ba61-66d0d7381c43'::UUID, '34123167', NULL::DATE, '{2026.15,5.17,14695,15454.73,6999,7360.85,306.26,350.01,416,437.51}'::NUMERIC[]),
  ('99ebbee7-a691-4a6b-930c-55d488922759'::UUID, '34123452', NULL::DATE, '{2026.15,5.17,1088.91,1145.21,1949.99,2050.8,44.49,46.79,171,179.84}'::NUMERIC[]),
  ('78e931d4-ff86-4c01-bc6a-554c44a00625'::UUID, '34123761', NULL::DATE, '{2026.15,5.17,2630,2765.97,2015,2119.18}'::NUMERIC[]),
  ('69354fa5-1cb6-4b8f-9a77-e454de98039b'::UUID, '34124699', NULL::DATE, '{5.17,2026.15,52,54.69}'::NUMERIC[]),
  ('69a7fde0-954b-4ad1-81c7-1d95c465b8e7'::UUID, '34125840', NULL::DATE, '{5.17,2026.15,44.44,46.74}'::NUMERIC[]),
  ('be9560e4-76f0-410b-b40e-28eb1fe3a932'::UUID, '34244567', NULL::DATE, '{5.17,2026.14,715,751.98}'::NUMERIC[]),
  ('2a730404-0269-4ccf-b9d4-340fa5062abc'::UUID, '34279247', NULL::DATE, '{5.17,2400,2026.14}'::NUMERIC[]),
  ('f2b34353-d96e-4c27-b685-58fdb74925ed'::UUID, '34215701', NULL::DATE, '{5.17,2026.09,13517,14216.13}'::NUMERIC[]),
  ('c7531953-6fa0-4fd6-a59a-841602e2c45e'::UUID, '34222273', NULL::DATE, '{2026.09,5.17,68790,72347.99}'::NUMERIC[]),
  ('2a14a53a-2361-4ae0-9581-820f25d4c439'::UUID, '34161610', '2026-01-11'::DATE, '{679,699.11}'::NUMERIC[])
  ) AS c(id, sei, efeito, valores)
 WHERE r.id = c.id AND r.origem = 'PNCP';

-- O publicado prevalece sobre o informado dos mesmos meses do índice (ata 00056/2025, SEI 36938954).
DELETE FROM public.ata_reajustes x
 WHERE x.origem = 'INFORMADO' AND x.periodo_inicio IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.ata_reajustes y
                WHERE y.ata_id = x.ata_id AND y.origem = 'PNCP'
                  AND y.periodo_inicio = x.periodo_inicio AND y.periodo_fim = x.periodo_fim);

DO $$
DECLARE v_id UUID; v_n INTEGER := 0;
BEGIN
  FOR v_id IN SELECT id FROM public.ata_reajustes WHERE origem = 'PNCP' LOOP
    v_n := v_n + public.aplicar_preco_do_termo(v_id);
  END LOOP;
  RAISE NOTICE 'Preços lidos dos termos: %', v_n;
END $$;
