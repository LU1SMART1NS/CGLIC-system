-- ==============================================================================
-- MIGRATION 206: EMENDAS SEM PEDIDO (protótipo aprovado em 26/10/2026)
-- Versão: 20261026000206_emendas_sem_pedido.sql (renumerada: a 205 em produção é emendas_sobra_senasp)
--
-- O parlamentar pode indicar a emenda no SIOP antes de falar com a CAEP. Até aqui o nº da emenda só existia dentro do
-- pedido (conferência com o SIOP), e a emenda sem pedido não aparecia em lugar nenhum.
--
-- 1) emendas_siop: a emenda que a CAEP viu no SIOP (ano, nº de 8 dígitos, parlamentar, valor, GND, beneficiário e
--    objeto quando o SIOP traz). Um registro por ano + nº.
-- 2) emenda_pedidos.emenda_id: o pedido criado a partir da emenda. Na conferência com o SIOP, o nº conferido religa o
--    pedido à emenda registrada com o mesmo nº (gatilho trg_emendas_pedido_liga_emenda).
-- 3) emenda_siop_contatos: as conversas com a assessoria do parlamentar e com as ASPAR dos órgãos até sair o pedido.
-- 4) emenda_aspar: a assessoria parlamentar de cada órgão estadual (PM, BM, PC, PCI, SSP) por UF.
-- 5) RPCs: salvar_emenda_siop, apagar_emenda_siop, registrar_contato_emenda, salvar_aspar_emenda; salvar_pedido_emenda
--    aceita emenda_id no pedido novo.
--
-- Leitura: emendas_siop como as outras tabelas de Emendas (emendas.view). Contatos e ASPAR só para quem trata com
-- eles, coordenador e gestor de emendas (emendas.manage), como o contato da assessoria no pedido (decisão de 25/10/2026).
-- Gravação só pelas RPCs, com emendas.manage.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Emendas vistas no SIOP
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emendas_siop (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ano                 SMALLINT      NOT NULL CHECK (ano BETWEEN 2015 AND 2100),
  numero              CHAR(8)       NOT NULL CHECK (numero ~ '^[0-9]{8}$'),
  autor_id            VARCHAR(20)   NOT NULL REFERENCES public.emenda_autores(id),
  valor               NUMERIC(18, 2) NOT NULL CHECK (valor > 0),
  gnd                 VARCHAR(10)   NOT NULL CHECK (gnd IN ('GND-3', 'GND-4')),
  beneficiario_id     UUID          REFERENCES public.emenda_beneficiarios(id),
  objeto              TEXT,
  vista_em            DATE          NOT NULL,
  observacao          TEXT,
  versao              INTEGER       NOT NULL DEFAULT 1,
  criado_por          UUID,
  criado_por_nome     VARCHAR(200),
  criado_em           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_por      UUID,
  atualizado_por_nome VARCHAR(200),
  atualizado_em       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT emendas_siop_numero_unico UNIQUE (ano, numero)
);
COMMENT ON TABLE public.emendas_siop IS
  'Emendas que a CAEP viu no SIOP, com ou sem pedido. Grava só salvar_emenda_siop e apagar_emenda_siop (migration 205).';
CREATE INDEX IF NOT EXISTS ix_emendas_siop_autor ON public.emendas_siop (autor_id);

