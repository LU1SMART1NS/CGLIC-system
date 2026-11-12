-- Fiscalização, entrega 2 das telas revisadas em 11/11/2026 (estudo docs/estudos/modulo-fiscalizacao.md, seção 9):
--
-- 1) fisc_programas: cadastro dos programas (Ajustes › Gestão › Programas). Nome único, área responsável (unidade
--    interna), origem do recurso (Emenda parlamentar · FNSP · BNDES ou outro fundo · Outro) e ativo/inativo. Programa
--    com item ligado não se exclui, só se inativa (como usuários e unidades internas).
-- 2) fisc_entregas.programa_id: o item (contrato × item × beneficiário) entra no programa pela tela do programa
--    (Incluir itens no programa). A carga da planilha já trazia o programa em texto: vira o cadastro e a ligação.
-- 3) dividir_entrega: a parte separada herda o programa e os textos da carga (antes perdia o nome do item, o
--    beneficiário escrito à mão e a emenda da planilha).
-- 4) fisc_entregas_lista: devolve o programa pelo cadastro, o parlamentar da emenda e o endereço de entrega do
--    cadastro do beneficiário (a tabela de beneficiários só é lida por quem vê Emendas; o fiscal lê por aqui).
-- 5) fisc_contratos_para_distribuicao: devolve as atas dos itens de cada contrato (vínculo contrato → itens da ata).
-- 6) RPCs: salvar_fisc_programa, excluir_fisc_programa, definir_programa_das_entregas, fisc_programas_lista.

-- 1) Cadastro ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fisc_programas (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                VARCHAR(120) NOT NULL,
  unidade_id          VARCHAR(50)  REFERENCES public.internal_departments(id),
  origem_recurso      VARCHAR(8),
  ativo               BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_por          UUID,
  criado_por_nome     TEXT,
  criado_em           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_por_nome TEXT,
  atualizado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fisc_programas_nome CHECK (length(btrim(nome)) >= 3),
  CONSTRAINT fisc_programas_origem CHECK (origem_recurso IS NULL OR origem_recurso IN ('EMENDA', 'FNSP', 'FUNDO', 'OUTRO'))
);
CREATE UNIQUE INDEX IF NOT EXISTS fisc_programas_nome_unico ON public.fisc_programas (lower(btrim(nome)));
ALTER TABLE public.fisc_programas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura da fiscalização: fisc_programas" ON public.fisc_programas;
CREATE POLICY "Leitura da fiscalização: fisc_programas" ON public.fisc_programas FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('fiscalizacao.view')));
REVOKE ALL ON public.fisc_programas FROM PUBLIC, anon;
GRANT SELECT ON public.fisc_programas TO authenticated;

-- 2) Ligação do item ao programa ------------------------------------------------------------------
ALTER TABLE public.fisc_entregas ADD COLUMN IF NOT EXISTS programa_id UUID REFERENCES public.fisc_programas(id);
CREATE INDEX IF NOT EXISTS fisc_entregas_programa ON public.fisc_entregas (programa_id) WHERE programa_id IS NOT NULL;

ALTER TABLE public.fisc_entrega_movimentos DROP CONSTRAINT IF EXISTS fisc_entrega_movimentos_tipo;
ALTER TABLE public.fisc_entrega_movimentos ADD CONSTRAINT fisc_entrega_movimentos_tipo
  CHECK (tipo IN ('CRIADA', 'ETAPA', 'DIVISAO', 'PREVISTA', 'RESPONSAVEL', 'AUTOMATICA', 'CARGA', 'PROGRAMA'));

-- Carga: os programas que a planilha da SFC/CGLIC trazia em texto viram cadastro (área e origem a informar).
INSERT INTO public.fisc_programas (nome, criado_por_nome, atualizado_por_nome)
SELECT DISTINCT btrim(e.programa_texto), 'Carga da planilha da SFC/CGLIC', 'Carga da planilha da SFC/CGLIC'
  FROM public.fisc_entregas e
 WHERE NULLIF(btrim(e.programa_texto), '') IS NOT NULL
ON CONFLICT DO NOTHING;
UPDATE public.fisc_entregas e
   SET programa_id = p.id
  FROM public.fisc_programas p
 WHERE e.programa_id IS NULL
   AND lower(btrim(p.nome)) = lower(btrim(e.programa_texto));

