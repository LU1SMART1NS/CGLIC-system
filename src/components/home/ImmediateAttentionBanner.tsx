import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, AlertCircle, Clock, Calendar, ArrowRight } from 'lucide-react';
import type { CentralPrazosKPIs, CentralPrazosTab } from '../../types/centralPrazos';

interface ImmediateAttentionBannerProps {
  kpis: CentralPrazosKPIs;
  loading?: boolean;
}

export const ImmediateAttentionBanner: React.FC<ImmediateAttentionBannerProps> = ({
  kpis,
  loading = false
}) => {
  const navigate = useNavigate();

  const handleCardClick = (tab: CentralPrazosTab) => {
    navigate(`/prazos?tab=${tab}`, { state: { tab } });
  };

  const cards = [
    {
      tab: 'ATRASADAS' as CentralPrazosTab,
      label: 'Atrasadas',
      count: kpis.atrasadas,
      icon: AlertTriangle,
      color: '#dc2626',
      bg: '#fef2f2',
      border: '#fecaca',
      badge: 'Ação Imediata'
    },
    {
      tab: 'HOJE' as CentralPrazosTab,
      label: 'Vencendo Hoje',
      count: kpis.venceHoje,
      icon: AlertCircle,
      color: '#ea580c',
      bg: '#fff7ed',
      border: '#fed7aa',
      badge: 'Deadline Crítico'
    },
    {
      tab: 'SETE_DIAS' as CentralPrazosTab,
      label: 'Próximos 7 Dias',
      count: kpis.proximos7Dias,
      icon: Clock,
      color: '#d97706',
      bg: '#fffbeb',
      border: '#fde68a',
      badge: 'Curto Prazo'
    },
    {
      tab: 'TRINTA_DIAS' as CentralPrazosTab,
      label: 'Próximos 30 Dias',
      count: kpis.proximos30Dias,
      icon: Calendar,
      color: '#0284c7',
      bg: '#f0f9ff',
      border: '#bae6fd',
      badge: 'Planejamento Mensal'
    }
  ];

  return (
    <section aria-labelledby="immediate-attention-title" style={{
      background: '#ffffff',
      borderRadius: '12px',
      padding: '1.5rem',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            background: '#fee2e2',
            padding: '0.4rem',
            borderRadius: '8px',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <h3 id="immediate-attention-title" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Atenção Imediata & Prazos
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.15rem 0 0 0' }}>
              Consolidado do motor de prazos e tarefas — clique em um card para abrir a Central filtrada
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/prazos')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.85rem',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#0c326f',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          Abrir Central de Prazos <ArrowRight size={14} />
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem'
      }}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.tab}
              type="button"
              onClick={() => handleCardClick(c.tab)}
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: '10px',
                padding: '1.1rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
                gap: '0.75rem'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: c.color, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  {c.label}
                </span>
                <div style={{
                  padding: '0.35rem',
                  background: '#ffffff',
                  borderRadius: '6px',
                  color: c.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}>
                  <Icon size={16} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 900, color: c.color, lineHeight: 1 }}>
                  {loading ? '—' : c.count}
                </span>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: c.color,
                  background: 'rgba(255, 255, 255, 0.8)',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px'
                }}>
                  {c.badge}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
