-- Fiscalização, rodada 3 conferida pelo usuário (12/11/2026): órgãos do estado que faltavam no cadastro de beneficiários
-- e casos acertados. Cria 35 cadastros no padrão "Órgão do Estado de X" (sigla e capital como cidade de entrega) e
-- liga 58 nomes escritos na planilha da SFC/CGLIC (fisc_ligar_nome_ao_cadastro, migration 275). Dois nomes vão para
-- cadastros que já existiam: Bombeiros de SP (CBPMESP) e Bombeiros da Bahia (texto "DF", emenda 24710007 da BA).

DO $$
DECLARE r RECORD; v_id uuid; v_total INTEGER := 0; v_novos INTEGER := 0;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Brigada Militar do Estado do Rio Grande do Sul', 'Porto Alegre', 'RS', 'BMRS'),
    ('Corpo de Bombeiros Militar do Estado de Minas Gerais', 'Belo Horizonte', 'MG', 'CBMMG'),
    ('Polícia Científica do Estado do Espírito Santo', 'Vitória', 'ES', 'PCIES'),
    ('Corpo de Bombeiros Militar do Estado de Mato Grosso do Sul', 'Campo Grande', 'MS', 'CBMMS'),
    ('Corpo de Bombeiros Militar do Estado de Goiás', 'Goiânia', 'GO', 'CBMGO'),
    ('Polícia Civil do Estado do Acre', 'Rio Branco', 'AC', 'PCAC'),
    ('Polícia Militar do Estado da Bahia', 'Salvador', 'BA', 'PMBA'),
    ('Corpo de Bombeiros Militar do Estado do Piauí', 'Teresina', 'PI', 'CBMPI'),
    ('Corpo de Bombeiros Militar do Estado do Rio Grande do Norte', 'Natal', 'RN', 'CBMRN'),
    ('Corpo de Bombeiros Militar do Estado de Santa Catarina', 'Florianópolis', 'SC', 'CBMSC'),
    ('Polícia Civil do Estado de Goiás', 'Goiânia', 'GO', 'PCGO'),
    ('Polícia Militar do Estado de Mato Grosso do Sul', 'Campo Grande', 'MS', 'PMMS'),
    ('Polícia Penal do Estado de Roraima', 'Boa Vista', 'RR', 'PPRR'),
    ('Polícia Militar do Estado da Paraíba', 'João Pessoa', 'PB', 'PMPB'),
    ('Polícia Militar do Estado do Tocantins', 'Palmas', 'TO', 'PMTO'),
    ('Polícia Civil do Estado do Rio Grande do Norte', 'Natal', 'RN', 'PCRN'),
    ('Polícia Militar do Estado de Santa Catarina', 'Florianópolis', 'SC', 'PMSC'),
    ('Polícia Militar do Estado do Acre', 'Rio Branco', 'AC', 'PMAC'),
    ('Polícia Civil do Estado de Alagoas', 'Maceió', 'AL', 'PCAL'),
    ('Polícia Militar do Estado do Paraná', 'Curitiba', 'PR', 'PMPR'),
    ('Corpo de Bombeiros Militar do Estado da Paraíba', 'João Pessoa', 'PB', 'CBMPB'),
    ('Polícia Civil do Estado do Pará', 'Belém', 'PA', 'PCPA'),
    ('Polícia Civil do Estado da Paraíba', 'João Pessoa', 'PB', 'PCPB'),
    ('Polícia Civil do Estado de Santa Catarina', 'Florianópolis', 'SC', 'PCSC'),
    ('Polícia Militar do Estado do Pará', 'Belém', 'PA', 'PMPA'),
    ('Polícia Militar do Estado do Rio Grande do Norte', 'Natal', 'RN', 'PMRN'),
    ('Corpo de Bombeiros Militar do Estado do Acre', 'Rio Branco', 'AC', 'CBMAC'),
    ('Polícia Militar do Estado do Amapá', 'Macapá', 'AP', 'PMAP'),
    ('Polícia Científica do Estado do Pará', 'Belém', 'PA', 'PCIPA'),
    ('Polícia Civil do Estado do Piauí', 'Teresina', 'PI', 'PCPI'),
    ('Polícia Civil do Estado de Rondônia', 'Porto Velho', 'RO', 'PCRO'),
    ('Polícia Civil do Estado de Mato Grosso do Sul', 'Campo Grande', 'MS', 'PCMS'),
    ('Polícia Militar do Estado de Alagoas', 'Maceió', 'AL', 'PMAL'),
    ('Polícia Militar do Estado do Amazonas', 'Manaus', 'AM', 'PMAM'),
    ('Polícia Militar do Estado de Goiás', 'Goiânia', 'GO', 'PMGO')
  ) v(nome, municipio, uf, sigla) LOOP
    INSERT INTO public.emenda_beneficiarios (nome, sigla, entrega_municipio, entrega_uf, origem, criado_por_nome, atualizado_por_nome)
    VALUES (r.nome, r.sigla, r.municipio, r.uf, 'CADASTRO', 'Conferência da planilha (rodada 3)', 'Conferência da planilha (rodada 3)')
    ON CONFLICT (chave_identidade) DO NOTHING;
    IF FOUND THEN v_novos := v_novos + 1; END IF;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    ('A022', 'Corpo de Bombeiros - DF', 'BA', 'Corpo de Bombeiros Militar do Estado da Bahia', NULL, 'BA', 'd0f8ce95-47dd-42a5-893e-83ed48a53c74'),
    ('A030', 'Brigada Militar - RS', 'RS', 'Brigada Militar do Estado do Rio Grande do Sul', 'Porto Alegre', 'RS', NULL),
    ('A039', 'Corpo de Bombeiros Militar de Minas Gerais', 'RJ', 'Corpo de Bombeiros Militar do Estado de Minas Gerais', 'Belo Horizonte', 'MG', NULL),
    ('A046', 'Polícia Científica do Estado do Espírito Santo – PCIES SEI 36485037', 'ES', 'Polícia Científica do Estado do Espírito Santo', 'Vitória', 'ES', NULL),
    ('C003', 'Corpo de Bombeiros Militar - MG', 'MG', 'Corpo de Bombeiros Militar do Estado de Minas Gerais', 'Belo Horizonte', 'MG', NULL),
    ('C005', 'Corpo de Bombeiros Militar - MS', 'MS', 'Corpo de Bombeiros Militar do Estado de Mato Grosso do Sul', 'Campo Grande', 'MS', NULL),
    ('C008', 'Corpo de Bombeiros Militar - GO', 'GO', 'Corpo de Bombeiros Militar do Estado de Goiás', 'Goiânia', 'GO', NULL),
    ('C009', 'PCAC GERAL', 'AC', 'Polícia Civil do Estado do Acre', 'Rio Branco', 'AC', NULL),
    ('C010', 'Polícia Militar da Bahia', 'BA', 'Polícia Militar do Estado da Bahia', 'Salvador', 'BA', NULL),
    ('C011', 'Corpo de Bombeiros Militar - PI', 'PI', 'Corpo de Bombeiros Militar do Estado do Piauí', 'Teresina', 'PI', NULL),
    ('C014', 'Polícia Militar - BA', 'BA', 'Polícia Militar do Estado da Bahia', 'Salvador', 'BA', NULL),
    ('C015', 'Corpo de Bombeiros Militar - RN', 'RN', 'Corpo de Bombeiros Militar do Estado do Rio Grande do Norte', 'Natal', 'RN', NULL),
    ('C019', 'Corpo de Bombeiros Militar - SC', 'SC', 'Corpo de Bombeiros Militar do Estado de Santa Catarina', 'Florianópolis', 'SC', NULL),
    ('C032', 'Polícia Civil do Estado de Goiás', 'GO', 'Polícia Civil do Estado de Goiás', 'Goiânia', 'GO', NULL),
    ('C033', 'Corpo de Bombeiros Militar - SP', 'SP', 'Corpo de Bombeiros Militar do Estado de São Paulo', NULL, 'SP', '9408e041-efa0-4f42-a2b6-4c0bc3f029f6'),
    ('C046', 'Polícia Militar do Mato Grosso do Sul', 'MS', 'Polícia Militar do Estado de Mato Grosso do Sul', 'Campo Grande', 'MS', NULL),
    ('C047', 'Polícia Penal - RR', 'RR', 'Polícia Penal do Estado de Roraima', 'Boa Vista', 'RR', NULL),
    ('C061', 'Polícia Militar - PB', 'PB', 'Polícia Militar do Estado da Paraíba', 'João Pessoa', 'PB', NULL),
    ('C062', 'Polícia Militar do Tocantins - TO', 'TO', 'Polícia Militar do Estado do Tocantins', 'Palmas', 'TO', NULL),
    ('C071', 'Polícia Civil - RN', 'RN', 'Polícia Civil do Estado do Rio Grande do Norte', 'Natal', 'RN', NULL),
    ('C072', 'Polícia Militar - SC', 'SC', 'Polícia Militar do Estado de Santa Catarina', 'Florianópolis', 'SC', NULL),
    ('C073', 'Polícia Militar - TO', 'TO', 'Polícia Militar do Estado do Tocantins', 'Palmas', 'TO', NULL),
    ('C078', 'PMAC', 'AC', 'Polícia Militar do Estado do Acre', 'Rio Branco', 'AC', NULL),
    ('C079', 'Polícia Civil de Alagoas', 'AL', 'Polícia Civil do Estado de Alagoas', 'Maceió', 'AL', NULL),
    ('C080', 'COMANDO GERAL DA PMPR', 'PR', 'Polícia Militar do Estado do Paraná', 'Curitiba', 'PR', NULL),
    ('C081', 'Corpo de Bombeiros - SP', 'SP', 'Corpo de Bombeiros Militar do Estado de São Paulo', NULL, 'SP', '9408e041-efa0-4f42-a2b6-4c0bc3f029f6'),
    ('C082', 'Corpo de Bombeiros Militar - PB', 'PB', 'Corpo de Bombeiros Militar do Estado da Paraíba', 'João Pessoa', 'PB', NULL),
    ('C091', 'PCAC', 'AC', 'Polícia Civil do Estado do Acre', 'Rio Branco', 'AC', NULL),
    ('C092', 'Polícia Civil - GO', 'GO', 'Polícia Civil do Estado de Goiás', 'Goiânia', 'GO', NULL),
    ('C093', 'Polícia Civil - PA', 'PA', 'Polícia Civil do Estado do Pará', 'Belém', 'PA', NULL),
    ('C094', 'Polícia Civil - PB', 'PB', 'Polícia Civil do Estado da Paraíba', 'João Pessoa', 'PB', NULL),
    ('C095', 'Polícia Civil - SC', 'SC', 'Polícia Civil do Estado de Santa Catarina', 'Florianópolis', 'SC', NULL),
    ('C097', 'Polícia Militar - PA', 'PA', 'Polícia Militar do Estado do Pará', 'Belém', 'PA', NULL),
    ('C098', 'Polícia Militar - RN', 'RN', 'Polícia Militar do Estado do Rio Grande do Norte', 'Natal', 'RN', NULL),
    ('C099', 'CBMAC', 'AC', 'Corpo de Bombeiros Militar do Estado do Acre', 'Rio Branco', 'AC', NULL),
    ('C100', 'Corpo de Bombeiro Militar - AC', 'AC', 'Corpo de Bombeiros Militar do Estado do Acre', 'Rio Branco', 'AC', NULL),
    ('C102', 'Corpo de Bombeiro Militar - MG', 'MG', 'Corpo de Bombeiros Militar do Estado de Minas Gerais', 'Belo Horizonte', 'MG', NULL),
    ('C103', 'Corpo de Bombeiros Militar - AC', 'AC', 'Corpo de Bombeiros Militar do Estado do Acre', 'Rio Branco', 'AC', NULL),
    ('C105', 'Corpo de Bombeiros Militar de Minas Gerais', 'MG', 'Corpo de Bombeiros Militar do Estado de Minas Gerais', 'Belo Horizonte', 'MG', NULL),
    ('C106', 'Corpo de Bombeiros Militar de Minas Gerais - CBM MG', 'MG', 'Corpo de Bombeiros Militar do Estado de Minas Gerais', 'Belo Horizonte', 'MG', NULL),
    ('C107', 'Corpo de Bombeiros Militar do Mato Grosso do Sul', 'MS', 'Corpo de Bombeiros Militar do Estado de Mato Grosso do Sul', 'Campo Grande', 'MS', NULL),
    ('C108', 'Corpo de Bombeiros Militar do Piauí', 'PI', 'Corpo de Bombeiros Militar do Estado do Piauí', 'Teresina', 'PI', NULL),
    ('C164', 'PMAP', 'AP', 'Polícia Militar do Estado do Amapá', 'Macapá', 'AP', NULL),
    ('C165', 'Polícia Científica do Estado do Pará – PCIPA', 'PA', 'Polícia Científica do Estado do Pará', 'Belém', 'PA', NULL),
    ('C166', 'Polícia Civil - AL', 'AL', 'Polícia Civil do Estado de Alagoas', 'Maceió', 'AL', NULL),
    ('C167', 'Polícia Civil - Alagoas', 'AL', 'Polícia Civil do Estado de Alagoas', 'Maceió', 'AL', NULL),
    ('C168', 'Polícia Civil - PI', 'PI', 'Polícia Civil do Estado do Piauí', 'Teresina', 'PI', NULL),
    ('C169', 'Polícia Civil do Estado da Paraíba SEI 36485245', 'PB', 'Polícia Civil do Estado da Paraíba', 'João Pessoa', 'PB', NULL),
    ('C170', 'Polícia Civil do Estado de Rondônia SEI 36502615', 'RO', 'Polícia Civil do Estado de Rondônia', 'Porto Velho', 'RO', NULL),
    ('C171', 'Polícia Civil do Estado do Mato Grosso do Sul', 'MS', 'Polícia Civil do Estado de Mato Grosso do Sul', 'Campo Grande', 'MS', NULL),
    ('C174', 'Polícia Militar da Bahia – PMBA', 'BA', 'Polícia Militar do Estado da Bahia', 'Salvador', 'BA', NULL),
    ('C175', 'Polícia Militar da Paraíba', 'PB', 'Polícia Militar do Estado da Paraíba', 'João Pessoa', 'PB', NULL),
    ('C176', 'Polícia Militar de Alagoas - AL', 'AL', 'Polícia Militar do Estado de Alagoas', 'Maceió', 'AL', NULL),
    ('C177', 'Polícia Militar do Amazonas - AM', 'AM', 'Polícia Militar do Estado do Amazonas', 'Manaus', 'AM', NULL),
    ('C178', 'Polícia Militar do Estado do Mato Grosso do Sul', 'MS', 'Polícia Militar do Estado de Mato Grosso do Sul', 'Campo Grande', 'MS', NULL),
    ('C179', 'Polícia Militar do Mato Grosso do Sul (PMMS)', 'MS', 'Polícia Militar do Estado de Mato Grosso do Sul', 'Campo Grande', 'MS', NULL),
    ('C181', 'Polícia Penal do Estado de Roraima', 'RR', 'Polícia Penal do Estado de Roraima', 'Boa Vista', 'RR', NULL),
    ('C182', 'Polícia militar do Estado de Goiás', 'GO', 'Polícia Militar do Estado de Goiás', 'Goiânia', 'GO', NULL)
  ) v(linha, texto, uf, nome, municipio, uf_cadastro, existente) LOOP
    IF r.existente IS NOT NULL THEN
      v_id := r.existente::uuid;
    ELSE
      SELECT b.id INTO v_id FROM public.emenda_beneficiarios b
       WHERE b.ativo AND b.nome = r.nome AND b.entrega_municipio = r.municipio AND b.entrega_uf = r.uf_cadastro;
    END IF;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Cadastro % não achado.', r.nome;
    END IF;
    v_total := v_total + public.fisc_ligar_nome_ao_cadastro(r.texto, r.uf, v_id, 'rodada 3');
    v_id := NULL;
  END LOOP;
  RAISE NOTICE 'Rodada 3: % cadastros novos, % itens ligados', v_novos, v_total;
END $$;
