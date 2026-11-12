-- ==============================================================================
-- MIGRATION 250: EMENDAS PARLAMENTARES — INFORMAÇÃO E ORDEM DE FORNECIMENTO POR CONTRATO
-- Versão: 20261029000250_emendas_ordem_por_contrato.sql
--
-- Leitura do SEI em 29/10/2026 (202 Ordens de Fornecimento de emenda em 193 processos de acompanhamento contratual):
-- a Ordem é uma por contrato, emitida pelo Setor de Fiscalização de Contratos (SFC), e lista todos os beneficiários
-- do contrato com o local de entrega de cada um. Ela segue a Informação da ComprasSUSP juntada ao processo do contrato
-- (uma por contrato, ex.: Informação nº 343/2026), que pode trazer itens de vários pedidos/emendas. Uma segunda Ordem
-- no contrato retifica a primeira ou atende outro pedido que entrou no contrato depois.
-- Decisão do usuário (29/10/2026): modelar por contrato.
--
-- 1) emenda_pedido_ordens: um registro por pedido × contrato, com a Informação (data e SEI) e a Ordem (data e SEI).
-- 2) registrar_informacao_ordem(alvos, data, SEI): a Informação, para um ou mais pares pedido × contrato (os pedidos
--    do mesmo contrato numa só Informação); registrar de novo troca a Informação (retificação; a auditoria guarda a anterior).
-- 3) registrar_ordem_fornecimento_contrato(alvos, data, SEI): a Ordem emitida pela SFC (ou a correção), para os mesmos pares.
--
-- As colunas ordem_fornecimento_* de emenda_pedidos e a RPC registrar_ordem_fornecimento (migration 245) ficam como
-- estão: nenhum pedido as usou; saem numa limpeza depois que o código deixar de lê-las.
-- ==============================================================================

-- 1) Tabela ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_pedido_ordens (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id              UUID          NOT NULL REFERENCES public.emenda_pedidos(id) ON DELETE CASCADE,
  contract_key           VARCHAR(100)  NOT NULL,
  informacao_em          DATE,
  informacao_documento_sei VARCHAR(10),
  ordem_em               DATE,
  ordem_documento_sei    VARCHAR(10),
  criado_por             UUID,
  criado_por_nome        VARCHAR(200),
  criado_em              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_por_nome    VARCHAR(200),
  atualizado_em          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT emenda_pedido_ordens_unica UNIQUE (pedido_id, contract_key),
  CONSTRAINT emenda_pedido_ordens_algum_momento CHECK (informacao_em IS NOT NULL OR ordem_em IS NOT NULL),
  CONSTRAINT emenda_pedido_ordens_informacao CHECK ((informacao_em IS NULL) = (informacao_documento_sei IS NULL)),
  CONSTRAINT emenda_pedido_ordens_ordem CHECK ((ordem_em IS NULL) = (ordem_documento_sei IS NULL)),
  CONSTRAINT emenda_pedido_ordens_sei CHECK (
    (informacao_documento_sei IS NULL OR informacao_documento_sei ~ '^[0-9]{7,10}$') AND (ordem_documento_sei IS NULL OR ordem_documento_sei ~ '^[0-9]{7,10}$')
  )
);
CREATE INDEX IF NOT EXISTS ix_emenda_pedido_ordens_pedido ON public.emenda_pedido_ordens (pedido_id);
COMMENT ON TABLE public.emenda_pedido_ordens IS
  'Informação da CAEP para a Ordem de Fornecimento e a Ordem emitida pela SFC, por pedido de emenda e contrato, com data e SEI (migration 250). Grava só pelas RPCs.';

ALTER TABLE public.emenda_pedido_ordens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura das emendas: emenda_pedido_ordens" ON public.emenda_pedido_ordens;
CREATE POLICY "Leitura das emendas: emenda_pedido_ordens" ON public.emenda_pedido_ordens
  FOR SELECT TO authenticated USING ((SELECT public.has_permission('emendas.view')));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.emenda_pedido_ordens;
CREATE POLICY "Somente usuario ativo" ON public.emenda_pedido_ordens AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.emenda_pedido_ordens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.emenda_pedido_ordens TO authenticated;
GRANT ALL ON public.emenda_pedido_ordens TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_emenda_pedido_ordens ON public.emenda_pedido_ordens;
    CREATE TRIGGER trg_audit_emenda_pedido_ordens AFTER INSERT OR UPDATE OR DELETE ON public.emenda_pedido_ordens
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- O contrato é de um item ativo do pedido?
CREATE OR REPLACE FUNCTION public.emendas_contrato_do_pedido(p_pedido UUID, p_contrato TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.emenda_pedido_linhas l JOIN public.emenda_linha_notas n ON n.linha_id = l.id
     WHERE l.pedido_id = p_pedido AND NOT l.cancelada AND n.contract_key = p_contrato
  );
