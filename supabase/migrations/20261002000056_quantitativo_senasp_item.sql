-- ==============================================================================
-- MIGRATION 56: QUANTITATIVO SENASP DO ITEM
-- Versão: 20261002000056_quantitativo_senasp_item.sql
--
-- O sistema gerencia o quantitativo registrado para as UASGs 200330 e 200331, e não o total da ata.
--  - itens_ata.quantidade_senasp guarda esse quantitativo (cópia lida das unidades do Compras.gov);
--  - sync_item_senasp_quantity_atomic grava a cópia (a leitura da API é feita pelo front);
--  - a view de saldo passa a calcular saldo e percentual sobre o quantitativo SENASP. Enquanto o
--    item não foi sincronizado, a base é o homologado da ata. quantidade_homologada segue como o
--    total da ata (referência). Colunas novas ao final.
-- ==============================================================================

ALTER TABLE public.itens_ata
  ADD COLUMN IF NOT EXISTS quantidade_senasp NUMERIC(18, 4) CHECK (quantidade_senasp IS NULL OR quantidade_senasp >= 0),
  ADD COLUMN IF NOT EXISTS quantidade_senasp_lida_em TIMESTAMPTZ;

COMMENT ON COLUMN public.itens_ata.quantidade_senasp IS
  'Quantitativo registrado para as UASGs do CGLIC (200330/200331) no item, lido das unidades do Compras.gov. NULL = ainda não sincronizado (a view usa o homologado da ata).';

CREATE OR REPLACE FUNCTION public.sync_item_senasp_quantity_atomic(
  p_item_key VARCHAR,
  p_quantidade NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := TRIM(COALESCE(p_item_key, ''));
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

  IF p_quantidade IS NULL OR p_quantidade < 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: O quantitativo SENASP deve ser um número maior ou igual a zero.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.itens_ata i
     SET quantidade_senasp = p_quantidade,
         quantidade_senasp_lida_em = NOW()
    FROM public.atas_registro_preco a
   WHERE a.id = i.ata_id
     AND (a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item::text, 5, '0')) = v_item_key
  RETURNING i.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Item da ata não encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'item_key', v_item_key,
    'quantidade_senasp', p_quantidade,
    'timestamp', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_item_senasp_quantity_atomic(VARCHAR, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_item_senasp_quantity_atomic(VARCHAR, NUMERIC) TO authenticated, service_role;

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
    i.quantidade_senasp,
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
    ic.quantidade_senasp,
    COALESCE(ic.quantidade_senasp, ic.quantidade_homologada, 0) AS quantidade_base_senasp,
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
  (quantidade_base_senasp - quantidade_consumida) AS saldo_disponivel,
  CASE
    WHEN quantidade_base_senasp > 0 THEN ROUND((quantidade_consumida / quantidade_base_senasp) * 100, 2)
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
  quantidade_empenhada_confirmada,
  quantidade_senasp,
  quantidade_base_senasp
FROM base;

COMMENT ON VIEW public.v_arp_item_saldo_detalhado IS
  'Read Model do saldo físico do item da Ata. Base = quantitativo SENASP (quantidade_senasp; homologado da ata enquanto não sincronizado); consumo = soma das quantidades contratadas dos contratos vinculados; saldo = base - consumo. quantidade_homologada é o total da ata (referência). Empenhos são a execução dos contratos; o total do Compras.gov (saldo_oficial_*) é só referência.';
