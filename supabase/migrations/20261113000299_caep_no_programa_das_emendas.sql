-- =============================================================================
-- Migration 299: itens da Fiscalização dos contratos da CAEP no programa das emendas
-- =============================================================================
-- Pedido do usuário (13/11/2026): todo contrato da CAEP se liga sozinho ao programa
-- Emendas Parlamentares (MA 90) (id fixo de programa_das_emendas(), migration 297).
--
-- Onde: fisc_entregas.programa_id, a ligação que a tela Ajustes › Programas conta em
-- "Itens no programa" e a Fiscalização usa no filtro Programa. A divisão do contrato
-- pelas unidades (contrato_item_divisao_unidades.programa_id) NÃO muda: lá a parte da
-- CAEP sem programa já é a das emendas (gatilho trg_divisao_programa_trava recusa o
-- programa das emendas e a conta da Alocação depende disso).
--
-- Qual item é da CAEP:
--   * veio de pedido de emenda (origem EMENDA); ou
--   * o contrato está dividido pelas unidades e, no item (ou no contrato, quando o item
--     da Fiscalização não tem item da ata), todas as partes são da CAEP.
--   Contrato dividido entre a CAEP e outra unidade fica de fora (não há como saber de qual
--   parte é o item da planilha).
-- Nunca muda item que já está num programa nem item que alguém já incluiu ou retirou de
-- um programa à mão (há movimento PROGRAMA no histórico): a pessoa decidiu.
--
-- 1) entrega_da_caep(): a regra acima.
-- 2) ligar_entregas_da_caep(): liga e grava o movimento PROGRAMA ("automático").
-- 3) Gatilhos: item novo na Fiscalização e contrato dividido depois.
-- 4) Carga inicial.
-- =============================================================================

-- 1) Regra -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entrega_da_caep(p_contract_key TEXT, p_item_key TEXT, p_origem TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_origem = 'EMENDA'
      OR COALESCE((
           SELECT bool_and(d.unit_name = public.unidade_das_emendas())
             FROM public.contrato_item_divisao_unidades d
            WHERE d.contract_key = p_contract_key
              AND (p_item_key IS NULL OR d.item_key = p_item_key)
         ), FALSE)
$$;
REVOKE ALL ON FUNCTION public.entrega_da_caep(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entrega_da_caep(TEXT, TEXT, TEXT) TO service_role;

-- 2) Ligação -----------------------------------------------------------------------------------
-- p_contrato NULL = todos os contratos (carga inicial). Devolve quantos itens ligou.
CREATE OR REPLACE FUNCTION public.ligar_entregas_da_caep(p_contrato TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prog public.fisc_programas%ROWTYPE;
  v_n    INTEGER;
BEGIN
  SELECT * INTO v_prog FROM public.fisc_programas WHERE id = public.programa_das_emendas();
  IF NOT FOUND OR NOT v_prog.ativo THEN
    RETURN 0;
  END IF;
  WITH m AS (
    UPDATE public.fisc_entregas e
       SET programa_id = v_prog.id
     WHERE e.programa_id IS NULL
       AND (p_contrato IS NULL OR e.contract_key = p_contrato)
       AND NOT EXISTS (SELECT 1 FROM public.fisc_entrega_movimentos mv WHERE mv.entrega_id = e.id AND mv.tipo = 'PROGRAMA')
       AND public.entrega_da_caep(e.contract_key, e.item_key, e.origem)
    RETURNING e.id
  ), mov AS (
    INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, observacao, criado_por, criado_por_nome)
    SELECT id, 'PROGRAMA', format('Incluído no programa %s (automático: contrato da CAEP)', v_prog.nome), NULL, 'Sistema' FROM m
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM mov;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.ligar_entregas_da_caep(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ligar_entregas_da_caep(TEXT) TO service_role;

-- 3) Gatilhos ----------------------------------------------------------------------------------
-- Item novo na Fiscalização (pedido de emenda, carga, inclusão à mão, divisão de entrega).
-- AFTER para o movimento poder citar a entrega; a divisão de entrega (dividida_de) já copia o programa.
CREATE OR REPLACE FUNCTION public.trg_fisc_entrega_caep_programa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.programa_id IS NULL THEN
    PERFORM public.ligar_entregas_da_caep(NEW.contract_key);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_fisc_entrega_caep_programa ON public.fisc_entregas;
CREATE TRIGGER trg_fisc_entrega_caep_programa
  AFTER INSERT ON public.fisc_entregas
  FOR EACH ROW EXECUTE FUNCTION public.trg_fisc_entrega_caep_programa();

-- Contrato dividido pelas unidades depois de os itens estarem na Fiscalização.
CREATE OR REPLACE FUNCTION public.trg_divisao_caep_programa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.unit_name = public.unidade_das_emendas()
     AND EXISTS (SELECT 1 FROM public.fisc_entregas e WHERE e.contract_key = NEW.contract_key AND e.programa_id IS NULL) THEN
    PERFORM public.ligar_entregas_da_caep(NEW.contract_key);
  END IF;
  RETURN NULL;
END;
$$;
-- Adiado para o fim da transação: a divisão grava as unidades uma a uma, e o contrato só é
-- "todo da CAEP" depois da última (senão a 1ª linha, da CAEP, ligaria um contrato misto).
DROP TRIGGER IF EXISTS trg_divisao_caep_programa ON public.contrato_item_divisao_unidades;
CREATE CONSTRAINT TRIGGER trg_divisao_caep_programa
  AFTER INSERT OR UPDATE OF unit_name ON public.contrato_item_divisao_unidades
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_divisao_caep_programa();

REVOKE ALL ON FUNCTION public.trg_fisc_entrega_caep_programa() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_divisao_caep_programa() FROM PUBLIC, anon, authenticated;

-- 4) Carga inicial -----------------------------------------------------------------------------
SELECT public.ligar_entregas_da_caep(NULL);
