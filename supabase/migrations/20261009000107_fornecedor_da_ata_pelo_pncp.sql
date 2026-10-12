-- ==============================================================================
-- MIGRATION 107: fornecedor da ata que o PNCP publica sem fornecedor
-- ==============================================================================
-- Caso de 09/10/2026 (atas 00042 e 00043/2026): o Contratos.gov.br publica a ata
-- no PNCP no mesmo dia, mas o PNCP não diz de qual fornecedor é a ata, e o
-- Compras.gov.br (que diz) demora semanas. Quando a compra gerou mais de uma
-- ata, a sincronização não consegue saber quais itens são de cada ata e deixa
-- a ata sem itens (regra de 06/10/2026: melhor ata sem itens do que itens
-- alheios).
--
-- Aqui fica, por ata, o caso detectado pela sincronização (PENDENTE, com os
-- fornecedores que têm resultado publicado na compra, os "candidatos") e a
-- escolha do coordenador (INDICADO). A sincronização seguinte traz do PNCP os
-- itens do fornecedor indicado. Quando o Compras.gov.br publicar a ata, a
-- sincronização confere o fornecedor com a fonte oficial (CONFERIDO ou
-- DIVERGENTE) ou, se ninguém indicou, apaga a pendência.
--
-- O identificador é gravado como o PNCP o publica (CNPJ só com dígitos, ou
-- "ESTRANG0000440" para fornecedor estrangeiro, que não tem CNPJ): o
-- coordenador escolhe entre os candidatos, não digita nada.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.atas_fornecedor_pncp (
  numero_controle_pncp VARCHAR(100) PRIMARY KEY,
  numero_ata VARCHAR(20) NOT NULL,
  codigo_uasg VARCHAR(10) NOT NULL,
  numero_controle_pncp_compra VARCHAR(100),
  numero_compra VARCHAR(20),
  ano_compra VARCHAR(4),
  atas_na_compra INTEGER,
  estado TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (estado IN ('PENDENTE', 'INDICADO', 'CONFERIDO', 'DIVERGENTE')),
  -- [{identificador, nome, itens:[{numero_item, descricao, quantidade, valor_unitario, valor_total}]}]
  candidatos JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(candidatos) = 'array'),
  -- [{numero_item, descricao, quantidade}] — itens da compra ainda sem resultado publicado no PNCP
  itens_sem_resultado JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(itens_sem_resultado) = 'array'),
  fornecedor_identificador VARCHAR(30),
  fornecedor_nome TEXT,
  como_confirmou TEXT CHECK (como_confirmou IS NULL OR char_length(btrim(como_confirmou)) BETWEEN 10 AND 500),
  indicado_por UUID,
  indicado_por_nome TEXT,
  indicado_em TIMESTAMPTZ,
  -- O que o Compras.gov.br informou quando publicou a ata (conferência).
  fonte_fornecedor_identificador VARCHAR(30),
  fonte_fornecedor_nome TEXT,
  conferido_em TIMESTAMPTZ,
  detectado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (estado = 'PENDENTE' OR (fornecedor_identificador IS NOT NULL AND como_confirmou IS NOT NULL AND indicado_em IS NOT NULL)),
  CHECK (estado NOT IN ('CONFERIDO', 'DIVERGENTE') OR conferido_em IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_atas_fornecedor_pncp_ata ON public.atas_fornecedor_pncp (numero_ata, codigo_uasg);

ALTER TABLE public.atas_fornecedor_pncp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura para logados: atas_fornecedor_pncp" ON public.atas_fornecedor_pncp;
CREATE POLICY "Leitura para logados: atas_fornecedor_pncp"
  ON public.atas_fornecedor_pncp FOR SELECT TO authenticated USING (true);

-- Só o servidor (service role) detecta, confere e apaga; o coordenador indica pela RPC abaixo.
REVOKE ALL ON public.atas_fornecedor_pncp FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.atas_fornecedor_pncp FROM authenticated;
GRANT SELECT ON public.atas_fornecedor_pncp TO authenticated;
GRANT ALL ON public.atas_fornecedor_pncp TO service_role;

-- Auditoria: a indicação e o desfazer ficam em audit_logs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_atas_fornecedor_pncp ON public.atas_fornecedor_pncp;
    CREATE TRIGGER trg_audit_atas_fornecedor_pncp
      AFTER INSERT OR UPDATE OR DELETE ON public.atas_fornecedor_pncp
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- Coordenador indica o fornecedor da ata, entre os candidatos que o PNCP publicou.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.indicar_fornecedor_da_ata(
  p_numero_controle_pncp TEXT,
  p_fornecedor_identificador TEXT,
  p_como_confirmou TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_controle TEXT := btrim(COALESCE(p_numero_controle_pncp, ''));
  v_ident TEXT := upper(regexp_replace(COALESCE(p_fornecedor_identificador, ''), '[^A-Za-z0-9]', '', 'g'));
  v_como TEXT := btrim(COALESCE(p_como_confirmou, ''));
  v_registro public.atas_fornecedor_pncp%ROWTYPE;
  v_candidato JSONB;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador indica o fornecedor de uma ata.'
      USING ERRCODE = '42501';
  END IF;
  IF v_controle = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Ata não identificada.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_como) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escreva como confirmou o fornecedor, com pelo menos 10 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_como) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O texto pode ter no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_registro FROM public.atas_fornecedor_pncp WHERE numero_controle_pncp = v_controle FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Esta ata não está com fornecedor pendente.' USING ERRCODE = 'P0002';
  END IF;
  IF v_registro.estado NOT IN ('PENDENTE', 'INDICADO') THEN
    RAISE EXCEPTION 'INVALID_STATE: O fornecedor desta ata já foi conferido com o Compras.gov.br.' USING ERRCODE = '55000';
  END IF;

  SELECT c INTO v_candidato
    FROM jsonb_array_elements(v_registro.candidatos) AS c
   WHERE upper(regexp_replace(COALESCE(c->>'identificador', ''), '[^A-Za-z0-9]', '', 'g')) = v_ident
   LIMIT 1;
  IF v_candidato IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escolha um dos fornecedores que têm resultado publicado na compra.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.atas_fornecedor_pncp
     SET estado = 'INDICADO',
         fornecedor_identificador = v_candidato->>'identificador',
         fornecedor_nome = NULLIF(v_candidato->>'nome', ''),
         como_confirmou = v_como,
         indicado_por = auth.uid(),
         indicado_por_nome = public.nome_do_usuario_logado(),
         indicado_em = NOW(),
         atualizado_em = NOW()
   WHERE numero_controle_pncp = v_controle;

  RETURN jsonb_build_object('success', true, 'numero_controle_pncp', v_controle, 'fornecedor_identificador', v_candidato->>'identificador');
