import React from 'react';
import { FileText, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

export type ContractStatusFilterOption = 'TODOS' | 'VIGENTE' | 'A_VENCER_60D' | 'EXPIRADO';

interface ContractsPortfolioSummaryProps {
  total: number;
  vigentes: number;
  aVencer60d: number;
  expirados: number;
  activeStatus: ContractStatusFilterOption;
  onSelectStatus: (status: ContractStatusFilterOption) => void;
}

export const ContractsPortfolioSummary: React.FC<ContractsPortfolioSummaryProps> = ({
  total,
  vigentes,
  aVencer60d,
  expirados,
  activeStatus,
  onSelectStatus
}) => {
  const cards: Array<{
    id: ContractStatusFilterOption;
    label: string;
    count: number;
    icon: React.ComponentType<{ size?: number; color?: string }>;
    color: string;
    bg: string;
    border: string;
    activeBorder: string;
    badgeText: string;
  }> = [
    {
      id: 'TODOS',
      label: 'Total de Contratos',
      count: total,
      icon: FileText,
      color: '#0c326f',
      bg: '#f1f5f9',
      border: '#cbd5e1',
      activeBorder: '#0c326f',
      badgeText: 'Carteira Global'
    },
    {
      id: 'VIGENTE',
      label: 'Contratos Vigentes',
      count: vigentes,
      icon: CheckCircle2,
      color: '#15803d',
      bg: '#f0fdf4',
      border: '#bbf7d0',
      activeBorder: '#15803d',
      badgeText: 'Em Execução'
    },
    {
      id: 'A_VENCER_60D',
      label: 'Próximos do Vencimento',
      count: aVencer60d,
      icon: Clock,
      color: '#b45309',
      bg: '#fffbeb',
      border: '#fde68a',
      activeBorder: '#b45309',
      badgeText: 'Vence em ≤60d'
    },
    {
      id: 'EXPIRADO',
      label: 'Expirados / Encerrados',
      count: expirados,
      icon: AlertCircle,
      color: '#64748b',
      bg: '#f8fafc',
      border: '#e2e8f0',
      activeBorder: '#475569',
      badgeText: 'Histórico'
    }
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '0.85rem'
    }}>
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = activeStatus === card.id;

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectStatus(isActive && card.id !== 'TODOS' ? 'TODOS' : card.id)}
            data-testid={`contracts-summary-card-${card.id.toLowerCase()}`}
            style={{
              background: isActive ? card.bg : '#ffffff',
              border: `2px solid ${isActive ? card.activeBorder : card.border}`,
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease-in-out',
              boxShadow: isActive ? '0 4px 6px -1px rgba(0, 0, 0, 0.07)' : '0 1px 2px rgba(0, 0, 0, 0.03)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: isActive ? card.color : '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                {card.label}
              </span>
              <div style={{
                background: isActive ? '#ffffff' : card.bg,
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
                fontSize: '1.6rem',
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
                color: isActive ? card.color : '#64748b',
                background: isActive ? 'rgba(255, 255, 255, 0.8)' : '#f1f5f9',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px'
              }}>
                {card.badgeText}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
