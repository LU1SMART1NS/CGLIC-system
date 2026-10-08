-- ==============================================================================
-- MIGRATION 100: prever_vinculos_automaticos mais rápida
-- Versão: 20261008000100_prever_vinculos_automaticos_rapido.sql
--
-- Medição no banco real (08/10/2026, só leitura): a função da migration 95 levava ~20-23 s. Usuários
-- logados têm statement_timeout de 8 s, então a fila Vinculação › Contratos à ata perdia o motivo de cada
-- contrato manual e o botão do coordenador (vincular_contratos_automaticamente) estourava o limite.
-- O job do pg_cron não sentia (roda sem esse limite).
--
-- Causa: o planejador estima 1 linha nas CTEs e refaz duas delas em laço: `a` (atas da compra) uma vez
-- por contrato (1.102×, ~12 s) e `ga` (gestores das atas) uma vez por contrato da mesma compra (442×,
-- ~5,5 s). A correção manda calcular as duas uma vez só (MATERIALIZED). A regra, os motivos e o
-- resultado não mudam: 897 linhas idênticas antes e depois; ~0,9 s para todos os contratos, 14 ms para um.
--
-- Recria a função com o mesmo texto da migration 95, mais as duas palavras MATERIALIZED.
-- ==============================================================================

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
