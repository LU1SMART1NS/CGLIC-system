-- ==============================================================================
-- MIGRATION 105: ATAS DE OUTROS ÓRGÃOS EM QUE A SENASP É PARTICIPANTE OU FEZ ADESÃO
-- Versão: 20261009000105_atas_em_que_a_senasp_participa.sql
--
-- Contexto: o sistema só trazia as atas em que 200330/200331 é a gerenciadora. Nenhuma API pública filtra
-- atas por órgão participante. O servidor (recurso 'atas_participacao' da função sincronizar-fontes) parte
-- das compras de outras UASGs citadas nos contratos já sincronizados, lista as atas dessas compras na
-- gerenciadora e confirma em cada item, no Compras.gov.br, se a SENASP é participante (3_consultarUnidadesItem)
-- ou fez adesão (5_consultarAdesoesItem). Protótipo de 09/10/2026: 14 atas como participante e 5 adesões.
--
-- Tabelas próprias, separadas de atas_registro_preco/itens_ata: as carteiras, saldos, gestores e o vínculo
-- automático continuam exatamente como estão. Mostrar essas atas nas telas é um passo seguinte.
--
-- 1) participacao_compras_lidas: registro de leitura de cada compra (por UASG da carteira), para a releitura
--    incremental.
-- 2) atas_participacao: uma linha por ata e por UASG da SENASP envolvida, com o papel (PARTICIPANTE/ADESAO).
-- 3) itens_ata_participacao: só os itens em que a SENASP aparece, com a quantidade da SENASP (registrada,
--    para participante; soma das aprovadas, para adesão) e o registro da fonte.
--    - Nada é apagado: ata ou item que some de uma leitura continua no banco.
--    - Sem gatilho de auditoria de propósito: é cópia de fonte oficial regravada (como itens_ata_unidades_copia).
-- 4) gravar_atas_participacao: escrita só pelo servidor, com a trava do recurso da UASG.
-- 5) Agendamento: um job por UASG às :10 e :12.
--
-- Leitura: todo usuário logado. Nenhuma regra existente muda.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) participacao_compras_lidas
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.participacao_compras_lidas (
  uasg_carteira    VARCHAR(6)  NOT NULL,
  id_compra        VARCHAR(17) NOT NULL,  -- UASG da compra (6) + modalidade (2) + número (5) + ano (4)
  uasg_compra      VARCHAR(6)  NOT NULL,
  contratos        INTEGER     NOT NULL DEFAULT 0,  -- contratos da carteira que citam a compra
  atas_encontradas INTEGER     NOT NULL DEFAULT 0,  -- atas da compra na gerenciadora (com ou sem SENASP)
  leitura_completa BOOLEAN     NOT NULL DEFAULT FALSE,
  tem_ata_vigente  BOOLEAN     NOT NULL DEFAULT FALSE,
  lido_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (uasg_carteira, id_compra),
  CONSTRAINT participacao_compras_lidas_uasg CHECK (uasg_carteira ~ '^\d{6}$' AND uasg_compra ~ '^\d{6}$'),
  CONSTRAINT participacao_compras_lidas_id CHECK (id_compra ~ '^\d{17}$'),
  CONSTRAINT participacao_compras_lidas_contagens CHECK (contratos >= 0 AND atas_encontradas >= 0)
);

-- ------------------------------------------------------------------------------
-- 2) atas_participacao
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atas_participacao (
  id                    BIGSERIAL PRIMARY KEY,
  numero_ata            VARCHAR(20)  NOT NULL,
  uasg_gerenciadora     VARCHAR(6)   NOT NULL,
  nome_gerenciadora     TEXT,
  uasg_senasp           VARCHAR(6)   NOT NULL,  -- 200330 ou 200331
  papel                 VARCHAR(12)  NOT NULL,
  id_compra             VARCHAR(17)  NOT NULL,
  numero_compra         VARCHAR(10),
  ano_compra            VARCHAR(4),
  modalidade            TEXT,
  objeto                TEXT,
  data_vigencia_inicial DATE,
  data_vigencia_final   DATE,
  status_ata            TEXT,
  numero_controle_pncp  TEXT,
  quantidade_itens_ata  INTEGER      NOT NULL DEFAULT 0,  -- itens da ata inteira (não só os da SENASP)
  descoberta_em         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  lido_em               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT atas_participacao_chave UNIQUE (numero_ata, uasg_gerenciadora, uasg_senasp),
  CONSTRAINT atas_participacao_papel CHECK (papel IN ('PARTICIPANTE', 'ADESAO')),
  CONSTRAINT atas_participacao_uasgs CHECK (uasg_gerenciadora ~ '^\d{6}$' AND uasg_senasp ~ '^\d{6}$'),
  CONSTRAINT atas_participacao_id_compra CHECK (id_compra ~ '^\d{17}$'),
  CONSTRAINT atas_participacao_itens CHECK (quantidade_itens_ata >= 0)
);

