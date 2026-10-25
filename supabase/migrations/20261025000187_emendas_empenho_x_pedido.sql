-- ==============================================================================
-- MIGRATION 187: EMPENHADO × PEDIDO NAS EMENDAS PARLAMENTARES
-- Versão: 20261025000187_emendas_empenho_x_pedido.sql
--
-- Protótipo aprovado em 25/10/2026 ("Empenho × pedido"). Para cada emenda e item da ata, compara a soma das linhas
-- ativas dos pedidos já empenhados (EMPENHADO, CONTRATACAO) com a soma das quantidades das notas de empenho da emenda,
-- lidas no Portal da Transparência (empenho_itens_siafi, migration 121).
--
-- Notas da emenda: as ligadas às linhas (emenda_linha_notas) e as citadas no despacho de empenho do SEI do pedido,
-- só da UG 200330 com o plano interno da emenda (número da emenda ou código do autor; regra da migration 183).
-- Item da nota: número do item lido no Portal + ata do contrato da nota (arp_item_contract_links); sem contrato, a
-- ata das linhas da emenda com aquele número de item, se for uma só.
--
-- situacao:
--   IGUAL      a nota tem o mesmo que o pedido
--   A_MAIS     a nota tem mais que o pedido (certeza: outra nota só aumentaria o empenhado)
--   A_MENOS    falta quantidade e todas as notas citadas no SEI estão no sistema, lidas e com item conhecido
--   A_CONFERIR falta quantidade, mas falta nota do SEI no sistema, há nota não lida, nota por valor ou item sem ata
--   SEM_NOTA   a emenda não tem nenhuma nota no sistema (o aviso "sem nota" do pedido já cobre)
-- Nota por valor: o Portal dá a quantidade em reais (valor unitário 1 ou quantidade quebrada); não entra na soma.
--
-- O aviso é resolvido com justificativa na tabela avisos_resolvidos, tipo EMPENHO, pelo gestor de emendas ou pelo
-- coordenador (emendas.manage). A chave leva as duas quantidades: se mudarem, o aviso volta.
-- Kits: as linhas de kit ficam de fora (não há kit em produção).
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_emendas_empenho_x_pedido AS
WITH
ped AS (
  SELECT p.id, p.numero, p.siop_emenda AS emenda
    FROM public.emenda_pedidos p
   WHERE p.etapa IN ('EMPENHADO', 'CONTRATACAO') AND p.siop_emenda IS NOT NULL),
lin AS (
  SELECT ped.emenda, ped.id AS pedido_id, ped.numero, l.id AS linha_id, l.item_key, l.quantidade
    FROM ped JOIN public.emenda_pedido_linhas l ON l.pedido_id = ped.id
   WHERE NOT l.cancelada AND l.item_key IS NOT NULL),
cand AS (
  SELECT lin.emenda, n.empenho_id
    FROM lin JOIN public.emenda_linha_notas n ON n.linha_id = lin.linha_id
   WHERE n.empenho_id IS NOT NULL
  UNION
  SELECT ped.emenda, e.id
    FROM ped
    JOIN public.emenda_pedido_documentos_sei d ON d.pedido_id = ped.id
    JOIN public.empenhos e ON e.numero_oficial = d.nota_empenho AND e.uasg_emitente = '200330'
   WHERE d.etapa = 'EMPENHO' AND d.nota_empenho IS NOT NULL),
ne AS (
  SELECT DISTINCT c.emenda, e.id, e.numero_oficial, s.situacao
    FROM cand c
    JOIN public.empenhos e ON e.id = c.empenho_id
    LEFT JOIN public.empenho_leituras_siafi s ON s.empenho_id = e.id
   WHERE e.uasg_emitente = '200330'
     AND (substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') = c.emenda
          OR (substring(e.plano_interno from '20[0-9]{2}([0-9]{8})') IS NULL
              AND substring(e.plano_interno from '^SP999S?9?([0-9]{4})') = substr(c.emenda, 1, 4)))),
fora AS (
  SELECT ped.emenda, array_agg(DISTINCT d.nota_empenho ORDER BY d.nota_empenho) AS notas
    FROM ped JOIN public.emenda_pedido_documentos_sei d ON d.pedido_id = ped.id
   WHERE d.etapa = 'EMPENHO' AND d.nota_empenho IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM ne WHERE ne.emenda = ped.emenda AND ne.numero_oficial = d.nota_empenho)
   GROUP BY ped.emenda),
ctr AS (
  SELECT DISTINCT ce.empenho_id, c.item_key
    FROM public.contrato_empenhos ce
    JOIN public.arp_item_contract_links c ON c.contract_key = ce.contract_key
   WHERE ce.empenho_id IN (SELECT id FROM ne)),
