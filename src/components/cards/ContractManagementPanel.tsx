import React, { useEffect, useState } from 'react';
import {
  UserCircle2,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Check,
  Circle,
  CircleDot,
  Minus,
  Loader2,
  AlertTriangle,
  Save
} from 'lucide-react';
import type { ContractDashboardRecord, ContractTaskStatusValue, ContractTaskMacrotask } from '../../types';
import { getContractManagementKey } from '../../services/contractManagementService';
import { useContractManager } from '../../hooks/useContractManager';
import { useSaveContractManager } from '../../hooks/useSaveContractManager';
import { useUsers } from '../../hooks/useUsers';
import { useContractTaskTemplates } from '../../hooks/useContractTaskTemplates';
import { useContractTaskPlan } from '../../hooks/useContractTaskPlan';
import { useApplyContractTaskTemplate } from '../../hooks/useApplyContractTaskTemplate';
import { useUpdateContractTask } from '../../hooks/useUpdateContractTask';

interface ContractManagementPanelProps {
  contract: ContractDashboardRecord;
  active: boolean;
}

const STATUS_OPTIONS: { value: ContractTaskStatusValue; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'PENDENTE', label: 'Pendente', icon: <Circle size={14} />, color: '#94a3b8' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento', icon: <CircleDot size={14} />, color: '#d97706' },
  { value: 'CONCLUIDA', label: 'Concluída', icon: <Check size={14} />, color: '#059669' },
  { value: 'NAO_APLICAVEL', label: 'Não aplicável', icon: <Minus size={14} />, color: '#94a3b8' }
];

