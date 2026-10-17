-- ==============================================================================
-- MIGRATION 150: LEITURA LEVE DOS CONTRATOS PARA AS TELAS
-- Versão: 20261016000150_contratos_registro_tela.sql
--
-- Contexto (medido em 16/10/2026, PR #251): dos ~4,2 MB de `registro` da UASG 200331,
-- 3,0 MB são a chave `raw` (a resposta original do Contratos.gov.br, guardada inteira).
-- As telas usam só umas poucas partes do `raw`; o resto (links, contratante, fornecedor,
-- objeto repetido...) atravessa a rede a cada abertura do Início e da Carteira.
--
-- 1) contrato_raw_resumido(raw): só as partes do `raw` que as telas leem, com a marca
--    `_resumido`:
--      - categoria / nomeCategoria .......... complexidade e carga do gestor (Central de
--                                             Distribuição) e categoria no Contrato 360;
--      - prorrogavel, valor_acumulado ....... dicas do Contrato 360 (ContractHealthStrip);
--      - data_publicacao .................... busca do contrato no PNCP;
--      - termos_aditivos / aditivos ......... radar de reajuste e histórico do contrato;
--      - UASG de origem (3 caminhos) ........ consulta avulsa ao Contratos.gov.br.
--    Uma parte nova do `raw` usada numa tela precisa entrar aqui (e a coluna ser
--    recalculada: ver o fim deste arquivo).
--
-- 2) contratos_oficiais.registro_tela: coluna gerada e gravada (STORED) com o registro
--    sem o `raw` inteiro e com o `raw` resumido no lugar. As telas leem esta coluna; o
--    servidor (sincronização) continua lendo o `registro` completo. Gravada, e não view,
--    para a leitura não tocar no `raw` (a view teria que abrir os 4 MB a cada leitura).
--
-- 3) preservar_raw_contrato_oficial (gatilho BEFORE UPDATE): nenhuma regravação apaga o
--    `raw`. Três fluxos pegam o contrato que a tela leu e gravam o registro inteiro de
--    volta (persistirContratoCompletado, completarIdContratosGov e a sincronização), e
--    atualizar_contrato_oficial / gravar_contratos_oficiais SUBSTITUEM o registro:
--      - registro novo sem `raw` (ou `raw` nulo) ........ fica o `raw` gravado;
--      - `raw` novo com a marca `_resumido` (veio da tela) ... fica o `raw` gravado, e só
--        as partes que mudaram em relação ao resumo (ex.: o que a consulta avulsa ao
--        Contratos.gov.br trouxe) entram por cima;
--      - `raw` novo sem a marca (veio das fontes) ........ substitui, como antes.
--    A marca `_resumido` nunca fica gravada no `registro`.
--    No gatilho e não nas funções: vale para as duas RPCs e para qualquer gravação
--    futura, sem recriar funções já alteradas por outras migrations (126).
--
-- Ordem de publicação: aplicar esta migration ANTES de publicar o site que lê
-- `registro_tela` (sem a coluna, a leitura das telas dá erro).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Resumo do raw
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contrato_raw_resumido(p_raw JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN jsonb_typeof(p_raw) = 'object' THEN
    COALESCE(
      (SELECT jsonb_object_agg(chave, p_raw->chave)
         FROM unnest(ARRAY[
                'categoria', 'nomeCategoria',
                'prorrogavel', 'valor_acumulado',
                'data_publicacao',
                'termos_aditivos', 'aditivos',
                'codigoUnidadeGestoraOrigemContrato', 'unidade_origem_codigo'
              ]) AS chave
        WHERE p_raw ? chave),
      '{}'::jsonb
    )
    || CASE WHEN p_raw #> '{contratante,orgao_origem,unidade_gestora_origem,codigo}' IS NOT NULL
         THEN jsonb_build_object('contratante', jsonb_build_object('orgao_origem', jsonb_build_object(
                'unidade_gestora_origem', jsonb_build_object(
                  'codigo', p_raw #> '{contratante,orgao_origem,unidade_gestora_origem,codigo}'))))
         ELSE '{}'::jsonb
       END
    || '{"_resumido": true}'::jsonb
  END
$$;

-- Registro da tela: o registro com o raw resumido no lugar do raw inteiro.
CREATE OR REPLACE FUNCTION public.contrato_registro_tela(p_registro JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN jsonb_typeof(p_registro->'raw') = 'object'
    THEN (p_registro - 'raw') || jsonb_build_object('raw', public.contrato_raw_resumido(p_registro->'raw'))
    ELSE p_registro - 'raw'
  END
$$;

-- Funções puras, sem dado: liberadas para quem grava (RPCs e servidor) e para o logado.
REVOKE ALL ON FUNCTION public.contrato_raw_resumido(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contrato_registro_tela(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contrato_raw_resumido(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contrato_registro_tela(JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3) Gatilho: regravação não apaga o raw (criado antes da coluna; vale para tudo daqui em diante)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preservar_raw_contrato_oficial()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw_antigo JSONB := OLD.registro->'raw';
  v_raw_novo JSONB := NEW.registro->'raw';
  v_resumo_antigo JSONB;
  v_mudou JSONB;
BEGIN
  IF jsonb_typeof(v_raw_antigo) = 'object' THEN
    IF jsonb_typeof(v_raw_novo) IS DISTINCT FROM 'object' THEN
      -- Sem raw (ou nulo): fica o gravado.
      NEW.registro := NEW.registro || jsonb_build_object('raw', v_raw_antigo);
    ELSIF v_raw_novo ? '_resumido' THEN
      -- Raw da tela: fica o gravado, e só o que difere do resumo dele entra por cima.
      v_resumo_antigo := public.contrato_raw_resumido(v_raw_antigo);
      SELECT jsonb_object_agg(e.chave, e.valor)
        INTO v_mudou
        FROM jsonb_each(v_raw_novo) AS e(chave, valor)
       WHERE e.chave <> '_resumido'
         AND v_resumo_antigo->e.chave IS DISTINCT FROM e.valor;
      NEW.registro := NEW.registro || jsonb_build_object('raw', v_raw_antigo || COALESCE(v_mudou, '{}'::jsonb));
    END IF;
  END IF;

  -- A marca é só da leitura da tela: nunca fica gravada.
  IF jsonb_typeof(NEW.registro->'raw') = 'object' AND NEW.registro->'raw' ? '_resumido' THEN
    NEW.registro := jsonb_set(NEW.registro, '{raw}', (NEW.registro->'raw') - '_resumido');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.preservar_raw_contrato_oficial() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_preservar_raw_contrato_oficial ON public.contratos_oficiais;
CREATE TRIGGER trg_preservar_raw_contrato_oficial
  BEFORE UPDATE OF registro ON public.contratos_oficiais
  FOR EACH ROW
  EXECUTE FUNCTION public.preservar_raw_contrato_oficial();

-- ------------------------------------------------------------------------------
-- 2) Coluna da tela (gerada e gravada; a tabela é regravada uma vez, ~1.100 linhas)
-- ------------------------------------------------------------------------------
ALTER TABLE public.contratos_oficiais
  ADD COLUMN IF NOT EXISTS registro_tela JSONB
  GENERATED ALWAYS AS (public.contrato_registro_tela(registro)) STORED;

COMMENT ON COLUMN public.contratos_oficiais.registro_tela IS
  'Registro para as telas: sem o raw inteiro, com contrato_raw_resumido(raw) no lugar (migration 150). '
  'Gerada a partir de registro; quem grava continua gravando só registro.';

-- Para mudar o resumo depois: CREATE OR REPLACE da contrato_raw_resumido e, na mesma
-- migration, `UPDATE public.contratos_oficiais SET registro = registro;` para recalcular
-- a coluna (o gatilho mantém o raw).
