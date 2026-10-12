-- Limpeza dos dados gravados por usuários antes do início do uso real (09/10/2026).
-- Fica: tudo o que vem das APIs (atas, itens, contratos, empenhos, faturas, OBs, cópias, vínculos automáticos,
--       feriados, registros de sincronização), usuários e perfis (auth.users, user_roles, roles, permissões),
--       modelos de tarefas, unidades internas e limites da Lei 14.133.
-- Sai: gestores atribuídos, planos e tarefas, ciclos de pagamento, alocações, vínculos e quantidades manuais,
--      descartes, avisos resolvidos e de distribuição, e toda a auditoria.
-- Nenhuma tabela das APIs tem chave estrangeira apontando para as tabelas limpas (conferido em 09/10/2026).
-- Como usar (supabase db query --linked -f <arquivo>):
--   Ensaio (padrão): roda tudo numa transação e termina em RAISE EXCEPTION com as contagens; nada fica gravado.
--   Aplicar: acrescentar `SET limpeza.aplicar = 'sim';` logo depois do BEGIN — só com autorização.
BEGIN;

DO $$
DECLARE
  -- filhos antes dos pais; auditoria por último (os gatilhos de auditoria gravam durante a limpeza)
  v_tabelas text[] := ARRAY[
    'contract_payment_cycle_checklist','contract_payment_cycle_documents','contract_payment_cycle_events',
    'contract_payment_cycle_faturas','contract_payment_cycle_itens','contract_payment_cycles',
    'contract_tasks','contract_task_macrotasks','contract_task_plans',
    'ata_tasks','ata_task_macrotasks','ata_task_plans',
    'contract_managers','ata_managers',
    'empenho_links','arp_allocations','processos_sei',
    'contrato_empenho_links','contratos_manuais',
    'empenho_manual_quantidades','empenhos_manuais',
    'item_allocation_state','item_empenho_link_state','item_manual_empenho_state','item_manual_quantity_state',
    'arp_item_contract_dismissals','arp_item_empenhos_descartada','contract_ata_descartes',
    'contract_sem_ata_confirmacoes','contrato_empenho_descartes',
    'contrato_entregas_previstas','contrato_expectativa_pagamento',
    'instrument_complexity_overrides','prazos_emendas',
    'previsao_pagamentos_ajustes','previsao_pagamentos',
    'avisos_resolvidos','distribuicao_avisos',
    'audit_logs'];
  -- tabelas que precisam continuar com o mesmo número de linhas
  v_ficam text[] := ARRAY[
    'atas_registro_preco','itens_ata','itens_ata_unidades_copia','contratos_oficiais','contratos_detalhes_copia',
    'itens_contrato','itens_contrato_leituras','arp_item_contract_links','empenhos','contrato_empenhos',
    'contrato_empenho_distribuicoes','contrato_empenho_itens','empenho_eventos_historico','contrato_faturas',
    'fatura_empenhos','ordens_bancarias','holidays','user_roles','roles','role_permissions','permissions',
    'contract_task_templates','contract_task_template_macrotasks','contract_task_template_tasks',
    'ata_task_templates','ata_task_template_macrotasks','ata_task_template_tasks',
    'internal_departments','limites_lei_14133_art75'];
  v_t text; v_n bigint; v_antes bigint; v_depois bigint;
  v_resumo text := ''; v_mudou text := '';
  v_cont jsonb := '{}';
BEGIN
  FOREACH v_t IN ARRAY v_ficam LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
    v_cont := v_cont || jsonb_build_object(v_t, v_n);
  END LOOP;
  SELECT count(*) INTO v_antes FROM auth.users;

  FOREACH v_t IN ARRAY v_tabelas LOOP
    EXECUTE format('DELETE FROM public.%I', v_t);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_resumo := v_resumo || v_t || '=' || v_n || ' '; END IF;
  END LOOP;

  FOREACH v_t IN ARRAY v_ficam LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
    IF v_n <> (v_cont->>v_t)::bigint THEN
      v_mudou := v_mudou || v_t || ' ' || (v_cont->>v_t) || '->' || v_n || ' ';
    END IF;
  END LOOP;
  SELECT count(*) INTO v_depois FROM auth.users;
  IF v_depois <> v_antes THEN v_mudou := v_mudou || 'auth.users ' || v_antes || '->' || v_depois; END IF;

  IF v_mudou <> '' THEN
    RAISE EXCEPTION 'ABORTADO: tabelas que deviam ficar mudaram: %', v_mudou;
  END IF;

  IF coalesce(current_setting('limpeza.aplicar', true), '') <> 'sim' THEN
    RAISE EXCEPTION 'ENSAIO (nada gravado). Apagados: %| tabelas que ficam: intactas; usuários: %', v_resumo, v_depois;
  END IF;
  RAISE NOTICE 'APLICADO. Apagados: %', v_resumo;
END $$;

COMMIT;
