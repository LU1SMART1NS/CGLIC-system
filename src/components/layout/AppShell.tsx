import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../Header';
import { Sidebar } from './Sidebar';
import { Breadcrumbs } from './Breadcrumbs';

export interface AppShellContextValue {
  onOpenExportModal: () => void;
  onOpenContractTemplatesModal: () => void;
  onOpenSeiModal: () => void;
  onOpenDepartmentsModal: () => void;
}

interface AppShellProps {
  onOpenExportModal: () => void;
  onOpenContractTemplatesModal: () => void;
  onOpenSeiModal: () => void;
  onOpenDepartmentsModal: () => void;
}

const SIDEBAR_COLLAPSED_KEY = 'saldoarp:sidebar-collapsed';

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export const AppShell: React.FC<AppShellProps> = ({
  onOpenExportModal,
  onOpenContractTemplatesModal,
  onOpenSeiModal,
  onOpenDepartmentsModal
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(readStoredCollapsed);

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
    onOpenContractTemplatesModal,
    onOpenSeiModal,
    onOpenDepartmentsModal
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onOpenContractTemplatesModal={onOpenContractTemplatesModal}
        onOpenExportModal={onOpenExportModal}
        onOpenSeiModal={onOpenSeiModal}
        onOpenDepartmentsModal={onOpenDepartmentsModal}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header
          onOpenExportModal={onOpenExportModal}
          onOpenContractTemplatesModal={onOpenContractTemplatesModal}
        />

        <Breadcrumbs />

        <main style={{ flex: 1 }}>
          <Outlet context={contextValue} />
        </main>
      </div>
    </div>
  );
};
