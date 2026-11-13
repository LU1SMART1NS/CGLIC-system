-- ==============================================================================
-- MIGRATION 288: FISCALIZAÇÃO — UNIDADE INTERNA DA ÁREA REQUISITANTE
-- Versão: 20261112000288_fiscalizacao_unidade_area.sql
--
-- Pedido do usuário (12/11/2026, protótipo aprovado): quando a área requisitante fiscaliza o contrato (toda, ou a
-- parte dela numa fiscalização mista), dizer qual unidade interna fiscaliza, para filtrar e ver a carga de cada uma.
--
-- 1) fisc_contratos.unidade_area: sigla da unidade interna (FK internal_departments, ON UPDATE CASCADE). Só em
--    AREA e MISTA; SFC fica sem unidade (CHECK). Contratos já decididos ficam sem unidade até o coordenador indicar.
-- 2) definir_fiscalizacao_contrato ganha p_unidade_area (obrigatória em AREA e MISTA; unidade ativa, ou a que o
--    contrato já tinha). Assinatura nova: DROP + CREATE com as mesmas permissões (só authenticated).
-- 3) fisc_contratos_para_distribuicao devolve unidade_area e unidades_do_contrato (divisão do contratado ou, sem
--    ela, alocação dos itens da ata do contrato): a tela sugere a unidade quando há uma só.
-- 4) Unidade interna indicada num contrato conta como "em uso" (só desativa, não exclui; ver migration 108).
-- ==============================================================================

-- 1) Coluna
ALTER TABLE public.fisc_contratos
  ADD COLUMN IF NOT EXISTS unidade_area VARCHAR(30) REFERENCES public.internal_departments(sigla) ON UPDATE CASCADE;
ALTER TABLE public.fisc_contratos DROP CONSTRAINT IF EXISTS fisc_contratos_unidade_area;
ALTER TABLE public.fisc_contratos ADD CONSTRAINT fisc_contratos_unidade_area CHECK (fiscalizacao <> 'SFC' OR unidade_area IS NULL);
CREATE INDEX IF NOT EXISTS ix_fisc_contratos_unidade_area ON public.fisc_contratos (unidade_area) WHERE unidade_area IS NOT NULL;
COMMENT ON COLUMN public.fisc_contratos.unidade_area IS 'Unidade interna (sigla) que fiscaliza pela área requisitante: o contrato todo (AREA) ou a parte da área (MISTA). Migration 288.';

-- 2) Definir: com a unidade da área requisitante
DROP FUNCTION public.definir_fiscalizacao_contrato(text, text, uuid, text, text);
CREATE FUNCTION public.definir_fiscalizacao_contrato(p_contract_key text, p_fiscalizacao text, p_fiscal_user_id uuid, p_portaria_sei text, p_motivo text, p_unidade_area text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uasg      TEXT;
  v_emenda    BOOLEAN;
  v_fiscal    TEXT;
  v_portaria  TEXT := public.fisc_sei(p_portaria_sei, 'Portaria');
  v_motivo    TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_nome      TEXT := left(public.nome_do_usuario_logado(), 200);
  v_unidade   TEXT := NULLIF(btrim(COALESCE(p_unidade_area, '')), '');
  v_atual     TEXT;
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
    IF p_fiscal_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Contrato com a área requisitante não tem fiscal da SFC/CGLIC.' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_fiscal_user_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha o fiscal.' USING ERRCODE = '22023';
    END IF;
    v_fiscal := public.fisc_nome_do_fiscal(p_fiscal_user_id);
  END IF;

  -- Área requisitante (toda ou a parte dela na mista): a unidade interna que fiscaliza é obrigatória.
  IF p_fiscalizacao = 'SFC' THEN
    v_unidade := NULL;
  ELSE
    IF v_unidade IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha a unidade interna da área requisitante.' USING ERRCODE = '22023';
    END IF;
    SELECT f.unidade_area INTO v_atual FROM public.fisc_contratos f WHERE f.contract_key = p_contract_key;
    -- Unidade desativada só fica se já era a do contrato (não entra em contrato novo).
    IF NOT EXISTS (SELECT 1 FROM public.internal_departments u
                    WHERE u.sigla = v_unidade AND (u.ativo OR u.sigla = v_atual)) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Unidade interna "%" não encontrada ou desativada.', v_unidade USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.fisc_contratos AS f (contract_key, uasg, fiscalizacao, motivo, fiscal_user_id, fiscal_nome,
                                          portaria_sei, unidade_area, definido_por, definido_por_nome, atualizado_por_nome)
  VALUES (p_contract_key, v_uasg, p_fiscalizacao, v_motivo,
          CASE WHEN p_fiscalizacao = 'AREA' THEN NULL ELSE p_fiscal_user_id END, v_fiscal,
          CASE WHEN p_fiscalizacao = 'AREA' THEN NULL ELSE v_portaria END,
          v_unidade,
          auth.uid(), v_nome, v_nome)
  ON CONFLICT (contract_key) DO UPDATE
    SET fiscalizacao = EXCLUDED.fiscalizacao, motivo = EXCLUDED.motivo,
        fiscal_user_id = EXCLUDED.fiscal_user_id, fiscal_nome = EXCLUDED.fiscal_nome,
        unidade_area = EXCLUDED.unidade_area,
        portaria_sei = COALESCE(EXCLUDED.portaria_sei, CASE WHEN EXCLUDED.fiscalizacao = 'AREA' THEN NULL ELSE f.portaria_sei END),
        processo_sei = CASE WHEN EXCLUDED.fiscalizacao = 'AREA' THEN NULL ELSE f.processo_sei END,
        autuado_em = CASE WHEN EXCLUDED.fiscalizacao = 'AREA' THEN NULL ELSE f.autuado_em END,
        atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();

  RETURN jsonb_build_object('contract_key', p_contract_key, 'fiscalizacao', p_fiscalizacao, 'fiscal', v_fiscal, 'unidade_area', v_unidade);
