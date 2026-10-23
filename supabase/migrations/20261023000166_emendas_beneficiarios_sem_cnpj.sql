-- ==============================================================================
-- MIGRATION 166: EMENDAS PARLAMENTARES — BENEFICIÁRIO SEM CNPJ OBRIGATÓRIO E SEM REPETIDOS
-- Versão: 20261023000166_emendas_beneficiarios_sem_cnpj.sql
--
-- A carga das planilhas da CAEP (migration 160) guardou o beneficiário só pelo nome (beneficiario_nome): 2.191 linhas,
-- 645 grafias, nenhum cadastro. Protótipo aprovado em 23/10/2026:
--
-- 1) O cadastro existe só com o nome. CNPJ, razão social, endereço de entrega e contato passam a aceitar vazio; a
--    tela mostra o que falta. O CNPJ deixa de ser único: os batalhões da PMCE e os grupamentos dos Bombeiros de SP
--    usam o CNPJ do órgão estadual, e cada unidade precisa do seu endereço.
-- 2) Não repete: chave_identidade é nome + município + UF sem acento, pontuação, "°/º" e palavras de ligação (de, da,
--    do...), única. salvar_beneficiario_emenda também recusa o que for igual a outra grafia guardada (outros_nomes).
-- 3) nome (até 300) passa a ser o nome do cadastro, sem a cidade e a UF: elas ficam no endereço de entrega. nome_curto
--    fica opcional, para as listas.
-- 4) Juntar repetidos (juntar_beneficiarios_emenda): as linhas passam para o que fica, os dados vazios dele são
--    completados pelo outro e o outro é apagado; emenda_beneficiarios_juntados guarda quem juntou e por quê.
-- 5) "São diferentes" (marcar_beneficiarios_diferentes): o par parecido deixa de ser apontado na tela.
-- 6) A trava de saldo das linhas (trg_emendas_trava_linhas) só confere quando muda o que ocupa saldo (item, kit,
--    quantidade, cancelada): trocar o beneficiário de uma linha não pode ser barrado por saldo.
-- 7) Carga: um cadastro por nome + local das linhas sem beneficiário. separar_local_do_nome tira a cidade e a UF do
--    nome ("... Cidade de Limeira - SP" → Limeira/SP; "Polícia Civil - RJ" → RJ) para o endereço de entrega; as grafias
--    ficam em outros_nomes e o órgão é preenchido quando o nome diz um só. As linhas passam a apontar para o cadastro.
-- ==============================================================================

