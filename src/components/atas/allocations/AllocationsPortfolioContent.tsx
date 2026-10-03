import React from 'react';
import { Building2, ArrowRight } from 'lucide-react';
import { AppButton, EmptyState } from '../../../design-system';
import { CarteiraPagination } from '../../carteira/CarteiraPagination';
import { CarteiraPrazoPill } from '../../carteira/CarteiraPrazoPill';
import { carteiraButton, carteiraTableShell, carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';
import type { PrazoFaixa } from '../../carteira/carteiraPrazo';
import { formatCurrency, formatNumber } from '../../../utils/format';
import type { ArpRecord, ArpItemRecord } from '../../../types';

export interface EnrichedAllocationRow {
  id: string;
  itemKey: string;
  unitName: string;
  allocatedQty: number;
  empenhadaQty: number;
  saldoQty: number;
  unitPrice: number;
  allocatedValue: number;
  empenhadaValue: number;
  saldoValue: number;
  numeroAta: string;
  numeroItem: string;
  descricaoItem: string;
  fornecedorNome: string;
  dataVigenciaFinal?: string;
  isExpired: boolean;
  isExpiringSoon: boolean;
  /** Dias até o fim da vigência da Ata (negativo = encerrada) e a faixa de prazo da Carteira. */
  diasRestantes: number | null;
  faixa: PrazoFaixa;
  arp?: ArpRecord;
  item?: ArpItemRecord;
}

interface AllocationsPortfolioContentProps {
  items: EnrichedAllocationRow[];
  totalAllocationsCount: number;
  onSelectItem: (arp: ArpRecord, item: ArpItemRecord) => void;
  onResetFilters: () => void;
}

const PAGE_SIZE = 10;

interface UnitSectionProps {
  unitName: string;
  rows: EnrichedAllocationRow[];
  onSelectItem: (arp: ArpRecord, item: ArpItemRecord) => void;
}

/** Uma unidade interna: resumo da cota e a tabela paginada dos itens alocados a ela. */
const UnitSection: React.FC<UnitSectionProps> = ({ unitName, rows, onSelectItem }) => {
  const [page, setPage] = React.useState(1);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalAllocQty = rows.reduce((sum, r) => sum + r.allocatedQty, 0);
  const totalEmpQty = rows.reduce((sum, r) => sum + r.empenhadaQty, 0);
  const totalSaldoQty = rows.reduce((sum, r) => sum + r.saldoQty, 0);
  const totalSaldoVal = rows.reduce((sum, r) => sum + r.saldoValue, 0);

  return (
    <section data-testid={`unit-section-${unitName}`} style={carteiraTableShell}>
      <div
        style={{
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          padding: '0.85rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ padding: '0.35rem', background: '#eff6ff', borderRadius: '6px', color: '#0c326f', display: 'flex' }}>
            <Building2 size={17} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{unitName}</h3>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {rows.length} {rows.length === 1 ? 'item alocado' : 'itens alocados'}
            </span>
          </div>
        </div>

        <dl style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.8rem', margin: 0 }}>
          <div>
            <dt style={{ color: '#64748b', fontSize: '0.75rem' }}>Cota total</dt>
            <dd style={{ margin: 0, fontWeight: 800 }}>{formatNumber(totalAllocQty)} un</dd>
          </div>
          <div>
            <dt style={{ color: '#64748b', fontSize: '0.75rem' }}>Empenhado</dt>
            <dd style={{ margin: 0, fontWeight: 800, color: '#b45309' }}>{formatNumber(totalEmpQty)} un</dd>
          </div>
          <div>
            <dt style={{ color: '#64748b', fontSize: '0.75rem' }}>Saldo livre</dt>
            <dd style={{ margin: 0, fontWeight: 800, color: '#15803d' }}>
              {formatNumber(totalSaldoQty)} un ({formatCurrency(totalSaldoVal)})
            </dd>
          </div>
        </dl>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={carteiraTh}>Ata e item</th>
              <th style={carteiraTh}>Vigência da Ata</th>
              <th style={{ ...carteiraTh, textAlign: 'right' }}>Cota alocada</th>
              <th style={{ ...carteiraTh, textAlign: 'right' }}>Empenhado</th>
              <th style={{ ...carteiraTh, textAlign: 'right' }}>Saldo da cota</th>
              <th style={{ ...carteiraTh, textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const percLivre = row.allocatedQty > 0 ? Math.max(0, Math.round((row.saldoQty / row.allocatedQty) * 100)) : 100;
              return (
                <tr key={row.id} data-testid={`allocation-row-${row.id}`}>
                  <td style={{ ...carteiraTd, maxWidth: '340px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0c326f', background: '#eff6ff', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                        ATA {row.numeroAta}
                      </span>
                      <strong>Item {row.numeroItem}</strong>
                    </div>
                    <p
                      style={{
                        fontSize: '0.75rem',
                        color: '#64748b',
                        margin: '0.15rem 0 0 0',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {row.descricaoItem}
                    </p>
                    {row.fornecedorNome && <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>{row.fornecedorNome}</span>}
                  </td>

                  <td data-label="Vigência da Ata" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                    <CarteiraPrazoPill faixa={row.faixa} diasRestantes={row.diasRestantes} />
                  </td>

                  <td data-label="Cota alocada" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 800 }}>{formatNumber(row.allocatedQty)} un</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{formatCurrency(row.allocatedValue)}</div>
                  </td>

                  <td data-label="Empenhado" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 800, color: '#b45309' }}>{formatNumber(row.empenhadaQty)} un</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{formatCurrency(row.empenhadaValue)}</div>
                  </td>

                  <td data-label="Saldo da cota" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', justifyContent: 'flex-end' }}>
                      <span style={{ fontWeight: 800, color: row.saldoQty > 0 ? '#15803d' : '#dc2626' }}>{formatNumber(row.saldoQty)} un</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>({percLivre}% livre)</span>
                    </div>
                    <div style={{ width: '90px', height: '4px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', marginLeft: 'auto', marginTop: '0.25rem' }}>
                      <div
                        style={{
                          width: `${Math.min(100, percLivre)}%`,
                          height: '100%',
                          background: percLivre > 20 ? '#15803d' : percLivre > 0 ? '#d97706' : '#dc2626'
                        }}
                      />
                    </div>
                  </td>

                  <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {row.arp && row.item ? (
                      <button
                        type="button"
                        onClick={() => onSelectItem(row.arp!, row.item!)}
                        data-testid={`open-item-balance-btn-${row.id}`}
                        style={carteiraButton}
                      >
                        Abrir item <ArrowRight size={13} />
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CarteiraPagination
        page={currentPage}
        pageSize={PAGE_SIZE}
        total={rows.length}
        onChange={setPage}
        testIdPrefix={`allocations-${unitName}`}
      />
    </section>
  );
};

export const AllocationsPortfolioContent: React.FC<AllocationsPortfolioContentProps> = ({
  items,
  totalAllocationsCount,
  onSelectItem,
  onResetFilters
}) => {
  if (totalAllocationsCount === 0) {
    return (
      <EmptyState
        title="Nenhuma cota distribuída encontrada."
        description="Ainda não foram registradas alocações internas de cotas de Atas para as unidades internas."
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        testId="allocations-filter-empty"
        title="Nenhuma alocação corresponde aos filtros aplicados."
        description="Altere a unidade selecionada ou limpe os filtros para visualizar a distribuição completa."
        action={
          <AppButton variant="outline" size="sm" onClick={onResetFilters}>
            Limpar filtros
          </AppButton>
        }
      />
    );
  }

  const groupedByUnit = items.reduce<Record<string, EnrichedAllocationRow[]>>((acc, row) => {
    const u = row.unitName || 'Sem Unidade Definida';
    (acc[u] ||= []).push(row);
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {Object.keys(groupedByUnit)
        .sort()
        .map((unitName) => (
          <UnitSection key={unitName} unitName={unitName} rows={groupedByUnit[unitName]} onSelectItem={onSelectItem} />
        ))}
    </div>
  );
};
