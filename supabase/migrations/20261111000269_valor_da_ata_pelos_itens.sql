-- ==============================================================================
-- Versão: 20261111000269_valor_da_ata_pelos_itens.sql
-- O valor da ata (atas_registro_preco.valor_total) passa a ter uma regra só, calculada pelos itens.
--
-- Antes, três gravadores disputavam a coluna:
--   - a sincronização das atas (src/services/dbCacheService.ts), a cada hora, gravava o total da fonte;
--   - informar_preco_apostilamento (247) e aplicar_preco_do_termo (258) gravavam a soma da parte da SENASP,
--     também nas atas da CGLIC;
--   - espelhar_participacao_na_carteira (114/145) gravava a parte da SENASP nas atas de participação e adesão.
-- Resultado: a ata da CGLIC ficava com a parte da SENASP por até 1 h depois de cada apostilamento, e depois
-- voltava ao total da fonte, pelo preço antigo, diferente da soma dos itens já apostilados.
--
-- Regra (decisão do usuário, 11/11/2026; estudo docs/estudos/auditoria-duplicacao-modulos.md, achado 1.1):
--   - ata da CGLIC (papel GERENCIADORA): soma de quantidade homologada × preço vigente de cada item
--     (o apostilado, quando houver: o gatilho trg_itens_ata_preco_apostilado já mantém esse preço no item);
--   - ata de participação ou adesão: soma da parte da SENASP × preço vigente (como já era desde a 114);
--   - ata ainda sem itens no banco: fica o valor que veio da fonte.
--
-- 1) valor_da_ata(ata, papel): a regra.
-- 2) Gatilho BEFORE na ata: qualquer gravação do valor (sincronização, funções antigas) vira o valor da regra.
-- 3) Gatilho AFTER nos itens: mudou preço, quantidade ou item, a ata é recalculada (só se o valor mudar).
-- 4) Recalcula as atas de hoje.
-- As três funções antigas continuam com o UPDATE do valor; ele fica inofensivo (o gatilho 2 corrige).
-- ==============================================================================

-- 1) A regra ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.valor_da_ata(p_ata_id UUID, p_papel TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN count(*) = 0 THEN NULL
         ELSE COALESCE(sum(
                COALESCE(CASE WHEN p_papel IN ('PARTICIPANTE', 'ADESAO') THEN i.quantidade_senasp
                              ELSE i.quantidade_homologada END, 0)
                * COALESCE(i.valor_unitario, 0)), 0)
         END
    FROM public.itens_ata i
   WHERE i.ata_id = p_ata_id;
$$;
COMMENT ON FUNCTION public.valor_da_ata(UUID, TEXT) IS
  'Valor da ata pelos itens: CGLIC = homologada × preço vigente; participação/adesão = parte da SENASP × preço. NULL sem itens.';
REVOKE ALL ON FUNCTION public.valor_da_ata(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valor_da_ata(UUID, TEXT) TO authenticated, service_role;

-- 2) Na ata: o valor gravado vira o da regra ----------------------------------------------------------------------
-- Nome depois de trg_ata_carteira_padrao (mesmo momento, ordem alfabética): o papel já está definido aqui.
CREATE OR REPLACE FUNCTION public.trg_ata_valor_pelos_itens()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.valor_total := COALESCE(public.valor_da_ata(NEW.id, NEW.papel_senasp), NEW.valor_total);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_ata_valor_pelos_itens() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ata_valor_pelos_itens ON public.atas_registro_preco;
CREATE TRIGGER trg_ata_valor_pelos_itens
  BEFORE INSERT OR UPDATE OF valor_total, papel_senasp ON public.atas_registro_preco
  FOR EACH ROW EXECUTE FUNCTION public.trg_ata_valor_pelos_itens();

-- 3) Nos itens: recalcula a ata --------------------------------------------------------------------------------
-- SECURITY DEFINER: quem muda o item (servidor ou função do gestor) pode não ter UPDATE direto na ata.
CREATE OR REPLACE FUNCTION public.trg_itens_ata_recalcula_valor_da_ata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata UUID;
BEGIN
  FOR v_ata IN
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.ata_id END,
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.ata_id END]) x
     WHERE x IS NOT NULL
  LOOP
    UPDATE public.atas_registro_preco a
       SET valor_total = COALESCE(public.valor_da_ata(a.id, a.papel_senasp), a.valor_total)
     WHERE a.id = v_ata
       AND a.valor_total IS DISTINCT FROM COALESCE(public.valor_da_ata(a.id, a.papel_senasp), a.valor_total);
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_itens_ata_recalcula_valor_da_ata() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_itens_ata_recalcula_valor_da_ata ON public.itens_ata;
CREATE TRIGGER trg_itens_ata_recalcula_valor_da_ata
  AFTER INSERT OR DELETE OR UPDATE OF ata_id, valor_unitario, quantidade_homologada, quantidade_senasp ON public.itens_ata
  FOR EACH ROW EXECUTE FUNCTION public.trg_itens_ata_recalcula_valor_da_ata();

-- 4) As atas de hoje ---------------------------------------------------------------------------------------------
UPDATE public.atas_registro_preco a
   SET valor_total = public.valor_da_ata(a.id, a.papel_senasp)
 WHERE public.valor_da_ata(a.id, a.papel_senasp) IS NOT NULL
   AND a.valor_total IS DISTINCT FROM public.valor_da_ata(a.id, a.papel_senasp);
