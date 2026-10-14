-- ==============================================================================
-- MIGRATION 137: EMPENHADO ACIMA DO CONTRATADO POR PERÍODO DE VIGÊNCIA (SERVIÇO)
-- Versão: 20261014000137_acima_do_contratado_por_periodo.sql
-- ==============================================================================
-- Em serviço contínuo a quantidade do item vale para 12 meses, e as notas de cada
-- ano voltam a empenhar a mesma quantidade. A soma de todas as notas (migration
-- 133) acusa excesso falso. Ex.: manutenção 00119/2025, vigência 28/08/2025 a
-- 28/08/2027, 12 meses no item, uma nota de 12 meses em 2025 e outra em 2026.
-- Medição de 14/10/2026, depois da migration 136: 16 itens novos na lista, todos
-- de serviço (00033/2025, 00119/2025 e 00016/2024).
--
-- Regra:
-- - Item de serviço (itens_contrato.tipo) em contrato com início de vigência:
--   cada nota conta no período de 12 meses da data de emissão, contado do início
--   da vigência (1º ano, 2º ano...). Nota emitida antes do início conta no 1º ano.
--   Aparece o período com o maior excesso.
-- - Item de material, ou sem início de vigência: soma de todas as notas, como antes.
--
-- Mesmas colunas da 133, e três novas no fim: por_periodo, periodo_inicio e
-- periodo_fim (nulos quando a conta é pelo total).
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_contrato_itens_empenhado_acima
WITH (security_invoker = true)
AS
WITH parcelas AS (
  SELECT
    d.contract_key,
    p.numero_item,
    COALESCE(p.quantidade_informada, p.quantidade_nota) AS quantidade,
    p.quantidade_informada IS NOT NULL AS informada,
    d.origem,
    d.distribuido_em,
    ce.empenho_id
    FROM public.contrato_empenho_itens p
    JOIN public.contrato_empenho_distribuicoes d ON d.contrato_empenho_id = p.contrato_empenho_id
    JOIN public.contrato_empenhos ce ON ce.id = p.contrato_empenho_id
   WHERE COALESCE(p.quantidade_informada, p.quantidade_nota) IS NOT NULL
),
itens AS (
  SELECT DISTINCT contract_key, numero_item FROM parcelas
),
-- Contratado e tipo só dos itens que têm nota com quantidade real.
contratado AS (
  SELECT ic.contract_key, ic.numero_item, min(ic.descricao) AS descricao, sum(ic.quantidade) AS quantidade,
         bool_and(ic.tipo ILIKE 'servi%') AS servico
    FROM public.itens_contrato ic
    JOIN itens s ON s.contract_key = ic.contract_key AND s.numero_item = ic.numero_item
   GROUP BY ic.contract_key, ic.numero_item
),
inicio AS (
  SELECT co.contract_key,
         CASE WHEN co.registro->>'dataVigenciaInicio' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              THEN left(co.registro->>'dataVigenciaInicio', 10)::DATE END AS inicio
    FROM public.contratos_oficiais co
    JOIN (SELECT DISTINCT contract_key FROM itens) k ON k.contract_key = co.contract_key
   WHERE co.registro->>'dataVigenciaInicio' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
),
com_periodo AS (
  SELECT p.*,
         c.servico AND v.inicio IS NOT NULL AND e.data_emissao IS NOT NULL AS por_periodo,
         CASE WHEN c.servico AND v.inicio IS NOT NULL AND e.data_emissao IS NOT NULL
              THEN GREATEST(0, date_part('year', age(e.data_emissao, v.inicio)))::INTEGER
              ELSE 0 END AS periodo,
         v.inicio
    FROM parcelas p
    JOIN contratado c ON c.contract_key = p.contract_key AND c.numero_item = p.numero_item
    LEFT JOIN inicio v ON v.contract_key = p.contract_key
    LEFT JOIN public.empenhos e ON e.id = p.empenho_id
),
soma AS (
  SELECT contract_key, numero_item, periodo, bool_or(por_periodo) AS por_periodo, min(inicio) AS inicio,
         sum(quantidade) AS quantidade_real, count(*) AS notas
    FROM com_periodo
   GROUP BY contract_key, numero_item, periodo
),
-- O período com mais quantidade (o de maior excesso) representa o item.
pior AS (
  SELECT DISTINCT ON (contract_key, numero_item) *
    FROM soma
   ORDER BY contract_key, numero_item, quantidade_real DESC, periodo DESC
),
ultima AS (
  SELECT DISTINCT ON (contract_key, numero_item, periodo)
         contract_key, numero_item, periodo, empenho_id, origem, informada, distribuido_em
    FROM com_periodo
   ORDER BY contract_key, numero_item, periodo, distribuido_em DESC NULLS LAST
)
SELECT
  i.contract_key,
  i.numero_item,
  i.descricao,
  i.quantidade AS quantidade_contratada,
  s.quantidade_real AS quantidade_empenhada,
  s.quantidade_real - i.quantidade AS quantidade_acima,
  s.notas,
  e.numero_oficial AS ultima_nota,
  -- Quem pôs a quantidade da última nota: GESTOR (informada) ou a origem do vínculo (SIAFI, VALOR, AUTO, USUARIO).
  CASE WHEN u.informada THEN 'GESTOR' ELSE u.origem END AS ultima_origem,
  u.distribuido_em AS ultima_em,
  COALESCE(s.por_periodo, FALSE) AS por_periodo,
  CASE WHEN s.por_periodo THEN (s.inicio + make_interval(years => s.periodo))::DATE END AS periodo_inicio,
  CASE WHEN s.por_periodo THEN (s.inicio + make_interval(years => s.periodo + 1) - INTERVAL '1 day')::DATE END AS periodo_fim
FROM contratado i
JOIN pior s ON s.contract_key = i.contract_key AND s.numero_item = i.numero_item
LEFT JOIN ultima u ON u.contract_key = s.contract_key AND u.numero_item = s.numero_item AND u.periodo = s.periodo
LEFT JOIN public.empenhos e ON e.id = u.empenho_id
WHERE i.quantidade > 0
  AND s.quantidade_real > i.quantidade + 0.0001;

COMMENT ON VIEW public.v_contrato_itens_empenhado_acima IS
  'Contrato × item em que a quantidade real das notas (informada pelo gestor ou da nota no SIAFI) passa da contratada. Item de serviço: por período de 12 meses da vigência (o pior período); material: soma de todas as notas. Só aviso (Visão Geral › Pagamentos); a quantidade calculada pelo valor não entra (migrations 133 e 137).';

REVOKE ALL ON public.v_contrato_itens_empenhado_acima FROM PUBLIC, anon;
GRANT SELECT ON public.v_contrato_itens_empenhado_acima TO authenticated, service_role;
