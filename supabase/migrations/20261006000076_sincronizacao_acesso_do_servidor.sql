-- ==============================================================================
-- MIGRATION 76: FUNÇÕES DE SINCRONIZAÇÃO ACEITAM O SERVIDOR (service_role)
-- Versão: 20261006000076_sincronizacao_acesso_do_servidor.sql
--
-- Contexto: a sincronização com as fontes oficiais passa a rodar numa Edge Function agendada
-- (sincronizar-fontes), que usa a chave de service_role e, portanto, não tem usuário: auth.uid() é nulo
-- e has_role() recusa. As funções abaixo exigiam gestor/admin e checavam a trava por auth.uid().
--
-- O que muda
-- 1) public.eh_service_role(): a chamada vem da chave de service_role (claim "role" do JWT, que o
--    PostgREST valida antes de definir; um usuário comum não consegue forjar).
-- 2) reservar_sincronizacao, gravar_contratos_oficiais e concluir_sincronizacao: aceitam o servidor.
--    - Forçar a atualização continua só do coordenador (admin) ou do servidor, que só força a pedido do
--      coordenador (a função da borda confere isso).
--    - A trava é comparada com IS NOT DISTINCT FROM: a reserva feita pelo servidor tem em_andamento_por
--      nulo, e só o servidor consegue gravar/concluir nela; a reserva de um usuário só ele.
-- 3) sync_contract_item_quantity_atomic e sync_item_senasp_quantity_atomic (saldos dos itens): aceitam o
--    servidor. A definição é lida do banco e só a linha de autorização é trocada, para não reescrever
--    o corpo, que pode ter mudado em outras migrations.
--
-- Nada muda para gestor, coordenador e demais perfis: as mesmas regras, o mesmo comportamento.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) A chamada vem do servidor?
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eh_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    ''
  ) = 'service_role';
$$;

