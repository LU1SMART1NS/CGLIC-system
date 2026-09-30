import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Lock, Mail, ArrowRight, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { resetUserPassword } from '../services/userService';

export const LoginRoute: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal / Estado de Esqueci Minha Senha
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <span style={{ fontSize: '0.9rem', color: '#0c326f', fontWeight: 600 }}>Carregando CGLIC...</span>
      </div>
    );
  }

  // Se já autenticado no Supabase, segue para a tela principal
  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('Informe o e-mail institucional e a senha.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    if (!isSupabaseConfigured || !supabase) {
      // Modo offline/dev se não houver backend
      navigate('/');
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMsg('E-mail institucional ou senha incorretos.');
        } else if (error.message.includes('Email not confirmed')) {
          setErrorMsg('Conta aguardando confirmação. Verifique seu e-mail institucional.');
        } else {
          setErrorMsg(error.message || 'Erro ao realizar login.');
        }
        setIsSubmitting(false);
        return;
      }

      navigate('/');
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha de comunicação com o serviço de autenticação.');
      setIsSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotError('Informe o e-mail institucional cadastrado.');
      return;
    }

    setForgotLoading(true);
    setForgotError(null);

    try {
      await resetUserPassword(forgotEmail.trim().toLowerCase());
      setForgotSuccess(true);
      setForgotLoading(false);
    } catch (err: any) {
      setForgotError(err.message || 'Erro ao enviar e-mail de recuperação.');
      setForgotLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      background: "#0c326f url('/login-bg.png') center / cover no-repeat",
      fontFamily: 'var(--font-family, system-ui, sans-serif)',
      color: '#0f172a'
    }}>
      <style>{`
        .cglic-login-input { transition: border-color .15s, box-shadow .15s; background: #fff; }
        .cglic-login-input:focus { border-color: #0c326f !important; box-shadow: 0 0 0 3px rgba(12, 50, 111, 0.18); }
        .cglic-login-btn { transition: background .15s, transform .1s, box-shadow .15s; }
        .cglic-login-btn:hover:not(:disabled) { background: #0a2a5e !important; box-shadow: 0 6px 14px rgba(12, 50, 111, 0.35) !important; }
        .cglic-login-btn:active:not(:disabled) { transform: translateY(1px); }
        .cglic-login-link:hover { text-decoration: underline; }
        @keyframes cglic-card-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* Filtro sobre a imagem: escurece, desfoca levemente e mantém o foco no card de login */}
      <div aria-hidden="true" style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, rgba(6, 27, 61, 0.78) 0%, rgba(12, 50, 111, 0.55) 55%, rgba(6, 27, 61, 0.8) 100%)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)'
      }} />
      {/* Gov.br Top Bar */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        background: 'rgba(0, 0, 0, 0.25)',
        color: '#ffffff',
        padding: '0.4rem 2rem',
        fontSize: '0.72rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <span style={{ fontWeight: 800, fontSize: '0.82rem' }}>
          gov<span style={{ color: '#00cc55' }}>.</span>br
        </span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span style={{ opacity: 0.9 }}>Ministério da Justiça e Segurança Pública · SENASP</span>
      </div>

      {/* Main Container */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '440px',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.12)',
          overflow: 'hidden',
          animation: 'cglic-card-in .35s ease-out'
        }}>
          {/* Header do Card */}
          <div style={{
            padding: '2rem 2rem 1.5rem',
            background: 'linear-gradient(180deg, #f1f5fb 0%, #ffffff 100%)',
            borderBottom: '1px solid #e2e8f0',
            textAlign: 'center'
          }}>
            <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: '#0c326f', margin: '0 0 0.3rem 0', letterSpacing: '0.04em' }}>
              CGLIC
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#475569', margin: 0, fontWeight: 500 }}>
              Gestão Inteligente de Atas e Contratos
            </p>
          </div>

          {/* Form de Login */}
          {!showForgot ? (
            <form onSubmit={handleLogin} style={{ padding: '1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {errorMsg && (
                <div style={{
                  padding: '0.65rem 0.85rem',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  color: '#991b1b',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label htmlFor="login-email" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  E-mail Institucional
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    id="login-email"
                    className="cglic-login-input"
                    autoComplete="username"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="servidor@mj.gov.br"
                    required
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label htmlFor="login-password" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                    Senha de Acesso
                  </label>
                  <button
                    type="button"
                    className="cglic-login-link"
                    onClick={() => {
                      setShowForgot(true);
                      setForgotEmail(email);
                      setForgotSuccess(false);
                      setForgotError(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#0284c7',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    id="login-password"
                    className="cglic-login-input"
                    autoComplete="current-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      width: '100%',
                      padding: '0.65rem 2.5rem 0.65rem 2.25rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    style={{
                      position: 'absolute',
                      right: '0.5rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      padding: '0.25rem',
                      cursor: 'pointer',
                      color: '#94a3b8',
                      display: 'flex'
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="cglic-login-btn"
                disabled={isSubmitting}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem 1rem',
                  background: '#0c326f',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 2px 4px rgba(12, 50, 111, 0.2)'
                }}
              >
                <span>{isSubmitting ? 'Autenticando...' : 'Entrar no sistema'}</span>
                <ArrowRight size={15} />
              </button>
            </form>
          ) : (
            /* Fluxo Esqueci Minha Senha */
            <form onSubmit={handleForgotSubmit} style={{ padding: '1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ textAlign: 'left' }}>
                <h2 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.35rem 0' }}>
                  Recuperação de Acesso
                </h2>
                <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                  Informe seu e-mail institucional cadastrado. O Supabase Auth enviará um link oficial para redefinir sua senha.
                </p>
              </div>

              {forgotError && (
                <div style={{ padding: '0.65rem 0.85rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', fontSize: '0.8rem' }}>
                  {forgotError}
                </div>
              )}

              {forgotSuccess ? (
                <div style={{ padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#166534', fontSize: '0.82rem', textAlign: 'center' }}>
                  <CheckCircle2 size={24} color="#16a34a" style={{ margin: '0 auto 0.5rem' }} />
                  <p style={{ fontWeight: 700, margin: '0 0 0.25rem' }}>E-mail de recuperação enviado!</p>
                  <p style={{ margin: 0, fontSize: '0.76rem', color: '#15803d' }}>
                    Verifique sua caixa de entrada institucional e clique no link para definir uma nova senha.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowForgot(false)}
                    style={{
                      marginTop: '0.85rem',
                      padding: '0.45rem 0.9rem',
                      background: '#166534',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Voltar ao Login
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                      E-mail Institucional
                    </label>
                    <input
                      className="cglic-login-input"
                      autoComplete="email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="servidor@mj.gov.br"
                      required
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowForgot(false)}
                      style={{
                        padding: '0.5rem 0.9rem',
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#0c326f',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: forgotLoading ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {forgotLoading ? 'Enviando...' : 'Enviar link'}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>

      <div style={{
        position: 'relative',
        zIndex: 1,
        textAlign: 'center',
        padding: '0.75rem 1rem 1.25rem',
        fontSize: '0.72rem',
        color: 'rgba(255, 255, 255, 0.65)'
      }}>
        CGLIC · Ministério da Justiça e Segurança Pública · SENASP
      </div>
    </div>
  );
};
