import React from 'react';
import { Eye } from 'lucide-react';
import { AppButton } from '../../design-system/components/AppButton';
import { EmptyState } from '../../design-system/components/EmptyState';
import { classifyArpItemSaldo } from '../../services/balanceService';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
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
  /** Abre o detalhe de saldo do item. */
  onSelectItem?: (item: ArpItemRecord) => void;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const formatQtd = (val?: number) => (typeof val === 'number' && !isNaN(val) ? val.toLocaleString('pt-BR') : '0');

export const AtaItemsTable: React.FC<AtaItemsTableProps> = ({ itens, saldos, onSelectItem }) => {
  if (itens.length === 0) {
    return (
      <EmptyState
        title="Nenhum item cadastrado."
        description="Esta Ata não possui itens sincronizados na base."
      />
    );
  }

  const saldoByItem = new Map(saldos.map((s) => [String(Number(s.numero_item)), s]));

  return (
    <div data-testid="ata-items-table" style={carteiraTableShell}>
      <div style={{ overflowX: 'auto' }}>
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={carteiraTh}>Nº do item</th>
              <th style={{ ...carteiraTh, textAlign: 'right' }}>Valor unitário</th>
              <th style={{ ...carteiraTh, textAlign: 'right' }} title="Quantitativo registrado para as UASGs 200330 e 200331">Qtd. SENASP</th>
              <th style={{ ...carteiraTh, textAlign: 'right' }}>Consumido</th>
              <th style={{ ...carteiraTh, textAlign: 'right' }}>Saldo</th>
              <th style={carteiraTh}>Saldo usado</th>
              {onSelectItem && <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>}
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const saldo = saldoByItem.get(String(Number(item.numeroItem)));
              const qtdHomologada = (saldo ? quantidadeBaseSenasp(saldo) : undefined) ?? item.quantidadeHomologadaVencedor ?? item.quantidadeHomologadaItem;
              const qtdConsumida = saldo?.quantidade_consumida ?? 0;
              const saldoDisponivel = saldo?.saldo_disponivel ?? (qtdHomologada - qtdConsumida);
              const percentual = saldo?.percentual_consumido ?? (qtdHomologada > 0 ? (qtdConsumida / qtdHomologada) * 100 : 0);
              const { percentualConsumido } = classifyArpItemSaldo(Number(percentual) || 0);

              return (
                <tr key={item.numeroItem} data-testid={`ata-item-row-${item.numeroItem}`}>
                  <td style={{ ...carteiraTd, maxWidth: '520px', minWidth: '260px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
                      <span style={{ fontWeight: 800, flexShrink: 0 }}>{item.numeroItem}</span>
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
                  {onSelectItem && (
                    <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <AppButton
                        variant="outline"
                        size="sm"
                        icon={<Eye size={15} />}
                        onClick={() => onSelectItem(item)}
                        data-testid={`ata-item-open-${item.numeroItem}`}
                        title="Ver saldo do item"
                      >
                        <span className="payment-action-label">Ver saldo do item</span>
                      </AppButton>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
