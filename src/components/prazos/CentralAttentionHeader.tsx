import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';

interface CentralAttentionHeaderProps {
  onRefresh: () => void;
  isRefreshing?: boolean;
  lastUpdated?: Date | string | number | null;
}

export const CentralAttentionHeader: React.FC<CentralAttentionHeaderProps> = ({
  onRefresh,
  isRefreshing = false,
  lastUpdated
}) => {
  return (
    <PageHeader
      title="Central de Atenção"
      subtitle="Acompanhe prazos, riscos e situações que exigem acompanhamento."
      icon={<AlertTriangle size={26} color="#0c326f" aria-hidden="true" />}
      actions={
        <HeaderRefreshAction
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
          dataTestId="central-attention-refresh-btn"
          tooltipTitle="Recarregar alertas, prazos e notificações"
        />
      }
    />
  );
};
