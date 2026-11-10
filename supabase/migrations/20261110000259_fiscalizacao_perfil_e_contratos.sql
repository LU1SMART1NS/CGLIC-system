-- ==============================================================================
-- MIGRATION 259: FISCALIZAÇÃO — ENTREGA 1 (PERFIL E FISCALIZAÇÃO DO CONTRATO)
-- Versão: 20261110000259_fiscalizacao_perfil_e_contratos.sql
--
-- Protótipo aprovado em 10/11/2026 (docs/estudos/modulo-fiscalizacao.md). A SFC/CGLIC (Setor de Fiscalização de
-- Contratos) fiscaliza os contratos de emenda parlamentar e, em caráter extraordinário, outros que o coordenador
-- indicar; os demais ficam com a área requisitante. A fiscalização pode ser mista (parte das entregas com cada um).
-- Esta entrega cria só a base; entregas, etapas, programas e a carga da planilha vêm depois.
--
-- 1) Perfil 'gestor_fiscalizacao' (Gestor de Fiscalização, servidor da SFC/CGLIC) e as permissões
--    fiscalizacao.view/fiscalizacao.manage. Alteram: coordenador (admin) e gestor de fiscalização (só nos
--    contratos em que é fiscal ou substituto). Leem: consulta, gestor e gestor de emendas.
--
-- 2) fisc_contratos: a decisão do coordenador por contrato (toda SFC/CGLIC, mista ou toda área requisitante), o
--    fiscal e o substituto da SFC/CGLIC, a portaria de designação e o processo de fiscalização (SEI). Contrato sem
--    linha aqui: de emenda = "a definir"; sem emenda = área requisitante (padrão).
--
-- 3) fisc_contratos_para_distribuicao(): contratos vigentes e os que já têm decisão, com a situação da fiscalização
--    e as emendas do contrato (lidas das linhas de pedido; o fiscal não lê as tabelas de emendas).
--
-- 4) definir_fiscalizacao_contrato (coordenador) e registrar_processo_fiscalizacao (fiscal, substituto ou
--    coordenador). Só elas gravam. Auditoria pelo trg_audit_log_capture.
--
-- Nada que já existe muda de comportamento.
-- ==============================================================================

-- 1) Perfil e permissões ------------------------------------------------------------------------
INSERT INTO public.roles (id, label, is_system) VALUES ('gestor_fiscalizacao', 'Gestor de Fiscalização', TRUE)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE v_nome TEXT;
BEGIN
  FOR v_nome IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.permissions'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%domain%'
  LOOP
    EXECUTE format('ALTER TABLE public.permissions DROP CONSTRAINT %I', v_nome);
  END LOOP;
  ALTER TABLE public.permissions ADD CONSTRAINT permissions_domain_check
    CHECK (domain IN ('contracts', 'financial', 'allocations', 'departments', 'governance', 'reports', 'emendas', 'fiscalizacao'));
END $$;

INSERT INTO public.permissions (key, domain) VALUES
  ('fiscalizacao.view',   'fiscalizacao'),
  ('fiscalizacao.manage', 'fiscalizacao')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_key) VALUES
  ('admin',               'fiscalizacao.view'),
  ('admin',               'fiscalizacao.manage'),
  ('gestor_fiscalizacao', 'fiscalizacao.view'),
  ('gestor_fiscalizacao', 'fiscalizacao.manage'),
  ('gestor',              'fiscalizacao.view'),
  ('gestor_emendas',      'fiscalizacao.view'),
  ('leitor',              'fiscalizacao.view')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 2) Fiscalização do contrato ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fisc_contratos (
  contract_key         VARCHAR(100) PRIMARY KEY,
  uasg                 VARCHAR(6)   NOT NULL,
  fiscalizacao         VARCHAR(5)   NOT NULL,
  motivo               TEXT,
  fiscal_user_id       UUID         REFERENCES auth.users(id),
  fiscal_nome          VARCHAR(150),
  substituto_user_id   UUID         REFERENCES auth.users(id),
  substituto_nome      VARCHAR(150),
  portaria_sei         VARCHAR(10),
  processo_sei         VARCHAR(10),
  autuado_em           DATE,
  definido_por         UUID,
  definido_por_nome    VARCHAR(200),
  definido_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_por_nome  VARCHAR(200),
  atualizado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fisc_contratos_fiscalizacao CHECK (fiscalizacao IN ('SFC', 'MISTA', 'AREA')),
  CONSTRAINT fisc_contratos_fiscal CHECK (
    (fiscalizacao = 'AREA' AND fiscal_user_id IS NULL AND substituto_user_id IS NULL)
    OR (fiscalizacao <> 'AREA' AND fiscal_user_id IS NOT NULL AND fiscal_nome IS NOT NULL)
  ),
  CONSTRAINT fisc_contratos_substituto CHECK (substituto_user_id IS NULL OR (substituto_user_id <> fiscal_user_id AND substituto_nome IS NOT NULL)),
  CONSTRAINT fisc_contratos_processo CHECK ((processo_sei IS NULL) = (autuado_em IS NULL)),
  CONSTRAINT fisc_contratos_sei CHECK (
    (portaria_sei IS NULL OR portaria_sei ~ '^[0-9]{7,10}$') AND (processo_sei IS NULL OR processo_sei ~ '^[0-9]{7,10}$')
  )
);
CREATE INDEX IF NOT EXISTS ix_fisc_contratos_fiscal ON public.fisc_contratos (fiscal_user_id);
CREATE INDEX IF NOT EXISTS ix_fisc_contratos_substituto ON public.fisc_contratos (substituto_user_id);
COMMENT ON TABLE public.fisc_contratos IS
  'Quem fiscaliza o contrato (SFC/CGLIC, mista ou área requisitante), fiscal e substituto da SFC/CGLIC, portaria e processo de fiscalização (migration 259). Grava só pelas RPCs.';

