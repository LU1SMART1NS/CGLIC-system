import React from 'react';
import { HealthTile, HealthTileGrid } from '../../instrument360/HealthStripParts';
import { formatCurrency, formatNumber } from '../../../utils/format';

interface AllocationsPortfolioSummaryProps {
  totalAllocatedQty: number;
  totalAllocatedValue: number;
  totalEmpenhadaQty: number;
  totalEmpenhadaValue: number;
  saldoQty: number;
  saldoValue: number;
  totalUnits: number;
}

/** Resumo no mesmo padrão dos indicadores das telas 360. */
export const AllocationsPortfolioSummary: React.FC<AllocationsPortfolioSummaryProps> = ({
  totalAllocatedQty,
  totalAllocatedValue,
  totalEmpenhadaQty,
  totalEmpenhadaValue,
  saldoQty,
  saldoValue,
  totalUnits
}) => {
  const percentualDisponivel =
    totalAllocatedQty > 0 ? Math.max(0, Math.round((saldoQty / totalAllocatedQty) * 100)) : 100;

  return (
    <HealthTileGrid>
      <div data-testid="allocations-summary-card-total_alocado">
        <HealthTile
          label="Total alocado em cotas"
          value={`${formatNumber(totalAllocatedQty)} un`}
          hint={formatCurrency(totalAllocatedValue)}
        />
      </div>
      <div data-testid="allocations-summary-card-total_empenhado">
        <HealthTile
          label="Empenhado pelas unidades"
          value={`${formatNumber(totalEmpenhadaQty)} un`}
          hint={formatCurrency(totalEmpenhadaValue)}
        />
      </div>
      <div data-testid="allocations-summary-card-saldo_disponivel">
        <HealthTile
          label="Saldo disponível de cota"
          value={`${formatNumber(saldoQty)} un`}
          hint={`${formatCurrency(saldoValue)} · ${percentualDisponivel}% livre`}
          positive={saldoQty > 0}
          tone={saldoQty <= 0 && totalAllocatedQty > 0 ? 'CRITICA' : undefined}
        />
      </div>
      <div data-testid="allocations-summary-card-total_unidades">
        <HealthTile
          label="Unidades com cota"
          value={String(totalUnits)}
          hint={totalUnits === 1 ? 'unidade interna' : 'unidades internas'}
        />
      </div>
    </HealthTileGrid>
  );
};
