import React from 'react';
import { PageContainer } from '../design-system/components/PageContainer';
import { useNavigate } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { ManagementPaymentsOverview } from '../components/dashboard/ManagementPaymentsOverview';
import { useManagementDashboard } from '../hooks/useManagementDashboard';
import { useAssignedManagementScope } from '../hooks/useAssignedManagementScope';
import { PageHeader } from '../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../design-system/components/HeaderRefreshAction';

export const PaymentsRoute: React.FC = () => {
  const navigate = useNavigate();

  // Perfil "gestor" tem escopo ASSIGNED em contratos (role_domain_scopes,
  // migration 20260925000023), agora derivado também das Atas atribuídas
  // (ata_managers): mesmo recorte aplicado em ContractsRoute.tsx e na Visão
  // Geral, agora também nos ciclos de pagamento agregados aqui.
  const { contractKeys: assignedContractKeys, ataKeys: assignedAtaKeys, isLoading: isLoadingManagers } =
    useAssignedManagementScope('200331');

  const { readModel, isLoading: isLoadingDashboard, isFetching, isError, error, refresh, dataUpdatedAt } =
    useManagementDashboard({ uasg: '200331', assignedContractKeys, assignedAtaKeys });
  const isLoading = isLoadingDashboard || isLoadingManagers;

  const handleNavigateContract = (contractKey: string) => {
    navigate(`/contratos/${encodeURIComponent(contractKey)}?aba=pagamentos`);
  };

  return (
    <PageContainer>
      {/* Header da Página Canônico */}
      <PageHeader
        title="Pagamentos"
        subtitle="Acompanhamento operacional do ciclo de faturamento, liquidação de atestos e tramitação setorial (CGOFI)."
        icon={<CreditCard size={26} color="#0c326f" aria-hidden="true" />}
        actions={
          <HeaderRefreshAction
            onRefresh={() => refresh()}
            isRefreshing={isLoading || isFetching}
            lastUpdated={dataUpdatedAt}
            tooltipTitle="Recarregar dados gerenciais de faturamento e pagamentos"
            dataTestId="payments-refresh-btn"
          />
        }
      />

      <ManagementPaymentsOverview
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
