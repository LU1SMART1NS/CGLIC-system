-- ==============================================================================
-- Migration 117: notas citadas por fatura fora do contrato, com veredito, e a marca
-- "Vou corrigir no Contratos.gov.br" do gestor. O vínculo de empenho à mão sai.
-- ==============================================================================
-- Decisão do usuário (13/10/2026): quem corrige no Contratos.gov.br é o próprio gestor do contrato,
-- e tudo se corrige lá (incluir a nota no contrato, mudar a fatura de contrato, corrigir o número).
-- O sistema só confere e registra quem está corrigindo; a sincronização traz a correção.
--
-- 1) v_empenhos_citados_fora_do_contrato: cada nota que uma fatura (não cancelada) cita e que não está
--    vinculada ao contrato da fatura, só em contratos cujos empenhos já foram lidos com sucesso. Mesma
--    comparação da v_contrato_faturas (pelo identificador da fonte). Veredito:
--      EM_OUTRO_CONTRATO  — o registro que a fatura cita está vinculado a outro contrato;
--      NOTA_EM_DOBRO      — este contrato tem outro registro com o mesmo número;
--      FORA_DOS_CONTRATOS — nenhum contrato acompanhado tem a nota.
-- 2) correcoes_empenho_na_fonte: a marca do gestor, com tipo e observação. Escrita só pelas RPCs.
--    A linha sai da fila quando a fatura deixa de citar a nota fora do contrato; sem isso em 7 dias,
--    volta a "a conferir" com o aviso de que a correção não chegou.
-- 3) Vínculo à mão desligado: as RPCs de vincular, desvincular, descartar e restaurar deixam de poder
--    ser chamadas por usuários. Em 13/10/2026 havia 0 vínculos MANUAL, 0 notas informadas à mão e
--    0 descartes em produção. Tabelas e colunas ficam, sem uso (a sincronização ainda as respeita).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) A marca do gestor
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.correcoes_empenho_na_fonte (
  id                BIGSERIAL PRIMARY KEY,
  id_fatura         BIGINT       NOT NULL,          -- contrato_faturas.id_fatura (sem FK: a marca é histórico)
  id_empenho_gov    TEXT         NOT NULL,          -- fatura_empenhos.id_empenho_gov
  numero_empenho    TEXT,
  contract_key      VARCHAR(150) NOT NULL,
  tipo              TEXT         NOT NULL CHECK (tipo IN (
                      'MUDAR_FATURA_DE_CONTRATO', 'TROCAR_REGISTRO_DA_NOTA', 'CORRIGIR_NUMERO_NA_FATURA',
                      'INCLUIR_NOTA_NO_CONTRATO', 'OUTRO')),
  observacao        TEXT         CHECK (observacao IS NULL OR char_length(observacao) BETWEEN 1 AND 500),
  marcado_por       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  marcado_por_nome  TEXT,
  marcado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  desfeito_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  desfeito_por_nome TEXT,
  desfeito_em       TIMESTAMPTZ,
  CONSTRAINT correcoes_empenho_na_fonte_contract_key_formato CHECK (contract_key ~ '^[0-9]{6}-(NE)?[0-9]{5}-[0-9]{4}$')
);

-- Uma marca ativa por nota citada numa fatura.
CREATE UNIQUE INDEX IF NOT EXISTS correcoes_empenho_na_fonte_ativa_uidx
  ON public.correcoes_empenho_na_fonte (id_fatura, id_empenho_gov) WHERE desfeito_em IS NULL;

ALTER TABLE public.correcoes_empenho_na_fonte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura para logados: correcoes_empenho_na_fonte" ON public.correcoes_empenho_na_fonte;
CREATE POLICY "Leitura para logados: correcoes_empenho_na_fonte"
  ON public.correcoes_empenho_na_fonte FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.correcoes_empenho_na_fonte FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.correcoes_empenho_na_fonte FROM authenticated;