-- 3) Entrega parcial herda o programa e os textos da carga ----------------------------------------
CREATE OR REPLACE FUNCTION public.dividir_entrega(p_id UUID, p_quantidade INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_e    public.fisc_entregas%ROWTYPE;
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_novo UUID;
BEGIN
  PERFORM public.fisc_conferir_entregas(ARRAY[p_id]);
  SELECT * INTO v_e FROM public.fisc_entregas WHERE id = p_id;
  IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade >= v_e.quantidade THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A parte deve ser de 1 a % unidades.', v_e.quantidade - 1 USING ERRCODE = '22023';
  END IF;
  UPDATE public.fisc_entregas SET quantidade = quantidade - p_quantidade, atualizado_por_nome = v_nome, atualizado_em = NOW() WHERE id = p_id;
  INSERT INTO public.fisc_entregas (contract_key, emenda_linha_id, item_key, beneficiario_id, quantidade, origem, responsavel, etapa, etapa_em, prevista, entregue_em, dividida_de, atualizado_por_nome,
                                    item_texto, beneficiario_texto, municipio_texto, uf_texto, emenda_texto, programa_texto, carga_linha, programa_id)
  VALUES (v_e.contract_key, v_e.emenda_linha_id, v_e.item_key, v_e.beneficiario_id, p_quantidade, v_e.origem, v_e.responsavel, v_e.etapa, v_e.etapa_em, v_e.prevista, v_e.entregue_em, p_id, v_nome,
          v_e.item_texto, v_e.beneficiario_texto, v_e.municipio_texto, v_e.uf_texto, v_e.emenda_texto, v_e.programa_texto, v_e.carga_linha, v_e.programa_id)
  RETURNING id INTO v_novo;
  INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, observacao, criado_por, criado_por_nome) VALUES
    (p_id, 'DIVISAO', format('%s de %s unidades passaram para outra entrega', p_quantidade, v_e.quantidade), auth.uid(), v_nome),
    (v_novo, 'DIVISAO', format('Parte de %s unidades da entrega de %s', p_quantidade, v_e.quantidade), auth.uid(), v_nome);
  RETURN jsonb_build_object('nova', v_novo, 'restante', v_e.quantidade - p_quantidade);
END;
$$;
REVOKE ALL ON FUNCTION public.dividir_entrega(UUID, INTEGER) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.dividir_entrega(UUID, INTEGER) TO authenticated;

