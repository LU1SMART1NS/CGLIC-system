import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { AppButton } from '../../design-system/components/AppButton';

/**
 * Peças de edição do Plano de Gestão, compartilhadas por contratos e Atas.
 * O Modelo de Gestão é só um facilitador: o gestor cria, edita e exclui livremente.
 */

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.35rem 0.5rem',
  fontSize: '0.8rem',
  borderRadius: '4px',
  border: '1px solid #cbd5e1'
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
  color: '#475569',
  display: 'block',
  marginBottom: '0.2rem'
};

export const PERSONALIZADA_BADGE_STYLE: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 700,
  padding: '0.1rem 0.4rem',
  borderRadius: '4px',
  backgroundColor: '#eef2ff',
  color: '#3730a3',
  border: '1px solid #c7d2fe'
};

/** Texto do responsável na linha da tarefa: o próprio, ou o gestor herdado. */
export function describeResponsavel(responsavelNome?: string, gestorNome?: string): string | null {
  if (responsavelNome) return responsavelNome;
  if (gestorNome) return `${gestorNome} (gestor)`;
  return null;
}

/** Botão de exclusão em dois passos (evita exclusão acidental sem depender de window.confirm). */
export const ConfirmDeleteButton: React.FC<{
  onConfirm: () => void;
  disabled?: boolean;
  label: string;
  confirmMessage: string;
}> = ({ onConfirm, disabled, label, confirmMessage }) => {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={() => setConfirming(true)}
        disabled={disabled}
        style={{ padding: '0.25rem 0.4rem', background: 'transparent', border: 'none', color: '#b91c1c', cursor: 'pointer' }}
      >
        <Trash2 size={15} />
      </button>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.74rem', color: '#b91c1c' }}>
      {confirmMessage}
      <AppButton
        type="button"
        variant="danger"
        size="sm"
        disabled={disabled}
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        Excluir
      </AppButton>
      <AppButton type="button" variant="outline" size="sm" onClick={() => setConfirming(false)}>
        Cancelar
      </AppButton>
    </span>
  );
};

export interface NewTaskValues {
  nome: string;
  prazo: string;
  observacao: string;
}

/** Formulário de criação de tarefa dentro de uma etapa. */
export const AddTaskForm: React.FC<{
  onSubmit: (values: NewTaskValues) => void;
  isPending?: boolean;
  gestorNome?: string;
}> = ({ onSubmit, isPending, gestorNome }) => {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [prazo, setPrazo] = useState('');
  const [observacao, setObservacao] = useState('');

  const reset = () => {
    setOpen(false);
    setNome('');
    setPrazo('');
    setObservacao('');
  };

  if (!open) {
    return (
      <div style={{ paddingTop: '0.6rem' }}>
        <AppButton type="button" variant="ghost" size="sm" icon={<Plus size={13} />} onClick={() => setOpen(true)}>
          Adicionar tarefa
        </AppButton>
      </div>
    );
  }

  return (
    <form
      aria-label="Nova tarefa"
      onSubmit={(e) => {
        e.preventDefault();
        if (!nome.trim()) return;
        onSubmit({ nome: nome.trim(), prazo, observacao: observacao.trim() });
        reset();
      }}
      style={{
        marginTop: '0.6rem',
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
        <label style={labelStyle} htmlFor="new-task-nome">Nome da tarefa</label>
        <input
          id="new-task-nome"
          autoFocus
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Solicitar parecer jurídico"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="new-task-prazo">Prazo limite (opcional)</label>
        <input id="new-task-prazo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle} htmlFor="new-task-obs">Observação (opcional)</label>
        <input
          id="new-task-obs"
          type="text"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
          {gestorNome ? `Responsável: ${gestorNome} (gestor). Você pode alterar depois.` : 'Você pode definir o responsável depois.'}
        </span>
        <span style={{ display: 'inline-flex', gap: '0.5rem' }}>
          <AppButton type="button" variant="outline" size="sm" onClick={reset}>Cancelar</AppButton>
          <AppButton type="submit" variant="primary" size="sm" disabled={!nome.trim() || isPending} isLoading={isPending}>
            Criar tarefa
          </AppButton>
        </span>
      </div>
    </form>
  );
};

/** Título de etapa com renomear/excluir inline. */
export const MacrotaskHeader: React.FC<{
  nome: string;
  onRename: (nome: string) => void;
  onDelete: () => void;
  isPending?: boolean;
  taskCount: number;
}> = ({ nome, onRename, onDelete, isPending, taskCount }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nome);

  const headingStyle: React.CSSProperties = {
    fontSize: '0.92rem',
    fontWeight: 800,
    color: '#0c326f',
    margin: 0
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
        flexWrap: 'wrap',
        margin: '0 0 0.5rem 0',
        borderBottom: '1px solid #f1f5f9',
        paddingBottom: '0.4rem'
      }}
    >
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            if (draft.trim() !== nome) onRename(draft.trim());
            setEditing(false);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flex: 1 }}
        >
          <input
            autoFocus
            aria-label="Nome da etapa"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ ...inputStyle, maxWidth: '360px' }}
          />
          <button type="submit" title="Salvar nome" aria-label="Salvar nome" style={iconButtonStyle}><Check size={15} /></button>
          <button
            type="button"
            title="Cancelar"
            aria-label="Cancelar edição do nome"
            onClick={() => {
              setDraft(nome);
              setEditing(false);
            }}
            style={iconButtonStyle}
          >
            <X size={15} />
          </button>
        </form>
      ) : (
        <h4 style={headingStyle}>{nome}</h4>
      )}

      {!editing && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
          <button
            type="button"
            title="Renomear etapa"
            aria-label="Renomear etapa"
            onClick={() => {
              setDraft(nome);
              setEditing(true);
            }}
            style={iconButtonStyle}
          >
            <Pencil size={14} />
          </button>
          <ConfirmDeleteButton
            label="Excluir etapa"
            confirmMessage={taskCount > 0 ? `Excluir a etapa e suas ${taskCount} tarefa(s)?` : 'Excluir a etapa?'}
            disabled={isPending}
            onConfirm={onDelete}
          />
        </span>
      )}
    </div>
  );
};

