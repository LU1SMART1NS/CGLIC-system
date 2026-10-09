-- ==============================================================================
-- MIGRATION 106: ATAS DE OUTROS ÓRGÃOS NA CARTEIRA, COMO AS GERENCIADAS
-- Versão: 20261009000106_atas_de_outros_orgaos_na_carteira.sql
--
-- Decisões do usuário (09/10/2026) para as atas de outros órgãos em que a SENASP é participante ou fez adesão
-- (descobertas pelo recurso 'atas_participacao', migration 105): entram na lista padrão da Carteira, têm gestor
-- da CGLIC, geram os alertas e o saldo segue a mesma lógica das demais atas (quantitativo SENASP − contratado).
--
-- Por isso elas passam a ser gravadas também em atas_registro_preco e itens_ata, com:
--   - codigo_uasg = UASG GERENCIADORA (identidade da ata: chave do item, consultas às fontes, compra do contrato);
--   - uasg_carteira = UASG da SENASP a que a ata pertence (200331, ou 200330); nas gerenciadas, = codigo_uasg;
--   - papel_senasp = GERENCIADORA | PARTICIPANTE | ADESAO.
-- Só os itens em que a SENASP aparece entram em itens_ata, com quantidade_senasp = registrado para a SENASP
-- (participante) ou aprovado na adesão.
--
-- Identidade da ata para gestor, plano de tarefas, avisos e ajuste de complexidade (ata_managers e afins guardam
-- só o número): atas da CGLIC continuam pelo número ("00005/2025"); atas de outros órgãos usam número e UASG
-- ("00005/2025-200342"). Nada muda nos dados que existem. chave_gestao_ata() é a regra única, e
-- ata_key_from_item_key() passa a usá-la, o que corrige de uma vez os gatilhos de herança e propagação de gestor.
--
-- Quantitativo SENASP pelas unidades (senasp_das_unidades): a gerenciadora só conta quando a ata é da CGLIC.
--
-- Pré-requisito: limpeza supabase/limpezas/20261009_atas_de_outros_orgaos_sem_itens.sql já aplicada (remove as
-- atas de outros órgãos gravadas por engano em 09/10/2026).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Carteira e papel da SENASP em atas_registro_preco
-- ------------------------------------------------------------------------------
ALTER TABLE public.atas_registro_preco
  ADD COLUMN IF NOT EXISTS uasg_carteira VARCHAR(6),
  ADD COLUMN IF NOT EXISTS papel_senasp VARCHAR(12) NOT NULL DEFAULT 'GERENCIADORA';

UPDATE public.atas_registro_preco SET uasg_carteira = codigo_uasg WHERE uasg_carteira IS NULL;

-- Quem grava sem informar a carteira (sincronização das gerenciadas) fica com a própria UASG.
CREATE OR REPLACE FUNCTION public.trg_ata_carteira_padrao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.uasg_carteira IS NULL OR btrim(NEW.uasg_carteira) = '' THEN
    NEW.uasg_carteira := NEW.codigo_uasg;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ata_carteira_padrao ON public.atas_registro_preco;
CREATE TRIGGER trg_ata_carteira_padrao
  BEFORE INSERT OR UPDATE ON public.atas_registro_preco
  FOR EACH ROW EXECUTE FUNCTION public.trg_ata_carteira_padrao();

ALTER TABLE public.atas_registro_preco ALTER COLUMN uasg_carteira SET NOT NULL;
ALTER TABLE public.atas_registro_preco DROP CONSTRAINT IF EXISTS atas_registro_preco_papel_senasp;
ALTER TABLE public.atas_registro_preco ADD CONSTRAINT atas_registro_preco_papel_senasp
  CHECK (papel_senasp IN ('GERENCIADORA', 'PARTICIPANTE', 'ADESAO'));
CREATE INDEX IF NOT EXISTS idx_atas_registro_preco_carteira ON public.atas_registro_preco (uasg_carteira);

