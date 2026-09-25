/**
 * Mapeamento explícito de perfil (frontend) -> role de banco (public.user_roles).
 *
 * Fase 0.1 — RBAC hardening: substitui o fallback anterior (qualquer perfil
 * não reconhecido virava "gestor"). A partir desta versão:
 *   perfil reconhecido e mapeado    -> role correspondente
 *   perfil customizado/desconhecido -> null (nenhuma autoridade concedida)
 *   perfil ausente/vazio            -> null
 *
 * Princípio: ausência de mapeamento = ausência de autoridade. Nunca retornar
 * um valor padrão de role aqui — cada entrada precisa ser explícita.
 */
export type DbRole = 'admin' | 'gestor' | 'leitor';

const PERFIL_TO_DB_ROLE: Readonly<Record<string, DbRole>> = Object.freeze({
  coordenador: 'admin',
  gestor: 'gestor',
  consulta: 'leitor',
});

export function mapPerfilToDbRole(perfil: unknown): DbRole | null {
  if (typeof perfil !== 'string') return null;
  const key = perfil.trim();
  if (!key) return null;
  return PERFIL_TO_DB_ROLE[key] ?? null;
}
