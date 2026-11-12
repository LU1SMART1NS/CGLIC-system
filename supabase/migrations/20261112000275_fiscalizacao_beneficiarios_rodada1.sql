-- Fiscalização: beneficiário escrito na planilha da SFC/CGLIC ligado ao cadastro, em rodadas conferidas pelo usuário.
-- Rodada 1 (12/11/2026): 56 nomes escritos (221 itens) ligados a 30 cadastros que já existiam (órgãos do estado,
-- guardas e unidades já cadastradas). Lista de conferência: .claude/relatorios/beneficiarios-planilha-sfc-2026-11-11.html.
-- fisc_ligar_nome_ao_cadastro(texto, UF, beneficiário): liga os itens CARGA sem cadastro com o mesmo nome escrito
-- (fisc_chave_do_nome, migration 272) e a mesma UF; o nome escrito entra nas outras grafias do cadastro; histórico
-- tipo BENEFICIARIO. Fica para as próximas rodadas (só o banco a chama).

CREATE OR REPLACE FUNCTION public.fisc_ligar_nome_ao_cadastro(p_texto text, p_uf text, p_beneficiario_id uuid, p_rodada text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_b public.emenda_beneficiarios%ROWTYPE;
  v_n INTEGER;
BEGIN
  SELECT * INTO v_b FROM public.emenda_beneficiarios WHERE id = p_beneficiario_id;
  IF NOT FOUND OR NOT v_b.ativo THEN
    RAISE EXCEPTION 'Beneficiário % não existe ou está desativado (nome escrito: %).', p_beneficiario_id, p_texto;
  END IF;
  WITH alvo AS (
    UPDATE public.fisc_entregas e
       SET beneficiario_id = v_b.id, atualizado_por_nome = 'Conferência da planilha (' || p_rodada || ')', atualizado_em = NOW()
     WHERE e.beneficiario_id IS NULL AND e.origem = 'CARGA'
       AND public.fisc_chave_do_nome(e.beneficiario_texto) = public.fisc_chave_do_nome(p_texto)
       AND upper(btrim(COALESCE(e.uf_texto, ''))) = upper(btrim(COALESCE(p_uf, '')))
    RETURNING e.id, e.beneficiario_texto
  ), mov AS (
    INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, observacao, criado_por_nome)
    SELECT a.id, 'BENEFICIARIO', 'Ligado a ' || v_b.nome || ' pela conferência da planilha (na planilha: "' || a.beneficiario_texto || '")',
           'Conferência da planilha (' || p_rodada || ')'
      FROM alvo a
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM mov;
  UPDATE public.emenda_beneficiarios b
     SET outros_nomes = ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(b.outros_nomes, ARRAY[]::TEXT[]) || ARRAY[btrim(p_texto)]) x
                               WHERE public.fisc_normalizar(x) <> public.fisc_normalizar(b.nome))
   WHERE b.id = v_b.id AND v_n > 0;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.fisc_ligar_nome_ao_cadastro(text, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE r RECORD; v_total INTEGER := 0;
BEGIN
  FOR r IN SELECT * FROM (VALUES
  ('A001', 'Polícia Civil - MG', 'MG', 'e31b65ea-4098-4b20-a72d-080ab7d10452'::uuid),
  ('A002', 'Polícia Civil do Estado do PR', 'PR', '7928980e-0c6a-4f93-8408-62ff2e3cf514'::uuid),
  ('A003', 'Polícia Militar do Espiríto Santo - ES', 'ES', '2cb83638-bd45-4956-9369-46e32ddafad5'::uuid),
  ('A004', 'GM cidade de Jaboatão dos Guararapes - PE', 'PE', '6d0729dc-8932-4dba-b8c0-36ff73e3b3b6'::uuid),
  ('A005', 'Polícia Civil do Espírito Santo - ES', 'ES', '516c219c-8103-4edf-9a98-d9aadccc2420'::uuid),
  ('A006', 'Polícia Militar - SP', 'SP', 'dbb601d6-220b-40fd-a4e6-583cbc48118c'::uuid),
  ('A007', 'Polícia Militar - ES', 'ES', '2cb83638-bd45-4956-9369-46e32ddafad5'::uuid),
  ('A008', 'Corpo de Bombeiros - DF', 'DF', 'd03da3d5-ade1-4628-b6dd-57cea0303e0a'::uuid),
  ('A009', 'Polícia Militar Minas Gerais - MG', 'MG', 'f13e9497-e2bd-4c2b-995b-4d6552f09319'::uuid),
  ('A011', 'GM cidade de Camaragibe - PE', 'PE', '35491186-3a17-454b-a6e1-b032f443dcf5'::uuid),
  ('A012', 'Corpo de Bombeiro Militar - BA', 'BA', 'd0f8ce95-47dd-42a5-893e-83ed48a53c74'::uuid),
  ('A013', 'GM - Município de Francisco Morato - SP', 'SP', 'cd8d473a-853c-4ffb-a65d-b18290ad407e'::uuid),
  ('A014', 'Polícia Militar do Estado de São Paulo', 'SP', 'dbb601d6-220b-40fd-a4e6-583cbc48118c'::uuid),
  ('A015', 'Secretaria de Estado de Polícia Civil - RJ', 'RJ', '56060f5f-8c20-4886-9055-ee6412b948f9'::uuid),
  ('A016', 'Polícia Civil do Estado de São Paulo', 'SP', 'bad51dc0-2fa3-4183-93d1-061cbb99678a'::uuid),
  ('A017', 'Corpo de Bombeiros Militar - Alagoas', 'AL', 'f2ce96cb-00d1-4506-94b5-72e83910cd16'::uuid),
  ('A018', 'Polícia Civil - SP', 'SP', 'bad51dc0-2fa3-4183-93d1-061cbb99678a'::uuid),
  ('A019', 'Polícia Militar do Maranhão - MA', 'MA', 'f0c0ad5e-e2a6-4f93-8af5-613a9bb7bba5'::uuid),
  ('A020', 'Secretaria de Estado da Defesa Civil do Rio de Janeiro ( CBMRJ)', 'RJ', '14bf5823-34f1-4cc3-95b8-f11b664dddd5'::uuid),
  ('A023', 'Corpo de Bombeiros Militar do Ceará', 'CE', '0e156669-6fbb-458f-9471-8244d563a0c8'::uuid),
  ('A024', 'Corpo de Bombeiros Militar do DF', 'DF', 'd03da3d5-ade1-4628-b6dd-57cea0303e0a'::uuid),
  ('A025', 'Polícia Civil de Minas Gerais', 'MG', 'e31b65ea-4098-4b20-a72d-080ab7d10452'::uuid),
  ('A026', 'Polícia Militar - RO', 'RO', 'fc8f82fb-5608-4b7a-beab-fdbec0700747'::uuid),
  ('A027', 'Secretaria de Estado da Defesa Civil (CBMRJ)', 'RJ', '14bf5823-34f1-4cc3-95b8-f11b664dddd5'::uuid),
  ('A028', 'Secretaria de Estado da Defesa Social do Rio de Janeiro - RJ (CBMERJ)', 'RJ', '14bf5823-34f1-4cc3-95b8-f11b664dddd5'::uuid),
  ('A029', 'Secretaria de Estado de Polícia Civil do Rio de Janeiro - RJ (PCERJ)', 'RJ', '56060f5f-8c20-4886-9055-ee6412b948f9'::uuid),
  ('A031', 'CBM - BA', 'BA', 'd0f8ce95-47dd-42a5-893e-83ed48a53c74'::uuid),
  ('A034', 'Corpo de Bombeiro Militar - DF', 'DF', 'd03da3d5-ade1-4628-b6dd-57cea0303e0a'::uuid),
  ('A035', 'Corpo de Bombeiro Militar - PA', 'PA', '078cee8c-366f-4a6c-97a6-665af0959900'::uuid),
  ('A036', 'Corpo de Bombeiros Militar - Bahia', 'BA', 'd0f8ce95-47dd-42a5-893e-83ed48a53c74'::uuid),
  ('A037', 'Corpo de Bombeiros Militar - MA', 'MA', 'cf90fcaa-b2be-41ba-a1c3-60df740c21f5'::uuid),
  ('A038', 'Corpo de Bombeiros Militar da Bahia', 'BA', 'd0f8ce95-47dd-42a5-893e-83ed48a53c74'::uuid),
  ('A040', 'GCM - Município de Francisco Morato - SP', 'SP', 'cd8d473a-853c-4ffb-a65d-b18290ad407e'::uuid),
  ('A041', 'GM de Camaragibe - PE', 'PE', '35491186-3a17-454b-a6e1-b032f443dcf5'::uuid),
  ('A042', 'GM de Jaboatão dos Guararapes - PE', 'PE', '6d0729dc-8932-4dba-b8c0-36ff73e3b3b6'::uuid),
  ('A043', 'Guarda Civil Municipal de Itapissuma', 'PE', '672a9223-0afc-4826-9112-956a29676eac'::uuid),
  ('A044', 'Guarda Civil Municipal de Ponta Porã/MS', 'MS', '78c566b6-22a3-4a0f-addf-0d2f9af197a9'::uuid),
  ('A048', 'Polícia Civil da Bahia - BA', 'BA', '039e2fc9-ff59-40f1-8128-19f6f79c3e65'::uuid),
  ('A049', 'Polícia Civil do Estado de Minas Gerais SEI 36466213', 'MG', 'e31b65ea-4098-4b20-a72d-080ab7d10452'::uuid),
  ('A052', 'SSP/RJ - PCERJ', 'RJ', '56060f5f-8c20-4886-9055-ee6412b948f9'::uuid),
  ('A053', 'Secretaria de Estado da Defesa Civil - CBM RJ', 'RJ', '14bf5823-34f1-4cc3-95b8-f11b664dddd5'::uuid),
  ('A054', 'Secretaria de Estado da Polícia Militar do Rio de Janeiro', 'RJ', '15e38425-a89f-4830-b82b-2fe207739ff6'::uuid),
  ('A055', 'Secretaria de Estado de Defesa Civil do Rio de Janeiro-RJ (CBMRJ)', 'RJ', '14bf5823-34f1-4cc3-95b8-f11b664dddd5'::uuid),
  ('A056', 'Secretaria de Estado do Corpo de Bombeiro Militar - RJ', 'RJ', '14bf5823-34f1-4cc3-95b8-f11b664dddd5'::uuid),
  ('A057', 'Secretaria de Segurança Pública - SP - (PMSP )', 'SP', 'dbb601d6-220b-40fd-a4e6-583cbc48118c'::uuid),
  ('A058', 'Secretaria de Segurança de Defesa Civil do Rio de Janeiro CBMRJ', 'RJ', '14bf5823-34f1-4cc3-95b8-f11b664dddd5'::uuid),
  ('B001', 'Corpo de Bombeiros Militar - SC BBM Cidade de Salto Veloso', 'SC', '0a2ec106-6457-4f65-8bb5-6aae44cf49b6'::uuid),
  ('B002', 'Corpo de Bombeiros Militar – SC - BBM Cidade de Blumenau', 'SC', '26eb8512-d0d8-4fb5-a3ad-0165b5d749f8'::uuid),
  ('B003', 'BBM Cidade de Blumenau', 'SC', '26eb8512-d0d8-4fb5-a3ad-0165b5d749f8'::uuid),
  ('D050', '6ª Delegacia Seccional de Polícia DECAP (Polícia Civil do Estado de São Paulo)', 'SP', 'a7c14338-739d-4e88-9057-ec46d7240500'::uuid),
  ('D103', 'PCSP / DEINTER 4 / DEIC', 'SP', '431372cc-90cb-4935-a41d-0974ff7d9121'::uuid),
  ('D110', 'PM - SC - 11º BPM de Fronteira Cidade de S. Miguel do Oeste', 'SC', 'd8be2b7d-21f4-45d2-9a4b-84c5d54615dc'::uuid),
  ('D119', 'Polícia Civil do Estado de São Paulo (DECAP / 1ª Seccional)', 'SP', 'de3542df-2eeb-41e0-adee-e195adcf7b91'::uuid),
  ('D124', 'Polícia Civil do Estado de São Paulo - 6ª DP Seccional de Polícia – DECAP', 'SP', 'a7c14338-739d-4e88-9057-ec46d7240500'::uuid),
  ('D158', 'Polícia Militar - SC 11º BPM Cidade de Fronteira Cidade de São Miguel do Oeste', 'SC', 'd8be2b7d-21f4-45d2-9a4b-84c5d54615dc'::uuid),
  ('C053', 'Guarda Civil Municipal de ltapissuma - PE', 'PE', '672a9223-0afc-4826-9112-956a29676eac'::uuid)
  ) v(linha, texto, uf, beneficiario_id) LOOP
    v_total := v_total + public.fisc_ligar_nome_ao_cadastro(r.texto, r.uf, r.beneficiario_id, 'rodada 1');
  END LOOP;
  RAISE NOTICE 'Rodada 1: % itens ligados', v_total;
END $$;
