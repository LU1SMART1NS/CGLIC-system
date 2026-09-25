import React from 'react';
import { Layers, DollarSign, TrendingUp, Users } from 'lucide-react';

interface AllocationsPortfolioSummaryProps {
  totalAllocatedQty: number;
  totalAllocatedValue: number;
  totalEmpenhadaQty: number;
  totalEmpenhadaValue: number;
  saldoQty: number;
  saldoValue: number;
  totalUnits: number;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNumber(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return '0';
  return val.toLocaleString('pt-BR');
}

export const AllocationsPortfolioSummary: React.FC<AllocationsPortfolioSummaryProps> = ({
  totalAllocatedQty,
  totalAllocatedValue,
  totalEmpenhadaQty,
  totalEmpenhadaValue,
  saldoQty,
  saldoValue,
  totalUnits
}) => {
  const percentualDisponivel = totalAllocatedQty > 0
    ? Math.max(0, Math.round((saldoQty / totalAllocatedQty) * 100))
    : 100;

  const cards = [
    {
      id: 'TOTAL_ALOCADO',
      label: 'Total Alocado em Cotas',
      count: `${formatNumber(totalAllocatedQty)} un`,
      subValue: formatCurrency(totalAllocatedValue),
      icon: Layers,
      color: '#0c326f',
      bg: '#f1f5f9',
      border: '#cbd5e1',
      badgeText: 'Cota Distribuída'
    },
    {
      id: 'TOTAL_EMPENHADO',
      label: 'Empenhado por Unidades',
      count: `${formatNumber(totalEmpenhadaQty)} un`,
      subValue: formatCurrency(totalEmpenhadaValue),
      icon: DollarSign,
      color: '#b45309',
      bg: '#fffbeb',
      border: '#fde68a',
      badgeText: 'Consumo Interno'
    },
    {
      id: 'SALDO_DISPONIVEL',
      label: 'Saldo Disponível de Cota',
      count: `${formatNumber(saldoQty)} un`,
      subValue: formatCurrency(saldoValue),
      icon: TrendingUp,
      color: '#15803d',
      bg: '#f0fdf4',
      border: '#bbf7d0',
      badgeText: `${percentualDisponivel}% livre`
    },
    {
      id: 'TOTAL_UNIDADES',
      label: 'Unidades com Cota',
      count: `${totalUnits}`,
      subValue: totalUnits === 1 ? '1 Unidade Ativa' : `${totalUnits} Unidades Ativas`,
      icon: Users,
      color: '#475569',
      bg: '#f8fafc',
      border: '#e2e8f0',
      badgeText: 'Unidades Internas'
    }
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '0.85rem'
    }}>
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <div
            key={card.id}
            data-testid={`allocations-summary-card-${card.id.toLowerCase()}`}
            style={{
              background: '#ffffff',
              border: `1px solid ${card.border}`,
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: card.color,
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                {card.label}
              </span>
              <div style={{
                background: card.bg,
                padding: '0.3rem',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: card.color
              }}>
                <Icon size={16} />
              </div>
            </div>

            <div style={{ marginTop: '0.65rem', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{
                fontSize: '1.45rem',
                fontWeight: 900,
                color: card.color,
                letterSpacing: '-0.03em',
                lineHeight: 1
              }}>
                {card.count}
              </span>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: card.color,
                background: card.bg,
                padding: '0.15rem 0.45rem',
                borderRadius: '4px'
              }}>
                {card.badgeText}
              </span>
            </div>

            <div style={{ marginTop: '0.35rem', fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>
              {card.subValue}
            </div>
          </div>
        );
      })}
    </div>
  );
};
