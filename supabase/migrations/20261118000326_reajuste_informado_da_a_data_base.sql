-- ==============================================================================
-- Migration 326: o reajuste informado pelo gestor também dá o mês da data-base
-- ==============================================================================
-- Caso de 18/11/2026 (ata 00058/2025): a gestora registrou "fora do PNCP" o reajuste do 1º Termo Aditivo
-- (4,72491%, IPCA de 06/2025 a 05/2026, SEI 36789211). A ata não tinha data-base (sem Termo de Conformidade,
-- sem data do orçamento no edital e sem apostilamento lido do PNCP): reajuste_ciclos_ata não monta ciclo
-- nenhum sem data-base, o reajuste gravado ficou sem efeito, o item ficou SEM_BASE e a tela nunca pediu o
-- preço novo (o botão "Informar preço do apostilamento" só aparece com o item em PRECO_DESATUALIZADO).
--
-- Regra que já vale para o reajuste lido do PNCP (gravar_reajuste_fontes, migration 159): o período do índice
-- do primeiro reajuste começa no mês do Termo de Conformidade, então esse mês é a data-base
-- (termo_mes_apostilamento). Agora a regra vale para qualquer reajuste da ata, informado ou lido:
--   1) gatilho em ata_reajustes: depois de incluir, corrigir ou excluir, termo_mes_apostilamento = primeiro mês
--      do índice do reajuste com os efeitos mais antigos (sem reajuste com período, fica vazio). Só grava quando
--      muda. O dia informado no Termo de Conformidade (termo_data) continua valendo antes do mês.
--   2) Carga: as atas com reajuste registrado e sem o mês ganham o mês agora (as que já têm ficam como estão).
-- ==============================================================================

-- 1) Gatilho ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_ata_reajustes_mes_do_termo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata UUID := COALESCE(NEW.ata_id, OLD.ata_id);
  v_mes DATE;
BEGIN
  SELECT r.periodo_inicio INTO v_mes
    FROM public.ata_reajustes r
   WHERE r.ata_id = v_ata AND r.periodo_inicio IS NOT NULL
   ORDER BY r.efeito_inicio, r.periodo_inicio
   LIMIT 1;

  UPDATE public.ata_reajuste_parametros
     SET termo_mes_apostilamento = v_mes
   WHERE ata_id = v_ata
     AND termo_mes_apostilamento IS DISTINCT FROM v_mes;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_ata_reajustes_mes_do_termo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ata_reajustes_mes_do_termo ON public.ata_reajustes;
CREATE TRIGGER trg_ata_reajustes_mes_do_termo
  AFTER INSERT OR UPDATE OF periodo_inicio, efeito_inicio, ata_id OR DELETE ON public.ata_reajustes
  FOR EACH ROW EXECUTE FUNCTION public.trg_ata_reajustes_mes_do_termo();

-- 2) Carga --------------------------------------------------------------------
UPDATE public.ata_reajuste_parametros p
   SET termo_mes_apostilamento = pri.periodo_inicio
  FROM (
    SELECT DISTINCT ON (r.ata_id) r.ata_id, r.periodo_inicio
      FROM public.ata_reajustes r
     WHERE r.periodo_inicio IS NOT NULL
     ORDER BY r.ata_id, r.efeito_inicio, r.periodo_inicio
  ) pri
 WHERE pri.ata_id = p.ata_id
   AND p.termo_mes_apostilamento IS NULL;
