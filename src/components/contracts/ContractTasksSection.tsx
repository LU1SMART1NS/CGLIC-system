import React, { useState } from 'react';
import {
  Check,
  Circle,
  CircleDot,
  Minus,
  ChevronDown,
  ChevronUp,
  Sliders,
  ExternalLink,
  Save
} from 'lucide-react';
import type {
  ContractDashboardRecord,
  ContractTaskPlan,
  ContractTask,
  ContractTaskStatusValue
} from '../../types';
import { useContractTaskTemplates } from '../../hooks/useContractTaskTemplates';
import { useApplyContractTaskTemplate } from '../../hooks/useApplyContractTaskTemplate';
import { useUpdateContractTask } from '../../hooks/useUpdateContractTask';
import { getContractManagementKey } from '../../services/contractManagementService';
import { formatDateBR } from '../../services/temporalEngineService';
import { getExecutionModeDisplay } from './ContractAttentionCenter';
import { AppButton } from '../../design-system/components/AppButton';

interface ContractTasksSectionProps {
  contract: ContractDashboardRecord;
  plan: ContractTaskPlan | null;
  isLoading?: boolean;
}

const STATUS_OPTIONS: { value: ContractTaskStatusValue; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'PENDENTE', label: 'Pendente', icon: <Circle size={13} />, color: '#94a3b8' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento', icon: <CircleDot size={13} />, color: '#d97706' },
  { value: 'CONCLUIDA', label: 'Concluída', icon: <Check size={13} />, color: '#059669' },
  { value: 'NAO_APLICAVEL', label: 'Não aplicável', icon: <Minus size={13} />, color: '#94a3b8' }
];

const TaskItemRow: React.FC<{
  task: ContractTask;
  contractKey: string;
  defaultResponsavel?: string;
}> = ({ task, contractKey, defaultResponsavel }) => {
  const updateMutation = useUpdateContractTask(contractKey);
  const [expanded, setExpanded] = useState(false);
  const [responsavelNome, setResponsavelNome] = useState(task.responsavelNome || defaultResponsavel || '');
  const [prazo, setPrazo] = useState(task.prazo || '');
  const [observacao, setObservacao] = useState(task.observacao || '');

  const modeInfo = getExecutionModeDisplay(task.executionMode);

  const handleStatusChange = (status: ContractTaskStatusValue) => {
    if (status === task.status) return;
    updateMutation.mutate({ taskId: task.id, status });
  };

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      taskId: task.id,
      status: task.status,
      responsavelNome: responsavelNome || undefined,
      prazo: prazo || null,
      observacao: observacao || null
    });
    setExpanded(false);
  };

  return (
    <div style={{ borderBottom: '1px solid #f1f5f9', padding: '0.65rem 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {/* Seletor Rápido de Status */}
        <div style={{ display: 'flex', gap: '2px' }}>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              onClick={() => handleStatusChange(opt.value)}
              disabled={updateMutation.isPending}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                border: task.status === opt.value ? `1.5px solid ${opt.color}` : '1px solid #e2e8f0',
                background: task.status === opt.value ? `${opt.color}1a` : '#fff',
                color: task.status === opt.value ? opt.color : '#cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: updateMutation.isPending ? 'wait' : 'pointer',
                padding: 0
              }}
            >
              {opt.icon}
            </button>
          ))}
        </div>

        {/* Informações da Tarefa */}
        <div style={{ flex: 1, minWidth: '240px', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.88rem',
                fontWeight: 600,
                color: task.status === 'CONCLUIDA' ? '#94a3b8' : '#1e293b',
                textDecoration: task.status === 'CONCLUIDA' ? 'line-through' : 'none'
              }}
            >
              {task.nome}
            </span>

            {/* Badge Semântica de Execução */}
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '0.1rem 0.4rem',
                borderRadius: '4px',
                backgroundColor: modeInfo.bg,
                color: modeInfo.color,
                border: `1px solid ${modeInfo.border}`
              }}
            >
              {modeInfo.label}
              {task.sistemaDestino ? ` • ${task.sistemaDestino}` : ''}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
            {task.prazo && <span>Prazo: {formatDateBR(task.prazo)}</span>}
            {task.responsavelNome && <span>Resp: {task.responsavelNome}</span>}
          </div>
        </div>

        {/* Ações e Expansor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {task.externalLinkUrl && (
            <a
              href={task.externalLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '0.25rem 0.5rem',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#0c326f',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                textDecoration: 'none'
              }}
            >
              <span>{task.sistemaDestino || 'Sistema'}</span>
              <ExternalLink size={11} />
            </a>
          )}

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: '0.25rem 0.4rem',
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer'
            }}
            title={expanded ? 'Recolher detalhes' : 'Editar prazo e responsável'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Painel Expansível de Detalhes da Tarefa */}
      {expanded && (
        <form
          onSubmit={handleSaveDetails}
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem 1rem',
            background: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem'
          }}
        >
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
              Responsável
            </label>
            <input
              type="text"
              value={responsavelNome}
              onChange={(e) => setResponsavelNome(e.target.value)}
              placeholder="Nome do servidor"
              style={{
                width: '100%',
                padding: '0.35rem 0.5rem',
                fontSize: '0.8rem',
                borderRadius: '4px',
                border: '1px solid #cbd5e1'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
              Prazo limite (YYYY-MM-DD)
            </label>
            <input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              style={{
                width: '100%',
                padding: '0.35rem 0.5rem',
                fontSize: '0.8rem',
                borderRadius: '4px',
                border: '1px solid #cbd5e1'
              }}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
              Observação / Justificativa
            </label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Anotações de instrução ou despacho"
              style={{
                width: '100%',
                padding: '0.35rem 0.5rem',
                fontSize: '0.8rem',
                borderRadius: '4px',
                border: '1px solid #cbd5e1'
              }}
            />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <AppButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExpanded(false)}
            >
              Cancelar
            </AppButton>
            <AppButton
              type="submit"
              variant="primary"
              size="sm"
              icon={<Save size={13} />}
              disabled={updateMutation.isPending}
              isLoading={updateMutation.isPending}
            >
              Salvar Alterações
            </AppButton>
          </div>
        </form>
      )}
    </div>
  );
};