CREATE INDEX IF NOT EXISTS idx_atas_participacao_senasp ON public.atas_participacao (uasg_senasp, data_vigencia_final);
CREATE INDEX IF NOT EXISTS idx_atas_participacao_compra ON public.atas_participacao (id_compra);

-- ------------------------------------------------------------------------------
-- 3) itens_ata_participacao
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itens_ata_participacao (
  id                      BIGSERIAL PRIMARY KEY,
  participacao_id         BIGINT       NOT NULL REFERENCES public.atas_participacao(id) ON DELETE CASCADE,
  numero_item             VARCHAR(5)   NOT NULL,
  descricao               TEXT         NOT NULL,
  fornecedor_cnpj_cpf     VARCHAR(255),
  fornecedor_razao_social TEXT,
  quantidade_homologada   NUMERIC,
  valor_unitario          NUMERIC,
  maximo_adesao           NUMERIC,
  papel                   VARCHAR(12)  NOT NULL,
  quantidade_senasp       NUMERIC,      -- nula quando a fonte não informou
  unidade                 JSONB,        -- participante: registro da UASG na consulta 3 (com os saldos)
  adesoes                 JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- adesão: as adesões aprovadas da UASG
  lido_em                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT itens_ata_participacao_chave UNIQUE (participacao_id, numero_item),
  CONSTRAINT itens_ata_participacao_numero CHECK (numero_item ~ '^\d{5}$'),
  CONSTRAINT itens_ata_participacao_papel CHECK (papel IN ('PARTICIPANTE', 'ADESAO')),
  CONSTRAINT itens_ata_participacao_unidade CHECK (unidade IS NULL OR jsonb_typeof(unidade) = 'object'),
  CONSTRAINT itens_ata_participacao_adesoes CHECK (jsonb_typeof(adesoes) = 'array')
);

-- ------------------------------------------------------------------------------
-- Leitura para logados; escrita só pela função abaixo
-- ------------------------------------------------------------------------------
ALTER TABLE public.participacao_compras_lidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atas_participacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_ata_participacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: participacao_compras_lidas" ON public.participacao_compras_lidas;
CREATE POLICY "Authenticated Read: participacao_compras_lidas"
  ON public.participacao_compras_lidas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated Read: atas_participacao" ON public.atas_participacao;
CREATE POLICY "Authenticated Read: atas_participacao"
  ON public.atas_participacao FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated Read: itens_ata_participacao" ON public.itens_ata_participacao;
CREATE POLICY "Authenticated Read: itens_ata_participacao"
  ON public.itens_ata_participacao FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.participacao_compras_lidas FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.atas_participacao FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.itens_ata_participacao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.participacao_compras_lidas, public.atas_participacao, public.itens_ata_participacao TO authenticated;

