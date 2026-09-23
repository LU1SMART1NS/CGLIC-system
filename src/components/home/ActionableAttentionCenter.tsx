import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Clock, ChevronRight, CheckCircle2, ArrowRight, FileText, Package, User } from 'lucide-react';
import type { CentralPrazosItem } from '../../types/centralPrazos';
import type { ExpiringContractItem } from '../../hooks/useHomeDashboardData';
import { formatDateBR } from '../../services/temporalEngineService';

interface ActionableAttentionCenterProps {
  items?: CentralPrazosItem[];
  expiringContracts?: ExpiringContractItem[];
  loading?: boolean;
}

export const ActionableAttentionCenter: React.FC<ActionableAttentionCenterProps> = ({
  items = [],
  expiringContracts = [],
  loading = false
}) => {
  const navigate = useNavigate();

  // Se items da Central de Prazos foram passados, usamos eles prioritariamente
  const hasCentralItems = items.length > 0;
  const criticalItems = hasCentralItems
    ? items.filter((i) => i.estadoTemporal !== 'CONCLUIDO').slice(0, 5)
    : [];

  const getBadgeStyle = (diasRestantes: number, estado: string) => {
    if (estado === 'ATRASADO' || diasRestantes < 0) {
      return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca', label: `${Math.abs(diasRestantes)}d atrasado` };
    }
    if (estado === 'VENCE_HOJE' || diasRestantes === 0) {
      return { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa', label: 'Vence hoje' };
    }
    if (diasRestantes <= 7) {
      return { bg: '#fef3c7', text: '#b45309', border: '#fde68a', label: `${diasRestantes} dias` };
    }
    return { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd', label: `${diasRestantes} dias` };
  };

  return (
    <section aria-labelledby="attention-center-title" style={{
      background: '#ffffff',
      borderRadius: '12px',
      padding: '1.5rem',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ padding: '0.4rem', background: '#fef3c7', borderRadius: '8px', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircle size={20} />
          </div>
          <div>
            <h3 id="attention-center-title" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Ações Prioritárias do Setor
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.15rem 0 0 0' }}>
              Prazos mais urgentes e obrigações pendentes de ação
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
          Ver todas na Central de Prazos <ArrowRight size={14} />
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>
          Carregando alertas e prazos do sistema...
        </div>
      ) : hasCentralItems ? (
        criticalItems.length === 0 ? (
          <div style={{
            padding: '1.75rem',
            textAlign: 'center',
            background: '#f0fdf4',
            borderRadius: '8px',
            border: '1px solid #bbf7d0',
            color: '#166534',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <CheckCircle2 size={24} color="#16a34a" />
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Nenhuma obrigação crítica ou atrasada no momento.</div>
            <div style={{ fontSize: '0.8rem', color: '#15803d' }}>Todos os prazos contratuais e de atas estão regulares.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {criticalItems.map((item) => {
              const badge = getBadgeStyle(item.diasRestantes, item.estadoTemporal);
              const isContrato = item.entidadeOrigem === 'CONTRATO';

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.85rem 1rem',
                    background: item.diasRestantes <= 7 ? '#fffbeb' : '#f8fafc',
                    border: item.diasRestantes <= 7 ? '1px solid #fde68a' : '1px solid #e2e8f0',
                    borderRadius: '8px',
                    gap: '1rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: '260px' }}>
                    {/* Badge de Prazo */}
                    <div style={{
                      padding: '0.35rem 0.6rem',
                      background: badge.bg,
                      color: badge.text,
                      border: `1px solid ${badge.border}`,
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      flexShrink: 0
                    }}>
                      <Clock size={13} />
                      {badge.label}
                    </div>

                    {/* Descrição e Entidade */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        {isContrato ? (
                          <FileText size={14} color="#0c326f" />
                        ) : (
                          <Package size={14} color="#059669" />
                        )}
                        <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>
                          {item.identificadorFormatado}
                        </strong>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          color: '#475569',
                          background: '#e2e8f0',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '4px'
                        }}>
                          {item.tipoItem === 'TAREFA_HUMANA' ? 'Tarefa' : 'Gatilho'}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.82rem', color: '#1e293b', fontWeight: 600 }}>
                        {item.acaoDescricao}
                      </div>

                      {item.responsavelNome && (
                        <div style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <User size={12} /> {item.responsavelNome} {item.isGestorContrato ? '(Gestor)' : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Data-Alvo & Botão de Navegação */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Deadline</div>
                      <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>
                        {formatDateBR(item.dataAlvo)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (isContrato) navigate('/contratos');
                        else navigate('/atas');
                      }}
                      title="Abrir detalhes no painel"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '32px',
                        height: '32px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        color: '#0c326f',
                        cursor: 'pointer'
                      }}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : expiringContracts.length === 0 ? (
        <div style={{
          padding: '1.75rem',
          textAlign: 'center',
          background: '#f0fdf4',
          borderRadius: '8px',
          border: '1px solid #bbf7d0',
          color: '#166534',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CheckCircle2 size={24} color="#16a34a" />
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Nenhum contrato com vencimento crítico nos próximos 90 dias.</div>
          <div style={{ fontSize: '0.8rem', color: '#15803d' }}>Todos os contratos vigentes estão com prazos regulares.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {expiringContracts.slice(0, 5).map(({ contract, diasRestantes }) => {
            const isUrgent = diasRestantes <= 30;
            const numeroDisplay = contract.numeroFormatado || `${contract.numero}/${contract.ano}`;

            return (
              <div
                key={contract.id || numeroDisplay}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1rem',
                  background: isUrgent ? '#fffbeb' : '#f8fafc',
                  border: isUrgent ? '1px solid #fde68a' : '1px solid #e2e8f0',
                  borderRadius: '8px',
                  gap: '1rem',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: '240px' }}>
                  <div style={{
                    padding: '0.35rem 0.6rem',
                    background: isUrgent ? '#ef4444' : '#f59e0b',
                    color: '#ffffff',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    flexShrink: 0
                  }}>
                    <Clock size={13} />
                    {diasRestantes <= 0 ? 'Vence hoje' : `${diasRestantes} dias`}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem' }}>
                        Contrato nº {numeroDisplay}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        ({contract.fornecedorNome || 'Fornecedor não informado'})
                      </span>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#475569', maxWidth: '600px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {contract.objeto || 'Objeto não informado'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  <button
                    type="button"
                    onClick={() => navigate('/contratos')}
                    title="Acessar no painel de contratos"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '32px',
                      height: '32px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      color: '#0c326f',
                      cursor: 'pointer'
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
