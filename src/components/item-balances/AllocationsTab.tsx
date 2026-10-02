import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Edit2, Plus, Trash2 } from 'lucide-react';
import {
  AlertCard,
  AppButton,
  DataTable,
  EmptyState,
  Modal,
  NoticeBar,
  ProgressBar,
  SectionHeader,
  SummaryBar,
  type Column
} from '../../design-system';
import { formatNumber } from './itemBalanceUtils';
import type { InternalDepartment } from '../../services/unitService';

export interface AllocationRow {
  id: string;
  unitName: string;
  allocatedQty: number;
  empenhado: number;
  pendentes: number;
  pendentesSugerido: number;
}

interface AllocationsTabProps {
  /** UASG gerenciadora do item (de onde vem o quantitativo a alocar). */
  ugUasg: string;
  totalUG: number;
  totalAllocated: number;
  remaining: number;
  percentAllocated: number;
  rows: AllocationRow[];
  semUnidade: { empenhado: number; count: number };

  departments: InternalDepartment[];
  departmentsLoading: boolean;
  canManage: boolean;

  editingId: string | null;
  unitName: string;
  onUnitChange: (sigla: string) => void;
  qty: number | '';
  onQtyChange: (qty: number | '') => void;
  /** Valida e grava; resolve verdadeiro quando gravou (a janela fecha só nesse caso). */
  onSubmit: () => Promise<boolean>;
  /** Prepara o formulário para uma nova alocação (limpa edição, quantidade e erro). */
  onStartNew: () => void;
  /** Descarta a edição em andamento. */
  onCancelEdit: () => void;
  saving: boolean;
  error: string | null;

  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onGoToContracts: () => void;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Explica, dentro da janela, por que não há unidade disponível para alocar (e como resolver). */
export const AllocationUnavailableNotice: React.FC<{ catalogEmpty: boolean }> = ({ catalogEmpty }) => (
  <div data-testid="allocation-unavailable" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem', color: '#334155' }}>
    <p style={{ margin: 0 }}>
      {catalogEmpty
        ? 'O catálogo de Unidades Internas está vazio. Cadastre as unidades para poder alocar quantitativo.'
        : 'Todas as unidades do catálogo já têm alocação neste item. Para alocar a outra unidade, cadastre-a em Unidades Internas; para mudar a quantidade de uma já alocada, use o lápis na tabela.'}
    </p>
    <Link to="/admin/departamentos" style={{ fontWeight: 700, color: '#0c326f', textDecoration: 'none' }}>
      Abrir Unidades Internas
    </Link>
  </div>
);

export const AllocationsTab: React.FC<AllocationsTabProps> = ({
  ugUasg,
  totalUG,
  totalAllocated,
  remaining,
  percentAllocated,
  rows,
  semUnidade,
  departments,
  departmentsLoading,
  canManage,
  editingId,
  unitName,
  onUnitChange,
  qty,
  onQtyChange,
  onSubmit,
  onStartNew,
  onCancelEdit,
  saving,
  error,
  onEdit,
  onDelete,
  onGoToContracts
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  const allocatedNames = new Set(rows.filter((r) => r.id !== editingId).map((r) => norm(r.unitName)));
  const allUnitsAllocated = departments.length > 0 && departments.every((d) => allocatedNames.has(norm(d.sigla)));
  const catalogoVazio = !departmentsLoading && departments.length === 0;
  const semUnidadeDisponivel = catalogoVazio || (allUnitsAllocated && !editingId);
  const editingRow = editingId ? rows.find((r) => r.id === editingId) : undefined;
  const disponivelParaAlocar = remaining + (editingRow?.allocatedQty ?? 0);

  const openNew = () => {
    onStartNew();
    setModalOpen(true);
  };
  const openEdit = (id: string) => {
    onEdit(id);
    setModalOpen(true);
  };
  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    onCancelEdit();
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await onSubmit()) setModalOpen(false);
  };

