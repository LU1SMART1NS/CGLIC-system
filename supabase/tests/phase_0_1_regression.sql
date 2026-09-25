-- ==============================================================================
-- FASE 0.1 — TESTE DE REGRESSÃO DE BANCO (executar via psql contra o Postgres
-- local do `supabase start`, nunca contra o projeto remoto).
--
-- Cobre:
--   Caso 7: merge_internal_department_allocations_atomic() deve terminar com
--           sucesso para um chamador com role 'gestor'.
--   Caso 8: confirma que arp_allocations.updated_at existe e é gravável (ou
--           seja, que o bug confirmado na Fase 0 foi corrigido).
--
-- Tudo roda dentro de uma única transação com ROLLBACK no final — não deixa
-- nenhum dado de teste no banco.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase_0_1_regression.sql
-- ==============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- Caso 8 (parte estática): a coluna updated_at precisa existir em
-- arp_allocations antes de qualquer chamada à RPC de merge.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'arp_allocations'
       AND column_name = 'updated_at'
  ) THEN
    RAISE EXCEPTION 'FALHA (Caso 8): coluna arp_allocations.updated_at ainda não existe.';
  END IF;
  RAISE NOTICE 'OK (Caso 8): coluna arp_allocations.updated_at existe.';
END $$;

-- --------------------------------------------------------------------------
-- Fixture: usuário de teste com role 'gestor' e sessão simulada via JWT claim
-- --------------------------------------------------------------------------
DO $$
DECLARE
  v_test_user_id UUID := '11111111-1111-1111-1111-111111111111';
BEGIN
  -- Cria o usuário de teste em auth.users apenas se ainda não existir
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_test_user_id) THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_test_user_id, 'authenticated', 'authenticated',
      'phase01-regression-test@example.com', crypt('senha-teste-regressao', gen_salt('bf')),
      NOW(), '{"provider":"email","providers":["email"]}', '{}',
      NOW(), NOW(), '', ''
    );
  END IF;

  -- Concede role 'gestor' (mesma role usada por has_role('gestor') nas RPCs de saldo)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_test_user_id, 'gestor')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Simula a sessão autenticada desse usuário para auth.uid() dentro desta transação.
  -- Não trocamos a role de sessão (SET ROLE authenticated) porque isso ativaria RLS
  -- também para os INSERTs de fixture abaixo; as RPCs de escrita são SECURITY DEFINER
  -- e já reimplementam a própria checagem de autorização via has_role(), então validar
  -- via auth.uid() é suficiente e fiel ao comportamento real em produção.
  PERFORM set_config('request.jwt.claim.sub', v_test_user_id::text, true);
END $$;

-- --------------------------------------------------------------------------
-- Fixture: departamentos de origem/destino + uma alocação vinculada à origem
-- --------------------------------------------------------------------------
INSERT INTO public.internal_departments (id, sigla, nome_completo, ativo)
VALUES
  ('dep-test-old-phase01', 'DEPT_OLD_P01', 'Unidade de Teste Origem (Fase 0.1)', TRUE),
  ('dep-test-new-phase01', 'DEPT_NEW_P01', 'Unidade de Teste Destino (Fase 0.1)', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.arp_allocations (id, item_key, unit_name, allocated_qty, empenhada_qty)
VALUES ('alloc-test-phase01', '99999/2026-000001-00001', 'DEPT_OLD_P01', 10, 0)
ON CONFLICT (id) DO UPDATE SET unit_name = EXCLUDED.unit_name;

-- --------------------------------------------------------------------------
-- Caso 7: executar merge_internal_department_allocations_atomic e confirmar sucesso
-- --------------------------------------------------------------------------
DO $$
DECLARE
  v_result JSONB;
  v_updated_at_before TIMESTAMPTZ;
  v_updated_at_after TIMESTAMPTZ;
BEGIN
  SELECT updated_at INTO v_updated_at_before
    FROM public.arp_allocations WHERE id = 'alloc-test-phase01';

  -- Chamada real da RPC afetada pelo bug confirmado na Fase 0
  SELECT public.merge_internal_department_allocations_atomic('DEPT_OLD_P01', 'DEPT_NEW_P01')
    INTO v_result;

  IF (v_result->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA (Caso 7): merge_internal_department_allocations_atomic não retornou success=true. Resultado: %', v_result;
  END IF;

  IF (v_result->>'rows_updated')::int <> 1 THEN
    RAISE EXCEPTION 'FALHA (Caso 7): rows_updated esperado=1, obtido=%. Resultado: %', v_result->>'rows_updated', v_result;
  END IF;

  RAISE NOTICE 'OK (Caso 7): merge_internal_department_allocations_atomic executou com sucesso. Resultado: %', v_result;

  -- Confirma que a alocação foi de fato movida para a unidade de destino
  PERFORM 1 FROM public.arp_allocations
   WHERE id = 'alloc-test-phase01' AND unit_name = 'DEPT_NEW_P01';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHA (Caso 7): unit_name não foi atualizado para DEPT_NEW_P01.';
  END IF;

  -- Caso 8 (parte dinâmica): updated_at foi de fato gravado pela RPC, sem erro de coluna inexistente.
  -- Não comparamos "antes" vs. "depois" com desigualdade estrita porque NOW() em PL/pgSQL
  -- retorna o horário de início da TRANSAÇÃO (constante durante toda a transação), não do
  -- statement — ambos os valores são legitimamente iguais aqui. O que importa é que a RPC
  -- executou o UPDATE ... SET updated_at = NOW() sem lançar "column does not exist".
  SELECT updated_at INTO v_updated_at_after
    FROM public.arp_allocations WHERE id = 'alloc-test-phase01';

  IF v_updated_at_after IS NULL THEN
    RAISE EXCEPTION 'FALHA (Caso 8): updated_at está NULL após o merge.';
  END IF;

  RAISE NOTICE 'OK (Caso 8): arp_allocations.updated_at foi gravado corretamente pela RPC (antes=%, depois=%).', v_updated_at_before, v_updated_at_after;
END $$;

DO $$ BEGIN RAISE NOTICE '=== FASE 0.1 — TODOS OS TESTES DE BANCO PASSARAM ==='; END $$;

ROLLBACK;
