import React, { useState } from 'react';
import { PageContainer } from '../design-system/components/PageContainer';
import { useNavigateWithOrigin } from '../hooks/useDetailOrigin';
import { Banknote, RefreshCw, Loader2, CheckCircle2, XCircle, X } from 'lucide-react';
import { ManagementFinancialExecution } from '../components/dashboard/ManagementFinancialExecution';
import { useManagementDashboard } from '../hooks/useManagementDashboard';
import { useAssignedManagementScope } from '../hooks/useAssignedManagementScope';
import { useContractsDashboard } from '../hooks/useContractsDashboard';
import { useBatchSyncContractEmpenhos } from '../hooks/useBatchSyncContractEmpenhos';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../design-system/components/HeaderRefreshAction';
import { AppButton } from '../design-system/components/AppButton';
import { colors, shapes } from '../design-system/tokens';

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
  const { contractKeys: assignedContractKeys, ataKeys: assignedAtaKeys, isLoading: isLoadingManagers } =
    useAssignedManagementScope('200331');

  const { readModel, isLoading: isLoadingDashboard, isFetching, isError, error, refresh, dataUpdatedAt } =
    useManagementDashboard({ uasg: '200331', assignedContractKeys, assignedAtaKeys });
  const isLoading = isLoadingDashboard || isLoadingManagers;

  const { data: allContracts } = useContractsDashboard('200331');
  const { run: runBatchSync, cancel: cancelBatchSync, isRunning: isSyncingAll, progress: batchProgress, summary: batchSummary, resetSummary } =
    useBatchSyncContractEmpenhos();

  const [showBatchPanel, setShowBatchPanel] = useState(false);

  const handleNavigateContract = (contractKey: string) => {
    navigate(`/contratos/${encodeURIComponent(contractKey)}`);
  };

  const handleBatchSync = async () => {
    if (!isAuthorizedToSync || isSyncingAll) return;
    const contracts = (allContracts || []).filter((c) => c.statusVigencia !== 'Expirado');
    setShowBatchPanel(true);
    resetSummary();
    await runBatchSync(contracts);
    refresh();
  };

  const batchTone = !batchSummary ? colors.semantic.info : batchSummary.erro ? colors.semantic.warning : colors.semantic.success;

  return (
    <PageContainer>
      {/* Header da Página Canônico */}
      <PageHeader
        title="Empenhos e Execução"
        subtitle="Execução financeira oficial dos empenhos, liquidações e pagamentos."
        icon={<Banknote size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <AppButton
              variant="outline"
              size="sm"
              onClick={handleBatchSync}
              disabled={!isAuthorizedToSync || isSyncingAll || !allContracts?.length}
              isLoading={isSyncingAll}
              icon={<RefreshCw size={13} />}
              title={
                !isAuthorizedToSync
                  ? 'Você não possui permissão para sincronizar empenhos.'
                  : 'Sincronizar empenhos de todos os contratos ativos nas fontes governamentais oficiais (Contratos.gov.br / PNCP)'
              }
              data-testid="financial-execution-batch-sync-btn"
            >
              {isSyncingAll ? 'Sincronizando...' : 'Sincronizar Todos os Empenhos'}
            </AppButton>

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
        <div
          role="status"
          data-testid="financial-execution-batch-panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            borderRadius: shapes.radius.md,
            border: `1px solid ${batchTone.border}`,
            backgroundColor: batchTone.bg,
            color: batchTone.text
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', fontWeight: 600 }}>
            {isSyncingAll ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                <span>
                  Sincronizando contratos {batchProgress?.current ?? 0}/{batchProgress?.total ?? 0}
                  {batchProgress?.percent !== undefined ? ` (${batchProgress.percent}%)` : ''}
                </span>
              </>
            ) : batchSummary ? (
              <>
                {batchSummary.erro > 0 ? (
                  <XCircle size={16} />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span>
                  Sincronização {batchSummary.cancelado ? 'cancelada' : 'concluída'}:{' '}
                  {batchSummary.sucesso + batchSummary.parcial + batchSummary.comDivergencias} de {batchSummary.totalContratos}{' '}
                  contrato(s) com sucesso, {batchSummary.semDados} sem dados nas fontes, {batchSummary.erro} com erro.{' '}
                  {batchSummary.empenhosPersistidos} empenho(s) persistido(s)/atualizado(s).
                </span>
              </>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isSyncingAll && (
              <AppButton variant="ghost" size="sm" onClick={cancelBatchSync}>
                Cancelar
              </AppButton>
            )}
            {!isSyncingAll && (
              <button
                type="button"
                onClick={() => setShowBatchPanel(false)}
                aria-label="Fechar notificação"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.6, display: 'flex' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

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
