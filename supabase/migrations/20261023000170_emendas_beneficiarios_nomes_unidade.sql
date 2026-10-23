-- ==============================================================================
-- MIGRATION 170: EMENDAS — NOMES DAS UNIDADES SEM A HIERARQUIA E SIGLA NO MESMO PADRÃO
-- Versão: 20261023000170_emendas_beneficiarios_nomes_unidade.sql
--
-- Pedido de 23/10/2026 ("está poluído"): 122 nomes traziam a hierarquia inteira ("16º Batalhão de Polícia Militar do
-- Interior - 4ª Companhia PM/Comando de Policiamento do Interior 5"). Revisados um a um:
--   - a unidade vem da menor para a maior, sem o comando de cima (CPI, CPA, DEINTER): "4ª Companhia do 16º Batalhão
--     de Polícia Militar do Interior";
--   - a sigla segue o mesmo caminho: "4ª Cia/16º BPM/I", "2º PB/1º SGB/11º GBM", "1º CERCO/1ª Seccional/DECAP";
--   - bairro que estava no nome vai para o bairro de entrega (Vila Industrial, Pinheiros, Interlagos...);
--   - cidade que faltava vem do nome (Colombo/PR, Maringá/PR, Camaragibe, Pirapora do Bom Jesus).
-- Ao reescrever, 9 grupos ficam com o mesmo nome e cidade: são a mesma unidade cadastrada duas vezes
-- (ex.: "2º Pelotão do 14º Grupamento de Bombeiro Militar" em Adamantina, 3 cadastros). São juntados antes, no de mais
-- indicações, como juntar_beneficiarios_emenda faz.
-- Cada mudança só vale para o cadastro que ainda está na versão medida (o que a CAEP já editou fica como está).
-- ==============================================================================

-- 1) Juntar os que ficam iguais ---------------------------------------------------
CREATE TEMP TABLE juncoes_170 AS
SELECT v.fica_id, v.sai_id, s.nome AS sai_nome, s.cnpj AS sai_cnpj, s.outros_nomes AS sai_outros,
       (SELECT count(*) FROM public.emenda_pedido_linhas l WHERE l.beneficiario_id = v.sai_id) AS linhas
  FROM (VALUES
  ('73b1ddbb-3d28-409b-9bbd-09cade62c1cf'::uuid, 3, '33c9bdb5-08cf-4f49-be37-87be8e25161c'::uuid, 4),
  ('73b1ddbb-3d28-409b-9bbd-09cade62c1cf'::uuid, 3, 'b0f5d92a-0722-4c6b-8554-08cc90cd1379'::uuid, 3),
  ('aed3d85d-a493-4d9e-a385-ac49eef70acd'::uuid, 4, '17ea5353-77cc-42ca-918a-5e86eba51f5a'::uuid, 3),
  ('bb073f9c-c978-4a39-8029-b1671637683b'::uuid, 4, '875ba2ae-dccc-4973-b55e-ca235bcedc11'::uuid, 3),
  ('b665d68f-5409-4d3a-9184-b7f29c363eb8'::uuid, 3, 'd1cb0b78-8651-4d98-bf5e-515977ff931a'::uuid, 4),
  ('3acf9dde-d90b-468d-b2a1-5bbcaf787d0a'::uuid, 3, '987bdb9a-a893-4c9e-a995-b063d258cc56'::uuid, 4),
  ('aada8e4a-2b99-49b8-9511-442fdc4c7b35'::uuid, 4, 'f7a9b998-c3a5-46ff-a7fc-6c21825981c5'::uuid, 3),
  ('2c9dc0e1-0cde-426f-b9f8-8cc1071ea324'::uuid, 4, '36884a33-8d96-4d4d-82fd-f2b8a2be4b00'::uuid, 4),
  ('8b6f7b9d-b8ce-4d34-99bb-5e8dde3edaee'::uuid, 4, '97fc97b7-874b-4679-ba77-470a98c3b1d1'::uuid, 4),
  ('6e0db681-a155-414f-beb4-4a5cfe70d183'::uuid, 4, '1ab26545-66e4-482b-ab04-0cd71acf07e3'::uuid, 4)
  ) v(fica_id, fica_versao, sai_id, sai_versao)
  JOIN public.emenda_beneficiarios f ON f.id = v.fica_id AND f.versao = v.fica_versao
  JOIN public.emenda_beneficiarios s ON s.id = v.sai_id AND s.versao = v.sai_versao;

UPDATE public.emenda_pedido_linhas l SET beneficiario_id = j.fica_id FROM juncoes_170 j WHERE l.beneficiario_id = j.sai_id;

