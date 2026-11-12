-- ==============================================================================
-- Versão: 20261028000223_decisao_registrado_acima.sql
-- Decisão do gestor no aviso "Registrado acima do homologado" (protótipo aprovado em 27/10/2026, D1 a D6).
--
-- O "Resolvido" do aviso dá lugar a duas escolhas:
--   MANTER  ("Manter o saldo remanescente" / "Manter fora do saldo"): o desconto da SENASP continua; o aviso sai
--           da fila do Painel e vira uma linha no Item 360. Guarda, se houver, o número de protocolo do chamado de
--           correção aberto no suporte do MGI (texto livre; não é número SEI).
--   ACEITAR ("Aceitar o registrado"): só em ata prorrogada, com o número SEI do termo aditivo que renova os
--           quantitativos e as quatro condições do Parecer 75/2024/DECOR/CGU/AGU (previsão no edital e na ata,
--           planejamento, preço vantajoso, termo na vigência). Grava também em avisos_resolvidos, que é o que tira
--           o desconto da base do saldo (migration 142).
-- A decisão é do aviso (chave com a soma do registrado): se a soma no Compras.gov.br mudar, a chave muda e o aviso
-- volta sem decisão. Quem decide: gestor da ata e coordenador, no alcance dele (exigir_alcance_do_aviso, migration
-- 199). Desfazer apaga a decisão (e o "resolvido" do aceitar).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.registrado_acima_decisoes (
  chave              VARCHAR(300) PRIMARY KEY,
  item_key           VARCHAR(60)  NOT NULL,
  decisao            VARCHAR(8)   NOT NULL CHECK (decisao IN ('MANTER', 'ACEITAR')),
  documento_sei      VARCHAR(8)   CHECK (documento_sei IS NULL OR documento_sei ~ '^[0-9]{8}$'),
  protocolo_mgi      VARCHAR(40),
  justificativa      TEXT         NOT NULL,
  condicoes_parecer  BOOLEAN      NOT NULL DEFAULT FALSE,
  decidido_por       UUID,
  decidido_por_nome  TEXT,
  decidido_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (decisao <> 'ACEITAR' OR (documento_sei IS NOT NULL AND condicoes_parecer))
);
COMMENT ON TABLE public.registrado_acima_decisoes IS
  'Decisão do gestor da ata no aviso registrado acima do homologado (migration 223): MANTER (desconto continua) ou ACEITAR (só com termo aditivo que renova os quantitativos; também em avisos_resolvidos). Grava só pelas RPCs.';
CREATE INDEX IF NOT EXISTS registrado_acima_decisoes_item ON public.registrado_acima_decisoes (item_key);

ALTER TABLE public.registrado_acima_decisoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read: registrado_acima_decisoes" ON public.registrado_acima_decisoes;
CREATE POLICY "Authenticated Read: registrado_acima_decisoes" ON public.registrado_acima_decisoes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Somente usuario ativo" ON public.registrado_acima_decisoes;
CREATE POLICY "Somente usuario ativo" ON public.registrado_acima_decisoes AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.usuario_ativo())) WITH CHECK ((SELECT public.usuario_ativo()));
REVOKE ALL ON public.registrado_acima_decisoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.registrado_acima_decisoes TO authenticated;
GRANT ALL ON public.registrado_acima_decisoes TO service_role;

