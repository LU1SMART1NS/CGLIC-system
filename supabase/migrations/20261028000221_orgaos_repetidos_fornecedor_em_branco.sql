-- ==============================================================================
-- Versão: 20261028000221_orgaos_repetidos_fornecedor_em_branco.sql
-- Desde 24/10/2026 o Compras.gov.br devolve, no item 00055/2025 da 200331 (item 1), cada órgão duas vezes: uma com
-- o fornecedor (TELEDYNE FLIR) e outra com o fornecedor em branco (" - "), com a mesma quantidade e as mesmas
-- datas. A chave da migration 143 inclui o fornecedor (item com dois fornecedores soma de verdade), então as duas
-- linhas somavam: SENASP 306 → 612, soma 389 → 777 e aviso "registrado acima do homologado" falso (excedente 388).
--
-- 1) registrado_por_uasg: a linha em branco igual à de um fornecedor com nome sai (só ela: quantidade ou datas
--    diferentes continuam somando).
-- 2) senasp_das_unidades (base SENASP gravada em itens_ata.quantidade_senasp) passa a usar a mesma conta.
-- 3) v_item_registrado_acima soma o registrado já sem repetição (coluna registrado da cópia, migration 146), em
--    vez de somar o JSON cru.
-- 4) Recalcula as cópias gravadas (os gatilhos refazem registrado e quantidade_senasp) e apaga as 25 linhas
--    falsas do histórico que a repetição criou em 24/10/2026 (cada órgão "dobrou").
-- Definições geradas a partir da produção; mesmas assinaturas (CREATE OR REPLACE mantém permissões).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.registrado_por_uasg(p_unidades jsonb)
 RETURNS TABLE(uasg character varying, nome_orgao text, tipo_unidade text, quantidade numeric, incluido_em timestamp without time zone, atualizado_em timestamp without time zone)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT x.uasg::VARCHAR,
         max(x.nome) AS nome_orgao,
         max(x.tipo) AS tipo_unidade,
         sum(x.qtd) AS quantidade,
         min(x.inc) AS incluido_em,
         max(x.atu) AS atualizado_em
    FROM (
      -- Migration 143: DISTINCT tira linhas iguais repetidas pela fonte (o mesmo órgão, fornecedor, quantidade
      -- e datas); linhas de fornecedores diferentes continuam somando.
      -- Migration 221: a linha com o fornecedor em branco (" - ") igual à de um fornecedor com nome (mesmo órgão,
      -- quantidade e datas) ganha o nome dele e o DISTINCT a tira (00055/2025 da 200331, item 1, desde 24/10/2026).
      SELECT DISTINCT
             y.uasg,
             COALESCE(y.fornecedor, max(y.fornecedor) OVER (PARTITION BY y.uasg, y.qtd, y.inc, y.atu)) AS fornecedor,
             y.nome, y.tipo, y.qtd, y.inc, y.atu
        FROM (
      SELECT
             regexp_replace(COALESCE(u->>'codigoUnidade', ''), '\D', '', 'g') AS uasg,
             NULLIF(CASE WHEN btrim(COALESCE(u->>'fornecedor', '')) ~ '[0-9A-Za-z]' THEN btrim(u->>'fornecedor') END, '') AS fornecedor,
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
        ) y
    ) x
   WHERE x.uasg ~ '^[0-9]{6}$'
   GROUP BY x.uasg;
$function$;

