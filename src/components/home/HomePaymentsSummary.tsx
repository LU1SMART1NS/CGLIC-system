import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Clock, AlertCircle, ArrowRight, ChevronRight, CheckCircle2 } from 'lucide-react';
import { AppCard } from '../../design-system/components/AppCard';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import type { ManagementDashboardPaymentsSummary } from '../../types/managementDashboard';

interface HomePaymentsSummaryProps {
  payments?: ManagementDashboardPaymentsSummary;
  loading?: boolean;
}

export const HomePaymentsSummary: React.FC<HomePaymentsSummaryProps> = ({
  payments,
  loading = false
}) => {
  const navigate = useNavigate();

  const ciclosAbertos = payments?.ciclosAbertosCount || 0;
  const ciclosAtrasoCgofi = payments?.ciclosAtrasoCgofiCount || 0;
  const ciclosCriticos = payments?.ciclosCriticosCount || 0;
  const ciclosRecentes = (payments?.ciclosAbertosDetalhe || payments?.ciclosRecentes || []).slice(0, 3);

  return (
    <AppCard
      variant="default"
      padding="lg"
      data-testid="home-payments-section"
    >
      <SectionHeader
        title="Pagamentos"
        subtitle="Acompanhamento de atesto, instrução, CGOFI e pagamento."
        actions={
          <button
            type="button"
            onClick={() => navigate('/pagamentos')}
            data-testid="home-view-payments-btn"
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
            Ver Pagamentos <ArrowRight size={14} />
          </button>
        }
      />

      <div style={{ marginTop: '1.25rem' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.875rem' }}>
            <SkeletonLoader variant="card" height="74px" />
            <SkeletonLoader variant="card" height="74px" />
            <SkeletonLoader variant="card" height="74px" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Métricas Resumidas em Faixa Compacta */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.875rem'
            }}>
              {/* 1. Ciclos em Aberto */}
              <div style={{
                padding: '0.875rem 1rem',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#0c326f' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Ciclos em Aberto</span>
                  <Receipt size={16} />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: '0.25rem' }}>
                  {ciclosAbertos} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>{ciclosAbertos === 1 ? 'fatura' : 'faturas'}</span>
                </div>
              </div>

              {/* 2. Aguardando CGOFI */}
              <div style={{
                padding: '0.875rem 1rem',
                background: ciclosAtrasoCgofi > 0 ? '#fffbeb' : '#f8fafc',
                border: ciclosAtrasoCgofi > 0 ? '1px solid #fde68a' : '1px solid #e2e8f0',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: ciclosAtrasoCgofi > 0 ? '#d97706' : '#64748b' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Aguardando CGOFI</span>
                  <Clock size={16} />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: ciclosAtrasoCgofi > 0 ? '#b45309' : '#0f172a', marginTop: '0.25rem' }}>
                  {ciclosAtrasoCgofi} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: ciclosAtrasoCgofi > 0 ? '#b45309' : '#64748b' }}>{ciclosAtrasoCgofi === 1 ? 'pendência' : 'pendências'}</span>
                </div>
              </div>

              {/* 3. Faturas / Prazos Críticos */}
              <div style={{
                padding: '0.875rem 1rem',
                background: ciclosCriticos > 0 ? '#fef2f2' : '#f8fafc',
                border: ciclosCriticos > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: ciclosCriticos > 0 ? '#dc2626' : '#64748b' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Prazo Crítico</span>
                  <AlertCircle size={16} />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: ciclosCriticos > 0 ? '#991b1b' : '#0f172a', marginTop: '0.25rem' }}>
                  {ciclosCriticos} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: ciclosCriticos > 0 ? '#dc2626' : '#64748b' }}>{ciclosCriticos === 1 ? 'crítica' : 'críticas'}</span>
                </div>
              </div>
            </div>

            {/* Ciclos recentes ou pendentes / Empty State */}
            {ciclosRecentes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Ciclos em Foco
                </div>
                {ciclosRecentes.map((cycle) => (
                  <div
                    key={cycle.cycleKey}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.85rem',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      gap: '0.75rem',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Receipt size={16} color="#0c326f" />
                      <div>
                        <span style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0f172a' }}>
                          Nota Fiscal {cycle.input?.documentoAtestoSei || 'S/N'}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '0.4rem' }}>
                          • Contrato {cycle.contractKey}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: cycle.prazos?.statusPrazo === 'CRITICO' ? '#b91c1c' : '#475569',
                        background: cycle.prazos?.statusPrazo === 'CRITICO' ? '#fef2f2' : '#f1f5f9',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px'
                      }}>
                        {cycle.status}
                      </span>

                      <button
                        type="button"
                        onClick={() => navigate('/pagamentos')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: '#0c326f',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        Ver <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                data-testid="home-payments-empty"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.85rem 1rem',
                  background: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  borderRadius: '6px',
                  color: '#64748b',
                  fontSize: '0.82rem'
                }}
              >
                <CheckCircle2 size={16} color="#059669" />
                <span>Nenhum ciclo de pagamento exige atenção no contexto atual.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </AppCard>
  );
};
