import React, { useMemo } from 'react';
import { EmptyState } from '../../design-system/components/EmptyState';
import { classifyArpItemSaldo } from '../../services/balanceService';
import { carteiraTableShell, carteiraTd } from '../carteira/carteiraStyles';
import { abrirAoClicarNaLinha, CarteiraIdLink } from '../carteira/CarteiraRowLink';
import { CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { saldoBarColor } from './ataSaldoStats';
import type { ArpItemRecord } from '../../types';
import { quantidadeBaseSenasp } from '../../utils/quantitativoSenasp';

interface AtaItemsTableProps {
  itens: ArpItemRecord[];
  saldos: Array<{
    numero_item?: number | string;
    quantidade_homologada?: number;
    quantidade_senasp?: number | null;
    quantidade_base_senasp?: number | null;
    quantidade_consumida?: number;
    saldo_disponivel?: number;
    percentual_consumido?: number;
  }>;
  /** Abre o detalhe de saldo do item (clique na linha ou no número do item). */
  onSelectItem?: (item: ArpItemRecord) => void;
  /** Sem itens: explicação e ação (ex.: ata publicada no PNCP sem fornecedor → "Indicar fornecedor"). */
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const formatQtd = (val?: number) => (typeof val === 'number' && !isNaN(val) ? val.toLocaleString('pt-BR') : '0');

interface ItemRow {
  item: ArpItemRecord;
  qtdHomologada: number;
  qtdConsumida: number;
  saldoDisponivel: number;
  percentualConsumido: number;
}

const SORT_COLUMNS: Record<string, CarteiraSortColumn<ItemRow>> = {
  item: { value: (r) => Number(r.item.numeroItem) },
  valor: { value: (r) => r.item.valorUnitario, firstDir: 'desc' },
  qtd: { value: (r) => r.qtdHomologada, firstDir: 'desc' },
  consumido: { value: (r) => r.qtdConsumida, firstDir: 'desc' },
  saldo: { value: (r) => r.saldoDisponivel, firstDir: 'desc' },
  usado: { value: (r) => r.percentualConsumido, firstDir: 'desc' }
};

export const AtaItemsTable: React.FC<AtaItemsTableProps> = ({ itens, saldos, onSelectItem, emptyDescription, emptyAction }) => {
  const rows = useMemo<ItemRow[]>(() => {
    const saldoByItem = new Map(saldos.map((s) => [String(Number(s.numero_item)), s]));
    return itens.map((item) => {
      const saldo = saldoByItem.get(String(Number(item.numeroItem)));
      const qtdHomologada = (saldo ? quantidadeBaseSenasp(saldo) : undefined) ?? item.quantidadeHomologadaVencedor ?? item.quantidadeHomologadaItem;
      const qtdConsumida = saldo?.quantidade_consumida ?? 0;
      const saldoDisponivel = saldo?.saldo_disponivel ?? (qtdHomologada - qtdConsumida);
      const percentual = saldo?.percentual_consumido ?? (qtdHomologada > 0 ? (qtdConsumida / qtdHomologada) * 100 : 0);
      const { percentualConsumido } = classifyArpItemSaldo(Number(percentual) || 0);
      return { item, qtdHomologada, qtdConsumida, saldoDisponivel, percentualConsumido };
    });
  }, [itens, saldos]);
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(rows, SORT_COLUMNS);
  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };

  if (itens.length === 0) {
    return (
      <EmptyState
        title="Nenhum item cadastrado."
        description={emptyDescription || 'Esta Ata não possui itens sincronizados na base.'}
        action={emptyAction}
      />
    );
  }

  return (
    <div data-testid="ata-items-table" style={carteiraTableShell}>
      <div style={{ overflowX: 'auto' }}>
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <CarteiraSortHeader label="Nº do item" sortKey="item" {...sort} />
              <CarteiraSortHeader label="Valor unitário" sortKey="valor" align="right" {...sort} />
              <CarteiraSortHeader label="Qtd. SENASP" sortKey="qtd" align="right" hint="Quantitativo registrado para as UASGs 200330 e 200331" {...sort} />
              <CarteiraSortHeader label="Consumido" sortKey="consumido" align="right" {...sort} />
              <CarteiraSortHeader label="Saldo" sortKey="saldo" align="right" {...sort} />
              <CarteiraSortHeader label="Saldo usado" sortKey="usado" {...sort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ item, qtdHomologada, qtdConsumida, saldoDisponivel, percentualConsumido }) => {
              return (
                <tr
                  key={item.numeroItem}
                  data-testid={`ata-item-row-${item.numeroItem}`}
                  className={onSelectItem ? 'carteira-row-link' : undefined}
                  onClick={onSelectItem ? abrirAoClicarNaLinha(() => onSelectItem(item)) : undefined}
                >
                  <td style={{ ...carteiraTd, maxWidth: '520px', minWidth: '260px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
                      {onSelectItem ? (
                        <CarteiraIdLink
                          onClick={() => onSelectItem(item)}
                          label={`Ver o saldo do item ${item.numeroItem}`}
                          title="Ver o saldo do item"
                          testId={`ata-item-open-${item.numeroItem}`}
                        >
                          {item.numeroItem}
                        </CarteiraIdLink>
                      ) : (
                        <span style={{ fontWeight: 800, flexShrink: 0 }}>{item.numeroItem}</span>
                      )}
                      <span
                        title={item.descricaoItem}
                        style={{ fontWeight: 600, color: '#334155', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >
                        {item.descricaoItem}
                      </span>
                    </div>
                  </td>
                  <td data-label="Valor unitário" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(item.valorUnitario)}</td>
                  <td data-label="Qtd. SENASP" style={{ ...carteiraTd, textAlign: 'right' }}>{formatQtd(qtdHomologada)}</td>
                  <td data-label="Consumido" style={{ ...carteiraTd, textAlign: 'right' }}>{formatQtd(qtdConsumida)}</td>
                  <td data-label="Saldo" style={{ ...carteiraTd, textAlign: 'right', fontWeight: 800 }}>{formatQtd(saldoDisponivel)}</td>
                  <td data-label="Saldo usado" style={carteiraTd}>
                    <div style={{ minWidth: '84px' }}>
                      <span style={{ fontWeight: 800 }}>{percentualConsumido.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
                      <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', marginTop: '0.2rem', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, Math.max(0, percentualConsumido))}%`, height: '100%', background: saldoBarColor(percentualConsumido) }} />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