-- 6) Cadastro e ligação pelas RPCs ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salvar_fisc_programa(p_id UUID, p_nome TEXT, p_unidade TEXT, p_origem TEXT, p_ativo BOOLEAN DEFAULT TRUE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome TEXT := left(public.nome_do_usuario_logado(), 200);
  v_id   UUID;
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador e o gestor de fiscalização cadastram programas.' USING ERRCODE = '42501';
  END IF;
  IF p_nome IS NULL OR length(btrim(p_nome)) < 3 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o nome do programa (pelo menos 3 letras).' USING ERRCODE = '22023';
  END IF;
  IF p_unidade IS NULL OR NOT EXISTS (SELECT 1 FROM public.internal_departments d WHERE d.id = p_unidade) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha a área responsável entre as unidades internas.' USING ERRCODE = '22023';
  END IF;
  IF p_origem IS NULL OR p_origem NOT IN ('EMENDA', 'FNSP', 'FUNDO', 'OUTRO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha a origem do recurso.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_programas p WHERE lower(btrim(p.nome)) = lower(btrim(p_nome)) AND p.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'CONFLICT: Já existe um programa com esse nome.' USING ERRCODE = '23505';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.fisc_programas (nome, unidade_id, origem_recurso, ativo, criado_por, criado_por_nome, atualizado_por_nome)
    VALUES (btrim(p_nome), p_unidade, p_origem, COALESCE(p_ativo, TRUE), auth.uid(), v_nome, v_nome)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.fisc_programas
       SET nome = btrim(p_nome), unidade_id = p_unidade, origem_recurso = p_origem, ativo = COALESCE(p_ativo, ativo),
           atualizado_por_nome = v_nome, atualizado_em = NOW()
     WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: Programa não encontrado.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_fisc_programa(UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_fisc_programa(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- Excluir só programa sem item ligado; com itens, inativar (salvar com p_ativo = FALSE).
CREATE OR REPLACE FUNCTION public.excluir_fisc_programa(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador e o gestor de fiscalização cadastram programas.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fisc_entregas e WHERE e.programa_id = p_id) THEN
    RAISE EXCEPTION 'CONFLICT: O programa tem itens ligados; inative em vez de excluir.' USING ERRCODE = '23503';
  END IF;
  DELETE FROM public.fisc_programas WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Programa não encontrado.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.excluir_fisc_programa(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.excluir_fisc_programa(UUID) TO authenticated;

-- Incluir e retirar itens do programa (tela do programa). Item de outro programa não é tirado de lá sem retirar antes.
CREATE OR REPLACE FUNCTION public.definir_programa_das_entregas(p_programa UUID, p_incluir UUID[], p_retirar UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nome     TEXT := left(public.nome_do_usuario_logado(), 200);
  v_programa public.fisc_programas%ROWTYPE;
  v_incl     INTEGER := 0;
  v_ret      INTEGER := 0;
BEGIN
  IF public.has_permission('fiscalizacao.manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador e o gestor de fiscalização incluem itens em programas.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_programa FROM public.fisc_programas WHERE id = p_programa;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Programa não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(array_length(p_incluir, 1), 0) > 0 THEN
    IF NOT v_programa.ativo THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O programa está inativo; ative antes de incluir itens.' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM public.fisc_entregas WHERE id = ANY (p_incluir)) <> (SELECT count(DISTINCT x) FROM unnest(p_incluir) x) THEN
      RAISE EXCEPTION 'NOT_FOUND: Item não encontrado.' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.fisc_entregas WHERE id = ANY (p_incluir) AND programa_id IS NOT NULL AND programa_id <> p_programa) THEN
      RAISE EXCEPTION 'CONFLICT: Há item já ligado a outro programa; retire de lá antes.' USING ERRCODE = '23505';
    END IF;
    WITH m AS (
      UPDATE public.fisc_entregas SET programa_id = p_programa, atualizado_por_nome = v_nome, atualizado_em = NOW()
       WHERE id = ANY (p_incluir) AND programa_id IS DISTINCT FROM p_programa
      RETURNING id
    ), mov AS (
      INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, observacao, criado_por, criado_por_nome)
      SELECT id, 'PROGRAMA', format('Incluído no programa %s', v_programa.nome), auth.uid(), v_nome FROM m
      RETURNING 1
    )
    SELECT count(*) INTO v_incl FROM mov;
  END IF;
  IF COALESCE(array_length(p_retirar, 1), 0) > 0 THEN
    WITH m AS (
      UPDATE public.fisc_entregas SET programa_id = NULL, atualizado_por_nome = v_nome, atualizado_em = NOW()
       WHERE id = ANY (p_retirar) AND programa_id = p_programa
      RETURNING id
    ), mov AS (
      INSERT INTO public.fisc_entrega_movimentos (entrega_id, tipo, observacao, criado_por, criado_por_nome)
      SELECT id, 'PROGRAMA', format('Retirado do programa %s', v_programa.nome), auth.uid(), v_nome FROM m
      RETURNING 1
    )
    SELECT count(*) INTO v_ret FROM mov;
  END IF;
  RETURN jsonb_build_object('incluidos', v_incl, 'retirados', v_ret);
END;
$$;
REVOKE ALL ON FUNCTION public.definir_programa_das_entregas(UUID, UUID[], UUID[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.definir_programa_das_entregas(UUID, UUID[], UUID[]) TO authenticated;

-- Lista do cadastro, com a sigla da área e quantos itens o programa tem.
CREATE OR REPLACE FUNCTION public.fisc_programas_lista()
RETURNS TABLE (
  id             UUID,
  nome           TEXT,
  unidade_id     TEXT,
  unidade_sigla  TEXT,
  origem_recurso TEXT,
  ativo          BOOLEAN,
  itens          INTEGER,
  atualizado_por_nome TEXT,
  atualizado_em  TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.has_permission('fiscalizacao.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à fiscalização.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.nome::TEXT, p.unidade_id::TEXT, d.sigla::TEXT, p.origem_recurso::TEXT, p.ativo,
         (SELECT count(*)::INTEGER FROM public.fisc_entregas e WHERE e.programa_id = p.id),
         p.atualizado_por_nome, p.atualizado_em
    FROM public.fisc_programas p
    LEFT JOIN public.internal_departments d ON d.id = p.unidade_id
   ORDER BY p.ativo DESC, p.nome;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_programas_lista() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_programas_lista() TO authenticated;

-- 4) Lista dos itens com programa, parlamentar e endereço de entrega ------------------------------
DROP FUNCTION IF EXISTS public.fisc_entregas_lista(TEXT);
CREATE FUNCTION public.fisc_entregas_lista(p_contrato TEXT DEFAULT NULL)
RETURNS TABLE (
  id                UUID,
  contract_key      TEXT,
  contrato_numero   TEXT,
  fornecedor        TEXT,
  fiscal_user_id    UUID,
  fiscal_nome       TEXT,
  substituto_user_id UUID,
  fiscalizacao      TEXT,
  item_key          TEXT,
  item_nome         TEXT,
  item_descricao    TEXT,
  item_texto        TEXT,
  beneficiario_id   UUID,
  beneficiario_nome TEXT,
  beneficiario_sigla TEXT,
  beneficiario_razao TEXT,
  beneficiario_texto TEXT,
  municipio         TEXT,
  uf                TEXT,
  quantidade        INTEGER,
  origem            TEXT,
  emenda            TEXT,
  pedido_id         UUID,
  responsavel       TEXT,
  etapa             TEXT,
  etapa_em          DATE,
  prevista          DATE,
  entregue_em       DATE,
  dividida_de       UUID,
  programa_texto    TEXT,
  carga_linha       INTEGER,
  faturado_em       DATE,
  pago_em           DATE,
  atualizado_por_nome TEXT,
  atualizado_em     TIMESTAMPTZ,
  programa_id       UUID,
  programa_ativo    BOOLEAN,
  parlamentar_nome  TEXT,
  entrega_logradouro TEXT,
  entrega_numero    TEXT,
  entrega_complemento TEXT,
  entrega_bairro    TEXT,
  entrega_cep       TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.has_permission('fiscalizacao.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à fiscalização.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.id, e.contract_key::TEXT,
         COALESCE(NULLIF(c.registro->>'numero', ''), c.numero, e.contract_key)::TEXT,
         (c.registro->>'fornecedorNome')::TEXT,
         f.fiscal_user_id, f.fiscal_nome::TEXT, f.substituto_user_id, f.fiscalizacao::TEXT,
         e.item_key::TEXT, i.nome_curto::TEXT, i.descricao_item::TEXT, e.item_texto,
         e.beneficiario_id, COALESCE(b.nome, b.nome_curto)::TEXT, b.sigla::TEXT, b.razao_social::TEXT, e.beneficiario_texto, COALESCE(b.entrega_municipio, e.municipio_texto)::TEXT, COALESCE(b.entrega_uf, e.uf_texto)::TEXT,
         e.quantidade, e.origem::TEXT, COALESCE(p.siop_emenda::TEXT, e.emenda_texto), p.id,
         e.responsavel::TEXT, e.etapa::TEXT, e.etapa_em, e.prevista, e.entregue_em, e.dividida_de,
         COALESCE(pr.nome, e.programa_texto)::TEXT, e.carga_linha,
         n.faturado_em::DATE, n.pago_em::DATE, e.atualizado_por_nome::TEXT, e.atualizado_em,
         e.programa_id, pr.ativo, a.nome::TEXT,
         b.entrega_logradouro::TEXT, b.entrega_numero::TEXT, b.entrega_complemento::TEXT, b.entrega_bairro::TEXT, b.entrega_cep::TEXT
    FROM public.fisc_entregas e
    JOIN public.fisc_contratos f ON f.contract_key = e.contract_key
    LEFT JOIN LATERAL (SELECT co.* FROM public.contratos_oficiais co WHERE co.contract_key = e.contract_key ORDER BY co.sincronizado_em DESC LIMIT 1) c ON TRUE
    LEFT JOIN public.v_emendas_itens_caep i ON i.item_key = e.item_key
    LEFT JOIN public.emenda_beneficiarios b ON b.id = e.beneficiario_id
    LEFT JOIN public.emenda_pedido_linhas l ON l.id = e.emenda_linha_id
    LEFT JOIN public.emenda_pedidos p ON p.id = l.pedido_id
    LEFT JOIN public.emenda_autores a ON a.id = p.autor_id
    LEFT JOIN public.emenda_linha_notas n ON n.linha_id = e.emenda_linha_id
    LEFT JOIN public.fisc_programas pr ON pr.id = e.programa_id
   WHERE p_contrato IS NULL OR e.contract_key = p_contrato;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_entregas_lista(TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_entregas_lista(TEXT) TO authenticated;

-- 5) Distribuição e listas de contratos com as atas dos itens do contrato --------------------------
DROP FUNCTION IF EXISTS public.fisc_contratos_para_distribuicao();
CREATE FUNCTION public.fisc_contratos_para_distribuicao()
RETURNS TABLE (
  contract_key        TEXT,
  uasg                TEXT,
  numero              TEXT,
  fornecedor          TEXT,
  objeto              TEXT,
  assinatura          DATE,
  vigencia_fim        DATE,
  emendas             TEXT[],
  situacao            TEXT,
  motivo              TEXT,
  fiscal_user_id      UUID,
  fiscal_nome         TEXT,
  substituto_user_id  UUID,
  substituto_nome     TEXT,
  portaria_sei        TEXT,
  processo_sei        TEXT,
  autuado_em          DATE,
  definido_por_nome   TEXT,
  definido_em         TIMESTAMPTZ,
  atas                TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.has_permission('fiscalizacao.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sem acesso à fiscalização.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH emendas AS (
    SELECT n.contract_key AS chave, array_agg(DISTINCT p.siop_emenda::TEXT ORDER BY p.siop_emenda::TEXT) FILTER (WHERE p.siop_emenda IS NOT NULL) AS lista, TRUE AS de_emenda
      FROM public.emenda_linha_notas n
      JOIN public.emenda_pedido_linhas l ON l.id = n.linha_id AND NOT l.cancelada
      JOIN public.emenda_pedidos p ON p.id = l.pedido_id AND p.etapa <> 'CANCELADO'
     WHERE n.contract_key IS NOT NULL
     GROUP BY n.contract_key
  ),
  atas AS (
    -- A chave do item da ata é "ata-UASG-item" (00031/2025-200331-00002).
    SELECT k.contract_key AS chave, array_agg(DISTINCT split_part(k.item_key, '-', 1) ORDER BY split_part(k.item_key, '-', 1)) AS lista
      FROM public.arp_item_contract_links k
     GROUP BY k.contract_key
  ),
  contratos AS (
    SELECT DISTINCT ON (c.contract_key) c.*
      FROM public.contratos_oficiais c
     ORDER BY c.contract_key, c.sincronizado_em DESC
  )
  SELECT c.contract_key::TEXT,
         c.uasg::TEXT,
         COALESCE(NULLIF(c.registro->>'numero', ''), c.numero)::TEXT,
         (c.registro->>'fornecedorNome')::TEXT,
         (c.registro->>'objeto')::TEXT,
         NULLIF(c.registro->>'dataAssinatura', '')::DATE,
         c.data_vigencia_fim,
         COALESCE(e.lista, ARRAY[]::TEXT[]),
         CASE WHEN f.contract_key IS NOT NULL THEN f.fiscalizacao::TEXT
              WHEN e.de_emenda THEN 'A_DEFINIR'
              ELSE 'AREA_PADRAO' END,
         f.motivo, f.fiscal_user_id, f.fiscal_nome::TEXT, f.substituto_user_id, f.substituto_nome::TEXT,
         f.portaria_sei::TEXT, f.processo_sei::TEXT, f.autuado_em, f.definido_por_nome::TEXT, f.definido_em,
         COALESCE(at.lista, ARRAY[]::TEXT[])
    FROM contratos c
    LEFT JOIN emendas e ON e.chave = c.contract_key
    LEFT JOIN atas at ON at.chave = c.contract_key
    LEFT JOIN public.fisc_contratos f ON f.contract_key = c.contract_key
   WHERE f.contract_key IS NOT NULL
      OR c.data_vigencia_fim IS NULL
      OR c.data_vigencia_fim >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
END;
$$;
REVOKE ALL ON FUNCTION public.fisc_contratos_para_distribuicao() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fisc_contratos_para_distribuicao() TO authenticated;
