-- Fiscalização, rodada 5 conferida pelo usuário (12/11/2026): unidades com proposta clara (certeza média, fonte na
-- lista de conferência). Cria 41 cadastros e liga 57 nomes escritos na planilha da SFC/CGLIC; 14 vão para unidades
-- criadas na rodada 4 (no Acre, ao batalhão, como nos termos de doação).

DO $$
DECLARE r RECORD; v_id uuid; v_total INTEGER := 0; v_novos INTEGER := 0;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('10º Batalhão de Polícia Militar', '10º BPM', 'Pinheiro', 'MA'),
    ('Coordenadoria de Manutenção, Almoxarifado e Patrimônio', 'COMALP', 'Fortaleza', 'CE'),
    ('Comando de Policiamento de Choque', 'CPChq', 'São Paulo', 'SP'),
    ('Delegacia de Polícia do Município', 'DP Franco da Rocha', 'Franco da Rocha', 'SP'),
    ('Departamento de Polícia de Proteção à Cidadania', 'DPPC', 'São Paulo', 'SP'),
    ('2º Pelotão da 10ª Companhia Independente de Polícia Militar', '2º Pel/10ª Cia Ind', 'Piúma', 'ES'),
    ('Grupamento de Aviação Operacional', 'GAVOP', 'Brasília', 'DF'),
    ('Grupo de Resposta Tática', 'GRT', 'Boa Vista', 'RR'),
    ('Companhia Independente de Policiamento de Trânsito Urbano e Rodoviário', 'CIPTUR', 'Boa Vista', 'RR'),
    ('Companhia Independente de Policiamento Ambiental', 'CIPA', 'Boa Vista', 'RR'),
    ('Posto Avançado da 2ª Companhia do 1º Batalhão de Bombeiro Militar', 'PA/2ª Cia/1º BBM', 'Mariana', 'MG'),
    ('Departamento de Polícia Científica', 'DPC', 'Rio Branco', 'AC'),
    ('Delegacia de Polícia da Comarca', 'DPCo Timbó', 'Timbó', 'SC'),
    ('Coordenadoria de Operações e Recursos Especiais', 'CORE', 'Rio Branco', 'AC'),
    ('Comando de Policiamento da Região Leste', 'CPRL', 'Feira de Santana', 'BA'),
    ('19ª Companhia Independente de Polícia Militar', '19ª Cia PM Ind', 'Pará de Minas', 'MG'),
    ('Comando de Policiamento do Interior', 'CPI', 'Boa Vista', 'RR'),
    ('Batalhão de Operações Policiais Especiais', 'BOPE', 'Boa Vista', 'RR'),
    ('2º Batalhão de Polícia Militar', '2º BPM', 'Boa Vista', 'RR'),
    ('2º Grupamento de Bombeiro Militar do 3º Pelotão da 1ª Companhia do 12º Batalhão de Bombeiro Militar', '2º GBM/3º Pel/1ª Cia/12º BBM', 'Mondaí', 'SC'),
    ('Batalhão de Operações Policiais Especializado', 'BOPE', 'Rio Branco', 'AC'),
    ('Unidade de Bombeiro Militar', 'UBM Novo Horizonte', 'Novo Horizonte', 'SP'),
    ('3ª Companhia do 3º Batalhão de Bombeiro Militar', '3ª Cia/3º BBM', 'Brusque', 'SC'),
    ('3ª Companhia do 26º Batalhão de Polícia Militar', '3ª Cia/26º BPM', 'Campos Novos', 'SC'),
    ('21ª Companhia Independente de Polícia Militar', '21ª Cia PM Ind', 'Guaraciaba', 'MG'),
    ('2º Grupo do 2º Pelotão da 4ª Companhia do 2º Batalhão de Polícia Militar de Fronteira', '2º Gp/2º Pel/4ª Cia/2º BPM Fron', 'Caibi', 'SC'),
    ('2ª Companhia do 35º Batalhão de Polícia Militar', '2ª Cia/35º BPM', 'Gravatal', 'SC'),
    ('2ª Companhia do 29º Batalhão de Polícia Militar', '2ª Cia/29º BPM', 'Urussanga', 'SC'),
    ('2º Grupo do 2º Pelotão da 3ª Companhia do 2º Batalhão de Polícia Militar Ambiental', '2º Gp/2º Pel/3ª Cia/2º BPMA', 'Caçador', 'SC'),
    ('1º Grupo do 2º Pelotão da 3ª Companhia do 2º Batalhão de Polícia Militar Ambiental', '1º Gp/2º Pel/3ª Cia/2º BPMA', 'Porto União', 'SC'),
    ('2ª Companhia do 2º Batalhão de Bombeiro Militar', '2ª Cia/2º BBM', 'Videira', 'SC'),
    ('2ª Companhia do 3º Batalhão de Bombeiro Militar', '2ª Cia/3º BBM', 'Timbó', 'SC'),
    ('21ª Companhia Independente de Polícia Militar', '21ª CIPM', 'Cipó', 'BA'),
    ('42ª Companhia Independente de Polícia Militar', '42ª CIPM', 'Lençóis', 'BA'),
    ('3º Pelotão da 1ª Companhia do 31º Batalhão de Polícia Militar', '3º Pel/1ª Cia/31º BPM', 'Bombinhas', 'SC'),
    ('Batalhão de Ações com Cães', 'BAC', 'Vitória', 'ES'),
    ('3º Grupo do 2º Pelotão da 2ª Companhia do 30º Batalhão de Polícia Militar', '3º Gp/2º Pel/2ª Cia/30º BPM', 'Ipuaçu', 'SC'),
    ('2ª Companhia do 3º Batalhão de Polícia Militar', '2ª Cia/3º BPM', 'Porto União', 'SC'),
    ('1º Grupo do 3º Pelotão da 2ª Companhia do 27º Batalhão de Polícia Militar', '1º Gp/3º Pel/2ª Cia/27º BPM', 'Balneário Barra do Sul', 'SC'),
    ('2ª Companhia do 32º Batalhão de Polícia Militar', '2ª Cia/32º BPM', 'Timbó', 'SC'),
    ('7ª Companhia Independente de Polícia Militar', '7ª CIPM', 'Monte Santo', 'BA')
  ) v(nome, sigla, municipio, uf) LOOP
    INSERT INTO public.emenda_beneficiarios (nome, sigla, entrega_municipio, entrega_uf, origem, criado_por_nome, atualizado_por_nome)
    VALUES (r.nome, r.sigla, r.municipio, r.uf, 'CADASTRO', 'Conferência da planilha (rodada 5)', 'Conferência da planilha (rodada 5)')
    ON CONFLICT (chave_identidade) DO NOTHING;
    IF FOUND THEN v_novos := v_novos + 1; END IF;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    ('A010', 'Polícia Militar do Maranhão - Pinheiro/MA', 'MA', '10º Batalhão de Polícia Militar', 'Pinheiro', 'MA'),
    ('A032', 'COMALP – Corpo de Bombeiros Militar do Ceará', 'CE', 'Coordenadoria de Manutenção, Almoxarifado e Patrimônio', 'Fortaleza', 'CE'),
    ('A033', 'Comando de Policiamento de Choque - CPChq/PMESP', 'SP', 'Comando de Policiamento de Choque', 'São Paulo', 'SP'),
    ('A045', 'PCSP / DEMACRO / DP Franco da Rocha', 'SP', 'Delegacia de Polícia do Município', 'Franco da Rocha', 'SP'),
    ('A047', 'Polícia Civil - SP - Departamento de Proteção à Cidadania', 'SP', 'Departamento de Polícia de Proteção à Cidadania', 'São Paulo', 'SP'),
    ('A050', 'Polícia Militar - Divinópolis -MG', 'MG', '23º Batalhão de Polícia Militar', 'Divinópolis', 'MG'),
    ('A051', 'Polícia Militar de Piúma', 'ES', '2º Pelotão da 10ª Companhia Independente de Polícia Militar', 'Piúma', 'ES'),
    ('A061', 'Unidade Aérea Pública - DISTRITO FEDERAL - CBMDF', 'DF', 'Grupamento de Aviação Operacional', 'Brasília', 'DF'),
    ('C043', 'Polícia Civil - RR (GRT)', 'RR', 'Grupo de Resposta Tática', 'Boa Vista', 'RR'),
    ('C044', 'Polícia Militar - RR (CIPTUR )', 'RR', 'Companhia Independente de Policiamento de Trânsito Urbano e Rodoviário', 'Boa Vista', 'RR'),
    ('C045', 'Polícia Militar - RR - ( CIPA )', 'RR', 'Companhia Independente de Policiamento Ambiental', 'Boa Vista', 'RR'),
    ('C104', 'Corpo de Bombeiros Militar de Mariana - MG', 'MG', 'Posto Avançado da 2ª Companhia do 1º Batalhão de Bombeiro Militar', 'Mariana', 'MG'),
    ('C109', 'DEPARTAMENTO DE POLÍCIA CIENTÍFICA DA POLÍCIA CIVIL DO ACRE', 'AC', 'Departamento de Polícia Científica', 'Rio Branco', 'AC'),
    ('C110', 'DP de Timbó - SC', 'SC', 'Delegacia de Polícia da Comarca', 'Timbó', 'SC'),
    ('C162', 'PCAC CORE', 'AC', 'Coordenadoria de Operações e Recursos Especiais', 'Rio Branco', 'AC'),
    ('C163', 'PM-BA(CIDADE DE POÇÕES)', 'BA', '79ª Companhia Independente de Polícia Militar', 'Poções', 'BA'),
    ('C172', 'Polícia Militar - Blumenau -SC', 'SC', '10º Batalhão de Polícia Militar', 'Blumenau', 'SC'),
    ('C180', 'Polícia Militar/CPRL - BA', 'BA', 'Comando de Policiamento da Região Leste', 'Feira de Santana', 'BA'),
    ('D008', 'Polícia Militar - MG (Cidade de Carmo do Cajuru)', 'MG', '23º Batalhão de Polícia Militar', 'Divinópolis', 'MG'),
    ('D011', 'Polícia Militar - MG (Cidade de Pará de Minas)', 'MG', '19ª Companhia Independente de Polícia Militar', 'Pará de Minas', 'MG'),
    ('D012', 'Polícia Militar - RR - ( CP INTERIOR )', 'RR', 'Comando de Policiamento do Interior', 'Boa Vista', 'RR'),
    ('D013', 'Polícia Militar - RR - ( GATE / BOPE )', 'RR', 'Batalhão de Operações Policiais Especiais', 'Boa Vista', 'RR'),
    ('D016', 'Polícia Militar - RR - 2º Batalhão de Polícia', 'RR', '2º Batalhão de Polícia Militar', 'Boa Vista', 'RR'),
    ('D022', 'BBM Cidade de Mondai', 'SC', '2º Grupamento de Bombeiro Militar do 3º Pelotão da 1ª Companhia do 12º Batalhão de Bombeiro Militar', 'Mondaí', 'SC'),
    ('D023', 'BOPE - AC', 'AC', 'Batalhão de Operações Policiais Especializado', 'Rio Branco', 'AC'),
    ('D032', 'Corpo de Bombeiros Militar UBM da cidade de Novo Horizonte - SP', 'SP', 'Unidade de Bombeiro Militar', 'Novo Horizonte', 'SP'),
    ('D034', 'Corpo de Bombeiros Militar – SC - BBM Cidade de Brusque', 'SC', '3ª Companhia do 3º Batalhão de Bombeiro Militar', 'Brusque', 'SC'),
    ('D042', '1° BPM - BUJARI/AC', 'AC', '1º Batalhão de Polícia Militar', 'Rio Branco', 'AC'),
    ('D044', '3° BPM PORTO ACRE/AC', 'AC', '3º Batalhão de Polícia Militar', 'Rio Branco', 'AC'),
    ('D046', '4° BPM CAPIXABA/AC', 'AC', '4º Batalhão de Polícia Militar', 'Senador Guiomard', 'AC'),
    ('D047', '4° BPM VILA CAMPINAS/AC', 'AC', '4º Batalhão de Polícia Militar', 'Senador Guiomard', 'AC'),
    ('D051', '6° BPM MARECHAL THAUMATURGO/AC', 'AC', '6º Batalhão de Polícia Militar', 'Cruzeiro do Sul', 'AC'),
    ('D052', '6° BPM PORTO WALTER/AC', 'AC', '6º Batalhão de Polícia Militar', 'Cruzeiro do Sul', 'AC'),
    ('D053', '6° BPM RODRIGUES ALVES/AC', 'AC', '6º Batalhão de Polícia Militar', 'Cruzeiro do Sul', 'AC'),
    ('D056', '8° BPM SANTA ROSA/AC', 'AC', '8º Batalhão de Polícia Militar', 'Sena Madureira', 'AC'),
    ('D069', 'BPM Campos Novos - SC', 'SC', '3ª Companhia do 26º Batalhão de Polícia Militar', 'Campos Novos', 'SC'),
    ('D071', 'BPM Cidade de Guaraciaba - MG', 'MG', '21ª Companhia Independente de Polícia Militar', 'Guaraciaba', 'MG'),
    ('D072', 'BPM cidade de Caibi - SC', 'SC', '2º Grupo do 2º Pelotão da 4ª Companhia do 2º Batalhão de Polícia Militar de Fronteira', 'Caibi', 'SC'),
    ('D073', 'BPM cidade de Gravatal - SC', 'SC', '2ª Companhia do 35º Batalhão de Polícia Militar', 'Gravatal', 'SC'),
    ('D075', 'BPM cidade de Urussanga - SC', 'SC', '2ª Companhia do 29º Batalhão de Polícia Militar', 'Urussanga', 'SC'),
    ('D077', 'BPM do Interior (Fernandópolis)', 'SP', '16º Batalhão de Polícia Militar do Interior', 'Fernandópolis', 'SP'),
    ('D078', 'Batalhão Ambiental cidade de Caçador', 'SC', '2º Grupo do 2º Pelotão da 3ª Companhia do 2º Batalhão de Polícia Militar Ambiental', 'Caçador', 'SC'),
    ('D079', 'Batalhão Ambiental cidade de Porto União', 'SC', '1º Grupo do 2º Pelotão da 3ª Companhia do 2º Batalhão de Polícia Militar Ambiental', 'Porto União', 'SC'),
    ('D092', 'Corpo de Bombeiros Militar - SC - BBM cidade de Videira', 'SC', '2ª Companhia do 2º Batalhão de Bombeiro Militar', 'Videira', 'SC'),
    ('D095', 'Corpo de Bombeiros Militar – SC - BBM Cidade de Mondai', 'SC', '2º Grupamento de Bombeiro Militar do 3º Pelotão da 1ª Companhia do 12º Batalhão de Bombeiro Militar', 'Mondaí', 'SC'),
    ('D096', 'Corpo de Bombeiros Militar – SC BBM Cidade de Timbó', 'SC', '2ª Companhia do 3º Batalhão de Bombeiro Militar', 'Timbó', 'SC'),
    ('D136', 'Polícia Militar - BA/Cipó', 'BA', '21ª Companhia Independente de Polícia Militar', 'Cipó', 'BA'),
    ('D137', 'Polícia Militar - BA/Mucugê', 'BA', '42ª Companhia Independente de Polícia Militar', 'Lençóis', 'BA'),
    ('D139', 'Polícia Militar - BPM de Bombinhas - SC', 'SC', '3º Pelotão da 1ª Companhia do 31º Batalhão de Polícia Militar', 'Bombinhas', 'SC'),
    ('D141', 'Polícia Militar - Carmo do Cajuru - MG', 'MG', '23º Batalhão de Polícia Militar', 'Divinópolis', 'MG'),
    ('D142', 'Polícia Militar - ES - Batalhão de ações com cães (BAC)', 'ES', 'Batalhão de Ações com Cães', 'Vitória', 'ES'),
    ('D151', 'Polícia Militar - Pará de Minas - MG', 'MG', '19ª Companhia Independente de Polícia Militar', 'Pará de Minas', 'MG'),
    ('D154', 'Polícia Militar - SC - BPM Cidade de Ipuaçu', 'SC', '3º Grupo do 2º Pelotão da 2ª Companhia do 30º Batalhão de Polícia Militar', 'Ipuaçu', 'SC'),
    ('D155', 'Polícia Militar - SC - BPM Cidade de Porto União', 'SC', '2ª Companhia do 3º Batalhão de Polícia Militar', 'Porto União', 'SC'),
    ('D159', 'Polícia Militar - SC BPM Cidade de Balneário Barra do Sul', 'SC', '1º Grupo do 3º Pelotão da 2ª Companhia do 27º Batalhão de Polícia Militar', 'Balneário Barra do Sul', 'SC'),
    ('D162', 'Polícia Militar - Timbó - SC', 'SC', '2ª Companhia do 32º Batalhão de Polícia Militar', 'Timbó', 'SC'),
    ('D163', 'Polícia Militar BA/Cansanção BA', 'BA', '7ª Companhia Independente de Polícia Militar', 'Monte Santo', 'BA')
  ) v(linha, texto, uf, nome, municipio, uf_cadastro) LOOP
    SELECT b.id INTO v_id FROM public.emenda_beneficiarios b
     WHERE b.ativo AND b.nome = r.nome AND b.entrega_municipio = r.municipio AND b.entrega_uf = r.uf_cadastro;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Unidade % (%/%) não achada.', r.nome, r.municipio, r.uf_cadastro;
    END IF;
    v_total := v_total + public.fisc_ligar_nome_ao_cadastro(r.texto, r.uf, v_id, 'rodada 5');
    v_id := NULL;
  END LOOP;
  RAISE NOTICE 'Rodada 5: % cadastros novos, % itens ligados', v_novos, v_total;
END $$;
