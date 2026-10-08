-- ==============================================================================
-- Migration 99: apaga a cópia antiga do empenho por item da ata (arp_item_empenhos)
-- ==============================================================================
-- Desde o PR #84 o empenho do item da ata vem do vínculo das notas aos itens do contrato
-- (migration 94: contrato_empenho_distribuicoes / contrato_empenho_itens). A tabela
-- arp_item_empenhos era uma cópia feita no navegador que punha toda NE do contrato em todos os
-- itens; nenhuma tela lê ou grava mais nela. Esta migration tira do banco:
--   - a tabela (os dados ficam numa cópia fechada, arp_item_empenhos_descartada, sem acesso pelo app);
--   - as seis funções que só existiam para ela e a função de gatilho dela;
--   - arp_item_saldo_oficial (total empenhado por item segundo o Compras.gov), sem leitor nem gravador;
--   - as colunas dessas tabelas em v_arp_item_saldo_detalhado e v_empenhos_resumo.
-- v_arp_item_saldo_detalhado.total_empenhos_vinculados passa a contar as notas do vínculo novo.
-- O saldo do item (base SENASP − contratado) não muda.
-- Sem CASCADE: se algo ainda depender de um objeto apagado, a migration para e nada muda.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0) Cópia fechada dos dados (sem política de RLS e sem permissão: o app não lê)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.arp_item_empenhos_descartada AS TABLE public.arp_item_empenhos;
ALTER TABLE public.arp_item_empenhos_descartada ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arp_item_empenhos_descartada FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.arp_item_empenhos_descartada IS
  'Cópia de arp_item_empenhos feita na migration 99, antes de apagar a tabela. Só para consulta no banco; apagar numa limpeza futura.';

-- ------------------------------------------------------------------------------
-- 1) Views refeitas sem as tabelas antigas (tirar coluna exige DROP + CREATE)
-- ------------------------------------------------------------------------------
DROP VIEW public.v_arp_item_saldo_detalhado;

CREATE VIEW public.v_arp_item_saldo_detalhado
WITH (security_invoker = true)
AS
WITH empenhado_agg AS (
  -- Notas com parte vinculada ao item, em cada contrato ligado a ele (migration 94).
  SELECT item_key, sum(notas)::bigint AS total_empenhos_vinculados
    FROM public.v_arp_item_contrato_empenhado
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
    COALESCE(ic.canonical_item_key, ca.item_key) AS item_key,
    ic.item_ata_id,
    ic.ata_id,
    COALESCE(ic.numero_ata, split_part(ca.item_key, '-', 1)) AS numero_ata,
    COALESCE(ic.codigo_uasg, split_part(ca.item_key, '-', 2)) AS codigo_uasg,
    COALESCE(ic.numero_item, split_part(ca.item_key, '-', 3)) AS numero_item,
    ic.descricao_item,
    ic.fornecedor_razao_social,
    ic.fornecedor_cnpj_cpf,
    ic.valor_unitario,
    COALESCE(ic.quantidade_homologada, 0) AS quantidade_homologada,
    ic.quantidade_senasp,
    COALESCE(ic.quantidade_senasp, ic.quantidade_homologada, 0) AS quantidade_base_senasp,
    COALESCE(ca.total_contratado, 0) AS quantidade_consumida,
    COALESCE(ca.total_contratos_vinculados, 0) AS total_contratos_vinculados,
    COALESCE(ca.total_contratos_sem_quantidade, 0) AS total_contratos_sem_quantidade
  FROM itens_canonical ic
  FULL OUTER JOIN contratos_agg ca ON ca.item_key = ic.canonical_item_key
)
SELECT
  b.item_key,
  b.item_ata_id,
  b.ata_id,
  b.numero_ata,
  b.codigo_uasg,
  b.numero_item,
  b.descricao_item,
  b.fornecedor_razao_social,
  b.fornecedor_cnpj_cpf,
  b.valor_unitario,
  b.quantidade_homologada,
  b.quantidade_consumida,
  (b.quantidade_base_senasp - b.quantidade_consumida) AS saldo_disponivel,
  CASE
    WHEN b.quantidade_base_senasp > 0 THEN ROUND((b.quantidade_consumida / b.quantidade_base_senasp) * 100, 2)
    ELSE 0
  END AS percentual_consumido,
  COALESCE(e.total_empenhos_vinculados, 0) AS total_empenhos_vinculados,
  b.total_contratos_vinculados,
  b.total_contratos_sem_quantidade,
  b.quantidade_senasp,
  b.quantidade_base_senasp
