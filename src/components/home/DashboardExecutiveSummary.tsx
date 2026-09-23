import React from 'react';
import { Package, FileText, AlertTriangle, DollarSign } from 'lucide-react';

interface ExecutiveSummaryProps {
  totalArps?: number;
  activeArps?: number;
  totalContracts?: number;
  activeContracts?: number;
  expiringContractsCount?: number;
  totalContractValue?: number;
  loading?: boolean;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const DashboardExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({
  totalArps = 0,
  activeArps = 0,
  totalContracts = 0,
  activeContracts = 0,
  expiringContractsCount = 0,
  totalContractValue = 0,
  loading = false
}) => {
  return (
    <section aria-labelledby="executive-summary-title">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h3 id="executive-summary-title" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>
            Resumo Executivo
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
            Indicadores consolidados da UASG 200331 (SENASP / MJSP)
          </p>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1.25rem'
      }}>
        {/* Card 1: Atas de Registro de Preços */}
        <div style={{
          background: '#ffffff',
          borderRadius: '10px',
          padding: '1.25rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderTop: '4px solid #0c326f'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
                Atas de RP
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0c326f', marginTop: '0.25rem' }}>
                {loading ? '—' : totalArps}
              </div>
            </div>
            <div style={{ padding: '0.5rem', background: '#eff6ff', borderRadius: '8px', color: '#0c326f' }}>
              <Package size={22} />
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
            <span><strong>{loading ? '—' : activeArps}</strong> com vigência ativa</span>
          </div>
        </div>

        {/* Card 2: Contratos Administrativos */}
        <div style={{
          background: '#ffffff',
          borderRadius: '10px',
          padding: '1.25rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderTop: '4px solid #0284c7'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
                Contratos Ativos
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0284c7', marginTop: '0.25rem' }}>
                {loading ? '—' : activeContracts}
              </div>
            </div>
            <div style={{ padding: '0.5rem', background: '#e0f2fe', borderRadius: '8px', color: '#0284c7' }}>
              <FileText size={22} />
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#475569' }}>
            Total de <strong>{loading ? '—' : totalContracts}</strong> contratos monitorados
          </div>
        </div>

        {/* Card 3: Contratos a Vencer em 90 dias */}
        <div style={{
          background: '#ffffff',
          borderRadius: '10px',
          padding: '1.25rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderTop: '4px solid #f59e0b'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#b45309' }}>
                A Vencer (≤ 90 dias)
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#d97706', marginTop: '0.25rem' }}>
                {loading ? '—' : expiringContractsCount}
              </div>
            </div>
            <div style={{ padding: '0.5rem', background: '#fef3c7', borderRadius: '8px', color: '#d97706' }}>
              <AlertTriangle size={22} />
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#b45309', fontWeight: 600 }}>
            Requer atenção e análise de prorrogação
          </div>
        </div>

        {/* Card 4: Valor Total sob Gestão */}
        <div style={{
          background: '#ffffff',
          borderRadius: '10px',
          padding: '1.25rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderTop: '4px solid #059669'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
                Valor sob Gestão Contratual
              </span>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#065f46', marginTop: '0.4rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {loading ? '—' : formatCurrency(totalContractValue)}
              </div>
            </div>
            <div style={{ padding: '0.5rem', background: '#ecfdf5', borderRadius: '8px', color: '#059669' }}>
              <DollarSign size={22} />
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#047857' }}>
            Soma global de contratos vigentes
          </div>
        </div>
      </div>
    </section>
  );
};