it AS (
  SELECT ne.emenda, ne.id AS empenho_id, ne.numero_oficial, i.numero_item, i.quantidade,
         (i.valor_unitario = 1 OR i.quantidade <> trunc(i.quantidade)) AS por_valor
    FROM ne JOIN public.empenho_itens_siafi i ON i.empenho_id = ne.id
   WHERE ne.situacao = 'LIDA' AND i.quantidade <> 0),
mapa AS (
  SELECT it.*,
         CASE WHEN it.numero_item IS NULL THEN NULL ELSE COALESCE(
           (SELECT CASE WHEN count(*) = 1 THEN min(x.item_key) END FROM ctr x
             WHERE x.empenho_id = it.empenho_id AND split_part(x.item_key, '-', 3) ~ '^[0-9]+$'
               AND split_part(x.item_key, '-', 3)::INTEGER = it.numero_item
               AND x.item_key IN (SELECT lin.item_key FROM lin WHERE lin.emenda = it.emenda)),
           (SELECT CASE WHEN count(*) = 1 THEN min(x.item_key) END FROM ctr x
             WHERE x.empenho_id = it.empenho_id AND split_part(x.item_key, '-', 3) ~ '^[0-9]+$'
               AND split_part(x.item_key, '-', 3)::INTEGER = it.numero_item),
           (SELECT CASE WHEN count(DISTINCT lin.item_key) = 1 THEN min(lin.item_key) END FROM lin
             WHERE lin.emenda = it.emenda AND split_part(lin.item_key, '-', 3) ~ '^[0-9]+$'
               AND split_part(lin.item_key, '-', 3)::INTEGER = it.numero_item)) END AS item_key
    FROM it),
emp AS (
  SELECT emenda, item_key, sum(quantidade) AS qtd, array_agg(DISTINCT numero_oficial ORDER BY numero_oficial) AS notas
    FROM mapa WHERE item_key IS NOT NULL AND NOT por_valor
   GROUP BY emenda, item_key),
pd AS (
  SELECT emenda, item_key, sum(quantidade) AS qtd,
         array_agg(DISTINCT numero ORDER BY numero) AS pedidos, array_agg(DISTINCT pedido_id) AS pedido_ids
    FROM lin GROUP BY emenda, item_key),
comp AS (
  SELECT e.emenda,
         (SELECT array_agg(p.numero ORDER BY p.numero) FROM ped p WHERE p.emenda = e.emenda) AS pedidos_da_emenda,
         (SELECT array_agg(p.id) FROM ped p WHERE p.emenda = e.emenda) AS pedido_ids_da_emenda,
         EXISTS (SELECT 1 FROM ne WHERE ne.emenda = e.emenda) AS tem_nota,
         COALESCE((SELECT f.notas FROM fora f WHERE f.emenda = e.emenda), '{}') AS notas_fora,
         ARRAY(SELECT ne.numero_oficial FROM ne WHERE ne.emenda = e.emenda AND ne.situacao IS DISTINCT FROM 'LIDA'
                ORDER BY 1) AS notas_nao_lidas,
         ARRAY(SELECT DISTINCT m.numero_oficial FROM mapa m WHERE m.emenda = e.emenda AND m.por_valor ORDER BY 1) AS notas_por_valor,
         ARRAY(SELECT DISTINCT m.numero_oficial FROM mapa m WHERE m.emenda = e.emenda AND m.item_key IS NULL AND NOT m.por_valor
                ORDER BY 1) AS notas_com_item_sem_ata
    FROM (SELECT DISTINCT emenda FROM ped) e),
junto AS (
  SELECT COALESCE(pd.emenda, emp.emenda) AS emenda, COALESCE(pd.item_key, emp.item_key) AS item_key,
         COALESCE(pd.qtd, 0) AS qtd_pedido, COALESCE(emp.qtd, 0) AS qtd_nas_notas,
         COALESCE(emp.notas, '{}') AS notas, pd.pedidos, pd.pedido_ids
    FROM pd FULL JOIN emp ON emp.emenda = pd.emenda AND emp.item_key = pd.item_key)
