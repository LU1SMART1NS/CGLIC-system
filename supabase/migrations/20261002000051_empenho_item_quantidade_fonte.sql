-- ==============================================================================
-- MIGRATION 51: EMPENHO DO ITEM VEM DO CONTRATO VINCULADO, COM FONTE DA QUANTIDADE
-- Versão: 20261002000051_empenho_item_quantidade_fonte.sql
--
-- Cadeia: Item da Ata <- Contrato (vínculo confirmado) <- Empenho.
--
-- Os empenhos de um item são os dos contratos vinculados a ele, e a quantidade física
-- de cada um vem da minuta oficial (API). Quando a API não traz a linha do item, o
-- empenho fica "pendente de quantidade" (quantidade NULL, não consome saldo) até o
-- gestor confirmar uma quantidade (fonte USUARIO). Se a API passar a informar a
-- quantidade, ela substitui a do usuário.
--
-- Esta migration não remove nenhuma tabela. A remoção de empenhos_manuais,
-- empenho_manual_quantidades e contrato_empenho_links fica para uma migration à parte.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. arp_item_empenhos: quantidade opcional + fonte + contrato de origem
-- ------------------------------------------------------------------------------
ALTER TABLE public.arp_item_empenhos
  ALTER COLUMN quantidade_consumida DROP NOT NULL;

ALTER TABLE public.arp_item_empenhos
  ADD COLUMN IF NOT EXISTS fonte_quantidade VARCHAR(10),
  ADD COLUMN IF NOT EXISTS quantidade_sugerida NUMERIC(18, 4) CHECK (quantidade_sugerida IS NULL OR quantidade_sugerida >= 0),
  ADD COLUMN IF NOT EXISTS contract_key VARCHAR(150),
  ADD COLUMN IF NOT EXISTS confirmado_por UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMPTZ;

-- Linhas já gravadas: quantidade digitada (AJUSTE_MANUAL) = USUARIO; as demais vieram da sincronização com a API.
UPDATE public.arp_item_empenhos
   SET fonte_quantidade = CASE WHEN tipo_consumo = 'AJUSTE_MANUAL' THEN 'USUARIO' ELSE 'API' END
 WHERE quantidade_consumida IS NOT NULL AND fonte_quantidade IS NULL;

ALTER TABLE public.arp_item_empenhos
  DROP CONSTRAINT IF EXISTS chk_arp_item_empenhos_fonte_quantidade;
ALTER TABLE public.arp_item_empenhos
  ADD CONSTRAINT chk_arp_item_empenhos_fonte_quantidade
  CHECK (
    fonte_quantidade IS NULL OR fonte_quantidade IN ('API', 'USUARIO')
  );

-- Pendente (sem quantidade) <=> sem fonte.
ALTER TABLE public.arp_item_empenhos
  DROP CONSTRAINT IF EXISTS chk_arp_item_empenhos_pendencia;
ALTER TABLE public.arp_item_empenhos
  ADD CONSTRAINT chk_arp_item_empenhos_pendencia
  CHECK ((quantidade_consumida IS NULL) = (fonte_quantidade IS NULL));

-- Escritores anteriores (link_empenho_to_item_atomic) gravam a quantidade sem informar a fonte:
-- o gatilho a preenche, para não violar a regra acima.
CREATE OR REPLACE FUNCTION public.trg_arp_item_empenhos_fonte_quantidade()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.quantidade_consumida IS NOT NULL AND NEW.fonte_quantidade IS NULL THEN
    NEW.fonte_quantidade := CASE WHEN NEW.tipo_consumo = 'AJUSTE_MANUAL' THEN 'USUARIO' ELSE 'API' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_arp_item_empenhos_fonte ON public.arp_item_empenhos;
CREATE TRIGGER trg_arp_item_empenhos_fonte
  BEFORE INSERT OR UPDATE ON public.arp_item_empenhos
  FOR EACH ROW EXECUTE FUNCTION public.trg_arp_item_empenhos_fonte_quantidade();

