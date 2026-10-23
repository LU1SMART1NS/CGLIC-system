-- ==============================================================================
-- MIGRATION 173: EMENDAS — CADASTROS QUE FICARAM SÓ COM O NOME DA PLANILHA
-- Versão: 20261023000173_emendas_beneficiarios_completar_estaduais.sql
--
-- Pedido de 23/10/2026: o CBMERJ aparecia na lista de pedidos (reserva 558) e não era achado em Beneficiários. A carga
-- (migration 166) criou 6 cadastros com o texto da planilha inteiro no nome e sem UF ("CBMERJ", "Polícia Militar de
-- Minas Gerais", "Guarda Municipal de São José dos PinhaisPR"...). Aqui:
--   - o "CBMERJ" é juntado ao "Corpo de Bombeiros Militar" do RJ (mesmo órgão, cadastrado duas vezes);
--   - os outros 5 ficam com nome, cidade e UF nos campos próprios, como os demais (migrations 167 e 170);
--   - "Polícia Militar (ARIQUEMES)" leva Ariquemes para a cidade;
--   - os órgãos estaduais sem cidade ("Corpo de Bombeiros Militar", "Polícia Civil", "Polícia Militar", "Polícia Penal")
--     ganham a sigla oficial, para a busca achar CBMERJ, PMERJ, PCDF...
-- Cada mudança só vale para o cadastro que ainda está na versão medida (o que a CAEP já editou fica como está).
-- ==============================================================================

-- 1) Juntar o CBMERJ ao Corpo de Bombeiros Militar do RJ ---------------------------
CREATE TEMP TABLE juncoes_173 AS
SELECT v.fica_id, v.sai_id, s.nome AS sai_nome, s.cnpj AS sai_cnpj, s.outros_nomes AS sai_outros,
       (SELECT count(*) FROM public.emenda_pedido_linhas l WHERE l.beneficiario_id = v.sai_id) AS linhas
  FROM (VALUES
  ('14bf5823-34f1-4cc3-95b8-f11b664dddd5'::uuid, 2, 'de6d2836-c1c3-4675-9ab1-10d49d633c10'::uuid, 1)
  ) v(fica_id, fica_versao, sai_id, sai_versao)
  JOIN public.emenda_beneficiarios f ON f.id = v.fica_id AND f.versao = v.fica_versao
  JOIN public.emenda_beneficiarios s ON s.id = v.sai_id AND s.versao = v.sai_versao;

UPDATE public.emenda_pedido_linhas l SET beneficiario_id = j.fica_id FROM juncoes_173 j WHERE l.beneficiario_id = j.sai_id;

INSERT INTO public.emenda_beneficiarios_juntados (ficou_id, ficou_nome, saiu_id, saiu_nome, saiu_cnpj, linhas, motivo, juntado_por_nome)
SELECT j.fica_id, f.nome, j.sai_id, j.sai_nome, j.sai_cnpj, j.linhas,
       'Mesmo órgão cadastrado duas vezes (sigla da planilha, migration 173)', 'Cadastros da planilha (migration 173)'
  FROM juncoes_173 j JOIN public.emenda_beneficiarios f ON f.id = j.fica_id;

UPDATE public.emenda_beneficiarios f SET
  outros_nomes = ARRAY(SELECT DISTINCT x FROM unnest(f.outros_nomes || g.nomes) x WHERE x <> f.nome ORDER BY x)
  FROM (SELECT j.fica_id, array_agg(j.sai_nome) || COALESCE(array_agg(o) FILTER (WHERE o IS NOT NULL), '{}') AS nomes
          FROM juncoes_173 j LEFT JOIN LATERAL unnest(j.sai_outros) o ON TRUE GROUP BY j.fica_id) g
 WHERE f.id = g.fica_id;

DELETE FROM public.emenda_beneficiarios WHERE id IN (SELECT sai_id FROM juncoes_173);

