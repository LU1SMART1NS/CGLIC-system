-- ==============================================================================
-- MIGRATION 243: TODO PEDIDO NASCE COM A EMENDA (protótipo aprovado em 29/10/2026, D1–D7)
-- Versão: 20261029000243_emendas_emenda_desde_a_reserva.sql
--
-- O nº da emenda é conhecido desde a reserva e sai na minuta do ofício. Até aqui o pedido nascia sem emenda e só ganhava o
-- nº na conferência com o SIOP ("Reserva de 24/10/2026", "Emenda a informar").
--
-- 1) emendas_siop.valor e .gnd opcionais (D2): a CAEP registra a emenda pelo nº e ano na reserva; o valor e o GND do SIOP
--    vêm na conferência.
-- 2) emenda_pedido_trocas_emenda: a troca da emenda na conferência, com o motivo (D5).
-- 3) salvar_pedido_emenda: pedido novo só com parlamentar e emenda (D1: sem reserva para órgão); nasce com o nº e o ano da
--    emenda, e com eles o número no parlamentar (1/2026). Pedido antigo sem emenda só grava informando a emenda.
-- 4) salvar_emenda_siop: valor e GND opcionais.
-- 5) ligar_reserva_a_emenda (242): grava também o nº e o ano.
-- 6) registrar_anulacao_empenho (D6): o pedido fica com a emenda.
-- 7) avancar_pedido_emenda, CONFERIDO (D5): trocar a emenda pede o motivo; a emenda sem valor recebe o valor aqui.
--
-- O limite do valor a indicar na reserva (D3) é conferido na tela, pelo preço previsto, como na conferência do ofício.
-- Os pedidos antigos sem emenda (passagem, D7) são ligados à parte, com autorização.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Valor e GND da emenda opcionais
-- ------------------------------------------------------------------------------
ALTER TABLE public.emendas_siop ALTER COLUMN valor DROP NOT NULL;
ALTER TABLE public.emendas_siop ALTER COLUMN gnd DROP NOT NULL;
COMMENT ON COLUMN public.emendas_siop.valor IS
  'Valor da emenda no SIOP (compra direta). Nulo = registrada na reserva pelo nº e ano, a ler no SIOP (migration 243).';