INSERT INTO public.emenda_beneficiarios_juntados (ficou_id, ficou_nome, saiu_id, saiu_nome, saiu_cnpj, linhas, motivo, juntado_por_nome)
SELECT j.fica_id, f.nome, j.sai_id, j.sai_nome, j.sai_cnpj, j.linhas,
       'Mesma unidade cadastrada duas vezes (nomes sem a hierarquia, migration 170)', 'Nomes das unidades (migration 170)'
  FROM juncoes_170 j JOIN public.emenda_beneficiarios f ON f.id = j.fica_id;

UPDATE public.emenda_beneficiarios f SET
  outros_nomes = ARRAY(SELECT DISTINCT x FROM unnest(f.outros_nomes || g.nomes) x WHERE x <> f.nome ORDER BY x),
  entrega_bairro = COALESCE(f.entrega_bairro, g.bairro)
  FROM (SELECT j.fica_id, array_agg(j.sai_nome) || COALESCE(array_agg(o) FILTER (WHERE o IS NOT NULL), '{}') AS nomes,
               (array_agg(s.entrega_bairro) FILTER (WHERE s.entrega_bairro IS NOT NULL))[1] AS bairro
          FROM juncoes_170 j JOIN public.emenda_beneficiarios s ON s.id = j.sai_id
          LEFT JOIN LATERAL unnest(j.sai_outros) o ON TRUE GROUP BY j.fica_id) g
 WHERE f.id = g.fica_id;

DELETE FROM public.emenda_beneficiarios WHERE id IN (SELECT sai_id FROM juncoes_170);

