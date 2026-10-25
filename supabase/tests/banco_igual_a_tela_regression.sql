-- ==============================================================================
-- REGRESSÃO — 20261025000199_banco_igual_a_tela.sql
-- Garante que as travas da migration 199 continuam no banco:
--   - save_empenho_soberano_atomic confere a nota (exigir_alcance_da_nota);
--   - link_contract_to_items_atomic confere cada item, não só o primeiro;
--   - resolver_aviso e reexibir_aviso: gestor de saldo só SALDO e alcance do gestor pela chave;
--   - gravar_cadastro_uasgs só para o servidor;
--   - as 12 RPCs que alteram Modelos de Gestão só para o coordenador.
--
-- Recriar uma dessas RPCs sem a trava faz este teste falhar.
--
-- Uso (Postgres local do `supabase start`, nunca contra o projeto remoto):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/banco_igual_a_tela_regression.sql
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_faltando TEXT[] := ARRAY[]::TEXT[];
  v_modelos TEXT[] := ARRAY[
    'save_contract_task_template_atomic', 'delete_contract_task_template_atomic',
    'save_contract_task_template_macrotask_atomic', 'delete_contract_task_template_macrotask_atomic',
    'save_contract_task_template_task_atomic', 'delete_contract_task_template_task_atomic',
    'save_ata_task_template_atomic', 'delete_ata_task_template_atomic',
    'save_ata_task_template_macrotask_atomic', 'delete_ata_task_template_macrotask_atomic',
    'save_ata_task_template_task_atomic', 'delete_ata_task_template_task_atomic'
  ];
  r TEXT;
  v_src TEXT;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'save_empenho_soberano_atomic';
  IF v_src NOT LIKE '%exigir_alcance_da_nota(v_canonical_key)%' THEN
    v_faltando := v_faltando || 'save_empenho_soberano_atomic'::TEXT;
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'link_contract_to_items_atomic';
  IF v_src NOT LIKE '%jsonb_array_elements_text(p_item_keys)%' OR v_src LIKE '%p_item_keys->>0%' THEN
    v_faltando := v_faltando || 'link_contract_to_items_atomic'::TEXT;
  END IF;

  FOREACH r IN ARRAY ARRAY['resolver_aviso', 'reexibir_aviso'] LOOP
    SELECT prosrc INTO v_src FROM pg_proc WHERE proname = r;
    IF v_src NOT LIKE '%exigir_alcance_do_aviso(v_chave)%' OR v_src NOT LIKE '%O gestor de saldo só%' THEN
      v_faltando := v_faltando || r;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated', 'public.gravar_cadastro_uasgs(jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.gravar_cadastro_uasgs(jsonb)', 'EXECUTE') THEN
    v_faltando := v_faltando || 'gravar_cadastro_uasgs (EXECUTE para logados)'::TEXT;
  END IF;

  FOREACH r IN ARRAY v_modelos LOOP
    SELECT prosrc INTO v_src FROM pg_proc WHERE proname = r;
    IF v_src IS NULL OR v_src NOT LIKE '%Só o coordenador altera os modelos de gestão%' THEN
      v_faltando := v_faltando || r;
    END IF;
  END LOOP;

  IF array_length(v_faltando, 1) > 0 THEN
    RAISE EXCEPTION 'FALHA: travas da migration 199 ausentes em: %', v_faltando;
  END IF;
  RAISE NOTICE 'OK: travas da migration 199 presentes';
END
$$;

ROLLBACK;
