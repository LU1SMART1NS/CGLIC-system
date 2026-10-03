import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { breakpoints } from '../../design-system/tokens';
import { useMediaQuery } from '../../design-system/hooks/useMediaQuery';
import { Header } from '../Header';
import { Sidebar } from './Sidebar';

export interface AppShellContextValue {
  onOpenExportModal: () => void;
  onOpenDepartmentsModal?: () => void;
}

interface AppShellProps {
  onOpenExportModal: () => void;
  onOpenDepartmentsModal?: () => void;
}

const SIDEBAR_COLLAPSED_KEY = 'saldoarp:sidebar-collapsed';

function readStoredCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored !== null) return stored === '1';
  } catch {
    // storage indisponível: cai no padrão por largura
  }
  // Sem preferência salva: tablet (768–1023px) começa recolhida.
  return typeof window !== 'undefined' && window.innerWidth < breakpoints.lg;
}

export const AppShell: React.FC<AppShellProps> = ({
  onOpenExportModal,
  onOpenDepartmentsModal
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(readStoredCollapsed);
  // < 768px: sidebar vira drawer off-canvas aberto pelo botão de menu do Header.
  const isMobile = useMediaQuery(`(max-width: ${breakpoints.md - 1}px)`);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  // Fecha ao navegar e ao sair do modo mobile.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search, isMobile]);

  // Esc fecha o drawer e a rolagem do fundo fica travada enquanto aberto.
  useEffect(() => {
    if (!isMobile || !drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, drawerOpen, closeDrawer]);

  const expandSidebar = () => {
    setCollapsed(false);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '0');
    } catch {
      // preferência apenas de UI
    }
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // preferência apenas de UI; segue sem persistir se storage indisponível
      }
      return next;
    });
  };

  const contextValue: AppShellContextValue = {
    onOpenExportModal,
    onOpenDepartmentsModal
  };

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: '#f8fafc' }}>
      {isMobile && drawerOpen && (
        <div
          className="app-drawer-overlay"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}
      <Sidebar
        mode={isMobile ? 'drawer' : 'desktop'}
        drawerOpen={drawerOpen}
        onCloseDrawer={closeDrawer}
        collapsed={isMobile ? false : collapsed}
        onToggleCollapsed={toggleCollapsed}
        onRequestExpand={expandSidebar}
        onOpenExportModal={onOpenExportModal}
        onOpenDepartmentsModal={onOpenDepartmentsModal}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: '#ffffff',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          borderBottom: '1px solid #e2e8f0'
        }}>
          <Header
            onOpenExportModal={onOpenExportModal}
            showMenuButton={isMobile}
            menuOpen={drawerOpen}
            menuButtonRef={menuButtonRef}
            onOpenMenu={() => setDrawerOpen(true)}
          />
        </div>

        <main className="app-main" style={{ flex: 1 }}>
          <Outlet context={contextValue} />
        </main>
      </div>
    </div>
  );
};
