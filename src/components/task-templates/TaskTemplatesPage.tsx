import React, { useMemo, useState } from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import {
  Plus,
  ClipboardList,
  AlertCircle,
  Layers,
  CheckSquare,
  Sliders
} from 'lucide-react';
import { AppCard } from '../../design-system/components/AppCard';
import { AppButton } from '../../design-system/components/AppButton';
import { PageHeader } from '../../design-system/components/PageHeader';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { Modal } from '../../design-system/components/Modal';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppTextarea } from '../../design-system/components/FormFields';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { EmptyState } from '../../design-system/components/EmptyState';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { useConfirm } from '../../design-system/components/ConfirmDialog';
import { useToast } from '../../design-system/components/Toast';
import { useAuth } from '../../context/AuthContext';
import { TaskTemplatesKitContext, useTaskTemplatesKit, type TaskTemplatesKit, type TaskTemplate, type TaskTemplateMacrotask, type TaskTemplateTask } from './taskTemplatesKit';
import { RegraTarefaModal } from './RegraTarefaModal';
import { AcaoEtiqueta, PregaoEtiqueta, RegraDetalhes } from '../plan/modeloGestaoPlano';
import { formatarEsforco, rotuloLista, textoRegraPrazo, textoRegraResposta } from '../../utils/modeloGestao';
import { useSalvarDetalhesModelo } from '../../hooks/useModeloGestao';

/** Linha de baixo da tarefa no modelo: ação, regra do prazo, esforço; e a lista ao abrir. */
const TarefaModeloRegra: React.FC<{ task: TaskTemplateTask; podeEditar: boolean; onEditar: () => void }> = ({ task, podeEditar, onEditar }) => {
  const [aberta, setAberta] = useState(false);
  const regra = textoRegraPrazo(task);
  const resposta = textoRegraResposta(task);
  const esforco = formatarEsforco(task.esforcoMin);
  const temDetalhes = !!(task.lista?.length || task.nota || task.modeloSei);
  if (!task.acao && !regra && !esforco && !temDetalhes && !podeEditar) return null;
  return (
    <div style={{ marginTop: '0.2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.75rem', color: '#64748b' }}>
        {task.acao && <AcaoEtiqueta acao={task.acao} comQuem={task.comQuem} />}
        {task.doPregao && <PregaoEtiqueta />}
        {regra && <span>Prazo: {regra}</span>}
        {resposta && <span>· {resposta}</span>}
        {esforco && <span>· esforço {esforco}</span>}
        {temDetalhes && (
          <AppButton type="button" variant="link" size="sm" aria-expanded={aberta} onClick={() => setAberta(!aberta)}>
            {task.lista?.length ? `${rotuloLista(task.acao)} (${task.lista.length})` : 'Detalhes'}
          </AppButton>
        )}
        {podeEditar && (
          <AppButton type="button" variant="link" size="sm" onClick={onEditar}>
            {task.acao || regra ? 'Editar regra' : 'Definir ação e prazo'}
          </AppButton>
        )}
      </div>
      {aberta && temDetalhes && (
        <RegraDetalhes rotulo={rotuloLista(task.acao)} lista={task.lista} nota={task.nota} modeloSei={task.modeloSei} />
      )}
    </div>
  );
};

