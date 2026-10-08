-- ==============================================================================
-- MIGRATION 102: A BASE SENASP DO ITEM ACOMPANHA A CÓPIA DOS ÓRGÃOS
-- Versão: 20261008000102_base_senasp_acompanha_copia_orgaos.sql
--
-- Problema (08/10/2026): itens_ata.quantidade_senasp foi lido uma vez (551 itens em 02/10/2026) e o
-- servidor só preenche quando está vazio. Os remanejamentos de 05/10/2026 no Compras.gov.br aumentaram a
-- cota da SENASP em vários itens, mas a base do saldo (v_arp_item_saldo_detalhado) ficou com o número
-- antigo. Resultado: a Visão Geral e a aba Itens da ata alertavam "consumido" (ex.: 00102/2024 item 1,
-- 765 no banco × 1.380 no Compras.gov.br = 106,8% em vez de 59%), enquanto a tela do Item, que soma os
-- órgãos atuais, mostrava o saldo certo.
--
-- Correção: sempre que a cópia dos órgãos do item (itens_ata_unidades_copia, migration 91) recebe uma
-- lista nova, o quantitativo SENASP do item passa a ser a soma do registrado das unidades SENASP dessa
-- lista — mesma regra da tela do Item (src/utils/quantitativoSenasp.ts): a gerenciadora, as UASGs do
-- CGLIC (200330/200331) e a UASG da ata. Sem nenhuma unidade SENASP na lista, a base não é tocada.
--
-- 1) senasp_das_unidades: a soma (NULL quando a lista não tem unidade SENASP).
-- 2) Gatilho na cópia: a cada lista gravada, atualiza itens_ata.quantidade_senasp (só se mudou).
-- 3) Acerto único dos itens que já têm cópia.
-- Nada muda em quem lê: a view continua usando quantidade_senasp.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Soma do registrado das unidades SENASP de uma lista de órgãos do item
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
  WHERE jsonb_typeof(u) = 'object'
    AND (
      u->>'tipoUnidade' = 'GERENCIADORA'
      OR regexp_replace(COALESCE(u->>'codigoUnidade', ''), '\D', '', 'g') IN ('200330', '200331')
      OR (regexp_replace(COALESCE(p_uasg_ata, ''), '\D', '', 'g') <> ''
          AND regexp_replace(COALESCE(u->>'codigoUnidade', ''), '\D', '', 'g') = regexp_replace(p_uasg_ata, '\D', '', 'g'))
    );
$$;

COMMENT ON FUNCTION public.senasp_das_unidades(JSONB, TEXT) IS
  'Quantitativo SENASP de um item a partir da lista de órgãos do Compras.gov.br: soma do quantidadeRegistrada da gerenciadora, das UASGs 200330/200331 e da UASG da ata. NULL quando a lista não tem nenhuma delas.';

REVOKE ALL ON FUNCTION public.senasp_das_unidades(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.senasp_das_unidades(JSONB, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2) Gatilho: lista nova na cópia → base SENASP do item atualizada
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_base_senasp_da_copia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.unidades IS NULL OR jsonb_typeof(NEW.unidades) <> 'array' OR jsonb_array_length(NEW.unidades) = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.itens_ata i
     SET quantidade_senasp = x.qtd,
         quantidade_senasp_lida_em = COALESCE(NEW.copiado_em, NOW())
    FROM public.atas_registro_preco a
    CROSS JOIN LATERAL (SELECT public.senasp_das_unidades(NEW.unidades, a.codigo_uasg) AS qtd) x
   WHERE a.id = i.ata_id
     AND (a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item::TEXT, 5, '0')) = NEW.item_key
     AND x.qtd IS NOT NULL
     AND i.quantidade_senasp IS DISTINCT FROM x.qtd;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_base_senasp_da_copia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_base_senasp_da_copia ON public.itens_ata_unidades_copia;
CREATE TRIGGER trg_base_senasp_da_copia
  AFTER INSERT OR UPDATE OF unidades ON public.itens_ata_unidades_copia
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_base_senasp_da_copia();

-- ------------------------------------------------------------------------------
-- 3) Acerto único: itens que já têm a cópia dos órgãos
-- ------------------------------------------------------------------------------
UPDATE public.itens_ata i
   SET quantidade_senasp = x.qtd,
       quantidade_senasp_lida_em = c.copiado_em
  FROM public.atas_registro_preco a
  JOIN public.itens_ata_unidades_copia c ON TRUE
  CROSS JOIN LATERAL (SELECT public.senasp_das_unidades(c.unidades, a.codigo_uasg) AS qtd) x
 WHERE a.id = i.ata_id
   AND c.item_key = (a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item::TEXT, 5, '0'))
   AND c.copiado_em IS NOT NULL
   AND x.qtd IS NOT NULL
   AND i.quantidade_senasp IS DISTINCT FROM x.qtd;
