-- ==============================================================================
-- MIGRATION 95: VÍNCULO AUTOMÁTICO ENTRE ATA E CONTRATO
-- Versão: 20261008000095_vinculo_automatico_ata_contrato.sql
--
-- Contexto (medição de 07-08/10/2026, só leitura, 1.103 contratos e 191 atas): com os dados que já
-- estão no banco, 420 contratos (854 pares item da ata × contrato) têm a ata certa sem nenhuma dúvida;
-- os 9 vínculos feitos à mão até hoje são exatamente os que a regra produz. Ficam para a equipe só os
-- casos em que algum dado não fecha (22 contratos naquela data).
--
-- Regra (tudo tem que valer; qualquer falha manda o contrato inteiro para o vínculo manual):
--   1) mesma compra: o idCompra do contrato (17 dígitos: UASG + modalidade + número + ano) é a compra
--      da ata (UASG, número e ano);
--   2) mesmo fornecedor: CNPJ/CPF igual; fornecedor estrangeiro (sem documento dos dois lados), a
--      primeira palavra do nome igual, sem acento;
--   3) os itens do contrato foram lidos da fonte (itens_contrato) e todos têm o número do item da compra;
--   4) cada item do contrato está em UMA ata daquela compra e daquele fornecedor (o contrato pode ficar
--      em várias atas da mesma compra, migration 86);
--   5) nada da equipe diz o contrário: sem vínculo manual no contrato, sem "não pertence a ata", sem ata
--      descartada pelo coordenador, sem vínculo desfeito no item;
--   6) valores dentro do limite legal de acréscimo (25%): preço do contrato até 1,25 × o da ata e
--      quantidade até 1,25 × a homologada;
--   7) não muda o gestor de ninguém (migrations 69, 70 e 86): automático só quando o contrato herda o
--      gestor da ata, já tem o mesmo gestor, ou ninguém tem gestor. Atas de gestores diferentes, troca de
--      gestor ou ata sem gestor que passaria a ser de alguém ficam para o coordenador.
--
-- O que entra
--   1) arp_item_contract_links.origem: AUTOMATICO (o sistema) ou MANUAL (a equipe). A automação nunca
--      toca vínculo MANUAL nem contrato que tenha algum.
--   2) prever_vinculos_automaticos(contrato?): o que a regra faria e, para os manuais, o motivo.
--   3) executar_vinculos_automaticos(...): cria os vínculos novos, atualiza a quantidade e o preço dos
--      automáticos pela fonte e retira o automático que a fonte desmentiu (o item saiu do contrato ou
--      a ata deixou de ser da compra). Só servidor e cron; o coordenador usa
--      vincular_contratos_automaticamente(simular), que por padrão só simula.
--   4) vinculo_automatico_execucoes: o resumo de cada execução (o que a tela mostra).
--   5) Desvincular (automático ou manual) grava o par em arp_item_contract_dismissals, e a automação não
--      o refaz. "Restaurar" a sugestão no item devolve o par à automação.
--   6) Job do pg_cron a cada hora (minuto 55, depois das sincronizações de atas e itens dos contratos).
--   7) Dados de teste (confirmado pelo usuário em 08/10/2026): os 2 descartes de ata feitos em
--      06/10/2026 são apagados; os 9 vínculos de teste são os mesmos que a regra produz e passam a ser
--      AUTOMATICO.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Origem do vínculo
-- ------------------------------------------------------------------------------
ALTER TABLE public.arp_item_contract_links
  ADD COLUMN IF NOT EXISTS origem VARCHAR(12) NOT NULL DEFAULT 'MANUAL';

ALTER TABLE public.arp_item_contract_links DROP CONSTRAINT IF EXISTS arp_item_contract_links_origem_check;
ALTER TABLE public.arp_item_contract_links ADD CONSTRAINT arp_item_contract_links_origem_check
  CHECK (origem IN ('AUTOMATICO', 'MANUAL'));

