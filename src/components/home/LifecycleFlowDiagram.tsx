import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ClipboardList, Scale, Package, Coins, FileText, Activity } from 'lucide-react';

interface LifecycleFlowProps {
  totalArps?: number;
  totalContracts?: number;
  loading?: boolean;
}

export const LifecycleFlowDiagram: React.FC<LifecycleFlowProps> = ({
  totalArps = 0,
  totalContracts = 0,
  loading = false
}) => {
  const navigate = useNavigate();

  const steps = [
    {
      id: 'planejamento',
      label: 'Planejamento',
      sublabel: 'DFD / PCA / IRP',
      icon: ClipboardList,
      status: 'planejado',
      route: null
    },
    {
      id: 'contratacao',
      label: 'Contratação',
      sublabel: 'Pregões e Editais',
      icon: Scale,
      status: 'planejado',
      route: null
    },
    {
      id: 'arp',
      label: 'Atas de RP',
      sublabel: 'Vigência e Itens',
      icon: Package,
      status: 'ativo',
      count: totalArps,
      countLabel: 'atas',
      route: '/atas'
    },
    {
      id: 'saldo',
      label: 'Saldo / Cotas',
      sublabel: 'Unidades e Carona',
      icon: Coins,
      status: 'ativo',
      count: 'Consolidado',
      route: '/atas/saldos-unidade'
    },
    {
      id: 'contrato',
      label: 'Contratos',
      sublabel: 'Gestão e Portarias',
      icon: FileText,
      status: 'ativo',
      count: totalContracts,
      countLabel: 'contratos',
      route: '/contratos'
    },
    {
      id: 'execucao',
      label: 'Execução',
      sublabel: 'Empenhos e Atestos',
      icon: Activity,
      status: 'ativo',
      count: 'Integrado',
      route: '/contratos'
    }
  ];

  return (
    <section aria-labelledby="lifecycle-title" style={{
      background: '#ffffff',
      borderRadius: '12px',
      padding: '1.5rem',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h3 id="lifecycle-title" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
          Ciclo de Gestão de Registro de Preços & Contratações
        </h3>
        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
          Visão integrada de ponta a ponta do processo de compras públicas da SENASP / MJSP
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '0.75rem',
        alignItems: 'stretch'
      }}>
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isClickable = !!step.route;

          return (
            <div
              key={step.id}
              onClick={() => isClickable && navigate(step.route!)}
              role={isClickable ? 'button' : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onKeyDown={(e) => {
                if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                  navigate(step.route!);
                }
              }}
              style={{
                background: step.status === 'ativo' ? '#f8fafc' : '#fcfcfc',
                border: step.status === 'ativo' ? '1px solid #cbd5e1' : '1px dashed #e2e8f0',
                borderRadius: '8px',
                padding: '1rem 0.85rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: isClickable ? 'pointer' : 'default',
                opacity: step.status === 'planejado' ? 0.75 : 1,
                transition: 'all 0.15s ease-in-out',
                position: 'relative'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{
                    padding: '0.4rem',
                    background: step.status === 'ativo' ? '#e0f2fe' : '#f1f5f9',
                    borderRadius: '6px',
                    color: step.status === 'ativo' ? '#0369a1' : '#94a3b8'
                  }}>
                    <Icon size={16} />
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8' }}>
                    0{idx + 1}
                  </span>
                </div>

                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>
                  {step.label}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.1rem' }}>
                  {step.sublabel}
                </div>
              </div>

              <div style={{ marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {step.status === 'ativo' ? (
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0c326f' }}>
                    {loading ? '—' : step.count} {step.countLabel ? ` ${step.countLabel}` : ''}
                  </span>
                ) : (
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    Em integração
                  </span>
                )}

                {isClickable && (
                  <ArrowRight size={13} color="#0c326f" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
