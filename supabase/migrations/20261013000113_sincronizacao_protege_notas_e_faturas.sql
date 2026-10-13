-- ==============================================================================
-- MIGRATION 113: A SINCRONIZAÇÃO NÃO APAGA NOTA NEM FATURA COM TRABALHO HUMANO
-- Versão: 20261013000113_sincronizacao_protege_notas_e_faturas.sql
--
-- Problema (auditoria de 13/10/2026): a sincronização com o Contratos.gov.br apaga o que a fonte deixa de
-- listar, e a cascata leva junto o trabalho da equipe.
--   - Nota de empenho que sai da lista do contrato: sync_contract_empenhos_atomic apaga o vínculo NE × contrato
--     (origem FONTE) e a cascata leva a distribuição da nota entre os itens feita pelo gestor e a quantidade
--     que ele informou por item (migrations 94 e 104). Depois a tela do item apaga a unidade interna escolhida
--     para a nota, porque ela ficou sem quantidade. Já aconteceu em 09/10/2026 (contrato 00145/2025).
--   - Fatura que sai da lista: sync_contrato_faturas_atomic apaga a fatura e a cascata leva a ligação com o
--     ciclo de pagamento (migrations 87 e 88).
--
-- O que muda
--   1) Nota sem trabalho da equipe continua saindo, como antes. Nota com trabalho (distribuição do gestor,
--      quantidade informada ou unidade interna escolhida) fica no contrato e entra em
--      contrato_empenho_ausente_da_fonte. Enquanto isso continua contando no empenhado do contrato (o lado
--      conservador: não esconde gasto) e o aviso mostra que está a conferir.
--   2) Fatura que não está em ciclo de pagamento continua saindo. Fatura ligada a um ciclo fica e entra em
--      fatura_ausente_da_fonte.
--   3) A marca sai sozinha quando a fonte volta a listar a nota ou a fatura.
--   4) Só o coordenador decide, com justificativa (10 a 500 caracteres), por decidir_ausente_da_fonte:
--        nota   MANTER   o vínculo passa a MANUAL, com o motivo; a sincronização não o tira mais;
--               RETIRAR  registra o cancelamento no histórico da nota, como a sincronização fazia, e apaga
--                        o vínculo (a distribuição sai junto; a tela do item desfaz a unidade da nota);
--        fatura MANTER   a fatura fica, sem voltar a avisar;
--               RETIRAR  apaga a fatura (a ligação com o ciclo sai junto).
--      O que foi perdido fica em ausente_da_fonte_decisoes.
--   5) O gestor, o gestor de saldo e o coordenador marcam o aviso como resolvido (tipo FONTE em
--      avisos_resolvidos); isso só esconde o aviso.
--   6) v_ausentes_da_fonte: uma linha por nota ou fatura a conferir, com o trabalho que está nela.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Marcas e decisões
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contrato_empenho_ausente_da_fonte (
  contrato_empenho_id UUID PRIMARY KEY REFERENCES public.contrato_empenhos(id) ON DELETE CASCADE,
  contract_key        VARCHAR(150) NOT NULL,
  empenho_id          UUID NOT NULL,
  detectado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visto_em            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contrato_empenho_ausente_da_fonte_contract_idx ON public.contrato_empenho_ausente_da_fonte (contract_key);

COMMENT ON TABLE public.contrato_empenho_ausente_da_fonte IS
  'Nota que o Contratos.gov.br deixou de listar no contrato mas que tem trabalho da equipe (distribuição do gestor, quantidade informada ou unidade interna): não é apagada; o coordenador decide (migration 113).';

CREATE TABLE IF NOT EXISTS public.fatura_ausente_da_fonte (
  id_fatura              BIGINT PRIMARY KEY REFERENCES public.contrato_faturas(id_fatura) ON DELETE CASCADE,
  contract_key           VARCHAR(150) NOT NULL,
  detectado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visto_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mantida_em             TIMESTAMPTZ,
  mantida_por_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mantida_por_nome       VARCHAR(150),
  mantida_justificativa  TEXT,
  CONSTRAINT fatura_ausente_da_fonte_mantida CHECK (mantida_em IS NULL OR mantida_justificativa IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS fatura_ausente_da_fonte_contract_idx ON public.fatura_ausente_da_fonte (contract_key);
CREATE INDEX IF NOT EXISTS fatura_ausente_da_fonte_autor_idx ON public.fatura_ausente_da_fonte (mantida_por_user_id) WHERE mantida_por_user_id IS NOT NULL;

COMMENT ON TABLE public.fatura_ausente_da_fonte IS
  'Fatura que o Contratos.gov.br deixou de listar mas que está num ciclo de pagamento: não é apagada; o coordenador decide. mantida_em: ele mandou manter e a fatura não volta a avisar (migration 113).';

CREATE TABLE IF NOT EXISTS public.ausente_da_fonte_decisoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo              VARCHAR(6)   NOT NULL CHECK (tipo IN ('NOTA', 'FATURA')),
  chave             TEXT         NOT NULL,
  contract_key      VARCHAR(150) NOT NULL,
  numero            TEXT,
  decisao           VARCHAR(10)  NOT NULL CHECK (decisao IN ('MANTIDO', 'RETIRADO')),
  justificativa     TEXT         NOT NULL CHECK (char_length(justificativa) BETWEEN 10 AND 500),
  perdido           JSONB,
  decidido_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decidido_por_nome VARCHAR(150),
  decidido_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ausente_da_fonte_decisoes_contract_idx ON public.ausente_da_fonte_decisoes (contract_key, decidido_em DESC);
CREATE INDEX IF NOT EXISTS ausente_da_fonte_decisoes_autor_idx ON public.ausente_da_fonte_decisoes (decidido_por) WHERE decidido_por IS NOT NULL;

COMMENT ON TABLE public.ausente_da_fonte_decisoes IS
  'Decisões do coordenador sobre nota ou fatura que a fonte deixou de listar (migration 113). perdido: o que a retirada apagou.';

ALTER TABLE public.contrato_empenho_ausente_da_fonte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fatura_ausente_da_fonte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ausente_da_fonte_decisoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated Read: contrato_empenho_ausente_da_fonte" ON public.contrato_empenho_ausente_da_fonte;
CREATE POLICY "Authenticated Read: contrato_empenho_ausente_da_fonte"
  ON public.contrato_empenho_ausente_da_fonte FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated Read: fatura_ausente_da_fonte" ON public.fatura_ausente_da_fonte;
CREATE POLICY "Authenticated Read: fatura_ausente_da_fonte"
  ON public.fatura_ausente_da_fonte FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated Read: ausente_da_fonte_decisoes" ON public.ausente_da_fonte_decisoes;
CREATE POLICY "Authenticated Read: ausente_da_fonte_decisoes"
  ON public.ausente_da_fonte_decisoes FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.contrato_empenho_ausente_da_fonte, public.fatura_ausente_da_fonte, public.ausente_da_fonte_decisoes FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contrato_empenho_ausente_da_fonte, public.fatura_ausente_da_fonte, public.ausente_da_fonte_decisoes FROM authenticated;
GRANT SELECT ON public.contrato_empenho_ausente_da_fonte, public.fatura_ausente_da_fonte, public.ausente_da_fonte_decisoes TO authenticated;
GRANT ALL ON public.contrato_empenho_ausente_da_fonte, public.fatura_ausente_da_fonte, public.ausente_da_fonte_decisoes TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_contrato_empenho_ausente_da_fonte ON public.contrato_empenho_ausente_da_fonte;
    CREATE TRIGGER trg_audit_contrato_empenho_ausente_da_fonte
      AFTER INSERT OR DELETE ON public.contrato_empenho_ausente_da_fonte
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
    DROP TRIGGER IF EXISTS trg_audit_fatura_ausente_da_fonte ON public.fatura_ausente_da_fonte;
    CREATE TRIGGER trg_audit_fatura_ausente_da_fonte
      AFTER INSERT OR UPDATE OR DELETE ON public.fatura_ausente_da_fonte
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2) Avisos resolvidos: tipo FONTE
-- ------------------------------------------------------------------------------
ALTER TABLE public.avisos_resolvidos DROP CONSTRAINT IF EXISTS avisos_resolvidos_tipo_check;
ALTER TABLE public.avisos_resolvidos ADD CONSTRAINT avisos_resolvidos_tipo_check
  CHECK (tipo IN ('SALDO', 'REAJUSTE', 'LEMBRETE', 'FONTE'));

CREATE OR REPLACE FUNCTION public.resolver_aviso(
  p_chave TEXT,
  p_tipo TEXT,
  p_justificativa TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chave TEXT := btrim(COALESCE(p_chave, ''));
  v_tipo TEXT := upper(btrim(COALESCE(p_tipo, '')));
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin') OR public.has_role('gestor_saldos')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor, coordenador ou gestor de saldo marcam aviso como resolvido.'
      USING ERRCODE = '42501';
  END IF;

  IF v_tipo NOT IN ('SALDO', 'REAJUSTE', 'LEMBRETE', 'FONTE') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Este tipo de aviso não pode ser marcado como resolvido.' USING ERRCODE = '22023';
  END IF;
  IF v_chave = '' OR length(v_chave) > 300 OR v_chave NOT LIKE v_tipo || '::%' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Aviso não identificado.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escreva a justificativa com pelo menos 10 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A justificativa pode ter no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.avisos_resolvidos (chave, tipo, justificativa, resolvido_por, resolvido_por_nome, resolvido_em)
  VALUES (v_chave, v_tipo, v_just, auth.uid(), public.nome_do_usuario_logado(), NOW())
  ON CONFLICT (chave) DO UPDATE
    SET justificativa = EXCLUDED.justificativa,
        resolvido_por = EXCLUDED.resolvido_por,
        resolvido_por_nome = EXCLUDED.resolvido_por_nome,
        resolvido_em = EXCLUDED.resolvido_em;

  RETURN jsonb_build_object('success', true, 'chave', v_chave);
END;
$$;

-- ------------------------------------------------------------------------------
-- 3) Sincronização das notas do contrato: não apaga a nota com trabalho da equipe
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_contract_empenhos_atomic(
  p_contract_key VARCHAR,
  p_empenhos JSONB,
  p_remover_ausentes BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_key VARCHAR(150) := TRIM(COALESCE(p_contract_key, ''));
  v_elem JSONB;
  v_empenho_id UUID;
  v_valor NUMERIC(18, 4);
  v_existing public.contrato_empenhos%ROWTYPE;
  v_seen UUID[] := ARRAY[]::UUID[];
  v_removed RECORD;
  v_inseridos INTEGER := 0;
  v_atualizados INTEGER := 0;
  v_promovidos INTEGER := 0;
  v_removidos INTEGER := 0;
  v_removidos_numeros TEXT[] := ARRAY[]::TEXT[];
  v_ignorados INTEGER := 0;
  v_ignorados_numeros TEXT[] := ARRAY[]::TEXT[];
  v_existentes INTEGER;
  v_remocao_bloqueada INTEGER := 0;
  v_a_conferir INTEGER := 0;
  v_a_conferir_numeros TEXT[] := ARRAY[]::TEXT[];
  v_com_trabalho BOOLEAN;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (v_contract_key ~ '^[0-9]{6}-(NE)?[0-9]{5}-[0-9]{4}$') THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: Chave do contrato fora do formato canônico (ex.: 200331-00012-2026). Valor: "%"', v_contract_key
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contratos_oficiais WHERE contract_key = v_contract_key) THEN
    RAISE EXCEPTION 'CONTRATO_DESCONHECIDO: O contrato "%" não está na carteira de contratos oficiais.', v_contract_key
      USING ERRCODE = 'P0002';
  END IF;

  IF p_empenhos IS NULL OR jsonb_typeof(p_empenhos) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A lista de empenhos deve ser um array.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_empenhos) > 1000 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Limite de 1000 empenhos por contrato.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sync_contract_empenhos:' || v_contract_key));

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_empenhos)
  LOOP
    BEGIN
      v_empenho_id := (v_elem->>'empenho_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_empenho_id := NULL;
    END;
    IF v_empenho_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_EMPENHO_ID: Empenho sem identificador válido na lista.'
        USING ERRCODE = '22023';
    END IF;
    IF v_empenho_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Empenho repetido na operação: "%"', v_empenho_id
        USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_empenho_id);

    IF NOT EXISTS (SELECT 1 FROM public.empenhos WHERE id = v_empenho_id) THEN
      RAISE EXCEPTION 'EMPENHO_NOT_FOUND: Empenho com ID "%" não encontrado.', v_empenho_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Valor vinculado obrigatório; 0 é valor (NE anulada ou ainda sem valor no SIAFI).
    BEGIN
      v_valor := (v_elem->>'valor_vinculado')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_valor := NULL;
    END;
    IF v_valor IS NULL OR v_valor < 0 THEN
      RAISE EXCEPTION 'INVALID_VALUE: Valor vinculado ausente ou negativo para o empenho "%".', v_empenho_id
        USING ERRCODE = '22023';
    END IF;

    -- A equipe disse que este empenho não é deste contrato: a fonte lista, mas não vincula.
    IF EXISTS (
      SELECT 1 FROM public.contrato_empenho_descartes
       WHERE contract_key = v_contract_key AND empenho_id = v_empenho_id
    ) THEN
      v_ignorados := v_ignorados + 1;
      v_ignorados_numeros := array_append(v_ignorados_numeros, (SELECT numero_oficial::TEXT FROM public.empenhos WHERE id = v_empenho_id));
      CONTINUE;
    END IF;

    SELECT * INTO v_existing
      FROM public.contrato_empenhos
     WHERE contract_key = v_contract_key AND empenho_id = v_empenho_id;

    IF NOT FOUND THEN
      INSERT INTO public.contrato_empenhos (contract_key, empenho_id, valor_vinculado, origem)
      VALUES (v_contract_key, v_empenho_id, v_valor, 'FONTE');
      v_inseridos := v_inseridos + 1;

      INSERT INTO public.empenho_eventos_historico (
        empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
      ) VALUES (
        v_empenho_id, v_contract_key, CURRENT_DATE, 'EMISSAO_INICIAL', v_valor,
        jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'contract_key', v_contract_key, 'origem', 'SYNC_CONTRATO')
      );

    ELSE
      -- A fonte voltou a listar a nota: deixa de estar a conferir (migration 113).
      DELETE FROM public.contrato_empenho_ausente_da_fonte WHERE contrato_empenho_id = v_existing.id;

      -- Vínculo feito à mão que a fonte passou a listar: vira FONTE (a fonte confirmou).
      IF v_existing.origem = 'MANUAL' THEN
        UPDATE public.contrato_empenhos SET origem = 'FONTE', updated_at = NOW() WHERE id = v_existing.id;
        v_promovidos := v_promovidos + 1;
      END IF;

      IF v_existing.valor_vinculado IS DISTINCT FROM v_valor THEN
        UPDATE public.contrato_empenhos
           SET valor_vinculado = v_valor,
               updated_at = NOW()
         WHERE id = v_existing.id;
        v_atualizados := v_atualizados + 1;

        IF v_valor - COALESCE(v_existing.valor_vinculado, 0) <> 0 THEN
          INSERT INTO public.empenho_eventos_historico (
            empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
          ) VALUES (
            v_empenho_id, v_contract_key, CURRENT_DATE,
            CASE WHEN v_valor > COALESCE(v_existing.valor_vinculado, 0) THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
            v_valor - COALESCE(v_existing.valor_vinculado, 0),
            jsonb_build_object('evento', 'VINCULADO_CONTRATO', 'acao', 'ATUALIZACAO_VALOR', 'contract_key', v_contract_key, 'origem', 'SYNC_CONTRATO')
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF COALESCE(p_remover_ausentes, TRUE) THEN
    -- Só os vínculos que vieram da fonte saem quando ela deixa de listá-los; os MANUAIS ficam.
    SELECT COUNT(*) INTO v_existentes
      FROM public.contrato_empenhos
     WHERE contract_key = v_contract_key AND origem = 'FONTE' AND NOT (empenho_id = ANY (v_seen));

    IF jsonb_array_length(p_empenhos) = 0 AND v_existentes > 0 THEN
      -- A fonte não listou nenhum empenho, mas o contrato tem vínculos: não remove (id errado devolve
      -- lista vazia no Contratos.gov.br). O cliente avisa e a equipe confere.
      v_remocao_bloqueada := v_existentes;
    ELSE
      FOR v_removed IN
        SELECT ce.*, e.numero_oficial
          FROM public.contrato_empenhos ce
          JOIN public.empenhos e ON e.id = ce.empenho_id
         WHERE ce.contract_key = v_contract_key AND ce.origem = 'FONTE' AND NOT (ce.empenho_id = ANY (v_seen))
      LOOP
        -- Nota com trabalho do gestor não é apagada (migration 113): a exclusão levaria junto a distribuição
        -- entre os itens feita por ele, a quantidade que ele informou por item e, na tela do item, a unidade
        -- interna escolhida para a nota. Fica a conferir; o coordenador decide.
        v_com_trabalho :=
          EXISTS (SELECT 1 FROM public.contrato_empenho_distribuicoes d
                   WHERE d.contrato_empenho_id = v_removed.id AND d.origem = 'USUARIO')
          OR EXISTS (SELECT 1 FROM public.contrato_empenho_itens i
                      WHERE i.contrato_empenho_id = v_removed.id AND i.quantidade_informada IS NOT NULL)
          OR EXISTS (SELECT 1 FROM public.empenho_links el
                       JOIN public.arp_item_contract_links l ON l.item_key = el.item_key AND l.contract_key = v_contract_key
                      WHERE el.empenho_numero = v_removed.numero_oficial::TEXT);
        IF v_com_trabalho THEN
          INSERT INTO public.contrato_empenho_ausente_da_fonte (contrato_empenho_id, contract_key, empenho_id, detectado_em, visto_em)
          VALUES (v_removed.id, v_contract_key, v_removed.empenho_id, NOW(), NOW())
          ON CONFLICT (contrato_empenho_id) DO UPDATE SET visto_em = NOW();
          v_a_conferir := v_a_conferir + 1;
          v_a_conferir_numeros := array_append(v_a_conferir_numeros, v_removed.numero_oficial::TEXT);
          CONTINUE;
        END IF;

        INSERT INTO public.empenho_eventos_historico (
          empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
        ) VALUES (
          v_removed.empenho_id, v_contract_key, CURRENT_DATE, 'CANCELAMENTO_TOTAL',
          -COALESCE(v_removed.valor_vinculado, 0),
          jsonb_build_object(
            'evento', 'DESVINCULADO_CONTRATO',
            'motivo', 'AUSENTE_NA_FONTE',
            'link_id', v_removed.id,
            'valor_estornado', v_removed.valor_vinculado,
            'origem', 'SYNC_CONTRATO'
          )
        );
        DELETE FROM public.contrato_empenhos WHERE id = v_removed.id;
        v_removidos := v_removidos + 1;
        v_removidos_numeros := array_append(v_removidos_numeros, v_removed.numero_oficial::TEXT);
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'contract_key', v_contract_key,
    'inseridos', v_inseridos,
    'atualizados', v_atualizados,
    'promovidos', v_promovidos,
    'removidos', v_removidos,
    'removidos_numeros', to_jsonb(v_removidos_numeros),
    'ignorados_descartados', v_ignorados,
    'ignorados_numeros', to_jsonb(v_ignorados_numeros),
    'remocao_bloqueada', v_remocao_bloqueada,
    'a_conferir', v_a_conferir,
    'a_conferir_numeros', to_jsonb(v_a_conferir_numeros)
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4) Sincronização das faturas: não apaga a fatura que está num ciclo de pagamento
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_contrato_faturas_atomic(
  p_contract_key VARCHAR,
  p_faturas JSONB,
  p_remover_ausentes BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key VARCHAR(150) := TRIM(COALESCE(p_contract_key, ''));
  v_elem JSONB;
  v_emp JSONB;
  v_id BIGINT;
  v_seen BIGINT[] := ARRAY[]::BIGINT[];
  v_gravadas INTEGER := 0;
  v_removidas INTEGER := 0;
  v_existentes INTEGER;
  v_bloqueada INTEGER := 0;
  v_a_conferir INTEGER := 0;
BEGIN
  IF NOT (public.eh_service_role() OR public.has_role('gestor')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só gestor ou coordenador sincroniza as faturas.' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_key ~ '^[0-9]{6}-(NE)?[0-9]{5}-[0-9]{4}$') THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: Chave do contrato fora do formato canônico. Valor: "%"', v_key USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contratos_oficiais WHERE contract_key = v_key) THEN
    RAISE EXCEPTION 'CONTRATO_DESCONHECIDO: O contrato "%" não está na carteira de contratos oficiais.', v_key USING ERRCODE = 'P0002';
  END IF;
  IF p_faturas IS NULL OR jsonb_typeof(p_faturas) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A lista de faturas deve ser um array.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_faturas) > 2000 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Limite de 2000 faturas por contrato.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sync_contrato_faturas:' || v_key));

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_faturas)
  LOOP
    BEGIN
      v_id := (v_elem->>'id_fatura')::BIGINT;
    EXCEPTION WHEN OTHERS THEN
      v_id := NULL;
    END;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Fatura sem id na lista.' USING ERRCODE = '22023';
    END IF;
    IF v_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: Fatura repetida na operação: %', v_id USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_id);

    INSERT INTO public.contrato_faturas AS f (
      id_fatura, contract_key, contrato_id_gov, numero, tipo, emissao, vencimento, valor, glosa, valor_liquido,
      data_liquidacao, situacao, cancelada, np, ug_np, referencia, processo, sincronizado_em
    ) VALUES (
      v_id, v_key, v_elem->>'contrato_id_gov', v_elem->>'numero', v_elem->>'tipo',
      public.texto_para_data(v_elem->>'emissao'), public.texto_para_data(v_elem->>'vencimento'),
      COALESCE((v_elem->>'valor')::NUMERIC, 0), COALESCE((v_elem->>'glosa')::NUMERIC, 0), COALESCE((v_elem->>'valor_liquido')::NUMERIC, 0),
      public.texto_para_data(v_elem->>'data_liquidacao'), v_elem->>'situacao', COALESCE((v_elem->>'cancelada')::BOOLEAN, FALSE),
      NULLIF(TRIM(COALESCE(v_elem->>'np', '')), ''), NULLIF(TRIM(COALESCE(v_elem->>'ug_np', '')), ''),
      v_elem->>'referencia', v_elem->>'processo', NOW()
    )
    ON CONFLICT (id_fatura) DO UPDATE SET
      contract_key = EXCLUDED.contract_key, contrato_id_gov = EXCLUDED.contrato_id_gov, numero = EXCLUDED.numero,
      tipo = EXCLUDED.tipo, emissao = EXCLUDED.emissao, vencimento = EXCLUDED.vencimento, valor = EXCLUDED.valor,
      glosa = EXCLUDED.glosa, valor_liquido = EXCLUDED.valor_liquido, data_liquidacao = EXCLUDED.data_liquidacao,
      situacao = EXCLUDED.situacao, cancelada = EXCLUDED.cancelada, np = EXCLUDED.np, ug_np = EXCLUDED.ug_np,
      referencia = EXCLUDED.referencia, processo = EXCLUDED.processo, sincronizado_em = NOW();

    DELETE FROM public.fatura_empenhos WHERE id_fatura = v_id;
    IF jsonb_typeof(v_elem->'empenhos') = 'array' THEN
      FOR v_emp IN SELECT * FROM jsonb_array_elements(v_elem->'empenhos')
      LOOP
        IF NULLIF(TRIM(COALESCE(v_emp->>'id_empenho_gov', '')), '') IS NOT NULL THEN
          INSERT INTO public.fatura_empenhos (id_fatura, id_empenho_gov, numero_empenho, valor)
          VALUES (v_id, TRIM(v_emp->>'id_empenho_gov'), v_emp->>'numero_empenho', COALESCE((v_emp->>'valor')::NUMERIC, 0))
          ON CONFLICT (id_fatura, id_empenho_gov) DO UPDATE
            SET valor = public.fatura_empenhos.valor + EXCLUDED.valor;
        END IF;
      END LOOP;
    END IF;
    v_gravadas := v_gravadas + 1;
  END LOOP;

  -- A fonte voltou a listar a fatura: deixa de estar a conferir, mesmo a mantida (migration 113).
  IF cardinality(v_seen) > 0 THEN
    DELETE FROM public.fatura_ausente_da_fonte WHERE id_fatura = ANY (v_seen);
  END IF;

  IF COALESCE(p_remover_ausentes, TRUE) THEN
    SELECT COUNT(*) INTO v_existentes
      FROM public.contrato_faturas WHERE contract_key = v_key AND NOT (id_fatura = ANY (v_seen));
    IF cardinality(v_seen) = 0 AND v_existentes > 0 THEN
      v_bloqueada := v_existentes;   -- lista vazia não apaga faturas conhecidas (mesma regra da migration 81)
    ELSE
      -- Fatura que está num ciclo de pagamento não é apagada (migration 113): a exclusão levaria junto a
      -- ligação com o ciclo. Fica a conferir; o coordenador decide. A que ele mandou manter não volta a avisar.
      INSERT INTO public.fatura_ausente_da_fonte (id_fatura, contract_key, detectado_em, visto_em)
      SELECT f.id_fatura, f.contract_key, NOW(), NOW()
        FROM public.contrato_faturas f
       WHERE f.contract_key = v_key AND NOT (f.id_fatura = ANY (v_seen))
         AND EXISTS (SELECT 1 FROM public.contract_payment_cycle_faturas cf WHERE cf.id_fatura = f.id_fatura)
      ON CONFLICT (id_fatura) DO UPDATE SET visto_em = NOW();

      SELECT count(*) INTO v_a_conferir
        FROM public.fatura_ausente_da_fonte a
       WHERE a.contract_key = v_key AND a.mantida_em IS NULL;

      DELETE FROM public.contrato_faturas f
       WHERE f.contract_key = v_key AND NOT (f.id_fatura = ANY (v_seen))
         AND NOT EXISTS (SELECT 1 FROM public.contract_payment_cycle_faturas cf WHERE cf.id_fatura = f.id_fatura)
         AND NOT EXISTS (SELECT 1 FROM public.fatura_ausente_da_fonte a WHERE a.id_fatura = f.id_fatura AND a.mantida_em IS NOT NULL);
      GET DIAGNOSTICS v_removidas = ROW_COUNT;
    END IF;
  END IF;

  -- Lista vazia bloqueada não conta como sincronização: o contrato volta para a frente da fila.
  IF v_bloqueada = 0 THEN
    INSERT INTO public.contrato_faturas_sincronizacao AS s (contract_key, faturas, sincronizado_em)
    VALUES (v_key, cardinality(v_seen), NOW())
    ON CONFLICT (contract_key) DO UPDATE SET faturas = EXCLUDED.faturas, sincronizado_em = NOW();
  END IF;

  RETURN jsonb_build_object('success', true, 'contract_key', v_key, 'gravadas', v_gravadas,
                            'removidas', v_removidas, 'remocao_bloqueada', v_bloqueada,
                            'a_conferir', v_a_conferir);
