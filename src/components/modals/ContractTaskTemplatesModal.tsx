import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { useContractTaskTemplates } from '../../hooks/useContractTaskTemplates';
import { useSaveContractTaskTemplate } from '../../hooks/useSaveContractTaskTemplate';
import { useDeleteContractTaskTemplate } from '../../hooks/useDeleteContractTaskTemplate';
import { useSaveContractTaskTemplateMacrotask } from '../../hooks/useSaveContractTaskTemplateMacrotask';
import { useDeleteContractTaskTemplateMacrotask } from '../../hooks/useDeleteContractTaskTemplateMacrotask';
import { useSaveContractTaskTemplateTask } from '../../hooks/useSaveContractTaskTemplateTask';
import { useDeleteContractTaskTemplateTask } from '../../hooks/useDeleteContractTaskTemplateTask';
import type { ContractTaskTemplate, ContractTaskTemplateMacrotask } from '../../types';

interface ContractTaskTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MacrotaskEditor: React.FC<{ templateId: string; macro: ContractTaskTemplateMacrotask }> = ({ templateId, macro }) => {
  const [open, setOpen] = useState(false);
  const [newTaskNome, setNewTaskNome] = useState('');
  const [editingMacroNome, setEditingMacroNome] = useState<string | null>(null);

  const saveMacrotask = useSaveContractTaskTemplateMacrotask();
  const deleteMacrotask = useDeleteContractTaskTemplateMacrotask();
  const saveTask = useSaveContractTaskTemplateTask();
  const deleteTask = useDeleteContractTaskTemplateTask();

  const handleAddTask = () => {
    if (!newTaskNome.trim()) return;
    saveTask.mutate(
      { macrotaskId: macro.id, nome: newTaskNome.trim(), ordem: macro.tarefas.length },
      { onSuccess: () => setNewTaskNome('') }
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
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: '#f8fafc' }}>
        <button type="button" onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {editingMacroNome !== null ? (
          <>
            <input
              type="text"
              value={editingMacroNome}
              onChange={e => setEditingMacroNome(e.target.value)}
              style={{ flex: 1, fontSize: '0.82rem', padding: '0.25rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
              autoFocus
            />
            <button type="button" onClick={handleRenameMacro} style={{ background: 'none', border: 'none', color: '#059669', cursor: 'pointer' }}>
              <Check size={15} />
            </button>
          </>
        ) : (
          <>
            <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>{macro.nome}</span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{macro.tarefas.length} tarefa(s)</span>
            <button
              type="button"
              onClick={() => setEditingMacroNome(macro.nome)}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              title="Editar macrotarefa"
            >
              <Edit2 size={13} />
            </button>
            <button
              type="button"
              onClick={() => { if (confirm(`Excluir a macrotarefa "${macro.nome}" e todas as suas tarefas?`)) deleteMacrotask.mutate(macro.id); }}
              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}
              title="Excluir macrotarefa"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>

      {open && (
        <div style={{ padding: '0.5rem 0.75rem 0.75rem' }}>
          {macro.tarefas.map(task => (
            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ flex: 1, fontSize: '0.8rem', color: '#334155' }}>{task.nome}</span>
              <button
                type="button"
                onClick={() => { if (confirm(`Excluir a tarefa "${task.nome}"?`)) deleteTask.mutate(task.id); }}
                style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}
                title="Excluir tarefa"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
            <input
              type="text"
              placeholder="Nova tarefa..."
              value={newTaskNome}
              onChange={e => setNewTaskNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); }}
              style={{ flex: 1, fontSize: '0.8rem', padding: '0.3rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
            />
            <button
              type="button"
              onClick={handleAddTask}
              disabled={!newTaskNome.trim() || saveTask.isPending}
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Plus size={12} /> Adicionar tarefa
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const TemplateEditor: React.FC<{ template: ContractTaskTemplate }> = ({ template }) => {
  const [expanded, setExpanded] = useState(false);
  const [newMacroNome, setNewMacroNome] = useState('');
  const saveTemplate = useSaveContractTaskTemplate();
  const deleteTemplate = useDeleteContractTaskTemplate();
  const saveMacrotask = useSaveContractTaskTemplateMacrotask();

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

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '0.85rem', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem 1rem', background: template.ativo ? '#fff' : '#f8fafc' }}>
        <button type="button" onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#003399' }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <span style={{ flex: 1, fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>{template.nome}</span>
        {!template.ativo && (
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
            INATIVO
          </span>
        )}
        <button type="button" onClick={handleToggleAtivo} className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}>
          {template.ativo ? 'Desativar' : 'Ativar'}
        </button>
        <button
          type="button"
          onClick={() => { if (confirm(`Excluir o template "${template.nome}"? Contratos que já aplicaram este template não serão afetados.`)) deleteTemplate.mutate(template.id); }}
          style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}
          title="Excluir template"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid #edf2f7' }}>
          {template.macrotarefas
            .slice()
            .sort((a, b) => a.ordem - b.ordem)
            .map(macro => (
              <MacrotaskEditor key={macro.id} templateId={template.id} macro={macro} />
            ))}

          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
            <input
              type="text"
              placeholder="Nova macrotarefa..."
              value={newMacroNome}
              onChange={e => setNewMacroNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddMacrotask(); }}
              style={{ flex: 1, fontSize: '0.82rem', padding: '0.35rem 0.6rem', border: '1px solid #e2e8f0', borderRadius: '6px' }}
            />
            <button
              type="button"
              onClick={handleAddMacrotask}
              disabled={!newMacroNome.trim() || saveMacrotask.isPending}
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Plus size={13} /> Adicionar macrotarefa
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const ContractTaskTemplatesModal: React.FC<ContractTaskTemplatesModalProps> = ({ isOpen, onClose }) => {
  const { data: templates = [], isLoading, error } = useContractTaskTemplates();
  const saveTemplate = useSaveContractTaskTemplate();
  const [novoNome, setNovoNome] = useState('');

  if (!isOpen) return null;

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim()) return;
    saveTemplate.mutate({ nome: novoNome.trim(), ativo: true }, { onSuccess: () => setNovoNome('') });
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '3rem 1rem', overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '760px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            <ClipboardList size={18} style={{ color: '#003399' }} />
            Templates de Gestão Contratual
          </h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
          <form onSubmit={handleCreateTemplate} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <input
              type="text"
              placeholder="Nome do novo template (ex: Gestão de Contrato Administrativo)"
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              style={{ flex: 1, fontSize: '0.85rem', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px' }}
            />
            <button type="submit" disabled={!novoNome.trim() || saveTemplate.isPending} className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '0.5rem 1rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Plus size={14} /> Criar template
            </button>
          </form>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.8rem', background: '#fef2f2', color: '#dc2626', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.82rem' }}>
              <AlertCircle size={15} /> Falha ao carregar templates.
            </div>
          )}

          {saveTemplate.isError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.8rem', background: '#fef2f2', color: '#dc2626', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.82rem' }}>
              <AlertCircle size={15} /> {(saveTemplate.error as any)?.message || 'Falha ao criar o template.'}
            </div>
          )}

          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', gap: '0.6rem', color: '#003399' }}>
              <Loader2 className="animate-spin" size={18} />
              <span style={{ fontSize: '0.85rem' }}>Carregando templates...</span>
            </div>
          ) : templates.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '1.5rem 0' }}>
              Nenhum template cadastrado ainda. Crie o primeiro acima.
            </p>
          ) : (
            templates.map(t => <TemplateEditor key={t.id} template={t} />)
          )}
        </div>
      </div>
    </div>
  );
};
