-- ==============================================================================
-- MIGRATION 157: EMENDAS PARLAMENTARES — ENTREGA 2 (PEDIDOS, ETAPAS E TRAVA DE SALDO)
-- Versão: 20261023000157_emendas_pedidos.sql
--
-- Protótipo aprovado em 23/10/2026. A CAEP reserva itens ou kits a um parlamentar; o pedido segue as etapas
-- Reservado → Minuta enviada → Ofício recebido → Conferido no SIOP → Empenho autorizado → Empenhado (com a CCGA).
-- Cancelar devolve o saldo. Depois do empenho a CAEP só acompanha; a entrega fica com o futuro módulo de
-- Fiscalização.
--
-- 1) emenda_pedidos: um pedido (ofício) de um autor, com os dados de cada etapa. A reserva não é documento: é uma
--    conversa da CAEP com a assessoria do parlamentar; por isso guarda o contato (nome, telefone, e-mail). O número
--    interno (numero) não aparece nas telas.
-- 2) emenda_pedido_linhas: item ou kit, quantidade e beneficiário (um ofício pode ter vários beneficiários).
--    Linha de kit guarda a composição do dia (kit_composicao); mudar o kit depois não muda o pedido.
--    Linha tirada do pedido fica marcada como cancelada (histórico), não é apagada.
-- 3) v_emendas_reservado_por_item: quanto de cada item está reservado (pedidos e linhas não cancelados,
--    kits abertos nos itens).
-- 4) Trava de saldo, conferida no fim da transação (gatilhos adiados), dos dois lados:
--    - pedido: o reservado de um item não passa do alocado à CAEP;
--    - alocação: a CAEP não fica com menos do que está reservado. save_allocations_atomic apaga e regrava as
--      unidades do item, por isso a conferência é adiada para o fim da transação, e não por linha.
-- 5) RPCs (emendas.manage): salvar_pedido_emenda, avancar_pedido_emenda, cancelar_pedido_emenda.
--
-- Nada que já existe muda de comportamento, a não ser a nova trava na alocação da CAEP, que só age quando houver
-- pedido. Tabelas novas com "Somente usuario ativo" (124) e auditoria.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Pedidos
-- ------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.emenda_pedidos_numero_seq;