END;
$$;

-- ------------------------------------------------------------------------------
-- 5) Leitura
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_ausentes_da_fonte
WITH (security_invoker = true)
AS
SELECT
  'NOTA'::TEXT AS tipo,
  a.contrato_empenho_id::TEXT AS chave,
  a.contract_key::TEXT AS contract_key,
  e.numero_oficial::TEXT AS numero,
  ce.valor_vinculado AS valor,
  a.detectado_em,
  cm.gestor_nome::TEXT AS gestor_contrato,
  d.distribuido_por_nome::TEXT AS distribuido_por_nome,
  (SELECT count(*) FROM public.contrato_empenho_itens i
    WHERE i.contrato_empenho_id = a.contrato_empenho_id AND i.quantidade_informada IS NOT NULL)::INTEGER AS quantidades_informadas,
  (SELECT string_agg(DISTINCT al.unit_name, ', ')
     FROM public.empenho_links el
     JOIN public.arp_item_contract_links l ON l.item_key = el.item_key AND l.contract_key = a.contract_key
     JOIN public.arp_allocations al ON al.id = el.allocation_id
    WHERE el.empenho_numero = e.numero_oficial::TEXT)::TEXT AS unidades,
  NULL::TEXT AS ciclos
FROM public.contrato_empenho_ausente_da_fonte a
JOIN public.contrato_empenhos ce ON ce.id = a.contrato_empenho_id
JOIN public.empenhos e ON e.id = ce.empenho_id
LEFT JOIN public.contrato_empenho_distribuicoes d ON d.contrato_empenho_id = a.contrato_empenho_id AND d.origem = 'USUARIO'
LEFT JOIN public.contract_managers cm ON cm.contract_key = a.contract_key
UNION ALL
SELECT
  'FATURA'::TEXT,
  a.id_fatura::TEXT,
  a.contract_key::TEXT,
  f.numero::TEXT,
  f.valor_liquido,
  a.detectado_em,
  cm.gestor_nome::TEXT,
  NULL::TEXT,
  0,
  NULL::TEXT,
  (SELECT string_agg(trim(COALESCE(c.competencia, '') || ' ' || c.status), '; ' ORDER BY c.criado_em)
     FROM public.contract_payment_cycle_faturas cf
     JOIN public.contract_payment_cycles c ON c.id = cf.cycle_id
    WHERE cf.id_fatura = a.id_fatura)::TEXT