-- 2) Nomes, siglas e bairros (duas fases, por causa do índice único) ------------
CREATE TEMP TABLE nomes_170 AS
SELECT v.*, b.nome AS antes
  FROM (VALUES
  ('b36ec819-d291-4d5d-960f-096495ed4b29'::uuid, 4, '1º Posto de Bombeiros do 1º Subgrupamento do 11º Grupamento de Bombeiro Militar', '1º PB/1º SGB/11º GBM', 'São José dos Campos', 'SP', 'Vila Betânia'),
  ('976def40-2064-4f15-9e11-25d3aaa37e02'::uuid, 4, '2º Posto de Bombeiros do 1º Subgrupamento do 11º Grupamento de Bombeiro Militar', '2º PB/1º SGB/11º GBM', 'São José dos Campos', 'SP', 'Vila Industrial'),
  ('4dfc8a41-3e3c-4284-b7fe-23e2d3cb7175'::uuid, 3, '4º Posto de Bombeiros do 1º Subgrupamento do 11º Grupamento de Bombeiro Militar', '4º PB/1º SGB/11º GBM', 'São José dos Campos', 'SP', 'Campos de São José'),
  ('6d991284-108a-408f-9749-0d4654a8dd1f'::uuid, 3, 'Estação de Bombeiros Ana Emília do 2º Subgrupamento do 11º Grupamento de Bombeiro Militar', '2º SGB/11º GBM', 'Taubaté', 'SP', NULL),
  ('17b49dfe-d0ed-42ae-8c9d-12152cf2299f'::uuid, 4, '3º Subgrupamento do 11º Grupamento de Bombeiro Militar', '3º SGB/11º GBM', 'Caçapava', 'SP', NULL),
  ('5066a57b-59bf-48cd-b44d-2948918412e8'::uuid, 4, '2ª Estação de Bombeiros do 14º Grupamento de Bombeiro Militar', '2º EB/14º GBM', 'Rosana', 'SP', NULL),
  ('73b1ddbb-3d28-409b-9bbd-09cade62c1cf'::uuid, 3, '2º Pelotão do 14º Grupamento de Bombeiro Militar', '2º Pel/14º GBM', 'Adamantina', 'SP', NULL),
  ('489c7c02-c89f-4096-ad15-46b5eb27eed7'::uuid, 4, '2º Subgrupamento do 14º Grupamento de Bombeiro Militar', '2º SGB/14º GBM', 'Rosana', 'SP', NULL),
  ('217b77f7-04ad-49b0-9c1c-b7f93162f93a'::uuid, 4, '5º Subgrupamento do 15º Grupamento de Bombeiro Militar', '5º SGB/15º GBM', 'Botucatu', 'SP', NULL),
  ('0d64cfd8-d0fc-4927-bf97-63118c3f518a'::uuid, 4, '2ª Companhia do 16º Batalhão de Polícia Militar do Interior', '2ª Cia/16º BPM/I', 'Jales', 'SP', NULL),
  ('686acd28-7a75-4b0f-9f98-f880bd5f4159'::uuid, 4, '4ª Companhia do 16º Batalhão de Polícia Militar do Interior', '4ª Cia/16º BPM/I', 'Santa Fé do Sul', 'SP', NULL),
  ('4626e368-0211-4e68-9791-e6ef2d4aa0f8'::uuid, 4, '16º Batalhão de Polícia Militar do Interior', '16º BPM/I', 'Votuporanga', 'SP', NULL),
  ('521ff20a-8369-49ad-9076-72ed502cc31f'::uuid, 4, 'Subgrupamento do 16º Grupamento de Bombeiro Militar', 'SGB/16º GBM', 'São José do Rio Pardo', 'SP', NULL),
  ('0c65b4cd-9e30-4742-9469-8dba66846296'::uuid, 4, '18º Batalhão de Polícia Militar do Interior', '18º BPM/I', 'Santo Expedito', 'SP', NULL),
  ('644ebce7-c93b-4126-9e98-aa5e4467a8f0'::uuid, 4, '2º Subgrupamento do 18º Grupamento de Bombeiro Militar', '2º SGB/18º GBM', 'Embu Guaçu', 'SP', NULL),
  ('b141e367-cc03-46dc-8d72-71c18257ba63'::uuid, 4, '1º Subgrupamento do 19º Grupamento de Bombeiro Militar', '1º SGT/19º GBM', 'Itupeva', 'SP', NULL),
  ('e1374070-37ee-4cec-87ba-28ac24a6086c'::uuid, 3, '1ª Delegacia do Departamento de Polícia de Proteção à Cidadania', '1ª DPPC', 'São Paulo', 'SP', NULL),
  ('de3542df-2eeb-41e0-adee-e195adcf7b91'::uuid, 4, '1ª Delegacia Seccional Centro', '1ª Seccional/DECAP', 'São Paulo', 'SP', NULL),
  ('7ae7523a-31a7-49cb-809c-0207f3c5fd3b'::uuid, 4, '1º CERCO da 1ª Delegacia Seccional', '1º CERCO/1ª Seccional/DECAP', 'São Paulo', 'SP', 'Sé'),
  ('8d29bbf4-f23c-412b-8d78-fc27a543e4ad'::uuid, 4, '1º Grupamento Policial do 42º Batalhão de Polícia Militar do Interior', '1º GP/42º BPM/I', 'Piquerobi', 'SP', NULL),
  ('52655319-ea52-43b6-a421-e0919fd29115'::uuid, 4, '3ª Companhia do 20º Batalhão de Polícia Militar', '3ª Cia/20º BPM', 'Ubatuba', 'SP', NULL),
  ('d04b859a-57b2-4c66-ad46-76360a98e19c'::uuid, 3, '3ª Companhia do 20º Batalhão de Polícia Militar', '3ª Cia/20º BPM', 'Itapevi', 'SP', NULL),
  ('1ffde6c7-fe26-4f19-a465-a070b2610654'::uuid, 2, '22º Batalhão de Polícia Militar (ROTAM)', '22º BPM', 'Colombo', 'PR', NULL),
  ('0b955706-f86f-4a3c-97fd-2e6cc1c03b14'::uuid, 4, '3ª Companhia do 24º Batalhão de Polícia Militar do Interior', '3ª Cia/24º BPM/I', 'Mococa', 'SP', NULL),
  ('a7c0ac95-8626-4726-8e50-d71591e7e8bd'::uuid, 4, '2º Grupamento Policial da 3ª Companhia do 25º Batalhão de Polícia Militar', '2º GP/3ª Cia/25º BPM', 'Salmourão', 'SP', NULL),
  ('52d4ddbb-3b10-40c4-89f1-1be7fdc4c580'::uuid, 4, '25º Batalhão de Polícia Militar Metropolitano', '25º BPM/M', 'Itapecerica da Serra', 'SP', NULL),
  ('8e405394-0301-4569-bd20-7d54c3304ddb'::uuid, 4, '1ª Companhia do 25º Batalhão de Polícia Militar Metropolitano', '1ª Cia/25º BPM/M', 'Itapecerica da Serra', 'SP', NULL),
  ('dae33e09-b9cb-467a-96f2-25dfa17798df'::uuid, 4, 'Pelotão do 25º Batalhão de Polícia Militar', 'Pel/25º BPM', 'Panorama', 'SP', NULL),
  ('ab6c138b-ebe3-439d-9278-2b3fd01fc778'::uuid, 4, '26º Batalhão de Polícia Militar Metropolitano', '26º BPM/M', 'Francisco Morato', 'SP', NULL),
  ('ec0355f2-506f-4abf-a23c-921ee61dc416'::uuid, 4, '2ª Companhia do 25º Batalhão de Polícia Militar do Interior', '2ª Cia/25º BPM/I', 'Adamantina', 'SP', NULL),
  ('e1ebd2b2-07c8-4b2d-8e77-896f8394d1ec'::uuid, 3, '2ª Delegacia de Investigações sobre Estelionato e Crimes contra a Fé Pública', '2ª DIG', 'São Paulo', 'SP', NULL),
  ('aac293f2-1e88-47c4-a746-5ba681213555'::uuid, 4, '2ª Delegacia Seccional Sul', '2ª Seccional/DECAP', 'São Paulo', 'SP', 'Monções/Brooklin'),
  ('2970ba3c-0a44-4fbe-93fb-e3e9f23374cd'::uuid, 4, '3ª Companhia do 2º Batalhão de Polícia Ambiental', '3ª Cia/2º BPAmb', 'Presidente Prudente', 'SP', NULL),
  ('fb8df137-6716-4c3f-9aee-5c7adef4dd64'::uuid, 3, '2º Pelotão da 4ª Companhia do 2º Batalhão de Polícia Ambiental', '2º Pel/4ª Cia/2º BPAmb', 'Ourinhos', 'SP', NULL),
  ('e21d031c-672b-4583-98a6-cc9ed75dfed6'::uuid, 3, '1ª Companhia do 2º Batalhão de Polícia Militar do Interior', '1ª Cia/2º BPM/I', 'Araçatuba', 'SP', NULL),
  ('db36ca46-62da-4b8d-a61e-0e8dd3664eb2'::uuid, 4, '2º CERCO da 2ª Delegacia Seccional', '2º CERCO/2ª Seccional/DECAP', 'São Paulo', 'SP', 'Brooklin Paulista'),
  ('8a01f3f0-b95d-407f-8df1-084fc4d2d045'::uuid, 4, '2º Grupamento Policial da 2ª Companhia do 30º Batalhão de Polícia Militar do Interior', '2º GP/2ª Cia/30º BPM/I', 'Santo Antônio da Alegria', 'SP', NULL),
  ('9d6ed8ba-1757-4e0d-85df-4c0a2416ec56'::uuid, 4, '2º Subgrupamento do 7º Grupamento de Bombeiro Militar', '2º SGB/7º GBM', 'Mogi Guaçu', 'SP', NULL),
  ('293c8162-f468-44a7-8f61-d99b3e66a7f2'::uuid, 4, '1ª Companhia do 32º Batalhão de Polícia Militar', '1ª Cia/32º BPM', 'Suzano', 'SP', NULL),
  ('1ec5220e-fe25-4f71-bf70-b31e3bc1190f'::uuid, 4, '3ª Companhia do 33º Batalhão de Polícia Militar do Interior', '3ª Cia/33º BPM/I', 'Bebedouro', 'SP', NULL),
  ('2fdaba4c-accf-4bb2-8be0-edfb97f85390'::uuid, 4, '34º Batalhão de Polícia Militar do Interior', '34º BPM/I', 'Monte Alegre do Sul', 'SP', NULL),
  ('4c8509c4-1e1e-43b0-afdb-8255279ee0f5'::uuid, 4, '34º Distrito Policial', '34º DP', 'São Paulo', 'SP', 'Vila Sônia'),
  ('f71b756b-fc94-4a8c-80d4-56d2d65f819f'::uuid, 3, '3ª Companhia do 36º Batalhão de Polícia Militar do Interior', '3ª Cia/36º BPM/I', 'Pirassununga', 'SP', NULL),
  ('2e381b32-90be-4155-9131-e314af0295a2'::uuid, 4, '36º Batalhão de Polícia Militar do Interior', '36º BPM/I', 'Pirassununga', 'SP', NULL),
  ('ae9f84f9-19b4-4096-a0a7-e36241760540'::uuid, 3, '3º CERCO da 3ª Delegacia Seccional', '3º CERCO/3ª Seccional/DECAP', 'São Paulo', 'SP', 'Pinheiros'),
  ('38062e5e-558f-4aa7-b979-0e8d2e22a865'::uuid, 4, '3ª Companhia do 40º Batalhão de Polícia Militar do Interior', '3ª Cia/40º BPM/I', 'Salto de Pirapora', 'SP', NULL),
  ('1d25e34e-c0fe-4004-b9f6-cff124d00fb7'::uuid, 4, '2º Pelotão do 43º Batalhão de Polícia Militar do Interior', '2º Pel/43º BPM/I', 'Guariba', 'SP', NULL),
  ('4ba41233-21de-4dac-a160-80645ee05ea0'::uuid, 4, '2ª Companhia do 49º Batalhão de Polícia Militar do Interior', '2ª Cia/49º BPM/I', 'Itatiba', 'SP', NULL),
  ('9958f229-9ab4-4ce7-8d06-482b7f70b1ee'::uuid, 4, '4ª Delegacia de Capturas, Busca e Apreensão de Adolescente', '4ª Delegacia/DOPE', 'São Paulo', 'SP', NULL),
  ('9d111b41-d315-4579-a0ac-f891dc9e8a6f'::uuid, 3, '1º Pelotão do 4º Batalhão de Polícia Ambiental', '1º Pel/4º BPAmb', 'São José do Rio Preto', 'SP', NULL),
  ('0068a2d3-203f-4323-95d9-3b7cebf3128e'::uuid, 4, '4º Batalhão de Polícia Militar', '4º BPM', 'Agudos', 'SP', NULL),
  ('496af3ac-5c12-4e8b-8712-b8f47cd6d9c8'::uuid, 4, '4º CERCO da 4ª Delegacia Seccional', '4º CERCO/4ª Seccional/DECAP', 'São Paulo', 'SP', 'Casa Verde'),
  ('7ec39ca7-f390-450d-8037-ba5addc53c62'::uuid, 3, '1º Pelotão do 4º Subgrupamento de Bombeiro Militar', '1º Pel/4º SGB', 'Assis', 'SP', NULL),
  ('13fbe44d-3f0d-486c-84fe-05a3730bbfc5'::uuid, 4, '2ª Companhia do 54º Batalhão de Polícia Militar do Interior', '2ª Cia/54º BPM/I', 'Capão Bonito', 'SP', NULL),
  ('15c2e96e-562e-4572-8606-effe1758f139'::uuid, 4, '57ª Delegacia de Polícia', '57º DP', 'São Paulo', 'SP', 'Parque da Mooca'),
  ('5fc4860a-d132-4807-b3e5-bb0255ec542e'::uuid, 4, '5ª Delegacia Seccional', '5ª Seccional/DECAP', 'São Paulo', 'SP', NULL),
  ('99bade29-1bee-448f-b823-2e588b43b10c'::uuid, 4, '1º Pelotão da 2ª Companhia do 5º Batalhão de Polícia Ambiental', '1º Pel/2ª Cia/5º BPAmb', 'Pirassununga', 'SP', NULL),
  ('77e45cb0-5e50-475e-a7ef-56be97a4b08f'::uuid, 4, '5º Batalhão de Polícia Militar do Interior', '5º BPM/I', 'Taubaté', 'SP', 'Vila Independencia'),
  ('7211590d-d3e3-44dc-86fc-3fa5e0fd0fc7'::uuid, 4, '5º CERCO da 5ª Delegacia Seccional', '5º CERCO/5ª Seccional/DECAP', 'São Paulo', 'SP', 'Belém'),
  ('a20f78ce-1998-4643-99ea-3c156c56403d'::uuid, 4, '5º Grupamento Policial da 2ª Companhia do 30º Batalhão de Polícia Militar do Interior', '5º GP/2ª Cia/30º BPM/I', 'Urupês', 'SP', NULL),
  ('a7c14338-739d-4e88-9057-ec46d7240500'::uuid, 5, '6ª Delegacia Seccional', '6ª Seccional/DECAP', 'São Paulo', 'SP', 'Socorro'),
  ('89ff3750-3c0d-41de-b667-36a212c1663f'::uuid, 3, '6º CERCO da 6ª Delegacia Seccional', '6º CERCO/6ª Seccional/DECAP', 'São Paulo', 'SP', 'Socorro'),
  ('759043a6-489a-4f46-bc34-0b932e837a5f'::uuid, 4, '3ª Companhia do 7º Batalhão de Polícia Militar do Interior', '3ª Cia/7º BPM/I', 'Valentin Gentil', 'SP', NULL),
  ('1f1bf9c0-0c4c-4e5e-846e-1c5f94d6cb41'::uuid, 4, '2ª Companhia do 9º Batalhão de Polícia Militar do Interior', '2ª Cia/9º BPM/I', 'Tupã', 'SP', NULL),
  ('147c3b4c-ea10-4497-902d-518bad942617'::uuid, 4, '2º Grupamento Policial do 9º Batalhão de Polícia Militar do Interior', '2º GP/9º BPM/I', 'Arco-íris', 'SP', NULL),
  ('543cddd5-1b2f-42ea-bf45-e914c6cc13f6'::uuid, 4, '3º Grupamento Policial do 9º Batalhão de Polícia Militar do Interior', '3º GP/9º BPM/I', 'Queiroz', 'SP', NULL),
  ('9bb8158f-617c-4b31-b1e8-d9659e1a031c'::uuid, 4, '6º Grupamento Policial do 9º Batalhão de Polícia Militar do Interior', '6º GP/9º BPM/I', 'Herculândia', 'SP', NULL),
  ('50a975f8-ee1a-4dde-b4d6-9a99a33a2fe0'::uuid, 2, 'Assistência Policial de Defesa da Mulher da Delegacia Geral de Polícia', NULL, NULL, 'SP', NULL),
  ('04389acc-6d90-46e4-8bf5-356dd7f9b64d'::uuid, 3, 'Batalhão de Polícia de Trânsito Urbano e Rodoviário Estadual', 'BPRE', NULL, 'CE', NULL),
  ('4d4ef119-04c3-405b-bad3-c04a53861fa3'::uuid, 4, 'Batalhão Especializado em Policiamento do Interior', 'BEPI', NULL, 'CE', NULL),
  ('903b09ff-642b-4cda-bd30-ea25871334fd'::uuid, 2, '11º Grupamento de Bombeiro Militar', '11º GB', 'Apucarana', 'PR', NULL),
  ('d4fdea3d-58b1-41c8-ad64-8d714e41607d'::uuid, 2, '5º Grupamento de Bombeiro Militar', '5º GB', 'Maringá', 'PR', NULL),
  ('1e8e14aa-b125-40dc-a6f9-3a459ce8e2e1'::uuid, 3, 'Batalhão de Guarda Externa dos Presídios', 'BPGEP', NULL, 'CE', NULL),
  ('16eb295f-b038-480d-926d-47b813b4700c'::uuid, 3, 'Comando de Bombeiros do Interior 3', 'CBI-3', 'Guarujá', 'SP', NULL),
  ('40ecb39c-e038-4884-8681-146dd798dc9c'::uuid, 3, 'Comando de Policiamento do Interior 5', 'CPI-5', 'São José do Rio Preto', 'SP', 'Boa Vista'),
  ('924cf8f2-3437-4989-b6a3-1851d83f1b6b'::uuid, 5, '21º Batalhão de Polícia Militar do Interior', '21º BPM/I', 'Guarujá', 'SP', NULL),
  ('d349a116-025e-4485-9588-776f557d38f9'::uuid, 1, 'Coordenadoria de Gestão Interna do Ensino, Instrução e Cultura', 'COGEIC', NULL, 'CE', NULL),
  ('d41043e2-700f-4f15-9c67-6812728992d3'::uuid, 4, '4º Grupamento Policial do 30º Batalhão de Polícia Militar do Interior', '4º GP/30º BPM/I', 'Tabapuã', 'SP', NULL),
  ('2f0b0f8e-bd28-416e-98c3-362a5b16665f'::uuid, 4, 'Delegacia de Homicídios', 'DHPP', 'Campo Grande', 'MS', NULL),
  ('aada8e4a-2b99-49b8-9511-442fdc4c7b35'::uuid, 4, 'Delegacia de Investigações Gerais', 'DIG/DISE', 'Limeira', 'SP', NULL),
  ('3457f7dc-8f40-43c5-8a77-5c1bfcf96ae0'::uuid, 4, 'Delegacia de Polícia', 'DEINTER 10', 'Ilha Solteira', 'SP', NULL),
  ('2c9dc0e1-0cde-426f-b9f8-8cc1071ea324'::uuid, 4, 'Delegacia de Polícia', 'DEINTER 10', 'Auriflama', 'SP', NULL),
  ('67c92d63-aee7-4459-8dfc-568b948d3a7b'::uuid, 4, 'Delegacia de Polícia', 'DEINTER 10', 'Coroados', 'SP', NULL),
  ('990a2d93-c6fc-430e-8ba9-406b041cdb27'::uuid, 4, 'Delegacia de Polícia', 'DEINTER 3', 'Sertãozinho', 'SP', NULL),
  ('ddc73c1f-353a-4dac-9c92-c56dde775d5d'::uuid, 4, 'Delegacia de Polícia', 'DEINTER 3', 'Pontal', 'SP', NULL),
  ('517f259a-9431-4f92-83cd-c2a58e534f2f'::uuid, 4, 'Delegacia de Polícia', 'DEINTER 3', 'Pitangueiras', 'SP', NULL),
  ('3e21fe45-58c2-472c-b08c-6de56d3005e8'::uuid, 4, 'Delegacia de Polícia', 'DEINTER 3', 'Guariba', 'SP', NULL),
  ('12bf5440-ad0b-4df9-9151-a293767ca115'::uuid, 4, 'Delegacia de Polícia', 'DEINTER 3', 'Matão', 'SP', NULL),
  ('a483f8af-c194-4716-8aa3-06175198221e'::uuid, 4, 'Delegacia de Polícia', 'DEINTER 4', 'Espírito Santo do Turvo', 'SP', NULL),
  ('04950b5c-6193-4cd9-95a4-54faaea36ea2'::uuid, 4, 'Delegacia de Polícia', 'DEINTER 4', 'Herculândia', 'SP', NULL),
  ('a30dad02-243e-421c-bbea-a3f704ce411c'::uuid, 4, 'Delegacia de Polícia', 'DEINTER 4', 'Tupã', 'SP', NULL),
  ('d6fc21a4-93da-4380-b92c-8c8a74f169eb'::uuid, 4, 'Delegacia de Polícia', 'DEINTER 7', 'Salto de Pirapora', 'SP', NULL),
  ('d9392631-3f0c-4b0a-a766-022421b4fc83'::uuid, 2, 'Delegacia de Polícia de Investigações sobre Infrações contra o Meio Ambiente', NULL, 'Carapicuíba', 'SP', NULL),
  ('3aa03779-5a5b-40eb-9ab5-60b0877d3265'::uuid, 4, 'Delegacia Especializada de Combate ao Narcotráfico', 'DENAR', 'Campo Grande', 'MS', NULL),
  ('fc7e13be-9d9b-4568-9732-a25e2241fb7e'::uuid, 4, 'Delegacia Especializada de Roubos e Furtos', 'DERF', 'Campo Grande', 'MS', NULL),
  ('9904db07-a18a-490c-8483-89226c7d7ca1'::uuid, 3, 'Delegacia Geral da Polícia Civil', 'PCCE', NULL, 'CE', NULL),
  ('7d2f48e1-18d9-4297-9e62-80d25fa13171'::uuid, 3, 'Delegacia de Defesa da Mulher', 'DDM', 'Diadema', 'SP', NULL),
  ('3acf9dde-d90b-468d-b2a1-5bbcaf787d0a'::uuid, 3, 'Delegacia de Defesa da Mulher', 'DDM', 'Guarulhos', 'SP', NULL),
  ('b665d68f-5409-4d3a-9184-b7f29c363eb8'::uuid, 3, 'Delegacia de Defesa da Mulher', 'DDM', 'Franco da Rocha', 'SP', NULL),
  ('09c6acf7-9153-4092-a002-9b73a5c435de'::uuid, 4, 'Delegacia de Polícia', 'DEINTER 4', 'Rinópolis', 'SP', NULL),
  ('9fce6358-1849-4f58-ae0d-77e551591dde'::uuid, 4, 'Divisão Especializada de Investigações Criminais', 'DEIC', 'Ribeirão Preto', 'SP', NULL),
  ('6847aa3b-026e-46b0-a145-dd9bdd3f131b'::uuid, 4, 'Divisão Especializada de Investigações Criminais', 'DEIC', 'Santos', 'SP', NULL),
  ('57440b77-9785-418e-af44-b665e66e761d'::uuid, 4, 'Divisão Especializada de Investigações Criminais', 'DEIC', 'Sorocaba', 'SP', NULL),
  ('ba3afc16-fad5-4020-a1ca-64abca2d0e8e'::uuid, 4, 'Divisão Especializada de Investigações Criminais', 'DEIC', 'São Paulo', 'SP', NULL),
  ('b6f09d22-6c1c-4e37-ada0-068f271c6736'::uuid, 4, 'Divisão Especializada de Investigações Criminais', 'DEIC', 'São José dos Campos', 'SP', NULL),
  ('d8ee3df5-c037-45b3-a93c-6ee225fd352e'::uuid, 4, 'Divisão Especializada de Investigações Criminais', 'DEIC', 'Campinas', 'SP', 'Centro'),
  ('431372cc-90cb-4935-a41d-0974ff7d9121'::uuid, 4, 'Divisão Especializada de Investigações Criminais', 'DEIC', 'Bauru', 'SP', 'Bela Vista'),
  ('bb16b86b-d144-4871-8165-c3f2b08ebe02'::uuid, 4, 'Divisão Especializada de Investigações Criminais', 'DEIC', 'São José do Rio Preto', 'SP', NULL),
  ('aed3d85d-a493-4d9e-a385-ac49eef70acd'::uuid, 4, '3ª Companhia do Grupamento de Bombeiros Marítimo', '3ª Cia/GBMar', 'Bertioga', 'SP', 'São Lourenço'),
  ('b6b66425-0787-40a5-b136-feab3e276cef'::uuid, 4, 'Grupo Armado de Repressão a Roubos', 'GARRA', 'São Paulo', 'SP', 'Várzea da Barra Funda'),
  ('45a000ce-5125-4933-b751-b4f1318a43a0'::uuid, 4, '1º Subgrupamento do 14º Grupamento de Bombeiro Militar', '1º SGB/14º GBM', 'Pirapozinho', 'SP', NULL),
  ('2458e36d-bd66-4c74-af96-0b40ea7148c3'::uuid, 4, 'Pelotão da 5ª Companhia do 2º Batalhão de Polícia Militar do Interior', 'Pel/5ª Cia/2º BPM/I', 'Valparaíso', 'SP', NULL),
  ('d084e61e-1f5c-4e5a-bf21-753070acc2d3'::uuid, 3, 'Posto de Bombeiros Guarapiranga', NULL, 'São Paulo', 'SP', 'Interlagos'),
  ('33eb78df-4812-4a02-8b89-a7fc0331b687'::uuid, 4, 'Posto de Bombeiros do 2º Subgrupamento do 17º Grupamento de Bombeiro Militar', 'PB/2º SGB/17º GBM', 'Suzano', 'SP', NULL),
  ('bb7d609d-9d57-4e3a-b4e5-da422e24d4bc'::uuid, 1, 'Quartel Central do Corpo de Bombeiros', 'CBC', NULL, 'CE', NULL),
  ('cd527d40-e5e7-4933-b5b8-829498b1ac35'::uuid, 3, '2ª Delegacia de Polícia de Atendimento ao Turista', '2ª DEATUR', 'São Paulo', 'SP', NULL),
  ('6a8552ca-492e-45a3-ad7d-ca26a50fbad7'::uuid, 3, 'Delegacia Antissequestro', 'DAS', 'São Paulo', 'SP', NULL),
  ('35491186-3a17-454b-a6e1-b032f443dcf5'::uuid, 2, 'Guarda Civil Municipal', NULL, 'Camaragibe', 'PE', NULL),
  ('f6a89893-bd14-4658-afd5-9a2b82e8adaf'::uuid, 2, 'Defesa Civil', NULL, 'Pirapora do Bom Jesus', 'SP', NULL),
  ('add02cd1-d6fb-4f85-8bb1-4a2106e35272'::uuid, 2, 'Guarda Municipal', NULL, 'Pirapora do Bom Jesus', 'SP', NULL),
  ('fc6aeab7-64b4-4184-8a1b-b4210f92fe95'::uuid, 3, 'Grupamento de Bombeiros Marítimo Litoral Norte', 'GBMar', 'São Paulo', 'SP', NULL),
  ('9e08420b-1b22-41d6-9489-df0789de25d3'::uuid, 3, 'Grupamento de Bombeiros Marítimo Litoral Sul', 'GBMar', 'São Paulo', 'SP', NULL)
  ) v(id, versao, nome, sigla, municipio, uf, bairro)
  JOIN public.emenda_beneficiarios b ON b.id = v.id AND b.versao = v.versao;

UPDATE public.emenda_beneficiarios b SET nome = '~170 ' || b.id::text FROM nomes_170 r WHERE b.id = r.id;

UPDATE public.emenda_beneficiarios b SET
  nome = r.nome,
  sigla = r.sigla,
  entrega_municipio = r.municipio,
  entrega_uf = r.uf,
  entrega_bairro = COALESCE(b.entrega_bairro, r.bairro),
  outros_nomes = CASE WHEN r.antes = r.nome OR r.antes = ANY(b.outros_nomes) THEN b.outros_nomes ELSE array_append(b.outros_nomes, r.antes) END,
  versao = b.versao + 1, atualizado_por = NULL, atualizado_por_nome = 'Nomes das unidades (migration 170)', atualizado_em = NOW()
  FROM nomes_170 r
 WHERE b.id = r.id;

DO $$
DECLARE v_sobra INTEGER;
BEGIN
  SELECT count(*) INTO v_sobra FROM public.emenda_beneficiarios WHERE nome LIKE '~170 %';
  IF v_sobra > 0 THEN
    RAISE EXCEPTION 'Migration 170: % cadastros ficaram com o nome provisório.', v_sobra;
  END IF;
END $$;

DROP TABLE juncoes_170;
DROP TABLE nomes_170;
