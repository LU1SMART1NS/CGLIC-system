import React from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Clock,
  Calendar,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Check,
  TrendingUp
} from 'lucide-react';
import type {
  ContractDashboardRecord,
  ContractTask,
  ContractTaskPlan,
  TaskExecutionMode
} from '../../types';
import type { PaymentAlert } from '../../types/paymentFollowUp';
import type { ReajusteRadarAlert } from '../../types/contractReajusteRadar';
import { differenceInDays, parseDateBRT, formatDateBR } from '../../services/temporalEngineService';
import { useUpdateContractTask } from '../../hooks/useUpdateContractTask';
import { useContractPaymentFollowUp } from '../../hooks/useContractPaymentFollowUp';
import { useContractEvents } from '../../hooks/useContractEvents';
import { getContractManagementKey } from '../../services/contractManagementService';
import { evaluateContractReajusteRadar } from '../../services/contractReajusteRadarService';

interface ContractAttentionCenterProps {
  contract: ContractDashboardRecord;
  plan: ContractTaskPlan | null;
  paymentAlerts?: PaymentAlert[];
  reajusteAlert?: ReajusteRadarAlert | null;
  isLoading?: boolean;
}

export type AttentionPriorityLevel = 'VENCIDA' | 'HOJE' | 'URGENTE' | 'PROXIMA' | 'SEM_PRAZO';

export interface AttentionItem {
  task: ContractTask;
  macrotaskName: string;
  level: AttentionPriorityLevel;
  diasRestantes: number | null;
}

/**
 * Classifica a prioridade temporal da tarefa utilizando o temporalEngineService.
 */
export function classifyTaskAttention(task: ContractTask): { level: AttentionPriorityLevel; diasRestantes: number | null } {
  if (!task.prazo) {
    return { level: 'SEM_PRAZO', diasRestantes: null };
  }

  const prazoDate = parseDateBRT(task.prazo);
  if (!prazoDate) {
    return { level: 'SEM_PRAZO', diasRestantes: null };
  }

  const dias = differenceInDays(prazoDate);

  if (dias < 0) return { level: 'VENCIDA', diasRestantes: dias };
  if (dias === 0) return { level: 'HOJE', diasRestantes: 0 };
  if (dias <= 7) return { level: 'URGENTE', diasRestantes: dias };
  if (dias <= 30) return { level: 'PROXIMA', diasRestantes: dias };
  return { level: 'SEM_PRAZO', diasRestantes: dias };
}

/**
 * Tradução visual da semântica de execução (TaskExecutionMode — Fase 4.3C).
 */
export function getExecutionModeDisplay(mode?: TaskExecutionMode): {
  label: string;
  bg: string;
  color: string;
  border: string;
} {
  switch (mode) {
    case 'CONFIRMACAO':
      return {
        label: 'Confirmação Oficial',
        bg: '#eff6ff',
        color: '#1d4ed8',
        border: '#bfdbfe'
      };
    case 'EXTERNA':
      return {
        label: 'Ação Externa',
        bg: '#fdf4ff',
        color: '#86198f',
        border: '#f5d0fe'
      };
    case 'AUTOMATICA':
      return {
        label: 'Processamento Automático',
        bg: '#f0fdf4',
        color: '#15803d',
        border: '#bbf7d0'
      };
    case 'INTERNA':
    default:
      return {
        label: 'Providência Interna',
        bg: '#f8fafc',
        color: '#334155',
        border: '#cbd5e1'
      };
  }
}

