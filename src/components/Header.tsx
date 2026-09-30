import React from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  onOpenExportModal?: () => void;
  onOpenContractTemplatesModal?: () => void;
}

export const Header: React.FC<HeaderProps> = () => {
  const { user, signOut } = useAuth();
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Gov.br Federal Identity Topbar */}
      <div style={{
        background: '#0c326f',
        color: '#ffffff',
        padding: '0.25rem 2rem',
        fontSize: '0.72rem',
        fontWeight: 600,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        fontFamily: 'var(--font-family)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '-0.03em' }}>
            gov<span style={{ color: '#00cc55' }}>.</span>br
          </span>
          <span style={{ opacity: 0.5, margin: '0 0.25rem' }}>|</span>
          <span style={{ fontWeight: 600, opacity: 0.95 }}>Ministério da Justiça e Segurança Pública</span>
        </div>
        <div style={{ display: 'flex', gap: '1.25rem', opacity: 0.9, fontWeight: 400 }} className="gov-topbar-links">
          <a href="https://www.gov.br/mj/pt-br" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'none' }}>Portal MJSP</a>
          <a href="https://www.gov.br/pt-br/orgaos-do-governo" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'none' }}>Órgãos do Governo</a>
          <a href="https://www.gov.br/acessoainformacao/pt-br" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'none' }}>Acesso à Informação</a>
        </div>
      </div>

      {/* Main MJSP / SENASP Styled Header */}
      <header style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '0.45rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        fontFamily: 'var(--font-family)',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <img 
              src="/logo.png" 
              alt="Logo Compras SUSP / SENASP" 
              style={{ 
                maxHeight: '100%', 
                maxWidth: '100%', 
                objectFit: 'contain' 
              }} 
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em', borderBottom: 'none', paddingBottom: 0 }}>
              CGLIC
            </h1>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
              Gestão Inteligente de Atas e Contratos
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Usuário Autenticado & Logout */}
          {user && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              paddingLeft: '0.5rem',
              borderLeft: '1px solid #e2e8f0'
            }}>
              <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
                {user.email}
              </span>
              <button
                type="button"
                onClick={signOut}
                title="Encerrar sessão no CGLIC"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.25rem 0.5rem',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  color: '#475569',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <LogOut size={12} /> Sair
              </button>
            </div>
          )}
        </div>
      </header>
    </div>
  );
};
