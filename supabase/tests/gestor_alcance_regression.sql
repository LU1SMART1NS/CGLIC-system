-- ==============================================================================
-- REGRESSÃO — 20261014000126_gestor_altera_so_o_que_e_dele.sql
-- Garante que as RPCs que o gestor usa para alterar contrato ou ata continuam
-- conferindo se o contrato/ata é dele (public.exigir_alcance_do_gestor).
--
-- RPC nova que o gestor chama para alterar um contrato ou uma ata: chamar
--   PERFORM public.exigir_alcance_do_gestor(<chave do contrato>, <chave da ata>);
-- logo no início do corpo e acrescentar o nome à lista abaixo.
--
-- As 4 RPCs de cadastro manual (save_manual_contrato_atomic, delete_manual_contrato_atomic,
-- save_manual_empenhos_atomic, save_empenho_manual_quantities_atomic) saíram na migration 127.
--
-- Uso (Postgres local do `supabase start`, nunca contra o projeto remoto):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/gestor_alcance_regression.sql
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_rpcs TEXT[] := ARRAY[
    'link_empenho_to_contract_atomic', 'unlink_empenho_from_contract_atomic', 'sync_contract_empenhos_atomic',
    'registrar_sincronizacao_empenhos_contrato', 'atualizar_contrato_oficial', 'vincular_empenho_manual_ao_contrato',
    'desvincular_empenho_manual_do_contrato', 'descartar_empenho_do_contrato', 'restaurar_empenho_do_contrato',
    'distribuir_empenho_nos_itens', 'vincular_empenho_aos_itens', 'informar_quantidade_empenho_item',
    'conferir_quantidades_empenho', 'desfazer_distribuicao_empenho', 'marcar_correcao_nota_no_contrato',
    'desfazer_correcao_nota_no_contrato', 'sync_contrato_faturas_atomic', 'marcar_correcao_empenho_na_fonte',
    'desfazer_correcao_empenho_na_fonte', 'create_payment_cycle_atomic', 'register_payment_cycle_marco_atomic',
    'update_payment_cycle_info_atomic', 'add_payment_cycle_document_atomic', 'remove_payment_cycle_document_atomic',
    'ligar_faturas_ciclo', 'definir_expectativa_pagamento', 'salvar_entrega_prevista', 'cancelar_entrega_prevista',
    'salvar_ajuste_previsao', 'link_contract_to_item_atomic', 'link_contract_to_items_atomic',
    'unlink_contract_from_item_atomic', 'dismiss_contract_suggestion_atomic', 'restore_contract_suggestion_atomic',
    'ajustar_quantidade_contratada', 'desfazer_ajuste_quantidade_contratada', 'dividir_contrato_nas_unidades',
    'desfazer_divisao_contrato_unidades', 'sync_contract_item_quantity_atomic', 'save_empenho_links_atomic',
    'informar_quantidades_ata_assinada', 'informar_quantidade_adesao',
    'sync_item_senasp_quantity_atomic', 'start_contract_task_plan_atomic', 'apply_contract_task_template_atomic',
    'apply_contract_task_template_to_key_atomic', 'save_contract_task_macrotask_atomic',
    'delete_contract_task_macrotask_atomic', 'create_contract_task_atomic', 'update_contract_task_atomic',
    'delete_contract_task_atomic', 'delete_contract_task_module_atomic', 'rename_contract_task_module_atomic',
    'start_ata_task_plan_atomic', 'apply_ata_task_template_atomic', 'save_ata_task_macrotask_atomic',
    'delete_ata_task_macrotask_atomic', 'create_ata_task_atomic', 'update_ata_task_atomic', 'delete_ata_task_atomic',
    'delete_ata_task_module_atomic', 'rename_ata_task_module_atomic'
  ];
  v_faltando TEXT;
BEGIN
  SELECT string_agg(r, ', ' ORDER BY r) INTO v_faltando
    FROM unnest(v_rpcs) AS r
   WHERE NOT EXISTS (
     SELECT 1
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = r
        AND p.prosrc LIKE '%exigir_alcance_do_gestor(%'
   );

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA: RPCs sem a conferência do gestor: %', v_faltando;
  END IF;
  RAISE NOTICE 'OK: % RPCs conferem o alcance do gestor', array_length(v_rpcs, 1);
END
$$;

ROLLBACK;
