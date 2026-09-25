import React from 'react';
import { Building2, ArrowRight, RotateCcw } from 'lucide-react';
import { EmptyState } from '../../../design-system/components/EmptyState';
import { StatusBadge } from '../../../design-system/components/StatusBadge';
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
  arp?: ArpRecord;
  item?: ArpItemRecord;
}

interface AllocationsPortfolioContentProps {
  items: EnrichedAllocationRow[];
  totalAllocationsCount: number;
  onSelectItem: (arp: ArpRecord, item: ArpItemRecord) => void;
  onResetFilters: () => void;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNumber(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return '0';
  return val.toLocaleString('pt-BR');
}

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
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
          Nenhuma alocação corresponde aos filtros aplicados.
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', maxWidth: '400px' }}>
          Altere a unidade selecionada ou limpe os filtros para visualizar a distribuição completa.
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          style={{
            marginTop: '0.5rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.45rem 0.85rem',
            background: '#0c326f',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#ffffff',
            cursor: 'pointer'
          }}
        >
          <RotateCcw size={13} /> Limpar Filtros
        </button>
      </div>
    );
  }

  // Agrupar por Unidade Interna
  const groupedByUnit = items.reduce<Record<string, EnrichedAllocationRow[]>>((acc, row) => {
    const u = row.unitName || 'Sem Unidade Definida';
    if (!acc[u]) acc[u] = [];
    acc[u].push(row);
    return acc;
  }, {});

  const unitNames = Object.keys(groupedByUnit).sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {unitNames.map((unitName) => {
        const unitRows = groupedByUnit[unitName];
        const unitTotalAllocQty = unitRows.reduce((s, r) => s + r.allocatedQty, 0);
        const unitTotalEmpQty = unitRows.reduce((s, r) => s + r.empenhadaQty, 0);
        const unitTotalSaldoQty = unitRows.reduce((s, r) => s + r.saldoQty, 0);
        const unitTotalSaldoVal = unitRows.reduce((s, r) => s + r.saldoValue, 0);

        return (
          <section
            key={unitName}
            data-testid={`unit-section-${unitName}`}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
            }}
          >
            {/* Header da Unidade */}
            <div style={{
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              padding: '0.85rem 1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ padding: '0.35rem', background: '#eff6ff', borderRadius: '6px', color: '#0c326f' }}>
                  <Building2 size={17} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                    {unitName}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>
                    {unitRows.length} {unitRows.length === 1 ? 'item alocado' : 'itens alocados'}
                  </span>
                </div>
              </div>

              {/* Resumo da Unidade */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.8rem' }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>Cota Total:</span>
                  <strong style={{ color: '#0f172a', fontWeight: 800 }}>{formatNumber(unitTotalAllocQty)} un</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>Empenhado:</span>
                  <strong style={{ color: '#b45309', fontWeight: 800 }}>{formatNumber(unitTotalEmpQty)} un</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>Saldo Livre:</span>
                  <strong style={{ color: '#15803d', fontWeight: 800 }}>{formatNumber(unitTotalSaldoQty)} un ({formatCurrency(unitTotalSaldoVal)})</strong>
                </div>
              </div>
            </div>

            {/* Tabela de Itens da Unidade */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.82rem',
                textAlign: 'left'
              }}>
                <thead>
                  <tr style={{
                    background: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    color: '#475569',
                    fontSize: '0.78rem',
                    fontWeight: 700
                  }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Ata & Item</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Vigência da Ata</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Cota Alocada</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Empenhado</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Saldo da Cota</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {unitRows.map((row) => {
                    const percLivre = row.allocatedQty > 0
                      ? Math.max(0, Math.round((row.saldoQty / row.allocatedQty) * 100))
                      : 100;

                    return (
                      <tr
                        key={row.id}
                        data-testid={`allocation-row-${row.id}`}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        {/* 1. Ata & Item */}
                        <td style={{ padding: '0.75rem 1rem', maxWidth: '340px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                color: '#0c326f',
                                background: '#eff6ff',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px'
                              }}>
                                ATA {row.numeroAta}
                              </span>
                              <strong style={{ fontSize: '0.82rem', color: '#0f172a' }}>
                                Item {row.numeroItem}
                              </strong>
                            </div>
                            <p style={{
                              fontSize: '0.75rem',
                              color: '#64748b',
                              margin: '0.15rem 0 0 0',
                              lineHeight: 1.35,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}>
                              {row.descricaoItem}
                            </p>
                            {row.fornecedorNome && (
                              <span style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600 }}>
                                {row.fornecedorNome}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 2. Vigência da Ata */}
                        <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                          {row.isExpired ? (
                            <StatusBadge label="Expirada" variant="danger" size="sm" />
                          ) : row.isExpiringSoon ? (
                            <StatusBadge label="Vence em ≤90d" variant="warning" size="sm" />
                          ) : (
                            <StatusBadge label="Vigente" variant="success" size="sm" />
                          )}
                        </td>

                        {/* 3. Cota Alocada */}
                        <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a' }}>
                              {formatNumber(row.allocatedQty)} un
                            </span>
                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                              {formatCurrency(row.allocatedValue)}
                            </span>
                          </div>
                        </td>

                        {/* 4. Empenhado */}
                        <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#b45309' }}>
                              {formatNumber(row.empenhadaQty)} un
                            </span>
                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                              {formatCurrency(row.empenhadaValue)}
                            </span>
                          </div>
                        </td>

                        {/* 5. Saldo da Cota */}
                        <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                              <span style={{
                                fontSize: '0.86rem',
                                fontWeight: 800,
                                color: row.saldoQty > 0 ? '#15803d' : '#dc2626'
                              }}>
                                {formatNumber(row.saldoQty)} un
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                ({percLivre}% livre)
                              </span>
                            </div>
                            <div style={{ width: '90px', height: '4px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                              <div style={{
                                width: `${Math.min(100, percLivre)}%`,
                                height: '100%',
                                background: percLivre > 20 ? '#15803d' : percLivre > 0 ? '#d97706' : '#dc2626'
                              }} />
                            </div>
                          </div>
                        </td>

                        {/* 6. Ações */}
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {row.arp && row.item ? (
                            <button
                              type="button"
                              onClick={() => onSelectItem(row.arp!, row.item!)}
                              data-testid={`open-item-balance-btn-${row.id}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.45rem 0.85rem',
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                color: '#0c326f',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              Ver Saldo <ArrowRight size={13} />
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
};
