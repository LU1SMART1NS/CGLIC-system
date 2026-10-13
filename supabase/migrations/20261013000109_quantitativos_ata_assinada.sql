-- ==============================================================================
-- MIGRATION 109: QUANTITATIVOS — ATA ASSINADA, HISTÓRICO DO REGISTRADO, REMANEJAMENTOS E COTA PRÓPRIA
-- Versão: 20261013000109_quantitativos_ata_assinada.sql
--
-- Problema (09-13/10/2026): a ata assinada (PDF) dá a cada órgão participante uma quantidade, mas no
-- Compras.gov.br boa parte fica registrada na SENASP (gerenciadora), que remaneja quando o órgão pede.
-- O saldo da SENASP usava o registrado inteiro e podia contar como livre o que pertence a participantes.
-- Protótipos aprovados: https://claude.ai/artifact/YHFE1D5T2yGUKFFZ8ZLNt9 (quantidade assinada) e
-- https://claude.ai/artifact/CehV7gxx93dKZoTcJKbh51 (aba Quantitativos).
--
-- O que entra
-- 1) ata_item_quantidade_assinada + ata_item_assinada_registros: quantidade de cada órgão na ata assinada,
--    informada pelo gestor da ata ou pelo coordenador, com o número do documento SEI (8 dígitos). Corrigir
--    exige justificativa; cada gravação fica no histórico com a foto das quantidades.
-- 2) itens_ata_unidades_historico: cada mudança da quantidade registrada de um órgão no Compras.gov.br,
--    com o valor de antes e o de depois, gravada por gravar_unidades_itens ao copiar os órgãos do item.
--    itens_ata_unidades_copia.historico_desde marca desde quando o histórico existe para o item.
-- 3) ata_item_remanejamentos e ata_item_continua_orgao: o gestor de saldo (ou o coordenador) confirma um
--    remanejamento com destino, ou marca que a quantidade reduzida continua sendo do órgão.
-- 4) v_item_quantitativos_orgaos (um órgão por linha, só itens com ata assinada informada) e
--    v_item_quantitativos (um item por linha): situação de cada órgão, quanto a SENASP gerencia para os
--    participantes e a cota própria (registrado da SENASP − gerenciado para participantes).
-- 5) v_arp_item_saldo_detalhado: com a ata assinada informada, a base do saldo (quantidade_base_senasp)
--    passa a ser a cota própria. Colunas novas no fim.
-- 6) save_allocations_atomic: a soma alocada às unidades internas não pode passar da base do saldo
--    (cota própria, ou o registrado da SENASP sem ata assinada). Reduzir continua permitido.
-- 7) participantes_contratos_itens e participantes_contratos_leituras: contratos dos órgãos participantes no
--    Contratos.gov.br (ativos e encerrados), gravados pelo servidor (recurso 'contratos_participantes').
--
-- Regra aprovada (13/10/2026): registrado do participante reduzido depois do registro da ata é
-- remanejamento definitivo, salvo "continua do órgão". Antes do histórico, "mudou" vem da data da última
-- mudança no Compras.gov.br (mais de 1 dia depois da inclusão), ignorando atualizações em massa (mais de
-- 3 órgãos do item no mesmo segundo).
-- Escopo: só atas gerenciadas pela SENASP (UASG 200330 ou 200331).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Quantidades da ata assinada
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ata_item_quantidade_assinada (
  item_key    VARCHAR(100) NOT NULL,
  uasg        VARCHAR(6)   NOT NULL CHECK (uasg ~ '^[0-9]{6}$'),
  nome_orgao  VARCHAR(200),
  quantidade  NUMERIC(18, 4) NOT NULL CHECK (quantidade >= 0 AND quantidade = trunc(quantidade)),
  PRIMARY KEY (item_key, uasg)
);
COMMENT ON TABLE public.ata_item_quantidade_assinada IS
  'Quantidade de cada órgão no item, como está na ata assinada. Grava só por informar_quantidades_ata_assinada.';

CREATE TABLE IF NOT EXISTS public.ata_item_assinada_registros (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key               VARCHAR(100) NOT NULL,
  documento_sei          VARCHAR(8)   NOT NULL CHECK (documento_sei ~ '^[0-9]{8}$'),
  justificativa          TEXT CHECK (justificativa IS NULL OR length(btrim(justificativa)) BETWEEN 15 AND 500),
  quantidades            JSONB        NOT NULL,
  total                  NUMERIC(18, 4) NOT NULL,
  informado_por_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  informado_por_nome     VARCHAR(150) NOT NULL,
  informado_em           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ata_item_assinada_registros_item_idx ON public.ata_item_assinada_registros (item_key, informado_em DESC);
CREATE INDEX IF NOT EXISTS ata_item_assinada_registros_user_idx ON public.ata_item_assinada_registros (informado_por_user_id) WHERE informado_por_user_id IS NOT NULL;
COMMENT ON TABLE public.ata_item_assinada_registros IS
  'Cada gravação das quantidades da ata assinada: documento SEI, quem, quando, justificativa (obrigatória a partir da segunda) e a foto das quantidades.';

-- ------------------------------------------------------------------------------
-- 2) Histórico do registrado no Compras.gov.br
-- ------------------------------------------------------------------------------
ALTER TABLE public.itens_ata_unidades_copia
  ADD COLUMN IF NOT EXISTS historico_desde TIMESTAMPTZ NOT NULL DEFAULT NOW();
COMMENT ON COLUMN public.itens_ata_unidades_copia.historico_desde IS
  'Desde quando as mudanças do registrado deste item são gravadas em itens_ata_unidades_historico. Antes disso, só a data da última mudança informada pelo Compras.gov.br.';