CREATE TABLE IF NOT EXISTS public.emenda_pedidos (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  numero               INTEGER      NOT NULL UNIQUE DEFAULT nextval('public.emenda_pedidos_numero_seq'),
  autor_id             VARCHAR(20)  NOT NULL REFERENCES public.emenda_autores(id),
  etapa                VARCHAR(12)  NOT NULL DEFAULT 'RESERVADO',
  origem               VARCHAR(10)  NOT NULL DEFAULT 'SISTEMA',
  observacao           TEXT,
  contato_nome         VARCHAR(150),
  contato_telefone     VARCHAR(11),
  contato_email        VARCHAR(150),
  reservado_em         DATE         NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE,
  minuta_em            DATE,
  minuta_documento_sei VARCHAR(40),
  oficio_numero        VARCHAR(80),
  oficio_processo_sei  VARCHAR(40),
  oficio_em            DATE,
  divergencia          TEXT,
  siop_emenda          VARCHAR(40),
  siop_valor           NUMERIC(18, 2),
  siop_gnd             VARCHAR(10),
  siop_conferencia     JSONB,
  conferido_em         DATE,
  autorizado_em        DATE,
  autorizado_documento_sei VARCHAR(40),
  empenhado_em         DATE,
  cancelado_em         DATE,
  cancelado_motivo     TEXT,
  versao               INTEGER      NOT NULL DEFAULT 1,
  criado_por           UUID,
  criado_por_nome      VARCHAR(200),
  criado_em            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_por       UUID,
  atualizado_por_nome  VARCHAR(200),
  atualizado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT emenda_pedidos_etapa CHECK (etapa IN ('RESERVADO', 'MINUTA', 'OFICIO', 'CONFERIDO', 'AUTORIZADO', 'EMPENHADO', 'CANCELADO')),
  CONSTRAINT emenda_pedidos_origem CHECK (origem IN ('SISTEMA', 'PLANILHA')),
  CONSTRAINT emenda_pedidos_gnd CHECK (siop_gnd IS NULL OR siop_gnd IN ('GND-3', 'GND-4')),
  CONSTRAINT emenda_pedidos_contato_telefone CHECK (contato_telefone IS NULL OR contato_telefone ~ '^[0-9]{10,11}$'),
  CONSTRAINT emenda_pedidos_contato_email CHECK (contato_email IS NULL OR contato_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
COMMENT ON TABLE public.emenda_pedidos IS
  'Pedido (ofício) de um parlamentar à CAEP, com as etapas até o empenho. Grava só pelas RPCs *_pedido_emenda.';
CREATE INDEX IF NOT EXISTS ix_emenda_pedidos_autor ON public.emenda_pedidos (autor_id);
CREATE INDEX IF NOT EXISTS ix_emenda_pedidos_etapa ON public.emenda_pedidos (etapa);

CREATE TABLE IF NOT EXISTS public.emenda_pedido_linhas (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id        UUID         NOT NULL REFERENCES public.emenda_pedidos(id) ON DELETE CASCADE,
  ordem            INTEGER      NOT NULL DEFAULT 1,
  tipo             VARCHAR(4)   NOT NULL,
  item_key         VARCHAR(100),
  kit_id           UUID         REFERENCES public.emenda_kits(id),
  kit_nome         VARCHAR(120),
  kit_versao       INTEGER,
  kit_composicao   JSONB,
  quantidade       INTEGER      NOT NULL CHECK (quantidade > 0),
  beneficiario_id  UUID         REFERENCES public.emenda_beneficiarios(id),
  nota_empenho     VARCHAR(20),
  cancelada        BOOLEAN      NOT NULL DEFAULT FALSE,
  cancelada_motivo TEXT,
  CONSTRAINT emenda_pedido_linhas_tipo CHECK (
    (tipo = 'ITEM' AND item_key IS NOT NULL AND kit_id IS NULL AND kit_composicao IS NULL)
    OR (tipo = 'KIT' AND item_key IS NULL AND kit_id IS NOT NULL AND jsonb_typeof(kit_composicao) = 'array')
  ),
  CONSTRAINT emenda_pedido_linhas_ne CHECK (nota_empenho IS NULL OR nota_empenho ~ '^[0-9]{4}NE[0-9]{6}$')
);
COMMENT ON TABLE public.emenda_pedido_linhas IS
  'Linha do pedido: item avulso ou N kits (composição do dia em kit_composicao), com o beneficiário. Linha tirada fica cancelada.';
CREATE INDEX IF NOT EXISTS ix_emenda_pedido_linhas_pedido ON public.emenda_pedido_linhas (pedido_id);
CREATE INDEX IF NOT EXISTS ix_emenda_pedido_linhas_item ON public.emenda_pedido_linhas (item_key) WHERE item_key IS NOT NULL;

DO $$
DECLARE v_t TEXT;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['emenda_pedidos', 'emenda_pedido_linhas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Leitura das emendas: ' || v_t, v_t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.has_permission(''emendas.view'')))',
                   'Leitura das emendas: ' || v_t, v_t);
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
REVOKE ALL ON SEQUENCE public.emenda_pedidos_numero_seq FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2) Reservado por item
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_emendas_reservado_por_item
WITH (security_invoker = true) AS
SELECT x.item_key, SUM(x.quantidade)::NUMERIC AS reservado
  FROM (
    SELECT l.item_key, l.quantidade
      FROM public.emenda_pedido_linhas l
      JOIN public.emenda_pedidos p ON p.id = l.pedido_id
     WHERE l.tipo = 'ITEM' AND NOT l.cancelada AND p.etapa <> 'CANCELADO'
    UNION ALL
    SELECT c->>'item_key', l.quantidade * (c->>'quantidade')::INTEGER
      FROM public.emenda_pedido_linhas l
      JOIN public.emenda_pedidos p ON p.id = l.pedido_id
      CROSS JOIN LATERAL jsonb_array_elements(l.kit_composicao) c
     WHERE l.tipo = 'KIT' AND NOT l.cancelada AND p.etapa <> 'CANCELADO'
  ) x
 GROUP BY x.item_key;
