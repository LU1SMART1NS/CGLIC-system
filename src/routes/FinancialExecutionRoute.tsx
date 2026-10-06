import React, { useMemo, useState } from 'react';
import { PageContainer } from '../design-system/components/PageContainer';
import { useNavigateWithOrigin } from '../hooks/useDetailOrigin';
import { Banknote } from 'lucide-react';
import { ManagementFinancialExecution } from '../components/dashboard/ManagementFinancialExecution';
import { EmpenhosBatchSyncPanel } from '../components/dashboard/EmpenhosBatchSyncPanel';
import { useManagementDashboard } from '../hooks/useManagementDashboard';
import { useAssignedManagementScope } from '../hooks/useAssignedManagementScope';
import { useContractsDashboard } from '../hooks/useContractsDashboard';
import { useBatchSyncContractEmpenhos, contratosParaSincronizar } from '../hooks/useBatchSyncContractEmpenhos';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../design-system/components/HeaderRefreshAction';
import { ActionButton } from '../design-system/components/ActionButton';
import { Tabs } from '../design-system/components/Tabs';
import { UASGS_CGLIC } from '../config/unidadesGestoras';

// Mesmo critério de autorização de sincronização usado no botão individual
// de Contract360Header.tsx, aplicado aqui à sincronização em lote.
const SYNC_AUTHORIZED_ROLES = ['gestor', 'coordenador', 'admin'];

export const FinancialExecutionRoute: React.FC = () => {
  const navigate = useNavigateWithOrigin();
  const { role } = useAuth();
  const isAuthorizedToSync = role !== null && SYNC_AUTHORIZED_ROLES.includes(role);

  // Perfil "gestor" tem escopo ASSIGNED em contratos (role_domain_scopes,
  // migration 20260925000023), agora derivado também das Atas atribuídas
  // (ata_managers): mesmo recorte aplicado em ContractsRoute.tsx e na Visão
  // Geral, agora também na execução financeira agregada aqui.
  // Painel de uma UASG por vez: somar os dois contaria duas vezes o empenho emitido por uma UASG e
  // ligado a contrato da outra (o recorte por UASG mantém os dois casos).
  const [uasg, setUasg] = useState<string>('200331');
  const { contractKeys: assignedContractKeys, ataKeys: assignedAtaKeys, isLoading: isLoadingManagers } =
    useAssignedManagementScope(uasg);

  const { readModel, isLoading: isLoadingDashboard, isFetching, isError, error, refresh, dataUpdatedAt } =
    useManagementDashboard({ uasg, assignedContractKeys, assignedAtaKeys });
  const isLoading = isLoadingDashboard || isLoadingManagers;

  // O lote cobre as duas UASGs da CGLIC, qualquer que seja a aba aberta.
  const { data: contracts200330 } = useContractsDashboard(UASGS_CGLIC[0]);
  const { data: contracts200331 } = useContractsDashboard(UASGS_CGLIC[1]);
  const contratosDoLote = useMemo(
    () => contratosParaSincronizar(contracts200331, contracts200330),
    [contracts200330, contracts200331]
  );
  const {
    run: runBatchSync,
    retryFailed,
    cancel: cancelBatchSync,
    isRunning: isSyncingAll,
    progress: batchProgress,
    summary: batchSummary,
    resetSummary
  } = useBatchSyncContractEmpenhos();

  const [showBatchPanel, setShowBatchPanel] = useState(false);

  const handleNavigateContract = (contractKey: string) => {
    navigate(`/contratos/${encodeURIComponent(contractKey)}`);
  };

  const handleBatchSync = async () => {
    if (!isAuthorizedToSync || isSyncingAll) return;
    setShowBatchPanel(true);
    resetSummary();
    await runBatchSync(contratosDoLote);
    refresh();
  };

  const handleRetryFailed = async () => {
    if (!isAuthorizedToSync || isSyncingAll) return;
    resetSummary();
    await retryFailed();
    refresh();
  };

  return (
    <PageContainer>
      {/* Header da Página Canônico */}
      <PageHeader
        title="Empenhos e Execução"
        subtitle="Execução financeira oficial dos empenhos, liquidações e pagamentos."
        icon={<Banknote size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <ActionButton
              action="sincronizar"
              size="sm"
              onClick={handleBatchSync}
              disabled={!isAuthorizedToSync || isSyncingAll || contratosDoLote.length === 0}
              isLoading={isSyncingAll}
              title={
                !isAuthorizedToSync
                  ? 'Você não possui permissão para sincronizar empenhos.'
                  : `Sincronizar os empenhos dos ${contratosDoLote.length} contratos não expirados das UASGs 200330 e 200331 com o Contratos.gov.br`
              }
              data-testid="financial-execution-batch-sync-btn"
            >
              {isSyncingAll ? 'Sincronizando...' : 'Sincronizar Todos os Empenhos'}
            </ActionButton>

            <HeaderRefreshAction
              onRefresh={() => refresh()}
              isRefreshing={isLoading || isFetching}
              lastUpdated={dataUpdatedAt}
              tooltipTitle="Recarregar dados gerenciais de empenhos e execução financeira"
              dataTestId="financial-execution-refresh-btn"
            />
          </div>
        }
      />

      {showBatchPanel && (
        <EmpenhosBatchSyncPanel
          isSyncingAll={isSyncingAll}
          batchProgress={batchProgress}
          batchSummary={batchSummary}
          isAuthorizedToSync={isAuthorizedToSync}
          onCancel={cancelBatchSync}
          onRetryFailed={handleRetryFailed}
          onClose={() => setShowBatchPanel(false)}
          onOpenContract={handleNavigateContract}
        />
      )}

      <Tabs
        tabs={UASGS_CGLIC.slice().reverse().map((u) => ({ id: u, label: `UASG ${u}` }))}
        activeTabId={uasg}
        onTabChange={setUasg}
        ariaLabel="UASG exibida no painel"
        testId="financial-execution-uasg-tabs"
      />

      <ManagementFinancialExecution
        readModel={readModel}
        isLoading={isLoading}
        isError={isError}
        errorMessage={error?.message}
        onNavigateContract={handleNavigateContract}
        onRefresh={() => refresh()}
      />
    </PageContainer>
  );
};
