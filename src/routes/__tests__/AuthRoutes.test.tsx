import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoginRoute } from '../LoginRoute';
import { DefinirSenhaRoute } from '../DefinirSenhaRoute';
import { RedefinirSenhaRoute } from '../RedefinirSenhaRoute';
import * as authContextModule from '../../context/AuthContext';
import { isErroDeInfraestrutura, traduzirErroAuth } from '../../components/auth/AuthLayout';

let mockSearch = '';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(mockSearch), vi.fn()],
  Navigate: ({ to }: { to: string }) => <div>Redirect to {to}</div>
}));

const semUsuario = {
  user: null,
  session: null,
  loading: false,
  role: null,
  roleStatus: 'none' as const,
  signOut: vi.fn()
};

describe('AuthRoutes — Testes Unitários de Acesso e Credenciamento com Supabase Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockSearch = '';
  });

  it('1. deve renderizar a LoginRoute com campos institucionais e opção "Esqueci minha senha"', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue(semUsuario);

    const html = renderToStaticMarkup(<LoginRoute />);

    expect(html).toContain('Gestão Inteligente de Atas e Contratos');
    expect(html).toContain('E-mail institucional');
    expect(html).toContain('"current-password"');
    expect(html).toContain('Entrar');
    expect(html).toContain('Esqueci minha senha');
    expect(html).toContain('aria-label="Mostrar senha"');
  });

  it('2. deve redirecionar para a home se o usuário já estiver autenticado na LoginRoute', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user-123', email: 'servidor@mj.gov.br' } as any,
      session: {} as any,
      loading: false,
      role: 'admin',
      roleStatus: 'ready',
      signOut: vi.fn()
    });

    const html = renderToStaticMarkup(<LoginRoute />);
    expect(html).toContain('Redirect to /');
  });

  it('3. deve renderizar a DefinirSenhaRoute para primeiro acesso após convite', () => {
    const html = renderToStaticMarkup(<DefinirSenhaRoute />);

    expect(html).toContain('Primeiro acesso');
    expect(html).toContain('Nova senha');
    expect(html).toContain('Confirme a nova senha');
    expect(html).toContain('Ativar minha conta');
    expect(html).toContain('Pelo menos 6 caracteres');
  });

  it('4. deve renderizar a RedefinirSenhaRoute para recuperação de senha esquecida', () => {
    const html = renderToStaticMarkup(<RedefinirSenhaRoute />);

    expect(html).toContain('Criar nova senha');
    expect(html).toContain('Nova senha');
    expect(html).toContain('Confirme a nova senha');
    expect(html).toContain('Salvar nova senha');
  });

  it('5. ?recuperar abre a recuperação de senha dentro da LoginRoute', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue(semUsuario);
    mockSearch = 'recuperar';

    const html = renderToStaticMarkup(<LoginRoute />);

    expect(html).toContain('Recuperar senha');
    expect(html).toContain('Enviar link de recuperação');
    expect(html).toContain('Voltar para o login');
  });
});

describe('traduzirErroAuth', () => {
  it('traduz as mensagens conhecidas do Supabase Auth', () => {
    expect(traduzirErroAuth(new Error('Invalid login credentials'))).toBe('E-mail ou senha incorretos.');
    expect(traduzirErroAuth(new Error('Email not confirmed'))).toContain('Conta ainda não ativada');
    expect(traduzirErroAuth(new Error('Email rate limit exceeded'))).toContain('Muitas tentativas');
    expect(traduzirErroAuth(new TypeError('Failed to fetch'))).toContain('Não foi possível conectar');
    expect(traduzirErroAuth(new Error('New password should be different from the old password.'))).toContain('diferente');
  });

  it('não expõe o texto técnico de erros desconhecidos', () => {
    const msg = traduzirErroAuth(new Error('AuthApiError: unexpected_failure at gotrue'));
    expect(msg).toBe('Não foi possível concluir agora. Tente novamente em instantes.');
  });

  it('na recuperação, só rede e excesso de tentativas são exibidos (não revela se o e-mail existe)', () => {
    expect(isErroDeInfraestrutura(new Error('Email rate limit exceeded'))).toBe(true);
    expect(isErroDeInfraestrutura(new TypeError('Failed to fetch'))).toBe(true);
    expect(isErroDeInfraestrutura(new Error('User not found'))).toBe(false);
  });
});