COMMENT ON VIEW public.v_emendas_reservado_por_item IS
  'Reservado a parlamentares por item: pedidos e linhas não cancelados, kits abertos pela composição do pedido.';
REVOKE ALL ON public.v_emendas_reservado_por_item FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_emendas_reservado_por_item TO authenticated, service_role;

-- Reservado de um item (lê as tabelas direto, sem RLS: usado pelas travas).
CREATE OR REPLACE FUNCTION public.emendas_reservado_do_item(p_item_key TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(q), 0) FROM (
    SELECT l.quantidade AS q
      FROM public.emenda_pedido_linhas l JOIN public.emenda_pedidos p ON p.id = l.pedido_id
     WHERE l.tipo = 'ITEM' AND l.item_key = p_item_key AND NOT l.cancelada AND p.etapa <> 'CANCELADO'
    UNION ALL
    SELECT l.quantidade * (c->>'quantidade')::INTEGER
      FROM public.emenda_pedido_linhas l JOIN public.emenda_pedidos p ON p.id = l.pedido_id
      CROSS JOIN LATERAL jsonb_array_elements(l.kit_composicao) c
     WHERE l.tipo = 'KIT' AND c->>'item_key' = p_item_key AND NOT l.cancelada AND p.etapa <> 'CANCELADO'
  ) x;
