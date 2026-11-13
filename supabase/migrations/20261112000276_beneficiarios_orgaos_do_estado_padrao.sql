-- Cadastro de beneficiários: órgãos do estado no padrão (pedido do usuário em 12/11/2026, ao conferir a rodada 1).
-- 6 nomes fora do padrão "Órgão do Estado de X" passam ao padrão (o nome antigo fica nas outras grafias) e os órgãos do
-- estado sem cidade de entrega recebem a capital. Trava: cada linha só muda se a versão for a lida em 12/11/2026
-- (a CAEP pode ter editado no meio-tempo); senão a migration para.

DO $$
DECLARE r RECORD; v_n INTEGER;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('f2ce96cb-00d1-4506-94b5-72e83910cd16'::uuid, 3, 'Corpo de Bombeiros Militar do Estado de Alagoas', NULL, 'Maceió'),
    ('3628a073-bd56-46aa-946d-c67bdb26f6a5'::uuid, 4, 'Corpo de Bombeiros Militar do Estado do Amapá', NULL, 'Macapá'),
    ('d0f8ce95-47dd-42a5-893e-83ed48a53c74'::uuid, 4, 'Corpo de Bombeiros Militar do Estado da Bahia', NULL, 'Salvador'),
    ('0e156669-6fbb-458f-9471-8244d563a0c8'::uuid, 4, 'Corpo de Bombeiros Militar do Estado do Ceará', NULL, 'Fortaleza'),
    ('7e8903b7-f202-4e9c-898a-e412ce9d23bf'::uuid, 4, 'Polícia Militar do Estado do Ceará', NULL, 'Fortaleza'),
    ('d03da3d5-ade1-4628-b6dd-57cea0303e0a'::uuid, 6, 'Corpo de Bombeiros Militar do Distrito Federal', NULL, 'Brasília'),
    ('63649015-dced-45d3-885e-ea1e77d63098'::uuid, 6, 'Polícia Civil do Distrito Federal', NULL, 'Brasília'),
    ('9af47a6c-71d2-48f6-aba9-d8662a472255'::uuid, 5, 'Polícia Militar do Distrito Federal', NULL, 'Brasília'),
    ('c1ab2a11-a4eb-4f4a-a661-8261e4507b0f'::uuid, 1, 'Corpo de Bombeiros Militar - ES', 'Corpo de Bombeiros Militar do Estado do Espírito Santo', 'Vitória'),
    ('516c219c-8103-4edf-9a98-d9aadccc2420'::uuid, 1, 'Polícia Civil - ES', 'Polícia Civil do Estado do Espírito Santo', 'Vitória'),
    ('cf90fcaa-b2be-41ba-a1c3-60df740c21f5'::uuid, 1, 'Corpo de Bombeiros Militar do Maranhão', 'Corpo de Bombeiros Militar do Estado do Maranhão', NULL),
    ('f0c0ad5e-e2a6-4f93-8af5-613a9bb7bba5'::uuid, 4, 'Polícia Militar do Estado do Maranhão', NULL, 'São Luís'),
    ('f13e9497-e2bd-4c2b-995b-4d6552f09319'::uuid, 3, 'Polícia Militar do Estado de Minas Gerais', NULL, 'Belo Horizonte'),
    ('7d426f2b-c78b-4949-a451-7ffd4814d6a2'::uuid, 2, 'Polícia Penal do Estado de Mato Grosso', NULL, 'Cuiabá'),
    ('078cee8c-366f-4a6c-97a6-665af0959900'::uuid, 4, 'Corpo de Bombeiros Militar do Pará', 'Corpo de Bombeiros Militar do Estado do Pará', 'Belém'),
    ('3c9e05ac-769f-4110-be65-531b2fa8ecfe'::uuid, 4, 'Polícia Civil do Estado de Pernambuco', NULL, 'Recife'),
    ('c21d8183-3a40-4f15-a8d2-0ea8f2a25c26'::uuid, 4, 'Polícia Militar do Estado de Pernambuco', NULL, 'Recife'),
    ('708ae7a8-0417-498f-8e83-cab421fcab74'::uuid, 4, 'Polícia Militar do Estado do Piauí', NULL, 'Teresina'),
    ('748b283f-a41a-405f-b245-3b41e96a894b'::uuid, 3, 'Corpo de Bombeiros Militar do Estado do Paraná', NULL, 'Curitiba'),
    ('14bf5823-34f1-4cc3-95b8-f11b664dddd5'::uuid, 4, 'Corpo de Bombeiros Militar do Estado do Rio de Janeiro', NULL, 'Rio de Janeiro'),
    ('56060f5f-8c20-4886-9055-ee6412b948f9'::uuid, 5, 'Polícia Civil do Estado do Rio de Janeiro', NULL, 'Rio de Janeiro'),
    ('15e38425-a89f-4830-b82b-2fe207739ff6'::uuid, 5, 'Polícia Militar do Estado do Rio de Janeiro', NULL, 'Rio de Janeiro'),
    ('0240963c-b010-424f-8cca-a4c6b4a17b17'::uuid, 1, 'Secretaria de Estado de Defesa Civil', 'Secretaria de Estado de Defesa Civil do Rio de Janeiro', 'Rio de Janeiro'),
    ('61b2c103-a841-4eb6-a528-06d8a990a362'::uuid, 4, 'Corpo de Bombeiros Militar do Estado de Rondônia', NULL, 'Porto Velho'),
    ('fc8f82fb-5608-4b7a-beab-fdbec0700747'::uuid, 4, 'Polícia Militar do Estado de Rondônia', NULL, 'Porto Velho'),
    ('5ea6c148-87ca-490f-b8c8-c37191330299'::uuid, 4, 'Polícia Penal do Estado de Rondônia', NULL, 'Porto Velho'),
    ('9904db07-a18a-490c-8483-89226c7d7ca1'::uuid, 5, 'Delegacia Geral da Polícia Civil do Estado do Ceará', 'Polícia Civil do Estado do Ceará', 'Fortaleza')
  ) v(id, versao, nome_atual, nome_novo, municipio) LOOP
    UPDATE public.emenda_beneficiarios b
       SET nome = COALESCE(r.nome_novo, b.nome),
           outros_nomes = CASE WHEN r.nome_novo IS NULL THEN b.outros_nomes
                               ELSE ARRAY(SELECT DISTINCT x FROM unnest(b.outros_nomes || ARRAY[b.nome::TEXT]) x WHERE x <> r.nome_novo) END,
           entrega_municipio = COALESCE(b.entrega_municipio, r.municipio),
           versao = b.versao + 1, atualizado_por_nome = 'Padronização dos órgãos do estado (CGLIC)', atualizado_em = NOW()
     WHERE b.id = r.id AND b.versao = r.versao AND b.nome = r.nome_atual;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Cadastro % (%) mudou desde a conferência; refazer a lista.', r.nome_atual, r.id;
    END IF;
  END LOOP;
END $$;
