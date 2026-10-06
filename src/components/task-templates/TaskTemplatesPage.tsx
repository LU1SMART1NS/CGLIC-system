import React, { useState } from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  AlertCircle,
  Layers,
  CheckSquare,
  Sliders
} from 'lucide-react';
import { AppCard } from '../../design-system/components/AppCard';
import { AppButton } from '../../design-system/components/AppButton';
import { PageHeader } from '../../design-system/components/PageHeader';
import { Modal } from '../../design-system/components/Modal';
import { IconButton } from '../../design-system/components/IconButton';
import { AppInput, AppTextarea } from '../../design-system/components/FormFields';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { EmptyState } from '../../design-system/components/EmptyState';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { useConfirm } from '../../design-system/components/ConfirmDialog';
import { useToast } from '../../design-system/components/Toast';
import { TaskTemplatesKitContext, useTaskTemplatesKit, type TaskTemplatesKit, type TaskTemplate, type TaskTemplateMacrotask } from './taskTemplatesKit';

const MacrotaskEditor: React.FC<{ templateId: string; macro: TaskTemplateMacrotask }> = ({ templateId, macro }) => {
  const [open, setOpen] = useState(true);
  const [newTaskNome, setNewTaskNome] = useState('');
  const [editingMacroNome, setEditingMacroNome] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskNome, setEditingTaskNome] = useState('');

  const { hooks } = useTaskTemplatesKit();
  const saveMacrotask = hooks.useSaveMacrotask();
  const deleteMacrotask = hooks.useDeleteMacrotask();
  const saveTask = hooks.useSaveTask();
  const deleteTask = hooks.useDeleteTask();
  const { confirm, dialog } = useConfirm();
  const toast = useToast();

  const handleAddTask = () => {
    if (!newTaskNome.trim()) return;
    saveTask.mutate(
      { macrotaskId: macro.id, nome: newTaskNome.trim(), ordem: macro.tarefas.length },
      { onSuccess: () => setNewTaskNome('') }
    );
  };

  const handleRenameTask = (task: (typeof macro.tarefas)[number]) => {
    const nome = editingTaskNome.trim();
    if (!nome) return;
    if (nome === task.nome) {
      setEditingTaskId(null);
      return;
    }
    saveTask.mutate(
      { id: task.id, macrotaskId: macro.id, nome, ordem: task.ordem, executionMode: task.executionMode },
      { onSuccess: () => setEditingTaskId(null) }
    );
  };

  const handleRenameMacro = () => {
    if (editingMacroNome === null || !editingMacroNome.trim()) return;
    saveMacrotask.mutate(
      { id: macro.id, templateId, nome: editingMacroNome.trim(), ordem: macro.ordem },
      { onSuccess: () => setEditingMacroNome(null) }
    );
  };

  return (
    <>
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '0.75rem', background: '#ffffff', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderBottom: open ? '1px solid #e2e8f0' : 'none' }}>
        <IconButton
          type="button"
          onClick={() => setOpen(!open)}
          label={open ? 'Recolher macrotarefa' : 'Expandir macrotarefa'}
          expanded={open}
          icon={open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        />

        {editingMacroNome !== null ? (
          <>
            <input
              type="text"
              value={editingMacroNome}
              onChange={e => setEditingMacroNome(e.target.value)}
              style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: '0.85rem', padding: '0.3rem 0.5rem', border: '1px solid #93c5fd', borderRadius: '6px', outline: 'none' }}
              autoFocus
            />
            <IconButton
              type="button"
              variant="success"
              onClick={handleRenameMacro}
              label="Salvar"
              icon=<Check size={16} />
            />
          </>
        ) : (
          <>
            <Layers size={15} color="var(--primary)" />
            <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{macro.nome}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              {macro.tarefas.length} tarefa{macro.tarefas.length !== 1 ? 's' : ''}
            </span>
            <IconButton
              type="button"
              onClick={() => setEditingMacroNome(macro.nome)}
              label="Renomear macrotarefa"
              icon=<Edit2 size={14} />
            />
            <IconButton
              type="button"
              variant="ghostDanger"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Excluir macrotarefa',
                  message: `Excluir a macrotarefa "${macro.nome}" e todas as suas tarefas?`,
                  confirmLabel: 'Excluir',
                  tone: 'danger'
                });
                if (!ok) return;
                deleteMacrotask.mutate(macro.id, {
                  onError: err => toast.error(`Erro ao excluir macrotarefa: ${err.message || 'Erro desconhecido'}`)
                });
              }}
              label="Excluir macrotarefa"
              icon=<Trash2 size={14} />
            />
          </>
        )}
      </div>

      {saveMacrotask.isError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontSize: '0.75rem' }}>
          <AlertCircle size={13} />
          <span>{saveMacrotask.error?.message || 'Erro ao atualizar macrotarefa.'}</span>
        </div>
      )}

      {open && (
        <div style={{ padding: '0.75rem 1rem' }}>
          {macro.tarefas.length === 0 ? (
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0.35rem 0 0.65rem 0', fontStyle: 'italic' }}>
              Nenhuma tarefa nesta macrotarefa ainda.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.65rem' }}>
              {macro.tarefas.map((task, idx) => (
                <div
                  key={task.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.4rem 0.6rem',
                    background: '#f8fafc',
                    borderRadius: '6px',
                    border: '1px solid #f1f5f9'
                  }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', width: '20px' }}>
                    {idx + 1}.
                  </span>
                  <CheckSquare size={13} color="var(--primary)" />
                  {editingTaskId === task.id ? (
                    <>
                      <input
                        type="text"
                        value={editingTaskNome}
                        onChange={e => setEditingTaskNome(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameTask(task);
                          if (e.key === 'Escape') setEditingTaskId(null);
                        }}
                        autoFocus
                        style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: '0.82rem', padding: '0.25rem 0.5rem', border: '1px solid #93c5fd', borderRadius: '6px', outline: 'none' }}
                      />
                      <IconButton
                        type="button"
                        variant="success"
                        onClick={() => handleRenameTask(task)}
                        disabled={saveTask.isPending}
                        label="Salvar"
                        icon=<Check size={14} />
                      />
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: '0.82rem', color: '#334155' }}>{task.nome}</span>
                      <IconButton
                        type="button"
                        onClick={() => {
                          saveTask.reset();
                          setEditingTaskNome(task.nome);
                          setEditingTaskId(task.id);
                        }}
                        label="Renomear tarefa"
                        icon=<Edit2 size={13} />
                      />
                    </>
                  )}
                  <IconButton
                    type="button"
                    variant="ghostDanger"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Excluir tarefa',
                        message: `Excluir a tarefa "${task.nome}"?`,
                        confirmLabel: 'Excluir',
                        tone: 'danger'
                      });
                      if (!ok) return;
                      deleteTask.mutate(task.id, {
                        onError: err => toast.error(`Erro ao excluir tarefa: ${err.message || 'Erro desconhecido'}`)
                      });
                    }}
                    label="Excluir tarefa"
                    icon=<Trash2 size={13} />
                  />
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              type="text"
              placeholder="Adicionar nova tarefa..."
              value={newTaskNome}
              onChange={e => {
                if (saveTask.isError) saveTask.reset();
                setNewTaskNome(e.target.value);
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); }}
              style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: '0.8rem', padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
            />
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              icon={<Plus size={13} />}
              onClick={handleAddTask}
              disabled={!newTaskNome.trim() || saveTask.isPending}
              isLoading={saveTask.isPending}
            >
              Adicionar
            </AppButton>
          </div>

          {saveTask.isError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', color: 'var(--color-danger)', fontSize: '0.75rem' }}>
              <AlertCircle size={13} />
              <span>{saveTask.error?.message || 'Erro ao adicionar tarefa.'}</span>
            </div>
          )}
        </div>
      )}
    </div>
    {dialog}
    </>
  );
};

