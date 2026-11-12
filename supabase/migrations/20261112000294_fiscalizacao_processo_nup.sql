-- ==============================================================================
-- MIGRATION 294: FISCALIZAÇÃO — AUTUAÇÃO PELO PROCESSO DE ACOMPANHAMENTO (NUP)
-- Versão: 20261112000294_fiscalizacao_processo_nup.sql
--
-- Pedido do usuário (12/11/2026): a autuação volta a ser o processo de fiscalização (NUP do processo "Gestão de
-- Contratos: Acompanhamento Contratual" no SEI), achado a partir do número SEI do contrato. Os dois ficam guardados:
--
-- 1) fisc_contratos.processo_nup (NNNNN.NNNNNN/AAAA-DD) e processo_autuado_em (andamento "Processo público gerado").
--    processo_sei continua com o número SEI do contrato e autuado_em com a data do contrato (migration 266).
--    "A autuar" passa a ser contrato da SFC/CGLIC sem processo_nup.
-- 2) registrar_autuacao_fiscalizacao: NUP + data da autuação (fiscal do contrato ou coordenador).
-- 3) definir_fiscalizacao_contrato: contrato que passa à área requisitante perde o NUP, como já perdia o SEI.
-- 4) fisc_contratos_para_distribuicao devolve processo_nup e processo_autuado_em.
-- 5) Carga pela leitura do SEI de 12/11/2026 (398 contratos da SFC/CGLIC): 351 aceitos, em que o SEI do contrato está
--    num processo de Acompanhamento Contratual. Os 4 com outro tipo de processo e os 43 ainda no processo da compra
--    ficam "a autuar". Só preenche contrato da SFC/CGLIC (ou misto) ainda sem NUP: não sobrescreve o que o fiscal
--    registrou.
-- ==============================================================================

-- 1) Colunas
ALTER TABLE public.fisc_contratos
  ADD COLUMN IF NOT EXISTS processo_nup TEXT,
  ADD COLUMN IF NOT EXISTS processo_autuado_em DATE;
ALTER TABLE public.fisc_contratos DROP CONSTRAINT IF EXISTS fisc_contratos_processo_nup;
ALTER TABLE public.fisc_contratos ADD CONSTRAINT fisc_contratos_processo_nup CHECK (
  (processo_nup IS NULL OR processo_nup ~ '^[0-9]{5}\.[0-9]{6}/[0-9]{4}-[0-9]{2}$')
  AND (processo_nup IS NULL) = (processo_autuado_em IS NULL)
);
COMMENT ON COLUMN public.fisc_contratos.processo_nup IS 'NUP do processo de acompanhamento contratual (fiscalização) no SEI: vale para a autuação (migration 294).';
COMMENT ON COLUMN public.fisc_contratos.processo_autuado_em IS 'Data da autuação do processo de acompanhamento (andamento "Processo público gerado").';
COMMENT ON COLUMN public.fisc_contratos.processo_sei IS 'Número SEI do contrato (documento, 7 a 10 dígitos), da planilha da SFC/CGLIC (migration 266). A autuação é o processo_nup (migration 294).';
COMMENT ON COLUMN public.fisc_contratos.autuado_em IS 'Data do contrato (assinatura), registrada com o número SEI do contrato.';

-- NUP: public.fisc_nup (migration 262) aceita os 17 dígitos e grava NNNNN.NNNNNN/AAAA-DD.

