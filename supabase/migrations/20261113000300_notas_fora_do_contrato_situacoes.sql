-- ==============================================================================
-- Migration 300: v_notas_fora_do_contrato com a etapa do pedido, o envio à CCGA e a nota substituta
-- ==============================================================================
-- 13/11/2026: a fila Empenhos ao contrato › Sem contrato tratava toda nota como se o contrato já existisse. A
-- 2026NE000216 (R$ 0,00, anulada e substituída pela 2026NE000217, já no contrato 00215/2026) aparecia com sugestão de
-- contrato, e notas de pedido de emenda ainda na contratação (contrato não assinado) recebiam palpites. A tela passa a
-- separar Anuladas e Aguardando contrato; para isso a view devolve, em cada pedido, a etapa e o envio à CCGA, e, na
-- nota de valor zero, a nota do mesmo credor, plano interno e dia que a substituiu. Demais colunas e ordem iguais à 257.
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_notas_fora_do_contrato
WITH (security_invoker = false) AS
WITH notas AS MATERIALIZED (
  SELECT e.*
    FROM public.empenhos e
   WHERE NOT EXISTS (SELECT 1 FROM public.contrato_empenhos ce WHERE ce.empenho_id = e.id AND ce.origem <> 'EMENDA')
),
ped AS MATERIALIZED (
  SELECT l.empenho_id, p.numero AS pedido, p.siop_emenda AS emenda, pl.item_key, l.contract_key,
         p.etapa, pl.ccga_situacao, pl.ccga_em
    FROM public.emenda_linha_notas l
    JOIN public.emenda_pedido_linhas pl ON pl.id = l.linha_id AND NOT pl.cancelada
    JOIN public.emenda_pedidos p ON p.id = pl.pedido_id
   WHERE l.empenho_id IN (SELECT id FROM notas)
),
contratos_com_fonte AS MATERIALIZED (
  SELECT DISTINCT contract_key FROM public.contrato_empenhos WHERE origem = 'FONTE'
),
-- Documentos só com dígitos. Credor e fornecedor com CNPJ ou CPF casam por igualdade (raiz do CNPJ), como na primeira
-- parte de credor_e_fornecedor_da_ata; a função (expressões regulares) só roda nos pares com documento fora do padrão
-- (estrangeiro, CPF mascarado), em vez de nas 278 × 1.145 combinações.
notas_doc AS MATERIALIZED (
  SELECT n.id, n.credor_cnpj_cpf, n.credor_nome, n.ano_exercicio, n.data_emissao,
         regexp_replace(COALESCE(n.credor_cnpj_cpf, ''), '\D', '', 'g') AS doc
    FROM notas n
),
contratos_doc AS MATERIALIZED (
  SELECT co.contract_key, co.numero, co.ano, co.data_vigencia_fim, co.fornecedor_cnpj_cpf,
         co.registro->'raw'->'fornecedor'->>'nome' AS fornecedor_nome,
         NULLIF(co.registro->'raw'->>'data_assinatura', '')::date AS assinatura,
         regexp_replace(COALESCE(co.fornecedor_cnpj_cpf, ''), '\D', '', 'g') AS doc
    FROM public.contratos_oficiais co
),
pares AS MATERIALIZED (
  -- CNPJ × CNPJ: mesma raiz.
  SELECT n.id AS empenho_id, c.contract_key
    FROM notas_doc n JOIN contratos_doc c ON left(c.doc, 8) = left(n.doc, 8)
   WHERE length(n.doc) = 14 AND length(c.doc) = 14
  UNION
  -- CPF com CPF ou CNPJ: documento igual.
  SELECT n.id, c.contract_key
    FROM notas_doc n JOIN contratos_doc c ON c.doc = n.doc
   WHERE length(n.doc) IN (11, 14) AND length(c.doc) IN (11, 14) AND NOT (length(n.doc) = 14 AND length(c.doc) = 14)
  UNION
  -- Mesmo texto do documento (ex.: estrangeiro com o mesmo código).
  SELECT n.id, c.contract_key
    FROM notas_doc n JOIN contratos_doc c
      ON upper(btrim(COALESCE(c.fornecedor_cnpj_cpf, '-'))) = upper(btrim(COALESCE(n.credor_cnpj_cpf, '')))
  UNION
  -- Fora do padrão, só onde a função pode dar verdadeiro: credor estrangeiro com fornecedor estrangeiro (pelo nome)
  -- e CPF mascarado pelo Portal (nome igual). Nos demais pares de documento fora do padrão ela devolve falso.
  SELECT n.id, c.contract_key
    FROM notas_doc n JOIN contratos_doc c
      ON (upper(btrim(COALESCE(n.credor_cnpj_cpf, ''))) LIKE 'EX%' AND upper(btrim(COALESCE(c.fornecedor_cnpj_cpf, ''))) LIKE 'ESTRANGEIRO%')
         OR (position('*' IN COALESCE(n.credor_cnpj_cpf, '')) > 0 AND NOT (length(n.doc) IN (11, 14) AND length(c.doc) IN (11, 14)))
   WHERE public.credor_e_fornecedor_da_ata(n.credor_cnpj_cpf, n.credor_nome, c.fornecedor_cnpj_cpf, c.fornecedor_nome)
),
cand AS MATERIALIZED (
  SELECT n.id AS empenho_id, c.contract_key, c.numero, c.assinatura, c.data_vigencia_fim AS vigencia_fim,
         EXISTS (SELECT 1 FROM public.arp_item_contract_links ic JOIN ped ON ped.item_key = ic.item_key AND ped.empenho_id = n.id
                  WHERE ic.contract_key = c.contract_key) AS tem_item_do_pedido,
         NOT EXISTS (SELECT 1 FROM contratos_com_fonte f WHERE f.contract_key = c.contract_key) AS sem_notas_da_fonte,
         n.data_emissao
    FROM pares p
    JOIN notas_doc n ON n.id = p.empenho_id
    JOIN contratos_doc c ON c.contract_key = p.contract_key
   WHERE c.ano::int >= n.ano_exercicio - 1
),
cand_lista AS (
  SELECT r.empenho_id,
         jsonb_agg(jsonb_build_object(
           'contract_key', r.contract_key, 'numero', r.numero, 'assinatura', r.assinatura,
           'vigencia_fim', r.vigencia_fim, 'tem_item_do_pedido', r.tem_item_do_pedido,
           'sem_notas_da_fonte', r.sem_notas_da_fonte) ORDER BY r.ordem) AS lista
    FROM (
      SELECT c.*, row_number() OVER (
               PARTITION BY c.empenho_id
               ORDER BY c.tem_item_do_pedido DESC, (c.assinatura >= c.data_emissao) DESC NULLS LAST, c.sem_notas_da_fonte DESC,
                        abs(c.assinatura - c.data_emissao) NULLS LAST, c.contract_key) AS ordem
        FROM cand c
    ) r
   GROUP BY r.empenho_id
),
-- Etapa do pedido e envio à CCGA (migration 300): uma linha por pedido; ENVIADA vence DEVOLVIDA quando os itens
-- da nota estão em situações diferentes.
ped_lista AS (
  SELECT x.empenho_id,
         jsonb_agg(jsonb_build_object('numero', x.pedido, 'emenda', x.emenda, 'etapa', x.etapa, 'ccga', x.ccga, 'ccga_em', x.ccga_em)) AS lista
    FROM (
      SELECT empenho_id, pedido, emenda, etapa,
             CASE WHEN bool_or(ccga_situacao = 'ENVIADA') THEN 'ENVIADA' WHEN bool_or(ccga_situacao = 'DEVOLVIDA') THEN 'DEVOLVIDA' END AS ccga,
             max(ccga_em)::date AS ccga_em
        FROM ped
       GROUP BY empenho_id, pedido, emenda, etapa
    ) x
   GROUP BY x.empenho_id
),
outro_forn AS (
  SELECT x.empenho_id, jsonb_agg(jsonb_build_object('contract_key', x.contract_key, 'numero', x.numero, 'fornecedor', x.fornecedor)) AS lista
    FROM (
      SELECT DISTINCT ped.empenho_id, co.contract_key, co.numero, co.registro->'raw'->'fornecedor'->>'nome' AS fornecedor
        FROM ped
        JOIN notas n ON n.id = ped.empenho_id
        JOIN public.contratos_oficiais co ON co.contract_key = ped.contract_key
       WHERE NOT (upper(btrim(COALESCE(n.credor_cnpj_cpf, ''))) = upper(btrim(COALESCE(co.fornecedor_cnpj_cpf, '-')))
                  OR public.credor_e_fornecedor_da_ata(n.credor_cnpj_cpf, n.credor_nome, co.fornecedor_cnpj_cpf,
                                                       co.registro->'raw'->'fornecedor'->>'nome'))
    ) x
   GROUP BY x.empenho_id
),
pelo_pedido AS (
  SELECT DISTINCT ON (ce.empenho_id) ce.empenho_id, ce.contract_key
    FROM public.contrato_empenhos ce
   WHERE ce.origem = 'EMENDA'
   ORDER BY ce.empenho_id, ce.created_at
)
SELECT
  n.id AS empenho_id,
  n.numero_oficial,
  n.uasg_emitente,
  n.ano_exercicio,
  n.data_emissao,
  n.valor_empenhado,
  n.credor_nome,
  n.credor_cnpj_cpf,
  pp.contract_key AS contrato_pelo_pedido,
  COALESCE(pl.lista, '[]'::jsonb) AS pedidos,
  COALESCE(o.lista, '[]'::jsonb) AS pedido_de_outro_fornecedor,
  COALESCE(cl.lista, '[]'::jsonb) AS contratos_do_fornecedor,
  m.contract_key AS marca_contract_key,
  m.observacao AS marca_observacao,
  m.marcado_por_nome AS marca_por_nome,
  m.marcado_em AS marca_em,
  sub.substituta
