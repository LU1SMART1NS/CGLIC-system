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
  Save,
  Plus,
  X,
  ChevronsUpDown,
  ChevronsDownUp
} from 'lucide-react';
import type {
  AtaTask,
  AtaTaskPlan,
  ContractTask,
  ContractTaskPlan,
  ContractTaskStatusValue
} from '../../types';
import { groupMacrotasksByModule } from '../../utils/taskPlanModules';
import { sugerirNomeModulo } from '../../utils/planModuleNaming';
import { numeroEtapa, numeroTarefa, stripNumeracaoManual } from '../../utils/planNumbering';
import { ResponsavelField, type ResponsavelValue } from '../contracts/ResponsavelField';
import {
  AddTaskForm,
  AddMacrotaskForm,
  MacrotaskHeader,
  ModuleGroupHeader,
  ConfirmDeleteButton,
  MutationError,
  PERSONALIZADA_BADGE_STYLE,
  describeResponsavel,
  planFormStyles
} from '../contracts/planTaskEditing';
import { formatDateBR } from '../../services/temporalEngineService';
import { classifyTaskAttention } from '../contracts/taskAttentionDisplay';
import { severityFromAttentionPriorityLevel } from '../../services/severityService';
import { SeverityBadge } from '../../design-system/components/SeverityBadge';
import { AppButton, DataTable, EmptyState, Modal, NoticeBar, SummaryBar, useConfirmDialog } from '../../design-system';

/**
 * Plano de gestão: mesma tela para Contrato e Ata. O componente só desenha; quem usa informa por
 * `controller` as chaves, os textos e as ações (hooks de cada tipo de instrumento).
 */

export type PlanTask = ContractTask | AtaTask;
export type TaskPlan = ContractTaskPlan | AtaTaskPlan;

/** Mutação já ligada a um hook do React Query, no mínimo que a tela precisa. */
export interface PlanMutation<V> {
  mutate: (variables: V) => void;
  isPending: boolean;
  error: unknown;
}

/** Ação do controlador: `run` dispara, o resto é o estado da mutação por trás. */
export interface PlanAction<A extends unknown[]> {
  run: (...args: A) => void;
  isPending: boolean;
  error: unknown;
}

export interface TaskUpdateVars {
  taskId: string;
  status: ContractTaskStatusValue;
  nome?: string;
  responsavelNome?: string;
  responsavelUserId?: string;
  prazo?: string | null;
  observacao?: string | null;
}

export interface TaskPlanLabels {
  /** Título do estado sem plano (ex.: "Nenhum Modelo de Gestão aplicado a este contrato"). */
  semPlanoTitulo: string;
  semPlanoDescricao: string;
  /** Ex.: "gestor do contrato", "gestor da Ata". */
  gestorLabel: string;
  herancaMsg: string;
  semGestorMsg: string;
}

export interface TaskPlanController {
  /** Chave do instrumento nos hooks de tarefa (contractKey ou ataKey). */
  entityKey: string;
  gestorNome?: string;
  labels: TaskPlanLabels;
  useUpdateTask: (key: string) => PlanMutation<TaskUpdateVars>;
  useDeleteTask: (key: string) => PlanMutation<string>;
  templates: Array<{ id: string; nome: string }>;
  loadingTemplates: boolean;
  applyTemplate: PlanAction<[templateId: string, onSuccess: () => void, moduloNome?: string]>;
  startPlan: PlanAction<[]>;
  saveMacrotask: PlanAction<[vars: { id?: string; planId?: string; nome: string }]>;
  deleteMacrotask: PlanAction<[id: string]>;
  deleteModule: PlanAction<[vars: { planId: string; moduloId: string }]>;
  renameModule: PlanAction<[vars: { planId: string; moduloId: string; nome: string }]>;
  createTask: PlanAction<[vars: { macrotaskId: string; nome: string; prazo: string | null; observacao: string | null }]>;
}

const STATUS_OPTIONS: { value: ContractTaskStatusValue; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'PENDENTE', label: 'Pendente', icon: <Circle size={13} />, color: '#94a3b8' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento', icon: <CircleDot size={13} />, color: '#d97706' },
  { value: 'CONCLUIDA', label: 'Concluída', icon: <Check size={13} />, color: '#059669' },
  { value: 'NAO_APLICAVEL', label: 'Não aplicável', icon: <Minus size={13} />, color: '#94a3b8' }
];

