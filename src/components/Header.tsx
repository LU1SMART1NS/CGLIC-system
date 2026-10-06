import React from 'react';
import { useAuth } from '../context/AuthContext';
import { UserMenu } from './UserMenu';
import govbrLogo from '../assets/govbr-logo.svg';

interface HeaderProps {
  onOpenExportModal?: () => void;
}

export const Header: React.FC<HeaderProps> = () => {
  const { user } = useAuth();
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Gov.br Federal Identity Topbar */}
      <div className="app-header-topbar" style={{
        background: 'var(--primary)',
        color: '#ffffff',
        paddingTop: '0.25rem',
        paddingBottom: '0.25rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '2px solid #00cc55',
        fontFamily: 'var(--font-family)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <img
            src={govbrLogo}
            alt="gov.br"
            style={{ height: '15px', width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }}
          />
          <span style={{ opacity: 0.5, margin: '0 0.25rem' }}>|</span>
          <span className="app-header-org-full" style={{ fontWeight: 600, opacity: 0.95 }}>Ministério da Justiça e Segurança Pública</span>
          {/* Celular: sem menu lateral, a marca do produto assume o lugar do nome do órgão. */}
          <span className="app-header-wordmark" aria-label="ComprasSUSP" style={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
            <span style={{ fontWeight: 500 }}>Compras</span>SUSP
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Grupo institucional (gov.br): discreto, some primeiro quando a tela estreita. */}
          <div className="gov-topbar-links">
            <a href="https://www.gov.br/mj/pt-br" target="_blank" rel="noopener noreferrer">Portal MJSP</a>
            <a href="https://www.gov.br/pt-br/orgaos-do-governo" target="_blank" rel="noopener noreferrer">Órgãos do Governo</a>
            <a href="https://www.gov.br/acessoainformacao/pt-br" target="_blank" rel="noopener noreferrer">Acesso à Informação</a>
          </div>
          {user && (
            <>
              <span className="gov-topbar-divider" aria-hidden="true" />
              <UserMenu />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