$$;
REVOKE ALL ON FUNCTION public.emendas_reservado_do_item(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emendas_reservado_do_item(TEXT) TO authenticated, service_role;

-- Confere a trava de um item: reservado ≤ alocado à CAEP.
CREATE OR REPLACE FUNCTION public.emendas_conferir_saldo_do_item(p_item_key TEXT, p_origem TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservado NUMERIC := public.emendas_reservado_do_item(p_item_key);
  v_alocado   NUMERIC;
BEGIN
  IF v_reservado = 0 THEN RETURN; END IF;
  SELECT COALESCE(SUM(allocated_qty), 0) INTO v_alocado
    FROM public.arp_allocations WHERE item_key = p_item_key AND unit_name = public.unidade_das_emendas();
  IF v_reservado > v_alocado THEN
    IF p_origem = 'ALOCACAO' THEN
      RAISE EXCEPTION 'EMENDAS_RESERVADAS: A % não pode ficar com menos de %: essa quantidade do item já está reservada a parlamentares no menu Emendas.',
        public.unidade_das_emendas(), trim_scale(v_reservado) USING ERRCODE = '23514';
    ELSE
      RAISE EXCEPTION 'SALDO_INSUFICIENTE: O item % ficaria com % reservados, mas a % tem % alocados. Diminua a quantidade ou peça mais alocação ao gestor de saldo.',
        p_item_key, trim_scale(v_reservado), public.unidade_das_emendas(), trim_scale(v_alocado) USING ERRCODE = '23514';
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_conferir_saldo_do_item(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Itens tocados por uma linha de pedido (item avulso ou itens do kit).
CREATE OR REPLACE FUNCTION public.emendas_itens_da_linha(p_tipo TEXT, p_item_key TEXT, p_composicao JSONB)
RETURNS SETOF TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_item_key WHERE p_tipo = 'ITEM'
  UNION
  SELECT c->>'item_key' FROM jsonb_array_elements(CASE WHEN p_tipo = 'KIT' THEN p_composicao ELSE '[]'::jsonb END) c;
$$;

CREATE OR REPLACE FUNCTION public.trg_emendas_trava_linhas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_item TEXT;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    FOR v_item IN SELECT public.emendas_itens_da_linha(NEW.tipo, NEW.item_key, NEW.kit_composicao) LOOP
      PERFORM public.emendas_conferir_saldo_do_item(v_item, 'PEDIDO');
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_emendas_trava_pedidos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_item TEXT;
BEGIN
  -- Só sair de CANCELADO aumentaria o reservado; as RPCs não deixam, mas a trava confere mesmo assim.
  IF OLD.etapa = 'CANCELADO' AND NEW.etapa <> 'CANCELADO' THEN
    FOR v_item IN
      SELECT DISTINCT i FROM public.emenda_pedido_linhas l, public.emendas_itens_da_linha(l.tipo, l.item_key, l.kit_composicao) i
       WHERE l.pedido_id = NEW.id AND NOT l.cancelada
    LOOP
      PERFORM public.emendas_conferir_saldo_do_item(v_item, 'PEDIDO');
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_emendas_trava_alocacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_item TEXT := COALESCE(OLD.item_key, NEW.item_key);
BEGIN
  IF (TG_OP <> 'INSERT' AND OLD.unit_name = public.unidade_das_emendas())
     OR (TG_OP <> 'DELETE' AND NEW.unit_name = public.unidade_das_emendas()) THEN
    PERFORM public.emendas_conferir_saldo_do_item(v_item, 'ALOCACAO');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_emendas_trava_linhas ON public.emenda_pedido_linhas;
CREATE CONSTRAINT TRIGGER trg_emendas_trava_linhas
  AFTER INSERT OR UPDATE ON public.emenda_pedido_linhas
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_trava_linhas();

DROP TRIGGER IF EXISTS trg_emendas_trava_pedidos ON public.emenda_pedidos;
CREATE CONSTRAINT TRIGGER trg_emendas_trava_pedidos
  AFTER UPDATE ON public.emenda_pedidos
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_trava_pedidos();

DROP TRIGGER IF EXISTS trg_emendas_trava_alocacao ON public.arp_allocations;
CREATE CONSTRAINT TRIGGER trg_emendas_trava_alocacao
  AFTER INSERT OR UPDATE OR DELETE ON public.arp_allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_emendas_trava_alocacao();

DO $$
DECLARE v_f TEXT;
BEGIN
  FOREACH v_f IN ARRAY ARRAY['trg_emendas_trava_linhas()', 'trg_emendas_trava_pedidos()', 'trg_emendas_trava_alocacao()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', v_f);
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3) RPCs
-- ------------------------------------------------------------------------------

-- Monta e grava as linhas de um pedido. Linha que veio com id é atualizada; linha do pedido que não veio fica
-- cancelada (histórico). Devolve se as linhas mudaram.
CREATE OR REPLACE FUNCTION public.emendas_gravar_linhas(p_pedido UUID, p_linhas JSONB, p_motivo TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_l        JSONB;
  v_id       UUID;
  v_tipo     TEXT;
  v_item     TEXT;
  v_kit      UUID;
  v_qtd      INTEGER;
  v_ben      UUID;
  v_kit_row  RECORD;
  v_kit_nome TEXT;
  v_kit_versao INTEGER;
  v_comp     JSONB;
  v_ordem    INTEGER := 0;
  v_mudou    BOOLEAN := FALSE;
  v_ids      UUID[] := '{}';
  v_at_tipo  TEXT;
  v_at_item  TEXT;
  v_at_kit   UUID;
  v_at_comp  JSONB;
  v_at_qtd   INTEGER;
  v_at_nome  TEXT;
  v_at_versao INTEGER;
  v_n        INTEGER;
BEGIN
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o pedido precisa de pelo menos uma linha.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_linhas) > 100 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 100 linhas por pedido.' USING ERRCODE = '22023';
  END IF;

  FOR v_l IN SELECT x FROM jsonb_array_elements(p_linhas) AS e(x) LOOP
    v_ordem := v_ordem + 1;
    v_id   := NULLIF(v_l->>'id', '')::UUID;
    v_tipo := upper(COALESCE(v_l->>'tipo', ''));
    v_qtd  := (v_l->>'quantidade')::INTEGER;
    v_ben  := NULLIF(v_l->>'beneficiario_id', '')::UUID;
    IF v_qtd IS NULL OR v_qtd <= 0 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: cada linha precisa de quantidade inteira maior que zero.' USING ERRCODE = '22023';
    END IF;
    IF v_ben IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.emenda_beneficiarios WHERE id = v_ben AND ativo) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: beneficiário não encontrado ou desativado.' USING ERRCODE = '22023';
    END IF;

    v_at_tipo := NULL; v_at_item := NULL; v_at_kit := NULL; v_at_comp := NULL; v_at_qtd := NULL; v_at_nome := NULL; v_at_versao := NULL;
    IF v_id IS NOT NULL THEN
      SELECT tipo, item_key, kit_id, kit_composicao, quantidade, kit_nome, kit_versao
        INTO v_at_tipo, v_at_item, v_at_kit, v_at_comp, v_at_qtd, v_at_nome, v_at_versao
        FROM public.emenda_pedido_linhas WHERE id = v_id AND pedido_id = p_pedido AND NOT cancelada;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: linha % não pertence a este pedido.', v_id USING ERRCODE = '22023';
      END IF;
    END IF;

    IF v_tipo = 'ITEM' THEN
      v_item := btrim(COALESCE(v_l->>'item_key', ''));
      -- Item novo na linha (ou troca de item) precisa de alocação da CAEP em ata vigente.
      IF v_at_item IS DISTINCT FROM v_item
         AND NOT EXISTS (SELECT 1 FROM public.v_emendas_itens_caep c WHERE c.item_key = v_item AND NOT c.ata_encerrada) THEN
        RAISE EXCEPTION 'ITEM_INVALIDO: O item % não tem alocação da CAEP em ata vigente.', v_item USING ERRCODE = '22023';
      END IF;
      v_kit := NULL; v_comp := NULL; v_kit_nome := NULL; v_kit_versao := NULL;
    ELSIF v_tipo = 'KIT' THEN
      v_kit := NULLIF(v_l->>'kit_id', '')::UUID;
      v_item := NULL;
      IF v_at_kit IS NOT NULL AND v_at_kit = v_kit THEN
        -- Mesmo kit da linha: mantém a composição do dia em que foi pedido.
        v_comp := v_at_comp;
        v_kit_nome := v_at_nome;
        v_kit_versao := v_at_versao;
      ELSE
        SELECT id, nome, versao, ativo INTO v_kit_row FROM public.emenda_kits WHERE id = v_kit;
        IF NOT FOUND OR NOT v_kit_row.ativo THEN
          RAISE EXCEPTION 'KIT_INVALIDO: Kit não encontrado ou desativado.' USING ERRCODE = '22023';
        END IF;
        v_kit_nome := v_kit_row.nome;
        v_kit_versao := v_kit_row.versao;
        SELECT jsonb_agg(jsonb_build_object('item_key', k.item_key, 'quantidade', k.quantidade) ORDER BY k.item_key)
          INTO v_comp FROM public.emenda_kit_itens k WHERE k.kit_id = v_kit;
        IF EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_comp) c
           WHERE NOT EXISTS (SELECT 1 FROM public.v_emendas_itens_caep i WHERE i.item_key = c->>'item_key' AND NOT i.ata_encerrada)
        ) THEN
          RAISE EXCEPTION 'KIT_INDISPONIVEL: O kit % tem item sem alocação da CAEP ou de ata encerrada. Troque o item no kit.', v_kit_nome USING ERRCODE = '22023';
        END IF;
      END IF;
    ELSE
      RAISE EXCEPTION 'INVALID_PAYLOAD: tipo de linha deve ser ITEM ou KIT.' USING ERRCODE = '22023';
    END IF;

    IF v_id IS NULL THEN
      INSERT INTO public.emenda_pedido_linhas (pedido_id, ordem, tipo, item_key, kit_id, kit_nome, kit_versao, kit_composicao, quantidade, beneficiario_id)
      VALUES (p_pedido, v_ordem, v_tipo, v_item, v_kit, v_kit_nome, v_kit_versao, v_comp, v_qtd, v_ben)
      RETURNING id INTO v_id;
      v_mudou := TRUE;
    ELSE
      UPDATE public.emenda_pedido_linhas
         SET ordem = v_ordem, tipo = v_tipo, item_key = v_item, kit_id = v_kit, kit_nome = v_kit_nome,
             kit_versao = v_kit_versao, kit_composicao = v_comp, quantidade = v_qtd, beneficiario_id = v_ben
       WHERE id = v_id
         AND (tipo, item_key, kit_id, kit_composicao, quantidade, beneficiario_id, ordem)
             IS DISTINCT FROM (v_tipo, v_item, v_kit, v_comp, v_qtd, v_ben, v_ordem);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      -- Só mudar o beneficiário ou a ordem não reabre a conferência.
      IF v_n > 0 AND (v_at_tipo, v_at_item, v_at_kit, v_at_comp, v_at_qtd)
                     IS DISTINCT FROM (v_tipo, v_item, v_kit, v_comp, v_qtd) THEN
        v_mudou := TRUE;
      END IF;
    END IF;
    v_ids := v_ids || v_id;
  END LOOP;

  UPDATE public.emenda_pedido_linhas
     SET cancelada = TRUE, cancelada_motivo = COALESCE(NULLIF(btrim(p_motivo), ''), 'Tirada do pedido')
   WHERE pedido_id = p_pedido AND NOT cancelada AND NOT (id = ANY (v_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_mudou OR v_n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_gravar_linhas(UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;

-- p_pedido: { id?, versao? (obrigatória ao alterar), autor_id, observacao, contato_nome?, contato_telefone?, contato_email?,
--   motivo? (das linhas tiradas),
--   linhas: [{ id?, tipo: ITEM|KIT, item_key | kit_id, quantidade, beneficiario_id? }] }.
-- Novo pedido nasce Reservado. Alterar as itens/quantidades de pedido já conferido no SIOP ou com empenho autorizado
-- volta o pedido para "Ofício recebido" (o ofício e a emenda citam os itens antigos). Empenhado ou cancelado não muda.
CREATE OR REPLACE FUNCTION public.salvar_pedido_emenda(p_pedido JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id     UUID;
  v_autor  TEXT;
  v_nome   TEXT;
  v_atual  RECORD;
  v_mudou  BOOLEAN;
  v_versao INTEGER;
  v_numero INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram pedidos.' USING ERRCODE = '42501';
  END IF;
  IF p_pedido IS NULL OR jsonb_typeof(p_pedido) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o pedido deve ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  v_id := NULLIF(p_pedido->>'id', '')::UUID;

  IF v_id IS NULL THEN
    v_autor := btrim(COALESCE(p_pedido->>'autor_id', ''));
    IF NOT EXISTS (SELECT 1 FROM public.emenda_autores WHERE id = v_autor) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: autor não encontrado.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.emenda_pedidos (autor_id, observacao, contato_nome, contato_telefone, contato_email, criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (v_autor, NULLIF(btrim(p_pedido->>'observacao'), ''), NULLIF(btrim(p_pedido->>'contato_nome'), ''),
            NULLIF(regexp_replace(COALESCE(p_pedido->>'contato_telefone', ''), '\D', '', 'g'), ''), NULLIF(lower(btrim(p_pedido->>'contato_email')), ''),
            auth.uid(), v_nome, auth.uid(), v_nome)
    RETURNING id, versao, numero INTO v_id, v_versao, v_numero;
    PERFORM public.emendas_gravar_linhas(v_id, p_pedido->'linhas', NULL);
    RETURN jsonb_build_object('id', v_id, 'versao', v_versao, 'numero', v_numero);
  END IF;

  SELECT * INTO v_atual FROM public.emenda_pedidos WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF (p_pedido->>'versao')::INTEGER IS DISTINCT FROM v_atual.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF v_atual.etapa IN ('EMPENHADO', 'CANCELADO') THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: Pedido % não pode ser alterado.', CASE v_atual.etapa WHEN 'EMPENHADO' THEN 'empenhado' ELSE 'cancelado' END USING ERRCODE = '22023';
  END IF;

  v_mudou := public.emendas_gravar_linhas(v_id, p_pedido->'linhas', p_pedido->>'motivo');

  UPDATE public.emenda_pedidos SET
    observacao = NULLIF(btrim(p_pedido->>'observacao'), ''),
    contato_nome = NULLIF(btrim(p_pedido->>'contato_nome'), ''),
    contato_telefone = NULLIF(regexp_replace(COALESCE(p_pedido->>'contato_telefone', ''), '\D', '', 'g'), ''),
    contato_email = NULLIF(lower(btrim(p_pedido->>'contato_email')), ''),
    etapa = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'AUTORIZADO') THEN 'OFICIO' ELSE etapa END,
    siop_conferencia = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'AUTORIZADO') THEN NULL ELSE siop_conferencia END,
    conferido_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'AUTORIZADO') THEN NULL ELSE conferido_em END,
    autorizado_em = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'AUTORIZADO') THEN NULL ELSE autorizado_em END,
    autorizado_documento_sei = CASE WHEN v_mudou AND etapa IN ('CONFERIDO', 'AUTORIZADO') THEN NULL ELSE autorizado_documento_sei END,
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
  WHERE id = v_id
  RETURNING versao, numero INTO v_versao, v_numero;
  RETURN jsonb_build_object('id', v_id, 'versao', v_versao, 'numero', v_numero);
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_pedido_emenda(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_pedido_emenda(JSONB) TO authenticated;

-- Avança o pedido de etapa. p_acao e p_dados:
--   MINUTA      { data, documento_sei? }                             (de Reservado)
--   OFICIO      { numero, processo_sei, data }                       (de Reservado ou Minuta; também corrige o ofício)
--   DIVERGENCIA { texto }                                            (em Ofício recebido: fica na etapa, com a divergência)
--   CONFERIDO   { emenda, valor, gnd, data, conferencia: {numero_emenda, autor, valor, gnd, beneficiario, objeto} } (de Ofício)
--   AUTORIZADO  { data, documento_sei? }                             (de Conferido)
--   EMPENHADO   { data, notas: [{ linha_id, nota_empenho }] }        (de Autorizado; todas as linhas com nota)
CREATE OR REPLACE FUNCTION public.avancar_pedido_emenda(p_id UUID, p_versao INTEGER, p_acao TEXT, p_dados JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p     RECORD;
  v_nome  TEXT;
  v_acao  TEXT := upper(COALESCE(p_acao, ''));
  v_d     JSONB := COALESCE(p_dados, '{}'::jsonb);
  v_data  DATE;
  v_n     JSONB;
  v_conf  JSONB;
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram as etapas.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  v_data := COALESCE(NULLIF(v_d->>'data', '')::DATE, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE);

  IF v_acao = 'MINUTA' THEN
    IF v_p.etapa <> 'RESERVADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A minuta é registrada em pedido reservado.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'MINUTA', minuta_em = v_data, minuta_documento_sei = NULLIF(btrim(v_d->>'documento_sei'), '') WHERE id = p_id;

  ELSIF v_acao = 'OFICIO' THEN
    IF v_p.etapa NOT IN ('RESERVADO', 'MINUTA', 'OFICIO') THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O ofício é registrado antes da conferência com o SIOP.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_d->>'numero'), '') = '' OR COALESCE(btrim(v_d->>'processo_sei'), '') = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o número do ofício e o processo SEI.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'OFICIO', oficio_numero = left(btrim(v_d->>'numero'), 80),
           oficio_processo_sei = left(btrim(v_d->>'processo_sei'), 40), oficio_em = v_data, divergencia = NULL WHERE id = p_id;

  ELSIF v_acao = 'DIVERGENCIA' THEN
    IF v_p.etapa <> 'OFICIO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A divergência é registrada na conferência do ofício.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_d->>'texto'), '') = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: descreva o que não bate.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET divergencia = btrim(v_d->>'texto') WHERE id = p_id;

  ELSIF v_acao = 'CONFERIDO' THEN
    IF v_p.etapa <> 'OFICIO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A conferência com o SIOP vem depois do ofício.' USING ERRCODE = '22023';
    END IF;
    v_conf := v_d->'conferencia';
    IF v_conf IS NULL OR EXISTS (
      SELECT 1 FROM unnest(ARRAY['numero_emenda', 'autor', 'valor', 'gnd', 'beneficiario', 'objeto']) k
       WHERE (v_conf->>k)::BOOLEAN IS NOT TRUE
    ) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: os 6 pontos da conferência (nº da emenda, autor, valor, GND, beneficiário e objeto) precisam bater.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_d->>'emenda'), '') = '' OR (v_d->>'gnd') NOT IN ('GND-3', 'GND-4') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o número da emenda e o GND.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = p_id AND NOT cancelada AND beneficiario_id IS NULL) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: todas as linhas precisam de beneficiário antes da conferência.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'CONFERIDO', siop_emenda = left(btrim(v_d->>'emenda'), 40),
           siop_valor = NULLIF(v_d->>'valor', '')::NUMERIC, siop_gnd = v_d->>'gnd', siop_conferencia = v_conf,
           conferido_em = v_data, divergencia = NULL WHERE id = p_id;

  ELSIF v_acao = 'AUTORIZADO' THEN
    IF v_p.etapa <> 'CONFERIDO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A autorização de empenho vem depois da conferência.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'AUTORIZADO', autorizado_em = v_data,
           autorizado_documento_sei = NULLIF(btrim(v_d->>'documento_sei'), '') WHERE id = p_id;

  ELSIF v_acao = 'EMPENHADO' THEN
    IF v_p.etapa <> 'AUTORIZADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O empenho vem depois da autorização.' USING ERRCODE = '22023';
    END IF;
    FOR v_n IN SELECT x FROM jsonb_array_elements(COALESCE(v_d->'notas', '[]'::jsonb)) AS e(x) LOOP
      IF upper(btrim(COALESCE(v_n->>'nota_empenho', ''))) !~ '^[0-9]{4}NE[0-9]{6}$' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: nota de empenho inválida: % (formato 2026NE000123).', v_n->>'nota_empenho' USING ERRCODE = '22023';
      END IF;
      UPDATE public.emenda_pedido_linhas SET nota_empenho = upper(btrim(v_n->>'nota_empenho'))
       WHERE id = (v_n->>'linha_id')::UUID AND pedido_id = p_id AND NOT cancelada;
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = p_id AND NOT cancelada AND nota_empenho IS NULL) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe a nota de empenho de todas as linhas.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'EMPENHADO', empenhado_em = v_data WHERE id = p_id;

  ELSE
    RAISE EXCEPTION 'INVALID_PAYLOAD: ação desconhecida: %.', p_acao USING ERRCODE = '22023';
  END IF;

  UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.avancar_pedido_emenda(UUID, INTEGER, TEXT, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.avancar_pedido_emenda(UUID, INTEGER, TEXT, JSONB) TO authenticated;

-- Cancela o pedido inteiro (antes do empenho): a quantidade volta ao saldo da CAEP.
CREATE OR REPLACE FUNCTION public.cancelar_pedido_emenda(p_id UUID, p_versao INTEGER, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p RECORD;
  v_nome TEXT;
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador cancelam pedidos.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF v_p.etapa IN ('EMPENHADO', 'CANCELADO') THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: Pedido % não pode ser cancelado.', CASE v_p.etapa WHEN 'EMPENHADO' THEN 'empenhado' ELSE 'já cancelado' END USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o motivo do cancelamento.' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  UPDATE public.emenda_pedidos
     SET etapa = 'CANCELADO', cancelado_em = (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE, cancelado_motivo = left(btrim(p_motivo), 500),
         versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.cancelar_pedido_emenda(UUID, INTEGER, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_emenda(UUID, INTEGER, TEXT) TO authenticated;