export const ContractTasksSection: React.FC<ContractTasksSectionProps> = ({
  contract,
  plan,
  isLoading = false
}) => {
  const contractKey = contract.id || getContractManagementKey(contract.uasg, contract.numero, contract.ano);
  const { data: templates = [], isLoading: loadingTemplates } = useContractTaskTemplates();
  const applyTemplateMutation = useApplyContractTaskTemplate();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const handleApplyTemplate = () => {
    if (!selectedTemplateId) return;
    const anoNum = typeof contract.ano === 'number' ? contract.ano : (parseInt(String(contract.ano), 10) || 2026);
    applyTemplateMutation.mutate({
      uasg: contract.uasg,
      numero: contract.numero,
      ano: anoNum,
      templateId: selectedTemplateId
    });
  };

  if (isLoading) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
        Carregando plano de tarefas...
      </div>
    );
  }

  // 1. Caso Nenhum Plano Tenha Sido Aplicado Ainda
  if (!plan) {
    return (
      <div
        style={{
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px dashed #cbd5e1',
          padding: '1.75rem',
          textAlign: 'center'
        }}
      >
        <Sliders size={28} style={{ color: '#0c326f', margin: '0 auto 0.75rem auto' }} />
        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.35rem 0' }}>
          Nenhum Modelo de Gestão aplicado a este contrato
        </h4>
        <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: '500px', margin: '0 auto 1.25rem auto' }}>
          Selecione um roteiro operacional pré-configurado (Lei nº 14.133/2021) para acompanhar as etapas de execução, prorrogação e encerramento.
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            disabled={loadingTemplates || applyTemplateMutation.isPending}
            style={{
              padding: '0.45rem 0.75rem',
              fontSize: '0.85rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              minWidth: '260px'
            }}
          >
            <option value="">Selecione um Modelo de Gestão...</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.nome}
              </option>
            ))}
          </select>

          <AppButton
            type="button"
            variant="primary"
            size="sm"
            onClick={handleApplyTemplate}
            disabled={!selectedTemplateId || applyTemplateMutation.isPending}
            isLoading={applyTemplateMutation.isPending}
          >
            Aplicar Modelo
          </AppButton>
        </div>
      </div>
    );
  }

  // 2. Plano Aplicado: Progresso e Lista de Macrotarefas
  const progresso = plan.progresso;

  return (
    <div>
      {/* Barra de Progresso do Plano */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          padding: '0.75rem 1rem',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
            Modelo: {plan.templateNome}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {progresso.concluidas} de {progresso.total - progresso.naoAplicaveis} tarefas concluídas ({progresso.percentual}%)
            {progresso.atrasadas > 0 && <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: '6px' }}>• {progresso.atrasadas} atrasada(s)</span>}
          </div>
        </div>

        {/* Mini Barra de Progresso */}
        <div style={{ width: '160px', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${progresso.percentual}%`,
              height: '100%',
              backgroundColor: progresso.percentual === 100 ? '#10b981' : '#0c326f',
              transition: 'width 0.3s ease'
            }}
          />
        </div>
      </div>

      {/* Lista de Macrotarefas e Tarefas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {plan.macrotarefas.map((macro) => (
          <div
            key={macro.id}
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              padding: '1rem'
            }}
          >
            <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0c326f', margin: '0 0 0.5rem 0', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
              {macro.nome}
            </h4>

            <div>
              {macro.tarefas.map((tarefa) => (
                <TaskItemRow
                  key={tarefa.id}
                  task={tarefa}
                  contractKey={contractKey}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
