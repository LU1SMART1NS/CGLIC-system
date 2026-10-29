-- ==============================================================================
-- MIGRATION 246: EMENDAS PARLAMENTARES — MINUTA PELO PREÇO DE HOJE
-- Versão: 20261029000246_emendas_minuta_preco_de_hoje.sql
--
-- Decisão de 29/10/2026 (protótipo aprovado): o ofício do parlamentar traz o preço de hoje da ata, centavo a centavo, e
-- é esse o valor empenhado. Sai a projeção do reajuste (migration 165 e folga de Ajustes). Para o preço não mudar antes
-- do contrato assinado:
--
-- 1) Data do reajuste de cada item da CAEP (emendas_reajuste_dos_itens): o próximo reajuste da ata (migration 158);
--    sem data-base, o fim da vigência, porque a CGLIC reajusta na prorrogação; reajuste devido e não aplicado bloqueia
--    o item até o apostilamento (o preço do banco ainda é o antigo).
-- 2) Reserva: o item sai a 60 dias do reajuste (alert_settings 'emendas.corteReajusteAntesDias'), no mesmo gatilho do
--    prazo de indicação (migration 162).
-- 3) Minuta: não sai com item a menos de 45 dias do reajuste ('emendas.tramiteAteContratoDias', o tempo medido do ofício
--    ao contrato assinado) nem com reajuste devido. Grava minuta_valida_ate: o menor entre 5 dias úteis da minuta
--    ('emendas.validadeMinutaDiasUteis') e a data do reajuste menos os 45 dias.
-- 4) Conferência: ofício recebido depois de minuta_valida_ate ou item com preço diferente do gravado na minuta não
--    conferem; o pedido volta para nova minuta com o preço do dia.
-- 5) Prazo de indicação da ata passa de 35 para 60 dias (P1: 35 é menos que os 45 dias até o contrato); o aviso, de 60
--    para 90 dias, para continuar antes do corte.
-- Gravação fora de uma sessão de usuário (servidor, cargas) não passa pelas travas, como na migration 162.
-- ==============================================================================

-- 0) Prazos em vigor: a sobreposição de Ajustes ou o padrão ------------------------------------------------
CREATE OR REPLACE FUNCTION public.emendas_corte_indicacao_dias()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT value::INTEGER FROM public.alert_settings WHERE key = 'emendas.corteIndicacaoAntesDias'), 60);
$$;

CREATE OR REPLACE FUNCTION public.emendas_corte_reajuste_dias()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT value::INTEGER FROM public.alert_settings WHERE key = 'emendas.corteReajusteAntesDias'), 60);
$$;

CREATE OR REPLACE FUNCTION public.emendas_tramite_contrato_dias()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT value::INTEGER FROM public.alert_settings WHERE key = 'emendas.tramiteAteContratoDias'), 45);
$$;

CREATE OR REPLACE FUNCTION public.emendas_validade_minuta_dias_uteis()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT value::INTEGER FROM public.alert_settings WHERE key = 'emendas.validadeMinutaDiasUteis'), 5);
$$;

REVOKE ALL ON FUNCTION public.emendas_corte_reajuste_dias() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.emendas_tramite_contrato_dias() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.emendas_validade_minuta_dias_uteis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emendas_corte_reajuste_dias() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.emendas_tramite_contrato_dias() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.emendas_validade_minuta_dias_uteis() TO authenticated, service_role;

-- A folga do preço previsto saiu com a projeção.
DELETE FROM public.alert_settings WHERE key = 'emendas.folgaReajustePct';

