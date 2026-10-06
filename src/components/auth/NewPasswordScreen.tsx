import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, LinkIcon } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../services/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  AuthAlert, AuthLayout, AuthLoading, AuthSpinner, MIN_PASSWORD_LENGTH,
  PasswordChecklist, PasswordInput, traduzirErroAuth
} from './AuthLayout';
import { AppButton } from '../../design-system';

interface NewPasswordScreenProps {
  title: string;
  subtitle: string;
  submitLabel: string;
  successTitle: string;
  successText: string;
  /** Texto exibido quando o link do e-mail não gerou sessão (expirado ou já usado). */
  invalidText: string;
  /** Leva direto ao sistema após o sucesso, sem esperar clique. */
  autoRedirect?: boolean;
}

/**
 * Tela de definição de senha usada no primeiro acesso (convite) e na
 * recuperação. Ambos os fluxos chegam aqui com a sessão criada pelo link do
 * e-mail; sem sessão, o link expirou ou já foi usado.
 */
export const NewPasswordScreen: React.FC<NewPasswordScreenProps> = ({
  title, subtitle, submitLabel, successTitle, successText, invalidText, autoRedirect
}) => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  // Só em desenvolvimento: ?preview mostra o formulário sem o link do e-mail
  const [searchParams] = useSearchParams();
  const devPreview = import.meta.env.DEV && searchParams.has('preview');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (loading) {
    return <AuthLoading label="Validando o link de acesso…" />;
  }

  if (isSupabaseConfigured && !user && !success && !devPreview) {
    return (
      <AuthLayout>
        <div className="auth-state">
          <div className="auth-state__icon auth-state__icon--warn"><LinkIcon size={22} /></div>
          <h1 className="auth-title">Link inválido ou expirado</h1>
          <p className="auth-subtitle">{invalidText}</p>
          <AppButton type="button" size="lg" fullWidth onClick={() => navigate('/login?recuperar')}>
            Solicitar novo link
          </AppButton>
          <AppButton type="button" variant="link" style={{ marginTop: '1.25rem' }} onClick={() => navigate('/login')}>
            Voltar para o login
          </AppButton>
        </div>
      </AuthLayout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('As duas senhas não são iguais.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const concluir = () => {
      setSuccess(true);
      setIsSubmitting(false);
      if (autoRedirect) setTimeout(() => navigate('/'), 1500);
    };

    if (!isSupabaseConfigured || !supabase) {
      concluir();
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMsg(traduzirErroAuth(error));
        setIsSubmitting(false);
        return;
      }
      concluir();
    } catch (err) {
      setErrorMsg(traduzirErroAuth(err));
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <AuthLayout>
        <div className="auth-state" role="status">
          <div className="auth-state__icon"><CheckCircle2 size={24} /></div>
          <h1 className="auth-title">{successTitle}</h1>
          <p className="auth-subtitle">{successText}</p>
          {autoRedirect ? (
            <span className="auth-hint" style={{ justifyContent: 'center' }}><AuthSpinner /> Abrindo o sistema…</span>
          ) : (
            <AppButton type="button" size="lg" fullWidth onClick={() => navigate('/')}>
              Acessar o sistema <ArrowRight size={16} />
            </AppButton>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="auth-title">{title}</h1>
      <p className="auth-subtitle">{subtitle}</p>

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        {errorMsg && <AuthAlert id="new-password-error">{errorMsg}</AuthAlert>}

        {user?.email && (
          <input type="email" autoComplete="username" value={user.email} readOnly hidden />
        )}

        <div className="auth-field">
          <label htmlFor="new-password" className="auth-label">Nova senha</label>
          <PasswordInput
            id="new-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`}
            invalid={!!errorMsg && password.length < MIN_PASSWORD_LENGTH}
            describedBy={errorMsg ? 'new-password-error' : undefined}
            autoFocus
          />
        </div>

        <div className="auth-field">
          <label htmlFor="confirm-password" className="auth-label">Confirme a nova senha</label>
          <PasswordInput
            id="confirm-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            placeholder="Digite a senha novamente"
            invalid={!!errorMsg && password !== confirmPassword}
            describedBy={errorMsg ? 'new-password-error' : undefined}
          />
        </div>

        <PasswordChecklist password={password} confirm={confirmPassword} />

        <AppButton type="submit" size="lg" fullWidth isLoading={isSubmitting}>
          {isSubmitting ? 'Salvando…' : submitLabel}
        </AppButton>
      </form>
    </AuthLayout>
  );
};