ALTER TABLE public.fisc_contratos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura da fiscalizacao: fisc_contratos" ON public.fisc_contratos;
CREATE POLICY "Leitura da fiscalizacao: fisc_contratos" ON public.fisc_contratos
  FOR SELECT TO authenticated USING ((SELECT public.has_permission('fiscalizacao.view')));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.fisc_contratos;
CREATE POLICY "Somente usuario ativo" ON public.fisc_contratos AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.fisc_contratos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fisc_contratos TO authenticated;
GRANT ALL ON public.fisc_contratos TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_fisc_contratos ON public.fisc_contratos;
    CREATE TRIGGER trg_audit_fisc_contratos AFTER INSERT OR UPDATE OR DELETE ON public.fisc_contratos
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- Emendas do contrato, pelas linhas de pedido ligadas a ele (lista vazia = contrato sem emenda).
CREATE OR REPLACE FUNCTION public.fisc_emendas_do_contrato(p_contrato TEXT)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(DISTINCT p.siop_emenda::TEXT ORDER BY p.siop_emenda::TEXT) FILTER (WHERE p.siop_emenda IS NOT NULL), ARRAY[]::TEXT[])
    FROM public.emenda_linha_notas n
    JOIN public.emenda_pedido_linhas l ON l.id = n.linha_id AND NOT l.cancelada
    JOIN public.emenda_pedidos p ON p.id = l.pedido_id AND p.etapa <> 'CANCELADO'
   WHERE n.contract_key = p_contrato;