COMMENT ON COLUMN public.arp_item_contract_links.origem IS
  'AUTOMATICO = criado pela regra de compra, fornecedor e item (migration 95); MANUAL = criado pela equipe. A automação nunca toca MANUAL.';

CREATE INDEX IF NOT EXISTS arp_item_contract_links_contract_idx ON public.arp_item_contract_links (contract_key);

-- ------------------------------------------------------------------------------
-- 2) Registro das execuções
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vinculo_automatico_execucoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  origem              VARCHAR(12) NOT NULL,
  executado_por_nome  VARCHAR(150),
  simulacao           BOOLEAN NOT NULL,
  resumo              JSONB NOT NULL,
  CONSTRAINT vinculo_automatico_execucoes_origem CHECK (origem IN ('CRON', 'COORDENADOR', 'SERVIDOR'))
);

CREATE INDEX IF NOT EXISTS vinculo_automatico_execucoes_quando_idx
  ON public.vinculo_automatico_execucoes (executado_em DESC);

ALTER TABLE public.vinculo_automatico_execucoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: vinculo_automatico_execucoes" ON public.vinculo_automatico_execucoes;
CREATE POLICY "Authenticated Read: vinculo_automatico_execucoes"
  ON public.vinculo_automatico_execucoes FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.vinculo_automatico_execucoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vinculo_automatico_execucoes TO authenticated;