FROM notas n
LEFT JOIN pelo_pedido pp ON pp.empenho_id = n.id
LEFT JOIN ped_lista pl ON pl.empenho_id = n.id
LEFT JOIN outro_forn o ON o.empenho_id = n.id
LEFT JOIN cand_lista cl ON cl.empenho_id = n.id
LEFT JOIN public.notas_inclusao_na_fonte m ON m.empenho_id = n.id AND m.desfeito_em IS NULL
-- Nota anulada (valor zero): a nota que a substituiu, do mesmo credor, plano interno e dia, com valor (migration 300).
LEFT JOIN LATERAL (
  SELECT jsonb_build_object(
           'numero', o.numero_oficial, 'valor', o.valor_empenhado,
           'contrato', (SELECT ce.contract_key FROM public.contrato_empenhos ce WHERE ce.empenho_id = o.id
                         ORDER BY (ce.origem = 'FONTE') DESC, ce.created_at LIMIT 1)) AS substituta
    FROM public.empenhos o
   WHERE n.valor_empenhado = 0
     AND o.id <> n.id
     AND o.valor_empenhado > 0
     AND o.data_emissao = n.data_emissao
     AND o.plano_interno = n.plano_interno
     AND regexp_replace(COALESCE(o.credor_cnpj_cpf, ''), '\D', '', 'g') = regexp_replace(COALESCE(n.credor_cnpj_cpf, ''), '\D', '', 'g')
   ORDER BY o.numero_oficial
   LIMIT 1
) sub ON true;

COMMENT ON VIEW public.v_notas_fora_do_contrato IS
  'Notas que o Contratos.gov.br não lista em contrato nenhum, com o contrato do pedido, a etapa do pedido e o envio à CCGA, os contratos do fornecedor na ordem da sugestão, a marca do gestor e, na nota anulada, a que a substituiu (migrations 256, 257 e 300).';

REVOKE ALL ON public.v_notas_fora_do_contrato FROM PUBLIC, anon;
GRANT SELECT ON public.v_notas_fora_do_contrato TO authenticated, service_role;