export const ContractAttentionCenter: React.FC<ContractAttentionCenterProps> = ({
  contract,
  plan,
  paymentAlerts: externalPaymentAlerts,
  reajusteAlert: externalReajusteAlert,
  isLoading = false
}) => {
  const contractKey = contract.id || getContractManagementKey(contract.uasg, contract.numero, contract.ano);
  const updateMutation = useUpdateContractTask(contractKey);
  const { alerts: hookPaymentAlerts } = useContractPaymentFollowUp(contractKey);
  const { data: contractEvents = [] } = useContractEvents(contract);

  const paymentAlerts = externalPaymentAlerts || hookPaymentAlerts;

  // Radar Preditivo de Reajuste / Repactuação (Fase 7.5-C3)
  const computedReajusteAlert = React.useMemo(() => {
    if (externalReajusteAlert !== undefined) return externalReajusteAlert;
    return evaluateContractReajusteRadar({ contract, events: contractEvents });
  }, [externalReajusteAlert, contract, contractEvents]);

  // Extrair tarefas ativas e ordenar por prioridade de atenção
  const attentionItems: AttentionItem[] = React.useMemo(() => {
    if (!plan || !plan.macrotarefas) return [];

    const items: AttentionItem[] = [];

    for (const macro of plan.macrotarefas) {
      for (const t of macro.tarefas) {
        // Apenas tarefas não concluídas e aplicáveis
        if (t.status !== 'CONCLUIDA' && t.status !== 'NAO_APLICAVEL') {
          const { level, diasRestantes } = classifyTaskAttention(t);
          items.push({
            task: t,
            macrotaskName: macro.nome,
            level,
            diasRestantes
          });
        }
      }
    }

    // Regra canônica de ordenação por prioridade:
    // 1. Vencida (menor número de dias negativos primeiro)
    // 2. Vencendo hoje
    // 3. Urgente (1 a 7 dias)
    // 4. Próxima (8 a 30 dias)
    // 5. Sem prazo / Futura
    const priorityWeights: Record<AttentionPriorityLevel, number> = {
      VENCIDA: 1,
      HOJE: 2,
      URGENTE: 3,
      PROXIMA: 4,
      SEM_PRAZO: 5
    };

    items.sort((a, b) => {
      const weightDiff = priorityWeights[a.level] - priorityWeights[b.level];
      if (weightDiff !== 0) return weightDiff;

      // Desempate por dias restantes
      if (a.diasRestantes !== null && b.diasRestantes !== null) {
        return a.diasRestantes - b.diasRestantes;
      }
      if (a.diasRestantes !== null) return -1;
      if (b.diasRestantes !== null) return 1;

      return a.task.ordem - b.task.ordem;
    });

    return items;
  }, [plan]);

  const handleQuickComplete = (task: ContractTask) => {
    updateMutation.mutate({
      taskId: task.id,
      status: 'CONCLUIDA'
    });
  };

  const scrollToPaymentSection = () => {
    const el = document.getElementById('contract-payment-followup-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToTimelineSection = () => {
    const el = document.getElementById('contract-timeline-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
        Carregando pendências e tarefas do contrato...
      </div>
    );
  }

  const hasNoItems =
    attentionItems.length === 0 &&
    (!paymentAlerts || paymentAlerts.length === 0) &&
    !computedReajusteAlert;

  // Estado Positivo: Sem pendências que exijam atenção
  if (hasNoItems) {
    return (
      <div
        style={{
          background: '#f0fdf4',
          borderRadius: '10px',
          border: '1px solid #bbf7d0',
          padding: '1.5rem',
          textAlign: 'center',
          color: '#166534'
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: '#dcfce7',
            color: '#15803d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 0.75rem auto'
          }}
        >
          <CheckCircle2 size={22} />
        </div>
        <h4 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 0.35rem 0', color: '#14532d' }}>
          Tudo em dia com este contrato
        </h4>
        <p style={{ fontSize: '0.85rem', color: '#166534', margin: 0 }}>
          {plan ? 'Todas as tarefas do plano de gestão e ciclos de faturamento estão regulares.' : 'Nenhum plano de tarefas, ciclo de faturamento ou marco de reajuste possui pendências críticas neste momento.'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* Alerta de Radar Preditivo de Reajuste / Repactuação (Fase 7.5-C3) */}
      {computedReajusteAlert && (
        <div
          data-testid="reajuste-radar-alert-card"
          key={computedReajusteAlert.id}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '1rem 1.25rem',
            borderRadius: '8px',
            backgroundColor:
              computedReajusteAlert.nivel === 'VENCIDA'
                ? '#fff8f8'
                : computedReajusteAlert.nivel === 'HOJE' || computedReajusteAlert.nivel === 'URGENTE'
                ? '#fffbeb'
                : '#f0f9ff',
            border: `1px solid ${
              computedReajusteAlert.nivel === 'VENCIDA'
                ? '#fecaca'
                : computedReajusteAlert.nivel === 'HOJE' || computedReajusteAlert.nivel === 'URGENTE'
                ? '#fde68a'
                : '#bae6fd'
            }`,
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ flex: 1, minWidth: '280px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor:
                    computedReajusteAlert.nivel === 'VENCIDA'
                      ? '#fee2e2'
                      : computedReajusteAlert.nivel === 'HOJE' || computedReajusteAlert.nivel === 'URGENTE'
                      ? '#ffedd5'
                      : '#e0f2fe',
                  color:
                    computedReajusteAlert.nivel === 'VENCIDA'
                      ? '#991b1b'
                      : computedReajusteAlert.nivel === 'HOJE' || computedReajusteAlert.nivel === 'URGENTE'
                      ? '#c2410c'
                      : '#0369a1',
                  border: `1px solid ${
                    computedReajusteAlert.nivel === 'VENCIDA'
                      ? '#fecaca'
                      : computedReajusteAlert.nivel === 'HOJE' || computedReajusteAlert.nivel === 'URGENTE'
                      ? '#fed7aa'
                      : '#bae6fd'
                  }`
                }}
              >
                <Clock size={12} />
                {computedReajusteAlert.nivel === 'VENCIDA'
                  ? 'Marco Transcorrido'
                  : computedReajusteAlert.nivel === 'HOJE'
                  ? 'Marco Atingido Hoje'
                  : computedReajusteAlert.nivel === 'URGENTE'
                  ? `Urgente (${computedReajusteAlert.diasRestantes}d)`
                  : `Próximo (${computedReajusteAlert.diasRestantes}d)`}
              </span>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: '#f5f3ff',
                  color: '#6d28d9',
                  border: '1px solid #ddd6fe'
                }}
              >
                <TrendingUp size={12} /> Radar de Reajuste / Repactuação
              </span>
            </div>

            <h4
              style={{
                fontSize: '0.96rem',
                fontWeight: 700,
                color: '#0f172a',
                margin: '0 0 0.25rem 0',
                lineHeight: '1.4'
              }}
            >
              {computedReajusteAlert.titulo}
            </h4>

            <p style={{ fontSize: '0.84rem', color: '#334155', margin: '0 0 0.4rem 0', lineHeight: '1.4' }}>
              {computedReajusteAlert.descricao}
            </p>

            <div style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>Orientação: {computedReajusteAlert.recomendacao}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={scrollToTimelineSection}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '0.4rem 0.8rem',
                backgroundColor: '#0c326f',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <span>Ver Histórico</span>
              <ExternalLink size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Alertas Operacionais de Acompanhamento de Pagamentos */}
      {paymentAlerts && paymentAlerts.map(alert => {
        const isCritico = alert.nivel === 'CRITICO';
        const isAtencao = alert.nivel === 'ATENCAO';

        return (
          <div
            key={alert.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '1rem 1.25rem',
              borderRadius: '8px',
              backgroundColor: isCritico ? '#fff8f8' : isAtencao ? '#fffbeb' : '#f8faff',
              border: `1px solid ${isCritico ? '#fecaca' : isAtencao ? '#fde68a' : '#bfdbfe'}`,
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: isCritico ? '#fee2e2' : isAtencao ? '#ffedd5' : '#e0f2fe',
                    color: isCritico ? '#991b1b' : isAtencao ? '#c2410c' : '#0369a1',
                    border: `1px solid ${isCritico ? '#fecaca' : isAtencao ? '#fed7aa' : '#bae6fd'}`
                  }}
                >
                  {isCritico ? <AlertTriangle size={12} /> : <AlertCircle size={12} />}
                  {isCritico ? 'Crítico / Vencido' : isAtencao ? 'Atenção Operacional' : 'Acompanhamento'}
                </span>

                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    border: '1px solid #bfdbfe'
                  }}
                >
                  <ShieldCheck size={12} /> Acompanhamento de Pagamento
                </span>
              </div>

              <h4
                style={{
                  fontSize: '0.96rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  margin: '0 0 0.25rem 0',
                  lineHeight: '1.4'
                }}
              >
                {alert.mensagem}
              </h4>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={scrollToPaymentSection}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '0.4rem 0.8rem',
                  backgroundColor: '#0c326f',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <span>Acessar Ciclo</span>
                <ExternalLink size={13} />
              </button>
            </div>
          </div>
        );
      })}
      {attentionItems.map(({ task, macrotaskName, level, diasRestantes }) => {
        const modeInfo = getExecutionModeDisplay(task.executionMode);
        const isConfirmacao = task.executionMode === 'CONFIRMACAO';

        // Estilos e badges por nível de urgência
        let urgencyBadge = {
          label: 'Sem prazo fixado',
          bg: '#f1f5f9',
          color: '#475569',
          border: '#cbd5e1',
          icon: Clock
        };

        if (level === 'VENCIDA') {
          urgencyBadge = {
            label: `${Math.abs(diasRestantes || 0)}d atrasada`,
            bg: '#fee2e2',
            color: '#991b1b',
            border: '#fecaca',
            icon: AlertTriangle
          };
        } else if (level === 'HOJE') {
          urgencyBadge = {
            label: 'Vence hoje',
            bg: '#fef3c7',
            color: '#b45309',
            border: '#fde68a',
            icon: Clock
          };
        } else if (level === 'URGENTE') {
          urgencyBadge = {
            label: `${diasRestantes}d restantes`,
            bg: '#ffedd5',
            color: '#c2410c',
            border: '#fed7aa',
            icon: Clock
          };
        } else if (level === 'PROXIMA') {
          urgencyBadge = {
            label: `${diasRestantes}d restantes`,
            bg: '#f0f9ff',
            color: '#0369a1',
            border: '#bae6fd',
            icon: Clock
          };
        }

        const UrgencyIcon = urgencyBadge.icon;

        return (
          <div
            key={task.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '1rem 1.25rem',
              borderRadius: '8px',
              backgroundColor: level === 'VENCIDA' ? '#fff8f8' : level === 'HOJE' ? '#fffbeb' : '#ffffff',
              border: `1px solid ${level === 'VENCIDA' ? '#fecaca' : level === 'HOJE' ? '#fde68a' : '#e2e8f0'}`,
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
              flexWrap: 'wrap'
            }}
          >
            {/* Lado Esquerdo: Badges, Título, Macrotarefa e Prazo */}
            <div style={{ flex: 1, minWidth: '280px' }}>
              {/* Badges de Contexto: Nível de Atenção e Semântica de Execução */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: urgencyBadge.bg,
                    color: urgencyBadge.color,
                    border: `1px solid ${urgencyBadge.border}`
                  }}
                >
                  <UrgencyIcon size={12} />
                  {urgencyBadge.label}
                </span>

                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: modeInfo.bg,
                    color: modeInfo.color,
                    border: `1px solid ${modeInfo.border}`
                  }}
                >
                  {isConfirmacao ? <ShieldCheck size={12} /> : null}
                  {modeInfo.label}
                </span>

                <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                  {macrotaskName}
                </span>
              </div>

              {/* Nome da Tarefa */}
              <h4
                style={{
                  fontSize: '0.96rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  margin: '0 0 0.25rem 0',
                  lineHeight: '1.4'
                }}
              >
                {task.nome}
              </h4>

              {/* Metadados: Data Limite e Sistema de Destino */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.78rem', color: '#64748b' }}>
                {task.prazo && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={12} /> Prazo: <strong>{formatDateBR(task.prazo)}</strong>
                  </span>
                )}
                {task.sistemaDestino && (
                  <span>
                    Sistema: <strong>{task.sistemaDestino}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Lado Direito: Ações Rápidas Assistidas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* Botão de Conclusão Rápida para Tarefas Internas */}
              <button
                type="button"
                onClick={() => handleQuickComplete(task)}
                disabled={updateMutation.isPending}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '0.4rem 0.8rem',
                  backgroundColor: isConfirmacao ? '#0c326f' : '#f8fafc',
                  color: isConfirmacao ? '#ffffff' : '#0c326f',
                  border: `1px solid ${isConfirmacao ? '#0c326f' : '#cbd5e1'}`,
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: updateMutation.isPending ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Marcar tarefa como concluída"
              >
                <Check size={13} />
                <span>{isConfirmacao ? 'Confirmar Oficialmente' : 'Concluir'}</span>
              </button>

              {/* Link para o SEI se houver processo vinculado */}
              {contract.processo && (
                <a
                  href={`https://sei.mj.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=${encodeURIComponent(contract.processo)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '0.4rem 0.65rem',
                    backgroundColor: '#ffffff',
                    color: '#64748b',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    textDecoration: 'none'
                  }}
                  title="Abrir processo no SEI"
                >
                  <span>SEI</span>
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
