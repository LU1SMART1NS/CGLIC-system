import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { SelectionProvider, useSelection } from './context/SelectionContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { isSupabaseConfigured } from './services/supabaseClient';
import { GestaoInstrumentosRoute } from './routes/GestaoInstrumentosRoute';
import { ArpSearchRoute } from './routes/ArpSearchRoute';
import { ArpItemsRoute } from './routes/ArpItemsRoute';
import { ItemBalancesRoute } from './routes/ItemBalancesRoute';
import { AllocationsRoute } from './routes/AllocationsRoute';
import { ContractsRoute } from './routes/ContractsRoute';
import { Contract360Route } from './routes/Contract360Route';
import { ContractTaskTemplatesRoute } from './routes/ContractTaskTemplatesRoute';
import { UsersRoute } from './routes/UsersRoute';
import { RolesRoute } from './routes/RolesRoute';
import { DepartmentsRoute } from './routes/DepartmentsRoute';
import { PaymentsRoute } from './routes/PaymentsRoute';
import { FinancialExecutionRoute } from './routes/FinancialExecutionRoute';
import { LoginRoute } from './routes/LoginRoute';
import { DefinirSenhaRoute } from './routes/DefinirSenhaRoute';
import { RedefinirSenhaRoute } from './routes/RedefinirSenhaRoute';
import { SeiManagementModal } from './components/SeiManagementModal';
import { ExportExcelModal } from './components/modals/ExportExcelModal';
import { ContractTaskTemplatesModal } from './components/modals/ContractTaskTemplatesModal';
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

/**
 * Redirecionamento de compatibilidade para rotas legadas ("/" e "/prazos"),
 * absorvidas pela Gestão de Instrumentos (/instrumentos). Preserva a query
 * string (ex.: ?severity=CRITICA) para não quebrar favoritos e links internos.
 */
const LegacyRouteRedirect: React.FC<{ to: string }> = ({ to }) => {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
};

const ProtectedLayout: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        color: '#0c326f',
        fontSize: '0.9rem',
        fontWeight: 600
      }}>
        Verificando credenciais governamentais...
      </div>
    );
  }

  if (isSupabaseConfigured && !user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const [isSeiModalOpen, setIsSeiModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isContractTemplatesModalOpen, setIsContractTemplatesModalOpen] = useState<boolean>(false);
  const { selectedArp, globalArps, globalItemsByAta } = useSelection();

  return (
    <div className="app-container">
      <Routes>
        {/* Rotas Públicas de Acesso e Credenciamento */}
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/definir-senha" element={<DefinirSenhaRoute />} />
        <Route path="/redefinir-senha" element={<RedefinirSenhaRoute />} />

        {/* Rotas Protegidas do Sistema */}
        <Route
          element={
            <ProtectedLayout>
              <AppShell
                onOpenExportModal={() => setIsExportModalOpen(true)}
                onOpenContractTemplatesModal={() => setIsContractTemplatesModalOpen(true)}
                onOpenSeiModal={() => setIsSeiModalOpen(true)}
              />
            </ProtectedLayout>
          }
        >
          <Route path="/" element={<LegacyRouteRedirect to="/instrumentos" />} />
          <Route path="/instrumentos" element={<GestaoInstrumentosRoute />} />
          <Route path="/atas" element={<ArpSearchRoute />} />
          <Route path="/atas/itens" element={<ArpItemsRoute />} />
          <Route path="/atas/itens/saldo" element={<ItemBalancesRoute />} />
          <Route path="/atas/saldos-unidade" element={<AllocationsRoute />} />
          <Route path="/contratos" element={<ContractsRoute />} />
          <Route path="/contratos/modelos" element={<ContractTaskTemplatesRoute />} />
          <Route path="/contratos/:contractKey" element={<Contract360Route />} />
          <Route path="/prazos" element={<LegacyRouteRedirect to="/instrumentos" />} />
          <Route path="/pagamentos" element={<PaymentsRoute />} />
          <Route path="/empenhos" element={<FinancialExecutionRoute />} />
          <Route path="/admin/departamentos" element={<DepartmentsRoute />} />
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

      <AppFooter />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SelectionProvider>
            <AppContent />
          </SelectionProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