-- ------------------------------------------------------------------------------
-- 2) Identidade da ata para gestor, planos, avisos e complexidade
-- ------------------------------------------------------------------------------
-- p_ata_uasg: "NÚMERO-UASG" (ex.: "00005/2025-200342"). Ata da CGLIC (ou sem UASG): só o número.
CREATE OR REPLACE FUNCTION public.chave_gestao_ata(p_ata_uasg TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN m[1] IS NULL THEN NULLIF(btrim(COALESCE(p_ata_uasg, '')), '')
    WHEN m[2] IS NULL OR m[2] IN ('200330', '200331') THEN m[1]
    ELSE m[1] || '-' || m[2]
  END
  FROM (SELECT regexp_match(btrim(COALESCE(p_ata_uasg, '')), '^(\d{5}/\d{4})(?:-(\d{6}))?$') AS m) x;
$$;

-- Chave de gestão da ata a partir da chave do item ("NÚMERO-UASG-ITEM"). Antes devolvia só o número.
CREATE OR REPLACE FUNCTION public.ata_key_from_item_key(p_item_key TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.chave_gestao_ata(public.ata_uasg_from_item_key(p_item_key));
$$;

-- ------------------------------------------------------------------------------
-- 3) Quantitativo SENASP pelas unidades: a gerenciadora só conta quando a ata é da CGLIC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.senasp_das_unidades(p_unidades JSONB, p_uasg_ata TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE COALESCE(sum(
           CASE WHEN btrim(u->>'quantidadeRegistrada') ~ '^[0-9]+(\.[0-9]+)?$'
                THEN (btrim(u->>'quantidadeRegistrada'))::NUMERIC ELSE 0 END
         ), 0) END
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(p_unidades) = 'array' THEN p_unidades ELSE '[]'::JSONB END
       ) AS u
  CROSS JOIN (SELECT regexp_replace(COALESCE(p_uasg_ata, ''), '\D', '', 'g') AS uasg) a
  WHERE jsonb_typeof(u) = 'object'
    AND (
      regexp_replace(COALESCE(u->>'codigoUnidade', ''), '\D', '', 'g') IN ('200330', '200331')
      -- Ata gerenciada pela CGLIC (ou sem UASG informada): a gerenciadora é a própria SENASP.
      OR ((a.uasg = '' OR a.uasg IN ('200330', '200331'))
          AND (u->>'tipoUnidade' = 'GERENCIADORA'
               OR (a.uasg <> '' AND regexp_replace(COALESCE(u->>'codigoUnidade', ''), '\D', '', 'g') = a.uasg)))
    );
$$;

-- ------------------------------------------------------------------------------
-- 4) Vínculo automático: gestor da ata pela chave de gestão (antes, só pelo número)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prever_vinculos_automaticos(p_contract_key text DEFAULT NULL::text)
 RETURNS TABLE(contract_key text, situacao text, motivo text, item_key text, ata_key text, quantidade numeric, valor_unitario numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH c AS (
    SELECT DISTINCT ON (co.contract_key)
      co.contract_key::TEXT AS k,
      public.vinculo_auto_digitos(co.id_compra) AS idc,
      public.vinculo_auto_digitos(co.fornecedor_cnpj_cpf) AS doc,
      public.vinculo_auto_primeira_palavra(co.registro ->> 'fornecedorNome') AS p1
    FROM public.contratos_oficiais co
    WHERE p_contract_key IS NULL OR co.contract_key = p_contract_key
    ORDER BY co.contract_key, co.sincronizado_em DESC
  ),
  a AS MATERIALIZED (
    SELECT x.id, x.numero_ata::TEXT AS numero_ata, x.numero_ata || '-' || x.codigo_uasg AS ata_uasg,
           public.vinculo_auto_digitos(x.codigo_uasg) AS uasg,
           CASE WHEN length(s.num) < 5 THEN lpad(s.num, 5, '0') ELSE s.num END || s.ano AS sufixo
    FROM public.atas_registro_preco x
    CROSS JOIN LATERAL (
      SELECT CASE WHEN length(d.num) > 5 AND right(d.num, 4) = d.ano THEN left(d.num, length(d.num) - 4) ELSE d.num END AS num, d.ano
      FROM (SELECT public.vinculo_auto_digitos(x.numero_compra) AS num, public.vinculo_auto_digitos(x.ano_compra) AS ano) d
    ) s
    WHERE s.num <> '' AND length(s.ano) = 4
  ),
  -- contratos com alguma ata da mesma compra (de qualquer fornecedor): os únicos que a regra olha
  compra AS (
    SELECT c.k, a.id AS ata_id, a.numero_ata, a.ata_uasg
    FROM c JOIN a ON length(c.idc) = 17 AND left(c.idc, 6) = a.uasg AND right(c.idc, 9) = a.sufixo
  ),
  -- itens dessas atas que são do fornecedor do contrato
  cand AS (
    SELECT cp.k, cp.numero_ata, cp.ata_uasg,
           NULLIF(public.vinculo_auto_digitos(i.numero_item), '')::INTEGER AS n,
           i.valor_unitario AS vu_ata, i.quantidade_homologada AS qh
    FROM compra cp
    JOIN c ON c.k = cp.k
    JOIN public.itens_ata i ON i.ata_id = cp.ata_id
    WHERE CASE
            WHEN length(c.doc) IN (11, 14) THEN public.vinculo_auto_digitos(i.fornecedor_cnpj_cpf) = c.doc
            ELSE length(public.vinculo_auto_digitos(i.fornecedor_cnpj_cpf)) NOT IN (11, 14)
                 AND c.p1 IS NOT NULL
                 AND public.vinculo_auto_primeira_palavra(i.fornecedor_razao_social) = c.p1
          END
  ),
  ks AS (SELECT DISTINCT k FROM compra),
  icn AS (
    SELECT ic.contract_key::TEXT AS k, ic.numero_item AS n, sum(ic.quantidade) AS q, max(ic.valor_unitario) AS vu
    FROM public.itens_contrato ic
    WHERE ic.numero_item IS NOT NULL AND ic.contract_key IN (SELECT k FROM ks)
    GROUP BY 1, 2
  ),
  par AS (
    SELECT icn.k, icn.n, icn.q, icn.vu, cand.numero_ata, cand.ata_uasg, cand.vu_ata, cand.qh,
           count(cand.ata_uasg) OVER (PARTITION BY icn.k, icn.n) AS atas_do_item
    FROM icn LEFT JOIN cand ON cand.k = icn.k AND cand.n = icn.n
  ),
  -- gestores das atas a que o contrato ainda não está vinculado
  ga AS MATERIALIZED (
    SELECT p.k,
           count(DISTINCT am.gestor_nome) AS gestores,
           max(am.gestor_nome) AS gestor,
           bool_or(am.gestor_nome IS NULL) AS alguma_sem_gestor
    FROM (SELECT DISTINCT par.k, par.numero_ata, par.ata_uasg FROM par WHERE par.ata_uasg IS NOT NULL) p
    LEFT JOIN public.ata_managers am ON am.ata_key = public.chave_gestao_ata(p.ata_uasg)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.arp_item_contract_links l
      WHERE l.contract_key = p.k AND public.ata_uasg_from_item_key(l.item_key) = p.ata_uasg
    )
    GROUP BY p.k
  ),
  m AS (
    SELECT ks.k,
      CASE
        WHEN EXISTS (SELECT 1 FROM public.arp_item_contract_links l WHERE l.contract_key = ks.k AND l.origem = 'MANUAL')
          THEN 'VINCULO_MANUAL'
        WHEN EXISTS (SELECT 1 FROM public.contract_sem_ata_confirmacoes s WHERE s.contract_key = ks.k)
          THEN 'NAO_PERTENCE_A_ATA'
        WHEN NOT EXISTS (SELECT 1 FROM cand WHERE cand.k = ks.k)
          THEN 'OUTRO_FORNECEDOR'
        WHEN NOT EXISTS (SELECT 1 FROM public.itens_contrato_leituras r WHERE r.contract_key = ks.k)
          THEN 'ITENS_NAO_LIDOS'
        WHEN NOT EXISTS (SELECT 1 FROM icn WHERE icn.k = ks.k)
          OR EXISTS (SELECT 1 FROM public.itens_contrato ic WHERE ic.contract_key = ks.k AND ic.numero_item IS NULL)
          THEN 'ITEM_SEM_NUMERO'
        WHEN EXISTS (SELECT 1 FROM par WHERE par.k = ks.k AND par.atas_do_item = 0)
          THEN 'ITEM_FORA_DA_ATA'
        WHEN EXISTS (SELECT 1 FROM par WHERE par.k = ks.k AND par.atas_do_item > 1)
          THEN 'ITEM_EM_VARIAS_ATAS'
        WHEN EXISTS (
          SELECT 1 FROM par JOIN public.contract_ata_descartes d ON d.contract_key = par.k AND d.ata_key = par.ata_uasg
          WHERE par.k = ks.k)
          THEN 'ATA_DESCARTADA'
        WHEN EXISTS (
          SELECT 1 FROM par JOIN public.arp_item_contract_dismissals d
            ON d.contract_key = par.k AND d.item_key = par.ata_uasg || '-' || lpad(par.n::TEXT, 5, '0')
          WHERE par.k = ks.k)
          THEN 'VINCULO_DESFEITO'
        WHEN EXISTS (
          SELECT 1 FROM par WHERE par.k = ks.k
            AND ((par.vu_ata > 0 AND par.vu > par.vu_ata * 1.25) OR (par.qh > 0 AND par.q > par.qh * 1.25)))
          THEN 'VALOR_FORA_DO_LIMITE'
        WHEN ga.gestores > 1
          THEN 'GESTORES_DIFERENTES'
        WHEN ga.gestores = 1 AND cm.gestor_nome IS NOT NULL AND cm.gestor_nome <> ga.gestor
          THEN 'TROCARIA_GESTOR'
        WHEN ga.alguma_sem_gestor AND (ga.gestores = 1 OR cm.gestor_nome IS NOT NULL)
          THEN 'ATA_SEM_GESTOR'
        ELSE NULL
      END AS motivo
    FROM ks
    LEFT JOIN ga ON ga.k = ks.k
    LEFT JOIN public.contract_managers cm ON cm.contract_key = ks.k
  )
  SELECT m.k, 'MANUAL', m.motivo, NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC
  FROM m WHERE m.motivo IS NOT NULL
  UNION ALL
  SELECT par.k,
         CASE WHEN m.motivo IS NULL THEN 'AUTOMATICO' ELSE 'PAR_VALIDO' END,
         NULL::TEXT,
         par.ata_uasg || '-' || lpad(par.n::TEXT, 5, '0'),
         par.ata_uasg,
         par.q,
         par.vu
  FROM par JOIN m ON m.k = par.k
  -- Todo par que os dados confirmam (compra, fornecedor e item na ata). Com motivo, só serve para manter um
  -- automático que já existe: um item novo fora da ata não derruba o vínculo dos outros itens.
  WHERE par.ata_uasg IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.executar_vinculos_automaticos(p_contract_key text DEFAULT NULL::text, p_simular boolean DEFAULT false, p_origem text DEFAULT 'SERVIDOR'::text, p_executado_por_nome text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_obs CONSTANT TEXT := 'Vínculo automático: mesma compra, mesmo fornecedor e o item do contrato está nesta ata.';
  v_k TEXT;
  v_n INTEGER;
  v_novos INTEGER := 0;
  v_contratos_novos INTEGER := 0;
  v_atualizados INTEGER := 0;
  v_removidos INTEGER := 0;
  v_erros JSONB := '[]'::JSONB;
  v_manuais JSONB;
  v_herdam JSONB;
  v_resumo JSONB;
BEGIN
  -- Uma execução por vez (cron e coordenador ao mesmo tempo).
  PERFORM pg_advisory_xact_lock(hashtext('executar_vinculos_automaticos'));

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.vinculo_auto_previsto (
    contract_key TEXT, situacao TEXT, motivo TEXT, item_key TEXT, ata_key TEXT, quantidade NUMERIC, valor_unitario NUMERIC
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.vinculo_auto_previsto;
  INSERT INTO pg_temp.vinculo_auto_previsto SELECT * FROM public.prever_vinculos_automaticos(p_contract_key);

  SELECT COALESCE(jsonb_object_agg(motivo, n), '{}'::JSONB) INTO v_manuais
  FROM (SELECT motivo, count(*) AS n FROM pg_temp.vinculo_auto_previsto WHERE situacao = 'MANUAL' GROUP BY motivo) x;

  -- Contratos sem gestor que, com o vínculo novo, passam a ser do gestor da ata (por gestor).
  SELECT COALESCE(jsonb_object_agg(g, n), '{}'::JSONB) INTO v_herdam
  FROM (
    SELECT am.gestor_nome AS g, count(DISTINCT p.contract_key) AS n
    FROM pg_temp.vinculo_auto_previsto p
    JOIN public.ata_managers am ON am.ata_key = public.chave_gestao_ata(p.ata_key)
    WHERE p.situacao = 'AUTOMATICO'
      AND NOT EXISTS (SELECT 1 FROM public.arp_item_contract_links l WHERE l.item_key = p.item_key AND l.contract_key = p.contract_key)
      AND NOT EXISTS (SELECT 1 FROM public.contract_managers cm WHERE cm.contract_key = p.contract_key)
    GROUP BY 1
  ) x;

  -- a) Vínculos novos, contrato por contrato (o erro de um não para os outros)
  FOR v_k IN
    SELECT DISTINCT p.contract_key FROM pg_temp.vinculo_auto_previsto p
    WHERE p.situacao = 'AUTOMATICO'
      AND NOT EXISTS (SELECT 1 FROM public.arp_item_contract_links l WHERE l.item_key = p.item_key AND l.contract_key = p.contract_key)
    ORDER BY 1
  LOOP
    IF p_simular THEN
      SELECT count(*) INTO v_n FROM pg_temp.vinculo_auto_previsto p
      WHERE p.contract_key = v_k AND p.situacao = 'AUTOMATICO'
        AND NOT EXISTS (SELECT 1 FROM public.arp_item_contract_links l WHERE l.item_key = p.item_key AND l.contract_key = p.contract_key);
      v_novos := v_novos + v_n;
      v_contratos_novos := v_contratos_novos + 1;
      CONTINUE;
    END IF;
    BEGIN
      INSERT INTO public.arp_item_contract_links (
        item_key, contract_key, observacoes, origem, criado_por,
        quantidade_contratada_api, valor_unitario_api, quantidade_lida_em, created_at, updated_at
      )
      SELECT p.item_key, p.contract_key, v_obs, 'AUTOMATICO', NULL, p.quantidade, p.valor_unitario, NOW(), NOW(), NOW()
      FROM pg_temp.vinculo_auto_previsto p
      WHERE p.contract_key = v_k AND p.situacao = 'AUTOMATICO'
      ORDER BY p.item_key
      ON CONFLICT (item_key, contract_key) DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_novos := v_novos + v_n;
      IF v_n > 0 THEN v_contratos_novos := v_contratos_novos + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_erros := v_erros || jsonb_build_array(jsonb_build_object('contrato', v_k, 'erro', SQLERRM));
    END;
  END LOOP;

  -- b) Quantidade e preço dos automáticos acompanham a fonte
  IF p_simular THEN
    SELECT count(*) INTO v_atualizados
    FROM public.arp_item_contract_links l
    JOIN pg_temp.vinculo_auto_previsto p ON p.item_key = l.item_key AND p.contract_key = l.contract_key AND p.situacao IN ('AUTOMATICO', 'PAR_VALIDO')
    WHERE l.origem = 'AUTOMATICO'
      AND (l.quantidade_contratada_api IS DISTINCT FROM p.quantidade OR l.valor_unitario_api IS DISTINCT FROM p.valor_unitario);
  ELSE
    UPDATE public.arp_item_contract_links l
       SET quantidade_contratada_api = p.quantidade,
           valor_unitario_api = p.valor_unitario,
           quantidade_lida_em = NOW(),
           updated_at = NOW()
      FROM pg_temp.vinculo_auto_previsto p
     WHERE p.item_key = l.item_key AND p.contract_key = l.contract_key AND p.situacao IN ('AUTOMATICO', 'PAR_VALIDO')
       AND l.origem = 'AUTOMATICO'
       AND (l.quantidade_contratada_api IS DISTINCT FROM p.quantidade OR l.valor_unitario_api IS DISTINCT FROM p.valor_unitario);
    GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  END IF;

  -- c) Automático que a fonte desmentiu: o contrato tem itens numerados lidos e o par não se confirma mais.
  --    Falta de dado (itens não lidos ou sem número) nunca retira vínculo.
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.vinculo_auto_retirar (id UUID) ON COMMIT DROP;
  TRUNCATE pg_temp.vinculo_auto_retirar;
  INSERT INTO pg_temp.vinculo_auto_retirar
  SELECT l.id
  FROM public.arp_item_contract_links l
  WHERE l.origem = 'AUTOMATICO'
    AND (p_contract_key IS NULL OR l.contract_key = p_contract_key)
    AND EXISTS (SELECT 1 FROM public.contratos_oficiais co WHERE co.contract_key = l.contract_key)
    AND EXISTS (SELECT 1 FROM public.itens_contrato ic WHERE ic.contract_key = l.contract_key AND ic.numero_item IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.itens_contrato ic WHERE ic.contract_key = l.contract_key AND ic.numero_item IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM pg_temp.vinculo_auto_previsto p
      WHERE p.item_key = l.item_key AND p.contract_key = l.contract_key AND p.situacao IN ('AUTOMATICO', 'PAR_VALIDO')
    );
  SELECT count(*) INTO v_removidos FROM pg_temp.vinculo_auto_retirar;
  IF NOT p_simular AND v_removidos > 0 THEN
    DELETE FROM public.arp_item_contract_links WHERE id IN (SELECT id FROM pg_temp.vinculo_auto_retirar);
  END IF;

  v_resumo := jsonb_build_object(
    'simulacao', p_simular,
    'novos', v_novos,
    'contratos_novos', v_contratos_novos,
    'atualizados', v_atualizados,
    'retirados', v_removidos,
    'automaticos_total', (SELECT count(*) FROM public.arp_item_contract_links WHERE origem = 'AUTOMATICO'),
    'manuais', v_manuais,
    'herdam_gestor', v_herdam,
    'erros', v_erros
  );

  IF p_contract_key IS NULL THEN
    INSERT INTO public.vinculo_automatico_execucoes (origem, executado_por_nome, simulacao, resumo)
    VALUES (CASE WHEN p_origem IN ('CRON', 'COORDENADOR', 'SERVIDOR') THEN p_origem ELSE 'SERVIDOR' END,
            LEFT(p_executado_por_nome, 150), p_simular, v_resumo);
    DELETE FROM public.vinculo_automatico_execucoes
     WHERE id NOT IN (SELECT id FROM public.vinculo_automatico_execucoes ORDER BY executado_em DESC LIMIT 500);
  END IF;

  RETURN v_resumo;
