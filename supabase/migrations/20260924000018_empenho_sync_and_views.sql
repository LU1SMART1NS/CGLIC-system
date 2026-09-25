-- ==============================================================================
-- MIGRATION 18: VIEWS ANALÍTICAS E READ MODELS DE EMPENHOS — SALDOARP 3.0
-- Versão: 20260924000018_empenho_sync_and_views.sql
-- Invariantes: P1 (SSOT Canônico), P3 (Database Integrity), P6 (Auditabilidade), P7 (Least Privilege)
-- Resoluções: FASE 7.2-D e FASE 7.2-D-R1 (Separação Estrita Ata vs Contrato)
-- Tabelas Consultadas: public.empenhos, public.arp_item_empenhos, public.contrato_empenhos,
--                      public.empenho_eventos_historico, public.itens_ata, public.atas_registro_preco
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ÍNDICE COMPLEMENTAR DE PERFORMANCE PARA SÉRIE TEMPORAL
-- ------------------------------------------------------------------------------
-- Justificativa: Otimiza agrupamentos cronológicos por data/mês na view v_empenho_serie_temporal
-- em consultas globais não filtradas por item_key ou contract_key específicos.
CREATE INDEX IF NOT EXISTS idx_emp_evt_hist_data_evento
  ON public.empenho_eventos_historico(data_evento);

