-- ==============================================================================
-- MIGRATION 168: EMENDAS — NOME DA UNIDADE POR EXTENSO, SIGLA E JUNÇÃO DOS REPETIDOS
-- Versão: 20261023000168_emendas_beneficiarios_sigla.sql
--
-- Decisões de 23/10/2026 (terceira rodada dos nomes dos beneficiários):
-- 1) O nome é só a unidade, por extenso ("27º Batalhão de Polícia Militar Metropolitano"): sai o órgão do começo
--    (ele é o campo Órgão), a sigla da PM (PMCE, PMESP) e o lugar (cidade, bairro, região), que vai para o endereço.
--    Siglas viram nome por extenso: BPM, BPM/I, BPM/M, BPChq, GBM, SGB, UBM, Cia, DP, DDM, CPI.
-- 2) Coluna nova `sigla` (opcional): "27º BPM/M", "16º GBM", "DDM". Nas listas aparece ao lado do nome, como
--    "00001 · Ata 00055/2025" nas carteiras. Não entra na identidade (nome + município + UF).
-- 3) Padronizar deixa 35 grupos com o mesmo nome e lugar: são a mesma unidade escrita de jeitos diferentes.
--    Fica o cadastro com mais indicações; as indicações do outro passam para ele, o nome do outro vai para
--    outros_nomes e a junção fica em emenda_beneficiarios_juntados (como juntar_beneficiarios_emenda faz).
-- 4) 517 cadastros mudam de nome, sigla, cidade, UF, bairro ou órgão. Cada mudança só vale se o cadastro ainda
--    está como na medição; o que a CAEP já editou fica como ela deixou. Renomeação em duas fases para não esbarrar
--    no índice único no meio do caminho.
-- 5) salvar_beneficiario_emenda e juntar_beneficiarios_emenda passam a tratar a sigla (mesmas assinaturas e permissões).
-- ==============================================================================

ALTER TABLE public.emenda_beneficiarios ADD COLUMN IF NOT EXISTS sigla VARCHAR(40);
COMMENT ON COLUMN public.emenda_beneficiarios.sigla IS
  'Sigla da unidade ("27º BPM/M", "16º GBM"), opcional; aparece ao lado do nome nas listas. Não entra na identidade.';
COMMENT ON COLUMN public.emenda_beneficiarios.nome IS
  'Nome da unidade por extenso, sem órgão, cidade e UF (eles ficam nos campos próprios). Nome + município + UF não repetem '
  '(chave_identidade). O nome do beneficiário é a razão social, lida da Receita pelo CNPJ (razao_social).';

