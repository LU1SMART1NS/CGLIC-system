-- ==============================================================================
-- MIGRATION 141: FATIA DO GTI NA ATA PELO VALOR
-- Versão: 20261015000141_fatia_gti_da_ata_pelo_valor.sql
--
-- Contexto (decisão do usuário em 15/10/2026): na ata com mais de um item, a v_ata_gti_fatias somava as
-- UNIDADES registradas de todos os itens. Unidades de itens diferentes não se comparam (1 drone × 500
-- cartuchos), e o item com mais unidades decidia o interesse da ata. Medição de 15/10/2026: em 33 das 58
-- atas com mais de um item, um só item tinha metade ou mais das unidades; em 6, 80% ou mais.
--
-- Agora a fatia da ata é pelo VALOR: quantidade registrada × valor unitário do item (itens_ata), somado
-- por grupo. Os 660 itens com órgãos copiados têm valor unitário no banco (medição de 15/10/2026).
--
-- - Nova coluna `valor` no fim da view (a coluna `quantidade` continua, para quem ainda a lê).
-- - Mesmas regras de quem entra: fora a SENASP (200330/200331), a gerenciadora e as adesões; UASG sem
--   grupo confirmado entra como 'A_CONFIRMAR'.
-- - A v_item_gti_fatias (por item) não muda: dentro de um item, unidade e valor dão o mesmo percentual.
-- - Leitura e permissões iguais às da migration 139.
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_ata_gti_fatias
WITH (security_invoker = true) AS
WITH valor_do_item AS (
  SELECT x.numero_ata || '-' || x.codigo_uasg || '-'
           || lpad(regexp_replace(i.numero_item::TEXT, '\D', '', 'g'), 5, '0') AS item_key,
         max(i.valor_unitario) AS valor_unitario
    FROM public.itens_ata i
    JOIN public.atas_registro_preco x ON x.id = i.ata_id
   GROUP BY 1
),
participantes AS (
  SELECT split_part(c.item_key, '-', 1) AS numero_ata,
         split_part(c.item_key, '-', 2) AS uasg_gerenciadora,
         u->>'codigoUnidade'             AS uasg,
         CASE WHEN (u->>'quantidadeRegistrada') ~ '^[0-9]+(\.[0-9]+)?$'
              THEN (u->>'quantidadeRegistrada')::NUMERIC ELSE 0 END AS quantidade,
         COALESCE(v.valor_unitario, 0) AS valor_unitario
    FROM public.itens_ata_unidades_copia c
    LEFT JOIN valor_do_item v ON v.item_key = c.item_key,
         jsonb_array_elements(COALESCE(c.unidades, '[]'::jsonb)) u
   WHERE (u->>'codigoUnidade') ~ '^[0-9]{6}$'
     AND (u->>'codigoUnidade') NOT IN ('200330', '200331')
     AND (u->>'codigoUnidade') <> split_part(c.item_key, '-', 2)
     AND COALESCE(u->>'tipoUnidade', '') <> 'GERENCIADORA'
)
SELECT p.numero_ata,
       p.uasg_gerenciadora,
       COALESCE(g.grupo, 'A_CONFIRMAR')::VARCHAR(12) AS grupo,
       SUM(p.quantidade)                              AS quantidade,
       COUNT(DISTINCT p.uasg)::INTEGER                AS orgaos,
       SUM(p.quantidade * p.valor_unitario)           AS valor
  FROM participantes p
  LEFT JOIN public.uasgs_grupo_gti g ON g.codigo_uasg = p.uasg
 GROUP BY p.numero_ata, p.uasg_gerenciadora, COALESCE(g.grupo, 'A_CONFIRMAR');

COMMENT ON VIEW public.v_ata_gti_fatias IS
  'Por ata: quantidade registrada dos órgãos participantes e o valor dela (quantidade × valor unitário do item), somados por GTI (sem SENASP, gerenciadora e adesões). A fatia da ata é pelo valor (migration 141).';

REVOKE ALL ON public.v_ata_gti_fatias FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_ata_gti_fatias TO authenticated, service_role;
