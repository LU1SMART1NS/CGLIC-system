-- ==============================================================================
-- MIGRATION 101: avisos marcados como resolvidos, com justificativa
-- ==============================================================================
-- Decisão de 08/10/2026: todo aviso da Visão Geral e das Ações da ata e do
-- contrato pode ser marcado como resolvido (✓), com justificativa obrigatória.
-- Podem marcar: gestor, coordenador (role admin) e gestor de saldo.
--
-- Os avisos são calculados na tela; aqui fica só a marcação, por uma chave que
-- embute o que faz o aviso voltar:
--   SALDO::<ata>-<uasg>::<item>::<CRITICA|ATENCAO>  volta se o saldo piorar
--   REAJUSTE::<contrato>::<ciclo>                    vale para o ciclo
--   LEMBRETE::<id do lembrete com VIG_<fim>>         vale para a vigência
-- Tarefas não passam por aqui: resolver a tarefa é concluí-la no plano.
-- Pagamento não tem resolvido: some ao registrar a etapa.
--
-- Substitui reminder_dismissals (migration 46), que só guardava lembretes e sem
-- justificativa. As marcações antigas são copiadas e a tabela antiga sai.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.avisos_resolvidos (
  chave VARCHAR(300) PRIMARY KEY,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('SALDO', 'REAJUSTE', 'LEMBRETE')),
  justificativa TEXT NOT NULL CHECK (char_length(btrim(justificativa)) BETWEEN 1 AND 500),
  resolvido_por UUID DEFAULT auth.uid(),
  resolvido_por_nome TEXT,
  resolvido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (chave LIKE tipo || '::%')
);

ALTER TABLE public.avisos_resolvidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura para logados: avisos_resolvidos" ON public.avisos_resolvidos;
CREATE POLICY "Leitura para logados: avisos_resolvidos"
  ON public.avisos_resolvidos FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.avisos_resolvidos FROM anon;
GRANT SELECT ON public.avisos_resolvidos TO authenticated;

-- Marcações antigas de lembrete (sem justificativa na época). O Contrato 360 gravava
-- o id com o prefixo ACT-LEMBRETE-; a chave nova usa só o id do lembrete.
INSERT INTO public.avisos_resolvidos (chave, tipo, justificativa, resolvido_por, resolvido_em)
SELECT 'LEMBRETE::' || regexp_replace(item_id, '^ACT-LEMBRETE-', ''),
       'LEMBRETE',
       'Marcado como resolvido antes de a justificativa ser obrigatória.',
       dismissed_by,
       dismissed_at
  FROM public.reminder_dismissals
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.resolver_aviso(
  p_chave TEXT,
  p_tipo TEXT,
  p_justificativa TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chave TEXT := btrim(COALESCE(p_chave, ''));
  v_tipo TEXT := upper(btrim(COALESCE(p_tipo, '')));
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin') OR public.has_role('gestor_saldos')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor, coordenador ou gestor de saldo marcam aviso como resolvido.'
      USING ERRCODE = '42501';
  END IF;

  IF v_tipo NOT IN ('SALDO', 'REAJUSTE', 'LEMBRETE') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Este tipo de aviso não pode ser marcado como resolvido.' USING ERRCODE = '22023';
  END IF;
  IF v_chave = '' OR length(v_chave) > 300 OR v_chave NOT LIKE v_tipo || '::%' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Aviso não identificado.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escreva a justificativa com pelo menos 10 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A justificativa pode ter no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.avisos_resolvidos (chave, tipo, justificativa, resolvido_por, resolvido_por_nome, resolvido_em)
  VALUES (v_chave, v_tipo, v_just, auth.uid(), public.nome_do_usuario_logado(), NOW())
  ON CONFLICT (chave) DO UPDATE
    SET justificativa = EXCLUDED.justificativa,
        resolvido_por = EXCLUDED.resolvido_por,
        resolvido_por_nome = EXCLUDED.resolvido_por_nome,
        resolvido_em = EXCLUDED.resolvido_em;

  RETURN jsonb_build_object('success', true, 'chave', v_chave);
END;
$$;

CREATE OR REPLACE FUNCTION public.reexibir_aviso(p_chave TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chave TEXT := btrim(COALESCE(p_chave, ''));
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin') OR public.has_role('gestor_saldos')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor, coordenador ou gestor de saldo reexibem aviso.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.avisos_resolvidos WHERE chave = v_chave;

  RETURN jsonb_build_object('success', true, 'chave', v_chave);
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_aviso(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reexibir_aviso(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_aviso(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reexibir_aviso(TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.dismiss_reminder_atomic(VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.restore_reminder_atomic(VARCHAR, VARCHAR, VARCHAR);
DROP TABLE IF EXISTS public.reminder_dismissals;