-- 1) Data do reajuste de cada item da CAEP ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emendas_reajuste_dos_itens(p_item_key TEXT DEFAULT NULL)
RETURNS TABLE (
  item_key      TEXT,
  preco_atual   NUMERIC,
  data_reajuste DATE,
  origem        TEXT,
  devido        BOOLEAN,
  preco_devido  NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH itens AS (
    SELECT c.item_key, c.numero_item, c.valor_unitario, c.data_vigencia_final::DATE AS fim, a.id AS ata_id
      FROM public.v_emendas_itens_caep c
      JOIN public.atas_registro_preco a ON a.numero_ata = c.numero_ata AND a.codigo_uasg = c.codigo_uasg
     WHERE NOT c.ata_encerrada
       AND (p_item_key IS NULL OR c.item_key = p_item_key)
  ), r AS (
    SELECT x.*
      FROM (SELECT DISTINCT ata_id FROM itens) t
      CROSS JOIN LATERAL public.reajuste_itens_ata(t.ata_id, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE) x
  ), j AS (
    SELECT i.*, r.situacao_item, r.proximo_efeito, r.proximo_situacao, r.preco_devido AS devido_calc,
           COALESCE(r.situacao_item IN ('DEVIDO', 'PRECO_DESATUALIZADO'), FALSE) AS eh_devido,
           (r.situacao_item IS NULL OR r.situacao_item IN ('SEM_BASE', 'PERCENTUAL_A_INFORMAR', 'INDICE_INDISPONIVEL')) AS sem_base
      FROM itens i
      LEFT JOIN r ON r.ata_id = i.ata_id AND lpad(r.numero_item, 5, '0') = lpad(i.numero_item, 5, '0')
  )
  SELECT j.item_key::TEXT,
         j.valor_unitario,
         CASE
           WHEN j.eh_devido THEN NULL
           WHEN j.proximo_efeito IS NOT NULL THEN j.proximo_efeito
           WHEN j.sem_base THEN j.fim
         END,
         CASE
           WHEN j.eh_devido THEN 'DEVIDO'
           WHEN j.proximo_efeito IS NOT NULL AND j.proximo_situacao = 'SE_PRORROGAR' THEN 'PRORROGACAO'
           WHEN j.proximo_efeito IS NOT NULL THEN 'REAJUSTE'
           WHEN j.sem_base AND j.fim IS NOT NULL THEN 'FIM_DA_VIGENCIA'
         END,
         j.eh_devido,
         CASE WHEN j.eh_devido THEN round(GREATEST(j.devido_calc, j.valor_unitario), 2) END
    FROM j;
$$;

COMMENT ON FUNCTION public.emendas_reajuste_dos_itens(TEXT) IS
  'Preço de hoje e data do próximo reajuste de cada item da CAEP em ata vigente (migration 246). origem: REAJUSTE | PRORROGACAO | FIM_DA_VIGENCIA (sem data-base) | DEVIDO (reajuste devido e não aplicado: item bloqueado) | NULL (sem reajuste na vigência).';
REVOKE ALL ON FUNCTION public.emendas_reajuste_dos_itens(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emendas_reajuste_dos_itens(TEXT) TO authenticated, service_role;

-- Recusa o item com reajuste devido ou a menos de p_dias do reajuste. p_onde muda só o texto.
CREATE OR REPLACE FUNCTION public.emendas_conferir_reajuste_do_item(p_item_key TEXT, p_dias INTEGER, p_hoje DATE, p_onde TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_r      RECORD;
  v_ata    TEXT := split_part(p_item_key, '-', 1);
  v_quando TEXT;
BEGIN
  SELECT * INTO v_r FROM public.emendas_reajuste_dos_itens(p_item_key) LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_r.devido THEN
    RAISE EXCEPTION 'REAJUSTE_DEVIDO: A ata % tem reajuste devido e ainda não aplicado: o preço de hoje não é o que será empenhado. O item volta quando o apostilamento for lido.',
      v_ata USING ERRCODE = '22023';
  END IF;
  IF v_r.data_reajuste IS NOT NULL AND v_r.data_reajuste - p_hoje < p_dias THEN
    v_quando := CASE WHEN v_r.origem = 'FIM_DA_VIGENCIA' THEN 'não tem data-base de reajuste e termina em ' ELSE 'reajusta em ' END
                || to_char(v_r.data_reajuste, 'DD/MM/YYYY');
    IF p_onde = 'MINUTA' THEN
      RAISE EXCEPTION 'PRAZO_REAJUSTE: A ata % %: faltam menos de % dias, o tempo até o contrato assinado. Troque ou retire o item, ou espere o apostilamento.',
        v_ata, v_quando, p_dias USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'PRAZO_REAJUSTE: A ata % %: o item sai da reserva % dias antes, para o contrato ser assinado pelo preço de hoje.',
      v_ata, v_quando, p_dias USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_conferir_reajuste_do_item(TEXT, INTEGER, DATE, TEXT) FROM PUBLIC, anon, authenticated;

-- 2) Reserva: o gatilho da linha (migration 162) confere também o reajuste --------------------------------
CREATE OR REPLACE FUNCTION public.trg_emendas_prazo_linha()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item  TEXT;
  v_corte INTEGER := public.emendas_corte_reajuste_dias();
  v_hoje  DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
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
    PERFORM public.emendas_conferir_reajuste_do_item(v_item, v_corte, v_hoje, 'RESERVA');
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emendas_prazo_linha() FROM PUBLIC, anon, authenticated;

-- 3) Minuta: trava e validade ---------------------------------------------------------------------------
ALTER TABLE public.emenda_pedidos ADD COLUMN IF NOT EXISTS minuta_valida_ate DATE;
COMMENT ON COLUMN public.emenda_pedidos.minuta_valida_ate IS
  'Último dia para o ofício chegar: o menor entre os dias úteis de validade da minuta e a data do reajuste menos o tempo até o contrato (migration 246).';

CREATE OR REPLACE FUNCTION public.trg_emendas_minuta_reajuste()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item     TEXT;
  v_tramite  INTEGER := public.emendas_tramite_contrato_dias();
  v_validade DATE;
  v_reajuste DATE;
BEGIN
  IF NEW.minuta_em IS NULL OR NEW.etapa <> 'MINUTA' THEN
    IF NEW.minuta_em IS NULL THEN
      NEW.minuta_valida_ate := NULL;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.etapa = 'MINUTA' AND OLD.minuta_em IS NOT DISTINCT FROM NEW.minuta_em THEN
    RETURN NEW;
  END IF;
  v_validade := public.somar_dias_uteis(NEW.minuta_em, public.emendas_validade_minuta_dias_uteis());
  FOR v_item IN
    SELECT DISTINCT i FROM public.emenda_pedido_linhas l, public.emendas_itens_da_linha(l.tipo, l.item_key, l.kit_composicao) i
     WHERE l.pedido_id = NEW.id AND NOT l.cancelada
  LOOP
    IF auth.uid() IS NOT NULL THEN
      PERFORM public.emendas_conferir_reajuste_do_item(v_item, v_tramite, NEW.minuta_em, 'MINUTA');
    END IF;
    SELECT data_reajuste INTO v_reajuste FROM public.emendas_reajuste_dos_itens(v_item) LIMIT 1;
    IF v_reajuste IS NOT NULL THEN
      v_validade := LEAST(v_validade, v_reajuste - v_tramite);
    END IF;
  END LOOP;
  NEW.minuta_valida_ate := v_validade;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emendas_minuta_reajuste() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_emendas_minuta_reajuste ON public.emenda_pedidos;
CREATE TRIGGER trg_emendas_minuta_reajuste
  BEFORE UPDATE OF etapa, minuta_em ON public.emenda_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_minuta_reajuste();

-- 4) Conferência: ofício no prazo e preço igual ao da minuta ------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_emendas_conferencia_preco()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mudou TEXT;
BEGIN
  IF auth.uid() IS NULL OR NEW.etapa <> 'CONFERIDO' OR OLD.etapa <> 'OFICIO' THEN
    RETURN NEW;
  END IF;
  IF NEW.minuta_valida_ate IS NOT NULL AND NEW.oficio_em IS NOT NULL AND NEW.oficio_em > NEW.minuta_valida_ate THEN
    RAISE EXCEPTION 'PRAZO_DO_OFICIO: O ofício chegou em %, depois do prazo de %. Gere uma nova minuta com o preço do dia.',
      to_char(NEW.oficio_em, 'DD/MM/YYYY'), to_char(NEW.minuta_valida_ate, 'DD/MM/YYYY') USING ERRCODE = '22023';
  END IF;
  IF NEW.minuta_precos IS NOT NULL THEN
    SELECT string_agg(DISTINCT split_part(c.item_key, '-', 1), ', ') INTO v_mudou
      FROM public.emenda_pedido_linhas l
      CROSS JOIN LATERAL public.emendas_itens_da_linha(l.tipo, l.item_key, l.kit_composicao) k
      JOIN public.v_emendas_itens_caep c ON c.item_key = k
     WHERE l.pedido_id = NEW.id AND NOT l.cancelada
       AND NEW.minuta_precos ? k
       AND round((NEW.minuta_precos->>k)::NUMERIC, 2) <> round(c.valor_unitario, 2);
    IF v_mudou IS NOT NULL THEN
      RAISE EXCEPTION 'PRECO_MUDOU: O preço mudou depois da minuta (ata %). Gere uma nova minuta com o preço do dia.', v_mudou USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emendas_conferencia_preco() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_emendas_conferencia_preco ON public.emenda_pedidos;
CREATE TRIGGER trg_emendas_conferencia_preco
  BEFORE UPDATE OF etapa ON public.emenda_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_conferencia_preco();
