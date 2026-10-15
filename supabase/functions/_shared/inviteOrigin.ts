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
  'https://comprassusp.app',
  'https://cglic.vercel.app',
  'https://cglic-lu1smart1ns-projects.vercel.app',
  'http://localhost:5173'
]);

/**
 * Endereço para onde o link do convite leva, qualquer que seja a origem de produção do admin.
 *
 * Provisório (15/10/2026): na rede do Ministério da Justiça o firewall troca o certificado de
 * comprassusp.app (domínio novo) por um da CA interna, e o navegador recusa o site. Enquanto a
 * CGTI não libera o domínio, os convites levam a cglic.vercel.app, que abre normalmente.
 * Para voltar ao domínio novo, trocar esta constante por 'https://comprassusp.app'.
 */
const CANONICAL_ORIGIN = 'https://cglic.vercel.app';
const PRODUCTION_ORIGINS: readonly string[] = [
  'https://comprassusp.app',
  'https://cglic.vercel.app',
  'https://cglic-lu1smart1ns-projects.vercel.app'
];

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

  const finalOrigin = PRODUCTION_ORIGINS.includes(requestedOrigin) ? CANONICAL_ORIGIN : requestedOrigin;
  return { ok: true, redirectTo: `${finalOrigin}/definir-senha` };
}
