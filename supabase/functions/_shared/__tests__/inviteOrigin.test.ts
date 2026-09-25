import { describe, it, expect } from 'vitest';
import { resolveInviteRedirect, ALLOWED_INVITE_ORIGINS } from '../inviteOrigin';

describe('resolveInviteRedirect — allow-list de origem do redirectTo do convite', () => {
  it('origin permitido (Vercel produção — domínio canônico) -> redirectTo correto', () => {
    const result = resolveInviteRedirect('https://cglic.vercel.app');
    expect(result).toEqual({ ok: true, redirectTo: 'https://cglic.vercel.app/definir-senha' });
  });

  it('origin permitido (Vercel produção — domínio anterior, mantido temporariamente) -> redirectTo correto', () => {
    const result = resolveInviteRedirect('https://cglic-lu1smart1ns-projects.vercel.app');
    expect(result).toEqual({ ok: true, redirectTo: 'https://cglic-lu1smart1ns-projects.vercel.app/definir-senha' });
  });

  it('origin permitido (localhost de desenvolvimento) -> redirectTo correto', () => {
    const result = resolveInviteRedirect('http://localhost:5173');
    expect(result).toEqual({ ok: true, redirectTo: 'http://localhost:5173/definir-senha' });
  });

  it('tolera barra final na origem recebida', () => {
    const result = resolveInviteRedirect('https://cglic-lu1smart1ns-projects.vercel.app/');
    expect(result).toEqual({ ok: true, redirectTo: 'https://cglic-lu1smart1ns-projects.vercel.app/definir-senha' });
  });

  it('origin não permitido (domínio arbitrário) -> convite rejeitado, sem redirectTo', () => {
    const result = resolveInviteRedirect('https://qualquer-site-malicioso.com');
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain('Origem não autorizada');
  });

  it('origin ausente -> rejeitado, sem fallback silencioso para localhost', () => {
    const result = resolveInviteRedirect(undefined);
    expect(result.ok).toBe(false);
  });

  it('origin de tipo inesperado -> rejeitado sem lançar exceção', () => {
    expect(resolveInviteRedirect(123 as unknown).ok).toBe(false);
    expect(resolveInviteRedirect({} as unknown).ok).toBe(false);
    expect(resolveInviteRedirect(null).ok).toBe(false);
  });

  it('a allow-list contém exatamente as origens de produção (atual e anterior) e desenvolvimento local esperadas', () => {
    expect(ALLOWED_INVITE_ORIGINS).toContain('https://cglic.vercel.app');
    expect(ALLOWED_INVITE_ORIGINS).toContain('https://cglic-lu1smart1ns-projects.vercel.app');
    expect(ALLOWED_INVITE_ORIGINS).toContain('http://localhost:5173');
    expect(ALLOWED_INVITE_ORIGINS).not.toContain('https://qualquer-site-malicioso.com');
  });
});
