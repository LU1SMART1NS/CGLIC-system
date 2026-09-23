import React from 'react';
import { AlertTriangle, Clock, Calendar, ListFilter, AlertCircle, Sparkles } from 'lucide-react';
import type { CentralPrazosKPIs, CentralPrazosTab } from '../../types/centralPrazos';

interface CentralPrazosKPIHeaderProps {
  kpis: CentralPrazosKPIs;
  activeTab: CentralPrazosTab;
  onSelectTab: (tab: CentralPrazosTab) => void;
}

export const CentralPrazosKPIHeader: React.FC<CentralPrazosKPIHeaderProps> = ({
  kpis,
  activeTab,
  onSelectTab
}) => {
  const cards = [
    {
      id: 'ATRASADAS' as CentralPrazosTab,
      label: 'Atrasadas',
      count: kpis.atrasadas,
      icon: AlertTriangle,
      color: '#dc2626',
      bg: '#fef2f2',
      border: '#fecaca',
      activeBorder: '#dc2626',
      badgeText: 'Ação Imediata'
    },
    {
      id: 'HOJE' as CentralPrazosTab,
      label: 'Vencendo Hoje',
      count: kpis.venceHoje,
      icon: AlertCircle,
      color: '#ea580c',
      bg: '#fff7ed',
      border: '#fed7aa',
      activeBorder: '#ea580c',
      badgeText: 'Deadline Crítico'
    },
    {
      id: 'SETE_DIAS' as CentralPrazosTab,
      label: 'Próximos 7 Dias',
      count: kpis.proximos7Dias,
      icon: Clock,
      color: '#d97706',
      bg: '#fffbeb',
      border: '#fde68a',
      activeBorder: '#d97706',
      badgeText: 'Curto Prazo'
    },
    {
      id: 'TRINTA_DIAS' as CentralPrazosTab,
      label: 'Próximos 30 Dias',
      count: kpis.proximos30Dias,
      icon: Calendar,
      color: '#0284c7',
      bg: '#f0f9ff',
      border: '#bae6fd',
      activeBorder: '#0284c7',
      badgeText: 'Planejamento Mensal'
    },
    {
      id: 'FUTURAS' as CentralPrazosTab,
      label: 'Futuras (>30d)',
      count: kpis.futuras,
      icon: Sparkles,
      color: '#64748b',
      bg: '#f8fafc',
      border: '#e2e8f0',
      activeBorder: '#475569',
      badgeText: 'Monitoramento'
    },
    {
      id: 'TODAS' as CentralPrazosTab,
      label: 'Total de Obrigações',
      count: kpis.total,
      icon: ListFilter,
      color: '#0c326f',
      bg: '#f1f5f9',
      border: '#cbd5e1',
      activeBorder: '#0c326f',
      badgeText: 'Visão Geral'
    }
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
      gap: '0.85rem',
      marginBottom: '1.25rem'
    }}>
      {cards.map((c) => {
        const Icon = c.icon;
        const isActive = activeTab === c.id;

        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectTab(c.id)}
            style={{
              background: isActive ? c.bg : '#ffffff',
              border: `2px solid ${isActive ? c.activeBorder : c.border}`,
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease-in-out',
              boxShadow: isActive ? '0 4px 6px -1px rgba(0, 0, 0, 0.07)' : '0 1px 2px rgba(0, 0, 0, 0.03)',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: isActive ? c.color : '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.02em'
              }}>
                {c.label}
              </span>
              <div style={{
                background: isActive ? '#ffffff' : c.bg,
                padding: '0.35rem',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: c.color
              }}>
                <Icon size={16} />
              </div>
            </div>

            <div style={{ marginTop: '0.65rem', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{
                fontSize: '1.6rem',
                fontWeight: 900,
                color: c.color,
                letterSpacing: '-0.03em',
                lineHeight: 1
              }}>
                {c.count}
              </span>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                color: isActive ? c.color : '#64748b',
                background: isActive ? 'rgba(255, 255, 255, 0.7)' : '#f8fafc',
                padding: '0.15rem 0.4rem',
                borderRadius: '4px'
              }}>
                {c.badgeText}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
