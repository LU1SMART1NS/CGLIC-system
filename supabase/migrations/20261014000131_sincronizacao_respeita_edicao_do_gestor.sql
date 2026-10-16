-- ==============================================================================
-- Sincronização × gestor salvando no mesmo instante
--
-- As migrations 112 e 113 protegem o trabalho do gestor quando a sincronização
-- roda em outro momento. Faltava o caso simultâneo: a rotina conferia "tem
-- trabalho do gestor?" e só depois gravava ou apagava; se o gestor salvasse
-- no meio, o trabalho dele se perdia.
--
-- 1) Vínculo da nota aos itens (aplicar_distribuicao_automatica,
--    aplicar_vinculo_pela_nota, aplicar_vinculo_pelo_valor): o servidor passa
--    a pegar a mesma trava do gestor ('distribuir_empenho:<nota>'). Com
--    TENTATIVA: se o gestor está gravando aquela nota agora, a rotina não
--    mexe nela (o que o gestor gravar ela respeita; a próxima rodada confere).
--    Esperar a trava poderia travar os dois (o servidor já segura a linha da
--    nota quando é chamado pelo gatilho).
-- 2) Nota que sumiu da fonte (sync_contract_empenhos_atomic): antes de conferir
--    se há trabalho do gestor e apagar, tenta a mesma trava; nota em edição
--    fica para a próxima rodada.
-- 3) Vínculo automático ata-contrato que a fonte desmentiu
--    (executar_vinculos_automaticos): antes de apagar, trava o vínculo
--    (FOR UPDATE SKIP LOCKED) e confere de novo o ajuste de quantidade e a
--    divisão do gestor (que gravam com o vínculo travado). Vínculo em edição
--    fica para a próxima rodada; com trabalho, vai para "a conferir".
--
-- Troca no corpo por pg_get_functiondef (CREATE OR REPLACE, mesma assinatura e
-- permissões). Idempotente: pula a função que já tem a marca da migration 131.
-- ==============================================================================

