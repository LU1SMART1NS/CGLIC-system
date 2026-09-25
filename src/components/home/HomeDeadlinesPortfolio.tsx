import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Calendar, RefreshCw, Scale, ArrowRight, ChevronRight, FileText } from 'lucide-react';
import { AppCard } from '../../design-system/components/AppCard';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import type {
  ManagementDashboardDeadlinesSummary,
  ManagementDashboardAttentionSummary
} from '../../types/managementDashboard';

interface HomeDeadlinesPortfolioProps {
  deadlines?: ManagementDashboardDeadlinesSummary;
  attention?: ManagementDashboardAttentionSummary;
  loading?: boolean;
}

export const HomeDeadlinesPortfolio: React.FC<HomeDeadlinesPortfolioProps> = ({
  deadlines,
  attention,
  loading = false
}) => {
  const navigate = useNavigate();

  const v30 = deadlines?.vencendo30Dias || 0;
  const v60 = deadlines?.vencendo60Dias || 0;
  const v90 = deadlines?.vencendo90Dias || 0;
  const prorrogações = deadlines?.prorrogaçõesEmCurso || 0;
  const reajustes = attention?.radarsReajuste?.length || attention?.reajusteAlertsCount || 0;
  const itensVencendo = (deadlines?.itensVencendo || []).slice(0, 3);

  return (
    <AppCard
      variant="default"
      padding="lg"
      data-testid="home-deadlines-section"
    >
      <SectionHeader
        title="Carteira & Prazos"
        subtitle="Vigências, prorrogações e reajustes contratuais iminentes"
        actions={
          <button
            type="button"
            onClick={() => navigate('/contratos')}
            data-testid="home-view-contracts-btn"
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
            Ver Contratos <ArrowRight size={14} />
          </button>
        }
      />

      <div style={{ marginTop: '1.25rem' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.875rem' }}>
            <SkeletonLoader variant="card" height="74px" />
            <SkeletonLoader variant="card" height="74px" />
            <SkeletonLoader variant="card" height="74px" />
            <SkeletonLoader variant="card" height="74px" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Faixa de Indicadores de Prazos */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.875rem'
            }}>
              {/* 1. Vencimento em 30 dias */}
              <div style={{
                padding: '0.875rem 1rem',
                background: v30 > 0 ? '#fef2f2' : '#f8fafc',
                border: v30 > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: v30 > 0 ? '#dc2626' : '#64748b' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Vencem em 30d</span>
                  <Clock size={16} />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: v30 > 0 ? '#991b1b' : '#0f172a', marginTop: '0.25rem' }}>
                  {v30} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: v30 > 0 ? '#b91c1c' : '#64748b' }}>{v30 === 1 ? 'contrato' : 'contratos'}</span>
                </div>
              </div>

              {/* 2. Vencimento em 60 a 90 dias */}
              <div style={{
                padding: '0.875rem 1rem',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Vencem em 60–90d</span>
                  <Calendar size={16} />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: '0.25rem' }}>
                  {v60 + v90} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>contratos</span>
                </div>
              </div>

              {/* 3. Janela de Prorrogação (Horizonte temporal <= 180 dias) */}
              <div style={{
                padding: '0.875rem 1rem',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Janela Prorrogação</span>
                  <RefreshCw size={16} />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: '0.25rem' }}>
                  {prorrogações} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>em até 180d</span>
                </div>
              </div>

              {/* 4. Reajustes no Radar */}
              <div style={{
                padding: '0.875rem 1rem',
                background: reajustes > 0 ? '#fffbeb' : '#f8fafc',
                border: reajustes > 0 ? '1px solid #fde68a' : '1px solid #e2e8f0',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: reajustes > 0 ? '#d97706' : '#64748b' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Radar Reajuste</span>
                  <Scale size={16} />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: reajustes > 0 ? '#b45309' : '#0f172a', marginTop: '0.25rem' }}>
                  {reajustes} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: reajustes > 0 ? '#b45309' : '#64748b' }}>no radar</span>
                </div>
              </div>
            </div>

            {/* Lista dos contratos com vencimento mais próximo */}
            {itensVencendo.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Próximos Vencimentos Contratuais
                </div>
                {itensVencendo.map((item) => (
                  <div
                    key={item.contractKey}
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
                      <FileText size={16} color="#0c326f" />
                      <div>
                        <span style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0f172a' }}>
                          Contrato nº {item.numeroContrato}
                        </span>
                        {item.fornecedorNome && (
                          <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '0.4rem' }}>
                            • {item.fornecedorNome}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: item.diasRestantes <= 30 ? '#dc2626' : '#d97706',
                        background: item.diasRestantes <= 30 ? '#fef2f2' : '#fffbeb',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px'
                      }}>
                        {item.diasRestantes <= 0 ? 'Vence hoje' : `${item.diasRestantes} dias`}
                      </span>

                      <button
                        type="button"
                        onClick={() => navigate(`/contratos/${encodeURIComponent(item.contractKey)}`)}
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
                        Abrir <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppCard>
  );
};
