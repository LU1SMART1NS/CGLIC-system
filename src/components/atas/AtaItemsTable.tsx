import React from 'react';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { EmptyState } from '../../design-system/components/EmptyState';
import { classifyArpItemSaldo } from '../../services/balanceService';
import type { ArpItemRecord } from '../../types';

interface AtaItemsTableProps {
  itens: ArpItemRecord[];
  saldos: Array<{
    numero_item?: number | string;
    quantidade_homologada?: number;
    quantidade_consumida?: number;
    saldo_disponivel?: number;
    percentual_consumido?: number;
  }>;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const AtaItemsTable: React.FC<AtaItemsTableProps> = ({ itens, saldos }) => {
  if (itens.length === 0) {
    return (
      <EmptyState
        title="Nenhum item cadastrado."
        description="Esta Ata não possui itens sincronizados na base."
      />
    );
  }

  const saldoByItem = new Map(saldos.map((s) => [String(s.numero_item), s]));

  return (
    <div
      data-testid="ata-items-table"
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        overflow: 'hidden'
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.78rem', fontWeight: 700 }}>
              <th style={{ padding: '0.75rem 1rem' }}>Item</th>
              <th style={{ padding: '0.75rem 1rem' }}>Fornecedor</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Valor Unitário</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Homologado</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Consumido</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Saldo</th>
              <th style={{ padding: '0.75rem 1rem' }}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const saldo = saldoByItem.get(String(item.numeroItem));
              const qtdHomologada = saldo?.quantidade_homologada ?? item.quantidadeHomologadaVencedor ?? item.quantidadeHomologadaItem;
              const qtdConsumida = saldo?.quantidade_consumida ?? 0;
              const saldoDisponivel = saldo?.saldo_disponivel ?? (qtdHomologada - qtdConsumida);
              const percentual = saldo?.percentual_consumido ?? (qtdHomologada > 0 ? (qtdConsumida / qtdHomologada) * 100 : 0);
              const classificacao = classifyArpItemSaldo(Number(percentual) || 0);

              return (
                <tr key={item.numeroItem} data-testid={`ata-item-row-${item.numeroItem}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>Item {item.numeroItem}</strong>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.15rem 0 0 0', maxWidth: '320px' }}>
                      {item.descricaoItem}
                    </p>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: '#334155' }}>
                    {item.nomeRazaoSocialFornecedor || 'Não informado'}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {formatCurrency(item.valorUnitario)}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>{qtdHomologada ?? 0}</td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>{qtdConsumida}</td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700 }}>{saldoDisponivel}</td>
                  <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                    <StatusBadge
                      label={`${classificacao.percentualConsumido.toFixed(1)}%`}
                      variant={classificacao.isCritico ? 'danger' : classificacao.isProximoLimite ? 'warning' : 'success'}
                      size="sm"
                    />
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