CREATE OR REPLACE FUNCTION public.senasp_das_unidades(p_unidades jsonb, p_uasg_ata text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Migration 221: a mesma conta sem repetição de registrado_por_uasg.
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE COALESCE(sum(r.quantidade), 0) END
  FROM public.registrado_por_uasg(p_unidades) r
  CROSS JOIN (SELECT regexp_replace(COALESCE(p_uasg_ata, ''), '\D', '', 'g') AS uasg) a
  WHERE r.uasg IN ('200330', '200331')
     -- Ata gerenciada pela CGLIC (ou sem UASG informada): a gerenciadora é a própria SENASP.
     OR ((a.uasg = '' OR a.uasg IN ('200330', '200331'))
         AND (r.tipo_unidade = 'GERENCIADORA' OR (a.uasg <> '' AND r.uasg = a.uasg)));
$function$;

CREATE OR REPLACE VIEW public.v_item_registrado_acima
WITH (security_invoker = true)
AS
 WITH itens AS (
         SELECT (((a.numero_ata::text || '-'::text) || a.codigo_uasg::text) || '-'::text) || lpad(i.numero_item::text, 5, '0'::text) AS item_key,
            a.numero_ata,
            a.codigo_uasg,
            i.numero_item,
                CASE
                    WHEN btrim(i.numero_item::text) ~ '^\d+$'::text THEN btrim(i.numero_item::text)::bigint::text
                    ELSE btrim(i.numero_item::text)
                END AS item_canonico,
            COALESCE(i.quantidade_homologada, 0::numeric) AS homologado,
            COALESCE(i.quantidade_senasp, i.quantidade_homologada, 0::numeric) AS registrado_senasp
           FROM itens_ata i
             JOIN atas_registro_preco a ON a.id = i.ata_id
          WHERE a.codigo_uasg::text = ANY (ARRAY['200330'::text, '200331'::text])
        ), fim AS (
         SELECT it.item_key,
            it.numero_ata,
            it.codigo_uasg,
            it.numero_item,
            it.item_canonico,
            it.homologado,
            it.registrado_senasp,
            s.soma_registrado + COALESCE(np.refletido, 0::numeric) AS soma_registrado,
            s.soma_registrado + COALESCE(np.refletido, 0::numeric) - it.homologado AS excedente,
            (((((((('SALDO::'::text || it.numero_ata::text) || '-'::text) || it.codigo_uasg::text) || '::'::text) || it.item_canonico) || '::REGISTRADO-ACIMA-'::text) || round(s.soma_registrado + COALESCE(np.refletido, 0::numeric), 2)::text) || '-'::text) || round(it.homologado, 2)::text AS chave_aviso
           FROM itens it
             CROSS JOIN LATERAL ( SELECT sum((r.value ->> 'quantidade'::text)::numeric) AS soma_registrado
                   FROM itens_ata_unidades_copia c
                     CROSS JOIN LATERAL jsonb_array_elements(c.registrado) r(value)
                  WHERE c.item_key::text = it.item_key) s
             LEFT JOIN LATERAL ( SELECT sum(LEAST(o.total, GREATEST(o.primeiro - COALESCE(( SELECT sum((r.value ->> 'quantidade'::text)::numeric)
                           FROM itens_ata_unidades_copia c
                             CROSS JOIN LATERAL jsonb_array_elements(c.registrado) r(value)
                          WHERE c.item_key::text = it.item_key AND (r.value ->> 'uasg'::text) = o.uasg_origem::text), 0::numeric), 0::numeric))) AS refletido
                   FROM ( SELECT r_1.uasg_origem,
                            sum(r_1.quantidade) AS total,
                            (array_agg(r_1.registrado_origem ORDER BY r_1.registrado_em))[1] AS primeiro
                           FROM ata_item_remanejamentos_nao_participante r_1
                          WHERE r_1.item_key::text = it.item_key AND r_1.desfeito_em IS NULL
                          GROUP BY r_1.uasg_origem) o) np ON true
          WHERE it.homologado > 0::numeric AND (s.soma_registrado + COALESCE(np.refletido, 0::numeric) - it.homologado) >= 0.01
        )
 SELECT f.item_key,
    f.numero_ata,
    f.codigo_uasg,
    f.numero_item,
    f.homologado,
    f.soma_registrado,
    f.excedente,
    f.registrado_senasp,
    f.chave_aviso,
    r.resolvido_em,
    r.resolvido_por_nome,
    r.justificativa AS resolvido_justificativa
   FROM fim f
     LEFT JOIN avisos_resolvidos r ON r.chave::text = f.chave_aviso;

-- Recalcula as cópias: só as que mudam com a regra nova (os gatilhos refazem registrado e quantidade_senasp).
UPDATE public.itens_ata_unidades_copia c
   SET unidades = c.unidades
 WHERE c.registrado IS DISTINCT FROM COALESCE(
         (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.uasg) FROM public.registrado_por_uasg(c.unidades) r), '[]'::jsonb);

-- Histórico falso da repetição (lido em 24/10/2026 23:43, cada órgão de x para 2x).
DELETE FROM public.itens_ata_unidades_historico h
 WHERE h.item_key = '00055/2025-200331-00001'
   AND h.lido_em >= '2026-10-24 23:43:00+00' AND h.lido_em < '2026-10-24 23:44:00+00'
   AND h.quantidade_nova = 2 * h.quantidade_anterior;
