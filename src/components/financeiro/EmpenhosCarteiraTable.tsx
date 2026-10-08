import React, { useCallback } from 'react';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraNoResults } from '../carteira/CarteiraNoResults';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { formatCurrency } from '../carteira/carteiraFormat';
import { carteiraSubtitle, carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { CarteiraCellFilter } from '../carteira/CarteiraCellFilter';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../carteira/CarteiraRowLink';
import type { EmpenhoCarteiraRow } from '../../services/financeiroCarteiraService';
import type { ContratoDoFinanceiro } from './useContratosDoFinanceiro';
import { dataBR } from './financeiroFormat';
import type { EmpenhosFilterState } from './EmpenhosCarteira';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import type { SituacaoDistribuicaoEmpenho } from '../../services/distribuicaoEmpenhoService';
import { rotuloDaSituacao } from '../../utils/distribuicaoEmpenho';

interface EmpenhosCarteiraTableProps {
  rows: EmpenhoCarteiraRow[];
  totalEmpenhos: number;
  contrato: (contractKey: string) => ContratoDoFinanceiro;
  onOpen: (row: EmpenhoCarteiraRow) => void;
  onResetFilters: () => void;
  onFilter: <K extends keyof EmpenhosFilterState>(key: K, value: EmpenhosFilterState[K]) => void;
  canFilterGestor: boolean;
  /** Situação da divisão por item de cada NE (por id do empenho); sem ela a coluna "Itens" mostra traço. */
  itensDe?: (empenhoId: string) => SituacaoDistribuicaoEmpenho | undefined;
  pageSize?: number;
}

const subtle: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 600 };

