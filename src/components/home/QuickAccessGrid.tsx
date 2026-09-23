import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2, FileText, FileSpreadsheet, Clock, ArrowUpRight } from 'lucide-react';

interface QuickAccessGridProps {
  onOpenExportModal?: () => void;
  onOpenContractTemplatesModal?: () => void;
  onOpenSeiModal?: () => void;
  onOpenDepartmentsModal?: () => void;
}

export const QuickAccessGrid: React.FC<QuickAccessGridProps> = ({
  onOpenExportModal,
  onOpenSeiModal
}) => {
  const navigate = useNavigate();

  const actions = [
    {
      id: 'buscar-arp',
      title: 'Consultar Atas e Vigência',
      description: 'Buscar ARPs por número, ano, status e vigência oficial',
      icon: Search,
      onClick: () => navigate('/atas'),
      variant: 'primary'
    },
    {
      id: 'saldos-unidade',
      title: 'Alocações por Unidade',
      description: 'Acompanhar cotas de saldo distribuídas por departamento',
      icon: Building2,
      onClick: () => navigate('/atas/saldos-unidade'),
      variant: 'default'
    },
    {
      id: 'painel-contratos',
      title: 'Painel de Contratos',
      description: 'Acompanhar contratos, fornecedores e designações de fiscais',
      icon: FileText,
      onClick: () => navigate('/contratos'),
      variant: 'default'
    },
    {
      id: 'central-prazos',
      title: 'Central de Prazos e Tarefas',
      description: 'Monitorar deadlines, obrigações e tarefas com explicabilidade',
      icon: Clock,
      onClick: () => navigate('/prazos'),
      variant: 'default'
    },
    {
      id: 'processos-sei',
      title: 'Processos Administrativos (SEI)',
      description: 'Consultar e vincular processos SEI internos de contratação',
      icon: FileText,
      onClick: () => onOpenSeiModal && onOpenSeiModal(),
      variant: 'default'
    },
    {
      id: 'exportar-excel',
      title: 'Exportação Gerencial Excel',
      description: 'Gerar relatório parametrizado consolidando dados e saldos',
      icon: FileSpreadsheet,
      onClick: () => onOpenExportModal && onOpenExportModal(),
      variant: 'success'
    }
  ];

  return (
    <section aria-labelledby="quick-access-title" style={{
      background: '#ffffff',
      borderRadius: '12px',
      padding: '1.5rem',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h3 id="quick-access-title" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
          Acesso Rápido
        </h3>
        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
          Atalhos operacionais para as ações mais frequentes do sistema
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1rem'
      }}>
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <button
              key={act.id}
              type="button"
              onClick={act.onClick}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                padding: '1.1rem',
                background: act.variant === 'primary' ? 'rgba(12, 50, 111, 0.03)' : '#f8fafc',
                border: act.variant === 'primary' ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease-in-out',
                gap: '0.75rem'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
                e.currentTarget.style.borderColor = act.variant === 'primary' ? '#0c326f' : '#cbd5e1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = act.variant === 'primary' ? '#bfdbfe' : '#e2e8f0';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <div style={{
                  padding: '0.45rem',
                  borderRadius: '6px',
                  background: act.variant === 'primary' ? '#0c326f' : act.variant === 'success' ? '#16a34a' : '#e2e8f0',
                  color: act.variant === 'primary' || act.variant === 'success' ? '#ffffff' : '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon size={18} />
                </div>
                <ArrowUpRight size={16} color="#94a3b8" />
              </div>

              <div>
                <div style={{
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  color: act.variant === 'primary' ? '#0c326f' : '#0f172a',
                  marginBottom: '0.2rem'
                }}>
                  {act.title}
                </div>
                <p style={{
                  fontSize: '0.76rem',
                  color: '#64748b',
                  margin: 0,
                  lineHeight: 1.35
                }}>
                  {act.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