CREATE TABLE IF NOT EXISTS public.itens_ata_unidades_historico (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_key             VARCHAR(100) NOT NULL,
  uasg                 VARCHAR(6)   NOT NULL,
  quantidade_anterior  NUMERIC(18, 4),
  quantidade_nova      NUMERIC(18, 4),
  atualizado_na_fonte  TIMESTAMP,
  lido_em              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS itens_ata_unidades_historico_item_idx ON public.itens_ata_unidades_historico (item_key, uasg, lido_em DESC);
COMMENT ON TABLE public.itens_ata_unidades_historico IS
  'Mudanças da quantidade registrada de cada órgão no item (Compras.gov.br, consulta 3). quantidade_nova NULL = o órgão saiu da lista; quantidade_anterior NULL = entrou. atualizado_na_fonte = dataHoraAtualizacao da fonte.';

-- ------------------------------------------------------------------------------
-- 3) Remanejamentos confirmados e "continua do órgão"
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ata_item_remanejamentos (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key               VARCHAR(100) NOT NULL,
  uasg_origem            VARCHAR(6)   NOT NULL CHECK (uasg_origem ~ '^[0-9]{6}$'),
  quantidade             NUMERIC(18, 4) NOT NULL CHECK (quantidade > 0 AND quantidade = trunc(quantidade)),
  uasg_destino           VARCHAR(6) CHECK (uasg_destino IS NULL OR uasg_destino ~ '^[0-9]{6}$'),
  justificativa          TEXT NOT NULL CHECK (length(btrim(justificativa)) BETWEEN 15 AND 500),
  confirmado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmado_por_nome    VARCHAR(150) NOT NULL,
  confirmado_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  desfeito_em            TIMESTAMPTZ,
  desfeito_por_nome      VARCHAR(150),
  CHECK (uasg_destino IS NULL OR uasg_destino <> uasg_origem)
);
CREATE INDEX IF NOT EXISTS ata_item_remanejamentos_ativos_idx ON public.ata_item_remanejamentos (item_key, uasg_origem) WHERE desfeito_em IS NULL;
CREATE INDEX IF NOT EXISTS ata_item_remanejamentos_user_idx ON public.ata_item_remanejamentos (confirmado_por_user_id) WHERE confirmado_por_user_id IS NOT NULL;
COMMENT ON TABLE public.ata_item_remanejamentos IS
  'Remanejamento confirmado pelo gestor de saldo: a quantidade deixou de ser do órgão de origem. uasg_destino NULL = destino não informado (conta como devolvido à SENASP). Desfazer preenche desfeito_em.';

CREATE TABLE IF NOT EXISTS public.ata_item_continua_orgao (
  item_key            VARCHAR(100) NOT NULL,
  uasg                VARCHAR(6)   NOT NULL CHECK (uasg ~ '^[0-9]{6}$'),
  quantidade          NUMERIC(18, 4) NOT NULL CHECK (quantidade > 0 AND quantidade = trunc(quantidade)),
  justificativa       TEXT NOT NULL CHECK (length(btrim(justificativa)) BETWEEN 15 AND 500),
  marcado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  marcado_por_nome    VARCHAR(150) NOT NULL,
  marcado_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_key, uasg)
);
CREATE INDEX IF NOT EXISTS ata_item_continua_orgao_user_idx ON public.ata_item_continua_orgao (marcado_por_user_id) WHERE marcado_por_user_id IS NOT NULL;
COMMENT ON TABLE public.ata_item_continua_orgao IS
  'Parte da quantidade reduzida no Compras.gov.br que continua sendo do órgão: a SENASP volta a gerenciar para ele (fora da cota própria).';

-- Leitura só para logados; escrita só pelas funções abaixo (ou pelo servidor).
ALTER TABLE public.ata_item_quantidade_assinada ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ata_item_assinada_registros  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_ata_unidades_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ata_item_remanejamentos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ata_item_continua_orgao      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: ata_item_quantidade_assinada" ON public.ata_item_quantidade_assinada;
CREATE POLICY "Authenticated Read: ata_item_quantidade_assinada" ON public.ata_item_quantidade_assinada FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated Read: ata_item_assinada_registros" ON public.ata_item_assinada_registros;
CREATE POLICY "Authenticated Read: ata_item_assinada_registros" ON public.ata_item_assinada_registros FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated Read: itens_ata_unidades_historico" ON public.itens_ata_unidades_historico;
CREATE POLICY "Authenticated Read: itens_ata_unidades_historico" ON public.itens_ata_unidades_historico FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated Read: ata_item_remanejamentos" ON public.ata_item_remanejamentos;
CREATE POLICY "Authenticated Read: ata_item_remanejamentos" ON public.ata_item_remanejamentos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated Read: ata_item_continua_orgao" ON public.ata_item_continua_orgao;
CREATE POLICY "Authenticated Read: ata_item_continua_orgao" ON public.ata_item_continua_orgao FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.ata_item_quantidade_assinada, public.ata_item_assinada_registros, public.itens_ata_unidades_historico,
              public.ata_item_remanejamentos, public.ata_item_continua_orgao FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ata_item_quantidade_assinada, public.ata_item_assinada_registros,
              public.itens_ata_unidades_historico, public.ata_item_remanejamentos, public.ata_item_continua_orgao FROM authenticated;
GRANT SELECT ON public.ata_item_quantidade_assinada, public.ata_item_assinada_registros, public.itens_ata_unidades_historico,
              public.ata_item_remanejamentos, public.ata_item_continua_orgao TO authenticated;
GRANT ALL ON public.ata_item_quantidade_assinada, public.ata_item_assinada_registros, public.itens_ata_unidades_historico,
              public.ata_item_remanejamentos, public.ata_item_continua_orgao TO service_role;

