-- ==============================================================================
-- MIGRATION 28: FASE 2B-4 — MIGRAÇÃO DE
-- merge_internal_department_allocations_atomic PARA has_permission()/has_scope()
-- ==============================================================================
-- Escopo estrito: SOMENTE merge_internal_department_allocations_atomic.
-- save_allocations_atomic, save_empenho_links_atomic,
-- save_internal_department_atomic, delete_internal_department_atomic,
-- contratos, financeiro e SEI não são tocados.
--
-- ==============================================================================
-- AUDITORIA PRÉVIA (antes de qualquer alteração de negócio) — comportamento
-- ATUAL de merge_internal_department_allocations_atomic
-- (20260918000009_department_authority.sql):
-- ==============================================================================
-- 1. Recebe: p_old_name (nome de origem) e p_target_sigla (sigla de destino,
--    DEVE existir e estar ativa). CORREÇÃO DE AUDITORIA: ao contrário do que
--    o comentário original da RPC sugere ("saneamento de nomes legados"),
--    p_old_name NÃO é texto livre arbitrário — arp_allocations.unit_name tem
--    FK para internal_departments(sigla) (20260917000001_canonical_schema.sql,
--    linha 82), então só pode ter havido alocações persistidas com um
--    unit_name que já foi, em algum momento, uma sigla real cadastrada (ainda
--    que hoje inativa/duplicada). Ou seja: p_old_name deve corresponder a um
--    departamento (ativo ou não) que já existiu, tipicamente uma sigla
--    duplicada/errada que se quer consolidar em p_target_sigla antes de
--    desativá-la via delete_internal_department_atomic.
-- 2. Altera: TODAS as linhas de arp_allocations cujo unit_name = p_old_name
--    (exato, sem normalização de caixa — v_old_name só recebe TRIM, nunca
--    UPPER, ao contrário de v_target_sigla). Um único UPDATE em massa.
-- 3. unit_name envolvido: é o PRÓPRIO v_old_name (fixo para a chamada
--    inteira — o WHERE só filtra por esse valor).
-- 4. ata_id envolvida: NÃO é única por chamada. Diferente de
--    save_allocations_atomic/save_empenho_links_atomic (que operam sobre um
--    único item_key), aqui as linhas afetadas por um mesmo v_old_name podem
--    pertencer a item_keys — e portanto ATAs — DIFERENTES entre si. Este é
--    o achado mais importante da auditoria e molda toda a autorização abaixo.
-- 5. Múltiplas alocações são afetadas pela mesma chamada: SIM, potencialmente
--    de itens/atas diferentes (ver item 4).
-- 6. Existe alteração fora do conjunto explicitamente informado: SIM — a RPC
--    não recebe uma lista de allocation_id; ela recebe só um NOME e altera
--    TUDO que casar com esse nome no momento da execução (`WHERE unit_name =
--    p_old_name`), determinado em tempo de execução, não pelo payload. A
--    autorização, portanto, não pode inspecionar "linhas do payload" (não
--    existem) — precisa inspecionar as linhas que SERÃO afetadas pela
--    condição, resolvidas via SELECT antes do UPDATE.
-- 7. Concorrência/atomicidade atuais: NÃO há optimistic locking nem
--    versionamento aqui (diferente de item_allocation_state usado por
--    save_allocations_atomic) — é um único UPDATE em massa, atômico pela
--    própria natureza do statement SQL dentro da função. Não introduzido
--    nem alterado nesta migration.
-- 8. A correção de arp_allocations.updated_at (Fase 0.1) já é usada por esta
--    RPC (`updated_at = NOW()` na linha do UPDATE) e já está coberta pelo
--    teste de regressão da Fase 0.1 (Casos 7/8) — não voltou a quebrar.
--
-- ==============================================================================
-- DECISÃO DE AUTORIZAÇÃO (decorrente da auditoria acima, sem inventar
-- semântica nova):
-- ==============================================================================
-- Permission: has_permission('allocations.manage') — domínio de Saldos, não
-- departments.manage (RPC administrativa de catálogo) nem financial.manage.
--
-- Escopo:
--   1) Se has_scope('allocations','UNIT', v_old_name) for TRUE (o que também
--      cobre GLOBAL, resolvido internamente por has_scope), a chamada inteira
--      é autorizada — independe de quantas atas as linhas afetadas cobrem,
--      porque a unidade de ORIGEM (o dado persistido que está sendo alterado)
--      já está integralmente coberta.
--   2) Caso contrário, é necessário ARP: para CADA item_key DISTINTO
--      encontrado em arp_allocations WHERE unit_name = v_old_name, resolve-se
--      a ata_id (mesma cadeia de 20260925000025/26: item_key -> itens_ata ->
--      atas_registro_preco) e exige-se has_scope('allocations','ARP', ata_id)
--      para TODAS elas, sem exceção. Se QUALQUER uma falhar — inclusive por
--      não haver nenhuma linha correspondente a v_old_name — a chamada
--      inteira é negada (fail-closed: ausência de prova nunca é tratada como
--      autorização implícita). Se um item_key não casar com o padrão
--      canônico (dado legado malformado), a ata_id resolvida fica NULL, e
--      has_scope('allocations','ARP', NULL) nunca combina com nenhuma
--      atribuição — nega automaticamente, sem exceção especial de código
--      (nenhuma linha "escapa" da checagem por causa de um dado anômalo).
--
-- NOTA (limitação registrada, não corrigida nesta fase — fora do escopo
-- pedido): esta checagem autoriza com base na unidade/ATA de ORIGEM (o
-- estado persistido antes da alteração), não verifica separadamente o
-- escopo sobre p_target_sigla (o destino). Como a função já valida que
-- p_target_sigla precisa ser um departamento ativo existente, e a operação
-- é documentada como saneamento de nomes legados (não uma forma de mover
-- saldo entre departamentos genuinamente distintos), isso é consistente com
-- a auditoria acima — mas um usuário com escopo só sobre a origem poderia,
-- em tese, "renomear" suas alocações para um destino sobre o qual não tem
-- escopo algum. Não implementei uma checagem de escopo sobre o destino
-- porque não foi pedido e seria uma decisão de negócio nova, não apenas de
-- autorização — registro para avaliação futura.
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
  -- PASSO 1: AUTORIZAÇÃO — permission (Fase 2B-4: a checagem antiga baseada
  -- em roles foi substituída por has_permission('allocations.manage'); o
  -- escopo por unidade/ATA de origem é verificado no Passo 2b)
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
  -- PASSO 2b: VERIFICAÇÃO DE ESCOPO SOBRE AS ALOCAÇÕES AFETADAS (Fase 2B-4)
  -- --------------------------------------------------------------------------
  -- GLOBAL/UNIT sobre a unidade de ORIGEM autoriza tudo de uma vez —
  -- independe de quantas atas as linhas afetadas cobrem.
  v_has_unit_or_global := public.has_scope('allocations', 'UNIT', v_old_name);

  IF NOT v_has_unit_or_global THEN
    -- Sem GLOBAL/UNIT: cada ATA distinta entre as linhas que SERÃO afetadas
    -- precisa ter ARP concedido. Nenhuma linha escapa desta verificação,
    -- mesmo as com item_key malformado (resolvem para ata_id NULL, que
    -- nunca combina com nenhuma atribuição — nega por construção).
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

    -- Fail-closed: se não há UNIT/GLOBAL e nenhuma linha existe para
    -- comprovar ARP, não há prova alguma de autorização sobre esta unidade.
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

-- GRANTs: já existentes desde 20260921000011_revoke_direct_write_sei_departments.sql
-- (REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated).
-- CREATE OR REPLACE preserva os privilégios de uma função existente quando a
-- assinatura não muda (como é o caso aqui) — não é necessário nem foi feito
-- nenhum GRANT/REVOKE novo nesta migration. Verificado explicitamente pelo
-- teste desta fase (Caso 19/20).
