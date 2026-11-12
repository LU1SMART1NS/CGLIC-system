-- Fiscalização: as 4 dúvidas da conferência da planilha, resolvidas em 12/11/2026.
-- - "Unidade Aérea Pública - RS" (2 itens do Projeto Pegasus): o usuário informou que são do Corpo de Bombeiros Militar
--   do Rio Grande do Sul (cadastro novo, CBMRS, Porto Alegre).
-- - "COGESPAD" (AC): no SEI aparece entre as unidades da PM do Acre ("Bancada - AC · COGESPAD · PM"); liga à PMAC.
-- - "ES" (sem UF, contrato 00071/2023): o Termo de Recebimento Provisório do ES (SEI 28597814) mostra a Secretaria de
--   Estado da Segurança Pública e Defesa Social do ES recebendo os sedans; liga à SESP/ES.

DO $$
DECLARE v_id uuid; v_total INTEGER := 0;
BEGIN
  INSERT INTO public.emenda_beneficiarios (nome, sigla, entrega_municipio, entrega_uf, origem, criado_por_nome, atualizado_por_nome)
  VALUES ('Corpo de Bombeiros Militar do Estado do Rio Grande do Sul', 'CBMRS', 'Porto Alegre', 'RS', 'CADASTRO',
          'Conferência da planilha (dúvidas)', 'Conferência da planilha (dúvidas)')
  ON CONFLICT (chave_identidade) DO NOTHING;

  SELECT id INTO v_id FROM public.emenda_beneficiarios WHERE ativo AND nome = 'Corpo de Bombeiros Militar do Estado do Rio Grande do Sul' AND entrega_uf = 'RS';
  v_total := v_total + public.fisc_ligar_nome_ao_cadastro('Unidade Aérea Pública - RIO GRANDE DO SUL (CMBRS)', 'RS', v_id, 'dúvidas');
  v_total := v_total + public.fisc_ligar_nome_ao_cadastro('Unidade Aérea Pública - Rio Grande do Sul/RS', 'RS', v_id, 'dúvidas');

  SELECT id INTO v_id FROM public.emenda_beneficiarios WHERE ativo AND nome = 'Polícia Militar do Estado do Acre' AND entrega_uf = 'AC';
  v_total := v_total + public.fisc_ligar_nome_ao_cadastro('COGESPAD', 'AC', v_id, 'dúvidas');

  SELECT id INTO v_id FROM public.emenda_beneficiarios WHERE ativo AND nome = 'Secretaria de Estado da Segurança Pública e Defesa Social do Espírito Santo' AND entrega_uf = 'ES';
  v_total := v_total + public.fisc_ligar_nome_ao_cadastro('ES', NULL, v_id, 'dúvidas');

  IF v_total <> 4 THEN
    RAISE EXCEPTION 'Esperava 4 itens ligados, liguei %.', v_total;
  END IF;
END $$;
