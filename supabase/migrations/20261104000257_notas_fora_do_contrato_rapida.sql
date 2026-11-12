-- ==============================================================================
-- Migration 257: v_notas_fora_do_contrato sem recálculo por linha
-- ==============================================================================
-- Em produção (04/11/2026) a fila Vínculos › Notas fora do contrato não carregava: a leitura da tela passava do tempo
-- limite do banco. As listas de cada nota (pedidos, contratos do fornecedor, pedido de outro fornecedor) eram
-- subconsultas por linha sobre CTEs que o Postgres embutia de novo a cada nota: 13,8 s para as 278 notas (a contagem,
-- que pula essas colunas, levava 60 ms e enganou o ensaio da migration 256). Agora cada lista é montada uma vez, por
-- nota, e ligada às notas; credor e fornecedor casam primeiro pelo documento. Mesmas colunas e mesma ordem da sugestão.
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_notas_fora_do_contrato
WITH (security_invoker = false) AS
WITH notas AS MATERIALIZED (
  SELECT e.*
    FROM public.empenhos e
   WHERE NOT EXISTS (SELECT 1 FROM public.contrato_empenhos ce WHERE ce.empenho_id = e.id AND ce.origem <> 'EMENDA')
),
ped AS MATERIALIZED (
  SELECT l.empenho_id, p.numero AS pedido, p.siop_emenda AS emenda, pl.item_key, l.contract_key
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
ped_lista AS (
  SELECT x.empenho_id, jsonb_agg(jsonb_build_object('numero', x.pedido, 'emenda', x.emenda)) AS lista
    FROM (SELECT DISTINCT empenho_id, pedido, emenda FROM ped) x
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
  m.marcado_em AS marca_em
FROM notas n
LEFT JOIN pelo_pedido pp ON pp.empenho_id = n.id
LEFT JOIN ped_lista pl ON pl.empenho_id = n.id
LEFT JOIN outro_forn o ON o.empenho_id = n.id
LEFT JOIN cand_lista cl ON cl.empenho_id = n.id
LEFT JOIN public.notas_inclusao_na_fonte m ON m.empenho_id = n.id AND m.desfeito_em IS NULL;

COMMENT ON VIEW public.v_notas_fora_do_contrato IS
  'Notas que o Contratos.gov.br não lista em contrato nenhum, com o contrato do pedido, os contratos do fornecedor na ordem da sugestão e a marca do gestor (migrations 256 e 257).';

REVOKE ALL ON public.v_notas_fora_do_contrato FROM PUBLIC, anon;
GRANT SELECT ON public.v_notas_fora_do_contrato TO authenticated, service_role;
