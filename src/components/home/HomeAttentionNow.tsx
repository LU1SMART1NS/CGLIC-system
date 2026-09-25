import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Clock,
  Calendar,
  CreditCard,
  Scale,
  Package,
  ArrowRight,
  ChevronRight
} from 'lucide-react';
import { AppCard } from '../../design-system/components/AppCard';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { SeverityBadge } from '../../design-system/components/SeverityBadge';
import { EmptyState } from '../../design-system/components/EmptyState';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import type {
  ManagementDashboardAttentionSummary,
  DashboardAttentionItem,
  DashboardAttentionCategory
} from '../../types/managementDashboard';

interface HomeAttentionNowProps {
  attention?: ManagementDashboardAttentionSummary;
  loading?: boolean;
  maxItems?: number;
}

function getCategoryIcon(category: DashboardAttentionCategory) {
  switch (category) {
    case 'TAREFA_ATRASADA':
      return <Clock size={16} />;
    case 'TAREFA_PROXIMA':
      return <Calendar size={16} />;
    case 'PAGAMENTO_CRITICO':
      return <CreditCard size={16} />;
    case 'REAJUSTE_RADAR':
      return <Scale size={16} />;
    case 'ATA_CRITICA':
      return <Package size={16} />;
    case 'PRORROGACAO_PROXIMA':
      return <Clock size={16} />;
    default:
      return <AlertTriangle size={16} />;
  }
}

export const HomeAttentionNow: React.FC<HomeAttentionNowProps> = ({
  attention,
  loading = false,
  maxItems = 5
}) => {
  const navigate = useNavigate();
  const items = attention?.items || [];
  const topItems = items.slice(0, maxItems);
  const totalCount = attention?.totalAlertasAtivos ?? items.length;

  const handleAction = (item: DashboardAttentionItem) => {
    if (item.contractKey) {
      navigate(`/contratos/${encodeURIComponent(item.contractKey)}`);
    } else if (item.numeroAta) {
      navigate('/atas');
    } else if (item.category === 'PAGAMENTO_CRITICO') {
      navigate('/pagamentos');
    } else {
      navigate('/prazos');
    }
  };

  const getActionLabel = (item: DashboardAttentionItem): string => {
    if (item.contractKey) return 'Abrir Contrato';
    if (item.numeroAta) return 'Ver Ata';
    if (item.category === 'PAGAMENTO_CRITICO') return 'Abrir Pagamento';
    return 'Ver Detalhes';
  };

  return (
    <AppCard
      variant="default"
      padding="lg"
      data-testid="home-attention-now-section"
    >
      <SectionHeader
        title="Atenção Agora"
        subtitle={
          totalCount > 0
            ? `${totalCount} situação(ões) demandam ação ou acompanhamento da gestão`
            : 'Sinais de alerta e prioridades operacionais do Funil Único'
        }
        actions={
          <button
            type="button"
            onClick={() => navigate('/prazos')}
            data-testid="home-view-central-atencao-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.85rem',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#0c326f',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Ver Central de Atenção <ArrowRight size={14} />
          </button>
        }
      />

      <div style={{ marginTop: '1.25rem' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <SkeletonLoader variant="card" height="64px" />
            <SkeletonLoader variant="card" height="64px" />
            <SkeletonLoader variant="card" height="64px" />
          </div>
        ) : topItems.length === 0 ? (
          <EmptyState
            title="Tudo sob controle"
            description="Nenhuma situação crítica ou urgente exige sua intervenção imediata no momento."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {topItems.map((item) => {
              const isCritica = item.severity === 'CRITICA';
              const isUrgente = item.severity === 'URGENTE';

              return (
                <div
                  key={item.id}
                  data-testid={`attention-item-${item.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.85rem 1.1rem',
                    background: isCritica ? '#fef2f2' : isUrgente ? '#fffbeb' : '#f8fafc',
                    border: isCritica ? '1px solid #fecaca' : isUrgente ? '1px solid #fde68a' : '1px solid #e2e8f0',
                    borderLeft: isCritica ? '4px solid #ef4444' : isUrgente ? '4px solid #f59e0b' : '4px solid #3b82f6',
                    borderRadius: '8px',
                    gap: '1rem',
                    flexWrap: 'wrap',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {/* Lado Esquerdo: Severidade + Ícone + Título/Descrição */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: '280px' }}>
                    <SeverityBadge severity={item.severity} />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ color: isCritica ? '#991b1b' : '#334155', display: 'flex', alignItems: 'center' }}>
                          {getCategoryIcon(item.category)}
                        </span>
                        <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>
                          {item.title}
                        </strong>
                        {item.numeroContrato && (
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#0c326f',
                            background: '#eff6ff',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px'
                          }}>
                            Contrato {item.numeroContrato}
                          </span>
                        )}
                        {item.numeroAta && (
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#065f46',
                            background: '#ecfdf5',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px'
                          }}>
                            Ata {item.numeroAta}
                          </span>
                        )}
                      </div>

                      {item.description && (
                        <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, lineHeight: 1.35 }}>
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Lado Direito: Ação de Drill-Down */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <button
                      type="button"
                      onClick={() => handleAction(item)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.45rem 0.8rem',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: '#0c326f',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {getActionLabel(item)}
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppCard>
  );
};