FROM base b
LEFT JOIN empenhado_agg e ON e.item_key = b.item_key;

COMMENT ON VIEW public.v_arp_item_saldo_detalhado IS
  'Read Model do saldo físico do item da Ata. Base = quantitativo SENASP (quantidade_senasp; homologado da ata enquanto não sincronizado); consumo = soma das quantidades contratadas dos contratos vinculados; saldo = base - consumo. quantidade_homologada é o total da ata (referência). total_empenhos_vinculados = notas com parte vinculada ao item nos contratos ligados (migration 94).';

DROP VIEW public.v_empenhos_resumo;

CREATE VIEW public.v_empenhos_resumo
WITH (security_invoker = true)
AS
WITH contract_agg AS (
  SELECT
    empenho_id,
    COUNT(DISTINCT contract_key) AS total_vinculos_contratos,
    COALESCE(SUM(valor_vinculado), 0) AS total_valor_vinculado_contratos
  FROM public.contrato_empenhos
  GROUP BY empenho_id
)
SELECT
  e.id AS empenho_id,
  e.canonical_key,
  e.numero_oficial,
  e.ano_exercicio,
  e.uasg_emitente,
  e.numero_normalizado,
  e.data_emissao,
  e.valor_empenhado,
  e.valor_liquidado,
  e.valor_pago,
  e.valor_rpinscrito,
  e.credor_nome,
  e.credor_cnpj_cpf,
  e.situacao,
  e.fonte_origem,
  e.informado_manualmente_inicialmente,
  e.identificador_fonte,
  e.url_oficial,
  e.last_synced_at,
  e.created_at,
  e.updated_at,
  COALESCE(ca.total_vinculos_contratos, 0) AS total_vinculos_contratos,
  COALESCE(ca.total_valor_vinculado_contratos, 0) AS total_valor_vinculado_contratos
FROM public.empenhos e
LEFT JOIN contract_agg ca ON ca.empenho_id = e.id;

COMMENT ON VIEW public.v_empenhos_resumo IS
  'Notas de empenho com o total de contratos vinculados e o valor vinculado a eles. O empenho por item fica em v_contrato_empenho_distribuicao (migration 94).';

REVOKE ALL ON public.v_arp_item_saldo_detalhado, public.v_empenhos_resumo FROM PUBLIC, anon;
GRANT SELECT ON public.v_arp_item_saldo_detalhado, public.v_empenhos_resumo TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2) Funções que só existiam para as tabelas antigas (todas as assinaturas)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'sync_item_contract_empenhos_atomic',
         'confirm_empenho_item_quantity_atomic',
         'link_empenho_to_item_atomic',
         'unlink_empenho_from_item_atomic',
         'sync_item_official_saldo_atomic',
         'attribute_unidentified_quantity_atomic'
       )
  LOOP
    EXECUTE format('DROP FUNCTION %s', v_fn);
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3) As tabelas (índices, políticas e gatilhos saem com elas)
-- ------------------------------------------------------------------------------
DROP TABLE public.arp_item_empenhos;
DROP FUNCTION IF EXISTS public.trg_arp_item_empenhos_fonte_quantidade();
DROP TABLE public.arp_item_saldo_oficial;

-- ------------------------------------------------------------------------------
-- 4) Trava: nada das tabelas antigas pode ter sobrado
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_restos INTEGER;
BEGIN
  SELECT count(*) INTO v_restos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND (p.prosrc ~ 'arp_item_empenhos([^_]|$)' OR p.prosrc ~ 'arp_item_saldo_oficial');
  IF v_restos > 0 THEN
    RAISE EXCEPTION 'Ainda há % função(ões) citando arp_item_empenhos ou arp_item_saldo_oficial; migration revertida.', v_restos;
  END IF;
END $$;
