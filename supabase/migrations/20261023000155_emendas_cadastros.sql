-- ==============================================================================
-- MIGRATION 155: EMENDAS PARLAMENTARES — ENTREGA 1 (PERFIL E CADASTROS)
-- Versão: 20261023000155_emendas_cadastros.sql
--
-- Contexto (protótipo aprovado em 23/10/2026): a CAEP recebe do gestor de saldo uma quantidade de cada item
-- (alocação já existente) e a reparte entre parlamentares. Esta entrega cria só a base; pedidos, trava de saldo
-- e carga da planilha vêm nas entregas 2 e 3.
--
-- 1) Perfil 'gestor_emendas' (Gestor de Emendas, sempre da CAEP) e as permissões emendas.view/emendas.manage:
--    coordenador (admin) e gestor de emendas alteram; consulta (leitor) só lê. Os demais perfis não veem.
--
-- 2) emenda_autores: deputados e senadores (Câmara e Senado, legislatura inteira: quem sai do cargo continua)
--    e as 27 bancadas estaduais. Grava só o servidor (gravar_autores_emendas), uma vez por semana.
--
-- 3) emenda_beneficiarios: órgão que recebe o material, pelo CNPJ. Dados da Receita (só leitura na tela) e,
--    da CAEP, nome curto, endereço de entrega (pelo CEP) e responsável pelo recebimento. Grava só
--    salvar_beneficiario_emenda, com conferência de versão (duas pessoas editando ao mesmo tempo).
--
-- 4) emenda_kits / emenda_kit_itens: conjunto de itens montado pela CAEP com o que ela tem alocado, com a
--    quantidade de cada item por kit. O kit não guarda saldo: kits possíveis e situação são calculados.
--    Mudar a composição sobe a versão (os pedidos da entrega 2 guardam a composição do dia).
--
-- 5) v_emendas_itens_caep: itens com alocação para a unidade das emendas (CAEP), com descrição, ata, vigência,
--    valor unitário e quantidade alocada.
--
-- Nada que já existe muda de comportamento. Toda tabela nova tem a política "Somente usuario ativo" (124)
-- e auditoria (trg_audit_log_capture).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Perfil e permissões
-- ------------------------------------------------------------------------------
INSERT INTO public.roles (id, label, is_system) VALUES ('gestor_emendas', 'Gestor de Emendas', TRUE)
ON CONFLICT (id) DO NOTHING;

-- O domínio 'emendas' entra na lista aceita de permissions.domain.
DO $$
DECLARE v_nome TEXT;
BEGIN
  FOR v_nome IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.permissions'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%domain%'
  LOOP
    EXECUTE format('ALTER TABLE public.permissions DROP CONSTRAINT %I', v_nome);
  END LOOP;
  ALTER TABLE public.permissions ADD CONSTRAINT permissions_domain_check
    CHECK (domain IN ('contracts', 'financial', 'allocations', 'departments', 'governance', 'reports', 'emendas'));
END $$;

INSERT INTO public.permissions (key, domain) VALUES
  ('emendas.view',   'emendas'),
  ('emendas.manage', 'emendas')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_key) VALUES
  ('admin',          'emendas.view'),
  ('admin',          'emendas.manage'),
  ('gestor_emendas', 'emendas.view'),
  ('gestor_emendas', 'emendas.manage'),
  ('leitor',         'emendas.view')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- Unidade interna das emendas (configuração única; outra unidade entra trocando aqui).
CREATE OR REPLACE FUNCTION public.unidade_das_emendas()
RETURNS VARCHAR(30)
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'CAEP'::VARCHAR(30) $$;

GRANT EXECUTE ON FUNCTION public.unidade_das_emendas() TO authenticated, service_role;

