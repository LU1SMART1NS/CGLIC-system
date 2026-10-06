-- ==============================================================================
-- MIGRATION 82: SINCRONIZAÇÃO DOS EMPENHOS NO SERVIDOR
-- Versão: 20261006000082_empenhos_no_servidor.sql
--
-- Contexto (auditoria de 06/10/2026, AUDITORIA_VINCULO_EMPENHOS_CONTRATOS.md, Fase 4): os empenhos dos
-- contratos só eram atualizados por botão (Contrato 360 e Execução Financeira), no navegador de quem
-- clicasse. A Edge Function sincronizar-fontes passa a ter o recurso 'empenhos', por UASG, agendado.
--
-- O que muda
-- 1) As funções que a sincronização de empenhos chama passam a aceitar o servidor (service_role, ver
--    migration 76). Como na migration 76, a definição é lida do banco e só a linha de autorização é
--    trocada, para não reescrever corpos que outras migrations mudaram:
--      - save_empenho_soberano_atomic  (grava a NE)
--      - link_empenho_to_contract_atomic (vínculo um a um, usado se a migration 81 faltar)
--      - atualizar_contrato_oficial (grava o id do Contratos.gov.br que faltava no contrato)
--    sync_contract_empenhos_atomic (81) e registrar_sincronizacao_empenhos_contrato (80) já aceitam.
-- 2) Jobs do pg_cron para o recurso 'empenhos' nas UASGs 200330 e 200331 (minutos 45 e 50 de cada
--    hora). A função só age quando a última execução bem-sucedida passou da validade (6 horas) ou
--    quando a anterior ficou PARCIAL (o tempo acabou e há contratos para a próxima).
--
-- Nada muda para gestor, coordenador e demais perfis.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Funções aceitam o servidor
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_item RECORD;
  v_oid OID;
  v_def TEXT;
  v_novo TEXT;
BEGIN
  FOR v_item IN
    SELECT * FROM (VALUES
      ('save_empenho_soberano_atomic',
       'IF NOT (public.has_role(''gestor'') OR public.has_role(''admin'')) THEN',
       'IF NOT (public.eh_service_role() OR public.has_role(''gestor'') OR public.has_role(''admin'')) THEN'),
      ('link_empenho_to_contract_atomic',
       'IF NOT (public.has_role(''gestor'') OR public.has_role(''admin'')) THEN',
       'IF NOT (public.eh_service_role() OR public.has_role(''gestor'') OR public.has_role(''admin'')) THEN'),
      ('atualizar_contrato_oficial',
       'IF NOT public.has_role(''gestor'') THEN',
       'IF NOT (public.eh_service_role() OR public.has_role(''gestor'')) THEN')
    ) AS t(funcao, antes, depois)
  LOOP
    SELECT p.oid INTO v_oid
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_item.funcao;
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Função public.% não encontrada; migration revertida.', v_item.funcao;
    END IF;

    v_def := pg_get_functiondef(v_oid);
    IF position('public.eh_service_role()' IN v_def) > 0 THEN
      RAISE NOTICE '% já aceita o servidor; nada a fazer.', v_item.funcao;
      CONTINUE;
    END IF;

    v_novo := replace(v_def, v_item.antes, v_item.depois);
    IF v_novo = v_def THEN
      RAISE EXCEPTION 'A linha de autorização de public.% mudou e não foi encontrada; migration revertida.', v_item.funcao;
    END IF;
    EXECUTE v_novo;
    RAISE NOTICE '% passou a aceitar o servidor.', v_item.funcao;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_empenho_soberano_atomic(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.link_empenho_to_contract_atomic(VARCHAR, UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.atualizar_contrato_oficial(VARCHAR, JSONB) TO service_role;

-- ------------------------------------------------------------------------------
-- 2) Agendamento (pg_cron). cron.schedule com o mesmo nome atualiza o job existente.
-- ------------------------------------------------------------------------------
SELECT cron.schedule('sincronizar-empenhos-200330', '45 * * * *', $$SELECT public.disparar_sincronizacao('empenhos', '200330')$$);
SELECT cron.schedule('sincronizar-empenhos-200331', '50 * * * *', $$SELECT public.disparar_sincronizacao('empenhos', '200331')$$);