$$;
REVOKE ALL ON FUNCTION public.fisc_emendas_do_contrato(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisc_emendas_do_contrato(TEXT) TO service_role;

-- 3) Lista da Distribuição ----------------------------------------------------------------------
-- situacao: A_DEFINIR (de emenda, sem decisão) · SFC · MISTA · AREA (decisão do coordenador) · AREA_PADRAO (sem emenda, sem decisão).
CREATE OR REPLACE FUNCTION public.fisc_contratos_para_distribuicao()
RETURNS TABLE (
  contract_key        TEXT,
  uasg                TEXT,
  numero              TEXT,
  fornecedor          TEXT,
  objeto              TEXT,
  assinatura          DATE,
  vigencia_fim        DATE,
  emendas             TEXT[],
  situacao            TEXT,
  motivo              TEXT,
  fiscal_user_id      UUID,
  fiscal_nome         TEXT,
  substituto_user_id  UUID,
  substituto_nome     TEXT,
  portaria_sei        TEXT,
  processo_sei        TEXT,
  autuado_em          DATE,
  definido_por_nome   TEXT,
  definido_em         TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.has_permission('fiscalizacao.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à fiscalização.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH emendas AS (
    SELECT n.contract_key AS chave, array_agg(DISTINCT p.siop_emenda::TEXT ORDER BY p.siop_emenda::TEXT) FILTER (WHERE p.siop_emenda IS NOT NULL) AS lista, TRUE AS de_emenda
      FROM public.emenda_linha_notas n
      JOIN public.emenda_pedido_linhas l ON l.id = n.linha_id AND NOT l.cancelada
      JOIN public.emenda_pedidos p ON p.id = l.pedido_id AND p.etapa <> 'CANCELADO'
     WHERE n.contract_key IS NOT NULL
     GROUP BY n.contract_key
  ),
  contratos AS (
    SELECT DISTINCT ON (c.contract_key) c.*
      FROM public.contratos_oficiais c
     ORDER BY c.contract_key, c.sincronizado_em DESC
  )
  SELECT c.contract_key::TEXT,
         c.uasg::TEXT,
         COALESCE(NULLIF(c.registro->>'numero', ''), c.numero)::TEXT,
         (c.registro->>'fornecedorNome')::TEXT,
         (c.registro->>'objeto')::TEXT,
         NULLIF(c.registro->>'dataAssinatura', '')::DATE,
         c.data_vigencia_fim,
         COALESCE(e.lista, ARRAY[]::TEXT[]),
         CASE WHEN f.contract_key IS NOT NULL THEN f.fiscalizacao::TEXT
              WHEN e.de_emenda THEN 'A_DEFINIR'
              ELSE 'AREA_PADRAO' END,
         f.motivo, f.fiscal_user_id, f.fiscal_nome::TEXT, f.substituto_user_id, f.substituto_nome::TEXT,
         f.portaria_sei::TEXT, f.processo_sei::TEXT, f.autuado_em, f.definido_por_nome::TEXT, f.definido_em
    FROM contratos c
    LEFT JOIN emendas e ON e.chave = c.contract_key
    LEFT JOIN public.fisc_contratos f ON f.contract_key = c.contract_key
   WHERE f.contract_key IS NOT NULL
      OR c.data_vigencia_fim IS NULL
      OR c.data_vigencia_fim >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_contratos_para_distribuicao() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_contratos_para_distribuicao() TO authenticated;

-- Servidor que pode ser fiscal: ativo e com o perfil de gestor de fiscalização. Devolve o nome para guardar.
CREATE OR REPLACE FUNCTION public.fisc_nome_do_fiscal(p_user UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_nome TEXT;
BEGIN
  SELECT COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'nome'), ''), NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1))
    INTO v_nome
    FROM auth.users u
   WHERE u.id = p_user
     AND (u.banned_until IS NULL OR u.banned_until <= NOW())
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role_id = 'gestor_fiscalizacao');
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha um servidor ativo com o perfil Gestor de Fiscalização.' USING ERRCODE = '22023';
  END IF;
  RETURN left(v_nome, 150);
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_nome_do_fiscal(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisc_nome_do_fiscal(UUID) TO service_role;

-- SEI só com números, 7 a 10 dígitos (NULL quando vazio).
CREATE OR REPLACE FUNCTION public.fisc_sei(p_sei TEXT, p_rotulo TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE v TEXT := regexp_replace(COALESCE(p_sei, ''), '\D', '', 'g');
BEGIN
  IF v = '' THEN RETURN NULL; END IF;
  IF v !~ '^[0-9]{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: %: só números, 7 a 10 dígitos.', p_rotulo USING ERRCODE = '22023';
  END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_sei(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisc_sei(TEXT, TEXT) TO service_role;

-- 4a) Decisão do coordenador -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.definir_fiscalizacao_contrato(
  p_contract_key TEXT,
  p_fiscalizacao TEXT,
  p_fiscal_user_id UUID,
  p_substituto_user_id UUID,
  p_portaria_sei TEXT,
  p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uasg      TEXT;
  v_emenda    BOOLEAN;
  v_fiscal    TEXT;
  v_subst     TEXT;
  v_portaria  TEXT := public.fisc_sei(p_portaria_sei, 'Portaria');
  v_motivo    TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_nome      TEXT := left(public.nome_do_usuario_logado(), 200);
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador decide quem fiscaliza o contrato.' USING ERRCODE = '42501';
  END IF;
  IF p_fiscalizacao IS NULL OR p_fiscalizacao NOT IN ('SFC', 'MISTA', 'AREA') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Fiscalização deve ser SFC, MISTA ou AREA.' USING ERRCODE = '22023';
  END IF;
  SELECT c.uasg INTO v_uasg FROM public.contratos_oficiais c WHERE c.contract_key = p_contract_key ORDER BY c.sincronizado_em DESC LIMIT 1;
  IF v_uasg IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Contrato não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  v_emenda := cardinality(public.fisc_emendas_do_contrato(p_contract_key)) > 0;
  -- Fugir do padrão (emenda com a área requisitante, ou contrato sem emenda com a SFC/CGLIC) pede motivo.
  IF (v_emenda AND p_fiscalizacao = 'AREA') OR (NOT v_emenda AND p_fiscalizacao <> 'AREA') THEN
    IF v_motivo IS NULL OR length(v_motivo) < 10 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o motivo (ao menos 10 letras).' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_fiscalizacao = 'AREA' THEN
    IF p_fiscal_user_id IS NOT NULL OR p_substituto_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Contrato com a área requisitante não tem fiscal da SFC/CGLIC.' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_fiscal_user_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha o fiscal.' USING ERRCODE = '22023';
    END IF;
    v_fiscal := public.fisc_nome_do_fiscal(p_fiscal_user_id);
    IF p_substituto_user_id IS NOT NULL THEN
      IF p_substituto_user_id = p_fiscal_user_id THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: O substituto deve ser outra pessoa.' USING ERRCODE = '22023';
      END IF;
      v_subst := public.fisc_nome_do_fiscal(p_substituto_user_id);
    END IF;
  END IF;

  INSERT INTO public.fisc_contratos AS f (contract_key, uasg, fiscalizacao, motivo, fiscal_user_id, fiscal_nome, substituto_user_id, substituto_nome,
                                          portaria_sei, definido_por, definido_por_nome, atualizado_por_nome)
  VALUES (p_contract_key, v_uasg, p_fiscalizacao, v_motivo,
          CASE WHEN p_fiscalizacao = 'AREA' THEN NULL ELSE p_fiscal_user_id END, v_fiscal,
          CASE WHEN p_fiscalizacao = 'AREA' THEN NULL ELSE p_substituto_user_id END, v_subst,
          CASE WHEN p_fiscalizacao = 'AREA' THEN NULL ELSE v_portaria END,
          auth.uid(), v_nome, v_nome)
  ON CONFLICT (contract_key) DO UPDATE
    SET fiscalizacao = EXCLUDED.fiscalizacao, motivo = EXCLUDED.motivo,
        fiscal_user_id = EXCLUDED.fiscal_user_id, fiscal_nome = EXCLUDED.fiscal_nome,
        substituto_user_id = EXCLUDED.substituto_user_id, substituto_nome = EXCLUDED.substituto_nome,
        portaria_sei = COALESCE(EXCLUDED.portaria_sei, CASE WHEN EXCLUDED.fiscalizacao = 'AREA' THEN NULL ELSE f.portaria_sei END),
        processo_sei = CASE WHEN EXCLUDED.fiscalizacao = 'AREA' THEN NULL ELSE f.processo_sei END,
        autuado_em = CASE WHEN EXCLUDED.fiscalizacao = 'AREA' THEN NULL ELSE f.autuado_em END,
        atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();

  RETURN jsonb_build_object('contract_key', p_contract_key, 'fiscalizacao', p_fiscalizacao, 'fiscal', v_fiscal, 'substituto', v_subst);
END;
$$;
REVOKE ALL ON FUNCTION public.definir_fiscalizacao_contrato(TEXT, TEXT, UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.definir_fiscalizacao_contrato(TEXT, TEXT, UUID, UUID, TEXT, TEXT) TO authenticated;

-- 4b) Processo de fiscalização (autuação) ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_processo_fiscalizacao(p_contract_key TEXT, p_processo_sei TEXT, p_autuado_em DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_f    public.fisc_contratos%ROWTYPE;
  v_sei  TEXT := public.fisc_sei(p_processo_sei, 'Processo');
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem permissão para registrar a fiscalização.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_f FROM public.fisc_contratos WHERE contract_key = p_contract_key FOR UPDATE;
  IF NOT FOUND OR v_f.fiscalizacao = 'AREA' THEN
    RAISE EXCEPTION 'NOT_FOUND: Este contrato não está com a SFC/CGLIC.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_role('admin') AND auth.uid() IS DISTINCT FROM v_f.fiscal_user_id AND auth.uid() IS DISTINCT FROM v_f.substituto_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o fiscal, o substituto ou o coordenador registram o processo deste contrato.' USING ERRCODE = '42501';
  END IF;
  IF v_sei IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número SEI do processo.' USING ERRCODE = '22023';
  END IF;
  IF p_autuado_em IS NULL OR p_autuado_em > (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data da autuação (até hoje).' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fisc_contratos
     SET processo_sei = v_sei, autuado_em = p_autuado_em, atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE contract_key = p_contract_key;
  RETURN jsonb_build_object('contract_key', p_contract_key, 'processo_sei', v_sei, 'autuado_em', p_autuado_em);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_processo_fiscalizacao(TEXT, TEXT, DATE) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_processo_fiscalizacao(TEXT, TEXT, DATE) TO authenticated;
