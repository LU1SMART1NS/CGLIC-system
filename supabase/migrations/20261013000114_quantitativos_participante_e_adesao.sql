-- ==============================================================================
-- MIGRATION 114: QUANTITATIVOS FORA DA CGLIC — SENASP PARTICIPANTE E SENASP EM ADESÃO
-- Versão: 20261013000114_quantitativos_participante_e_adesao.sql
--
-- Pedido do usuário (13/10/2026): na ata de outro órgão em que a SENASP é participante não dava para informar a
-- quantidade da ata assinada; e na adesão a quantidade da SENASP precisa seguir a mesma lógica.
-- Protótipo aprovado: https://claude.ai/artifact/8UXkZrGneHn1dbrPhW1sov ("sim para as três" decisões).
--
-- O que entra
-- 1) informar_quantidades_ata_assinada aceita item de ata de outro órgão em que a SENASP é participante, só com
--    a quantidade da SENASP (UASG 200330 ou 200331). Na adesão recusa: não há ata assinada.
-- 2) v_item_quantitativos_orgaos: na ata de outro órgão só entra a linha da SENASP, com a mesma regra dos
--    participantes da ata da SENASP (Igual, Gerenciado pela gerenciadora, Remanejado a menos definitivo, salvo
--    "continua da SENASP", Remanejado a mais, Acima da ata assinada, Fora da ata assinada). Coluna nova no fim:
--    ata_da_senasp.
-- 3) v_arp_item_saldo_detalhado: a base do saldo da ata de outro órgão continua o registrado da SENASP (a ata
--    assinada não aumenta o limite). Colunas novas no fim: situacao_senasp_participante,
--    assinada_senasp_participante e gerenciado_pela_gerenciadora (o que a ata assinada dá a mais e está no
--    registrado da gerenciadora; vira pendência do gestor de saldo quando o saldo do item estiver crítico).
-- 4) adesao_quantidade_informada + informar_quantidade_adesao: exceção da adesão aprovada sem quantidade no
--    Compras.gov.br. O gestor da ata ou o coordenador informa a quantidade com o documento SEI da autorização
--    (8 dígitos). Quando a fonte trouxer o número, vale o da fonte.
-- 5) espelhar_participacao_na_carteira: na adesão, a quantidade da SENASP é a soma das adesões aprovadas, com a
--    informada à mão no lugar da que veio sem quantidade (antes, o item inteiro ficava 0).
--
-- Atas da SENASP (gerenciadora 200330/200331): nada muda.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Quantidade aprovada da adesão informada à mão
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.adesao_quantidade_informada (
  item_key              VARCHAR(100) NOT NULL,
  uasg                  VARCHAR(6)   NOT NULL CHECK (uasg IN ('200330', '200331')),
  aprovada_em           TIMESTAMP    NOT NULL,
  quantidade            NUMERIC(18, 4) NOT NULL CHECK (quantidade > 0 AND quantidade = trunc(quantidade)),
  documento_sei         VARCHAR(8)   NOT NULL CHECK (documento_sei ~ '^[0-9]{8}$'),
  justificativa         TEXT CHECK (justificativa IS NULL OR length(btrim(justificativa)) BETWEEN 15 AND 500),
  informado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  informado_por_nome    VARCHAR(150) NOT NULL,
  informado_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_key, uasg, aprovada_em)
);
CREATE INDEX IF NOT EXISTS adesao_quantidade_informada_user_idx ON public.adesao_quantidade_informada (informado_por_user_id) WHERE informado_por_user_id IS NOT NULL;
COMMENT ON TABLE public.adesao_quantidade_informada IS
  'Quantidade aprovada de uma adesão da SENASP que veio sem quantidade do Compras.gov.br (consulta 5), informada pelo gestor da ata ou pelo coordenador com o documento SEI da autorização. A adesão é identificada pela UASG e pela data da aprovação. Vale só enquanto a fonte não traz o número. Grava só por informar_quantidade_adesao.';

ALTER TABLE public.adesao_quantidade_informada ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: adesao_quantidade_informada" ON public.adesao_quantidade_informada;
CREATE POLICY "Authenticated Read: adesao_quantidade_informada" ON public.adesao_quantidade_informada FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.adesao_quantidade_informada FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.adesao_quantidade_informada FROM authenticated;
GRANT SELECT ON public.adesao_quantidade_informada TO authenticated;
GRANT ALL ON public.adesao_quantidade_informada TO service_role;
DROP TRIGGER IF EXISTS trg_audit_adesao_quantidade_informada ON public.adesao_quantidade_informada;
CREATE TRIGGER trg_audit_adesao_quantidade_informada AFTER INSERT OR UPDATE OR DELETE ON public.adesao_quantidade_informada
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- Soma das adesões aprovadas da SENASP num item: a quantidade da fonte e, sem ela, a informada à mão.
-- Adesão sem nenhuma das duas conta 0. Nula quando a lista não tem adesão da SENASP.
CREATE OR REPLACE FUNCTION public.quantidade_senasp_da_adesao(p_item_key TEXT, p_adesoes JSONB)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE COALESCE(sum(COALESCE(a.fonte, m.quantidade, 0)), 0) END
    FROM (
      SELECT substring(e->>'unidadeNaoParticipante' FROM '^\s*([0-9]{6})') AS uasg,
             CASE WHEN e->>'dataAprovacaoAnalise' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
                  THEN left(e->>'dataAprovacaoAnalise', 19)::TIMESTAMP END AS aprovada_em,
             CASE WHEN btrim(COALESCE(e->>'quantidadeAprovadaAdesao', '')) ~ '^[0-9]+(\.[0-9]+)?$'
                  THEN btrim(e->>'quantidadeAprovadaAdesao')::NUMERIC END AS fonte
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_adesoes) = 'array' THEN p_adesoes ELSE '[]'::JSONB END) AS e
       WHERE jsonb_typeof(e) = 'object'
    ) a
    LEFT JOIN public.adesao_quantidade_informada m
      ON m.item_key = p_item_key AND m.uasg = a.uasg AND m.aprovada_em = a.aprovada_em
   WHERE a.uasg IN ('200330', '200331');