END;
$function$

;

-- ------------------------------------------------------------------------------
-- 5) Saldo por item com a carteira e o papel (colunas novas no fim; o resto igual à migration 103)
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
            COALESCE(ic.quantidade_senasp, ic.quantidade_homologada, 0::numeric) AS quantidade_base_senasp,
            COALESCE(ca.total_contratado, 0::numeric) AS quantidade_consumida,
            COALESCE(ca.total_contratos_vinculados, 0::bigint) AS total_contratos_vinculados,
            COALESCE(ca.total_contratos_sem_quantidade, 0::bigint) AS total_contratos_sem_quantidade,
            COALESCE(ca.total_contratos_ajustados, 0::bigint) AS total_contratos_ajustados,
            COALESCE(ca.quantidade_contratada_sem_unidade, 0::numeric) AS quantidade_contratada_sem_unidade,
            COALESCE(ca.total_contratos_a_conferir, 0::bigint) AS total_contratos_a_conferir
           FROM itens_canonical ic
             FULL JOIN contratos_agg ca ON ca.item_key::text = ic.canonical_item_key
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
    b.papel_senasp
   FROM base b
     LEFT JOIN empenhado_agg e ON e.item_key::text = b.item_key;

-- ------------------------------------------------------------------------------
-- 6) Espelho da ata de participação na carteira (atas_registro_preco + itens_ata)
--
-- Junta as linhas de atas_participacao da ata (pode haver uma por UASG da SENASP): carteira 200331 quando ela
-- participa, senão a outra; papel PARTICIPANTE quando algum item é de participação; quantidade SENASP = soma.
-- Ata da CGLIC nunca passa por aqui (a regra recusa gerenciadora 200330/200331). Não apaga item que sumiu.
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
             -- Adesão sem quantidade aprovada informada pela fonte conta 0, nunca o total da ata.
             COALESCE(sum(ip.quantidade_senasp), 0) AS senasp
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
-- 7) A gravação do servidor passa a espelhar cada ata gravada (o resto igual à migration 105)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_atas_participacao(
  p_uasg VARCHAR(6),
  p_compra JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id_compra TEXT;
  v_ata       JSONB;
  v_item      JSONB;
  v_ata_id    BIGINT;
  v_papel     TEXT;
  v_total     INTEGER := 0;
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava as atas em que a SENASP participa.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sincronizacao_fontes
     WHERE recurso = 'atas_participacao'
       AND uasg = p_uasg
       AND em_andamento_por IS NOT DISTINCT FROM auth.uid()
       AND em_andamento_desde >= NOW() - INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'SYNC_NOT_RESERVED: Sincronização das atas de participação da UASG % não reservada.', p_uasg
      USING ERRCODE = '55000';
  END IF;

  IF p_compra IS NULL OR jsonb_typeof(p_compra) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_compra deve ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;
  v_id_compra := btrim(COALESCE(p_compra->>'id_compra', ''));
  IF v_id_compra !~ '^\d{17}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: id_compra inválido (%).', v_id_compra USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_compra->'atas', '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_compra->'atas', '[]'::jsonb)) > 50 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: atas deve ser um array com no máximo 50 atas.' USING ERRCODE = '22023';
  END IF;

  FOR v_ata IN SELECT valor FROM jsonb_array_elements(COALESCE(p_compra->'atas', '[]'::jsonb)) AS e(valor) LOOP
    IF jsonb_typeof(v_ata) <> 'object' THEN CONTINUE; END IF;
    v_papel := v_ata->>'papel';
    IF v_papel NOT IN ('PARTICIPANTE', 'ADESAO') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: papel inválido na ata % (%).', v_ata->>'numero_ata', v_papel USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(COALESCE(v_ata->'itens', '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(v_ata->'itens', '[]'::jsonb)) > 500 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: itens da ata % deve ser um array com no máximo 500 itens.', v_ata->>'numero_ata' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.atas_participacao AS a (
      numero_ata, uasg_gerenciadora, nome_gerenciadora, uasg_senasp, papel, id_compra, numero_compra, ano_compra,
      modalidade, objeto, data_vigencia_inicial, data_vigencia_final, status_ata, numero_controle_pncp,
      quantidade_itens_ata, lido_em
    ) VALUES (
      btrim(v_ata->>'numero_ata'), btrim(v_ata->>'uasg_gerenciadora'), NULLIF(v_ata->>'nome_gerenciadora', ''),
      btrim(v_ata->>'uasg_senasp'), v_papel, v_id_compra, NULLIF(v_ata->>'numero_compra', ''), NULLIF(v_ata->>'ano_compra', ''),
      NULLIF(v_ata->>'modalidade', ''), NULLIF(v_ata->>'objeto', ''),
      NULLIF(v_ata->>'data_vigencia_inicial', '')::date, NULLIF(v_ata->>'data_vigencia_final', '')::date,
      NULLIF(v_ata->>'status_ata', ''), NULLIF(v_ata->>'numero_controle_pncp', ''),
      COALESCE(NULLIF(v_ata->>'quantidade_itens_ata', '')::integer, 0), NOW()
    )
    ON CONFLICT (numero_ata, uasg_gerenciadora, uasg_senasp) DO UPDATE
      SET nome_gerenciadora = EXCLUDED.nome_gerenciadora,
          papel = EXCLUDED.papel,
          id_compra = EXCLUDED.id_compra,
          numero_compra = EXCLUDED.numero_compra,
          ano_compra = EXCLUDED.ano_compra,
          modalidade = EXCLUDED.modalidade,
          objeto = EXCLUDED.objeto,
          data_vigencia_inicial = EXCLUDED.data_vigencia_inicial,
          data_vigencia_final = EXCLUDED.data_vigencia_final,
          status_ata = EXCLUDED.status_ata,
          numero_controle_pncp = EXCLUDED.numero_controle_pncp,
          quantidade_itens_ata = EXCLUDED.quantidade_itens_ata,
          lido_em = EXCLUDED.lido_em
    RETURNING a.id INTO v_ata_id;

    FOR v_item IN SELECT valor FROM jsonb_array_elements(COALESCE(v_ata->'itens', '[]'::jsonb)) AS e(valor) LOOP
      IF jsonb_typeof(v_item) <> 'object' THEN CONTINUE; END IF;
      INSERT INTO public.itens_ata_participacao AS i (
        participacao_id, numero_item, descricao, fornecedor_cnpj_cpf, fornecedor_razao_social, quantidade_homologada,
        valor_unitario, maximo_adesao, papel, quantidade_senasp, unidade, adesoes, lido_em
      ) VALUES (
        v_ata_id,
        lpad(btrim(v_item->>'numero_item'), 5, '0'),
        COALESCE(NULLIF(btrim(v_item->>'descricao'), ''), 'Descrição não informada pela fonte oficial'),
        NULLIF(left(btrim(COALESCE(v_item->>'fornecedor_cnpj_cpf', '')), 255), ''),
        NULLIF(v_item->>'fornecedor_razao_social', ''),
        NULLIF(v_item->>'quantidade_homologada', '')::numeric,
        NULLIF(v_item->>'valor_unitario', '')::numeric,
        NULLIF(v_item->>'maximo_adesao', '')::numeric,
        v_item->>'papel',
        NULLIF(v_item->>'quantidade_senasp', '')::numeric,
        CASE WHEN jsonb_typeof(v_item->'unidade') = 'object' THEN v_item->'unidade' END,
        CASE WHEN jsonb_typeof(v_item->'adesoes') = 'array' THEN v_item->'adesoes' ELSE '[]'::jsonb END,
        NOW()
      )
      ON CONFLICT (participacao_id, numero_item) DO UPDATE
        SET descricao = EXCLUDED.descricao,
            fornecedor_cnpj_cpf = EXCLUDED.fornecedor_cnpj_cpf,
            fornecedor_razao_social = EXCLUDED.fornecedor_razao_social,
            quantidade_homologada = EXCLUDED.quantidade_homologada,
            valor_unitario = EXCLUDED.valor_unitario,
            maximo_adesao = EXCLUDED.maximo_adesao,
            papel = EXCLUDED.papel,
            quantidade_senasp = EXCLUDED.quantidade_senasp,
            unidade = EXCLUDED.unidade,
            adesoes = EXCLUDED.adesoes,
            lido_em = EXCLUDED.lido_em;
    END LOOP;

    -- A ata entra também na carteira (atas_registro_preco e itens_ata), como as gerenciadas.
    PERFORM public.espelhar_participacao_na_carteira(btrim(v_ata->>'numero_ata'), btrim(v_ata->>'uasg_gerenciadora'));

    v_total := v_total + 1;
  END LOOP;

  INSERT INTO public.participacao_compras_lidas AS l
    (uasg_carteira, id_compra, uasg_compra, contratos, atas_encontradas, leitura_completa, tem_ata_vigente, lido_em)
  VALUES (
    p_uasg, v_id_compra, left(v_id_compra, 6),
    GREATEST(COALESCE(NULLIF(p_compra->>'contratos', '')::integer, 0), 0),
    GREATEST(COALESCE(NULLIF(p_compra->>'atas_encontradas', '')::integer, 0), 0),
    COALESCE((p_compra->>'leitura_completa')::boolean, FALSE),
    COALESCE((p_compra->>'tem_ata_vigente')::boolean, FALSE),
    NOW()
  )
  ON CONFLICT (uasg_carteira, id_compra) DO UPDATE
    SET contratos = EXCLUDED.contratos,
        atas_encontradas = EXCLUDED.atas_encontradas,
        leitura_completa = EXCLUDED.leitura_completa,
        tem_ata_vigente = EXCLUDED.tem_ata_vigente,
        lido_em = EXCLUDED.lido_em;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_atas_participacao(VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_atas_participacao(VARCHAR, JSONB) TO service_role;

-- ------------------------------------------------------------------------------
-- 8) Atas já descobertas entram na carteira agora
-- ------------------------------------------------------------------------------
SELECT public.espelhar_participacao_na_carteira(numero_ata, uasg_gerenciadora)
  FROM (SELECT DISTINCT numero_ata, uasg_gerenciadora FROM public.atas_participacao) t;
