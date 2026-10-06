import React, { useState, useEffect, useRef } from 'react';
import { ActionButton } from './ActionButton';

export interface HeaderRefreshActionProps {
  /** Sem `onRefresh`, mostra só o indicador "Atualizado em" (perfis que não atualizam os dados). */
  onRefresh?: () => void | Promise<unknown>;
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

  // A data vem da última sincronização gravada no banco e pode ser de outro dia: aí mostra o dia também.
  const updatedLabel = React.useMemo(() => {
    const hora = effectiveDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (effectiveDate.toDateString() === new Date().toDateString()) return `Atualizado às ${hora}`;
    const dia = effectiveDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `Atualizado em ${dia} às ${hora}`;
  }, [effectiveDate]);

  const displayTooltip = tooltipTitle || (
    lastUpdated
      ? `Última sincronização: ${effectiveDate.toLocaleString('pt-BR')} (Fontes Oficiais)`
      : `Última atualização: ${effectiveDate.toLocaleString('pt-BR')}`
  );

  return (
    <div
      className="ds-refresh"
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
        title={onRefresh ? undefined : displayTooltip}
        data-testid={onRefresh ? undefined : dataTestId && `${dataTestId}-indicador`}
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
            : updatedLabel}
        </span>
      </div>

      {onRefresh && (
        <ActionButton
          action="sincronizar"
          label="Atualizar"
          onClick={onRefresh}
          disabled={isRefreshing}
          isLoading={isRefreshing}
          title={displayTooltip}
          data-testid={dataTestId}
        >
          {isRefreshing ? 'Atualizando...' : 'Atualizar'}
        </ActionButton>
      )}
    </div>
  );
};