REVOKE EXECUTE ON FUNCTION public.trg_arp_item_empenhos_fonte_quantidade() FROM PUBLIC, anon;

CREATE INDEX IF NOT EXISTS idx_arp_item_empenhos_item_contract
  ON public.arp_item_empenhos(item_key, contract_key);

COMMENT ON COLUMN public.arp_item_empenhos.quantidade_consumida IS
  'Quantidade física do item consumida pelo empenho. NULL = pendente de quantidade (não consome saldo).';
COMMENT ON COLUMN public.arp_item_empenhos.fonte_quantidade IS
  'API = minuta oficial; USUARIO = confirmada pelo gestor quando a API não traz a linha do item. A API sempre prevalece.';
COMMENT ON COLUMN public.arp_item_empenhos.quantidade_sugerida IS
  'Estimativa (valor do empenho / preço unitário) oferecida ao gestor; só vale como quantidade depois de confirmada.';
COMMENT ON COLUMN public.arp_item_empenhos.contract_key IS
  'Contrato vinculado ao item que trouxe este empenho; a sincronização do par (item, contrato) remove o que a API deixou de listar.';

-- ------------------------------------------------------------------------------
-- 2. RPC: sync_item_contract_empenhos_atomic
-- ------------------------------------------------------------------------------
-- Substitui, para o par (item, contrato), o conjunto de empenhos do item.
-- p_empenhos: [{ "empenho_id": uuid, "quantidade": number|null,
--                "quantidade_sugerida": number|null, "numero_item_minuta": text|null }, ...]
--   quantidade informada (>= 0) = vinda da minuta (fonte API) e sobrescreve a do usuário;
--   quantidade nula = a API não trouxe a linha do item: mantém a confirmada pelo usuário,
--   se houver, ou deixa o empenho pendente.
-- Empenhos do par que não estão na lista são removidos (a API deixou de listá-los).
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
      INSERT INTO public.arp_item_empenhos (
        item_key, empenho_id, quantidade_consumida, fonte_quantidade, quantidade_sugerida,
        tipo_consumo, numero_item_minuta, contract_key
      ) VALUES (
        v_item_key, v_empenho_id, v_qtd,
        CASE WHEN v_qtd IS NULL THEN NULL ELSE 'API' END,
        CASE WHEN v_qtd IS NULL THEN v_sugerida ELSE NULL END,
        'ORDINARIO', v_minuta, v_contract_key
      );

      IF v_qtd IS NOT NULL THEN
        INSERT INTO public.empenho_eventos_historico (
          empenho_id, item_key, contract_key, data_evento, tipo_evento, delta_quantidade, metadados
        ) VALUES (
          v_empenho_id, v_item_key, v_contract_key, CURRENT_DATE, 'EMISSAO_INICIAL', v_qtd,
          jsonb_build_object('evento', 'VINCULADO_ITEM', 'fonte_quantidade', 'API')
        );
      END IF;

    ELSIF v_qtd IS NOT NULL THEN
      -- A API trouxe a quantidade: ela prevalece sobre a digitada pelo usuário.
      IF v_existing.quantidade_consumida IS DISTINCT FROM v_qtd THEN
        INSERT INTO public.empenho_eventos_historico (
          empenho_id, item_key, contract_key, data_evento, tipo_evento, delta_quantidade, metadados
        ) VALUES (
          v_empenho_id, v_item_key, v_contract_key, CURRENT_DATE,
          CASE WHEN v_qtd >= COALESCE(v_existing.quantidade_consumida, 0) THEN 'REFORCO' ELSE 'ANULACAO_PARCIAL' END,
          v_qtd - COALESCE(v_existing.quantidade_consumida, 0),
          jsonb_build_object(
            'evento', 'VINCULADO_ITEM',
            'fonte_quantidade', 'API',
            'substituiu_fonte', v_existing.fonte_quantidade
          )
        );
      END IF;

      UPDATE public.arp_item_empenhos
         SET quantidade_consumida = v_qtd,
             fonte_quantidade = 'API',
             quantidade_sugerida = NULL,
             tipo_consumo = CASE WHEN tipo_consumo = 'AJUSTE_MANUAL' THEN 'ORDINARIO' ELSE tipo_consumo END,
             numero_item_minuta = COALESCE(v_minuta, numero_item_minuta),
             contract_key = COALESCE(contract_key, v_contract_key),
             confirmado_por = NULL,
             confirmado_em = NULL,
             updated_at = NOW()
       WHERE id = v_existing.id;

    ELSE
      -- Sem quantidade da API: preserva a confirmada pelo usuário; se pendente, só atualiza a sugestão.
      UPDATE public.arp_item_empenhos
         SET quantidade_sugerida = CASE WHEN quantidade_consumida IS NULL THEN v_sugerida ELSE quantidade_sugerida END,
             numero_item_minuta = COALESCE(v_minuta, numero_item_minuta),
             contract_key = COALESCE(contract_key, v_contract_key),
             updated_at = NOW()
       WHERE id = v_existing.id;
    END IF;

    v_upserted := v_upserted + 1;
  END LOOP;

  -- Empenhos do par (item, contrato) que a API deixou de listar
  FOR v_removed IN
    SELECT id, empenho_id, quantidade_consumida
      FROM public.arp_item_empenhos
     WHERE item_key = v_item_key
       AND contract_key = v_contract_key
       AND NOT (empenho_id = ANY (v_seen))
  LOOP
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
-- 3. RPC: confirm_empenho_item_quantity_atomic
-- ------------------------------------------------------------------------------
-- O gestor confirma (ou limpa, com NULL) a quantidade de um empenho que a API não trouxe.
-- Não altera quantidade que veio da API.
CREATE OR REPLACE FUNCTION public.confirm_empenho_item_quantity_atomic(
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
BEGIN
  IF NOT (public.has_role('gestor') OR public.has_role('admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a gestores e administradores do SaldoARP.'
      USING ERRCODE = '42501';
  END IF;

  IF v_item_key = '' OR NOT (v_item_key ~ '^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$') THEN
    RAISE EXCEPTION 'INVALID_ITEM_KEY: Chave de item inválida (formato esperado: 00037/2026-200331-00001). Valor: "%"', v_item_key
      USING ERRCODE = '22023';
  END IF;

  IF p_empenho_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_EMPENHO_ID: O identificador do empenho é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  IF p_quantidade IS NOT NULL AND p_quantidade <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade deve ser maior que zero (ou nula para voltar a pendente).'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('confirm_item_empenho:' || v_item_key || ':' || p_empenho_id::TEXT));

  SELECT * INTO v_existing
    FROM public.arp_item_empenhos
   WHERE item_key = v_item_key AND empenho_id = p_empenho_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Este empenho não está vinculado ao item (vincule o contrato dele ao item primeiro).'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_existing.fonte_quantidade = 'API' THEN
    RAISE EXCEPTION 'QUANTITY_FROM_API: A quantidade deste empenho vem da API oficial e não pode ser alterada.'
      USING ERRCODE = '23514';
  END IF;

  IF p_quantidade IS NULL THEN
    UPDATE public.arp_item_empenhos
       SET quantidade_consumida = NULL, fonte_quantidade = NULL,
           tipo_consumo = 'ORDINARIO', confirmado_por = NULL, confirmado_em = NULL, updated_at = NOW()
     WHERE id = v_existing.id;
  ELSE
    UPDATE public.arp_item_empenhos
       SET quantidade_consumida = p_quantidade, fonte_quantidade = 'USUARIO',
           tipo_consumo = 'AJUSTE_MANUAL', confirmado_por = auth.uid(), confirmado_em = NOW(), updated_at = NOW()
     WHERE id = v_existing.id;
  END IF;

  INSERT INTO public.empenho_eventos_historico (
    empenho_id, item_key, contract_key, data_evento, tipo_evento, delta_quantidade, metadados
  ) VALUES (
    p_empenho_id, v_item_key, v_existing.contract_key, CURRENT_DATE, 'AJUSTE_AUDITORIA',
    COALESCE(p_quantidade, 0) - COALESCE(v_existing.quantidade_consumida, 0),
    jsonb_build_object('evento', 'QUANTIDADE_CONFIRMADA_USUARIO', 'quantidade', p_quantidade)
  );

  RETURN jsonb_build_object(
    'success', true,
    'item_key', v_item_key,
    'empenho_id', p_empenho_id,
    'quantidade_consumida', p_quantidade,
    'fonte_quantidade', CASE WHEN p_quantidade IS NULL THEN NULL ELSE 'USUARIO' END,
    'timestamp', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_item_contract_empenhos_atomic(VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_empenho_item_quantity_atomic(VARCHAR, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_item_contract_empenhos_atomic(VARCHAR, VARCHAR, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_empenho_item_quantity_atomic(VARCHAR, UUID, NUMERIC) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. View de saldo: acrescenta pendências e quantidade informada pelo usuário
-- ------------------------------------------------------------------------------
-- Colunas novas ao final (CREATE OR REPLACE VIEW só aceita acréscimo no fim).
-- Empenhos pendentes têm quantidade NULL e não entram em SUM, portanto não consomem saldo.
CREATE OR REPLACE VIEW public.v_arp_item_saldo_detalhado
WITH (security_invoker = true)
AS
WITH empenhos_agg AS (
  SELECT
    item_key,
    COUNT(DISTINCT empenho_id) AS total_empenhos_vinculados,
    COALESCE(SUM(quantidade_consumida), 0) AS total_quantidade_consumida,
    MAX(created_at) AS ultimo_empenho_vinculado_em,
    COUNT(*) FILTER (WHERE quantidade_consumida IS NULL) AS total_empenhos_pendentes,
    COALESCE(SUM(quantidade_consumida) FILTER (WHERE fonte_quantidade = 'USUARIO'), 0) AS quantidade_informada_usuario
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
)
SELECT
  COALESCE(ic.canonical_item_key, ea.item_key) AS item_key,
  ic.item_ata_id,
  ic.ata_id,
  COALESCE(ic.numero_ata, split_part(ea.item_key, '-', 1)) AS numero_ata,
  COALESCE(ic.codigo_uasg, split_part(ea.item_key, '-', 2)) AS codigo_uasg,
  COALESCE(ic.numero_item, split_part(ea.item_key, '-', 3)) AS numero_item,
  ic.descricao_item,
  ic.fornecedor_razao_social,
  ic.fornecedor_cnpj_cpf,
  ic.valor_unitario,
  COALESCE(ic.quantidade_homologada, 0) AS quantidade_homologada,
  COALESCE(ea.total_quantidade_consumida, 0) AS quantidade_consumida,
  (COALESCE(ic.quantidade_homologada, 0) - COALESCE(ea.total_quantidade_consumida, 0)) AS saldo_disponivel,
  CASE
    WHEN COALESCE(ic.quantidade_homologada, 0) > 0 THEN
      ROUND((COALESCE(ea.total_quantidade_consumida, 0) / ic.quantidade_homologada) * 100, 2)
    ELSE 0
  END AS percentual_consumido,
  COALESCE(ea.total_empenhos_vinculados, 0) AS total_empenhos_vinculados,
  ea.ultimo_empenho_vinculado_em,
  COALESCE(ea.total_empenhos_pendentes, 0) AS total_empenhos_pendentes,
  COALESCE(ea.quantidade_informada_usuario, 0) AS quantidade_informada_usuario
FROM itens_canonical ic
FULL OUTER JOIN empenhos_agg ea ON ea.item_key = ic.canonical_item_key;

COMMENT ON VIEW public.v_arp_item_saldo_detalhado IS
  'Read Model soberano do saldo físico-quantitativo de itens da Ata. Saldo = QuantidadeHomologada - SUM(Consumida). Empenhos pendentes de quantidade não consomem saldo; total_empenhos_pendentes e quantidade_informada_usuario sinalizam a incerteza.';
