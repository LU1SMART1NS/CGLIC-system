import React, { useState, useEffect } from 'react';
import {
  UserCircle2,
  UserCheck,
  Loader2,
  Check,
  X,
  Edit2,
  UserPlus
} from 'lucide-react';
import type { ContractDashboardRecord } from '../../types';
import { getContractManagementKey } from '../../services/contractManagementService';
import { useContractManager } from '../../hooks/useContractManager';
import { useSaveContractManager } from '../../hooks/useSaveContractManager';
import { useUsers } from '../../hooks/useUsers';
import { useRoles } from '../../hooks/useRoles';
import { resolveRoleLabel } from '../../services/roleService';

interface ContractManagerSelectorProps {
  contract: ContractDashboardRecord;
  className?: string;
  onSaved?: (gestorNome: string) => void;
}

export const ContractManagerSelector: React.FC<ContractManagerSelectorProps> = ({
  contract,
  className,
  onSaved
}) => {
  const contractKey =
    contract.id ||
    getContractManagementKey(contract.uasg, contract.numero, contract.ano);

  const { data: manager, isLoading: isLoadingManager } = useContractManager(contractKey);
  const saveManagerMutation = useSaveContractManager();
  const { data: users = [] } = useUsers();
  const { data: roles = [] } = useRoles();

  const [editing, setEditing] = useState(false);
  const [gestorNome, setGestorNome] = useState('');
  const [customMode, setCustomMode] = useState(false);

  useEffect(() => {
    setGestorNome(manager?.gestorNome || '');
  }, [manager?.gestorNome]);

  const activeUsers = users.filter((u) => u.ativo);

  const handleSelectUser = (selectedName: string) => {
    if (selectedName === '__custom__') {
      setCustomMode(true);
      setGestorNome('');
    } else {
      setCustomMode(false);
      setGestorNome(selectedName);
    }
  };

  const handleSave = () => {
    const trimmed = gestorNome.trim();
    if (!trimmed) return;

    // Normalização defensiva do ano
    let anoNum = typeof contract.ano === 'number' ? contract.ano : parseInt(String(contract.ano || '').replace(/\D/g, ''), 10);
    if (!anoNum || anoNum < 2000 || anoNum > 2100) {
      // Tentar extrair do número ou da vigência
      const numMatch = String(contract.numero || '').match(/\/(\d{4})$/);
      if (numMatch) {
        anoNum = parseInt(numMatch[1], 10);
      } else if (contract.dataVigenciaInicio) {
        anoNum = parseInt(contract.dataVigenciaInicio.split('-')[0], 10);
      } else {
        anoNum = new Date().getFullYear();
      }
    }

    saveManagerMutation.mutate(
      {
        uasg: contract.uasg,
        numero: contract.numero,
        ano: anoNum,
        gestorNome: trimmed
      },
      {
        onSuccess: () => {
          setEditing(false);
          setCustomMode(false);
          if (onSaved) onSaved(trimmed);
        }
      }
    );
  };

  const handleCancel = () => {
    setEditing(false);
    setCustomMode(false);
    setGestorNome(manager?.gestorNome || '');
    saveManagerMutation.reset();
  };

  if (isLoadingManager) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }} className={className}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            color: '#0c326f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <Loader2 size={16} className="animate-spin" />
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Gestor Titular</div>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Carregando...</div>
        </div>
      </div>
    );
  }

  const isAssigned = Boolean(manager?.gestorNome);

  return (
    <div style={{ display: 'flex', gap: '0.65rem' }} className={className} data-testid="contract-manager-container">
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          backgroundColor: isAssigned ? 'rgba(12, 50, 111, 0.08)' : '#f8fafc',
          border: `1px solid ${isAssigned ? 'rgba(12, 50, 111, 0.2)' : '#e2e8f0'}`,
          color: isAssigned ? '#0c326f' : '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        {isAssigned ? <UserCheck size={18} /> : <UserCircle2 size={18} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
          Gestor Titular
        </div>

        {editing ? (
          <div style={{ marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {!customMode ? (
              <select
                value={
                  activeUsers.some((u) => u.nome === gestorNome)
                    ? gestorNome
                    : gestorNome
                    ? '__custom__'
                    : ''
                }
                onChange={(e) => handleSelectUser(e.target.value)}
                style={{
                  fontSize: '0.82rem',
                  padding: '0.3rem 0.5rem',
                  border: '1px solid #0c326f',
                  borderRadius: '6px',
                  width: '100%',
                  fontWeight: 600,
                  color: '#0f172a',
                  backgroundColor: '#ffffff'
                }}
                autoFocus
              >
                <option value="">Selecione o servidor gestor...</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.nome}>
                    {u.nome} ({resolveRoleLabel(roles, u.perfil)})
                  </option>
                ))}
                <option value="__custom__">➕ Digitar outro nome...</option>
              </select>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <input
                  type="text"
                  value={gestorNome}
                  onChange={(e) => setGestorNome(e.target.value)}
                  placeholder="Nome completo do gestor"
                  style={{
                    fontSize: '0.82rem',
                    padding: '0.3rem 0.5rem',
                    border: '1px solid #0c326f',
                    borderRadius: '6px',
                    width: '100%',
                    backgroundColor: '#ffffff'
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    setCustomMode(false);
                    setGestorNome(manager?.gestorNome || '');
                  }}
                  style={{
                    fontSize: '0.72rem',
                    color: '#0284c7',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    padding: 0,
                    textDecoration: 'underline'
                  }}
                >
                  ← Selecionar da lista de servidores
                </button>
              </div>
            )}

            {saveManagerMutation.isError && (
              <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600, marginTop: '0.2rem' }}>
                Erro ao salvar: {saveManagerMutation.error?.message || 'Falha na comunicação com o banco.'}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saveManagerMutation.isPending || !gestorNome.trim()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '0.25rem 0.6rem',
                  backgroundColor: '#0c326f',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: saveManagerMutation.isPending || !gestorNome.trim() ? 'not-allowed' : 'pointer',
                  opacity: saveManagerMutation.isPending || !gestorNome.trim() ? 0.6 : 1
                }}
              >
                {saveManagerMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Check size={12} />
                )}
                <span>Salvar</span>
              </button>

              <button
                type="button"
                onClick={handleCancel}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '0.25rem 0.5rem',
                  backgroundColor: '#f8fafc',
                  color: '#64748b',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <X size={12} />
                <span>Cancelar</span>
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
            <span
              style={{
                fontSize: '0.88rem',
                fontWeight: isAssigned ? 700 : 500,
                color: isAssigned ? '#0f172a' : '#94a3b8',
                fontStyle: isAssigned ? 'normal' : 'italic'
              }}
            >
              {manager?.gestorNome || 'Não atribuído'}
            </span>

            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setCustomMode(false);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '0.15rem 0.45rem',
                backgroundColor: isAssigned ? 'rgba(12, 50, 111, 0.06)' : '#f0fdf4',
                color: isAssigned ? '#0c326f' : '#166534',
                border: `1px solid ${isAssigned ? 'rgba(12, 50, 111, 0.2)' : '#86efac'}`,
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title={isAssigned ? 'Alterar gestor designado' : 'Atribuir gestor a este contrato'}
            >
              {isAssigned ? <Edit2 size={11} /> : <UserPlus size={11} />}
              <span>{isAssigned ? 'Alterar' : 'Atribuir'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