END;
$$;

-- ------------------------------------------------------------------------------
-- Coordenador desfaz a indicação, só enquanto a sincronização ainda não gravou os
-- itens: depois disso, apagar itens é limpeza de dados, não um clique.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desfazer_indicacao_fornecedor_da_ata(p_numero_controle_pncp TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_controle TEXT := btrim(COALESCE(p_numero_controle_pncp, ''));
  v_registro public.atas_fornecedor_pncp%ROWTYPE;
  v_itens INTEGER;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador desfaz a indicação do fornecedor.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_registro FROM public.atas_fornecedor_pncp WHERE numero_controle_pncp = v_controle FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Esta ata não tem indicação de fornecedor.' USING ERRCODE = 'P0002';
  END IF;
  IF v_registro.estado <> 'INDICADO' THEN
    RAISE EXCEPTION 'INVALID_STATE: Só uma indicação ainda não conferida pode ser desfeita.' USING ERRCODE = '55000';
  END IF;

  SELECT COUNT(*) INTO v_itens
    FROM public.itens_ata i
    JOIN public.atas_registro_preco a ON a.id = i.ata_id
   WHERE a.numero_controle_pncp = v_controle;
  IF v_itens > 0 THEN
    RAISE EXCEPTION 'INVALID_STATE: A sincronização já gravou % item(ns) deste fornecedor na ata; a indicação não pode mais ser desfeita pela tela.', v_itens
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.atas_fornecedor_pncp
     SET estado = 'PENDENTE',
         fornecedor_identificador = NULL,
         fornecedor_nome = NULL,
         como_confirmou = NULL,
         indicado_por = NULL,
         indicado_por_nome = NULL,
         indicado_em = NULL,
         atualizado_em = NOW()
   WHERE numero_controle_pncp = v_controle;

  RETURN jsonb_build_object('success', true, 'numero_controle_pncp', v_controle);
END;
$$;

REVOKE ALL ON FUNCTION public.indicar_fornecedor_da_ata(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.desfazer_indicacao_fornecedor_da_ata(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.indicar_fornecedor_da_ata(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desfazer_indicacao_fornecedor_da_ata(TEXT) TO authenticated;