GRANT SELECT ON public.correcoes_empenho_na_fonte TO authenticated;
GRANT ALL ON public.correcoes_empenho_na_fonte TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.correcoes_empenho_na_fonte_id_seq TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_correcoes_empenho_na_fonte ON public.correcoes_empenho_na_fonte;
    CREATE TRIGGER trg_audit_correcoes_empenho_na_fonte
      AFTER INSERT OR UPDATE OR DELETE ON public.correcoes_empenho_na_fonte
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2) A fila com o veredito
-- ------------------------------------------------------------------------------
-- Mesmo critério do normalizeEmpenhoNumero do app: "2025ne000215" → "2025NE215".
CREATE OR REPLACE FUNCTION public.numero_empenho_normalizado(p_numero TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(
    upper(regexp_replace(COALESCE(p_numero, ''), '[^0-9A-Za-z]', '', 'g')),
    '^([0-9]{4})NE0*([0-9]+)$', '\1NE\2'
  );
$$;
GRANT EXECUTE ON FUNCTION public.numero_empenho_normalizado(TEXT) TO authenticated, service_role;

-- A busca de outro registro com o mesmo número (nota em dobro, homônimas) lia a tabela inteira por linha
-- (ensaio de 13/10/2026: 226 de 258 ms).
CREATE INDEX IF NOT EXISTS idx_empenhos_numero_normalizado ON public.empenhos (numero_normalizado);

CREATE OR REPLACE VIEW public.v_empenhos_citados_fora_do_contrato
WITH (security_invoker = true)
AS
WITH citadas AS (
  SELECT
    f.id_fatura,
    f.contract_key,
    f.numero          AS fatura_numero,
    f.emissao         AS fatura_emissao,
    f.referencia      AS fatura_referencia,
    f.vencimento      AS fatura_vencimento,
    f.valor_liquido   AS fatura_valor_liquido,
    fe.id_empenho_gov,
    fe.numero_empenho,
    public.numero_empenho_normalizado(fe.numero_empenho) AS numero_normalizado
  FROM public.fatura_empenhos fe
  JOIN public.contrato_faturas f ON f.id_fatura = fe.id_fatura
  -- Antes de os empenhos do contrato serem lidos, toda nota pareceria fora do contrato.
  JOIN public.contrato_empenhos_sincronizacao s ON s.contract_key = f.contract_key AND s.ultimo_sucesso_em IS NOT NULL
  WHERE NOT f.cancelada
    AND NOT EXISTS (
      SELECT 1
        FROM public.empenhos e
        JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id
       WHERE e.identificador_fonte = fe.id_empenho_gov
         AND ce.contract_key = f.contract_key
    )
)
SELECT
  c.id_fatura,
  c.contract_key,
  c.fatura_numero,
  c.fatura_emissao,
  c.fatura_referencia,
  c.fatura_vencimento,
  c.fatura_valor_liquido,
  c.id_empenho_gov,
  c.numero_empenho,
  -- O registro que a fatura cita, se o sistema o tem.
  nota.id              AS empenho_id,
  nota.numero_oficial,
  nota.uasg_emitente,
  nota.data_emissao,
  nota.valor_empenhado,
  nota.credor_nome,
  nota.credor_cnpj_cpf,
  COALESCE(outros.contratos, ARRAY[]::TEXT[]) AS outros_contratos,
  dobro.registro       AS registro_no_contrato,
  COALESCE(homonimas.lista, '[]'::jsonb) AS homonimas,
  COALESCE(da_fatura.lista, '[]'::jsonb) AS outras_notas_da_fatura,
  CASE
    WHEN cardinality(outros.contratos) > 0 THEN 'EM_OUTRO_CONTRATO'
    WHEN dobro.registro IS NOT NULL THEN 'NOTA_EM_DOBRO'
    ELSE 'FORA_DOS_CONTRATOS'
  END AS veredito,
  m.id               AS correcao_id,
  m.tipo             AS correcao_tipo,
  m.observacao       AS correcao_observacao,
  m.marcado_por_nome AS correcao_por_nome,
  m.marcado_em       AS correcao_em,
  CASE
    WHEN m.id IS NULL THEN 'A_CONFERIR'
    WHEN m.marcado_em > NOW() - INTERVAL '7 days' THEN 'CORRIGINDO'
    ELSE 'CORRECAO_NAO_CHEGOU'
  END AS situacao
FROM citadas c
LEFT JOIN LATERAL (
  SELECT e.* FROM public.empenhos e WHERE e.identificador_fonte = c.id_empenho_gov ORDER BY e.updated_at DESC NULLS LAST LIMIT 1
) nota ON TRUE
LEFT JOIN LATERAL (
  SELECT array_agg(DISTINCT ce.contract_key::TEXT ORDER BY ce.contract_key::TEXT) AS contratos
    FROM public.contrato_empenhos ce
   WHERE ce.empenho_id = nota.id AND ce.contract_key <> c.contract_key
) outros ON TRUE
LEFT JOIN LATERAL (
  SELECT jsonb_build_object(
           'numero_oficial', e.numero_oficial, 'uasg_emitente', e.uasg_emitente,
           'data_emissao', e.data_emissao, 'valor_empenhado', e.valor_empenhado
         ) AS registro
    FROM public.empenhos e
    JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id AND ce.contract_key = c.contract_key
   WHERE e.numero_normalizado = c.numero_normalizado
     AND e.identificador_fonte IS DISTINCT FROM c.id_empenho_gov
   ORDER BY e.data_emissao
   LIMIT 1
) dobro ON TRUE
LEFT JOIN LATERAL (
  -- Mesmo número em outra UG ou outro credor, sem relação com este contrato.
  SELECT jsonb_agg(jsonb_build_object(
           'uasg_emitente', e.uasg_emitente, 'credor_nome', e.credor_nome,
           'contratos', (SELECT COALESCE(jsonb_agg(DISTINCT ce.contract_key), '[]'::jsonb) FROM public.contrato_empenhos ce WHERE ce.empenho_id = e.id)
         ) ORDER BY e.uasg_emitente) AS lista
    FROM public.empenhos e
   WHERE e.numero_normalizado = c.numero_normalizado
     AND e.identificador_fonte IS DISTINCT FROM c.id_empenho_gov
     AND NOT EXISTS (SELECT 1 FROM public.contrato_empenhos ce WHERE ce.empenho_id = e.id AND ce.contract_key = c.contract_key)
) homonimas ON TRUE
LEFT JOIN LATERAL (
  -- As outras notas que a mesma fatura cita, e se cada uma está neste contrato.
  SELECT jsonb_agg(jsonb_build_object(
           'numero_empenho', fe2.numero_empenho,
           'no_contrato', EXISTS (
             SELECT 1 FROM public.empenhos e JOIN public.contrato_empenhos ce ON ce.empenho_id = e.id
              WHERE e.identificador_fonte = fe2.id_empenho_gov AND ce.contract_key = c.contract_key)
         ) ORDER BY fe2.numero_empenho) AS lista
    FROM public.fatura_empenhos fe2
   WHERE fe2.id_fatura = c.id_fatura AND fe2.id_empenho_gov <> c.id_empenho_gov
) da_fatura ON TRUE
LEFT JOIN LATERAL (
  SELECT * FROM public.correcoes_empenho_na_fonte m
   WHERE m.id_fatura = c.id_fatura AND m.id_empenho_gov = c.id_empenho_gov
     AND m.contract_key = c.contract_key AND m.desfeito_em IS NULL
   ORDER BY m.marcado_em DESC
   LIMIT 1
) m ON TRUE;

COMMENT ON VIEW public.v_empenhos_citados_fora_do_contrato IS
  'Notas citadas por fatura e fora do contrato da fatura, com veredito e a marca do gestor (migration 117). Fila Vinculação › Empenhos ao contrato.';

REVOKE ALL ON public.v_empenhos_citados_fora_do_contrato FROM PUBLIC, anon;
GRANT SELECT ON public.v_empenhos_citados_fora_do_contrato TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3) Marcar e desfazer "Vou corrigir no Contratos.gov.br"
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_correcao_empenho_na_fonte(
  p_id_fatura BIGINT,
  p_id_empenho_gov TEXT,
  p_tipo TEXT,
  p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_obs TEXT := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_linha RECORD;
  v_id BIGINT;
  v_nome TEXT;
BEGIN
  IF NOT COALESCE(public.has_role('gestor'), FALSE) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador marca a correção no Contratos.gov.br.' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('MUDAR_FATURA_DE_CONTRATO', 'TROCAR_REGISTRO_DA_NOTA', 'CORRIGIR_NUMERO_NA_FATURA', 'INCLUIR_NOTA_NO_CONTRATO', 'OUTRO') THEN
    RAISE EXCEPTION 'INVALID_TIPO: Escolha o que vai ser corrigido.' USING ERRCODE = '22023';
  END IF;
  IF v_obs IS NOT NULL AND char_length(v_obs) > 500 THEN
    RAISE EXCEPTION 'INVALID_OBSERVACAO: A observação tem no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT v.contract_key, v.numero_empenho INTO v_linha
    FROM public.v_empenhos_citados_fora_do_contrato v
   WHERE v.id_fatura = p_id_fatura AND v.id_empenho_gov = btrim(COALESCE(p_id_empenho_gov, ''));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JA_RESOLVIDA: A fatura não cita mais esta nota fora do contrato. Atualize a lista.' USING ERRCODE = 'P0002';
  END IF;

  v_nome := public.nome_do_usuario_logado();

  -- Marcar de novo renova a marca (novo prazo de 7 dias).
  UPDATE public.correcoes_empenho_na_fonte
     SET tipo = p_tipo, observacao = v_obs, contract_key = v_linha.contract_key, numero_empenho = v_linha.numero_empenho,
         marcado_por = auth.uid(), marcado_por_nome = v_nome, marcado_em = NOW()
   WHERE id_fatura = p_id_fatura AND id_empenho_gov = btrim(p_id_empenho_gov) AND desfeito_em IS NULL
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    INSERT INTO public.correcoes_empenho_na_fonte (id_fatura, id_empenho_gov, numero_empenho, contract_key, tipo, observacao, marcado_por, marcado_por_nome)
    VALUES (p_id_fatura, btrim(p_id_empenho_gov), v_linha.numero_empenho, v_linha.contract_key, p_tipo, v_obs, auth.uid(), v_nome)
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'marcado_por_nome', v_nome);
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_correcao_empenho_na_fonte(BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_correcao_empenho_na_fonte(BIGINT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.desfazer_correcao_empenho_na_fonte(
  p_id_fatura BIGINT,
  p_id_empenho_gov TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  IF NOT COALESCE(public.has_role('gestor'), FALSE) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador desfaz a marca.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.correcoes_empenho_na_fonte
     SET desfeito_em = NOW(), desfeito_por = auth.uid(), desfeito_por_nome = public.nome_do_usuario_logado()
   WHERE id_fatura = p_id_fatura AND id_empenho_gov = btrim(COALESCE(p_id_empenho_gov, '')) AND desfeito_em IS NULL
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'SEM_MARCA: Esta nota não está marcada como em correção.' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.desfazer_correcao_empenho_na_fonte(BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_correcao_empenho_na_fonte(BIGINT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4) Vínculo de empenho à mão desligado
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.vincular_empenho_manual_ao_contrato(VARCHAR, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.desvincular_empenho_manual_do_contrato(VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.descartar_empenho_do_contrato(VARCHAR, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restaurar_empenho_do_contrato(VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
