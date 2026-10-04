import React, { useState } from 'react';
import { AlertCircle, BarChart3, CalendarClock, Check, Database, Eye, EyeOff } from 'lucide-react';
import govbrLogo from '../../assets/govbr-logo.svg';
import fnspLogo from '../../assets/fnsp-logo.png';

/**
 * Layout compartilhado das telas de acesso (login, primeiro acesso e
 * redefinição de senha): painel institucional à esquerda, com a arte
 * login-bg.png (F N S P) ao fundo, e formulário à direita. Abaixo de 960px o
 * painel some e a marca aparece compacta acima do formulário. Estilos em
 * index.css (seção "Telas de acesso").
 */
export const AuthLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="auth">
    <div className="auth-govbar">
      <img className="auth-govbar__logo" src={govbrLogo} alt="gov.br" />
      <span className="auth-govbar__sep" aria-hidden="true" />
      <span className="auth-govbar__org">Ministério da Justiça e Segurança Pública</span>
    </div>

    <div className="auth-body">
      <aside className="auth-brand" aria-hidden="true">
        <div className="auth-brand__name"><span>Compras</span>SUSP</div>

        <div className="auth-brand__main">
          <h2 className="auth-brand__title">Gestão inteligente de atas e contratos</h2>
          <p className="auth-brand__lead">
            Saldos de atas, prazos contratuais e execução financeira da carteira em um só lugar.
          </p>
          <ul className="auth-brand__list">
            <li>
              <span className="auth-brand__icon"><BarChart3 size={16} /></span>
              Saldos das atas de registro de preços sempre atualizados
            </li>
            <li>
              <span className="auth-brand__icon"><CalendarClock size={16} /></span>
              Alertas de vigência e de prazos contratuais
            </li>
            <li>
              <span className="auth-brand__icon"><Database size={16} /></span>
              Dados oficiais do Compras.gov.br e do PNCP
            </li>
          </ul>
        </div>

        <div className="auth-brand__foot">
          <img src={fnspLogo} alt="" />
          <span className="auth-brand__foot-sep" />
          <span>Fundo Nacional de Segurança Pública</span>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-panel-wrap">
          <div className="auth-panel">
            <div className="auth-mobile-id">
              <div className="auth-mobile-id__name"><span>Compras</span>SUSP</div>
              <div className="auth-mobile-id__org">Gestão Inteligente de Atas e Contratos</div>
            </div>
            {children}
          </div>
        </div>
        <footer className="auth-foot">
          Dados: Compras.gov.br e PNCP · © {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  </div>
);

export const AuthLoading: React.FC<{ label?: string }> = ({ label = 'Carregando…' }) => (
  <div className="auth-loading" role="status">
    <span className="auth-spinner auth-spinner--primary" aria-hidden="true" />
    <span>{label}</span>
  </div>
);

export const AuthAlert: React.FC<{ id?: string; children: React.ReactNode }> = ({ id, children }) => (
  <div id={id} className="auth-alert" role="alert">
    <AlertCircle size={16} aria-hidden="true" />
    <span>{children}</span>
  </div>
);

export const AuthSpinner: React.FC = () => <span className="auth-spinner" aria-hidden="true" />;

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}

/** Campo de senha com botão de mostrar/ocultar e aviso de Caps Lock ligado. */
export const PasswordInput: React.FC<PasswordInputProps> = ({
  id, value, onChange, autoComplete, placeholder, invalid, describedBy, autoFocus, inputRef
}) => {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const capsId = `${id}-caps`;

  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState?.('CapsLock') ?? false);
  };

  return (
    <>
      <div className="auth-input-wrap">
        <input
          id={id}
          ref={inputRef}
          className="auth-input auth-input--with-toggle"
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={checkCaps}
          onKeyUp={checkCaps}
          onBlur={() => setCapsLock(false)}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={[describedBy, capsLock ? capsId : null].filter(Boolean).join(' ') || undefined}
          autoFocus={autoFocus}
          required
        />
        <button
          type="button"
          className="auth-toggle"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {capsLock && (
        <span id={capsId} className="auth-hint auth-hint--warn">
          <AlertCircle size={13} aria-hidden="true" /> Caps Lock está ativado
        </span>
      )}
    </>
  );
};

export const MIN_PASSWORD_LENGTH = 6;

/** Requisitos da nova senha, marcados ao vivo conforme o usuário digita. */
export const PasswordChecklist: React.FC<{ password: string; confirm: string }> = ({ password, confirm }) => {
  const rules = [
    { ok: password.length >= MIN_PASSWORD_LENGTH, label: `Pelo menos ${MIN_PASSWORD_LENGTH} caracteres` },
    { ok: password.length > 0 && password === confirm, label: 'As duas senhas são iguais' }
  ];
  return (
    <ul className="auth-checklist" aria-label="Requisitos da senha">
      {rules.map(rule => (
        <li key={rule.label} data-ok={rule.ok}>
          <span className="auth-checklist__mark" aria-hidden="true">{rule.ok && <Check size={11} strokeWidth={3} />}</span>
          {rule.label}
          <span className="sr-only">{rule.ok ? ' (atendido)' : ' (pendente)'}</span>
        </li>
      ))}
    </ul>
  );
};

/**
 * Traduz mensagens do Supabase Auth para o português, sem expor o texto técnico
 * original ao usuário.
 */
export function traduzirErroAuth(err: unknown): string {
  const message = (err instanceof Error ? err.message : typeof err === 'string' ? err : '').toLowerCase();
  const status = (err as { status?: number } | null)?.status;

  if (message.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (message.includes('email not confirmed')) return 'Conta ainda não ativada. Use o link de convite enviado ao seu e-mail institucional.';
  if (status === 429 || message.includes('rate limit') || message.includes('too many') || message.includes('security purposes')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
  }
  if (message.includes('failed to fetch') || message.includes('network') || message.includes('load failed')) {
    return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
  }
  if (message.includes('banned')) return 'Acesso suspenso. Procure o administrador do sistema.';
  if (message.includes('should be different')) return 'A nova senha precisa ser diferente da senha atual.';
  if (message.includes('password should be') || message.includes('weak')) {
    return 'Senha fraca demais. Use uma senha mais longa, misturando letras, números e símbolos.';
  }
  if (message.includes('session') && (message.includes('missing') || message.includes('expired'))) {
    return 'Sua sessão expirou. Solicite um novo link e tente novamente.';
  }
  return 'Não foi possível concluir agora. Tente novamente em instantes.';
}

/** Erros que devem aparecer mesmo no fluxo de recuperação (que não revela se o e-mail existe). */
export function isErroDeInfraestrutura(err: unknown): boolean {
  const traduzido = traduzirErroAuth(err);
  return traduzido.startsWith('Muitas tentativas') || traduzido.startsWith('Não foi possível conectar');
}
