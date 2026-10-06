-- ==============================================================================
-- MIGRATION 77: AGENDAMENTO DA SINCRONIZAÇÃO COM AS FONTES OFICIAIS (pg_cron + pg_net)
-- Versão: 20261006000077_agendamento_da_sincronizacao.sql
--
-- A sincronização de contratos, atas e saldos dos itens passa a ser disparada pelo banco, de hora em
-- hora, chamando a Edge Function sincronizar-fontes. Ninguém precisa estar com o sistema aberto.
--
-- - A função só sincroniza o que passou da validade (6 horas) e respeita a trava de
--   sincronizacao_fontes; na maior parte das horas a resposta é "nada a fazer".
-- - O endereço da função e o segredo do agendamento NÃO ficam nesta migration (ela vai para o git): são
--   lidos do Vault (secrets 'sincronizacao_url' e 'sincronizacao_segredo'), gravados à parte por
--   scripts/ativar-sincronizacao-no-servidor.sh. Enquanto não existirem, os jobs não fazem nada.
-- - Um job por recurso e UASG, em horários diferentes: contratos (:05), atas (:15) e saldos dos itens
--   (:35), nesta ordem porque os saldos usam os contratos e as atas já atualizados. Cada chamada é uma
--   execução separada da função, para caber no tempo máximo de uma Edge Function.
-- - O histórico do pg_cron é limpo toda semana (7 dias).
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ------------------------------------------------------------------------------
-- Dispara uma sincronização: lê o endereço e o segredo do Vault e faz a chamada HTTP (assíncrona).
-- Devolve o id da requisição no pg_net, ou NULL se o agendamento ainda não foi ativado.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disparar_sincronizacao(p_recurso TEXT, p_uasg TEXT DEFAULT NULL)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_url TEXT;
  v_segredo TEXT;
  v_id BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'sincronizacao_url';
  SELECT decrypted_secret INTO v_segredo FROM vault.decrypted_secrets WHERE name = 'sincronizacao_segredo';

  IF v_url IS NULL OR v_segredo IS NULL THEN
    RAISE NOTICE 'Agendamento da sincronização ainda não ativado (faltam os secrets do Vault); nada foi chamado.';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
    body := jsonb_strip_nulls(jsonb_build_object('recurso', p_recurso, 'uasg', p_uasg)),
    timeout_milliseconds := 10000
  ) INTO v_id;
  RETURN v_id;
END;
$$;

-- Só o próprio banco (jobs do pg_cron, que rodam como o dono) chama esta função.
REVOKE ALL ON FUNCTION public.disparar_sincronizacao(TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- Os jobs. cron.schedule com o mesmo nome atualiza o job existente (migration repetível).
-- ------------------------------------------------------------------------------
SELECT cron.schedule('sincronizar-contratos-200330', '5 * * * *',  $$SELECT public.disparar_sincronizacao('contratos', '200330')$$);
SELECT cron.schedule('sincronizar-contratos-200331', '5 * * * *',  $$SELECT public.disparar_sincronizacao('contratos', '200331')$$);
SELECT cron.schedule('sincronizar-atas-200330',      '15 * * * *', $$SELECT public.disparar_sincronizacao('atas', '200330')$$);
SELECT cron.schedule('sincronizar-atas-200331',      '15 * * * *', $$SELECT public.disparar_sincronizacao('atas', '200331')$$);
SELECT cron.schedule('sincronizar-saldos-itens',     '35 * * * *', $$SELECT public.disparar_sincronizacao('saldos_itens')$$);

-- Limpeza semanal do histórico de execuções (domingo, 03:00 UTC).
SELECT cron.schedule(
  'limpar-historico-do-cron',
  '0 3 * * 0',
  $$DELETE FROM cron.job_run_details WHERE end_time < NOW() - INTERVAL '7 days'$$
);