/** Criar ou editar um modelo (nome e descrição): mesmo diálogo nos dois casos. */
const TemplateFormModal: React.FC<{
  template?: TaskTemplate;
  onClose: () => void;
}> = ({ template, onClose }) => {
  const { hooks, copy } = useTaskTemplatesKit();
  const saveTemplate = hooks.useSaveTemplate();
  const [nome, setNome] = useState(template?.nome ?? '');
  const [descricao, setDescricao] = useState(template?.descricao ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    saveTemplate.mutate(
      {
        id: template?.id,
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        ativo: template ? template.ativo : true
      },
      { onSuccess: onClose }
    );
  };

  const clearError = () => {
    if (saveTemplate.isError) saveTemplate.reset();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!saveTemplate.isPending}
      size="md"
      testId="template-modal"
      title={template ? 'Editar modelo' : copy.createLabel}
      footer={
        <>
          <AppButton type="button" variant="outline" onClick={onClose} disabled={saveTemplate.isPending}>
            Cancelar
          </AppButton>
          <AppButton type="submit" form="template-form" disabled={!nome.trim() || saveTemplate.isPending} isLoading={saveTemplate.isPending}>
            {template ? 'Salvar alterações' : 'Criar modelo'}
          </AppButton>
        </>
      }
    >
      <form id="template-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <AppInput
          label="Nome do modelo *"
          required
          placeholder={copy.namePlaceholder}
          value={nome}
          onChange={(e) => {
            clearError();
            setNome(e.target.value);
          }}
        />
        <AppTextarea
          label="Descrição operacional (opcional)"
          rows={3}
          placeholder={copy.descriptionPlaceholder}
          value={descricao}
          onChange={(e) => {
            clearError();
            setDescricao(e.target.value);
          }}
        />
        {saveTemplate.isError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.85rem', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', borderRadius: '6px', fontSize: '0.82rem' }}>
            <AlertCircle size={16} /> {saveTemplate.error?.message || 'Falha ao salvar modelo.'}
          </div>
        )}
      </form>
    </Modal>
  );
};