-- ------------------------------------------------------------------------------
-- 2) Troca da emenda na conferência
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_pedido_trocas_emenda (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id       UUID NOT NULL REFERENCES public.emenda_pedidos(id) ON DELETE CASCADE,
  de_numero       CHAR(8) NOT NULL,
  de_ano          SMALLINT NOT NULL,
  para_numero     CHAR(8) NOT NULL,
  para_ano        SMALLINT NOT NULL,
  motivo          TEXT NOT NULL CHECK (btrim(motivo) <> ''),
  criado_por      UUID,
  criado_por_nome VARCHAR(200),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_emenda_pedido_trocas_emenda_pedido ON public.emenda_pedido_trocas_emenda (pedido_id);
COMMENT ON TABLE public.emenda_pedido_trocas_emenda IS
  'Troca da emenda do pedido na conferência com o SIOP, com o motivo (migration 243). Grava só por avancar_pedido_emenda.';

ALTER TABLE public.emenda_pedido_trocas_emenda ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura das emendas: emenda_pedido_trocas_emenda" ON public.emenda_pedido_trocas_emenda;
CREATE POLICY "Leitura das emendas: emenda_pedido_trocas_emenda" ON public.emenda_pedido_trocas_emenda
  FOR SELECT TO authenticated USING ((SELECT public.has_permission('emendas.view')));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.emenda_pedido_trocas_emenda;
CREATE POLICY "Somente usuario ativo" ON public.emenda_pedido_trocas_emenda AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.emenda_pedido_trocas_emenda FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.emenda_pedido_trocas_emenda TO authenticated;
GRANT ALL ON public.emenda_pedido_trocas_emenda TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_emenda_pedido_trocas_emenda ON public.emenda_pedido_trocas_emenda;
    CREATE TRIGGER trg_audit_emenda_pedido_trocas_emenda AFTER INSERT OR UPDATE OR DELETE ON public.emenda_pedido_trocas_emenda
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- Emenda do pedido (usada por salvar_pedido_emenda)
-- ------------------------------------------------------------------------------

-- A emenda do pedido novo (ou do pedido antigo que ainda não tem): a registrada (p_emenda_id) ou a do nº e ano digitados
-- (p_nova: { numero, ano, valor?, gnd? }). Nº e ano que já existem usam a emenda registrada, se for do mesmo parlamentar;
-- senão a emenda é registrada aqui, com o valor e o GND quando a CAEP já tem (D2: podem ficar para a conferência).
CREATE OR REPLACE FUNCTION public.emendas_emenda_do_pedido(p_autor TEXT, p_emenda_id UUID, p_nova JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id     UUID;
  v_autor  TEXT;
  v_numero CHAR(8);
  v_ano    SMALLINT;
  v_valor  NUMERIC;
  v_gnd    TEXT;
  v_nome   TEXT;
BEGIN
  IF p_emenda_id IS NOT NULL THEN
    SELECT autor_id INTO v_autor FROM public.emendas_siop WHERE id = p_emenda_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND: Emenda não encontrada.' USING ERRCODE = 'P0002';
    END IF;
    IF v_autor IS DISTINCT FROM p_autor THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: a emenda escolhida não é deste parlamentar.' USING ERRCODE = '22023';
    END IF;
    RETURN p_emenda_id;
  END IF;
  IF p_nova IS NULL OR jsonb_typeof(p_nova) <> 'object' THEN
    RETURN NULL;
  END IF;
  SELECT n.numero, n.ano INTO v_numero, v_ano FROM public.emendas_numero_e_ano(p_nova->>'numero', NULLIF(p_nova->>'ano', '')::INTEGER) n;
  SELECT id, autor_id INTO v_id, v_autor FROM public.emendas_siop WHERE ano = v_ano AND numero = v_numero;
  IF FOUND THEN
    IF v_autor IS DISTINCT FROM p_autor THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: a emenda % % de % está registrada para outro parlamentar.', left(v_numero, 4), right(v_numero, 4), v_ano USING ERRCODE = '22023';
    END IF;
    RETURN v_id;
  END IF;
  IF p_autor IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o parlamentar antes de informar a emenda.' USING ERRCODE = '22023';
  END IF;
  v_valor := NULLIF(p_nova->>'valor', '')::NUMERIC;
  IF v_valor IS NOT NULL AND v_valor <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o valor da emenda no SIOP deve ser maior que zero.' USING ERRCODE = '22023';
  END IF;
  v_gnd := NULLIF(p_nova->>'gnd', '');
  IF v_gnd IS NOT NULL AND v_gnd NOT IN ('GND-3', 'GND-4') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o GND (3 ou 4).' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);
  INSERT INTO public.emendas_siop (ano, numero, autor_id, valor, gnd, vista_em, criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
  VALUES (v_ano, v_numero, p_autor, v_valor, v_gnd, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE, auth.uid(), v_nome, auth.uid(), v_nome)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_emenda_do_pedido(TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emendas_emenda_do_pedido(TEXT, UUID, JSONB) TO service_role;

-- ------------------------------------------------------------------------------
-- 3) salvar_pedido_emenda: pedido novo só com parlamentar e emenda; nasce com o nº e o ano dela. Pedido antigo sem emenda
--    grava informando a emenda. Igual à versão em produção (migrations 204/206) no resto. CREATE OR REPLACE mantém as
--    permissões.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salvar_pedido_emenda(p_pedido jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  v_nova   JSONB := p_pedido->'emenda_nova';
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
    -- Migration 243 (D1): a reserva para um órgão, sem parlamentar, acabou. Todo pedido nasce com o parlamentar e a emenda.
    IF v_orgao THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: a reserva precisa do parlamentar e da emenda (a reserva para um órgão sem parlamentar acabou).' USING ERRCODE = '22023';
    END IF;
    IF v_autor IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o parlamentar ou a bancada.' USING ERRCODE = '22023';
    END IF;
    -- A emenda do pedido: a registrada (emenda_id), uma nova pelo nº e ano (emenda_nova) ou a da sobra (emenda_da_sobra).
    v_da_emenda := public.emendas_emenda_do_pedido(v_autor, NULLIF(p_pedido->>'emenda_id', '')::UUID, v_nova);
    IF v_da_emenda IS NULL AND (v_sobra IS NULL OR jsonb_typeof(v_sobra) <> 'object') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe a emenda do pedido (nº e ano).' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.emenda_pedidos (autor_id, emenda_id, observacao, contato_nome, contato_telefone, contato_email, criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (v_autor, v_da_emenda, NULLIF(btrim(p_pedido->>'observacao'), ''), NULLIF(btrim(p_pedido->>'contato_nome'), ''),
            NULLIF(regexp_replace(COALESCE(p_pedido->>'contato_telefone', ''), '\D', '', 'g'), ''), NULLIF(lower(btrim(p_pedido->>'contato_email')), ''),
            auth.uid(), v_nome, auth.uid(), v_nome)
    RETURNING id, versao, numero INTO v_id, v_versao, v_numero;
    IF v_da_emenda IS NOT NULL THEN
      UPDATE public.emenda_pedidos p SET siop_emenda = e.numero, siop_emenda_ano = e.ano
        FROM public.emendas_siop e WHERE e.id = v_da_emenda AND p.id = v_id;
    END IF;
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

  -- Migration 243: pedido antigo sem emenda (reserva de antes da regra) só grava informando a emenda. A troca da emenda
  -- de um pedido que já tem uma é feita na conferência com o SIOP.
  IF v_atual.emenda_id IS NULL AND v_atual.siop_emenda IS NULL THEN
    v_da_emenda := public.emendas_emenda_do_pedido(COALESCE(v_autor, v_atual.autor_id), NULLIF(p_pedido->>'emenda_id', '')::UUID, v_nova);
    IF v_da_emenda IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe a emenda do pedido (nº e ano).' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos p SET emenda_id = e.id, siop_emenda = e.numero, siop_emenda_ano = e.ano
      FROM public.emendas_siop e WHERE e.id = v_da_emenda AND p.id = v_id;
  END IF;

  v_mudou := public.emendas_gravar_linhas(v_id, p_pedido->'linhas', p_pedido->>'motivo');

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

-- ------------------------------------------------------------------------------
-- 4) salvar_emenda_siop: valor e GND opcionais (D2), confirmados na conferência.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salvar_emenda_siop(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- Migration 243 (D2): o valor e o GND podem ficar para a conferência com o SIOP.
  IF v_valor IS NOT NULL AND v_valor <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o valor da emenda no SIOP deve ser maior que zero.' USING ERRCODE = '22023';
  END IF;
  v_gnd := NULLIF(p->>'gnd', '');
  IF v_gnd IS NOT NULL AND v_gnd NOT IN ('GND-3', 'GND-4') THEN
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

  -- Migration 232: nº que já está em pedido também se registra (uma emenda por ano + nº) e os pedidos passam a apontar
  -- para ela; antes a RPC recusava com JA_TEM_PEDIDO.

  IF v_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.emendas_siop WHERE ano = v_ano AND numero = v_numero) THEN
      RAISE EXCEPTION 'JA_REGISTRADA: A emenda % % de % já está registrada.', left(v_numero, 4), right(v_numero, 4), v_ano USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.emendas_siop (ano, numero, autor_id, valor, gnd, beneficiario_id, objeto, vista_em, observacao,
                                     criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (v_ano, v_numero, v_autor, v_valor, v_gnd, v_benef, NULLIF(btrim(p->>'objeto'), ''), v_vista, NULLIF(btrim(p->>'observacao'), ''),
            auth.uid(), v_nome, auth.uid(), v_nome)
    RETURNING id, versao INTO v_id, v_versao;
    UPDATE public.emenda_pedidos SET emenda_id = v_id
     WHERE etapa <> 'CANCELADO' AND emenda_id IS NULL AND siop_emenda = v_numero AND COALESCE(siop_emenda_ano, v_ano) = v_ano;
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
$function$;

-- ------------------------------------------------------------------------------
-- 5) ligar_reserva_a_emenda (migration 242): a reserva ligada ganha também o nº e o ano da emenda, como o pedido novo.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ligar_reserva_a_emenda(p_pedido_id uuid, p_versao integer, p_emenda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_p      RECORD;
  v_e      RECORD;
  v_nome   TEXT;
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador ligam reservas às emendas.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e tente de novo.' USING ERRCODE = '40001';
  END IF;
  IF v_p.etapa = 'CANCELADO' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o pedido está cancelado.' USING ERRCODE = '22023';
  END IF;
  IF v_p.emenda_id IS NOT NULL OR v_p.siop_emenda IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o pedido já tem emenda. Para trocar, corrija o nº na conferência com o SIOP.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_e FROM public.emendas_siop WHERE id = p_emenda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Emenda não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.autor_id IS DISTINCT FROM v_e.autor_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: a reserva é de outro parlamentar.' USING ERRCODE = '22023';
  END IF;

  v_nome := left(public.nome_do_usuario_logado(), 200);
  UPDATE public.emenda_pedidos
     SET emenda_id = p_emenda_id, siop_emenda = v_e.numero, siop_emenda_ano = v_e.ano, versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_pedido_id
  RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_pedido_id, 'versao', v_versao);
END;
$function$;

-- ------------------------------------------------------------------------------
-- 6) registrar_anulacao_empenho (D6): o pedido que volta à interlocução e o pedido novo dos itens anulados ficam com a
--    emenda. Igual à versão em produção (migration 208) no resto.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_anulacao_empenho(p_id uuid, p_versao integer, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_p        RECORD;
  v_l        RECORD;
  v_d        JSONB := COALESCE(p_dados, '{}'::jsonb);
  v_nome     TEXT;
  v_linhas   UUID[];
  v_ativas   INTEGER;
  v_total    BOOLEAN;
  v_sei      TEXT;
  v_data     DATE;
  v_motivo   TEXT;
  v_notas    TEXT[];
  v_novo     UUID;
  v_numero   INTEGER;
  v_ordem    INTEGER := 0;
  v_nova     UUID;
  v_registro JSONB := '[]'::jsonb;
  v_antes    JSONB;
  v_versao   INTEGER;
  v_anulacao UUID;
  v_destino  TEXT := COALESCE(NULLIF(btrim(v_d->>'destino'), ''), 'INTERLOCUCAO');
  v_texto    TEXT;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram a anulação.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.emenda_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF p_versao IS DISTINCT FROM v_p.versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este pedido. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF v_p.etapa NOT IN ('CGOFI', 'EMPENHADO', 'CONTRATACAO') THEN
    RAISE EXCEPTION 'ETAPA_INVALIDA: Só há empenho a anular depois do envio à CGOFI.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_d->'linhas') <> 'array' OR jsonb_array_length(v_d->'linhas') = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: marque pelo menos um item cujo empenho foi anulado.' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT x::UUID) INTO v_linhas FROM jsonb_array_elements_text(v_d->'linhas') x;
  IF EXISTS (
    SELECT 1 FROM unnest(v_linhas) x
     WHERE NOT EXISTS (SELECT 1 FROM public.emenda_pedido_linhas l WHERE l.id = x AND l.pedido_id = p_id AND NOT l.cancelada)
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: algum item marcado não é deste pedido ou já saiu dele.' USING ERRCODE = '22023';
  END IF;
  v_sei := regexp_replace(COALESCE(v_d->>'documento_sei', ''), '\D', '', 'g');
  IF v_sei !~ '^[0-9]{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o documento SEI da anulação (só números, 7 a 10 dígitos).' USING ERRCODE = '22023';
  END IF;
  v_data := NULLIF(v_d->>'data', '')::DATE;
  IF v_data IS NULL OR v_data > (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe a data da anulação (hoje ou antes).' USING ERRCODE = '22023';
  END IF;
  v_motivo := btrim(COALESCE(v_d->>'motivo', ''));
  IF v_motivo = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o motivo da anulação.' USING ERRCODE = '22023';
  END IF;

  IF v_destino NOT IN ('INTERLOCUCAO', 'CANCELAR') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha se os itens voltam à interlocução ou só são cancelados.' USING ERRCODE = '22023';
  END IF;

  v_nome := left(public.nome_do_usuario_logado(), 200);
  SELECT count(*) INTO v_ativas FROM public.emenda_pedido_linhas WHERE pedido_id = p_id AND NOT cancelada;
  v_total := cardinality(v_linhas) = v_ativas;
  SELECT COALESCE(array_agg(DISTINCT n.nota ORDER BY n.nota), '{}') INTO v_notas
    FROM public.emenda_linha_notas n WHERE n.linha_id = ANY (v_linhas) AND n.nota IS NOT NULL;

  PERFORM set_config('emendas.volta_da_anulacao', 'on', TRUE);
  v_texto := format('Empenho anulado em %s%s', to_char(v_data, 'DD/MM/YYYY'),
                    CASE WHEN cardinality(v_notas) > 0 THEN ' (' || array_to_string(v_notas, ', ') || ')' ELSE '' END);

  IF v_destino = 'CANCELAR' THEN
    -- Só cancelar: a compra foi refeita em outra nota ou não vai acontecer. Nada volta à interlocução e a quantidade
    -- volta ao saldo da CAEP. Todas as linhas: o pedido inteiro é cancelado (as etapas e os documentos ficam nele).
    FOR v_l IN SELECT * FROM public.emenda_pedido_linhas WHERE id = ANY (v_linhas) ORDER BY ordem LOOP
      v_registro := v_registro || jsonb_build_object('linha_id', v_l.id, 'nova_linha_id', NULL, 'tipo', v_l.tipo,
        'item_key', v_l.item_key, 'kit_nome', v_l.kit_nome, 'quantidade', v_l.quantidade,
        'empenho_documento_sei', v_l.empenho_documento_sei, 'despacho_documento_sei', v_l.despacho_documento_sei,
        'contrato_numero', v_l.contrato_numero);
    END LOOP;
    IF v_total THEN
      UPDATE public.emenda_pedidos
         SET etapa = 'CANCELADO', cancelado_em = (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE,
             cancelado_motivo = left(v_texto || ': ' || v_motivo, 500)
       WHERE id = p_id;
    ELSE
      UPDATE public.emenda_pedido_linhas
         SET cancelada = TRUE, cancelada_motivo = left(v_texto || ': item cancelado, sem volta à interlocução.', 500)
       WHERE id = ANY (v_linhas);
    END IF;
  ELSIF v_total THEN
    -- O próprio pedido volta a "Itens reservados"; o que sai do pedido fica guardado no registro.
    SELECT jsonb_build_object(
             'etapa', v_p.etapa, 'minuta_em', v_p.minuta_em, 'oficio_documento_sei', v_p.oficio_documento_sei,
             'oficio_processo_sei', v_p.oficio_processo_sei, 'oficio_em', v_p.oficio_em, 'siop_emenda', v_p.siop_emenda,
             'siop_emenda_ano', v_p.siop_emenda_ano, 'siop_valor', v_p.siop_valor, 'siop_gnd', v_p.siop_gnd,
             'siop_conferencia', v_p.siop_conferencia, 'conferido_em', v_p.conferido_em, 'solicitado_em', v_p.solicitado_em,
             'solicitado_documento_sei', v_p.solicitado_documento_sei, 'autorizado_em', v_p.autorizado_em,
             'autorizado_documento_sei', v_p.autorizado_documento_sei, 'cgofi_em', v_p.cgofi_em,
             'cgofi_documento_sei', v_p.cgofi_documento_sei, 'empenhado_em', v_p.empenhado_em,
             'empenhado_documentos_sei', v_p.empenhado_documentos_sei, 'contratacao_em', v_p.contratacao_em,
             'contratacao_documentos_sei', v_p.contratacao_documentos_sei,
             'documentos', (SELECT COALESCE(jsonb_agg(jsonb_build_object('etapa', d.etapa, 'documento_sei', d.documento_sei,
                                     'processo_sei', d.processo_sei, 'data', d.data_documento, 'ata_key', d.ata_key,
                                     'nota_empenho', d.nota_empenho) ORDER BY d.data_documento, d.documento_sei), '[]'::jsonb)
                              FROM public.emenda_pedido_documentos_sei d WHERE d.pedido_id = p_id))
      INTO v_antes;
    FOR v_l IN SELECT * FROM public.emenda_pedido_linhas WHERE pedido_id = p_id AND NOT cancelada ORDER BY ordem LOOP
      v_registro := v_registro || jsonb_build_object('linha_id', v_l.id, 'nova_linha_id', v_l.id, 'tipo', v_l.tipo,
        'item_key', v_l.item_key, 'kit_nome', v_l.kit_nome, 'quantidade', v_l.quantidade,
        'empenho_documento_sei', v_l.empenho_documento_sei, 'despacho_documento_sei', v_l.despacho_documento_sei,
        'contrato_numero', v_l.contrato_numero);
    END LOOP;
    -- Documentos SEI das etapas (as solicitações levam junto as linhas cobertas e os envios à CGOFI).
    DELETE FROM public.emenda_pedido_documentos_sei WHERE pedido_id = p_id;
    DELETE FROM public.emenda_linha_notas WHERE linha_id = ANY (v_linhas);
    UPDATE public.emenda_pedido_linhas SET empenho_documento_sei = NULL, despacho_documento_sei = NULL, contrato_numero = NULL
     WHERE id = ANY (v_linhas);
    -- O aviso "sem ofício" conta da volta (devolvido_em), não da reserva antiga.
    UPDATE public.emenda_pedidos SET
      etapa = 'RESERVADO', minuta_em = NULL, minuta_documento_sei = NULL, oficio_numero = NULL, oficio_documento_sei = NULL,
      oficio_processo_sei = NULL, oficio_em = NULL, divergencia = NULL,
      siop_valor = NULL, siop_gnd = NULL, siop_conferencia = NULL, conferido_em = NULL, solicitado_em = NULL,
      solicitado_documento_sei = NULL, autorizado_em = NULL, autorizado_documento_sei = NULL, cgofi_em = NULL,
      cgofi_documento_sei = NULL, empenhado_em = NULL, empenhado_documentos_sei = NULL, contratacao_em = NULL,
      contratacao_documentos_sei = NULL, devolvido_em = v_data
     WHERE id = p_id;
  ELSE
    -- Pedido novo com as linhas anuladas, ligado a este.
    INSERT INTO public.emenda_pedidos (autor_id, emenda_id, siop_emenda, siop_emenda_ano, observacao, contato_nome, contato_telefone,
                                       contato_email, pedido_origem_id, criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (v_p.autor_id, v_p.emenda_id, v_p.siop_emenda, v_p.siop_emenda_ano,
            format('Itens do pedido %s cujo empenho foi anulado em %s%s.', v_p.numero, to_char(v_data, 'DD/MM/YYYY'),
                   CASE WHEN cardinality(v_notas) > 0 THEN ' (' || array_to_string(v_notas, ', ') || ')' ELSE '' END),
            v_p.contato_nome, v_p.contato_telefone, v_p.contato_email, p_id, auth.uid(), v_nome, auth.uid(), v_nome)
    RETURNING id, numero INTO v_novo, v_numero;
    FOR v_l IN SELECT * FROM public.emenda_pedido_linhas WHERE id = ANY (v_linhas) ORDER BY ordem LOOP
      v_ordem := v_ordem + 1;
      INSERT INTO public.emenda_pedido_linhas (pedido_id, ordem, tipo, item_key, kit_id, kit_nome, kit_versao, kit_composicao,
                                               quantidade, beneficiario_id, beneficiario_nome)
      VALUES (v_novo, v_ordem, v_l.tipo, v_l.item_key, v_l.kit_id, v_l.kit_nome, v_l.kit_versao, v_l.kit_composicao,
              v_l.quantidade, v_l.beneficiario_id, v_l.beneficiario_nome)
      RETURNING id INTO v_nova;
      UPDATE public.emenda_pedido_linhas
         SET cancelada = TRUE,
             cancelada_motivo = format('Empenho anulado em %s: voltou à interlocução no pedido %s.', to_char(v_data, 'DD/MM/YYYY'), v_numero)
       WHERE id = v_l.id;
      v_registro := v_registro || jsonb_build_object('linha_id', v_l.id, 'nova_linha_id', v_nova, 'tipo', v_l.tipo,
        'item_key', v_l.item_key, 'kit_nome', v_l.kit_nome, 'quantidade', v_l.quantidade,
        'empenho_documento_sei', v_l.empenho_documento_sei, 'despacho_documento_sei', v_l.despacho_documento_sei,
        'contrato_numero', v_l.contrato_numero);
    END LOOP;
  END IF;

  INSERT INTO public.emenda_pedido_anulacoes (pedido_id, novo_pedido_id, total, notas, linhas, documento_sei, anulado_em, motivo,
                                              etapas_anteriores, destino, criado_por, criado_por_nome)
  VALUES (p_id, v_novo, v_total, v_notas, v_registro, v_sei, v_data, left(v_motivo, 1000), v_antes, v_destino, auth.uid(), v_nome)
  RETURNING id INTO v_anulacao;

  UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  PERFORM set_config('emendas.volta_da_anulacao', 'off', TRUE);
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao, 'anulacao_id', v_anulacao, 'total', v_total, 'destino', v_destino,
                            'novo_pedido_id', v_novo, 'novo_numero', v_numero);
END;
$function$;

-- ------------------------------------------------------------------------------
-- 7) avancar_pedido_emenda, CONFERIDO (D5): o nº vem da reserva; trocar a emenda pede o motivo; a emenda registrada sem
--    valor recebe o valor do SIOP aqui. Igual à versão em produção (migration 234) no resto.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avancar_pedido_emenda(p_id uuid, p_versao integer, p_acao text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_p      RECORD;
  v_nome   TEXT;
  v_acao   TEXT := upper(COALESCE(p_acao, ''));
  v_d      JSONB := COALESCE(p_dados, '{}'::jsonb);
  v_data   DATE;
  v_sei    TEXT;
  v_seis   TEXT[];
  v_conf   JSONB;
  v_rodada INTEGER;
  v_versao INTEGER;
  v_num    TEXT;
  v_ano    INTEGER;
  v_vemenda NUMERIC;
  v_voficio NUMERIC;
  v_seiof  TEXT;
  v_emenda RECORD;
  v_antes  RECORD;
  v_motivo TEXT;
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

  IF v_acao IN ('OFICIO', 'SOLICITADO', 'CGOFI') THEN
    v_sei := regexp_replace(COALESCE(v_d->>'documento_sei', ''), '\D', '', 'g');
    IF v_sei !~ '^[0-9]{7,10}$' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o documento SEI (só números, 7 a 10 dígitos).' USING ERRCODE = '22023';
    END IF;
  ELSIF v_acao IN ('EMPENHADO', 'CONTRATACAO', 'ACRESCENTAR_SEI') THEN
    IF jsonb_typeof(v_d->'documentos_sei') <> 'array' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe pelo menos um documento SEI.' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(DISTINCT n ORDER BY n) INTO v_seis
      FROM (SELECT regexp_replace(p, '\D', '', 'g') AS n
              FROM jsonb_array_elements_text(v_d->'documentos_sei') x, regexp_split_to_table(x, '[,;[:space:]]+') p) t
     WHERE n <> '';
    IF v_seis IS NULL OR EXISTS (SELECT 1 FROM unnest(v_seis) n WHERE n !~ '^[0-9]{7,10}$') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe pelo menos um documento SEI (só números, 7 a 10 dígitos).' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_acao = 'MINUTA' THEN
    IF v_p.etapa <> 'RESERVADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A minuta é registrada em pedido reservado.' USING ERRCODE = '22023';
    END IF;
    -- Migration 234: o preço unitário de cada item como saiu no quadro da minuta, para a conferência do ofício.
    IF v_d ? 'precos' AND (jsonb_typeof(v_d->'precos') <> 'object' OR EXISTS (
      SELECT 1 FROM jsonb_each(v_d->'precos') x WHERE jsonb_typeof(x.value) <> 'number' OR (x.value)::NUMERIC < 0
    )) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: os preços da minuta são um objeto item → preço.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'MINUTA', minuta_em = v_data,
           minuta_precos = CASE WHEN jsonb_typeof(v_d->'precos') = 'object' THEN v_d->'precos' END
     WHERE id = p_id;

  ELSIF v_acao = 'OFICIO' THEN
    IF v_p.etapa NOT IN ('RESERVADO', 'MINUTA', 'OFICIO') THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O ofício é registrado antes da conferência com o SIOP.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_d->>'processo_sei'), '') = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o processo SEI.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'OFICIO', oficio_documento_sei = v_sei,
           oficio_processo_sei = left(btrim(v_d->>'processo_sei'), 40), oficio_em = v_data, divergencia = NULL WHERE id = p_id;

  ELSIF v_acao = 'DIVERGENCIA' THEN
    IF v_p.etapa <> 'OFICIO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A divergência é registrada com o ofício recebido, antes da conferência.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_d->>'texto'), '') = '' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: descreva o que não bate.' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(max(rodada), 0) + 1 INTO v_rodada FROM public.emenda_pedido_devolucoes WHERE pedido_id = p_id;
    INSERT INTO public.emenda_pedido_devolucoes (pedido_id, rodada, minuta_em, oficio_em, oficio_documento_sei, oficio_processo_sei,
                                                 oficio_numero, motivo, devolvido_em, criado_por, criado_por_nome)
    VALUES (p_id, v_rodada, v_p.minuta_em, v_p.oficio_em, v_p.oficio_documento_sei, v_p.oficio_processo_sei,
            v_p.oficio_numero, btrim(v_d->>'texto'), v_data, auth.uid(), v_nome);
    -- Volta para a minuta: a nova minuta e o novo ofício entram no mesmo processo SEI.
    UPDATE public.emenda_pedidos SET etapa = 'RESERVADO', minuta_em = NULL, minuta_documento_sei = NULL, oficio_em = NULL,
           oficio_documento_sei = NULL, oficio_numero = NULL, divergencia = btrim(v_d->>'texto'), devolvido_em = v_data,
           minuta_precos = NULL
     WHERE id = p_id;

  ELSIF v_acao = 'CONFERIDO' THEN
    IF v_p.etapa <> 'OFICIO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A conferência com o SIOP vem depois do ofício.' USING ERRCODE = '22023';
    END IF;
    v_conf := v_d->'conferencia';
    -- Migration 234: os pontos são o que o SIOP mostra. Na compra direta o beneficiário no SIOP é o próprio MJ e não há
    -- objeto: saem "beneficiario" e "objeto", entram "compra_direta" (modalidade 90, ação 21BM) e "uf" (localizador).
    -- Quem recebe e os itens são conferidos com o ofício, item por item ("itens_do_oficio").
    IF v_conf IS NULL OR EXISTS (
      SELECT 1 FROM unnest(ARRAY['numero_emenda', 'autor', 'valor', 'gnd', 'compra_direta', 'uf', 'itens_do_oficio']) k
       WHERE (v_conf->>k)::BOOLEAN IS NOT TRUE
    ) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: confira os itens do ofício e os 6 pontos do SIOP (nº da emenda, parlamentar, valor, GND, compra direta pelo MJ e UF).' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_d->>'emenda'), '') = '' OR (v_d->>'gnd') NOT IN ('GND-3', 'GND-4') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o número da emenda e o GND.' USING ERRCODE = '22023';
    END IF;
    -- Migration 186: 8 dígitos (autor + emenda) com o ano à parte, ou os 12 do código (ano + número).
    v_num := regexp_replace(v_d->>'emenda', '\D', '', 'g');
    IF v_num ~ '^20[0-9]{10}$' THEN
      v_ano := left(v_num, 4)::INTEGER;
      v_num := right(v_num, 8);
    ELSIF v_num ~ '^[0-9]{8}$' THEN
      v_ano := CASE WHEN COALESCE(v_d->>'ano', '') ~ '^[0-9]{4}$' THEN (v_d->>'ano')::INTEGER END;
    ELSE
      RAISE EXCEPTION 'INVALID_PAYLOAD: o nº da emenda tem 8 dígitos (ex.: 4095 0004), ou 12 com o ano na frente (2026 4095 0004).' USING ERRCODE = '22023';
    END IF;
    IF v_ano IS NULL OR v_ano NOT BETWEEN 2015 AND 2100 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o ano da emenda.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.emenda_pedido_linhas WHERE pedido_id = p_id AND NOT cancelada AND beneficiario_id IS NULL) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: todas as linhas precisam de beneficiário antes da conferência.' USING ERRCODE = '22023';
    END IF;
    -- Migration 232: o valor da emenda no SIOP fica na emenda (emendas_siop, um por emenda) e o do ofício no pedido.
    -- "valor" (formato antigo) vale como valor da emenda.
    v_vemenda := NULLIF(COALESCE(v_d->>'valor_emenda', v_d->>'valor'), '')::NUMERIC;
    v_voficio := NULLIF(v_d->>'valor_oficio', '')::NUMERIC;
    IF v_voficio IS NULL OR v_voficio <= 0 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o valor do ofício.' USING ERRCODE = '22023';
    END IF;
    v_seiof := NULLIF(regexp_replace(COALESCE(v_d->>'oficio_valor_documento_sei', ''), '\D', '', 'g'), '');
    IF v_seiof IS NOT NULL AND v_seiof !~ '^[0-9]{7,10}$' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: o documento SEI do ofício tem só números, 7 a 10 dígitos.' USING ERRCODE = '22023';
    END IF;
    -- Migration 243 (D5): o nº vem da reserva; trocar a emenda na conferência pede o motivo, que fica registrado.
    SELECT * INTO v_antes FROM public.emendas_siop WHERE id = v_p.emenda_id;
    IF v_antes.id IS NOT NULL AND (v_antes.numero, v_antes.ano) IS DISTINCT FROM (v_num::CHAR(8), v_ano::SMALLINT) THEN
      v_motivo := NULLIF(btrim(COALESCE(v_d->>'motivo_troca', '')), '');
      IF v_motivo IS NULL THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: informe o motivo da troca da emenda %/%.', left(v_antes.numero, 4) || ' ' || right(v_antes.numero, 4), v_antes.ano USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.emenda_pedido_trocas_emenda (pedido_id, de_numero, de_ano, para_numero, para_ano, motivo, criado_por, criado_por_nome)
      VALUES (p_id, v_antes.numero, v_antes.ano, v_num, v_ano, left(v_motivo, 500), auth.uid(), v_nome);
    END IF;
    SELECT * INTO v_emenda FROM public.emendas_siop WHERE ano = v_ano AND numero = v_num FOR UPDATE;
    IF FOUND AND v_emenda.valor IS NULL AND (v_vemenda IS NULL OR v_vemenda <= 0) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o valor da emenda no SIOP.' USING ERRCODE = '22023';
    END IF;
    IF NOT FOUND THEN
      IF v_vemenda IS NULL OR v_vemenda <= 0 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: informe o valor da emenda no SIOP.' USING ERRCODE = '22023';
      END IF;
      IF v_p.autor_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: escolha o parlamentar do pedido antes da conferência.' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.emendas_siop (ano, numero, autor_id, valor, gnd, vista_em, criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
      VALUES (v_ano, v_num, v_p.autor_id, v_vemenda, v_d->>'gnd', v_data, auth.uid(), v_nome, auth.uid(), v_nome);
    ELSIF (v_vemenda IS NOT NULL AND v_vemenda IS DISTINCT FROM v_emenda.valor) OR (v_d->>'gnd') IS DISTINCT FROM v_emenda.gnd THEN
      IF v_vemenda <= 0 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: o valor da emenda no SIOP deve ser maior que zero.' USING ERRCODE = '22023';
      END IF;
      -- O SIOP mudou: a CAEP corrige na conferência e a data passa a ser a de hoje.
      UPDATE public.emendas_siop SET valor = COALESCE(v_vemenda, valor), gnd = v_d->>'gnd', vista_em = v_data, versao = versao + 1,
             atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
       WHERE id = v_emenda.id;
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'CONFERIDO', siop_emenda = v_num, siop_emenda_ano = v_ano,
           siop_valor = COALESCE(v_vemenda, v_emenda.valor), siop_gnd = v_d->>'gnd', siop_conferencia = v_conf,
           oficio_valor = v_voficio, oficio_valor_documento_sei = COALESCE(v_seiof, v_p.oficio_documento_sei),
           oficio_valor_retificador = COALESCE((v_d->>'oficio_retificador')::BOOLEAN, FALSE),
           conferido_em = v_data, divergencia = NULL WHERE id = p_id;

  ELSIF v_acao = 'SOLICITADO' THEN
    IF v_p.etapa <> 'CONFERIDO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A solicitação de empenho vem depois da conferência.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'SOLICITADO', solicitado_em = v_data, solicitado_documento_sei = v_sei WHERE id = p_id;

  ELSIF v_acao = 'AUTORIZADO' THEN
    IF v_p.etapa <> 'SOLICITADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A autorização de empenho vem depois da solicitação.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'AUTORIZADO', autorizado_em = v_data, autorizado_documento_sei = solicitado_documento_sei WHERE id = p_id;

  ELSIF v_acao = 'CGOFI' THEN
    IF v_p.etapa <> 'AUTORIZADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O envio à CGOFI vem depois da autorização.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'CGOFI', cgofi_em = v_data, cgofi_documento_sei = v_sei WHERE id = p_id;

  ELSIF v_acao = 'EMPENHADO' THEN
    IF v_p.etapa <> 'CGOFI' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O empenho vem depois do envio à CGOFI.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'EMPENHADO', empenhado_em = v_data, empenhado_documentos_sei = v_seis WHERE id = p_id;

  ELSIF v_acao = 'CONTRATACAO' THEN
    IF v_p.etapa <> 'EMPENHADO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: O envio para contratação vem depois do empenho.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.emenda_pedidos SET etapa = 'CONTRATACAO', contratacao_em = v_data, contratacao_documentos_sei = v_seis WHERE id = p_id;

  ELSIF v_acao = 'ACRESCENTAR_SEI' THEN
    -- Migration 230: a data vem junto quando a etapa avançou pela fonte sem data (comprovada pela nota ou pelo contrato).
    v_data := NULLIF(v_d->>'data', '')::DATE;
    IF v_d->>'etapa' = 'CGOFI' AND v_p.etapa IN ('EMPENHADO', 'CONTRATACAO') AND v_p.cgofi_documento_sei IS NULL THEN
      -- Envio à CGOFI comprovado pela nota: a CAEP completa o documento depois (um só, como no registro da etapa).
      IF array_length(v_seis, 1) <> 1 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: o envio à CGOFI tem um documento SEI só.' USING ERRCODE = '22023';
      END IF;
      UPDATE public.emenda_pedidos SET cgofi_documento_sei = v_seis[1], cgofi_em = COALESCE(cgofi_em, v_data) WHERE id = p_id;
    ELSIF v_d->>'etapa' = 'EMPENHADO' AND v_p.etapa IN ('EMPENHADO', 'CONTRATACAO') THEN
      UPDATE public.emenda_pedidos SET empenhado_documentos_sei = ARRAY(
        SELECT DISTINCT n FROM unnest(COALESCE(empenhado_documentos_sei, '{}') || v_seis) n ORDER BY n),
        empenhado_em = COALESCE(empenhado_em, v_data) WHERE id = p_id;
    ELSIF v_d->>'etapa' = 'CONTRATACAO' AND v_p.etapa = 'CONTRATACAO' THEN
      UPDATE public.emenda_pedidos SET contratacao_documentos_sei = ARRAY(
        SELECT DISTINCT n FROM unnest(COALESCE(contratacao_documentos_sei, '{}') || v_seis) n ORDER BY n),
        contratacao_em = COALESCE(contratacao_em, v_data) WHERE id = p_id;
    ELSE
      RAISE EXCEPTION 'ETAPA_INVALIDA: Só se acrescenta número ao envio à CGOFI, ao empenho ou ao envio para contratação já registrados.' USING ERRCODE = '22023';
    END IF;

  ELSE
    RAISE EXCEPTION 'INVALID_PAYLOAD: ação desconhecida: %.', p_acao USING ERRCODE = '22023';
  END IF;

  UPDATE public.emenda_pedidos SET versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE id = p_id RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', p_id, 'versao', v_versao);
END;
$function$;
