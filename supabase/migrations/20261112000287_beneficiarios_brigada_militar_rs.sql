-- Cadastro de beneficiários: os 9 "Brigada Militar - RS (Cidade)" passam ao padrão (pedido do usuário, 12/11/2026).
-- A cidade sai do nome e vai para o endereço de entrega; o nome passa a ser o batalhão ou regimento da Brigada Militar
-- que atende a cidade, confirmado em páginas atuais da BM (a fração menor, de 2021, ficou de fora por decisão do
-- usuário). A sigla leva a cidade para distinguir o mesmo batalhão em cidades diferentes. O nome antigo vai para as
-- outras grafias. Trava: só muda se a versão e o nome forem os lidos em 12/11/2026.

DO $$
DECLARE r RECORD; v_n INTEGER;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('7883246e-bfd4-4ace-a2f5-fb0c477cd855'::uuid, 1, 'Brigada Militar - RS (Ernestina – RS)''', '3º Regimento de Polícia Montada', '3º RPMon Ernestina', 'Ernestina'),
    ('2db3756b-46b1-443b-ab63-36431b0ffed0'::uuid, 1, 'Brigada Militar - RS (Ibarama – RS)', '23º Batalhão de Polícia Militar', '23º BPM Ibarama', 'Ibarama'),
    ('7eaa62e0-69c8-44b2-9dbb-c9e8a9e69411'::uuid, 1, 'Brigada Militar - RS (Santo Augusto – RS)', '7º Batalhão de Polícia Militar', '7º BPM Santo Augusto', 'Santo Augusto'),
    ('b624b9c9-0c71-4c69-a7e3-3d8d7d5964ed'::uuid, 1, 'Brigada Militar - RS (São Domingos do Sul – RS)', '3º Regimento de Polícia Montada', '3º RPMon São Domingos do Sul', 'São Domingos do Sul'),
    ('2843d5eb-7a26-4206-ae66-30e2bf8b6891'::uuid, 1, 'Brigada Militar – RS (São Gabriel – RS)', '2º Regimento de Polícia Montada', '2º RPMon São Gabriel', 'São Gabriel'),
    ('b563e087-0357-442c-af93-eb34e767de5b'::uuid, 1, 'Brigada Militar - RS (São José das Missões - RS)', '39º Batalhão de Polícia Militar', '39º BPM São José das Missões', 'São José das Missões'),
    ('203c122c-a375-4317-9daa-6ab274d7aa2a'::uuid, 1, 'Brigada Militar - RS (Selbach – RS)', '16º Batalhão de Polícia Militar', '16º BPM Selbach', 'Selbach'),
    ('10d30051-19c1-4115-a082-1d7b6d07a6a5'::uuid, 1, 'Brigada Militar - RS (Serafina Corrêa - RS)', '3º Regimento de Polícia Montada', '3º RPMon Serafina Corrêa', 'Serafina Corrêa'),
    ('23ce61a5-2c5f-404e-af87-bf0ca86dad55'::uuid, 1, 'Brigada Militar – RS (Sinimbu – RS)', '23º Batalhão de Polícia Militar', '23º BPM Sinimbu', 'Sinimbu')
  ) v(id, versao, nome_atual, nome_novo, sigla, municipio) LOOP
    UPDATE public.emenda_beneficiarios b
       SET nome = r.nome_novo, sigla = r.sigla, entrega_municipio = r.municipio,
           outros_nomes = ARRAY(SELECT DISTINCT x FROM unnest(b.outros_nomes || ARRAY[b.nome::TEXT]) x WHERE x <> r.nome_novo),
           versao = b.versao + 1, atualizado_por_nome = 'Padronização da Brigada Militar (CGLIC)', atualizado_em = NOW()
     WHERE b.id = r.id AND b.versao = r.versao AND b.nome = r.nome_atual;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Cadastro % (%) mudou desde a conferência; refazer a lista.', r.nome_atual, r.id;
    END IF;
  END LOOP;
END $$;