/** Pago do empenhado: número e barra (verde; cheia = empenho todo pago). */
const PagoBar: React.FC<{ pago: number | null; empenhado: number }> = ({ pago, empenhado }) => {
  if (pago === null) {
    return (
      <span style={subtle} title="As faturas do contrato ainda não foram consultadas no Contratos.gov.br">
        não consultado
      </span>
    );
  }
  const pct = empenhado > 0 ? Math.min(100, (pago / empenhado) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
      <span>{formatCurrency(pago)}</span>
      <div aria-hidden="true" style={{ width: '96px', height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-success-solid)' }} />
      </div>
    </div>
  );
};

export const EmpenhosCarteiraTable: React.FC<EmpenhosCarteiraTableProps> = ({
  rows,
  totalEmpenhos,
  contrato,
  onOpen,
  onResetFilters,
  onFilter,
  canFilterGestor,
  itensDe,
  pageSize = 20
}) => {
  const sortColumns = React.useMemo<Record<string, CarteiraSortColumn<EmpenhoCarteiraRow>>>(
    () => ({
      empenho: { value: (r) => r.numero },
      contrato: { value: (r) => contrato(r.contractKeys[0]).numero.split('/').reverse().join('/') },
      emissao: { value: (r) => r.dataEmissao, firstDir: 'desc' },
      empenhado: { value: (r) => r.valorEmpenhado, firstDir: 'desc' },
      pago: { value: (r) => r.valorPago, firstDir: 'desc' },
      saldo: { value: (r) => r.saldo, firstDir: 'desc' },
      gestor: { value: (r) => contrato(r.contractKeys[0]).gestorNome }
    }),
    [contrato]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(rows, sortColumns);
  const sortProps = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, useCallback((r: EmpenhoCarteiraRow) => r.empenhoId, []), pageSize);

  if (totalEmpenhos === 0) {
    return (
      <CarteiraNoResults
        title="Nenhum empenho encontrado."
        description="Não há empenhos vinculados aos contratos do seu perfil."
        onResetFilters={onResetFilters}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <CarteiraNoResults
        title="Nenhum empenho corresponde aos filtros aplicados."
        description="Altere os critérios selecionados ou limpe os filtros para ver todos os empenhos."
        onResetFilters={onResetFilters}
      />
    );
  }

  return (
    <div data-testid="empenhos-carteira-table" className="carteira-shell" style={carteiraTableShell}>
      <div style={{ overflowX: 'auto' }}>
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <CarteiraSortHeader label="Empenho" sortKey="empenho" {...sortProps} />
              <CarteiraSortHeader label="Contrato" sortKey="contrato" {...sortProps} />
              <CarteiraSortHeader label="Emissão" sortKey="emissao" {...sortProps} />
              <CarteiraSortHeader label="Empenhado" sortKey="empenhado" align="right" {...sortProps} />
              <CarteiraSortHeader label="Pago" sortKey="pago" align="right" {...sortProps} />
              <CarteiraSortHeader label="Saldo" sortKey="saldo" align="right" {...sortProps} />
              <th style={carteiraTh} title="Situação do vínculo da nota aos itens do contrato">Itens</th>
              <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {pageItems.map((row) => {
              const principal = contrato(row.contractKeys[0]);
              const outros = row.contractKeys.length - 1;
              const credor = row.credorNome;
              return (
                <tr key={row.empenhoId} data-testid={`empenhos-row-${row.numero}`} className="carteira-row-link" onClick={abrirAoClicarNaLinha(() => onOpen(row))}>
                  <td data-role="id" style={{ ...carteiraTd, minWidth: '220px', maxWidth: '340px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <CarteiraIdLink
                        onClick={() => onOpen(row)}
                        label={`Ver o empenho ${row.numero} no contrato ${principal.numero}`}
                        title="Ver os empenhos do contrato"
                        testId={`empenhos-open-${row.numero}`}
                      >
                        {row.numero}
                      </CarteiraIdLink>
                      {row.uasgEmitente && (
                        <CarteiraCellFilter descricao={`UASG ${row.uasgEmitente}`} onFilter={() => onFilter('uasg', row.uasgEmitente!)}>
                          <span style={subtle}>UASG {row.uasgEmitente}</span>
                        </CarteiraCellFilter>
                      )}
                    </div>
                    {credor && (
                      <CarteiraCellFilter descricao={`credor ${credor}`} onFilter={() => onFilter('busca', row.credorNome!)}>
                        <div title={credor} style={carteiraSubtitle}>{credor}</div>
                      </CarteiraCellFilter>
                    )}
                  </td>
                  <td data-label="Contrato" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                    <div>
                      <CarteiraCellFilter descricao={`contrato ${principal.numero}`} onFilter={() => onFilter('busca', principal.numero)}>
                        <span style={{ fontWeight: 700 }}>{principal.numero}</span>
                      </CarteiraCellFilter>
                      {outros > 0 && (
                        <div style={subtle} title={row.contractKeys.map((k) => contrato(k).numero).join(', ')}>
                          + {outros} {outros === 1 ? 'contrato' : 'contratos'}
                        </div>
                      )}
                    </div>
                  </td>
                  <td data-label="Emissão" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                    {dataBR(row.dataEmissao)}
                  </td>
                  <td data-label="Empenhado" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {formatCurrency(row.valorEmpenhado)}
                  </td>
                  <td data-label="Pago" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <PagoBar pago={row.valorPago} empenhado={row.valorEmpenhado} />
                  </td>
                  <td data-label="Saldo" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800 }}>
                    {row.saldo === null ? <span style={{ color: '#94a3b8' }}>—</span> : formatCurrency(row.saldo)}
                  </td>
                  <td data-label="Itens" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                    {(() => {
                      const s = itensDe?.(row.empenhoId);
                      if (!s || s.situacao === 'SEM_ITENS' || s.situacao === 'SEM_VALOR') return <span style={{ color: '#94a3b8' }}>—</span>;
                      const r = rotuloDaSituacao(s);
                      return <StatusBadge label={r.label} variant={r.variant} size="sm" dot={false} />;
                    })()}
                  </td>
                  <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                    {principal.gestorNome ? (
                      <CarteiraCellFilter
                        descricao={`gestor ${principal.gestorNome}`}
                        onFilter={canFilterGestor ? () => onFilter('gestor', principal.gestorNome!) : undefined}
                      >
                        <span>{principal.gestorNome}</span>
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
      <CarteiraPagination page={currentPage} pageSize={pageSize} total={rows.length} onChange={setPage} testIdPrefix="empenhos" />
    </div>
  );
};
