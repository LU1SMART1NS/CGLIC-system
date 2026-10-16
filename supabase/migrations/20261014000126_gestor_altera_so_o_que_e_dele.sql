-- ==============================================================================
-- O gestor só altera o contrato ou a ata que é dele
--
-- Antes, a regra "cada gestor cuida só dos seus" existia só na tela
-- (useAssignedManagementScope). No banco, as RPCs exigiam só has_role('gestor'):
-- chamando a API por fora da tela, um gestor alterava contrato ou ata de outro.
--
-- Decisão de 14/10/2026 (opção A): a tela continua igual e a leitura no banco
-- continua aberta; só a ALTERAÇÃO passa a ser conferida.
--
-- Mesma regra da tela (src/hooks/useAssignedManagementScope.ts):
--   - contrato é do gestor se ele é o gestor do contrato (contract_managers) ou
--     da ata a que o contrato está vinculado (arp_item_contract_links);
--   - ata é do gestor se ele é o gestor da ata (ata_managers) ou de algum
--     contrato vinculado a ela.
--   - operação sobre contrato E item da ata: basta um dos dois ser dele.
--
-- Só o perfil gestor é conferido. Coordenador, gestor de saldo, servidor
-- (service_role) e cron (sem usuário) não mudam. Se o alvo não existe, a
-- conferência não barra: a própria RPC responde como antes.
--
-- Cada RPC da lista ganha, logo depois do BEGIN principal:
--   PERFORM public.exigir_alcance_do_gestor(<contrato>, <ata>);
-- A troca é feita por pg_get_functiondef (como nas migrations 76 e 82) e é
-- idempotente. Fora da lista, de propósito: sincronização em lote (só o
-- servidor chama), empenho global, conciliação e envio da previsão do mês
-- (vários contratos), modelos de tarefa (genéricos) e avisos.
-- ==============================================================================

-- 1. Alcance do gestor -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestor_alcanca_contrato(p_contract_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.contract_managers cm
            WHERE cm.contract_key = p_contract_key AND cm.gestor_user_id = auth.uid()
         )
      OR EXISTS (
           SELECT 1
             FROM public.arp_item_contract_links l
             JOIN public.ata_managers am ON am.ata_key = public.ata_key_from_item_key(l.item_key)
            WHERE l.contract_key = p_contract_key AND am.gestor_user_id = auth.uid()
         );
$$;

CREATE OR REPLACE FUNCTION public.gestor_alcanca_ata(p_ata_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.ata_managers am
            WHERE am.ata_key = p_ata_key AND am.gestor_user_id = auth.uid()
         )
      OR EXISTS (
           SELECT 1
             FROM public.arp_item_contract_links l
             JOIN public.contract_managers cm ON cm.contract_key = l.contract_key
            WHERE public.ata_key_from_item_key(l.item_key) = p_ata_key
              AND cm.gestor_user_id = auth.uid()
         );
$$;

