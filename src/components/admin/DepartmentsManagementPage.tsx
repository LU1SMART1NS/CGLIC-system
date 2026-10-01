import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../design-system/components/PageHeader';
import { AppButton } from '../../design-system/components/AppButton';
import { EmptyState } from '../../design-system/components/EmptyState';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { useConfirm } from '../../design-system/components/ConfirmDialog';
import { useToast } from '../../design-system/components/Toast';
import { useAuth } from '../../context/AuthContext';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { Plus, Trash2, Edit2, Check, X, Building2, ArrowLeft, Sparkles } from 'lucide-react';
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
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const navigate = useNavigate();
  // Mesma regra do backend (departments.manage): admin e gestor de saldos editam; os demais consultam.
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'gestor_saldos';

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
    const cleanSigla = sigla.trim().toUpperCase();
    const cleanNome = nomeCompleto.trim();

    if (!cleanSigla) {
      toast.error('A sigla da unidade é obrigatória (Ex: DFNSP).');
      return;
    }

    if (!cleanNome) {
      toast.error('O nome completo da unidade / diretoria é obrigatório.');
      return;
    }

    try {
      await saveMutation.mutateAsync({
        id: editingId || undefined,
        sigla: cleanSigla,
        nomeCompleto: cleanNome,
        ativo: true
      });

      toast.success(editingId ? `Unidade "${cleanSigla}" atualizada com sucesso.` : `Unidade "${cleanSigla}" cadastrada com sucesso.`);
      setSigla('');
      setNomeCompleto('');
      setEditingId(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar unidade.');
    }
  };

  const handleEdit = (d: any) => {
    setEditingId(d.id);
    setSigla(d.sigla);
    setNomeCompleto(d.nomeCompleto);
  };

  const handleDelete = async (id: string, siglaDel: string) => {
    const ok = await confirm({
      title: 'Excluir unidade',
      message: `Tem certeza que deseja inativar/excluir a unidade ${siglaDel}?`,
      confirmLabel: 'Excluir',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      const res = await deleteMutation.mutateAsync({ id, forceDeactivate: false });
      if (res.deleted) {
        toast.success(`Unidade "${siglaDel}" excluída com sucesso.`);
      } else if (res.deactivated) {
        toast.success(`Unidade "${siglaDel}" desativada com sucesso.`);
      }
    } catch (err: any) {
      if (err.code === 'CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS' || err.sqlState === '23503') {
        const confirmDeactivate = await confirm({
          title: 'Desativar unidade',
          message: `A unidade "${siglaDel}" possui alocações contábeis vinculadas e não pode ser excluída fisicamente. Deseja desativá-la para que não apareça em novas alocações, mantendo o histórico contábil intacto?`,
          confirmLabel: 'Desativar'
        });
        if (confirmDeactivate) {
          try {
            await deleteMutation.mutateAsync({ id, forceDeactivate: true });
            toast.success(`Unidade "${siglaDel}" desativada com sucesso.`);
          } catch (deactErr: any) {
            toast.error(deactErr.message || 'Erro ao desativar unidade.');
          }
        }
      } else {
        toast.error(err.message || 'Erro ao excluir unidade.');
      }
    }
  };

  const handleMerge = async (oldName: string) => {
    const targetSigla = mergeTargets[oldName];
    if (!targetSigla) return;

    try {
      const res = await mergeMutation.mutateAsync({ oldName, targetSigla });
      toast.success(`${res.rows_updated} registro(s) com "${oldName}" foram unificados em "${targetSigla}".`);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao mesclar registros da unidade.');
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontSize: '0.82rem',
    padding: '0.45rem 0.75rem',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    background: '#f8fafc',
    color: '#0f172a',
    outline: 'none'
  };

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Unidades Internas"
        subtitle="Diretorias, coordenações-gerais e coordenações oficiais da SENASP usadas no controle de cotas."
        icon={<Building2 size={26} color="#0c326f" aria-hidden="true" />}
        actions={
          <AppButton variant="outline" icon={<ArrowLeft size={14} />} onClick={() => navigate('/atas/saldos-unidade')}>
            Voltar para Alocações
          </AppButton>
        }
      />

      {/* Higienização de nomes legados / digitados incorretamente */}
      {canManage && legacyNames.length > 0 && (
        <div
          data-testid="departments-legacy-panel"
          style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#92400e', fontWeight: 700, fontSize: '0.9rem' }}>
            <Sparkles size={18} /> Registros antigos ou com nome digitado incorretamente
          </div>
          <p style={{ fontSize: '0.82rem', color: '#78350f', margin: 0 }}>
            Há alocações antigas ligadas a siglas que não estão no catálogo oficial. Unifique-as com a unidade correta.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {legacyNames.map((name) => (
              <div
                key={name}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', background: '#ffffff', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid #fde68a' }}
              >
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#dc2626' }}>"{name}"</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>mesclar para:</span>
                  <select
                    value={mergeTargets[name] || ''}
                    onChange={(e) => setMergeTargets({ ...mergeTargets, [name]: e.target.value })}
                    disabled={isSubmitting}
                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 600 }}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.sigla}>{d.sigla} - {d.nomeCompleto}</option>
                    ))}
                  </select>
                  <AppButton type="button" size="sm" onClick={() => handleMerge(name)} disabled={isSubmitting} isLoading={mergeMutation.isPending}>
                    Mesclar
                  </AppButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cadastro / edição (somente quem pode gerir) */}
      {canManage && (
        <form
          onSubmit={handleSave}
          style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0c326f' }}>
            {editingId ? 'Editar unidade oficial' : 'Cadastrar nova unidade oficial'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>Sigla / Código *</label>
              <input type="text" placeholder="Ex: DFNSP" value={sigla} onChange={(e) => setSigla(e.target.value.toUpperCase())} disabled={isSubmitting} required style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>Nome completo / Diretoria *</label>
              <input type="text" placeholder="Ex: Diretoria da Força Nacional de Segurança Pública" value={nomeCompleto} onChange={(e) => setNomeCompleto(e.target.value)} disabled={isSubmitting} required style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem' }}>
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
            <AppButton type="submit" size="sm" disabled={isSubmitting} isLoading={saveMutation.isPending} icon={editingId ? <Check size={14} /> : <Plus size={14} />}>
              {editingId ? 'Salvar alterações' : 'Adicionar unidade'}
            </AppButton>
          </div>
        </form>
      )}

      {/* Unidades cadastradas */}
      <div data-testid="departments-table-container" style={carteiraTableShell}>
        <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
          Unidades e departamentos oficiais ({departments.length})
        </div>
        {departments.length === 0 && !isDepartmentsLoading ? (
          <EmptyState title="Nenhuma unidade cadastrada." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...carteiraTh, width: '180px' }}>Sigla</th>
                <th style={carteiraTh}>Nome completo / Diretoria</th>
                {canManage && <th style={{ ...carteiraTh, width: '120px', textAlign: 'right' }}>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {departments.map((d: any) => (
                <tr key={d.id} style={{ opacity: d.ativo ? 1 : 0.7 }}>
                  <td style={{ ...carteiraTd, fontWeight: 700, color: d.ativo ? '#0c326f' : '#64748b' }}>
                    {d.sigla} {!d.ativo && <StatusBadge label="Inativa" variant="danger" size="sm" dot={false} />}
                  </td>
                  <td style={carteiraTd}>{d.nomeCompleto}</td>
                  {canManage && (
                    <td style={{ ...carteiraTd, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => handleEdit(d)} disabled={isSubmitting} title="Editar unidade" aria-label={`Editar ${d.sigla}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0ea5e9' }}>
                          <Edit2 size={16} />
                        </button>
                        <button type="button" onClick={() => handleDelete(d.id, d.sigla)} disabled={isSubmitting} title="Excluir ou inativar unidade" aria-label={`Excluir ${d.sigla}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {dialog}
    </div>
  );
};