  const columns: Column<AllocationRow>[] = [
    {
      key: 'unidade',
      header: 'Unidade interna',
      render: (r) => <span style={{ fontWeight: 700 }}>{r.unitName}</span>
    },
    {
      key: 'alocado',
      header: 'Alocado',
      align: 'right',
      render: (r) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatNumber(r.allocatedQty)}</span>
    },
    {
      key: 'empenhado',
      header: 'Empenhado',
      align: 'right',
      render: (r) => (
        <>
          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatNumber(r.empenhado)}</span>
          {r.pendentes > 0 && (
            <div style={{ fontSize: '0.7rem', color: 'var(--warning)' }} title="Empenhos vinculados à unidade sem quantidade confirmada; não entram no empenhado">
              {r.pendentes} {r.pendentes === 1 ? 'pendente' : 'pendentes'}
            </div>
          )}
        </>
      )
    },
    {
      key: 'aEmpenhar',
      header: 'A empenhar',
      align: 'right',
      render: (r) => {
        const balance = r.allocatedQty - r.empenhado;
        return (
          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: balance < 0 ? 'var(--danger)' : 'var(--success)' }}>
            {formatNumber(balance)}
          </span>
        );
      }
    },
    {
      key: 'consumo',
      header: 'Consumo',
      width: '180px',
      render: (r) => {
        const percent = r.allocatedQty > 0 ? (r.empenhado / r.allocatedQty) * 100 : 0;
        return <ProgressBar value={percent} height="6px" testId={`consumo-${r.id}`} />;
      }
    },
    ...(canManage
      ? [
          {
            key: 'acoes',
            header: 'Ações',
            align: 'center' as const,
            width: '110px',
            render: (r: AllocationRow) => (
              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                <AppButton variant="outline" size="sm" iconOnly icon={<Edit2 size={14} />} onClick={() => openEdit(r.id)} disabled={saving} title={`Editar a alocação de ${r.unitName}`} />
                <AppButton variant="ghostDanger" size="sm" iconOnly icon={<Trash2 size={14} />} onClick={() => onDelete(r.id)} disabled={saving} title={`Excluir a alocação de ${r.unitName}`} />
              </div>
            )
          }
        ]
      : [])
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} data-testid="allocations-tab">
      <SummaryBar
        testId="allocations-summary"
        items={[
          { label: 'Alocado', value: `${formatNumber(totalAllocated)} de ${formatNumber(totalUG)} (${formatNumber(percentAllocated)}%)` },
          { label: 'A alocar', value: formatNumber(remaining), tone: remaining < 0 ? 'danger' : 'default' }
        ]}
        progress={{ value: totalAllocated, max: totalUG }}
      >
        {semUnidade.count > 0 && (
          <NoticeBar
            testId="empenhos-sem-unidade"
            action={
              <AppButton variant="outline" size="sm" onClick={onGoToContracts}>
                Vincular em Contratos e empenhos
              </AppButton>
            }
          >
            <strong>{semUnidade.count}</strong> {semUnidade.count === 1 ? 'empenho confirmado' : 'empenhos confirmados'} ({formatNumber(semUnidade.empenhado)} un)
            ainda sem unidade interna. Não entram no empenhado das unidades até serem vinculados.
          </NoticeBar>
        )}
      </SummaryBar>

      {error && !modalOpen && <AlertCard severity="CRITICA" title={error} testId="allocation-error" />}

      {canManage && catalogoVazio && (
        <EmptyState
          title="Nenhuma unidade interna cadastrada"
          description="As alocações usam as unidades do catálogo oficial de Unidades Internas, que ainda está vazio. Cadastre as unidades para poder alocar."
          icon={<Building2 size={32} color="#94a3b8" />}
          action={<Link to="/admin/departamentos" className="btn btn-secondary">Abrir Unidades Internas</Link>}
        />
      )}

      <div>
        <SectionHeader
          title="Alocações"
          subtitle={`Quantitativo da UG ${ugUasg} distribuído às unidades internas.`}
          icon={<Building2 size={16} />}
          countBadge={rows.length}
          actions={
            canManage ? (
              <AppButton
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={openNew}
                disabled={departmentsLoading}
                title="Alocar quantitativo a uma unidade interna"
              >
                Alocar
              </AppButton>
            ) : undefined
          }
        />
        {rows.length === 0 ? (
          <EmptyState
            title="Nenhuma alocação interna neste item"
            description={canManage ? 'Use o botão Alocar para distribuir o quantitativo às unidades internas.' : 'Ainda não há quantitativo alocado às unidades internas.'}
          />
        ) : (
          <DataTable columns={columns} data={rows} keyExtractor={(r) => r.id} testId="allocations-table" />
        )}
      </div>

      {canManage && (
        <Modal
          isOpen={modalOpen}
          onClose={closeModal}
          title={editingId ? 'Editar alocação' : 'Alocar quantitativo'}
          subtitle={`UG ${ugUasg} • disponível para alocar: ${formatNumber(disponivelParaAlocar)} un`}
          size="md"
          dismissible={!saving}
          testId="allocation-modal"
          footer={
            <>
              <AppButton type="button" variant="outline" size="sm" onClick={closeModal} disabled={saving}>
                {semUnidadeDisponivel ? 'Fechar' : 'Cancelar'}
              </AppButton>
              {!semUnidadeDisponivel && (
                <AppButton type="submit" form="allocation-form" variant="primary" size="sm" isLoading={saving} disabled={saving}>
                  {editingId ? 'Salvar' : 'Alocar'}
                </AppButton>
              )}
            </>
          }
        >
          {semUnidadeDisponivel ? (
            <AllocationUnavailableNotice catalogEmpty={catalogoVazio} />
          ) : (
          <form id="allocation-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && <AlertCard severity="CRITICA" title={error} testId="allocation-modal-error" />}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
              Unidade interna
              <select
                className="form-input"
                value={unitName}
                onChange={(e) => onUnitChange(e.target.value)}
                required
                style={{ fontWeight: 700, color: '#0c326f', fontSize: '0.85rem', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%' }}
              >
                {departments.map((d) => {
                  const isAllocated = allocatedNames.has(norm(d.sigla));
                  return (
                    <option key={d.id} value={d.sigla} disabled={isAllocated}>
                      {d.sigla} — {d.nomeCompleto}{isAllocated ? ' (já alocada)' : ''}
                    </option>
                  );
                })}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
              Quantidade
              <input
                type="number"
                className="form-input"
                min="1"
                max={Math.max(disponivelParaAlocar, 1)}
                placeholder="Ex: 50"
                value={qty}
                onChange={(e) => onQtyChange(e.target.value === '' ? '' : Number(e.target.value))}
                required
                style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%' }}
              />
            </label>
            <Link to="/admin/departamentos" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0c326f', textDecoration: 'none' }}>
              Gerenciar Unidades Internas
            </Link>
          </form>
          )}
        </Modal>
      )}
    </div>
  );
};