-- CNPJ com os dois dígitos verificadores certos (14 números).
CREATE OR REPLACE FUNCTION public.cnpj_valido(p_cnpj TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v TEXT := regexp_replace(COALESCE(p_cnpj, ''), '\D', '', 'g');
  p1 INT[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  p2 INT[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s INT; d INT; i INT;
BEGIN
  IF length(v) <> 14 OR v ~ '^(\d)\1{13}$' THEN RETURN FALSE; END IF;
  s := 0; FOR i IN 1..12 LOOP s := s + substr(v, i, 1)::INT * p1[i]; END LOOP;
  d := CASE WHEN s % 11 < 2 THEN 0 ELSE 11 - s % 11 END;
  IF d <> substr(v, 13, 1)::INT THEN RETURN FALSE; END IF;
  s := 0; FOR i IN 1..13 LOOP s := s + substr(v, i, 1)::INT * p2[i]; END LOOP;
  d := CASE WHEN s % 11 < 2 THEN 0 ELSE 11 - s % 11 END;
  RETURN d = substr(v, 14, 1)::INT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cnpj_valido(TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2) Autores
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_autores (
  id            VARCHAR(20)  PRIMARY KEY,
  tipo          VARCHAR(10)  NOT NULL,
  codigo_fonte  VARCHAR(20)  NOT NULL,
  nome          VARCHAR(200) NOT NULL,
  nome_civil    VARCHAR(200),
  partido       VARCHAR(30),
  uf            CHAR(2),
  em_exercicio  BOOLEAN,
  legislatura   INTEGER,
  url_foto      TEXT,
  email         VARCHAR(150),
  lido_em       TIMESTAMPTZ,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT emenda_autores_tipo CHECK (tipo IN ('DEPUTADO', 'SENADOR', 'BANCADA')),
  CONSTRAINT emenda_autores_id CHECK (id ~ '^(C|S|B):[A-Z0-9]+$'),
  CONSTRAINT emenda_autores_uf CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$')
);
COMMENT ON TABLE public.emenda_autores IS
  'Autores das emendas: deputados (C:id da Câmara), senadores (S:código do Senado) e bancadas (B:UF). Grava só o servidor.';

ALTER TABLE public.emenda_autores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura das emendas: emenda_autores" ON public.emenda_autores;
CREATE POLICY "Leitura das emendas: emenda_autores" ON public.emenda_autores FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('emendas.view')));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.emenda_autores;
CREATE POLICY "Somente usuario ativo" ON public.emenda_autores AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.emenda_autores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.emenda_autores TO authenticated;
GRANT ALL ON public.emenda_autores TO service_role;

-- As 27 bancadas estaduais.
INSERT INTO public.emenda_autores (id, tipo, codigo_fonte, nome, uf)
SELECT 'B:' || uf, 'BANCADA', uf, 'Bancada ' || uf, uf
  FROM unnest(ARRAY['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI',
                    'RJ','RN','RS','RO','RR','SC','SP','SE','TO']) AS uf
ON CONFLICT (id) DO NOTHING;

-- p_autores: array JSON (no máximo 2000) de { id, tipo, codigo_fonte, nome, nome_civil, partido, uf,
-- em_exercicio, legislatura, url_foto, email }. Grava ou atualiza; nunca apaga. Devolve quantos mudaram.
CREATE OR REPLACE FUNCTION public.gravar_autores_emendas(p_autores JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  IF public.eh_service_role() IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só a sincronização do servidor grava os autores.' USING ERRCODE = '42501';
  END IF;
  IF p_autores IS NULL OR jsonb_typeof(p_autores) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_autores deve ser um array JSON.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_autores) > 2000 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 2000 autores por chamada.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.emenda_autores AS t (id, tipo, codigo_fonte, nome, nome_civil, partido, uf, em_exercicio,
                                          legislatura, url_foto, email, lido_em)
  SELECT a->>'id', a->>'tipo', a->>'codigo_fonte', left(btrim(a->>'nome'), 200), left(NULLIF(btrim(a->>'nome_civil'), ''), 200),
         left(NULLIF(btrim(a->>'partido'), ''), 30), NULLIF(upper(btrim(a->>'uf')), ''), (a->>'em_exercicio')::BOOLEAN,
         (a->>'legislatura')::INTEGER, NULLIF(a->>'url_foto', ''), left(NULLIF(btrim(a->>'email'), ''), 150), NOW()
    FROM jsonb_array_elements(p_autores) AS e(a)
   WHERE a->>'tipo' IN ('DEPUTADO', 'SENADOR')
     AND COALESCE(btrim(a->>'nome'), '') <> ''
  ON CONFLICT (id) DO UPDATE
    SET nome = EXCLUDED.nome, nome_civil = EXCLUDED.nome_civil, partido = EXCLUDED.partido, uf = EXCLUDED.uf,
        em_exercicio = EXCLUDED.em_exercicio, legislatura = GREATEST(t.legislatura, EXCLUDED.legislatura),
        url_foto = EXCLUDED.url_foto, email = EXCLUDED.email, lido_em = EXCLUDED.lido_em
    WHERE (t.nome, t.nome_civil, t.partido, t.uf, t.em_exercicio, t.url_foto, t.email)
          IS DISTINCT FROM (EXCLUDED.nome, EXCLUDED.nome_civil, EXCLUDED.partido, EXCLUDED.uf, EXCLUDED.em_exercicio,
                            EXCLUDED.url_foto, EXCLUDED.email);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- Quem já foi lido e não veio nesta leitura deixou o cargo (a lista "em exercício" é a fonte).
  UPDATE public.emenda_autores t
     SET em_exercicio = FALSE
   WHERE t.tipo IN (SELECT DISTINCT a->>'tipo' FROM jsonb_array_elements(p_autores) AS e(a))
     AND t.em_exercicio IS TRUE
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_autores) AS e(a)
                      WHERE a->>'id' = t.id AND (a->>'em_exercicio')::BOOLEAN);
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_autores_emendas(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_autores_emendas(JSONB) TO service_role;

-- ------------------------------------------------------------------------------
-- 3) Beneficiários
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_beneficiarios (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj                   CHAR(14)     NOT NULL UNIQUE,
  razao_social           VARCHAR(255) NOT NULL,
  natureza_juridica      VARCHAR(150),
  ente_federativo        VARCHAR(100),
  situacao_cadastral     VARCHAR(40),
  sede_endereco          TEXT,
  sede_municipio         VARCHAR(100),
  sede_uf                CHAR(2),
  sede_cep               CHAR(8),
  sede_telefone          VARCHAR(40),
  sede_email             VARCHAR(150),
  receita_lida_em        TIMESTAMPTZ,
  nome_curto             VARCHAR(80)  NOT NULL,
  entrega_cep            CHAR(8)      NOT NULL,
  entrega_logradouro     VARCHAR(200) NOT NULL,
  entrega_numero         VARCHAR(20)  NOT NULL,
  entrega_complemento    VARCHAR(120),
  entrega_bairro         VARCHAR(100),
  entrega_municipio      VARCHAR(100) NOT NULL,
  entrega_uf             CHAR(2)      NOT NULL,
  responsavel_nome       VARCHAR(150) NOT NULL,
  responsavel_cargo      VARCHAR(100),
  responsavel_telefone   VARCHAR(20),
  responsavel_whatsapp   BOOLEAN      NOT NULL DEFAULT FALSE,
  responsavel_email      VARCHAR(150),
  ativo                  BOOLEAN      NOT NULL DEFAULT TRUE,
  versao                 INTEGER      NOT NULL DEFAULT 1,
  criado_por             UUID,
  criado_por_nome        VARCHAR(200),
  criado_em              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_por         UUID,
  atualizado_por_nome    VARCHAR(200),
  atualizado_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT emenda_beneficiarios_cnpj CHECK (public.cnpj_valido(cnpj)),
  CONSTRAINT emenda_beneficiarios_ceps CHECK (entrega_cep ~ '^[0-9]{8}$' AND (sede_cep IS NULL OR sede_cep ~ '^[0-9]{8}$')),
  CONSTRAINT emenda_beneficiarios_ufs CHECK (entrega_uf ~ '^[A-Z]{2}$' AND (sede_uf IS NULL OR sede_uf ~ '^[A-Z]{2}$')),
  CONSTRAINT emenda_beneficiarios_email CHECK (responsavel_email IS NULL OR responsavel_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT emenda_beneficiarios_telefone CHECK (responsavel_telefone IS NULL OR responsavel_telefone ~ '^[0-9]{10,11}$'),
  CONSTRAINT emenda_beneficiarios_nome_curto CHECK (btrim(nome_curto) <> '')
);
COMMENT ON TABLE public.emenda_beneficiarios IS
  'Órgão que recebe o material das emendas. Dados da Receita pelo CNPJ; entrega e responsável informados pela CAEP. '
  'Grava só salvar_beneficiario_emenda.';

ALTER TABLE public.emenda_beneficiarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura das emendas: emenda_beneficiarios" ON public.emenda_beneficiarios;
CREATE POLICY "Leitura das emendas: emenda_beneficiarios" ON public.emenda_beneficiarios FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('emendas.view')));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.emenda_beneficiarios;
CREATE POLICY "Somente usuario ativo" ON public.emenda_beneficiarios AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.emenda_beneficiarios FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.emenda_beneficiarios TO authenticated;
GRANT ALL ON public.emenda_beneficiarios TO service_role;

