import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote } from 'lucide-react';
import { ManagementFinancialExecution } from '../components/dashboard/ManagementFinancialExecution';
import { useManagementDashboard } from '../hooks/useManagementDashboard';
import { useAssignedManagementScope } from '../hooks/useAssignedManagementScope';
import { PageHeader } from '../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../design-system/components/HeaderRefreshAction';

export const FinancialExecutionRoute: React.FC = () => {
  const navigate = useNavigate();

  // Perfil "gestor" tem escopo ASSIGNED em contratos (role_domain_scopes,
  // migration 20260925000023), agora derivado também das Atas atribuídas
  // (ata_managers): mesmo recorte aplicado em ContractsRoute.tsx e na Visão
  // Geral, agora também na execução financeira agregada aqui.
  const { contractKeys: assignedContractKeys, ataKeys: assignedAtaKeys, isLoading: isLoadingManagers } =
    useAssignedManagementScope('200331');

  const { readModel, isLoading: isLoadingDashboard, isFetching, isError, error, refresh, dataUpdatedAt } =
    useManagementDashboard({ uasg: '200331', assignedContractKeys, assignedAtaKeys });
  const isLoading = isLoadingDashboard || isLoadingManagers;

  const handleNavigateContract = (contractKey: string) => {
    navigate(`/contratos/${encodeURIComponent(contractKey)}`);
  };

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem 3rem' }}>
      {/* Header da Página Canônico */}
      <PageHeader
        title="Empenhos e Execução"
        subtitle="Execução financeira oficial dos empenhos, liquidações e pagamentos."
        icon={<Banknote size={26} color="#0c326f" aria-hidden="true" />}
        actions={
          <HeaderRefreshAction
            onRefresh={() => refresh()}
            isRefreshing={isLoading || isFetching}
            lastUpdated={dataUpdatedAt}
            tooltipTitle="Recarregar dados gerenciais de empenhos e execução financeira"
            dataTestId="financial-execution-refresh-btn"
          />
        }
      />

      <ManagementFinancialExecution
        readModel={readModel}
        isLoading={isLoading}
        isError={isError}
        errorMessage={error?.message}
        onNavigateContract={handleNavigateContract}
        onRefresh={() => refresh()}
      />
    </div>
  );
};
