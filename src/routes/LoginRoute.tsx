import React, { useRef, useState } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, MailCheck } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { resetUserPassword } from '../services/userService';
import {
  AuthAlert, AuthLayout, AuthLoading, PasswordInput,
  isErroDeInfraestrutura, traduzirErroAuth
} from '../components/auth/AuthLayout';
import { ActionButton, AppButton } from '../design-system';
import { temSenhaPendente } from '../utils/senhaPendente';

export const LoginRoute: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // "Esqueci minha senha" fica na URL (?recuperar) para o Voltar do navegador funcionar
  const showForgot = searchParams.has('recuperar');
  // Só em desenvolvimento: ?preview mostra a tela mesmo com sessão ativa
  const devPreview = import.meta.env.DEV && searchParams.has('preview');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<'email' | 'password' | 'both' | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSentTo, setForgotSentTo] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  if (loading) {
    return <AuthLoading label="Carregando ComprasSUSP…" />;
  }

  if (user && !devPreview) {
    return <Navigate to={temSenhaPendente(user) ? '/definir-senha' : '/'} replace />;
  }

  const openForgot = () => {
    setForgotEmail(email);
    setForgotSentTo(null);
    setForgotError(null);
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('recuperar', ''); return next; });
  };

  const closeForgot = () => {
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('recuperar'); return next; });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg(!email.trim() ? 'Informe o e-mail institucional.' : 'Informe a senha.');
      setInvalidField(!email.trim() ? 'email' : 'password');
      (!email.trim() ? emailRef : passwordRef).current?.focus();
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setInvalidField(null);

    if (!isSupabaseConfigured || !supabase) {
      // Sem backend configurado só se entra em desenvolvimento
      if (import.meta.env.DEV) {
        navigate('/');
      } else {
        setErrorMsg('Serviço de autenticação indisponível. Procure o administrador do sistema.');
        setIsSubmitting(false);
      }
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (error) {
        setErrorMsg(traduzirErroAuth(error));
        if (error.message.includes('Invalid login credentials')) {
          setInvalidField('both');
          setPassword('');
          passwordRef.current?.focus();
        }
        setIsSubmitting(false);
        return;
      }

      navigate('/');
    } catch (err) {
      setErrorMsg(traduzirErroAuth(err));
      setIsSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const destino = forgotEmail.trim().toLowerCase();
    if (!destino) {
      setForgotError('Informe o e-mail institucional cadastrado.');
      return;
    }

    setForgotLoading(true);
    setForgotError(null);

    try {
      await resetUserPassword(destino);
      setForgotSentTo(destino);
    } catch (err) {
      // Não revela se o e-mail existe: só falhas de rede ou excesso de tentativas aparecem
      if (isErroDeInfraestrutura(err)) {
        setForgotError(traduzirErroAuth(err));
      } else {
        setForgotSentTo(destino);
      }
    } finally {
      setForgotLoading(false);
    }
  };

  if (showForgot) {
    return (
      <AuthLayout>
        {!forgotSentTo && (
          <ActionButton action="voltar" label="Voltar para o login" type="button" className="auth-back" onClick={closeForgot} />
        )}

        {forgotSentTo ? (
          <div className="auth-state">
            <div className="auth-state__icon"><MailCheck size={24} /></div>
            <h1 className="auth-title">Verifique seu e-mail</h1>
            <p className="auth-subtitle">
              Se houver uma conta para <strong>{forgotSentTo}</strong>, você receberá em alguns minutos um link para
              criar uma nova senha. Confira também a caixa de spam.
            </p>
            <ActionButton action="voltar" label="Voltar para o login" type="button" size="lg" fullWidth onClick={closeForgot} />
          </div>
        ) : (
          <>
            <h1 className="auth-title">Recuperar senha</h1>
            <p className="auth-subtitle">
              Informe seu e-mail institucional. Enviaremos um link para você criar uma nova senha.
            </p>
            <form onSubmit={handleForgotSubmit} className="auth-form" noValidate>
              {forgotError && <AuthAlert id="forgot-error">{forgotError}</AuthAlert>}
              <div className="auth-field">
                <label htmlFor="forgot-email" className="auth-label">E-mail institucional</label>
                <input
                  id="forgot-email"
                  className="auth-input"
                  type="email"
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="nome.sobrenome@mj.gov.br"
                  aria-invalid={!!forgotError || undefined}
                  aria-describedby={forgotError ? 'forgot-error' : undefined}
                  autoFocus
                  required
                />
              </div>
              <AppButton type="submit" size="lg" fullWidth isLoading={forgotLoading}>
                {forgotLoading ? 'Enviando…' : 'Enviar link de recuperação'}
              </AppButton>
            </form>
          </>
        )}
      </AuthLayout>
    );
  }

  const emailInvalid = invalidField === 'email' || invalidField === 'both';
  const passwordInvalid = invalidField === 'password' || invalidField === 'both';

  return (
    <AuthLayout>
      <h1 className="auth-title">Entrar</h1>
      <p className="auth-subtitle">Acesse com seu e-mail institucional e senha.</p>

      <form onSubmit={handleLogin} className="auth-form" noValidate>
        {errorMsg && <AuthAlert id="login-error">{errorMsg}</AuthAlert>}

        <div className="auth-field">
          <label htmlFor="login-email" className="auth-label">E-mail institucional</label>
          <input
            id="login-email"
            ref={emailRef}
            className="auth-input"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (emailInvalid) setInvalidField(null); }}
            placeholder="nome.sobrenome@mj.gov.br"
            aria-invalid={emailInvalid || undefined}
            aria-describedby={emailInvalid && errorMsg ? 'login-error' : undefined}
            autoFocus
            required
          />
        </div>

        <div className="auth-field">
          <div className="auth-label-row">
            <label htmlFor="login-password" className="auth-label">Senha</label>
            <AppButton type="button" variant="link" size="sm" onClick={openForgot}>
              Esqueci minha senha
            </AppButton>
          </div>
          <PasswordInput
            id="login-password"
            inputRef={passwordRef}
            value={password}
            onChange={(v) => { setPassword(v); if (passwordInvalid) setInvalidField(null); }}
            autoComplete="current-password"
            placeholder="Digite sua senha"
            invalid={passwordInvalid}
            describedBy={passwordInvalid && errorMsg ? 'login-error' : undefined}
          />
        </div>

        <AppButton type="submit" size="lg" fullWidth isLoading={isSubmitting}>
          {isSubmitting ? 'Entrando…' : <>Entrar <ArrowRight size={16} /></>}
        </AppButton>
      </form>

      <p className="auth-help">
        Ainda não tem acesso? O cadastro é feito pelo administrador do sistema, que envia um convite ao seu
        e-mail institucional.
      </p>
    </AuthLayout>
  );
};