const MacrotaskEditor: React.FC<{ templateId: string; macro: TaskTemplateMacrotask }> = ({ templateId, macro }) => {
  const [open, setOpen] = useState(true);
  const [newTaskNome, setNewTaskNome] = useState('');
  const [editingMacroNome, setEditingMacroNome] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskNome, setEditingTaskNome] = useState('');

  const { tipo, hooks, somenteLeitura } = useTaskTemplatesKit();
  const [regraDe, setRegraDe] = useState<TaskTemplateTask | null>(null);
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
        <ActionButton
          action={open ? 'recolher' : 'expandir'}
          iconOnly
          type="button"
          onClick={() => setOpen(!open)}
          label={open ? 'Recolher macrotarefa' : 'Expandir macrotarefa'}
          expanded={open}
        />

        {editingMacroNome !== null ? (
          <>
            <input
              type="text"
              value={editingMacroNome}
              onChange={e => setEditingMacroNome(e.target.value)}
              className="form-input" style={{ flex: 1, minWidth: 0 }}
              autoFocus
            />
            <ActionButton
              action="salvar"
              iconOnly
              type="button"
              onClick={handleRenameMacro}
            />
          </>
        ) : (
          <>
            <Layers size={15} color="var(--primary)" />
            <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{macro.nome}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              {macro.tarefas.length} tarefa{macro.tarefas.length !== 1 ? 's' : ''}
            </span>
            {!somenteLeitura && (
            <>
            <ActionButton
              action="renomear"
              iconOnly
              type="button"
              onClick={() => setEditingMacroNome(macro.nome)}
              label="Renomear macrotarefa"
            />
            <ActionButton
              action="excluir"
              iconOnly
              type="button"
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
            />
            </>
            )}
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
                    alignItems: 'flex-start',
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
                        className="form-input" style={{ flex: 1, minWidth: 0 }}
                      />
                      <ActionButton
                        action="salvar"
                        iconOnly
                        type="button"
                        onClick={() => handleRenameTask(task)}
                        disabled={saveTask.isPending}
                      />
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ overflowWrap: 'anywhere', fontSize: '0.82rem', color: '#334155' }}>{task.nome}</span>
                        <TarefaModeloRegra task={task} podeEditar={!somenteLeitura} onEditar={() => setRegraDe(task)} />
                      </div>
                      {!somenteLeitura && (
                      <ActionButton
                        action="renomear"
                        iconOnly
                        type="button"
                        onClick={() => {
                          saveTask.reset();
                          setEditingTaskNome(task.nome);
                          setEditingTaskId(task.id);
                        }}
                        label="Renomear tarefa"
                      />
                      )}
                    </>
                  )}
                  {!somenteLeitura && (
                  <ActionButton
                    action="excluir"
                    iconOnly
                    type="button"
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
                  />
                  )}
                </div>
              ))}
            </div>
          )}

          {!somenteLeitura && (
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
              className="form-input" style={{ flex: 1, minWidth: 0 }}
            />
            <ActionButton
              action="adicionar"
              type="button"
              size="sm"
              onClick={handleAddTask}
              disabled={!newTaskNome.trim() || saveTask.isPending}
              isLoading={saveTask.isPending}
            />
          </div>
          )}

          {saveTask.isError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', color: 'var(--color-danger)', fontSize: '0.75rem' }}>
              <AlertCircle size={13} />
              <span>{saveTask.error?.message || 'Erro ao adicionar tarefa.'}</span>
            </div>
          )}
        </div>
      )}
    </div>
    {regraDe && <RegraTarefaModal tipo={tipo} tarefa={regraDe} onClose={() => setRegraDe(null)} />}
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

  if (template) return <EditarModeloModal template={template} onClose={onClose} />;

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
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={saveTemplate.isPending} />
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

const linhas = (texto: string) =>
  texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** Editar um modelo: nome, descrição e os detalhes do módulo (quando entra, processo SEI, base, variantes). */
const EditarModeloModal: React.FC<{ template: TaskTemplate; onClose: () => void }> = ({ template, onClose }) => {
  const { tipo, hooks } = useTaskTemplatesKit();
  const saveTemplate = hooks.useSaveTemplate();
  const salvarDetalhes = useSalvarDetalhesModelo(tipo);
  const [nome, setNome] = useState(template.nome);
  const [descricao, setDescricao] = useState(template.descricao ?? '');
  const [quando, setQuando] = useState(template.quando ?? '');
  const [processoTipo, setProcessoTipo] = useState(template.processoTipo ?? '');
  const [base, setBase] = useState(template.base ?? '');
  const [variantes, setVariantes] = useState((template.variantes ?? []).join('\n'));
  const pendente = saveTemplate.isPending || salvarDetalhes.isPending;
  const erro = (saveTemplate.isError && saveTemplate.error?.message) || (salvarDetalhes.error as { message?: string } | null)?.message;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    const gravarDetalhes = () =>
      salvarDetalhes.mutate(
        { id: template.id, quando: quando.trim() || null, base: base.trim() || null, processoTipo: processoTipo.trim() || null, variantes: linhas(variantes) },
        { onSuccess: onClose }
      );
    const mudouNome = nome.trim() !== template.nome || (descricao.trim() || undefined) !== template.descricao;
    if (!mudouNome) {
      gravarDetalhes();
      return;
    }
    saveTemplate.mutate(
      { id: template.id, nome: nome.trim(), descricao: descricao.trim() || undefined, ativo: template.ativo },
      { onSuccess: gravarDetalhes }
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!pendente}
      size="lg"
      testId="template-modal"
      title="Editar modelo"
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={pendente} />
          <AppButton type="submit" form="template-form" disabled={!nome.trim() || pendente} isLoading={pendente}>
            Salvar alterações
          </AppButton>
        </>
      }
    >
      <form id="template-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <AppInput label="Nome do modelo *" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <AppTextarea label="Descrição operacional (opcional)" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <AppInput label="Quando entra" value={quando} onChange={(e) => setQuando(e.target.value)} placeholder="Ex.: 180 dias antes do fim da vigência" maxLength={300} />
        <AppInput
          label="Processo SEI em que corre"
          value={processoTipo}
          onChange={(e) => setProcessoTipo(e.target.value)}
          placeholder="Ex.: Processo do pregão, Fiscalização, Pagamento"
          maxLength={60}
        />
        <div style={{ gridColumn: '1 / -1' }}>
          <AppInput label="Base normativa" value={base} onChange={(e) => setBase(e.target.value)} placeholder="Ex.: Lei 14.133/2021, art. 107 · NT 67" maxLength={500} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <AppTextarea label="Variantes (uma por linha, opcional)" rows={2} value={variantes} onChange={(e) => setVariantes(e.target.value)} />
        </div>
        {erro && (
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.85rem', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', borderRadius: '6px', fontSize: '0.82rem' }}>
            <AlertCircle size={16} /> {erro}
          </div>
        )}
      </form>
    </Modal>
  );
};