END;
$function$;
REVOKE ALL ON FUNCTION public.definir_fiscalizacao_contrato(text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.definir_fiscalizacao_contrato(text, text, uuid, text, text, text) TO authenticated;

-- 3) Lista da Distribuição: unidade indicada e unidades do contrato
DROP FUNCTION public.fisc_contratos_para_distribuicao();
CREATE FUNCTION public.fisc_contratos_para_distribuicao()
 RETURNS TABLE(contract_key text, uasg text, numero text, fornecedor text, objeto text, assinatura date, vigencia_fim date, emendas text[], situacao text, motivo text, fiscal_user_id uuid, fiscal_nome text, portaria_sei text, processo_sei text, autuado_em date, definido_por_nome text, definido_em timestamp with time zone, atas text[], unidade_area text, unidades_do_contrato text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  atas AS (
    -- A chave do item da ata é "ata-UASG-item" (00031/2025-200331-00002).
    SELECT k.contract_key AS chave, array_agg(DISTINCT split_part(k.item_key, '-', 1) ORDER BY split_part(k.item_key, '-', 1)) AS lista
      FROM public.arp_item_contract_links k
     GROUP BY k.contract_key
  ),
  -- Unidades internas do contrato: pela divisão do contratado (migration 103) ou, sem divisão, pela alocação dos
  -- itens da ata ligados ao contrato. Sugestão para a área requisitante.
  divisao AS (
    SELECT u.contract_key AS chave, array_agg(DISTINCT u.unit_name::TEXT ORDER BY u.unit_name::TEXT) AS lista
      FROM public.contrato_item_divisao_unidades u
     GROUP BY u.contract_key
  ),
  alocacao AS (
    SELECT k.contract_key AS chave, array_agg(DISTINCT a.unit_name::TEXT ORDER BY a.unit_name::TEXT) AS lista
      FROM public.arp_item_contract_links k
      JOIN public.arp_allocations a ON a.item_key = k.item_key AND a.allocated_qty > 0
     GROUP BY k.contract_key
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
         f.motivo, f.fiscal_user_id, f.fiscal_nome::TEXT,
         f.portaria_sei::TEXT, f.processo_sei::TEXT, f.autuado_em, f.definido_por_nome::TEXT, f.definido_em,
         COALESCE(at.lista, ARRAY[]::TEXT[]),
         f.unidade_area::TEXT,
         COALESCE(dv.lista, al.lista, ARRAY[]::TEXT[])
    FROM contratos c
    LEFT JOIN emendas e ON e.chave = c.contract_key
    LEFT JOIN atas at ON at.chave = c.contract_key
    LEFT JOIN divisao dv ON dv.chave = c.contract_key
    LEFT JOIN alocacao al ON al.chave = c.contract_key
    LEFT JOIN public.fisc_contratos f ON f.contract_key = c.contract_key
   WHERE f.contract_key IS NOT NULL
      OR c.data_vigencia_fim IS NULL
      OR c.data_vigencia_fim >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
END;
$function$;
REVOKE ALL ON FUNCTION public.fisc_contratos_para_distribuicao() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_contratos_para_distribuicao() TO authenticated;

-- 4) Unidade indicada num contrato está em uso
CREATE OR REPLACE FUNCTION public.uso_unidade_interna(p_sigla VARCHAR)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'alocacoes', a.n,
    'divisoes', d.n,
    'permissoes', p.n,
    'fiscalizacao', f.n,
    'em_uso', (a.n + d.n + p.n + f.n) > 0
  )
  FROM (SELECT COUNT(*)::INTEGER AS n FROM public.arp_allocations WHERE unit_name = p_sigla) a,
       (SELECT COUNT(*)::INTEGER AS n FROM public.contrato_item_divisao_unidades WHERE unit_name = p_sigla) d,
       (SELECT COUNT(*)::INTEGER AS n FROM public.user_scope_assignments WHERE scope_type = 'UNIT' AND scope_value = p_sigla) p,
       (SELECT COUNT(*)::INTEGER AS n FROM public.fisc_contratos WHERE unidade_area = p_sigla) f;
$$;
REVOKE ALL ON FUNCTION public.uso_unidade_interna(VARCHAR) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.unidades_internas_em_uso()
RETURNS TABLE (sigla VARCHAR, em_uso BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.sigla,
         EXISTS (SELECT 1 FROM public.arp_allocations a WHERE a.unit_name = d.sigla)
      OR EXISTS (SELECT 1 FROM public.contrato_item_divisao_unidades c WHERE c.unit_name = d.sigla)
      OR EXISTS (SELECT 1 FROM public.user_scope_assignments u WHERE u.scope_type = 'UNIT' AND u.scope_value = d.sigla)
      OR EXISTS (SELECT 1 FROM public.fisc_contratos f WHERE f.unidade_area = d.sigla)
    FROM public.internal_departments d
   WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.unidades_internas_em_uso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unidades_internas_em_uso() TO authenticated;
