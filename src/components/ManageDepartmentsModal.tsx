import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  AlertCircle, 
  Sparkles, 
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { useDepartments } from '../hooks/useDepartments';
import { useSaveDepartment } from '../hooks/useSaveDepartment';
import { useDeleteDepartment } from '../hooks/useDeleteDepartment';
import { useMergeDepartment } from '../hooks/useMergeDepartment';
import type { InternalDepartment } from '../services/unitService';
import { fetchAllAllocationsGlobal } from '../services/allocationService';

interface ManageDepartmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDepartmentsUpdated?: () => void;
}

export const ManageDepartmentsModal: React.FC<ManageDepartmentsModalProps> = ({
  isOpen,
  onClose,
  onDepartmentsUpdated
}) => {
  const { data: departments = [], isLoading: isDepartmentsLoading, refetch } = useDepartments();
  const saveMutation = useSaveDepartment();
  const deleteMutation = useDeleteDepartment();
  const mergeMutation = useMergeDepartment();

  const [sigla, setSigla] = useState('');
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Detecção de nomes legados ou com erros de digitação (ex: "DFNSPdddd")
  const [legacyNames, setLegacyNames] = useState<string[]>([]);
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});

  const isSubmitting = saveMutation.isPending || deleteMutation.isPending || mergeMutation.isPending;

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessMsg(null);
      detectLegacyAllocations(departments);
    }
  }, [isOpen, departments]);

  const detectLegacyAllocations = async (currentDeps: InternalDepartment[]) => {
    if (!currentDeps || currentDeps.length === 0) return;
    try {
      const allAllocs = await fetchAllAllocationsGlobal();
      const officialNames = new Set(currentDeps.map(d => d.sigla.toLowerCase()));
      const unknownNames = new Set<string>();

      allAllocs.forEach(a => {
        if (a.unitName && !officialNames.has(a.unitName.toLowerCase())) {
          unknownNames.add(a.unitName);
        }
      });

      const unknownList = Array.from(unknownNames);
      setLegacyNames(unknownList);

      // Prepara alvos padrão para mesclagem
      const initialTargets: Record<string, string> = {};
      unknownList.forEach(u => {
        const match = currentDeps.find(d => 
          u.toLowerCase().startsWith(d.sigla.toLowerCase()) || 
          d.sigla.toLowerCase().includes(u.toLowerCase())
        );
        initialTargets[u] = match ? match.sigla : (currentDeps[0]?.sigla || '');
      });
      setMergeTargets(initialTargets);
    } catch (e) {
      console.warn('Erro ao detectar alocações legadas:', e);
    }
  };

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanSigla = sigla.trim().toUpperCase();
    const cleanNome = nomeCompleto.trim();

    if (!cleanSigla) {
      setError('A sigla da unidade é obrigatória (Ex: DFNSP).');
      return;
    }

    if (!cleanNome) {
      setError('O nome completo da unidade é obrigatório.');
      return;
    }

    try {
      await saveMutation.mutateAsync({
        id: editingId || undefined,
        sigla: cleanSigla,
        nomeCompleto: cleanNome
      });

      setSuccessMsg(
        editingId 
          ? `Unidade "${cleanSigla}" atualizada com sucesso!` 
          : `Unidade "${cleanSigla}" cadastrada com sucesso!`
      );
      setEditingId(null);
      setSigla('');
      setNomeCompleto('');
      if (onDepartmentsUpdated) onDepartmentsUpdated();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar unidade.');
    }
  };

  const handleEdit = (dep: InternalDepartment) => {
    setEditingId(dep.id);
    setSigla(dep.sigla);
    setNomeCompleto(dep.nomeCompleto);
    setError(null);
  };

  const handleDelete = async (id: string, depSigla: string) => {
    if (!confirm(`Tem certeza que deseja excluir a unidade "${depSigla}" do cadastro oficial?`)) {
      return;
    }

    setError(null);
    setSuccessMsg(null);

    try {
      const res = await deleteMutation.mutateAsync({ id, forceDeactivate: false });
      if (res.deleted) {
        setSuccessMsg(`Unidade "${depSigla}" removida com sucesso.`);
      } else if (res.deactivated) {
        setSuccessMsg(`Unidade "${depSigla}" desativada com sucesso.`);
      }
      if (onDepartmentsUpdated) onDepartmentsUpdated();
    } catch (err: any) {
      if (err.code === 'CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS' || (err.sqlState === '23503')) {
        const confirmDeactivate = confirm(
          `A unidade "${depSigla}" possui alocações contábeis vinculadas e não pode ser excluída fisicamente.\n\nDeseja desativá-la para que não apareça em novas alocações, mantendo o histórico intacto?`
        );
        if (confirmDeactivate) {
          try {
            await deleteMutation.mutateAsync({ id, forceDeactivate: true });
            setSuccessMsg(`Unidade "${depSigla}" desativada com sucesso.`);
            if (onDepartmentsUpdated) onDepartmentsUpdated();
          } catch (deactErr: any) {
            setError(deactErr.message || 'Erro ao desativar unidade.');
          }
        }
      } else {
        setError(err.message || 'Erro ao excluir unidade.');
      }
    }
  };

  const handleMerge = async (oldName: string) => {
    const targetSigla = mergeTargets[oldName];
    if (!targetSigla) return;

    setError(null);
    setSuccessMsg(null);

    try {
      const res = await mergeMutation.mutateAsync({ oldName, targetSigla });
      setSuccessMsg(`Higienização concluída! ${res.rows_updated} registros com "${oldName}" foram unificados em "${targetSigla}".`);
      await refetch();
      if (onDepartmentsUpdated) onDepartmentsUpdated();
    } catch (err: any) {
      setError(err.message || 'Erro ao mesclar registros da unidade.');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '750px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden'
      }}>
        
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Building2 size={22} color="var(--primary)" />
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                Cadastro de Unidades e Departamentos Internos
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                Padronização das diretorias e coordenações oficiais da SENASP
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            disabled={isSubmitting}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Alerts */}
          {error && (
            <div style={{ padding: '0.75rem 1rem', background: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {successMsg && (
            <div style={{ padding: '0.75rem 1rem', background: 'var(--success-bg)', color: 'var(--success-text)', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={16} /> {successMsg}
            </div>
          )}

          {/* Higienizador de Nomes Legados / Typos */}
          {legacyNames.length > 0 && (
            <div style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#92400e', fontWeight: 700, fontSize: '0.85rem' }}>
                <Sparkles size={16} /> Higienização de Registros Antigos / Nomes Digitados Incorretamente
              </div>
              <p style={{ fontSize: '0.78rem', color: '#78350f', margin: 0 }}>
                Encontramos registros de alocações antigas com nomes que não constam na lista oficial. Você pode mesclá-los com a unidade correta com 1 clique:
              </p>
              
              {legacyNames.map((name) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #fef3c7', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--danger)' }}>
                    "{name}"
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>mesclar para:</span>
                    <select
                      className="form-input"
                      value={mergeTargets[name] || ''}
                      onChange={(e) => setMergeTargets({ ...mergeTargets, [name]: e.target.value })}
                      disabled={isSubmitting}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', height: 'auto', width: 'auto', fontWeight: 700 }}
                    >
                      {departments.map(d => (
                        <option key={d.id} value={d.sigla}>{d.sigla} - {d.nomeCompleto}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleMerge(name)}
                      disabled={isSubmitting}
                      className="btn btn-primary"
                      style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem', height: 'auto' }}
                    >
                      {mergeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Mesclar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Form to Add / Edit Department */}
          <form onSubmit={handleSave} style={{
            background: '#f8fafc',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)' }}>
              {editingId ? '✏️ Editar Unidade Oficial' : '+ Cadastrar Nova Unidade Oficial'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.78rem' }}>Sigla / Código *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: DFNSP"
                  value={sigla}
                  onChange={(e) => setSigla(e.target.value.toUpperCase())}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.78rem' }}>Nome Completo / Diretoria *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: Diretoria da Força Nacional de Segurança Pública"
                  value={nomeCompleto}
                  onChange={(e) => setNomeCompleto(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="btn btn-primary" 
                  style={{ padding: '0.55rem 1rem', height: '40px', fontSize: '0.82rem' }}
                >
                  {saveMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : editingId ? (
                    <Check size={14} />
                  ) : (
                    <Plus size={14} />
                  )}
                  {' '}
                  {editingId ? 'Salvar' : 'Adicionar'}
                </button>
                {editingId && (
                  <button 
                    type="button" 
                    onClick={() => { setEditingId(null); setSigla(''); setNomeCompleto(''); }} 
                    disabled={isSubmitting}
                    className="btn btn-secondary" 
                    style={{ padding: '0.55rem 0.75rem', height: '40px' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* List of Registered Departments */}
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Unidades Disponíveis na Lista Suspensa ({departments.length})</span>
              {isDepartmentsLoading && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Carregando...</span>}
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <table className="custom-table" style={{ margin: 0 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ width: '130px', padding: '0.6rem 1rem' }}>SIGLA</th>
                    <th style={{ padding: '0.6rem 1rem' }}>NOME COMPLETO</th>
                    <th style={{ width: '90px', textAlign: 'center', padding: '0.6rem 1rem' }}>AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d) => (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--border)', opacity: d.ativo ? 1 : 0.6 }}>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 800, color: d.ativo ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {d.sigla} {!d.ativo && <span style={{ fontSize: '0.7rem', color: 'var(--danger)', fontWeight: 600 }}>(Inativa)</span>}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: 'var(--text-main)', fontSize: '0.85rem' }}>
                        {d.nomeCompleto}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleEdit(d)}
                            disabled={isSubmitting}
                            style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: isSubmitting ? 'not-allowed' : 'pointer', padding: '2px' }}
                            title="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(d.id, d.sigla)}
                            disabled={isSubmitting}
                            style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: isSubmitting ? 'not-allowed' : 'pointer', padding: '2px' }}
                            title="Excluir / Desativar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {departments.length === 0 && !isDepartmentsLoading && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                        Nenhuma unidade cadastrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: '#f8fafc'
        }}>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="btn btn-secondary">
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
