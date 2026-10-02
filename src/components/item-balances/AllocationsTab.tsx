import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Check, Edit2, ExternalLink, Plus, Trash2 } from 'lucide-react';
import {
  AlertCard,
  AppButton,
  AppCard,
  DataTable,
  EmptyState,
  ProgressBar,
  SectionHeader,
  StatusBadge,
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
  onSubmit: (e: React.FormEvent) => void;
  onCancelEdit: () => void;
  saving: boolean;
  error: string | null;

  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onGoToContracts: () => void;
}

const norm = (s: string) => s.trim().toLowerCase();

const Item: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone }) => (
  <span>
    {label} <strong style={{ color: tone }}>{value}</strong> <span style={{ color: 'var(--text-muted)' }}>un</span>
  </span>
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
  onCancelEdit,
  saving,
  error,
  onEdit,
  onDelete,
  onGoToContracts
}) => {
  const allocatedNames = new Set(rows.filter((r) => r.id !== editingId).map((r) => norm(r.unitName)));
  const allUnitsAllocated = departments.length > 0 && departments.every((d) => allocatedNames.has(norm(d.sigla)));
  const catalogoVazio = !departmentsLoading && departments.length === 0;

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
                <AppButton variant="outline" size="sm" iconOnly icon={<Edit2 size={14} />} onClick={() => onEdit(r.id)} disabled={saving} title={`Editar a alocação de ${r.unitName}`} />
                <AppButton variant="ghostDanger" size="sm" iconOnly icon={<Trash2 size={14} />} onClick={() => onDelete(r.id)} disabled={saving} title={`Excluir a alocação de ${r.unitName}`} />
              </div>
            )
          }
        ]
      : [])
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 1rem' }} data-testid="allocations-tab">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem', fontSize: '0.9rem' }} data-testid="allocations-summary">
          <Item label={`Disponível da UG ${ugUasg}`} value={formatNumber(totalUG)} />
          <Item label="Alocado" value={`${formatNumber(totalAllocated)} (${formatNumber(percentAllocated)}%)`} />
          <Item label="A alocar" value={formatNumber(remaining)} tone={remaining < 0 ? 'var(--danger)' : undefined} />
        </div>
        <ProgressBar value={percentAllocated} showPercent={false} height="6px" colorScheme="success" testId="allocations-progress" />
      </div>

      {error && <AlertCard severity="CRITICA" title={error} testId="allocation-error" />}

      {canManage && catalogoVazio && (
        <EmptyState
          title="Nenhuma unidade interna cadastrada"
          description="As alocações usam as unidades do catálogo oficial de Unidades Internas, que ainda está vazio. Cadastre as unidades para poder alocar."
          icon={<Building2 size={32} color="#94a3b8" />}
          action={<Link to="/admin/departamentos" className="btn btn-secondary">Abrir Unidades Internas</Link>}
        />
      )}

      {canManage && departments.length > 0 && (
        <AppCard padding="lg" variant="subtle">
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.9rem', color: '#0c326f' }}>
                {editingId ? <Edit2 size={15} /> : <Plus size={15} />}
                {editingId ? 'Editar alocação' : 'Alocar quantitativo'}
              </span>
              <Link to="/admin/departamentos" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0c326f', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }} title="Abrir a gestão de Unidades Internas em nova aba">
                Unidades Internas <ExternalLink size={11} />
              </Link>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ flex: '2 1 280px', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                Unidade
                <select
                  className="form-input"
                  value={unitName}
                  onChange={(e) => onUnitChange(e.target.value)}
                  required
                  style={{ fontWeight: 700, color: '#0c326f', fontSize: '0.82rem', padding: '0.45rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%' }}
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
              <label style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                Quantidade
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  placeholder="Ex: 50"
                  value={qty}
                  onChange={(e) => onQtyChange(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', width: '100%' }}
                />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {editingId && (
                  <AppButton type="button" variant="outline" size="sm" onClick={onCancelEdit} disabled={saving}>
                    Cancelar
                  </AppButton>
                )}
                <AppButton
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon={saving ? undefined : editingId ? <Check size={14} /> : <Plus size={14} />}
                  isLoading={saving}
                  disabled={saving || (!editingId && allUnitsAllocated)}
                  title={!editingId && allUnitsAllocated ? 'Todas as unidades do catálogo já têm alocação neste item' : undefined}
                >
                  {editingId ? 'Salvar' : 'Alocar'}
                </AppButton>
              </div>
            </div>
          </form>
        </AppCard>
      )}

      <div>
        <SectionHeader title="Alocações" icon={<Building2 size={16} />} countBadge={rows.length} />
        {rows.length === 0 ? (
          <EmptyState
            title="Nenhuma alocação interna neste item"
            description={canManage ? 'Use o formulário acima para alocar o quantitativo às unidades internas.' : 'Ainda não há quantitativo alocado às unidades internas.'}
          />
        ) : (
          <DataTable columns={columns} data={rows} keyExtractor={(r) => r.id} testId="allocations-table" />
        )}
      </div>

      {semUnidade.count > 0 && (
        <div
          data-testid="empenhos-sem-unidade"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', padding: '0.6rem 0.9rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem' }}
        >
          <span>
            <StatusBadge label={`${semUnidade.count} ${semUnidade.count === 1 ? 'empenho' : 'empenhos'}`} variant="info" size="sm" dot={false} />{' '}
            confirmados ({formatNumber(semUnidade.empenhado)} un) ainda sem unidade interna.
          </span>
          <AppButton variant="outline" size="sm" onClick={onGoToContracts}>
            Vincular em Contratos e empenhos
          </AppButton>
        </div>
      )}
    </div>
  );
};
