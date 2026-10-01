-- ==============================================================================
-- MIGRATION 54: SALDO DO ITEM PELA QUANTIDADE CONTRATADA DOS CONTRATOS VINCULADOS
-- Versão: 20261002000054_saldo_item_por_quantidade_contratada.sql
--
-- O consumo do item da ata passa a ser a quantidade contratada nos contratos vinculados a ele
-- (dado oficial do Contratos.gov.br, por item), e não mais a soma de empenhos estimados.
-- O empenho vira execução do contrato (contratado x empenhado).
--
-- O vínculo item <-> contrato continua sem quantidade digitada. A quantidade lida da API
-- fica guardada como CÓPIA (colunas *_api), atualizada pela sincronização, só para a view
-- de saldo (Ata, busca de atas, dashboards) enxergar o total sem consultar a API.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Cópia da quantidade contratada lida da API, por vínculo
-- ------------------------------------------------------------------------------
ALTER TABLE public.arp_item_contract_links
  ADD COLUMN IF NOT EXISTS quantidade_contratada_api NUMERIC(18, 4) CHECK (quantidade_contratada_api IS NULL OR quantidade_contratada_api >= 0),
  ADD COLUMN IF NOT EXISTS valor_unitario_api NUMERIC(18, 4) CHECK (valor_unitario_api IS NULL OR valor_unitario_api >= 0),
  ADD COLUMN IF NOT EXISTS quantidade_lida_em TIMESTAMPTZ;

COMMENT ON COLUMN public.arp_item_contract_links.quantidade_contratada_api IS
  'Quantidade do item no contrato segundo o Contratos.gov.br (cópia lida da API, nunca digitada). NULL = a API não listou o item no contrato.';
COMMENT ON COLUMN public.arp_item_contract_links.valor_unitario_api IS
  'Preço unitário do item no contrato segundo o Contratos.gov.br (cópia lida da API).';
COMMENT ON COLUMN public.arp_item_contract_links.quantidade_lida_em IS
  'Quando a quantidade foi lida da API pela última vez. NULL = ainda não sincronizada.';

