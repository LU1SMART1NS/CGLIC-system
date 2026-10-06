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
      title="Carteira de Contratos"
      subtitle="Todos os contratos, com vigência, valor, gestor e pendências em aberto."
      icon={<FileText size={26} color="var(--primary)" aria-hidden="true" />}
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
