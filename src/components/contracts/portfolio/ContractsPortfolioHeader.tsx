import React from 'react';
import { FileText } from 'lucide-react';
import { PageHeader } from '../../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../../design-system/components/HeaderRefreshAction';

interface ContractsPortfolioHeaderProps {
  uasgs?: string[];
  onRefresh: () => void;
  isRefreshing?: boolean;
  lastUpdated?: Date | string | number | null;
}

export const ContractsPortfolioHeader: React.FC<ContractsPortfolioHeaderProps> = ({
  uasgs,
  onRefresh,
  isRefreshing = false,
  lastUpdated
}) => {
  return (
    <PageHeader
      title="Acompanhamento e Prazos"
      subtitle="Carteira de contratos, vigências, valores e situações de acompanhamento."
      icon={<FileText size={26} color="#0c326f" aria-hidden="true" />}
      badge={
        uasgs && uasgs.length > 0 ? (
          <span
            data-testid="contracts-portfolio-uasg-badge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '0.7rem',
              fontWeight: 800,
              color: '#0c326f',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              padding: '0.2rem 0.6rem',
              borderRadius: '999px',
              letterSpacing: '0.02em'
            }}
          >
            {uasgs.length === 1 ? `UASG ${uasgs[0]}` : `UASGs ${uasgs.join(' · ')}`}
          </span>
        ) : undefined
      }
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
