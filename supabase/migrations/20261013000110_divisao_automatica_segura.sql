-- ==============================================================================
-- MIGRATION 110: DIVISÃO AUTOMÁTICA DO CONTRATADO SÓ QUANDO É SEGURA
-- Versão: 20261013000110_divisao_automatica_segura.sql
--
-- Problema (13/10/2026, banco real): a divisão automática da migration 103 punha o contrato inteiro
-- numa unidade mesmo quando o gestor alocava DUAS unidades no item.
--   - save_allocations_atomic apaga as alocações do item e reinsere uma a uma; o gatilho rodava a cada
--     linha. Depois da 1ª linha o item "tinha uma unidade" e o contrato ia para ela; na 2ª, a regra
--     "várias unidades: a automática que existe fica" mantinha a escolha errada.
--   - a divisão automática não conferia se o contrato cabia no alocado da unidade.
--   Casos: item 3 da ata 00043/2026 (contrato 00297/2026 foi para CAEP com 440 alocados; o gestor
--   corrigiu à mão para DFNSP) e item 1 da ata 00059/2025 (4 contratos, 690, na DIOPI com 400 alocados
--   e a CAEP também alocada). Nenhuma nota de empenho foi ligada por causa dessas divisões.
--
-- Regra nova (decidida por ITEM, igual para todos os contratos dele):
--   - o item tem exatamente UMA unidade interna alocada; e
--   - a soma dos contratos sem divisão do gestor (quantidade usada > 0) mais o que o gestor já dividiu
--     para essa unidade cabe no alocado dela.
--   Valendo: cada contrato sem divisão do gestor vai inteiro para a unidade (AUTO).
--   Não valendo: toda divisão AUTO do item sai e o contrato fica "sem unidade" até o gestor dividir.
--   Divisão do gestor (USUARIO) nunca é tocada.
--
-- Quando roda: gatilhos de restrição adiados (DEFERRABLE INITIALLY DEFERRED), no fim da transação,
-- quando todas as alocações e vínculos já foram gravados. Cada execução lê o estado final, então a
-- ordem das linhas não muda o resultado.
--
-- Dados: recalcula todos os itens com vínculo ou divisão AUTO uma vez (desfaz as 4 do item 00059/2025).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Decisão por item
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_divisao_automatica_item(p_item_key VARCHAR)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unidades   VARCHAR(50)[];
  v_unidade    VARCHAR(50);
  v_alocado    NUMERIC(18, 4);
  v_do_gestor  NUMERIC(18, 4);
  v_sem_gestor NUMERIC(18, 4);
  v_l          RECORD;
BEGIN
  IF p_item_key IS NULL THEN
    RETURN;
  END IF;

  -- A mesma trava que save_allocations_atomic e dividir_contrato_nas_unidades usam.
  PERFORM 1 FROM public.item_allocation_state WHERE item_key = p_item_key FOR UPDATE;

  SELECT array_agg(a.unit_name ORDER BY a.unit_name) INTO v_unidades
    FROM public.arp_allocations a
   WHERE a.item_key = p_item_key
     AND EXISTS (SELECT 1 FROM public.internal_departments d WHERE d.sigla = a.unit_name);

  IF COALESCE(array_length(v_unidades, 1), 0) = 1 THEN
    v_unidade := v_unidades[1];

    SELECT a.allocated_qty INTO v_alocado
      FROM public.arp_allocations a
     WHERE a.item_key = p_item_key AND a.unit_name = v_unidade;

    SELECT COALESCE(sum(u.quantidade), 0) INTO v_do_gestor
      FROM public.contrato_item_divisao_unidades u
      JOIN public.contrato_item_divisoes d
        ON d.item_key = u.item_key AND d.contract_key = u.contract_key
     WHERE u.item_key = p_item_key AND u.unit_name = v_unidade AND d.origem = 'USUARIO';

    SELECT COALESCE(sum(COALESCE(l.quantidade_ajustada, l.quantidade_contratada_api)), 0) INTO v_sem_gestor
      FROM public.arp_item_contract_links l
      LEFT JOIN public.contrato_item_divisoes d
        ON d.item_key = l.item_key AND d.contract_key = l.contract_key
     WHERE l.item_key = p_item_key
       AND COALESCE(d.origem, 'AUTO') = 'AUTO'
       AND COALESCE(l.quantidade_ajustada, l.quantidade_contratada_api) > 0;

    IF v_do_gestor + v_sem_gestor > COALESCE(v_alocado, 0) THEN
      v_unidade := NULL; -- não cabe: o gestor decide
    END IF;
  END IF;

  -- Sai a AUTO que não vale mais: regra não vale no item, ou o contrato ficou sem quantidade.
  DELETE FROM public.contrato_item_divisoes d
   WHERE d.item_key = p_item_key
     AND d.origem = 'AUTO'
     AND (
       v_unidade IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.arp_item_contract_links l
          WHERE l.item_key = d.item_key AND l.contract_key = d.contract_key
            AND COALESCE(l.quantidade_ajustada, l.quantidade_contratada_api) > 0
       )
     );

  IF v_unidade IS NULL THEN
    RETURN;
  END IF;

  FOR v_l IN
    SELECT l.contract_key,
           COALESCE(l.quantidade_ajustada, l.quantidade_contratada_api) AS qtd,
           d.origem,
           d.quantidade_contrato
      FROM public.arp_item_contract_links l
      LEFT JOIN public.contrato_item_divisoes d
        ON d.item_key = l.item_key AND d.contract_key = l.contract_key
     WHERE l.item_key = p_item_key
       AND COALESCE(d.origem, 'AUTO') = 'AUTO'
       AND COALESCE(l.quantidade_ajustada, l.quantidade_contratada_api) > 0
  LOOP
    -- Já está certa? Não regrava (evita ruído na auditoria).
    CONTINUE WHEN v_l.origem = 'AUTO'
      AND v_l.quantidade_contrato = v_l.qtd
      AND (SELECT count(*) FROM public.contrato_item_divisao_unidades u
            WHERE u.item_key = p_item_key AND u.contract_key = v_l.contract_key) = 1
      AND EXISTS (SELECT 1 FROM public.contrato_item_divisao_unidades u
                   WHERE u.item_key = p_item_key AND u.contract_key = v_l.contract_key
                     AND u.unit_name = v_unidade AND u.quantidade = v_l.qtd);

    INSERT INTO public.contrato_item_divisoes (item_key, contract_key, origem, quantidade_contrato, dividido_em)
    VALUES (p_item_key, v_l.contract_key, 'AUTO', v_l.qtd, NOW())
    ON CONFLICT (item_key, contract_key) DO UPDATE
      SET quantidade_contrato = EXCLUDED.quantidade_contrato,
          dividido_em = NOW()
    WHERE public.contrato_item_divisoes.origem = 'AUTO';

    DELETE FROM public.contrato_item_divisao_unidades
     WHERE item_key = p_item_key AND contract_key = v_l.contract_key AND unit_name <> v_unidade;
    INSERT INTO public.contrato_item_divisao_unidades (item_key, contract_key, unit_name, quantidade)
    VALUES (p_item_key, v_l.contract_key, v_unidade, v_l.qtd)
    ON CONFLICT (item_key, contract_key, unit_name) DO UPDATE SET quantidade = EXCLUDED.quantidade;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_divisao_automatica_item(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_divisao_automatica_item(VARCHAR) TO service_role;

COMMENT ON FUNCTION public.aplicar_divisao_automatica_item(VARCHAR) IS
  'Divisão AUTO do contratado (migration 110): só quando o item tem uma unidade alocada e todos os contratos cabem no alocado dela; senão a AUTO sai. Nunca toca a divisão do gestor.';

-- ------------------------------------------------------------------------------
-- 2) Gatilhos no fim da transação
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_divisao_auto_do_vinculo ON public.arp_item_contract_links;
DROP TRIGGER IF EXISTS trg_divisao_auto_das_alocacoes ON public.arp_allocations;

