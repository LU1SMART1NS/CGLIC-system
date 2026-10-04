import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { SelectionProvider, useSelection } from './context/SelectionContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, ConfirmProvider } from './design-system';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import fnspLogo from './assets/fnsp-logo.png';
import { GestaoInstrumentosRoute } from './routes/GestaoInstrumentosRoute';
import { ArpSearchRoute } from './routes/ArpSearchRoute';
import { ItemBalancesRoute } from './routes/ItemBalancesRoute';
import { ItensRoute } from './routes/ItensRoute';
import { DistribuicaoEquipeRoute } from './routes/DistribuicaoEquipeRoute';
import { ContractsRoute } from './routes/ContractsRoute';
import { Contract360Route } from './routes/Contract360Route';
import { Ata360Route } from './routes/Ata360Route';
import { ModelosGestaoRoute } from './routes/ModelosGestaoRoute';
import { UsersRoute } from './routes/UsersRoute';
import { RolesRoute } from './routes/RolesRoute';
import { DepartmentsRoute } from './routes/DepartmentsRoute';
import { PaymentsRoute } from './routes/PaymentsRoute';
import { FinancialExecutionRoute } from './routes/FinancialExecutionRoute';
import { LoginRoute } from './routes/LoginRoute';
import { DefinirSenhaRoute } from './routes/DefinirSenhaRoute';
import { RedefinirSenhaRoute } from './routes/RedefinirSenhaRoute';
import { RequireRole } from './components/auth/RequireRole';
import { AlertRulesGate } from './components/layout/AlertRulesGate';
import { AlertRulesRoute } from './routes/AlertRulesRoute';
import { HolidaysRoute } from './routes/HolidaysRoute';
import { ExportExcelModal } from './components/modals/ExportExcelModal';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

const AuthRedirectHandler: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Intercepta parâmetros de hash do Supabase Auth nos e-mails de convite e recuperação
    const hash = window.location.hash;
    if (hash && hash.startsWith('#')) {
      const params = new URLSearchParams(hash.substring(1));
      const type = params.get('type');
      if (type === 'invite') {
        if (location.pathname !== '/definir-senha') {
          navigate('/definir-senha', { replace: true });
          return;
        }
      } else if (type === 'recovery') {
        if (location.pathname !== '/redefinir-senha') {
          navigate('/redefinir-senha', { replace: true });
          return;
        }
      }
    }

    if (isSupabaseConfigured && supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          if (location.pathname !== '/redefinir-senha' && location.pathname !== '/definir-senha') {
            navigate('/redefinir-senha', { replace: true });
          }
        }
      });
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [navigate, location.pathname]);

  return null;
};

