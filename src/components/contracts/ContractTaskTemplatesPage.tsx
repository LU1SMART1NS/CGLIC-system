import React, { useState } from 'react';
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
import { useContractTaskTemplates } from '../../hooks/useContractTaskTemplates';
import { useSaveContractTaskTemplate } from '../../hooks/useSaveContractTaskTemplate';
import { useDeleteContractTaskTemplate } from '../../hooks/useDeleteContractTaskTemplate';
import { useSaveContractTaskTemplateMacrotask } from '../../hooks/useSaveContractTaskTemplateMacrotask';
import { useDeleteContractTaskTemplateMacrotask } from '../../hooks/useDeleteContractTaskTemplateMacrotask';
import { useSaveContractTaskTemplateTask } from '../../hooks/useSaveContractTaskTemplateTask';
import { useDeleteContractTaskTemplateTask } from '../../hooks/useDeleteContractTaskTemplateTask';
import { AppCard } from '../../design-system/components/AppCard';
import { AppButton } from '../../design-system/components/AppButton';
import { PageHeader } from '../../design-system/components/PageHeader';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { EmptyState } from '../../design-system/components/EmptyState';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import type { ContractTaskTemplate, ContractTaskTemplateMacrotask } from '../../types';

const MacrotaskEditor: React.FC<{ templateId: string; macro: ContractTaskTemplateMacrotask }> = ({ templateId, macro }) => {
  const [open, setOpen] = useState(true);
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
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '0.75rem', background: '#ffffff', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderBottom: open ? '1px solid #e2e8f0' : 'none' }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0c326f', padding: '2px' }}
        >
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {editingMacroNome !== null ? (
          <>
            <input
              type="text"
              value={editingMacroNome}
              onChange={e => setEditingMacroNome(e.target.value)}
              style={{ flex: 1, fontSize: '0.85rem', padding: '0.3rem 0.5rem', border: '1px solid #93c5fd', borderRadius: '6px', outline: 'none' }}
              autoFocus
            />
            <button
              type="button"
              onClick={handleRenameMacro}
              style={{ background: 'none', border: 'none', color: '#059669', cursor: 'pointer' }}
              title="Salvar"
            >
              <Check size={16} />
            </button>
          </>
        ) : (
          <>
            <Layers size={15} color="#0c326f" />
            <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{macro.nome}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              {macro.tarefas.length} tarefa{macro.tarefas.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => setEditingMacroNome(macro.nome)}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px' }}
              title="Renomear macrotarefa"
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Excluir a macrotarefa "${macro.nome}" e todas as suas tarefas?`)) {
                  deleteMacrotask.mutate(macro.id, {
                    onError: err => alert(`Erro ao excluir macrotarefa: ${err.message || 'Erro desconhecido'}`)
                  });
                }
              }}
              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px' }}
              title="Excluir macrotarefa"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>

      {saveMacrotask.isError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', background: '#fef2f2', color: '#dc2626', fontSize: '0.75rem' }}>
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
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', width: '20px' }}>
                    {idx + 1}.
                  </span>
                  <CheckSquare size={13} color="#0c326f" />
                  <span style={{ flex: 1, fontSize: '0.82rem', color: '#334155' }}>{task.nome}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Excluir a tarefa "${task.nome}"?`)) {
                        deleteTask.mutate(task.id, {
                          onError: err => alert(`Erro ao excluir tarefa: ${err.message || 'Erro desconhecido'}`)
                        });
                      }
                    }}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px' }}
                    title="Excluir tarefa"
                  >
                    <Trash2 size={13} />
                  </button>
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
              style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', color: '#dc2626', fontSize: '0.75rem' }}>
              <AlertCircle size={13} />
              <span>{saveTask.error?.message || 'Erro ao adicionar tarefa.'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const TemplateCard: React.FC<{ template: ContractTaskTemplate }> = ({ template }) => {
  const [expanded, setExpanded] = useState(true);
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

  const totalTarefas = template.macrotarefas.reduce((acc, m) => acc + m.tarefas.length, 0);

  return (
    <AppCard style={{ borderLeft: template.ativo ? '4px solid #0c326f' : '4px solid #94a3b8' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '240px' }}>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0c326f', padding: '2px' }}
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
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
            variant="secondary"
            size="sm"
            onClick={handleToggleAtivo}
          >
            {template.ativo ? 'Desativar' : 'Ativar'}
          </AppButton>
          <AppButton
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.confirm(`Excluir o template "${template.nome}"? Contratos que já aplicaram este template não serão afetados.`)) {
                deleteTemplate.mutate(template.id, {
                  onError: err => alert(`Erro ao excluir modelo: ${err.message || 'Erro desconhecido'}`)
                });
              }
            }}
            style={{ color: '#dc2626', borderColor: '#fca5a5' }}
            title="Excluir template"
          >
            <Trash2 size={14} />
          </AppButton>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #f1f5f9' }}>
          {template.macrotarefas.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic', marginBottom: '1rem' }}>
              Nenhuma macrotarefa cadastrada. Adicione uma abaixo para estruturar o fluxo de fiscalização.
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
              placeholder="Adicionar nova macrotarefa (ex: 1. Fase Inicial / Medição Mensal)..."
              value={newMacroNome}
              onChange={e => {
                if (saveMacrotask.isError) saveMacrotask.reset();
                setNewMacroNome(e.target.value);
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleAddMacrotask(); }}
              style={{ flex: 1, fontSize: '0.84rem', padding: '0.45rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', color: '#dc2626', fontSize: '0.78rem' }}>
              <AlertCircle size={14} />
              <span>{saveMacrotask.error?.message || 'Erro ao adicionar macrotarefa.'}</span>
            </div>
          )}
        </div>
      )}
    </AppCard>
  );
};