const TemplateCard: React.FC<{ template: TaskTemplate }> = ({ template }) => {
  const [expanded, setExpanded] = useState(true);
  const [newMacroNome, setNewMacroNome] = useState('');
  const [editing, setEditing] = useState(false);
  const { hooks, copy } = useTaskTemplatesKit();
  const saveTemplate = hooks.useSaveTemplate();
  const deleteTemplate = hooks.useDeleteTemplate();
  const saveMacrotask = hooks.useSaveMacrotask();
  const { confirm, dialog } = useConfirm();
  const toast = useToast();

  const handleAddMacrotask = () => {
    if (!newMacroNome.trim()) return;
    saveMacrotask.mutate(
      { templateId: template.id, nome: newMacroNome.trim(), ordem: template.macrotarefas.length },
      { onSuccess: () => setNewMacroNome('') }
    );
  };

  const handleToggleAtivo = () => {
    saveTemplate.mutate({ id: template.id, nome: template.nome, descricao: template.descricao, ativo: !template.ativo });
  };

  const totalTarefas = template.macrotarefas.reduce((acc, m) => acc + m.tarefas.length, 0);

  return (
    <>
    <AppCard style={{ borderLeft: template.ativo ? '4px solid var(--primary)' : '4px solid #94a3b8' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '240px' }}>
          <IconButton
            type="button"
            onClick={() => setExpanded(!expanded)}
            label={expanded ? 'Recolher modelo' : 'Expandir modelo'}
            expanded={expanded}
            icon={expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {template.nome}
              </h3>
              <StatusBadge
                variant={template.ativo ? 'success' : 'neutral'}
                label={template.ativo ? 'ATIVO' : 'INATIVO'}
              />
            </div>
            {template.descricao && (
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                {template.descricao}
              </p>
            )}
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
              {template.macrotarefas.length} macrotarefa{template.macrotarefas.length !== 1 ? 's' : ''} • {totalTarefas} tarefa{totalTarefas !== 1 ? 's' : ''} no total
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AppButton
            type="button"
            variant="outline"
            size="sm"
            icon={<Edit2 size={14} />}
            onClick={() => setEditing(true)}
            title="Editar nome e descrição"
          >
            Editar
          </AppButton>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleToggleAtivo}
          >
            {template.ativo ? 'Desativar' : 'Ativar'}
          </AppButton>
          <IconButton
            label={`Excluir modelo ${template.nome}`}
            icon={<Trash2 size={16} />}
            onClick={async () => {
              const ok = await confirm({
                title: 'Excluir modelo',
                message: `Excluir o modelo "${template.nome}"? ${copy.deleteWarning}`,
                confirmLabel: 'Excluir',
                tone: 'danger'
              });
              if (!ok) return;
              deleteTemplate.mutate(template.id, {
                onError: err => toast.error(`Erro ao excluir modelo: ${err.message || 'Erro desconhecido'}`)
              });
            }}
            style={{ color: 'var(--color-danger)' }}
          />
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #f1f5f9' }}>
          {template.macrotarefas.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic', marginBottom: '1rem' }}>
              {copy.emptyMacrotasks}
            </p>
          ) : (
            template.macrotarefas
              .slice()
              .sort((a, b) => a.ordem - b.ordem)
              .map(macro => (
                <MacrotaskEditor key={macro.id} templateId={template.id} macro={macro} />
              ))
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <input
              type="text"
              placeholder={copy.macrotaskPlaceholder}
              value={newMacroNome}
              onChange={e => {
                if (saveMacrotask.isError) saveMacrotask.reset();
                setNewMacroNome(e.target.value);
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleAddMacrotask(); }}
              style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: '0.84rem', padding: '0.45rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
            />
            <AppButton
              type="button"
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={handleAddMacrotask}
              disabled={!newMacroNome.trim() || saveMacrotask.isPending}
              isLoading={saveMacrotask.isPending}
            >
              Adicionar Macrotarefa
            </AppButton>
          </div>

          {saveMacrotask.isError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', color: 'var(--color-danger)', fontSize: '0.78rem' }}>
              <AlertCircle size={14} />
              <span>{saveMacrotask.error?.message || 'Erro ao adicionar macrotarefa.'}</span>
            </div>
          )}
        </div>
      )}
    </AppCard>
    {editing && <TemplateFormModal template={template} onClose={() => setEditing(false)} />}
    {dialog}
    </>
  );
};

