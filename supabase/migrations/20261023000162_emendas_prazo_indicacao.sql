-- ==============================================================================
-- MIGRATION 162: EMENDAS PARLAMENTARES — PRAZO PARA RECEBER INDICAÇÃO
-- Versão: 20261023000162_emendas_prazo_indicacao.sql
--
-- Decisão de 23/10/2026: o limite não é o empenho. Depois do empenho a CCGA ainda minuta e assina o contrato, e o
-- contrato tem de ser assinado antes do fim da ata. Medição nas planilhas da CAEP (120 contratos de 2026): do
-- despacho para contratação à assinatura, mediana de 35 dias (só 27% em até 20 dias). Por isso:
--
-- - 60 dias antes do fim da ata: aviso (só nas telas, alert_settings 'emendas.avisoIndicacaoAntesDias');
-- - 35 dias antes: o sistema não aceita nova indicação com itens da ata (alert_settings
--   'emendas.corteIndicacaoAntesDias'). Os dois prazos são ajustáveis em Administração > Regras de Alertas.
--
-- A trava fica em dois gatilhos, para não reescrever as RPCs da 157:
-- 1) linha do pedido: item novo, troca de item ou de kit, ou aumento de quantidade em ata que passou do corte;
--    diminuir, tirar a linha, trocar o beneficiário e cancelar continuam livres;
-- 2) pedido: registrar o ofício (sair de Reservado ou Minuta para Ofício recebido) com linha em ata que passou do
--    corte.
-- Gravação feita fora de uma sessão de usuário (servidor, carga das planilhas) não passa pela trava: a carga
-- registra o que já aconteceu.
-- ==============================================================================

-- Corte em vigor: a sobreposição de Ajustes ou o padrão de 35 dias.
CREATE OR REPLACE FUNCTION public.emendas_corte_indicacao_dias()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT value::INTEGER FROM public.alert_settings WHERE key = 'emendas.corteIndicacaoAntesDias'), 35);
$$;
REVOKE ALL ON FUNCTION public.emendas_corte_indicacao_dias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emendas_corte_indicacao_dias() TO authenticated, service_role;

-- Recusa o item cuja ata termina dentro do corte (ou já terminou).
CREATE OR REPLACE FUNCTION public.emendas_conferir_prazo_do_item(p_item_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ata   TEXT;
  v_fim   DATE;
  v_corte INTEGER := public.emendas_corte_indicacao_dias();
  v_hoje  DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
BEGIN
  SELECT numero_ata, data_vigencia_final INTO v_ata, v_fim FROM public.v_emendas_itens_caep WHERE item_key = p_item_key;
  IF v_fim IS NOT NULL AND v_fim - v_hoje < v_corte THEN
    RAISE EXCEPTION 'PRAZO_INDICACAO: A ata % termina em % e não recebe mais indicação: o prazo acaba % dias antes do fim, para dar tempo de empenhar e assinar o contrato.',
      v_ata, to_char(v_fim, 'DD/MM/YYYY'), v_corte USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_conferir_prazo_do_item(TEXT) FROM PUBLIC, anon, authenticated;

-- 1) Linha do pedido
CREATE OR REPLACE FUNCTION public.trg_emendas_prazo_linha()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item TEXT;
BEGIN
  IF auth.uid() IS NULL OR NEW.cancelada THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NOT OLD.cancelada
     AND (OLD.tipo, OLD.item_key, OLD.kit_id, OLD.kit_composicao) IS NOT DISTINCT FROM (NEW.tipo, NEW.item_key, NEW.kit_id, NEW.kit_composicao)
     AND NEW.quantidade <= OLD.quantidade THEN
    RETURN NEW;
  END IF;
  FOR v_item IN SELECT public.emendas_itens_da_linha(NEW.tipo, NEW.item_key, NEW.kit_composicao) LOOP
    PERFORM public.emendas_conferir_prazo_do_item(v_item);
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_emendas_prazo_linha ON public.emenda_pedido_linhas;
CREATE TRIGGER trg_emendas_prazo_linha
  BEFORE INSERT OR UPDATE ON public.emenda_pedido_linhas
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_prazo_linha();

-- 2) Ofício registrado
CREATE OR REPLACE FUNCTION public.trg_emendas_prazo_oficio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item TEXT;
BEGIN
  IF auth.uid() IS NULL OR NEW.etapa <> 'OFICIO' OR OLD.etapa NOT IN ('RESERVADO', 'MINUTA') THEN
    RETURN NEW;
  END IF;
  FOR v_item IN
    SELECT DISTINCT i FROM public.emenda_pedido_linhas l, public.emendas_itens_da_linha(l.tipo, l.item_key, l.kit_composicao) i
     WHERE l.pedido_id = NEW.id AND NOT l.cancelada
  LOOP
    PERFORM public.emendas_conferir_prazo_do_item(v_item);
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_emendas_prazo_oficio ON public.emenda_pedidos;
CREATE TRIGGER trg_emendas_prazo_oficio
  BEFORE UPDATE OF etapa ON public.emenda_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_prazo_oficio();

REVOKE ALL ON FUNCTION public.trg_emendas_prazo_linha() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_emendas_prazo_oficio() FROM PUBLIC, anon, authenticated;
