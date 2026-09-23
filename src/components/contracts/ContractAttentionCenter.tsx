import React from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Clock,
  Calendar,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Check
} from 'lucide-react';
import type {
  ContractDashboardRecord,
  ContractTask,
  ContractTaskPlan,
  TaskExecutionMode
} from '../../types';
import { differenceInDays, parseDateBRT, formatDateBR } from '../../services/temporalEngineService';
import { useUpdateContractTask } from '../../hooks/useUpdateContractTask';
import { getContractManagementKey } from '../../services/contractManagementService';

interface ContractAttentionCenterProps {
  contract: ContractDashboardRecord;
  plan: ContractTaskPlan | null;
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
  isLoading = false
}) => {
  const contractKey = contract.id || getContractManagementKey(contract.uasg, contract.numero, contract.ano);
  const updateMutation = useUpdateContractTask(contractKey);

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

  if (isLoading) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
        Carregando pendências e tarefas do contrato...
      </div>
    );
  }

  // Estado Positivo: Sem pendências que exijam atenção
  if (attentionItems.length === 0) {
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
          {plan ? 'Todas as tarefas do plano de gestão foram concluídas ou marcadas como não aplicáveis.' : 'Nenhum plano de tarefas ativo possui pendências críticas neste momento.'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
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
            bg: '#ffedd5',
            color: '#c2410c',
            border: '#fed7aa',
            icon: AlertCircle
          };
        } else if (level === 'URGENTE') {
          urgencyBadge = {
            label: `Vence em ${diasRestantes} dias`,
            bg: '#fef3c7',
            color: '#b45309',
            border: '#fde68a',
            icon: Clock
          };
        } else if (level === 'PROXIMA') {
          urgencyBadge = {
            label: `Prazo: ${diasRestantes} dias`,
            bg: '#e0f2fe',
            color: '#0369a1',
            border: '#bae6fd',
            icon: Calendar
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
              backgroundColor: isConfirmacao ? '#f8faff' : level === 'VENCIDA' ? '#fff8f8' : '#ffffff',
              border: `1px solid ${level === 'VENCIDA' ? '#fecaca' : isConfirmacao ? '#bfdbfe' : '#e2e8f0'}`,
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
              flexWrap: 'wrap'
            }}
          >
            {/* Lado Esquerdo: Identificação e Contexto */}
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                {/* Badge de Urgência Temporal */}
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
                  <UrgencyIcon size={12} /> {urgencyBadge.label}
                </span>

                {/* Badge de Modo de Execução */}
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
                  {isConfirmacao && <ShieldCheck size={12} />}
                  {modeInfo.label}
                  {task.sistemaDestino && ` (${task.sistemaDestino})`}
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

              {/* Contexto: Macrotarefa / Observação */}
              <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', gap: '0.85rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                <span>
                  <strong>Fase:</strong> {macrotaskName}
                </span>
                {task.prazo && (
                  <span>
                    <strong>Vencimento:</strong> {formatDateBR(task.prazo)}
                  </span>
                )}
                {task.responsavelNome && (
                  <span>
                    <strong>Responsável:</strong> {task.responsavelNome}
                  </span>
                )}
              </div>

              {task.observacao && (
                <p style={{ fontSize: '0.8rem', color: '#475569', margin: '0.4rem 0 0 0', fontStyle: 'italic', background: '#f8fafc', padding: '0.35rem 0.6rem', borderRadius: '4px' }}>
                  "{task.observacao}"
                </p>
              )}
            </div>

            {/* Lado Direito: Ações Contextuais */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {/* Link para Sistema Externo */}
              {task.externalLinkUrl && (
                <a
                  href={task.externalLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '0.35rem 0.75rem',
                    backgroundColor: '#ffffff',
                    color: '#0c326f',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textDecoration: 'none'
                  }}
                >
                  <span>{task.sistemaDestino ? `Abrir no ${task.sistemaDestino}` : 'Abrir Sistema'}</span>
                  <ExternalLink size={13} />
                </a>
              )}

              {/* Atalho PNCP para tarefas de confirmação oficial */}
              {isConfirmacao && contract.linkPncp && !task.externalLinkUrl && (
                <a
                  href={contract.linkPncp}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '0.35rem 0.75rem',
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    border: '1px solid #bfdbfe',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textDecoration: 'none'
                  }}
                >
                  <span>Verificar no PNCP</span>
                  <ExternalLink size={13} />
                </a>
              )}

              {/* Botão de Conclusão Rápida */}
              <button
                type="button"
                onClick={() => handleQuickComplete(task)}
                disabled={updateMutation.isPending}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '0.35rem 0.75rem',
                  backgroundColor: '#f0fdf4',
                  color: '#15803d',
                  border: '1px solid #bbf7d0',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: updateMutation.isPending ? 'wait' : 'pointer'
                }}
                title="Marcar providência como concluída"
              >
                <Check size={14} />
                <span>Concluir</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
