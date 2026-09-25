-- ==============================================================================
-- MIGRATION 29: FASE 2B-6 — REFORÇO DEFENSIVO DE
-- merge_internal_department_allocations_atomic (origem deve ser legada)
-- ==============================================================================
-- Escopo estrito: SOMENTE merge_internal_department_allocations_atomic.
-- Nenhuma outra RPC, role, permission, scope, RLS ou frontend é tocado.
--
-- DECISÃO FUNCIONAL JÁ TOMADA (Fase 2B-5, investigação de uso real): esta RPC
-- é uma ferramenta de higienização/saneamento de nomes legados ou incorretos
-- em arp_allocations.unit_name — nunca uma ferramenta de transferência de
-- saldo entre departamentos ativos. Evidência: a UI (InternalUnitsModal.tsx,
-- função detectLegacyAllocations) só oferece como origem nomes que NÃO
-- correspondem a nenhuma sigla atualmente cadastrada como departamento ativo;
-- o teste unitário existente (useMergeDepartment.test.ts) usa o exemplo
-- 'DFNSPdddd' -> 'DFNSP' (correção de digitação); o comentário original da
-- RPC fala em "nomes legados ou incorretos" e preservação estrita de saldos.
--
-- Esta migration transforma essa regra — até agora só respeitada pelo
-- frontend — em uma invariante do próprio banco:
--
--   NOT EXISTS (
--     SELECT 1 FROM public.internal_departments
--      WHERE sigla = p_old_name AND ativo = TRUE
--   )
--
-- Se p_old_name ainda corresponder a um departamento ativo, a chamada é
-- negada — independentemente de permissão/escopo, porque a operação não é
-- ofertada para esse uso, não porque o usuário não teria autoridade. Não é,
-- portanto, um erro de autorização (não usa ERRCODE 42501): é uma validação
-- de negócio sobre o VALOR de p_old_name, no mesmo estilo já usado nesta
-- função para o destino (TARGET_DEPARTMENT_INACTIVE, ERRCODE 22023).
--
-- A regra de autorização em si NÃO muda: continua
-- has_permission('allocations.manage') + has_scope(UNIT/ARP/GLOBAL) sobre a
-- ORIGEM, sem exigir nenhum escopo sobre o destino (Fase 2B-4, mantida).
--
-- Todo o restante da função (validação do destino, no-op quando origem =
-- destino, verificação de escopo por ATA, atualização atômica, retorno) é
-- idêntico a 20260925000028_migrate_merge_department_allocations_to_permission_scope.sql,
-- exceto a nova validação inserida logo após a checagem de campos vazios.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.merge_internal_department_allocations_atomic(
  p_old_name VARCHAR(255),
  p_target_sigla VARCHAR(30)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_name VARCHAR(255);
  v_target_sigla VARCHAR(30);
  v_target_dep RECORD;
  v_rows_updated INTEGER := 0;
  v_has_unit_or_global BOOLEAN;
  v_item_key_rec RECORD;
  v_key_parts TEXT[];
  v_row_ata_id UUID;
  v_any_row_found BOOLEAN := FALSE;
BEGIN
  -- --------------------------------------------------------------------------
  -- PASSO 1: AUTORIZAÇÃO — permission (inalterado desde a Fase 2B-4)
  -- --------------------------------------------------------------------------
  IF NOT public.has_permission('allocations.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Acesso restrito a usuários com a permissão allocations.manage.'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2: NORMALIZAÇÃO E VALIDAÇÕES
  -- --------------------------------------------------------------------------
  v_old_name := TRIM(COALESCE(p_old_name, ''));
  v_target_sigla := TRIM(UPPER(COALESCE(p_target_sigla, '')));

  IF v_old_name = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: O nome de origem da unidade (p_old_name) é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  IF v_target_sigla = '' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: A sigla de destino (p_target_sigla) é obrigatória.'
      USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2a (NOVO — Fase 2B-6): a origem precisa ser um nome legado/órfão,
  -- nunca a sigla de um departamento atualmente ATIVO. Esta função existe
  -- para saneamento, não para mover saldo entre duas unidades ativas.
  -- --------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM public.internal_departments
     WHERE sigla = v_old_name AND ativo = TRUE
  ) THEN
    RAISE EXCEPTION 'ORIGIN_IS_ACTIVE_DEPARTMENT: A unidade de origem "%" corresponde a um departamento ativo. Esta função é exclusiva para saneamento de nomes legados/incorretos, não para mover alocações entre departamentos ativos.', v_old_name
      USING ERRCODE = '22023';
  END IF;

  -- Verifica se o departamento de destino existe
  SELECT * INTO v_target_dep
  FROM public.internal_departments
  WHERE sigla = v_target_sigla;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_DEPARTMENT_NOT_FOUND: Departamento de destino com sigla "%" não encontrado.', v_target_sigla
      USING ERRCODE = 'P0002';
  END IF;

  -- Verifica se o departamento de destino está ativo
  IF NOT v_target_dep.ativo THEN
    RAISE EXCEPTION 'TARGET_DEPARTMENT_INACTIVE: Departamento de destino com sigla "%" está inativo.', v_target_sigla
      USING ERRCODE = '22023';
  END IF;

  -- Se origem e destino forem idênticos, nada a fazer
  IF v_old_name = v_target_sigla THEN
    RETURN jsonb_build_object(
      'success', true,
      'old_name', v_old_name,
      'target_sigla', v_target_sigla,
      'rows_updated', 0,
      'message', 'Origem e destino são idênticos. Nenhuma alteração realizada.'
    );
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 2b: VERIFICAÇÃO DE ESCOPO SOBRE AS ALOCAÇÕES AFETADAS (Fase 2B-4,
  -- inalterada) — GLOBAL/UNIT sobre a origem autoriza tudo; caso contrário,
  -- exige ARP para cada ATA distinta das linhas que serão afetadas.
  -- --------------------------------------------------------------------------
  v_has_unit_or_global := public.has_scope('allocations', 'UNIT', v_old_name);

  IF NOT v_has_unit_or_global THEN
    FOR v_item_key_rec IN
      SELECT DISTINCT item_key FROM public.arp_allocations WHERE unit_name = v_old_name
    LOOP
      v_any_row_found := TRUE;
      v_row_ata_id := NULL;

      v_key_parts := regexp_match(v_item_key_rec.item_key, '^([0-9]{5})/([0-9]{4})-([0-9]{6})-([0-9]{5})$');
      IF v_key_parts IS NOT NULL THEN
        SELECT ia.ata_id INTO v_row_ata_id
          FROM public.atas_registro_preco arp
          JOIN public.itens_ata ia ON ia.ata_id = arp.id AND ia.numero_item = v_key_parts[4]
         WHERE arp.numero_ata = v_key_parts[1]
           AND arp.codigo_uasg = v_key_parts[3];
      END IF;

      IF NOT public.has_scope('allocations', 'ARP', v_row_ata_id::TEXT) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Usuário sem escopo de alocação sobre a unidade "%" (item "%").', v_old_name, v_item_key_rec.item_key
          USING ERRCODE = '42501';
      END IF;
    END LOOP;

    IF NOT v_any_row_found THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Usuário sem escopo de alocação sobre a unidade "%".', v_old_name
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASSO 3: ATUALIZAÇÃO ATÔMICA DAS ALOCAÇÕES
  -- --------------------------------------------------------------------------
  UPDATE public.arp_allocations
  SET
    unit_name = v_target_sigla,
    updated_at = NOW()
  WHERE unit_name = v_old_name;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- --------------------------------------------------------------------------
  -- PASSO 4: RETORNO DETERMINÍSTICO
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'old_name', v_old_name,
    'target_sigla', v_target_sigla,
    'rows_updated', v_rows_updated,
    'timestamp', NOW()
  );
END;
$$;

-- GRANTs: já existentes desde 20260921000011_revoke_direct_write_sei_departments.sql,
-- preservados automaticamente pelo CREATE OR REPLACE (assinatura inalterada).