export const ContractTaskTemplatesPage: React.FC = () => {
  const { data: templates = [], isLoading, error } = useContractTaskTemplates();
  const saveTemplate = useSaveContractTaskTemplate();
  const [novoNome, setNovoNome] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim()) return;
    saveTemplate.mutate(
      { nome: novoNome.trim(), descricao: novaDescricao.trim() || undefined, ativo: true },
      {
        onSuccess: () => {
          setNovoNome('');
          setNovaDescricao('');
        }
      }
    );
  };

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* Cabeçalho */}
      <PageHeader
        title="Modelos de Gestão"
        subtitle="Padronização de planos de trabalho, checklists de fiscalização e marcos de acompanhamento contratual."
        icon={<Sliders size={26} color="#0c326f" aria-hidden="true" />}
      />

      {/* Formulário de Criação de Novo Template */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '1.25rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
        }}
      >
        {/* Cabeçalho do Card de Ação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Sliders size={16} color="#0c326f" aria-hidden="true" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>
            Criar Novo Modelo / Plano de Gestão
          </h3>
        </div>
        
        <form onSubmit={handleCreateTemplate}>
          {/* Grid de Campos em 2 Colunas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                Nome do Template *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Gestão de Contrato de TI e Licenciamento"
                value={novoNome}
                onChange={e => {
                  if (saveTemplate.isError) saveTemplate.reset();
                  setNovoNome(e.target.value);
                }}
                style={{
                  width: '100%',
                  fontSize: '0.82rem',
                  padding: '0.45rem 0.75rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  background: '#f8fafc',
                  color: '#0f172a',
                  outline: 'none'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                Descrição Operacional (opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: Checklist padrão com medições mensais, relatórios e atesto de notas fiscais"
                value={novaDescricao}
                onChange={e => {
                  if (saveTemplate.isError) saveTemplate.reset();
                  setNovaDescricao(e.target.value);
                }}
                style={{
                  width: '100%',
                  fontSize: '0.82rem',
                  padding: '0.45rem 0.75rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  background: '#f8fafc',
                  color: '#0f172a',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Rodapé de Ações Alinhado à Direita */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem', marginTop: '0.85rem' }}>
            <AppButton
              type="submit"
              variant="primary"
              size="sm"
              disabled={!novoNome.trim() || saveTemplate.isPending}
              isLoading={saveTemplate.isPending}
              icon={<Plus size={14} />}
            >
              Criar Modelo
            </AppButton>
          </div>

          {saveTemplate.isError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.85rem', background: '#fef2f2', color: '#dc2626', borderRadius: '6px', marginTop: '0.85rem', fontSize: '0.82rem' }}>
              <AlertCircle size={16} /> {saveTemplate.error?.message || 'Falha ao criar modelo.'}
            </div>
          )}
        </form>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.85rem', background: '#fef2f2', color: '#dc2626', borderRadius: '6px', marginTop: '1rem', fontSize: '0.82rem' }}>
            <AlertCircle size={16} /> Falha ao carregar templates oficiais.
          </div>
        )}
      </div>

      {/* Lista de Templates Cadastrados */}
      <div>
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Modelos Disponíveis ({templates.length})
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Modelos ativos podem ser aplicados diretamente na aba Tarefas & Fiscalização de qualquer contrato.
          </span>
        </div>

        {isLoading ? (
          <SkeletonLoader count={3} height="120px" />
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={36} color="#0c326f" />}
            title="Nenhum modelo cadastrado"
            description="Cadastre seu primeiro modelo acima para estruturar as rotinas contratuais da equipe."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {templates.map(t => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
