import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../design-system/components/PageHeader';
import { AppButton } from '../../design-system/components/AppButton';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Loader2, 
  Building2, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles 
} from 'lucide-react';
import { useDepartments } from '../../hooks/useDepartments';
import { useSaveDepartment } from '../../hooks/useSaveDepartment';
import { useDeleteDepartment } from '../../hooks/useDeleteDepartment';
import { useMergeDepartment } from '../../hooks/useMergeDepartment';
import { fetchAllAllocationsGlobal } from '../../services/allocationService';
import type { InternalDepartment } from '../../services/unitService';

export const DepartmentsManagementPage: React.FC = () => {
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
    detectLegacyAllocations(departments);
  }, [departments]);

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

      // Prepara sugestões padrão de mesclagem
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
      console.warn('Erro ao verificar alocações com siglas legadas:', e);
    }
  };

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
      setError('O nome completo da unidade / diretoria é obrigatório.');
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
      setSigla('');
      setNomeCompleto('');
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar unidade.');
    }
  };

  const handleEdit = (d: any) => {
    setEditingId(d.id);
    setSigla(d.sigla);
    setNomeCompleto(d.nomeCompleto);
    setError(null);
    setSuccessMsg(null);
  };

  const handleDelete = async (id: string, siglaDel: string) => {
    if (!window.confirm(`Tem certeza que deseja inativar/excluir a unidade ${siglaDel}?`)) {
      return;
    }

    setError(null);
    setSuccessMsg(null);

    try {
      const res = await deleteMutation.mutateAsync({ id, forceDeactivate: false });
      if (res.deleted) {
        setSuccessMsg(`Unidade "${siglaDel}" excluída com sucesso.`);
      } else if (res.deactivated) {
        setSuccessMsg(`Unidade "${siglaDel}" desativada com sucesso.`);
      }
    } catch (err: any) {
      if (err.code === 'CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS' || err.sqlState === '23503') {
        const confirmDeactivate = window.confirm(
          `A unidade "${siglaDel}" possui alocações contábeis vinculadas e não pode ser excluída fisicamente.\n\nDeseja desativá-la para que não apareça em novas alocações, mantendo o histórico contábil intacto?`
        );
        if (confirmDeactivate) {
          try {
            await deleteMutation.mutateAsync({ id, forceDeactivate: true });
            setSuccessMsg(`Unidade "${siglaDel}" desativada com sucesso.`);
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
    } catch (err: any) {
      setError(err.message || 'Erro ao mesclar registros da unidade.');
    }
  };

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader 
        title="Unidades Internas" 
        subtitle="Gerencie as diretorias, coordenações-gerais e coordenações oficiais da SENASP para controle de cotas"
        icon={<Building2 size={26} color="#0c326f" aria-hidden="true" />}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Alertas de Feedback */}
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

        {/* Seção de Higienização de Nomes Legados / Typos */}
        {legacyNames.length > 0 && (
          <div style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '8px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#92400e', fontWeight: 700, fontSize: '0.9rem' }}>
              <Sparkles size={18} /> Higienização de Registros Antigos / Nomes Digitados Incorretamente
            </div>
            <p style={{ fontSize: '0.82rem', color: '#78350f', margin: 0 }}>
              Existem registros de alocações antigas vinculados a siglas não catalogadas oficialmente. Unifique-os com a unidade oficial correspondente:
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {legacyNames.map((name) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid #fef3c7', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#dc2626' }}>
                    "{name}"
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>mesclar para:</span>
                    <select
                      value={mergeTargets[name] || ''}
                      onChange={(e) => setMergeTargets({ ...mergeTargets, [name]: e.target.value })}
                      disabled={isSubmitting}
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 600 }}
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
          </div>
        )}

        {/* Formulário de Cadastro / Edição */}
        <form onSubmit={handleSave} style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0c326f' }}>
            {editingId ? '✏️ Editar Unidade Oficial' : '+ Cadastrar Nova Unidade Oficial'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                Sigla / Código *
              </label>
              <input
                type="text"
                placeholder="Ex: DFNSP"
                value={sigla}
                onChange={(e) => setSigla(e.target.value.toUpperCase())}
                disabled={isSubmitting}
                required
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
                Nome Completo / Diretoria *
              </label>
              <input
                type="text"
                placeholder="Ex: Diretoria da Força Nacional de Segurança Pública"
                value={nomeCompleto}
                onChange={(e) => setNomeCompleto(e.target.value)}
                disabled={isSubmitting}
                required
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
            {editingId && (
              <AppButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setEditingId(null); setSigla(''); setNomeCompleto(''); }}
                disabled={isSubmitting}
                icon={<X size={14} />}
              >
                Cancelar
              </AppButton>
            )}
            <AppButton
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              isLoading={saveMutation.isPending}
              icon={editingId ? <Check size={14} /> : <Plus size={14} />}
            >
              {editingId ? 'Salvar Alterações' : 'Adicionar Unidade'}
            </AppButton>
          </div>
        </form>

        {/* Tabela de Unidades Cadastradas */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#ffffff', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
          <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
              Unidades e Departamentos Oficiais ({departments.length})
            </span>
            {isDepartmentsLoading && (
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Loader2 size={12} className="animate-spin" /> Carregando...
              </span>
            )}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.78rem', fontWeight: 700, textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem', width: '150px' }}>Sigla</th>
                <th style={{ padding: '0.75rem 1rem' }}>Nome Completo / Diretoria</th>
                <th style={{ padding: '0.75rem 1rem', width: '120px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d: any) => (
                <tr
                  key={d.id}
                  style={{ borderBottom: '1px solid #f1f5f9', opacity: d.ativo ? 1 : 0.6, transition: 'background 0.15s ease' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: d.ativo ? '#0c326f' : '#64748b' }}>
                    {d.sigla} {!d.ativo && <span style={{ fontSize: '0.7rem', color: '#dc2626' }}>(Inativa)</span>}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                    {d.nomeCompleto}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button 
                        type="button" 
                        onClick={() => handleEdit(d)} 
                        disabled={isSubmitting} 
                        title="Editar unidade" 
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0ea5e9' }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleDelete(d.id, d.sigla)} 
                        disabled={isSubmitting} 
                        title="Excluir ou inativar unidade" 
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {departments.length === 0 && !isDepartmentsLoading && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                    Nenhuma unidade cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
