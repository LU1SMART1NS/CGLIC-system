import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';

export const RedefinirSenhaRoute: React.FC = () => {
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || password.length < 6) {
      setErrorMsg('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('As senhas não coincidem.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    if (!isSupabaseConfigured || !supabase) {
      setSuccess(true);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password
      });

      if (error) {
        setErrorMsg(error.message || 'Falha ao redefinir a senha.');
        setIsSubmitting(false);
        return;
      }

      setSuccess(true);
      setIsSubmitting(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro inesperado ao atualizar credenciais.');
      setIsSubmitting(false);
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
          {/* Header */}
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
              <Lock size={26} />
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0c326f', margin: '0 0 0.25rem 0' }}>
              Redefinir Senha
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0, fontWeight: 500 }}>
              Crie uma nova senha segura para o seu acesso institucional.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: '1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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

            {success ? (
              <div style={{ padding: '1.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#166534', textAlign: 'center' }}>
                <CheckCircle2 size={32} color="#16a34a" style={{ margin: '0 auto 0.5rem' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.25rem' }}>Senha alterada com sucesso.</h3>
                <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#15803d' }}>
                  Você já pode acessar o sistema com sua nova credencial.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  style={{
                    padding: '0.55rem 1.1rem',
                    background: '#166534',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <ArrowLeft size={14} /> Voltar ao Login
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                    Nova senha
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    minLength={6}
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                    Confirmar nova senha
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    required
                    minLength={6}
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
                    boxShadow: '0 2px 4px rgba(12, 50, 111, 0.2)'
                  }}
                >
                  {isSubmitting ? 'Redefinindo...' : 'Redefinir senha'}
                </button>
              </>
            )}
          </form>

          {/* Footer */}
          <div style={{
            padding: '0.85rem 1.5rem',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            textAlign: 'center',
            fontSize: '0.72rem',
            color: '#64748b'
          }}>
            Suas credenciais são criptografadas e protegidas pelo Supabase Auth.
          </div>
        </div>
      </div>
    </div>
  );
};
