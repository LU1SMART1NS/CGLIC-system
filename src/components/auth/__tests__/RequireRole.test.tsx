import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RequireRole } from '../RequireRole';
import * as authContextModule from '../../../context/AuthContext';
import * as supabaseClientModule from '../../../services/supabaseClient';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn()
}));

const PROTECTED_CONTENT = 'Conteúdo Administrativo Protegido';

function renderRequireRole(allowedRoles: Array<'admin' | 'gestor' | 'gestor_saldos' | 'leitor'>) {
  return renderToStaticMarkup(
    <RequireRole allowedRoles={allowedRoles}>
      <div>{PROTECTED_CONTENT}</div>
    </RequireRole>
  );
}

describe('RequireRole — Autorização Central de Rotas (Fase Frontend RBAC)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
  });

  it('mantém um estado explícito de carregamento enquanto a role ainda não foi resolvida (roleStatus "loading")', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u1' } as any,
      session: {} as any,
      loading: false,
      role: null,
      roleStatus: 'loading',
      signOut: vi.fn()
    });

    const html = renderRequireRole(['admin']);

    expect(html).toContain('Verificando permissões de acesso');
    expect(html).not.toContain(PROTECTED_CONTENT);
  });

  it('mantém o mesmo estado de carregamento enquanto a autenticação (não só a role) ainda resolve', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      loading: true,
      role: null,
      roleStatus: 'loading',
      signOut: vi.fn()
    });

    const html = renderRequireRole(['admin']);

    expect(html).toContain('Verificando permissões de acesso');
    expect(html).not.toContain(PROTECTED_CONTENT);
  });

  it('nega acesso com "Acesso não autorizado" e NÃO renderiza os filhos quando a role não está na lista permitida', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u2' } as any,
      session: {} as any,
      loading: false,
      role: 'gestor',
      roleStatus: 'ready',
      signOut: vi.fn()
    });

    const html = renderRequireRole(['admin']);

    expect(html).toContain('Acesso não autorizado');
    expect(html).not.toContain(PROTECTED_CONTENT);
  });

  it('trata explicitamente a ausência de role (roleStatus "none") como acesso negado', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u3' } as any,
      session: {} as any,
      loading: false,
      role: null,
      roleStatus: 'none',
      signOut: vi.fn()
    });

    const html = renderRequireRole(['admin', 'gestor', 'gestor_saldos', 'leitor']);

    expect(html).toContain('Acesso não autorizado');
    expect(html).not.toContain(PROTECTED_CONTENT);
  });

  it('trata explicitamente erro na resolução da role (roleStatus "error") como acesso negado, nunca como liberado', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u4' } as any,
      session: {} as any,
      loading: false,
      role: null,
      roleStatus: 'error',
      signOut: vi.fn()
    });

    const html = renderRequireRole(['admin']);

    expect(html).toContain('Acesso não autorizado');
    expect(html).not.toContain(PROTECTED_CONTENT);
  });

  it('libera o acesso e renderiza os filhos quando a role está na lista permitida', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u5' } as any,
      session: {} as any,
      loading: false,
      role: 'admin',
      roleStatus: 'ready',
      signOut: vi.fn()
    });

    const html = renderRequireRole(['admin']);

    expect(html).toContain(PROTECTED_CONTENT);
    expect(html).not.toContain('Acesso não autorizado');
  });

  it('libera gestor_saldos para uma rota cujo allowedRoles o inclui', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u6' } as any,
      session: {} as any,
      loading: false,
      role: 'gestor_saldos',
      roleStatus: 'ready',
      signOut: vi.fn()
    });

    const html = renderRequireRole(['admin', 'gestor_saldos']);

    expect(html).toContain(PROTECTED_CONTENT);
  });

  it('ignora a checagem de role quando o Supabase não está configurado (mesmo bypass já usado por ProtectedLayout)', () => {
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(false);
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      loading: false,
      role: null,
      roleStatus: 'none',
      signOut: vi.fn()
    });

    const html = renderRequireRole(['admin']);

    expect(html).toContain(PROTECTED_CONTENT);
  });
});