DROP TRIGGER IF EXISTS trg_audit_ata_item_quantidade_assinada ON public.ata_item_quantidade_assinada;
CREATE TRIGGER trg_audit_ata_item_quantidade_assinada AFTER INSERT OR UPDATE OR DELETE ON public.ata_item_quantidade_assinada
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
DROP TRIGGER IF EXISTS trg_audit_ata_item_remanejamentos ON public.ata_item_remanejamentos;
CREATE TRIGGER trg_audit_ata_item_remanejamentos AFTER INSERT OR UPDATE OR DELETE ON public.ata_item_remanejamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
DROP TRIGGER IF EXISTS trg_audit_ata_item_continua_orgao ON public.ata_item_continua_orgao;
CREATE TRIGGER trg_audit_ata_item_continua_orgao AFTER INSERT OR UPDATE OR DELETE ON public.ata_item_continua_orgao
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- ------------------------------------------------------------------------------
-- 2b) Registrado por órgão a partir da lista copiada do Compras.gov.br
--     (soma as linhas repetidas de um mesmo órgão; ignora linhas excluídas na fonte)
-- ------------------------------------------------------------------------------
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
      SELECT regexp_replace(COALESCE(u->>'codigoUnidade', ''), '\D', '', 'g') AS uasg,
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
REVOKE ALL ON FUNCTION public.registrado_por_uasg(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrado_por_uasg(JSONB) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 3) gravar_unidades_itens passa a gravar o histórico do registrado (resto igual à migration 92)
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 4) Situação de cada órgão diante da ata assinada (só itens com a ata assinada informada)
--
--   falta     = ata assinada − registrado (quando o registrado é menor; órgão sem registro = 0)
--   confirmado = remanejamentos confirmados e não desfeitos (até a falta)
--   resto     = falta − confirmado
--   gerenciado = quanto a SENASP gerencia para o órgão, fora da cota própria:
--                GERENCIADO          → resto (registrado menor desde o registro, ou órgão sem registro)
--                REMANEJADO_A_MENOS  → só a parte marcada "continua do órgão" (regra aprovada: definitivo)
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
  SELECT q.item_key, q.uasg FROM public.ata_item_quantidade_assinada q JOIN informados i ON i.item_key = q.item_key
  UNION
  SELECT r.item_key, r.uasg FROM reg r
), base AS (
  SELECT o.item_key,
         o.uasg,
         COALESCE(r.nome_orgao, q.nome_orgao)::TEXT AS nome_orgao,
         r.tipo_unidade,
         (o.uasg IN ('200330', '200331')) AS eh_senasp,
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
           WHEN c.eh_senasp THEN 'SENASP'
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
       CASE WHEN s.eh_senasp THEN 0 ELSE s.falta END AS falta,
       CASE WHEN s.eh_senasp THEN 0 ELSE s.acima END AS acima,
       CASE WHEN s.eh_senasp THEN 0 ELSE s.confirmado_valido END AS remanejado_confirmado,
       CASE WHEN s.eh_senasp THEN 0 ELSE s.resto END AS resto,
       s.continua_do_orgao,
       CASE s.situacao
         WHEN 'GERENCIADO' THEN s.resto
         WHEN 'REMANEJADO_A_MENOS' THEN LEAST(COALESCE(s.continua_do_orgao, 0), s.resto)
         ELSE 0
       END AS gerenciado,
       s.mudou,
       COALESCE(s.mudou_no_historico_em, CASE WHEN s.mudou_antes_do_historico THEN s.atualizado_em END) AS mudou_em,
       s.atualizado_em,
       s.incluido_em
  FROM sit s;

COMMENT ON VIEW public.v_item_quantitativos_orgaos IS
  'Um órgão por linha, só nos itens com a ata assinada informada: ata assinada × registrado no Compras.gov.br, situação e quanto a SENASP gerencia para o órgão (fora da cota própria).';

-- ------------------------------------------------------------------------------
-- 5) Um item por linha: cota própria da SENASP
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_item_quantitativos
WITH (security_invoker = true)
AS
WITH ultimo AS (
  SELECT DISTINCT ON (r.item_key) r.item_key, r.documento_sei, r.informado_por_nome, r.informado_em, r.total
    FROM public.ata_item_assinada_registros r
   ORDER BY r.item_key, r.informado_em DESC
), por_item AS (
  SELECT o.item_key,
         sum(o.quantidade_assinada) AS total_assinada,
         sum(COALESCE(o.quantidade_registrada, 0)) AS total_registrado,
         sum(o.quantidade_assinada) FILTER (WHERE o.eh_senasp) AS assinada_senasp,
         sum(o.gerenciado) AS gerenciado_participantes,
         count(*) FILTER (WHERE o.situacao = 'FORA_DA_ATA') AS orgaos_fora_da_ata,
         count(*) FILTER (WHERE o.situacao = 'REMANEJADO_A_MENOS') AS orgaos_remanejados_a_menos,
         count(*) FILTER (WHERE o.gerenciado > 0) AS orgaos_gerenciados
    FROM public.v_item_quantitativos_orgaos o
   GROUP BY o.item_key
), itens AS (
  SELECT (a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item::TEXT, 5, '0')) AS item_key,
         COALESCE(i.quantidade_homologada, 0) AS homologado,
         COALESCE(i.quantidade_senasp, i.quantidade_homologada, 0) AS registrado_senasp
    FROM public.itens_ata i
    JOIN public.atas_registro_preco a ON a.id = i.ata_id
   WHERE a.codigo_uasg IN ('200330', '200331')
), aloc AS (
  SELECT al.item_key, sum(al.allocated_qty) AS alocado
    FROM public.arp_allocations al
   GROUP BY al.item_key
)
SELECT u.item_key,
       u.documento_sei,
       u.informado_por_nome,
       u.informado_em,
       it.homologado,
       COALESCE(p.total_assinada, 0) AS total_assinada,
       COALESCE(p.total_registrado, 0) AS total_registrado,
       COALESCE(p.assinada_senasp, 0) AS assinada_senasp,
       it.registrado_senasp,
       COALESCE(p.gerenciado_participantes, 0) AS gerenciado_participantes,
       it.registrado_senasp - COALESCE(p.gerenciado_participantes, 0) AS cota_propria,
       COALESCE(al.alocado, 0) AS alocado,
       COALESCE(p.orgaos_fora_da_ata, 0) AS orgaos_fora_da_ata,
       COALESCE(p.orgaos_remanejados_a_menos, 0) AS orgaos_remanejados_a_menos,
       COALESCE(p.orgaos_gerenciados, 0) AS orgaos_gerenciados
  FROM ultimo u
  JOIN itens it ON it.item_key = u.item_key
  LEFT JOIN por_item p ON p.item_key = u.item_key
  LEFT JOIN aloc al ON al.item_key = u.item_key;

