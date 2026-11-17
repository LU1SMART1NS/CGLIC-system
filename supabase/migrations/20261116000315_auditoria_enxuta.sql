-- ==============================================================================
-- Auditoria enxuta (16/11/2026).
--
-- audit_logs chegou a 512 MB dos 619 MB do banco (plano gratuito recomenda 500 MB). Medido em 16/11/2026:
-- das 11.832 alterações gravadas pelo servidor em 2 dias, 11.121 só trocaram datas de controle (a sincronização
-- regrava a nota igual, mudando updated_at/last_synced_at). Nenhuma tela lê audit_logs; ela serve para
-- recuperar decisões de usuários (a migration 152 usou isso).
--
-- 1. O gatilho deixa de gravar UPDATE sem mudança real (só datas de controle mudaram). Vale para todos.
-- 2. O que o servidor/rotinas gravaram (user_id nulo) é apagado depois de 30 dias, todo dia às 06:23 UTC
--    (03:23 de Brasília, minuto livre no cron). O que os usuários fizeram fica para sempre.
-- 3. O que já está gravado sai em lotes, à parte (ver o fim do arquivo), seguido de VACUUM FULL.
-- ==============================================================================

-- Colunas que só registram quando a linha foi lida ou regravada; mudança só nelas não é mudança real.
CREATE OR REPLACE FUNCTION public.auditoria_colunas_de_controle()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT ARRAY['updated_at', 'atualizado_em', 'last_synced_at', 'ultimo_sync_em', 'synced_at', 'sincronizado_em',
               'lido_em', 'documentos_lidos_em', 'quantidade_lida_em']::text[];
$$;
REVOKE ALL ON FUNCTION public.auditoria_colunas_de_controle() FROM PUBLIC, anon, authenticated;

-- Mesmo gatilho de 20260917000003, com a saída cedo para UPDATE sem mudança real.
-- CREATE OR REPLACE mantém as permissões e os gatilhos que já usam a função.
CREATE OR REPLACE FUNCTION public.trg_audit_log_capture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id VARCHAR(100);
  v_old_json JSONB;
  v_new_json JSONB;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_old_json := to_jsonb(OLD);
    v_entity_id := COALESCE(v_old_json->>'id', v_old_json->>'item_key', 'UNKNOWN');
    INSERT INTO public.audit_logs (entity_type, entity_id, action, old_data, new_data, user_id)
    VALUES (TG_TABLE_NAME, v_entity_id, 'DELETE', v_old_json, NULL, auth.uid());
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_old_json := to_jsonb(OLD);
    v_new_json := to_jsonb(NEW);
    -- Só datas de controle mudaram (ex.: sincronização regravando a mesma nota): nada a registrar.
    IF (v_new_json - public.auditoria_colunas_de_controle()) = (v_old_json - public.auditoria_colunas_de_controle()) THEN
      RETURN NEW;
    END IF;
    v_entity_id := COALESCE(v_new_json->>'id', v_new_json->>'item_key', 'UNKNOWN');
    INSERT INTO public.audit_logs (entity_type, entity_id, action, old_data, new_data, user_id)
    VALUES (TG_TABLE_NAME, v_entity_id, 'UPDATE', v_old_json, v_new_json, auth.uid());
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    v_new_json := to_jsonb(NEW);
    v_entity_id := COALESCE(v_new_json->>'id', v_new_json->>'item_key', 'UNKNOWN');
    INSERT INTO public.audit_logs (entity_type, entity_id, action, old_data, new_data, user_id)
    VALUES (TG_TABLE_NAME, v_entity_id, 'INSERT', NULL, v_new_json, auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;

-- Apaga, em lote, o que o servidor e as rotinas gravaram (user_id nulo) e já não serve: o de mais de 30 dias e,
-- de qualquer data, UPDATE em que só datas de controle mudaram (o gatilho novo nem grava mais esses).
-- Em lote para não pesar no banco pequeno (um DELETE único de ~226 mil linhas passou de 100 s no ensaio; lote de 10 mil levou ~4 s).
-- Devolve quantas linhas saíram; chamar de novo até devolver 0.
CREATE OR REPLACE FUNCTION public.limpar_auditoria_do_servidor(p_limite integer DEFAULT 10000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_controle text[] := public.auditoria_colunas_de_controle();
  v_apagadas integer;
BEGIN
  DELETE FROM public.audit_logs
   WHERE id IN (
     SELECT a.id FROM public.audit_logs a
      WHERE a.user_id IS NULL
        AND (a.created_at < NOW() - INTERVAL '30 days'
             OR (a.action = 'UPDATE' AND (a.new_data - v_controle) = (a.old_data - v_controle)))
      LIMIT GREATEST(p_limite, 1));
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;
  RETURN v_apagadas;
END;
$$;
REVOKE ALL ON FUNCTION public.limpar_auditoria_do_servidor(integer) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.limpar_auditoria_do_servidor(integer) IS
  'Retenção da auditoria: o que o servidor/rotinas gravaram (user_id nulo) fica 30 dias, e UPDATE sem mudança real sai; o dos usuários fica sempre. Cron diário 06:23 UTC.';

-- Agenda diária (substitui se já existir).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar-auditoria-do-servidor') THEN
    PERFORM cron.unschedule('limpar-auditoria-do-servidor');
  END IF;
  PERFORM cron.schedule('limpar-auditoria-do-servidor', '23 6 * * *', 'SELECT public.limpar_auditoria_do_servidor()');
END $$;

-- A limpeza do que já está gravado (~226 mil linhas) NÃO roda aqui: vai em lotes, fora do expediente,
-- chamando SELECT public.limpar_auditoria_do_servidor(); até devolver 0, e depois VACUUM FULL public.audit_logs;
-- (fora de transação). Depois disso, o job diário mantém.