-- 1) Chave do nome --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chave_nome_beneficiario(p_nome TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(array_to_string(ARRAY(
    SELECT t.w
      FROM regexp_split_to_table(
             lower(translate(replace(replace(replace(COALESCE(p_nome, ''), '°', 'o '), 'º', 'o '), 'ª', 'a'),
                   'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
                   'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
             '[^a-z0-9]+') WITH ORDINALITY AS t(w, n)
     WHERE t.w <> '' AND t.w NOT IN ('de', 'do', 'da', 'dos', 'das', 'e', 'cidade', 'o', 'a', 'em')
     ORDER BY t.n), ' '), '');
$$;
REVOKE ALL ON FUNCTION public.chave_nome_beneficiario(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chave_nome_beneficiario(TEXT) TO authenticated, service_role;

-- Nome, município e UF de um nome das planilhas ("... Cidade de Limeira - SP", "Polícia Civil - RJ"). Sem padrão = nome inteiro.
CREATE OR REPLACE FUNCTION public.separar_local_do_nome(p_nome TEXT, OUT nome TEXT, OUT municipio TEXT, OUT uf TEXT)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  s   TEXT := regexp_replace(btrim(COALESCE(p_nome, '')), '\s+', ' ', 'g');
  ufs CONSTANT TEXT := '(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)';
  m   TEXT[];
BEGIN
  nome := s;
  -- "... Cidade de Limeira - SP", "... (Cidade de São Paulo - SP)", "... Cidade Araçatuba - SP"
  m := regexp_match(s, '^(.*?)\s*[(]?\s*\m[Cc]idade\s+(?:(?:de|do|da)\s+)?([^()–-]+(?:-[[:alpha:]][^()–-]*)*)[-–]\s*' || ufs || '\s*[)]?\s*$');
  IF m IS NOT NULL AND btrim(m[2]) ~ '[a-zà-ú]' THEN
    nome := m[1]; municipio := btrim(m[2]); uf := m[3];
  ELSE
    -- "... (Nova Iguaçu - RJ)"
    m := regexp_match(s, '^(.*?)\s*[(]\s*([^()–-]+)[-–]\s*' || ufs || '\s*[)]?\s*$');
    IF m IS NOT NULL AND btrim(m[2]) ~ '[a-zà-ú]' THEN
      nome := m[1]; municipio := btrim(m[2]); uf := m[3];
    ELSE
      -- "9º BPM – Quixadá (PMCE)": só batalhão numerado, para não tomar "Batalhão de Policiamento Turístico" por cidade
      m := regexp_match(s, '^(\d+\s*[ºo°]\s*BPM)\s*[-–]\s*([^()–-]+)[(](PM[A-Z]{2,3})[)]\s*$');
      IF m IS NOT NULL THEN
        nome := m[1] || ' (' || m[3] || ')'; municipio := btrim(m[2]); uf := right(m[3], 2);
      ELSE
        -- "Polícia Militar – MS BPM Cidade de Jardim": cidade sem UF no fim, UF no começo
        m := regexp_match(s, '^(.*?[-–]\s*' || ufs || '\M.*?)\s*\m[Cc]idade\s+(?:(?:de|do|da)\s+)?([^()–-]+)$');
        IF m IS NOT NULL AND btrim(m[3]) ~ '[a-zà-ú]' THEN
          nome := m[1]; municipio := btrim(m[3]); uf := m[2];
        ELSE
          -- "Polícia Civil - RJ", "Guarda Municipal de Itamaracá-PE": só a UF
          m := regexp_match(s, '^(.*?)\s*[-–]\s*' || ufs || '\s*$');
          IF m IS NOT NULL THEN
            nome := m[1]; uf := m[2];
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  -- "CPRAIO – Comando de Policiamento RAIO (PMCE)": sem cidade, a UF vem da sigla da PM
  IF uf IS NULL THEN
    m := regexp_match(s, '[(]PM' || ufs || '[)]\s*$');
    IF m IS NOT NULL THEN uf := m[1]; END IF;
  END IF;
  nome := btrim(regexp_replace(nome, '\s*[-–]\s*$', ''));
  IF public.chave_nome_beneficiario(nome) IS NULL THEN
    nome := s; municipio := NULL; uf := NULL;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.separar_local_do_nome(TEXT) FROM PUBLIC, anon, authenticated;

-- 2) Campos do cadastro ---------------------------------------------------------
ALTER TABLE public.emenda_beneficiarios
  ADD COLUMN IF NOT EXISTS nome        VARCHAR(300),
  ADD COLUMN IF NOT EXISTS outros_nomes TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS origem      VARCHAR(10)  NOT NULL DEFAULT 'CADASTRO';

UPDATE public.emenda_beneficiarios SET nome = nome_curto WHERE nome IS NULL;

ALTER TABLE public.emenda_beneficiarios
  ALTER COLUMN nome SET NOT NULL,
  ALTER COLUMN nome_curto DROP NOT NULL,
  ALTER COLUMN cnpj DROP NOT NULL,
  ALTER COLUMN razao_social DROP NOT NULL,
  ALTER COLUMN entrega_cep DROP NOT NULL,
  ALTER COLUMN entrega_logradouro DROP NOT NULL,
  ALTER COLUMN entrega_numero DROP NOT NULL,
  ALTER COLUMN entrega_municipio DROP NOT NULL,
  ALTER COLUMN entrega_uf DROP NOT NULL,
  ALTER COLUMN responsavel_nome DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS emenda_beneficiarios_cnpj_key,
  DROP CONSTRAINT IF EXISTS emenda_beneficiarios_cnpj,
  DROP CONSTRAINT IF EXISTS emenda_beneficiarios_ceps,
  DROP CONSTRAINT IF EXISTS emenda_beneficiarios_ufs,
  DROP CONSTRAINT IF EXISTS emenda_beneficiarios_nome,
  DROP CONSTRAINT IF EXISTS emenda_beneficiarios_origem;

ALTER TABLE public.emenda_beneficiarios
  ADD CONSTRAINT emenda_beneficiarios_cnpj CHECK (cnpj IS NULL OR public.cnpj_valido(cnpj)),
  ADD CONSTRAINT emenda_beneficiarios_ceps CHECK ((entrega_cep IS NULL OR entrega_cep ~ '^[0-9]{8}$') AND (sede_cep IS NULL OR sede_cep ~ '^[0-9]{8}$')),
  ADD CONSTRAINT emenda_beneficiarios_ufs CHECK ((entrega_uf IS NULL OR entrega_uf ~ '^[A-Z]{2}$') AND (sede_uf IS NULL OR sede_uf ~ '^[A-Z]{2}$')),
  ADD CONSTRAINT emenda_beneficiarios_nome CHECK (public.chave_nome_beneficiario(nome) IS NOT NULL),
  ADD CONSTRAINT emenda_beneficiarios_origem CHECK (origem IN ('CADASTRO', 'PLANILHA'));

ALTER TABLE public.emenda_beneficiarios
  ADD COLUMN IF NOT EXISTS chave_identidade TEXT GENERATED ALWAYS AS (
    public.chave_nome_beneficiario(nome || ' ' || COALESCE(entrega_municipio, '') || ' ' || COALESCE(entrega_uf, ''))) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS ux_emenda_beneficiarios_identidade ON public.emenda_beneficiarios (chave_identidade);
CREATE INDEX IF NOT EXISTS ix_emenda_beneficiarios_cnpj ON public.emenda_beneficiarios (cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_emenda_pedido_linhas_beneficiario ON public.emenda_pedido_linhas (beneficiario_id) WHERE beneficiario_id IS NOT NULL;

COMMENT ON TABLE public.emenda_beneficiarios IS
  'Órgão que recebe o material das emendas. Só o nome é obrigatório (migration 166); CNPJ (não único: unidades do mesmo '
  'órgão), entrega e responsável completados pela CAEP. Grava só salvar_beneficiario_emenda e juntar_beneficiarios_emenda.';
COMMENT ON COLUMN public.emenda_beneficiarios.nome IS
  'Nome do beneficiário, sem a cidade e a UF (que ficam no endereço de entrega). Nome + município + UF não repetem.';
COMMENT ON COLUMN public.emenda_beneficiarios.chave_identidade IS
  'Nome + município + UF sem acento, pontuação, °/º e palavras de ligação (chave_nome_beneficiario): impede cadastro repetido. '
  'O mesmo nome em cidades diferentes ("Polícia Militar do Estado de São Paulo BPM") são unidades diferentes.';
COMMENT ON COLUMN public.emenda_beneficiarios.outros_nomes IS
  'Outras grafias do mesmo beneficiário (planilhas da CAEP e cadastros juntados), para busca e para não repetir.';
-- Decisão de 23/10/2026: quem recebe é uma comissão definida depois; por ora guarda-se só um contato do beneficiário.
COMMENT ON COLUMN public.emenda_beneficiarios.responsavel_nome IS
  'Contato do beneficiário final (pessoa com quem a CAEP fala). Não é o responsável pelo recebimento, que é uma comissão definida depois.';
COMMENT ON COLUMN public.emenda_beneficiarios.origem IS 'CADASTRO (pela tela) ou PLANILHA (carga das planilhas da CAEP, migration 166).';

-- 3) Pares marcados como diferentes ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_beneficiarios_diferentes (
  a_id              UUID         NOT NULL REFERENCES public.emenda_beneficiarios(id) ON DELETE CASCADE,
  b_id              UUID         NOT NULL REFERENCES public.emenda_beneficiarios(id) ON DELETE CASCADE,
  decidido_por      UUID,
  decidido_por_nome VARCHAR(200),
  decidido_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (a_id, b_id),
  CONSTRAINT emenda_beneficiarios_diferentes_ordem CHECK (a_id < b_id)
);
COMMENT ON TABLE public.emenda_beneficiarios_diferentes IS
  'Pares de beneficiários de nome parecido que a CAEP confirmou serem unidades diferentes. Grava só marcar_beneficiarios_diferentes.';

-- 4) Histórico das junções ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_beneficiarios_juntados (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  ficou_id      UUID         REFERENCES public.emenda_beneficiarios(id) ON DELETE SET NULL,
  ficou_nome    VARCHAR(300) NOT NULL,
  saiu_id       UUID         NOT NULL,
  saiu_nome     VARCHAR(300) NOT NULL,
  saiu_cnpj     CHAR(14),
  linhas        INTEGER      NOT NULL,
  motivo        TEXT         NOT NULL,
  juntado_por      UUID,
  juntado_por_nome VARCHAR(200),
  juntado_em    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.emenda_beneficiarios_juntados IS
  'Beneficiários repetidos juntados: quem saiu, para quem as linhas foram, quem juntou e por quê. Grava só juntar_beneficiarios_emenda.';

DO $$
DECLARE v_t TEXT;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['emenda_beneficiarios_diferentes', 'emenda_beneficiarios_juntados'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Leitura das emendas: ' || v_t, v_t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.has_permission(''emendas.view'')))',
                   'Leitura das emendas: ' || v_t, v_t);
    EXECUTE format('DROP POLICY IF EXISTS "Somente usuario ativo" ON public.%I', v_t);
    EXECUTE format('CREATE POLICY "Somente usuario ativo" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
                   'USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()))', v_t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v_t);
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_audit_' || v_t, v_t);
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
                     'FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture()', 'trg_audit_' || v_t, v_t);
    END IF;
  END LOOP;
END $$;

-- 5) Trava de saldo só quando muda o que ocupa saldo ----------------------------
CREATE OR REPLACE FUNCTION public.trg_emendas_trava_linhas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_item TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE'
     AND (OLD.tipo, OLD.item_key, OLD.kit_id, OLD.kit_composicao, OLD.quantidade, OLD.cancelada)
         IS NOT DISTINCT FROM (NEW.tipo, NEW.item_key, NEW.kit_id, NEW.kit_composicao, NEW.quantidade, NEW.cancelada) THEN
    RETURN NULL;
  END IF;
  FOR v_item IN SELECT public.emendas_itens_da_linha(NEW.tipo, NEW.item_key, NEW.kit_composicao) LOOP
    PERFORM public.emendas_conferir_saldo_do_item(v_item, 'PEDIDO');
  END LOOP;
  RETURN NULL;
END;
$$;

-- 6) Salvar: só o nome obrigatório ----------------------------------------------
-- p_beneficiario: { id?, versao? (obrigatória ao alterar), nome, nome_curto?, cnpj?, dados da Receita?, entrega_*?,
--                   responsavel_*?, ativo?, orgao? }. Campo vazio grava vazio.
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
      nome, nome_curto, cnpj, razao_social, natureza_juridica, ente_federativo, situacao_cadastral, sede_endereco,
      sede_municipio, sede_uf, sede_cep, sede_telefone, sede_email, receita_lida_em, entrega_cep, entrega_logradouro,
      entrega_numero, entrega_complemento, entrega_bairro, entrega_municipio, entrega_uf, responsavel_nome,
      responsavel_cargo, responsavel_telefone, responsavel_whatsapp, responsavel_email, ativo, orgao, origem,
      criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (
      v_nome, NULLIF(btrim(b->>'nome_curto'), ''), v_cnpj, NULLIF(btrim(b->>'razao_social'), ''),
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
    nome = v_nome, nome_curto = NULLIF(btrim(b->>'nome_curto'), ''),
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

-- 7) Juntar repetidos -----------------------------------------------------------
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

