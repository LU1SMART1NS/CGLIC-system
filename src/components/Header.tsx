import React from 'react';
import { FileText, Building2, FileSpreadsheet } from 'lucide-react';

interface HeaderProps {
  activeView?: 'search' | 'items' | 'balances' | 'allocations';
  onNavigateView?: (view: 'search' | 'allocations') => void;
  onOpenSeiModal?: () => void;
  onOpenExportModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeView = 'search',
  onNavigateView,
  onOpenExportModal
}) => {
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
        padding: '1.1rem 3rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
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
              Ministério da Justiça e Segurança Pública
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0.1rem 0 0 0', letterSpacing: '-0.02em', borderBottom: 'none', paddingBottom: 0 }}>
              SaldoARP <span style={{ fontWeight: 400, fontSize: '1.1rem', color: '#475569' }}>| Gestão de Registro de Preços</span>
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.1rem 0 0 0', fontWeight: 500 }}>
              Secretaria Nacional de Segurança Pública — SENASP
            </p>
          </div>
        </div>

        {/* View Switcher Navigation */}
        {onNavigateView && (
          <nav style={{ display: 'flex', gap: '0.5rem', background: '#f1f5f9', padding: '0.35rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => onNavigateView('search')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: activeView !== 'allocations' ? '#ffffff' : 'transparent',
                color: activeView !== 'allocations' ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: activeView !== 'allocations' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'var(--transition)'
              }}
            >
              <FileText size={15} /> Visão por Atas
            </button>
            <button
              type="button"
              onClick={() => onNavigateView('allocations')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: activeView === 'allocations' ? '#ffffff' : 'transparent',
                color: activeView === 'allocations' ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: activeView === 'allocations' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'var(--transition)'
              }}
            >
              <Building2 size={15} /> Saldos por Unidade Interna
            </button>
            {onOpenExportModal && (
              <button
                type="button"
                onClick={onOpenExportModal}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #10b981',
                  background: '#ecfdf5',
                  color: '#065f46',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(16, 185, 129, 0.15)',
                  transition: 'var(--transition)'
                }}
                title="Exportar Relatório em Planilha Excel Parametrizável"
              >
                <FileSpreadsheet size={16} color="#059669" /> Exportar Excel (.xlsx)
              </button>
            )}
          </nav>
        )}

      </header>
    </div>
  );
};

