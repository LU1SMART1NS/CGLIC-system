import React from 'react';
import { LayoutDashboard } from 'lucide-react';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';

interface GestaoInstrumentosHeaderProps {
  /** Só para o coordenador: sem ele, o cabeçalho mostra apenas a data da última atualização. */
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastUpdated?: Date | string | number | null;
}

export const GestaoInstrumentosHeader: React.FC<GestaoInstrumentosHeaderProps> = ({
  onRefresh,
  isRefreshing = false,
  lastUpdated
}) => {
  return (
    <PageHeader
      title="Início"
      subtitle="Resumo da carteira de atas e contratos e o que exige sua atenção."
      icon={<LayoutDashboard size={26} color="var(--primary)" aria-hidden="true" />}
      actions={
        <HeaderRefreshAction
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
          dataTestId="gestao-instrumentos-refresh-btn"
          tooltipTitle="Recarregar a carteira de ARPs e contratos"
        />
      }
    />
  );
};
