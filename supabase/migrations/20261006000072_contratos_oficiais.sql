-- ==============================================================================
-- MIGRATION 72: CONTRATOS OFICIAIS PERSISTIDOS E CONTROLE DE SINCRONIZAÇÃO
-- Versão: 20261006000072_contratos_oficiais.sql
--
-- Contexto: a lista de contratos era montada no navegador a cada carga, juntando
-- o Contratos.gov.br (~3 MB, 18 a 37 s) e o Compras.gov.br, para cada UASG e para
-- cada usuário. Ver PLANO_PERSISTENCIA_CONTRATOS_E_CACHE.md.
--
-- 1) contratos_oficiais: a lista de contratos de cada carteira (UASG consultada),
--    um contrato por linha, com o registro completo que as telas já usam
--    (ContractDashboardRecord, inclusive `raw`). As telas passam a ler daqui.
--    - Chave (uasg, contract_key): reproduz exatamente as listas por UASG de hoje.
--    - statusVigencia NÃO é gravado: depende da data de hoje e é recalculado na leitura.
--    - A sincronização nunca apaga: contrato que some de uma resposta continua aqui
--      (mesma regra de "a carteira não encolhe por falha momentânea").
--    - Sem gatilho de auditoria de propósito: cada sincronização regrava centenas de
--      linhas vindas das APIs oficiais, o que encheria audit_logs sem informação útil.
--
-- 2) sincronizacao_fontes: por recurso e UASG, a última tentativa, o último sucesso,
--    as fontes que falharam e uma trava. Substitui os metadados que ficavam no
--    localStorage de cada navegador. Com a trava, só um navegador sincroniza por vez.
--
-- 3) Escrita só pelas RPCs abaixo, com checagem de perfil (has_role('gestor') vale
--    também para admin). Nenhuma política de escrita direta nas tabelas.
--    - reservar_sincronizacao: pega a trava se os dados passaram da validade.
--      Forçar (botão "Atualizar") só para admin, o coordenador.
--    - gravar_contratos_oficiais: upsert em lote, só para quem está com a trava.
--    - concluir_sincronizacao: libera a trava e registra o resultado.
--    - atualizar_contrato_oficial: grava o contrato completado pelo Contrato 360
--      (consulta avulsa ao Contratos.gov.br), só em linha que já existe.
--
-- Provisório: enquanto a sincronização roda no navegador, gestor e admin gravam.
-- Quando ela for para a Edge Function agendada (item 2 do plano), estas RPCs
-- passam a aceitar só a service_role.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Auxiliar: texto -> data, sem erro para formato inválido
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.texto_para_data(p_texto TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_texto IS NULL OR p_texto !~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN NULL;
  END IF;
  RETURN left(p_texto, 10)::DATE;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.texto_para_data(TEXT) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 1) contratos_oficiais
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contratos_oficiais (
  uasg                 VARCHAR(6)   NOT NULL,   -- carteira consultada (200330 / 200331)
  contract_key         VARCHAR(100) NOT NULL,   -- ContractDashboardRecord.id
  numero               TEXT         NOT NULL DEFAULT '',
  ano                  TEXT         NOT NULL DEFAULT '',
  data_vigencia_fim    DATE,
  fornecedor_cnpj_cpf  TEXT,
  id_compra            TEXT,
  numero_controle_pncp TEXT,
  contrato_id_gov      TEXT,                    -- id no Contratos.gov.br, quando houver
  fonte_dados          TEXT,
  registro             JSONB        NOT NULL,
  sincronizado_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  criado_em            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (uasg, contract_key),
  CONSTRAINT contratos_oficiais_uasg_formato CHECK (uasg ~ '^\d{6}$'),
  CONSTRAINT contratos_oficiais_registro_objeto CHECK (jsonb_typeof(registro) = 'object')
);

CREATE INDEX IF NOT EXISTS contratos_oficiais_contract_key_idx ON public.contratos_oficiais (contract_key);
CREATE INDEX IF NOT EXISTS contratos_oficiais_id_compra_idx ON public.contratos_oficiais (id_compra);

ALTER TABLE public.contratos_oficiais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: contratos_oficiais" ON public.contratos_oficiais;
CREATE POLICY "Authenticated Read: contratos_oficiais"
  ON public.contratos_oficiais FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contratos_oficiais FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2) sincronizacao_fontes
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sincronizacao_fontes (
  recurso              VARCHAR(40)  NOT NULL,   -- 'contratos' (depois 'atas', 'vigencias_pncp'...)
  uasg                 VARCHAR(6)   NOT NULL,
  em_andamento_desde   TIMESTAMPTZ,             -- trava; vale por 10 minutos
  -- ON DELETE SET NULL: excluir o usuário não é bloqueado (mesma regra da migration 67).
  em_andamento_por     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ultima_tentativa_em  TIMESTAMPTZ,
  ultimo_sucesso_em    TIMESTAMPTZ,             -- só avança quando TODAS as fontes responderam
  ultimo_status        VARCHAR(10),
  fontes_com_falha     TEXT[]       NOT NULL DEFAULT '{}',
  total_registros      INTEGER,
  mensagem             TEXT,
  PRIMARY KEY (recurso, uasg),
  CONSTRAINT sincronizacao_fontes_recurso_formato CHECK (recurso ~ '^[a-z_]+$'),
  CONSTRAINT sincronizacao_fontes_uasg_formato CHECK (uasg ~ '^\d{6}$'),
  CONSTRAINT sincronizacao_fontes_status CHECK (ultimo_status IS NULL OR ultimo_status IN ('SUCESSO', 'PARCIAL', 'ERRO'))
);

