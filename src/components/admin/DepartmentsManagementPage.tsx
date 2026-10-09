import React, { useState, useEffect, useMemo } from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { FilterBar } from '../../design-system/components/FilterBar';
import { Modal } from '../../design-system/components/Modal';
import { AppInput, AppSelect } from '../../design-system/components/FormFields';
import { AdminListShell } from './shared/AdminListShell';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { useConfirm } from '../../design-system/components/ConfirmDialog';
import { useToast } from '../../design-system/components/Toast';
import { useAuth } from '../../context/AuthContext';
import { DataTable } from '../../design-system/components/DataTable';
import { Building2, Sparkles } from 'lucide-react';
import { useDepartments } from '../../hooks/useDepartments';
import { useSaveDepartment } from '../../hooks/useSaveDepartment';
import { useDeleteDepartment } from '../../hooks/useDeleteDepartment';
import { useMergeDepartment } from '../../hooks/useMergeDepartment';
import { useUnidadesEmUso } from '../../hooks/useUnidadesEmUso';
import { fetchAllAllocationsGlobal } from '../../services/allocationService';
import type { InternalDepartment } from '../../services/unitService';

export const DepartmentsManagementPage: React.FC = () => {
  const { data: departments = [], isLoading: isDepartmentsLoading, isError: isDepartmentsError, error: departmentsError, refetch } = useDepartments();
  const saveMutation = useSaveDepartment();
  const deleteMutation = useDeleteDepartment();
  const mergeMutation = useMergeDepartment();
  // Em uso só se desativa; sem uso pode ser excluída (migration 108). Sem a lista, a exclusão tenta e o banco decide.
  const { data: emUso, refetch: refetchEmUso } = useUnidadesEmUso();

  const [sigla, setSigla] = useState('');
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  // Editar não muda a situação nem a descrição (o salvar grava os dois).
  const [editing, setEditing] = useState<InternalDepartment | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todas' | 'ativas' | 'inativas'>('todas');
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
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
        descricao: editing?.descricao || undefined,
        ativo: editing ? editing.ativo : true
      });

      toast.success(editingId ? `Unidade "${cleanSigla}" atualizada com sucesso.` : `Unidade "${cleanSigla}" cadastrada com sucesso.`);
      closeModal();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar unidade.');
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setEditing(null);
    setSigla('');
    setNomeCompleto('');
  };

  const handleNew = () => {
    setEditingId(null);
    setEditing(null);
    setSigla('');
    setNomeCompleto('');
    setIsModalOpen(true);
  };

  const handleEdit = (d: InternalDepartment) => {
    setEditingId(d.id);
    setEditing(d);
    setSigla(d.sigla);
    setNomeCompleto(d.nomeCompleto);
    setIsModalOpen(true);
  };

  const desativar = async (d: InternalDepartment) => {
    const ok = await confirm({
      title: `Desativar a unidade ${d.sigla}?`,
      message: `A unidade ${d.sigla} está em uso, por isso não pode ser excluída. Desativada, ela deixa de aparecer para novas alocações. As alocações que já existem e o histórico continuam iguais, e você pode reativá-la quando quiser.`,
      confirmLabel: 'Desativar'
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync({ id: d.id, forceDeactivate: true });
      toast.success(`Unidade "${d.sigla}" desativada.`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao desativar a unidade.');
    }
  };

  const excluir = async (d: InternalDepartment) => {
    const ok = await confirm({
      title: `Excluir a unidade ${d.sigla}?`,
      message: `A unidade ${d.sigla} não está em uso. Ela será apagada do cadastro, e essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync({ id: d.id, forceDeactivate: false });
      toast.success(`Unidade "${d.sigla}" excluída.`);
    } catch (err: any) {
      // Passou a ter uso depois que a tela carregou: o banco recusa e a tela oferece desativar.
      if (err.code === 'CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS') {
        toast.error(err.message);
        await refetchEmUso();
      } else {
        toast.error(err.message || 'Erro ao excluir a unidade.');
      }
    }
  };

  const reativar = async (d: InternalDepartment) => {
    const ok = await confirm({
      title: `Reativar a unidade ${d.sigla}?`,
      message: `A unidade ${d.sigla} volta a aparecer para novas alocações.`,
      confirmLabel: 'Reativar'
    });
    if (!ok) return;
    try {
      await saveMutation.mutateAsync({ id: d.id, sigla: d.sigla, nomeCompleto: d.nomeCompleto, descricao: d.descricao || undefined, ativo: true });
      toast.success(`Unidade "${d.sigla}" reativada.`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao reativar a unidade.');
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return departments.filter((d) => {
      if (statusFilter === 'ativas' && !d.ativo) return false;
      if (statusFilter === 'inativas' && d.ativo) return false;
      return !term || d.sigla.toLowerCase().includes(term) || d.nomeCompleto.toLowerCase().includes(term);
    });
  }, [departments, search, statusFilter]);
  const hasActiveFilters = Boolean(search) || statusFilter !== 'todas';

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Unidades Internas"
        subtitle="Diretorias, coordenações-gerais e coordenações oficiais da SENASP usadas no controle de cotas."
        icon={<Building2 size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          canManage ? (
            <ActionButton action="novo" label="Nova unidade" onClick={handleNew} data-testid="departments-new" />
          ) : undefined
        }
      />

      {/* Higienização de nomes legados / digitados incorretamente */}
      {canManage && legacyNames.length > 0 && (
        <div
          data-testid="departments-legacy-panel"
          style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-warning-text-strong)', fontWeight: 700, fontSize: '0.9rem' }}>
            <Sparkles size={18} /> Registros antigos ou com nome digitado incorretamente
          </div>
          <p style={{ fontSize: '0.82rem', color: '#78350f', margin: 0 }}>
            Há alocações antigas ligadas a siglas que não estão no catálogo oficial. Unifique-as com a unidade correta.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {legacyNames.map((name) => (
              <div
                key={name}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', background: '#ffffff', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid var(--color-warning-border)' }}
              >
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-danger)' }}>"{name}"</span>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <AppSelect
                    label="Mesclar para"
                    value={mergeTargets[name] || ''}
                    onChange={(e) => setMergeTargets({ ...mergeTargets, [name]: e.target.value })}
                    disabled={isSubmitting}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.sigla}>{d.sigla} - {d.nomeCompleto}</option>
                    ))}
                  </AppSelect>
                  <AppButton type="button" onClick={() => handleMerge(name)} disabled={isSubmitting} isLoading={mergeMutation.isPending}>
                    Mesclar
                  </AppButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <FilterBar
        testId="departments-filter-bar"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por sigla ou nome..."
        chips={[
          { id: 'todas', label: 'Todas', active: statusFilter === 'todas', onClick: () => setStatusFilter('todas') },
          { id: 'ativas', label: 'Ativas', active: statusFilter === 'ativas', onClick: () => setStatusFilter('ativas') },
          { id: 'inativas', label: 'Inativas', active: statusFilter === 'inativas', onClick: () => setStatusFilter('inativas') }
        ]}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={() => {
          setSearch('');
          setStatusFilter('todas');
        }}
      />

      <AdminListShell
        testId="departments-table-container"
        title="Unidades e departamentos oficiais"
        countLabel={filtered.length === departments.length ? String(departments.length) : `${filtered.length} de ${departments.length}`}
        isLoading={isDepartmentsLoading}
        isError={isDepartmentsError}
        errorTitle="Não foi possível carregar as unidades internas"
        errorMessage={(departmentsError as Error | null)?.message || 'Falha ao consultar o catálogo de unidades internas.'}
        onRetry={() => refetch()}
        isEmpty={filtered.length === 0}
        emptyTitle={departments.length === 0 ? 'Nenhuma unidade cadastrada.' : 'Nenhuma unidade encontrada.'}
        emptyDescription={
          departments.length === 0
            ? 'As alocações internas só aceitam unidades deste catálogo.'
            : 'Ajuste a busca ou os filtros.'
        }
      >
        <DataTable<InternalDepartment>
          testId="departments-table"
          className="data-table-container--flush"
          data={filtered}
          keyExtractor={(d) => String(d.id)}
          rowStyle={(d) => (d.ativo ? undefined : { opacity: 0.7 })}
          columns={[
            {
              key: 'sigla',
              header: 'Sigla',
              sortValue: (d) => d.sigla,
              width: '180px',
              priority: 'primary',
              render: (d) => <span style={{ fontWeight: 700, color: d.ativo ? 'var(--primary)' : '#64748b' }}>{d.sigla}</span>
            },
            { key: 'nomeCompleto', header: 'Nome completo / Diretoria', mobileLabel: 'Nome', sortValue: (d) => d.nomeCompleto, render: (d) => d.nomeCompleto },
            {
              key: 'situacao',
              header: 'Situação',
              width: '140px',
              sortValue: (d) => (d.ativo ? 'Ativa' : 'Inativa'),
              render: (d) => <StatusBadge label={d.ativo ? 'Ativa' : 'Inativa'} variant={d.ativo ? 'success' : 'neutral'} size="sm" dot={false} />
            }
          ]}
          rowActions={
            canManage
              ? (d) => {
                  // Sem a lista de uso (carregando ou erro), mostra Excluir e o banco recusa se estiver em uso.
                  const emUsoAgora = emUso?.has(d.sigla) ?? false;
                  return (
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      <ActionButton action="editar" iconOnly label={`Editar ${d.sigla}`} onClick={() => handleEdit(d)} disabled={isSubmitting} />
                      {!d.ativo && (
                        <ActionButton action="reativarCadastro" iconOnly label={`Reativar ${d.sigla}`} onClick={() => void reativar(d)} disabled={isSubmitting} data-testid={`departments-reativar-${d.sigla}`} />
                      )}
                      {!emUsoAgora ? (
                        <ActionButton action="excluir" iconOnly label={`Excluir ${d.sigla} (não está em uso)`} onClick={() => void excluir(d)} disabled={isSubmitting} data-testid={`departments-excluir-${d.sigla}`} />
                      ) : (
                        d.ativo && (
                          <ActionButton
                            action="desativarCadastro"
                            iconOnly
                            label={`Desativar ${d.sigla} (está em uso, não pode ser excluída)`}
                            onClick={() => void desativar(d)}
                            disabled={isSubmitting}
                            data-testid={`departments-desativar-${d.sigla}`}
                          />
                        )
                      )}
                    </div>
                  );
                }
              : undefined
          }
        />
      </AdminListShell>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        dismissible={!isSubmitting}
        size="sm"
        testId="departments-modal"
        title={editingId ? 'Editar unidade oficial' : 'Nova unidade oficial'}
        footer={
          <>
            <ActionButton action="cancelar" type="button" onClick={closeModal} disabled={isSubmitting} />
            <AppButton type="submit" form="departments-form" disabled={isSubmitting} isLoading={saveMutation.isPending}>
              {editingId ? 'Salvar alterações' : 'Adicionar unidade'}
            </AppButton>
          </>
        }
      >
        <form id="departments-form" onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <AppInput
            label="Sigla / Código *"
            placeholder="Ex: DFNSP"
            value={sigla}
            onChange={(e) => setSigla(e.target.value.toUpperCase())}
            disabled={isSubmitting}
            required
          />
          <AppInput
            label="Nome completo / Diretoria *"
            placeholder="Ex: Diretoria da Força Nacional de Segurança Pública"
            value={nomeCompleto}
            onChange={(e) => setNomeCompleto(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </form>
      </Modal>
      {dialog}
    </PageContainer>
  );
};
