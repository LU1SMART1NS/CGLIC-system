import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { SelectionProvider, useSelection } from './context/SelectionContext';
import { HomeRoute } from './routes/HomeRoute';
import { ArpSearchRoute } from './routes/ArpSearchRoute';
import { ArpItemsRoute } from './routes/ArpItemsRoute';
import { ItemBalancesRoute } from './routes/ItemBalancesRoute';
import { AllocationsRoute } from './routes/AllocationsRoute';
import { ContractsDashboard } from './components/ContractsDashboard';
import { Contract360Route } from './routes/Contract360Route';
import { CentralPrazosRoute } from './routes/CentralPrazosRoute';
import { UsersRoute } from './routes/UsersRoute';
import { RolesRoute } from './routes/RolesRoute';
import { SeiManagementModal } from './components/SeiManagementModal';
import { ExportExcelModal } from './components/modals/ExportExcelModal';
import { ContractTaskTemplatesModal } from './components/modals/ContractTaskTemplatesModal';
import { ManageDepartmentsModal } from './components/ManageDepartmentsModal';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

const AppFooter: React.FC = () => (
  <footer style={{
    background: '#0c326f',
    color: '#ffffff',
    padding: '2.5rem 3rem',
    fontSize: '0.82rem',
    fontFamily: 'var(--font-family)',
    marginTop: '5rem',
    borderTop: '4px solid #00cc55'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem', maxWidth: '1800px', margin: '0 auto' }}>
      <div>
        <p style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.25rem', color: '#ffffff' }}>
          Ministério da Justiça e Segurança Pública
        </p>
        <p style={{ opacity: 0.9, color: '#e2e8f0' }}>
          Secretaria Nacional de Segurança Pública — SENASP | Controle de Saldos de Atas de Registro de Preços
        </p>
        <p style={{ opacity: 0.7, fontSize: '0.75rem', marginTop: '0.5rem', color: '#cbd5e1' }}>
          © {new Date().getFullYear()} Governo Federal. Todos os direitos reservados. Padrão Visual Institucional BR-DS / MJSP.
        </p>
      </div>
      <div style={{ textAlign: 'right', opacity: 0.9 }}>
        <p style={{ fontWeight: 700, color: '#ffffff' }}>Dados Oficiais das APIs Compras.gov.br e PNCP</p>
        <p style={{ fontSize: '0.78rem', marginTop: '0.2rem', opacity: 0.8, color: '#cbd5e1' }}>
          Sincronizado com os dados abertos do Governo Federal e licitações públicas.
        </p>
      </div>
    </div>
  </footer>
);

const AppContent: React.FC = () => {
  const [isSeiModalOpen, setIsSeiModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isContractTemplatesModalOpen, setIsContractTemplatesModalOpen] = useState<boolean>(false);
  const [isDepartmentsModalOpen, setIsDepartmentsModalOpen] = useState<boolean>(false);
  const { selectedArp, globalArps, globalItemsByAta } = useSelection();

  return (
    <div className="app-container">
      <Routes>
        <Route
          element={
            <AppShell
              onOpenExportModal={() => setIsExportModalOpen(true)}
              onOpenContractTemplatesModal={() => setIsContractTemplatesModalOpen(true)}
              onOpenSeiModal={() => setIsSeiModalOpen(true)}
              onOpenDepartmentsModal={() => setIsDepartmentsModalOpen(true)}
            />
          }
        >
          <Route path="/" element={<HomeRoute />} />
          <Route path="/atas" element={<ArpSearchRoute />} />
          <Route path="/atas/itens" element={<ArpItemsRoute />} />
          <Route path="/atas/itens/saldo" element={<ItemBalancesRoute />} />
          <Route path="/atas/saldos-unidade" element={<AllocationsRoute />} />
          <Route path="/contratos" element={<ContractsDashboard />} />
          <Route path="/contratos/:contractKey" element={<Contract360Route />} />
          <Route path="/prazos" element={<CentralPrazosRoute />} />
          <Route path="/admin/usuarios" element={<UsersRoute />} />
          <Route path="/admin/perfis" element={<RolesRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>

      <SeiManagementModal
        isOpen={isSeiModalOpen}
        onClose={() => setIsSeiModalOpen(false)}
      />

      <ExportExcelModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        atas={globalArps}
        itemsByAta={globalItemsByAta}
        selectedAta={selectedArp}
      />

      <ContractTaskTemplatesModal
        isOpen={isContractTemplatesModalOpen}
        onClose={() => setIsContractTemplatesModalOpen(false)}
      />

      <ManageDepartmentsModal
        isOpen={isDepartmentsModalOpen}
        onClose={() => setIsDepartmentsModalOpen(false)}
      />

      <AppFooter />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SelectionProvider>
          <AppContent />
        </SelectionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
