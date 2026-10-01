import { groupMacrotasksByModule } from '../../utils/taskPlanModules';
import React, { useState } from 'react';
import { ResponsavelField, type ResponsavelValue } from './ResponsavelField';
import {
  Check,
  Circle,
  CircleDot,
  Minus,
  ChevronDown,
  ChevronUp,
  Sliders,
  ExternalLink,
  Save,
  Plus,
  X,
  ChevronsUpDown,
  ChevronsDownUp
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
import { useContractManager } from '../../hooks/useContractManager';
import {
  useStartContractTaskPlan,
  useSaveContractTaskMacrotask,
  useDeleteContractTaskMacrotask,
  useDeleteContractTaskModule,
  useCreateContractTask,
  useDeleteContractTask
} from '../../hooks/useContractTaskPlanEditing';
import {
  AddTaskForm,
  AddMacrotaskForm,
  MacrotaskHeader,
  ModuleGroupHeader,
  ConfirmDeleteButton,
  MutationError,
  PERSONALIZADA_BADGE_STYLE,
  describeResponsavel
} from './planTaskEditing';
import { getContractManagementKey } from '../../services/contractManagementService';
import { formatDateBR } from '../../services/temporalEngineService';
import { classifyTaskAttention } from './taskAttentionDisplay';
import { severityFromAttentionPriorityLevel } from '../../services/severityService';
import { SeverityBadge } from '../../design-system/components/SeverityBadge';
import { AppButton } from '../../design-system/components/AppButton';
import { useConfirmDialog } from '../../design-system';

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

export const TaskItemRow: React.FC<{
  task: ContractTask;
  contractKey: string;
  /** Gestor do contrato: responsável herdado quando a tarefa não tem responsável próprio. */
  gestorNome?: string;
}> = ({ task, contractKey, gestorNome }) => {
  const updateMutation = useUpdateContractTask(contractKey);
  const deleteMutation = useDeleteContractTask(contractKey);
  const [expanded, setExpanded] = useState(false);
  const [nome, setNome] = useState(task.nome);
  const [responsavel, setResponsavel] = useState<ResponsavelValue>({
    nome: task.responsavelNome || '',
    userId: task.responsavelUserId
  });
  const [prazo, setPrazo] = useState(task.prazo || '');
  const [observacao, setObservacao] = useState(task.observacao || '');

  const isOpen = task.status !== 'CONCLUIDA' && task.status !== 'NAO_APLICAVEL';
  const attention = isOpen ? classifyTaskAttention(task) : null;
  const urgencyLabel =
    attention?.level === 'VENCIDA'
      ? `${Math.abs(attention.diasRestantes ?? 0)}d atrasada`
      : attention?.level === 'HOJE'
      ? 'Vence hoje'
      : attention?.level === 'URGENTE' || attention?.level === 'PROXIMA'
      ? `${attention.diasRestantes} dias`
      : null;

  const handleStatusChange = (status: ContractTaskStatusValue) => {
    if (status === task.status) return;
    updateMutation.mutate({ taskId: task.id, status });
  };

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      taskId: task.id,
      status: task.status,
      nome: nome.trim() || task.nome,
      // Vazio limpa o responsável próprio e a tarefa volta a herdar o gestor do contrato.
      responsavelNome: responsavel.nome.trim(),
      responsavelUserId: responsavel.nome.trim() ? responsavel.userId : undefined,
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


            {task.origem === 'PERSONALIZADA' && <span style={PERSONALIZADA_BADGE_STYLE}>Personalizada</span>}

            {attention && urgencyLabel && (
              <SeverityBadge severity={severityFromAttentionPriorityLevel(attention.level)} customLabel={urgencyLabel} />
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
            {task.prazo ? <span>Prazo: {formatDateBR(task.prazo)}</span> : isOpen && <span>Sem prazo definido</span>}
            {describeResponsavel(task.responsavelNome, gestorNome) && (
              <span>Resp: {describeResponsavel(task.responsavelNome, gestorNome)}</span>
            )}
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

          <ConfirmDeleteButton
            label="Excluir tarefa"
            confirmMessage={task.status === 'CONCLUIDA' ? 'Excluir tarefa já concluída?' : 'Excluir tarefa?'}
            disabled={deleteMutation.isPending}
            onConfirm={() => deleteMutation.mutate(task.id)}
          />
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
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
              Nome da tarefa
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
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
            <label htmlFor={`responsavel-${task.id}`} style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
              Responsável
            </label>
            <ResponsavelField
              id={`responsavel-${task.id}`}
              value={responsavel}
              onChange={setResponsavel}
              gestorNome={gestorNome}
              gestorLabel="gestor do contrato"
            />
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
              Prazo limite
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

          <div style={{ gridColumn: '1 / -1', fontSize: '0.72rem', color: gestorNome ? '#64748b' : '#b45309', marginTop: '-0.4rem' }}>
            {gestorNome
              ? 'Com o gestor do contrato selecionado, a tarefa acompanha automaticamente uma troca de Gestor Titular.'
              : 'Este contrato ainda não tem Gestor Titular. Defina-o no topo da página (a tarefa passa a segui-lo) ou informe um responsável aqui.'}
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
      <MutationError error={deleteMutation.error} />
    </div>
  );
};

export const ContractTasksSection: React.FC<ContractTasksSectionProps> = ({
  contract,
  plan,
  isLoading = false
}) => {
  const confirm = useConfirmDialog();
  const contractKey = contract.id || getContractManagementKey(contract.uasg, contract.numero, contract.ano);
  const { data: templates = [], isLoading: loadingTemplates } = useContractTaskTemplates();
  const applyTemplateMutation = useApplyContractTaskTemplate();
  const startPlanMutation = useStartContractTaskPlan(contractKey);
  const saveMacrotaskMutation = useSaveContractTaskMacrotask(contractKey);
  const deleteMacrotaskMutation = useDeleteContractTaskMacrotask(contractKey);
  const deleteModuleMutation = useDeleteContractTaskModule(contractKey);
  const createTaskMutation = useCreateContractTask(contractKey);
  const { data: manager } = useContractManager(contractKey);
  const gestorNome = manager?.gestorNome || undefined;
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [showApplyModel, setShowApplyModel] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const anoNum = typeof contract.ano === 'number' ? contract.ano : (parseInt(String(contract.ano), 10) || 2026);

  const handleApplyTemplate = async () => {
    if (!selectedTemplateId) return;
    const alreadyApplied = plan
      ? groupMacrotasksByModule(plan.macrotarefas, plan).some((g) => g.modulo?.templateId === selectedTemplateId)
      : false;
    if (alreadyApplied) {
      const ok = await confirm({
        title: 'Aplicar modelo novamente',
        message: 'Este modelo já foi aplicado a este plano. Acrescentar novamente vai duplicar as etapas e tarefas em um novo módulo. Deseja continuar?',
        confirmLabel: 'Aplicar mesmo assim'
      });
      if (!ok) return;
    }
    applyTemplateMutation.mutate(
      { uasg: contract.uasg, numero: contract.numero, ano: anoNum, templateId: selectedTemplateId },
      {
        onSuccess: () => {
          setSelectedTemplateId('');
          setShowApplyModel(false);
        }
      }
    );
  };

  const handleStartBlankPlan = () => {
    startPlanMutation.mutate({ uasg: contract.uasg, numero: contract.numero, ano: anoNum });
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

        <div style={{ marginTop: '0.9rem', fontSize: '0.8rem', color: '#64748b' }}>
          ou{' '}
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleStartBlankPlan}
            disabled={startPlanMutation.isPending}
            isLoading={startPlanMutation.isPending}
          >
            Começar do zero
          </AppButton>
          {' '}e criar as tarefas manualmente.
        </div>
        <MutationError error={applyTemplateMutation.error || startPlanMutation.error} />
      </div>
    );
  }

  // 2. Plano Aplicado: Progresso e Lista de Macrotarefas
  const progresso = plan.progresso;
  const moduleGroups = groupMacrotasksByModule(plan.macrotarefas, plan);
  const modelCount = moduleGroups.filter((g) => g.modulo).length;
  const hasCustomGroup = moduleGroups.some((g) => !g.modulo);
  const planTitle =
    modelCount === 0
      ? 'Plano personalizado'
      : `${modelCount} modelo${modelCount !== 1 ? 's' : ''} aplicado${modelCount !== 1 ? 's' : ''}${hasCustomGroup ? ' + etapas personalizadas' : ''}`;
  const allCollapsed = moduleGroups.length > 0 && moduleGroups.every((g) => collapsedGroups.has(g.key));
  const countOverdue = (group: (typeof moduleGroups)[number]) =>
    group.macrotarefas.reduce(
      (n, macro) =>
        n +
        macro.tarefas.filter(
          (t) => t.status !== 'CONCLUIDA' && t.status !== 'NAO_APLICAVEL' && classifyTaskAttention(t).level === 'VENCIDA'
        ).length,
      0
    );

  return (
    <div>
      {/* Resumo do plano: progresso à esquerda, ações à direita */}
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
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{planTitle}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
            <div
              role="progressbar"
              aria-valuenow={progresso.percentual}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso do plano"
              style={{ width: '160px', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}
            >
              <div
                style={{
                  width: `${progresso.percentual}%`,
                  height: '100%',
                  backgroundColor: progresso.percentual === 100 ? '#10b981' : '#0c326f',
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {progresso.concluidas} de {progresso.total - progresso.naoAplicaveis} tarefas concluídas ({progresso.percentual}%)
              {progresso.atrasadas > 0 && <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: '6px' }}>• {progresso.atrasadas} atrasada(s)</span>}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
          {moduleGroups.length > 1 && (
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              icon={allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
              onClick={() => setCollapsedGroups(allCollapsed ? new Set() : new Set(moduleGroups.map((g) => g.key)))}
            >
              {allCollapsed ? 'Expandir todos' : 'Recolher todos'}
            </AppButton>
          )}
          <AppButton
            type="button"
            variant={showApplyModel ? 'outline' : 'primary'}
            size="sm"
            icon={showApplyModel ? <X size={14} /> : <Plus size={14} />}
            onClick={() => setShowApplyModel((v) => !v)}
          >
            {showApplyModel ? 'Fechar' : 'Aplicar modelo'}
          </AppButton>
        </div>
      </div>

      {showApplyModel && (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            background: '#f8fafc',
            border: '1px dashed #cbd5e1',
            borderRadius: '8px'
          }}
        >
          <span style={{ fontSize: '0.78rem', color: '#64748b', flexBasis: '100%' }}>
            As etapas e tarefas do modelo são acrescentadas ao plano atual; nada do que já existe é alterado.
          </span>
          <select
            aria-label="Modelo de gestão a acrescentar"
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            disabled={loadingTemplates || applyTemplateMutation.isPending}
            style={{ padding: '0.4rem 0.6rem', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid #cbd5e1', minWidth: '240px' }}
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
            Acrescentar ao plano
          </AppButton>
        </div>
      )}

      <MutationError
        error={
          applyTemplateMutation.error ||
          saveMacrotaskMutation.error ||
          deleteMacrotaskMutation.error ||
          deleteModuleMutation.error ||
          createTaskMutation.error
        }
      />

      {/* Lista de Macrotarefas e Tarefas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {moduleGroups.map((group) => {
          const collapsed = collapsedGroups.has(group.key);
          return (
          <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <ModuleGroupHeader
              nome={group.modulo ? group.modulo.nome : 'Etapas personalizadas'}
              appliedAt={group.modulo?.appliedAt}
              concluidas={group.concluidas}
              aplicaveis={group.aplicaveis}
              etapas={group.macrotarefas.length}
              atrasadas={countOverdue(group)}
              collapsed={collapsed}
              onToggleCollapsed={() => toggleGroup(group.key)}
              isPending={deleteModuleMutation.isPending}
              onDelete={
                group.modulo
                  ? async () => {
                      const ok = await confirm({
                        title: 'Excluir módulo',
                        message: `Excluir o módulo "${group.modulo!.nome}" e todas as suas etapas e tarefas?`,
                        confirmLabel: 'Excluir',
                        tone: 'danger'
                      });
                      if (ok) deleteModuleMutation.mutate({ planId: plan.id, moduloId: group.modulo!.id });
                    }
                  : undefined
              }
            />
        {!collapsed && group.macrotarefas.map((macro) => (
          <div
            key={macro.id}
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              padding: '1rem'
            }}
          >
            <MacrotaskHeader
              nome={macro.nome}
              taskCount={macro.tarefas.length}
              isPending={saveMacrotaskMutation.isPending || deleteMacrotaskMutation.isPending}
              onRename={(nome) => saveMacrotaskMutation.mutate({ id: macro.id, nome })}
              onDelete={() => deleteMacrotaskMutation.mutate(macro.id)}
            />

            <div>
              {macro.tarefas.map((tarefa) => (
                <TaskItemRow
                  key={tarefa.id}
                  task={tarefa}
                  contractKey={contractKey}
                  gestorNome={gestorNome}
                />
              ))}
              <AddTaskForm
                gestorNome={gestorNome}
                isPending={createTaskMutation.isPending}
                onSubmit={(values) =>
                  createTaskMutation.mutate({
                    macrotaskId: macro.id,
                    nome: values.nome,
                    prazo: values.prazo || null,
                    observacao: values.observacao || null
                  })
                }
              />
            </div>
          </div>
        ))}
          </div>
          );
        })}

        <AddMacrotaskForm
          isPending={saveMacrotaskMutation.isPending}
          onSubmit={(nome) => saveMacrotaskMutation.mutate({ planId: plan.id, nome })}
        />
      </div>
    </div>
  );
};
