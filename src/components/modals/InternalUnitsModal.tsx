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
import { useDepartments } from '../../hooks/useDepartments';
import { useSaveDepartment } from '../../hooks/useSaveDepartment';
import { useDeleteDepartment } from '../../hooks/useDeleteDepartment';
import { useMergeDepartment } from '../../hooks/useMergeDepartment';
import type { InternalDepartment } from '../../services/unitService';
import { fetchAllAllocationsGlobal } from '../../services/allocationService';
import { AppButton } from '../../design-system/components/AppButton';

interface InternalUnitsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnitsUpdated?: () => void;
}

export const InternalUnitsModal: React.FC<InternalUnitsModalProps> = ({
  isOpen,
  onClose,
  onUnitsUpdated
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

  // Detecção de registros legados ou variações com erro de digitação
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
      console.warn('Erro ao detectar alocações com siglas legadas:', e);
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
      setError('A sigla da unidade é obrigatória (Ex: DFNSP, DSUSP, CGOE).');
      return;
    }

    if (!cleanNome) {
      setError('O nome completo da unidade / diretoria / coordenação é obrigatório.');
      return;
    }

    try {
      await saveMutation.mutateAsync({
        id: editingId || undefined,
        sigla: cleanSigla,
        nomeCompleto: cleanNome,
        ativo: true
      });

      setSuccessMsg(
        editingId 
          ? `Unidade "${cleanSigla}" atualizada com sucesso!` 
          : `Unidade "${cleanSigla}" cadastrada com sucesso!`
      );
      setEditingId(null);
      setSigla('');
      setNomeCompleto('');
      if (onUnitsUpdated) onUnitsUpdated();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar unidade interna.');
    }
  };

  const handleEdit = (dep: InternalDepartment) => {
    setEditingId(dep.id);
    setSigla(dep.sigla);
    setNomeCompleto(dep.nomeCompleto);
    setError(null);
    setSuccessMsg(null);
  };

  const handleDelete = async (id: string, depSigla: string) => {
    if (!window.confirm(`Tem certeza que deseja inativar/excluir a unidade interna "${depSigla}"?`)) {
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
      if (onUnitsUpdated) onUnitsUpdated();
    } catch (err: any) {
      if (err.code === 'CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS' || (err.sqlState === '23503')) {
        const confirmDeactivate = window.confirm(
          `A unidade "${depSigla}" possui alocações contábeis vinculadas e não pode ser excluída fisicamente.\n\nDeseja desativá-la para que não apareça em novas alocações, mantendo o histórico intacto?`
        );
        if (confirmDeactivate) {
          try {
            await deleteMutation.mutateAsync({ id, forceDeactivate: true });
            setSuccessMsg(`Unidade "${depSigla}" desativada com sucesso.`);
            if (onUnitsUpdated) onUnitsUpdated();
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
      setSuccessMsg(`Higienização concluída! ${res.rows_updated} registro(s) com "${oldName}" foram unificados em "${targetSigla}".`);
      await refetch();
      if (onUnitsUpdated) onUnitsUpdated();
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
        maxWidth: '780px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden'
      }}>
        
        {/* Cabeçalho */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Building2 size={24} color="#0c326f" />
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0c326f', margin: 0 }}>
                Gestão de Unidades Internas (SENASP)
              </h2>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0, marginTop: '2px' }}>
                Diretorias, coordenações-gerais e coordenações oficiais para controle e distribuição de cotas
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            disabled={isSubmitting}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem' }}
            title="Fechar janela"
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Mensagens de Feedback */}
          {error && (
            <div style={{ padding: '0.75rem 1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #fecaca' }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {successMsg && (
            <div style={{ padding: '0.75rem 1rem', background: '#dcfce7', color: '#166534', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #bbf7d0' }}>
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
                <Sparkles size={16} /> Higienização de Registros Antigos / Nomes Incorretos
              </div>
              <p style={{ fontSize: '0.78rem', color: '#78350f', margin: 0 }}>
                Encontramos registros de alocações com siglas que não constam no catálogo oficial. Você pode unificá-las com a unidade correta:
              </p>
              
              {legacyNames.map((name) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #fef3c7', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#dc2626' }}>
                    "{name}"
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>mesclar para:</span>
                    <select
                      value={mergeTargets[name] || ''}
                      onChange={(e) => setMergeTargets({ ...mergeTargets, [name]: e.target.value })}
                      disabled={isSubmitting}
                      style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 600 }}
                    >
                      {departments.map(d => (
                        <option key={d.id} value={d.sigla}>{d.sigla} - {d.nomeCompleto}</option>
                      ))}
                    </select>
                    <AppButton
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => handleMerge(name)}
                      disabled={isSubmitting}
                      isLoading={mergeMutation.isPending}
                    >
                      Mesclar
                    </AppButton>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Formulário de Cadastro / Edição */}
          <form onSubmit={handleSave} style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '1.25rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.92rem', fontWeight: 800, color: '#0c326f' }}>
              {editingId ? <Edit2 size={16} color="#0c326f" /> : <Building2 size={16} color="#0c326f" />}
              <span>{editingId ? 'Editar Unidade Interna' : 'Cadastrar Nova Unidade Interna'}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem', display: 'block' }}>
                  Sigla / Código *
                </label>
                <input
                  type="text"
                  placeholder="Ex: DFNSP, DSUSP, CGOE"
                  value={sigla}
                  onChange={(e) => setSigla(e.target.value.toUpperCase())}
                  disabled={isSubmitting}
                  required
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem', display: 'block' }}>
                  Nome Completo / Diretoria / Coordenação *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Diretoria da Força Nacional de Segurança Pública"
                  value={nomeCompleto}
                  onChange={(e) => setNomeCompleto(e.target.value)}
                  disabled={isSubmitting}
                  required
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
              {editingId && (
                <AppButton
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditingId(null); setSigla(''); setNomeCompleto(''); }}
                  disabled={isSubmitting}
                >
                  Cancelar
                </AppButton>
              )}
              <AppButton
                type="submit"
                variant="primary"
                size="sm"
                icon={saveMutation.isPending ? undefined : (editingId ? <Check size={14} /> : <Plus size={14} />)}
                isLoading={saveMutation.isPending}
                disabled={isSubmitting}
              >
                {editingId ? 'Salvar Alterações' : 'Adicionar Unidade'}
              </AppButton>
            </div>
          </form>

          {/* Lista de Unidades Internas */}
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Unidades Internas Oficiais ({departments.length})</span>
              {isDepartmentsLoading && (
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Loader2 size={12} className="animate-spin" /> Carregando...
                </span>
              )}
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                    <th style={{ width: '140px', padding: '0.65rem 1rem' }}>SIGLA</th>
                    <th style={{ padding: '0.65rem 1rem' }}>NOME COMPLETO / DIRETORIA</th>
                    <th style={{ width: '90px', textAlign: 'center', padding: '0.65rem 1rem' }}>AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d) => (
                    <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: d.ativo ? 1 : 0.6 }}>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 800, color: d.ativo ? '#0c326f' : '#64748b' }}>
                        {d.sigla} {!d.ativo && <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600 }}>(Inativa)</span>}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: '#334155' }}>
                        {d.nomeCompleto}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleEdit(d)}
                            disabled={isSubmitting}
                            style={{ background: 'transparent', border: 'none', color: '#0ea5e9', cursor: isSubmitting ? 'not-allowed' : 'pointer', padding: '2px' }}
                            title="Editar unidade"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(d.id, d.sigla)}
                            disabled={isSubmitting}
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: isSubmitting ? 'not-allowed' : 'pointer', padding: '2px' }}
                            title="Inativar ou excluir unidade"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {departments.length === 0 && !isDepartmentsLoading && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                        Nenhuma unidade interna cadastrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Rodapé */}
        <div style={{
          padding: '0.85rem 1.5rem',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'flex-end',
          background: '#f8fafc'
        }}>
          <AppButton type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Fechar
          </AppButton>
        </div>

      </div>
    </div>
  );
};
