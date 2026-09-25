import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoginRoute } from '../LoginRoute';
import { DefinirSenhaRoute } from '../DefinirSenhaRoute';
import { RedefinirSenhaRoute } from '../RedefinirSenhaRoute';
import * as authContextModule from '../../context/AuthContext';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Navigate: ({ to }: { to: string }) => <div>Redirect to {to}</div>
}));

describe('AuthRoutes — Testes Unitários de Acesso e Credenciamento com Supabase Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. deve renderizar a LoginRoute com campos institucionais e opção "Esqueci minha senha"', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      loading: false,
      signOut: vi.fn()
    });

    const html = renderToStaticMarkup(<LoginRoute />);

    expect(html).toContain('ComprasSUSP');
    expect(html).toContain('E-mail Institucional');
    expect(html).toContain('Senha de Acesso');
    expect(html).toContain('Entrar no sistema');
    expect(html).toContain('Esqueci minha senha');
  });

  it('2. deve redirecionar para a home se o usuário já estiver autenticado na LoginRoute', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user-123', email: 'servidor@mj.gov.br' } as any,
      session: {} as any,
      loading: false,
      signOut: vi.fn()
    });

    const html = renderToStaticMarkup(<LoginRoute />);
    expect(html).toContain('Redirect to /');
  });

  it('3. deve renderizar a DefinirSenhaRoute para primeiro acesso após convite', () => {
    const html = renderToStaticMarkup(<DefinirSenhaRoute />);

    expect(html).toContain('Primeiro Acesso ao SaldoARP');
    expect(html).toContain('Nova senha');
    expect(html).toContain('Confirmar nova senha');
    expect(html).toContain('Definir senha');
  });

  it('4. deve renderizar a RedefinirSenhaRoute para recuperação de senha esquecida', () => {
    const html = renderToStaticMarkup(<RedefinirSenhaRoute />);

    expect(html).toContain('Redefinir Senha');
    expect(html).toContain('Nova senha');
    expect(html).toContain('Confirmar nova senha');
    expect(html).toContain('Redefinir senha');
  });
});