/** Quando entra, processo SEI, base e variantes do módulo, abaixo do nome do modelo. */
const DetalhesModeloLinha: React.FC<{ template: TaskTemplate }> = ({ template }) => {
  const itens = [
    template.quando && { rotulo: 'Quando', valor: template.quando },
    template.processoTipo && { rotulo: 'Corre no', valor: template.processoTipo },
    template.base && { rotulo: 'Base', valor: template.base },
    template.variantes?.length && { rotulo: 'Variantes', valor: template.variantes.join(' · ') }
  ].filter(Boolean) as { rotulo: string; valor: string }[];
  if (itens.length === 0) return null;
  return (
    <div data-testid="template-detalhes" style={{ display: 'grid', gap: '0.1rem', fontSize: '0.78rem', color: '#475569', marginTop: '0.35rem' }}>
      {itens.map((i) => (
        <div key={i.rotulo}>
          <span style={{ fontWeight: 700 }}>{i.rotulo}:</span> {i.valor}
        </div>
      ))}
    </div>
  );
};

const TemplateCard: React.FC<{ template: TaskTemplate; inicialAberto?: boolean }> = ({ template, inicialAberto = true }) => {
  const [expanded, setExpanded] = useState(inicialAberto);
  const [newMacroNome, setNewMacroNome] = useState('');
  const [editing, setEditing] = useState(false);
  const { hooks, copy, somenteLeitura } = useTaskTemplatesKit();
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
          <ActionButton
            action={expanded ? 'recolher' : 'expandir'}
            iconOnly
            type="button"
            onClick={() => setExpanded(!expanded)}
            label={expanded ? 'Recolher modelo' : 'Expandir modelo'}
            expanded={expanded}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {template.nome}
              </h3>
              <StatusBadge
                variant={template.ativo ? 'success' : 'neutral'}
                label={template.ativo ? 'Ativo' : 'Inativo'}
              />
              {template.origemModelo === 'CCGA' && <StatusBadge variant="info" label="Padrão CCGA" />}
            </div>
            {template.descricao && (
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                {template.descricao}
              </p>
            )}
            <DetalhesModeloLinha template={template} />
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
              {template.macrotarefas.length} macrotarefa{template.macrotarefas.length !== 1 ? 's' : ''} • {totalTarefas} tarefa{totalTarefas !== 1 ? 's' : ''} no total
            </div>
          </div>
        </div>

        {!somenteLeitura && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ActionButton
            action="editar"
            type="button"
            size="sm"
            onClick={() => setEditing(true)}
            title="Editar nome e descrição"
          />
          <AppButton
            type="button"
            variant="outline"
            size="sm"
            onClick={handleToggleAtivo}
          >
            {template.ativo ? 'Desativar' : 'Ativar'}
          </AppButton>
          <ActionButton
            action="excluir"
            iconOnly
            label={`Excluir modelo ${template.nome}`}
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
          />
        </div>
        )}
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

          {!somenteLeitura && (
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
              className="form-input" style={{ flex: 1, minWidth: 0 }}
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
          )}

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
  const { hooks, copy, somenteLeitura } = useTaskTemplatesKit();
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
        <SectionHeader
          title="Modelos disponíveis"
          countBadge={templates.length}
          subtitle={somenteLeitura ? `${copy.activeHint} Só o coordenador altera os modelos.` : copy.activeHint}
          actions={somenteLeitura ? undefined : <ActionButton action="novo" label="Novo modelo" onClick={() => setCreating(true)} data-testid="template-new" />}
          testId="templates-header"
        />

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
            {/* Ativos primeiro; com muitos modelos (19 da CCGA), cada um começa recolhido. */}
            {[...templates.filter((t) => t.ativo), ...templates.filter((t) => !t.ativo)].map((t) => (
              <TemplateCard key={t.id} template={t} inicialAberto={templates.length <= 3} />
            ))}
          </div>
        )}
      </div>

      {creating && !somenteLeitura && <TemplateFormModal onClose={() => setCreating(false)} />}
    </Container>
  );
};

/** Só o coordenador cria, edita e exclui modelos (migration 199); o gestor vê e aplica no plano dos seus. */
export const TaskTemplatesPage: React.FC<{ kit: TaskTemplatesKit; embedded?: boolean }> = ({ kit, embedded }) => {
  const { role } = useAuth();
  const somenteLeitura = role !== 'admin';
  const value = useMemo(() => ({ ...kit, somenteLeitura }), [kit, somenteLeitura]);
  return (
    <TaskTemplatesKitContext.Provider value={value}>
      <TaskTemplatesContent embedded={embedded} />
    </TaskTemplatesKitContext.Provider>
  );
};