-- Decidir: MANTER ou ACEITAR.
CREATE OR REPLACE FUNCTION public.decidir_registrado_acima(
  p_chave TEXT, p_decisao TEXT, p_documento TEXT, p_justificativa TEXT, p_condicoes_parecer BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chave   TEXT := btrim(COALESCE(p_chave, ''));
  v_decisao TEXT := upper(btrim(COALESCE(p_decisao, '')));
  -- ACEITAR: número SEI do termo aditivo (8 dígitos). MANTER: protocolo do chamado no suporte do MGI (texto livre).
  v_doc     TEXT := NULLIF(btrim(COALESCE(p_documento, '')), '');
  v_sei     TEXT := NULLIF(regexp_replace(COALESCE(p_documento, ''), '\D', '', 'g'), '');
  v_just    TEXT := btrim(COALESCE(p_justificativa, ''));
  v_aviso   RECORD;
  v_prorrogada BOOLEAN;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Este aviso é decidido pelo gestor da ata ou pelo coordenador.' USING ERRCODE = '42501';
  END IF;
  IF v_decisao NOT IN ('MANTER', 'ACEITAR') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha manter ou aceitar.' USING ERRCODE = '22023';
  END IF;

  SELECT r.item_key, r.numero_ata, r.codigo_uasg INTO v_aviso
    FROM public.v_item_registrado_acima r WHERE r.chave_aviso = v_chave;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O aviso mudou ou não existe mais. Recarregue a tela.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.exigir_alcance_do_aviso(v_chave);

  IF char_length(v_just) < 15 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escreva a justificativa (mínimo de 15 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A justificativa pode ter no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF v_decisao = 'ACEITAR' THEN
    SELECT (a.data_vigencia_final::DATE - a.data_vigencia_inicial::DATE) > 400 INTO v_prorrogada
      FROM public.atas_registro_preco a
     WHERE a.numero_ata = v_aviso.numero_ata AND a.codigo_uasg = v_aviso.codigo_uasg
     LIMIT 1;
    IF NOT COALESCE(v_prorrogada, FALSE) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Sem prorrogação não há termo que renove os quantitativos: não dá para aceitar o registrado.' USING ERRCODE = '22023';
    END IF;
    IF v_sei IS NULL OR v_sei !~ '^[0-9]{8}$' THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Informe o número SEI do termo aditivo que renova os quantitativos (8 dígitos).' USING ERRCODE = '22023';
    END IF;
    IF NOT COALESCE(p_condicoes_parecer, FALSE) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Sem as quatro condições do Parecer 75/2024/DECOR o excedente não tem lastro: mantenha o saldo remanescente.' USING ERRCODE = '22023';
    END IF;
    -- O "resolvido" é o que tira o desconto da base do saldo (migration 142).
    INSERT INTO public.avisos_resolvidos (chave, tipo, justificativa, resolvido_por, resolvido_por_nome, resolvido_em)
    VALUES (v_chave, 'SALDO', left('Registrado aceito (termo aditivo SEI ' || v_sei || '): ' || v_just, 500), auth.uid(), public.nome_do_usuario_logado(), NOW())
    ON CONFLICT (chave) DO UPDATE
      SET justificativa = EXCLUDED.justificativa, resolvido_por = EXCLUDED.resolvido_por,
          resolvido_por_nome = EXCLUDED.resolvido_por_nome, resolvido_em = EXCLUDED.resolvido_em;
  ELSE
    IF v_doc IS NOT NULL AND char_length(v_doc) > 40 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: O protocolo do MGI pode ter no máximo 40 caracteres.' USING ERRCODE = '22023';
    END IF;
    -- Manter: o desconto continua (e um "aceitar" anterior deixa de valer).
    DELETE FROM public.avisos_resolvidos WHERE chave = v_chave;
  END IF;

  INSERT INTO public.registrado_acima_decisoes (chave, item_key, decisao, documento_sei, protocolo_mgi, justificativa, condicoes_parecer,
                                                decidido_por, decidido_por_nome, decidido_em)
  VALUES (v_chave, v_aviso.item_key, v_decisao,
          CASE WHEN v_decisao = 'ACEITAR' THEN v_sei END, CASE WHEN v_decisao = 'MANTER' THEN v_doc END,
          v_just, v_decisao = 'ACEITAR', auth.uid(), public.nome_do_usuario_logado(), NOW())
  ON CONFLICT (chave) DO UPDATE
    SET decisao = EXCLUDED.decisao, documento_sei = EXCLUDED.documento_sei, protocolo_mgi = EXCLUDED.protocolo_mgi,
        justificativa = EXCLUDED.justificativa,
        condicoes_parecer = EXCLUDED.condicoes_parecer, decidido_por = EXCLUDED.decidido_por,
        decidido_por_nome = EXCLUDED.decidido_por_nome, decidido_em = EXCLUDED.decidido_em;

  RETURN jsonb_build_object('success', true, 'chave', v_chave, 'decisao', v_decisao);
END;
$$;
REVOKE ALL ON FUNCTION public.decidir_registrado_acima(TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decidir_registrado_acima(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- Desfazer: o aviso volta sem decisão (e o desconto volta, se tinha sido aceito).
CREATE OR REPLACE FUNCTION public.desfazer_decisao_registrado_acima(p_chave TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chave TEXT := btrim(COALESCE(p_chave, ''));
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Este aviso é decidido pelo gestor da ata ou pelo coordenador.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.registrado_acima_decisoes WHERE chave = v_chave) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Este aviso não tem decisão para desfazer.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.exigir_alcance_do_aviso(v_chave);
  DELETE FROM public.avisos_resolvidos WHERE chave = v_chave;
  DELETE FROM public.registrado_acima_decisoes WHERE chave = v_chave;
  RETURN jsonb_build_object('success', true, 'chave', v_chave);
END;
$$;
REVOKE ALL ON FUNCTION public.desfazer_decisao_registrado_acima(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_decisao_registrado_acima(TEXT) TO authenticated, service_role;