-- ------------------------------------------------------------------------------
-- 2) Pedido ligado à emenda
-- ------------------------------------------------------------------------------
ALTER TABLE public.emenda_pedidos ADD COLUMN IF NOT EXISTS emenda_id UUID REFERENCES public.emendas_siop(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.emenda_pedidos.emenda_id IS
  'Emenda registrada (emendas_siop) de onde o pedido nasceu, ou a do nº conferido no SIOP (migration 205).';
CREATE INDEX IF NOT EXISTS ix_emenda_pedidos_emenda ON public.emenda_pedidos (emenda_id) WHERE emenda_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3) Contatos até sair o pedido
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_siop_contatos (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  emenda_id       UUID         NOT NULL REFERENCES public.emendas_siop(id) ON DELETE CASCADE,
  contato_em      DATE         NOT NULL,
  com_quem        VARCHAR(150) NOT NULL CHECK (btrim(com_quem) <> ''),
  meio            VARCHAR(10)  NOT NULL CHECK (meio IN ('TELEFONE', 'WHATSAPP', 'EMAIL', 'REUNIAO')),
  resumo          TEXT         NOT NULL CHECK (btrim(resumo) <> ''),
  criado_por      UUID,
  criado_por_nome VARCHAR(200),
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.emenda_siop_contatos IS
  'Conversas da CAEP sobre a emenda sem pedido (assessoria do parlamentar e ASPAR dos órgãos). Grava só registrar_contato_emenda.';
CREATE INDEX IF NOT EXISTS ix_emenda_siop_contatos_emenda ON public.emenda_siop_contatos (emenda_id);

-- ------------------------------------------------------------------------------
-- 4) ASPAR dos órgãos estaduais
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_aspar (
  uf                  CHAR(2)      NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
  orgao               VARCHAR(4)   NOT NULL CHECK (orgao IN ('PM', 'BM', 'PC', 'PCI', 'SSP')),
  nome                VARCHAR(150) NOT NULL CHECK (btrim(nome) <> ''),
  cargo               VARCHAR(100),
  telefone            VARCHAR(11)  CHECK (telefone IS NULL OR telefone ~ '^[0-9]{10,11}$'),
  whatsapp            BOOLEAN      NOT NULL DEFAULT FALSE,
  email               VARCHAR(150) CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  atualizado_por      UUID,
  atualizado_por_nome VARCHAR(200),
  atualizado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (uf, orgao)
);
COMMENT ON TABLE public.emenda_aspar IS
  'Assessoria parlamentar de cada órgão estadual (PM, BM, PC, PCI, SSP) por UF, para a CAEP falar sobre as emendas. Grava só salvar_aspar_emenda.';

-- Leitura, trava de usuário desativado e auditoria, como nas outras tabelas de Emendas.
DO $$
DECLARE
  v_t TEXT;
  v_perm TEXT;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['emendas_siop', 'emenda_siop_contatos', 'emenda_aspar'] LOOP
    v_perm := CASE WHEN v_t = 'emendas_siop' THEN 'emendas.view' ELSE 'emendas.manage' END;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Leitura das emendas: ' || v_t, v_t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.has_permission(%L)))',
                   'Leitura das emendas: ' || v_t, v_t, v_perm);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Somente usuario ativo', v_t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
                   'USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()))', 'Somente usuario ativo', v_t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v_t);
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_audit_' || v_t, v_t);
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
                     'FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture()', 'trg_audit_' || v_t, v_t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 5) RPCs
-- ------------------------------------------------------------------------------

