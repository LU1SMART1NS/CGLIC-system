/**
 * Resolve e valida a origem usada para montar o `redirectTo` do convite de
 * primeiro acesso (`/definir-senha`).
 *
 * A origem é informada explicitamente pelo cliente (window.location.origin,
 * sempre confiável no navegador) e validada aqui contra uma allow-list fixa.
 * Nunca aceitar uma origem arbitrária e nunca cair silenciosamente em um
 * fallback (ex.: localhost em produção) — origem fora da lista é rejeitada
 * com erro explícito, sem enviar o convite.
 */
export const ALLOWED_INVITE_ORIGINS: readonly string[] = Object.freeze([
  // Domínio canônico de produção.
  'https://cglic.vercel.app',
  // Domínio de produção anterior — manter temporariamente para convites/testes já existentes.
  'https://cglic-lu1smart1ns-projects.vercel.app',
  'http://localhost:5173'
]);

export type InviteRedirectResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export function resolveInviteRedirect(origin: unknown): InviteRedirectResult {
  const requestedOrigin = typeof origin === 'string' ? origin.trim().replace(/\/$/, '') : '';

  if (!ALLOWED_INVITE_ORIGINS.includes(requestedOrigin)) {
    return {
      ok: false,
      error: `Origem não autorizada para redirecionamento de convite: ${requestedOrigin || '(ausente)'}`
    };
  }

  return { ok: true, redirectTo: `${requestedOrigin}/definir-senha` };
}
