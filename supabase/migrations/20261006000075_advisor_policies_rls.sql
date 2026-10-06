-- Achados de performance do Supabase Advisor sobre policies de RLS. Nenhuma regra de acesso muda:
-- cada identidade (admin, gestor, outro usuário logado, anônimo) enxerga e escreve exatamente o que
-- já enxergava e escrevia. A equivalência foi conferida antes e depois, em transação revertida
-- (ver supabase/tests/policies_rls_equivalencia.sql).
--
-- 1) multiple_permissive_policies em atas_registro_preco e itens_ata
--    Cada tabela tem "Sync Write" (FOR ALL ... USING (true)) e "Public Read" (FOR SELECT ... USING (true)),
--    ambas TO authenticated. O FOR ALL já concede SELECT, então a de leitura é redundante e o Postgres
--    avalia as duas a cada consulta. Remove só a de leitura.
--
-- 2) multiple_permissive_policies em user_roles
--    "Admin Write" era FOR ALL e se sobrepunha à de SELECT. Passa a ser 3 policies (INSERT, UPDATE,
--    DELETE) com a mesma condição has_role('admin'). O SELECT do admin continua coberto por
--    "Self Read or Admin", que já inclui has_role('admin').
--
-- 3) auth_rls_initplan em user_roles e user_scope_assignments
--    auth.uid() chamado direto na policy é reavaliado por linha; (select auth.uid()) é avaliado uma vez
--    por consulta. Mesmo resultado.

-- ---------------------------------------------------------------------------
-- 1) Policies de leitura redundantes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public Read: atas_registro_preco" ON public.atas_registro_preco;
DROP POLICY IF EXISTS "Public Read: itens_ata" ON public.itens_ata;

-- ---------------------------------------------------------------------------
-- 2 e 3) user_roles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Self Read or Admin: user_roles" ON public.user_roles;
CREATE POLICY "Self Read or Admin: user_roles" ON public.user_roles
  FOR SELECT
  USING (((select auth.uid()) = user_id) OR has_role('admin'::text));

DROP POLICY IF EXISTS "Admin Write: user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admin Insert: user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admin Update: user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admin Delete: user_roles" ON public.user_roles;

CREATE POLICY "Admin Insert: user_roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (has_role('admin'::text));

CREATE POLICY "Admin Update: user_roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (has_role('admin'::text))
  WITH CHECK (has_role('admin'::text));

CREATE POLICY "Admin Delete: user_roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (has_role('admin'::text));

-- ---------------------------------------------------------------------------
-- 3) user_scope_assignments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Self Read or Admin: user_scope_assignments" ON public.user_scope_assignments;
CREATE POLICY "Self Read or Admin: user_scope_assignments" ON public.user_scope_assignments
  FOR SELECT
  USING (((select auth.uid()) = user_id) OR has_role('admin'::text));
