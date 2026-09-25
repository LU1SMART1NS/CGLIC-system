import React from 'react';
import { FileText } from 'lucide-react';
import { PageHeader } from '../../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../../design-system/components/HeaderRefreshAction';

interface ContractsPortfolioHeaderProps {
  onRefresh: () => void;
  isRefreshing?: boolean;
  lastUpdated?: Date | string | number | null;
}

export const ContractsPortfolioHeader: React.FC<ContractsPortfolioHeaderProps> = ({
  onRefresh,
  isRefreshing = false,
  lastUpdated
}) => {
  return (
    <PageHeader
      title="Acompanhamento e Prazos"
      subtitle="Carteira de contratos, vigências, valores e situações de acompanhamento."
      icon={<FileText size={26} color="#0c326f" aria-hidden="true" />}
      actions={
        <HeaderRefreshAction
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
          dataTestId="contracts-portfolio-refresh-btn"
          tooltipTitle="Recarregar carteira de contratos administrativos"
        />
      }
    />
  );
};
