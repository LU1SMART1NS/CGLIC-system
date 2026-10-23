-- ==============================================================================
-- MIGRATION 165: EMENDAS PARLAMENTARES — QUADRO PARA O GABINETE (ANEXO DA RESERVA)
-- Versão: 20261023000165_emendas_quadro_gabinete.sql
--
-- Protótipo aprovado em 23/10/2026: na reserva, a CAEP copia para o SEI (tabela) ou para o WhatsApp (texto) o quadro
-- no formato do Anexo que ela já usa: DESCRIÇÃO ITEM · ÓRGÃO · BENEFICIÁRIO FINAL · MUNICÍPIO · QTD · VR UNITÁRIO ·
-- VR TOTAL, fechando com TOTAL A EMPENHAR. O valor unitário já vem com o reajuste previsto, para a emenda nascer com
-- folga; quando o pedido mistura investimento e custeio, o quadro dá o total de cada GND (no SIOP cada emenda tem um
-- só GND).
--
-- 1) emenda_beneficiarios.orgao: a coluna ÓRGÃO do Anexo (Polícia Militar, Corpo de Bombeiros Militar...), de uma lista
--    fixa para sair sempre escrita do mesmo jeito. Vazio nos beneficiários de antes; a tela pede ao editar.
--    salvar_beneficiario_emenda passa a gravar o campo (mesma assinatura e permissões).
-- 2) emenda_itens_dados: o nome curto do item para o quadro (a descrição do catálogo é longa demais) e o GND
--    (GND-3 custeio, GND-4 investimento), informados pela CAEP. RPC salvar_dados_item_emenda (emendas.manage).
--    v_emendas_itens_caep ganha as duas colunas no fim.
-- 3) emendas_precos_previstos(): preço de hoje e preço previsto de cada item da CAEP, pela projeção do reajuste da ata
--    (migration 158, reajuste_itens_ata):
--    - próximo reajuste com percentual (previsto na vigência ou na prorrogação) → preço projetado;
--    - senão, reajuste já devido e não aplicado → preço devido;
--    - sem base, percentual a informar ou índice indisponível → preço de hoje, motivo SEM_PREVISAO;
--    - em dia ou ata sem reajuste → preço de hoje.
--
-- Só acrescenta: nenhuma tela ou regra que existe muda de comportamento.
-- ==============================================================================

-- 1) Órgão do beneficiário ------------------------------------------------------
ALTER TABLE public.emenda_beneficiarios ADD COLUMN IF NOT EXISTS orgao VARCHAR(60);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emenda_beneficiarios_orgao') THEN
    ALTER TABLE public.emenda_beneficiarios
      ADD CONSTRAINT emenda_beneficiarios_orgao CHECK (orgao IS NULL OR orgao IN (
        'Polícia Militar', 'Corpo de Bombeiros Militar', 'Polícia Civil', 'Polícia Científica', 'Polícia Penal',
        'Guarda Municipal', 'Secretaria de Segurança Pública', 'Defesa Civil', 'Outro'));
  END IF;
END $$;

COMMENT ON COLUMN public.emenda_beneficiarios.orgao IS
  'Coluna ÓRGÃO do Anexo da reserva (Polícia Militar, Corpo de Bombeiros Militar...), de uma lista fixa.';

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
  v_orgao TEXT;
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
  v_orgao := NULLIF(btrim(b->>'orgao'), '');
  IF v_orgao IS NOT NULL AND v_orgao NOT IN (
       'Polícia Militar', 'Corpo de Bombeiros Militar', 'Polícia Civil', 'Polícia Científica', 'Polícia Penal',
       'Guarda Municipal', 'Secretaria de Segurança Pública', 'Defesa Civil', 'Outro') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: órgão fora da lista.' USING ERRCODE = '22023';
  END IF;
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
      responsavel_cargo, responsavel_telefone, responsavel_whatsapp, responsavel_email, ativo, orgao,
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
      NULLIF(lower(btrim(b->>'responsavel_email')), ''), COALESCE((b->>'ativo')::BOOLEAN, TRUE), v_orgao,
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
    orgao = CASE WHEN b ? 'orgao' THEN v_orgao ELSE orgao END,
    versao = versao + 1, atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
  WHERE id = v_id
  RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('id', v_id, 'versao', v_versao);
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_beneficiario_emenda(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_beneficiario_emenda(JSONB) TO authenticated;

-- 2) Nome curto e GND do item ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emenda_itens_dados (
  item_key            VARCHAR(100) PRIMARY KEY,
  nome_curto          VARCHAR(80),
  gnd                 VARCHAR(10),
  versao              INTEGER      NOT NULL DEFAULT 1,
  atualizado_por      UUID,
  atualizado_por_nome VARCHAR(200),
  atualizado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT emenda_itens_dados_gnd CHECK (gnd IS NULL OR gnd IN ('GND-3', 'GND-4')),
  CONSTRAINT emenda_itens_dados_nome CHECK (nome_curto IS NULL OR btrim(nome_curto) <> '')
);
COMMENT ON TABLE public.emenda_itens_dados IS
  'O que a CAEP diz de um item para o quadro da reserva: nome curto e GND (GND-3 custeio, GND-4 investimento). Grava só salvar_dados_item_emenda.';