-- 8) "São diferentes" -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_beneficiarios_diferentes(p_a UUID, p_b UUID, p_diferentes BOOLEAN DEFAULT TRUE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a UUID := LEAST(p_a, p_b);
  v_b UUID := GREATEST(p_a, p_b);
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador conferem beneficiários parecidos.' USING ERRCODE = '42501';
  END IF;
  IF p_a IS NULL OR p_b IS NULL OR p_a = p_b THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: escolha dois beneficiários diferentes.' USING ERRCODE = '22023';
  END IF;
  IF p_diferentes THEN
    INSERT INTO public.emenda_beneficiarios_diferentes (a_id, b_id, decidido_por, decidido_por_nome)
    VALUES (v_a, v_b, auth.uid(), left(public.nome_do_usuario_logado(), 200))
    ON CONFLICT (a_id, b_id) DO NOTHING;
  ELSE
    DELETE FROM public.emenda_beneficiarios_diferentes WHERE a_id = v_a AND b_id = v_b;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_beneficiarios_diferentes(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.marcar_beneficiarios_diferentes(UUID, UUID, BOOLEAN) TO authenticated;

-- 9) Carga: um cadastro por nome + local das linhas sem beneficiário -------------
CREATE TEMP TABLE carga_beneficiarios AS
WITH grafias AS (
  SELECT public.chave_nome_beneficiario(l.beneficiario_nome) AS chave_grafia,
         regexp_replace(btrim(l.beneficiario_nome), '\s+', ' ', 'g') AS grafia,
         count(*) AS linhas
    FROM public.emenda_pedido_linhas l
   WHERE l.beneficiario_id IS NULL AND l.beneficiario_nome IS NOT NULL
   GROUP BY 1, 2
)
SELECT g.chave_grafia, g.grafia, g.linhas, x.nome, x.municipio, x.uf,
       public.chave_nome_beneficiario(x.nome || ' ' || COALESCE(x.municipio, '') || ' ' || COALESCE(x.uf, '')) AS identidade
  FROM grafias g, public.separar_local_do_nome(g.grafia) x
 WHERE g.chave_grafia IS NOT NULL;

WITH grupos AS (
  SELECT c.identidade,
         (array_agg(c.nome ORDER BY c.linhas DESC, c.grafia))[1] AS nome,
         (array_agg(c.municipio ORDER BY c.linhas DESC, c.grafia))[1] AS municipio,
         (array_agg(c.uf ORDER BY c.linhas DESC, c.grafia))[1] AS uf,
         array_agg(DISTINCT c.grafia) AS grafias
    FROM carga_beneficiarios c
   WHERE NOT EXISTS (SELECT 1 FROM public.emenda_beneficiarios e WHERE e.chave_identidade = c.identidade)
   GROUP BY c.identidade
)
INSERT INTO public.emenda_beneficiarios (nome, outros_nomes, origem, entrega_municipio, entrega_uf, orgao, criado_por_nome, atualizado_por_nome)
SELECT g.nome, g.grafias, 'PLANILHA', left(g.municipio, 100), g.uf,
       -- Só quando o nome diz um órgão só ("Secretaria ... (GUARDA CIVIL MUNICIPAL)" diz dois e fica vazio).
       (SELECT CASE WHEN count(*) = 1 THEN min(o) END FROM (VALUES
          ('Corpo de Bombeiros Militar', g.nome ~* '(bombeiro|\mCBM)'),
          ('Polícia Militar', g.nome ~* '(pol[ií]cia militar|\mBPM|\mPM[A-Z]{2}\M|batalh[ãa]o de pol)'),
          ('Polícia Civil', g.nome ~* '(pol[ií]cia civil|delegacia)'),
          ('Polícia Científica', g.nome ~* '(pol[ií]cia cient[ií]fica|pol[ií]cia t[ée]cnico)'),
          ('Polícia Penal', g.nome ~* '(pol[ií]cia penal|penitenci)'),
          ('Guarda Municipal', g.nome ~* 'guarda (civil )?municipal'),
          ('Defesa Civil', g.nome ~* 'defesa civil')) v(o, bate) WHERE bate),
       'Carga das planilhas da CAEP', 'Carga das planilhas da CAEP'
  FROM grupos g;

UPDATE public.emenda_pedido_linhas l
   SET beneficiario_id = e.id
  FROM carga_beneficiarios c
  JOIN public.emenda_beneficiarios e ON e.chave_identidade = c.identidade
 WHERE l.beneficiario_id IS NULL
   AND l.beneficiario_nome IS NOT NULL
   AND public.chave_nome_beneficiario(l.beneficiario_nome) = c.chave_grafia;

DROP TABLE carga_beneficiarios;
DROP FUNCTION public.separar_local_do_nome(TEXT);

COMMENT ON COLUMN public.emenda_pedido_linhas.beneficiario_nome IS
  'Nome do beneficiário como veio da planilha da CAEP (histórico). Desde a migration 166 a linha aponta para o cadastro (beneficiario_id).';