ALTER TABLE public.sincronizacao_fontes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: sincronizacao_fontes" ON public.sincronizacao_fontes;
CREATE POLICY "Authenticated Read: sincronizacao_fontes"
  ON public.sincronizacao_fontes FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sincronizacao_fontes FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3a) Reservar a sincronização (trava)
--
-- Devolve true só para quem ganhou a reserva. Sem forçar, reserva apenas se:
--   - ninguém está sincronizando (ou a trava passou de 10 minutos);
--   - o último sucesso é mais antigo que a validade (mínimo de 1 hora);
--   - a última tentativa tem mais de 30 minutos (evita que todos tentem de novo
--     sem parar enquanto uma fonte está fora do ar).
-- Forçar ignora validade e intervalo entre tentativas, mas respeita a trava.
-- O INSERT ... ON CONFLICT DO UPDATE ... WHERE é atômico: em duas chamadas
-- simultâneas, a segunda reavalia a condição sobre a linha já travada e recebe false.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reservar_sincronizacao(
  p_recurso VARCHAR(40),
  p_uasg VARCHAR(6),
  p_validade INTERVAL DEFAULT INTERVAL '6 hours',
  p_forcar BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_validade INTERVAL := GREATEST(COALESCE(p_validade, INTERVAL '6 hours'), INTERVAL '1 hour');
  v_reservou BOOLEAN;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador sincroniza com as fontes oficiais.'
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_forcar, FALSE) AND NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador força a atualização.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sincronizacao_fontes AS s
    (recurso, uasg, em_andamento_desde, em_andamento_por, ultima_tentativa_em)
  VALUES
    (p_recurso, p_uasg, NOW(), auth.uid(), NOW())
  ON CONFLICT (recurso, uasg) DO UPDATE
    SET em_andamento_desde = NOW(),
        em_andamento_por = auth.uid(),
        ultima_tentativa_em = NOW()
    WHERE (s.em_andamento_desde IS NULL OR s.em_andamento_desde < NOW() - INTERVAL '10 minutes')
      AND (
        COALESCE(p_forcar, FALSE)
        OR (
          (s.ultimo_sucesso_em IS NULL OR s.ultimo_sucesso_em < NOW() - v_validade)
          AND (s.ultima_tentativa_em IS NULL OR s.ultima_tentativa_em < NOW() - INTERVAL '30 minutes')
        )
      )
  RETURNING TRUE INTO v_reservou;

  RETURN COALESCE(v_reservou, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_sincronizacao(VARCHAR, VARCHAR, INTERVAL, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_sincronizacao(VARCHAR, VARCHAR, INTERVAL, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3b) Gravar contratos em lote (upsert), só com a trava em mãos
--
-- p_registros: array JSON de ContractDashboardRecord (no máximo 500 por chamada).
-- Registro sem `id` é ignorado; `id` repetido no mesmo lote fica com o último.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gravar_contratos_oficiais(
  p_uasg VARCHAR(6),
  p_registros JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador sincroniza com as fontes oficiais.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sincronizacao_fontes
     WHERE recurso = 'contratos'
       AND uasg = p_uasg
       AND em_andamento_por = auth.uid()
       AND em_andamento_desde >= NOW() - INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'SYNC_NOT_RESERVED: Sincronização de contratos da UASG % não reservada por este usuário.', p_uasg
      USING ERRCODE = '55000';
  END IF;

  IF p_registros IS NULL OR jsonb_typeof(p_registros) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_registros deve ser um array JSON.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_registros) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: no máximo 500 contratos por chamada.'
      USING ERRCODE = '22023';
  END IF;

  WITH entrada AS (
    SELECT DISTINCT ON (r.valor->>'id')
           r.valor AS reg
      FROM jsonb_array_elements(p_registros) WITH ORDINALITY AS r(valor, ordem)
     WHERE jsonb_typeof(r.valor) = 'object'
       AND COALESCE(btrim(r.valor->>'id'), '') <> ''
     ORDER BY r.valor->>'id', r.ordem DESC
  )
  INSERT INTO public.contratos_oficiais AS c (
    uasg, contract_key, numero, ano, data_vigencia_fim, fornecedor_cnpj_cpf,
    id_compra, numero_controle_pncp, contrato_id_gov, fonte_dados, registro, sincronizado_em
  )
  SELECT p_uasg,
         left(btrim(reg->>'id'), 100),
         COALESCE(reg->>'numero', ''),
         COALESCE(reg->>'ano', ''),
         public.texto_para_data(reg->>'dataVigenciaFim'),
         NULLIF(reg->>'fornecedorCnpjCpf', ''),
         NULLIF(reg->>'idCompra', ''),
         NULLIF(reg->>'numeroControlePncp', ''),
         NULLIF(reg->>'contratoId', ''),
         NULLIF(reg->>'fonteDados', ''),
         reg - 'statusVigencia',
         NOW()
    FROM entrada
  ON CONFLICT (uasg, contract_key) DO UPDATE
    SET numero = EXCLUDED.numero,
        ano = EXCLUDED.ano,
        data_vigencia_fim = EXCLUDED.data_vigencia_fim,
        fornecedor_cnpj_cpf = EXCLUDED.fornecedor_cnpj_cpf,
        id_compra = EXCLUDED.id_compra,
        numero_controle_pncp = EXCLUDED.numero_controle_pncp,
        contrato_id_gov = EXCLUDED.contrato_id_gov,
        fonte_dados = EXCLUDED.fonte_dados,
        registro = EXCLUDED.registro,
        sincronizado_em = EXCLUDED.sincronizado_em;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.gravar_contratos_oficiais(VARCHAR, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gravar_contratos_oficiais(VARCHAR, JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3c) Concluir a sincronização: libera a trava e registra o resultado
--
-- Devolve false se a trava não é mais deste usuário (expirou e outro assumiu);
-- nesse caso nada é alterado.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.concluir_sincronizacao(
  p_recurso VARCHAR(40),
  p_uasg VARCHAR(6),
  p_status VARCHAR(10),
  p_fontes_com_falha TEXT[] DEFAULT '{}',
  p_total INTEGER DEFAULT NULL,
  p_mensagem TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_linhas INTEGER;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador sincroniza com as fontes oficiais.'
      USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('SUCESSO', 'PARCIAL', 'ERRO') THEN
    RAISE EXCEPTION 'INVALID_STATUS: use SUCESSO, PARCIAL ou ERRO.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.sincronizacao_fontes
     SET em_andamento_desde = NULL,
         em_andamento_por = NULL,
         ultimo_status = p_status,
         ultimo_sucesso_em = CASE WHEN p_status = 'SUCESSO' THEN NOW() ELSE ultimo_sucesso_em END,
         fontes_com_falha = COALESCE(p_fontes_com_falha, '{}'),
         total_registros = p_total,
         mensagem = left(p_mensagem, 500)
   WHERE recurso = p_recurso
     AND uasg = p_uasg
     AND em_andamento_por = auth.uid();

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.concluir_sincronizacao(VARCHAR, VARCHAR, VARCHAR, TEXT[], INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concluir_sincronizacao(VARCHAR, VARCHAR, VARCHAR, TEXT[], INTEGER, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3d) Atualizar um contrato completado pelo Contrato 360
--
-- Quando a tela completa o contrato com a consulta avulsa ao Contratos.gov.br,
-- grava o resultado para o próximo usuário não repetir a consulta. Só atualiza
-- linhas que já existem (em todas as carteiras em que o contrato aparece) e não
-- muda a identidade: `id` e `uasg` do registro são mantidos.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_contrato_oficial(
  p_contract_key VARCHAR(100),
  p_registro JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  IF NOT public.has_role('gestor') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador atualiza contratos oficiais.'
      USING ERRCODE = '42501';
  END IF;
  IF p_registro IS NULL OR jsonb_typeof(p_registro) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_registro deve ser um objeto JSON.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.contratos_oficiais c
     SET registro = (p_registro - 'statusVigencia' - 'id' - 'uasg')
                    || jsonb_strip_nulls(jsonb_build_object('id', c.registro->'id', 'uasg', c.registro->'uasg')),
         data_vigencia_fim = COALESCE(public.texto_para_data(p_registro->>'dataVigenciaFim'), c.data_vigencia_fim),
         fornecedor_cnpj_cpf = COALESCE(NULLIF(p_registro->>'fornecedorCnpjCpf', ''), c.fornecedor_cnpj_cpf),
         id_compra = COALESCE(NULLIF(p_registro->>'idCompra', ''), c.id_compra),
         numero_controle_pncp = COALESCE(NULLIF(p_registro->>'numeroControlePncp', ''), c.numero_controle_pncp),
         contrato_id_gov = COALESCE(NULLIF(p_registro->>'contratoId', ''), c.contrato_id_gov),
         fonte_dados = COALESCE(NULLIF(p_registro->>'fonteDados', ''), c.fonte_dados),
         sincronizado_em = NOW()
   WHERE c.contract_key = p_contract_key;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_contrato_oficial(VARCHAR, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_contrato_oficial(VARCHAR, JSONB) TO authenticated;
