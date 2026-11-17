-- Quem concluiu cada tarefa (atas e contratos).
--
-- Até aqui as tarefas concluídas ficavam sem autor: em 17/11/2026, das 283 concluídas, nenhuma tinha
-- concluido_por nem responsavel_user_id. Sem isso não há como medir o ritmo de cada servidor, que é a base para a
-- distribuição considerar o histórico (estudo de 17/11/2026).
--
-- 1. Coluna concluido_por_user_id nas duas tabelas de tarefas.
-- 2. Gatilho: ao passar para CONCLUIDA por um usuário logado, grava o id e, se vier vazio, o nome. Tarefa fechada
--    pela fonte (cron, sem usuário) fica sem autor. Ao sair de CONCLUIDA, o autor é apagado.
-- 3. Passado: o autor de cada tarefa concluída à mão sai do registro de auditoria (última passagem para CONCLUIDA).

ALTER TABLE public.ata_tasks ADD COLUMN IF NOT EXISTS concluido_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.contract_tasks ADD COLUMN IF NOT EXISTS concluido_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ata_tasks.concluido_por_user_id IS 'Usuário que marcou a tarefa como concluída (vazio quando a fonte fechou). Migration 322.';
COMMENT ON COLUMN public.contract_tasks.concluido_por_user_id IS 'Usuário que marcou a tarefa como concluída (vazio quando a fonte fechou). Migration 322.';

-- SECURITY DEFINER: nome_do_usuario_logado() não é executável pelo papel authenticated.
CREATE OR REPLACE FUNCTION public.trg_tarefa_quem_concluiu()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.status = 'CONCLUIDA' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'CONCLUIDA') THEN
    IF NEW.fechada_pela_fonte IS NULL AND auth.uid() IS NOT NULL THEN
      NEW.concluido_por_user_id := auth.uid();
      NEW.concluido_por := COALESCE(NULLIF(TRIM(COALESCE(NEW.concluido_por, '')), ''), public.nome_do_usuario_logado());
    ELSE
      NEW.concluido_por_user_id := NULL;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM 'CONCLUIDA' THEN
    NEW.concluido_por_user_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_tarefa_quem_concluiu() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_ata_tasks_quem_concluiu ON public.ata_tasks;
CREATE TRIGGER trg_ata_tasks_quem_concluiu
  BEFORE INSERT OR UPDATE OF status ON public.ata_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_tarefa_quem_concluiu();

DROP TRIGGER IF EXISTS trg_contract_tasks_quem_concluiu ON public.contract_tasks;
CREATE TRIGGER trg_contract_tasks_quem_concluiu
  BEFORE INSERT OR UPDATE OF status ON public.contract_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_tarefa_quem_concluiu();

-- Passado pelo registro de auditoria. Só mexe na coluna nova e no nome (vazio): os gatilhos de prazo e de
-- reprojeção não disparam, e o de "quem concluiu" só olha mudanças de status.
WITH ultima AS (
  SELECT DISTINCT ON (l.entity_type, l.entity_id) l.entity_type, l.entity_id, l.user_id
    FROM public.audit_logs l
   WHERE l.entity_type IN ('ata_tasks', 'contract_tasks')
     AND l.user_id IS NOT NULL
     AND l.new_data->>'status' = 'CONCLUIDA'
     AND COALESCE(l.old_data->>'status', '') <> 'CONCLUIDA'
   ORDER BY l.entity_type, l.entity_id, l.created_at DESC
),
autor AS (
  SELECT ul.entity_type, ul.entity_id, ul.user_id,
         LEFT(COALESCE(NULLIF(u.raw_user_meta_data->>'nome', ''), NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)), 150) AS nome
    FROM ultima ul
    JOIN auth.users u ON u.id = ul.user_id
)
UPDATE public.contract_tasks t
   SET concluido_por_user_id = a.user_id,
       concluido_por = COALESCE(NULLIF(TRIM(COALESCE(t.concluido_por, '')), ''), a.nome)
  FROM autor a
 WHERE a.entity_type = 'contract_tasks' AND a.entity_id = t.id::TEXT
   AND t.status = 'CONCLUIDA' AND t.fechada_pela_fonte IS NULL AND t.concluido_por_user_id IS NULL;

WITH ultima AS (
  SELECT DISTINCT ON (l.entity_type, l.entity_id) l.entity_type, l.entity_id, l.user_id
    FROM public.audit_logs l
   WHERE l.entity_type IN ('ata_tasks', 'contract_tasks')
     AND l.user_id IS NOT NULL
     AND l.new_data->>'status' = 'CONCLUIDA'
     AND COALESCE(l.old_data->>'status', '') <> 'CONCLUIDA'
   ORDER BY l.entity_type, l.entity_id, l.created_at DESC
),
autor AS (
  SELECT ul.entity_type, ul.entity_id, ul.user_id,
         LEFT(COALESCE(NULLIF(u.raw_user_meta_data->>'nome', ''), NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)), 150) AS nome
    FROM ultima ul
    JOIN auth.users u ON u.id = ul.user_id
)
UPDATE public.ata_tasks t
   SET concluido_por_user_id = a.user_id,
       concluido_por = COALESCE(NULLIF(TRIM(COALESCE(t.concluido_por, '')), ''), a.nome)
  FROM autor a
 WHERE a.entity_type = 'ata_tasks' AND a.entity_id = t.id::TEXT
   AND t.status = 'CONCLUIDA' AND t.fechada_pela_fonte IS NULL AND t.concluido_por_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contract_tasks_concluido_por_user ON public.contract_tasks (concluido_por_user_id, concluido_em) WHERE concluido_por_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ata_tasks_concluido_por_user ON public.ata_tasks (concluido_por_user_id, concluido_em) WHERE concluido_por_user_id IS NOT NULL;
