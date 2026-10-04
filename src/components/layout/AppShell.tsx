import React, { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { breakpoints } from '../../design-system/tokens';
import { useMediaQuery } from '../../design-system/hooks/useMediaQuery';
import { Header } from '../Header';
import { Sidebar } from './Sidebar';
import { AreaTabs } from './AreaTabs';

export interface AppShellContextValue {
  onOpenExportModal: () => void;
  onOpenDepartmentsModal?: () => void;
}

interface AppShellProps {
  onOpenExportModal: () => void;
  onOpenDepartmentsModal?: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  onOpenExportModal,
  onOpenDepartmentsModal
}) => {
  // < 768px: o menu chave vira barra inferior.
  const isMobile = useMediaQuery(`(max-width: ${breakpoints.md - 1}px)`);

  // Publica a altura do cabeçalho fixo (--app-header-h) para o que gruda logo abaixo dele, como a barra de abas das telas 360.
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stickyHeaderRef.current;
    const content = el?.parentElement;
    if (!el || !content) return;
    const publish = () => content.style.setProperty('--app-header-h', `${el.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const contextValue: AppShellContextValue = {
    onOpenExportModal,
    onOpenDepartmentsModal
  };

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: '#f8fafc' }}>
      {!isMobile && <Sidebar mode="rail" />}

      <div className="app-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div ref={stickyHeaderRef} style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: '#ffffff',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          borderBottom: '1px solid #e2e8f0'
        }}>
          <Header onOpenExportModal={onOpenExportModal} />
        </div>

        <main className="app-main" style={{ flex: 1 }}>
          <AreaTabs />
          <Outlet context={contextValue} />
        </main>
      </div>

      {isMobile && <Sidebar mode="bottom" />}
    </div>
  );
};
