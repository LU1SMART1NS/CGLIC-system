-- ==============================================================================
-- MIGRATION 67: EXCLUSÃO DE USUÁRIO NÃO BLOQUEADA POR VÍNCULOS (FK -> SET NULL)
-- Contexto: excluir um convite pendente falhava com
--   "violates foreign key constraint contract_managers_gestor_user_id_fkey".
-- As colunas que apontam para auth.users (gestor_user_id, responsavel_user_id,
-- criado_por, ajustado_por_user_id etc.) são identidade opcional: o nome em texto
-- (gestor_nome etc.) permanece. Passam a ser ON DELETE SET NULL.
-- Só toca FKs de public.* -> auth.users com NO ACTION e coluna anulável.
-- ==============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname,
           c.conrelid::regclass AS tbl,
           a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.confdeltype = 'a'
      AND array_length(c.conkey, 1) = 1
      AND NOT a.attnotnull
      AND c.connamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',
      r.tbl, r.conname, r.col
    );
  END LOOP;
END $$;
