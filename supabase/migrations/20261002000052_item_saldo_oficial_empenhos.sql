-- ==============================================================================
-- MIGRATION 52: SALDO OFICIAL DO ITEM (COMPRAS.GOV) E EMPENHOS FORA DO SALDO OFICIAL
-- Versão: 20261002000052_item_saldo_oficial_empenhos.sql
--
-- O empenho pode chegar ao item por dois lados: o Compras.gov (consumo do item da ata) e o
-- contrato vinculado (Contratos.gov). O saldo oficial da ata é o do Compras.gov, e a lista de
-- empenhos é o detalhe dele.
--
--  - arp_item_saldo_oficial guarda o total empenhado do item informado pelo Compras.gov;
--  - arp_item_empenhos.consta_saldo_oficial marca se a linha faz parte desse total
--    (falso = empenho que só o contrato conhece);
--  - arp_item_empenhos.quantidade_minuta guarda o que a minuta do contrato diz, para avisar divergência;
--  - a quantidade do Compras.gov prevalece sobre a da minuta;
--  - a view de saldo passa a usar o total oficial quando ele foi sincronizado.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Total oficial do item
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.arp_item_saldo_oficial (
  item_key VARCHAR(100) PRIMARY KEY,
  quantidade_empenhada NUMERIC(18, 4) NOT NULL CHECK (quantidade_empenhada >= 0),
  saldo_empenho NUMERIC(18, 4),
  fonte VARCHAR(20) NOT NULL DEFAULT 'COMPRASGOV',
  lido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_por UUID DEFAULT auth.uid() REFERENCES auth.users(id),
  CONSTRAINT chk_arp_item_saldo_oficial_item_key CHECK (item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$')
);

COMMENT ON TABLE public.arp_item_saldo_oficial IS
  'Total empenhado do item da ata segundo o Compras.gov (saldo oficial). As linhas de arp_item_empenhos são o detalhe dele.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_audit_log_capture') THEN
    DROP TRIGGER IF EXISTS trg_audit_arp_item_saldo_oficial ON public.arp_item_saldo_oficial;
    CREATE TRIGGER trg_audit_arp_item_saldo_oficial
      AFTER INSERT OR UPDATE OR DELETE ON public.arp_item_saldo_oficial
      FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_capture();
  END IF;
END $$;

ALTER TABLE public.arp_item_saldo_oficial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura do saldo oficial para autenticados"
  ON public.arp_item_saldo_oficial FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.arp_item_saldo_oficial FROM authenticated, anon;

-- ------------------------------------------------------------------------------
-- 2. arp_item_empenhos: pertence ao saldo oficial? e o que a minuta diz
-- ------------------------------------------------------------------------------
ALTER TABLE public.arp_item_empenhos
  ADD COLUMN IF NOT EXISTS consta_saldo_oficial BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quantidade_minuta NUMERIC(18, 4) CHECK (quantidade_minuta IS NULL OR quantidade_minuta >= 0);

COMMENT ON COLUMN public.arp_item_empenhos.consta_saldo_oficial IS
  'Verdadeiro quando a linha faz parte do total empenhado informado pelo Compras.gov; falso quando só o contrato conhece o empenho.';
COMMENT ON COLUMN public.arp_item_empenhos.quantidade_minuta IS
  'Quantidade do item na minuta do empenho no Contratos.gov. Se diferir de quantidade_consumida (Compras.gov), a tela avisa a divergência.';

CREATE INDEX IF NOT EXISTS idx_arp_item_empenhos_consta
  ON public.arp_item_empenhos(item_key, consta_saldo_oficial);