-- 1) Juntar os repetidos --------------------------------------------------------
CREATE TEMP TABLE juncoes_168 AS
SELECT v.fica_id, v.sai_id, s.nome AS sai_nome, s.cnpj AS sai_cnpj, s.outros_nomes AS sai_outros,
       (SELECT count(*) FROM public.emenda_pedido_linhas l WHERE l.beneficiario_id = v.sai_id) AS linhas
  FROM (VALUES
  ('4d4ef119-04c3-405b-bad3-c04a53861fa3'::uuid, 'Batalhão Especializado em Policiamento do Interior – BEPI (PMCE)', '161b8743-5805-4df5-85f1-53f85ecbf043'::uuid, 'BEPI – Batalhão Especializado em Policiamento do Interior (PMCE)'),
  ('9d6ed8ba-1757-4e0d-85df-4c0a2416ec56'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 2º Subgrupamento do 7º Grupamento de Bombeiros', '069d10a0-dbe3-4a72-8aa7-bf0e0e59b87b'::uuid, 'Corpo de Bombeiros Militar 2º Subgrupamento do 7º Grupamento de Bombeiros'),
  ('9d6ed8ba-1757-4e0d-85df-4c0a2416ec56'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 2º Subgrupamento do 7º Grupamento de Bombeiros', '109fe3fe-0633-4ed3-868b-3742a8fdbaae'::uuid, 'Corpo de Bombeiros Militar 2º Subgrupamento - 7º Grupamento de Bombeiros Militar'),
  ('d03da3d5-ade1-4628-b6dd-57cea0303e0a'::uuid, 'Corpo de Bombeiros Militar do Distrito Federal', '00138e47-68e1-4e86-978b-d2ad46a9f616'::uuid, 'Corpo de Bombeiros Militar'),
  ('e82eda44-852c-4955-8d56-1f898dc3cffa'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 11º Grupamento de Bombeiros Militar (11º GB)', '23535fc7-ac32-4cb0-af8b-4f1efaa7bb63'::uuid, 'Corpo de Bombeiros Militar 11º Grupamento de Bombeiros (GBPMESP) - Litoral Norte'),
  ('e82eda44-852c-4955-8d56-1f898dc3cffa'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 11º Grupamento de Bombeiros Militar (11º GB)', 'bf738c68-3bcb-4633-88ff-80c65290db6f'::uuid, 'Corpo de Bombeiros Militar 11º Grupamento de Bombeiros Militar (11º GB)'),
  ('3bf26a58-fef3-406d-a923-8eaad35fc346'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 13° Grupamento do Corpo de Bombeiros Militar', '2fe43d12-38ff-4fee-b4fc-8c0fc491d311'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 13º Grupamento de Bombeiros'),
  ('0038510c-b29d-4a01-9323-32b65a461448'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo - 16º Grupamento de Bombeiros Militar', 'da224089-0dda-40bd-9ec6-72fe3f1e9fba'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 16° Grupamento do Corpo de Bombeiros Militar'),
  ('b141e367-cc03-46dc-8d72-71c18257ba63'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 19° Grupamento do Corpo de Bombeiros Militar - 1º SGT - ITUPEVA', 'e8ba338e-7cd7-4053-a716-b9ec28660a99'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 19º Grupamento do Corpo de Bombeiros Militar - 1º SGT'),
  ('d9283851-9c1f-4a82-a678-71b1f9023b57'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo - 19º Grupamento do Corpo de Bombeiros Militar', '4956a007-ac92-4d5a-a81c-3c6b1740878e'::uuid, 'Corpo de Bombeiros Militar 19º Grupamento de Bombeiros Militar'),
  ('aed3d85d-a493-4d9e-a385-ac49eef70acd'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo GBMar, 3ª Cia do 21º BPM/I -Posto São Lourenço', '0ca1fb12-b5ae-4dc1-9140-e376e6f51b94'::uuid, 'Corpo de Bombeiros Militar GBMAR - 3ª Cia do 21º BPM/I -Posto São Lourenço'),
  ('fbf6428d-2e6a-4e1c-897e-bf55c7ff0c53'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo', 'd454f35c-0d1a-4bae-9a08-384e73df2b21'::uuid, 'Corpo de Bombeiros Militar'),
  ('9408e041-efa0-4f42-a2b6-4c0bc3f029f6'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo', 'aa06eafc-423b-4b02-a946-eda5ea3b2753'::uuid, 'Corpo de Bombeiros Militar'),
  ('fc874510-6cec-40e4-ba34-664e611d39ef'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo Unidade do Corpo de Bombeiros Militar', '89044f14-4bc4-4958-a729-3f1f3f860a94'::uuid, 'Corpo de Bombeiros Militar UBM'),
  ('63649015-dced-45d3-885e-ea1e77d63098'::uuid, 'Polícia Civil do Distrito Federal', '87f18068-e64c-4105-b56e-c2ef1773c266'::uuid, 'Polícia Civil'),
  ('c0602b1f-c92f-478d-be2e-69ef28ad1a44'::uuid, 'Polícia Civil do Estado de São Paulo 1º Distrito Policial de Carapicuíba', '30c4b48d-720b-4819-b67d-545a36b1df6d'::uuid, 'Polícia Civil do Estado de São Paulo 1º Distrito Policial'),
  ('3444c541-5e67-4e8f-bd4c-ac5a610982c8'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia da Mulher', '669ff746-784d-461f-b44e-37504f6a91aa'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM'),
  ('21bf8703-a6f8-4d6f-a0fb-b41ae2d0e702'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia de Polícia Civil Seccional de Santo André', '1561295d-ed8a-4619-90e6-1d24993e4c65'::uuid, 'Polícia Civil Delegacia de Polícia Civil Seccional'),
  ('b6fccbe0-31cb-4785-8abe-39b6c7a648e0'::uuid, 'Polícia Civil do Estado de São Paulo Grupo de Operações Especiais da Delegacia Seccional de Polícia de Carapicuíba', 'd4e8e3c3-d25a-43c3-9202-b2db178dbd8f'::uuid, 'Polícia Civil Grupo de Operações Especiais da Delegacia Seccional de Polícia'),
  ('56060f5f-8c20-4886-9055-ee6412b948f9'::uuid, 'Polícia Civil', '03c8a4ff-8d98-4e6e-ba27-f129c91637e4'::uuid, 'Secretaria de Estado da Polícia Civil'),
  ('9af47a6c-71d2-48f6-aba9-d8662a472255'::uuid, 'Polícia Militar', '6eadc1e9-609e-4313-b16f-f6b4879dae40'::uuid, 'Polícia Militar do Distrito Federal'),
  ('06b36200-c4b1-47c4-a2f2-4c992910b598'::uuid, 'Polícia Militar do Estado de São Paulo 12º Batalhão de Polícia Militar do Interior - 12º BPM/I', '72996e73-c667-4d86-8bc6-355afffd84c6'::uuid, 'Polícia Militar 12º Batalhão de Polícia Militar do Interior'),
  ('2939a451-a9f7-48c5-b2bc-f07e63be015e'::uuid, 'Polícia Militar do Estado de São Paulo 17° Batalhão de Polícia Militar do Interior', 'cd4756c4-2ecf-487d-8ab3-38d581a3342b'::uuid, 'Polícia Militar do Estado de São Paulo 17° BPM Interior/São José do Rio Preto'),
  ('2939a451-a9f7-48c5-b2bc-f07e63be015e'::uuid, 'Polícia Militar do Estado de São Paulo 17° Batalhão de Polícia Militar do Interior', '2c443bf5-c657-47fd-bc0f-774c2b61f613'::uuid, 'Polícia Militar 17° Batalhão de Polícia Militar do Interior'),
  ('382d77d6-f71c-42c9-a887-edd5f2d9fb1d'::uuid, 'Polícia Militar do Estado de São Paulo 27º Batalhão de Polícia Militar Metropolitano', '7ed885d3-8553-4a68-a304-c002c1760d60'::uuid, 'Polícia Militar 27º Batalhão de Polícia Militar Metropolitano - PMESP'),
  ('382d77d6-f71c-42c9-a887-edd5f2d9fb1d'::uuid, 'Polícia Militar do Estado de São Paulo 27º Batalhão de Polícia Militar Metropolitano', '5352a46d-39cf-4d99-9a94-fa9ed9063dd3'::uuid, 'Polícia Militar do Estado de São Paulo 27º Batalhão de Polícia Militar Metropolitano - PMESP'),
  ('ec0355f2-506f-4abf-a23c-921ee61dc416'::uuid, 'Polícia Militar do Estado de São Paulo 2ª CIA do 25° Batalhão da Polícia Militar do Interior', '7423e549-df2c-40c2-b6a9-8b606895824d'::uuid, 'Polícia Militar 2ª CIA do 25° Batalhão da Polícia Militar do Interior'),
  ('e41a47db-a4cd-4610-a805-9f6c96b1a4ff'::uuid, 'Polícia Militar do Estado de São Paulo 2º Batalhão de Polícia Militar do Interior - 2º BPM/I', '8da7b66d-5fb8-4d3c-9381-e864a0b3a25a'::uuid, 'Polícia Militar 2º Batalhão da Polícia Militar do Interior'),
  ('6204d67c-6806-4d0b-8434-f2adc6d5f10c'::uuid, 'Polícia Militar do Estado de São Paulo 4º Batalhão de Policiamento de Choque - 4º BPChq', '0c3ad067-2ba5-4357-8652-b5b376ebbc07'::uuid, 'Polícia Militar do Estado de São Paulo Polícia Militar do Estado de São Paulo - 4º Batalhão de Policiamento de Choque'),
  ('6204d67c-6806-4d0b-8434-f2adc6d5f10c'::uuid, 'Polícia Militar do Estado de São Paulo 4º Batalhão de Policiamento de Choque - 4º BPChq', '034adf2e-5ea0-4071-9d6f-56525f24a814'::uuid, 'Polícia Militar 4º Batalhão de Policiamento de Choque - 4º BPChq'),
  ('6204d67c-6806-4d0b-8434-f2adc6d5f10c'::uuid, 'Polícia Militar do Estado de São Paulo 4º Batalhão de Policiamento de Choque - 4º BPChq', '257af6b6-2e32-46cc-9a0d-becc5e01bb16'::uuid, 'Polícia Militar 4º Batalhão de Policiamento de Choque'),
  ('a212c678-9ecb-4894-af89-acc44873a59b'::uuid, 'Polícia Militar do Estado de São Paulo 52º Batalhão de Polícia Militar do Interior', '7a8bff9c-10cb-410e-b78b-d4b0d768bec4'::uuid, 'Polícia Militar 52° Batalhão de Polícia Militar do Interior'),
  ('acdf8bf6-91c1-4f48-a1f5-d0e18f78eaf5'::uuid, 'Polícia Militar do Estado de São Paulo 9º Batalhão de Polícia Militar do Interior - 9º BPM/I', 'e3ccd60b-6f9b-401c-b763-86ae7c6e023a'::uuid, 'Polícia Militar 9º Batalhão da Polícia Militar do Interior'),
  ('1d07b26b-846c-4014-816e-b79c1d08e721'::uuid, 'Polícia Militar Comando de Policiamento do Interior 3ª CPI', 'cc5b1fbf-104b-4aee-a513-ee3c41a72291'::uuid, 'Polícia Militar do Estado de São Paulo Comando de Policiamento do Interior 3 (CPI-3)'),
  ('1d07b26b-846c-4014-816e-b79c1d08e721'::uuid, 'Polícia Militar Comando de Policiamento do Interior 3ª CPI', 'd9d03111-d50c-48c4-beef-8abab566bb11'::uuid, 'Polícia Militar Comando de Policiamento do Interior 3 (CPI-3)'),
  ('1d07b26b-846c-4014-816e-b79c1d08e721'::uuid, 'Polícia Militar Comando de Policiamento do Interior 3ª CPI', '5859fa57-a5f4-4e14-a01c-c9ca8c29ada8'::uuid, 'Polícia Militar CPI-3'),
  ('1d07b26b-846c-4014-816e-b79c1d08e721'::uuid, 'Polícia Militar Comando de Policiamento do Interior 3ª CPI', '7614c2e2-ef61-4d82-91d8-d2acdb33ab97'::uuid, 'Polícia Militar Polícia Militar - CPI-3'),
  ('e3656d10-47c4-4bf1-8540-08e27bd5c67d'::uuid, 'Polícia Militar do Estado de São Paulo Comando de Policiamento do Interior 4 - CPI-4', 'adb12be6-0b04-4d99-8aa2-b1c6c3031a3f'::uuid, 'Polícia Militar Comando de Policiamento do Interior 4ª CPI'),
  ('eb3999d6-3ebf-437a-bc98-b06a54b478ab'::uuid, 'Polícia Militar do Estado de São Paulo Comando de Policiamento do Interior - 7 (CPI7)', '7fbfeb69-1086-4b33-be6c-ad06f749d641'::uuid, 'Polícia Militar Comando de Policiamento do Interior - 7 (CPI7)'),
  ('a7c14338-739d-4e88-9057-ec46d7240500'::uuid, 'Polícia Civil 6ª Delegacia de Polícia Civil Seccional de São Paulo/DECAP', '3041c3b1-71b2-41b0-bf46-3caba0aaed2e'::uuid, 'Polícia Civil 6ª Delegacia Seccional de Polícia - DECAP'),
  ('b1962bbe-69ac-4e32-bd85-e86c20663a7c'::uuid, 'Polícia Civil Delegacia de Polícia Civil Seccional', '99002b38-f72b-4e89-a1bd-b07ec151ffb8'::uuid, 'Polícia Civil Delegacia Seccional de Polícia'),
  ('205b1540-64d5-4a5f-8c34-178e30b8b8a7'::uuid, 'Polícia Civil Delegacia de Polícia Civil Seccional', '02f5b995-e8d7-496e-9ae9-8bcfa7fdcf6b'::uuid, 'Polícia Civil Delegacia de Polícia Seccional'),
  ('e68b46a5-cd82-4382-8d34-f3fd3df88692'::uuid, 'Polícia Civil Delegacia Seccional de Polícia', '5bda0f33-28c7-44e1-b255-0f09e85865f3'::uuid, 'Polícia Civil Delegacia de Polícia Civil Seccional'),
  ('924cf8f2-3437-4989-b6a3-1851d83f1b6b'::uuid, 'Polícia Militar CPI-6 21º Batalhão de Polícia Militar', 'd0a6b216-3d34-4b1c-9b1c-e9d4ddc6ef06'::uuid, 'Polícia Militar CPI-6 - 21º BPM')
  ) v(fica_id, fica_nome, sai_id, sai_nome)
  JOIN public.emenda_beneficiarios f ON f.id = v.fica_id AND f.nome = v.fica_nome
  JOIN public.emenda_beneficiarios s ON s.id = v.sai_id AND s.nome = v.sai_nome;

UPDATE public.emenda_pedido_linhas l SET beneficiario_id = j.fica_id FROM juncoes_168 j WHERE l.beneficiario_id = j.sai_id;

INSERT INTO public.emenda_beneficiarios_juntados (ficou_id, ficou_nome, saiu_id, saiu_nome, saiu_cnpj, linhas, motivo, juntado_por_nome)
SELECT j.fica_id, f.nome, j.sai_id, j.sai_nome, j.sai_cnpj, j.linhas,
       'Mesma unidade escrita de jeitos diferentes (padronização dos nomes, migration 168)', 'Padronização dos nomes (migration 168)'
  FROM juncoes_168 j JOIN public.emenda_beneficiarios f ON f.id = j.fica_id;

UPDATE public.emenda_beneficiarios f SET
  outros_nomes = ARRAY(SELECT DISTINCT x FROM unnest(f.outros_nomes || g.nomes) x WHERE x <> f.nome ORDER BY x),
  versao = f.versao + 1, atualizado_por = NULL, atualizado_por_nome = 'Padronização dos nomes (migration 168)', atualizado_em = NOW()
  FROM (SELECT fica_id, array_agg(sai_nome) || COALESCE(array_agg(o) FILTER (WHERE o IS NOT NULL), '{}') AS nomes
          FROM juncoes_168 LEFT JOIN LATERAL unnest(sai_outros) o ON TRUE GROUP BY fica_id) g
 WHERE f.id = g.fica_id;

DELETE FROM public.emenda_beneficiarios WHERE id IN (SELECT sai_id FROM juncoes_168);

-- 2) Renomear (duas fases) ------------------------------------------------------
CREATE TEMP TABLE renomear_168 AS
SELECT v.*
  FROM (VALUES
  ('4927885b-dc9c-4cd9-904b-c660f476becc'::uuid, '10º BPM (PMCE)', 'Iguatu', 'CE', NULL, 'Polícia Militar', '10º Batalhão de Polícia Militar', '10º BPM', 'Iguatu', 'CE', NULL, 'Polícia Militar'),
  ('882b45fd-07ca-45c7-a9e1-99722b7ed9ce'::uuid, '11º BPM (PMCE)', 'Itapipoca', 'CE', NULL, 'Polícia Militar', '11º Batalhão de Polícia Militar', '11º BPM', 'Itapipoca', 'CE', NULL, 'Polícia Militar'),
  ('4dfc8a41-3e3c-4284-b7fe-23e2d3cb7175'::uuid, '11° Grupamento de Bombeiros Militar - 1°SGB/4° PB - Campos de São José', 'São José dos Campos', 'SP', NULL, 'Corpo de Bombeiros Militar', '11º Grupamento de Bombeiro Militar - 1º Subgrupamento de Bombeiro Militar/4º Posto de Bombeiros', '11º GBM - 1º SGB/4º PB', 'São José dos Campos', 'SP', 'Campos de São José', 'Corpo de Bombeiros Militar'),
  ('716d3bf7-513c-4a61-bd9b-4b927dcabdde'::uuid, '12º BPM (PMCE)', 'Caucaia', 'CE', NULL, 'Polícia Militar', '12º Batalhão de Polícia Militar', '12º BPM', 'Caucaia', 'CE', NULL, 'Polícia Militar'),
  ('e9d62191-18e8-43e8-9db8-cafca2e54cea'::uuid, '13º BPM (PMCE)', 'Tauá', 'CE', NULL, 'Polícia Militar', '13º Batalhão de Polícia Militar', '13º BPM', 'Tauá', 'CE', NULL, 'Polícia Militar'),
  ('905c83cb-1135-481a-bb02-3222bf546b7c'::uuid, '14º BPM (PMCE)', 'Maracanaú', 'CE', NULL, 'Polícia Militar', '14º Batalhão de Polícia Militar', '14º BPM', 'Maracanaú', 'CE', NULL, 'Polícia Militar'),
  ('2cfbc268-6685-4aa6-8567-b031ac8e1228'::uuid, '15º BPM (PMCE)', 'Eusébio', 'CE', NULL, 'Polícia Militar', '15º Batalhão de Polícia Militar', '15º BPM', 'Eusébio', 'CE', NULL, 'Polícia Militar'),
  ('e1374070-37ee-4cec-87ba-28ac24a6086c'::uuid, '1ª Delegacia DPPC - Departamento de Polícia de Proteção à Cidadania - DPPC', 'São Paulo', 'SP', NULL, 'Polícia Civil', '1ª Delegacia DPPC - Departamento de Polícia de Proteção à Cidadania', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('a7cfadee-83d2-4e61-9e5e-e3577af8b0b2'::uuid, '1º BPM (PMCE)', 'Russas', 'CE', NULL, 'Polícia Militar', '1º Batalhão de Polícia Militar', '1º BPM', 'Russas', 'CE', NULL, 'Polícia Militar'),
  ('6ac54312-8ad1-47e1-9c31-ac274f517fef'::uuid, '20º BPM PIRAMBU (PMCE)', NULL, 'CE', NULL, 'Polícia Militar', '20º Batalhão de Polícia Militar PIRAMBU', '20º BPM PIRAMBU', NULL, 'CE', NULL, 'Polícia Militar'),
  ('c334ff60-ff7b-4c4f-a3db-ac31930a74e5'::uuid, '24º BPM (PMCE)', 'Maranguape', 'CE', NULL, 'Polícia Militar', '24º Batalhão de Polícia Militar', '24º BPM', 'Maranguape', 'CE', NULL, 'Polícia Militar'),
  ('87486d75-b20f-41e0-afde-e5013338b148'::uuid, '25º BPM (PMCE)', 'Horizonte', 'CE', NULL, 'Polícia Militar', '25º Batalhão de Polícia Militar', '25º BPM', 'Horizonte', 'CE', NULL, 'Polícia Militar'),
  ('501b65d5-ca15-4458-a977-e055ed0184a1'::uuid, '27º BPM (PMCE)', 'Tianguá', 'CE', NULL, 'Polícia Militar', '27º Batalhão de Polícia Militar', '27º BPM', 'Tianguá', 'CE', NULL, 'Polícia Militar'),
  ('0d77b5df-924a-4394-806a-b8c7ed59f85c'::uuid, '28º BPM (PMCE)', 'Camocim', 'CE', NULL, 'Polícia Militar', '28º Batalhão de Polícia Militar', '28º BPM', 'Camocim', 'CE', NULL, 'Polícia Militar'),
  ('63833990-780d-4da4-9b75-e78aa0a81cf0'::uuid, '29º BPM (PMCE)', 'Baturité', 'CE', NULL, 'Polícia Militar', '29º Batalhão de Polícia Militar', '29º BPM', 'Baturité', 'CE', NULL, 'Polícia Militar'),
  ('e1ebd2b2-07c8-4b2d-8e77-896f8394d1ec'::uuid, '2ª Delegacia de Investigações sobre Estelionato e Crimes Contra a Fé Pública - DEIC/DIG', 'São Paulo', 'SP', NULL, 'Polícia Civil', '2ª Delegacia de Investigações sobre Estelionato e Crimes Contra a Fé Pública - DIG', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('317c4b87-435b-44f7-bbbf-c8267a4af35f'::uuid, '2º BPM (PMCE)', 'Juazeiro do Norte', 'CE', NULL, 'Polícia Militar', '2º Batalhão de Polícia Militar', '2º BPM', 'Juazeiro do Norte', 'CE', NULL, 'Polícia Militar'),
  ('f92a9a64-b1a2-4a66-8567-bdad45b944a6'::uuid, '30º BPM (PMCE)', 'Aracati', 'CE', NULL, 'Polícia Militar', '30º Batalhão de Polícia Militar', '30º BPM', 'Aracati', 'CE', NULL, 'Polícia Militar'),
  ('d2aae87b-f3dd-43fb-8419-25dfde71a8ee'::uuid, '31º BPM (PMCE)', 'Jaguaribe', 'CE', NULL, 'Polícia Militar', '31º Batalhão de Polícia Militar', '31º BPM', 'Jaguaribe', 'CE', NULL, 'Polícia Militar'),
  ('c224f508-cf96-42c1-a9d4-8d8d24fa8e1b'::uuid, '32º BPM (PMCE)', 'Brejo Santo', 'CE', NULL, 'Polícia Militar', '32º Batalhão de Polícia Militar', '32º BPM', 'Brejo Santo', 'CE', NULL, 'Polícia Militar'),
  ('f7e3bec7-3dd8-4744-b154-08492e796f26'::uuid, '33º BPM (PMCE)', 'Campos Sales', 'CE', NULL, 'Polícia Militar', '33º Batalhão de Polícia Militar', '33º BPM', 'Campos Sales', 'CE', NULL, 'Polícia Militar'),
  ('ddc0207f-e276-48f7-8a28-d15d87919faa'::uuid, '34º BPM (PMCE)', 'Icó', 'CE', NULL, 'Polícia Militar', '34º Batalhão de Polícia Militar', '34º BPM', 'Icó', 'CE', NULL, 'Polícia Militar'),
  ('cdf1e0a1-674a-49bc-9fa8-fecf19177610'::uuid, '3º BPM (PMCE)', 'Sobral', 'CE', NULL, 'Polícia Militar', '3º Batalhão de Polícia Militar', '3º BPM', 'Sobral', 'CE', NULL, 'Polícia Militar'),
  ('ae9f84f9-19b4-4096-a0a7-e36241760540'::uuid, '3º CERCO / 3ª Delegacia de Polícia Seccional/DECAP -Pinheiros', 'São Paulo', 'SP', NULL, 'Polícia Civil', '3º CERCO/3ª Delegacia Seccional/DECAP - Pinheiros', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('96fcce08-2d78-45e7-9d79-9642f2996756'::uuid, '4º BPM (PMCE)', 'Canindé', 'CE', NULL, 'Polícia Militar', '4º Batalhão de Polícia Militar', '4º BPM', 'Canindé', 'CE', NULL, 'Polícia Militar'),
  ('89ff3750-3c0d-41de-b667-36a212c1663f'::uuid, '6º CERCO / 6ª Delegacia de Polícia Seccional/DECAP - Socorro', 'São Paulo', 'SP', NULL, 'Polícia Civil', '6º CERCO/6ª Delegacia Seccional/DECAP - Socorro', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('4e06aa93-2c7b-4f69-bdcb-469f91a34a90'::uuid, '7º BPM (PMCE)', 'Crateús', 'CE', NULL, 'Polícia Militar', '7º Batalhão de Polícia Militar', '7º BPM', 'Crateús', 'CE', NULL, 'Polícia Militar'),
  ('ac09ca9a-d773-4ece-bb4e-1bce2180b8cf'::uuid, '9º BPM (PMCE)', 'Quixadá', 'CE', NULL, 'Polícia Militar', '9º Batalhão de Polícia Militar', '9º BPM', 'Quixadá', 'CE', NULL, 'Polícia Militar'),
  ('4d4ef119-04c3-405b-bad3-c04a53861fa3'::uuid, 'Batalhão Especializado em Policiamento do Interior – BEPI (PMCE)', NULL, 'CE', NULL, 'Polícia Militar', 'Batalhão Especializado em Policiamento do Interior', NULL, NULL, 'CE', NULL, 'Polícia Militar'),
  ('903b09ff-642b-4cda-bd30-ea25871334fd'::uuid, 'Bombeiro Militar de Apucarana – PR (11º GB)', NULL, NULL, NULL, 'Corpo de Bombeiros Militar', 'Bombeiro Militar de Apucarana (11º Grupamento de Bombeiro Militar)', NULL, NULL, 'PR', NULL, 'Corpo de Bombeiros Militar'),
  ('d4fdea3d-58b1-41c8-ad64-8d714e41607d'::uuid, 'Bombeiro Militar de Maringá (5ºGB)', NULL, NULL, NULL, 'Corpo de Bombeiros Militar', 'Bombeiro Militar de Maringá (5º Grupamento de Bombeiro Militar)', NULL, NULL, NULL, NULL, 'Corpo de Bombeiros Militar'),
  ('1e8e14aa-b125-40dc-a6f9-3a459ce8e2e1'::uuid, 'BPGEP – Batalhão de Guarda Externa dos Presídios (PMCE)', NULL, 'CE', NULL, 'Polícia Militar', 'BPGEP - Batalhão de Guarda Externa dos Presídios', NULL, NULL, 'CE', NULL, 'Polícia Militar'),
  ('5f79a753-813b-459e-b9f6-fe9cb0a1f691'::uuid, 'BPMA – Batalhão de Polícia de Meio Ambiente (PMCE)', NULL, 'CE', NULL, 'Polícia Militar', 'Batalhão de Polícia de Meio Ambiente', NULL, NULL, 'CE', NULL, 'Polícia Militar'),
  ('04389acc-6d90-46e4-8bf5-356dd7f9b64d'::uuid, 'BPRE – Batalhão de Polícia de Trânsito Urbano e Rodoviário Estadual (PMCE)', NULL, 'CE', NULL, 'Polícia Militar', 'Batalhão de Polícia de Trânsito Urbano e Rodoviário Estadual', NULL, NULL, 'CE', NULL, 'Polícia Militar'),
  ('fbedb133-9204-4907-a642-ce8109f50f9d'::uuid, 'BPTUR – Batalhão de Policiamento Turístico (PMCE)', NULL, 'CE', NULL, 'Polícia Militar', 'Batalhão de Policiamento Turístico', NULL, NULL, 'CE', NULL, 'Polícia Militar'),
  ('c1e3c971-c6ee-44a9-a980-c843724fb307'::uuid, 'BRIGADA MILITAR – RS', 'Mormaço', 'RS', NULL, NULL, 'Brigada Militar', NULL, 'Mormaço', 'RS', NULL, NULL),
  ('d4acf8e9-81c2-481f-9a96-0e76ffbdee2f'::uuid, 'BRIGADA MILITAR – RS', 'Soledade', 'RS', NULL, NULL, 'Brigada Militar', NULL, 'Soledade', 'RS', NULL, NULL),
  ('dde0bdc6-0f77-4375-86c9-5bd43f74d3ac'::uuid, 'COPAC – Comando de Prevenção e Apoio às Comunidades (PMCE)', NULL, 'CE', NULL, 'Polícia Militar', 'Comando de Prevenção e Apoio às Comunidades', NULL, NULL, 'CE', NULL, 'Polícia Militar'),
  ('16eb295f-b038-480d-926d-47b813b4700c'::uuid, 'Corpo de Bombeiros Militar - CBI-3', 'Guarujá', 'SP', NULL, 'Corpo de Bombeiros Militar', 'CBI - 3', NULL, 'Guarujá', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('d03da3d5-ade1-4628-b6dd-57cea0303e0a'::uuid, 'Corpo de Bombeiros Militar do Distrito Federal', NULL, NULL, NULL, 'Corpo de Bombeiros Militar', 'Corpo de Bombeiros Militar', NULL, NULL, 'DF', NULL, 'Corpo de Bombeiros Militar'),
  ('14bf5823-34f1-4cc3-95b8-f11b664dddd5'::uuid, 'Corpo de Bombeiros Militar do Estado do Rio de Janeiro', NULL, NULL, NULL, 'Corpo de Bombeiros Militar', 'Corpo de Bombeiros Militar', NULL, NULL, 'RJ', NULL, 'Corpo de Bombeiros Militar'),
  ('3a37563d-5f34-4668-bbfd-5c486ff3f7f8'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo - 10º GBM', 'Marília', 'SP', NULL, 'Corpo de Bombeiros Militar', '10º Grupamento de Bombeiro Militar', '10º GBM', 'Marília', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('6d991284-108a-408f-9749-0d4654a8dd1f'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 11º Grupamento de Bombeiros - 2º Subgrupamento de Bombeiros, Estação BM Ana Emília - Taubaté', 'Taubaté', 'SP', NULL, 'Corpo de Bombeiros Militar', '11º Grupamento de Bombeiro Militar - 2º Subgrupamento de Bombeiro Militar, Estação Bombeiro Militar Ana Emília', NULL, 'Taubaté', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('e82eda44-852c-4955-8d56-1f898dc3cffa'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 11º Grupamento de Bombeiros Militar (11º GB)', 'São José dos Campos', 'SP', NULL, 'Corpo de Bombeiros Militar', '11º Grupamento de Bombeiro Militar', '11º GBM', 'São José dos Campos', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('bc34fc28-2620-45e1-9f8e-6f87a6750688'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo - 12º GBM', 'Bauru', 'SP', NULL, 'Corpo de Bombeiros Militar', '12º Grupamento de Bombeiro Militar', '12º GBM', 'Bauru', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('0cee5d1f-6b7a-4603-9003-3ef5562fd6b9'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 13º Grupamento de Bombeiros Militar', 'São José dos Campos', 'SP', NULL, 'Corpo de Bombeiros Militar', '13º Grupamento de Bombeiro Militar', '13º GBM', 'São José dos Campos', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('3bf26a58-fef3-406d-a923-8eaad35fc346'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 13° Grupamento do Corpo de Bombeiros Militar', 'São José do Rio Preto', 'SP', NULL, 'Corpo de Bombeiros Militar', '13º Grupamento de Bombeiro Militar', '13º GBM', 'São José do Rio Preto', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('73b1ddbb-3d28-409b-9bbd-09cade62c1cf'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 14º Grupamento de Bombeiros Militar - 2° Pelotão', 'Adamantina', 'SP', NULL, 'Corpo de Bombeiros Militar', '14º Grupamento de Bombeiro Militar - 2º Pelotão', NULL, 'Adamantina', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('66e9b426-a0a8-454d-a959-c0e698f456b7'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 14º Grupamento do Corpo de Bombeiros Militar', 'Adamantina', 'SP', NULL, 'Corpo de Bombeiros Militar', '14º Grupamento de Bombeiro Militar', '14º GBM', 'Adamantina', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('977d6fba-67eb-4943-a8e5-295cde8bcadf'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 16º Grupamento de Bombeiro Militar', 'Pirassununga', 'SP', NULL, 'Corpo de Bombeiros Militar', '16º Grupamento de Bombeiro Militar', NULL, 'Pirassununga', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('0038510c-b29d-4a01-9323-32b65a461448'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo - 16º Grupamento de Bombeiros Militar', 'Limeira', 'SP', NULL, 'Corpo de Bombeiros Militar', '16º Grupamento de Bombeiro Militar', '16º GBM', 'Limeira', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('b141e367-cc03-46dc-8d72-71c18257ba63'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 19° Grupamento do Corpo de Bombeiros Militar - 1º SGT - ITUPEVA', 'Itupeva', 'SP', NULL, 'Corpo de Bombeiros Militar', '19º Grupamento de Bombeiro Militar - 1º SGT', '19º GBM - 1º SGT', 'Itupeva', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('d9283851-9c1f-4a82-a678-71b1f9023b57'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo - 19º Grupamento do Corpo de Bombeiros Militar', 'Itupeva', 'SP', NULL, 'Corpo de Bombeiros Militar', '19º Grupamento de Bombeiro Militar', '19º GBM', 'Itupeva', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('17ea5353-77cc-42ca-918a-5e86eba51f5a'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 21º Batalhão de Polícia Militar do Interior - GBMar- 3ª CIA (Cidade de São Lourenço - Bertioga - SP)', NULL, NULL, NULL, NULL, '21º Batalhão de Polícia Militar do Interior - GBMar - 3ª Companhia', NULL, 'Bertioga', 'SP', 'São Lourenço', 'Corpo de Bombeiros Militar'),
  ('9d6ed8ba-1757-4e0d-85df-4c0a2416ec56'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 2º Subgrupamento do 7º Grupamento de Bombeiros', 'Mogi Guaçu', 'SP', NULL, 'Corpo de Bombeiros Militar', '2º Subgrupamento de Bombeiro Militar do 7º Grupamento de Bombeiro Militar', '2º SGB do 7º GBM', 'Mogi Guaçu', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('7ec39ca7-f390-450d-8037-ba5addc53c62'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo 4° Subgrupamento de Bombeiros 1° Pelotão', 'Assis', 'SP', NULL, 'Corpo de Bombeiros Militar', '4º Subgrupamento de Bombeiro Militar 1º Pelotão', NULL, 'Assis', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('259827c3-ac8d-4efb-85ac-352dc2de1e3e'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo Batalhão de Bombeiros Militar de Osasco', 'Osasco', 'SP', NULL, 'Corpo de Bombeiros Militar', 'Batalhão de Bombeiros Militar', NULL, 'Osasco', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('aed3d85d-a493-4d9e-a385-ac49eef70acd'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo GBMar, 3ª Cia do 21º BPM/I -Posto São Lourenço', 'Bertioga', 'SP', NULL, NULL, 'GBMar, 3ª Companhia do 21º Batalhão de Polícia Militar do Interior - Posto São Lourenço', NULL, 'Bertioga', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('b0f5d92a-0722-4c6b-8554-08cc90cd1379'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo Grupamento de Bombeiros Militar - 2° Pelotão', 'Adamantina', 'SP', NULL, 'Corpo de Bombeiros Militar', 'Grupamento de Bombeiro Militar - 2º Pelotão', NULL, 'Adamantina', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('d084e61e-1f5c-4e5a-bf21-753070acc2d3'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo Posto de Bombeiros do Guarapiranga - Interlagos', 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar', 'Posto de Bombeiros do Guarapiranga - Interlagos', NULL, 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('fe576b64-b730-4d22-82bd-349ed58414ee'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo', 'Salto', 'SP', NULL, 'Corpo de Bombeiros Militar', 'Corpo de Bombeiros Militar', NULL, 'Salto', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('fbf6428d-2e6a-4e1c-897e-bf55c7ff0c53'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo', 'São José do Rio Preto', 'SP', NULL, 'Corpo de Bombeiros Militar', 'Corpo de Bombeiros Militar', NULL, 'São José do Rio Preto', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('9408e041-efa0-4f42-a2b6-4c0bc3f029f6'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo', 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar', 'Corpo de Bombeiros Militar', NULL, 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('fc6aeab7-64b4-4184-8a1b-b4210f92fe95'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo SSP/SP - Comando do Corpo de Bombeiros Militar / GB MAR LIT. NORTE', 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar', 'SSP/SP - Comando do Corpo de Bombeiros Militar/Grupamento de Bombeiro Militar MAR LIT. NORTE', NULL, 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('9e08420b-1b22-41d6-9489-df0789de25d3'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo SSP/SP - Comando do Corpo de Bombeiros Militar / GB MAR LIT. SUL', 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar', 'SSP/SP - Comando do Corpo de Bombeiros Militar/Grupamento de Bombeiro Militar MAR LIT. SUL', NULL, 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('fc874510-6cec-40e4-ba34-664e611d39ef'::uuid, 'Corpo de Bombeiros Militar do Estado de São Paulo Unidade do Corpo de Bombeiros Militar', 'Campinas', 'SP', NULL, 'Corpo de Bombeiros Militar', 'Unidade de Bombeiro Militar', 'UBM', 'Campinas', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('1c66b28c-f6c8-4d1a-8f54-b885ed73590a'::uuid, 'CPChoque – Comando de Policiamento de Choque (PMCE)', NULL, 'CE', NULL, 'Polícia Militar', 'Comando de Policiamento de Choque', NULL, NULL, 'CE', NULL, 'Polícia Militar'),
  ('912a2616-3601-4095-9a0d-e415871ebdb9'::uuid, 'CPRAIO – Comando de Policiamento RAIO (PMCE)', NULL, 'CE', NULL, 'Polícia Militar', 'Comando de Policiamento RAIO', NULL, NULL, 'CE', NULL, 'Polícia Militar'),
  ('47615b5b-f20f-434f-851c-416f8c4d9b04'::uuid, 'DECAP / 2ª Seccional / CERCO DECAP / 7ª Seccional / CERCO DECAP / 8ª Seccional / CERCO', NULL, NULL, NULL, NULL, 'DECAP/2ª Seccional/CERCO DECAP/7ª Seccional/CERCO DECAP/8ª Seccional/CERCO', NULL, NULL, NULL, NULL, NULL),
  ('9904db07-a18a-490c-8483-89226c7d7ca1'::uuid, 'Delegacia Geral da Polícia Civil do Estado do Ceará – EC SSPDC - PCCE', NULL, NULL, NULL, 'Polícia Civil', 'Delegacia Geral da Polícia Civil do Estado do Ceará - EC SSPDC - PCCE', NULL, NULL, 'CE', NULL, 'Polícia Civil'),
  ('875ba2ae-dccc-4973-b55e-ca235bcedc11'::uuid, 'Delegacia de Polícia Civil - DEINTER 3', 'Barrinha', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 3', NULL, 'Barrinha', 'SP', NULL, 'Polícia Civil'),
  ('d9392631-3f0c-4b0a-a766-022421b4fc83'::uuid, 'Delegacia de Polícia de Investigações sobre Infrações contra o Meio Ambiente de Carapicuíba', NULL, NULL, NULL, 'Polícia Civil', 'Delegacia de Polícia de Investigações sobre Infrações contra o Meio Ambiente', NULL, 'Carapicuíba', NULL, NULL, 'Polícia Civil'),
  ('d6948856-6e5b-49df-8dab-4ecc08da9601'::uuid, 'GM de Bragança Paulista', NULL, 'SP', NULL, NULL, 'Guarda Municipal', NULL, 'Bragança Paulista', 'SP', NULL, NULL),
  ('d434252e-a312-4354-8845-35be96099eb7'::uuid, 'Guarda Civil (ARIQUEMES)', NULL, NULL, NULL, NULL, 'Guarda Civil (Ariquemes)', NULL, NULL, NULL, NULL, NULL),
  ('cd8d473a-853c-4ffb-a65d-b18290ad407e'::uuid, 'Guarda Municipal - Município de Francisco Morato', NULL, 'SP', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Francisco Morato', 'SP', NULL, 'Guarda Municipal'),
  ('2b1192bf-0a76-4fa4-b26b-8933fc89980e'::uuid, 'Guarda Municipal - Município de Franco da Rocha', NULL, 'SP', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Franco da Rocha', 'SP', NULL, 'Guarda Municipal'),
  ('638b6247-91c5-48b0-b6f5-0ee411132786'::uuid, 'Polícia Civil 51° DP', 'Paracambi', 'RJ', NULL, 'Polícia Civil', '51º Distrito Policial', '51º DP', 'Paracambi', 'RJ', NULL, 'Polícia Civil'),
  ('09e4f16b-baf3-42d7-a3e3-48c18999672d'::uuid, 'Polícia Civil 52° DP', 'Nova Iguaçu', 'RJ', NULL, 'Polícia Civil', '52º Distrito Policial', '52º DP', 'Nova Iguaçu', 'RJ', NULL, 'Polícia Civil'),
  ('e48f0136-71f5-4451-a31e-b8e62ebb9b02'::uuid, 'Polícia Civil 54° DP', 'Belford Roxo', 'RJ', NULL, 'Polícia Civil', '54º Distrito Policial', '54º DP', 'Belford Roxo', 'RJ', NULL, 'Polícia Civil'),
  ('c286527f-4f12-4cb0-b8ea-113d60cf1367'::uuid, 'Polícia Civil 58° DP', 'Nova Iguaçu', 'RJ', NULL, 'Polícia Civil', '58º Distrito Policial', '58º DP', 'Nova Iguaçu', 'RJ', NULL, 'Polícia Civil'),
  ('5ba1b9bd-bfb3-4ab8-8e24-46290d66622c'::uuid, 'Polícia Civil de Apucarana', NULL, 'PR', NULL, 'Polícia Civil', 'Polícia Civil', NULL, 'Apucarana', 'PR', NULL, 'Polícia Civil'),
  ('a439f04c-aac0-4801-8e4b-ee6517c4d7d8'::uuid, 'Polícia Civil - Delegacia Especializada de Roubos e Furtos - DERF Cidade de Sinop', NULL, NULL, NULL, 'Polícia Civil', 'Delegacia Especializada de Roubos e Furtos', NULL, 'Sinop', NULL, NULL, 'Polícia Civil'),
  ('6820db00-c9e6-4ea4-a5ca-cd2bd48d692f'::uuid, 'Polícia Civil Delegacia Regional de Guarantã do Norte', NULL, NULL, NULL, 'Polícia Civil', 'Delegacia Regional', NULL, 'Guarantã do Norte', NULL, NULL, 'Polícia Civil'),
  ('3789324b-4087-413a-8225-57dddb7424e1'::uuid, 'Polícia Civil Delegacia Regional de Nova Mutum', NULL, NULL, NULL, 'Polícia Civil', 'Delegacia Regional', NULL, 'Nova Mutum', NULL, NULL, 'Polícia Civil'),
  ('15869a80-69d4-4317-a377-8f428cfbe29b'::uuid, 'Polícia Civil Delegacia Regional de Sinop', NULL, NULL, NULL, 'Polícia Civil', 'Delegacia Regional', NULL, 'Sinop', NULL, NULL, 'Polícia Civil'),
  ('63649015-dced-45d3-885e-ea1e77d63098'::uuid, 'Polícia Civil do Distrito Federal', NULL, NULL, NULL, 'Polícia Civil', 'Polícia Civil', NULL, NULL, 'DF', NULL, 'Polícia Civil'),
  ('07aea06a-e1bc-4a13-83d2-62d33f82b929'::uuid, 'Polícia Civil do Estado de São Paulo 1ª Delegacia da Mulher (1ª DDM) Centro - São Paulo', 'São Paulo', 'SP', NULL, 'Polícia Civil', '1ª Delegacia de Defesa da Mulher Centro', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('c0602b1f-c92f-478d-be2e-69ef28ad1a44'::uuid, 'Polícia Civil do Estado de São Paulo 1º Distrito Policial de Carapicuíba', 'Carapicuíba', 'SP', NULL, 'Polícia Civil', '1º Distrito Policial', NULL, 'Carapicuíba', 'SP', NULL, 'Polícia Civil'),
  ('0d9c2a5b-0d6e-41f0-a86a-6b3f64878d36'::uuid, 'Polícia Civil do Estado de São Paulo 2ª Delegacia da Mulher (2ª DDM) Sul - São Paulo', 'São Paulo', 'SP', NULL, 'Polícia Civil', '2ª Delegacia de Defesa da Mulher Sul', '2ª DDM Sul', 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('55dd859f-2b86-430b-9669-a7b7461dae0f'::uuid, 'Polícia Civil do Estado de São Paulo 3ª Delegacia da Mulher (3ª DDM) Oeste - São Paulo', 'São Paulo', 'SP', NULL, 'Polícia Civil', '3ª Delegacia de Defesa da Mulher Oeste', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('eb481669-134a-4be4-bc9a-38d18ed358e8'::uuid, 'Polícia Civil do Estado de São Paulo 4ª Delegacia da Mulher (4ª DDM) Norte - São Paulo', 'São Paulo', 'SP', NULL, 'Polícia Civil', '4ª Delegacia de Defesa da Mulher Norte', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('32d5f73c-753f-40b9-bbde-f3512ea0c85c'::uuid, 'Polícia Civil do Estado de São Paulo 5ª Delegacia da Mulher (5ª DDM) Leste - São Paulo', 'São Paulo', 'SP', NULL, 'Polícia Civil', '5ª Delegacia de Defesa da Mulher Leste', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('e7e44969-ad9f-413d-85b2-fd35c3ed4e61'::uuid, 'Polícia Civil do Estado de São Paulo 7ª Delegacia da Mulher (7ª DDM) Leste', 'São Paulo', 'SP', NULL, 'Polícia Civil', '7ª Delegacia de Defesa da Mulher Leste', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('3444c541-5e67-4e8f-bd4c-ac5a610982c8'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia da Mulher', 'Franca', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Franca', 'SP', NULL, 'Polícia Civil'),
  ('7d2f48e1-18d9-4297-9e62-80d25fa13171'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia de Polícia Civil Seccional de Diadema - Delegacia da Mulher', 'Diadema', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional - Delegacia de Defesa da Mulher', NULL, 'Diadema', 'SP', NULL, 'Polícia Civil'),
  ('b665d68f-5409-4d3a-9184-b7f29c363eb8'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia de Polícia Civil Seccional de Franco da Rocha - Delegacia da Mulher', 'Franco da Rocha', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional - Delegacia de Defesa da Mulher', NULL, 'Franco da Rocha', 'SP', NULL, 'Polícia Civil'),
  ('3acf9dde-d90b-468d-b2a1-5bbcaf787d0a'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia de Polícia Civil Seccional de Guarulhos - Delegacia da Mulher', 'Guarulhos', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional - Delegacia de Defesa da Mulher', NULL, 'Guarulhos', 'SP', NULL, 'Polícia Civil'),
  ('21bf8703-a6f8-4d6f-a0fb-b41ae2d0e702'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia de Polícia Civil Seccional de Santo André', 'Santo André', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional', NULL, 'Santo André', 'SP', NULL, 'Polícia Civil'),
  ('010f2a9a-7b78-48d2-8440-9a4b1d57c032'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia de Polícia do Município de Itapevi - Delegacia Seccional de Polícia', 'Carapicuíba', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia do Município de Itapevi - Delegacia Seccional', NULL, 'Carapicuíba', 'SP', NULL, 'Polícia Civil'),
  ('581bd483-98b8-4c6a-9e72-48215af15397'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia Seccional da Polícia Civil', 'Adamantina', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional', NULL, 'Adamantina', 'SP', NULL, 'Polícia Civil'),
  ('473987e5-003a-4e18-84e8-852b80067c34'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia Sede da Polícia Civil do Município de Bertioga', 'Bertioga', 'SP', NULL, 'Polícia Civil', 'Delegacia Sede', NULL, 'Bertioga', 'SP', NULL, 'Polícia Civil'),
  ('952945e8-0a7d-4ba2-95d6-72e7fd9e5419'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia Sede da Polícia Civil do Município de Cubatão', 'Cubatão', 'SP', NULL, 'Polícia Civil', 'Delegacia Sede', NULL, 'Cubatão', 'SP', NULL, 'Polícia Civil'),
  ('a33ca9ab-c2e2-483f-8c94-7bf4f06919f9'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia Sede da Polícia Civil do Município de Guarujá', 'Guarujá', 'SP', NULL, 'Polícia Civil', 'Delegacia Sede', NULL, 'Guarujá', 'SP', NULL, 'Polícia Civil'),
  ('39bc1af4-8124-4053-a822-8380d331e317'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia Sede da Polícia Civil do Município de Itanhaém', 'Itanhaém', 'SP', NULL, 'Polícia Civil', 'Delegacia Sede', NULL, 'Itanhaém', 'SP', NULL, 'Polícia Civil'),
  ('fa3d1587-285b-40dd-938f-22f19c1e5432'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia Sede da Polícia Civil do Município de Registro', 'Registro', 'SP', NULL, 'Polícia Civil', 'Delegacia Sede', NULL, 'Registro', 'SP', NULL, 'Polícia Civil'),
  ('fb1fcf4c-9973-4a9e-9e4c-8cc2921ce5ac'::uuid, 'Polícia Civil do Estado de São Paulo Delegacia Sede da Polícia Civil do Município de São Vicente', 'São Vicente', 'SP', NULL, 'Polícia Civil', 'Delegacia Sede', NULL, 'São Vicente', 'SP', NULL, 'Polícia Civil'),
  ('b6fccbe0-31cb-4785-8abe-39b6c7a648e0'::uuid, 'Polícia Civil do Estado de São Paulo Grupo de Operações Especiais da Delegacia Seccional de Polícia de Carapicuíba', 'Carapicuíba', 'SP', NULL, 'Polícia Civil', 'Grupo de Operações Especiais da Delegacia Seccional', NULL, 'Carapicuíba', 'SP', NULL, 'Polícia Civil'),
  ('f7a9b998-c3a5-46ff-a7fc-6c21825981c5'::uuid, 'Polícia Civil do Estado de São Paulo POLÍCIAL CIVIL - DIG/DISE', 'Limeira', 'SP', NULL, 'Polícia Civil', 'POLÍCIAL CIVIL - DIG/DISE', NULL, 'Limeira', 'SP', NULL, 'Polícia Civil'),
  ('fa9fe537-317c-4eda-a64a-dc111f3ad203'::uuid, 'Polícia Civil Núcleo Regional de Inteligência Cidade de Sinop', NULL, NULL, NULL, 'Polícia Civil', 'Núcleo Regional de Inteligência', NULL, 'Sinop', NULL, NULL, 'Polícia Civil'),
  ('1ffde6c7-fe26-4f19-a465-a070b2610654'::uuid, 'Polícia Militar – 22º BPM de Colombo (ROTAM)', NULL, NULL, NULL, 'Polícia Militar', '22º Batalhão de Polícia Militar de Colombo (ROTAM)', NULL, NULL, NULL, NULL, 'Polícia Militar'),
  ('06b36200-c4b1-47c4-a2f2-4c992910b598'::uuid, 'Polícia Militar do Estado de São Paulo 12º Batalhão de Polícia Militar do Interior - 12º BPM/I', 'Botucatu', 'SP', NULL, 'Polícia Militar', '12º Batalhão de Polícia Militar do Interior', '12º BPM/I', 'Botucatu', 'SP', NULL, 'Polícia Militar'),
  ('2939a451-a9f7-48c5-b2bc-f07e63be015e'::uuid, 'Polícia Militar do Estado de São Paulo 17° Batalhão de Polícia Militar do Interior', 'São José do Rio Preto', 'SP', NULL, 'Polícia Militar', '17º Batalhão de Polícia Militar do Interior', '17º BPM/I', 'São José do Rio Preto', 'SP', NULL, 'Polícia Militar'),
  ('7c1e652a-8b51-4c10-96c8-114d8f87a38c'::uuid, 'Polícia Militar do Estado de São Paulo - 18º Batalhão de Polícia Militar do Interior - 18º BPM/I', 'Presidente Prudente', 'SP', NULL, 'Polícia Militar', '18º Batalhão de Polícia Militar do Interior', '18º BPM/I', 'Presidente Prudente', 'SP', NULL, 'Polícia Militar'),
  ('d04b859a-57b2-4c66-ad46-76360a98e19c'::uuid, 'Polícia Militar do Estado de São Paulo 20º Batalhão de Polícia Militar - 3ª Companhia', 'Itapevi', 'SP', NULL, 'Polícia Militar', '20º Batalhão de Polícia Militar - 3ª Companhia', '20º BPM - 3ª Cia', 'Itapevi', 'SP', NULL, 'Polícia Militar'),
  ('ef59264d-edc8-4c28-9a6d-9a086318d682'::uuid, 'Polícia Militar do Estado de São Paulo 25º Batalhão de Polícia Militar do Interior - 25º BPM/I', 'Dracema', 'SP', NULL, 'Polícia Militar', '25º Batalhão de Polícia Militar do Interior', '25º BPM/I', 'Dracema', 'SP', NULL, 'Polícia Militar'),
  ('382d77d6-f71c-42c9-a887-edd5f2d9fb1d'::uuid, 'Polícia Militar do Estado de São Paulo 27º Batalhão de Polícia Militar Metropolitano', 'São Paulo', 'SP', NULL, 'Polícia Militar', '27º Batalhão de Polícia Militar Metropolitano', '27º BPM/M', 'São Paulo', 'SP', NULL, 'Polícia Militar'),
  ('ec0355f2-506f-4abf-a23c-921ee61dc416'::uuid, 'Polícia Militar do Estado de São Paulo 2ª CIA do 25° Batalhão da Polícia Militar do Interior', 'Adamantina', 'SP', NULL, 'Polícia Militar', '2ª Companhia do 25º Batalhão de Polícia Militar do Interior', '2ª Cia do 25º BPM/I', 'Adamantina', 'SP', NULL, 'Polícia Militar'),
  ('d18ac123-b4fb-4ac3-ae68-f5878bf60cbf'::uuid, 'Polícia Militar do Estado de São Paulo 2ª Cia PM do 25° BPMI - Adamantina', 'Adamantina', 'SP', NULL, 'Polícia Militar', '2ª Companhia PM do 25º BPMI', '2ª Cia PM do 25º BPMI', 'Adamantina', 'SP', NULL, 'Polícia Militar'),
  ('fb8df137-6716-4c3f-9aee-5c7adef4dd64'::uuid, 'Polícia Militar do Estado de São Paulo 2° Batalhão da Polícia Militar Ambiental 4° Companhia - 2° Pelotão', 'Ourinhos', 'SP', NULL, 'Polícia Militar', '2º Batalhão de Polícia Militar Ambiental 4º Companhia - 2º Pelotão', NULL, 'Ourinhos', 'SP', NULL, 'Polícia Militar'),
  ('e21d031c-672b-4583-98a6-cc9ed75dfed6'::uuid, 'Polícia Militar do Estado de São Paulo 2º Batalhão de Polícia Militar do Interior/ 1ª companhia', 'Araçatuba', 'SP', NULL, 'Polícia Militar', '2º Batalhão de Polícia Militar do Interior/1ª companhia', NULL, 'Araçatuba', 'SP', NULL, 'Polícia Militar'),
  ('e41a47db-a4cd-4610-a805-9f6c96b1a4ff'::uuid, 'Polícia Militar do Estado de São Paulo 2º Batalhão de Polícia Militar do Interior - 2º BPM/I', 'Araçatuba', 'SP', NULL, 'Polícia Militar', '2º Batalhão de Polícia Militar do Interior', '2º BPM/I', 'Araçatuba', 'SP', NULL, 'Polícia Militar'),
  ('95dfac45-b169-4418-ab3f-e0b3f974f9fe'::uuid, 'Polícia Militar do Estado de São Paulo 31º Batalhão de Polícia Militar do Interior - 31º BPM/I', 'Ourinhos', 'SP', NULL, 'Polícia Militar', '31º Batalhão de Polícia Militar do Interior', '31º BPM/I', 'Ourinhos', 'SP', NULL, 'Polícia Militar'),
  ('cd5c2a3c-af95-4054-8ee9-048b29c38a8a'::uuid, 'Polícia Militar do Estado de São Paulo 32º Batalhão de Polícia Militar do Interior - 32º BPM/I', 'Assis', 'SP', NULL, 'Polícia Militar', '32º Batalhão de Polícia Militar do Interior', '32º BPM/I', 'Assis', 'SP', NULL, 'Polícia Militar'),
  ('f8ffceea-211f-4332-9727-76b42da64998'::uuid, 'Polícia Militar do Estado de São Paulo 33° Batalhão de Polícia Militar', 'Carapicuíba', 'SP', NULL, 'Polícia Militar', '33º Batalhão de Polícia Militar', '33º BPM', 'Carapicuíba', 'SP', NULL, 'Polícia Militar'),
  ('0c312494-e297-48a8-a58d-94c1eabd65ed'::uuid, 'Polícia Militar do Estado de São Paulo 36º Batalhão de Polícia Militar do Interior - 36º BPM/I', 'Limeira', 'SP', NULL, 'Polícia Militar', '36º Batalhão de Polícia Militar do Interior', '36º BPM/I', 'Limeira', 'SP', NULL, 'Polícia Militar'),
  ('f71b756b-fc94-4a8c-80d4-56d2d65f819f'::uuid, 'Polícia Militar do Estado de São Paulo 36º Batalhão de Polícia Militar do Interior - 3ª CIA', 'Pirassununga', 'SP', NULL, 'Polícia Militar', '36º Batalhão de Polícia Militar do Interior - 3ª Companhia', '36º BPM/I - 3ª Cia', 'Pirassununga', 'SP', NULL, 'Polícia Militar'),
  ('a8eca0e6-0e9c-46a7-b12a-618af2c4f8b3'::uuid, 'Polícia Militar do Estado de São Paulo 42º Batalhão de Polícia Militar do Interior - 42º BPM/I', 'Presidente Venceslau', 'SP', NULL, 'Polícia Militar', '42º Batalhão de Polícia Militar do Interior', '42º BPM/I', 'Presidente Venceslau', 'SP', NULL, 'Polícia Militar'),
  ('9da2fc75-a792-4fed-998e-aa763b320e07'::uuid, 'Polícia Militar do Estado de São Paulo 44º Batalhão de Polícia Militar do Interior - 44º BPM/I', 'Lins', 'SP', NULL, 'Polícia Militar', '44º Batalhão de Polícia Militar do Interior', '44º BPM/I', 'Lins', 'SP', NULL, 'Polícia Militar'),
  ('9d111b41-d315-4579-a0ac-f891dc9e8a6f'::uuid, 'Polícia Militar do Estado de São Paulo 4º Batalhão de Polícia Ambiental - BPAMB CIA 1º PEL', 'São José do Rio Preto', 'SP', NULL, 'Polícia Militar', '4º Batalhão de Polícia Ambiental - BPAMB Companhia 1º PEL', NULL, 'São José do Rio Preto', 'SP', NULL, 'Polícia Militar'),
  ('c5972594-874f-4197-b7a0-485291730e8b'::uuid, 'Polícia Militar do Estado de São Paulo 4° Batalhão de Polícia Ambiental', 'São José do Rio Preto', 'SP', NULL, 'Polícia Militar', '4º Batalhão de Polícia Ambiental', NULL, 'São José do Rio Preto', 'SP', NULL, 'Polícia Militar'),
  ('f8a45dfc-7e23-4772-b7f6-2b4a06e0a205'::uuid, 'Polícia Militar do Estado de São Paulo 4º Batalhão de Policiamento de Choque - 4ºBPChq', NULL, NULL, NULL, 'Polícia Militar', '4º Batalhão de Policiamento de Choque', '4º BPChq', NULL, 'SP', NULL, 'Polícia Militar'),
  ('6204d67c-6806-4d0b-8434-f2adc6d5f10c'::uuid, 'Polícia Militar do Estado de São Paulo 4º Batalhão de Policiamento de Choque - 4º BPChq', 'São Paulo', 'SP', NULL, 'Polícia Militar', '4º Batalhão de Policiamento de Choque', '4º BPChq', 'São Paulo', 'SP', NULL, 'Polícia Militar'),
  ('a212c678-9ecb-4894-af89-acc44873a59b'::uuid, 'Polícia Militar do Estado de São Paulo 52º Batalhão de Polícia Militar do Interior', 'Mirassol', 'SP', NULL, 'Polícia Militar', '52º Batalhão de Polícia Militar do Interior', '52º BPM/I', 'Mirassol', 'SP', NULL, 'Polícia Militar'),
  ('de9d07f1-3445-45f3-8005-12646cf2c95c'::uuid, 'Polícia Militar do Estado de São Paulo 53º Batalhão de Polícia Militar do Interior - 53º BPM/I', 'Avaré', 'SP', NULL, 'Polícia Militar', '53º Batalhão de Polícia Militar do Interior', '53º BPM/I', 'Avaré', 'SP', NULL, 'Polícia Militar'),
  ('acdf8bf6-91c1-4f48-a1f5-d0e18f78eaf5'::uuid, 'Polícia Militar do Estado de São Paulo 9º Batalhão de Polícia Militar do Interior - 9º BPM/I', 'Marília', 'SP', NULL, 'Polícia Militar', '9º Batalhão de Polícia Militar do Interior', '9º BPM/I', 'Marília', 'SP', NULL, 'Polícia Militar'),
  ('d172181f-1974-4f6b-82b3-31b41aeb22c5'::uuid, 'Polícia Militar do Estado de São Paulo', 'Adolfo', 'SP', NULL, 'Polícia Militar', 'Polícia Militar', NULL, 'Adolfo', 'SP', NULL, 'Polícia Militar'),
  ('3db05d04-4e77-4013-8420-0cfa2f778b94'::uuid, 'Polícia Militar do Estado de São Paulo', 'Bady Bassitt', 'SP', NULL, 'Polícia Militar', 'Polícia Militar', NULL, 'Bady Bassitt', 'SP', NULL, 'Polícia Militar'),
  ('96c55b7e-20b9-4b18-9023-49afcbdf6944'::uuid, 'Polícia Militar do Estado de São Paulo - Base de Jambeiro', 'Jambeiro', 'SP', NULL, 'Polícia Militar', 'Base da Polícia Militar', NULL, 'Jambeiro', 'SP', NULL, 'Polícia Militar'),
  ('a55d9666-1b32-4265-8496-5372ff99b69c'::uuid, 'Polícia Militar do Estado de São Paulo – Base de Paraibuna', 'Paraibuna', 'SP', NULL, 'Polícia Militar', 'Base da Polícia Militar', NULL, 'Paraibuna', 'SP', NULL, 'Polícia Militar'),
  ('b34ff918-76c7-4bc6-ab2e-f361b2a830f1'::uuid, 'Polícia Militar do Estado de São Paulo', 'Bofete', 'SP', NULL, 'Polícia Militar', 'Polícia Militar', NULL, 'Bofete', 'SP', NULL, 'Polícia Militar'),
  ('dc911f3d-0855-47f9-bf3e-6ade488643d1'::uuid, 'Polícia Militar do Estado de São Paulo BPM', 'Adolfo', 'SP', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Adolfo', 'SP', NULL, 'Polícia Militar'),
  ('1d6a16de-ddd1-45e5-8de8-b16393a30315'::uuid, 'Polícia Militar do Estado de São Paulo BPM', 'Bady Bassitt', 'SP', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Bady Bassitt', 'SP', NULL, 'Polícia Militar'),
  ('2be3fc75-80bd-4c0a-ad3a-7511ffe297b7'::uuid, 'Polícia Militar do Estado de São Paulo BPM', 'Colômbia', 'SP', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Colômbia', 'SP', NULL, 'Polícia Militar'),
  ('c8a9ec10-0049-4fe4-a0f3-fc17f82469b9'::uuid, 'Polícia Militar do Estado de São Paulo BPM', 'Mairinque', 'SP', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Mairinque', 'SP', NULL, 'Polícia Militar'),
  ('77ad07ad-a498-4dbd-bdd2-dfe069d857bc'::uuid, 'Polícia Militar do Estado de São Paulo BPM', 'Paraguaçu Paulista', 'SP', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Paraguaçu Paulista', 'SP', NULL, 'Polícia Militar'),
  ('0d09ef54-cd7f-4eff-836c-2709fed57289'::uuid, 'Polícia Militar do Estado de São Paulo BPM', 'São José da Bela Vista', 'SP', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'São José da Bela Vista', 'SP', NULL, 'Polícia Militar'),
  ('b7bffacd-5b7c-443e-ac84-9a0d4f333238'::uuid, 'Polícia Militar do Estado de São Paulo BPM', 'São Sebastião', 'SP', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'São Sebastião', 'SP', NULL, 'Polícia Militar'),
  ('db59a032-1cb7-4678-b9ff-f9ed83c33705'::uuid, 'Polícia Militar do Estado de São Paulo BPM', 'Vargem Grande Paulista', 'SP', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Vargem Grande Paulista', 'SP', NULL, 'Polícia Militar'),
  ('a151b1c7-d925-4dce-a290-44c629ce83b4'::uuid, 'Polícia Militar do Estado de São Paulo Cia da Polícia Militar', 'Mongaguá', 'SP', NULL, 'Polícia Militar', 'Companhia da Polícia Militar', NULL, 'Mongaguá', 'SP', NULL, 'Polícia Militar'),
  ('a2050c8e-4714-4c07-a902-8c323810c4c3'::uuid, 'Polícia Militar do Estado de São Paulo', 'Colômbia', 'SP', NULL, 'Polícia Militar', 'Polícia Militar', NULL, 'Colômbia', 'SP', NULL, 'Polícia Militar'),
  ('e3656d10-47c4-4bf1-8540-08e27bd5c67d'::uuid, 'Polícia Militar do Estado de São Paulo Comando de Policiamento do Interior 4 - CPI-4', 'Bauru', 'SP', NULL, 'Polícia Militar', 'Comando de Policiamento do Interior 4', NULL, 'Bauru', 'SP', NULL, 'Polícia Militar'),
  ('eb3999d6-3ebf-437a-bc98-b06a54b478ab'::uuid, 'Polícia Militar do Estado de São Paulo Comando de Policiamento do Interior - 7 (CPI7)', 'Sorocaba', 'SP', NULL, 'Polícia Militar', 'Comando de Policiamento do Interior 7', 'CPI-7', 'Sorocaba', 'SP', NULL, 'Polícia Militar'),
  ('40ecb39c-e038-4884-8681-146dd798dc9c'::uuid, 'Polícia Militar do Estado de São Paulo CPI-5 da Polícia Militar', 'São José do Rio Preto', 'SP', NULL, 'Polícia Militar', 'Comando de Policiamento do Interior 5 da Polícia Militar', NULL, 'São José do Rio Preto', 'SP', NULL, 'Polícia Militar'),
  ('a4552a6f-93f9-489f-9082-b171af00aea4'::uuid, 'Polícia Militar do Estado de São Paulo Escola de Formação de Soldados de Junqueirópolis', 'Junqueirópolis', 'SP', NULL, 'Polícia Militar', 'Escola de Formação de Soldados', NULL, 'Junqueirópolis', 'SP', NULL, 'Polícia Militar'),
  ('ba4392cc-f46d-417f-afde-d9b1e732dd7c'::uuid, 'Polícia Militar do Estado de São Paulo', 'Mairinque', 'SP', NULL, 'Polícia Militar', 'Polícia Militar', NULL, 'Mairinque', 'SP', NULL, 'Polícia Militar'),
  ('1e2679a9-a888-473b-a812-93270128f659'::uuid, 'Polícia Militar do Estado de São Paulo', 'Paraguaçu Paulista', 'SP', NULL, 'Polícia Militar', 'Polícia Militar', NULL, 'Paraguaçu Paulista', 'SP', NULL, 'Polícia Militar'),
  ('cb23649a-2474-49fb-aa30-c05d19f8b882'::uuid, 'Polícia Militar do Estado de São Paulo', 'Ribeirão Preto', 'SP', NULL, 'Polícia Militar', 'Polícia Militar', NULL, 'Ribeirão Preto', 'SP', NULL, 'Polícia Militar'),
  ('6673a40d-303e-49b8-b4b3-efa55e623576'::uuid, 'Polícia Militar do Estado de São Paulo', 'São Sebastião', 'SP', NULL, 'Polícia Militar', 'Polícia Militar', NULL, 'São Sebastião', 'SP', NULL, 'Polícia Militar'),
  ('428dbdfe-a0d1-4a04-ad17-d33d1bc83495'::uuid, 'Polícia Militar do Estado de São Paulo', 'Vargem Grande Paulista', 'SP', NULL, 'Polícia Militar', 'Polícia Militar', NULL, 'Vargem Grande Paulista', 'SP', NULL, 'Polícia Militar'),
  ('5ea6c148-87ca-490f-b8c8-c37191330299'::uuid, 'Polícia Penal do Estado de Rondônia (PP-RO)', NULL, NULL, NULL, 'Polícia Penal', 'Polícia Penal', NULL, NULL, 'RO', NULL, 'Polícia Penal'),
  ('83b69724-9b48-43c0-b2c5-0db21aa1b26b'::uuid, 'Quartel Comando-Geral (PMCE)', NULL, 'CE', NULL, 'Polícia Militar', 'Quartel Comando-Geral', NULL, NULL, 'CE', NULL, 'Polícia Militar'),
  ('15e38425-a89f-4830-b82b-2fe207739ff6'::uuid, 'Secretaria de Estado da Polícia Militar', NULL, 'RJ', NULL, 'Polícia Militar', 'Polícia Militar', NULL, NULL, 'RJ', NULL, 'Polícia Militar'),
  ('71473066-d794-4247-a78a-a3fffd986cc8'::uuid, 'Secretaria Municipal de Segurança de Jacareí', NULL, 'SP', NULL, NULL, 'Secretaria Municipal de Segurança', NULL, 'Jacareí', 'SP', NULL, NULL),
  ('35491186-3a17-454b-a6e1-b032f443dcf5'::uuid, 'Secretaria Municipal de Segurança e Ordem Pública de Camaragibe – PE (GUARDA CIVIL MUNICIPAL)', NULL, NULL, NULL, 'Guarda Municipal', 'Secretaria Municipal de Segurança e Ordem Pública de Camaragibe (Guarda Civil Municipal)', NULL, NULL, 'PE', NULL, 'Guarda Municipal'),
  ('2e65a065-337e-4623-b9e7-d362242ed563'::uuid, 'Secretaria Municipal de Segurança Pública de Petrolina', NULL, 'PE', NULL, NULL, 'Secretaria Municipal de Segurança Pública', NULL, 'Petrolina', 'PE', NULL, NULL),
  ('f6a89893-bd14-4658-afd5-9a2b82e8adaf'::uuid, 'Secretaria Municipal de Segurança Pública de Pirapora do Bom Jesus - SP (Defesa Civil)', NULL, NULL, NULL, 'Defesa Civil', 'Secretaria Municipal de Segurança Pública de Pirapora do Bom Jesus (Defesa Civil)', NULL, NULL, 'SP', NULL, 'Defesa Civil'),
  ('add02cd1-d6fb-4f85-8bb1-4a2106e35272'::uuid, 'Secretaria Municipal de Segurança Pública de Pirapora do Bom Jesus - SP (Guarda Municipal)', NULL, NULL, NULL, 'Guarda Municipal', 'Secretaria Municipal de Segurança Pública de Pirapora do Bom Jesus (Guarda Municipal)', NULL, NULL, 'SP', NULL, 'Guarda Municipal'),
  ('e7b4c345-5abf-49f4-979b-8e9948db3c72'::uuid, 'Secretaria de Segurança Pública de Cascavel', NULL, 'PR', NULL, NULL, 'Secretaria de Segurança Pública', NULL, 'Cascavel', 'PR', NULL, NULL),
  ('4f9ec4a5-0f96-496e-a490-1310e5dd07d0'::uuid, 'Secretaria da Segurança Pública do Estado de São Paulo', NULL, NULL, NULL, NULL, 'Secretaria da Segurança Pública do Estado de São Paulo', NULL, NULL, 'SP', NULL, NULL),
  ('cd527d40-e5e7-4933-b5b8-829498b1ac35'::uuid, 'Secretaria de Segurança Pública - SP 2ª DEATUR CGH - Polícia Civil', 'São Paulo', 'SP', NULL, 'Polícia Civil', 'Secretaria de Segurança Pública 2ª DEATUR CGH - Polícia Civil', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('6a8552ca-492e-45a3-ad7d-ca26a50fbad7'::uuid, 'Secretaria de Segurança Pública - SP Delegacia Antissequestro - Polícia Civil', 'São Paulo', 'SP', NULL, 'Polícia Civil', 'Secretaria de Segurança Pública Delegacia Antissequestro - Polícia Civil', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('bc188ab2-7c70-4364-91a1-e0824283f585'::uuid, '11º Batalhão de Polícia Militar', 'Timon', 'MA', NULL, 'Polícia Militar', '11º Batalhão de Polícia Militar', '11º BPM', 'Timon', 'MA', NULL, 'Polícia Militar'),
  ('f316a010-0c12-4760-8d47-138f7529bff7'::uuid, '16º BPM (PMCE)', 'Fortaleza', 'CE', 'Messejana', 'Polícia Militar', '16º Batalhão de Polícia Militar', '16º BPM', 'Fortaleza', 'CE', 'Messejana', 'Polícia Militar'),
  ('9afb608a-4115-4323-bc35-778b4f8e6e60'::uuid, '17º Batalhão da Polícia Militar', 'Codó', 'MA', NULL, 'Polícia Militar', '17º Batalhão de Polícia Militar', '17º BPM', 'Codó', 'MA', NULL, 'Polícia Militar'),
  ('bb4f8ac4-4010-4e6e-a4d4-147eac6acac4'::uuid, '17º BPM (PMCE)', 'Fortaleza', 'CE', 'Conjunto Ceará', 'Polícia Militar', '17º Batalhão de Polícia Militar', '17º BPM', 'Fortaleza', 'CE', 'Conjunto Ceará', 'Polícia Militar'),
  ('ebcb4208-6897-4534-9687-07b5fec461e4'::uuid, '18º BPM (PMCE)', 'Fortaleza', 'CE', 'Antônio Bezerra', 'Polícia Militar', '18º Batalhão de Polícia Militar', '18º BPM', 'Fortaleza', 'CE', 'Antônio Bezerra', 'Polícia Militar'),
  ('7d0f2c2b-90be-4d38-80c2-5113488b998f'::uuid, '19º BPM (PMCE)', 'Fortaleza', 'CE', 'Tancredo Neves', 'Polícia Militar', '19º Batalhão de Polícia Militar', '19º BPM', 'Fortaleza', 'CE', 'Tancredo Neves', 'Polícia Militar'),
  ('87dc7415-67c5-429a-9a5c-8cf006c0e66d'::uuid, '20º BPM (PMCE)', 'Fortaleza', 'CE', 'Cristo Redentor', 'Polícia Militar', '20º Batalhão de Polícia Militar', '20º BPM', 'Fortaleza', 'CE', 'Cristo Redentor', 'Polícia Militar'),
  ('af5d60b7-afed-4654-b6a1-30285cd624fa'::uuid, '21º BPM (PMCE)', 'Fortaleza', 'CE', 'Conjunto Esperança', 'Polícia Militar', '21º Batalhão de Polícia Militar', '21º BPM', 'Fortaleza', 'CE', 'Conjunto Esperança', 'Polícia Militar'),
  ('6cc42502-0bf3-40db-9e57-2fc3a6a9eb8d'::uuid, '22º BPM (PMCE)', 'Fortaleza', 'CE', 'Papicu', 'Polícia Militar', '22º Batalhão de Polícia Militar', '22º BPM', 'Fortaleza', 'CE', 'Papicu', 'Polícia Militar'),
  ('5bb43918-1d80-4bbf-a5be-5986f28f5815'::uuid, '23º BPM (PMCE)', 'Paracuru', 'CE', NULL, 'Polícia Militar', '23º Batalhão de Polícia Militar', '23º BPM', 'Paracuru', 'CE', NULL, 'Polícia Militar'),
  ('e05bcb60-8010-4edc-9760-99a0938ccb1a'::uuid, '26º BPM (PMCE)', 'Caucaia', 'CE', 'Jurema', 'Polícia Militar', '26º Batalhão de Polícia Militar', '26º BPM', 'Caucaia', 'CE', 'Jurema', 'Polícia Militar'),
  ('6520f28a-fd9f-46b3-8aab-5b36b11de4ea'::uuid, '5º BPM (PMCE)', 'Fortaleza', 'CE', 'Centro', 'Polícia Militar', '5º Batalhão de Polícia Militar', '5º BPM', 'Fortaleza', 'CE', 'Centro', 'Polícia Militar'),
  ('c5b31791-dcfe-4066-b1f5-538579047df8'::uuid, '6º BPM (PMCE)', 'Fortaleza', 'CE', 'Parangaba', 'Polícia Militar', '6º Batalhão de Polícia Militar', '6º BPM', 'Fortaleza', 'CE', 'Parangaba', 'Polícia Militar'),
  ('217d4ceb-ae4b-4752-a559-5a27c85b3c42'::uuid, '7º Batalhão da Polícia Militar', 'Pindaré Mirim', 'MA', NULL, 'Polícia Militar', '7º Batalhão de Polícia Militar', '7º BPM', 'Pindaré Mirim', 'MA', NULL, 'Polícia Militar'),
  ('1fad04cd-6e0c-4dbc-8ecf-dea17c9d10d7'::uuid, '8º BPM (PMCE)', 'Fortaleza', 'CE', 'Aldeota', 'Polícia Militar', '8º Batalhão de Polícia Militar', '8º BPM', 'Fortaleza', 'CE', 'Aldeota', 'Polícia Militar'),
  ('94ae81cb-291e-4c93-872c-91484af7df8f'::uuid, 'Corpo de Bombeiros Militar (UBM Canoinhas)', NULL, 'SC', NULL, 'Corpo de Bombeiros Militar', 'Unidade de Bombeiro Militar', 'UBM', 'Canoinhas', 'SC', NULL, 'Corpo de Bombeiros Militar'),
  ('c0ee903e-8d0a-4a51-ac0d-2872b31a1d6a'::uuid, 'Corpo de Bombeiros Militar (UBM da', 'Içara', 'SC', NULL, 'Corpo de Bombeiros Militar', 'Unidade de Bombeiro Militar', 'UBM', 'Içara', 'SC', NULL, 'Corpo de Bombeiros Militar'),
  ('b36ec819-d291-4d5d-960f-096495ed4b29'::uuid, 'Corpo de Bombeiros Militar 11º Grupamento de Bombeiros Militar -1°SGB - 1° PB/Vila Betania', 'São José dos Campos', 'SP', NULL, 'Corpo de Bombeiros Militar', '11º Grupamento de Bombeiro Militar - 1º Subgrupamento de Bombeiro Militar - 1º Posto de Bombeiros/Vila Betania', NULL, 'São José dos Campos', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('976def40-2064-4f15-9e11-25d3aaa37e02'::uuid, 'Corpo de Bombeiros Militar 11º Grupamento de Bombeiros Militar-1° SGB - 2°PB - Vila Industrial', 'São José dos Campos', 'SP', NULL, 'Corpo de Bombeiros Militar', '11º Grupamento de Bombeiro Militar - 1º Subgrupamento de Bombeiro Militar - 2º Posto de Bombeiros - Vila Industrial', NULL, 'São José dos Campos', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('17b49dfe-d0ed-42ae-8c9d-12152cf2299f'::uuid, 'Corpo de Bombeiros Militar 11º Grupamento de Bombeiros Militar 3° SGB', 'Caçapava', 'SP', NULL, 'Corpo de Bombeiros Militar', '11º Grupamento de Bombeiro Militar 3º Subgrupamento de Bombeiro Militar', '11º GBM 3º SGB', 'Caçapava', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('ef9c85e7-e95f-4608-a516-1e210606a730'::uuid, 'Corpo de Bombeiros Militar 11º Grupamento de Bombeiros Militar', 'Cachoeira Paulista', 'SP', NULL, 'Corpo de Bombeiros Militar', '11º Grupamento de Bombeiro Militar', '11º GBM', 'Cachoeira Paulista', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('11351478-247f-4544-9ac3-d44d94f42842'::uuid, 'Corpo de Bombeiros Militar 11º Grupamento de Bombeiros Militar', 'Caraguatatuba', 'SP', NULL, 'Corpo de Bombeiros Militar', '11º Grupamento de Bombeiro Militar', '11º GBM', 'Caraguatatuba', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('99f95b9c-a050-4cf0-8cb8-30a144a4a990'::uuid, 'Corpo de Bombeiros Militar 13º Grupamento de Bombeiros Militar', 'Jales', 'SP', NULL, 'Corpo de Bombeiros Militar', '13º Grupamento de Bombeiro Militar', '13º GBM', 'Jales', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('5066a57b-59bf-48cd-b44d-2948918412e8'::uuid, 'Corpo de Bombeiros Militar 14° Grupamento de Bombeiros Militar- 2° EB', 'Rosana', 'SP', NULL, 'Corpo de Bombeiros Militar', '14º Grupamento de Bombeiro Militar - 2º EB', '14º GBM - 2º EB', 'Rosana', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('489c7c02-c89f-4096-ad15-46b5eb27eed7'::uuid, 'Corpo de Bombeiros Militar 14° Grupamento de Bombeiros Militar - 2° Subgrupamento de Bombeiros', 'Rosana', 'SP', NULL, 'Corpo de Bombeiros Militar', '14º Grupamento de Bombeiro Militar - 2º Subgrupamento de Bombeiro Militar', '14º GBM - 2º SGB', 'Rosana', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('217b77f7-04ad-49b0-9c1c-b7f93162f93a'::uuid, 'Corpo de Bombeiros Militar 15º Grupamento de Bombeiros - 5º Subgrupamento de Bombeiros Militar', 'Botucatu', 'SP', NULL, 'Corpo de Bombeiros Militar', '15º Grupamento de Bombeiro Militar - 5º Subgrupamento de Bombeiro Militar', '15º GBM - 5º SGB', 'Botucatu', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('521ff20a-8369-49ad-9076-72ed502cc31f'::uuid, 'Corpo de Bombeiros Militar 16º Grupamento de Bombeiros - Subgrupamento de Bombeiros Militar', 'São José do Rio Pardo', 'SP', NULL, 'Corpo de Bombeiros Militar', '16º Grupamento de Bombeiro Militar - Subgrupamento de Bombeiro Militar', '16º GBM - SGB', 'São José do Rio Pardo', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('304648a1-df2b-470b-b440-0826c7ad3e3e'::uuid, 'Corpo de Bombeiros Militar 18º Grupamento de Bombeiros Base da', 'Itapevi', 'SP', NULL, 'Corpo de Bombeiros Militar', '18º Grupamento de Bombeiro Militar Base', '18º GBM Base', 'Itapevi', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('644ebce7-c93b-4126-9e98-aa5e4467a8f0'::uuid, 'Corpo de Bombeiros Militar 18° Grupamento de Bombeiros Militar - 2° Subgrupamento de Bombeiros Militar - SGB', 'Embu Guaçu', 'SP', NULL, 'Corpo de Bombeiros Militar', '18º Grupamento de Bombeiro Militar - 2º Subgrupamento de Bombeiro Militar', '18º GBM - 2º SGB', 'Embu Guaçu', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('766c5ed8-bd3b-4a55-b3a4-ade78cab04eb'::uuid, 'Corpo de Bombeiros Militar 19º Grupamento de Bombeiros Militar', 'Atibaia', 'SP', NULL, 'Corpo de Bombeiros Militar', '19º Grupamento de Bombeiro Militar', '19º GBM', 'Atibaia', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('dcf08fb4-7ccf-43e3-b793-40255c0feb31'::uuid, 'Corpo de Bombeiros Militar 19º Grupamento de Bombeiros Militar', 'Bragança Paulista', 'SP', NULL, 'Corpo de Bombeiros Militar', '19º Grupamento de Bombeiro Militar', '19º GBM', 'Bragança Paulista', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('db23ca49-813b-494f-92d5-bcb142f8ad75'::uuid, 'Corpo de Bombeiros Militar 19º Grupamento de Bombeiros Militar', 'Itatiba', 'SP', NULL, 'Corpo de Bombeiros Militar', '19º Grupamento de Bombeiro Militar', '19º GBM', 'Itatiba', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('6ad7ad44-a5f3-4fd0-bd5b-af2075a9e992'::uuid, 'Corpo de Bombeiros Militar 19º Grupamento de Bombeiros Militar', 'Jundiaí', 'SP', NULL, 'Corpo de Bombeiros Militar', '19º Grupamento de Bombeiro Militar', '19º GBM', 'Jundiaí', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('af42d404-bfab-423f-958b-ac3ce0eb78f3'::uuid, 'Corpo de Bombeiros Militar 19º Grupamento de Bombeiros Militar', 'Serra Negra', 'SP', NULL, 'Corpo de Bombeiros Militar', '19º Grupamento de Bombeiro Militar', '19º GBM', 'Serra Negra', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('33c9bdb5-08cf-4f49-be37-87be8e25161c'::uuid, 'Corpo de Bombeiros Militar 2º Pelotão de Adamantina 14º Grupamento de Bombeiros', 'Adamantina', 'SP', NULL, 'Corpo de Bombeiros Militar', '2º Pelotão de Adamantina 14º Grupamento de Bombeiro Militar', NULL, 'Adamantina', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('b7a21385-fcfa-44e1-ae31-a403ef31014c'::uuid, 'Corpo de Bombeiros Militar 4º Grupamento de Bombeiros Militar', 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar', '4º Grupamento de Bombeiro Militar', '4º GBM', 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('7d9c591a-3dd6-4b3f-a00c-56506e1f1517'::uuid, 'Corpo de Bombeiros Militar 6º Grupamento de Bombeiros Militar', 'Guarujá', 'SP', NULL, 'Corpo de Bombeiros Militar', '6º Grupamento de Bombeiro Militar', '6º GBM', 'Guarujá', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('6dc5f5ae-75e0-48ff-92e0-9543cc3ea495'::uuid, 'Corpo de Bombeiros Militar 9º Grupamento de Bombeiros Militar', 'Ribeirão Preto', 'SP', NULL, 'Corpo de Bombeiros Militar', '9º Grupamento de Bombeiro Militar', '9º GBM', 'Ribeirão Preto', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('fd0bdefb-180a-41a9-92af-75ed098fe43c'::uuid, 'Corpo de Bombeiros Militar GAED - Grupo de Atendimento a Emergências e Desastres do Comando de Bombeiro Metropolitano', 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar', 'Grupo de Atendimento a Emergências e Desastres do Comando de Bombeiro Metropolitano', NULL, 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('45a000ce-5125-4933-b751-b4f1318a43a0'::uuid, 'Corpo de Bombeiros Militar NOVA SEDE CCB - CBI - 14° Grupamento de Bombeiros Militar -1° SGB', 'Pirapozinho', 'SP', NULL, 'Corpo de Bombeiros Militar', 'NOVA SEDE CCB - CBI - 14º Grupamento de Bombeiro Militar - 1º Subgrupamento de Bombeiro Militar', NULL, 'Pirapozinho', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('a9dd44f8-c892-4088-92e8-f2c787e3d079'::uuid, 'Corpo de Bombeiros Militar Posto de Bombeiros Capão Redondo', 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar', 'Posto de Bombeiros Capão Redondo', NULL, 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('1222b7c2-8a20-40db-92ac-e233a7308440'::uuid, 'Corpo de Bombeiros Militar Posto de Bombeiros Vila Maria', 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar', 'Posto de Bombeiros Vila Maria', NULL, 'São Paulo', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('33eb78df-4812-4a02-8b89-a7fc0331b687'::uuid, 'Corpo de Bombeiros Militar Posto do Corpo de Bombeiros de Suzano - 17º Grupamento de Bombeiros - 2º SGB', 'Suzano', 'SP', NULL, 'Corpo de Bombeiros Militar', 'Posto do Corpo de Bombeiros - 17º Grupamento de Bombeiro Militar - 2º Subgrupamento de Bombeiro Militar', NULL, 'Suzano', 'SP', NULL, 'Corpo de Bombeiros Militar'),
  ('415927ea-b52a-403b-b55a-214be168f884'::uuid, 'Guarda Civil Municipal de Brejinho', 'Brejinho', 'RN', NULL, 'Guarda Municipal', 'Guarda Civil Municipal', NULL, 'Brejinho', 'RN', NULL, 'Guarda Municipal'),
  ('67b18dba-5b84-4276-9042-d86829ee5b2e'::uuid, 'Guarda Civil Municipal de Extremoz', 'Extremoz', 'RN', NULL, 'Guarda Municipal', 'Guarda Civil Municipal', NULL, 'Extremoz', 'RN', NULL, 'Guarda Municipal'),
  ('f4ceffc4-cf64-42f6-b9da-35983e5024a8'::uuid, 'Guarda Civil Municipal de Goianinha', 'Goianinha', 'RN', NULL, 'Guarda Municipal', 'Guarda Civil Municipal', NULL, 'Goianinha', 'RN', NULL, 'Guarda Municipal'),
  ('c42bcdae-1267-4dbf-b9e7-61e7264bf55a'::uuid, 'Guarda Civil Municipal de Guamaré', 'Guamaré', 'RN', NULL, 'Guarda Municipal', 'Guarda Civil Municipal', NULL, 'Guamaré', 'RN', NULL, 'Guarda Municipal'),
  ('698c8caf-de39-465c-a30c-1c6ec1b9bef9'::uuid, 'Guarda Civil Municipal de Janduís', 'Janduís', 'RN', NULL, 'Guarda Municipal', 'Guarda Civil Municipal', NULL, 'Janduís', 'RN', NULL, 'Guarda Municipal'),
  ('b94cc096-c4a1-4b2c-9619-a3dbb7d0493a'::uuid, 'Guarda Civil Municipal de Pedro Velho', 'Pedro Velho', 'RN', NULL, 'Guarda Municipal', 'Guarda Civil Municipal', NULL, 'Pedro Velho', 'RN', NULL, 'Guarda Municipal'),
  ('07c1aff0-f557-453a-a305-6111bdb2c1e8'::uuid, 'Guarda Civil Municipal de São Caetano do Sul', 'São Caetano do Sul', 'SP', NULL, 'Guarda Municipal', 'Guarda Civil Municipal', NULL, 'São Caetano do Sul', 'SP', NULL, 'Guarda Municipal'),
  ('483b17ef-73ac-4018-b471-0b74e9425cc0'::uuid, 'Guarda Civil Municipal de São Francisco do Itabapoana', 'São Francisco do Itabapoana', 'RJ', NULL, 'Guarda Municipal', 'Guarda Civil Municipal', NULL, 'São Francisco do Itabapoana', 'RJ', NULL, 'Guarda Municipal'),
  ('85aaab0f-b063-4a89-b36d-638adde3a2fb'::uuid, 'Guarda Civil Municipal de São Gonçalo do Amarante', 'São Gonçalo do Amarante', 'RN', NULL, 'Guarda Municipal', 'Guarda Civil Municipal', NULL, 'São Gonçalo do Amarante', 'RN', NULL, 'Guarda Municipal'),
  ('6cff2cf0-922a-4694-ac10-09d9ebc00e94'::uuid, 'Guarda Civil Municipal de São José de Mipibu', 'São José de Mipibu', 'RN', NULL, 'Guarda Municipal', 'Guarda Civil Municipal', NULL, 'São José de Mipibu', 'RN', NULL, 'Guarda Municipal'),
  ('8250c289-4286-4a93-99e3-85adf8260afe'::uuid, 'Guarda Civil Municipal de Votorantim', 'Votorantim', 'SP', NULL, 'Guarda Municipal', 'Guarda Civil Municipal', NULL, 'Votorantim', 'SP', NULL, 'Guarda Municipal'),
  ('57a7aa87-db9a-4109-9901-da5b2aa19d89'::uuid, 'Guarda Municipal de Almirante Tamandaré', 'Almirante Tamandaré', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Almirante Tamandaré', 'PR', NULL, 'Guarda Municipal'),
  ('0a63cd5b-7ee0-4c5d-b911-884098614a17'::uuid, 'Guarda Municipal de Amélia Rodrigues', 'Amélia Rodrigues', 'BA', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Amélia Rodrigues', 'BA', NULL, 'Guarda Municipal'),
  ('7619ffaf-22ca-401b-a319-7b4b8355187d'::uuid, 'Guarda Municipal de Apucarana', 'Apucarana', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Apucarana', 'PR', NULL, 'Guarda Municipal'),
  ('83134e01-d156-4860-a02d-455d6e40b406'::uuid, 'Guarda Municipal de Arapongas', 'Arapongas', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Arapongas', 'PR', NULL, 'Guarda Municipal'),
  ('40809566-bdb1-4f05-a6e4-85fa84050cd3'::uuid, 'Guarda Municipal de Araucária', 'Araucária', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Araucária', 'PR', NULL, 'Guarda Municipal'),
  ('96115e67-ab40-483d-a117-a5748aa8e19f'::uuid, 'Guarda Municipal de Areal', 'Areal', 'RJ', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Areal', 'RJ', NULL, 'Guarda Municipal'),
  ('b795f0e9-8eab-494e-a2bc-5b97de71693a'::uuid, 'Guarda Municipal de Balneário Camboriú', 'Balneário Camboriú', 'SC', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Balneário Camboriú', 'SC', NULL, 'Guarda Municipal'),
  ('772ac9bf-583d-4f17-9909-5ee8bb04b68a'::uuid, 'Guarda Municipal de Balsas', 'Balsas', 'MA', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Balsas', 'MA', NULL, 'Guarda Municipal'),
  ('e2cb0128-2faf-4ebc-8a8e-ab6aaf66f3fb'::uuid, 'Guarda Municipal de Campo Largo', 'Campo Largo', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Campo Largo', 'PR', NULL, 'Guarda Municipal'),
  ('3579eee0-3279-4721-afbc-330caf9e6c45'::uuid, 'Guarda Municipal de Capivari', 'Capivari', 'SP', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Capivari', 'SP', NULL, 'Guarda Municipal'),
  ('7b02234f-cff2-47c6-b6a7-2c538ec54f7c'::uuid, 'Guarda Municipal de Cariacica', 'Cariacica', 'ES', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Cariacica', 'ES', NULL, 'Guarda Municipal'),
  ('ca9f6bca-12b7-4032-b53f-88d94e9d2b64'::uuid, 'Guarda Municipal de Corumbá', 'Corumbá', 'MS', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Corumbá', 'MS', NULL, 'Guarda Municipal'),
  ('5380b5e6-3c3e-4d0a-b40c-aade9a2cbe5c'::uuid, 'Guarda Municipal de Floresta', 'Floresta', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Floresta', 'PR', NULL, 'Guarda Municipal'),
  ('3e7471d1-aaf5-44fb-8e74-b0ef4e97b7ee'::uuid, 'Guarda Municipal de Foz do Iguaçu', 'Foz do Iguaçu', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Foz do Iguaçu', 'PR', NULL, 'Guarda Municipal'),
  ('2ff3dfe5-8015-4089-b661-ac60c37f72bc'::uuid, 'Guarda Municipal de Ipojuca', 'Ipojuca', 'PE', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Ipojuca', 'PE', NULL, 'Guarda Municipal'),
  ('f6b1dbfe-be21-4929-b2c7-ec8d773fbdf8'::uuid, 'Guarda Municipal de Itamaracá', 'Itamaracá', 'PE', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Itamaracá', 'PE', NULL, 'Guarda Municipal'),
  ('7caabeb3-502b-49ae-a82c-a283d471032a'::uuid, 'Guarda Municipal de Itaparica', 'Itaparica', 'BA', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Itaparica', 'BA', NULL, 'Guarda Municipal'),
  ('672a9223-0afc-4826-9112-956a29676eac'::uuid, 'Guarda Municipal de Itapissuma', 'Itapissuma', 'PE', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Itapissuma', 'PE', NULL, 'Guarda Municipal'),
  ('6d0729dc-8932-4dba-b8c0-36ff73e3b3b6'::uuid, 'Guarda Municipal de Jaboatão dos Guararapes', 'Jaboatão dos Guararapes', 'PE', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Jaboatão dos Guararapes', 'PE', NULL, 'Guarda Municipal'),
  ('1212223e-8b21-4134-b4d6-a0ca41106131'::uuid, 'Guarda Municipal de Ladário', 'Ladário', 'MS', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Ladário', 'MS', NULL, 'Guarda Municipal'),
  ('f61c4dd3-eb19-4285-a22b-3d799f787615'::uuid, 'Guarda Municipal de Londrina', 'Londrina', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Londrina', 'PR', NULL, 'Guarda Municipal'),
  ('a63d86c3-9e13-4749-9b0b-3124f657000c'::uuid, 'Guarda Municipal de Mairiporã', 'Mairiporã', 'SP', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Mairiporã', 'SP', NULL, 'Guarda Municipal'),
  ('2ef1332b-6394-411d-b228-a5ff2bca54b4'::uuid, 'Guarda Municipal de Maragogi', 'Maragogi', 'AL', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Maragogi', 'AL', NULL, 'Guarda Municipal'),
  ('72c429b8-a8bd-47a3-b4d4-a9bd79f7a60c'::uuid, 'Guarda Municipal de Marialva', 'Marialva', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Marialva', 'PR', NULL, 'Guarda Municipal'),
  ('f1850418-ebe0-4f12-a3d0-50d848dd6408'::uuid, 'Guarda Municipal de Mariana', 'Mariana', 'MG', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Mariana', 'MG', NULL, 'Guarda Municipal'),
  ('24f114fc-66ed-4093-896b-508f0948a420'::uuid, 'Guarda Municipal de Maringá', 'Maringá', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Maringá', 'PR', NULL, 'Guarda Municipal'),
  ('8fc5cd9e-2235-40bf-bd21-cb214ec1fc7d'::uuid, 'Guarda Municipal de Nova Iguaçu', 'Nova Iguaçu', 'RJ', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Nova Iguaçu', 'RJ', NULL, 'Guarda Municipal'),
  ('56cdad02-1fff-408a-9d04-6dcd229e7053'::uuid, 'Guarda Municipal de Paracambi', 'Paracambi', 'RJ', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Paracambi', 'RJ', NULL, 'Guarda Municipal'),
  ('2a404368-1817-4c37-afe6-0a79f860e924'::uuid, 'Guarda Municipal de Paraiba do Sul', 'Paraiba do Sul', 'RJ', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Paraiba do Sul', 'RJ', NULL, 'Guarda Municipal'),
  ('634972b8-f9cf-42d7-ab1b-a646df1ac86e'::uuid, 'Guarda Municipal de Paranaguá', 'Paranaguá', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Paranaguá', 'PR', NULL, 'Guarda Municipal'),
  ('0021ae41-3751-4e3c-beee-eb817c9f008e'::uuid, 'Guarda Municipal de Petrópolis', 'Petrópolis', 'RJ', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Petrópolis', 'RJ', NULL, 'Guarda Municipal'),
  ('6f63df13-fd9a-4cdc-bcb9-dbf7c6dfa95b'::uuid, 'Guarda Municipal de Pinhais', 'Pinhais', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Pinhais', 'PR', NULL, 'Guarda Municipal'),
  ('6c95a2b3-3492-4cb2-a030-eae90551c88f'::uuid, 'Guarda Municipal de Pitangueiras', 'Pitangueiras', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Pitangueiras', 'PR', NULL, 'Guarda Municipal'),
  ('3569bba5-f096-4444-994d-03d3dbd97265'::uuid, 'Guarda Municipal de Pojuca', 'Pojuca', 'BA', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Pojuca', 'BA', NULL, 'Guarda Municipal'),
  ('6796770d-1854-4b8d-a375-e5128fcd5881'::uuid, 'Guarda Municipal de Ponta Grossa', 'Ponta Grossa', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Ponta Grossa', 'PR', NULL, 'Guarda Municipal'),
  ('78c566b6-22a3-4a0f-addf-0d2f9af197a9'::uuid, 'Guarda Municipal de Ponta Porã', 'Ponta Porã', 'MS', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Ponta Porã', 'MS', NULL, 'Guarda Municipal'),
  ('2c0b1dcd-32e8-4826-a22f-632f931fbaeb'::uuid, 'Guarda Municipal de Rio das Ostras', 'Rio das Ostras', 'RJ', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Rio das Ostras', 'RJ', NULL, 'Guarda Municipal'),
  ('14c58240-d897-413d-8c83-a3bdf78f392c'::uuid, 'Guarda Municipal de Santa Cruz da Vitória', 'Santa Cruz da Vitória', 'BA', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Santa Cruz da Vitória', 'BA', NULL, 'Guarda Municipal'),
  ('2ec20d34-a823-47a1-a5b5-f7f8e7320df6'::uuid, 'Guarda Municipal de Sarandi', 'Sarandi', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Sarandi', 'PR', NULL, 'Guarda Municipal'),
  ('6a5162d4-16ed-496b-ac80-3604c2ddabf4'::uuid, 'Guarda Municipal de Saubara', 'Saubara', 'BA', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Saubara', 'BA', NULL, 'Guarda Municipal'),
  ('374175d6-f8fd-4d7f-b910-b17e30fb1b2d'::uuid, 'Guarda Municipal de Toledo', 'Toledo', 'PR', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Toledo', 'PR', NULL, 'Guarda Municipal'),
  ('b369e753-9116-4a7d-a292-df05a8fe6896'::uuid, 'Guarda Municipal de Três Rios', 'Três Rios', 'RJ', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Três Rios', 'RJ', NULL, 'Guarda Municipal'),
  ('8c7f8092-4606-4f1f-8ec4-015685e21e90'::uuid, 'Guarda Municipal de Valença', 'Valença', 'BA', NULL, 'Guarda Municipal', 'Guarda Municipal', NULL, 'Valença', 'BA', NULL, 'Guarda Municipal'),
  ('a6f3f31d-8b09-45ad-bff1-41c2fc60a00e'::uuid, 'Polícia Civil (DEAM E DT - Vitória da Conquista - ВA)', NULL, 'BA', NULL, 'Polícia Civil', 'DEAM E DT', NULL, 'Vitória da Conquista', 'BA', NULL, 'Polícia Civil'),
  ('b1a64976-c44c-48c9-8f75-b8dcd36d1c80'::uuid, 'Polícia Civil (DPMCV - Salvador - BA)', NULL, 'BA', NULL, 'Polícia Civil', 'DPMCV', NULL, 'Salvador', 'BA', NULL, 'Polícia Civil'),
  ('c7d6b598-fa72-4daf-8139-a05c79f5e374'::uuid, 'Polícia Civil 1ª DP', 'Dourados', 'MS', NULL, 'Polícia Civil', '1ª Delegacia de Polícia', '1ª DP', 'Dourados', 'MS', NULL, 'Polícia Civil'),
  ('3aa03779-5a5b-40eb-9ab5-60b0877d3265'::uuid, 'Polícia Civil Delegacia Especializada de Combate ao Narcotráfico - DENAR', 'Campo Grande', 'MS', NULL, 'Polícia Civil', 'Delegacia Especializada de Combate ao Narcotráfico', NULL, 'Campo Grande', 'MS', NULL, 'Polícia Civil'),
  ('fc7e13be-9d9b-4568-9732-a25e2241fb7e'::uuid, 'Polícia Civil Delegacia Especializada de Roubos -DERF', 'Campo Grande', 'MS', NULL, 'Polícia Civil', 'Delegacia Especializada de Roubos - DERF', NULL, 'Campo Grande', 'MS', NULL, 'Polícia Civil'),
  ('ab1352d1-ebb9-4e14-9267-590d0bcd0c5c'::uuid, 'Polícia Civil Delegacia de Fronteira – DEFRON', 'Dourados', 'MS', NULL, 'Polícia Civil', 'Delegacia de Fronteira', NULL, 'Dourados', 'MS', NULL, 'Polícia Civil'),
  ('2f0b0f8e-bd28-416e-98c3-362a5b16665f'::uuid, 'Polícia Civil Delegacia de Homicídios - DHPP', 'Campo Grande', 'MS', NULL, 'Polícia Civil', 'Delegacia de Homicídios - DHPP', NULL, 'Campo Grande', 'MS', NULL, 'Polícia Civil'),
  ('5dfad14e-30d1-4288-9ae0-919a25884ddc'::uuid, 'Polícia Civil DP', 'Corumbá', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Corumbá', 'MS', NULL, 'Polícia Civil'),
  ('90d8670b-708a-4996-bd38-4c2c6c9253df'::uuid, 'Polícia Civil DP', 'Coxim', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Coxim', 'MS', NULL, 'Polícia Civil'),
  ('44bfdb3e-24ee-4bcd-9d97-102131dff89a'::uuid, 'Polícia Civil DP', 'Eldorado', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Eldorado', 'MS', NULL, 'Polícia Civil'),
  ('351a0707-40d9-431f-aed8-fe0e37b0aa26'::uuid, 'Polícia Civil DP', 'Guia Lopes da Laguna', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Guia Lopes da Laguna', 'MS', NULL, 'Polícia Civil'),
  ('9c18922f-3efa-409f-8e1d-0ef91b6dbcfc'::uuid, 'Polícia Civil DP', 'Iguatemi', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Iguatemi', 'MS', NULL, 'Polícia Civil'),
  ('e4c85f79-9511-4108-876d-c4cb85b1c020'::uuid, 'Polícia Civil DP', 'Inocência', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Inocência', 'MS', NULL, 'Polícia Civil'),
  ('c7a1838d-2eaa-48d0-9e76-1797b21aaa16'::uuid, 'Polícia Civil DP', 'Itaquirai', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Itaquirai', 'MS', NULL, 'Polícia Civil'),
  ('fc892496-95e6-4208-9c14-e32d090cdba1'::uuid, 'Polícia Civil DP', 'Ivinhema', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Ivinhema', 'MS', NULL, 'Polícia Civil'),
  ('64ed40bd-66db-4650-b0db-235a8a832af7'::uuid, 'Polícia Civil DP', 'Japorã', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Japorã', 'MS', NULL, 'Polícia Civil'),
  ('4b780c09-8775-4a2d-baa6-d524837aa028'::uuid, 'Polícia Civil DP', 'Jaraguari', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Jaraguari', 'MS', NULL, 'Polícia Civil'),
  ('30d201e9-a339-42cc-b15d-31b36599e5d3'::uuid, 'Polícia Civil DP', 'Jardim', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Jardim', 'MS', NULL, 'Polícia Civil'),
  ('a6b01963-909a-4c93-8c70-14a0f0d5acc0'::uuid, 'Polícia Civil DP', 'jatei', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'jatei', 'MS', NULL, 'Polícia Civil'),
  ('9ac9ce52-f366-448f-bf0e-fbaf0b38e4d4'::uuid, 'Polícia Civil DP', 'Ladario', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Ladario', 'MS', NULL, 'Polícia Civil'),
  ('71b1bd86-2e87-4d52-9c9d-3054ccb6e019'::uuid, 'Polícia Civil DP', 'Maracaju', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Maracaju', 'MS', NULL, 'Polícia Civil'),
  ('31ef8d3b-aa07-4e65-916a-2b18ea883b72'::uuid, 'Polícia Civil DP', 'Miranda', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Miranda', 'MS', NULL, 'Polícia Civil'),
  ('24d47081-8d83-4973-b87f-c906d0f9c40e'::uuid, 'Polícia Civil DP', 'Nioaque', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Nioaque', 'MS', NULL, 'Polícia Civil'),
  ('8cc72fd5-447d-41ac-80c2-5c355bcd6294'::uuid, 'Polícia Civil DP', 'Nova Alvorada do Sul', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Nova Alvorada do Sul', 'MS', NULL, 'Polícia Civil'),
  ('76690a14-264f-4b2d-a5ad-fa4e0f0c1d51'::uuid, 'Polícia Civil DP', 'Novo Horizonte do Sul', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Novo Horizonte do Sul', 'MS', NULL, 'Polícia Civil'),
  ('0437078b-7d31-475e-a7ce-e6804b5445ef'::uuid, 'Polícia Civil DP', 'Paraíso das Águas', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Paraíso das Águas', 'MS', NULL, 'Polícia Civil'),
  ('9ead7593-78ea-4d8b-b817-b25fbafcc97c'::uuid, 'Polícia Civil DP', 'Ponta Porã', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Ponta Porã', 'MS', NULL, 'Polícia Civil'),
  ('54fbe16e-a555-471e-8449-1ffc37876179'::uuid, 'Polícia Civil DP', 'Porto Murtinho', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Porto Murtinho', 'MS', NULL, 'Polícia Civil'),
  ('54f7a6ee-d856-4761-b304-1cfb6be18ee3'::uuid, 'Polícia Civil DP', 'Rio Brilhante', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Rio Brilhante', 'MS', NULL, 'Polícia Civil'),
  ('c68fee4b-233b-4f2c-b886-02da84e7504a'::uuid, 'Polícia Civil DP', 'Rio Negro', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Rio Negro', 'MS', NULL, 'Polícia Civil'),
  ('ed50073f-9d5d-4275-a32f-2165accd0b35'::uuid, 'Polícia Civil DP', 'Santa Rita do Pardo', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Santa Rita do Pardo', 'MS', NULL, 'Polícia Civil'),
  ('f9630436-7ca6-4f64-b86b-81ed016d5218'::uuid, 'Polícia Civil DP', 'Taguarussu', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Taguarussu', 'MS', NULL, 'Polícia Civil'),
  ('712a15d2-a5d1-4466-96f9-ee48c3efa320'::uuid, 'Polícia Civil DP', 'Terenos', 'MS', NULL, 'Polícia Civil', 'Delegacia de Polícia', 'DP', 'Terenos', 'MS', NULL, 'Polícia Civil'),
  ('d00b8038-3e1b-4b59-864f-d95427ce9f65'::uuid, 'Polícia Civil DRAP (Armamento e Tiro)', 'Campo Grande', 'MS', NULL, 'Polícia Civil', 'DRAP (Armamento e Tiro)', NULL, 'Campo Grande', 'MS', NULL, 'Polícia Civil'),
  ('6c353d38-89d5-43c3-aee1-c2e4c4d76920'::uuid, 'Polícia Civil Setor de Investigações Gerais – SIG', 'Dourados', 'MS', NULL, 'Polícia Civil', 'Setor de Investigações Gerais', NULL, 'Dourados', 'MS', NULL, 'Polícia Civil'),
  ('87e76800-89b2-4f7c-8872-c56accfdd628'::uuid, 'Polícia Civil Polícia Técnico Científica', 'Nova Iguaçu', 'RJ', NULL, NULL, 'Polícia Técnico Científica', NULL, 'Nova Iguaçu', 'RJ', NULL, 'Polícia Civil'),
  ('a5c58fec-78f1-4443-8fd8-1151575edcce'::uuid, 'Polícia Civil 1ª Delegacia de Polícia Civil', 'Guarulhos', 'SP', NULL, 'Polícia Civil', '1ª Delegacia de Polícia', NULL, 'Guarulhos', 'SP', NULL, 'Polícia Civil'),
  ('9b533011-321d-47f0-9fcf-f54fe7e3a377'::uuid, 'Polícia Civil 1ª Delegacia de Polícia Civil', 'Indaiatuba', 'SP', NULL, 'Polícia Civil', '1ª Delegacia de Polícia', NULL, 'Indaiatuba', 'SP', NULL, 'Polícia Civil'),
  ('de3542df-2eeb-41e0-adee-e195adcf7b91'::uuid, 'Polícia Civil 1ª Delegacia Seccional de Polícia Centro DECAP/1ª CERCO', 'São Paulo', 'SP', NULL, 'Polícia Civil', '1ª Delegacia Seccional Centro DECAP/1ª CERCO', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('7ae7523a-31a7-49cb-809c-0207f3c5fd3b'::uuid, 'Polícia Civil 1º CERCO / 1ª Seccional/DECAP - Bairro da Sé', 'São Paulo', 'SP', NULL, 'Polícia Civil', '1º CERCO/1ª Seccional/DECAP - Bairro da Sé', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('2ba3876a-3a01-4887-9e58-039768998244'::uuid, 'Polícia Civil 2ª Delegacia de Defesa da Mulher de Campinas - DDM', 'Campinas', 'SP', NULL, 'Polícia Civil', '2ª Delegacia de Defesa da Mulher', '2ª DDM', 'Campinas', 'SP', NULL, 'Polícia Civil'),
  ('aac293f2-1e88-47c4-a746-5ba681213555'::uuid, 'Polícia Civil 2ª Delegacia Seccional de Polícia - Sul - DECAP/2ª CERCO - Monções/Broklin', 'São Paulo', 'SP', NULL, 'Polícia Civil', '2ª Delegacia Seccional - Sul - DECAP/2ª CERCO - Monções/Broklin', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('db36ca46-62da-4b8d-a61e-0e8dd3664eb2'::uuid, 'Polícia Civil 2º CERCO / 2ª Seccional / DECAP - Brooklin Paulista', 'São Paulo', 'SP', NULL, 'Polícia Civil', '2º CERCO/2ª Seccional/DECAP - Brooklin Paulista', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('8254fa0b-f86a-496e-baf3-3ba751b451ed'::uuid, 'Polícia Militar BPM', 'Antônio João', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Antônio João', 'MS', NULL, 'Polícia Militar'),
  ('85b520ae-9cef-4bae-8089-215d49cb5a78'::uuid, 'Polícia Civil 2° Distrito Policial de Sumaré', 'Sumaré', 'SP', NULL, 'Polícia Civil', '2º Distrito Policial', NULL, 'Sumaré', 'SP', NULL, 'Polícia Civil'),
  ('4c8509c4-1e1e-43b0-afdb-8255279ee0f5'::uuid, 'Polícia Civil 34º Distrito Policial - Vila Sônia - Morumbi Butantã', 'São Paulo', 'SP', NULL, 'Polícia Civil', '34º Distrito Policial - Vila Sônia - Morumbi Butantã', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('9958f229-9ab4-4ce7-8d06-482b7f70b1ee'::uuid, 'Polícia Civil 4ª Delegacia de Capturas Busca e Apreensão de Adolescente/DOPE', 'São Paulo', 'SP', NULL, 'Polícia Civil', '4ª Delegacia de Capturas Busca e Apreensão de Adolescente/DOPE', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('496af3ac-5c12-4e8b-8712-b8f47cd6d9c8'::uuid, 'Polícia Civil 4º CERCO / 4ª Delegacia de Polícia Seccional/DECAP - Casa Verde', 'São Paulo', 'SP', NULL, 'Polícia Civil', '4º CERCO/4ª Delegacia Seccional/DECAP - Casa Verde', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('15c2e96e-562e-4572-8606-effe1758f139'::uuid, 'Polícia Civil 57ª Delegacia de Polícia - Parque da Mooca', 'São Paulo', 'SP', NULL, 'Polícia Civil', '57ª Delegacia de Polícia - Parque da Mooca', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('5fc4860a-d132-4807-b3e5-bb0255ec542e'::uuid, 'Polícia Civil 5ª Delegacia Seccional Departamento de Polícia Judiciária da Capital - 5ª DSP DECAP', 'São Paulo', 'SP', NULL, 'Polícia Civil', '5ª Delegacia Seccional Departamento de Polícia Judiciária da Capital - 5ª DSP DECAP', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('7211590d-d3e3-44dc-86fc-3fa5e0fd0fc7'::uuid, 'Polícia Civil 5º CERCO / 5ª Delegacia de Polícia Seccional/DECAP - Belém', 'São Paulo', 'SP', NULL, 'Polícia Civil', '5º CERCO/5ª Delegacia Seccional/DECAP - Belém', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('a7c14338-739d-4e88-9057-ec46d7240500'::uuid, 'Polícia Civil 6ª Delegacia de Polícia Civil Seccional de São Paulo/DECAP', 'São Paulo', 'SP', NULL, 'Polícia Civil', '6ª Delegacia Seccional/DECAP', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('8ec67473-5d7e-4ebc-aa20-62cc45a03838'::uuid, 'Polícia Civil DEINTER 7', 'Sorocaba', 'SP', NULL, 'Polícia Civil', 'DEINTER 7', NULL, 'Sorocaba', 'SP', NULL, 'Polícia Civil'),
  ('45bacd49-d789-4b36-b4d2-a3441378c09d'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'Araraquara', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Araraquara', 'SP', NULL, 'Polícia Civil'),
  ('25986d46-cfe0-41e9-bb90-26cd5664a486'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'Barretos', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Barretos', 'SP', NULL, 'Polícia Civil'),
  ('705b97eb-5465-4ba8-b252-74c83ad7ba18'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'Batatais', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Batatais', 'SP', NULL, 'Polícia Civil'),
  ('66b0b490-ee4d-4252-8ce2-287e22e51f20'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'Campinas', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Campinas', 'SP', NULL, 'Polícia Civil'),
  ('16847833-f5ee-4931-ab95-113183423a67'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'Caraguatatuba', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Caraguatatuba', 'SP', NULL, 'Polícia Civil'),
  ('50eb9656-1630-40ba-8757-cc52ba4abe09'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'Catanduva', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Catanduva', 'SP', NULL, 'Polícia Civil'),
  ('52871d6f-e8b8-4a20-9e0e-8d298afc9a8a'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'Ferraz de Vasconcelos', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Ferraz de Vasconcelos', 'SP', NULL, 'Polícia Civil'),
  ('987bdb9a-a893-4c9e-a995-b063d258cc56'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'Guarulhos', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Guarulhos', 'SP', NULL, 'Polícia Civil'),
  ('fa437d89-40e0-4c55-acf7-355c7d5311f8'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'Mauá', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Mauá', 'SP', NULL, 'Polícia Civil'),
  ('1ff2dbdf-f590-46e6-b6a1-982e3456efc7'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'Pindamonhangaba', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Pindamonhangaba', 'SP', NULL, 'Polícia Civil'),
  ('79c2c568-32b3-467f-b969-3570646a6d24'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'Ribeirão Preto', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Ribeirão Preto', 'SP', NULL, 'Polícia Civil'),
  ('f1100d6c-b049-406a-9570-d82d9531a4e4'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'São José dos Campos', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'São José dos Campos', 'SP', NULL, 'Polícia Civil'),
  ('730557a4-1be4-45b2-8d99-efd5bc16cdac'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'Sertãozinho', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Sertãozinho', 'SP', NULL, 'Polícia Civil'),
  ('95a76026-0760-4b68-980b-3193f4056869'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher - DDM', 'Ubatuba', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Ubatuba', 'SP', NULL, 'Polícia Civil'),
  ('96858c62-bd41-4cbe-82ea-cf7ab7845f52'::uuid, 'Polícia Civil Delegacia de Defesa da Mulher', 'Praia Grande', 'SP', NULL, 'Polícia Civil', 'Delegacia de Defesa da Mulher', 'DDM', 'Praia Grande', 'SP', NULL, 'Polícia Civil'),
  ('b87244eb-f85a-4571-8b68-c3a5e708088c'::uuid, 'Polícia Civil Delegacia de Investigações Gerais', 'Botucatu', 'SP', NULL, 'Polícia Civil', 'Delegacia de Investigações Gerais', NULL, 'Botucatu', 'SP', NULL, 'Polícia Civil'),
  ('061c7e38-f249-4fac-968b-725855476abf'::uuid, 'Polícia Civil Delegacia de Investigações Gerais - DIG', 'Campinas', 'SP', NULL, 'Polícia Civil', 'Delegacia de Investigações Gerais', NULL, 'Campinas', 'SP', NULL, 'Polícia Civil'),
  ('aada8e4a-2b99-49b8-9511-442fdc4c7b35'::uuid, 'Polícia Civil Delegacia de Investigações Gerais - DISE', 'Limeira', 'SP', NULL, 'Polícia Civil', 'Delegacia de Investigações Gerais - DISE', NULL, 'Limeira', 'SP', NULL, 'Polícia Civil'),
  ('a10b40ad-1546-4da5-9ca6-afba26c65965'::uuid, 'Polícia Civil Delegacia de Investigações sobre Entorpecentes - DISE', 'Americana', 'SP', NULL, 'Polícia Civil', 'Delegacia de Investigações sobre Entorpecentes', NULL, 'Americana', 'SP', NULL, 'Polícia Civil'),
  ('09c6acf7-9153-4092-a002-9b73a5c435de'::uuid, 'Polícia Civil Delegacia do Município de Rinópolis/Seccional Tupã/Regional - Marília/DEINTER 4', 'Rinópolis', 'SP', NULL, 'Polícia Civil', 'Delegacia/Seccional Tupã/Regional - Marília/DEINTER 4', NULL, 'Rinópolis', 'SP', NULL, 'Polícia Civil'),
  ('eba58f36-cdc5-472c-81e4-b6f77d8a745f'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Apiaí', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Apiaí', 'SP', NULL, 'Polícia Civil'),
  ('2c9dc0e1-0cde-426f-b9f8-8cc1071ea324'::uuid, 'Polícia Civil Delegacia de Polícia Civil de Auriflama - DEINTER 10 Seccional Araçatuba', 'Auriflama', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 10 Seccional Araçatuba', NULL, 'Auriflama', 'SP', NULL, 'Polícia Civil'),
  ('36884a33-8d96-4d4d-82fd-f2b8a2be4b00'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Auriflama', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Auriflama', 'SP', NULL, 'Polícia Civil'),
  ('bb073f9c-c978-4a39-8029-b1671637683b'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Barrinha', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Barrinha', 'SP', NULL, 'Polícia Civil'),
  ('74f7ebed-0361-45d1-a78c-a7771145b168'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Campos de Jordão', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Campos de Jordão', 'SP', NULL, 'Polícia Civil'),
  ('21431add-b9a4-4068-a4ee-1a739a9a7218'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Cedral', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Cedral', 'SP', NULL, 'Polícia Civil'),
  ('67c92d63-aee7-4459-8dfc-568b948d3a7b'::uuid, 'Polícia Civil Delegacia de Polícia Civil de Coroados - DEINTER 10 Seccional de Araçatuba', 'Coroados', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 10 Seccional de Araçatuba', NULL, 'Coroados', 'SP', NULL, 'Polícia Civil'),
  ('a9f3a0a0-54cb-4b89-add2-42489ee16eb6'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Cosmópolis', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Cosmópolis', 'SP', NULL, 'Polícia Civil'),
  ('3e21fe45-58c2-472c-b08c-6de56d3005e8'::uuid, 'Polícia Civil Delegacia de Polícia Civil - DEINTER 3', 'Guariba', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 3', NULL, 'Guariba', 'SP', NULL, 'Polícia Civil'),
  ('517f259a-9431-4f92-83cd-c2a58e534f2f'::uuid, 'Polícia Civil Delegacia de Polícia Civil - DEINTER 3', 'Pitangueiras', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 3', NULL, 'Pitangueiras', 'SP', NULL, 'Polícia Civil'),
  ('ddc73c1f-353a-4dac-9c92-c56dde775d5d'::uuid, 'Polícia Civil Delegacia de Polícia Civil - DEINTER 3', 'Pontal', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 3', NULL, 'Pontal', 'SP', NULL, 'Polícia Civil'),
  ('990a2d93-c6fc-430e-8ba9-406b041cdb27'::uuid, 'Polícia Civil Delegacia de Polícia Civil - DEINTER 3', 'Sertãozinho', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 3', NULL, 'Sertãozinho', 'SP', NULL, 'Polícia Civil'),
  ('d1cb0b78-8651-4d98-bf5e-515977ff931a'::uuid, 'Polícia Civil Delegacia de Polícia Civil - Delegacia da Mulher Seccional', 'Franco da Rocha', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - Delegacia de Defesa da Mulher Seccional', NULL, 'Franco da Rocha', 'SP', NULL, 'Polícia Civil'),
  ('a483f8af-c194-4716-8aa3-06175198221e'::uuid, 'Polícia Civil Delegacia de Polícia Civil de Espírito Santo do Turvo - DEINTER 4 - Seccional de Ourinhos', 'Espírito Santo do Turvo', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 4 - Seccional de Ourinhos', NULL, 'Espírito Santo do Turvo', 'SP', NULL, 'Polícia Civil'),
  ('97fc97b7-874b-4679-ba77-470a98c3b1d1'::uuid, 'Polícia Civil Delegacia de Polícia Civil de Guzolândia - DEINTER 10 Seccional de Araçatuba', 'Guzolândia', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 10 Seccional de Araçatuba', NULL, 'Guzolândia', 'SP', NULL, 'Polícia Civil'),
  ('8b6f7b9d-b8ce-4d34-99bb-5e8dde3edaee'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Guzolândia', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Guzolândia', 'SP', NULL, 'Polícia Civil'),
  ('04950b5c-6193-4cd9-95a4-54faaea36ea2'::uuid, 'Polícia Civil Delegacia de Polícia Civil de Herculândia - DEINTER 4 -Seccional Tupa', 'Herculândia', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 4 - Seccional Tupa', NULL, 'Herculândia', 'SP', NULL, 'Polícia Civil'),
  ('3457f7dc-8f40-43c5-8a77-5c1bfcf96ae0'::uuid, 'Polícia Civil Delegacia de Polícia Civil de Ilha Solteira - DEINTER 10 - Seccional de Andradina', 'Ilha Solteira', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 10 - Seccional de Andradina', NULL, 'Ilha Solteira', 'SP', NULL, 'Polícia Civil'),
  ('05f793d3-a398-48b6-be58-1874cb124227'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Joanópolis', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Joanópolis', 'SP', NULL, 'Polícia Civil'),
  ('12bf5440-ad0b-4df9-9151-a293767ca115'::uuid, 'Polícia Civil Delegacia de Polícia Civil de Matão - DEINTER 3 Seccional de Araraquara', 'Matão', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 3 Seccional de Araraquara', NULL, 'Matão', 'SP', NULL, 'Polícia Civil'),
  ('b30f7f10-35b2-4916-ba0e-63ae85d975cc'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Palmital', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Palmital', 'SP', NULL, 'Polícia Civil'),
  ('8ec572f7-6164-4d7a-a422-2938f224cee4'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Piracaia', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Piracaia', 'SP', NULL, 'Polícia Civil'),
  ('9cc000b3-bc4d-4dd8-a9b7-b2e983806771'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Ribeirão Preto', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Ribeirão Preto', 'SP', NULL, 'Polícia Civil'),
  ('d6fc21a4-93da-4380-b92c-8c8a74f169eb'::uuid, 'Polícia Civil Delegacia de Polícia Civil de Salto de Pirapora - DEINTER 7 - Seccional de Sorocaba', 'Salto de Pirapora', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 7 - Seccional de Sorocaba', NULL, 'Salto de Pirapora', 'SP', NULL, 'Polícia Civil'),
  ('b1962bbe-69ac-4e32-bd85-e86c20663a7c'::uuid, 'Polícia Civil Delegacia de Polícia Civil Seccional', 'Cruzeiro', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional', NULL, 'Cruzeiro', 'SP', NULL, 'Polícia Civil'),
  ('205b1540-64d5-4a5f-8c34-178e30b8b8a7'::uuid, 'Polícia Civil Delegacia de Polícia Civil Seccional', 'Franca', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional', NULL, 'Franca', 'SP', NULL, 'Polícia Civil'),
  ('34493414-dd81-463e-8a1e-af179ebc8499'::uuid, 'Polícia Civil Delegacia de Polícia Civil Seccional', 'Santa Fé Do Sul', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional', NULL, 'Santa Fé Do Sul', 'SP', NULL, 'Polícia Civil'),
  ('35c097ff-d09f-4d28-a894-6fd0a8000afb'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Serra Azul', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Serra Azul', 'SP', NULL, 'Polícia Civil'),
  ('c104736e-b239-4a8a-bfe1-5f0fe2a21de6'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Serrana', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Serrana', 'SP', NULL, 'Polícia Civil'),
  ('e49b2551-9f51-4abc-bb93-c819389ecaa2'::uuid, 'Polícia Civil Delegacia de Polícia Civil', 'Tietê', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Tietê', 'SP', NULL, 'Polícia Civil'),
  ('a30dad02-243e-421c-bbea-a3f704ce411c'::uuid, 'Polícia Civil Delegacia de Polícia Civil de Tupã - DEINTER 4 Seccional - Tupã', 'Tupã', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia - DEINTER 4 Seccional', NULL, 'Tupã', 'SP', NULL, 'Polícia Civil'),
  ('a050c0f6-9aa0-4f19-aa55-f5169cdd91a7'::uuid, 'Polícia Civil Delegacia de Polícia', 'Monte Alto', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Monte Alto', 'SP', NULL, 'Polícia Civil'),
  ('363796ab-80cb-4792-9896-b5e01df52818'::uuid, 'Polícia Civil Delegacia de Polícia', 'Monte Azul Paulista', 'SP', NULL, 'Polícia Civil', 'Delegacia de Polícia', NULL, 'Monte Azul Paulista', 'SP', NULL, 'Polícia Civil'),
  ('b62b873f-c562-4f70-b54e-024cfe3d19bc'::uuid, 'Polícia Civil Delegacia de Polícia Seccional', 'Botucatu', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional', NULL, 'Botucatu', 'SP', NULL, 'Polícia Civil'),
  ('155993e4-fd9e-488b-a5cb-ff9e3ac66ad8'::uuid, 'Polícia Civil Delegacia de Polícia Seccional', 'Bragança Paulista', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional', NULL, 'Bragança Paulista', 'SP', NULL, 'Polícia Civil'),
  ('cb1fbff8-b3d1-45c0-8da0-93d61704e086'::uuid, 'Polícia Civil Delegacia Seccional de Polícia Civil', 'Jales', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional', NULL, 'Jales', 'SP', NULL, 'Polícia Civil'),
  ('bd7fbcdf-0cdb-4a62-934c-17fdbf41f582'::uuid, 'Polícia Civil Delegacia Seccional de Polícia Civil', 'Suzano', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional', NULL, 'Suzano', 'SP', NULL, 'Polícia Civil'),
  ('2b271117-11ab-4ecd-b6d1-17509c106d51'::uuid, 'Polícia Civil Delegacia Seccional de Polícia', 'Piracicaba', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional', NULL, 'Piracicaba', 'SP', NULL, 'Polícia Civil'),
  ('e68b46a5-cd82-4382-8d34-f3fd3df88692'::uuid, 'Polícia Civil Delegacia Seccional de Polícia', 'Taubaté', 'SP', NULL, 'Polícia Civil', 'Delegacia Seccional', NULL, 'Taubaté', 'SP', NULL, 'Polícia Civil'),
  ('d8ee3df5-c037-45b3-a93c-6ee225fd352e'::uuid, 'Polícia Civil Divisão Especializada de Investigações Criminais - DEIC/DEINTER 2', 'Campinas', 'SP', NULL, 'Polícia Civil', 'Divisão Especializada de Investigações Criminais - DEINTER 2', NULL, 'Campinas', 'SP', NULL, 'Polícia Civil'),
  ('431372cc-90cb-4935-a41d-0974ff7d9121'::uuid, 'Polícia Civil Divisão especializada de investigações criminais - DEIC/DEINTER 4', 'Bauru', 'SP', NULL, 'Polícia Civil', 'Divisão especializada de investigações criminais - DEINTER 4', NULL, 'Bauru', 'SP', NULL, 'Polícia Civil'),
  ('bb16b86b-d144-4871-8165-c3f2b08ebe02'::uuid, 'Polícia Civil Divisão Especializada de Investigações Criminais - DEIC/DEINTER 5', 'São José do Rio Preto', 'SP', NULL, 'Polícia Civil', 'Divisão Especializada de Investigações Criminais - DEINTER 5', NULL, 'São José do Rio Preto', 'SP', NULL, 'Polícia Civil'),
  ('9fce6358-1849-4f58-ae0d-77e551591dde'::uuid, 'Polícia Civil Divisão especializada de investigações criminais - DEIC', 'Ribeirão Preto', 'SP', NULL, 'Polícia Civil', 'Divisão especializada de investigações criminais', NULL, 'Ribeirão Preto', 'SP', NULL, 'Polícia Civil'),
  ('6847aa3b-026e-46b0-a145-dd9bdd3f131b'::uuid, 'Polícia Civil Divisão Especializada de Investigações Criminais - DEIC', 'Santos', 'SP', NULL, 'Polícia Civil', 'Divisão Especializada de Investigações Criminais', NULL, 'Santos', 'SP', NULL, 'Polícia Civil'),
  ('b6f09d22-6c1c-4e37-ada0-068f271c6736'::uuid, 'Polícia Civil Divisão Especializada de Investigações Criminais - DEIC', 'São José dos Campos', 'SP', NULL, 'Polícia Civil', 'Divisão Especializada de Investigações Criminais', NULL, 'São José dos Campos', 'SP', NULL, 'Polícia Civil'),
  ('ba3afc16-fad5-4020-a1ca-64abca2d0e8e'::uuid, 'Polícia Civil Divisão Especializada de Investigações Criminais - DEIC', 'São Paulo', 'SP', NULL, 'Polícia Civil', 'Divisão Especializada de Investigações Criminais', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('57440b77-9785-418e-af44-b665e66e761d'::uuid, 'Polícia Civil Divisão Especializada de Investigações Criminais - DEIC', 'Sorocaba', 'SP', NULL, 'Polícia Civil', 'Divisão Especializada de Investigações Criminais', NULL, 'Sorocaba', 'SP', NULL, 'Polícia Civil'),
  ('b6b66425-0787-40a5-b136-feab3e276cef'::uuid, 'Polícia Civil Grupo Armado de Repressão a Roubos/GARRA Várzea da Barra Funda', 'São Paulo', 'SP', NULL, 'Polícia Civil', 'Grupo Armado de Repressão a Roubos/GARRA Várzea da Barra Funda', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('1e63dd7a-0f19-4e23-af68-6636264a06ed'::uuid, 'Polícia Civil Grupo Especial de Reação da Polícia Civil - GER', 'São Paulo', 'SP', NULL, 'Polícia Civil', 'Grupo Especial de Reação da Polícia Civil', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('59fb74c0-92a6-4656-91fc-bb29892603b0'::uuid, 'Polícia Civil Polícia Cientifica', 'São Paulo', 'SP', NULL, NULL, 'Polícia Cientifica', NULL, 'São Paulo', 'SP', NULL, 'Polícia Civil'),
  ('ae8e2570-1644-4944-a471-984274c8fe3e'::uuid, 'Polícia Militar 3º BPM', 'Dourados', 'MS', NULL, 'Polícia Militar', '3º Batalhão de Polícia Militar', '3º BPM', 'Dourados', 'MS', NULL, 'Polícia Militar'),
  ('333b069a-3a72-49b4-bb4d-279542e4cdf8'::uuid, 'Polícia Militar Batalhão de Choque', 'Campo Grande', 'MS', NULL, 'Polícia Militar', 'Batalhão de Choque', NULL, 'Campo Grande', 'MS', NULL, 'Polícia Militar'),
  ('73743e93-e4b6-488f-ab23-91ecb5d7b31f'::uuid, 'Polícia Militar Batalhão de Operações Especiais - BOPE', 'Campo Grande', 'MS', NULL, 'Polícia Militar', 'Batalhão de Operações Especiais', NULL, 'Campo Grande', 'MS', NULL, 'Polícia Militar'),
  ('33418981-dadc-4bd7-b51b-df3704bf0e93'::uuid, 'Polícia Militar Batalhão Rodoviário Estadual', 'Campo Grande', 'MS', NULL, 'Polícia Militar', 'Batalhão Rodoviário Estadual', NULL, 'Campo Grande', 'MS', NULL, 'Polícia Militar'),
  ('c321bf3b-77ff-4891-a9b1-b8a513adce85'::uuid, 'Polícia Militar BPM', 'Água Clara', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Água Clara', 'MS', NULL, 'Polícia Militar'),
  ('4adbf68d-0e3f-4591-91f8-e7a981a0f7f1'::uuid, 'Polícia Militar BPM', 'Anaurilândia', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Anaurilândia', 'MS', NULL, 'Polícia Militar'),
  ('47d32127-d7c1-47e0-8bba-e4703c798109'::uuid, 'Polícia Militar BPM', 'Angélica', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Angélica', 'MS', NULL, 'Polícia Militar'),
  ('ff877944-f6e0-4c99-995b-02515c73e03e'::uuid, 'Polícia Militar BPM', 'Bataguassu', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Bataguassu', 'MS', NULL, 'Polícia Militar'),
  ('570e8d05-acdf-4353-81e1-7101525c47f3'::uuid, 'Polícia Militar BPM', 'Bonito', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Bonito', 'MS', NULL, 'Polícia Militar'),
  ('caef7383-55cb-437c-9143-751918387667'::uuid, 'Polícia Militar BPM', 'Camapuâ', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Camapuâ', 'MS', NULL, 'Polícia Militar'),
  ('1e3e90ad-1abf-4bda-88cb-eae2061f40aa'::uuid, 'Polícia Militar BPM', 'Corumbá', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Corumbá', 'MS', NULL, 'Polícia Militar'),
  ('ed88db66-addb-4333-9c46-abc660b7b150'::uuid, 'Polícia Militar BPM', 'Coxim', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Coxim', 'MS', NULL, 'Polícia Militar'),
  ('9f9cb7da-19b1-4e75-85e9-89ba6aad9f38'::uuid, 'Polícia Militar BPM', 'Eldorado', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Eldorado', 'MS', NULL, 'Polícia Militar'),
  ('3ea5bcd2-9fbb-4dbe-a037-fcc1ddfec761'::uuid, 'Polícia Militar BPM', 'Guia Lopes da Laguna', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Guia Lopes da Laguna', 'MS', NULL, 'Polícia Militar'),
  ('7fd26ccd-d2b1-4373-8801-97878f739318'::uuid, 'Polícia Militar BPM', 'Iguatemi', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Iguatemi', 'MS', NULL, 'Polícia Militar'),
  ('c62afdd1-933e-4267-85a7-db8eaf01b9eb'::uuid, 'Polícia Militar BPM', 'Inocência', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Inocência', 'MS', NULL, 'Polícia Militar'),
  ('feb5bfd9-7f3c-4ece-952a-edd700780c52'::uuid, 'Polícia Militar BPM', 'Itaquirai', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Itaquirai', 'MS', NULL, 'Polícia Militar'),
  ('6de16b8d-dd4c-4304-b375-0a492816a717'::uuid, 'Polícia Militar BPM', 'Ivinhema', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Ivinhema', 'MS', NULL, 'Polícia Militar'),
  ('735f363e-ef46-4be3-b880-f2435d1d9f54'::uuid, 'Polícia Militar BPM', 'Japorã', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Japorã', 'MS', NULL, 'Polícia Militar'),
  ('0ee15bda-170f-491c-8694-b65af153a4c1'::uuid, 'Polícia Militar BPM', 'Jaraguar', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Jaraguar', 'MS', NULL, 'Polícia Militar'),
  ('acdba509-cea1-45da-8772-87f502de4813'::uuid, 'Polícia Militar BPM', 'Jardim', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Jardim', 'MS', NULL, 'Polícia Militar'),
  ('aab4fe81-b35c-44dc-a7e4-b610e6026cf7'::uuid, 'Polícia Militar BPM', 'jatei', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'jatei', 'MS', NULL, 'Polícia Militar'),
  ('fac72241-c5bf-48ea-8801-d3cd20f4ee23'::uuid, 'Polícia Militar BPM', 'Ladário', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Ladário', 'MS', NULL, 'Polícia Militar'),
  ('3ad5cb2c-f52a-4960-b23b-4bc6c36ca338'::uuid, 'Polícia Militar BPM', 'Maracaju', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Maracaju', 'MS', NULL, 'Polícia Militar'),
  ('90bdf4f6-502e-4f86-981a-f7cd6edaef73'::uuid, 'Polícia Militar BPM', 'Miranda', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Miranda', 'MS', NULL, 'Polícia Militar'),
  ('abc7b5a8-a939-4eb3-a575-029eb85128dc'::uuid, 'Polícia Militar BPM', 'Nioaque', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Nioaque', 'MS', NULL, 'Polícia Militar'),
  ('4a280d19-909b-4c46-8ca2-cb43fe5b71c6'::uuid, 'Polícia Militar BPM', 'Nova Alvorada do Sul', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Nova Alvorada do Sul', 'MS', NULL, 'Polícia Militar'),
  ('b6da7f77-0e8c-4d79-8eed-a8bdf7508362'::uuid, 'Polícia Militar BPM', 'Novo Horizonte do Sul', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Novo Horizonte do Sul', 'MS', NULL, 'Polícia Militar'),
  ('09130e18-bd16-4afe-a1e8-3eb72bacefc9'::uuid, 'Polícia Militar BPM', 'Paraíso das Águas', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Paraíso das Águas', 'MS', NULL, 'Polícia Militar'),
  ('9f2ea1b8-1b71-4d09-a098-a0156fbc9c0b'::uuid, 'Polícia Militar BPM', 'Ponta Porã', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Ponta Porã', 'MS', NULL, 'Polícia Militar'),
  ('22aa4a7b-45cb-405c-89f5-bdd669abae9f'::uuid, 'Polícia Militar BPM', 'Porto Murtinho', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Porto Murtinho', 'MS', NULL, 'Polícia Militar'),
  ('f5f8baeb-fbc8-4bee-8d99-e52b4bc20caa'::uuid, 'Polícia Militar BPM', 'Rio Brilhante', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Rio Brilhante', 'MS', NULL, 'Polícia Militar'),
  ('342ee3ec-7611-4101-9f54-5e95c553f4df'::uuid, 'Polícia Militar BPM', 'Rio Negro', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Rio Negro', 'MS', NULL, 'Polícia Militar'),
  ('672c2501-39ab-4373-afde-8f948398e4c1'::uuid, 'Polícia Militar BPM', 'Santa Rita do Pardo', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Santa Rita do Pardo', 'MS', NULL, 'Polícia Militar'),
  ('5a15030c-4acc-49b2-9899-1073d4aa4cba'::uuid, 'Polícia Militar BPM', 'Taguarussu', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Taguarussu', 'MS', NULL, 'Polícia Militar'),
  ('02a01914-827d-4bf9-8802-c8432fb15358'::uuid, 'Polícia Militar BPM', 'Terenos', 'MS', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Terenos', 'MS', NULL, 'Polícia Militar'),
  ('3cf93ed1-0b4b-4e36-b768-f023a52cc9d1'::uuid, 'Polícia Militar CGPA (Grupamento Aéreo)', 'Campo Grande', 'MS', NULL, 'Polícia Militar', 'CGPA (Grupamento Aéreo)', NULL, 'Campo Grande', 'MS', NULL, 'Polícia Militar'),
  ('5cd08613-9265-455a-8ece-64a4bfb9e08a'::uuid, 'Polícia Militar DGPL (Armamento e Tiro)', 'Campo Grande', 'MS', NULL, 'Polícia Militar', 'DGPL (Armamento e Tiro)', NULL, 'Campo Grande', 'MS', NULL, 'Polícia Militar'),
  ('23736901-86a9-4a5d-b783-02c8435770b3'::uuid, 'Polícia Militar Patrulha Ambiental', 'Campo Grande', 'MS', NULL, 'Polícia Militar', 'Patrulha Ambiental', NULL, 'Campo Grande', 'MS', NULL, 'Polícia Militar'),
  ('33ac98e1-f3b3-4d2f-9601-94fb5af4bb7e'::uuid, 'Polícia Militar Patrulha Rural', 'Campo Grande', 'MS', NULL, 'Polícia Militar', 'Patrulha Rural', NULL, 'Campo Grande', 'MS', NULL, 'Polícia Militar'),
  ('4811f2ac-ca28-4b09-951a-7dc6363c4911'::uuid, 'Polícia Militar 20° BPM', 'Mesquita', 'RJ', NULL, 'Polícia Militar', '20º Batalhão de Polícia Militar', '20º BPM', 'Mesquita', 'RJ', NULL, 'Polícia Militar'),
  ('1cc358d1-2555-4c95-bbd8-9d66d4ff9ce2'::uuid, 'Polícia Militar 20° BPM', 'Nova Iguaçu', 'RJ', NULL, 'Polícia Militar', '20º Batalhão de Polícia Militar', '20º BPM', 'Nova Iguaçu', 'RJ', NULL, 'Polícia Militar'),
  ('7a6d2a56-0737-4027-ab42-e36166b6573e'::uuid, 'Polícia Militar 24° BPM', 'Japeri', 'RJ', NULL, 'Polícia Militar', '24º Batalhão de Polícia Militar', '24º BPM', 'Japeri', 'RJ', NULL, 'Polícia Militar'),
  ('ceef3e75-7ac7-4986-bcf0-1585bff245d6'::uuid, 'Polícia Militar 24° BPM', 'Paracambi', 'RJ', NULL, 'Polícia Militar', '24º Batalhão de Polícia Militar', '24º BPM', 'Paracambi', 'RJ', NULL, 'Polícia Militar'),
  ('0e7e9a2d-19e4-490f-a745-1083c38a09c9'::uuid, 'Polícia Militar 24° BPM', 'Queimados', 'RJ', NULL, 'Polícia Militar', '24º Batalhão de Polícia Militar', '24º BPM', 'Queimados', 'RJ', NULL, 'Polícia Militar'),
  ('d23ae51e-e44c-42a4-ae8b-0b2b590ad5be'::uuid, 'Polícia Militar 11º Batalhão da Polícia Militar do Interior', 'Jundiai', 'SP', NULL, 'Polícia Militar', '11º Batalhão de Polícia Militar do Interior', '11º BPM/I', 'Jundiai', 'SP', NULL, 'Polícia Militar'),
  ('fd526641-1488-46a5-ac24-b358233996fe'::uuid, 'Polícia Militar 12º Batalhão de Ações Especiais de Polícia - BAEP', 'Araçatuba', 'SP', NULL, 'Polícia Militar', '12º Batalhão de Ações Especiais de Polícia', NULL, 'Araçatuba', 'SP', NULL, 'Polícia Militar'),
  ('9ea3282a-15f8-4afb-bee3-97369b1fade1'::uuid, 'Polícia Militar 12º Batalhão da Polícia Militar', 'Botucatu', 'SP', NULL, 'Polícia Militar', '12º Batalhão de Polícia Militar', '12º BPM', 'Botucatu', 'SP', NULL, 'Polícia Militar'),
  ('0d64cfd8-d0fc-4927-bf97-63118c3f518a'::uuid, 'Polícia Militar 16º Batalhão da Polícia Militar do Interior - 2ª CIA', 'Jales', 'SP', NULL, 'Polícia Militar', '16º Batalhão de Polícia Militar do Interior - 2ª Companhia', '16º BPM/I - 2ª Cia', 'Jales', 'SP', NULL, 'Polícia Militar'),
  ('686acd28-7a75-4b0f-9f98-f880bd5f4159'::uuid, 'Polícia Militar 16º Batalhão da Polícia Militar do Interior - 4ª CIA PM/CPI-5', 'Santa Fé do Sul', 'SP', NULL, 'Polícia Militar', '16º Batalhão de Polícia Militar do Interior - 4ª Companhia PM/Comando de Policiamento do Interior 5', NULL, 'Santa Fé do Sul', 'SP', NULL, 'Polícia Militar'),
  ('4626e368-0211-4e68-9791-e6ef2d4aa0f8'::uuid, 'Polícia Militar 16º Batalhão da Polícia Militar do Interior - CPI - 5', 'Votuporanga', 'SP', NULL, 'Polícia Militar', '16º Batalhão de Polícia Militar do Interior - CPI - 5', '16º BPM/I - CPI - 5', 'Votuporanga', 'SP', NULL, 'Polícia Militar'),
  ('0c65b4cd-9e30-4742-9469-8dba66846296'::uuid, 'Polícia Militar 18° Batalhão da Polícia Militar do Interior - CPI-8', 'Santo Expedito', 'SP', NULL, 'Polícia Militar', '18º Batalhão de Polícia Militar do Interior - Comando de Policiamento do Interior 8', '18º BPM/I - CPI-8', 'Santo Expedito', 'SP', NULL, 'Polícia Militar'),
  ('00ec51e1-2773-4d57-9921-ed80fb8671c3'::uuid, 'Polícia Militar 18º Batalhão da Polícia Militar do Interior', 'Emilianópolis', 'SP', NULL, 'Polícia Militar', '18º Batalhão de Polícia Militar do Interior', '18º BPM/I', 'Emilianópolis', 'SP', NULL, 'Polícia Militar'),
  ('822e4730-e43f-493b-a9e5-c1f41cea6f3d'::uuid, 'Polícia Militar 18º Batalhão da Polícia Militar Metropolitano', 'São Paulo', 'SP', NULL, 'Polícia Militar', '18º Batalhão de Polícia Militar Metropolitano', '18º BPM/M', 'São Paulo', 'SP', NULL, 'Polícia Militar'),
  ('29b95895-ff99-4c76-af39-c1a2277e4036'::uuid, 'Polícia Militar 19º Batalhão de Polícia Militar da Capital', 'São Paulo', 'SP', NULL, 'Polícia Militar', '19º Batalhão de Polícia Militar da Capital', NULL, 'São Paulo', 'SP', NULL, 'Polícia Militar'),
  ('7d5eb230-da0c-4c50-8b7b-b1a98a0e2f8a'::uuid, 'Polícia Militar 1ª Companhia da Polícia Militar', 'Mongaguá', 'SP', NULL, 'Polícia Militar', '1ª Companhia da Polícia Militar', NULL, 'Mongaguá', 'SP', NULL, 'Polícia Militar'),
  ('8d29bbf4-f23c-412b-8d78-fc27a543e4ad'::uuid, 'Polícia Militar 1º Grupamento Policial – 42º BPM/I', 'Piquerobi', 'SP', NULL, 'Polícia Militar', '1º Grupamento Policial - 42º Batalhão de Polícia Militar do Interior', NULL, 'Piquerobi', 'SP', NULL, 'Polícia Militar'),
  ('52655319-ea52-43b6-a421-e0919fd29115'::uuid, 'Polícia Militar 20º Batalhão da Polícia Militar - 3ª Companhia', 'Ubatuba', 'SP', NULL, 'Polícia Militar', '20º Batalhão de Polícia Militar - 3ª Companhia', '20º BPM - 3ª Cia', 'Ubatuba', 'SP', NULL, 'Polícia Militar'),
  ('2dc0dfc5-94b5-4706-9dd9-ee920f5620c3'::uuid, 'Polícia Militar 20º Batalhão da Polícia Militar', 'Caraguatatuba', 'SP', NULL, 'Polícia Militar', '20º Batalhão de Polícia Militar', '20º BPM', 'Caraguatatuba', 'SP', NULL, 'Polícia Militar'),
  ('1ab26545-66e4-482b-ab04-0cd71acf07e3'::uuid, 'Polícia Militar 24º Batalhão da Polícia Militar - CPA/M-6', 'Diadema', 'SP', NULL, 'Polícia Militar', '24º Batalhão de Polícia Militar - CPA/M - 6', '24º BPM - CPA/M-6', 'Diadema', 'SP', NULL, 'Polícia Militar'),
  ('555b1c54-70bf-4089-8b19-85c482270e13'::uuid, 'Polícia Militar 24º Batalhão de Polícia Militar', 'Diadema', 'SP', NULL, 'Polícia Militar', '24º Batalhão de Polícia Militar', '24º BPM', 'Diadema', 'SP', NULL, 'Polícia Militar'),
  ('0b955706-f86f-4a3c-97fd-2e6cc1c03b14'::uuid, 'Polícia Militar 24º Batalhão da Polícia Militar do Interior - 3ª Companhia', 'Mococa', 'SP', NULL, 'Polícia Militar', '24º Batalhão de Polícia Militar do Interior - 3ª Companhia', '24º BPM/I - 3ª Cia', 'Mococa', 'SP', NULL, 'Polícia Militar'),
  ('6e0db681-a155-414f-beb4-4a5cfe70d183'::uuid, 'Polícia Militar 24º Batalhão da Polícia Militar Metropolitano', 'Diadema', 'SP', NULL, 'Polícia Militar', '24º Batalhão de Polícia Militar Metropolitano', '24º BPM/M', 'Diadema', 'SP', NULL, 'Polícia Militar'),
  ('dae33e09-b9cb-467a-96f2-25dfa17798df'::uuid, 'Polícia Militar 25º Batalhão da PM Pelotão Panorama', 'Panorama', 'SP', NULL, 'Polícia Militar', '25º Batalhão de Polícia Militar Pelotão Panorama', NULL, 'Panorama', 'SP', NULL, 'Polícia Militar'),
  ('a7c0ac95-8626-4726-8e50-d71591e7e8bd'::uuid, 'Polícia Militar 25º Batalhão da Polícia Militar - CPI 8/ 3ª CIA - 2º GP', 'Salmourão', 'SP', NULL, 'Polícia Militar', '25º Batalhão de Polícia Militar - CPI 8/3ª Companhia - 2º GP', NULL, 'Salmourão', 'SP', NULL, 'Polícia Militar'),
  ('52d4ddbb-3b10-40c4-89f1-1be7fdc4c580'::uuid, 'Polícia Militar 25º Batalhão da Polícia Militar/M - CPA/M-8', 'Itapecerica da Serra', 'SP', NULL, 'Polícia Militar', '25º Batalhão de Polícia Militar Metropolitano - CPA/M - 8', '25º BPM/M - CPA/M-8', 'Itapecerica da Serra', 'SP', NULL, 'Polícia Militar'),
  ('8e405394-0301-4569-bd20-7d54c3304ddb'::uuid, 'Polícia Militar 25º Batalhão de Polícia Militar Metropolitano 8 - 1º CIA', 'Itapecerica da Serra', 'SP', NULL, 'Polícia Militar', '25º Batalhão de Polícia Militar Metropolitano 8 - 1º Companhia', '25º BPM/M 8 - 1º Cia', 'Itapecerica da Serra', 'SP', NULL, 'Polícia Militar'),
  ('ab6c138b-ebe3-439d-9278-2b3fd01fc778'::uuid, 'Polícia Militar 26º Batalhão da Polícia Militar - CPA/M-7', 'Francisco Morato', 'SP', NULL, 'Polícia Militar', '26º Batalhão de Polícia Militar - CPA/M - 7', '26º BPM - CPA/M-7', 'Francisco Morato', 'SP', NULL, 'Polícia Militar'),
  ('480d99af-1772-4a98-9fb3-6584b6608f48'::uuid, 'Polícia Militar 26º Batalhão da Polícia Militar do Interior', 'Franco da Rocha', 'SP', NULL, 'Polícia Militar', '26º Batalhão de Polícia Militar do Interior', '26º BPM/I', 'Franco da Rocha', 'SP', NULL, 'Polícia Militar'),
  ('a2500632-7029-4cc5-a06c-483ded586b8f'::uuid, 'Polícia Militar 26º Batalhão da Polícia Militar', 'Jaguariúna', 'SP', NULL, 'Polícia Militar', '26º Batalhão de Polícia Militar', '26º BPM', 'Jaguariúna', 'SP', NULL, 'Polícia Militar'),
  ('19195a96-208b-420a-9406-2fc07ff98dfa'::uuid, 'Polícia Militar 28 º Batalhão da Polícia Militar', 'São Paulo', 'SP', NULL, 'Polícia Militar', '28º Batalhão de Polícia Militar', '28º BPM', 'São Paulo', 'SP', NULL, 'Polícia Militar'),
  ('6c582b94-9e12-47e8-b8fc-b1c1ac7ab6e3'::uuid, 'Polícia Militar 2º Batalhão de Ações Especiais de Polícia - 2º BAEP', 'Santos', 'SP', NULL, 'Polícia Militar', '2º BAEP', NULL, 'Santos', 'SP', NULL, 'Polícia Militar'),
  ('0215e9ec-5ccc-49b3-82af-2020ea6adce7'::uuid, 'Polícia Militar 3º Batalhão da Polícia Militar do Interior', 'Cajuru', 'SP', NULL, 'Polícia Militar', '3º Batalhão de Polícia Militar do Interior', '3º BPM/I', 'Cajuru', 'SP', NULL, 'Polícia Militar'),
  ('2970ba3c-0a44-4fbe-93fb-e3e9f23374cd'::uuid, 'Polícia Militar 2º Batalhão de Polícia Ambiental - 3a Cia', 'Presidente Prudente', 'SP', NULL, 'Polícia Militar', '2º Batalhão de Polícia Ambiental - 3a Companhia', NULL, 'Presidente Prudente', 'SP', NULL, 'Polícia Militar'),
  ('8a01f3f0-b95d-407f-8df1-084fc4d2d045'::uuid, 'Polícia Militar 2º Grupamento Policial da 2ª CIA – 30º BPM/I', 'Santo Antônio da Alegria', 'SP', NULL, 'Polícia Militar', '2º Grupamento Policial da 2ª Companhia - 30º Batalhão de Polícia Militar do Interior', NULL, 'Santo Antônio da Alegria', 'SP', NULL, 'Polícia Militar'),
  ('eeb945af-3858-4806-8698-fdffef244192'::uuid, 'Polícia Militar 2° Pelotão de Polícia Militar Ambiental', 'Botucatu', 'SP', NULL, 'Polícia Militar', '2º Pelotão de Polícia Militar Ambiental', NULL, 'Botucatu', 'SP', NULL, 'Polícia Militar'),
  ('933f38ea-2a83-437a-bc2f-f384e242e397'::uuid, 'Polícia Militar 30° Batalhão de Polícia Militar do Interior', 'Catanduva', 'SP', NULL, 'Polícia Militar', '30º Batalhão de Polícia Militar do Interior', '30º BPM/I', 'Catanduva', 'SP', NULL, 'Polícia Militar'),
  ('293c8162-f468-44a7-8f61-d99b3e66a7f2'::uuid, 'Polícia Militar 32° Batalhão da Polícia Militar - 1ª Companhia da PM', 'Suzano', 'SP', NULL, 'Polícia Militar', '32º Batalhão de Polícia Militar - 1ª Companhia da PM', '32º BPM - 1ª Cia da PM', 'Suzano', 'SP', NULL, 'Polícia Militar'),
  ('2c8226ad-4c0e-4239-a6f5-ccad6972d6ba'::uuid, 'Polícia Militar 32º Batalhão da Polícia Militar do Interior', 'Paraguaçu Paulista', 'SP', NULL, 'Polícia Militar', '32º Batalhão de Polícia Militar do Interior', '32º BPM/I', 'Paraguaçu Paulista', 'SP', NULL, 'Polícia Militar'),
  ('1ec5220e-fe25-4f71-bf70-b31e3bc1190f'::uuid, 'Polícia Militar 33º Batalhão de Polícia Militar do Interior - 3ª Companhia', 'Bebedouro', 'SP', NULL, 'Polícia Militar', '33º Batalhão de Polícia Militar do Interior - 3ª Companhia', '33º BPM/I - 3ª Cia', 'Bebedouro', 'SP', NULL, 'Polícia Militar'),
  ('2fdaba4c-accf-4bb2-8be0-edfb97f85390'::uuid, 'Polícia Militar 34º Batalhão da PM do interior Cidade de Bragança Paulista (Monte Alegre do Sul)', NULL, 'SP', NULL, 'Polícia Militar', '34º Batalhão de Polícia Militar do interior Cidade de Bragança Paulista (Monte Alegre do Sul)', NULL, NULL, 'SP', NULL, 'Polícia Militar'),
  ('2b83e670-894b-40c9-9808-04a758062955'::uuid, 'Polícia Militar 34º Batalhão da Polícia Militar do Interior', 'Atibaia', 'SP', NULL, 'Polícia Militar', '34º Batalhão de Polícia Militar do Interior', '34º BPM/I', 'Atibaia', 'SP', NULL, 'Polícia Militar'),
  ('2e381b32-90be-4155-9131-e314af0295a2'::uuid, 'Polícia Militar 36º Batalhão da Polícia Militar do Interior - Unidade da Polícia Militar – Sede Limeira', 'Pirassununga', 'SP', NULL, 'Polícia Militar', '36º Batalhão de Polícia Militar do Interior - Sede Limeira', NULL, 'Pirassununga', 'SP', NULL, 'Polícia Militar'),
  ('be9bb7c4-b277-49db-a581-41af306bcd1e'::uuid, 'Polícia Militar 39º Batalhão da Polícia Militar do Interior - 39º BPM/I', 'São Vicente', 'SP', NULL, 'Polícia Militar', '39º Batalhão de Polícia Militar do Interior', '39º BPM/I', 'São Vicente', 'SP', NULL, 'Polícia Militar'),
  ('bc883056-f20b-44f6-8e3f-a8b7bbffb6ba'::uuid, 'Polícia Militar 3ª Companhia de Polícia Militar', 'Salto', 'SP', NULL, 'Polícia Militar', '3ª Companhia de Polícia Militar', NULL, 'Salto', 'SP', NULL, 'Polícia Militar'),
  ('c4304bd9-e2f7-4ca0-b90c-86ddb3df56da'::uuid, 'Polícia Militar 3º Batalhão de Polícia Militar da Capital', 'São Paulo', 'SP', NULL, 'Polícia Militar', '3º Batalhão de Polícia Militar da Capital', NULL, 'São Paulo', 'SP', NULL, 'Polícia Militar'),
  ('685aae8b-8344-440a-848b-1bfb3091151f'::uuid, 'Polícia Militar 3º Batalhão da Polícia Militar do Interior', 'Jardinópolis', 'SP', NULL, 'Polícia Militar', '3º Batalhão de Polícia Militar do Interior', '3º BPM/I', 'Jardinópolis', 'SP', NULL, 'Polícia Militar'),
  ('95dadaa8-aa57-4f71-985e-61afebfd06df'::uuid, 'Polícia Militar 3º Batalhão da Polícia Militar do Interior', 'Santo Antônio da Alegria', 'SP', NULL, 'Polícia Militar', '3º Batalhão de Polícia Militar do Interior', '3º BPM/I', 'Santo Antônio da Alegria', 'SP', NULL, 'Polícia Militar'),
  ('6e7619c3-78b8-40a5-b514-dc410c719768'::uuid, 'Polícia Militar 3° Batalhão da Polícia Militar', 'Mairinque', 'SP', NULL, 'Polícia Militar', '3º Batalhão de Polícia Militar', '3º BPM', 'Mairinque', 'SP', NULL, 'Polícia Militar'),
  ('fc87dd2f-a8d8-4ba8-bc9b-94d716573a3a'::uuid, 'Polícia Militar 3º Batalhão da Polícia Militar', 'São Paulo', 'SP', NULL, 'Polícia Militar', '3º Batalhão de Polícia Militar', '3º BPM', 'São Paulo', 'SP', NULL, 'Polícia Militar'),
  ('38062e5e-558f-4aa7-b979-0e8d2e22a865'::uuid, 'Polícia Militar 40º Batalhão da Polícia Militar do Interior - 3ª CIA', 'Salto de Pirapora', 'SP', NULL, 'Polícia Militar', '40º Batalhão de Polícia Militar do Interior - 3ª Companhia', '40º BPM/I - 3ª Cia', 'Salto de Pirapora', 'SP', NULL, 'Polícia Militar'),
  ('e05b4473-d13a-4975-b80b-8fe10d31a6d5'::uuid, 'Polícia Militar 41º Batalhão de Polícia Militar do Interior', 'Jacareí', 'SP', NULL, 'Polícia Militar', '41º Batalhão de Polícia Militar do Interior', '41º BPM/I', 'Jacareí', 'SP', NULL, 'Polícia Militar'),
  ('1d25e34e-c0fe-4004-b9f6-cff124d00fb7'::uuid, 'Polícia Militar 43º Batalhão da Polícia Militar do Interior - 2º Pelotão', 'Guariba', 'SP', NULL, 'Polícia Militar', '43º Batalhão de Polícia Militar do Interior - 2º Pelotão', NULL, 'Guariba', 'SP', NULL, 'Polícia Militar'),
  ('5c1aa762-89dc-4219-9936-8c51dadde7cf'::uuid, 'Polícia Militar 43º Batalhão da Polícia Militar do Interior', 'Monte Alto', 'SP', NULL, 'Polícia Militar', '43º Batalhão de Polícia Militar do Interior', '43º BPM/I', 'Monte Alto', 'SP', NULL, 'Polícia Militar'),
  ('a35001d7-9889-4330-b0ca-9d158bfc313a'::uuid, 'Polícia Militar 43º Batalhão da Polícia Militar do Interior', 'Pitangueiras', 'SP', NULL, 'Polícia Militar', '43º Batalhão de Polícia Militar do Interior', '43º BPM/I', 'Pitangueiras', 'SP', NULL, 'Polícia Militar'),
  ('88e49971-0952-4850-a13d-c868084b836b'::uuid, 'Polícia Militar 43º Batalhão da Polícia Militar do Interior', 'Pontal', 'SP', NULL, 'Polícia Militar', '43º Batalhão de Polícia Militar do Interior', '43º BPM/I', 'Pontal', 'SP', NULL, 'Polícia Militar'),
  ('607237d9-5fba-4861-805c-051b8718fa04'::uuid, 'Polícia Militar 43º Batalhão da Polícia Militar Metropolitano', 'São Paulo', 'SP', NULL, 'Polícia Militar', '43º Batalhão de Polícia Militar Metropolitano', '43º BPM/M', 'São Paulo', 'SP', NULL, 'Polícia Militar'),
  ('4ba41233-21de-4dac-a160-80645ee05ea0'::uuid, 'Polícia Militar 49º Batalhão da Polícia Militar do Interior - 2ª Companhia', 'Itatiba', 'SP', NULL, 'Polícia Militar', '49º Batalhão de Polícia Militar do Interior - 2ª Companhia', '49º BPM/I - 2ª Cia', 'Itatiba', 'SP', NULL, 'Polícia Militar'),
  ('ad8762a1-d11f-4dbb-a43a-c59ce4fad018'::uuid, 'Polícia Militar 49º Batalhão da Polícia Militar do Interior', 'Jundiai', 'SP', NULL, 'Polícia Militar', '49º Batalhão de Polícia Militar do Interior', '49º BPM/I', 'Jundiai', 'SP', NULL, 'Polícia Militar'),
  ('1bc149b3-cce9-4273-8245-e8359434b466'::uuid, 'Polícia Militar 49º Batalhão da Polícia Militar do Interior', 'Várzea Paulista', 'SP', NULL, 'Polícia Militar', '49º Batalhão de Polícia Militar do Interior', '49º BPM/I', 'Várzea Paulista', 'SP', NULL, 'Polícia Militar'),
  ('c485a744-71ba-4ed6-b9dd-1d07b9cb7535'::uuid, 'Polícia Militar 4° Batalhão de Polícia Militar Ambiental', 'São José do Rio Preto', 'SP', NULL, 'Polícia Militar', '4º Batalhão de Polícia Militar Ambiental', NULL, 'São José do Rio Preto', 'SP', NULL, 'Polícia Militar'),
  ('0068a2d3-203f-4323-95d9-3b7cebf3128e'::uuid, 'Polícia Militar 4º Batalhão da Polícia Militar - CPI-4', 'Agudos', 'SP', NULL, 'Polícia Militar', '4º Batalhão de Polícia Militar - Comando de Policiamento do Interior 4', '4º BPM - CPI-4', 'Agudos', 'SP', NULL, 'Polícia Militar'),
  ('b1d4bfa2-3293-479c-afe2-b2cdae20e6a9'::uuid, 'Polícia Militar 50º Batalhão de Polícia Militar do Interior', 'Itu', 'SP', NULL, 'Polícia Militar', '50º Batalhão de Polícia Militar do Interior', '50º BPM/I', 'Itu', 'SP', NULL, 'Polícia Militar'),
  ('946bc503-7984-4fd0-b5ee-4bc63bf634df'::uuid, 'Polícia Militar 51º Batalhão da Polícia Militar do Interior', 'Ribeirão Preto', 'SP', NULL, 'Polícia Militar', '51º Batalhão de Polícia Militar do Interior', '51º BPM/I', 'Ribeirão Preto', 'SP', NULL, 'Polícia Militar'),
  ('8f8dadbb-6869-4334-a402-4857a7d9b1fe'::uuid, 'Polícia Militar 52º Batalhão da Polícia Militar do Interior', 'José Bonifácio', 'SP', NULL, 'Polícia Militar', '52º Batalhão de Polícia Militar do Interior', '52º BPM/I', 'José Bonifácio', 'SP', NULL, 'Polícia Militar'),
  ('13fbe44d-3f0d-486c-84fe-05a3730bbfc5'::uuid, 'Polícia Militar 54º Batalhão da Polícia Militar do Interior - 2ª CIA', 'Capão Bonito', 'SP', NULL, 'Polícia Militar', '54º Batalhão de Polícia Militar do Interior - 2ª Companhia', '54º BPM/I - 2ª Cia', 'Capão Bonito', 'SP', NULL, 'Polícia Militar'),
  ('2cddd09e-f287-4c9b-b374-a3c248ef6b82'::uuid, 'Polícia Militar 5ª Companhia de Polícia Independente', 'São José do Rio Preto', 'SP', NULL, 'Polícia Militar', '5ª Companhia de Polícia Independente', NULL, 'São José do Rio Preto', 'SP', NULL, 'Polícia Militar'),
  ('99bade29-1bee-448f-b823-2e588b43b10c'::uuid, 'Polícia Militar 5º Batalhão da Polícia Ambiental - 2ª CIA/ 1º Pelotão', 'Pirassununga', 'SP', NULL, 'Polícia Militar', '5º Batalhão da Polícia Ambiental - 2ª Companhia/1º Pelotão', NULL, 'Pirassununga', 'SP', NULL, 'Polícia Militar'),
  ('77e45cb0-5e50-475e-a7ef-56be97a4b08f'::uuid, 'Polícia Militar 5° Batalhão Polícia Militar do Interior - General Salgado', 'Taubaté', 'SP', NULL, 'Polícia Militar', '5º Batalhão de Polícia Militar do Interior - General Salgado', NULL, 'Taubaté', 'SP', NULL, 'Polícia Militar'),
  ('225a8b43-e8c8-4e8e-ad93-0e159b24c918'::uuid, 'Polícia Militar 5º Batalhão da Polícia Militar do Interior', 'Pindamonhangaba', 'SP', NULL, 'Polícia Militar', '5º Batalhão de Polícia Militar do Interior', '5º BPM/I', 'Pindamonhangaba', 'SP', NULL, 'Polícia Militar'),
  ('a89b91b2-f299-4801-b570-452bb1c6fdcb'::uuid, 'Polícia Militar 5º Batalhão da Polícia Militar', 'Lençóis Paulista', 'SP', NULL, 'Polícia Militar', '5º Batalhão de Polícia Militar', '5º BPM', 'Lençóis Paulista', 'SP', NULL, 'Polícia Militar'),
  ('7e872cd3-e743-4177-8739-dd8c27f66431'::uuid, 'Polícia Militar 5º Batalhão da Polícia Militar Metropolitano', 'São Paulo', 'SP', NULL, 'Polícia Militar', '5º Batalhão de Polícia Militar Metropolitano', '5º BPM/M', 'São Paulo', 'SP', NULL, 'Polícia Militar'),
  ('b2e67349-19b2-467a-b4d9-0bf1d42bd2b3'::uuid, 'Polícia Militar 5° Batalhão da Polícia Militar', 'Tremembé', 'SP', NULL, 'Polícia Militar', '5º Batalhão de Polícia Militar', '5º BPM', 'Tremembé', 'SP', NULL, 'Polícia Militar'),
  ('a20f78ce-1998-4643-99ea-3c156c56403d'::uuid, 'Polícia Militar 5º Grupamento Policial da 2ª CIA – 30º BPM/I', 'Urupês', 'SP', NULL, 'Polícia Militar', '5º Grupamento Policial da 2ª Companhia - 30º Batalhão de Polícia Militar do Interior', NULL, 'Urupês', 'SP', NULL, 'Polícia Militar'),
  ('759043a6-489a-4f46-bc34-0b932e837a5f'::uuid, 'Polícia Militar 7º Batalhão da Polícia Militar do Interior - 3ª Companhia', 'Valentin Gentil', 'SP', NULL, 'Polícia Militar', '7º Batalhão de Polícia Militar do Interior - 3ª Companhia', '7º BPM/I - 3ª Cia', 'Valentin Gentil', 'SP', NULL, 'Polícia Militar'),
  ('1f1bf9c0-0c4c-4e5e-846e-1c5f94d6cb41'::uuid, 'Polícia Militar 9º Batalhão da Polícia Militar do Interior - 2ª CIA/PM - Tupã', 'Tupã', 'SP', NULL, 'Polícia Militar', '9º Batalhão de Polícia Militar do Interior - 2ª Companhia/PM', '9º BPM/I - 2ª Cia/PM', 'Tupã', 'SP', NULL, 'Polícia Militar'),
  ('147c3b4c-ea10-4497-902d-518bad942617'::uuid, 'Polícia Militar 9º Batalhão da Polícia Militar do Interior - 2º Grupamento/PM', 'Arco-íris', 'SP', NULL, 'Polícia Militar', '9º Batalhão de Polícia Militar do Interior - 2º Grupamento/PM', NULL, 'Arco-íris', 'SP', NULL, 'Polícia Militar'),
  ('543cddd5-1b2f-42ea-bf45-e914c6cc13f6'::uuid, 'Polícia Militar 9º Batalhão da Polícia Militar do Interior - 3º Grupamento/PM', 'Queiroz', 'SP', NULL, 'Polícia Militar', '9º Batalhão de Polícia Militar do Interior - 3º Grupamento/PM', NULL, 'Queiroz', 'SP', NULL, 'Polícia Militar'),
  ('9bb8158f-617c-4b31-b1e8-d9659e1a031c'::uuid, 'Polícia Militar 9º Batalhão da Polícia Militar do Interior - 6º Grupamento/PM (Cidade de Herculândia/SP)', NULL, 'SP', NULL, 'Polícia Militar', '9º Batalhão de Polícia Militar do Interior - 6º Grupamento/PM (Cidade/SP)', NULL, 'Herculândia', 'SP', NULL, 'Polícia Militar'),
  ('06c6035d-c4cb-499a-9f89-8bdc0d7c6342'::uuid, 'Polícia Militar 9º Batalhão da Polícia Militar Metropolitano', 'São Paulo', 'SP', NULL, 'Polícia Militar', '9º Batalhão de Polícia Militar Metropolitano', '9º BPM/M', 'São Paulo', 'SP', NULL, 'Polícia Militar'),
  ('54ad044b-440e-426b-b66e-7d09a5d83f70'::uuid, 'Polícia Militar Batalhão de Polícia Militar', 'Santo André', 'SP', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'Santo André', 'SP', NULL, 'Polícia Militar'),
  ('4834ae12-d5d6-4ec1-ad61-8b72f6a07798'::uuid, 'Polícia Militar Batalhão de Polícia Militar', 'São Bernardo', 'SP', NULL, 'Polícia Militar', 'Batalhão de Polícia Militar', 'BPM', 'São Bernardo', 'SP', NULL, 'Polícia Militar'),
  ('1d07b26b-846c-4014-816e-b79c1d08e721'::uuid, 'Polícia Militar Comando de Policiamento do Interior 3ª CPI', 'Ribeirão Preto', 'SP', NULL, 'Polícia Militar', 'Comando de Policiamento do Interior 3', NULL, 'Ribeirão Preto', 'SP', NULL, 'Polícia Militar'),
  ('d41043e2-700f-4f15-9c67-6812728992d3'::uuid, 'Polícia Militar CPI – 5 – 30º BPM/I – 4º GP/PM', 'Tabapuã', 'SP', NULL, 'Polícia Militar', 'CPI - 5 - 30º Batalhão de Polícia Militar do Interior - 4º GP/PM', NULL, 'Tabapuã', 'SP', NULL, 'Polícia Militar'),
  ('924cf8f2-3437-4989-b6a3-1851d83f1b6b'::uuid, 'Polícia Militar CPI-6 21º Batalhão de Polícia Militar', 'Guarujá', 'SP', NULL, 'Polícia Militar', 'Comando de Policiamento do Interior 6 - 21º Batalhão de Polícia Militar', 'CPI-6 21º BPM', 'Guarujá', 'SP', NULL, 'Polícia Militar'),
  ('2458e36d-bd66-4c74-af96-0b40ea7148c3'::uuid, 'Polícia Militar Pelotão da 5ª CIA – 2º Batalhão da Polícia Militar do Interior', 'Valparaíso', 'SP', NULL, 'Polícia Militar', 'Pelotão da 5ª Companhia - 2º Batalhão de Polícia Militar do Interior', NULL, 'Valparaíso', 'SP', NULL, 'Polícia Militar')
  ) v(id, antes, municipio_antes, uf_antes, bairro_antes, orgao_antes, nome, sigla, municipio, uf, bairro, orgao)
  JOIN public.emenda_beneficiarios b
    ON b.id = v.id AND b.nome = v.antes
   AND b.entrega_municipio IS NOT DISTINCT FROM v.municipio_antes
   AND b.entrega_uf IS NOT DISTINCT FROM v.uf_antes
   AND b.entrega_bairro IS NOT DISTINCT FROM v.bairro_antes
   AND b.orgao IS NOT DISTINCT FROM v.orgao_antes;

UPDATE public.emenda_beneficiarios b SET nome = '~168 ' || b.id::text FROM renomear_168 r WHERE b.id = r.id;

UPDATE public.emenda_beneficiarios b SET
  nome = r.nome,
  sigla = COALESCE(b.sigla, r.sigla),
  entrega_municipio = r.municipio,
  entrega_uf = r.uf,
  entrega_bairro = COALESCE(b.entrega_bairro, r.bairro),
  orgao = COALESCE(b.orgao, r.orgao),
  outros_nomes = CASE WHEN r.antes = r.nome OR r.antes = ANY(b.outros_nomes) THEN b.outros_nomes ELSE array_append(b.outros_nomes, r.antes) END,
  versao = b.versao + 1, atualizado_por = NULL, atualizado_por_nome = 'Padronização dos nomes (migration 168)', atualizado_em = NOW()
  FROM renomear_168 r
 WHERE b.id = r.id;

DO $$
DECLARE v_sobra INTEGER;
BEGIN
  SELECT count(*) INTO v_sobra FROM public.emenda_beneficiarios WHERE nome LIKE '~168 %';
  IF v_sobra > 0 THEN
    RAISE EXCEPTION 'Migration 168: % cadastros ficaram com o nome provisório.', v_sobra;
  END IF;
END $$;

DROP TABLE juncoes_168;
DROP TABLE renomear_168;

-- 3) RPCs com a sigla -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salvar_beneficiario_emenda(p_beneficiario JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b        JSONB := p_beneficiario;
  v_id     UUID;
  v_cnpj   TEXT;
  v_cep    TEXT;
  v_nome   TEXT;
  v_chave  TEXT;
  v_quem   TEXT;
  v_versao INTEGER;
  v_atual  INTEGER;
  v_antigo TEXT;
  v_tel    TEXT;
  v_orgao  TEXT;
  v_uf     TEXT;
  v_igual  TEXT;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador cadastram beneficiários.' USING ERRCODE = '42501';
  END IF;
  IF b IS NULL OR jsonb_typeof(b) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o beneficiário deve ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;

  v_nome := left(regexp_replace(btrim(COALESCE(b->>'nome', '')), '\s+', ' ', 'g'), 300);
  IF public.chave_nome_beneficiario(v_nome) IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o nome do beneficiário.' USING ERRCODE = '22023';
  END IF;
  v_cnpj := NULLIF(regexp_replace(COALESCE(b->>'cnpj', ''), '\D', '', 'g'), '');
  IF v_cnpj IS NOT NULL AND NOT public.cnpj_valido(v_cnpj) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: CNPJ inválido.' USING ERRCODE = '22023';
  END IF;
  v_cep := NULLIF(regexp_replace(COALESCE(b->>'entrega_cep', ''), '\D', '', 'g'), '');
  IF v_cep IS NOT NULL AND v_cep !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o CEP de entrega tem 8 números.' USING ERRCODE = '22023';
  END IF;
  v_uf := NULLIF(upper(btrim(COALESCE(b->>'entrega_uf', ''))), '');
  IF v_uf IS NOT NULL AND v_uf !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: UF de entrega inválida.' USING ERRCODE = '22023';
  END IF;
  v_tel := NULLIF(regexp_replace(COALESCE(b->>'responsavel_telefone', ''), '\D', '', 'g'), '');
  v_orgao := NULLIF(btrim(b->>'orgao'), '');
  IF v_orgao IS NOT NULL AND v_orgao NOT IN (
       'Polícia Militar', 'Corpo de Bombeiros Militar', 'Polícia Civil', 'Polícia Científica', 'Polícia Penal',
       'Guarda Municipal', 'Secretaria de Segurança Pública', 'Defesa Civil', 'Outro') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: órgão fora da lista.' USING ERRCODE = '22023';
  END IF;
  v_quem := left(public.nome_do_usuario_logado(), 200);
  v_id := NULLIF(b->>'id', '')::UUID;
  v_chave := public.chave_nome_beneficiario(v_nome || ' ' || COALESCE(NULLIF(btrim(b->>'entrega_municipio'), ''), '') || ' ' || COALESCE(v_uf, ''));

  -- Repetido: mesmo nome e local de outro cadastro, ou igual a uma grafia guardada nele.
  SELECT e.nome || COALESCE(' (' || e.entrega_municipio || COALESCE('/' || e.entrega_uf, '') || ')', ' (' || e.entrega_uf || ')', '') INTO v_igual
    FROM public.emenda_beneficiarios e
   WHERE e.id IS DISTINCT FROM v_id
     AND (e.chave_identidade = v_chave OR EXISTS (SELECT 1 FROM unnest(e.outros_nomes) o WHERE public.chave_nome_beneficiario(o) = v_chave))
   LIMIT 1;
  IF v_igual IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICADO: Já existe o beneficiário "%". Abra esse cadastro em vez de criar outro.', v_igual USING ERRCODE = '23505';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.emenda_beneficiarios (
      nome, nome_curto, sigla, cnpj, razao_social, natureza_juridica, ente_federativo, situacao_cadastral, sede_endereco,
      sede_municipio, sede_uf, sede_cep, sede_telefone, sede_email, receita_lida_em, entrega_cep, entrega_logradouro,
      entrega_numero, entrega_complemento, entrega_bairro, entrega_municipio, entrega_uf, responsavel_nome,
      responsavel_cargo, responsavel_telefone, responsavel_whatsapp, responsavel_email, ativo, orgao, origem,
      criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (
      v_nome, NULLIF(btrim(b->>'nome_curto'), ''), NULLIF(left(btrim(b->>'sigla'), 40), ''), v_cnpj, NULLIF(btrim(b->>'razao_social'), ''),
      NULLIF(btrim(b->>'natureza_juridica'), ''), NULLIF(btrim(b->>'ente_federativo'), ''),
      NULLIF(btrim(b->>'situacao_cadastral'), ''), NULLIF(btrim(b->>'sede_endereco'), ''), NULLIF(btrim(b->>'sede_municipio'), ''),
      NULLIF(upper(btrim(b->>'sede_uf')), ''), NULLIF(regexp_replace(COALESCE(b->>'sede_cep', ''), '\D', '', 'g'), ''),
      NULLIF(btrim(b->>'sede_telefone'), ''), NULLIF(btrim(b->>'sede_email'), ''), NULLIF(b->>'receita_lida_em', '')::TIMESTAMPTZ,
      v_cep, NULLIF(btrim(b->>'entrega_logradouro'), ''), NULLIF(btrim(b->>'entrega_numero'), ''),
      NULLIF(btrim(b->>'entrega_complemento'), ''), NULLIF(btrim(b->>'entrega_bairro'), ''),
      NULLIF(btrim(b->>'entrega_municipio'), ''), v_uf, NULLIF(btrim(b->>'responsavel_nome'), ''),
      NULLIF(btrim(b->>'responsavel_cargo'), ''), v_tel, COALESCE((b->>'responsavel_whatsapp')::BOOLEAN, FALSE),
      NULLIF(lower(btrim(b->>'responsavel_email')), ''), COALESCE((b->>'ativo')::BOOLEAN, TRUE), v_orgao, 'CADASTRO',
      auth.uid(), v_quem, auth.uid(), v_quem)
    RETURNING id, versao INTO v_id, v_versao;
    RETURN jsonb_build_object('id', v_id, 'versao', v_versao);
  END IF;

  SELECT versao, nome INTO v_atual, v_antigo FROM public.emenda_beneficiarios WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Beneficiário não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF (b->>'versao')::INTEGER IS DISTINCT FROM v_atual THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este beneficiário. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;

  UPDATE public.emenda_beneficiarios SET
    nome = v_nome, nome_curto = NULLIF(btrim(b->>'nome_curto'), ''), sigla = NULLIF(left(btrim(b->>'sigla'), 40), ''),
    -- O nome antigo continua valendo como grafia: a busca acha e ninguém cria outro com ele.
    outros_nomes = CASE WHEN public.chave_nome_beneficiario(v_antigo) = public.chave_nome_beneficiario(v_nome) OR v_antigo = ANY(outros_nomes)
                        THEN outros_nomes ELSE array_append(outros_nomes, v_antigo::TEXT) END,
    cnpj = v_cnpj, razao_social = NULLIF(btrim(b->>'razao_social'), ''), natureza_juridica = NULLIF(btrim(b->>'natureza_juridica'), ''),
    ente_federativo = NULLIF(btrim(b->>'ente_federativo'), ''), situacao_cadastral = NULLIF(btrim(b->>'situacao_cadastral'), ''),
    sede_endereco = NULLIF(btrim(b->>'sede_endereco'), ''), sede_municipio = NULLIF(btrim(b->>'sede_municipio'), ''),
    sede_uf = NULLIF(upper(btrim(b->>'sede_uf')), ''), sede_cep = NULLIF(regexp_replace(COALESCE(b->>'sede_cep', ''), '\D', '', 'g'), ''),
    sede_telefone = NULLIF(btrim(b->>'sede_telefone'), ''), sede_email = NULLIF(btrim(b->>'sede_email'), ''),
    receita_lida_em = CASE WHEN v_cnpj IS NULL THEN NULL ELSE COALESCE(NULLIF(b->>'receita_lida_em', '')::TIMESTAMPTZ, receita_lida_em) END,
    entrega_cep = v_cep, entrega_logradouro = NULLIF(btrim(b->>'entrega_logradouro'), ''),
    entrega_numero = NULLIF(btrim(b->>'entrega_numero'), ''), entrega_complemento = NULLIF(btrim(b->>'entrega_complemento'), ''),
    entrega_bairro = NULLIF(btrim(b->>'entrega_bairro'), ''), entrega_municipio = NULLIF(btrim(b->>'entrega_municipio'), ''),
    entrega_uf = v_uf, responsavel_nome = NULLIF(btrim(b->>'responsavel_nome'), ''),
    responsavel_cargo = NULLIF(btrim(b->>'responsavel_cargo'), ''), responsavel_telefone = v_tel,
    responsavel_whatsapp = COALESCE((b->>'responsavel_whatsapp')::BOOLEAN, FALSE),
    responsavel_email = NULLIF(lower(btrim(b->>'responsavel_email')), ''), ativo = COALESCE((b->>'ativo')::BOOLEAN, ativo),
    orgao = CASE WHEN b ? 'orgao' THEN v_orgao ELSE orgao END,
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_quem, atualizado_em = NOW()
  WHERE id = v_id
  RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', v_id, 'versao', v_versao);
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_beneficiario_emenda(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_beneficiario_emenda(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.juntar_beneficiarios_emenda(
  p_fica UUID, p_fica_versao INTEGER, p_sai UUID, p_sai_versao INTEGER, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  f       public.emenda_beneficiarios%ROWTYPE;
  s       public.emenda_beneficiarios%ROWTYPE;
  v_quem  TEXT;
  v_linhas INTEGER;
  v_versao INTEGER;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador juntam beneficiários.' USING ERRCODE = '42501';
  END IF;
  IF p_fica IS NULL OR p_sai IS NULL OR p_fica = p_sai THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha dois beneficiários diferentes.' USING ERRCODE = '22023';
  END IF;
  IF btrim(COALESCE(p_motivo, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: diga por que os dois são o mesmo beneficiário.' USING ERRCODE = '22023';
  END IF;

  -- Trava na ordem do id: duas junções ao mesmo tempo não se prendem uma à outra.
  PERFORM 1 FROM public.emenda_beneficiarios WHERE id IN (p_fica, p_sai) ORDER BY id FOR UPDATE;
  SELECT * INTO f FROM public.emenda_beneficiarios WHERE id = p_fica;
  SELECT * INTO s FROM public.emenda_beneficiarios WHERE id = p_sai;
  IF f.id IS NULL OR s.id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Beneficiário não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF f.versao IS DISTINCT FROM p_fica_versao OR s.versao IS DISTINCT FROM p_sai_versao THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou um dos beneficiários. Recarregue e refaça a junção.' USING ERRCODE = '40001';
  END IF;
  IF f.cnpj IS NOT NULL AND s.cnpj IS NOT NULL AND f.cnpj <> s.cnpj THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: os dois têm CNPJ diferentes. Confira antes de juntar.' USING ERRCODE = '22023';
  END IF;
  v_quem := left(public.nome_do_usuario_logado(), 200);

  UPDATE public.emenda_pedido_linhas SET beneficiario_id = f.id WHERE beneficiario_id = s.id;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  INSERT INTO public.emenda_beneficiarios_juntados (ficou_id, ficou_nome, saiu_id, saiu_nome, saiu_cnpj, linhas, motivo, juntado_por, juntado_por_nome)
  VALUES (f.id, f.nome, s.id, s.nome, s.cnpj, v_linhas, btrim(p_motivo), auth.uid(), v_quem);

  DELETE FROM public.emenda_beneficiarios WHERE id = s.id;

  -- O que fica guarda as grafias do outro e herda o que só o outro tinha.
  UPDATE public.emenda_beneficiarios SET
    outros_nomes = ARRAY(SELECT DISTINCT x FROM unnest(f.outros_nomes || s.outros_nomes || ARRAY[s.nome::TEXT]) x
                          WHERE x <> f.nome ORDER BY x),
    nome_curto = COALESCE(f.nome_curto, s.nome_curto),
    sigla = COALESCE(f.sigla, s.sigla),
    cnpj = COALESCE(f.cnpj, s.cnpj),
    razao_social = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.razao_social ELSE f.razao_social END,
    natureza_juridica = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.natureza_juridica ELSE f.natureza_juridica END,
    ente_federativo = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.ente_federativo ELSE f.ente_federativo END,
    situacao_cadastral = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.situacao_cadastral ELSE f.situacao_cadastral END,
    sede_endereco = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.sede_endereco ELSE f.sede_endereco END,
    sede_municipio = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.sede_municipio ELSE f.sede_municipio END,
    sede_uf = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.sede_uf ELSE f.sede_uf END,
    sede_cep = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.sede_cep ELSE f.sede_cep END,
    sede_telefone = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.sede_telefone ELSE f.sede_telefone END,
    sede_email = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.sede_email ELSE f.sede_email END,
    receita_lida_em = CASE WHEN f.cnpj IS NULL AND s.cnpj IS NOT NULL THEN s.receita_lida_em ELSE f.receita_lida_em END,
    -- Endereço de entrega e responsável vão juntos (um endereço pela metade não serve).
    entrega_cep = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_cep ELSE f.entrega_cep END,
    entrega_logradouro = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_logradouro ELSE f.entrega_logradouro END,
    entrega_numero = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_numero ELSE f.entrega_numero END,
    entrega_complemento = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_complemento ELSE f.entrega_complemento END,
    entrega_bairro = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_bairro ELSE f.entrega_bairro END,
    entrega_municipio = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_municipio ELSE COALESCE(f.entrega_municipio, s.entrega_municipio) END,
    entrega_uf = CASE WHEN f.entrega_cep IS NULL AND s.entrega_cep IS NOT NULL THEN s.entrega_uf ELSE COALESCE(f.entrega_uf, s.entrega_uf) END,
    responsavel_nome = CASE WHEN f.responsavel_nome IS NULL THEN s.responsavel_nome ELSE f.responsavel_nome END,
    responsavel_cargo = CASE WHEN f.responsavel_nome IS NULL THEN s.responsavel_cargo ELSE f.responsavel_cargo END,
    responsavel_telefone = CASE WHEN f.responsavel_nome IS NULL THEN s.responsavel_telefone ELSE f.responsavel_telefone END,
    responsavel_whatsapp = CASE WHEN f.responsavel_nome IS NULL THEN s.responsavel_whatsapp ELSE f.responsavel_whatsapp END,
    responsavel_email = CASE WHEN f.responsavel_nome IS NULL THEN s.responsavel_email ELSE f.responsavel_email END,
    orgao = COALESCE(f.orgao, s.orgao),
    ativo = f.ativo OR s.ativo,
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_quem, atualizado_em = NOW()
  WHERE id = f.id
  RETURNING versao INTO v_versao;

  RETURN jsonb_build_object('id', f.id, 'versao', v_versao, 'linhas', v_linhas);
END;
$$;
REVOKE ALL ON FUNCTION public.juntar_beneficiarios_emenda(UUID, INTEGER, UUID, INTEGER, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.juntar_beneficiarios_emenda(UUID, INTEGER, UUID, INTEGER, TEXT) TO authenticated;
