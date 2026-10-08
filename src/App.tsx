import React, { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { SelectionProvider, useSelection } from './context/SelectionContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, ConfirmProvider } from './design-system';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import fnspLogo from './assets/fnsp-logo.png';
import { LoginRoute } from './routes/LoginRoute';
import { RequireRole } from './components/auth/RequireRole';
import { AuthLoading } from './components/auth/AuthLayout';
import { AlertRulesGate } from './components/layout/AlertRulesGate';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { temSenhaPendente } from './utils/senhaPendente';

// Cada tela vira um pacote próprio, baixado só quando a rota é aberta. O ExportExcelModal leva o exceljs
// junto e só é baixado quando o modal abre. A tela de login fica no pacote principal (é a primeira de quem ainda não entrou).
const GestaoInstrumentosRoute = lazy(() => import('./routes/GestaoInstrumentosRoute').then((m) => ({ default: m.GestaoInstrumentosRoute })));
const ArpSearchRoute = lazy(() => import('./routes/ArpSearchRoute').then((m) => ({ default: m.ArpSearchRoute })));
const ItemBalancesRoute = lazy(() => import('./routes/ItemBalancesRoute').then((m) => ({ default: m.ItemBalancesRoute })));
const ItensRoute = lazy(() => import('./routes/ItensRoute').then((m) => ({ default: m.ItensRoute })));
const DistribuicaoEquipeRoute = lazy(() => import('./routes/DistribuicaoEquipeRoute').then((m) => ({ default: m.DistribuicaoEquipeRoute })));
const ContratosAtaPage = lazy(() => import('./components/vinculacao/ContratosAtaPage').then((m) => ({ default: m.ContratosAtaPage })));
const EmpenhosItensPage = lazy(() => import('./components/vinculacao/EmpenhosItensPage').then((m) => ({ default: m.EmpenhosItensPage })));
const EmpenhosContratoPage = lazy(() => import('./components/vinculacao/EmpenhosContratoPage').then((m) => ({ default: m.EmpenhosContratoPage })));
const ItensUnidadesPage = lazy(() => import('./components/alocacao/ItensUnidadesPage').then((m) => ({ default: m.ItensUnidadesPage })));
const ContractsRoute = lazy(() => import('./routes/ContractsRoute').then((m) => ({ default: m.ContractsRoute })));
const Contract360Route = lazy(() => import('./routes/Contract360Route').then((m) => ({ default: m.Contract360Route })));
const Ata360Route = lazy(() => import('./routes/Ata360Route').then((m) => ({ default: m.Ata360Route })));
const ModelosGestaoRoute = lazy(() => import('./routes/ModelosGestaoRoute').then((m) => ({ default: m.ModelosGestaoRoute })));
const UsersRoute = lazy(() => import('./routes/UsersRoute').then((m) => ({ default: m.UsersRoute })));
const RolesRoute = lazy(() => import('./routes/RolesRoute').then((m) => ({ default: m.RolesRoute })));
const DepartmentsRoute = lazy(() => import('./routes/DepartmentsRoute').then((m) => ({ default: m.DepartmentsRoute })));
const PaymentsRoute = lazy(() => import('./routes/PaymentsRoute').then((m) => ({ default: m.PaymentsRoute })));
const PrevisaoRoute = lazy(() => import('./routes/PrevisaoRoute').then((m) => ({ default: m.PrevisaoRoute })));
const FinancialExecutionRoute = lazy(() => import('./routes/FinancialExecutionRoute').then((m) => ({ default: m.FinancialExecutionRoute })));
const DefinirSenhaRoute = lazy(() => import('./routes/DefinirSenhaRoute').then((m) => ({ default: m.DefinirSenhaRoute })));
const RedefinirSenhaRoute = lazy(() => import('./routes/RedefinirSenhaRoute').then((m) => ({ default: m.RedefinirSenhaRoute })));
const AlertRulesRoute = lazy(() => import('./routes/AlertRulesRoute').then((m) => ({ default: m.AlertRulesRoute })));
const HolidaysRoute = lazy(() => import('./routes/HolidaysRoute').then((m) => ({ default: m.HolidaysRoute })));
const ExportExcelModal = lazy(() => import('./components/modals/ExportExcelModal').then((m) => ({ default: m.ExportExcelModal })));

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
    background: 'var(--primary)',
    color: '#ffffff',
    padding: '0.4rem var(--page-gutter)',
    fontSize: '0.75rem',
    fontFamily: 'var(--font-family)',
    marginTop: 0,
    borderTop: '2px solid #00cc55'
  }}>
    {/* Espelha a barra gov.br do topo: marca | órgão à esquerda, metadado à direita. */}
    <div className="app-footer-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem 1.5rem' }}>
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
        color: 'var(--primary)',
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

  // Convite aceito, mas a senha ainda não foi criada: só a tela de primeiro acesso.
  if (temSenhaPendente(user)) {
    return <Navigate to="/definir-senha" replace />;
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
      <Suspense fallback={<AuthLoading />}>
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
            <Route path="/vinculacao" element={<Navigate to="/vinculacao/contratos" replace />} />
            <Route
              path="/vinculacao/contratos"
              element={
                <RequireRole allowedRoles={['admin', 'gestor', 'leitor']}>
                  <ContratosAtaPage />
                </RequireRole>
              }
            />
            <Route
              path="/vinculacao/empenhos-itens"
              element={
                <RequireRole allowedRoles={['admin', 'gestor', 'leitor']}>
                  <EmpenhosItensPage />
                </RequireRole>
              }
            />
            <Route
              path="/vinculacao/empenhos-contrato"
              element={
                <RequireRole allowedRoles={['admin', 'gestor', 'leitor']}>
                  <EmpenhosContratoPage />
                </RequireRole>
              }
            />
            <Route path="/vinculacao/itens-unidades" element={<Navigate to="/alocacao" replace />} />
            <Route
              path="/alocacao"
              element={
                <RequireRole allowedRoles={['admin', 'gestor', 'gestor_saldos', 'leitor']}>
                  <ItensUnidadesPage />
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
              path="/pagamentos/previsao"
              element={
                <RequireRole allowedRoles={['admin', 'gestor', 'leitor']}>
                  <PrevisaoRoute />
                </RequireRole>
              }
            />
            {/* A previsão era uma aba do Financeiro (PR #56): o endereço antigo leva à lista de contratos dela. */}
            <Route path="/previsao" element={<Navigate to="/pagamentos/previsao?visao=contratos" replace />} />
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
      </Suspense>

      {isExportModalOpen && (
        <Suspense fallback={null}>
          <ExportExcelModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            atas={globalArps}
            itemsByAta={globalItemsByAta}
            selectedAta={selectedArp}
          />
        </Suspense>
      )}

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
