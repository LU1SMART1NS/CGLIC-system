-- Trabalho em aberto de cada ata e contrato, para a carga da Central de Distribuição (decisão de 17/11/2026).
--
-- Conta as tarefas do plano de gestão que estão com o gestor (grupos "Comigo agora" e "Cobrar resposta" de
-- modeloGestao.ts) e vencem em até p_dias dias, inclusive as já vencidas. Ficam de fora:
--   - concluídas e não aplicáveis;
--   - "Acompanhar" (quem fecha é a fonte);
--   - pedido enviado aguardando resposta dentro do prazo ou sem prazo de resposta (está com outra pessoa).
-- O prazo é o efetivo: com pedido enviado e sem resposta, vale o prazo da resposta.
--
-- SECURITY INVOKER: respeita a leitura das tabelas de tarefas (só usuários logados e ativos).

CREATE OR REPLACE FUNCTION public.tarefas_abertas_por_instrumento(p_dias INTEGER DEFAULT 30)
RETURNS TABLE(tipo TEXT, chave TEXT, abertas INTEGER, vencidas INTEGER)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH hoje AS (SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE AS d),
  tarefas AS (
    SELECT 'CONTRATO'::TEXT AS tipo, p.contract_key::TEXT AS chave, t.prazo, t.prazo_resposta, t.pedido_enviado_em, t.resposta_em, t.acao::TEXT AS acao
      FROM public.contract_tasks t
      JOIN public.contract_task_macrotasks m ON m.id = t.macrotask_id
      JOIN public.contract_task_plans p ON p.id = m.plan_id
     WHERE t.status = 'PENDENTE'
    UNION ALL
    SELECT 'ATA'::TEXT, p.ata_key::TEXT, t.prazo, t.prazo_resposta, t.pedido_enviado_em, t.resposta_em, t.acao::TEXT
      FROM public.ata_tasks t
      JOIN public.ata_task_macrotasks m ON m.id = t.macrotask_id
      JOIN public.ata_task_plans p ON p.id = m.plan_id
     WHERE t.status = 'PENDENTE'
  ),
  com_prazo AS (
    SELECT t.tipo, t.chave,
           (t.pedido_enviado_em IS NOT NULL AND t.resposta_em IS NULL) AS aguardando,
           CASE WHEN t.pedido_enviado_em IS NOT NULL AND t.resposta_em IS NULL AND t.prazo_resposta IS NOT NULL
                THEN t.prazo_resposta ELSE t.prazo END AS prazo_efetivo,
           t.prazo_resposta,
           t.acao
      FROM tarefas t
  )
  SELECT c.tipo, c.chave, COUNT(*)::INTEGER, COUNT(*) FILTER (WHERE c.prazo_efetivo < h.d)::INTEGER
    FROM com_prazo c CROSS JOIN hoje h
   WHERE COALESCE(c.acao, '') <> 'ACOMPANHAR'
     AND c.prazo_efetivo IS NOT NULL
     AND c.prazo_efetivo <= h.d + GREATEST(COALESCE(p_dias, 30), 0)
     AND NOT (c.aguardando AND (c.prazo_resposta IS NULL OR c.prazo_resposta >= h.d))
   GROUP BY c.tipo, c.chave;
$$;

REVOKE ALL ON FUNCTION public.tarefas_abertas_por_instrumento(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tarefas_abertas_por_instrumento(INTEGER) TO authenticated, service_role;