SELECT j.emenda, j.item_key, j.qtd_pedido, j.qtd_nas_notas, j.notas,
       COALESCE(j.pedidos, c.pedidos_da_emenda) AS pedidos,
       COALESCE(j.pedido_ids, c.pedido_ids_da_emenda) AS pedido_ids,
       CASE WHEN j.qtd_nas_notas = j.qtd_pedido THEN 'IGUAL'
            WHEN j.qtd_nas_notas > j.qtd_pedido THEN 'A_MAIS'
            WHEN NOT c.tem_nota THEN 'SEM_NOTA'
            WHEN cardinality(c.notas_fora) > 0 OR cardinality(c.notas_nao_lidas) > 0
              OR cardinality(c.notas_por_valor) > 0 OR cardinality(c.notas_com_item_sem_ata) > 0 THEN 'A_CONFERIR'
            ELSE 'A_MENOS' END AS situacao,
       c.notas_fora, c.notas_nao_lidas, c.notas_por_valor, c.notas_com_item_sem_ata
  FROM junto j JOIN comp c ON c.emenda = j.emenda
 WHERE (SELECT public.has_permission('emendas.view'));

COMMENT ON VIEW public.v_emendas_empenho_x_pedido IS
  'Emendas: quantidade dos pedidos já empenhados × quantidade das notas da emenda lidas no Portal, por emenda e item (migration 187).';

REVOKE ALL ON public.v_emendas_empenho_x_pedido FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_emendas_empenho_x_pedido TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- Avisos resolvidos: tipo EMPENHO, pelo gestor de emendas ou pelo coordenador
-- ------------------------------------------------------------------------------
ALTER TABLE public.avisos_resolvidos DROP CONSTRAINT IF EXISTS avisos_resolvidos_tipo_check;
ALTER TABLE public.avisos_resolvidos ADD CONSTRAINT avisos_resolvidos_tipo_check
  CHECK (tipo IN ('SALDO', 'REAJUSTE', 'LEMBRETE', 'FONTE', 'EMPENHO'));

CREATE OR REPLACE FUNCTION public.resolver_aviso(p_chave text, p_tipo text, p_justificativa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_chave TEXT := btrim(COALESCE(p_chave, ''));
  v_tipo TEXT := upper(btrim(COALESCE(p_tipo, '')));
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
BEGIN
  -- Migration 187: empenhado × pedido das emendas é resolvido por quem gere as emendas.
  IF v_tipo = 'EMPENHO' THEN
    IF public.has_permission('emendas.manage') IS NOT TRUE THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador marcam este aviso como resolvido.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (public.has_role('gestor') OR public.has_role('admin') OR public.has_role('gestor_saldos')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor, coordenador ou gestor de saldo marcam aviso como resolvido.'
      USING ERRCODE = '42501';
  END IF;
  -- Migration 142: registrado acima do homologado é conferido e corrigido pelo gestor da ata.
  IF v_chave LIKE '%::REGISTRADO-ACIMA-%' AND NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Este aviso é resolvido pelo gestor da ata ou pelo coordenador.'
      USING ERRCODE = '42501';
  END IF;

  IF v_tipo NOT IN ('SALDO', 'REAJUSTE', 'LEMBRETE', 'FONTE', 'EMPENHO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Este tipo de aviso não pode ser marcado como resolvido.' USING ERRCODE = '22023';
  END IF;
  IF v_chave = '' OR length(v_chave) > 300 OR v_chave NOT LIKE v_tipo || '::%' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Aviso não identificado.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escreva a justificativa com pelo menos 10 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A justificativa pode ter no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.avisos_resolvidos (chave, tipo, justificativa, resolvido_por, resolvido_por_nome, resolvido_em)
  VALUES (v_chave, v_tipo, v_just, auth.uid(), public.nome_do_usuario_logado(), NOW())
  ON CONFLICT (chave) DO UPDATE
    SET justificativa = EXCLUDED.justificativa,
        resolvido_por = EXCLUDED.resolvido_por,
        resolvido_por_nome = EXCLUDED.resolvido_por_nome,
        resolvido_em = EXCLUDED.resolvido_em;

  RETURN jsonb_build_object('success', true, 'chave', v_chave);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reexibir_aviso(p_chave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_chave TEXT := btrim(COALESCE(p_chave, ''));
BEGIN
  IF v_chave LIKE 'EMPENHO::%' THEN
    IF public.has_permission('emendas.manage') IS NOT TRUE THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador reexibem este aviso.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (public.has_role('gestor') OR public.has_role('admin') OR public.has_role('gestor_saldos')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor, coordenador ou gestor de saldo reexibem aviso.'
      USING ERRCODE = '42501';
  END IF;
  IF v_chave LIKE '%::REGISTRADO-ACIMA-%' AND NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Este aviso é reexibido pelo gestor da ata ou pelo coordenador.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.avisos_resolvidos WHERE chave = v_chave;

  RETURN jsonb_build_object('success', true, 'chave', v_chave);
END;
$function$;