-- ------------------------------------------------------------------------------
-- 2. VIEW ANALÍTICA 1: public.v_empenhos_resumo
-- ------------------------------------------------------------------------------
-- Objetivo: Read Model consolidado de cada Nota de Empenho soberana com suas agregações.
-- Prevenção de Double Counting: As associações com itens (public.arp_item_empenhos) e
-- contratos (public.contrato_empenhos) são pré-agregadas em CTEs independentes, impedindo
-- produto cartesiano e multiplicação indevida de valores financeiros e contagens.
CREATE OR REPLACE VIEW public.v_empenhos_resumo
WITH (security_invoker = true)
AS
WITH item_agg AS (
  SELECT
    empenho_id,
    COUNT(DISTINCT item_key) AS total_vinculos_itens,
    COALESCE(SUM(quantidade_consumida), 0) AS total_quantidade_consumida_itens
  FROM public.arp_item_empenhos
  GROUP BY empenho_id
),
contract_agg AS (
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
  COALESCE(ia.total_vinculos_itens, 0) AS total_vinculos_itens,
  COALESCE(ia.total_quantidade_consumida_itens, 0) AS total_quantidade_consumida_itens,
  COALESCE(ca.total_vinculos_contratos, 0) AS total_vinculos_contratos,
  COALESCE(ca.total_valor_vinculado_contratos, 0) AS total_valor_vinculado_contratos
FROM public.empenhos e
LEFT JOIN item_agg ia ON ia.empenho_id = e.id
LEFT JOIN contract_agg ca ON ca.empenho_id = e.id;

COMMENT ON VIEW public.v_empenhos_resumo IS
  'Read Model consolidado de notas de empenho soberanas com contagem e totalizadores de vínculos pré-agregados sem produto cartesiano.';

-- ------------------------------------------------------------------------------
-- 3. VIEW ANALÍTICA 2: public.v_arp_item_saldo_detalhado
-- ------------------------------------------------------------------------------
-- Objetivo: Representação soberana exclusiva do SALDO FÍSICO DO ITEM DA ATA.
-- Invariante Retificada (7.2-D-R1): Ata != Contrato.
-- Não incorpora acréscimos/supressões contratuais (Art. 125 da Lei 14.133/2021).
-- Saldo = QuantidadeHomologadaAta - SUM(quantidade_consumida_empenhos).
-- O empenho apenas consome quantidade física e jamais altera a quantidade homologada.
CREATE OR REPLACE VIEW public.v_arp_item_saldo_detalhado
WITH (security_invoker = true)
AS
WITH empenhos_agg AS (
  SELECT
    item_key,
    COUNT(DISTINCT empenho_id) AS total_empenhos_vinculados,
    COALESCE(SUM(quantidade_consumida), 0) AS total_quantidade_consumida,
    MAX(created_at) AS ultimo_empenho_vinculado_em
  FROM public.arp_item_empenhos
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
)
SELECT
  COALESCE(ic.canonical_item_key, ea.item_key) AS item_key,
  ic.item_ata_id,
  ic.ata_id,
  COALESCE(ic.numero_ata, split_part(ea.item_key, '-', 1)) AS numero_ata,
  COALESCE(ic.codigo_uasg, split_part(ea.item_key, '-', 2)) AS codigo_uasg,
  COALESCE(ic.numero_item, split_part(ea.item_key, '-', 3)) AS numero_item,
  ic.descricao_item,
  ic.fornecedor_razao_social,
  ic.fornecedor_cnpj_cpf,
  ic.valor_unitario,
  COALESCE(ic.quantidade_homologada, 0) AS quantidade_homologada,
  COALESCE(ea.total_quantidade_consumida, 0) AS quantidade_consumida,
  (COALESCE(ic.quantidade_homologada, 0) - COALESCE(ea.total_quantidade_consumida, 0)) AS saldo_disponivel,
  CASE
    WHEN COALESCE(ic.quantidade_homologada, 0) > 0 THEN
      ROUND((COALESCE(ea.total_quantidade_consumida, 0) / ic.quantidade_homologada) * 100, 2)
    ELSE 0
  END AS percentual_consumido,
  COALESCE(ea.total_empenhos_vinculados, 0) AS total_empenhos_vinculados,
  ea.ultimo_empenho_vinculado_em
FROM itens_canonical ic
FULL OUTER JOIN empenhos_agg ea ON ea.item_key = ic.canonical_item_key;

COMMENT ON VIEW public.v_arp_item_saldo_detalhado IS
  'Read Model soberano do saldo físico-quantitativo de itens da Ata. Saldo = QuantidadeHomologada - SUM(Consumida). Exclui acréscimos contratuais.';

-- ------------------------------------------------------------------------------
-- 4. VIEW ANALÍTICA 3: public.v_contrato_empenhos_lastro
-- ------------------------------------------------------------------------------
-- Objetivo: Representação soberana exclusiva do LASTRO FINANCEIRO CONTRATO <-> EMPENHO.
-- Distinção Estrita: Separa o valor vinculado específico deste contrato (total_valor_vinculado_contrato)
-- do valor total de emissão dos empenhos (total_valor_empenhado_global).
-- Não confunde nem transfere grandezas para o saldo da Ata.
CREATE OR REPLACE VIEW public.v_contrato_empenhos_lastro
WITH (security_invoker = true)
AS
SELECT
  ce.contract_key,
  COUNT(DISTINCT ce.empenho_id) AS total_empenhos_vinculados,
  COALESCE(SUM(ce.valor_vinculado), 0) AS total_valor_vinculado_contrato,
  COALESCE(SUM(e.valor_empenhado), 0) AS total_valor_empenhado_global,
  COALESCE(SUM(e.valor_liquidado), 0) AS total_valor_liquidado_global,
  COALESCE(SUM(e.valor_pago), 0) AS total_valor_pago_global,
  COALESCE(SUM(e.valor_rpinscrito), 0) AS total_valor_rpinscrito_global,
  MAX(e.data_emissao) AS data_emissao_ultimo_empenho,
  MAX(ce.created_at) AS ultimo_vinculo_em
FROM public.contrato_empenhos ce
JOIN public.empenhos e ON e.id = ce.empenho_id
GROUP BY ce.contract_key;

COMMENT ON VIEW public.v_contrato_empenhos_lastro IS
  'Read Model do lastro orçamentário e financeiro de contratos oficiais via empenhos vinculados (Relação N:N).';

-- ------------------------------------------------------------------------------
-- 5. VIEW ANALÍTICA 4: public.v_empenho_serie_temporal
-- ------------------------------------------------------------------------------
-- Objetivo: Projeção temporal cronológica dos eventos funcionais contábeis registrados
-- em public.empenho_eventos_historico para viabilizar análises de Burn Rate e Farol.
-- Read-only pura: Não cria eventos nem altera o histórico append-only.
CREATE OR REPLACE VIEW public.v_empenho_serie_temporal
WITH (security_invoker = true)
AS
SELECT
  h.id AS evento_id,
  h.empenho_id,
  e.canonical_key,
  e.numero_oficial,
  e.uasg_emitente,
  e.ano_exercicio,
  h.item_key,
  h.contract_key,
  h.data_evento,
  TO_CHAR(h.data_evento, 'YYYY-MM') AS ano_mes_evento,
  EXTRACT(YEAR FROM h.data_evento)::INTEGER AS ano_evento,
  EXTRACT(MONTH FROM h.data_evento)::INTEGER AS mes_evento,
  h.tipo_evento,
  h.delta_quantidade,
  h.delta_valor,
  h.metadados,
  h.registrado_em
FROM public.empenho_eventos_historico h
JOIN public.empenhos e ON e.id = h.empenho_id;

COMMENT ON VIEW public.v_empenho_serie_temporal IS
  'Projeção cronológica da série temporal de eventos contábeis de empenhos para apoio a Burn Rate e Farol.';

-- ------------------------------------------------------------------------------
-- 6. PERMISSÕES E HARDENING DE SEGURANÇA (P7 - LEAST PRIVILEGE)
-- ------------------------------------------------------------------------------
-- As views utilizam security_invoker = true, herdando as políticas RLS das tabelas base.
-- Concede permissão de SELECT estritamente conforme o padrão das tabelas M16.
REVOKE ALL ON public.v_empenhos_resumo FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.v_empenhos_resumo FROM anon, authenticated;
GRANT SELECT ON public.v_empenhos_resumo TO authenticated, anon;

REVOKE ALL ON public.v_arp_item_saldo_detalhado FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.v_arp_item_saldo_detalhado FROM anon, authenticated;
GRANT SELECT ON public.v_arp_item_saldo_detalhado TO authenticated, anon;

REVOKE ALL ON public.v_contrato_empenhos_lastro FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.v_contrato_empenhos_lastro FROM anon, authenticated;
GRANT SELECT ON public.v_contrato_empenhos_lastro TO authenticated, anon;

REVOKE ALL ON public.v_empenho_serie_temporal FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.v_empenho_serie_temporal FROM anon, authenticated;
GRANT SELECT ON public.v_empenho_serie_temporal TO authenticated, anon;