-- ------------------------------------------------------------------------------
-- 3) Auxiliares
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vinculo_auto_digitos(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(COALESCE(p, ''), '\D', '', 'g');
$$;

-- Primeira palavra do nome da empresa, sem acento e em maiúsculas ("Ceská zbrojovka a.s." → "CESKA").
CREATE OR REPLACE FUNCTION public.vinculo_auto_primeira_palavra(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(split_part(btrim(regexp_replace(
    upper(translate(COALESCE(p, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
    '[^A-Z0-9]+', ' ', 'g')), ' ', 1), '');
$$;

REVOKE ALL ON FUNCTION public.vinculo_auto_digitos(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vinculo_auto_primeira_palavra(TEXT) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4) Previsão: o que a regra faz com cada contrato que tem ata da mesma compra
-- ------------------------------------------------------------------------------
-- situacao:
--   AUTOMATICO  um par item da ata × contrato que a automação cria (ou mantém);
--   PAR_VALIDO  um par que os dados confirmam, mas o contrato ficou para o manual (ex.: gestor);
--               um vínculo automático que já existe nele é mantido;
--   MANUAL      uma linha por contrato, com o motivo.
CREATE OR REPLACE FUNCTION public.prever_vinculos_automaticos(p_contract_key TEXT DEFAULT NULL)
RETURNS TABLE (
  contract_key   TEXT,
  situacao       TEXT,
  motivo         TEXT,
  item_key       TEXT,
  ata_key        TEXT,
  quantidade     NUMERIC,
  valor_unitario NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  a AS (
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
  ga AS (
    SELECT p.k,
           count(DISTINCT am.gestor_nome) AS gestores,
           max(am.gestor_nome) AS gestor,
           bool_or(am.gestor_nome IS NULL) AS alguma_sem_gestor
    FROM (SELECT DISTINCT par.k, par.numero_ata, par.ata_uasg FROM par WHERE par.ata_uasg IS NOT NULL) p
    LEFT JOIN public.ata_managers am ON am.ata_key = p.numero_ata
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
$$;

COMMENT ON FUNCTION public.prever_vinculos_automaticos(TEXT) IS
  'O que o vínculo automático faz com cada contrato que tem ata da mesma compra: pares AUTOMATICO, pares confirmados de contratos manuais (PAR_VALIDO) e o motivo dos MANUAL. Só leitura.';

REVOKE ALL ON FUNCTION public.prever_vinculos_automaticos(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prever_vinculos_automaticos(TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5) Execução
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.executar_vinculos_automaticos(
  p_contract_key TEXT DEFAULT NULL,
  p_simular BOOLEAN DEFAULT FALSE,
  p_origem TEXT DEFAULT 'SERVIDOR',
  p_executado_por_nome TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    JOIN public.ata_managers am ON am.ata_key = split_part(p.ata_key, '-', 1)
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
$$;

COMMENT ON FUNCTION public.executar_vinculos_automaticos(TEXT, BOOLEAN, TEXT, TEXT) IS
  'Cria, atualiza e retira vínculos AUTOMATICO pela regra de prever_vinculos_automaticos. Só servidor e cron.';

REVOKE ALL ON FUNCTION public.executar_vinculos_automaticos(TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.executar_vinculos_automaticos(TEXT, BOOLEAN, TEXT, TEXT) TO service_role;

-- O coordenador roda pela tela. Por padrão só simula.
CREATE OR REPLACE FUNCTION public.vincular_contratos_automaticamente(p_simular BOOLEAN DEFAULT TRUE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador roda o vínculo automático.' USING ERRCODE = '42501';
  END IF;
  RETURN public.executar_vinculos_automaticos(NULL, COALESCE(p_simular, TRUE), 'COORDENADOR', public.nome_do_usuario_logado());
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_contratos_automaticamente(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_contratos_automaticamente(BOOLEAN) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6) Desvincular: o sistema não refaz o par
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlink_contract_from_item_atomic(
  p_link_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF p_link_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ID: Identificador do vínculo não pode ser nulo.'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.arp_item_contract_links
   WHERE id = p_link_id
  RETURNING item_key, contract_key, origem INTO v_link;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Vínculo com ID "%" não encontrado.', p_link_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Quem desvincula diz que o contrato não é deste item: a automação não refaz o par, venha ele do sistema
  -- ou da equipe. "Restaurar" a sugestão no item devolve o par à automação.
  INSERT INTO public.arp_item_contract_dismissals (item_key, contract_key)
  VALUES (v_link.item_key, v_link.contract_key)
  ON CONFLICT (item_key, contract_key) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'id', p_link_id,
    'origem', v_link.origem,
    'timestamp', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_contract_from_item_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_contract_from_item_atomic(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7) Dados de teste (confirmado pelo usuário em 08/10/2026)
-- ------------------------------------------------------------------------------
DELETE FROM public.contract_ata_descartes
 WHERE (contract_key, ata_key) IN (('200331-00177-2025', '00084/2024-200331'), ('200331-00178-2025', '00044/2024-200331'));

-- Os 9 vínculos de teste são os pares que a regra produz: passam a ser do sistema.
UPDATE public.arp_item_contract_links
   SET origem = 'AUTOMATICO',
       observacoes = 'Vínculo automático: mesma compra, mesmo fornecedor e o item do contrato está nesta ata.',
       updated_at = NOW()
 WHERE origem = 'MANUAL'
   AND (item_key, contract_key) IN (
     ('00059/2025-200331-00001', '200331-00160-2026'),
     ('00059/2025-200331-00001', '200331-00077-2026'),
     ('00059/2025-200331-00001', '200331-00126-2026'),
     ('00036/2024-200331-00002', '200331-00079-2024'),
     ('00067/2025-200331-00004', '200331-00173-2026'),
     ('00024/2024-200331-00001', '200331-00086-2026'),
     ('00053/2025-200331-00010', '200331-00033-2026'),
     ('00025/2025-200331-00011', '200331-00033-2026'),
     ('00084/2024-200331-00009', '200331-00160-2025')
   );

-- ------------------------------------------------------------------------------
-- 8) Agendamento: a cada hora, depois das sincronizações de atas (:15) e itens dos contratos (:25)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('vincular-contratos-automaticamente', '55 * * * *',
      $job$SELECT public.executar_vinculos_automaticos(NULL, false, 'CRON', NULL)$job$);
  END IF;
END $$;