DO $$
DECLARE
  v_def TEXT;
  v_novo TEXT;
  v_corpo INT;
  v_pos INT;
  v_nome TEXT;
  v_marca CONSTANT TEXT := '(migration 131)';
  v_trava CONSTANT TEXT :=
    E'  -- Nota em edição pelo gestor agora: não mexe nela nesta rodada (migration 131).\n'
    '  IF NOT pg_try_advisory_xact_lock(hashtext(''distribuir_empenho:'' || COALESCE(p_contrato_empenho_id::TEXT, ''''))) THEN\n'
    '    RETURN;\n'
    '  END IF;\n';
  v_antes TEXT;
  v_depois TEXT;
BEGIN
  -- 1) As três rotinas automáticas do vínculo da nota: tentativa da trava logo após o BEGIN.
  FOREACH v_nome IN ARRAY ARRAY['aplicar_distribuicao_automatica', 'aplicar_vinculo_pela_nota', 'aplicar_vinculo_pelo_valor'] LOOP
    v_def := pg_get_functiondef(format('public.%I(uuid)', v_nome)::regprocedure);
    CONTINUE WHEN position(v_marca IN v_def) > 0;
    v_corpo := position('$function$' IN v_def);
    v_pos := position(E'\nBEGIN\n' IN substr(v_def, v_corpo));
    IF v_pos = 0 OR v_pos <> regexp_instr(substr(v_def, v_corpo), '\mBEGIN\M') - 1 THEN
      RAISE EXCEPTION '%: BEGIN principal não encontrado com segurança', v_nome;
    END IF;
    v_pos := v_corpo - 1 + v_pos + length(E'\nBEGIN\n');
    EXECUTE substr(v_def, 1, v_pos - 1) || v_trava || substr(v_def, v_pos);
  END LOOP;

  -- 2) Nota que sumiu da fonte: tentativa da trava antes de conferir o trabalho do gestor.
  v_def := pg_get_functiondef('public.sync_contract_empenhos_atomic(character varying, jsonb, boolean)'::regprocedure);
  IF position(v_marca IN v_def) = 0 THEN
    v_antes := '        v_com_trabalho :=';
    IF (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 THEN
      RAISE EXCEPTION 'sync_contract_empenhos_atomic: ponto de inserção não encontrado uma única vez';
    END IF;
    v_depois :=
      E'        -- Nota em edição pelo gestor agora: fica para a próxima rodada (migration 131).\n'
      '        IF NOT pg_try_advisory_xact_lock(hashtext(''distribuir_empenho:'' || v_removed.id::TEXT)) THEN\n'
      '          CONTINUE;\n'
      '        END IF;\n'
      || v_antes;
    EXECUTE replace(v_def, v_antes, v_depois);
  END IF;

  -- 3) Vínculo automático desmentido: trava e confere de novo antes de apagar.
  v_def := pg_get_functiondef('public.executar_vinculos_automaticos(text, boolean, text, text)'::regprocedure);
  IF position(v_marca IN v_def) = 0 THEN
    v_antes := '    DELETE FROM public.arp_item_contract_links WHERE id IN (SELECT id FROM pg_temp.vinculo_auto_retirar WHERE NOT com_trabalho);';
    IF (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 THEN
      RAISE EXCEPTION 'executar_vinculos_automaticos: DELETE não encontrado uma única vez';
    END IF;
    IF (length(v_def) - length(replace(v_def, E'  v_resumo JSONB;\nBEGIN', ''))) / length(E'  v_resumo JSONB;\nBEGIN') <> 1 THEN
      RAISE EXCEPTION 'executar_vinculos_automaticos: DECLARE não encontrado uma única vez';
    END IF;
    v_depois :=
      E'    -- Cada vínculo é travado e conferido de novo antes de sair (migration 131): o ajuste de quantidade e a\n'
      '    -- divisão do gestor gravam com o vínculo travado. Vínculo em edição agora fica para a próxima rodada.\n'
      '    FOR v_ret IN SELECT r.id FROM pg_temp.vinculo_auto_retirar r WHERE NOT r.com_trabalho LOOP\n'
      '      PERFORM 1 FROM public.arp_item_contract_links l WHERE l.id = v_ret.id FOR UPDATE SKIP LOCKED;\n'
      '      IF NOT FOUND THEN\n'
      '        DELETE FROM pg_temp.vinculo_auto_retirar WHERE id = v_ret.id;\n'
      '      ELSIF EXISTS (SELECT 1 FROM public.arp_item_contract_links l\n'
      '                     WHERE l.id = v_ret.id\n'
      '                       AND (l.quantidade_ajustada IS NOT NULL\n'
      '                            OR EXISTS (SELECT 1 FROM public.contrato_item_divisoes d\n'
      '                                        WHERE d.item_key = l.item_key AND d.contract_key = l.contract_key AND d.origem = ''USUARIO''))) THEN\n'
      '        UPDATE pg_temp.vinculo_auto_retirar SET com_trabalho = TRUE WHERE id = v_ret.id;\n'
      '      ELSE\n'
      '        DELETE FROM public.arp_item_contract_links WHERE id = v_ret.id;\n'
      '      END IF;\n'
      '    END LOOP;\n'
      '    SELECT count(*) FILTER (WHERE NOT com_trabalho), count(*) FILTER (WHERE com_trabalho)\n'
      '      INTO v_removidos, v_a_conferir\n'
      '      FROM pg_temp.vinculo_auto_retirar;';
    v_novo := replace(v_def, v_antes, v_depois);
    v_novo := replace(v_novo, E'  v_resumo JSONB;\nBEGIN', E'  v_resumo JSONB;\n  v_ret RECORD;\nBEGIN');
    EXECUTE v_novo;
  END IF;
END
$$;
