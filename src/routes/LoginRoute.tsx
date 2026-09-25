import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { resetUserPassword } from '../services/userService';

export const LoginRoute: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <span style={{ fontSize: '0.9rem', color: '#0c326f', fontWeight: 600 }}>Carregando ComprasSUSP...</span>
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
      background: 'linear-gradient(135deg, #0c326f 0%, #061b3d 100%)',
      fontFamily: 'var(--font-family, system-ui, sans-serif)',
      color: '#0f172a'
    }}>
      {/* Gov.br Top Bar */}
      <div style={{
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
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden'
        }}>
          {/* Header do Card */}
          <div style={{
            padding: '1.75rem 2rem 1.25rem',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            textAlign: 'center'
          }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              background: '#0c326f',
              color: '#ffffff',
              marginBottom: '0.75rem'
            }}>
              <ShieldCheck size={26} />
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0c326f', margin: '0 0 0.25rem 0' }}>
              ComprasSUSP
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0, fontWeight: 500 }}>
              Gestão de Atas e Contratos · UASG 200331
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
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  E-mail Institucional
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="servidor@mj.gov.br"
                    required
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem 0.55rem 2.25rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                    Senha de Acesso
                  </label>
                  <button
                    type="button"
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
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem 0.55rem 2.25rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.65rem 1rem',
                  background: '#0c326f',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
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

          {/* Rodapé Informativo */}
          <div style={{
            padding: '0.85rem 1.5rem',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            textAlign: 'center',
            fontSize: '0.72rem',
            color: '#64748b'
          }}>
            Acesso soberano protegido por Gov.br / Supabase Auth · Padrão BR-DS
          </div>
        </div>
      </div>
    </div>
  );
};
