import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, AlertTriangle, AlertCircle, ArrowRight, ChevronRight } from 'lucide-react';
import { AppCard } from '../../design-system/components/AppCard';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { ProgressBar } from '../../design-system/components/ProgressBar';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import type { ManagementDashboardArpSummary } from '../../types/managementDashboard';

interface HomeArpBalancesSummaryProps {
  arp?: ManagementDashboardArpSummary;
  loading?: boolean;
}

export const HomeArpBalancesSummary: React.FC<HomeArpBalancesSummaryProps> = ({
  arp,
  loading = false
}) => {
  const navigate = useNavigate();

  const consumoGlobal = arp?.percentualConsumoGlobal || 0;
  const criticosCount = arp?.itensCriticosCount || 0;
  const proximoLimiteCount = arp?.itensProximosLimiteCount || 0;
  const itensCriticos = (arp?.itensCriticosDetalhe || arp?.topItensConsumidos || []).slice(0, 3);

  return (
    <AppCard
      variant="default"
      padding="lg"
      data-testid="home-arp-balances-section"
    >
      <SectionHeader
        title="Atas de Registro de Preços & Saldos"
        subtitle="Consumo físico e monitoramento de saturação de itens"
        actions={
          <button
            type="button"
            onClick={() => navigate('/atas')}
            data-testid="home-view-atas-btn"
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
            Ver Atas <ArrowRight size={14} />
          </button>
        }
      />

      <div style={{ marginTop: '1.25rem' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <SkeletonLoader variant="card" height="80px" />
            <SkeletonLoader variant="card" height="80px" />
            <SkeletonLoader variant="card" height="80px" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Métricas Resumidas */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem'
            }}>
              {/* Consumo Global */}
              <div style={{
                padding: '1rem',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#0c326f' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Consumo Global</span>
                  <Package size={16} />
                </div>
                <div style={{ margin: '0.5rem 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>
                      {consumoGlobal.toFixed(1)}%
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>da cota homologada</span>
                  </div>
                  <ProgressBar
                    value={consumoGlobal}
                    colorScheme="auto"
                    showPercent={false}
                    height="8px"
                  />
                </div>
              </div>

              {/* Itens Críticos (>=85%) */}
              <div style={{
                padding: '1rem',
                background: criticosCount > 0 ? '#fef2f2' : '#f8fafc',
                border: criticosCount > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: criticosCount > 0 ? '#dc2626' : '#64748b' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Consumo Crítico (≥85%)</span>
                  <AlertTriangle size={16} />
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: criticosCount > 0 ? '#991b1b' : '#0f172a', marginTop: '0.35rem' }}>
                  {criticosCount} {criticosCount === 1 ? 'item' : 'itens'}
                </div>
              </div>

              {/* Próximo do Limite (70% - 84%) */}
              <div style={{
                padding: '1rem',
                background: proximoLimiteCount > 0 ? '#fffbeb' : '#f8fafc',
                border: proximoLimiteCount > 0 ? '1px solid #fde68a' : '1px solid #e2e8f0',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: proximoLimiteCount > 0 ? '#d97706' : '#64748b' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Próximo Limite (70–84%)</span>
                  <AlertCircle size={16} />
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: proximoLimiteCount > 0 ? '#b45309' : '#0f172a', marginTop: '0.35rem' }}>
                  {proximoLimiteCount} {proximoLimiteCount === 1 ? 'item' : 'itens'}
                </div>
              </div>
            </div>

            {/* Lista de Itens Críticos */}
            {itensCriticos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Itens com Maior Consumo Físico
                </div>
                {itensCriticos.map((item) => (
                  <div
                    key={item.itemKey}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: '240px' }}>
                      <Package size={16} color="#059669" />
                      <div>
                        <span style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0f172a' }}>
                          Ata nº {item.numeroAta} • Item {item.numeroItem}
                        </span>
                        {item.descricaoItem && (
                          <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '0.4rem' }}>
                            — {item.descricaoItem}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        color: item.percentualConsumido >= 85 ? '#dc2626' : '#d97706',
                        background: item.percentualConsumido >= 85 ? '#fef2f2' : '#fffbeb',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px'
                      }}>
                        {item.percentualConsumido.toFixed(1)}% consumido
                      </span>

                      <button
                        type="button"
                        onClick={() => navigate('/atas')}
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
                        Ver Ata <ChevronRight size={13} />
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