CREATE OR REPLACE FUNCTION public.trg_divisao_auto_do_vinculo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.aplicar_divisao_automatica_item(OLD.item_key);
  END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.item_key IS DISTINCT FROM OLD.item_key) THEN
    PERFORM public.aplicar_divisao_automatica_item(NEW.item_key);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_divisao_auto_das_alocacoes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.aplicar_divisao_automatica_item(OLD.item_key);
  END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.item_key IS DISTINCT FROM OLD.item_key) THEN
    PERFORM public.aplicar_divisao_automatica_item(NEW.item_key);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_divisao_auto_do_vinculo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_divisao_auto_das_alocacoes() FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER trg_divisao_auto_do_vinculo
  AFTER INSERT OR DELETE OR UPDATE OF item_key, quantidade_contratada_api, quantidade_ajustada
  ON public.arp_item_contract_links
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_divisao_auto_do_vinculo();

CREATE CONSTRAINT TRIGGER trg_divisao_auto_das_alocacoes
  AFTER INSERT OR DELETE OR UPDATE OF item_key, unit_name, allocated_qty
  ON public.arp_allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_divisao_auto_das_alocacoes();

-- ------------------------------------------------------------------------------
-- 3) Desfazer a divisão do gestor usa a regra nova
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desfazer_divisao_contrato_unidades(p_item_key VARCHAR, p_contract_key VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := btrim(COALESCE(p_item_key, ''));
  v_contract_key VARCHAR(150) := btrim(COALESCE(p_contract_key, ''));
  v_n INTEGER;
BEGIN
  IF NOT public.has_permission('allocations.link_empenho') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor e o coordenador dividem o contrato entre as unidades internas.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.contrato_item_divisoes
   WHERE item_key = v_item_key AND contract_key = v_contract_key;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'NOT_FOUND: Este contrato não está dividido entre unidades neste item.'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.aplicar_divisao_automatica_item(v_item_key);

  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'contract_key', v_contract_key,
    'automatica', EXISTS (SELECT 1 FROM public.contrato_item_divisoes
                           WHERE item_key = v_item_key AND contract_key = v_contract_key)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.desfazer_divisao_contrato_unidades(VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_divisao_contrato_unidades(VARCHAR, VARCHAR) TO authenticated, service_role;

-- A função antiga (decisão por contrato) sai: ninguém mais a chama.
DROP FUNCTION IF EXISTS public.aplicar_divisao_automatica_contrato_item(VARCHAR, VARCHAR);

COMMENT ON TABLE public.contrato_item_divisoes IS
  'Divisão do contratado de um contrato, num item da ata, entre as unidades internas. AUTO = item com uma unidade alocada e contratos que cabem no alocado dela (migration 110); USUARIO = repartida pelo gestor.';

-- ------------------------------------------------------------------------------
-- 4) Recalcula uma vez (desfaz as divisões AUTO erradas)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_item VARCHAR(100);
BEGIN
  FOR v_item IN
    SELECT item_key FROM public.arp_item_contract_links
    UNION
    SELECT item_key FROM public.contrato_item_divisoes WHERE origem = 'AUTO'
  LOOP
    PERFORM public.aplicar_divisao_automatica_item(v_item);
  END LOOP;
END $$;
