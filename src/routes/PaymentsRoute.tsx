import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { ManagementPaymentsOverview } from '../components/dashboard/ManagementPaymentsOverview';
import { useManagementDashboard } from '../hooks/useManagementDashboard';
import { PageHeader } from '../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../design-system/components/HeaderRefreshAction';

export const PaymentsRoute: React.FC = () => {
  const navigate = useNavigate();
  const { readModel, isLoading, isFetching, isError, error, refresh, dataUpdatedAt } = useManagementDashboard('200331');

  const handleNavigateContract = (contractKey: string) => {
    navigate(`/contratos/${encodeURIComponent(contractKey)}`);
  };

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem 3rem' }}>
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
    </div>
  );
};