REVOKE ALL ON FUNCTION public.eh_service_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eh_service_role() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2a) Reservar a sincronização (trava)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reservar_sincronizacao(
  p_recurso VARCHAR(40),
  p_uasg VARCHAR(6),
  p_validade INTERVAL DEFAULT INTERVAL '6 hours',
  p_forcar BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_servidor BOOLEAN := public.eh_service_role();
  v_validade INTERVAL := GREATEST(COALESCE(p_validade, INTERVAL '6 hours'), INTERVAL '1 hour');
  v_reservou BOOLEAN;
BEGIN
  IF NOT (v_servidor OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador sincroniza com as fontes oficiais.'
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_forcar, FALSE) AND NOT (v_servidor OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador força a atualização.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sincronizacao_fontes AS s
    (recurso, uasg, em_andamento_desde, em_andamento_por, ultima_tentativa_em)
  VALUES
    (p_recurso, p_uasg, NOW(), auth.uid(), NOW())
  ON CONFLICT (recurso, uasg) DO UPDATE
    SET em_andamento_desde = NOW(),
        em_andamento_por = auth.uid(),
        ultima_tentativa_em = NOW()
    WHERE (s.em_andamento_desde IS NULL OR s.em_andamento_desde < NOW() - INTERVAL '10 minutes')
      AND (
        COALESCE(p_forcar, FALSE)
        OR (
          (s.ultimo_sucesso_em IS NULL OR s.ultimo_sucesso_em < NOW() - v_validade)
          AND (s.ultima_tentativa_em IS NULL OR s.ultima_tentativa_em < NOW() - INTERVAL '30 minutes')
        )
      )
  RETURNING TRUE INTO v_reservou;

  RETURN COALESCE(v_reservou, FALSE);
END;
$$;

-- ------------------------------------------------------------------------------
-- 2b) Gravar contratos em lote, só com a trava em mãos
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_contratos_oficiais(
  p_uasg VARCHAR(6),
  p_registros JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador sincroniza com as fontes oficiais.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sincronizacao_fontes
     WHERE recurso = 'contratos'
       AND uasg = p_uasg
       AND em_andamento_por IS NOT DISTINCT FROM auth.uid()
       AND em_andamento_desde >= NOW() - INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'SYNC_NOT_RESERVED: Sincronização de contratos da UASG % não reservada por este usuário.', p_uasg
      USING ERRCODE = '55000';
  END IF;

  IF p_registros IS NULL OR jsonb_typeof(p_registros) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_registros deve ser um array JSON.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_registros) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 500 contratos por chamada.'
      USING ERRCODE = '22023';
  END IF;

  WITH entrada AS (
    SELECT DISTINCT ON (r.valor->>'id')
           r.valor AS reg
      FROM jsonb_array_elements(p_registros) WITH ORDINALITY AS r(valor, ordem)
     WHERE jsonb_typeof(r.valor) = 'object'
       AND COALESCE(btrim(r.valor->>'id'), '') <> ''
     ORDER BY r.valor->>'id', r.ordem DESC
  )
  INSERT INTO public.contratos_oficiais AS c (
    uasg, contract_key, numero, ano, data_vigencia_fim, fornecedor_cnpj_cpf,
    id_compra, numero_controle_pncp, contrato_id_gov, fonte_dados, registro, sincronizado_em
  )
  SELECT p_uasg,
         left(btrim(reg->>'id'), 100),
         COALESCE(reg->>'numero', ''),
         COALESCE(reg->>'ano', ''),
         public.texto_para_data(reg->>'dataVigenciaFim'),
         NULLIF(reg->>'fornecedorCnpjCpf', ''),
         NULLIF(reg->>'idCompra', ''),
         NULLIF(reg->>'numeroControlePncp', ''),
         NULLIF(reg->>'contratoId', ''),
         NULLIF(reg->>'fonteDados', ''),
         reg - 'statusVigencia',
         NOW()
    FROM entrada
  ON CONFLICT (uasg, contract_key) DO UPDATE
    SET numero = EXCLUDED.numero,
        ano = EXCLUDED.ano,
        data_vigencia_fim = EXCLUDED.data_vigencia_fim,
        fornecedor_cnpj_cpf = EXCLUDED.fornecedor_cnpj_cpf,
        id_compra = EXCLUDED.id_compra,
        numero_controle_pncp = EXCLUDED.numero_controle_pncp,
        contrato_id_gov = EXCLUDED.contrato_id_gov,
        fonte_dados = EXCLUDED.fonte_dados,
        registro = EXCLUDED.registro,
        sincronizado_em = EXCLUDED.sincronizado_em;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2c) Concluir a sincronização: libera a trava e registra o resultado
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.concluir_sincronizacao(
  p_recurso VARCHAR(40),
  p_uasg VARCHAR(6),
  p_status VARCHAR(10),
  p_fontes_com_falha TEXT[] DEFAULT '{}',
  p_total INTEGER DEFAULT NULL,
  p_mensagem TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_linhas INTEGER;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador sincroniza com as fontes oficiais.'
      USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('SUCESSO', 'PARCIAL', 'ERRO') THEN
    RAISE EXCEPTION 'INVALID_STATUS: use SUCESSO, PARCIAL ou ERRO.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.sincronizacao_fontes
     SET em_andamento_desde = NULL,
         em_andamento_por = NULL,
         ultimo_status = p_status,
         ultimo_sucesso_em = CASE WHEN p_status = 'SUCESSO' THEN NOW() ELSE ultimo_sucesso_em END,
         fontes_com_falha = COALESCE(p_fontes_com_falha, '{}'),
         total_registros = p_total,
         mensagem = left(p_mensagem, 500)
   WHERE recurso = p_recurso
     AND uasg = p_uasg
     AND em_andamento_por IS NOT DISTINCT FROM auth.uid();

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas > 0;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3) Saldos dos itens: quantidade contratada e quantitativo SENASP
-- Só a linha de autorização muda; o resto da definição vem do próprio banco.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_funcao TEXT;
  v_oid OID;
  v_def TEXT;
  v_novo TEXT;
  v_antes CONSTANT TEXT := 'IF NOT (public.has_role(''gestor'') OR public.has_role(''admin'')) THEN';
  v_depois CONSTANT TEXT := 'IF NOT (public.eh_service_role() OR public.has_role(''gestor'') OR public.has_role(''admin'')) THEN';
BEGIN
  FOREACH v_funcao IN ARRAY ARRAY['sync_contract_item_quantity_atomic', 'sync_item_senasp_quantity_atomic'] LOOP
    SELECT p.oid INTO v_oid
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_funcao;
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Função public.% não encontrada; migration revertida.', v_funcao;
    END IF;

    v_def := pg_get_functiondef(v_oid);
    IF position('public.eh_service_role()' IN v_def) > 0 THEN
      RAISE NOTICE '% já aceita o servidor; nada a fazer.', v_funcao;
      CONTINUE;
    END IF;

    v_novo := replace(v_def, v_antes, v_depois);
    IF v_novo = v_def THEN
      RAISE EXCEPTION 'A linha de autorização de public.% mudou e não foi encontrada; migration revertida.', v_funcao;
    END IF;
    EXECUTE v_novo;
    RAISE NOTICE '% passou a aceitar o servidor.', v_funcao;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4) O servidor pode executar as funções (em produção já pode pelos privilégios padrão do Supabase;
--    explícito aqui para não depender disso, por exemplo num banco local novo).
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.reservar_sincronizacao(VARCHAR, VARCHAR, INTERVAL, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.gravar_contratos_oficiais(VARCHAR, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.concluir_sincronizacao(VARCHAR, VARCHAR, VARCHAR, TEXT[], INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_contract_item_quantity_atomic(VARCHAR, VARCHAR, NUMERIC, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_item_senasp_quantity_atomic(VARCHAR, NUMERIC) TO service_role;
