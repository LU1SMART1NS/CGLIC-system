import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { AppButton } from './AppButton';

export interface HeaderRefreshActionProps {
  onRefresh: () => void | Promise<unknown>;
  isRefreshing?: boolean;
  lastUpdated?: Date | string | number | null;
  syncProgress?: { step?: string; percent?: number } | null;
  tooltipTitle?: string;
  dataTestId?: string;
}

export const HeaderRefreshAction: React.FC<HeaderRefreshActionProps> = ({
  onRefresh,
  isRefreshing = false,
  lastUpdated,
  syncProgress,
  tooltipTitle,
  dataTestId
}) => {
  const [internalTime, setInternalTime] = useState<Date>(() => new Date());
  const prevRefreshingRef = useRef(isRefreshing);

  useEffect(() => {
    if (prevRefreshingRef.current && !isRefreshing) {
      setInternalTime(new Date());
    }
    prevRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  const effectiveDate = React.useMemo(() => {
    if (lastUpdated) {
      const d = new Date(lastUpdated);
      if (!isNaN(d.getTime())) return d;
    }
    return internalTime;
  }, [lastUpdated, internalTime]);

  const formattedTime = React.useMemo(() => {
    return effectiveDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, [effectiveDate]);

  const displayTooltip = tooltipTitle || (
    lastUpdated
      ? `Última sincronização: ${effectiveDate.toLocaleString('pt-BR')} (Fontes Oficiais)`
      : `Última atualização: ${effectiveDate.toLocaleString('pt-BR')}`
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          userSelect: 'none'
        }}
        aria-live="polite"
      >
        <span
          style={{
            display: 'inline-block',
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: isRefreshing ? '#eab308' : '#22c55e',
            flexShrink: 0
          }}
          aria-hidden="true"
        />
        <span
          style={{
            fontSize: '0.75rem',
            color: '#64748b',
            fontWeight: 500,
            whiteSpace: 'nowrap'
          }}
        >
          {isRefreshing
            ? (syncProgress?.percent ? `Sincronizando ${syncProgress.percent}%` : 'Atualizando...')
            : `Atualizado às ${formattedTime}`}
        </span>
      </div>

      <AppButton
        variant="outline"
        onClick={onRefresh}
        disabled={isRefreshing}
        isLoading={isRefreshing}
        icon={<RefreshCw size={14} className={isRefreshing ? 'spin-animation' : ''} />}
        title={displayTooltip}
        data-testid={dataTestId}
      >
        {isRefreshing ? 'Atualizando...' : 'Atualizar'}
      </AppButton>
    </div>
  );
};
