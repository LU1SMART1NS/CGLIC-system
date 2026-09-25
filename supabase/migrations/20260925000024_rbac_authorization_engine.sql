-- ==============================================================================
-- MIGRATION 24: FASE 2A — MOTOR DE AUTORIZAÇÃO (has_permission / has_scope)
-- ==============================================================================
-- Cria o motor de autorização do novo RBAC por domínio, isolado e sem efeito
-- colateral: NENHUMA RPC de negócio é alterada nesta fase, NENHUMA role nova
-- é criada, e has_role() permanece exatamente como está — as duas engines
-- coexistem. has_permission()/has_scope() só passam a valer quando uma RPC
-- futura (Fase 2B) decidir consultá-las.
--
-- Fonte de autoridade: exclusivamente user_roles.role_id (a coluna canônica
-- introduzida na Fase 1) -> role_permissions / role_domain_scopes ->
-- user_scope_assignments. Nunca a coluna legada user_roles.role, e nunca
-- qualquer dado do frontend (perfil/localStorage) — essas funções não têm
-- nenhuma visibilidade sobre o frontend, só leem o banco.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- has_permission(p_permission_key) — TRUE se QUALQUER role do usuário
-- autenticado conceder a permissão (união entre todas as roles do usuário,
-- necessário para múltiplas roles simultâneas na Fase 3, ex.: gestor_contratos
-- + gestor_saldos, sem exigir um perfil combinado).
--
-- Fail-closed por construção, sem nenhum fallback:
--   auth.uid() IS NULL              -> FALSE (checagem explícita abaixo)
--   usuário sem linha em user_roles -> FALSE (EXISTS não encontra nada)
--   role_id inexistente em roles    -> impossível (FK de user_roles.role_id)
--   permission_key inexistente      -> FALSE (não há linha em role_permissions
--                                      para uma chave que não existe em permissions)
--   permissão não concedida à role  -> FALSE (não há linha em role_permissions)
--
-- Segurança: SECURITY DEFINER com search_path fixo (public, pg_temp) para
-- evitar sequestro de search_path; nenhuma SQL dinâmica é usada (p_permission_key
-- entra só como valor de comparação `=`, nunca como identificador ou texto
-- executado — não há vetor de SQL injection). GRANT deliberadamente deixado no
-- padrão do Postgres (EXECUTE para PUBLIC), pelo mesmo motivo que has_role()
-- já usa esse padrão hoje: a função só revela um booleano sobre a autorização
-- do PRÓPRIO chamador (via auth.uid()), nunca dados de terceiros, e para um
-- usuário anônimo (auth.uid() IS NULL) o resultado é sempre FALSE.
CREATE OR REPLACE FUNCTION public.has_permission(p_permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role_id = ur.role_id
     WHERE ur.user_id = auth.uid()
       AND rp.permission_key = p_permission_key
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- has_scope(p_domain, p_scope_type, p_scope_value) — avalia se o usuário
-- autenticado tem alcance sobre um valor específico (unidade, ata, etc.) num
-- domínio, considerando a UNIÃO de todas as suas roles.
--
-- Semântica (exatamente a sugerida e aprovada, sem interpretação adicional):
--   GLOBAL -> não exige nenhuma linha em user_scope_assignments. Basta que
--             QUALQUER role do usuário tenha role_domain_scopes(domain, 'GLOBAL')
--             para aquele domínio; libera qualquer p_scope_type/p_scope_value
--             dentro do mesmo domain.
--   UNIT / ARP (ou qualquer scope_type não-GLOBAL) -> exige AMBOS:
--             (a) alguma role do usuário tenha role_domain_scopes(domain, X)
--                 com X EXATAMENTE igual ao p_scope_type pedido, e
--             (b) exista user_scope_assignments(user_id, domain, X, p_scope_value).
--   Se o scope_type concedido à role for diferente do p_scope_type pedido
--   (ex.: role só tem UNIT mas a checagem pede ARP), o resultado é FALSE para
--   essa role — só GLOBAL "supera" qualquer tipo pedido.
--
-- has_permission() e has_scope() são deliberadamente independentes: nenhuma
-- delas implica a outra. A combinação `has_permission(...) AND has_scope(...)`
-- é o padrão que RPCs futuras (Fase 2B) devem usar — não implementado aqui.
--
-- Segurança: mesmas garantias de has_permission() acima (SECURITY DEFINER,
-- search_path fixo, sem SQL dinâmica, grants no padrão de has_role()).
CREATE OR REPLACE FUNCTION public.has_scope(
  p_domain TEXT,
  p_scope_type TEXT,
  p_scope_value TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  -- GLOBAL: nenhuma atribuição individual é exigida.
  IF EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.role_domain_scopes rds
        ON rds.role_id = ur.role_id
       AND rds.domain = p_domain
       AND rds.scope_type = 'GLOBAL'
     WHERE ur.user_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;

  -- UNIT/ARP: exige role com o MESMO scope_type pedido + atribuição individual correspondente.
  RETURN EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.role_domain_scopes rds
        ON rds.role_id = ur.role_id
       AND rds.domain = p_domain
       AND rds.scope_type = p_scope_type
      JOIN public.user_scope_assignments usa
        ON usa.user_id = ur.user_id
       AND usa.domain = p_domain
       AND usa.scope_type = p_scope_type
       AND usa.scope_value = p_scope_value
     WHERE ur.user_id = auth.uid()
  );
END;
$$;