FROM public.fatura_ausente_da_fonte a
JOIN public.contrato_faturas f ON f.id_fatura = a.id_fatura
LEFT JOIN public.contract_managers cm ON cm.contract_key = a.contract_key
WHERE a.mantida_em IS NULL;

COMMENT ON VIEW public.v_ausentes_da_fonte IS
  'Notas e faturas que a fonte deixou de listar e que têm trabalho da equipe, a conferir (migration 113).';

GRANT SELECT ON public.v_ausentes_da_fonte TO authenticated;

-- ------------------------------------------------------------------------------
-- 6) Decisão do coordenador
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decidir_ausente_da_fonte(
  p_tipo TEXT,
  p_chave TEXT,
  p_decisao TEXT,
  p_justificativa TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo TEXT := upper(btrim(COALESCE(p_tipo, '')));
  v_decisao TEXT := upper(btrim(COALESCE(p_decisao, '')));
  v_just TEXT := btrim(COALESCE(p_justificativa, ''));
  v_nome TEXT := COALESCE(public.nome_do_usuario_logado(), 'Usuário');
  v_ce public.contrato_empenhos%ROWTYPE;
  v_numero TEXT;
  v_id_ce UUID;
  v_id_fatura BIGINT;
  v_fatura public.contrato_faturas%ROWTYPE;
  v_perdido JSONB;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Só o coordenador decide sobre nota ou fatura que a fonte deixou de listar.'
      USING ERRCODE = '42501';
  END IF;
  IF v_tipo NOT IN ('NOTA', 'FATURA') OR v_decisao NOT IN ('MANTER', 'RETIRAR') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Decisão não reconhecida.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Escreva a justificativa com pelo menos 10 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_just) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A justificativa pode ter no máximo 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF v_tipo = 'NOTA' THEN
    BEGIN
      v_id_ce := btrim(p_chave)::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'NOT_FOUND: Nota não encontrada.' USING ERRCODE = 'P0002';
    END;
    SELECT * INTO v_ce FROM public.contrato_empenhos WHERE id = v_id_ce FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.contrato_empenho_ausente_da_fonte WHERE contrato_empenho_id = v_id_ce) THEN
      RAISE EXCEPTION 'NOT_FOUND: Esta nota não está a conferir.' USING ERRCODE = 'P0002';
    END IF;
    SELECT numero_oficial::TEXT INTO v_numero FROM public.empenhos WHERE id = v_ce.empenho_id;

    IF v_decisao = 'MANTER' THEN
      UPDATE public.contrato_empenhos
         SET origem = 'MANUAL',
             vinculado_por_user_id = auth.uid(),
             vinculado_por_nome = v_nome,
             motivo_manual = left('Mantida pelo coordenador depois que o Contratos.gov.br deixou de listar a nota: ' || v_just, 1000),
             updated_at = NOW()
       WHERE id = v_id_ce;
      DELETE FROM public.contrato_empenho_ausente_da_fonte WHERE contrato_empenho_id = v_id_ce;
    ELSE
      v_perdido := jsonb_build_object(
        'valor_vinculado', v_ce.valor_vinculado,
        'distribuicao', (
          SELECT jsonb_build_object(
            'origem', d.origem,
            'distribuido_por_nome', d.distribuido_por_nome,
            'parcelas', (SELECT COALESCE(jsonb_agg(jsonb_build_object('numero_item', i.numero_item, 'valor', i.valor,
                                                     'quantidade_informada', i.quantidade_informada, 'informada_por_nome', i.informada_por_nome)
                                          ORDER BY i.numero_item), '[]'::JSONB)
                           FROM public.contrato_empenho_itens i WHERE i.contrato_empenho_id = v_id_ce))
            FROM public.contrato_empenho_distribuicoes d WHERE d.contrato_empenho_id = v_id_ce),
        'unidades', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object('item_key', el.item_key, 'unidade', al.unit_name) ORDER BY el.item_key), '[]'::JSONB)
            FROM public.empenho_links el
            JOIN public.arp_item_contract_links l ON l.item_key = el.item_key AND l.contract_key = v_ce.contract_key
            LEFT JOIN public.arp_allocations al ON al.id = el.allocation_id
           WHERE el.empenho_numero = v_numero)
      );
      -- O mesmo registro que a sincronização fazia ao apagar a nota ausente.
      INSERT INTO public.empenho_eventos_historico (
        empenho_id, contract_key, data_evento, tipo_evento, delta_valor, metadados
      ) VALUES (
        v_ce.empenho_id, v_ce.contract_key, CURRENT_DATE, 'CANCELAMENTO_TOTAL', -COALESCE(v_ce.valor_vinculado, 0),
        jsonb_build_object('evento', 'DESVINCULADO_CONTRATO', 'motivo', 'AUSENTE_NA_FONTE', 'link_id', v_ce.id,
                           'valor_estornado', v_ce.valor_vinculado, 'origem', 'COORDENADOR', 'decidido_por', v_nome)
      );
      DELETE FROM public.contrato_empenhos WHERE id = v_id_ce; -- distribuição e marca saem junto
    END IF;

    INSERT INTO public.ausente_da_fonte_decisoes (tipo, chave, contract_key, numero, decisao, justificativa, perdido, decidido_por, decidido_por_nome)
    VALUES ('NOTA', v_id_ce::TEXT, v_ce.contract_key, v_numero, CASE WHEN v_decisao = 'MANTER' THEN 'MANTIDO' ELSE 'RETIRADO' END,
            v_just, v_perdido, auth.uid(), v_nome);
    RETURN jsonb_build_object('success', true, 'tipo', 'NOTA', 'numero', v_numero, 'decisao', v_decisao, 'perdido', v_perdido);
  END IF;

  -- FATURA
  BEGIN
    v_id_fatura := btrim(p_chave)::BIGINT;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'NOT_FOUND: Fatura não encontrada.' USING ERRCODE = 'P0002';
  END;
  SELECT * INTO v_fatura FROM public.contrato_faturas WHERE id_fatura = v_id_fatura FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.fatura_ausente_da_fonte WHERE id_fatura = v_id_fatura AND mantida_em IS NULL) THEN
    RAISE EXCEPTION 'NOT_FOUND: Esta fatura não está a conferir.' USING ERRCODE = 'P0002';
  END IF;

  IF v_decisao = 'MANTER' THEN
    UPDATE public.fatura_ausente_da_fonte
       SET mantida_em = NOW(), mantida_por_user_id = auth.uid(), mantida_por_nome = v_nome, mantida_justificativa = v_just
     WHERE id_fatura = v_id_fatura;
  ELSE
    v_perdido := jsonb_build_object(
      'numero', v_fatura.numero,
      'valor_liquido', v_fatura.valor_liquido,
      'emissao', v_fatura.emissao,
      'ciclos', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('cycle_id', c.id, 'competencia', c.competencia, 'status', c.status,
                                                     'vinculado_por', cf.vinculado_por) ORDER BY c.criado_em), '[]'::JSONB)
          FROM public.contract_payment_cycle_faturas cf
          JOIN public.contract_payment_cycles c ON c.id = cf.cycle_id
         WHERE cf.id_fatura = v_id_fatura)
    );
    DELETE FROM public.contrato_faturas WHERE id_fatura = v_id_fatura; -- ligação com o ciclo e marca saem junto
  END IF;

  INSERT INTO public.ausente_da_fonte_decisoes (tipo, chave, contract_key, numero, decisao, justificativa, perdido, decidido_por, decidido_por_nome)
  VALUES ('FATURA', v_id_fatura::TEXT, v_fatura.contract_key, v_fatura.numero, CASE WHEN v_decisao = 'MANTER' THEN 'MANTIDO' ELSE 'RETIRADO' END,
          v_just, v_perdido, auth.uid(), v_nome);
  RETURN jsonb_build_object('success', true, 'tipo', 'FATURA', 'numero', v_fatura.numero, 'decisao', v_decisao, 'perdido', v_perdido);
END;
$$;

REVOKE ALL ON FUNCTION public.decidir_ausente_da_fonte(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decidir_ausente_da_fonte(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