-- p_beneficiario: { id?, versao? (obrigatória ao alterar), cnpj, razao_social, natureza_juridica, ente_federativo,
-- situacao_cadastral, sede_endereco, sede_municipio, sede_uf, sede_cep, sede_telefone, sede_email, receita_lida_em,
-- nome_curto, entrega_cep, entrega_logradouro, entrega_numero, entrega_complemento, entrega_bairro,
-- entrega_municipio, entrega_uf, responsavel_nome, responsavel_cargo, responsavel_telefone, responsavel_whatsapp,
-- responsavel_email, ativo }. Devolve { id, versao }.
CREATE OR REPLACE FUNCTION public.salvar_beneficiario_emenda(p_beneficiario JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b       JSONB := p_beneficiario;
  v_id    UUID;
  v_cnpj  TEXT;
  v_nome  TEXT;
  v_versao INTEGER;
  v_atual INTEGER;
  v_tel   TEXT;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador cadastram beneficiários.' USING ERRCODE = '42501';
  END IF;
  IF b IS NULL OR jsonb_typeof(b) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o beneficiário deve ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;

  v_cnpj := regexp_replace(COALESCE(b->>'cnpj', ''), '\D', '', 'g');
  IF NOT public.cnpj_valido(v_cnpj) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: CNPJ inválido.' USING ERRCODE = '22023';
  END IF;
  v_tel := NULLIF(regexp_replace(COALESCE(b->>'responsavel_telefone', ''), '\D', '', 'g'), '');
  v_nome := left(public.nome_do_usuario_logado(), 200);
  v_id := NULLIF(b->>'id', '')::UUID;

  IF v_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.emenda_beneficiarios WHERE cnpj = v_cnpj) THEN
      RAISE EXCEPTION 'DUPLICADO: Já existe beneficiário com este CNPJ.' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.emenda_beneficiarios (
      cnpj, razao_social, natureza_juridica, ente_federativo, situacao_cadastral, sede_endereco, sede_municipio,
      sede_uf, sede_cep, sede_telefone, sede_email, receita_lida_em, nome_curto, entrega_cep, entrega_logradouro,
      entrega_numero, entrega_complemento, entrega_bairro, entrega_municipio, entrega_uf, responsavel_nome,
      responsavel_cargo, responsavel_telefone, responsavel_whatsapp, responsavel_email, ativo,
      criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (
      v_cnpj, btrim(b->>'razao_social'), NULLIF(btrim(b->>'natureza_juridica'), ''), NULLIF(btrim(b->>'ente_federativo'), ''),
      NULLIF(btrim(b->>'situacao_cadastral'), ''), NULLIF(btrim(b->>'sede_endereco'), ''), NULLIF(btrim(b->>'sede_municipio'), ''),
      NULLIF(upper(btrim(b->>'sede_uf')), ''), NULLIF(regexp_replace(COALESCE(b->>'sede_cep', ''), '\D', '', 'g'), ''),
      NULLIF(btrim(b->>'sede_telefone'), ''), NULLIF(btrim(b->>'sede_email'), ''), NULLIF(b->>'receita_lida_em', '')::TIMESTAMPTZ,
      btrim(b->>'nome_curto'), regexp_replace(COALESCE(b->>'entrega_cep', ''), '\D', '', 'g'), btrim(b->>'entrega_logradouro'),
      btrim(b->>'entrega_numero'), NULLIF(btrim(b->>'entrega_complemento'), ''), NULLIF(btrim(b->>'entrega_bairro'), ''),
      btrim(b->>'entrega_municipio'), upper(btrim(b->>'entrega_uf')), btrim(b->>'responsavel_nome'),
      NULLIF(btrim(b->>'responsavel_cargo'), ''), v_tel, COALESCE((b->>'responsavel_whatsapp')::BOOLEAN, FALSE),
      NULLIF(lower(btrim(b->>'responsavel_email')), ''), COALESCE((b->>'ativo')::BOOLEAN, TRUE),
      auth.uid(), v_nome, auth.uid(), v_nome)
    RETURNING id, versao INTO v_id, v_versao;
    RETURN jsonb_build_object('id', v_id, 'versao', v_versao);
  END IF;

  SELECT versao INTO v_atual FROM public.emenda_beneficiarios WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Beneficiário não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF (b->>'versao')::INTEGER IS DISTINCT FROM v_atual THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este beneficiário. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.emenda_beneficiarios WHERE cnpj = v_cnpj AND id <> v_id) THEN
    RAISE EXCEPTION 'DUPLICADO: Já existe beneficiário com este CNPJ.' USING ERRCODE = '23505';
  END IF;

  UPDATE public.emenda_beneficiarios SET
    cnpj = v_cnpj, razao_social = btrim(b->>'razao_social'), natureza_juridica = NULLIF(btrim(b->>'natureza_juridica'), ''),
    ente_federativo = NULLIF(btrim(b->>'ente_federativo'), ''), situacao_cadastral = NULLIF(btrim(b->>'situacao_cadastral'), ''),
    sede_endereco = NULLIF(btrim(b->>'sede_endereco'), ''), sede_municipio = NULLIF(btrim(b->>'sede_municipio'), ''),
    sede_uf = NULLIF(upper(btrim(b->>'sede_uf')), ''), sede_cep = NULLIF(regexp_replace(COALESCE(b->>'sede_cep', ''), '\D', '', 'g'), ''),
    sede_telefone = NULLIF(btrim(b->>'sede_telefone'), ''), sede_email = NULLIF(btrim(b->>'sede_email'), ''),
    receita_lida_em = COALESCE(NULLIF(b->>'receita_lida_em', '')::TIMESTAMPTZ, receita_lida_em),
    nome_curto = btrim(b->>'nome_curto'), entrega_cep = regexp_replace(COALESCE(b->>'entrega_cep', ''), '\D', '', 'g'),
    entrega_logradouro = btrim(b->>'entrega_logradouro'), entrega_numero = btrim(b->>'entrega_numero'),
    entrega_complemento = NULLIF(btrim(b->>'entrega_complemento'), ''), entrega_bairro = NULLIF(btrim(b->>'entrega_bairro'), ''),
    entrega_municipio = btrim(b->>'entrega_municipio'), entrega_uf = upper(btrim(b->>'entrega_uf')),
    responsavel_nome = btrim(b->>'responsavel_nome'), responsavel_cargo = NULLIF(btrim(b->>'responsavel_cargo'), ''),
    responsavel_telefone = v_tel, responsavel_whatsapp = COALESCE((b->>'responsavel_whatsapp')::BOOLEAN, FALSE),
    responsavel_email = NULLIF(lower(btrim(b->>'responsavel_email')), ''), ativo = COALESCE((b->>'ativo')::BOOLEAN, ativo),
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
  WHERE id = v_id
  RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', v_id, 'versao', v_versao);
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_beneficiario_emenda(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_beneficiario_emenda(JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4) Itens da CAEP
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_emendas_itens_caep
WITH (security_invoker = true) AS
SELECT a.item_key,
       r.numero_ata,
       r.codigo_uasg,
       i.numero_item,
       i.descricao_item,
       i.codigo_pdm,
       i.valor_unitario,
       r.data_vigencia_final,
       (r.data_vigencia_final IS NOT NULL
         AND r.data_vigencia_final < (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE) AS ata_encerrada,
       a.allocated_qty AS alocado
  FROM public.arp_allocations a
  JOIN public.atas_registro_preco r
    ON r.numero_ata = split_part(a.item_key, '-', 1)
   AND r.codigo_uasg = split_part(a.item_key, '-', 2)
  JOIN public.itens_ata i
    ON i.ata_id = r.id
   AND lpad(i.numero_item, 5, '0') = split_part(a.item_key, '-', 3)
 WHERE a.unit_name = public.unidade_das_emendas()
   AND a.allocated_qty > 0;

COMMENT ON VIEW public.v_emendas_itens_caep IS
  'Itens com alocação para a unidade das emendas (CAEP). Saldo das emendas = alocado − pedidos (entrega 2).';
REVOKE ALL ON public.v_emendas_itens_caep FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_emendas_itens_caep TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5) Kits
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_kits (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                 VARCHAR(120) NOT NULL,
  descricao            TEXT,
  ativo                BOOLEAN      NOT NULL DEFAULT TRUE,
  versao               INTEGER      NOT NULL DEFAULT 1,
  criado_por           UUID,
  criado_por_nome      VARCHAR(200),
  criado_em            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_por       UUID,
  atualizado_por_nome  VARCHAR(200),
  atualizado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT emenda_kits_nome CHECK (btrim(nome) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_emenda_kits_nome ON public.emenda_kits (lower(btrim(nome)));
COMMENT ON TABLE public.emenda_kits IS
  'Kit: conjunto de itens montado pela CAEP. Não guarda saldo; a versão sobe a cada mudança de composição.';

CREATE TABLE IF NOT EXISTS public.emenda_kit_itens (
  kit_id      UUID         NOT NULL REFERENCES public.emenda_kits(id) ON DELETE CASCADE,
  item_key    VARCHAR(100) NOT NULL,
  quantidade  INTEGER      NOT NULL CHECK (quantidade > 0),
  PRIMARY KEY (kit_id, item_key)
);
COMMENT ON TABLE public.emenda_kit_itens IS 'Composição do kit: quantos de cada item por kit. Grava só salvar_kit_emenda.';

DO $$
DECLARE v_t TEXT;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['emenda_kits', 'emenda_kit_itens'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Leitura das emendas: ' || v_t, v_t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.has_permission(''emendas.view'')))',
                   'Leitura das emendas: ' || v_t, v_t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Somente usuario ativo', v_t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
                   'USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()))', 'Somente usuario ativo', v_t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v_t);
  END LOOP;
END $$;

-- p_kit: { id?, versao? (obrigatória ao alterar), nome, descricao, ativo?, itens: [{ item_key, quantidade }] }.
-- Item novo na composição precisa ter alocação para a CAEP em ata vigente; item que já estava pode ficar
-- (a CAEP troca quando quiser). Devolve { id, versao }.
CREATE OR REPLACE FUNCTION public.salvar_kit_emenda(p_kit JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id      UUID;
  v_nome    TEXT;
  v_usuario TEXT;
  v_atual   INTEGER;
  v_versao  INTEGER;
  v_mudou   BOOLEAN;
  v_item    JSONB;
  v_key     TEXT;
  v_qtd     INTEGER;
  v_ruim    TEXT;
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador montam kits.' USING ERRCODE = '42501';
  END IF;
  IF p_kit IS NULL OR jsonb_typeof(p_kit) <> 'object' OR jsonb_typeof(p_kit->'itens') <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o kit deve trazer nome e a lista de itens.' USING ERRCODE = '22023';
  END IF;
  v_nome := btrim(COALESCE(p_kit->>'nome', ''));
  IF v_nome = '' OR length(v_nome) > 120 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o nome do kit (até 120 letras).' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_kit->'itens') = 0 OR jsonb_array_length(p_kit->'itens') > 50 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o kit precisa de 1 a 50 itens.' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _kit_novo (item_key TEXT PRIMARY KEY, quantidade INTEGER) ON COMMIT DROP;
  TRUNCATE _kit_novo;
  FOR v_item IN SELECT x FROM jsonb_array_elements(p_kit->'itens') AS e(x) LOOP
    v_key := btrim(COALESCE(v_item->>'item_key', ''));
    v_qtd := (v_item->>'quantidade')::INTEGER;
    IF v_key = '' OR v_qtd IS NULL OR v_qtd <= 0 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: cada item precisa da chave e de quantidade inteira maior que zero.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO _kit_novo VALUES (v_key, v_qtd)
      ON CONFLICT (item_key) DO UPDATE SET quantidade = _kit_novo.quantidade + EXCLUDED.quantidade;
  END LOOP;

  v_id := NULLIF(p_kit->>'id', '')::UUID;
  IF EXISTS (SELECT 1 FROM public.emenda_kits WHERE lower(btrim(nome)) = lower(v_nome) AND id IS DISTINCT FROM v_id) THEN
    RAISE EXCEPTION 'DUPLICADO: Já existe kit com este nome.' USING ERRCODE = '23505';
  END IF;

  -- Itens que entram agora: precisam de alocação da CAEP em ata vigente.
  SELECT string_agg(n.item_key, ', ') INTO v_ruim
    FROM _kit_novo n
   WHERE NOT EXISTS (SELECT 1 FROM public.emenda_kit_itens k WHERE k.kit_id = v_id AND k.item_key = n.item_key)
     AND NOT EXISTS (SELECT 1 FROM public.v_emendas_itens_caep c WHERE c.item_key = n.item_key AND NOT c.ata_encerrada);
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'ITEM_INVALIDO: Sem alocação da CAEP em ata vigente: %', v_ruim USING ERRCODE = '22023';
  END IF;

  v_usuario := left(public.nome_do_usuario_logado(), 200);

  IF v_id IS NULL THEN
    INSERT INTO public.emenda_kits (nome, descricao, ativo, criado_por, criado_por_nome, atualizado_por, atualizado_por_nome)
    VALUES (v_nome, NULLIF(btrim(p_kit->>'descricao'), ''), COALESCE((p_kit->>'ativo')::BOOLEAN, TRUE),
            auth.uid(), v_usuario, auth.uid(), v_usuario)
    RETURNING id, versao INTO v_id, v_versao;
    INSERT INTO public.emenda_kit_itens (kit_id, item_key, quantidade) SELECT v_id, item_key, quantidade FROM _kit_novo;
    RETURN jsonb_build_object('id', v_id, 'versao', v_versao);
  END IF;

  SELECT versao INTO v_atual FROM public.emenda_kits WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Kit não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF (p_kit->>'versao')::INTEGER IS DISTINCT FROM v_atual THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou este kit. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;

  SELECT EXISTS (
    (SELECT item_key, quantidade FROM public.emenda_kit_itens WHERE kit_id = v_id
     EXCEPT SELECT item_key, quantidade FROM _kit_novo)
    UNION ALL
    (SELECT item_key, quantidade FROM _kit_novo
     EXCEPT SELECT item_key, quantidade FROM public.emenda_kit_itens WHERE kit_id = v_id)
  ) INTO v_mudou;

  IF v_mudou THEN
    DELETE FROM public.emenda_kit_itens WHERE kit_id = v_id;
    INSERT INTO public.emenda_kit_itens (kit_id, item_key, quantidade) SELECT v_id, item_key, quantidade FROM _kit_novo;
  END IF;

  UPDATE public.emenda_kits
     SET nome = v_nome, descricao = NULLIF(btrim(p_kit->>'descricao'), ''),
         ativo = COALESCE((p_kit->>'ativo')::BOOLEAN, ativo),
         versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_usuario, atualizado_em = NOW()
   WHERE id = v_id
  RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', v_id, 'versao', v_versao);
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_kit_emenda(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_kit_emenda(JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- Auditoria
-- ------------------------------------------------------------------------------
DO $$
DECLARE v_t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    FOREACH v_t IN ARRAY ARRAY['emenda_autores', 'emenda_beneficiarios', 'emenda_kits', 'emenda_kit_itens'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_audit_' || v_t, v_t);
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
                     'FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture()', 'trg_audit_' || v_t, v_t);
    END LOOP;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- Leitura semanal de deputados e senadores (segunda-feira, 06:40 UTC)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sincronizar-autores-emendas';
    PERFORM cron.schedule('sincronizar-autores-emendas', '40 6 * * 1', $c$SELECT public.disparar_sincronizacao('autores_emendas')$c$);
  END IF;
END $$;
