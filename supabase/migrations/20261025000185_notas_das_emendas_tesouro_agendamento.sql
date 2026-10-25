-- ==============================================================================
-- MIGRATION 185: AGENDAMENTO DAS NOTAS DAS EMENDAS PELO TESOURO
-- Versão: 20261025000185_notas_das_emendas_tesouro_agendamento.sql
--
-- O recurso 'notas_emendas_tesouro' da Edge Function sincronizar-fontes pergunta ao Tesouro (STA) as notas citadas
-- no SEI dos pedidos de emendas que ainda não estão em `empenhos` (notas_das_emendas_a_trazer, migration 184) e as
-- grava por gravar_notas_do_tesouro. Uma vez por dia, às 10h35 de Brasília: depois da leitura do saldo contábil da UG
-- 200330 às 9h09 (a gravação exige a nota no saldo contábil) e longe da atualização diária do Tesouro, quando a API devolve
-- respostas incompletas. Cada nota é perguntada de novo só depois de um dia; a que falhou no Tesouro volta na
-- execução seguinte.
--
-- Depende da migration 184 e da Edge Function publicada com o recurso.
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sincronizar-notas-emendas-tesouro';
    PERFORM cron.schedule('sincronizar-notas-emendas-tesouro', '35 13 * * *', $c$SELECT public.disparar_sincronizacao('notas_emendas_tesouro')$c$);
  END IF;
END;
$$;