-- 2) Nome, cidade, UF e sigla (NULL = fica como está) -----------------------------
CREATE TEMP TABLE dados_173 AS
SELECT v.*, b.nome AS antes
  FROM (VALUES
  -- Os 5 que ficaram só com o nome da planilha
  ('f2ce96cb-00d1-4506-94b5-72e83910cd16'::uuid, 1, 'Corpo de Bombeiros Militar', 'CBMAL', NULL, 'AL'),
  ('f13e9497-e2bd-4c2b-995b-4d6552f09319'::uuid, 1, 'Polícia Militar', 'PMMG', NULL, 'MG'),
  ('f7558df3-5899-4a6a-ba2a-c934b9047aeb'::uuid, 1, 'Guarda Municipal', NULL, 'São José dos Pinhais', 'PR'),
  ('d434252e-a312-4354-8845-35be96099eb7'::uuid, 2, 'Guarda Civil', NULL, 'Ariquemes', 'RO'),
  ('47615b5b-f20f-434f-851c-416f8c4d9b04'::uuid, 2, 'CERCO da 2ª, 7ª e 8ª Delegacias Seccionais', 'CERCO/2ª, 7ª e 8ª Seccional/DECAP', 'São Paulo', 'SP'),
  -- Cidade que estava no nome
  ('9a03c28b-67e0-453f-b6a3-54439d9e6d1c'::uuid, 3, 'Polícia Militar', NULL, 'Ariquemes', 'RO'),
  -- Sigla dos órgãos estaduais
  ('3628a073-bd56-46aa-946d-c67bdb26f6a5'::uuid, 2, NULL, 'CBMAP', NULL, NULL),
  ('d0f8ce95-47dd-42a5-893e-83ed48a53c74'::uuid, 2, NULL, 'CBMBA', NULL, NULL),
  ('9cb725cf-1df5-487d-b32b-bdddb0cdaa07'::uuid, 2, NULL, 'PCBA', NULL, NULL),
  ('0e156669-6fbb-458f-9471-8244d563a0c8'::uuid, 2, NULL, 'CBMCE', NULL, NULL),
  ('7e8903b7-f202-4e9c-898a-e412ce9d23bf'::uuid, 2, NULL, 'PMCE', NULL, NULL),
  ('d03da3d5-ade1-4628-b6dd-57cea0303e0a'::uuid, 4, NULL, 'CBMDF', NULL, NULL),
  ('63649015-dced-45d3-885e-ea1e77d63098'::uuid, 4, NULL, 'PCDF', NULL, NULL),
  ('9af47a6c-71d2-48f6-aba9-d8662a472255'::uuid, 3, NULL, 'PMDF', NULL, NULL),
  ('f0c0ad5e-e2a6-4f93-8af5-613a9bb7bba5'::uuid, 2, NULL, 'PMMA', NULL, NULL),
  ('078cee8c-366f-4a6c-97a6-665af0959900'::uuid, 2, NULL, 'CBMPA', NULL, NULL),
  ('3c9e05ac-769f-4110-be65-531b2fa8ecfe'::uuid, 2, NULL, 'PCPE', NULL, NULL),
  ('c21d8183-3a40-4f15-a8d2-0ea8f2a25c26'::uuid, 2, NULL, 'PMPE', NULL, NULL),
  ('708ae7a8-0417-498f-8e83-cab421fcab74'::uuid, 2, NULL, 'PMPI', NULL, NULL),
  ('748b283f-a41a-405f-b245-3b41e96a894b'::uuid, 1, NULL, 'CBMPR', NULL, NULL),
  ('7928980e-0c6a-4f93-8408-62ff2e3cf514'::uuid, 2, NULL, 'PCPR', NULL, NULL),
  ('56060f5f-8c20-4886-9055-ee6412b948f9'::uuid, 3, NULL, 'PCERJ', NULL, NULL),
  ('15e38425-a89f-4830-b82b-2fe207739ff6'::uuid, 3, NULL, 'PMERJ', NULL, NULL),
  ('61b2c103-a841-4eb6-a528-06d8a990a362'::uuid, 2, NULL, 'CBMRO', NULL, NULL),
  ('fc8f82fb-5608-4b7a-beab-fdbec0700747'::uuid, 2, NULL, 'PMRO', NULL, NULL),
  ('5ea6c148-87ca-490f-b8c8-c37191330299'::uuid, 2, NULL, 'PP-RO', NULL, NULL)
  ) v(id, versao, nome, sigla, municipio, uf)
  JOIN public.emenda_beneficiarios b ON b.id = v.id AND b.versao = v.versao;

-- Sigla do RJ só se a junção aconteceu (a guarda de versão foi a da junção).
INSERT INTO dados_173 (id, versao, nome, sigla, municipio, uf, antes)
SELECT j.fica_id, 2, NULL, 'CBMERJ', NULL, NULL, f.nome
  FROM juncoes_173 j JOIN public.emenda_beneficiarios f ON f.id = j.fica_id;

UPDATE public.emenda_beneficiarios b SET
  nome = COALESCE(r.nome, b.nome),
  sigla = COALESCE(r.sigla, b.sigla),
  entrega_municipio = COALESCE(r.municipio, b.entrega_municipio),
  entrega_uf = COALESCE(r.uf, b.entrega_uf),
  outros_nomes = CASE WHEN r.nome IS NULL OR r.antes = r.nome OR r.antes = ANY(b.outros_nomes) THEN b.outros_nomes ELSE array_append(b.outros_nomes, r.antes) END,
  versao = b.versao + 1, atualizado_por = NULL, atualizado_por_nome = 'Cadastros da planilha (migration 173)', atualizado_em = NOW()
  FROM dados_173 r
 WHERE b.id = r.id;

DROP TABLE juncoes_173;
DROP TABLE dados_173;
