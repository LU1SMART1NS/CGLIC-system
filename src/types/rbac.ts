/**
 * Roles reais do backend (public.roles.id / public.user_roles.role_id) —
 * fonte de verdade do RBAC, resolvida em src/context/AuthContext.tsx.
 *
 * Não confundir com `UserRole` (src/types/user.ts), que são os ids de perfil
 * exibidos na tela de Usuários/Perfis (coordenador/gestor/consulta/gestor_saldos)
 * e mapeados para estes via supabase/functions/_shared/roleMapping.ts.
 */
export type AppRole = 'admin' | 'gestor' | 'gestor_saldos' | 'leitor';

export const KNOWN_APP_ROLES: readonly AppRole[] = ['admin', 'gestor', 'gestor_saldos', 'leitor'];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (KNOWN_APP_ROLES as readonly string[]).includes(value);
}