ALTER TABLE public.emenda_itens_dados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura das emendas: emenda_itens_dados" ON public.emenda_itens_dados;
CREATE POLICY "Leitura das emendas: emenda_itens_dados" ON public.emenda_itens_dados
  FOR SELECT TO authenticated USING ((SELECT public.has_permission('emendas.view')));
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.emenda_itens_dados;
CREATE POLICY "Somente usuario ativo" ON public.emenda_itens_dados AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.emenda_itens_dados FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.emenda_itens_dados TO authenticated;
GRANT ALL ON public.emenda_itens_dados TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_emenda_itens_dados ON public.emenda_itens_dados;
    CREATE TRIGGER trg_audit_emenda_itens_dados AFTER INSERT OR UPDATE OR DELETE ON public.emenda_itens_dados
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.salvar_dados_item_emenda(p_item_key TEXT, p_nome_curto TEXT, p_gnd TEXT, p_versao INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome   TEXT;
  v_atual  INTEGER;
  v_versao INTEGER;
  v_curto  TEXT := NULLIF(btrim(COALESCE(p_nome_curto, '')), '');
  v_gnd    TEXT := NULLIF(upper(btrim(COALESCE(p_gnd, ''))), '');
BEGIN
  IF public.has_permission('emendas.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o gestor de emendas e o coordenador alteram os dados do item.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.v_emendas_itens_caep WHERE item_key = p_item_key) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o item não tem alocação para a CAEP.' USING ERRCODE = '22023';
  END IF;
  IF v_curto IS NOT NULL AND length(v_curto) > 80 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: o nome curto tem no máximo 80 letras.' USING ERRCODE = '22023';
  END IF;
  IF v_gnd IS NOT NULL AND v_gnd NOT IN ('GND-3', 'GND-4') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: GND deve ser GND-3 (custeio) ou GND-4 (investimento).' USING ERRCODE = '22023';
  END IF;
  v_nome := left(public.nome_do_usuario_logado(), 200);

  SELECT versao INTO v_atual FROM public.emenda_itens_dados WHERE item_key = p_item_key FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.emenda_itens_dados (item_key, nome_curto, gnd, atualizado_por, atualizado_por_nome)
    VALUES (p_item_key, v_curto, v_gnd, auth.uid(), v_nome)
    RETURNING versao INTO v_versao;
    RETURN jsonb_build_object('item_key', p_item_key, 'versao', v_versao);
  END IF;
  IF p_versao IS DISTINCT FROM v_atual THEN
    RAISE EXCEPTION 'CONFLITO: Outra pessoa alterou os dados deste item. Recarregue e refaça a alteração.' USING ERRCODE = '40001';
  END IF;
  UPDATE public.emenda_itens_dados
     SET nome_curto = v_curto, gnd = v_gnd, versao = versao + 1,
         atualizado_por = auth.uid(), atualizado_por_nome = v_nome, atualizado_em = NOW()
   WHERE item_key = p_item_key
  RETURNING versao INTO v_versao;
  RETURN jsonb_build_object('item_key', p_item_key, 'versao', v_versao);
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_dados_item_emenda(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_dados_item_emenda(TEXT, TEXT, TEXT, INTEGER) TO authenticated;

-- A view dos itens da CAEP ganha o nome curto, o GND e a versão no fim (CREATE OR REPLACE só acrescenta colunas).
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
       a.allocated_qty AS alocado,
       d.nome_curto,
       d.gnd,
       d.versao AS dados_versao
  FROM public.arp_allocations a
  JOIN public.atas_registro_preco r
    ON r.numero_ata = split_part(a.item_key, '-', 1)
   AND r.codigo_uasg = split_part(a.item_key, '-', 2)
  JOIN public.itens_ata i
    ON i.ata_id = r.id
   AND lpad(i.numero_item, 5, '0') = split_part(a.item_key, '-', 3)
  LEFT JOIN public.emenda_itens_dados d ON d.item_key = a.item_key
 WHERE a.unit_name = public.unidade_das_emendas()
   AND a.allocated_qty > 0;

-- 3) Preço previsto pelo reajuste ------------------------------------------------
CREATE OR REPLACE FUNCTION public.emendas_precos_previstos()
RETURNS TABLE (
  item_key         TEXT,
  preco_atual      NUMERIC,
  preco_previsto   NUMERIC,
  motivo           TEXT,
  devido           BOOLEAN,
  efeito           DATE,
  percentual       NUMERIC,
  meses_estimados  INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH itens AS (
    SELECT c.item_key, c.numero_ata, c.codigo_uasg, c.numero_item, c.valor_unitario, a.id AS ata_id
      FROM public.v_emendas_itens_caep c
      JOIN public.atas_registro_preco a ON a.numero_ata = c.numero_ata AND a.codigo_uasg = c.codigo_uasg
     WHERE NOT c.ata_encerrada
  ), atas AS (
    SELECT DISTINCT ata_id FROM itens
  ), r AS (
    SELECT x.* FROM atas CROSS JOIN LATERAL public.reajuste_itens_ata(atas.ata_id) x
  )
  SELECT i.item_key::TEXT,
         i.valor_unitario,
         round(CASE
           WHEN r.preco_projetado IS NOT NULL THEN r.preco_projetado
           WHEN r.situacao_item IN ('DEVIDO', 'PRECO_DESATUALIZADO') THEN GREATEST(r.preco_devido, i.valor_unitario)
           ELSE i.valor_unitario
         END, 2),
         CASE
           WHEN r.situacao_item IS NULL THEN 'SEM_PREVISAO'
           WHEN r.preco_projetado IS NOT NULL THEN CASE WHEN r.proximo_situacao = 'SE_PRORROGAR' THEN 'SE_PRORROGAR' ELSE 'PREVISTO' END
           WHEN r.situacao_item IN ('DEVIDO', 'PRECO_DESATUALIZADO') THEN 'DEVIDO'
           WHEN r.situacao_item IN ('SEM_BASE', 'PERCENTUAL_A_INFORMAR', 'INDICE_INDISPONIVEL') THEN 'SEM_PREVISAO'
           WHEN r.situacao_item = 'SEM_REAJUSTE' THEN 'SEM_REAJUSTE'
           ELSE 'EM_DIA'
         END,
         COALESCE(r.situacao_item IN ('DEVIDO', 'PRECO_DESATUALIZADO'), FALSE),
         CASE WHEN r.preco_projetado IS NOT NULL THEN r.proximo_efeito END,
         CASE WHEN r.preco_projetado IS NOT NULL THEN r.proximo_percentual END,
         CASE WHEN r.preco_projetado IS NOT NULL THEN r.proximo_meses_estimados END
    FROM itens i
    LEFT JOIN r ON r.ata_id = i.ata_id AND lpad(r.numero_item, 5, '0') = lpad(i.numero_item, 5, '0');
$$;

COMMENT ON FUNCTION public.emendas_precos_previstos() IS
  'Preço de hoje e preço previsto (reajuste) de cada item da CAEP em ata vigente, para o quadro da reserva. motivo: PREVISTO | SE_PRORROGAR | DEVIDO | SEM_PREVISAO | SEM_REAJUSTE | EM_DIA.';
REVOKE ALL ON FUNCTION public.emendas_precos_previstos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emendas_precos_previstos() TO authenticated, service_role;
