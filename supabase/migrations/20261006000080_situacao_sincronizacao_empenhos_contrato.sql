-- ==============================================================================
-- MIGRATION 80: SITUAÇÃO DA SINCRONIZAÇÃO DE EMPENHOS POR CONTRATO
-- Versão: 20261006000080_situacao_sincronizacao_empenhos_contrato.sql
--
-- Contexto (auditoria de 06/10/2026, AUDITORIA_VINCULO_EMPENHOS_CONTRATOS.md, item 4.1):
-- a tela do contrato mostrava "Nenhum empenho" tanto para o contrato que não tem empenho quanto para
-- o contrato cuja consulta falhou ou nunca foi feita. Não havia registro de quando a sincronização
-- dos empenhos de cada contrato rodou nem do resultado.
--
-- O que entra
-- 1) contrato_empenhos_sincronizacao: uma linha por contrato (mesma contract_key de
--    contrato_empenhos), com a situação da última tentativa e a data do último sucesso.
--      OK            a fonte respondeu e os empenhos foram gravados e vinculados
--      SEM_EMPENHOS  a fonte respondeu que o contrato não tem empenho
--      PARCIAL       a fonte respondeu, mas algum empenho ou vínculo não foi gravado
--      ERRO          a fonte não respondeu, ou o contrato não tem o id do Contratos.gov.br
--    ultimo_sucesso_em só avança com OK ou SEM_EMPENHOS: uma falha não apaga a data do último acerto.
-- 2) registrar_sincronizacao_empenhos_contrato: única forma de escrita. Mesmo perfil das RPCs que
--    gravam empenhos (gestor ou coordenador) ou o servidor (service_role, ver migration 76).
--
-- Nada é alterado nas tabelas e RPCs de empenhos existentes.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.contrato_empenhos_sincronizacao (
  contract_key       VARCHAR(150) PRIMARY KEY,   -- mesma chave de contrato_empenhos.contract_key
  situacao           VARCHAR(20)  NOT NULL,
  mensagem           TEXT,
  empenhos_lidos     INTEGER      NOT NULL DEFAULT 0,
  empenhos_gravados  INTEGER      NOT NULL DEFAULT 0,
  vinculos_gravados  INTEGER      NOT NULL DEFAULT 0,
  tentativa_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- ON DELETE SET NULL: excluir o usuário não é bloqueado (mesma regra da migration 67).
  tentativa_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ultimo_sucesso_em  TIMESTAMPTZ,
  CONSTRAINT contrato_empenhos_sincronizacao_situacao
    CHECK (situacao IN ('OK', 'SEM_EMPENHOS', 'PARCIAL', 'ERRO')),
  CONSTRAINT contrato_empenhos_sincronizacao_contagens
    CHECK (empenhos_lidos >= 0 AND empenhos_gravados >= 0 AND vinculos_gravados >= 0)
);

-- Índice da chave estrangeira (recomendação do advisor, como na migration 74).
CREATE INDEX IF NOT EXISTS contrato_empenhos_sincronizacao_tentativa_por_idx
  ON public.contrato_empenhos_sincronizacao (tentativa_por);

COMMENT ON TABLE public.contrato_empenhos_sincronizacao IS
  'Situação da última sincronização dos empenhos de cada contrato. Escrita só por registrar_sincronizacao_empenhos_contrato.';

ALTER TABLE public.contrato_empenhos_sincronizacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: contrato_empenhos_sincronizacao" ON public.contrato_empenhos_sincronizacao;
CREATE POLICY "Authenticated Read: contrato_empenhos_sincronizacao"
  ON public.contrato_empenhos_sincronizacao FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contrato_empenhos_sincronizacao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contrato_empenhos_sincronizacao TO authenticated;

-- ------------------------------------------------------------------------------
-- Registrar o resultado de uma sincronização
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_sincronizacao_empenhos_contrato(
  p_contract_key VARCHAR(150),
  p_situacao VARCHAR(20),
  p_mensagem TEXT DEFAULT NULL,
  p_empenhos_lidos INTEGER DEFAULT 0,
  p_empenhos_gravados INTEGER DEFAULT 0,
  p_vinculos_gravados INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key VARCHAR(150) := btrim(COALESCE(p_contract_key, ''));
  v_situacao VARCHAR(20) := upper(btrim(COALESCE(p_situacao, '')));
  v_sucesso BOOLEAN;
  v_linha public.contrato_empenhos_sincronizacao;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador registra a sincronização de empenhos.'
      USING ERRCODE = '42501';
  END IF;
  IF v_key = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Chave do contrato não informada.' USING ERRCODE = '22023';
  END IF;
  IF v_situacao NOT IN ('OK', 'SEM_EMPENHOS', 'PARCIAL', 'ERRO') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Situação inválida (%).', v_situacao USING ERRCODE = '22023';
  END IF;

  v_sucesso := v_situacao IN ('OK', 'SEM_EMPENHOS');

  INSERT INTO public.contrato_empenhos_sincronizacao AS s (
    contract_key, situacao, mensagem, empenhos_lidos, empenhos_gravados, vinculos_gravados,
    tentativa_em, tentativa_por, ultimo_sucesso_em
  ) VALUES (
    v_key,
    v_situacao,
    NULLIF(left(btrim(COALESCE(p_mensagem, '')), 1000), ''),
    GREATEST(COALESCE(p_empenhos_lidos, 0), 0),
    GREATEST(COALESCE(p_empenhos_gravados, 0), 0),
    GREATEST(COALESCE(p_vinculos_gravados, 0), 0),
    NOW(),
    auth.uid(),
    CASE WHEN v_sucesso THEN NOW() END
  )
  ON CONFLICT (contract_key) DO UPDATE
    SET situacao = EXCLUDED.situacao,
        mensagem = EXCLUDED.mensagem,
        empenhos_lidos = EXCLUDED.empenhos_lidos,
        empenhos_gravados = EXCLUDED.empenhos_gravados,
        vinculos_gravados = EXCLUDED.vinculos_gravados,
        tentativa_em = EXCLUDED.tentativa_em,
        tentativa_por = EXCLUDED.tentativa_por,
        ultimo_sucesso_em = CASE WHEN v_sucesso THEN NOW() ELSE s.ultimo_sucesso_em END
  RETURNING * INTO v_linha;

  RETURN to_jsonb(v_linha);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_sincronizacao_empenhos_contrato(VARCHAR, VARCHAR, TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_sincronizacao_empenhos_contrato(VARCHAR, VARCHAR, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated, service_role;