-- 2) Registrar a autuação: só o fiscal ou o coordenador.
CREATE OR REPLACE FUNCTION public.registrar_autuacao_fiscalizacao(p_contract_key TEXT, p_processo_nup TEXT, p_autuado_em DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_f    public.fisc_contratos%ROWTYPE;
  v_nup  TEXT := public.fisc_nup(p_processo_nup);
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem permissão para registrar a fiscalização.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_f FROM public.fisc_contratos WHERE contract_key = p_contract_key FOR UPDATE;
  IF NOT FOUND OR v_f.fiscalizacao = 'AREA' THEN
    RAISE EXCEPTION 'NOT_FOUND: Este contrato não está com a SFC/CGLIC.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_role('admin') AND auth.uid() IS DISTINCT FROM v_f.fiscal_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o fiscal ou o coordenador registram a autuação deste contrato.' USING ERRCODE = '42501';
  END IF;
  IF v_nup IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o processo de acompanhamento (NUP, ex.: 08020.000017/2026-88).' USING ERRCODE = '22023';
  END IF;
  IF p_autuado_em IS NULL OR p_autuado_em > (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe a data da autuação (até hoje).' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fisc_contratos
     SET processo_nup = v_nup, processo_autuado_em = p_autuado_em, atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE contract_key = p_contract_key;
  RETURN jsonb_build_object('contract_key', p_contract_key, 'processo_nup', v_nup, 'processo_autuado_em', p_autuado_em);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_autuacao_fiscalizacao(TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_autuacao_fiscalizacao(TEXT, TEXT, DATE) TO authenticated;

-- 3) Definir: área requisitante perde também o NUP
-- (assinatura igual à da 288: CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.definir_fiscalizacao_contrato(p_contract_key text, p_fiscalizacao text, p_fiscal_user_id uuid, p_portaria_sei text, p_motivo text, p_unidade_area text)
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
        processo_nup = CASE WHEN EXCLUDED.fiscalizacao = 'AREA' THEN NULL ELSE f.processo_nup END,
        processo_autuado_em = CASE WHEN EXCLUDED.fiscalizacao = 'AREA' THEN NULL ELSE f.processo_autuado_em END,
        atualizado_por_nome = EXCLUDED.atualizado_por_nome, atualizado_em = NOW();

  RETURN jsonb_build_object('contract_key', p_contract_key, 'fiscalizacao', p_fiscalizacao, 'fiscal', v_fiscal, 'unidade_area', v_unidade);
END;
$function$;
REVOKE ALL ON FUNCTION public.definir_fiscalizacao_contrato(text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.definir_fiscalizacao_contrato(text, text, uuid, text, text, text) TO authenticated;

-- 4) Lista da Distribuição: com o NUP e a data da autuação
DROP FUNCTION public.fisc_contratos_para_distribuicao();
CREATE FUNCTION public.fisc_contratos_para_distribuicao()
 RETURNS TABLE(contract_key text, uasg text, numero text, fornecedor text, objeto text, assinatura date, vigencia_fim date, emendas text[], situacao text, motivo text, fiscal_user_id uuid, fiscal_nome text, portaria_sei text, processo_sei text, autuado_em date, definido_por_nome text, definido_em timestamp with time zone, atas text[], unidade_area text, unidades_do_contrato text[], processo_nup text, processo_autuado_em date)
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
         COALESCE(dv.lista, al.lista, ARRAY[]::TEXT[]),
         f.processo_nup::TEXT, f.processo_autuado_em
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

-- 5) Carga: NUP e data da autuação lidos no SEI do MJ em 12/11/2026 (processo de Acompanhamento Contratual).
WITH sei (contract_key, nup, autuado_em) AS (
VALUES
  ('200331-00251-2025', '08020.000017/2026-88', DATE '2026-01-05'),
  ('200331-00276-2025', '08020.000259/2026-71', DATE '2026-01-09'),
  ('200331-00270-2025', '08020.000260/2026-04', DATE '2026-01-09'),
  ('200331-00269-2025', '08020.000263/2026-30', DATE '2026-01-09'),
  ('200331-00248-2025', '08020.000264/2026-84', DATE '2026-01-09'),
  ('200331-00262-2025', '08020.000299/2026-13', DATE '2026-01-12'),
  ('200331-00259-2025', '08020.000304/2026-98', DATE '2026-01-12'),
  ('200331-00236-2025', '08020.000311/2026-90', DATE '2026-01-12'),
  ('200331-00260-2025', '08020.000320/2026-81', DATE '2026-01-12'),
  ('200331-00129-2025', '08020.000321/2026-25', DATE '2026-01-12'),
  ('200331-00256-2025', '08020.000390/2026-39', DATE '2026-01-14'),
  ('200331-00092-2023', '08020.000392/2024-66', DATE '2024-01-18'),
  ('200331-00255-2025', '08020.000393/2026-72', DATE '2026-01-14'),
  ('200331-00093-2023', '08020.000398/2024-33', DATE '2024-01-18'),
  ('200331-00107-2023', '08020.000407/2024-96', DATE '2024-01-18'),
  ('200331-00096-2023', '08020.000423/2024-89', DATE '2024-01-18'),
  ('200331-00097-2023', '08020.000449/2024-27', DATE '2024-01-19'),
  ('200331-00268-2025', '08020.000455/2026-46', DATE '2026-01-15'),
  ('200331-00029-2026', '08020.000537/2026-91', DATE '2026-01-19'),
  ('200331-00030-2026', '08020.000538/2026-35', DATE '2026-01-19'),
  ('200331-00008-2026', '08020.000542/2026-01', DATE '2026-01-19'),
  ('200331-00253-2025', '08020.000552/2026-39', DATE '2026-01-19'),
  ('200331-00263-2025', '08020.000576/2026-98', DATE '2026-01-19'),
  ('200331-00231-2025', '08020.000584/2026-34', DATE '2026-01-20'),
  ('200331-00032-2026', '08020.000820/2026-12', DATE '2026-01-26'),
  ('200331-00026-2026', '08020.000846/2026-61', DATE '2026-01-27'),
  ('200331-00007-2026', '08020.000859/2026-30', DATE '2026-01-27'),
  ('200331-00023-2026', '08020.000869/2026-75', DATE '2026-01-27'),
  ('200331-00005-2024', '08020.001039/2024-01', DATE '2024-02-14'),
  ('200331-00109-2023', '08020.001041/2024-72', DATE '2024-02-14'),
  ('200331-00055-2026', '08020.001055/2026-58', DATE '2026-02-02'),
  ('200331-00127-2025', '08020.001093/2026-19', DATE '2026-02-03'),
  ('200331-00028-2026', '08020.001097/2026-99', DATE '2026-02-03'),
  ('200331-00155-2025', '08020.001143/2026-50', DATE '2026-02-04'),
  ('200331-00072-2026', '08020.001217/2026-58', DATE '2026-02-05'),
  ('200331-00013-2024', '08020.001307/2024-87', DATE '2024-02-22'),
  ('200331-00027-2026', '08020.001777/2026-11', DATE '2026-02-19'),
  ('200331-00045-2026', '08020.001780/2026-26', DATE '2026-02-19'),
  ('200331-00046-2026', '08020.001783/2026-60', DATE '2026-02-19'),
  ('200331-00047-2026', '08020.001784/2026-12', DATE '2026-02-19'),
  ('200331-00062-2026', '08020.001788/2026-92', DATE '2026-02-19'),
  ('200331-00063-2026', '08020.001792/2026-51', DATE '2026-02-19'),
  ('200331-00068-2026', '08020.001794/2026-40', DATE '2026-02-19'),
  ('200331-00070-2026', '08020.001798/2026-28', DATE '2026-02-19'),
  ('200331-00075-2026', '08020.001799/2026-72', DATE '2026-02-19'),
  ('200331-00050-2025', '08020.001990/2025-33', DATE '2025-02-13'),
  ('200331-00024-2025', '08020.002036/2025-68', DATE '2025-02-14'),
  ('200331-00102-2024', '08020.002040/2025-26', DATE '2025-02-14'),
  ('200331-00038-2025', '08020.002054/2025-40', DATE '2025-02-14'),
  ('200331-00014-2025', '08020.002073/2025-76', DATE '2025-02-14'),
  ('200331-00021-2025', '08020.002113/2025-80', DATE '2025-02-17'),
  ('200331-00005-2025', '08020.002115/2025-79', DATE '2025-02-17'),
  ('200331-00003-2025', '08020.002118/2025-11', DATE '2025-02-17'),
  ('200331-00002-2025', '08020.002119/2025-57', DATE '2025-02-17'),
  ('200331-00001-2025', '08020.002120/2025-81', DATE '2025-02-17'),
  ('200331-00098-2024', '08020.002121/2025-26', DATE '2025-02-17'),
  ('200331-00094-2024', '08020.002122/2025-71', DATE '2025-02-17'),
  ('200331-00093-2024', '08020.002123/2025-15', DATE '2025-02-17'),
  ('200331-00092-2024', '08020.002124/2025-60', DATE '2025-02-17'),
  ('200331-00027-2025', '08020.002125/2025-12', DATE '2025-02-17'),
  ('200331-00030-2025', '08020.002129/2025-92', DATE '2025-02-17'),
  ('200331-00060-2026', '08020.002143/2026-77', DATE '2026-02-27'),
  ('200331-00065-2026', '08020.002155/2026-00', DATE '2026-02-27'),
  ('200331-00071-2026', '08020.002158/2026-35', DATE '2026-02-27'),
  ('200331-00076-2026', '08020.002159/2026-80', DATE '2026-02-27'),
  ('200331-00084-2026', '08020.002162/2026-01', DATE '2026-02-27'),
  ('200331-00035-2025', '08020.002538/2025-99', DATE '2025-02-26'),
  ('200331-00099-2024', '08020.002551/2025-48', DATE '2025-02-26'),
  ('200331-00066-2026', '08020.002627/2026-16', DATE '2026-03-10'),
  ('200331-00074-2026', '08020.002629/2026-13', DATE '2026-03-10'),
  ('200331-00025-2025', '08020.002825/2025-07', DATE '2025-03-10'),
  ('200331-00057-2025', '08020.002846/2025-14', DATE '2025-03-10'),
  ('200331-00069-2026', '08020.003061/2026-40', DATE '2026-03-17'),
  ('200331-00061-2025', '08020.003169/2025-51', DATE '2025-03-19'),
  ('200331-00054-2025', '08020.003184/2025-08', DATE '2025-03-19'),
  ('200331-00034-2025', '08020.003245/2025-29', DATE '2025-03-20'),
  ('200331-00032-2025', '08020.003268/2025-33', DATE '2025-03-21'),
  ('200331-00073-2026', '08020.003596/2026-11', DATE '2026-03-30'),
  ('200331-00102-2026', '08020.003618/2026-42', DATE '2026-03-30'),
  ('200331-00055-2025', '08020.003781/2025-24', DATE '2025-04-03'),
  ('200331-00069-2025', '08020.003782/2025-79', DATE '2025-04-03'),
  ('200331-00059-2025', '08020.003783/2025-13', DATE '2025-04-03'),
  ('200331-00058-2025', '08020.003784/2025-68', DATE '2025-04-03'),
  ('200331-00068-2025', '08020.003785/2025-11', DATE '2025-04-03'),
  ('200331-00272-2025', '08020.004002/2026-99', DATE '2026-04-07'),
  ('200331-00273-2025', '08020.004008/2026-66', DATE '2026-04-07'),
  ('200331-00275-2025', '08020.004041/2026-96', DATE '2026-04-08'),
  ('200331-00001-2026', '08020.004049/2026-52', DATE '2026-04-08'),
  ('200331-00066-2025', '08020.004086/2025-80', DATE '2025-04-11'),
  ('200331-00067-2025', '08020.004095/2025-71', DATE '2025-04-11'),
  ('200331-00056-2025', '08020.004586/2025-11', DATE '2025-04-29'),
  ('200331-00004-2025', '08020.004646/2025-04', DATE '2025-04-30'),
  ('200331-00003-2026', '08020.004936/2026-21', DATE '2026-04-23'),
  ('200331-00108-2026', '08020.004984/2026-19', DATE '2026-04-24'),
  ('200331-00005-2026', '08020.004993/2026-18', DATE '2026-04-24'),
  ('200331-00031-2025', '08020.005063/2025-92', DATE '2025-05-14'),
  ('200331-00100-2026', '08020.005143/2026-29', DATE '2026-04-28'),
  ('200331-00018-2026', '08020.005174/2026-80', DATE '2026-04-28'),
  ('200331-00086-2026', '08020.005190/2026-72', DATE '2026-04-28'),
  ('200331-00028-2024', '08020.005250/2024-95', DATE '2024-06-18'),
  ('200331-00078-2026', '08020.005412/2026-57', DATE '2026-05-04'),
  ('200331-00090-2026', '08020.005450/2026-18', DATE '2026-05-05'),
  ('200331-00101-2026', '08020.005458/2026-76', DATE '2026-05-05'),
  ('200331-00103-2026', '08020.005462/2026-34', DATE '2026-05-05'),
  ('200331-00106-2026', '08020.005479/2026-91', DATE '2026-05-05'),
  ('200331-00064-2025', '08020.005502/2025-67', DATE '2025-05-23'),
  ('200331-00107-2026', '08020.005502/2026-48', DATE '2026-05-06'),
  ('200331-00109-2026', '08020.005507/2026-71', DATE '2026-05-06'),
  ('200331-00112-2026', '08020.005524/2026-16', DATE '2026-05-06'),
  ('200331-00115-2026', '08020.005547/2026-12', DATE '2026-05-06'),
  ('200331-00117-2026', '08020.005552/2026-25', DATE '2026-05-06'),
  ('200331-00118-2026', '08020.005558/2026-01', DATE '2026-05-06'),
  ('200331-00119-2026', '08020.005563/2026-13', DATE '2026-05-06'),
  ('200331-00124-2026', '08020.005585/2026-75', DATE '2026-05-07'),
  ('200331-00004-2026', '08020.005942/2026-03', DATE '2026-05-13'),
  ('200331-00029-2024', '08020.006168/2024-88', DATE '2024-07-22'),
  ('200331-00032-2024', '08020.006174/2024-35', DATE '2024-07-22'),
  ('200331-00035-2024', '08020.006183/2024-26', DATE '2024-07-22'),
  ('200331-00040-2024', '08020.006186/2024-60', DATE '2024-07-22'),
  ('200331-00044-2026', '08020.006343/2026-07', DATE '2026-05-21'),
  ('200331-00139-2026', '08020.006555/2026-86', DATE '2026-05-26'),
  ('200331-00145-2026', '08020.006564/2026-77', DATE '2026-05-26'),
  ('200331-00140-2026', '08020.006571/2026-79', DATE '2026-05-26'),
  ('200331-00142-2026', '08020.006578/2026-91', DATE '2026-05-26'),
  ('200331-00137-2026', '08020.006688/2026-52', DATE '2026-05-27'),
  ('200331-00161-2026', '08020.007080/2026-45', DATE '2026-06-03'),
  ('200331-00128-2026', '08020.007166/2026-78', DATE '2026-06-08'),
  ('200331-00135-2026', '08020.007228/2026-41', DATE '2026-06-09'),
  ('200331-00154-2026', '08020.007277/2026-84', DATE '2026-06-09'),
  ('200331-00164-2026', '08020.007312/2026-65', DATE '2026-06-10'),
  ('200331-00132-2026', '08020.007328/2026-78', DATE '2026-06-10'),
  ('200331-00125-2026', '08020.007347/2026-02', DATE '2026-06-10'),
  ('200331-00087-2025', '08020.007375/2025-31', DATE '2025-07-21'),
  ('200331-00111-2026', '08020.007449/2026-10', DATE '2026-06-11'),
  ('200331-00138-2026', '08020.007457/2026-66', DATE '2026-06-11'),
  ('200331-00136-2026', '08020.007505/2026-16', DATE '2026-06-12'),
  ('200331-00143-2026', '08020.007519/2026-30', DATE '2026-06-12'),
  ('200331-00043-2026', '08020.007620/2026-91', DATE '2026-06-15'),
  ('200331-00153-2026', '08020.007668/2026-07', DATE '2026-06-16'),
  ('200331-00134-2026', '08020.007671/2026-12', DATE '2026-06-16'),
  ('200331-00167-2026', '08020.007703/2026-80', DATE '2026-06-16'),
  ('200331-00163-2026', '08020.007832/2026-78', DATE '2026-06-18'),
  ('200331-00151-2026', '08020.007834/2026-67', DATE '2026-06-18'),
  ('200331-00174-2026', '08020.007895/2026-24', DATE '2026-06-19'),
  ('200331-00126-2026', '08020.007898/2026-68', DATE '2026-06-19'),
  ('200331-00133-2026', '08020.007906/2026-76', DATE '2026-06-19'),
  ('200331-00123-2026', '08020.008009/2026-80', DATE '2026-06-22'),
  ('200331-00169-2026', '08020.008127/2026-98', DATE '2026-06-24'),
  ('200331-00110-2026', '08020.008132/2026-09', DATE '2026-06-24'),
  ('200331-00098-2025', '08020.008228/2025-88', DATE '2025-08-11'),
  ('200331-00075-2023', '08020.008262/2024-71', DATE '2024-10-03'),
  ('200331-00204-2026', '08020.008282/2026-12', DATE '2026-06-26'),
  ('200331-00210-2026', '08020.008283/2026-59', DATE '2026-06-26'),
  ('200331-00062-2024', '08020.008289/2024-64', DATE '2024-10-03'),
  ('200331-00061-2024', '08020.008303/2024-20', DATE '2024-10-04'),
  ('200331-00063-2024', '08020.008371/2024-99', DATE '2024-10-08'),
  ('200331-00165-2026', '08020.008383/2026-85', DATE '2026-06-30'),
  ('200331-00071-2023', '08020.008523/2023-72', DATE '2023-09-08'),
  ('200331-00102-2025', '08020.008616/2025-69', DATE '2025-08-20'),
  ('200331-00106-2025', '08020.008636/2025-30', DATE '2025-08-20'),
  ('200331-00006-2026', '08020.008863/2026-46', DATE '2026-07-07'),
  ('200331-00016-2026', '08020.008926/2026-64', DATE '2026-07-08'),
  ('200331-00056-2026', '08020.009009/2026-05', DATE '2026-07-09'),
  ('200331-00108-2025', '08020.009164/2025-32', DATE '2025-09-03'),
  ('200331-00107-2025', '08020.009165/2025-87', DATE '2025-09-03'),
  ('200331-00109-2025', '08020.009168/2025-11', DATE '2025-09-03'),
  ('200331-00066-2024', '08020.009235/2024-16', DATE '2024-11-08'),
  ('200331-00112-2025', '08020.009257/2025-67', DATE '2025-09-04'),
  ('200331-00061-2026', '08020.009262/2026-51', DATE '2026-07-13'),
  ('200331-00129-2026', '08020.009276/2026-74', DATE '2026-07-13'),
  ('200331-00148-2026', '08020.009293/2026-10', DATE '2026-07-13'),
  ('200331-00162-2026', '08020.009294/2026-56', DATE '2026-07-13'),
  ('200331-00117-2025', '08020.009299/2025-06', DATE '2025-09-05'),
  ('200331-00157-2026', '08020.009315/2026-33', DATE '2026-07-14'),
  ('200331-00113-2025', '08020.009348/2025-01', DATE '2025-09-08'),
  ('200331-00114-2025', '08020.009365/2025-30', DATE '2025-09-08'),
  ('200331-00115-2025', '08020.009368/2025-73', DATE '2025-09-08'),
  ('200331-00110-2025', '08020.009384/2025-66', DATE '2025-09-08'),
  ('200331-00116-2025', '08020.009395/2025-46', DATE '2025-09-09'),
  ('200331-00111-2025', '08020.009441/2025-15', DATE '2025-09-10'),
  ('200331-00103-2025', '08020.009476/2025-46', DATE '2025-09-11'),
  ('200331-00134-2025', '08020.009483/2025-48', DATE '2025-09-11'),
  ('200331-00132-2025', '08020.009497/2025-61', DATE '2025-09-11'),
  ('200331-00128-2025', '08020.009553/2025-68', DATE '2025-09-12'),
  ('200331-00120-2025', '08020.009562/2025-59', DATE '2025-09-12'),
  ('200331-00130-2025', '08020.009580/2025-31', DATE '2025-09-12'),
  ('200331-00244-2026', '08020.009691/2026-28', DATE '2026-07-17'),
  ('200331-00245-2026', '08020.009697/2026-03', DATE '2026-07-17'),
  ('200331-00246-2026', '08020.009701/2026-25', DATE '2026-07-17'),
  ('200331-00215-2026', '08020.009816/2026-10', DATE '2026-07-20'),
  ('200331-00217-2026', '08020.009821/2026-22', DATE '2026-07-20'),
  ('200331-00218-2026', '08020.009822/2026-77', DATE '2026-07-20'),
  ('200331-00219-2026', '08020.009824/2026-66', DATE '2026-07-20'),
  ('200331-00221-2026', '08020.009825/2026-19', DATE '2026-07-20'),
  ('200331-00222-2026', '08020.009826/2026-55', DATE '2026-07-20'),
  ('200331-00223-2026', '08020.009828/2026-44', DATE '2026-07-20'),
  ('200331-00224-2026', '08020.009829/2026-99', DATE '2026-07-20'),
  ('200331-00226-2026', '08020.009833/2026-57', DATE '2026-07-20'),
  ('200331-00127-2026', '08020.009896/2026-11', DATE '2026-07-20'),
  ('200331-00248-2026', '08020.009974/2026-70', DATE '2026-07-21'),
  ('200331-00122-2025', '08020.010010/2025-93', DATE '2025-09-24'),
  ('200331-00131-2026', '08020.010057/2026-38', DATE '2026-07-22'),
  ('200331-00138-2025', '08020.010072/2025-03', DATE '2025-09-25'),
  ('200331-00149-2026', '08020.010087/2026-44', DATE '2026-07-22'),
  ('200331-00139-2025', '08020.010123/2025-99', DATE '2025-09-26'),
  ('200331-00118-2025', '08020.010151/2025-14', DATE '2025-09-29'),
  ('200331-00105-2025', '08020.010161/2025-41', DATE '2025-09-29'),
  ('200331-00141-2025', '08020.010169/2025-16', DATE '2025-09-29'),
  ('200331-00133-2025', '08020.010207/2025-22', DATE '2025-09-30'),
  ('200331-00130-2026', '08020.010444/2026-74', DATE '2026-07-27'),
  ('200331-00155-2026', '08020.010461/2026-10', DATE '2026-07-27'),
  ('200331-00140-2025', '08020.010567/2025-24', DATE '2025-10-07'),
  ('200331-00153-2025', '08020.010590/2025-19', DATE '2025-10-08'),
  ('200331-00012-2025', '08020.010625/2025-10', DATE '2025-10-08'),
  ('200331-00104-2025', '08020.010632/2025-11', DATE '2025-10-08'),
  ('200331-00101-2025', '08020.010726/2025-91', DATE '2025-10-10'),
  ('200331-00195-2026', '08020.010821/2026-75', DATE '2026-07-30'),
  ('200331-00176-2025', '08020.010832/2025-74', DATE '2025-10-14'),
  ('200331-00196-2026', '08020.010840/2026-00', DATE '2026-07-30'),
  ('200331-00168-2025', '08020.010899/2025-17', DATE '2025-10-16'),
  ('200331-00174-2025', '08020.010903/2025-39', DATE '2025-10-16'),
  ('200331-00143-2025', '08020.010972/2025-42', DATE '2025-10-20'),
  ('200331-00171-2025', '08020.010982/2025-88', DATE '2025-10-20'),
  ('200331-00156-2025', '08020.011028/2025-11', DATE '2025-10-21'),
  ('200331-00158-2025', '08020.011049/2025-28', DATE '2025-10-22'),
  ('200331-00162-2025', '08020.011052/2025-41', DATE '2025-10-22'),
  ('200331-00170-2025', '08020.011053/2025-96', DATE '2025-10-22'),
  ('200331-00172-2025', '08020.011054/2025-31', DATE '2025-10-22'),
  ('200331-00178-2025', '08020.011055/2025-85', DATE '2025-10-22'),
  ('200331-00175-2025', '08020.011078/2025-90', DATE '2025-10-23'),
  ('200331-00082-2023', '08020.011337/2023-11', DATE '2023-11-13'),
  ('200331-00239-2026', '08020.011378/2026-50', DATE '2026-08-06'),
  ('200331-00197-2025', '08020.011541/2025-01', DATE '2025-11-10'),
  ('200331-00199-2025', '08020.011548/2025-15', DATE '2025-11-10'),
  ('200331-00123-2025', '08020.011571/2025-18', DATE '2025-11-10'),
  ('200331-00124-2025', '08020.011582/2025-90', DATE '2025-11-11'),
  ('200331-00181-2025', '08020.011583/2025-34', DATE '2025-11-11'),
  ('200331-00169-2025', '08020.011604/2025-11', DATE '2025-11-11'),
  ('200331-00145-2025', '08020.011610/2025-79', DATE '2025-11-11'),
  ('200331-00255-2026', '08020.011612/2026-49', DATE '2026-08-11'),
  ('200331-00187-2025', '08020.011619/2025-80', DATE '2025-11-11'),
  ('200331-00252-2026', '08020.011623/2026-29', DATE '2026-08-11'),
  ('200331-00188-2025', '08020.011624/2025-92', DATE '2025-11-12'),
  ('200331-00191-2025', '08020.011625/2025-37', DATE '2025-11-12'),
  ('200331-00157-2025', '08020.011626/2025-81', DATE '2025-11-12'),
  ('200331-00177-2026', '08020.011626/2026-62', DATE '2026-08-11'),
  ('200331-00156-2026', '08020.011630/2026-21', DATE '2026-08-11'),
  ('200331-00159-2025', '08020.011635/2025-72', DATE '2025-11-12'),
  ('200331-00249-2026', '08020.011641/2026-19', DATE '2026-08-11'),
  ('200331-00257-2026', '08020.011643/2026-08', DATE '2026-08-11'),
  ('200331-00177-2025', '08020.011651/2025-65', DATE '2025-11-12'),
  ('200331-00179-2025', '08020.011658/2025-87', DATE '2025-11-12'),
  ('200331-00180-2025', '08020.011672/2025-81', DATE '2025-11-13'),
  ('200331-00183-2025', '08020.011680/2025-27', DATE '2025-11-13'),
  ('200331-00186-2025', '08020.011684/2025-13', DATE '2025-11-13'),
  ('200331-00190-2025', '08020.011697/2025-84', DATE '2025-11-13'),
  ('200331-00185-2025', '08020.011701/2025-12', DATE '2025-11-13'),
  ('200331-00192-2025', '08020.011705/2025-92', DATE '2025-11-13'),
  ('200331-00193-2025', '08020.011722/2025-20', DATE '2025-11-14'),
  ('200331-00198-2025', '08020.011726/2025-16', DATE '2025-11-14'),
  ('200331-00200-2025', '08020.011735/2025-07', DATE '2025-11-14'),
  ('200331-00202-2025', '08020.011742/2025-09', DATE '2025-11-14'),
  ('200331-00091-2026', '08020.011753/2026-61', DATE '2026-08-13'),
  ('200331-00184-2025', '08020.011763/2025-16', DATE '2025-11-17'),
  ('200331-00204-2025', '08020.011766/2025-50', DATE '2025-11-17'),
  ('200331-00205-2025', '08020.011770/2025-18', DATE '2025-11-17'),
  ('200331-00206-2025', '08020.011776/2025-95', DATE '2025-11-17'),
  ('200331-00208-2025', '08020.011793/2025-22', DATE '2025-11-17'),
  ('200331-00209-2025', '08020.011798/2025-55', DATE '2025-11-17'),
  ('200331-00210-2025', '08020.011832/2025-91', DATE '2025-11-17'),
  ('200331-00212-2025', '08020.011844/2025-16', DATE '2025-11-18'),
  ('200331-00099-2025', '08020.011868/2025-75', DATE '2025-11-18'),
  ('200331-00100-2025', '08020.011871/2025-99', DATE '2025-11-18'),
  ('200331-00232-2026', '08020.011910/2026-39', DATE '2026-08-17'),
  ('200331-00250-2026', '08020.011916/2026-14', DATE '2026-08-17'),
  ('200331-00234-2026', '08020.011917/2026-51', DATE '2026-08-17'),
  ('200331-00212-2026', '08020.011972/2026-41', DATE '2026-08-18'),
  ('200331-00161-2025', '08020.011986/2025-83', DATE '2025-11-25'),
  ('200331-00165-2025', '08020.011987/2025-28', DATE '2025-11-25'),
  ('200331-00203-2025', '08020.011990/2025-41', DATE '2025-11-25'),
  ('200331-00211-2025', '08020.011993/2025-85', DATE '2025-11-25'),
  ('200331-00214-2025', '08020.011994/2025-20', DATE '2025-11-25'),
  ('200331-00213-2025', '08020.011995/2025-74', DATE '2025-11-25'),
  ('200331-00215-2025', '08020.011996/2025-19', DATE '2025-11-25'),
  ('200331-00216-2025', '08020.011997/2025-63', DATE '2025-11-25'),
  ('200331-00218-2025', '08020.011999/2025-52', DATE '2025-11-25'),
  ('200331-00219-2025', '08020.012000/2025-92', DATE '2025-11-25'),
  ('200331-00220-2025', '08020.012001/2025-37', DATE '2025-11-25'),
  ('200331-00221-2025', '08020.012002/2025-81', DATE '2025-11-25'),
  ('200331-00222-2025', '08020.012003/2025-26', DATE '2025-11-25'),
  ('200331-00223-2025', '08020.012004/2025-71', DATE '2025-11-25'),
  ('200331-00189-2025', '08020.012025/2025-96', DATE '2025-11-26'),
  ('200331-00238-2025', '08020.012459/2025-96', DATE '2025-12-07'),
  ('200331-00194-2026', '08020.012468/2026-68', DATE '2026-08-25'),
  ('200331-00203-2026', '08020.012503/2026-49', DATE '2026-08-26'),
  ('200331-00233-2026', '08020.012508/2026-71', DATE '2026-08-26'),
  ('200331-00242-2026', '08020.012511/2026-95', DATE '2026-08-26'),
  ('200331-00259-2026', '08020.012523/2026-10', DATE '2026-08-26'),
  ('200331-00011-2025', '08020.012548/2025-32', DATE '2025-12-11'),
  ('200331-00227-2025', '08020.012566/2025-14', DATE '2025-12-11'),
  ('200331-00241-2025', '08020.012571/2025-27', DATE '2025-12-12'),
  ('200331-00154-2025', '08020.012575/2025-13', DATE '2025-12-12'),
  ('200331-00239-2025', '08020.012587/2025-30', DATE '2025-12-12'),
  ('200331-00135-2025', '08020.012593/2025-97', DATE '2025-12-12'),
  ('200331-00228-2025', '08020.012607/2025-72', DATE '2025-12-15'),
  ('200331-00232-2025', '08020.012675/2025-31', DATE '2025-12-17'),
  ('200331-00233-2025', '08020.012676/2025-86', DATE '2025-12-17'),
  ('200331-00234-2025', '08020.012680/2025-44', DATE '2025-12-17'),
  ('200331-00164-2025', '08020.012714/2025-09', DATE '2025-12-18'),
  ('200331-00235-2025', '08020.012724/2025-36', DATE '2025-12-18'),
  ('200331-00199-2026', '08020.012781/2026-04', DATE '2026-08-31'),
  ('200331-00249-2025', '08020.012811/2025-93', DATE '2025-12-24'),
  ('200331-00236-2026', '08020.012820/2026-65', DATE '2026-08-31'),
  ('200331-00166-2025', '08020.012921/2025-55', DATE '2025-12-30'),
  ('200331-00256-2026', '08020.012934/2026-13', DATE '2026-09-01'),
  ('200331-00206-2026', '08020.013082/2026-73', DATE '2026-09-03'),
  ('200331-00205-2026', '08020.013167/2026-51', DATE '2026-09-04'),
  ('200331-00238-2026', '08020.013340/2026-11', DATE '2026-09-09'),
  ('200331-00240-2026', '08020.013352/2026-46', DATE '2026-09-09'),
  ('200331-00198-2026', '08020.013740/2026-27', DATE '2026-09-15'),
  ('200331-00268-2026', '08020.013745/2026-50', DATE '2026-09-15'),
  ('200331-00266-2026', '08020.013750/2026-62', DATE '2026-09-15'),
  ('200331-00267-2026', '08020.013755/2026-95', DATE '2026-09-15'),
  ('200331-00193-2026', '08020.014291/2026-34', DATE '2026-09-23'),
  ('200331-00241-2026', '08020.014294/2026-78', DATE '2026-09-23'),
  ('200331-00235-2026', '08020.014475/2026-02', DATE '2026-09-24'),
  ('200331-00207-2026', '08020.014681/2026-12', DATE '2026-09-28'),
  ('200331-00278-2026', '08020.014687/2026-81', DATE '2026-09-28'),
  ('200331-00200-2026', '08020.014750/2026-80', DATE '2026-09-29'),
  ('200331-00279-2026', '08020.014930/2026-61', DATE '2026-09-30'),
  ('200331-00274-2026', '08020.015069/2026-59', DATE '2026-10-01'),
  ('200331-00281-2026', '08020.015075/2026-14', DATE '2026-10-01'),
  ('200331-00291-2026', '08020.015171/2026-54', DATE '2026-10-02'),
  ('200331-00289-2026', '08020.015245/2026-52', DATE '2026-10-05'),
  ('200331-00298-2026', '08020.015868/2026-25', DATE '2026-10-14'),
  ('200331-00304-2026', '08020.015874/2026-82', DATE '2026-10-14'),
  ('200331-00301-2026', '08020.015885/2026-62', DATE '2026-10-14'),
  ('200331-00237-2026', '08020.015898/2026-31', DATE '2026-10-14'),
  ('200331-00258-2026', '08020.015902/2026-61', DATE '2026-10-14'),
  ('200331-00265-2026', '08020.015905/2026-03', DATE '2026-10-14'),
  ('200331-00290-2026', '08020.015931/2026-23', DATE '2026-10-14'),
  ('200331-00288-2026', '08020.016053/2026-63', DATE '2026-10-15'),
  ('200331-00294-2026', '08020.016059/2026-31', DATE '2026-10-15'),
  ('200331-00282-2026', '08020.017159/2026-84', DATE '2026-10-28'),
  ('200331-00292-2026', '08020.017181/2026-24', DATE '2026-10-28'),
  ('200331-00176-2026', '08020.017185/2026-11', DATE '2026-10-28'),
  ('200331-00302-2026', '08020.017199/2026-26', DATE '2026-10-28'),
  ('200331-00316-2026', '08020.017283/2026-40', DATE '2026-10-29'),
  ('200331-00285-2026', '08020.017579/2026-61', DATE '2026-11-04'),
  ('200331-00311-2026', '08020.017634/2026-12', DATE '2026-11-04'),
  ('200331-00322-2026', '08020.017645/2026-01', DATE '2026-11-04')
)
UPDATE public.fisc_contratos f
   SET processo_nup = s.nup, processo_autuado_em = s.autuado_em, atualizado_em = NOW()
  FROM sei s
 WHERE f.contract_key = s.contract_key
   AND f.fiscalizacao <> 'AREA'
   AND f.processo_nup IS NULL;