function isAtrasada(prazo?: string, status?: ContractTaskStatusValue): boolean {
  if (!prazo || status === 'CONCLUIDA' || status === 'NAO_APLICAVEL') return false;
  const prazoDate = new Date(`${prazo}T00:00:00`);
  if (isNaN(prazoDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prazoDate < today;
}

function formatDateBR(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

const TaskRow: React.FC<{ task: ContractTaskMacrotask['tarefas'][number]; contractKey: string; defaultResponsavel: string }> = ({
  task,
  contractKey,
  defaultResponsavel
}) => {
  const updateMutation = useUpdateContractTask(contractKey);
  const [expanded, setExpanded] = useState(false);
  const [responsavelNome, setResponsavelNome] = useState(task.responsavelNome || defaultResponsavel || '');
  const [prazo, setPrazo] = useState(task.prazo || '');
  const [observacao, setObservacao] = useState(task.observacao || '');

  const atrasada = isAtrasada(task.prazo, task.status);

  const handleStatusClick = (status: ContractTaskStatusValue) => {
    if (status === task.status) return;
    updateMutation.mutate({ taskId: task.id, status });
  };

  const handleSaveDetails = () => {
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
    <div style={{ borderBottom: '1px solid #f1f5f9', padding: '0.5rem 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <div style={{ display: 'flex', gap: '2px' }}>
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              onClick={() => handleStatusClick(opt.value)}
              disabled={updateMutation.isPending}
              style={{
                width: '22px',
                height: '22px',
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

        <span
          style={{
            flex: 1,
            fontSize: '0.85rem',
            color: task.status === 'CONCLUIDA' ? '#94a3b8' : '#1e293b',
            textDecoration: task.status === 'CONCLUIDA' ? 'line-through' : 'none',
            cursor: 'pointer'
          }}
          onClick={() => setExpanded(!expanded)}
        >
          {task.nome}
        </span>

        {(task.responsavelNome || defaultResponsavel) && !expanded && (
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{task.responsavelNome || defaultResponsavel}</span>
        )}

        {task.prazo && !expanded && (
          <span
            style={{
              fontSize: '0.72rem',
              padding: '0.1rem 0.4rem',
              borderRadius: '4px',
              fontWeight: 600,
              color: atrasada ? '#dc2626' : '#475569',
              background: atrasada ? 'rgba(239,68,68,0.1)' : '#f1f5f9',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px'
            }}
          >
            {atrasada && <AlertTriangle size={11} />}
            {formatDateBR(task.prazo)}
          </span>
        )}

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {updateMutation.isError && (
        <p style={{ fontSize: '0.74rem', color: '#dc2626', margin: '0.2rem 0 0 2.1rem' }}>
          {(updateMutation.error as any)?.message || 'Falha ao atualizar a tarefa.'}
        </p>
      )}

      {expanded && (
        <div style={{ marginTop: '0.5rem', paddingLeft: '2.1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Responsável"
              value={responsavelNome}
              onChange={e => setResponsavelNome(e.target.value)}
              style={{ flex: '1 1 180px', fontSize: '0.8rem', padding: '0.35rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px' }}
            />
            <input
              type="date"
              value={prazo}
              onChange={e => setPrazo(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px' }}
            />
          </div>
          <textarea
            placeholder="Observação (opcional)"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            rows={2}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', resize: 'vertical' }}
          />
          {task.concluidoEm && (
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              Concluída em {formatDateBR(task.concluidoEm)}{task.concluidoPor ? ` por ${task.concluidoPor}` : ''}
            </span>
          )}
          <div>
            <button
              type="button"
              onClick={handleSaveDetails}
              disabled={updateMutation.isPending}
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              {updateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const MacrotaskAccordion: React.FC<{ macro: ContractTaskMacrotask; contractKey: string; defaultResponsavel: string }> = ({
  macro,
  contractKey,
  defaultResponsavel
}) => {
  const [open, setOpen] = useState(false);
  const total = macro.tarefas.length;
  const aplicaveis = macro.tarefas.filter(t => t.status !== 'NAO_APLICAVEL');
  const concluidas = macro.tarefas.filter(t => t.status === 'CONCLUIDA').length;
  const pct = aplicaveis.length > 0 ? Math.round((concluidas / aplicaveis.length) * 100) : 0;

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '0.5rem', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.6rem 0.85rem',
          background: '#f8fafc',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {macro.nome}
          <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#64748b' }}>({total} tarefa{total !== 1 ? 's' : ''})</span>
        </span>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: pct === 100 ? '#059669' : '#003399' }}>{pct}%</span>
      </button>

      {open && (
        <div style={{ padding: '0.5rem 0.85rem' }}>
          {macro.tarefas.map(task => (
            <TaskRow key={task.id} task={task} contractKey={contractKey} defaultResponsavel={defaultResponsavel} />
          ))}
        </div>
      )}
    </div>
  );
};

export const ContractManagementPanel: React.FC<ContractManagementPanelProps> = ({ contract, active }) => {
  const contractKey = getContractManagementKey(contract.uasg, contract.numero, contract.ano);

  const { data: manager, isLoading: isLoadingManager } = useContractManager(contractKey);
  const saveManagerMutation = useSaveContractManager();
  const [gestorNome, setGestorNome] = useState('');
  const [editingGestor, setEditingGestor] = useState(false);

  useEffect(() => {
    setGestorNome(manager?.gestorNome || '');
  }, [manager?.gestorNome]);

  const { data: plan, isLoading: isLoadingPlan } = useContractTaskPlan(contractKey, active);
  const { data: templates = [] } = useContractTaskTemplates();
  const applyMutation = useApplyContractTaskTemplate();
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const ativoTemplates = templates.filter(t => t.ativo);

  const { data: users = [] } = useUsers();
  const [customMode, setCustomMode] = useState(false);

  const activeUsers = users.filter(u => u.ativo);

  const handleSelectUser = (selectedName: string) => {
    if (selectedName === '__custom__') {
      setCustomMode(true);
      setGestorNome('');
    } else {
      setCustomMode(false);
      setGestorNome(selectedName);
    }
  };

  const handleSaveGestor = () => {
    if (!gestorNome.trim()) return;
    saveManagerMutation.mutate(
      { uasg: contract.uasg, numero: contract.numero, ano: Number(contract.ano), gestorNome: gestorNome.trim() },
      { onSuccess: () => { setEditingGestor(false); setCustomMode(false); } }
    );
  };

  const handleApplyTemplate = () => {
    if (!selectedTemplateId) return;
    applyMutation.mutate({ uasg: contract.uasg, numero: contract.numero, ano: Number(contract.ano), templateId: selectedTemplateId });
  };

  if (isLoadingManager || isLoadingPlan) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', gap: '0.75rem', color: '#003399' }}>
        <Loader2 className="animate-spin" size={20} />
        <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>Carregando gestão do contrato...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* GESTOR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <UserCircle2 size={16} style={{ color: '#003399' }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Gestor:</span>

        {editingGestor ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {!customMode ? (
              <select
                value={activeUsers.some(u => u.nome === gestorNome) ? gestorNome : (gestorNome ? '__custom__' : '')}
                onChange={e => handleSelectUser(e.target.value)}
                style={{
                  fontSize: '0.82rem',
                  padding: '0.35rem 0.6rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  minWidth: '260px',
                  fontWeight: 600,
                  color: '#0f172a'
                }}
                autoFocus
              >
                <option value="">Selecione o servidor responsável...</option>
                {activeUsers.map(u => (
                  <option key={u.id} value={u.nome}>
                    {u.nome} ({u.cargo || 'Servidor'} - {u.departamento || 'SENASP'})
                  </option>
                ))}
                <option value="__custom__">➕ Digitar outro nome...</option>
              </select>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="text"
                  value={gestorNome}
                  onChange={e => setGestorNome(e.target.value)}
                  placeholder="Digite o nome completo do gestor"
                  style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px', minWidth: '220px' }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => { setCustomMode(false); setGestorNome(''); }}
                  style={{ fontSize: '0.75rem', color: '#0284c7', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Ver lista
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleSaveGestor}
              disabled={saveManagerMutation.isPending || !gestorNome.trim()}
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
            >
              {saveManagerMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => { setEditingGestor(false); setCustomMode(false); setGestorNome(manager?.gestorNome || ''); }}
              style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: manager ? '#0f172a' : '#94a3b8' }}>
              {manager?.gestorNome || 'Não atribuído'}
            </span>
            <button
              type="button"
              onClick={() => {
                setEditingGestor(true);
                setCustomMode(false);
              }}
              style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: '#003399', cursor: 'pointer', fontWeight: 600 }}
            >
              {manager ? 'Alterar' : 'Atribuir'}
            </button>
          </>
        )}
      </div>

      {saveManagerMutation.isError && (
        <p style={{ fontSize: '0.78rem', color: '#dc2626', margin: 0 }}>
          {(saveManagerMutation.error as any)?.message || 'Falha ao salvar o gestor do contrato.'}
        </p>
      )}

      {/* PLANO DE GESTÃO */}
      <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
          <ClipboardList size={16} style={{ color: '#003399' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Gestão Contratual</span>
        </div>

        {!plan ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              style={{ fontSize: '0.82rem', padding: '0.4rem 0.6rem', border: '1px solid #e2e8f0', borderRadius: '6px', minWidth: '260px' }}
            >
              <option value="">Selecione um plano de gestão...</option>
              {ativoTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleApplyTemplate}
              disabled={!selectedTemplateId || applyMutation.isPending}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
            >
              {applyMutation.isPending ? 'Aplicando...' : 'Aplicar plano'}
            </button>
            {ativoTemplates.length === 0 && (
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
                Nenhum template ativo cadastrado. Configure um em Configurações → Templates de Gestão Contratual.
              </span>
            )}
            {applyMutation.isError && (
              <p style={{ fontSize: '0.78rem', color: '#dc2626', margin: 0, width: '100%' }}>
                {(applyMutation.error as any)?.message || 'Falha ao aplicar o plano de gestão.'}
              </p>
            )}
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${plan.progresso.percentual}%`,
                    height: '100%',
                    background: plan.progresso.percentual === 100 ? '#059669' : '#003399',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#003399', minWidth: '42px', textAlign: 'right' }}>
                {plan.progresso.percentual}%
              </span>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.85rem' }}>
              {plan.progresso.concluidas} de {plan.progresso.total - plan.progresso.naoAplicaveis} tarefas concluídas
              {plan.progresso.atrasadas > 0 && (
                <span style={{ color: '#dc2626', fontWeight: 700 }}> · {plan.progresso.atrasadas} atrasada{plan.progresso.atrasadas !== 1 ? 's' : ''}</span>
              )}
              <span style={{ color: '#94a3b8' }}> · Plano: {plan.templateNome}</span>
            </p>

            {plan.macrotarefas.map(macro => (
              <MacrotaskAccordion key={macro.id} macro={macro} contractKey={contractKey} defaultResponsavel={manager?.gestorNome || ''} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
