import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Calendar,
  CreditCard,
  Scale,
  Package,
  AlertTriangle,
  ChevronRight,
  RotateCcw
} from 'lucide-react';
import { SeverityBadge } from '../../design-system/components/SeverityBadge';
import { EmptyState } from '../../design-system/components/EmptyState';
import type {
  DashboardAttentionItem,
  DashboardAttentionCategory
} from '../../types/managementDashboard';

interface CentralAttentionQueueProps {
  items: DashboardAttentionItem[];
  totalItems: number;
  onResetFilters: () => void;
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

function getCategoryMeta(category: DashboardAttentionCategory) {
  switch (category) {
    case 'TAREFA_ATRASADA':
      return { natureza: 'TAREFA', origem: 'Plano de Gestão Contratual', color: '#991b1b' };
    case 'TAREFA_PROXIMA':
      return { natureza: 'TAREFA', origem: 'Plano de Gestão Contratual', color: '#b45309' };
    case 'PRORROGACAO_PROXIMA':
      return { natureza: 'WORKFLOW', origem: 'Prazo Contratual', color: '#1d4ed8' };
    case 'PAGAMENTO_CRITICO':
      return { natureza: 'ALERTA', origem: 'Pagamento / CGOFI', color: '#dc2626' };
    case 'REAJUSTE_RADAR':
      return { natureza: 'ALERTA', origem: 'Radar de Reajuste', color: '#b45309' };
    case 'ATA_CRITICA':
      return { natureza: 'ALERTA', origem: 'Saldo Físico de Ata', color: '#059669' };
    default:
      return { natureza: 'ALERTA', origem: 'Funil Único', color: '#475569' };
  }
}

export const CentralAttentionQueue: React.FC<CentralAttentionQueueProps> = ({
  items,
  totalItems,
  onResetFilters
}) => {
  const navigate = useNavigate();

  const handleAction = (item: DashboardAttentionItem) => {
    if (item.category === 'PAGAMENTO_CRITICO') {
      navigate('/pagamentos');
    } else if (item.category === 'ATA_CRITICA' || (item.numeroAta && !item.contractKey)) {
      navigate('/atas');
    } else if (item.contractKey) {
      navigate(`/contratos/${encodeURIComponent(item.contractKey)}`);
    } else if (item.numeroAta) {
      navigate('/atas');
    } else {
      navigate(item.targetUrl || '/contratos');
    }
  };

  const getActionLabel = (item: DashboardAttentionItem): string => {
    if (item.category === 'PAGAMENTO_CRITICO') return 'Abrir Pagamento';
    if (item.category === 'ATA_CRITICA' || (item.numeroAta && !item.contractKey)) return 'Ver Ata';
    if (item.contractKey) return 'Abrir Contrato';
    if (item.numeroAta) return 'Ver Ata';
    return 'Ver Detalhes';
  };

  if (totalItems === 0) {
    return (
      <EmptyState
        title="Tudo em dia"
        description="Nenhuma situação exige atenção no contexto selecionado."
      />
    );
  }

  if (items.length === 0) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
          Nenhuma situação encontrada
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', maxWidth: '400px' }}>
          Nenhuma situação corresponde aos filtros selecionados. Altere os critérios ou limpe os filtros para visualizar a fila completa.
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          style={{
            marginTop: '0.5rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.45rem 0.85rem',
            background: '#0c326f',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#ffffff',
            cursor: 'pointer'
          }}
        >
          <RotateCcw size={13} /> Limpar Filtros
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="central-attention-queue"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}
    >
      {items.map((item) => {
        const isCritica = item.severity === 'CRITICA';
        const isUrgente = item.severity === 'URGENTE';
        const meta = getCategoryMeta(item.category);

        return (
          <div
            key={item.id}
            data-testid={`attention-queue-item-${item.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.9rem 1.15rem',
              background: isCritica ? '#fffbfb' : isUrgente ? '#fffdf7' : '#ffffff',
              border: isCritica ? '1px solid #fecaca' : isUrgente ? '1px solid #fde68a' : '1px solid #e2e8f0',
              borderLeft: isCritica ? '4px solid #ef4444' : isUrgente ? '4px solid #f59e0b' : '4px solid #3b82f6',
              borderRadius: '8px',
              gap: '1rem',
              flexWrap: 'wrap',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              transition: 'all 0.15s ease'
            }}
          >
            {/* Lado Esquerdo: Badges + Metadados + Conteúdo */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              flex: 1,
              minWidth: '280px'
            }}>
              {/* Linha de Tags de Domínio e Severidade */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <SeverityBadge severity={item.severity} />

                {/* Natureza Semântica */}
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: '#475569',
                  background: '#f1f5f9',
                  padding: '0.12rem 0.45rem',
                  borderRadius: '4px'
                }}>
                  {meta.natureza}
                </span>

                {/* Origem do Domínio */}
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}>
                  {getCategoryIcon(item.category)}
                  {meta.origem}
                </span>

                {/* Badge Temporal / Saturação */}
                {item.badgeLabel && (
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: isCritica ? '#b91c1c' : isUrgente ? '#b45309' : '#1e40af',
                    background: isCritica ? '#fef2f2' : isUrgente ? '#fffbeb' : '#eff6ff',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '4px',
                    marginLeft: 'auto'
                  }}>
                    {item.badgeLabel}
                  </span>
                )}
              </div>

              {/* Título da Situação + Objeto Relacionado */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.92rem', color: '#0f172a', fontWeight: 800 }}>
                  {item.title}
                </strong>

                {item.numeroContrato && (
                  <span style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: '#0c326f',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '4px'
                  }}>
                    {item.numeroContrato}
                  </span>
                )}

                {item.numeroAta && (
                  <span style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: '#065f46',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '4px'
                  }}>
                    Ata {item.numeroAta}
                  </span>
                )}
              </div>

              {/* Descrição / Motivação ("Por que está aparecendo") */}
              {item.description && (
                <p style={{
                  fontSize: '0.82rem',
                  color: '#475569',
                  margin: 0,
                  lineHeight: 1.4
                }}>
                  {item.description}
                </p>
              )}
            </div>

            {/* Lado Direito: Ação de Drill-Down */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => handleAction(item)}
                data-testid={`action-btn-${item.id}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.45rem 0.85rem',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#0c326f',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
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
  );
};
