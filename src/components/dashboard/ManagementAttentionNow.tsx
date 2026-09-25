import React from 'react';
import {
  AlertCircle,
  Clock,
  Calendar,
  CreditCard,
  Scale,
  Package,
  ArrowRight,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { useManagementDashboard } from '../../hooks/useManagementDashboard';
import { useNavigate } from 'react-router-dom';
import type {
  ManagementDashboardReadModel,
  DashboardAttentionItem,
  DashboardAttentionSeverity,
  DashboardAttentionCategory
} from '../../types/managementDashboard';

export interface ManagementAttentionNowProps {
  readModel?: ManagementDashboardReadModel | null;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  uasg?: string;
  maxItems?: number;
  onNavigateContract?: (contractKey: string) => void;
  onNavigateAta?: (numeroAta: string) => void;
}

const severityConfig: Record<DashboardAttentionSeverity, {
  label: string;
  badgeBg: string;
  badgeColor: string;
  borderLeft: string;
  iconColor: string;
}> = {
  CRITICA: {
    label: 'CRÍTICA',
    badgeBg: '#fef2f2',
    badgeColor: '#b91c1c',
    borderLeft: '#ef4444',
    iconColor: '#dc2626'
  },
  URGENTE: {
    label: 'URGENTE',
    badgeBg: '#fffbeb',
    badgeColor: '#b45309',
    borderLeft: '#f59e0b',
    iconColor: '#d97706'
  },
  ATENCAO: {
    label: 'ATENÇÃO',
    badgeBg: '#eff6ff',
    badgeColor: '#1d4ed8',
    borderLeft: '#3b82f6',
    iconColor: '#2563eb'
  },
  INFO: {
    label: 'INFO',
    badgeBg: '#f1f5f9',
    badgeColor: '#475569',
    borderLeft: '#94a3b8',
    iconColor: '#64748b'
  }
};

function getCategoryIcon(category: DashboardAttentionCategory) {
  switch (category) {
    case 'TAREFA_ATRASADA':
      return <Clock size={18} />;
    case 'TAREFA_PROXIMA':
      return <Calendar size={18} />;
    case 'PAGAMENTO_CRITICO':
      return <CreditCard size={18} />;
    case 'REAJUSTE_RADAR':
      return <Scale size={18} />;
    case 'ATA_CRITICA':
      return <Package size={18} />;
    case 'PRORROGACAO_PROXIMA':
      return <Clock size={18} />;
    default:
      return <AlertCircle size={18} />;
  }
}

function getCategoryLabel(category: DashboardAttentionCategory): string {
  switch (category) {
    case 'TAREFA_ATRASADA':
      return 'Tarefa Atrasada';
    case 'TAREFA_PROXIMA':
      return 'Prazo Iminente';
    case 'PAGAMENTO_CRITICO':
      return 'Pagamento / Fatura';
    case 'REAJUSTE_RADAR':
      return 'Reajuste / Repactuação';
    case 'ATA_CRITICA':
      return 'Saldo de Ata';
    case 'PRORROGACAO_PROXIMA':
      return 'Prorrogação';
    default:
      return 'Operacional';
  }
}

/**
 * Seção "Atenção Agora" do Dashboard Gerencial (SaldoARP 3.0 — Fase 8-D)
 * 
 * Princípios Fundamentais:
 * 1. Projeção visual pura dos sinais já existentes nos motores canônicos;
 * 2. Zero cálculos ou consultas internas — consome estritamente o Read Model;
 * 3. Ações diretas de navegação com /contratos/:contractKey;
 * 4. Acessibilidade nativa com tags semânticas e labels descritivos.
 */
export const ManagementAttentionNow: React.FC<ManagementAttentionNowProps> = ({
  readModel: propReadModel,
  isLoading: propIsLoading,
  isError: propIsError,
  errorMessage: propErrorMessage,
  uasg = '200331',
  maxItems = 8,
  onNavigateContract,
  onNavigateAta
}) => {
  const hookResult = useManagementDashboard(uasg);

  const readModel = propReadModel !== undefined ? propReadModel : hookResult.readModel;
  const isLoading = propIsLoading !== undefined ? propIsLoading : hookResult.isLoading;
  const isError = propIsError !== undefined ? propIsError : hookResult.isError;
  const errorMessage = propErrorMessage || hookResult.error?.message || 'Erro ao carregar prioridades operacionais';

  const attention = readModel?.attention;
  const items = attention?.items || [];
  const displayItems = items.slice(0, maxItems);

  const navigate = useNavigate();

  const handleContractClick = (contractKey?: string) => {
    if (!contractKey) return;
    if (onNavigateContract) {
      onNavigateContract(contractKey);
    } else {
      navigate(`/contratos/${encodeURIComponent(contractKey)}`);
    }
  };

  const handleAtaClick = (numeroAta?: string) => {
    if (!numeroAta) return;
    if (onNavigateAta) {
      onNavigateAta(numeroAta);
    } else {
      navigate(`/atas?search=${encodeURIComponent(numeroAta)}`);
    }
  };

  // 1. Estado de Loading
  if (isLoading) {
    return (
      <section
        data-testid="management-attention-now-loading"
        aria-busy="true"
        aria-label="Carregando prioridades operacionais do Atenção Agora"
        className="management-attention-now animate-pulse"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          marginTop: '1.5rem'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ width: '40%' }}>
            <div style={{ height: '18px', background: '#cbd5e1', borderRadius: '4px', width: '70%' }} />
            <div style={{ height: '12px', background: '#e2e8f0', borderRadius: '4px', width: '90%', marginTop: '0.5rem' }} />
          </div>
          <div style={{ width: '120px', height: '24px', background: '#e2e8f0', borderRadius: '6px' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              style={{
                height: '64px',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                borderLeft: '4px solid #cbd5e1'
              }}
            />
          ))}
        </div>
      </section>
    );
  }

  // 2. Estado de Erro
  if (isError) {
    return (
      <section
        data-testid="management-attention-now-error"
        role="alert"
        aria-label={`Erro na seção Atenção Agora: ${errorMessage}`}
        className="management-attention-now"
        style={{
          background: '#fef2f2',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid #fecaca',
          borderTop: '4px solid #ef4444',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          marginTop: '1.5rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#991b1b', fontWeight: 700, fontSize: '1rem' }}>
          <AlertCircle size={20} aria-hidden="true" />
          <span>Atenção Agora — Erro ao carregar sinais operacionais</span>
        </div>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#7f1d1d' }}>
          {errorMessage}
        </p>
      </section>
    );
  }

  // 3. Estado Vazio (Sem pendências críticas)
  if (items.length === 0) {
    return (
      <section
        data-testid="management-attention-now-empty"
        aria-labelledby="attention-now-title"
        className="management-attention-now"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid #e2e8f0',
          borderTop: '4px solid #10b981',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          marginTop: '1.5rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h3
              id="attention-now-title"
              style={{
                fontSize: '1.125rem',
                fontWeight: 800,
                color: '#0f172a',
                margin: 0,
                letterSpacing: '-0.01em',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Zap size={20} color="#f59e0b" aria-hidden="true" />
              <span>Atenção Agora</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
              Prioridades operacionais que demandam ação administrativa imediata
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.75rem',
              background: '#ecfdf5',
              color: '#065f46',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: 700
            }}
          >
            <ShieldCheck size={16} />
            <span>Conformidade Operacional</span>
          </div>
        </div>

        <div
          style={{
            padding: '1.5rem',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            textAlign: 'center',
            color: '#475569'
          }}
        >
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
            Nenhuma pendência crítica no momento.
          </div>
          <div style={{ fontSize: '0.825rem', marginTop: '0.25rem', color: '#64748b' }}>
            Todos os prazos contratuais, tarefas monitoradas e ciclos de faturamento estão operando dentro do cronograma regular.
          </div>
        </div>
      </section>
    );
  }

  // 4. Estado Normal com Lista Priorizada de Itens
  return (
    <section
      data-testid="management-attention-now"
      aria-labelledby="attention-now-title"
      className="management-attention-now"
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '1.5rem',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        marginTop: '1.5rem'
      }}
    >
      {/* Cabeçalho da Seção */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginBottom: '1.25rem'
        }}
      >
        <div>
          <h3
            id="attention-now-title"
            style={{
              fontSize: '1.125rem',
              fontWeight: 800,
              color: '#0f172a',
              margin: 0,
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Zap size={20} color="#f59e0b" aria-hidden="true" />
            <span>Atenção Agora</span>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.2rem 0.55rem',
                borderRadius: '12px',
                background: (attention?.criticalCount ?? 0) > 0 ? '#fef2f2' : '#fffbeb',
                color: (attention?.criticalCount ?? 0) > 0 ? '#b91c1c' : '#b45309'
              }}
            >
              {items.length} {items.length === 1 ? 'pendência' : 'pendências'}
            </span>
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
            O que precisa da sua atenção hoje — Prioridades e prazos imediatos
          </p>
        </div>

        {/* Faixa Resumo de Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600 }}>
          {(attention?.overdueTasksCount ?? 0) > 0 && (
            <span
              data-testid="badge-tarefas-atrasadas"
              style={{ padding: '0.25rem 0.6rem', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', border: '1px solid #fecaca' }}
            >
              <strong>{attention?.overdueTasksCount}</strong> atrasadas
            </span>
          )}

          {(attention?.upcomingTasksCount ?? 0) > 0 && (
            <span
              data-testid="badge-tarefas-proximas"
              style={{ padding: '0.25rem 0.6rem', background: '#fffbeb', color: '#b45309', borderRadius: '6px', border: '1px solid #fde68a' }}
            >
              <strong>{attention?.upcomingTasksCount}</strong> ≤ 7 dias
            </span>
          )}

          {(attention?.paymentAlertsCount ?? 0) > 0 && (
            <span
              data-testid="badge-pagamentos-alertas"
              style={{ padding: '0.25rem 0.6rem', background: '#eff6ff', color: '#1d4ed8', borderRadius: '6px', border: '1px solid #bfdbfe' }}
            >
              <strong>{attention?.paymentAlertsCount}</strong> pagamentos
            </span>
          )}

          {(attention?.reajusteAlertsCount ?? 0) > 0 && (
            <span
              data-testid="badge-reajustes-radar"
              style={{ padding: '0.25rem 0.6rem', background: '#f5f3ff', color: '#6d28d9', borderRadius: '6px', border: '1px solid #ddd6fe' }}
            >
              <strong>{attention?.reajusteAlertsCount}</strong> reajustes
            </span>
          )}
        </div>
      </div>

      {/* Lista de Sinais Priorizados */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {displayItems.map((item: DashboardAttentionItem) => {
          const config = severityConfig[item.severity] || severityConfig.INFO;
          const isActionable = Boolean(item.contractKey || item.numeroAta);

          return (
            <article
              key={item.id}
              data-testid={`attention-item-${item.id}`}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderLeft: `4px solid ${config.borderLeft}`,
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                transition: 'background 0.15s ease'
              }}
            >
              {/* Conteúdo Principal */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {/* Badge de Severidade */}
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.45rem',
                      borderRadius: '4px',
                      background: config.badgeBg,
                      color: config.badgeColor,
                      letterSpacing: '0.03em'
                    }}
                  >
                    {config.label}
                  </span>

                  {/* Categoria */}
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    {getCategoryIcon(item.category)}
                    <span>{getCategoryLabel(item.category)}</span>
                  </span>

                  {/* Badge Específico */}
                  {item.badgeLabel && (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        background: '#f1f5f9',
                        color: '#334155'
                      }}
                    >
                      {item.badgeLabel}
                    </span>
                  )}
                </div>

                {/* Título do Sinal */}
                <div
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    marginTop: '0.25rem',
                    lineHeight: 1.3
                  }}
                >
                  {item.title}
                </div>

                {/* Descrição e Detalhes */}
                {item.description && (
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: '#475569',
                      marginTop: '0.15rem',
                      lineHeight: 1.3
                    }}
                  >
                    {item.description}
                  </div>
                )}
              </div>

              {/* Ação de Navegação Canônica */}
              {isActionable && (
                <div>
                  {item.contractKey ? (
                    <button
                      type="button"
                      onClick={() => handleContractClick(item.contractKey)}
                      aria-label={`Ver contrato ${item.contractKey} para tratar ${item.title}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.45rem 0.75rem',
                        background: '#f8fafc',
                        color: '#0284c7',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <span>Ver Contrato</span>
                      <ArrowRight size={14} />
                    </button>
                  ) : item.numeroAta ? (
                    <button
                      type="button"
                      onClick={() => handleAtaClick(item.numeroAta)}
                      aria-label={`Ver Ata ${item.numeroAta} para tratar ${item.title}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.45rem 0.75rem',
                        background: '#f8fafc',
                        color: '#6366f1',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <span>Ver Ata</span>
                      <ArrowRight size={14} />
                    </button>
                  ) : null}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {items.length > maxItems && (
        <div style={{ marginTop: '0.75rem', textAlign: 'center', fontSize: '0.78rem', color: '#64748b' }}>
          Exibindo <strong>{maxItems}</strong> de <strong>{items.length}</strong> pendências prioritárias.
        </div>
      )}
    </section>
  );
};
