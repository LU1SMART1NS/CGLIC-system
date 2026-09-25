import React from 'react';
import { FileText, Coins, Clock, Package } from 'lucide-react';
import type { DashboardAttentionCategory } from '../../types/managementDashboard';

export interface GestaoInstrumentosCounts {
  contratosAtivos: number;
  totalContratos: number;
  valorVigenteTotal: number;
  taxaPagamentoPercentual: number;
  vigenciaCriticaCount: number;
  saldoCriticoCount: number;
}

interface GestaoInstrumentosSummaryCardsProps {
  counts: GestaoInstrumentosCounts;
  activeCategory: DashboardAttentionCategory | null;
  onSelectCategory: (category: DashboardAttentionCategory | null) => void;
}

function formatCurrency(val: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const GestaoInstrumentosSummaryCards: React.FC<GestaoInstrumentosSummaryCardsProps> = ({
  counts,
  activeCategory,
  onSelectCategory
}) => {
  const cards: Array<{
    id: 'PORTFOLIO' | DashboardAttentionCategory;
    label: string;
    value: React.ReactNode;
    badgeText: string;
    icon: React.ComponentType<{ size?: number; color?: string }>;
    color: string;
    bg: string;
    border: string;
    activeBorder: string;
    isTogglable: boolean;
  }> = [
    {
      id: 'PORTFOLIO',
      label: 'Atas / Contratos Vigentes',
      value: counts.contratosAtivos,
      badgeText: `de ${counts.totalContratos} contratos`,
      icon: FileText,
      color: '#0c326f',
      bg: '#eff6ff',
      border: '#bfdbfe',
      activeBorder: '#0c326f',
      isTogglable: false
    },
    {
      id: 'PAGAMENTO_CRITICO',
      label: 'Valor Global Total',
      value: formatCurrency(counts.valorVigenteTotal),
      badgeText: `${counts.taxaPagamentoPercentual.toFixed(1)}% pago (SIAFI)`,
      icon: Coins,
      color: '#059669',
      bg: '#ecfdf5',
      border: '#a7f3d0',
      activeBorder: '#059669',
      isTogglable: true
    },
    {
      id: 'PRORROGACAO_PROXIMA',
      label: 'Alertas Críticos de Vigência',
      value: counts.vigenciaCriticaCount,
      badgeText: 'Prorrogação / Vigência',
      icon: Clock,
      color: '#dc2626',
      bg: '#fef2f2',
      border: '#fecaca',
      activeBorder: '#dc2626',
      isTogglable: true
    },
    {
      id: 'ATA_CRITICA',
      label: 'Alertas de Saldo (ARP)',
      value: counts.saldoCriticoCount,
      badgeText: 'Saldo físico ≥ 85%',
      icon: Package,
      color: '#d97706',
      bg: '#fffbeb',
      border: '#fde68a',
      activeBorder: '#d97706',
      isTogglable: true
    }
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '0.85rem'
      }}
    >
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = card.isTogglable && activeCategory === card.id;

        const handleClick = () => {
          if (!card.isTogglable) {
            onSelectCategory(null);
            return;
          }
          onSelectCategory(isActive ? null : (card.id as DashboardAttentionCategory));
        };

        return (
          <button
            key={card.id}
            type="button"
            onClick={handleClick}
            data-testid={`instrumentos-summary-card-${card.id.toLowerCase()}`}
            style={{
              background: isActive ? card.bg : '#ffffff',
              border: `2px solid ${isActive ? card.activeBorder : card.border}`,
              borderRadius: '10px',
              padding: '0.95rem 1.1rem',
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
                letterSpacing: '0.03em'
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

            <div style={{ marginTop: '0.65rem', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '1.4rem',
                fontWeight: 900,
                color: card.color,
                letterSpacing: '-0.02em',
                lineHeight: 1
              }}>
                {card.value}
              </span>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: isActive ? card.color : '#64748b',
                background: isActive ? 'rgba(255, 255, 255, 0.8)' : '#f1f5f9',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                whiteSpace: 'nowrap'
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
