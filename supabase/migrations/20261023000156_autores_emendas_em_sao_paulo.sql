-- ==============================================================================
-- MIGRATION 156: LEITURA SEMANAL DOS AUTORES DAS EMENDAS RODA EM SÃO PAULO
-- Versão: 20261023000156_autores_emendas_em_sao_paulo.sql
--
-- Medição de 23/10/2026, depois de publicar a migration 155: a Câmara (dadosabertos.camara.leg.br) não aceita
-- conexão da região padrão das Edge Functions do Supabase (a conexão TCP trava até o tempo limite; o Senado
-- responde normalmente). Chamando a função com o cabeçalho x-region: sa-east-1 (São Paulo), a leitura funcionou:
-- 648 deputados e 126 senadores em 3 s, e foi assim que a primeira carga foi feita.
--
-- disparar_sincronizacao (migration 77) passa a mandar x-region: sa-east-1 só no recurso 'autores_emendas'.
-- Os demais recursos seguem iguais. CREATE OR REPLACE mantém a permissão atual (só o dono, os jobs do pg_cron).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.disparar_sincronizacao(p_recurso TEXT, p_uasg TEXT DEFAULT NULL)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_url TEXT;
  v_segredo TEXT;
  v_cabecalhos JSONB;
  v_id BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'sincronizacao_url';
  SELECT decrypted_secret INTO v_segredo FROM vault.decrypted_secrets WHERE name = 'sincronizacao_segredo';

  IF v_url IS NULL OR v_segredo IS NULL THEN
    RAISE NOTICE 'Agendamento da sincronização ainda não ativado (faltam os secrets do Vault); nada foi chamado.';
    RETURN NULL;
  END IF;

  v_cabecalhos := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo);
  -- A Câmara só responde a quem chama do Brasil: a leitura dos autores roda na região de São Paulo.
  IF p_recurso = 'autores_emendas' THEN
    v_cabecalhos := v_cabecalhos || jsonb_build_object('x-region', 'sa-east-1');
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := v_cabecalhos,
    body := jsonb_strip_nulls(jsonb_build_object('recurso', p_recurso, 'uasg', p_uasg)),
    timeout_milliseconds := 10000
  ) INTO v_id;
  RETURN v_id;
END;
$$;

-- Só o próprio banco (jobs do pg_cron, que rodam como o dono) chama esta função (mesma regra da migration 77).
REVOKE ALL ON FUNCTION public.disparar_sincronizacao(TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