const AppFooter: React.FC = () => (
  <footer className="app-footer" style={{
    background: '#0c326f',
    color: '#ffffff',
    padding: '0.4rem var(--page-gutter)',
    fontSize: '0.75rem',
    fontFamily: 'var(--font-family)',
    marginTop: 0,
    borderTop: '2px solid #00cc55'
  }}>
    {/* Espelha a barra gov.br do topo: marca | órgão à esquerda, metadado à direita. */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <img
          src={fnspLogo}
          alt="FNSP"
          style={{ height: '12px', width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }}
        />
        <span className="app-footer-full" aria-hidden="true" style={{ opacity: 0.5, margin: '0 0.25rem' }}>|</span>
        <span className="app-footer-full" style={{ fontWeight: 600, opacity: 0.95 }}>Fundo Nacional de Segurança Pública</span>
      </div>
      <p className="app-footer-source" style={{ margin: 0, color: '#cbd5e1', opacity: 0.85, textAlign: 'right' }}>
        Dados: Compras.gov.br e PNCP · © {new Date().getFullYear()}
      </p>
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

  // Intercepta acessos diretos via token de convite ou recuperação na URL
  if (typeof window !== 'undefined' && window.location.hash?.includes('type=invite')) {
    return <Navigate to="/definir-senha" replace />;
  }

  if (typeof window !== 'undefined' && window.location.hash?.includes('type=recovery')) {
    return <Navigate to="/redefinir-senha" replace />;
  }

  if (isSupabaseConfigured && !user) {
    return <Navigate to="/login" replace />;
  }

  return <AlertRulesGate>{children}</AlertRulesGate>;
};

const AppContent: React.FC = () => {
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const { selectedArp, globalArps, globalItemsByAta } = useSelection();
  const { pathname } = useLocation();
  const isPublicAuthRoute = ['/login', '/definir-senha', '/redefinir-senha'].includes(pathname);

  return (
    <div className="app-container">
      <AuthRedirectHandler />
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
              />
            </ProtectedLayout>
          }
        >
          <Route path="/" element={<LegacyRouteRedirect to="/instrumentos" />} />
          <Route
            path="/instrumentos"
            element={
              <RequireRole allowedRoles={['admin', 'gestor', 'gestor_saldos', 'leitor']}>
                <GestaoInstrumentosRoute />
              </RequireRole>
            }
          />
          <Route
            path="/atas"
            element={
              <RequireRole allowedRoles={['admin', 'gestor', 'gestor_saldos', 'leitor']}>
                <ArpSearchRoute />
              </RequireRole>
            }
          />
          <Route
            path="/itens"
            element={
              <RequireRole allowedRoles={['admin', 'gestor', 'gestor_saldos', 'leitor']}>
                <ItensRoute />
              </RequireRole>
            }
          />
          {/* Páginas antigas da Carteira, absorvidas pela aba Itens (unidade interna é filtro). */}
          <Route path="/atas/saldos-unidade" element={<LegacyRouteRedirect to="/itens" />} />
          <Route path="/atas/orgaos-participantes" element={<LegacyRouteRedirect to="/itens" />} />
          <Route
            path="/atas/distribuicao"
            element={
              <RequireRole allowedRoles={['admin', 'leitor']}>
                <DistribuicaoEquipeRoute />
              </RequireRole>
            }
          />
          <Route
            path="/configuracoes/modelos"
            element={
              <RequireRole allowedRoles={['admin', 'gestor']}>
                <ModelosGestaoRoute />
              </RequireRole>
            }
          />
          <Route path="/atas/modelos" element={<LegacyRouteRedirect to="/configuracoes/modelos?tipo=atas" />} />
          <Route path="/contratos/modelos" element={<LegacyRouteRedirect to="/configuracoes/modelos?tipo=contratos" />} />
          <Route
            path="/atas/detalhe/:ataKey"
            element={
              <RequireRole allowedRoles={['admin', 'gestor', 'gestor_saldos', 'leitor']}>
                <Ata360Route />
              </RequireRole>
            }
          />
          <Route
            path="/atas/detalhe/:ataKey/itens/:numeroItem"
            element={
              <RequireRole allowedRoles={['admin', 'gestor', 'gestor_saldos', 'leitor']}>
                <ItemBalancesRoute />
              </RequireRole>
            }
          />
          <Route
            path="/contratos"
            element={
              <RequireRole allowedRoles={['admin', 'gestor', 'leitor']}>
                <ContractsRoute />
              </RequireRole>
            }
          />
          <Route
            path="/contratos/:contractKey"
            element={
              <RequireRole allowedRoles={['admin', 'gestor', 'leitor']}>
                <Contract360Route />
              </RequireRole>
            }
          />
          <Route path="/prazos" element={<LegacyRouteRedirect to="/instrumentos" />} />
          <Route
            path="/pagamentos"
            element={
              <RequireRole allowedRoles={['admin', 'gestor', 'leitor']}>
                <PaymentsRoute />
              </RequireRole>
            }
          />
          <Route
            path="/empenhos"
            element={
              <RequireRole allowedRoles={['admin', 'gestor', 'leitor']}>
                <FinancialExecutionRoute />
              </RequireRole>
            }
          />
          <Route
            path="/admin/departamentos"
            element={
              <RequireRole allowedRoles={['admin', 'gestor', 'gestor_saldos', 'leitor']}>
                <DepartmentsRoute />
              </RequireRole>
            }
          />
          <Route
            path="/admin/usuarios"
            element={
              <RequireRole allowedRoles={['admin']}>
                <UsersRoute />
              </RequireRole>
            }
          />
          <Route
            path="/admin/perfis"
            element={
              <RequireRole allowedRoles={['admin']}>
                <RolesRoute />
              </RequireRole>
            }
          />
          <Route
            path="/admin/regras-alertas"
            element={
              <RequireRole allowedRoles={['admin']}>
                <AlertRulesRoute />
              </RequireRole>
            }
          />
          <Route
            path="/admin/feriados"
            element={
              <RequireRole allowedRoles={['admin']}>
                <HolidaysRoute />
              </RequireRole>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>

      <ExportExcelModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        atas={globalArps}
        itemsByAta={globalItemsByAta}
        selectedAta={selectedArp}
      />

      {!isPublicAuthRoute && <AppFooter />}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <SelectionProvider>
                <AppContent />
              </SelectionProvider>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
