import React from 'react';
import { LayoutDashboard } from 'lucide-react';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';

interface GestaoInstrumentosHeaderProps {
  uasg?: string;
  onRefresh: () => void;
  isRefreshing?: boolean;
  lastUpdated?: Date | string | number | null;
}

export const GestaoInstrumentosHeader: React.FC<GestaoInstrumentosHeaderProps> = ({
  uasg,
  onRefresh,
  isRefreshing = false,
  lastUpdated
}) => {
  return (
    <PageHeader
      title="Gestão de Instrumentos"
      subtitle="Painel unificado de gestão e monitoramento — Lei 14.133. Visão geral da carteira de ARPs e contratos e o que exige sua atenção."
      icon={<LayoutDashboard size={26} color="#0c326f" aria-hidden="true" />}
      badge={
        uasg ? (
          <span
            data-testid="gestao-instrumentos-uasg-badge"
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
            UASG {uasg}
          </span>
        ) : undefined
      }
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