-- ------------------------------------------------------------------------------
-- 2. RPC: sync_contract_item_quantity_atomic
-- ------------------------------------------------------------------------------
-- Grava a cópia da quantidade contratada lida da API para o vínculo (item, contrato).
-- Quantidade nula registra que a API foi lida e não listou o item no contrato.
CREATE OR REPLACE FUNCTION public.sync_contract_item_quantity_atomic(
  p_item_key VARCHAR,
  p_contract_key VARCHAR,
  p_quantidade NUMERIC,
  p_valor_unitario NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := TRIM(COALESCE(p_item_key, ''));
  v_contract_key VARCHAR(100) := TRIM(COALESCE(p_contract_key, ''));
  v_id UUID;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
    RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item inválida (formato esperado: 00037/2026-200331-00001). Valor: "%"', v_item_key
      USING ERRCODE = '22023';
  END IF;

  IF v_contract_key = '' THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: Chave canônica do contrato não pode ser vazia.'
      USING ERRCODE = '22023';
  END IF;

  IF p_quantidade IS NOT NULL AND p_quantidade < 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade contratada não pode ser negativa.'
      USING ERRCODE = '22023';
  END IF;

  IF p_valor_unitario IS NOT NULL AND p_valor_unitario < 0 THEN
    RAISE EXCEPTION 'INVALID_PRICE: O preço unitário não pode ser negativo.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.arp_item_contract_links
     SET quantidade_contratada_api = p_quantidade,
         valor_unitario_api = p_valor_unitario,
         quantidade_lida_em = NOW(),
         updated_at = NOW()
   WHERE item_key = v_item_key AND contract_key = v_contract_key
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: O contrato não está vinculado a este item.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'item_key', v_item_key,
    'contract_key', v_contract_key,
    'quantidade_contratada', p_quantidade,
    'valor_unitario', p_valor_unitario,
    'timestamp', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_contract_item_quantity_atomic(VARCHAR, VARCHAR, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_contract_item_quantity_atomic(VARCHAR, VARCHAR, NUMERIC, NUMERIC) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. View de saldo: consumo = soma das quantidades contratadas dos contratos vinculados
-- ------------------------------------------------------------------------------
-- Contratos vinculados cuja quantidade ainda não foi lida da API não somam e são contados em
-- total_contratos_sem_quantidade. O total oficial do Compras.gov e os empenhos seguem na view
-- apenas como referência e execução. Colunas novas ao final.
CREATE OR REPLACE VIEW public.v_arp_item_saldo_detalhado
WITH (security_invoker = true)
AS
WITH empenhos_agg AS (
  SELECT
    item_key,
    COUNT(DISTINCT empenho_id) AS total_empenhos_vinculados,
    COALESCE(SUM(quantidade_consumida) FILTER (WHERE consta_saldo_oficial), 0) AS total_quantidade_identificada,
    MAX(created_at) AS ultimo_empenho_vinculado_em,
    COUNT(*) FILTER (WHERE quantidade_consumida IS NULL) AS total_empenhos_pendentes,
    COALESCE(SUM(quantidade_consumida) FILTER (WHERE fonte_quantidade = 'USUARIO'), 0) AS quantidade_informada_usuario,
    COUNT(*) FILTER (WHERE NOT consta_saldo_oficial) AS total_empenhos_fora_saldo_oficial,
    COALESCE(SUM(quantidade_consumida), 0) AS total_quantidade_empenhos
  FROM public.arp_item_empenhos
  GROUP BY item_key
),
contratos_agg AS (
  SELECT
    item_key,
    COALESCE(SUM(quantidade_contratada_api), 0) AS total_contratado,
    COUNT(*) AS total_contratos_vinculados,
    COUNT(*) FILTER (WHERE quantidade_contratada_api IS NULL) AS total_contratos_sem_quantidade
  FROM public.arp_item_contract_links
  GROUP BY item_key
),
itens_canonical AS (
  SELECT
    i.id AS item_ata_id,
    i.ata_id,
    a.numero_ata,
    a.codigo_uasg,
    i.numero_item,
    (a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item::text, 5, '0')) AS canonical_item_key,
    i.descricao_item,
    i.fornecedor_razao_social,
    i.fornecedor_cnpj_cpf,
    COALESCE(i.quantidade_homologada, 0) AS quantidade_homologada,
    i.valor_unitario
  FROM public.itens_ata i
  JOIN public.atas_registro_preco a ON a.id = i.ata_id
),
base AS (
  SELECT
    COALESCE(ic.canonical_item_key, ea.item_key, so.item_key, ca.item_key) AS item_key,
    ic.item_ata_id,
    ic.ata_id,
    COALESCE(ic.numero_ata, split_part(COALESCE(ea.item_key, so.item_key, ca.item_key), '-', 1)) AS numero_ata,
    COALESCE(ic.codigo_uasg, split_part(COALESCE(ea.item_key, so.item_key, ca.item_key), '-', 2)) AS codigo_uasg,
    COALESCE(ic.numero_item, split_part(COALESCE(ea.item_key, so.item_key, ca.item_key), '-', 3)) AS numero_item,
    ic.descricao_item,
    ic.fornecedor_razao_social,
    ic.fornecedor_cnpj_cpf,
    ic.valor_unitario,
    COALESCE(ic.quantidade_homologada, 0) AS quantidade_homologada,
    COALESCE(ca.total_contratado, 0) AS quantidade_consumida,
    COALESCE(ea.total_empenhos_vinculados, 0) AS total_empenhos_vinculados,
    ea.ultimo_empenho_vinculado_em,
    COALESCE(ea.total_empenhos_pendentes, 0) AS total_empenhos_pendentes,
    COALESCE(ea.quantidade_informada_usuario, 0) AS quantidade_informada_usuario,
    (so.item_key IS NOT NULL) AS saldo_oficial_sincronizado,
    so.lido_em AS saldo_oficial_lido_em,
    CASE
      WHEN so.item_key IS NOT NULL THEN GREATEST(so.quantidade_empenhada - COALESCE(ea.total_quantidade_identificada, 0), 0)
      ELSE 0
    END AS quantidade_sem_identificacao,
    COALESCE(ea.total_empenhos_fora_saldo_oficial, 0) AS total_empenhos_fora_saldo_oficial,
    COALESCE(ca.total_contratos_vinculados, 0) AS total_contratos_vinculados,
    COALESCE(ca.total_contratos_sem_quantidade, 0) AS total_contratos_sem_quantidade,
    COALESCE(ea.total_quantidade_empenhos, 0) AS quantidade_empenhada_confirmada
  FROM itens_canonical ic
  FULL OUTER JOIN empenhos_agg ea ON ea.item_key = ic.canonical_item_key
  FULL OUTER JOIN public.arp_item_saldo_oficial so
    ON so.item_key = COALESCE(ic.canonical_item_key, ea.item_key)
  FULL OUTER JOIN contratos_agg ca
    ON ca.item_key = COALESCE(ic.canonical_item_key, ea.item_key, so.item_key)
)
SELECT
  item_key,
  item_ata_id,
  ata_id,
  numero_ata,
  codigo_uasg,
  numero_item,
  descricao_item,
  fornecedor_razao_social,
  fornecedor_cnpj_cpf,
  valor_unitario,
  quantidade_homologada,
  quantidade_consumida,
  (quantidade_homologada - quantidade_consumida) AS saldo_disponivel,
  CASE
    WHEN quantidade_homologada > 0 THEN ROUND((quantidade_consumida / quantidade_homologada) * 100, 2)
    ELSE 0
  END AS percentual_consumido,
  total_empenhos_vinculados,
  ultimo_empenho_vinculado_em,
  total_empenhos_pendentes,
  quantidade_informada_usuario,
  saldo_oficial_sincronizado,
  saldo_oficial_lido_em,
  quantidade_sem_identificacao,
  total_empenhos_fora_saldo_oficial,
  total_contratos_vinculados,
  total_contratos_sem_quantidade,
  quantidade_empenhada_confirmada
FROM base;

COMMENT ON VIEW public.v_arp_item_saldo_detalhado IS
  'Read Model do saldo físico do item da Ata. Consumo = soma das quantidades contratadas (lidas da API) dos contratos vinculados ao item; saldo = homologado - consumo. Empenhos são a execução dos contratos; o total do Compras.gov (saldo_oficial_*) é só referência. total_contratos_sem_quantidade conta vínculos ainda sem quantidade lida.';