/** `embedded`: dentro de outra página (abas), sem o cabeçalho e o container próprios. */
const TaskTemplatesContent: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { hooks, copy } = useTaskTemplatesKit();
  const { data: templates = [], isLoading, error } = hooks.useTemplates();
  const [creating, setCreating] = useState(false);

  const Container = embedded ? 'div' : PageContainer;

  return (
    <Container style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Cabeçalho */}
      {!embedded && (
        <PageHeader
          title={copy.title}
          subtitle={copy.subtitle}
          icon={<Sliders size={26} color="var(--primary)" aria-hidden="true" />}
        />
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.85rem', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', borderRadius: '6px', fontSize: '0.82rem' }}>
          <AlertCircle size={16} /> Falha ao carregar templates oficiais.
        </div>
      )}

      {/* Lista de Templates Cadastrados */}
      <div>
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Modelos Disponíveis ({templates.length})
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{copy.activeHint}</span>
          </div>
          <AppButton icon={<Plus size={15} />} onClick={() => setCreating(true)} data-testid="template-new">
            Novo modelo
          </AppButton>
        </div>

        {isLoading ? (
          <SkeletonLoader count={3} height="120px" />
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={36} color="var(--primary)" />}
            title="Nenhum modelo cadastrado"
            description={copy.emptyDescription}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {templates.map(t => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        )}
      </div>

      {creating && <TemplateFormModal onClose={() => setCreating(false)} />}
    </Container>
  );
};

export const TaskTemplatesPage: React.FC<{ kit: TaskTemplatesKit; embedded?: boolean }> = ({ kit, embedded }) => (
  <TaskTemplatesKitContext.Provider value={kit}>
    <TaskTemplatesContent embedded={embedded} />
  </TaskTemplatesKitContext.Provider>
);
