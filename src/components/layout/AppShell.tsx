import React, { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { breakpoints } from '../../design-system/tokens';
import { useMediaQuery } from '../../design-system/hooks/useMediaQuery';
import { Header } from '../Header';
import { Sidebar } from './Sidebar';
import { AreaTabs } from './AreaTabs';
import { useSincronizacaoEmSegundoPlano } from '../../hooks/useSincronizacaoEmSegundoPlano';

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
  // Gestor e coordenador: atualizam contratos e atas no banco em segundo plano quando passam da validade.
  useSincronizacaoEmSegundoPlano();

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

  // Publica a altura real da barra inferior do celular (--bottom-nav-h, já com a área segura) para o rodapé e o
  // conteúdo reservarem exatamente esse espaço: uma altura escrita à mão ficava curta e a barra comia a folga do rodapé.
  useEffect(() => {
    if (!isMobile) return;
    const root = document.documentElement;
    const nav = document.querySelector<HTMLElement>('.app-bottom-nav');
    if (!nav) return;
    const publish = () => root.style.setProperty('--bottom-nav-h', `${nav.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(publish);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--bottom-nav-h');
    };
  }, [isMobile]);

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
          // Sem filete cinza: a linha verde do gov.br já separa o cabeçalho, e um 1px claro aparecia entre ela e a barra azul fixa.
          borderBottom: 'none'
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
