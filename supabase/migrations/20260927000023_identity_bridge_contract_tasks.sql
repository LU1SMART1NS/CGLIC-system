-- ==============================================================================
-- MIGRATION 23: PONTE DE IDENTIDADE (RESPONSÁVEL → auth.users) EM contract_tasks
-- Versão: 20260927000023_identity_bridge_contract_tasks.sql
-- Fase: 10-A.2 — Implementação dos Pré-Requisitos de Automação
-- Invariantes: P1 (SSOT), P3 (Database Integrity), P7 (Least Privilege)
--
-- Contexto (Fase 10-A / 10-A.1): responsavel_nome é texto livre, sem FK, em
-- contract_tasks, contract_managers e processos_sei. O Supabase Auth já existe
-- e já é referenciado por FK real em user_roles.user_id — só faltava a ponte
-- entre a identidade de sistema e a responsabilidade operacional.
--
-- Modelo adotado (aditivo, não disruptivo — RESPONSÁVEL → IDENTIDADE →
-- DESTINATÁRIO, sem inventar novo sistema de usuários, sem duplicar
-- auth.users, sem alterar RBAC):
--   responsavel_user_id UUID NULL REFERENCES auth.users(id)  = identidade canônica
--   responsavel_nome VARCHAR                                  = informação legada/humana
-- O campo texto NUNCA é removido. USER_ID só é preenchido quando o
-- responsável de fato tiver conta ativa no sistema — não presumir cobertura
-- total (ver GAP de adoção documentado no relatório de homologação).
--
-- Escopo desta migration (Seção 9 da Fase 10-A.2 — "não adicionar _user_id
-- indiscriminadamente em todas as tabelas"): SOMENTE contract_tasks.
-- contract_payment_cycles.responsavel_user_id já foi criado diretamente na
-- migration 22 (tabela nova). contract_managers e processos_sei foram
-- deliberadamente NÃO alterados nesta fase — não são o alvo prioritário
-- (tarefas e ciclos de pagamento são os domínios que hoje efetivamente
-- precisam resolver "quem notificar"); ficam documentados como próximo passo
-- natural quando 10-G (Destinatários e Preferências) for iniciada.
-- ==============================================================================

ALTER TABLE public.contract_tasks
  ADD COLUMN IF NOT EXISTS responsavel_user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_contract_tasks_responsavel_user_id ON public.contract_tasks (responsavel_user_id);

-- update_contract_task_atomic passa a aceitar p_responsavel_user_id (novo
-- parâmetro opcional, ao final da assinatura — chamadas existentes via
-- PostgREST usam argumentos nomeados, nenhuma chamada pré-existente quebra).
-- Comportamento preservado 1:1 para todos os demais campos.
--
-- A assinatura antiga (6 parâmetros) é removida explicitamente antes de criar
-- a nova (7 parâmetros) para não deixar dois overloads coexistindo.
DROP FUNCTION IF EXISTS public.update_contract_task_atomic(VARCHAR, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR);

CREATE OR REPLACE FUNCTION public.update_contract_task_atomic(
  p_task_id VARCHAR(60),
  p_status VARCHAR(20) DEFAULT NULL,
  p_responsavel_nome VARCHAR(150) DEFAULT NULL,
  p_prazo DATE DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL,
  p_concluido_por VARCHAR(150) DEFAULT NULL,
  p_responsavel_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task_id VARCHAR(60);
  v_status VARCHAR(20);
  v_current RECORD;
  v_record RECORD;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  v_task_id := TRIM(COALESCE(p_task_id, ''));
  IF v_task_id = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O ID da tarefa é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current FROM public.contract_tasks WHERE id = v_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_TASK_NOT_FOUND: Tarefa com ID "%" não encontrada.', v_task_id
      USING ERRCODE = 'P0002';
  END IF;

  v_status := TRIM(COALESCE(p_status, v_current.status));
  IF v_status NOT IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'NAO_APLICAVEL') THEN
    RAISE EXCEPTION 'INVALID_TASK_STATUS: Status de tarefa inválido ("%"). Valores permitidos: PENDENTE, EM_ANDAMENTO, CONCLUIDA, NAO_APLICAVEL.', v_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.contract_tasks
  SET
    status = v_status,
    responsavel_nome = COALESCE(NULLIF(TRIM(COALESCE(p_responsavel_nome, '')), ''), responsavel_nome),
    responsavel_user_id = COALESCE(p_responsavel_user_id, responsavel_user_id),
    prazo = COALESCE(p_prazo, prazo),
    observacao = CASE WHEN p_observacao IS NULL THEN observacao ELSE NULLIF(TRIM(p_observacao), '') END,
    atualizado_em = NOW(),
    concluido_em = CASE
      WHEN v_status = 'CONCLUIDA' AND v_current.status <> 'CONCLUIDA' THEN NOW()
      WHEN v_status <> 'CONCLUIDA' THEN NULL
      ELSE concluido_em
    END,
    concluido_por = CASE
      WHEN v_status = 'CONCLUIDA' AND v_current.status <> 'CONCLUIDA'
        THEN COALESCE(NULLIF(TRIM(COALESCE(p_concluido_por, '')), ''), NULLIF(TRIM(COALESCE(p_responsavel_nome, '')), ''), responsavel_nome)
      WHEN v_status <> 'CONCLUIDA' THEN NULL
      ELSE concluido_por
    END
  WHERE id = v_task_id
  RETURNING * INTO v_record;

  RETURN jsonb_build_object(
    'success', true,
    'task', jsonb_build_object(
      'id', v_record.id,
      'macrotask_id', v_record.macrotask_id,
      'nome', v_record.nome,
      'ordem', v_record.ordem,
      'status', v_record.status,
      'responsavel_nome', v_record.responsavel_nome,
      'responsavel_user_id', v_record.responsavel_user_id,
      'prazo', v_record.prazo,
      'observacao', v_record.observacao,
      'execution_mode', v_record.execution_mode,
      'criado_em', v_record.criado_em,
      'atualizado_em', v_record.atualizado_em,
      'concluido_em', v_record.concluido_em,
      'concluido_por', v_record.concluido_por
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_contract_task_atomic(VARCHAR, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_contract_task_atomic(VARCHAR, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR, UUID) TO authenticated;