CREATE OR REPLACE FUNCTION public.exigir_alcance_do_gestor(p_contract_key TEXT, p_ata_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.eh_service_role() THEN
    RETURN;
  END IF;

  -- Só o perfil gestor (sem ser coordenador) tem alcance limitado.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_id = 'gestor')
     OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_id = 'admin') THEN
    RETURN;
  END IF;

  IF NULLIF(btrim(COALESCE(p_contract_key, '')), '') IS NULL
     AND NULLIF(btrim(COALESCE(p_ata_key, '')), '') IS NULL THEN
    RETURN;
  END IF;

  IF p_contract_key IS NOT NULL AND public.gestor_alcanca_contrato(p_contract_key) THEN
    RETURN;
  END IF;
  IF p_ata_key IS NOT NULL AND public.gestor_alcanca_ata(p_ata_key) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'FORA_DO_ALCANCE: Este contrato ou ata é de outro gestor. Só o gestor dele ou o coordenador pode alterar.'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.gestor_alcanca_contrato(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gestor_alcanca_ata(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.exigir_alcance_do_gestor(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestor_alcanca_contrato(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gestor_alcanca_ata(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exigir_alcance_do_gestor(TEXT, TEXT) TO authenticated, service_role;

-- 2. Conferência no início de cada RPC que o gestor usa --------------------------
DO $$
DECLARE
  -- {nome da RPC, expressão do contrato, expressão da ata} (NULL = não se aplica)
  v_alvos TEXT[][] := ARRAY[
    -- Notas de empenho do contrato
    ['link_empenho_to_contract_atomic', 'p_contract_key', NULL],
    ['unlink_empenho_from_contract_atomic', '(SELECT ce.contract_key FROM public.contrato_empenhos ce WHERE ce.id = p_link_id)', NULL],
    ['sync_contract_empenhos_atomic', 'p_contract_key', NULL],
    ['registrar_sincronizacao_empenhos_contrato', 'p_contract_key', NULL],
    ['atualizar_contrato_oficial', 'p_contract_key', NULL],
    ['vincular_empenho_manual_ao_contrato', 'p_contract_key', NULL],
    ['desvincular_empenho_manual_do_contrato', 'p_contract_key', NULL],
    ['descartar_empenho_do_contrato', 'p_contract_key', NULL],
    ['restaurar_empenho_do_contrato', 'p_contract_key', NULL],
    ['distribuir_empenho_nos_itens', '(SELECT ce.contract_key FROM public.contrato_empenhos ce WHERE ce.id = p_contrato_empenho_id)', NULL],
    ['vincular_empenho_aos_itens', '(SELECT ce.contract_key FROM public.contrato_empenhos ce WHERE ce.id = p_contrato_empenho_id)', NULL],
    ['informar_quantidade_empenho_item', '(SELECT ce.contract_key FROM public.contrato_empenhos ce WHERE ce.id = p_contrato_empenho_id)', NULL],
    ['conferir_quantidades_empenho', '(SELECT ce.contract_key FROM public.contrato_empenhos ce WHERE ce.id = p_contrato_empenho_id)', NULL],
    ['desfazer_distribuicao_empenho', '(SELECT ce.contract_key FROM public.contrato_empenhos ce WHERE ce.id = p_contrato_empenho_id)', NULL],
    ['marcar_correcao_nota_no_contrato', '(SELECT ce.contract_key FROM public.contrato_empenhos ce WHERE ce.id = p_contrato_empenho_id)', NULL],
    ['desfazer_correcao_nota_no_contrato', '(SELECT ce.contract_key FROM public.contrato_empenhos ce WHERE ce.id = p_contrato_empenho_id)', NULL],
    -- Faturas, ciclos de pagamento e previsão
    ['sync_contrato_faturas_atomic', 'p_contract_key', NULL],
    ['marcar_correcao_empenho_na_fonte', '(SELECT cf.contract_key FROM public.contrato_faturas cf WHERE cf.id_fatura = p_id_fatura LIMIT 1)', NULL],
    ['desfazer_correcao_empenho_na_fonte', '(SELECT cf.contract_key FROM public.contrato_faturas cf WHERE cf.id_fatura = p_id_fatura LIMIT 1)', NULL],
    ['create_payment_cycle_atomic', 'p_contract_key', NULL],
    ['register_payment_cycle_marco_atomic', '(SELECT c.contract_key FROM public.contract_payment_cycles c WHERE c.cycle_key = p_cycle_key)', NULL],
    ['update_payment_cycle_info_atomic', '(SELECT c.contract_key FROM public.contract_payment_cycles c WHERE c.cycle_key = p_cycle_key)', NULL],
    ['add_payment_cycle_document_atomic', '(SELECT c.contract_key FROM public.contract_payment_cycles c WHERE c.cycle_key = p_cycle_key)', NULL],
    ['remove_payment_cycle_document_atomic', '(SELECT c.contract_key FROM public.contract_payment_cycle_documents d JOIN public.contract_payment_cycles c ON c.id = d.cycle_id WHERE d.id = p_document_id)', NULL],
    ['ligar_faturas_ciclo', '(SELECT c.contract_key FROM public.contract_payment_cycles c WHERE c.cycle_key = p_cycle_key)', NULL],
    ['definir_expectativa_pagamento', 'p_contract_key', NULL],
    ['salvar_entrega_prevista', 'p_contract_key', NULL],
    ['cancelar_entrega_prevista', '(SELECT e.contract_key FROM public.contrato_entregas_previstas e WHERE e.id = p_id)', NULL],
    ['salvar_ajuste_previsao', 'p_contract_key', NULL],
    -- Contrato e item da ata
    ['link_contract_to_item_atomic', 'p_contract_key', 'public.ata_key_from_item_key(p_item_key)'],
    ['link_contract_to_items_atomic', 'p_contract_key', 'public.ata_key_from_item_key(p_item_keys->>0)'],
    ['unlink_contract_from_item_atomic', '(SELECT l.contract_key FROM public.arp_item_contract_links l WHERE l.id = p_link_id)', '(SELECT public.ata_key_from_item_key(l.item_key) FROM public.arp_item_contract_links l WHERE l.id = p_link_id)'],
    ['dismiss_contract_suggestion_atomic', 'p_contract_key', 'public.ata_key_from_item_key(p_item_key)'],
    ['restore_contract_suggestion_atomic', 'p_contract_key', 'public.ata_key_from_item_key(p_item_key)'],
    ['ajustar_quantidade_contratada', 'p_contract_key', 'public.ata_key_from_item_key(p_item_key)'],
    ['desfazer_ajuste_quantidade_contratada', 'p_contract_key', 'public.ata_key_from_item_key(p_item_key)'],
    ['dividir_contrato_nas_unidades', 'p_contract_key', 'public.ata_key_from_item_key(p_item_key)'],
    ['desfazer_divisao_contrato_unidades', 'p_contract_key', 'public.ata_key_from_item_key(p_item_key)'],
    ['sync_contract_item_quantity_atomic', 'p_contract_key', 'public.ata_key_from_item_key(p_item_key)'],
    -- Item da ata
    ['save_empenho_links_atomic', NULL, 'public.ata_key_from_item_key(p_item_key)'],
    ['informar_quantidades_ata_assinada', NULL, 'public.ata_key_from_item_key(p_item_key)'],
    ['informar_quantidade_adesao', NULL, 'public.ata_key_from_item_key(p_item_key)'],
    ['save_manual_empenhos_atomic', NULL, 'public.ata_key_from_item_key(p_item_key)'],
    ['save_empenho_manual_quantities_atomic', NULL, 'public.ata_key_from_item_key(p_item_key)'],
    ['save_manual_contrato_atomic', NULL, 'public.ata_key_from_item_key(p_contrato->>''item_key'')'],
    ['delete_manual_contrato_atomic', NULL, '(SELECT public.ata_key_from_item_key(cm.item_key) FROM public.contratos_manuais cm WHERE cm.id = p_id)'],
    ['sync_item_senasp_quantity_atomic', NULL, 'public.ata_key_from_item_key(p_item_key)'],
    -- Tarefas do contrato
    ['start_contract_task_plan_atomic', 'CASE WHEN btrim(COALESCE(p_uasg, '''')) <> '''' AND btrim(COALESCE(p_numero, '''')) <> '''' AND p_ano BETWEEN 2000 AND 2100 THEN public.normalize_contract_key(btrim(p_uasg), btrim(p_numero), p_ano) END', NULL],
    ['apply_contract_task_template_atomic', 'CASE WHEN btrim(COALESCE(p_uasg, '''')) <> '''' AND btrim(COALESCE(p_numero, '''')) <> '''' AND p_ano BETWEEN 2000 AND 2100 THEN public.normalize_contract_key(btrim(p_uasg), btrim(p_numero), p_ano) END', NULL],
    ['apply_contract_task_template_to_key_atomic', 'p_contract_key', NULL],
    ['save_contract_task_macrotask_atomic', 'COALESCE((SELECT p.contract_key FROM public.contract_task_plans p WHERE p.id = p_plan_id), (SELECT p.contract_key FROM public.contract_task_macrotasks m JOIN public.contract_task_plans p ON p.id = m.plan_id WHERE m.id = p_id))', NULL],
    ['delete_contract_task_macrotask_atomic', '(SELECT p.contract_key FROM public.contract_task_macrotasks m JOIN public.contract_task_plans p ON p.id = m.plan_id WHERE m.id = p_id)', NULL],
    ['create_contract_task_atomic', '(SELECT p.contract_key FROM public.contract_task_macrotasks m JOIN public.contract_task_plans p ON p.id = m.plan_id WHERE m.id = p_macrotask_id)', NULL],
    ['update_contract_task_atomic', '(SELECT p.contract_key FROM public.contract_tasks t JOIN public.contract_task_macrotasks m ON m.id = t.macrotask_id JOIN public.contract_task_plans p ON p.id = m.plan_id WHERE t.id = p_task_id)', NULL],
    ['delete_contract_task_atomic', '(SELECT p.contract_key FROM public.contract_tasks t JOIN public.contract_task_macrotasks m ON m.id = t.macrotask_id JOIN public.contract_task_plans p ON p.id = m.plan_id WHERE t.id = p_id)', NULL],
    ['delete_contract_task_module_atomic', '(SELECT p.contract_key FROM public.contract_task_plans p WHERE p.id = p_plan_id)', NULL],
    ['rename_contract_task_module_atomic', '(SELECT p.contract_key FROM public.contract_task_plans p WHERE p.id = p_plan_id)', NULL],
    -- Tarefas da ata
    ['start_ata_task_plan_atomic', NULL, 'p_ata_key'],
    ['apply_ata_task_template_atomic', NULL, 'p_ata_key'],
    ['save_ata_task_macrotask_atomic', NULL, 'COALESCE((SELECT p.ata_key FROM public.ata_task_plans p WHERE p.id = p_plan_id), (SELECT p.ata_key FROM public.ata_task_macrotasks m JOIN public.ata_task_plans p ON p.id = m.plan_id WHERE m.id = p_id))'],
    ['delete_ata_task_macrotask_atomic', NULL, '(SELECT p.ata_key FROM public.ata_task_macrotasks m JOIN public.ata_task_plans p ON p.id = m.plan_id WHERE m.id = p_id)'],
    ['create_ata_task_atomic', NULL, '(SELECT p.ata_key FROM public.ata_task_macrotasks m JOIN public.ata_task_plans p ON p.id = m.plan_id WHERE m.id = p_macrotask_id)'],
    ['update_ata_task_atomic', NULL, '(SELECT p.ata_key FROM public.ata_tasks t JOIN public.ata_task_macrotasks m ON m.id = t.macrotask_id JOIN public.ata_task_plans p ON p.id = m.plan_id WHERE t.id = p_task_id)'],
    ['delete_ata_task_atomic', NULL, '(SELECT p.ata_key FROM public.ata_tasks t JOIN public.ata_task_macrotasks m ON m.id = t.macrotask_id JOIN public.ata_task_plans p ON p.id = m.plan_id WHERE t.id = p_id)'],
    ['delete_ata_task_module_atomic', NULL, '(SELECT p.ata_key FROM public.ata_task_plans p WHERE p.id = p_plan_id)'],
    ['rename_ata_task_module_atomic', NULL, '(SELECT p.ata_key FROM public.ata_task_plans p WHERE p.id = p_plan_id)']
  ];
  i INT;
  v_nome TEXT;
  v_oid OID;
  v_def TEXT;
  v_pos INT;
  v_corpo INT;
  v_param TEXT;
  v_args TEXT[];
  v_linha TEXT;
  v_novas INT := 0;
BEGIN
  FOR i IN 1 .. array_length(v_alvos, 1) LOOP
    v_nome := v_alvos[i][1];

    SELECT p.oid INTO v_oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'public' AND p.proname = v_nome AND l.lanname = 'plpgsql';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RPC % não encontrada (plpgsql)', v_nome;
    END IF;
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = v_nome) <> 1 THEN
      RAISE EXCEPTION 'RPC % tem mais de uma versão', v_nome;
    END IF;

    -- Todo parâmetro citado nas expressões existe na RPC.
    SELECT p.proargnames::text[] INTO v_args FROM pg_proc p WHERE p.oid = v_oid;
    FOR v_param IN
      SELECT DISTINCT m[1]
        FROM regexp_matches(COALESCE(v_alvos[i][2], '') || ' ' || COALESCE(v_alvos[i][3], ''), '\m(p_[a-z_]+)\M', 'g') AS m
    LOOP
      IF NOT (v_param = ANY (v_args)) THEN
        RAISE EXCEPTION 'RPC %: parâmetro % não existe', v_nome, v_param;
      END IF;
    END LOOP;

    v_def := pg_get_functiondef(v_oid);
    CONTINUE WHEN v_def LIKE '%exigir_alcance_do_gestor%';

    -- BEGIN principal: a primeira palavra BEGIN do corpo, sozinha na linha.
    v_corpo := position('$function$' IN v_def);
    v_pos := position(E'\nBEGIN\n' IN substr(v_def, v_corpo));
    IF v_pos = 0 OR v_pos <> regexp_instr(substr(v_def, v_corpo), '\mBEGIN\M') - 1 THEN
      RAISE EXCEPTION 'RPC %: BEGIN principal não encontrado com segurança', v_nome;
    END IF;
    v_pos := v_corpo - 1 + v_pos + length(E'\nBEGIN\n');

    v_linha := format(
      E'  PERFORM public.exigir_alcance_do_gestor(%s, %s);  -- alcance do gestor (migration 126)\n',
      COALESCE('(' || v_alvos[i][2] || ')::text', 'NULL'),
      COALESCE('(' || v_alvos[i][3] || ')::text', 'NULL')
    );

    EXECUTE substr(v_def, 1, v_pos - 1) || v_linha || substr(v_def, v_pos);
    v_novas := v_novas + 1;
  END LOOP;

  RAISE NOTICE 'RPCs com a conferência do gestor: % de %', v_novas, array_length(v_alvos, 1);
END
$$;