$$;
REVOKE ALL ON FUNCTION public.quantidade_senasp_da_adesao(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quantidade_senasp_da_adesao(TEXT, JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2) Situação de cada órgão: na ata de outro órgão, só a linha da SENASP (igual à migration 109 no resto)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_item_quantitativos_orgaos
WITH (security_invoker = true)
AS
WITH informados AS (
  SELECT DISTINCT r.item_key FROM public.ata_item_assinada_registros r
), reg AS (
  SELECT c.item_key, c.historico_desde, x.uasg, x.nome_orgao, x.tipo_unidade, x.quantidade, x.incluido_em, x.atualizado_em
    FROM public.itens_ata_unidades_copia c
    JOIN informados i ON i.item_key = c.item_key
    CROSS JOIN LATERAL public.registrado_por_uasg(c.unidades) x
), grupo AS (
  SELECT r.item_key, r.atualizado_em, count(*) AS n
    FROM reg r WHERE r.atualizado_em IS NOT NULL
   GROUP BY r.item_key, r.atualizado_em
), hist AS (
  SELECT h.item_key, h.uasg, max(COALESCE(h.atualizado_na_fonte, (h.lido_em AT TIME ZONE 'America/Sao_Paulo'))) AS mudou_em
    FROM public.itens_ata_unidades_historico h
    JOIN informados i ON i.item_key = h.item_key
   GROUP BY h.item_key, h.uasg
), rem AS (
  SELECT r.item_key, r.uasg_origem AS uasg, sum(r.quantidade) AS confirmado
    FROM public.ata_item_remanejamentos r
   WHERE r.desfeito_em IS NULL
   GROUP BY r.item_key, r.uasg_origem
), orgaos AS (
  -- Ata de outro órgão: só a SENASP tem quantidade da ata assinada; os outros órgãos não são acompanhados.
  SELECT x.item_key, x.uasg FROM (
    SELECT q.item_key, q.uasg FROM public.ata_item_quantidade_assinada q JOIN informados i ON i.item_key = q.item_key
    UNION
    SELECT r.item_key, r.uasg FROM reg r
  ) x
   WHERE split_part(x.item_key, '-', 2) IN ('200330', '200331') OR x.uasg IN ('200330', '200331')
), base AS (
  SELECT o.item_key,
         o.uasg,
         COALESCE(r.nome_orgao, q.nome_orgao)::TEXT AS nome_orgao,
         r.tipo_unidade,
         (o.uasg IN ('200330', '200331')) AS eh_senasp,
         (split_part(o.item_key, '-', 2) IN ('200330', '200331')) AS ata_da_senasp,
         COALESCE(q.quantidade, 0) AS quantidade_assinada,
         r.quantidade AS quantidade_registrada,
         r.incluido_em,
         r.atualizado_em,
         h.mudou_em AS mudou_no_historico_em,
         (r.atualizado_em IS NOT NULL AND r.incluido_em IS NOT NULL
           AND r.atualizado_em > r.incluido_em + INTERVAL '1 day'
           AND r.atualizado_em < (r.historico_desde AT TIME ZONE 'America/Sao_Paulo')
           AND COALESCE(g.n, 1) <= 3) AS mudou_antes_do_historico,
         COALESCE(rm.confirmado, 0) AS remanejado_confirmado,
         co.quantidade AS continua_do_orgao
    FROM orgaos o
    LEFT JOIN reg r ON r.item_key = o.item_key AND r.uasg = o.uasg
    LEFT JOIN public.ata_item_quantidade_assinada q ON q.item_key = o.item_key AND q.uasg = o.uasg
    LEFT JOIN grupo g ON g.item_key = r.item_key AND g.atualizado_em = r.atualizado_em
    LEFT JOIN hist h ON h.item_key = o.item_key AND h.uasg = o.uasg
    LEFT JOIN rem rm ON rm.item_key = o.item_key AND rm.uasg = o.uasg
    LEFT JOIN public.ata_item_continua_orgao co ON co.item_key = o.item_key AND co.uasg = o.uasg
), calc AS (
  SELECT b.*,
         (b.mudou_no_historico_em IS NOT NULL OR b.mudou_antes_do_historico) AS mudou,
         GREATEST(b.quantidade_assinada - COALESCE(b.quantidade_registrada, 0), 0) AS falta,
         GREATEST(COALESCE(b.quantidade_registrada, 0) - b.quantidade_assinada, 0) AS acima
    FROM base b
), calc2 AS (
  SELECT c.*,
         LEAST(c.remanejado_confirmado, c.falta) AS confirmado_valido,
         c.falta - LEAST(c.remanejado_confirmado, c.falta) AS resto
    FROM calc c
), sit AS (
  SELECT c.*,
         CASE
           WHEN c.eh_senasp AND c.ata_da_senasp THEN 'SENASP'
           WHEN c.quantidade_registrada IS NOT NULL AND c.quantidade_assinada = 0 AND c.quantidade_registrada > 0 THEN 'FORA_DA_ATA'
           WHEN c.falta = 0 AND c.acima = 0 THEN 'IGUAL'
           WHEN c.acima > 0 THEN CASE WHEN c.mudou THEN 'REMANEJADO_A_MAIS' ELSE 'ACIMA_DA_ATA' END
           WHEN c.resto = 0 THEN 'REMANEJAMENTO_CONFIRMADO'
           WHEN c.quantidade_registrada IS NOT NULL AND c.mudou THEN 'REMANEJADO_A_MENOS'
           ELSE 'GERENCIADO'
         END AS situacao
    FROM calc2 c
)
SELECT s.item_key,
       s.uasg,
       s.nome_orgao,
       s.tipo_unidade,
       s.eh_senasp,
       s.quantidade_assinada,
       s.quantidade_registrada,
       (s.quantidade_registrada IS NULL) AS sem_registro,
       s.situacao,
       CASE WHEN s.eh_senasp AND s.ata_da_senasp THEN 0 ELSE s.falta END AS falta,
       CASE WHEN s.eh_senasp AND s.ata_da_senasp THEN 0 ELSE s.acima END AS acima,
       CASE WHEN s.eh_senasp AND s.ata_da_senasp THEN 0 ELSE s.confirmado_valido END AS remanejado_confirmado,
       CASE WHEN s.eh_senasp AND s.ata_da_senasp THEN 0 ELSE s.resto END AS resto,
       s.continua_do_orgao,
       CASE s.situacao
         WHEN 'GERENCIADO' THEN s.resto
         WHEN 'REMANEJADO_A_MENOS' THEN LEAST(COALESCE(s.continua_do_orgao, 0), s.resto)
         ELSE 0
       END AS gerenciado,
       s.mudou,
       COALESCE(s.mudou_no_historico_em, CASE WHEN s.mudou_antes_do_historico THEN s.atualizado_em END) AS mudou_em,
       s.atualizado_em,
       s.incluido_em,
       s.ata_da_senasp
  FROM sit s;

COMMENT ON VIEW public.v_item_quantitativos_orgaos IS
  'Um órgão por linha, só nos itens com a ata assinada informada: ata assinada × registrado no Compras.gov.br, situação e quanto é gerenciado para o órgão. Na ata da SENASP, todos os órgãos (gerenciado pela SENASP, fora da cota própria). Na ata de outro órgão (ata_da_senasp = false), só a linha da SENASP, e gerenciado é o que está com a gerenciadora.';
REVOKE ALL ON public.v_item_quantitativos_orgaos FROM PUBLIC, anon;
GRANT SELECT ON public.v_item_quantitativos_orgaos TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3) Informar a ata assinada: também na ata de outro órgão, só a quantidade da SENASP; na adesão, recusa
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.informar_quantidades_ata_assinada(
  p_item_key      VARCHAR,
  p_quantidades   JSONB,
  p_documento_sei TEXT,
  p_justificativa TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key       VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_doc       TEXT := btrim(COALESCE(p_documento_sei, ''));
  v_just      TEXT := NULLIF(btrim(COALESCE(p_justificativa, '')), '');
  v_homologado NUMERIC;
  v_copia     JSONB;
  v_elem      JSONB;
  v_uasg      TEXT;
  v_nome      TEXT;
  v_qtd       NUMERIC;
  v_lista     JSONB := '[]'::JSONB;
  v_total     NUMERIC := 0;
  v_ja_tem    BOOLEAN;
  v_doc_ant   TEXT;
  v_lista_ant JSONB;
  v_papel     TEXT;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador informa as quantidades da ata assinada.'
      USING ERRCODE = '42501';
  END IF;

  -- Ata da SENASP: todos os órgãos. Ata de outro órgão em que a SENASP é participante (migration 114): só a SENASP.
  SELECT COALESCE(i.quantidade_homologada, 0),
         CASE WHEN a.codigo_uasg IN ('200330', '200331') THEN 'GERENCIADORA' ELSE COALESCE(a.papel_senasp, 'PARTICIPANTE') END
    INTO v_homologado, v_papel
    FROM public.itens_ata i
    JOIN public.atas_registro_preco a ON a.id = i.ata_id
   WHERE (a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item::TEXT, 5, '0')) = v_key
     AND (a.codigo_uasg IN ('200330', '200331') OR a.uasg_carteira IN ('200330', '200331'));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NAO_ENCONTRADO: O item % não está numa ata da carteira da SENASP.', v_key
      USING ERRCODE = 'P0002';
  END IF;
  IF v_papel = 'ADESAO' THEN
    RAISE EXCEPTION 'ADESAO_SEM_ATA_ASSINADA: Na adesão não há ata assinada: a quantidade da SENASP é a aprovada pela gerenciadora no Compras.gov.br.'
      USING ERRCODE = '22023';
  END IF;

  IF v_doc !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT: O número do documento SEI tem 8 dígitos (ex.: 12345678).'
      USING ERRCODE = '22023';
  END IF;

  IF p_quantidades IS NULL OR jsonb_typeof(p_quantidades) <> 'array' OR jsonb_array_length(p_quantidades) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a quantidade de ao menos um órgão.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_quantidades) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 500 órgãos por item.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ata_assinada:' || v_key));

  SELECT c.unidades INTO v_copia FROM public.itens_ata_unidades_copia c WHERE c.item_key = v_key;

  FOR v_elem IN SELECT e FROM jsonb_array_elements(p_quantidades) AS e LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: cada órgão deve ser um objeto com uasg e quantidade.' USING ERRCODE = '22023';
    END IF;
    v_uasg := regexp_replace(COALESCE(v_elem->>'uasg', ''), '\D', '', 'g');
    IF v_uasg !~ '^[0-9]{6}$' THEN
      RAISE EXCEPTION 'INVALID_UASG: A UASG tem 6 dígitos (recebido: "%").', v_elem->>'uasg' USING ERRCODE = '22023';
    END IF;
    IF v_papel <> 'GERENCIADORA' AND v_uasg NOT IN ('200330', '200331') THEN
      RAISE EXCEPTION 'SO_SENASP: Na ata de outro órgão, informe só a quantidade da SENASP (UASG 200330 ou 200331), não a da UASG %.', v_uasg
        USING ERRCODE = '22023';
    END IF;
    IF v_lista @> jsonb_build_array(jsonb_build_object('uasg', v_uasg)) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A UASG % aparece mais de uma vez.', v_uasg USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_qtd := (v_elem->>'quantidade')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_QUANTITY: Quantidade inválida para a UASG %.', v_uasg USING ERRCODE = '22023';
    END;
    IF v_qtd IS NULL OR v_qtd < 0 OR v_qtd <> trunc(v_qtd) THEN
      RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade da UASG % precisa ser um número inteiro, zero ou mais.', v_uasg USING ERRCODE = '22023';
    END IF;
    v_nome := NULLIF(left(btrim(COALESCE(v_elem->>'nome', '')), 200), '');
    IF v_nome IS NULL AND NOT EXISTS (SELECT 1 FROM public.registrado_por_uasg(v_copia) r WHERE r.uasg = v_uasg) THEN
      RAISE EXCEPTION 'NOME_OBRIGATORIO: A UASG % não está na lista do Compras.gov.br: informe o nome do órgão.', v_uasg USING ERRCODE = '22023';
    END IF;
    v_lista := v_lista || jsonb_build_array(jsonb_build_object('uasg', v_uasg, 'quantidade', v_qtd, 'nome', v_nome));
    v_total := v_total + v_qtd;
  END LOOP;

  SELECT EXISTS (SELECT 1 FROM public.ata_item_assinada_registros r WHERE r.item_key = v_key) INTO v_ja_tem;
  IF v_ja_tem THEN
    IF v_just IS NULL OR length(v_just) NOT BETWEEN 15 AND 500 THEN
      RAISE EXCEPTION 'INVALID_JUSTIFICATION: Para corrigir as quantidades, escreva a justificativa (15 a 500 caracteres).'
        USING ERRCODE = '22023';
    END IF;
    SELECT r.documento_sei INTO v_doc_ant FROM public.ata_item_assinada_registros r
     WHERE r.item_key = v_key ORDER BY r.informado_em DESC LIMIT 1;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('uasg', q.uasg, 'quantidade', q.quantidade) ORDER BY q.uasg), '[]'::JSONB)
      INTO v_lista_ant FROM public.ata_item_quantidade_assinada q WHERE q.item_key = v_key;
    IF v_doc_ant = v_doc AND v_lista_ant = (
         SELECT COALESCE(jsonb_agg(jsonb_build_object('uasg', x->>'uasg', 'quantidade', (x->>'quantidade')::NUMERIC) ORDER BY x->>'uasg'), '[]'::JSONB)
           FROM jsonb_array_elements(v_lista) x) THEN
      RAISE EXCEPTION 'NO_CHANGE: As quantidades e o documento são os mesmos já informados.' USING ERRCODE = '22023';
    END IF;
  ELSIF v_just IS NOT NULL AND length(v_just) NOT BETWEEN 15 AND 500 THEN
    RAISE EXCEPTION 'INVALID_JUSTIFICATION: A justificativa precisa ter de 15 a 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.ata_item_quantidade_assinada WHERE item_key = v_key;
  INSERT INTO public.ata_item_quantidade_assinada (item_key, uasg, nome_orgao, quantidade)
  SELECT v_key, x->>'uasg', x->>'nome', (x->>'quantidade')::NUMERIC FROM jsonb_array_elements(v_lista) x;

  INSERT INTO public.ata_item_assinada_registros
    (item_key, documento_sei, justificativa, quantidades, total, informado_por_user_id, informado_por_nome)
  VALUES (v_key, v_doc, v_just, v_lista, v_total, auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário'));

  RETURN jsonb_build_object('item_key', v_key, 'total', v_total, 'homologado', v_homologado, 'diferenca', v_total - v_homologado);
END;
$$;
REVOKE ALL ON FUNCTION public.informar_quantidades_ata_assinada(VARCHAR, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.informar_quantidades_ata_assinada(VARCHAR, JSONB, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4) Saldo do item: colunas da SENASP participante no fim; o resto igual à migration 109
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_arp_item_saldo_detalhado
WITH (security_invoker = true)
AS
 WITH empenhado_agg AS (
         SELECT v_arp_item_contrato_empenhado.item_key,
            sum(v_arp_item_contrato_empenhado.notas)::bigint AS total_empenhos_vinculados
           FROM v_arp_item_contrato_empenhado
          GROUP BY v_arp_item_contrato_empenhado.item_key
        ), contratos_agg AS (
         SELECT v_arp_item_contrato_quantidade.item_key,
            COALESCE(sum(v_arp_item_contrato_quantidade.quantidade_contratada), 0::numeric) AS total_contratado,
            count(*) AS total_contratos_vinculados,
            count(*) FILTER (WHERE v_arp_item_contrato_quantidade.quantidade_contratada IS NULL) AS total_contratos_sem_quantidade,
            count(*) FILTER (WHERE v_arp_item_contrato_quantidade.ajustada) AS total_contratos_ajustados,
            COALESCE(sum(v_arp_item_contrato_quantidade.quantidade_sem_unidade), 0::numeric) AS quantidade_contratada_sem_unidade,
            count(*) FILTER (WHERE v_arp_item_contrato_quantidade.situacao_divisao = 'CONFERIR'::text OR v_arp_item_contrato_quantidade.fonte_mudou_apos_ajuste) AS total_contratos_a_conferir
           FROM v_arp_item_contrato_quantidade
          GROUP BY v_arp_item_contrato_quantidade.item_key
        ), senasp_participante AS (
         -- Ata de outro órgão em que a SENASP é participante, com a ata assinada informada (migration 114): a base
         -- do saldo continua o registrado da SENASP; o que a ata assinada dá a mais fica com a gerenciadora.
         SELECT o.item_key,
            min(o.situacao) AS situacao,
            sum(o.quantidade_assinada) AS assinada,
            sum(o.gerenciado) AS gerenciado
           FROM v_item_quantitativos_orgaos o
          WHERE o.eh_senasp AND NOT o.ata_da_senasp
          GROUP BY o.item_key
        ), itens_canonical AS (
         SELECT i.id AS item_ata_id,
            i.ata_id,
            a.numero_ata,
            a.codigo_uasg,
            a.uasg_carteira,
            a.papel_senasp,
            i.numero_item,
            (((a.numero_ata::text || '-'::text) || a.codigo_uasg::text) || '-'::text) || lpad(i.numero_item::text, 5, '0'::text) AS canonical_item_key,
            i.descricao_item,
            i.fornecedor_razao_social,
            i.fornecedor_cnpj_cpf,
            COALESCE(i.quantidade_homologada, 0::numeric) AS quantidade_homologada,
            i.quantidade_senasp,
            i.valor_unitario
           FROM itens_ata i
             JOIN atas_registro_preco a ON a.id = i.ata_id
        ), base AS (
         SELECT COALESCE(ic.canonical_item_key, ca.item_key::text) AS item_key,
            ic.item_ata_id,
            ic.ata_id,
            COALESCE(ic.numero_ata, split_part(ca.item_key::text, '-'::text, 1)::character varying) AS numero_ata,
            COALESCE(ic.codigo_uasg, split_part(ca.item_key::text, '-'::text, 2)::character varying) AS codigo_uasg,
            COALESCE(ic.numero_item, split_part(ca.item_key::text, '-'::text, 3)::character varying) AS numero_item,
            COALESCE(ic.uasg_carteira, split_part(ca.item_key::text, '-'::text, 2)::character varying) AS uasg_carteira,
            COALESCE(ic.papel_senasp, 'GERENCIADORA'::character varying) AS papel_senasp,
            ic.descricao_item,
            ic.fornecedor_razao_social,
            ic.fornecedor_cnpj_cpf,
            ic.valor_unitario,
            COALESCE(ic.quantidade_homologada, 0::numeric) AS quantidade_homologada,
            ic.quantidade_senasp,
            CASE
                    WHEN vq.item_key IS NOT NULL THEN vq.cota_propria
                    ELSE COALESCE(ic.quantidade_senasp, ic.quantidade_homologada, 0::numeric)
                END AS quantidade_base_senasp,
            COALESCE(ic.quantidade_senasp, ic.quantidade_homologada, 0::numeric) AS quantidade_registrada_senasp,
            COALESCE(vq.gerenciado_participantes, 0::numeric) AS gerenciado_participantes,
            vq.item_key IS NOT NULL AS ata_assinada_informada,
            vq.total_assinada,
            vq.total_registrado,
            COALESCE(vq.orgaos_fora_da_ata, 0::bigint) AS orgaos_fora_da_ata,
            COALESCE(vq.orgaos_contratado_acima, 0::bigint) AS orgaos_contratado_acima,
            COALESCE(ca.total_contratado, 0::numeric) AS quantidade_consumida,
            COALESCE(ca.total_contratos_vinculados, 0::bigint) AS total_contratos_vinculados,
            COALESCE(ca.total_contratos_sem_quantidade, 0::bigint) AS total_contratos_sem_quantidade,
            COALESCE(ca.total_contratos_ajustados, 0::bigint) AS total_contratos_ajustados,
            COALESCE(ca.quantidade_contratada_sem_unidade, 0::numeric) AS quantidade_contratada_sem_unidade,
            COALESCE(ca.total_contratos_a_conferir, 0::bigint) AS total_contratos_a_conferir
           FROM itens_canonical ic
             FULL JOIN contratos_agg ca ON ca.item_key::text = ic.canonical_item_key
             LEFT JOIN v_item_quantitativos vq ON vq.item_key = ic.canonical_item_key
        )
 SELECT b.item_key,
    b.item_ata_id,
    b.ata_id,
    b.numero_ata,
    b.codigo_uasg,
    b.numero_item,
    b.descricao_item,
    b.fornecedor_razao_social,
    b.fornecedor_cnpj_cpf,
    b.valor_unitario,
    b.quantidade_homologada,
    b.quantidade_consumida,
    b.quantidade_base_senasp - b.quantidade_consumida AS saldo_disponivel,
        CASE
            WHEN b.quantidade_base_senasp > 0::numeric THEN round(b.quantidade_consumida / b.quantidade_base_senasp * 100::numeric, 2)
            ELSE 0::numeric
        END AS percentual_consumido,
    COALESCE(e.total_empenhos_vinculados, 0::bigint) AS total_empenhos_vinculados,
    b.total_contratos_vinculados,
    b.total_contratos_sem_quantidade,
    b.quantidade_senasp,
    b.quantidade_base_senasp,
    b.total_contratos_ajustados,
    b.quantidade_contratada_sem_unidade,
    b.total_contratos_a_conferir,
    b.uasg_carteira,
    b.papel_senasp,
    b.quantidade_registrada_senasp,
    b.gerenciado_participantes,
    b.ata_assinada_informada,
    b.total_assinada,
    b.total_registrado,
    b.orgaos_fora_da_ata,
    b.orgaos_contratado_acima,
    sp.situacao AS situacao_senasp_participante,
    sp.assinada AS assinada_senasp_participante,
    COALESCE(sp.gerenciado, 0::numeric) AS gerenciado_pela_gerenciadora
   FROM base b
     LEFT JOIN empenhado_agg e ON e.item_key::text = b.item_key
     LEFT JOIN senasp_participante sp ON sp.item_key = b.item_key;

-- ------------------------------------------------------------------------------
-- 5) Espelho da ata de outro órgão na carteira: adesão com a quantidade informada à mão (o resto igual à 106)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.espelhar_participacao_na_carteira(p_numero_ata TEXT, p_uasg_gerenciadora TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref     public.atas_participacao%ROWTYPE;
  v_carteira TEXT;
  v_papel   TEXT;
  v_ata_id  public.atas_registro_preco.id%TYPE;
BEGIN
  IF p_uasg_gerenciadora IN ('200330', '200331') THEN
    RETURN;
  END IF;

  SELECT * INTO v_ref FROM public.atas_participacao
   WHERE numero_ata = p_numero_ata AND uasg_gerenciadora = p_uasg_gerenciadora
   ORDER BY lido_em DESC, uasg_senasp DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT CASE WHEN bool_or(uasg_senasp = '200331') THEN '200331' ELSE min(uasg_senasp) END,
         CASE WHEN bool_or(papel = 'PARTICIPANTE') THEN 'PARTICIPANTE' ELSE 'ADESAO' END
    INTO v_carteira, v_papel
    FROM public.atas_participacao
   WHERE numero_ata = p_numero_ata AND uasg_gerenciadora = p_uasg_gerenciadora;

  INSERT INTO public.atas_registro_preco AS a (
    numero_ata, codigo_uasg, nome_uasg, ano_compra, numero_compra, modalidade, objeto, valor_total,
    data_vigencia_inicial, data_vigencia_final, status_ata, numero_controle_pncp, data_hora_atualizacao_api,
    ultimo_sync_em, uasg_carteira, papel_senasp
  ) VALUES (
    v_ref.numero_ata, v_ref.uasg_gerenciadora, v_ref.nome_gerenciadora, v_ref.ano_compra, v_ref.numero_compra,
    v_ref.modalidade, v_ref.objeto, 0,
    v_ref.data_vigencia_inicial, v_ref.data_vigencia_final, v_ref.status_ata, v_ref.numero_controle_pncp, v_ref.lido_em,
    NOW(), v_carteira, v_papel
  )
  ON CONFLICT (numero_ata, codigo_uasg) DO UPDATE
    SET nome_uasg = EXCLUDED.nome_uasg,
        ano_compra = EXCLUDED.ano_compra,
        numero_compra = EXCLUDED.numero_compra,
        modalidade = EXCLUDED.modalidade,
        objeto = EXCLUDED.objeto,
        data_vigencia_inicial = EXCLUDED.data_vigencia_inicial,
        data_vigencia_final = EXCLUDED.data_vigencia_final,
        status_ata = EXCLUDED.status_ata,
        numero_controle_pncp = EXCLUDED.numero_controle_pncp,
        data_hora_atualizacao_api = EXCLUDED.data_hora_atualizacao_api,
        ultimo_sync_em = EXCLUDED.ultimo_sync_em,
        uasg_carteira = EXCLUDED.uasg_carteira,
        papel_senasp = EXCLUDED.papel_senasp
  RETURNING a.id INTO v_ata_id;

  INSERT INTO public.itens_ata AS i (
    ata_id, numero_item, descricao_item, fornecedor_cnpj_cpf, fornecedor_razao_social, quantidade_homologada,
    valor_unitario, valor_total, maximo_adesao, ultimo_sync_em, quantidade_senasp, quantidade_senasp_lida_em
  )
  SELECT v_ata_id, x.numero_item, x.descricao, x.cnpj, x.razao, x.homologada, x.vu, x.homologada * x.vu, x.maximo,
         NOW(), x.senasp, NOW()
    FROM (
      SELECT ip.numero_item,
             max(ip.descricao) AS descricao,
             max(ip.fornecedor_cnpj_cpf) AS cnpj,
             max(ip.fornecedor_razao_social) AS razao,
             COALESCE(max(ip.quantidade_homologada), 0) AS homologada,
             COALESCE(max(ip.valor_unitario), 0) AS vu,
             max(ip.maximo_adesao) AS maximo,
             -- Adesão: soma das adesões aprovadas da SENASP; a que vier sem quantidade da fonte usa a informada à
             -- mão (migration 114) e, sem nenhuma das duas, conta 0, nunca o total da ata.
             COALESCE(sum(CASE WHEN ip.papel = 'ADESAO'
                               THEN COALESCE(public.quantidade_senasp_da_adesao(
                                      p_numero_ata || '-' || p_uasg_gerenciadora || '-' || lpad(ip.numero_item::TEXT, 5, '0'),
                                      ip.adesoes), ip.quantidade_senasp)
                               ELSE ip.quantidade_senasp END), 0) AS senasp
        FROM public.itens_ata_participacao ip
        JOIN public.atas_participacao ap ON ap.id = ip.participacao_id
       WHERE ap.numero_ata = p_numero_ata AND ap.uasg_gerenciadora = p_uasg_gerenciadora
       GROUP BY ip.numero_item
    ) x
  ON CONFLICT (ata_id, numero_item) DO UPDATE
    SET descricao_item = EXCLUDED.descricao_item,
        fornecedor_cnpj_cpf = EXCLUDED.fornecedor_cnpj_cpf,
        fornecedor_razao_social = EXCLUDED.fornecedor_razao_social,
        quantidade_homologada = EXCLUDED.quantidade_homologada,
        valor_unitario = EXCLUDED.valor_unitario,
        valor_total = EXCLUDED.valor_total,
        maximo_adesao = EXCLUDED.maximo_adesao,
        ultimo_sync_em = EXCLUDED.ultimo_sync_em,
        quantidade_senasp = EXCLUDED.quantidade_senasp,
        quantidade_senasp_lida_em = EXCLUDED.quantidade_senasp_lida_em;

  -- Valor da ata para a SENASP (o registrado ou aprovado de cada item × preço).
  UPDATE public.atas_registro_preco a
     SET valor_total = COALESCE((SELECT sum(COALESCE(i.quantidade_senasp, 0) * i.valor_unitario)
                                   FROM public.itens_ata i WHERE i.ata_id = v_ata_id), 0)
   WHERE a.id = v_ata_id;
END;
$$;
REVOKE ALL ON FUNCTION public.espelhar_participacao_na_carteira(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.espelhar_participacao_na_carteira(TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 6) Informar a quantidade aprovada de uma adesão sem quantidade na fonte — gestor da ata ou coordenador
--    p_aprovada_em: dataAprovacaoAnalise da adesão, como veio do Compras.gov.br (ex.: 2026-10-02T09:57:35).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.informar_quantidade_adesao(
  p_item_key      VARCHAR,
  p_uasg          VARCHAR,
  p_aprovada_em   TEXT,
  p_quantidade    NUMERIC,
  p_documento_sei TEXT,
  p_justificativa TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key      VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_uasg     VARCHAR(6) := regexp_replace(COALESCE(p_uasg, ''), '\D', '', 'g');
  v_doc      TEXT := btrim(COALESCE(p_documento_sei, ''));
  v_just     TEXT := NULLIF(btrim(COALESCE(p_justificativa, '')), '');
  v_numero   TEXT := split_part(v_key, '-', 1);
  v_ger      TEXT := split_part(v_key, '-', 2);
  v_item     TEXT := split_part(v_key, '-', 3);
  v_quando   TIMESTAMP;
  v_adesoes  JSONB;
  v_fonte    TEXT;
  v_achou    BOOLEAN := FALSE;
  v_ja_tem   BOOLEAN;
  v_total    NUMERIC;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador informa a quantidade aprovada da adesão.' USING ERRCODE = '42501';
  END IF;
  IF v_uasg NOT IN ('200330', '200331') THEN
    RAISE EXCEPTION 'INVALID_UASG: A adesão informada aqui é da SENASP (UASG 200330 ou 200331).' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_aprovada_em, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data de aprovação da adesão como veio do Compras.gov.br.' USING ERRCODE = '22023';
  END IF;
  v_quando := left(p_aprovada_em, 19)::TIMESTAMP;
  IF p_quantidade IS NULL OR p_quantidade <= 0 OR p_quantidade <> trunc(p_quantidade) THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade aprovada precisa ser um número inteiro maior que zero.' USING ERRCODE = '22023';
  END IF;
  IF v_doc !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT: O número do documento SEI tem 8 dígitos (ex.: 12345678).' USING ERRCODE = '22023';
  END IF;

  SELECT ip.adesoes INTO v_adesoes
    FROM public.itens_ata_participacao ip
    JOIN public.atas_participacao ap ON ap.id = ip.participacao_id
   WHERE ap.numero_ata = v_numero AND ap.uasg_gerenciadora = v_ger AND ap.uasg_senasp = v_uasg
     AND lpad(ip.numero_item::TEXT, 5, '0') = v_item AND ip.papel = 'ADESAO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NAO_ENCONTRADO: O item % não tem adesão da SENASP (UASG %).', v_key, v_uasg USING ERRCODE = 'P0002';
  END IF;

  SELECT TRUE, btrim(COALESCE(e->>'quantidadeAprovadaAdesao', ''))
    INTO v_achou, v_fonte
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_adesoes) = 'array' THEN v_adesoes ELSE '[]'::JSONB END) AS e
   WHERE substring(e->>'unidadeNaoParticipante' FROM '^\s*([0-9]{6})') = v_uasg
     AND left(COALESCE(e->>'dataAprovacaoAnalise', ''), 19) = to_char(v_quando, 'YYYY-MM-DD"T"HH24:MI:SS')
   LIMIT 1;
  IF NOT COALESCE(v_achou, FALSE) THEN
    RAISE EXCEPTION 'ADESAO_NAO_ENCONTRADA: Não há adesão da SENASP aprovada em % neste item.', to_char(v_quando, 'DD/MM/YYYY HH24:MI') USING ERRCODE = 'P0002';
  END IF;
  IF v_fonte ~ '^[0-9]+(\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'FONTE_JA_INFORMA: O Compras.gov.br já informa a quantidade desta adesão (%): vale a da fonte.', v_fonte USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('adesao_informada:' || v_key));
  SELECT EXISTS (SELECT 1 FROM public.adesao_quantidade_informada m WHERE m.item_key = v_key AND m.uasg = v_uasg AND m.aprovada_em = v_quando) INTO v_ja_tem;
  IF v_ja_tem AND (v_just IS NULL OR length(v_just) NOT BETWEEN 15 AND 500) THEN
    RAISE EXCEPTION 'INVALID_JUSTIFICATION: Para corrigir, escreva a justificativa (15 a 500 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF v_just IS NOT NULL AND length(v_just) NOT BETWEEN 15 AND 500 THEN
    RAISE EXCEPTION 'INVALID_JUSTIFICATION: A justificativa precisa ter de 15 a 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.adesao_quantidade_informada AS m
    (item_key, uasg, aprovada_em, quantidade, documento_sei, justificativa, informado_por_user_id, informado_por_nome)
  VALUES (v_key, v_uasg, v_quando, p_quantidade, v_doc, v_just, auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário'))
  ON CONFLICT (item_key, uasg, aprovada_em) DO UPDATE
    SET quantidade = EXCLUDED.quantidade, documento_sei = EXCLUDED.documento_sei, justificativa = EXCLUDED.justificativa,
        informado_por_user_id = EXCLUDED.informado_por_user_id, informado_por_nome = EXCLUDED.informado_por_nome, informado_em = NOW();

  -- Recalcula na hora a quantidade da SENASP no item (base do saldo e limite da alocação).
  PERFORM public.espelhar_participacao_na_carteira(v_numero, v_ger);
  SELECT i.quantidade_senasp INTO v_total
    FROM public.itens_ata i JOIN public.atas_registro_preco a ON a.id = i.ata_id
   WHERE a.numero_ata = v_numero AND a.codigo_uasg = v_ger AND lpad(i.numero_item::TEXT, 5, '0') = v_item;

  RETURN jsonb_build_object('item_key', v_key, 'uasg', v_uasg, 'quantidade', p_quantidade, 'quantidade_senasp', v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.informar_quantidade_adesao(VARCHAR, VARCHAR, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.informar_quantidade_adesao(VARCHAR, VARCHAR, TEXT, NUMERIC, TEXT, TEXT) TO authenticated, service_role;
