import React from 'react';
import { Building2 } from 'lucide-react';

interface HeaderProps {
  onOpenExportModal?: () => void;
  onOpenContractTemplatesModal?: () => void;
}

export const Header: React.FC<HeaderProps> = () => {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Gov.br Federal Identity Topbar */}
      <div style={{
        background: '#0c326f',
        color: '#ffffff',
        padding: '0.4rem 3rem',
        fontSize: '0.75rem',
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

      {/* Main MJSP Styled Header */}
      <header style={{
        background: '#ffffff',
        borderBottom: '3px solid #0c326f',
        padding: '1rem 3rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
        fontFamily: 'var(--font-family)',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <img 
              src="/logo.png" 
              alt="Logo Compras SUSP / MJSP" 
              style={{ 
                maxHeight: '100%', 
                maxWidth: '100%', 
                objectFit: 'contain' 
              }} 
            />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0c326f', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Ministério da Justiça e Segurança Pública • SENASP
            </div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', margin: '0.1rem 0 0 0', letterSpacing: '-0.02em', borderBottom: 'none', paddingBottom: 0 }}>
              ComprasSUSP <span style={{ fontWeight: 400, fontSize: '1.05rem', color: '#475569' }}>| Gestão Inteligente de Atas e Contratos</span>
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.1rem 0 0 0', fontWeight: 500 }}>
              Coordenação-Geral de Licitações e Contratos (CGLIC)
            </p>
          </div>
        </div>

        {/* Identificação Institucional da Unidade Gestora */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.45rem 0.85rem',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ padding: '0.35rem', background: '#eff6ff', borderRadius: '6px', color: '#0c326f' }}>
            <Building2 size={16} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
              Unidade Gestora
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0c326f' }}>
              UASG 200331
            </span>
          </div>
        </div>
      </header>
    </div>
  );
};
