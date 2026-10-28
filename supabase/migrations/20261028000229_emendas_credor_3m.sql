-- ==============================================================================
-- Migration 229: nota da 3M ligada à linha do pedido
-- ==============================================================================
-- Fornecedor estrangeiro não tem CNPJ: credor_e_fornecedor_da_ata (migrations 191 e 192) compara os nomes por uma
-- palavra de 4 letras ou mais do credor (sem as genéricas). Do credor "3M GLOBAL CHANNEL SERVICES" (documento
-- EX3MGLOBA) não sobrava palavra nenhuma: GLOBAL, CHANNEL e SERVICES são genéricas e "3M" tem 2 caracteres e um
-- número (a divisão do nome só guardava letras). Nenhuma nota da 3M (ata 00079/2024, EPR) ligava pelo fornecedor.
-- Medição de 28/10/2026: pedido 463 (Sargento Fahur) sem a 2026NE000076 de R$ 681.245 nos 20 EPRs do CBM de Maringá;
-- também 445, 447, 452, 453 e 520.
--
-- Agora o nome é dividido em letras e números, e vale também a sigla com letra e número de 2 caracteres ou mais
-- ("3M"). Nos 11 credores estrangeiros × 7 fornecedores estrangeiros do banco, só o par da 3M muda (de não para sim).
-- Muda só o ramo do fornecedor estrangeiro; depois religa as notas.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.credor_e_fornecedor_da_ata(p_credor_doc TEXT, p_credor_nome TEXT, p_forn_doc TEXT, p_forn_nome TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH d AS (
    SELECT regexp_replace(COALESCE(p_credor_doc, ''), '\D', '', 'g') AS c, regexp_replace(COALESCE(p_forn_doc, ''), '\D', '', 'g') AS f,
           upper(translate(COALESCE(p_forn_nome, '') || ' ' || COALESCE(p_forn_doc, ''),
                           'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) AS fnome,
           btrim(regexp_replace(upper(translate(COALESCE(p_credor_nome, ''),
                 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^A-Z0-9]+', ' ', 'g')) AS cn,
           btrim(regexp_replace(upper(translate(COALESCE(p_forn_nome, ''),
                 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^A-Z0-9]+', ' ', 'g')) AS fn)
  SELECT CASE
           WHEN length(d.c) = 14 AND length(d.f) = 14 THEN left(d.c, 8) = left(d.f, 8)
           WHEN length(d.c) IN (11, 14) AND length(d.f) IN (11, 14) THEN d.c = d.f
           -- Migration 192: o Portal mascara o CPF ("***.379.061-**"); aí vale o nome igual ao do fornecedor.
           WHEN position('*' IN COALESCE(p_credor_doc, '')) > 0 THEN d.cn <> '' AND d.cn = d.fn
           WHEN upper(btrim(COALESCE(p_credor_doc, ''))) LIKE 'EX%' AND upper(btrim(COALESCE(p_forn_doc, ''))) LIKE 'ESTRANGEIRO%' THEN
             EXISTS (SELECT 1
                       FROM regexp_split_to_table(upper(translate(COALESCE(p_credor_nome, ''),
                              'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^A-Z0-9]+') w
                      -- Migration 229: a sigla com letra e número ("3M") também vale.
                      WHERE (length(w) >= 4 OR (length(w) >= 2 AND w ~ '[0-9]' AND w ~ '[A-Z]'))
                        AND w NOT LIKE 'ESTRANG%'
                        AND w NOT IN ('LTDA', 'CORP', 'GLOBAL', 'CHANNEL', 'SERVICES', 'SERVICOS', 'ENTERPRISE', 'COMPANY', 'GROUP',
                                      'BRASIL', 'BRAZIL', 'INTERNATIONAL', 'LIMITED', 'GMBH', 'INDUSTRIES', 'SYSTEMS', 'TECHNOLOGY')
                        AND position(w IN d.fnome) > 0)
           ELSE FALSE END
    FROM d;
$$;
REVOKE ALL ON FUNCTION public.credor_e_fornecedor_da_ata(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.credor_e_fornecedor_da_ata(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

SELECT public.emendas_ligar_notas();
