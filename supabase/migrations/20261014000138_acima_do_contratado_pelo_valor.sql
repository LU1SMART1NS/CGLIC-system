-- ==============================================================================
-- MIGRATION 138: EMPENHADO ACIMA DO CONTRATADO PELO VALOR QUANDO A QUANTIDADE É QUEBRADA
-- Versão: 20261014000138_acima_do_contratado_pelo_valor.sql
-- ==============================================================================
-- Contratos com desconto sobre o preço da ata foram cadastrados no
-- Contratos.gov.br com o preço unitário da ata e o valor total com desconto, e a
-- fonte grava a quantidade como valor ÷ preço. Ex.: 00090/2026, item 37: R$ 247,15
-- e R$ 235,00 → 0,9508 unidade. A nota (2025NE000404) traz 1 unidade a R$ 235,00 e
-- a lista acusava 0,0492 acima. Medição de 14/10/2026: os 22 itens de material da
-- lista (00090/2026, 00151/2026, 00210/2026) eram só isso; 53 itens de 15
-- contratos têm quantidade quebrada.
--
-- Regra: quando a quantidade contratada do item não é inteira, compara o valor que
-- as notas puseram no item com o valor total do item no contrato (tolerância de
-- 1 centavo). Quantidade inteira: compara a quantidade, como antes (migrations 133
-- e 137, com o período de 12 meses no serviço).
--
-- Mesmas colunas da 137, e quatro novas no fim: pelo_valor, valor_contratado,
-- valor_empenhado e valor_acima.
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_contrato_itens_empenhado_acima
WITH (security_invoker = true)
AS
WITH parcelas AS (
  SELECT
    d.contract_key,
    p.numero_item,
    COALESCE(p.quantidade_informada, p.quantidade_nota) AS quantidade,
    p.valor,
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
         sum(ic.valor_total) AS valor,
         bool_and(ic.tipo ILIKE 'servi%') AS servico,
         -- Quantidade quebrada (valor com desconto ÷ preço da ata): compara pelo valor.
         abs(sum(ic.quantidade) - round(sum(ic.quantidade))) > 0.0001 AND sum(ic.valor_total) > 0 AS pelo_valor
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
         sum(quantidade) AS quantidade_real, sum(valor) AS valor_real, count(*) AS notas
    FROM com_periodo
   GROUP BY contract_key, numero_item, periodo
),
-- O período de maior excesso representa o item (pelo valor quando a quantidade é quebrada).
pior AS (
  SELECT DISTINCT ON (s.contract_key, s.numero_item) s.*
    FROM soma s
    JOIN contratado c ON c.contract_key = s.contract_key AND c.numero_item = s.numero_item
   ORDER BY s.contract_key, s.numero_item,
            CASE WHEN c.pelo_valor THEN s.valor_real ELSE s.quantidade_real END DESC, s.periodo DESC
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
  CASE WHEN s.por_periodo THEN (s.inicio + make_interval(years => s.periodo + 1) - INTERVAL '1 day')::DATE END AS periodo_fim,
  i.pelo_valor,
  i.valor AS valor_contratado,
  s.valor_real AS valor_empenhado,
  s.valor_real - i.valor AS valor_acima
FROM contratado i
JOIN pior s ON s.contract_key = i.contract_key AND s.numero_item = i.numero_item
LEFT JOIN ultima u ON u.contract_key = s.contract_key AND u.numero_item = s.numero_item AND u.periodo = s.periodo
LEFT JOIN public.empenhos e ON e.id = u.empenho_id
WHERE i.quantidade > 0
  AND CASE WHEN i.pelo_valor THEN s.valor_real > i.valor + 0.01
           ELSE s.quantidade_real > i.quantidade + 0.0001 END;

COMMENT ON VIEW public.v_contrato_itens_empenhado_acima IS
  'Contrato × item em que a quantidade real das notas (informada pelo gestor ou da nota no SIAFI) passa da contratada. Item de serviço: por período de 12 meses da vigência (o pior período); material: soma de todas as notas. Quantidade contratada quebrada: compara o valor das notas no item com o valor do item no contrato. Só aviso (Visão Geral › Pagamentos); a quantidade calculada pelo valor não entra (migrations 133, 137 e 138).';

REVOKE ALL ON public.v_contrato_itens_empenhado_acima FROM PUBLIC, anon;
GRANT SELECT ON public.v_contrato_itens_empenhado_acima TO authenticated, service_role;
