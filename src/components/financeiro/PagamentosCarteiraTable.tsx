import React, { useCallback, useMemo } from 'react';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraNoResults } from '../carteira/CarteiraNoResults';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { formatCurrency } from '../carteira/carteiraFormat';
import { carteiraSubtitle, carteiraTableShell, carteiraTd } from '../carteira/carteiraStyles';
import { CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { CarteiraCellFilter } from '../carteira/CarteiraCellFilter';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../carteira/CarteiraRowLink';
import type { PagamentoCarteiraRow } from '../../services/financeiroCarteiraService';
import type { ContratoDoFinanceiro } from './useContratosDoFinanceiro';
import { ORDEM_ETAPA, type LinhaPagamento } from './pagamentoLinha';
import type { PagamentosFilterState } from './PagamentosCarteira';

export interface PagamentoComLinha {
  row: PagamentoCarteiraRow;
  linha: LinhaPagamento;
  contrato: ContratoDoFinanceiro;
}

interface PagamentosCarteiraTableProps {
  items: PagamentoComLinha[];
  total: number;
  onOpen: (item: PagamentoComLinha) => void;
  onResetFilters: () => void;
  onFilter: <K extends keyof PagamentosFilterState>(key: K, value: PagamentosFilterState[K]) => void;
  canFilterGestor: boolean;
  pageSize?: number;
}

const subtle: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 600 };

export const PagamentosCarteiraTable: React.FC<PagamentosCarteiraTableProps> = ({
  items,
  total,
  onOpen,
  onResetFilters,
  onFilter,
  canFilterGestor,
  pageSize = 20
}) => {
  const sortColumns = useMemo<Record<string, CarteiraSortColumn<PagamentoComLinha>>>(
    () => ({
      contrato: { value: (i) => i.contrato.numero.split('/').reverse().join('/') },
      empenho: { value: (i) => i.linha.empenho },
      valor: { value: (i) => i.linha.valor, firstDir: 'desc' },
      etapa: { value: (i) => ORDEM_ETAPA[i.row.etapa] },
      prazo: { value: (i) => i.linha.prazo.ordem },
      gestor: { value: (i) => i.contrato.gestorNome }
    }),
    []
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(items, sortColumns);
  const sortProps = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, useCallback((i: PagamentoComLinha) => i.row.chave, []), pageSize);

  if (total === 0) {
    return (
      <CarteiraNoResults
        title="Nenhum pagamento encontrado."
        description="Não há faturas nem ciclos de pagamento nos contratos do seu perfil."
        onResetFilters={onResetFilters}
      />
    );
  }
  if (items.length === 0) {
    return (
      <CarteiraNoResults
        title="Nenhum pagamento corresponde aos filtros aplicados."
        description="Escolha outra etapa, altere os critérios ou limpe os filtros."
        onResetFilters={onResetFilters}
      />
    );
  }

  return (
    <div data-testid="pagamentos-carteira-table" className="carteira-shell" style={carteiraTableShell}>
      <div style={{ overflowX: 'auto' }}>
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <CarteiraSortHeader label="Fatura" sortKey="contrato" {...sortProps} />
              <CarteiraSortHeader label="Empenho" sortKey="empenho" {...sortProps} />
              <CarteiraSortHeader label="Valor" sortKey="valor" align="right" {...sortProps} />
              <CarteiraSortHeader label="Etapa" sortKey="etapa" {...sortProps} />
              <CarteiraSortHeader label="Prazo" sortKey="prazo" {...sortProps} />
              <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => {
              const { row, linha, contrato } = item;
              const fornecedor = contrato.fornecedorNome;
              const sub = [linha.documento, linha.referencia ? `ref. ${linha.referencia}` : null, fornecedor?.toUpperCase()].filter(Boolean).join(' · ');
              return (
                <tr key={row.chave} data-testid={`pagamentos-row-${row.chave}`} className="carteira-row-link" onClick={abrirAoClicarNaLinha(() => onOpen(item))}>
                  <td data-role="id" style={{ ...carteiraTd, minWidth: '240px', maxWidth: '380px' }}>
                    <CarteiraIdLink
                      onClick={() => onOpen(item)}
                      label={`Ver os pagamentos do contrato ${contrato.numero}`}
                      title="Ver os pagamentos do contrato"
                      testId={`pagamentos-open-${row.chave}`}
                    >
                      Contrato {contrato.numero}
                    </CarteiraIdLink>
                    <div title={sub} style={carteiraSubtitle}>{sub}</div>
                  </td>
                  <td data-label="Empenho" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                    {linha.empenho ? (
                      <CarteiraCellFilter descricao={`empenho ${linha.empenho}`} onFilter={() => onFilter('busca', linha.empenho!.split(',')[0].trim())}>
                        <span>{linha.empenho}</span>
                      </CarteiraCellFilter>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td data-label="Valor" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800 }}>
                    {formatCurrency(linha.valor)}
                  </td>
                  <td data-label="Etapa" style={carteiraTd}>
                    <div>
                      <CarteiraCellFilter descricao={`etapa ${linha.etapa.label.toLowerCase()}`} onFilter={() => onFilter('etapa', row.etapa)}>
                        <StatusBadge label={linha.etapa.label} variant={linha.etapa.variant} size="sm" dot={false} />
                      </CarteiraCellFilter>
                      {linha.etapa.detalhe && <div style={{ ...subtle, marginTop: '0.2rem' }}>{linha.etapa.detalhe}</div>}
                    </div>
                  </td>
                  <td data-label="Prazo" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                    <div>
                      <div>{linha.prazo.texto}</div>
                      {linha.prazo.detalhe && (
                        <div style={{ ...subtle, ...(linha.prazo.atrasado ? { color: 'var(--color-danger-text)', fontWeight: 800 } : {}) }}>
                          {linha.prazo.detalhe}
                        </div>
                      )}
                    </div>
                  </td>
                  <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                    {contrato.gestorNome ? (
                      <CarteiraCellFilter
                        descricao={`gestor ${contrato.gestorNome}`}
                        onFilter={canFilterGestor ? () => onFilter('gestor', contrato.gestorNome!) : undefined}
                      >
                        <span>{contrato.gestorNome}</span>
                      </CarteiraCellFilter>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CarteiraPagination page={currentPage} pageSize={pageSize} total={items.length} onChange={setPage} testIdPrefix="pagamentos" />
    </div>
  );
};