-- Nº da emenda como no SIOP: aceita "2026 4268 0021" (ano + 8 dígitos) ou só os 8 dígitos com o ano à parte.
CREATE OR REPLACE FUNCTION public.emendas_numero_e_ano(p_numero TEXT, p_ano INTEGER)
RETURNS TABLE (numero CHAR(8), ano SMALLINT)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dig TEXT := regexp_replace(COALESCE(p_numero, ''), '\D', '', 'g');
BEGIN
  IF length(v_dig) = 12 THEN
    IF p_ano IS NOT NULL AND p_ano <> left(v_dig, 4)::INTEGER THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: o ano do nº (%) é diferente do ano informado (%).', left(v_dig, 4), p_ano USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT right(v_dig, 8)::CHAR(8), left(v_dig, 4)::SMALLINT;
  ELSIF length(v_dig) = 8 THEN
    IF p_ano IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o ano da emenda.' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_dig::CHAR(8), p_ano::SMALLINT;
  ELSE
    RAISE EXCEPTION 'INVALID_PAYLOAD: o nº da emenda tem 8 dígitos (4 do autor e 4 da emenda), com ou sem o ano na frente.' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_numero_e_ano(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emendas_numero_e_ano(TEXT, INTEGER) TO authenticated, service_role;

-- Registrar ou alterar a emenda vista no SIOP.
-- p: { id?, versao? (obrigatória ao alterar), numero, ano?, autor_id, valor, gnd, beneficiario_id?, objeto?, vista_em, observacao? }
-- Recusa nº que já tem pedido (a emenda já não está "sem pedido": abra o pedido). Com pedido ligado, o nº não muda.
CREATE OR REPLACE FUNCTION public.salvar_emenda_siop(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id      UUID;
  v_nome    TEXT;
  v_numero  CHAR(8);
  v_ano     SMALLINT;
  v_autor   TEXT;
  v_valor   NUMERIC;
  v_gnd     TEXT;
  v_benef   UUID;
  v_vista   DATE;
  v_atual   RECORD;
  v_pedido  TEXT;
  v_versao  INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram emendas.' USING ERRCODE = '42501';
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a emenda deve ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  v_id := NULLIF(p->>'id', '')::UUID;
  SELECT n.numero, n.ano INTO v_numero, v_ano FROM public.emendas_numero_e_ano(p->>'numero', NULLIF(p->>'ano', '')::INTEGER) n;
  v_autor := NULLIF(btrim(COALESCE(p->>'autor_id', '')), '');
  IF v_autor IS NULL OR NOT EXISTS (SELECT 1 FROM public.emenda_autores WHERE id = v_autor) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o parlamentar ou a bancada.' USING ERRCODE = '22023';
  END IF;
  v_valor := NULLIF(p->>'valor', '')::NUMERIC;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o valor da emenda no SIOP.' USING ERRCODE = '22023';
  END IF;
  v_gnd := p->>'gnd';
  IF v_gnd IS NULL OR v_gnd NOT IN ('GND-3', 'GND-4') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o GND (3 ou 4).' USING ERRCODE = '22023';
  END IF;
  v_benef := NULLIF(p->>'beneficiario_id', '')::UUID;
  IF v_benef IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.emenda_beneficiarios WHERE id = v_benef) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: beneficiário não encontrado.' USING ERRCODE = '22023';
  END IF;
  v_vista := COALESCE(NULLIF(p->>'vista_em', '')::DATE, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE);
  IF v_vista > (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a data em que a emenda foi vista no SIOP não pode ser futura.' USING ERRCODE = '22023';
  END IF;

  -- Já há pedido com este nº (conferido no SIOP) e sem emenda registrada: é a emenda daquele pedido.
  -- O nº interno do pedido não aparece nas telas: a mensagem cita o processo SEI ou a data da reserva.
  SELECT COALESCE('Processo ' || pe.oficio_processo_sei, 'reservado em ' || to_char(pe.reservado_em, 'DD/MM/YYYY')) INTO v_pedido
    FROM public.emenda_pedidos pe
   WHERE pe.etapa <> 'CANCELADO' AND pe.siop_emenda = v_numero AND COALESCE(pe.siop_emenda_ano, v_ano) = v_ano
     AND (pe.emenda_id IS NULL OR pe.emenda_id IS DISTINCT FROM v_id)
   ORDER BY pe.numero LIMIT 1;
  IF v_pedido IS NOT NULL THEN
    RAISE EXCEPTION 'JA_TEM_PEDIDO: A emenda % % já tem pedido (%). Abra o pedido em vez de registrar a emenda.',
      left(v_numero, 4), right(v_numero, 4), v_pedido USING ERRCODE = '23505';
  END IF;

  IF v_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.emendas_siop WHERE ano = v_ano AND numero = v_numero) THEN
      RAISE EXCEPTION 'JA_REGISTRADA: A emenda % % de % já está registrada.', left(v_numero, 4), right(v_numero, 4), v_ano USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.emendas_siop (ano, numero, autor_id, valor, gnd, beneficiario_id, objeto, vista_em, observacao,
                                     criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (v_ano, v_numero, v_autor, v_valor, v_gnd, v_benef, NULLIF(btrim(p->>'objeto'), ''), v_vista, NULLIF(btrim(p->>'observacao'), ''),
            auth.uid(), v_nome, auth.uid(), v_nome)
    RETURNING id, versao INTO v_id, v_versao;
    RETURN jsonb_build_object('id', v_id, 'versao', v_versao);
  END IF;

  SELECT * INTO v_atual FROM public.emendas_siop WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Emenda não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF (p->>'versao')::INTEGER IS DISTINCT FROM v_atual.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou esta emenda. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF (v_numero, v_ano) IS DISTINCT FROM (v_atual.numero, v_atual.ano) THEN
    IF EXISTS (SELECT 1 FROM public.emenda_pedidos WHERE emenda_id = v_id AND etapa <> 'CANCELADO') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: a emenda já tem pedido; o nº não muda.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.emendas_siop WHERE ano = v_ano AND numero = v_numero AND id <> v_id) THEN
      RAISE EXCEPTION 'JA_REGISTRADA: A emenda % % de % já está registrada.', left(v_numero, 4), right(v_numero, 4), v_ano USING ERRCODE = '23505';
    END IF;
  END IF;
  UPDATE public.emendas_siop SET
    ano = v_ano, numero = v_numero, autor_id = v_autor, valor = v_valor, gnd = v_gnd, beneficiario_id = v_benef,
    objeto = NULLIF(btrim(p->>'objeto'), ''), vista_em = v_vista, observacao = NULLIF(btrim(p->>'observacao'), ''),
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
  WHERE id = v_id
  RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', v_id, 'versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_emenda_siop(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_emenda_siop(JSONB) TO authenticated;

-- Apagar a emenda registrada por engano: só sem pedido. Os contatos vão junto.
CREATE OR REPLACE FUNCTION public.apagar_emenda_siop(p_id UUID, p_versao INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador apagam emendas.' USING ERRCODE = '42501';
  END IF;
  SELECT versao INTO v_versao FROM public.emendas_siop WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Emenda não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou esta emenda. Recarregue e tente de novo.' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.emenda_pedidos WHERE emenda_id = p_id AND etapa <> 'CANCELADO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a emenda já tem pedido e não pode ser apagada.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.emendas_siop WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.apagar_emenda_siop(UUID, INTEGER) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apagar_emenda_siop(UUID, INTEGER) TO authenticated;

-- Registrar uma conversa sobre a emenda. p: { contato_em, com_quem, meio (TELEFONE|WHATSAPP|EMAIL|REUNIAO), resumo }
CREATE OR REPLACE FUNCTION public.registrar_contato_emenda(p_emenda_id UUID, p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id   UUID;
  v_data DATE;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram contatos.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.emendas_siop WHERE id = p_emenda_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: Emenda não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  v_data := COALESCE(NULLIF(p->>'contato_em', '')::DATE, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE);
  IF v_data > (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a data do contato não pode ser futura.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(p->>'com_quem', '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: diga com quem foi o contato.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p->>'meio', '') NOT IN ('TELEFONE', 'WHATSAPP', 'EMAIL', 'REUNIAO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha como foi o contato.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(p->>'resumo', '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escreva o que ficou combinado.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.emenda_siop_contatos (emenda_id, contato_em, com_quem, meio, resumo, criado_por, criado_por_nome)
  VALUES (p_emenda_id, v_data, left(btrim(p->>'com_quem'), 150), p->>'meio', btrim(p->>'resumo'), auth.uid(), left(public.nome_do_usuario_logado(), 200))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_contato_emenda(UUID, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_contato_emenda(UUID, JSONB) TO authenticated;

-- Contato da ASPAR de um órgão na UF. p: { uf, orgao, nome, cargo?, telefone?, whatsapp?, email? }. Nome vazio apaga.
CREATE OR REPLACE FUNCTION public.salvar_aspar_emenda(p JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uf    TEXT := upper(btrim(COALESCE(p->>'uf', '')));
  v_orgao TEXT := upper(btrim(COALESCE(p->>'orgao', '')));
  v_nome  TEXT := NULLIF(btrim(COALESCE(p->>'nome', '')), '');
  v_tel   TEXT := NULLIF(regexp_replace(COALESCE(p->>'telefone', ''), '\D', '', 'g'), '');
  v_quem  TEXT;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador alteram as ASPAR.' USING ERRCODE = '42501';
  END IF;
  IF v_uf !~ '^[A-Z]{2}$' OR v_orgao NOT IN ('PM', 'BM', 'PC', 'PCI', 'SSP') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha a UF e o órgão (PM, BM, PC, PCI ou SSP).' USING ERRCODE = '22023';
  END IF;
  IF v_nome IS NULL THEN
    DELETE FROM public.emenda_aspar WHERE uf = v_uf AND orgao = v_orgao;
    RETURN;
  END IF;
  IF v_tel IS NOT NULL AND v_tel !~ '^[0-9]{10,11}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o telefone tem DDD e 8 ou 9 dígitos.' USING ERRCODE = '22023';
  END IF;
  v_quem := left(public.nome_do_usuario_logado(), 200);
  INSERT INTO public.emenda_aspar AS a (uf, orgao, nome, cargo, telefone, whatsapp, email, atualizado_por, atualizado_por_nome, atualizado_em)
  VALUES (v_uf, v_orgao, left(v_nome, 150), NULLIF(btrim(COALESCE(p->>'cargo', '')), ''), v_tel, COALESCE((p->>'whatsapp')::BOOLEAN, FALSE),
          NULLIF(lower(btrim(COALESCE(p->>'email', ''))), ''), auth.uid(), v_quem, NOW())
  ON CONFLICT (uf, orgao) DO UPDATE SET
    nome = EXCLUDED.nome, cargo = EXCLUDED.cargo, telefone = EXCLUDED.telefone, whatsapp = EXCLUDED.whatsapp, email = EXCLUDED.email,
    atualizado_por = EXCLUDED.atualizado_por, atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_aspar_emenda(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_aspar_emenda(JSONB) TO authenticated;

-- Na conferência com o SIOP, o nº conferido liga o pedido à emenda registrada com o mesmo nº (e ano, quando o pedido
-- tem). Nº diferente da emenda de onde o pedido nasceu desliga: aquela emenda volta a "sem pedido" e aparece no aviso.
CREATE OR REPLACE FUNCTION public.trg_emendas_pedido_liga_emenda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emenda UUID;
BEGIN
  IF NEW.siop_emenda IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT e.id INTO v_emenda
    FROM public.emendas_siop e
   WHERE e.numero = NEW.siop_emenda AND (NEW.siop_emenda_ano IS NULL OR e.ano = NEW.siop_emenda_ano)
   ORDER BY (e.id = NEW.emenda_id) DESC, e.ano DESC
   LIMIT 1;
  NEW.emenda_id := v_emenda;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_emendas_pedido_liga_emenda() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_emendas_pedido_liga_emenda ON public.emenda_pedidos;
CREATE TRIGGER trg_emendas_pedido_liga_emenda
  BEFORE INSERT OR UPDATE OF siop_emenda, siop_emenda_ano ON public.emenda_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_pedido_liga_emenda();

-- ------------------------------------------------------------------------------
-- salvar_pedido_emenda: igual à da migration 204 (sobra das emendas), mais emenda_id no pedido novo
-- (p_pedido.emenda_id: a emenda registrada de onde o pedido nasce). CREATE OR REPLACE mantém as permissões.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salvar_pedido_emenda(p_pedido JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_id     UUID;
  v_autor  TEXT;
  v_orgao  BOOLEAN;
  v_nome   TEXT;
  v_atual  RECORD;
  v_mudou  BOOLEAN;
  v_versao INTEGER;
  v_numero INTEGER;
  v_sobra  JSONB := p_pedido->'emenda_da_sobra';
  v_emenda TEXT;
  v_ano    INTEGER;
  v_da_emenda UUID;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram pedidos.' USING ERRCODE = '42501';
  END IF;
  IF p_pedido IS NULL OR jsonb_typeof(p_pedido) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o pedido deve ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  v_id := NULLIF(p_pedido->>'id', '')::UUID;
  v_autor := NULLIF(btrim(COALESCE(p_pedido->>'autor_id', '')), '');
  v_orgao := COALESCE((p_pedido->>'para_orgao')::BOOLEAN, FALSE);
  IF v_autor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.emenda_autores WHERE id = v_autor) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: autor não encontrado.' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    IF v_autor IS NULL AND NOT v_orgao THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o parlamentar ou a bancada, ou marque a reserva para um órgão.' USING ERRCODE = '22023';
    END IF;
    IF v_autor IS NOT NULL AND v_orgao THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: reserva para um órgão não tem parlamentar.' USING ERRCODE = '22023';
    END IF;
    -- Pedido criado a partir da emenda registrada (migration 205): mesmo parlamentar da emenda.
    v_da_emenda := NULLIF(p_pedido->>'emenda_id', '')::UUID;
    IF v_da_emenda IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.emendas_siop WHERE id = v_da_emenda AND autor_id = v_autor) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: a emenda escolhida não é deste parlamentar.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.emenda_pedidos (autor_id, emenda_id, observacao, contato_nome, contato_telefone, contato_email, criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (v_autor, v_da_emenda, NULLIF(btrim(p_pedido->>'observacao'), ''), NULLIF(btrim(p_pedido->>'contato_nome'), ''),
            NULLIF(regexp_replace(COALESCE(p_pedido->>'contato_telefone', ''), '\D', '', 'g'), ''), NULLIF(lower(btrim(p_pedido->>'contato_email')), ''),
            auth.uid(), v_nome, auth.uid(), v_nome)
    RETURNING id, versao, numero INTO v_id, v_versao, v_numero;
    -- Pedido com a sobra de uma emenda (migration 204): já nasce com o número dela, que precisa ser de outro pedido
    -- do mesmo parlamentar. A conferência no SIOP confirma o número depois, como em qualquer pedido.
    IF v_sobra IS NOT NULL AND jsonb_typeof(v_sobra) = 'object' THEN
      v_emenda := regexp_replace(COALESCE(v_sobra->>'numero', ''), '\D', '', 'g');
      v_ano := CASE WHEN COALESCE(v_sobra->>'ano', '') ~ '^[0-9]{4}$' THEN (v_sobra->>'ano')::INTEGER END;
      IF v_emenda !~ '^[0-9]{8}$' OR v_ano IS NULL OR v_autor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.emenda_pedidos o
         WHERE o.id <> v_id AND o.autor_id = v_autor AND o.etapa <> 'CANCELADO' AND o.siop_emenda = v_emenda AND o.siop_emenda_ano = v_ano
      ) THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: a emenda da sobra não está em outro pedido deste parlamentar.' USING ERRCODE = '22023';
      END IF;
      UPDATE public.emenda_pedidos SET siop_emenda = v_emenda, siop_emenda_ano = v_ano WHERE id = v_id;
    END IF;
    PERFORM public.emendas_gravar_linhas(v_id, p_pedido->'linhas', NULL);
    IF v_autor IS NULL AND EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = v_id AND NOT cancelada AND beneficiario_id IS NULL) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: na reserva para um órgão, todas as linhas precisam do beneficiário.' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('id', v_id, 'versao', v_versao, 'numero', v_numero);
  END IF;

  SELECT * INTO v_atual FROM public.emenda_pedidos WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF (p_pedido->>'versao')::INTEGER IS DISTINCT FROM v_atual.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF v_atual.etapa IN ('EMPENHADO', 'CONTRATACAO', 'CANCELADO') THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: Pedido % não pode ser alterado.', CASE v_atual.etapa WHEN 'CANCELADO' THEN 'cancelado' ELSE 'empenhado' END USING ERRCODE = '22023';
  END IF;
  IF v_autor IS NOT NULL AND v_atual.autor_id IS NOT NULL AND v_autor <> v_atual.autor_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o autor do pedido não muda. Cancele e faça uma nova reserva.' USING ERRCODE = '22023';
  END IF;

  v_mudou := public.emendas_gravar_linhas(v_id, p_pedido->'linhas', p_pedido->>'motivo');
  IF COALESCE(v_autor, v_atual.autor_id) IS NULL
     AND EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = v_id AND NOT cancelada AND beneficiario_id IS NULL AND beneficiario_nome IS NULL) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: na reserva para um órgão, todas as linhas precisam do beneficiário.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.emenda_pedidos SET
    autor_id = COALESCE(autor_id, v_autor),
    observacao = NULLIF(btrim(p_pedido->>'observacao'), ''),
    contato_nome = NULLIF(btrim(p_pedido->>'contato_nome'), ''),
    contato_telefone = NULLIF(regexp_replace(COALESCE(p_pedido->>'contato_telefone', ''), '\D', '', 'g'), ''),
    contato_email = NULLIF(lower(btrim(p_pedido->>'contato_email')), ''),
    etapa = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN 'OFICIO' ELSE etapa END,
    siop_conferencia = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE siop_conferencia END,
    conferido_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE conferido_em END,
    solicitado_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE solicitado_em END,
    solicitado_documento_sei = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE solicitado_documento_sei END,
    autorizado_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE autorizado_em END,
    autorizado_documento_sei = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE autorizado_documento_sei END,
    cgofi_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE cgofi_em END,
    cgofi_documento_sei = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI') THEN NULL ELSE cgofi_documento_sei END,
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
  WHERE id = v_id
  RETURNING versao, numero INTO v_versao, v_numero;
  RETURN jsonb_build_object('id', v_id, 'versao', v_versao, 'numero', v_numero);
END;
$function$;
