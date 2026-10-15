-- ==============================================================================
-- MIGRATION 140: NÍVEL DO GESTOR (gestor_niveis + gestor_niveis_historico)
-- Versão: 20261015000140_nivel_do_gestor.sql
--
-- Contexto: a Central de Distribuição comparava os gestores só pela carga
-- (soma dos pesos Baixa 1, Média 2, Alta 3). Agora cada gestor tem um nível,
-- e o nível define a capacidade usada na ocupação (carga ÷ capacidade):
--   INICIANTE 60% · INTERMEDIARIO 85% · AVANCADO 100%
-- (os percentuais ficam no front: src/components/atas/distribuicao/nivelGestor.ts).
--
-- - Uma linha por servidor (user_id). Sem linha = nível não informado
--   (o front usa a capacidade de Intermediário até o coordenador informar).
-- - `desde` marca quando a pessoa entrou no nível atual (conta para a subida);
--   só muda quando o nível muda.
-- - Toda mudança vai para gestor_niveis_historico, com motivo e autoria.
-- - Escrita só pela RPC set_gestor_nivel, só admin (coordenador), motivo
--   obrigatório. O sistema só sugere a subida; quem sobe é o coordenador.
-- - Leitura só de quem vê a Central (admin e leitor). O gestor não vê o nível
--   dos colegas. Mais a política restritiva "Somente usuario ativo" (migration 124).
-- - Auditoria pelo trigger padrão (trg_audit_log_capture).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.gestor_niveis (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nivel VARCHAR(15) NOT NULL CHECK (nivel IN ('INICIANTE', 'INTERMEDIARIO', 'AVANCADO')),
  desde TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  motivo VARCHAR(300) NOT NULL CHECK (LENGTH(TRIM(motivo)) > 0),
  definido_por_user_id UUID REFERENCES auth.users(id),
  definido_por_nome VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gestor_niveis_historico (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nivel_anterior VARCHAR(15) CHECK (nivel_anterior IN ('INICIANTE', 'INTERMEDIARIO', 'AVANCADO')),
  nivel VARCHAR(15) NOT NULL CHECK (nivel IN ('INICIANTE', 'INTERMEDIARIO', 'AVANCADO')),
  motivo VARCHAR(300) NOT NULL,
  definido_por_user_id UUID REFERENCES auth.users(id),
  definido_por_nome VARCHAR(150),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gestor_niveis_historico_user
  ON public.gestor_niveis_historico (user_id, criado_em DESC);

ALTER TABLE public.gestor_niveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestor_niveis_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Central Read: gestor_niveis" ON public.gestor_niveis;
CREATE POLICY "Central Read: gestor_niveis"
  ON public.gestor_niveis FOR SELECT TO authenticated
  USING (public.has_role('admin') OR public.has_role('leitor'));

DROP POLICY IF EXISTS "Central Read: gestor_niveis_historico" ON public.gestor_niveis_historico;
CREATE POLICY "Central Read: gestor_niveis_historico"
  ON public.gestor_niveis_historico FOR SELECT TO authenticated
  USING (public.has_role('admin') OR public.has_role('leitor'));

DROP POLICY IF EXISTS "Somente usuario ativo" ON public.gestor_niveis;
CREATE POLICY "Somente usuario ativo" ON public.gestor_niveis AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));

DROP POLICY IF EXISTS "Somente usuario ativo" ON public.gestor_niveis_historico;
CREATE POLICY "Somente usuario ativo" ON public.gestor_niveis_historico AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));

DROP TRIGGER IF EXISTS trg_audit_gestor_niveis ON public.gestor_niveis;
CREATE TRIGGER trg_audit_gestor_niveis
AFTER INSERT OR UPDATE OR DELETE ON public.gestor_niveis
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();

-- ------------------------------------------------------------------------------
-- set_gestor_nivel — grava (ou troca) o nível de um servidor e registra no
-- histórico. Mesmo nível com outro motivo só atualiza o motivo (sem mexer em
-- `desde`) e também entra no histórico.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_gestor_nivel(
  p_user_id UUID,
  p_nivel VARCHAR(15),
  p_motivo VARCHAR(300)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nivel VARCHAR(15);
  v_motivo VARCHAR(300);
  v_nome VARCHAR(150);
  v_anterior VARCHAR(15);
  v_record RECORD;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador altera o nível do gestor.'
      USING ERRCODE = '42501';
  END IF;

  v_nivel := UPPER(TRIM(COALESCE(p_nivel, '')));
  v_motivo := TRIM(COALESCE(p_motivo, ''));

  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Servidor não encontrado.' USING ERRCODE = '22023';
  END IF;
  IF v_nivel NOT IN ('INICIANTE', 'INTERMEDIARIO', 'AVANCADO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Nível deve ser INICIANTE, INTERMEDIARIO ou AVANCADO.' USING ERRCODE = '22023';
  END IF;
  IF v_motivo = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o motivo.' USING ERRCODE = '22023';
  END IF;
  IF LENGTH(v_motivo) > 300 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O motivo não pode exceder 300 caracteres.' USING ERRCODE = '22023';
  END IF;

  v_nome := public.nome_do_usuario_logado();

  SELECT nivel INTO v_anterior FROM public.gestor_niveis WHERE user_id = p_user_id FOR UPDATE;

  INSERT INTO public.gestor_niveis
    (user_id, nivel, desde, motivo, definido_por_user_id, definido_por_nome, created_at, updated_at)
  VALUES (p_user_id, v_nivel, NOW(), v_motivo, auth.uid(), v_nome, NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    nivel = EXCLUDED.nivel,
    desde = CASE WHEN public.gestor_niveis.nivel = EXCLUDED.nivel THEN public.gestor_niveis.desde ELSE NOW() END,
    motivo = EXCLUDED.motivo,
    definido_por_user_id = EXCLUDED.definido_por_user_id,
    definido_por_nome = EXCLUDED.definido_por_nome,
    updated_at = NOW()
  RETURNING user_id, nivel, desde, motivo, definido_por_user_id, definido_por_nome, created_at, updated_at
  INTO v_record;

  INSERT INTO public.gestor_niveis_historico
    (user_id, nivel_anterior, nivel, motivo, definido_por_user_id, definido_por_nome)
  VALUES (p_user_id, v_anterior, v_nivel, v_motivo, auth.uid(), v_nome);

  RETURN jsonb_build_object('success', true, 'nivel', to_jsonb(v_record));
END;
$$;

REVOKE ALL ON FUNCTION public.set_gestor_nivel(UUID, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_gestor_nivel(UUID, VARCHAR, VARCHAR) TO authenticated;
