-- ==============================================================================
-- Empenhado acima do contratado: pendência da Visão Geral (aba Pagamentos)
--
-- Decisão de 14/10/2026: só avisar, nunca bloquear. Por contrato e item, conta
-- só a quantidade REAL das notas vinculadas: a informada pelo gestor ou, sem
-- ela, a da nota no SIAFI. A quantidade calculada pelo valor (valor ÷ preço)
-- fica de fora: reajuste e termo aditivo sobem o valor e a conta "inventa"
-- unidades (medição de 14/10/2026: 38 dos 58 itens acima eram só isso). Esse
-- excesso continua visível no Item 360 ("A empenhar" negativo).
--
-- Uma linha por contrato × item em que a soma real passa do contratado, com a
-- última nota que contou (para a tela dizer de onde veio).
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
soma AS (
  SELECT contract_key, numero_item, sum(quantidade) AS quantidade_real, count(*) AS notas
    FROM parcelas
   GROUP BY contract_key, numero_item
),
ultima AS (
  SELECT DISTINCT ON (contract_key, numero_item)
         contract_key, numero_item, empenho_id, origem, informada, distribuido_em
    FROM parcelas
   ORDER BY contract_key, numero_item, distribuido_em DESC NULLS LAST
),
-- Contratado só dos itens que têm nota com quantidade real (mesma soma de v_contrato_itens_numerados, sem
-- percorrer os itens de todos os contratos).
contratado AS (
  SELECT ic.contract_key, ic.numero_item, min(ic.descricao) AS descricao, sum(ic.quantidade) AS quantidade
    FROM public.itens_contrato ic
    JOIN soma s ON s.contract_key = ic.contract_key AND s.numero_item = ic.numero_item
   GROUP BY ic.contract_key, ic.numero_item
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
  u.distribuido_em AS ultima_em
FROM contratado i
JOIN soma s ON s.contract_key = i.contract_key AND s.numero_item = i.numero_item
LEFT JOIN ultima u ON u.contract_key = i.contract_key AND u.numero_item = i.numero_item
LEFT JOIN public.empenhos e ON e.id = u.empenho_id
WHERE i.quantidade > 0
  AND s.quantidade_real > i.quantidade + 0.0001;

COMMENT ON VIEW public.v_contrato_itens_empenhado_acima IS
  'Contrato × item em que a soma da quantidade real das notas (informada pelo gestor ou da nota no SIAFI) passa da quantidade contratada. Só aviso (Visão Geral › Pagamentos); a quantidade calculada pelo valor não entra.';

REVOKE ALL ON public.v_contrato_itens_empenhado_acima FROM PUBLIC, anon;
GRANT SELECT ON public.v_contrato_itens_empenhado_acima TO authenticated, service_role;
