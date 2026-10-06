import React, { useCallback, useMemo } from 'react';
import { CarteiraPrazoPill } from '../carteira/CarteiraPrazoPill';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraNoResults } from '../carteira/CarteiraNoResults';
import { CarteiraNivelPill } from '../carteira/CarteiraNivelPill';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { TODAS_UNIDADES } from '../carteira/CarteiraExecucaoSelects';
import { formatCurrencyOrDash } from '../carteira/carteiraFormat';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { saldoBarColor } from '../atas/ataSaldoStats';
import { CarteiraSortButton, CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { CarteiraCellFilter } from '../carteira/CarteiraCellFilter';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../carteira/CarteiraRowLink';
import { situacaoDaFaixa } from '../carteira/carteiraPrazo';
import { toSentenceCaseIfAllCaps } from '../../utils/textCase';
import { NIVEL_ALOCACAO_LABEL, NIVEL_EMPENHO_LABEL } from '../../utils/itemAtendimento';
import type { CarteiraItemRow } from '../../utils/carteiraItens';
import type { ItensPortfolioFilterState } from './ItensPortfolioFilters';

interface ItensPortfolioTableProps {
  rows: CarteiraItemRow[];
  /** Total de itens da carteira, antes dos filtros (diferencia "sem itens" de "nenhum passou pelos filtros"). */
  totalItens: number;
  /** Unidade interna filtrada (nome normalizado) e seu nome; com ela, a célula Execução mostra o alocado à unidade. */
  unidade: string;
  unidadeNome?: string;
  onSelectItem: (row: CarteiraItemRow) => void;
  onResetFilters: () => void;
  pageSize?: number;
  /** Clique num valor da célula aplica o filtro (alocação, empenho, prazo, ata/fornecedor na busca, gestor). */
  onFilter?: <K extends keyof ItensPortfolioFilterState>(key: K, value: ItensPortfolioFilterState[K]) => void;
  /** O perfil gestor não filtra por gestor (já vê só as próprias atas). */
  canFilterGestor?: boolean;
}

const formatNumber = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function formatDateBR(dateStr?: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('T')[0].split('-');
  return y && m && d ? `${d}/${m}/${y}` : dateStr;
}

/** "00059/2025" → "2025/00059": ordena pelo ano e depois pelo número. */
const ataOrdem = (numero: string) => numero.split('/').reverse().join('/');

const ConsumoBar: React.FC<{ pct: number | null }> = ({ pct }) => {
  if (pct === null) return <span style={{ color: '#94a3b8' }}>—</span>;
  return (
    <div style={{ minWidth: '72px' }}>
      <span style={{ fontWeight: 800 }}>{pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</span>
      <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', marginTop: '0.2rem', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: saldoBarColor(pct) }} />
      </div>
    </div>
  );
};

const subtle: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 600 };
const clamp = (lines: number): React.CSSProperties => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' });
const execLine: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' };

export const ItensPortfolioTable: React.FC<ItensPortfolioTableProps> = ({
  rows,
  totalItens,
  unidade,
  unidadeNome,
  onSelectItem,
  onResetFilters,
  pageSize = 20,
  onFilter,
  canFilterGestor = true
}) => {
  const comUnidade = unidade !== TODAS_UNIDADES;
  const sortColumns = useMemo<Record<string, CarteiraSortColumn<CarteiraItemRow>>>(
    () => ({
      item: { value: (r) => `${ataOrdem(r.arp.numeroAtaRegistroPreco)}-${String(Number(r.item.numeroItem)).padStart(5, '0')}` },
      vigencia: { value: (r) => r.diasRestantes },
      alocacao: {
        value: (r) =>
          comUnidade
            ? (r.alocadoPorUnidade[unidade] ?? 0)
            : r.quantitativoSenasp > 0
              ? r.alocado / r.quantitativoSenasp
              : r.alocado > 0
                ? 1
                : 0
      },
      empenho: { value: (r) => (r.contratada ? r.empenhado / r.contratada : r.empenhado > 0 ? null : 0) },
      consumo: { value: (r) => r.consumoPct, firstDir: 'desc' },
      gestor: { value: (r) => r.gestorNome }
    }),
    [comUnidade, unidade]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(rows, sortColumns);
  const sortProps = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, useCallback((r: CarteiraItemRow) => r.key, []), pageSize);

  if (totalItens === 0) {
    return (
      <CarteiraNoResults
        title="Nenhum item encontrado."
        description="Não há itens de atas sincronizados no escopo do seu perfil."
        onResetFilters={onResetFilters}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <CarteiraNoResults
        title="Nenhum item corresponde aos filtros aplicados."
        description="Altere os critérios selecionados ou limpe os filtros para ver todos os itens da carteira."
        onResetFilters={onResetFilters}
      />
    );
  }

  const execucaoSort = sortKey === 'alocacao' || sortKey === 'empenho';

  return (
    <div data-testid="itens-portfolio-table" role="feed" aria-label="Lista de itens das atas" className="carteira-shell" style={carteiraTableShell}>
      <div style={{ overflowX: 'auto' }}>
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <CarteiraSortHeader label="Item" sortKey="item" {...sortProps} />
              <CarteiraSortHeader label="Vigência" sortKey="vigencia" {...sortProps} />
              <th
                style={carteiraTh}
                aria-sort={execucaoSort && sortDir ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <span style={{ display: 'inline-flex', gap: '0.6rem', alignItems: 'center' }}>
                  <CarteiraSortButton label={comUnidade ? 'Alocado' : 'Alocação'} sortKey="alocacao" {...sortProps} />
                  <span aria-hidden="true">·</span>
                  <CarteiraSortButton label="Empenho" sortKey="empenho" {...sortProps} />
                </span>
              </th>
              <CarteiraSortHeader label="Consumo" sortKey="consumo" {...sortProps} />
              <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {pageItems.map((row) => {
              const { arp, item } = row;
              const alocadoUnidade = row.alocadoPorUnidade[unidade] ?? 0;
              return (
                <tr key={row.key} data-testid={`itens-row-${row.key}`} className="carteira-row-link" onClick={abrirAoClicarNaLinha(() => onSelectItem(row))}>
                  <td data-role="id" style={{ ...carteiraTd, minWidth: '240px', maxWidth: '380px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <CarteiraIdLink
                        onClick={() => onSelectItem(row)}
                        label={`Ver saldo do item ${item.numeroItem} da ata ${arp.numeroAtaRegistroPreco}`}
                        title={`Ver saldo · valor unitário ${formatCurrencyOrDash(item.valorUnitario)}`}
                        testId={`itens-saldo-${row.key}`}
                      >
                        {item.numeroItem}
                      </CarteiraIdLink>
                      <span style={subtle}>·</span>
                      <CarteiraCellFilter descricao={`ata ${arp.numeroAtaRegistroPreco}`} onFilter={onFilter && (() => onFilter('busca', arp.numeroAtaRegistroPreco))}>
                        <span style={{ ...subtle, fontWeight: 700 }} title={`UASG ${arp.codigoUnidadeGerenciadora}`}>
                          Ata {arp.numeroAtaRegistroPreco}
                        </span>
                      </CarteiraCellFilter>
                    </div>
                    <div title={item.descricaoItem} style={{ fontSize: '0.8rem', color: '#0f172a', marginTop: '0.15rem', ...clamp(2) }}>
                      {toSentenceCaseIfAllCaps(item.descricaoItem)}
                    </div>
                  </td>
                  <td data-label="Vigência" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                    <CarteiraCellFilter
                      descricao="esta situação de prazo"
                      onFilter={onFilter && situacaoDaFaixa(row.faixa) ? () => onFilter('statusVigencia', situacaoDaFaixa(row.faixa)!) : undefined}
                    >
                      <CarteiraPrazoPill faixa={row.faixa} diasRestantes={row.diasRestantes} />
                    </CarteiraCellFilter>
                    <div style={{ ...subtle, marginTop: '0.2rem' }}>até {formatDateBR(arp.dataVigenciaFinal)}</div>
                  </td>
                  <td data-label="Execução" data-stack="true" style={{ ...carteiraTd, minWidth: '230px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <div style={execLine}>
                        <CarteiraCellFilter
                          descricao={NIVEL_ALOCACAO_LABEL[row.nivelAlocacao].toLowerCase()}
                          onFilter={onFilter && (() => onFilter('filtroAlocacao', row.nivelAlocacao))}
                        >
                          <CarteiraNivelPill nivel={row.nivelAlocacao} labels={NIVEL_ALOCACAO_LABEL} />
                        </CarteiraCellFilter>
                        <span style={subtle}>
                          {formatNumber(row.alocado)} de {formatNumber(row.quantitativoSenasp)}
                        </span>
                      </div>
                      <div style={execLine}>
                        <CarteiraCellFilter
                          descricao={NIVEL_EMPENHO_LABEL[row.nivelEmpenho].toLowerCase()}
                          onFilter={onFilter && (() => onFilter('filtroEmpenho', row.nivelEmpenho))}
                        >
                          <CarteiraNivelPill nivel={row.nivelEmpenho} labels={NIVEL_EMPENHO_LABEL} />
                        </CarteiraCellFilter>
                        <span style={subtle}>
                          {row.contratada == null
                            ? `${formatNumber(row.empenhado)} · sem qtd. contratada`
                            : `${formatNumber(row.empenhado)} de ${formatNumber(row.contratada)}`}
                        </span>
                        {row.empenhosPendentes > 0 && (
                          <span
                            data-testid={`itens-pendentes-${row.key}`}
                            title="Empenhos vinculados ao item que ainda esperam a quantidade ser confirmada; não contam no empenhado."
                            style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-warning-text)', background: 'var(--color-warning-bg)', padding: '0.1rem 0.4rem', borderRadius: '4px', whiteSpace: 'nowrap' }}
                          >
                            {row.empenhosPendentes} {row.empenhosPendentes === 1 ? 'pendente' : 'pendentes'}
                          </span>
                        )}
                      </div>
                      {comUnidade && (
                        <div style={{ ...subtle, color: 'var(--primary)' }}>
                          {unidadeNome ?? 'Unidade'}: <strong>{formatNumber(alocadoUnidade)}</strong> alocado
                        </div>
                      )}
                    </div>
                  </td>
                  <td data-label="Consumo" style={carteiraTd}>
                    <ConsumoBar pct={row.consumoPct} />
                  </td>
                  <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                    {row.gestorNome ? (
                      <CarteiraCellFilter
                        descricao={`gestor ${row.gestorNome}`}
                        onFilter={onFilter && canFilterGestor ? () => onFilter('gestor', row.gestorNome!) : undefined}
                      >
                        <span>{row.gestorNome}</span>
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

      <CarteiraPagination page={currentPage} pageSize={pageSize} total={rows.length} onChange={setPage} testIdPrefix="itens" />
    </div>
  );
};
