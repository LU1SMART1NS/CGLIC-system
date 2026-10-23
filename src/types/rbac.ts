/**
 * Roles reais do backend (public.roles.id / public.user_roles.role_id) —
 * fonte de verdade do RBAC, resolvida em src/context/AuthContext.tsx.
 *
 * Não confundir com `UserRole` (src/types/user.ts), que são os ids de perfil
 * exibidos na tela de Usuários/Perfis (coordenador/gestor/consulta/gestor_saldos/gestor_emendas)
 * e mapeados para estes via supabase/functions/_shared/roleMapping.ts.
 */
export type AppRole = 'admin' | 'gestor' | 'gestor_saldos' | 'gestor_emendas' | 'leitor';

export const KNOWN_APP_ROLES: readonly AppRole[] = ['admin', 'gestor', 'gestor_saldos', 'gestor_emendas', 'leitor'];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (KNOWN_APP_ROLES as readonly string[]).includes(value);
}

/**
 * Perfis que consultam a Carteira só por Atas e Itens, sem contratos nem execução financeira:
 * gestor de saldo (PR #194) e gestor de emendas (migration 155).
 */
export function semContratos(role: AppRole | null | undefined): boolean {
  return role === 'gestor_saldos' || role === 'gestor_emendas';
}
