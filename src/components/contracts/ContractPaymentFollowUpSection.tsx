import React, { useState } from 'react';
import {
  DollarSign,
  Plus,
  Calendar,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  User,
  Check,
  Info
} from 'lucide-react';
import type {
  ContractDashboardRecord
} from '../../types';
import type {
  PaymentFollowUpCycle,
  PaymentCycleInput,
  PaymentWorkflowStatus
} from '../../types/paymentFollowUp';
import { useContractPaymentFollowUp } from '../../hooks/useContractPaymentFollowUp';
import { getExecutionModeDisplay } from './ContractAttentionCenter';

interface ContractPaymentFollowUpSectionProps {
  contract: ContractDashboardRecord;
  contractKey: string;
}

const STATUS_CONFIG: Record<
  PaymentWorkflowStatus,
  { label: string; bg: string; color: string; border: string }
> = {
  RECEBIDO: { label: 'Atesto Recebido', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  ATRIBUIDO: { label: 'Atribuído para Instrução', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  EM_INSTRUCAO: { label: 'Em Instrução', bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  PENDENTE_DOCUMENTACAO: { label: 'Pendente Documentação', bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
  DESPACHO_ELABORADO: { label: 'Despacho Elaborado', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  ENVIADO_CGOFI: { label: 'Enviado à CGOFI', bg: '#e0e7ff', color: '#4338ca', border: '#c7d2fe' },
  AGUARDANDO_CGOFI: { label: 'Aguardando CGOFI', bg: '#fdf4ff', color: '#86198f', border: '#f5d0fe' },
  DEVOLVIDO_FISCAL: { label: 'Devolvido ao Fiscal', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  PAGAMENTO_CONFIRMADO: { label: 'Pagamento Confirmado (OB)', bg: '#dcfce7', color: '#14532d', border: '#86efac' },
  CONCLUIDO: { label: 'Ciclo Concluído', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
  CANCELADO: { label: 'Cancelado', bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' }
};

const WORKFLOW_STEPS = [
  { id: 'RECEPCAO', label: '1. Atesto / Fatura' },
  { id: 'INSTRUCAO', label: '2. Instrução' },
  { id: 'DESPACHO', label: '3. Despacho' },
  { id: 'ENVIO_CGOFI', label: '4. Envio CGOFI' },
  { id: 'ACOMPANHAMENTO', label: '5. Acompanhamento' },
  { id: 'PAGAMENTO', label: '6. Pagamento (OB)' }
];

function getActiveStepIndex(status: PaymentWorkflowStatus): number {
  switch (status) {
    case 'RECEBIDO':
    case 'ATRIBUIDO':
      return 0;
    case 'EM_INSTRUCAO':
    case 'PENDENTE_DOCUMENTACAO':
      return 1;
    case 'DESPACHO_ELABORADO':
      return 2;
    case 'ENVIADO_CGOFI':
      return 3;
    case 'AGUARDANDO_CGOFI':
    case 'DEVOLVIDO_FISCAL':
      return 4;
    case 'PAGAMENTO_CONFIRMADO':
    case 'CONCLUIDO':
      return 5;
    default:
      return 0;
  }
}

export const ContractPaymentFollowUpSection: React.FC<ContractPaymentFollowUpSectionProps> = ({
  contractKey
}) => {
  const {
    cycles,
    activeCount,
    registerPaymentCycle,
    updatePaymentCycle
  } = useContractPaymentFollowUp(contractKey);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedCycles, setExpandedCycles] = useState<Record<string, boolean>>({});

  // Form states
  const [competencia, setCompetencia] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [documentoAtestoSei, setDocumentoAtestoSei] = useState('');
  const [valorAtesto, setValorAtesto] = useState('');
  const [dataAssinaturaAtesto, setDataAssinaturaAtesto] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [dataVencimentoFatura, setDataVencimentoFatura] = useState('');
  const [responsavelNome, setResponsavelNome] = useState('');

  const toggleExpand = (cycleKey: string) => {
    setExpandedCycles(prev => ({
      ...prev,
      [cycleKey]: !prev[cycleKey]
    }));
  };

  const handleCreateCycle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!competencia || !dataAssinaturaAtesto || !dataVencimentoFatura || !documentoAtestoSei) return;

    const input: PaymentCycleInput = {
      contractKey,
      competencia: competencia,
      dataAssinaturaAtesto: dataAssinaturaAtesto,
      dataVencimentoFatura: dataVencimentoFatura,
      documentoAtestoSei: documentoAtestoSei.trim(),
      valorAtesto: valorAtesto ? parseFloat(valorAtesto.replace(/\./g, '').replace(',', '.')) : 0,
      responsavelNome: responsavelNome.trim() || undefined
    };

    registerPaymentCycle(input);

    // Reset form & close modal
    setDocumentoAtestoSei('');
    setValorAtesto('');
    setDataVencimentoFatura('');
    setResponsavelNome('');
    setIsModalOpen(false);
  };

  const handleQuickAdvanceStatus = (cycle: PaymentFollowUpCycle) => {
    const nextStatusMap: Partial<Record<PaymentWorkflowStatus, Partial<PaymentCycleInput>>> = {
      RECEBIDO: { responsavelNome: responsavelNome || 'Servidor Designado' },
      ATRIBUIDO: { documentoDespachoSei: 'Despacho SEI Gerado' },
      EM_INSTRUCAO: { documentoDespachoSei: 'Despacho SEI Gerado' },
      DESPACHO_ELABORADO: { dataEnvioCgofi: new Date().toISOString().split('T')[0] },
      ENVIADO_CGOFI: { dataOrdemBancaria: new Date().toISOString().split('T')[0], numeroOrdemBancaria: '2026OB800123' },
      AGUARDANDO_CGOFI: {
        numeroOrdemBancaria: '2026OB800123',
        dataOrdemBancaria: new Date().toISOString().split('T')[0]
      }
    };

    const updates = nextStatusMap[cycle.status];
    if (updates) {
      updatePaymentCycle(cycle.cycleKey, updates);
    }
  };

  return (
    <div id="contract-payment-followup-section" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header com ações e badge de acompanhamento */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem 1.25rem',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#ecfdf5',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <DollarSign size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                Ciclos de Atesto e Faturamento
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.1rem 0.5rem',
                  borderRadius: '12px',
                  backgroundColor: activeCount > 0 ? '#eff6ff' : '#f1f5f9',
                  color: activeCount > 0 ? '#1d4ed8' : '#64748b',
                  border: `1px solid ${activeCount > 0 ? '#bfdbfe' : '#cbd5e1'}`
                }}
              >
                {activeCount} {activeCount === 1 ? 'ciclo ativo' : 'ciclos ativos'}
              </span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Acompanhamento operacional perante a CGOFI (SaldoARP acompanha • CGOFI executa o pagamento)
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 0.9rem',
            backgroundColor: '#0c326f',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          <Plus size={16} /> Registrar Atesto / Faturamento
        </button>
      </div>

      {/* Estado Vazio: Nenhum ciclo cadastrado */}
      {cycles.length === 0 && (
        <div
          style={{
            padding: '2.5rem 1.5rem',
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px dashed #cbd5e1',
            textAlign: 'center',
            color: '#64748b'
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: '#f1f5f9',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.75rem auto'
            }}
          >
            <Clock size={22} />
          </div>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#334155', margin: '0 0 0.25rem 0' }}>
            Nenhum ciclo de faturamento/atesto em acompanhamento.
          </h4>
          <p style={{ fontSize: '0.84rem', color: '#64748b', maxWidth: '480px', margin: '0 auto 1.25rem auto' }}>
            Quando o Fiscal Técnico emitir um Termo de Atesto no SEI, registre o ciclo aqui para acompanhar os prazos de instrução e envio à CGOFI.
          </p>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#f8fafc',
              color: '#0c326f',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Plus size={15} /> Registrar Primeiro Ciclo
          </button>
        </div>
      )}

      {/* Listagem de Ciclos de Faturamento */}
      {cycles.map(cycle => {
        const isExpanded = Boolean(expandedCycles[cycle.cycleKey]);
        const statusStyle = STATUS_CONFIG[cycle.status] || STATUS_CONFIG.RECEBIDO;
        const currentStepIdx = getActiveStepIndex(cycle.status);

        return (
          <div
            key={cycle.cycleKey}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              overflow: 'hidden'
            }}
          >
            {/* Header do Card do Ciclo */}
            <div
              style={{
                padding: '1.15rem 1.25rem',
                borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem'
              }}
            >
              <div style={{ flex: 1, minWidth: '260px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '4px',
                      backgroundColor: statusStyle.bg,
                      color: statusStyle.color,
                      border: `1px solid ${statusStyle.border}`
                    }}
                  >
                    {statusStyle.label}
                  </span>
                  <strong style={{ fontSize: '0.98rem', color: '#0f172a' }}>
                    Competência {cycle.competencia}
                  </strong>
                  {cycle.input.documentoAtestoSei && (
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      • Doc SEI: <strong>{cycle.input.documentoAtestoSei}</strong>
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.8rem', color: '#64748b', flexWrap: 'wrap' }}>
                  {cycle.input.responsavelNome ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <User size={13} /> Responsável: <strong>{cycle.input.responsavelNome}</strong>
                    </span>
                  ) : (
                    <span style={{ color: '#c2410c', fontWeight: 600 }}>
                      ⚠ Servidor de instrução não atribuído
                    </span>
                  )}
                  {cycle.input.valorAtesto !== undefined && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#0f172a' }}>
                      <DollarSign size={13} color="#059669" /> Valor Atestado:{' '}
                      <strong>
                        {cycle.input.valorAtesto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </strong>
                    </span>
                  )}
                  {cycle.input.dataVencimentoFatura && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={13} /> Vencimento:{' '}
                      <strong>{new Date(cycle.input.dataVencimentoFatura + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>
                      {cycle.prazos?.diasUteisAteVencimento !== undefined && (
                        <span style={{ color: cycle.prazos.diasUteisAteVencimento < 0 ? '#dc2626' : '#475569' }}>
                          ({cycle.prazos.diasUteisAteVencimento < 0 ? `${Math.abs(cycle.prazos.diasUteisAteVencimento)}d vencida` : `${cycle.prazos.diasUteisAteVencimento}d úteis`})
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Ações do Card */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {cycle.status !== 'PAGAMENTO_CONFIRMADO' && cycle.status !== 'CONCLUIDO' && (
                  <button
                    type="button"
                    onClick={() => handleQuickAdvanceStatus(cycle)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.4rem 0.75rem',
                      backgroundColor: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1px solid #bfdbfe',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Avançar Etapa
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleExpand(cycle.cycleKey)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.4rem 0.75rem',
                    backgroundColor: '#f8fafc',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  {isExpanded ? 'Ocultar Tarefas' : 'Ver Tarefas (11)'}
                </button>
              </div>
            </div>

            {/* Stepper Visual de Progresso do Workflow */}
            <div style={{ padding: '0.85rem 1.25rem', backgroundColor: '#f8fafc', borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                {WORKFLOW_STEPS.map((step, idx) => {
                  const isDone = idx < currentStepIdx || cycle.status === 'CONCLUIDO' || cycle.status === 'PAGAMENTO_CONFIRMADO';
                  const isCurrent = idx === currentStepIdx && cycle.status !== 'CONCLUIDO' && cycle.status !== 'PAGAMENTO_CONFIRMADO';

                  return (
                    <div
                      key={step.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.75rem',
                        fontWeight: isCurrent ? 800 : isDone ? 700 : 500,
                        color: isCurrent ? '#1d4ed8' : isDone ? '#15803d' : '#94a3b8',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.7rem',
                          backgroundColor: isCurrent ? '#dbeafe' : isDone ? '#dcfce7' : '#e2e8f0',
                          color: isCurrent ? '#1d4ed8' : isDone ? '#15803d' : '#64748b'
                        }}
                      >
                        {isDone ? <Check size={12} /> : idx + 1}
                      </div>
                      <span>{step.label}</span>
                      {idx < WORKFLOW_STEPS.length - 1 && (
                        <div style={{ width: '16px', height: '1px', backgroundColor: isDone ? '#86efac' : '#cbd5e1', margin: '0 0.15rem' }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Alertas Ativos do Ciclo */}
            {cycle.alerts && cycle.alerts.length > 0 && (
              <div style={{ padding: '0.75rem 1.25rem', backgroundColor: '#fff8f8', borderBottom: isExpanded ? '1px solid #fee2e2' : 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {cycle.alerts.map(alert => (
                    <div
                      key={alert.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.78rem',
                        color: alert.nivel === 'CRITICO' ? '#991b1b' : alert.nivel === 'ATENCAO' ? '#c2410c' : '#0369a1',
                        fontWeight: 600
                      }}
                    >
                      <AlertTriangle size={14} />
                      <span>{alert.mensagem}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conteúdo Expandido: 5 Macroetapas e 11 Tarefas */}
            {isExpanded && cycle.tasks && (
              <div style={{ padding: '1.25rem', backgroundColor: '#ffffff' }}>
                <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.75rem 0' }}>
                  Macroetapas e Tarefas Operacionais (Template Canônico 14.133)
                </h5>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {cycle.tasks.macrotarefas.map(macro => (
                    <div
                      key={macro.id}
                      style={{
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          padding: '0.5rem 0.85rem',
                          backgroundColor: '#f8fafc',
                          borderBottom: '1px solid #e2e8f0',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: '#334155'
                        }}
                      >
                        {macro.nome}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {macro.tarefas.map(task => {
                          const modeInfo = getExecutionModeDisplay(task.executionMode);

                          return (
                            <div
                              key={task.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.65rem 0.85rem',
                                borderBottom: '1px solid #f1f5f9',
                                backgroundColor: '#ffffff',
                                gap: '0.75rem',
                                flexWrap: 'wrap'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: '240px' }}>
                                <span
                                  style={{
                                    fontSize: '0.82rem',
                                    color: '#1e293b',
                                    fontWeight: 600
                                  }}
                                >
                                  {task.nome}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span
                                  style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: '4px',
                                    backgroundColor: modeInfo.bg,
                                    color: modeInfo.color,
                                    border: `1px solid ${modeInfo.border}`
                                  }}
                                >
                                  {modeInfo.label}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Modal de Registro de Novo Ciclo de Atesto */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '520px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Registrar Ciclo de Atesto / Faturamento
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCycle} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                  Competência (Mês/Ano) *
                </label>
                <input
                  type="month"
                  value={competencia}
                  onChange={e => setCompetencia(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                  Nº Documento Atesto (SEI) *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Doc 12345678"
                  value={documentoAtestoSei}
                  onChange={e => setDocumentoAtestoSei(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                    Data Assinatura Atesto *
                  </label>
                  <input
                    type="date"
                    value={dataAssinaturaAtesto}
                    onChange={e => setDataAssinaturaAtesto(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.55rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.88rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                    Vencimento da Fatura *
                  </label>
                  <input
                    type="date"
                    value={dataVencimentoFatura}
                    onChange={e => setDataVencimentoFatura(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.55rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.88rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                    Valor Atestado (R$)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 15450,00"
                    value={valorAtesto}
                    onChange={e => setValorAtesto(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.55rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.88rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                    Servidor Designado
                  </label>
                  <input
                    type="text"
                    placeholder="Servidor de confecção"
                    value={responsavelNome}
                    onChange={e => setResponsavelNome(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.55rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.88rem'
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '6px',
                  border: '1px solid #bbf7d0',
                  fontSize: '0.78rem',
                  color: '#166534',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <Info size={16} />
                <span>
                  O registro instancia automaticamente o template canônico de 5 macroetapas e 11 tarefas operacionais.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '0.55rem 1rem',
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '0.55rem 1.25rem',
                    backgroundColor: '#0c326f',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Criar e Instanciar Ciclo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
