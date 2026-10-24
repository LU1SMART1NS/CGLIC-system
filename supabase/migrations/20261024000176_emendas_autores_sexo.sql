-- ==============================================================================
-- MIGRATION 176: EMENDAS PARLAMENTARES — SEXO DO PARLAMENTAR
-- Versão: 20261024000176_emendas_autores_sexo.sql
--
-- Pedido de 24/10/2026: o título da tabela para o parlamentar sai "do Deputado" ou "da Deputada" (e "do Senador" ou
-- "da Senadora"), como em documento oficial. O sexo vem das fontes, não do nome:
-- - Câmara: /api/v2/deputados?siglaSexo=F|M&dataInicio=<início da legislatura> (o filtro junto com idLegislatura
--   esgota o tempo da API, 504, em 24/10/2026);
-- - Senado: IdentificacaoParlamentar.SexoParlamentar ('Masculino' | 'Feminino') nas listas atual e da legislatura.
--
-- Só acrescenta: coluna sexo (M | F, vazia até a próxima leitura) e gravar_autores_emendas passa a gravá-la. Leitura
-- que não trouxer o sexo não apaga o que já está gravado.
-- ==============================================================================

ALTER TABLE public.emenda_autores ADD COLUMN IF NOT EXISTS sexo CHAR(1);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emenda_autores_sexo') THEN
    ALTER TABLE public.emenda_autores ADD CONSTRAINT emenda_autores_sexo CHECK (sexo IS NULL OR sexo IN ('M', 'F'));
  END IF;
END $$;

COMMENT ON COLUMN public.emenda_autores.sexo IS
  'M ou F, da Câmara (filtro siglaSexo) ou do Senado (SexoParlamentar); vazio enquanto a fonte não trouxe.';

CREATE OR REPLACE FUNCTION public.gravar_autores_emendas(p_autores JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  IF public.eh_service_role() IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só a sincronização do servidor grava os autores.' USING ERRCODE = '42501';
  END IF;
  IF p_autores IS NULL OR jsonb_typeof(p_autores) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_autores deve ser um array JSON.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_autores) > 2000 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 2000 autores por chamada.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.emenda_autores AS t (id, tipo, codigo_fonte, nome, nome_civil, partido, uf, em_exercicio,
                                          legislatura, url_foto, email, sexo, lido_em)
  SELECT a->>'id', a->>'tipo', a->>'codigo_fonte', left(btrim(a->>'nome'), 200), left(NULLIF(btrim(a->>'nome_civil'), ''), 200),
         left(NULLIF(btrim(a->>'partido'), ''), 30), NULLIF(upper(btrim(a->>'uf')), ''), (a->>'em_exercicio')::BOOLEAN,
         (a->>'legislatura')::INTEGER, NULLIF(a->>'url_foto', ''), left(NULLIF(btrim(a->>'email'), ''), 150),
         CASE WHEN upper(btrim(a->>'sexo')) IN ('M', 'F') THEN upper(btrim(a->>'sexo')) END, NOW()
    FROM jsonb_array_elements(p_autores) AS e(a)
   WHERE a->>'tipo' IN ('DEPUTADO', 'SENADOR')
     AND COALESCE(btrim(a->>'nome'), '') <> ''
  ON CONFLICT (id) DO UPDATE
    SET nome = EXCLUDED.nome, nome_civil = EXCLUDED.nome_civil, partido = EXCLUDED.partido, uf = EXCLUDED.uf,
        em_exercicio = EXCLUDED.em_exercicio, legislatura = GREATEST(t.legislatura, EXCLUDED.legislatura),
        url_foto = EXCLUDED.url_foto, email = EXCLUDED.email,
        -- A leitura sem o sexo (fonte falhou) não apaga o que já está gravado.
        sexo = COALESCE(EXCLUDED.sexo, t.sexo),
        lido_em = EXCLUDED.lido_em
    WHERE (t.nome, t.nome_civil, t.partido, t.uf, t.em_exercicio, t.url_foto, t.email, t.sexo)
          IS DISTINCT FROM (EXCLUDED.nome, EXCLUDED.nome_civil, EXCLUDED.partido, EXCLUDED.uf, EXCLUDED.em_exercicio,
                            EXCLUDED.url_foto, EXCLUDED.email, COALESCE(EXCLUDED.sexo, t.sexo));
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- Quem já foi lido e não veio nesta leitura deixou o cargo (a lista "em exercício" é a fonte).
  UPDATE public.emenda_autores t
     SET em_exercicio = FALSE
   WHERE t.tipo IN (SELECT DISTINCT a->>'tipo' FROM jsonb_array_elements(p_autores) AS e(a))
     AND t.em_exercicio IS TRUE
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_autores) AS e(a)
                      WHERE a->>'id' = t.id AND (a->>'em_exercicio')::BOOLEAN);
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_autores_emendas(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_autores_emendas(JSONB) TO service_role;
