-- ==============================================================================
-- MIGRATION 171: EMENDAS — CIDADE DE ENTREGA DOS BENEFICIÁRIOS NA GRAFIA OFICIAL DO IBGE
-- Versão: 20261023000171_emendas_beneficiarios_cidade_ibge.sql
--
-- Pedido de 23/10/2026: a cidade aparece na coluna Entrega (é o campo entrega_municipio) e tem de estar escrita
-- certa. 31 cadastros tinham a cidade fora da grafia do IBGE (lista oficial de municípios):
--   - acento e hífen: Jundiai → Jundiaí, Ladario → Ladário, Embu Guaçu → Embu-Guaçu, jatei → Jateí;
--   - erro de digitação, conferido um a um na lista do IBGE: Valentin Gentil → Valentim Gentil, Dracema → Dracena,
--     Campos de Jordão → Campos do Jordão, Taguarussu → Taquarussu, São Bernardo → São Bernardo do Campo;
--   - cidade sem UF que só existe em um estado: Sinop, Nova Mutum, Guarantã do Norte → MT.
-- Cada mudança só vale para o cadastro que ainda está na versão medida.
-- ==============================================================================

UPDATE public.emenda_beneficiarios b SET
  entrega_municipio = v.municipio,
  entrega_uf = v.uf,
  versao = b.versao + 1,
  atualizado_por = NULL,
  atualizado_por_nome = 'Cidade pelo IBGE (migration 171)',
  atualizado_em = NOW()
  FROM (VALUES
  ('644ebce7-c93b-4126-9e98-aa5e4467a8f0'::uuid, 5, 'Embu-Guaçu', 'SP'),
  ('759043a6-489a-4f46-bc34-0b932e837a5f'::uuid, 5, 'Valentim Gentil', 'SP'),
  ('147c3b4c-ea10-4497-902d-518bad942617'::uuid, 5, 'Arco-Íris', 'SP'),
  ('c571f5f9-e0ca-4639-b043-12572f4e8301'::uuid, 3, 'Embu-Guaçu', 'SP'),
  ('deb264c7-f4a4-4d96-a1e7-516f764e40f4'::uuid, 3, 'Camapuã', 'MS'),
  ('5b67b876-e21d-4c59-86ea-68782dd60522'::uuid, 3, 'Água Clara', 'MS'),
  ('f8dc4741-e0fd-407b-be22-781df845a11d'::uuid, 3, 'Bernardino de Campos', 'SP'),
  ('6820db00-c9e6-4ea4-a5ca-cd2bd48d692f'::uuid, 2, 'Guarantã do Norte', 'MT'),
  ('3789324b-4087-413a-8225-57dddb7424e1'::uuid, 2, 'Nova Mutum', 'MT'),
  ('15869a80-69d4-4317-a377-8f428cfbe29b'::uuid, 2, 'Sinop', 'MT'),
  ('a439f04c-aac0-4801-8e4b-ee6517c4d7d8'::uuid, 2, 'Sinop', 'MT'),
  ('fa9fe537-317c-4eda-a64a-dc111f3ad203'::uuid, 2, 'Sinop', 'MT'),
  ('483b17ef-73ac-4018-b471-0b74e9425cc0'::uuid, 3, 'São Francisco de Itabapoana', 'RJ'),
  ('ef59264d-edc8-4c28-9a6d-9a086318d682'::uuid, 3, 'Dracena', 'SP'),
  ('217d4ceb-ae4b-4752-a559-5a27c85b3c42'::uuid, 4, 'Pindaré-Mirim', 'MA'),
  ('f6b1dbfe-be21-4929-b2c7-ec8d773fbdf8'::uuid, 4, 'Ilha de Itamaracá', 'PE'),
  ('2a404368-1817-4c37-afe6-0a79f860e924'::uuid, 4, 'Paraíba do Sul', 'RJ'),
  ('c7a1838d-2eaa-48d0-9e76-1797b21aaa16'::uuid, 4, 'Itaquiraí', 'MS'),
  ('a6b01963-909a-4c93-8c70-14a0f0d5acc0'::uuid, 4, 'Jateí', 'MS'),
  ('9ac9ce52-f366-448f-bf0e-fbaf0b38e4d4'::uuid, 4, 'Ladário', 'MS'),
  ('f9630436-7ca6-4f64-b86b-81ed016d5218'::uuid, 4, 'Taquarussu', 'MS'),
  ('74f7ebed-0361-45d1-a78c-a7771145b168'::uuid, 4, 'Campos do Jordão', 'SP'),
  ('34493414-dd81-463e-8a1e-af179ebc8499'::uuid, 4, 'Santa Fé do Sul', 'SP'),
  ('caef7383-55cb-437c-9143-751918387667'::uuid, 4, 'Camapuã', 'MS'),
  ('feb5bfd9-7f3c-4ece-952a-edd700780c52'::uuid, 4, 'Itaquiraí', 'MS'),
  ('0ee15bda-170f-491c-8694-b65af153a4c1'::uuid, 4, 'Jaraguari', 'MS'),
  ('aab4fe81-b35c-44dc-a7e4-b610e6026cf7'::uuid, 4, 'Jateí', 'MS'),
  ('5a15030c-4acc-49b2-9899-1073d4aa4cba'::uuid, 4, 'Taquarussu', 'MS'),
  ('d23ae51e-e44c-42a4-ae8b-0b2b590ad5be'::uuid, 4, 'Jundiaí', 'SP'),
  ('ad8762a1-d11f-4dbb-a43a-c59ce4fad018'::uuid, 4, 'Jundiaí', 'SP'),
  ('4834ae12-d5d6-4ec1-ad61-8b72f6a07798'::uuid, 4, 'São Bernardo do Campo', 'SP')
  ) v(id, versao, municipio, uf)
 WHERE b.id = v.id AND b.versao = v.versao;