$$;
REVOKE ALL ON FUNCTION public.emendas_contrato_do_pedido(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emendas_contrato_do_pedido(UUID, TEXT) TO service_role;

-- O que as duas RPCs conferem: permissão, data até hoje e SEI só com números (7 a 10 dígitos). Devolve o SEI limpo.
CREATE OR REPLACE FUNCTION public.emendas_conferir_ordem(p_data DATE, p_documento_sei TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sei TEXT := regexp_replace(COALESCE(p_documento_sei, ''), '\D', '', 'g');
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador registram a Ordem de Fornecimento.' USING ERRCODE = '42501';
  END IF;
  IF v_sei !~ '^[0-9]{7,10}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Documento SEI: só números, 7 a 10 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data.' USING ERRCODE = '22023';
  END IF;
  IF p_data > (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A data não pode ser depois de hoje.' USING ERRCODE = '22023';
  END IF;
  RETURN v_sei;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_conferir_ordem(DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emendas_conferir_ordem(DATE, TEXT) TO service_role;

-- Os pares pedido × contrato de p_alvos ([{"pedido_id": uuid, "contract_key": text}]), conferidos: pedido na
-- contratação (trava a linha do pedido) e contrato de um item ativo dele.
CREATE OR REPLACE FUNCTION public.emendas_alvos_da_ordem(p_alvos JSONB)
RETURNS TABLE (pedido_id UUID, contract_key TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a     JSONB;
  v_ped   UUID;
  v_ctr   TEXT;
  v_etapa TEXT;
BEGIN
  IF jsonb_typeof(p_alvos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_alvos) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha ao menos um contrato.' USING ERRCODE = '22023';
  END IF;
  FOR v_a IN SELECT DISTINCT x FROM jsonb_array_elements(p_alvos) x LOOP
    v_ped := NULLIF(v_a->>'pedido_id', '')::UUID;
    v_ctr := NULLIF(btrim(v_a->>'contract_key'), '');
    SELECT etapa INTO v_etapa FROM public.emenda_pedidos WHERE id = v_ped FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND: Pedido não encontrado.' USING ERRCODE = 'P0002';
    END IF;
    IF v_etapa <> 'CONTRATACAO' THEN
      RAISE EXCEPTION 'ETAPA_INVALIDA: A Ordem de Fornecimento vem depois do envio para contratação.' USING ERRCODE = '22023';
    END IF;
    IF v_ctr IS NULL OR NOT public.emendas_contrato_do_pedido(v_ped, v_ctr) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O contrato % não é de um item do pedido.', COALESCE(v_ctr, '?') USING ERRCODE = '22023';
    END IF;
    pedido_id := v_ped;
    contract_key := v_ctr;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.emendas_alvos_da_ordem(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emendas_alvos_da_ordem(JSONB) TO service_role;

-- 2) Informação da ComprasSUSP ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_informacao_ordem(p_alvos JSONB, p_data DATE, p_documento_sei TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sei  TEXT := public.emendas_conferir_ordem(p_data, p_documento_sei);
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_a    RECORD;
  v_n    INTEGER := 0;
BEGIN
  FOR v_a IN SELECT * FROM public.emendas_alvos_da_ordem(p_alvos) LOOP
    IF EXISTS (SELECT 1 FROM public.emenda_pedido_ordens o WHERE o.pedido_id = v_a.pedido_id AND o.contract_key = v_a.contract_key AND o.ordem_em IS NOT NULL AND o.ordem_em < p_data) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A Ordem de Fornecimento do contrato % é anterior a esta data; para retificar, corrija também a Ordem.', v_a.contract_key USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.emenda_pedido_ordens (pedido_id, contract_key, informacao_em, informacao_documento_sei, criado_por, criado_por_nome, atualizado_por_nome)
    VALUES (v_a.pedido_id, v_a.contract_key, p_data, v_sei, auth.uid(), v_nome, v_nome)
    ON CONFLICT ON CONSTRAINT emenda_pedido_ordens_unica DO UPDATE
      SET informacao_em = EXCLUDED.informacao_em, informacao_documento_sei = EXCLUDED.informacao_documento_sei,
          atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('registros', v_n, 'documento_sei', v_sei);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_informacao_ordem(JSONB, DATE, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_informacao_ordem(JSONB, DATE, TEXT) TO authenticated;

-- 3) Ordem emitida pela SFC ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_ordem_fornecimento_contrato(p_alvos JSONB, p_data DATE, p_documento_sei TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sei  TEXT := public.emendas_conferir_ordem(p_data, p_documento_sei);
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_a    RECORD;
  v_info DATE;
  v_n    INTEGER := 0;
BEGIN
  FOR v_a IN SELECT * FROM public.emendas_alvos_da_ordem(p_alvos) LOOP
    SELECT o.informacao_em INTO v_info FROM public.emenda_pedido_ordens o WHERE o.pedido_id = v_a.pedido_id AND o.contract_key = v_a.contract_key;
    IF v_info IS NOT NULL AND p_data < v_info THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: A Ordem não pode ser antes da Informação (%).', to_char(v_info, 'DD/MM/YYYY') USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.emenda_pedido_ordens (pedido_id, contract_key, ordem_em, ordem_documento_sei, criado_por, criado_por_nome, atualizado_por_nome)
    VALUES (v_a.pedido_id, v_a.contract_key, p_data, v_sei, auth.uid(), v_nome, v_nome)
    ON CONFLICT ON CONSTRAINT emenda_pedido_ordens_unica DO UPDATE
      SET ordem_em = EXCLUDED.ordem_em, ordem_documento_sei = EXCLUDED.ordem_documento_sei,
          atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('registros', v_n, 'documento_sei', v_sei);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_ordem_fornecimento_contrato(JSONB, DATE, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_ordem_fornecimento_contrato(JSONB, DATE, TEXT) TO authenticated;