-- ------------------------------------------------------------------------------
-- 4) Gravar uma compra lida, só com a trava em mãos
--
-- p_compra: { "id_compra", "uasg_compra", "contratos", "atas_encontradas", "leitura_completa", "tem_ata_vigente",
--             "atas": [ { "numero_ata", "uasg_gerenciadora", "nome_gerenciadora", "uasg_senasp", "papel", ...,
--                         "itens": [ { "numero_item", "descricao", ..., "papel", "quantidade_senasp", "unidade", "adesoes" } ] } ] }
-- Atas e itens recebidos substituem os gravados (mesma chave); os que não vieram ficam como estão.
-- Devolve quantas atas foram gravadas.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_atas_participacao(
  p_uasg VARCHAR(6),
  p_compra JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id_compra TEXT;
  v_ata       JSONB;
  v_item      JSONB;
  v_ata_id    BIGINT;
  v_papel     TEXT;
  v_total     INTEGER := 0;
BEGIN
  IF NOT public.eh_service_role() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o servidor grava as atas em que a SENASP participa.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sincronizacao_fontes
     WHERE recurso = 'atas_participacao'
       AND uasg = p_uasg
       AND em_andamento_por IS NOT DISTINCT FROM auth.uid()
       AND em_andamento_desde >= NOW() - INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'SYNC_NOT_RESERVED: Sincronização das atas de participação da UASG % não reservada.', p_uasg
      USING ERRCODE = '55000';
  END IF;

  IF p_compra IS NULL OR jsonb_typeof(p_compra) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_compra deve ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;
  v_id_compra := btrim(COALESCE(p_compra->>'id_compra', ''));
  IF v_id_compra !~ '^\d{17}$' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: id_compra inválido (%).', v_id_compra USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_compra->'atas', '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_compra->'atas', '[]'::jsonb)) > 50 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: atas deve ser um array com no máximo 50 atas.' USING ERRCODE = '22023';
  END IF;

  FOR v_ata IN SELECT valor FROM jsonb_array_elements(COALESCE(p_compra->'atas', '[]'::jsonb)) AS e(valor) LOOP
    IF jsonb_typeof(v_ata) <> 'object' THEN CONTINUE; END IF;
    v_papel := v_ata->>'papel';
    IF v_papel NOT IN ('PARTICIPANTE', 'ADESAO') THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: papel inválido na ata % (%).', v_ata->>'numero_ata', v_papel USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(COALESCE(v_ata->'itens', '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(v_ata->'itens', '[]'::jsonb)) > 500 THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: itens da ata % deve ser um array com no máximo 500 itens.', v_ata->>'numero_ata' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.atas_participacao AS a (
      numero_ata, uasg_gerenciadora, nome_gerenciadora, uasg_senasp, papel, id_compra, numero_compra, ano_compra,
      modalidade, objeto, data_vigencia_inicial, data_vigencia_final, status_ata, numero_controle_pncp,
      quantidade_itens_ata, lido_em
    ) VALUES (
      btrim(v_ata->>'numero_ata'), btrim(v_ata->>'uasg_gerenciadora'), NULLIF(v_ata->>'nome_gerenciadora', ''),
      btrim(v_ata->>'uasg_senasp'), v_papel, v_id_compra, NULLIF(v_ata->>'numero_compra', ''), NULLIF(v_ata->>'ano_compra', ''),
      NULLIF(v_ata->>'modalidade', ''), NULLIF(v_ata->>'objeto', ''),
      NULLIF(v_ata->>'data_vigencia_inicial', '')::date, NULLIF(v_ata->>'data_vigencia_final', '')::date,
      NULLIF(v_ata->>'status_ata', ''), NULLIF(v_ata->>'numero_controle_pncp', ''),
      COALESCE(NULLIF(v_ata->>'quantidade_itens_ata', '')::integer, 0), NOW()
    )
    ON CONFLICT (numero_ata, uasg_gerenciadora, uasg_senasp) DO UPDATE
      SET nome_gerenciadora = EXCLUDED.nome_gerenciadora,
          papel = EXCLUDED.papel,
          id_compra = EXCLUDED.id_compra,
          numero_compra = EXCLUDED.numero_compra,
          ano_compra = EXCLUDED.ano_compra,
          modalidade = EXCLUDED.modalidade,
          objeto = EXCLUDED.objeto,
          data_vigencia_inicial = EXCLUDED.data_vigencia_inicial,
          data_vigencia_final = EXCLUDED.data_vigencia_final,
          status_ata = EXCLUDED.status_ata,
          numero_controle_pncp = EXCLUDED.numero_controle_pncp,
          quantidade_itens_ata = EXCLUDED.quantidade_itens_ata,
          lido_em = EXCLUDED.lido_em
    RETURNING a.id INTO v_ata_id;

    FOR v_item IN SELECT valor FROM jsonb_array_elements(COALESCE(v_ata->'itens', '[]'::jsonb)) AS e(valor) LOOP
      IF jsonb_typeof(v_item) <> 'object' THEN CONTINUE; END IF;
      INSERT INTO public.itens_ata_participacao AS i (
        participacao_id, numero_item, descricao, fornecedor_cnpj_cpf, fornecedor_razao_social, quantidade_homologada,
        valor_unitario, maximo_adesao, papel, quantidade_senasp, unidade, adesoes, lido_em
      ) VALUES (
        v_ata_id,
        lpad(btrim(v_item->>'numero_item'), 5, '0'),
        COALESCE(NULLIF(btrim(v_item->>'descricao'), ''), 'Descrição não informada pela fonte oficial'),
        NULLIF(left(btrim(COALESCE(v_item->>'fornecedor_cnpj_cpf', '')), 255), ''),
        NULLIF(v_item->>'fornecedor_razao_social', ''),
        NULLIF(v_item->>'quantidade_homologada', '')::numeric,
        NULLIF(v_item->>'valor_unitario', '')::numeric,
        NULLIF(v_item->>'maximo_adesao', '')::numeric,
        v_item->>'papel',
        NULLIF(v_item->>'quantidade_senasp', '')::numeric,
        CASE WHEN jsonb_typeof(v_item->'unidade') = 'object' THEN v_item->'unidade' END,
        CASE WHEN jsonb_typeof(v_item->'adesoes') = 'array' THEN v_item->'adesoes' ELSE '[]'::jsonb END,
        NOW()
      )
      ON CONFLICT (participacao_id, numero_item) DO UPDATE
        SET descricao = EXCLUDED.descricao,
            fornecedor_cnpj_cpf = EXCLUDED.fornecedor_cnpj_cpf,
            fornecedor_razao_social = EXCLUDED.fornecedor_razao_social,
            quantidade_homologada = EXCLUDED.quantidade_homologada,
            valor_unitario = EXCLUDED.valor_unitario,
            maximo_adesao = EXCLUDED.maximo_adesao,
            papel = EXCLUDED.papel,
            quantidade_senasp = EXCLUDED.quantidade_senasp,
            unidade = EXCLUDED.unidade,
            adesoes = EXCLUDED.adesoes,
            lido_em = EXCLUDED.lido_em;
    END LOOP;

    v_total := v_total + 1;
  END LOOP;

  INSERT INTO public.participacao_compras_lidas AS l
    (uasg_carteira, id_compra, uasg_compra, contratos, atas_encontradas, leitura_completa, tem_ata_vigente, lido_em)
  VALUES (
    p_uasg, v_id_compra, left(v_id_compra, 6),
    GREATEST(COALESCE(NULLIF(p_compra->>'contratos', '')::integer, 0), 0),
    GREATEST(COALESCE(NULLIF(p_compra->>'atas_encontradas', '')::integer, 0), 0),
    COALESCE((p_compra->>'leitura_completa')::boolean, FALSE),
    COALESCE((p_compra->>'tem_ata_vigente')::boolean, FALSE),
    NOW()
  )
  ON CONFLICT (uasg_carteira, id_compra) DO UPDATE
    SET contratos = EXCLUDED.contratos,
        atas_encontradas = EXCLUDED.atas_encontradas,
        leitura_completa = EXCLUDED.leitura_completa,
        tem_ata_vigente = EXCLUDED.tem_ata_vigente,
        lido_em = EXCLUDED.lido_em;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_atas_participacao(VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gravar_atas_participacao(VARCHAR, JSONB) TO service_role;

-- ------------------------------------------------------------------------------
-- 5) Agendamento (mesmo padrão da migration 77; o mesmo nome atualiza o job existente)
-- ------------------------------------------------------------------------------
SELECT cron.schedule('sincronizar-atas-participacao-200330', '10 * * * *', $$SELECT public.disparar_sincronizacao('atas_participacao', '200330')$$);
SELECT cron.schedule('sincronizar-atas-participacao-200331', '12 * * * *', $$SELECT public.disparar_sincronizacao('atas_participacao', '200331')$$);
