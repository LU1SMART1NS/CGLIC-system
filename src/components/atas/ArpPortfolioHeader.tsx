import React from 'react';
import { Package } from 'lucide-react';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import type { SyncMetadata } from '../../types';

interface ArpPortfolioHeaderProps {
  syncInfo?: SyncMetadata;
  isSyncing?: boolean;
  syncProgress?: { step: string; percent: number; current?: number; total?: number } | null;
  onTriggerSync?: () => void;
}

export const ArpPortfolioHeader: React.FC<ArpPortfolioHeaderProps> = ({
  syncInfo,
  isSyncing = false,
  syncProgress,
  onTriggerSync
}) => {
  return (
    <PageHeader
      title="Consulta e Vigência"
      subtitle="Acompanhe atas de registro de preços, vigências, fornecedores e saldos físicos."
      icon={<Package size={26} color="#0c326f" aria-hidden="true" />}
      actions={
        onTriggerSync && (
          <HeaderRefreshAction
            onRefresh={onTriggerSync}
            isRefreshing={isSyncing}
            lastUpdated={syncInfo?.ultimoSyncEm}
            syncProgress={syncProgress}
            tooltipTitle={
              syncInfo?.ultimoSyncEm
                ? `Última sincronização: ${new Date(syncInfo.ultimoSyncEm).toLocaleString('pt-BR')} (Compras.gov.br / PNCP)`
                : 'Sincronizar atas com as fontes oficiais'
            }
            dataTestId="arp-portfolio-refresh-btn"
          />
        )
      }
    />
  );
};