const externalLinkOf = (task: PlanTask): string | undefined => (task as ContractTask).externalLinkUrl;

/** Linha de uma tarefa do plano, igual em Contrato e Ata. */
export type TaskPlanRowController = Pick<TaskPlanController, 'entityKey' | 'gestorNome' | 'labels' | 'useUpdateTask' | 'useDeleteTask'>;

export const TaskPlanRow: React.FC<{ task: PlanTask; controller: TaskPlanRowController; numero?: string }> = ({ task, controller, numero }) => {
  const { entityKey, gestorNome, labels, useUpdateTask, useDeleteTask } = controller;
  const updateMutation = useUpdateTask(entityKey);
  const deleteMutation = useDeleteTask(entityKey);
  const [expanded, setExpanded] = useState(false);
  const nomeTarefa = stripNumeracaoManual(task.nome);
  const [nome, setNome] = useState(nomeTarefa);
  const [responsavel, setResponsavel] = useState<ResponsavelValue>({
    nome: task.responsavelNome || '',
    userId: task.responsavelUserId
  });
  const [prazo, setPrazo] = useState(task.prazo || '');
  const [observacao, setObservacao] = useState(task.observacao || '');
  // Só as tarefas de contrato trazem o sistema de destino (ex.: SEI, SICAF).
  const externalLinkUrl = externalLinkOf(task);
  const sistemaDestino = (task as ContractTask).sistemaDestino;

  const isOpen = task.status !== 'CONCLUIDA' && task.status !== 'NAO_APLICAVEL';
  const attention = isOpen ? classifyTaskAttention(task as ContractTask) : null;
  const urgencyLabel =
    attention?.level === 'VENCIDA'
      ? `${Math.abs(attention.diasRestantes ?? 0)} ${Math.abs(attention.diasRestantes ?? 0) === 1 ? 'dia útil' : 'dias úteis'} de atraso`
      : attention?.level === 'HOJE'
      ? 'Vence hoje'
      : attention?.level === 'URGENTE' || attention?.level === 'PROXIMA'
      ? `${attention.diasRestantes} ${attention.diasRestantes === 1 ? 'dia útil' : 'dias úteis'}`
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
      nome: stripNumeracaoManual(nome).trim() || nomeTarefa,
      // Vazio limpa o responsável próprio e a tarefa volta a herdar o gestor.
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
        <div className="plan-status-group" style={{ display: 'flex', gap: '2px' }}>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={task.status === opt.value}
              className="plan-status-btn"
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
        <div style={{ flex: '1 1 240px', minWidth: 0, cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.88rem',
                fontWeight: 600,
                color: task.status === 'CONCLUIDA' ? '#94a3b8' : '#1e293b',
                textDecoration: task.status === 'CONCLUIDA' ? 'line-through' : 'none'
              }}
            >
              {numero ? `${numero}. ${nomeTarefa}` : nomeTarefa}
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
          {externalLinkUrl && (
            <a
              href={externalLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--primary)',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                textDecoration: 'none'
              }}
            >
              <span>{sistemaDestino || 'Sistema'}</span>
              <ExternalLink size={11} />
            </a>
          )}

          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            iconOnly
            icon={expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Recolher detalhes' : 'Editar prazo e responsável'}
          />

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
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
            gap: '0.75rem'
          }}
        >
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
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
            <label htmlFor={`responsavel-${task.id}`} style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
              Responsável
            </label>
            <ResponsavelField
              id={`responsavel-${task.id}`}
              value={responsavel}
              onChange={setResponsavel}
              gestorNome={gestorNome}
              gestorLabel={labels.gestorLabel}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
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

          <div style={{ gridColumn: '1 / -1', fontSize: '0.75rem', color: gestorNome ? '#64748b' : 'var(--color-warning-text)', marginTop: '-0.4rem' }}>
            {gestorNome ? labels.herancaMsg : labels.semGestorMsg}
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
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

