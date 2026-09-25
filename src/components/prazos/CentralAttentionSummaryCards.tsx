import React from 'react';
import { AlertTriangle, AlertCircle, Info, Flame } from 'lucide-react';
import type { DashboardAttentionSeverity } from '../../types/managementDashboard';

interface CentralAttentionSummaryCardsProps {
  counts: {
    critica: number;
    urgente: number;
    atencao: number;
    info: number;
  };
  activeSeverity: DashboardAttentionSeverity | 'TODAS';
  onSelectSeverity: (severity: DashboardAttentionSeverity | 'TODAS') => void;
}

export const CentralAttentionSummaryCards: React.FC<CentralAttentionSummaryCardsProps> = ({
  counts,
  activeSeverity,
  onSelectSeverity
}) => {
  const cards: Array<{
    id: DashboardAttentionSeverity;
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
      id: 'CRITICA',
      label: 'Críticas',
      count: counts.critica,
      icon: Flame,
      color: '#dc2626',
      bg: '#fef2f2',
      border: '#fecaca',
      activeBorder: '#dc2626',
      badgeText: 'Ação Imediata'
    },
    {
      id: 'URGENTE',
      label: 'Urgentes',
      count: counts.urgente,
      icon: AlertTriangle,
      color: '#d97706',
      bg: '#fffbeb',
      border: '#fde68a',
      activeBorder: '#d97706',
      badgeText: 'Curto Prazo'
    },
    {
      id: 'ATENCAO',
      label: 'Atenção',
      count: counts.atencao,
      icon: AlertCircle,
      color: '#2563eb',
      bg: '#eff6ff',
      border: '#bfdbfe',
      activeBorder: '#2563eb',
      badgeText: 'Monitoramento'
    },
    {
      id: 'INFO',
      label: 'Informativas',
      count: counts.info,
      icon: Info,
      color: '#475569',
      bg: '#f8fafc',
      border: '#e2e8f0',
      activeBorder: '#475569',
      badgeText: 'Acompanhamento'
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
        const isActive = activeSeverity === card.id;

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectSeverity(isActive ? 'TODAS' : card.id)}
            data-testid={`severity-card-${card.id.toLowerCase()}`}
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