COMMENT ON VIEW public.v_item_quantitativos IS
  'Um item por linha, só itens de atas da SENASP com a ata assinada informada: registrado da SENASP, gerenciado para participantes e cota própria (registrado − gerenciado).';

REVOKE ALL ON public.v_item_quantitativos_orgaos, public.v_item_quantitativos FROM PUBLIC, anon;
GRANT SELECT ON public.v_item_quantitativos_orgaos, public.v_item_quantitativos TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 6) Saldo do item: com a ata assinada informada, a base é a cota própria da SENASP
--    (registrado − gerenciado para participantes). Colunas novas no fim; o resto igual à migration 106.
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
    b.ata_assinada_informada
   FROM base b
     LEFT JOIN empenhado_agg e ON e.item_key::text = b.item_key;

-- ------------------------------------------------------------------------------
-- 7) Informar (ou corrigir) as quantidades da ata assinada — gestor da ata ou coordenador
--    p_quantidades: [{"uasg": "200109", "quantidade": 70, "nome": "..."}]; a lista substitui a anterior.
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
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor da ata ou o coordenador informa as quantidades da ata assinada.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(i.quantidade_homologada, 0) INTO v_homologado
    FROM public.itens_ata i
    JOIN public.atas_registro_preco a ON a.id = i.ata_id
   WHERE (a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item::TEXT, 5, '0')) = v_key
     AND a.codigo_uasg IN ('200330', '200331');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NAO_ENCONTRADO: O item % não está numa ata gerenciada pela SENASP.', v_key
      USING ERRCODE = 'P0002';
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
-- 8) Confirmar remanejamento — gestor de saldo ou coordenador (allocations.manage)
--    p_uasg_destino: UASG que recebeu, a da SENASP (abriu mão) ou NULL ("não sei": conta como devolvido à SENASP)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirmar_remanejamento(
  p_item_key      VARCHAR,
  p_uasg_origem   VARCHAR,
  p_quantidade    NUMERIC,
  p_uasg_destino  VARCHAR,
  p_justificativa TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key    VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_origem VARCHAR(6) := regexp_replace(COALESCE(p_uasg_origem, ''), '\D', '', 'g');
  v_dest   VARCHAR(6) := NULLIF(regexp_replace(COALESCE(p_uasg_destino, ''), '\D', '', 'g'), '');
  v_just   TEXT := btrim(COALESCE(p_justificativa, ''));
  v_org    RECORD;
  v_max    NUMERIC;
BEGIN
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de saldo ou o coordenador confirma remanejamentos.'
      USING ERRCODE = '42501';
  END IF;
  IF length(v_just) NOT BETWEEN 15 AND 500 THEN
    RAISE EXCEPTION 'INVALID_JUSTIFICATION: Escreva a justificativa (15 a 500 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 OR p_quantidade <> trunc(p_quantidade) THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade remanejada precisa ser um número inteiro maior que zero.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ata_assinada:' || v_key));

  SELECT o.* INTO v_org FROM public.v_item_quantitativos_orgaos o WHERE o.item_key = v_key AND o.uasg = v_origem;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORGAO_NAO_ENCONTRADO: A UASG % não está no item % (ou a ata assinada não foi informada).', v_origem, v_key
      USING ERRCODE = 'P0002';
  END IF;
  IF v_org.situacao NOT IN ('GERENCIADO', 'REMANEJADO_A_MENOS') THEN
    RAISE EXCEPTION 'NADA_A_CONFIRMAR: O órgão não tem quantidade gerenciada nem remanejada a menos (situação: %).', v_org.situacao
      USING ERRCODE = '22023';
  END IF;
  v_max := CASE WHEN v_org.situacao = 'GERENCIADO' THEN v_org.resto ELSE v_org.resto - v_org.gerenciado END;
  IF v_max <= 0 THEN
    RAISE EXCEPTION 'NADA_A_CONFIRMAR: Toda a quantidade reduzida está marcada como "continua do órgão".' USING ERRCODE = '22023';
  END IF;
  IF p_quantidade > v_max THEN
    RAISE EXCEPTION 'ACIMA_DO_POSSIVEL: Dá para confirmar até % (pedido: %).', trim_scale(v_max), trim_scale(p_quantidade) USING ERRCODE = '22023';
  END IF;
  IF v_dest IS NOT NULL THEN
    IF v_dest = v_origem THEN
      RAISE EXCEPTION 'INVALID_DESTINATION: O destino precisa ser outro órgão.' USING ERRCODE = '22023';
    END IF;
    IF v_dest NOT IN ('200330', '200331')
       AND NOT EXISTS (SELECT 1 FROM public.v_item_quantitativos_orgaos o WHERE o.item_key = v_key AND o.uasg = v_dest) THEN
      RAISE EXCEPTION 'INVALID_DESTINATION: A UASG % não está no item.', v_dest USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.ata_item_remanejamentos
    (item_key, uasg_origem, quantidade, uasg_destino, justificativa, confirmado_por_user_id, confirmado_por_nome)
  VALUES (v_key, v_origem, p_quantidade, v_dest, v_just, auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário'));

  RETURN jsonb_build_object('item_key', v_key, 'uasg_origem', v_origem, 'quantidade', p_quantidade, 'uasg_destino', v_dest);
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_remanejamento(VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_remanejamento(VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.desfazer_remanejamentos(p_item_key VARCHAR, p_uasg_origem VARCHAR)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de saldo ou o coordenador desfaz remanejamentos.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ata_item_remanejamentos
     SET desfeito_em = NOW(), desfeito_por_nome = COALESCE(public.nome_do_usuario_logado(), 'Usuário')
   WHERE item_key = btrim(COALESCE(p_item_key, ''))
     AND uasg_origem = regexp_replace(COALESCE(p_uasg_origem, ''), '\D', '', 'g')
     AND desfeito_em IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'NADA_A_DESFAZER: Não há remanejamento confirmado deste órgão no item.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.desfazer_remanejamentos(VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_remanejamentos(VARCHAR, VARCHAR) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 9) "Continua do órgão" — gestor de saldo ou coordenador
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_continua_do_orgao(
  p_item_key      VARCHAR,
  p_uasg          VARCHAR,
  p_quantidade    NUMERIC,
  p_justificativa TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key  VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_uasg VARCHAR(6) := regexp_replace(COALESCE(p_uasg, ''), '\D', '', 'g');
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
  v_org  RECORD;
BEGIN
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de saldo ou o coordenador marca que a quantidade continua do órgão.' USING ERRCODE = '42501';
  END IF;
  IF length(v_just) NOT BETWEEN 15 AND 500 THEN
    RAISE EXCEPTION 'INVALID_JUSTIFICATION: Escreva a justificativa (15 a 500 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 OR p_quantidade <> trunc(p_quantidade) THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade precisa ser um número inteiro maior que zero.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ata_assinada:' || v_key));

  SELECT o.* INTO v_org FROM public.v_item_quantitativos_orgaos o WHERE o.item_key = v_key AND o.uasg = v_uasg;
  IF NOT FOUND OR v_org.situacao NOT IN ('GERENCIADO', 'REMANEJADO_A_MENOS') THEN
    RAISE EXCEPTION 'NADA_A_MARCAR: O órgão não tem quantidade gerenciada nem remanejada a menos neste item.' USING ERRCODE = '22023';
  END IF;
  IF p_quantidade > v_org.resto THEN
    RAISE EXCEPTION 'ACIMA_DO_POSSIVEL: Dá para marcar até % (pedido: %).', trim_scale(v_org.resto), trim_scale(p_quantidade) USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ata_item_continua_orgao (item_key, uasg, quantidade, justificativa, marcado_por_user_id, marcado_por_nome)
  VALUES (v_key, v_uasg, p_quantidade, v_just, auth.uid(), COALESCE(public.nome_do_usuario_logado(), 'Usuário'))
  ON CONFLICT (item_key, uasg) DO UPDATE
    SET quantidade = EXCLUDED.quantidade, justificativa = EXCLUDED.justificativa,
        marcado_por_user_id = EXCLUDED.marcado_por_user_id, marcado_por_nome = EXCLUDED.marcado_por_nome, marcado_em = NOW();

  RETURN jsonb_build_object('item_key', v_key, 'uasg', v_uasg, 'quantidade', p_quantidade);
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_continua_do_orgao(VARCHAR, VARCHAR, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_continua_do_orgao(VARCHAR, VARCHAR, NUMERIC, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.desfazer_continua_do_orgao(p_item_key VARCHAR, p_uasg VARCHAR)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de saldo ou o coordenador desfaz.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.ata_item_continua_orgao
   WHERE item_key = btrim(COALESCE(p_item_key, ''))
     AND uasg = regexp_replace(COALESCE(p_uasg, ''), '\D', '', 'g');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NADA_A_DESFAZER: Este órgão não está marcado como "continua do órgão" no item.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.desfazer_continua_do_orgao(VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_continua_do_orgao(VARCHAR, VARCHAR) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 10) save_allocations_atomic: limite da soma alocada (PASSO 5b); o resto igual à migration 108
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_allocations_atomic(p_item_key text, p_allocations jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item_key VARCHAR(100);
  v_current_version INTEGER;
  v_new_version INTEGER;
  v_alloc_count INTEGER;
  v_elem JSONB;
  v_alloc_id VARCHAR(100);
  v_unit_name VARCHAR(50);
  v_allocated_qty NUMERIC(18, 4);
  v_empenhada_qty NUMERIC(18, 4);
  v_processo_sei_id VARCHAR(50);
  v_is_first_write BOOLEAN := FALSE;
  v_key_parts TEXT[];
  v_numero_ata VARCHAR(30);
  v_codigo_uasg VARCHAR(10);
  v_numero_item VARCHAR(10);
  v_ata_id UUID;
  v_dep_ativo BOOLEAN;
  v_prev_count INTEGER;
  v_prev_qty NUMERIC(18, 4);
  v_soma_nova NUMERIC;
  v_soma_ant NUMERIC;
  v_limite NUMERIC;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO — permission (Fase 2B-1: a checagem antiga baseada
  -- em roles foi substituída por has_permission; o escopo por unidade/ATA é
  -- verificado por linha no Passo 5)
  -- --------------------------------------------------------------------------
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a usuários com a permissão allocations.manage.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: SANITIZAÇÃO E VALIDAÇÃO DA CHAVE DO ITEM (item_key)
  -- --------------------------------------------------------------------------
  v_item_key := TRIM(COALESCE(p_item_key, ''));

  IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
    RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item inválida ou fora do padrão canônico (formato esperado: 00037/2026-200331-00001). Valor recebido: "%"', p_item_key
      USING ERRCODE = '22023';
  END IF;

  -- Resolução de ata_id (uma única vez por chamada — ver comentário acima).
  v_key_parts := regexp_match(v_item_key, '^([0-9]{5})/([0-9]{4})-([0-9]{6})-([0-9]{5})$');
  v_numero_ata := v_key_parts[1];
  v_codigo_uasg := v_key_parts[3];
  v_numero_item := v_key_parts[4];

  SELECT ia.ata_id INTO v_ata_id
    FROM public.atas_registro_preco arp
    JOIN public.itens_ata ia ON ia.ata_id = arp.id AND ia.numero_item = v_numero_item
   WHERE arp.numero_ata = v_numero_ata
     AND arp.codigo_uasg = v_codigo_uasg;

  -- --------------------------------------------------------------------------
  -- PASSO 3: VALIDAÇÃO DO PAYLOAD JSONB
  -- --------------------------------------------------------------------------
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) != 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O parâmetro p_allocations deve ser um array JSONB válido.'
      USING ERRCODE = '22023';
  END IF;

  v_alloc_count := jsonb_array_length(p_allocations);

  -- --------------------------------------------------------------------------
  -- PASSO 4: CONTROLE DE CONCORRÊNCIA E TRAVA DO AGREGADO (FOR UPDATE)
  -- --------------------------------------------------------------------------
  -- Inicialização segura do estado do agregado (first write guard)
  INSERT INTO public.item_allocation_state (item_key, version, updated_at)
  VALUES (v_item_key, 1, NOW())
  ON CONFLICT (item_key) DO NOTHING;

  -- Adquire lock exclusivo de linha no agregado
  SELECT version INTO v_current_version
    FROM public.item_allocation_state
   WHERE item_key = v_item_key
     FOR UPDATE;

  -- Semântica de First-Write vs Subsequent-Write:
  -- Se o item já passou por mutações prévias (version > 1), p_expected_version é mandatário.
  IF v_current_version > 1 AND p_expected_version IS NULL THEN
    RAISE EXCEPTION 'EXPECTED_VERSION_REQUIRED: O item "%" possui versão ativa %. O parâmetro p_expected_version é obrigatório para prevenir concorrência.',
      v_item_key, v_current_version
      USING ERRCODE = '40001';
  END IF;

  -- Se p_expected_version foi fornecido, deve coincidir exatamente com v_current_version
  IF p_expected_version IS NOT NULL AND p_expected_version != v_current_version THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION_ERROR: Conflito de concorrência. Versão esperada: %, Versão atual do banco: %.',
      p_expected_version, v_current_version
      USING ERRCODE = '40001';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 5: PRÉ-VALIDAÇÃO ESTATÍSTICA E RELACIONAL DOS ELEMENTOS
  -- (inclui, por linha: permissão já confirmada no Passo 1 + ESCOPO por
  -- unidade/ATA — obrigatório verificar aqui, não só uma vez para o usuário)
  -- --------------------------------------------------------------------------
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_unit_name := TRIM(COALESCE(v_elem->>'unit_name', v_elem->>'unitName', ''));

    IF v_unit_name = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Toda alocação deve possuir a identificação do departamento (unit_name).'
        USING ERRCODE = '22023';
    END IF;

    -- Validação de quantidade alocada
    BEGIN
      v_allocated_qty := (COALESCE(v_elem->>'allocated_qty', v_elem->>'allocatedQty', '0'))::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Quantidade alocada inválida para o departamento %.', v_unit_name
        USING ERRCODE = '22023';
    END;

    IF v_allocated_qty < 0 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Quantidade alocada não pode ser negativa (% para %).', v_allocated_qty, v_unit_name
        USING ERRCODE = '22023';
    END IF;

    -- Validação de integridade referencial do departamento.
    -- Migration 108: unidade DESATIVADA continua no item como já estava (a lista inteira do item é
    -- regravada a cada edição); só não entra em item novo nem aumenta a quantidade alocada.
    SELECT ativo INTO v_dep_ativo
      FROM public.internal_departments
     WHERE sigla = v_unit_name;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_DEPARTMENT: Departamento "%" não existe no catálogo oficial.', v_unit_name
        USING ERRCODE = '23503';
    END IF;

    IF v_dep_ativo IS NOT TRUE THEN
      SELECT COUNT(*), COALESCE(SUM(allocated_qty), 0)
        INTO v_prev_count, v_prev_qty
        FROM public.arp_allocations
       WHERE item_key = v_item_key
         AND unit_name = v_unit_name;
      IF v_prev_count = 0 THEN
        RAISE EXCEPTION 'INACTIVE_DEPARTMENT: A unidade "%" está desativada e não pode receber novas alocações.', v_unit_name
          USING ERRCODE = '22023';
      END IF;
      IF v_allocated_qty > v_prev_qty THEN
        RAISE EXCEPTION 'INACTIVE_DEPARTMENT: A unidade "%" está desativada: a alocação dela pode ficar como está ou diminuir, mas não aumentar (hoje: %).', v_unit_name, trim_scale(v_prev_qty)
          USING ERRCODE = '22023';
      END IF;
    END IF;

    -- ESCOPO (Fase 2B-1): esta linha, especificamente, precisa estar dentro
    -- do alcance do usuário — por unidade OU pela ATA do item (o que for
    -- concedido). GLOBAL já é resolvido internamente por has_scope() em
    -- qualquer uma das duas chamadas. Nenhuma linha autorizada é persistida
    -- se QUALQUER outra linha do mesmo payload falhar aqui: este loop roda
    -- inteiramente antes do DELETE/INSERT do Passo 6, então uma exceção
    -- aqui aborta a transação inteira sem gravar nada.
    IF NOT (
      public.has_scope('allocations', 'UNIT', v_unit_name)
      OR public.has_scope('allocations', 'ARP', v_ata_id::TEXT)
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Usuário sem escopo de alocação sobre a unidade "%".', v_unit_name
        USING ERRCODE = '42501';
    END IF;

    -- Validação opcional de processo SEI
    v_processo_sei_id := TRIM(COALESCE(v_elem->>'processo_sei_id', v_elem->>'processoSeiId', ''));
    IF v_processo_sei_id <> '' THEN
      IF NOT EXISTS (SELECT 1 FROM public.processos_sei WHERE id = v_processo_sei_id) THEN
        RAISE EXCEPTION 'INVALID_PROCESS_SEI: Processo SEI "%" informado não foi encontrado.', v_processo_sei_id
          USING ERRCODE = '23503';
      END IF;
    END IF;
  END LOOP;

  -- --------------------------------------------------------------------------
  -- PASSO 5b (migration 109): a soma alocada às unidades internas não passa da base do saldo do item —
  -- a cota própria da SENASP com a ata assinada informada, senão o registrado da SENASP.
  -- Diminuir é sempre permitido (para corrigir uma alocação que já passou do limite).
  -- --------------------------------------------------------------------------
  SELECT COALESCE(sum((COALESCE(e->>'allocated_qty', e->>'allocatedQty', '0'))::NUMERIC), 0)
    INTO v_soma_nova FROM jsonb_array_elements(p_allocations) e;
  SELECT COALESCE(sum(allocated_qty), 0) INTO v_soma_ant FROM public.arp_allocations WHERE item_key = v_item_key;
  SELECT s.quantidade_base_senasp INTO v_limite FROM public.v_arp_item_saldo_detalhado s WHERE s.item_key = v_item_key;
  IF v_limite IS NOT NULL AND v_soma_nova > v_limite AND v_soma_nova > v_soma_ant THEN
    RAISE EXCEPTION 'ACIMA_DA_COTA: A soma alocada (%) passa do limite do item (%: %).', trim_scale(v_soma_nova),
      CASE WHEN EXISTS (SELECT 1 FROM public.v_item_quantitativos q WHERE q.item_key = v_item_key)
           THEN 'cota própria da SENASP' ELSE 'registrado da SENASP' END,
      trim_scale(v_limite)
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 6: EXECUÇÃO ATÔMICA DA MUTAÇÃO
  -- --------------------------------------------------------------------------
  -- 6.1 Remove alocações prévias do item_key
  DELETE FROM public.arp_allocations
   WHERE item_key = v_item_key;

  -- 6.2 Insere as novas alocações validadas
  IF v_alloc_count > 0 THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      v_unit_name := TRIM(COALESCE(v_elem->>'unit_name', v_elem->>'unitName', ''));
      v_allocated_qty := (COALESCE(v_elem->>'allocated_qty', v_elem->>'allocatedQty', '0'))::NUMERIC;
      v_empenhada_qty := (COALESCE(v_elem->>'empenhada_qty', v_elem->>'empenhadaQty', '0'))::NUMERIC;
      v_processo_sei_id := NULLIF(TRIM(COALESCE(v_elem->>'processo_sei_id', v_elem->>'processoSeiId', '')), '');

      v_alloc_id := COALESCE(
        v_elem->>'id',
        'alloc_' || v_item_key || '_' || v_unit_name || '_' || gen_random_uuid()::TEXT
      );

      INSERT INTO public.arp_allocations (
        id,
        item_key,
        unit_name,
        allocated_qty,
        empenhada_qty,
        processo_sei_id,
        created_at
      ) VALUES (
        v_alloc_id,
        v_item_key,
        v_unit_name,
        v_allocated_qty,
        v_empenhada_qty,
        v_processo_sei_id,
        NOW()
      );
    END LOOP;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 7: INCREMENTO DA VERSÃO DO AGREGADO E ATUALIZAÇÃO DE TIMESTAMP
  -- --------------------------------------------------------------------------
  UPDATE public.item_allocation_state
     SET version = v_current_version + 1,
         updated_at = NOW()
   WHERE item_key = v_item_key
  RETURNING version INTO v_new_version;

  -- --------------------------------------------------------------------------
  -- PASSO 8: RESPOSTA CANÔNICA ESTRUTURADA
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'previous_version', v_current_version,
    'new_version', v_new_version,
    'count', v_alloc_count,
    'timestamp', NOW()
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 11) Contratos dos órgãos participantes (Contratos.gov.br, contratos ativos e encerrados)
--     Gravados pelo servidor (recurso 'contratos_participantes', por UASG gerenciadora). O contrato entra no
--     item quando a compra, o fornecedor e o número do item batem com a ata. Nunca apagados: um contrato que
--     some das listas continua contando como consumido, com a data em que foi visto pela última vez.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.participantes_contratos_itens (
  item_key        VARCHAR(100) NOT NULL,
  uasg            VARCHAR(6)   NOT NULL CHECK (uasg ~ '^[0-9]{6}$'),
  contrato_id     VARCHAR(30)  NOT NULL,
  numero          VARCHAR(40),
  tipo            VARCHAR(40),
  situacao        VARCHAR(40),
  quantidade      NUMERIC(18, 4) CHECK (quantidade IS NULL OR quantidade >= 0),
  valor_unitario  NUMERIC(18, 4),
  valor_global    NUMERIC(18, 2),
  vigencia_fim    DATE,
  visto_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_key, uasg, contrato_id)
);
COMMENT ON TABLE public.participantes_contratos_itens IS
  'Quantidade do item nos contratos (ou notas de empenho) dos órgãos participantes, lida do Contratos.gov.br. Nunca apagada pela sincronização.';

CREATE TABLE IF NOT EXISTS public.participantes_contratos_leituras (
  uasg_gerenciadora   VARCHAR(6) NOT NULL CHECK (uasg_gerenciadora ~ '^[0-9]{6}$'),
  uasg                VARCHAR(6) NOT NULL CHECK (uasg ~ '^[0-9]{6}$'),
  lido_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contratos_na_ug     INTEGER NOT NULL CHECK (contratos_na_ug >= 0),
  contratos_nos_itens INTEGER NOT NULL CHECK (contratos_nos_itens >= 0),
  PRIMARY KEY (uasg_gerenciadora, uasg)
);
COMMENT ON TABLE public.participantes_contratos_leituras IS
  'Última leitura da lista de contratos de cada UASG participante no Contratos.gov.br. contratos_na_ug = 0: o órgão não publica contratos lá (sem dado); > 0 sem contrato no item: nenhum contrato (zero real).';

ALTER TABLE public.participantes_contratos_itens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participantes_contratos_leituras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: participantes_contratos_itens" ON public.participantes_contratos_itens;
CREATE POLICY "Authenticated Read: participantes_contratos_itens" ON public.participantes_contratos_itens FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated Read: participantes_contratos_leituras" ON public.participantes_contratos_leituras;
CREATE POLICY "Authenticated Read: participantes_contratos_leituras" ON public.participantes_contratos_leituras FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.participantes_contratos_itens, public.participantes_contratos_leituras FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.participantes_contratos_itens, public.participantes_contratos_leituras FROM authenticated;
GRANT SELECT ON public.participantes_contratos_itens, public.participantes_contratos_leituras TO authenticated;
GRANT ALL ON public.participantes_contratos_itens, public.participantes_contratos_leituras TO service_role;

-- p_leituras: [{"uasg": "200109", "contratos_na_ug": 686, "linhas": [{"item_key": "...", "contrato_id": "123",
--   "numero": "00059/2026", "tipo": "Contrato", "situacao": "Ativo", "quantidade": 60, "valor_unitario": 103908.66,
--   "valor_global": 6234519.6, "vigencia_fim": "2027-01-10"}]}]
CREATE OR REPLACE FUNCTION public.gravar_contratos_participantes(p_uasg VARCHAR, p_leituras JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_leitura JSONB;
  v_linha   JSONB;
  v_part    VARCHAR(6);
  v_total   INTEGER := 0;
  v_itens   INTEGER;
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava os contratos dos participantes.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sincronizacao_fontes
     WHERE recurso = 'contratos_participantes' AND uasg = p_uasg
       AND em_andamento_por IS NOT DISTINCT FROM auth.uid()
       AND em_andamento_desde >= NOW() - INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'SYNC_NOT_RESERVED: Sincronização dos contratos dos participantes da UASG % não reservada.', p_uasg USING ERRCODE = '55000';
  END IF;
  IF p_leituras IS NULL OR jsonb_typeof(p_leituras) <> 'array' OR jsonb_array_length(p_leituras) > 100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_leituras deve ser um array com até 100 órgãos.' USING ERRCODE = '22023';
  END IF;

  FOR v_leitura IN SELECT e FROM jsonb_array_elements(p_leituras) e LOOP
    v_part := regexp_replace(COALESCE(v_leitura->>'uasg', ''), '\D', '', 'g');
    IF v_part !~ '^[0-9]{6}$' THEN CONTINUE; END IF;
    v_itens := 0;
    FOR v_linha IN SELECT e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_leitura->'linhas') = 'array' THEN v_leitura->'linhas' ELSE '[]'::JSONB END) e LOOP
      IF COALESCE(v_linha->>'item_key', '') = '' OR COALESCE(v_linha->>'contrato_id', '') = '' THEN CONTINUE; END IF;
      INSERT INTO public.participantes_contratos_itens AS p
        (item_key, uasg, contrato_id, numero, tipo, situacao, quantidade, valor_unitario, valor_global, vigencia_fim, visto_em)
      VALUES (
        left(v_linha->>'item_key', 100), v_part, left(v_linha->>'contrato_id', 30),
        left(v_linha->>'numero', 40), left(v_linha->>'tipo', 40), left(v_linha->>'situacao', 40),
        CASE WHEN v_linha->>'quantidade' ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_linha->>'quantidade')::NUMERIC END,
        CASE WHEN v_linha->>'valor_unitario' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (v_linha->>'valor_unitario')::NUMERIC END,
        CASE WHEN v_linha->>'valor_global' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (v_linha->>'valor_global')::NUMERIC END,
        CASE WHEN v_linha->>'vigencia_fim' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN left(v_linha->>'vigencia_fim', 10)::DATE END,
        NOW())
      ON CONFLICT (item_key, uasg, contrato_id) DO UPDATE
        SET numero = EXCLUDED.numero, tipo = EXCLUDED.tipo, situacao = EXCLUDED.situacao, quantidade = EXCLUDED.quantidade,
            valor_unitario = EXCLUDED.valor_unitario, valor_global = EXCLUDED.valor_global, vigencia_fim = EXCLUDED.vigencia_fim,
            visto_em = NOW();
      v_itens := v_itens + 1;
    END LOOP;
    INSERT INTO public.participantes_contratos_leituras (uasg_gerenciadora, uasg, lido_em, contratos_na_ug, contratos_nos_itens)
    VALUES (p_uasg, v_part, NOW(), GREATEST(COALESCE((v_leitura->>'contratos_na_ug')::INTEGER, 0), 0), v_itens)
    ON CONFLICT (uasg_gerenciadora, uasg) DO UPDATE
      SET lido_em = NOW(), contratos_na_ug = EXCLUDED.contratos_na_ug, contratos_nos_itens = EXCLUDED.contratos_nos_itens;
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.gravar_contratos_participantes(VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_contratos_participantes(VARCHAR, JSONB) TO service_role;

-- Agendamento (mesmo padrão das migrations 77 e 105): de hora em hora, cada execução lê os órgãos que
-- estão há mais de 24 h sem leitura, dentro do orçamento de tempo da função.
SELECT cron.schedule('sincronizar-contratos-participantes-200330', '32 * * * *', $$SELECT public.disparar_sincronizacao('contratos_participantes', '200330')$$);
SELECT cron.schedule('sincronizar-contratos-participantes-200331', '34 * * * *', $$SELECT public.disparar_sincronizacao('contratos_participantes', '200331')$$);