-- ------------------------------------------------------------------------------
-- 3. sync_item_contract_empenhos_atomic: versão com a regra "Compras.gov prevalece"
-- ------------------------------------------------------------------------------
-- Empenhos que só o contrato conhece entram com consta_saldo_oficial = false.
-- Se a linha já consta do saldo oficial, a quantidade do Compras.gov é mantida e a da minuta
-- fica em quantidade_minuta. Ao tirar o contrato do item, a linha que o Compras.gov ainda lista
-- permanece (sem contrato); as demais saem.
CREATE OR REPLACE FUNCTION public.sync_item_contract_empenhos_atomic(
  p_item_key VARCHAR,
  p_contract_key VARCHAR,
  p_empenhos JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := TRIM(COALESCE(p_item_key, ''));
  v_contract_key VARCHAR(150) := TRIM(COALESCE(p_contract_key, ''));
  v_elem JSONB;
  v_empenho_id UUID;
  v_qtd NUMERIC(18, 4);
  v_sugerida NUMERIC(18, 4);
  v_minuta VARCHAR(10);
  v_existing public.arp_item_empenhos%ROWTYPE;
  v_seen UUID[] := ARRAY[]::UUID[];
  v_removed RECORD;
  v_upserted INTEGER := 0;
  v_removidos INTEGER := 0;
  v_pendentes INTEGER := 0;
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
    RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item inválida (formato esperado: 00037/2026-200331-00001). Valor: "%"', v_item_key
      USING ERRCODE = '22023';
  END IF;

  IF v_contract_key = '' THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_KEY: Chave canônica do contrato não pode ser vazia.'
      USING ERRCODE = '22023';
  END IF;

  IF p_empenhos IS NULL OR jsonb_typeof(p_empenhos) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A lista de empenhos deve ser um array.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_empenhos) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Limite de 500 empenhos por operação.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sync_item_contract:' || v_item_key || ':' || v_contract_key));

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

    v_qtd := NULL;
    IF v_elem ? 'quantidade' AND jsonb_typeof(v_elem->'quantidade') <> 'null' THEN
      BEGIN
        v_qtd := (v_elem->>'quantidade')::NUMERIC;
      EXCEPTION WHEN OTHERS THEN
        v_qtd := -1;
      END;
      IF v_qtd < 0 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY: Quantidade inválida para o empenho "%".', v_empenho_id
          USING ERRCODE = '22023';
      END IF;
    END IF;

    v_sugerida := NULL;
    IF v_elem ? 'quantidade_sugerida' AND jsonb_typeof(v_elem->'quantidade_sugerida') <> 'null' THEN
      BEGIN
        v_sugerida := (v_elem->>'quantidade_sugerida')::NUMERIC;
      EXCEPTION WHEN OTHERS THEN
        v_sugerida := NULL;
      END;
      IF v_sugerida IS NOT NULL AND v_sugerida < 0 THEN v_sugerida := NULL; END IF;
    END IF;

    v_minuta := NULLIF(TRIM(COALESCE(v_elem->>'numero_item_minuta', '')), '');

    SELECT * INTO v_existing
      FROM public.arp_item_empenhos
     WHERE item_key = v_item_key AND empenho_id = v_empenho_id;

    IF NOT FOUND THEN
      -- Empenho que só o contrato conhece: fora do saldo oficial até o Compras.gov confirmá-lo.
      INSERT INTO public.arp_item_empenhos (
        item_key, empenho_id, quantidade_consumida, fonte_quantidade, quantidade_sugerida,
        quantidade_minuta, consta_saldo_oficial, tipo_consumo, numero_item_minuta, contract_key
      ) VALUES (
        v_item_key, v_empenho_id, v_qtd,
        CASE WHEN v_qtd IS NULL THEN NULL ELSE 'API' END,
        CASE WHEN v_qtd IS NULL THEN v_sugerida ELSE NULL END,
        v_qtd, false, 'ORDINARIO', v_minuta, v_contract_key
      );

      IF v_qtd IS NOT NULL THEN
        INSERT INTO public.empenho_eventos_historico (
          empenho_id, item_key, contract_key, data_evento, tipo_evento, delta_quantidade, metadados
        ) VALUES (
          v_empenho_id, v_item_key, v_contract_key, CURRENT_DATE, 'EMISSAO_INICIAL', v_qtd,
          jsonb_build_object('evento', 'VINCULADO_ITEM', 'fonte_quantidade', 'API', 'consta_saldo_oficial', false)
        );
      END IF;

    ELSIF v_existing.consta_saldo_oficial THEN
      -- A linha consta do saldo oficial (Compras.gov): mantém a quantidade dele e guarda a da minuta.
      UPDATE public.arp_item_empenhos
         SET quantidade_minuta = COALESCE(v_qtd, quantidade_minuta),
             numero_item_minuta = COALESCE(v_minuta, numero_item_minuta),
             contract_key = COALESCE(contract_key, v_contract_key),
             updated_at = NOW()
       WHERE id = v_existing.id;

    ELSIF v_qtd IS NOT NULL THEN
      -- Linha só do contrato: a minuta vale como quantidade e prevalece sobre a digitada.
      IF v_existing.quantidade_consumida IS DISTINCT FROM v_qtd THEN
        INSERT INTO public.empenho_eventos_historico (
          empenho_id, item_key, contract_key, data_evento, tipo_evento, delta_quantidade, metadados
        ) VALUES (
          v_empenho_id, v_item_key, v_contract_key, CURRENT_DATE,
          CASE WHEN v_qtd >= COALESCE(v_existing.quantidade_consumida, 0) THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
          v_qtd - COALESCE(v_existing.quantidade_consumida, 0),
          jsonb_build_object('evento', 'VINCULADO_ITEM', 'fonte_quantidade', 'API', 'substituiu_fonte', v_existing.fonte_quantidade)
        );
      END IF;

      UPDATE public.arp_item_empenhos
         SET quantidade_consumida = v_qtd,
             fonte_quantidade = 'API',
             quantidade_minuta = v_qtd,
             quantidade_sugerida = NULL,
             tipo_consumo = CASE WHEN tipo_consumo = 'AJUSTE_MANUAL' THEN 'ORDINARIO' ELSE tipo_consumo END,
             numero_item_minuta = COALESCE(v_minuta, numero_item_minuta),
             contract_key = COALESCE(contract_key, v_contract_key),
             confirmado_por = NULL,
             confirmado_em = NULL,
             updated_at = NOW()
       WHERE id = v_existing.id;

    ELSE
      -- Sem quantidade da minuta: preserva a confirmada pelo usuário; se pendente, só atualiza a sugestão.
      UPDATE public.arp_item_empenhos
         SET quantidade_sugerida = CASE WHEN quantidade_consumida IS NULL THEN v_sugerida ELSE quantidade_sugerida END,
             numero_item_minuta = COALESCE(v_minuta, numero_item_minuta),
             contract_key = COALESCE(contract_key, v_contract_key),
             updated_at = NOW()
       WHERE id = v_existing.id;
    END IF;

    v_upserted := v_upserted + 1;
  END LOOP;

  -- Empenhos do par (item, contrato) que o contrato deixou de listar
  FOR v_removed IN
    SELECT id, empenho_id, quantidade_consumida, consta_saldo_oficial
      FROM public.arp_item_empenhos
     WHERE item_key = v_item_key
       AND contract_key = v_contract_key
       AND NOT (empenho_id = ANY (v_seen))
  LOOP
    IF v_removed.consta_saldo_oficial THEN
      -- O Compras.gov ainda lista o empenho no item: ele fica, só deixa de estar associado ao contrato.
      UPDATE public.arp_item_empenhos
         SET contract_key = NULL, quantidade_minuta = NULL, updated_at = NOW()
       WHERE id = v_removed.id;
    ELSE
      IF v_removed.quantidade_consumida IS NOT NULL THEN
        INSERT INTO public.empenho_eventos_historico (
          empenho_id, item_key, contract_key, data_evento, tipo_evento, delta_quantidade, metadados
        ) VALUES (
          v_removed.empenho_id, v_item_key, v_contract_key, CURRENT_DATE, 'CANCELAMENTO_TOTAL',
          -v_removed.quantidade_consumida,
          jsonb_build_object('evento', 'DESVINCULADO_ITEM', 'motivo', 'API_NAO_LISTA_MAIS')
        );
      END IF;
      DELETE FROM public.arp_item_empenhos WHERE id = v_removed.id;
      v_removidos := v_removidos + 1;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_pendentes
    FROM public.arp_item_empenhos
   WHERE item_key = v_item_key AND contract_key = v_contract_key AND quantidade_consumida IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'contract_key', v_contract_key,
    'sincronizados', v_upserted,
    'removidos', v_removidos,
    'pendentes', v_pendentes,
    'timestamp', NOW()
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. sync_item_official_saldo_atomic: total oficial do Compras.gov + linhas identificadas
-- ------------------------------------------------------------------------------
-- p_linhas: [{ "empenho_id": uuid, "quantidade": number }, ...] são as linhas do Compras.gov que
-- trazem o número do empenho. As sem número entram só no total (viram "sem identificação" na view).
-- Linhas que o Compras.gov deixou de listar: saem se não têm contrato; se têm, ficam fora do saldo
-- oficial. Atribuições feitas pelo usuário (fonte USUARIO) não são tocadas.
CREATE OR REPLACE FUNCTION public.sync_item_official_saldo_atomic(
  p_item_key VARCHAR,
  p_quantidade_empenhada NUMERIC,
  p_saldo_empenho NUMERIC,
  p_linhas JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := TRIM(COALESCE(p_item_key, ''));
  v_elem JSONB;
  v_empenho_id UUID;
  v_qtd NUMERIC(18, 4);
  v_existing public.arp_item_empenhos%ROWTYPE;
  v_seen UUID[] := ARRAY[]::UUID[];
  v_removed RECORD;
  v_linhas INTEGER := 0;
  v_removidos INTEGER := 0;
  v_fora INTEGER := 0;
  v_sem_identificacao NUMERIC(18, 4);
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
    RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item inválida (formato esperado: 00037/2026-200331-00001). Valor: "%"', v_item_key
      USING ERRCODE = '22023';
  END IF;

  IF p_quantidade_empenhada IS NULL OR p_quantidade_empenhada < 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade empenhada oficial deve ser zero ou positiva.'
      USING ERRCODE = '22023';
  END IF;

  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A lista de linhas deve ser um array.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_linhas) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: Limite de 500 linhas por operação.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sync_item_oficial:' || v_item_key));

  INSERT INTO public.arp_item_saldo_oficial (item_key, quantidade_empenhada, saldo_empenho, fonte, lido_em, atualizado_por)
  VALUES (v_item_key, p_quantidade_empenhada, p_saldo_empenho, 'COMPRASGOV', NOW(), auth.uid())
  ON CONFLICT (item_key) DO UPDATE SET
    quantidade_empenhada = EXCLUDED.quantidade_empenhada,
    saldo_empenho = EXCLUDED.saldo_empenho,
    fonte = EXCLUDED.fonte,
    lido_em = EXCLUDED.lido_em,
    atualizado_por = EXCLUDED.atualizado_por;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_linhas)
  LOOP
    BEGIN
      v_empenho_id := (v_elem->>'empenho_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_empenho_id := NULL;
    END;

    IF v_empenho_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_EMPENHO_ID: Linha sem identificador de empenho válido.'
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

    BEGIN
      v_qtd := (v_elem->>'quantidade')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_qtd := NULL;
    END;
    IF v_qtd IS NULL OR v_qtd < 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY: Quantidade inválida para o empenho "%".', v_empenho_id
        USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_existing
      FROM public.arp_item_empenhos
     WHERE item_key = v_item_key AND empenho_id = v_empenho_id;

    IF NOT FOUND THEN
      INSERT INTO public.arp_item_empenhos (
        item_key, empenho_id, quantidade_consumida, fonte_quantidade, consta_saldo_oficial, tipo_consumo
      ) VALUES (
        v_item_key, v_empenho_id, v_qtd, 'API', true, 'ORDINARIO'
      );

      INSERT INTO public.empenho_eventos_historico (
        empenho_id, item_key, data_evento, tipo_evento, delta_quantidade, metadados
      ) VALUES (
        v_empenho_id, v_item_key, CURRENT_DATE, 'EMISSAO_INICIAL', v_qtd,
        jsonb_build_object('evento', 'VINCULADO_ITEM', 'fonte_quantidade', 'API', 'origem', 'COMPRASGOV')
      );
    ELSE
      IF v_existing.quantidade_consumida IS DISTINCT FROM v_qtd THEN
        INSERT INTO public.empenho_eventos_historico (
          empenho_id, item_key, contract_key, data_evento, tipo_evento, delta_quantidade, metadados
        ) VALUES (
          v_empenho_id, v_item_key, v_existing.contract_key, CURRENT_DATE,
          CASE WHEN v_qtd >= COALESCE(v_existing.quantidade_consumida, 0) THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
          v_qtd - COALESCE(v_existing.quantidade_consumida, 0),
          jsonb_build_object('evento', 'VINCULADO_ITEM', 'fonte_quantidade', 'API', 'origem', 'COMPRASGOV',
                             'substituiu_fonte', v_existing.fonte_quantidade)
        );
      END IF;

      UPDATE public.arp_item_empenhos
         SET quantidade_consumida = v_qtd,
             fonte_quantidade = 'API',
             consta_saldo_oficial = true,
             quantidade_sugerida = NULL,
             tipo_consumo = CASE WHEN tipo_consumo = 'AJUSTE_MANUAL' THEN 'ORDINARIO' ELSE tipo_consumo END,
             confirmado_por = NULL,
             confirmado_em = NULL,
             updated_at = NOW()
       WHERE id = v_existing.id;
    END IF;

    v_linhas := v_linhas + 1;
  END LOOP;

  -- Linhas que constavam do saldo oficial e o Compras.gov deixou de listar (exceto atribuições do usuário).
  FOR v_removed IN
    SELECT id, empenho_id, quantidade_consumida, contract_key
      FROM public.arp_item_empenhos
     WHERE item_key = v_item_key
       AND consta_saldo_oficial = true
       AND fonte_quantidade IS DISTINCT FROM 'USUARIO'
       AND NOT (empenho_id = ANY (v_seen))
  LOOP
    IF v_removed.contract_key IS NULL THEN
      IF v_removed.quantidade_consumida IS NOT NULL THEN
        INSERT INTO public.empenho_eventos_historico (
          empenho_id, item_key, data_evento, tipo_evento, delta_quantidade, metadados
        ) VALUES (
          v_removed.empenho_id, v_item_key, CURRENT_DATE, 'CANCELAMENTO_TOTAL',
          -v_removed.quantidade_consumida,
          jsonb_build_object('evento', 'DESVINCULADO_ITEM', 'motivo', 'COMPRASGOV_NAO_LISTA_MAIS')
        );
      END IF;
      DELETE FROM public.arp_item_empenhos WHERE id = v_removed.id;
      v_removidos := v_removidos + 1;
    ELSE
      UPDATE public.arp_item_empenhos
         SET consta_saldo_oficial = false, updated_at = NOW()
       WHERE id = v_removed.id;
      v_fora := v_fora + 1;
    END IF;
  END LOOP;

  SELECT GREATEST(
           p_quantidade_empenhada - COALESCE(SUM(quantidade_consumida) FILTER (WHERE consta_saldo_oficial), 0),
           0
         )
    INTO v_sem_identificacao
    FROM public.arp_item_empenhos
   WHERE item_key = v_item_key;

  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'quantidade_empenhada', p_quantidade_empenhada,
    'linhas', v_linhas,
    'removidos', v_removidos,
    'fora_do_saldo_oficial', v_fora,
    'quantidade_sem_identificacao', v_sem_identificacao,
    'timestamp', NOW()
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. attribute_unidentified_quantity_atomic: o gestor atribui parte do "sem identificação" a um empenho
-- ------------------------------------------------------------------------------
-- O empenho já deve estar vinculado ao item (por exemplo, vindo do contrato, fora do saldo oficial).
-- A quantidade atribuída não pode passar do que o saldo oficial ainda não identificou.
CREATE OR REPLACE FUNCTION public.attribute_unidentified_quantity_atomic(
  p_item_key VARCHAR,
  p_empenho_id UUID,
  p_quantidade NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_key VARCHAR(100) := TRIM(COALESCE(p_item_key, ''));
  v_existing public.arp_item_empenhos%ROWTYPE;
  v_oficial NUMERIC(18, 4);
  v_identificado NUMERIC(18, 4);
  v_restante NUMERIC(18, 4);
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
    RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item inválida (formato esperado: 00037/2026-200331-00001). Valor: "%"', v_item_key
      USING ERRCODE = '22023';
  END IF;

  IF p_empenho_id IS NULL OR p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: Informe o empenho e uma quantidade maior que zero.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sync_item_oficial:' || v_item_key));

  SELECT quantidade_empenhada INTO v_oficial
    FROM public.arp_item_saldo_oficial WHERE item_key = v_item_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALDO_OFICIAL_NOT_SYNCED: O saldo oficial deste item ainda não foi sincronizado.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
    FROM public.arp_item_empenhos
   WHERE item_key = v_item_key AND empenho_id = p_empenho_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Este empenho não está vinculado ao item.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_existing.consta_saldo_oficial AND v_existing.fonte_quantidade = 'API' THEN
    RAISE EXCEPTION 'ALREADY_IDENTIFIED: Este empenho já consta do saldo oficial com quantidade da API.'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(quantidade_consumida), 0) INTO v_identificado
    FROM public.arp_item_empenhos
   WHERE item_key = v_item_key AND consta_saldo_oficial AND empenho_id <> p_empenho_id;

  v_restante := GREATEST(v_oficial - v_identificado, 0);
  IF p_quantidade > v_restante THEN
    RAISE EXCEPTION 'EXCEEDS_UNIDENTIFIED: A quantidade (%) excede a parte do saldo oficial ainda sem identificação (%).',
      p_quantidade, v_restante
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.arp_item_empenhos
     SET quantidade_consumida = p_quantidade,
         fonte_quantidade = 'USUARIO',
         consta_saldo_oficial = true,
         tipo_consumo = 'AJUSTE_MANUAL',
         quantidade_sugerida = NULL,
         confirmado_por = auth.uid(),
         confirmado_em = NOW(),
         updated_at = NOW()
   WHERE id = v_existing.id;

  INSERT INTO public.empenho_eventos_historico (
    empenho_id, item_key, contract_key, data_evento, tipo_evento, delta_quantidade, metadados
  ) VALUES (
    p_empenho_id, v_item_key, v_existing.contract_key, CURRENT_DATE, 'AJUSTE_AUDITORIA',
    p_quantidade - COALESCE(v_existing.quantidade_consumida, 0),
    jsonb_build_object('evento', 'QUANTIDADE_ATRIBUIDA_USUARIO', 'quantidade', p_quantidade)
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'empenho_id', p_empenho_id,
    'quantidade_consumida', p_quantidade,
    'quantidade_sem_identificacao_restante', v_restante - p_quantidade,
    'timestamp', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_item_contract_empenhos_atomic(VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_item_official_saldo_atomic(VARCHAR, NUMERIC, NUMERIC, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attribute_unidentified_quantity_atomic(VARCHAR, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_item_contract_empenhos_atomic(VARCHAR, VARCHAR, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_item_official_saldo_atomic(VARCHAR, NUMERIC, NUMERIC, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attribute_unidentified_quantity_atomic(VARCHAR, UUID, NUMERIC) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. View de saldo: usa o total oficial quando ele foi sincronizado
-- ------------------------------------------------------------------------------
-- Sem total oficial, cai na soma das linhas (comportamento anterior) e saldo_oficial_sincronizado = false.
-- Colunas novas ao final (CREATE OR REPLACE VIEW só aceita acréscimo no fim).
CREATE OR REPLACE VIEW public.v_arp_item_saldo_detalhado
WITH (security_invoker = true)
AS
WITH empenhos_agg AS (
  SELECT
    item_key,
    COUNT(DISTINCT empenho_id) AS total_empenhos_vinculados,
    COALESCE(SUM(quantidade_consumida), 0) AS total_quantidade_linhas,
    COALESCE(SUM(quantidade_consumida) FILTER (WHERE consta_saldo_oficial), 0) AS total_quantidade_identificada,
    MAX(created_at) AS ultimo_empenho_vinculado_em,
    COUNT(*) FILTER (WHERE quantidade_consumida IS NULL) AS total_empenhos_pendentes,
    COALESCE(SUM(quantidade_consumida) FILTER (WHERE fonte_quantidade = 'USUARIO'), 0) AS quantidade_informada_usuario,
    COUNT(*) FILTER (WHERE NOT consta_saldo_oficial) AS total_empenhos_fora_saldo_oficial
  FROM public.arp_item_empenhos
  GROUP BY item_key
),
itens_canonical AS (
  SELECT
    i.id AS item_ata_id,
    i.ata_id,
    a.numero_ata,
    a.codigo_uasg,
    i.numero_item,
    (a.numero_ata || '-' || a.codigo_uasg || '-' || lpad(i.numero_item::text, 5, '0')) AS canonical_item_key,
    i.descricao_item,
    i.fornecedor_razao_social,
    i.fornecedor_cnpj_cpf,
    COALESCE(i.quantidade_homologada, 0) AS quantidade_homologada,
    i.valor_unitario
  FROM public.itens_ata i
  JOIN public.atas_registro_preco a ON a.id = i.ata_id
),
base AS (
  SELECT
    COALESCE(ic.canonical_item_key, ea.item_key, so.item_key) AS item_key,
    ic.item_ata_id,
    ic.ata_id,
    COALESCE(ic.numero_ata, split_part(COALESCE(ea.item_key, so.item_key), '-', 1)) AS numero_ata,
    COALESCE(ic.codigo_uasg, split_part(COALESCE(ea.item_key, so.item_key), '-', 2)) AS codigo_uasg,
    COALESCE(ic.numero_item, split_part(COALESCE(ea.item_key, so.item_key), '-', 3)) AS numero_item,
    ic.descricao_item,
    ic.fornecedor_razao_social,
    ic.fornecedor_cnpj_cpf,
    ic.valor_unitario,
    COALESCE(ic.quantidade_homologada, 0) AS quantidade_homologada,
    COALESCE(so.quantidade_empenhada, ea.total_quantidade_linhas, 0) AS quantidade_consumida,
    COALESCE(ea.total_empenhos_vinculados, 0) AS total_empenhos_vinculados,
    ea.ultimo_empenho_vinculado_em,
    COALESCE(ea.total_empenhos_pendentes, 0) AS total_empenhos_pendentes,
    COALESCE(ea.quantidade_informada_usuario, 0) AS quantidade_informada_usuario,
    (so.item_key IS NOT NULL) AS saldo_oficial_sincronizado,
    so.lido_em AS saldo_oficial_lido_em,
    CASE
      WHEN so.item_key IS NOT NULL THEN GREATEST(so.quantidade_empenhada - COALESCE(ea.total_quantidade_identificada, 0), 0)
      ELSE 0
    END AS quantidade_sem_identificacao,
    COALESCE(ea.total_empenhos_fora_saldo_oficial, 0) AS total_empenhos_fora_saldo_oficial
  FROM itens_canonical ic
  FULL OUTER JOIN empenhos_agg ea ON ea.item_key = ic.canonical_item_key
  FULL OUTER JOIN public.arp_item_saldo_oficial so
    ON so.item_key = COALESCE(ic.canonical_item_key, ea.item_key)
)
SELECT
  item_key,
  item_ata_id,
  ata_id,
  numero_ata,
  codigo_uasg,
  numero_item,
  descricao_item,
  fornecedor_razao_social,
  fornecedor_cnpj_cpf,
  valor_unitario,
  quantidade_homologada,
  quantidade_consumida,
  (quantidade_homologada - quantidade_consumida) AS saldo_disponivel,
  CASE
    WHEN quantidade_homologada > 0 THEN ROUND((quantidade_consumida / quantidade_homologada) * 100, 2)
    ELSE 0
  END AS percentual_consumido,
  total_empenhos_vinculados,
  ultimo_empenho_vinculado_em,
  total_empenhos_pendentes,
  quantidade_informada_usuario,
  saldo_oficial_sincronizado,
  saldo_oficial_lido_em,
  quantidade_sem_identificacao,
  total_empenhos_fora_saldo_oficial
FROM base;

COMMENT ON VIEW public.v_arp_item_saldo_detalhado IS
  'Read Model do saldo físico do item da Ata. Consumo = total empenhado oficial do Compras.gov (arp_item_saldo_oficial) quando sincronizado; senão, a soma das linhas de arp_item_empenhos. Empenhos que só o contrato conhece (fora do saldo oficial) e quantidades pendentes não consomem saldo oficial.';