const iconButtonStyle: React.CSSProperties = {
  padding: '0.25rem 0.4rem',
  background: 'transparent',
  border: 'none',
  color: '#64748b',
  cursor: 'pointer'
};

/** "+ Nova etapa" no rodapé do plano. */
export const AddMacrotaskForm: React.FC<{
  onSubmit: (nome: string) => void;
  isPending?: boolean;
}> = ({ onSubmit, isPending }) => {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');

  if (!open) {
    return (
      <div>
        <AppButton type="button" variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => setOpen(true)}>
          Nova etapa
        </AppButton>
      </div>
    );
  }

  return (
    <form
      aria-label="Nova etapa"
      onSubmit={(e) => {
        e.preventDefault();
        if (!nome.trim()) return;
        onSubmit(nome.trim());
        setNome('');
        setOpen(false);
      }}
      style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
    >
      <input
        autoFocus
        aria-label="Nome da nova etapa"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome da etapa"
        style={{ ...inputStyle, maxWidth: '320px' }}
      />
      <AppButton type="submit" variant="primary" size="sm" disabled={!nome.trim() || isPending} isLoading={isPending}>
        Criar etapa
      </AppButton>
      <AppButton
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setNome('');
          setOpen(false);
        }}
      >
        Cancelar
      </AppButton>
    </form>
  );
};

/** Mensagem de erro de mutação, quando houver. */
export const MutationError: React.FC<{ error: unknown }> = ({ error }) => {
  if (!error) return null;
  // Erros das RPCs chegam como objeto simples ({ code, message }), não como Error.
  const rawMessage = (error as { message?: unknown })?.message;
  const message = typeof rawMessage === 'string' && rawMessage.trim()
    ? rawMessage
    : 'Não foi possível concluir a operação.';
  return (
    <div role="alert" style={{ fontSize: '0.78rem', color: '#b91c1c', margin: '0.5rem 0' }}>
      {message}
    </div>
  );
};

export const planFormStyles = { inputStyle, labelStyle };

/** Cabeçalho de um módulo do plano: modelo de origem, data de aplicação, progresso e exclusão. */
export const ModuleGroupHeader: React.FC<{
  nome: string;
  appliedAt?: string;
  concluidas: number;
  aplicaveis: number;
  etapas: number;
  /** Ausente para etapas personalizadas (não há módulo a excluir). */
  onDelete?: () => void;
  isPending?: boolean;
  atrasadas?: number;
  /** Quando informado, o cabeçalho vira um botão de recolher/expandir o módulo. */
  onToggleCollapsed?: () => void;
  collapsed?: boolean;
}> = ({ nome, appliedAt, concluidas, aplicaveis, etapas, onDelete, isPending, atrasadas = 0, onToggleCollapsed, collapsed = false }) => {
  const appliedLabel = appliedAt ? new Date(appliedAt).toLocaleDateString('pt-BR') : null;
  const percentual = aplicaveis > 0 ? Math.round((concluidas / aplicaveis) * 100) : 0;
  const summary = (
    <div>
      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0c326f' }}>{nome}</div>
      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
        {etapas} etapa{etapas !== 1 ? 's' : ''} • {concluidas} de {aplicaveis} tarefas concluídas ({percentual}%)
        {appliedLabel && <> • aplicado em {appliedLabel}</>}
        {atrasadas > 0 && (
          <span style={{ color: '#dc2626', fontWeight: 700 }}> • {atrasadas} atrasada{atrasadas !== 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        flexWrap: 'wrap',
        padding: '0.55rem 0.85rem',
        background: '#eef2f8',
        borderLeft: '3px solid #0c326f',
        borderRadius: '6px'
      }}
    >
      {onToggleCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expandir módulo' : 'Recolher módulo'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flex: 1,
            padding: 0,
            background: 'transparent',
            border: 'none',
            textAlign: 'left',
            cursor: 'pointer',
            font: 'inherit'
          }}
        >
          {collapsed ? <ChevronRight size={16} color="#0c326f" /> : <ChevronDown size={16} color="#0c326f" />}
          {summary}
        </button>
      ) : (
        summary
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          title="Excluir módulo"
          aria-label={`Excluir módulo ${nome}`}
          style={{ ...iconButtonStyle, color: '#dc2626' }}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
};