export const TaskPlanSection: React.FC<{
  plan: TaskPlan | null;
  isLoading?: boolean;
  controller: TaskPlanController;
}> = ({ plan, isLoading = false, controller: c }) => {
  const { labels } = c;
  const confirm = useConfirmDialog();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [showApplyModel, setShowApplyModel] = useState(false);
  const [nomeNovoModulo, setNomeNovoModulo] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const finishApply = () => {
    setSelectedTemplateId('');
    setShowApplyModel(false);
    setNomeNovoModulo(null);
  };

  /** Módulos já aplicados a partir do modelo escolhido (para sugerir o nome do próximo). */
  const modulosDoModelo = (templateId: string) =>
    plan
      ? groupMacrotasksByModule(plan.macrotarefas as Parameters<typeof groupMacrotasksByModule>[0], plan)
          .filter((g) => g.modulo?.templateId === templateId)
          .map((g) => g.modulo!.nome)
      : [];

  const handleApplyTemplate = () => {
    if (!selectedTemplateId) return;
    const existentes = modulosDoModelo(selectedTemplateId);
    if (existentes.length > 0) {
      // Mesmo modelo outra vez: o usuário confirma (ou troca) o nome do novo módulo.
      const nomeModelo = c.templates.find((t) => t.id === selectedTemplateId)?.nome ?? '';
      setNomeNovoModulo(sugerirNomeModulo(nomeModelo, existentes));
      return;
    }
    c.applyTemplate.run(selectedTemplateId, finishApply);
  };

  const confirmarNovoModulo = () => {
    if (!selectedTemplateId || !nomeNovoModulo?.trim()) return;
    c.applyTemplate.run(selectedTemplateId, finishApply, nomeNovoModulo.trim());
  };

  if (isLoading) {
    return <DataTable columns={[]} data={[]} keyExtractor={() => ''} isLoading testId="task-plan-loading" />;
  }

  // 1. Caso Nenhum Plano Tenha Sido Aplicado Ainda
  if (!plan) {
    return (
      <EmptyState
        icon={<Sliders size={28} />}
        title={labels.semPlanoTitulo}
        description={labels.semPlanoDescricao}
        testId="task-plan-empty"
        action={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                aria-label="Modelo de gestão"
                className="form-input"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                disabled={c.loadingTemplates || c.applyTemplate.isPending}
                style={{ minWidth: 0, width: '100%', maxWidth: '360px' }}
              >
                <option value="">Selecione um Modelo de Gestão...</option>
                {c.templates.map((tpl) => (
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
                disabled={!selectedTemplateId || c.applyTemplate.isPending}
                isLoading={c.applyTemplate.isPending}
              >
                Aplicar Modelo
              </AppButton>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              ou{' '}
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={c.startPlan.run}
                disabled={c.startPlan.isPending}
                isLoading={c.startPlan.isPending}
              >
                Começar do zero
              </AppButton>
              {' '}e criar as tarefas manualmente.
            </div>
            <MutationError error={c.applyTemplate.error || c.startPlan.error} />
          </div>
        }
      />
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
      <Modal
        isOpen={nomeNovoModulo !== null}
        onClose={() => setNomeNovoModulo(null)}
        title="Aplicar modelo novamente"
        subtitle="Este modelo já foi aplicado a este plano. Acrescentar vai criar um novo módulo com as mesmas etapas e tarefas."
        size="sm"
        dismissible={!c.applyTemplate.isPending}
        testId="apply-again-modal"
        footer={
          <>
            <AppButton type="button" variant="outline" onClick={() => setNomeNovoModulo(null)} disabled={c.applyTemplate.isPending}>
              Cancelar
            </AppButton>
            <AppButton
              type="button"
              variant="primary"
              onClick={confirmarNovoModulo}
              disabled={!nomeNovoModulo?.trim() || c.applyTemplate.isPending}
              isLoading={c.applyTemplate.isPending}
            >
              Aplicar
            </AppButton>
          </>
        }
      >
        <label style={planFormStyles.labelStyle} htmlFor="nome-novo-modulo">Nome do novo módulo</label>
        <input
          id="nome-novo-modulo"
          className="form-input"
          value={nomeNovoModulo ?? ''}
          onChange={(e) => setNomeNovoModulo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confirmarNovoModulo();
            }
          }}
          maxLength={200}
          style={{ width: '100%' }}
        />
      </Modal>

      {/* Resumo do plano: progresso à esquerda, ações à direita */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.4rem' }}>{planTitle}</div>
          <SummaryBar
            testId="task-plan-summary"
            items={[
              { label: 'Concluídas', value: `${progresso.concluidas} de ${progresso.total - progresso.naoAplicaveis}`, unit: `tarefas (${progresso.percentual}%)` },
              ...(progresso.atrasadas > 0 ? [{ label: 'Atrasadas', value: String(progresso.atrasadas), unit: '', tone: 'danger' as const }] : [])
            ]}
            progress={{ value: progresso.concluidas, max: Math.max(progresso.total - progresso.naoAplicaveis, 1), label: 'Progresso do plano' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
          {moduleGroups.length > 1 && (
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              iconOnly
              icon={allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
              onClick={() => setCollapsedGroups(allCollapsed ? new Set() : new Set(moduleGroups.map((g) => g.key)))}
              title={allCollapsed ? 'Expandir todos' : 'Recolher todos'}
            />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
          <NoticeBar tone="info" testId="task-plan-apply-note">
            As etapas e tarefas do modelo são acrescentadas ao plano atual; nada do que já existe é alterado.
          </NoticeBar>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              aria-label="Modelo de gestão a acrescentar"
              className="form-input"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              disabled={c.loadingTemplates || c.applyTemplate.isPending}
              style={{ minWidth: 0, width: '100%', maxWidth: '360px' }}
            >
              <option value="">Selecione um Modelo de Gestão...</option>
              {c.templates.map((tpl) => (
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
              disabled={!selectedTemplateId || c.applyTemplate.isPending}
              isLoading={c.applyTemplate.isPending}
            >
              Acrescentar ao plano
            </AppButton>
          </div>
        </div>
      )}

      <MutationError
        error={
          c.applyTemplate.error ||
          c.saveMacrotask.error ||
          c.deleteMacrotask.error ||
          c.deleteModule.error ||
          c.renameModule.error ||
          c.createTask.error
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
              isPending={c.deleteModule.isPending || c.renameModule.isPending}
              onRename={
                group.modulo
                  ? (nome) => c.renameModule.run({ planId: plan.id, moduloId: group.modulo!.id, nome })
                  : undefined
              }
              onDelete={
                group.modulo
                  ? async () => {
                      const ok = await confirm({
                        title: 'Excluir módulo',
                        message: `Excluir o módulo "${group.modulo!.nome}" e todas as suas etapas e tarefas?`,
                        confirmLabel: 'Excluir',
                        tone: 'danger'
                      });
                      if (ok) c.deleteModule.run({ planId: plan.id, moduloId: group.modulo!.id });
                    }
                  : undefined
              }
            />
        {!collapsed && group.macrotarefas.map((macro, macroIndex) => (
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
              numero={numeroEtapa(macroIndex)}
              taskCount={macro.tarefas.length}
              isPending={c.saveMacrotask.isPending || c.deleteMacrotask.isPending}
              onRename={(nome) => c.saveMacrotask.run({ id: macro.id, nome: stripNumeracaoManual(nome) })}
              onDelete={() => c.deleteMacrotask.run(macro.id)}
            />

            <div>
              {macro.tarefas.map((tarefa, tarefaIndex) => (
                <TaskPlanRow key={tarefa.id} task={tarefa} controller={c} numero={numeroTarefa(macroIndex, tarefaIndex)} />
              ))}
              <AddTaskForm
                gestorNome={c.gestorNome}
                isPending={c.createTask.isPending}
                onSubmit={(values) =>
                  c.createTask.run({
                    macrotaskId: macro.id,
                    nome: stripNumeracaoManual(values.nome),
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
          isPending={c.saveMacrotask.isPending}
          onSubmit={(nome) => c.saveMacrotask.run({ planId: plan.id, nome: stripNumeracaoManual(nome) })}
        />
      </div>
    </div>
  );
};
