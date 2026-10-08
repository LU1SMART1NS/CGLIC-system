import React, { useMemo, useState } from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import { EmptyState } from '../../design-system/components/EmptyState';
import { ActionButton } from '../../design-system';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useAuth } from '../../context/AuthContext';
import { useAtasPortfolio } from '../../hooks/useAtasPortfolio';
import { useCarteiraItens } from '../../hooks/useCarteiraItens';
import { buildAtaItemPath } from '../../hooks/useAta';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraUnidadeSelect, TODAS_UNIDADES } from '../carteira/CarteiraExecucaoSelects';
import { CarteiraNivelPill } from '../carteira/CarteiraNivelPill';
import { CarteiraNoResults } from '../carteira/CarteiraNoResults';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../carteira/CarteiraRowLink';
import { CarteiraCellFilter } from '../carteira/CarteiraCellFilter';
import { toSentenceCaseIfAllCaps } from '../../utils/textCase';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { TODOS_GESTORES, canFilterByGestor, listGestores, matchesGestorFilter } from '../carteira/carteiraGestor';
import { comparePrazo } from '../carteira/carteiraPrazo';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { NIVEL_ALOCACAO_LABEL, type NivelAtendimento } from '../../utils/itemAtendimento';
import type { CarteiraItemRow } from '../../utils/carteiraItens';
import { formatNumber } from '../item-balances/itemBalanceUtils';
import { Boxes } from 'lucide-react';
import { PageHeader } from '../../design-system/components/PageHeader';
import { AlocarUnidadeModal, type ItemParaAlocar } from './AlocarUnidadeModal';

interface Filtros {
  nivel: string;
  vigencia: string;
  unidade: string;
  uasg: string;
  gestor: string;
  busca: string;
}
const TODOS = 'TODOS';
const PAGE_SIZE = 20;
const SCHEMA: CarteiraFilterSchema<Filtros> = {
  nivel: { param: 'alocacao', default: 'SEM', values: ['SEM', 'PARCIAL', 'TOTAL', TODOS] },
  vigencia: { param: 'situacao', default: 'VIGENTES', values: ['VIGENTES', 'HISTORICO', TODOS] },
  unidade: { param: 'unidade', default: TODAS_UNIDADES },
  uasg: { param: 'uasg', default: TODOS },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  busca: { param: 'busca', default: '' }
};
const AMBAR = 'var(--color-warning)';
const subtle: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 600 };
const clamp2: React.CSSProperties = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
/** "00059/2025" → "2025/00059": ordena pelo ano e depois pelo número (igual à Carteira › Itens). */
const ataOrdem = (numero: string) => numero.split('/').reverse().join('/');

/** Alocado do quantitativo SENASP: número e barra (âmbar enquanto parcial, verde quando completo). */
const AlocadoBar: React.FC<{ row: CarteiraItemRow }> = ({ row }) => {
  const pct = row.quantitativoSenasp > 0 ? Math.min(100, (row.alocado / row.quantitativoSenasp) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '110px' }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatNumber(row.alocado)} <span style={subtle}>de {formatNumber(row.quantitativoSenasp)}</span>
      </span>
      <div aria-hidden="true" style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: row.nivelAlocacao === 'TOTAL' ? 'var(--color-success-solid)' : 'var(--color-warning)' }} />
      </div>
    </div>
  );
};

/**
 * Alocação → Itens às unidades: todos os itens com o alocado contra o quantitativo SENASP (a mesma conta da
 * Carteira › Itens), em segmentos Sem alocação · Parcialmente alocados · Alocados. O coordenador e o gestor de
 * saldos alocam direto da linha; os demais perfis consultam.
 */
export const ItensUnidadesPage: React.FC = () => {
  const navigate = useNavigateWithOrigin();
  const { role } = useAuth();
  const podeAlocar = role === 'admin' || role === 'gestor_saldos';
  const showGestorFilter = canFilterByGestor(role);
  const { arps, scopedArps, isLoading, scopeLoading, itemsByAta, gestorByAta, syncError, reload } = useAtasPortfolio();
  const { rows, unidades, isLoading: loadingExecucao } = useCarteiraItens({ arps: scopedArps, itemsByAta, gestorByAta });
  const { filters, setFilter, resetFilters } = useCarteiraFilters(SCHEMA);
  const [alocando, setAlocando] = useState<ItemParaAlocar | null>(null);

  // Itens com quantitativo SENASP conhecido: sem ele não há o que alocar.
  const base = useMemo(() => rows.filter((r) => r.quantitativoSenasp > 0), [rows]);
  const nivelCounts = useMemo(() => {
    const n: Record<NivelAtendimento, number> = { SEM: 0, PARCIAL: 0, TOTAL: 0 };
    for (const r of base) if (filters.vigencia === TODOS || (filters.vigencia === 'HISTORICO' ? r.faixa === 'EXPIRADO' : r.faixa !== 'EXPIRADO')) n[r.nivelAlocacao]++;
    return n;
  }, [base, filters.vigencia]);
  const uasgs = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of base) m.set(r.arp.codigoUnidadeGerenciadora, (m.get(r.arp.codigoUnidadeGerenciadora) ?? 0) + 1);
    return m;
  }, [base]);
  const gestores = useMemo(() => listGestores(base.map((r) => r.gestorNome)), [base]);

  const lista = useMemo(() => {
    const q = filters.busca.trim().toLowerCase();
    return base
      .filter((r) => {
        if (filters.nivel !== TODOS && r.nivelAlocacao !== filters.nivel) return false;
        if (filters.vigencia === 'VIGENTES' && r.faixa === 'EXPIRADO') return false;
        if (filters.vigencia === 'HISTORICO' && r.faixa !== 'EXPIRADO') return false;
        if (filters.unidade !== TODAS_UNIDADES && !(r.alocadoPorUnidade[filters.unidade] > 0)) return false;
        if (filters.uasg !== TODOS && r.arp.codigoUnidadeGerenciadora !== filters.uasg) return false;
        if (showGestorFilter && !matchesGestorFilter(r.gestorNome, filters.gestor)) return false;
        if (q) {
          const casa =
            (r.arp.numeroAtaRegistroPreco || '').toLowerCase().includes(q) ||
            String(r.item.numeroItem).toLowerCase().includes(q) ||
            (r.item.descricaoItem || '').toLowerCase().includes(q) ||
            Object.keys(r.alocadoPorUnidade).some((u) => u.includes(q));
          if (!casa) return false;
        }
        return true;
      })
      .sort((a, b) => comparePrazo(a.diasRestantes, b.diasRestantes) || a.arp.numeroAtaRegistroPreco.localeCompare(b.arp.numeroAtaRegistroPreco) || Number(a.item.numeroItem) - Number(b.item.numeroItem));
  }, [base, filters, showGestorFilter]);

  const colunas = useMemo<Record<string, CarteiraSortColumn<CarteiraItemRow>>>(
    () => ({
      item: { value: (r) => `${ataOrdem(r.arp.numeroAtaRegistroPreco)}-${String(Number(r.item.numeroItem)).padStart(5, '0')}` },
      senasp: { value: (r) => r.quantitativoSenasp, firstDir: 'desc' },
      alocado: { value: (r) => (r.quantitativoSenasp > 0 ? r.alocado / r.quantitativoSenasp : 0), firstDir: 'desc' },
      falta: { value: (r) => r.quantitativoSenasp - r.alocado, firstDir: 'desc' },
      gestor: { value: (r) => r.gestorNome }
    }),
    []
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(lista, colunas);
  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, React.useCallback((r: CarteiraItemRow) => r.key, []), PAGE_SIZE);

  const abrirItem = (r: CarteiraItemRow) => navigate(`${buildAtaItemPath(r.arp.numeroAtaRegistroPreco, r.arp.codigoUnidadeGerenciadora, r.item.numeroItem)}?aba=alocacao`);
  const alocar = (r: CarteiraItemRow) =>
    setAlocando({ numeroAta: r.arp.numeroAtaRegistroPreco, uasg: r.arp.codigoUnidadeGerenciadora, numeroItem: String(r.item.numeroItem), descricao: r.item.descricaoItem, quantitativoSenasp: r.quantitativoSenasp });
  const faltaTotal = base.filter((r) => filters.vigencia !== 'VIGENTES' || r.faixa !== 'EXPIRADO').reduce((s, r) => s + Math.max(0, r.quantitativoSenasp - r.alocado), 0);

  if (syncError && arps.length === 0) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState title="Erro ao carregar os itens" message={syncError} onRetry={() => reload()} />
      </PageContainer>
    );
  }
  const hasActive = hasActiveCarteiraFilters(SCHEMA, filters) && filters.nivel === SCHEMA.nivel.default;
  const isBusy = (isLoading && arps.length === 0) || scopeLoading || loadingExecucao;
  const nivelAtivo = (filters.nivel === TODOS ? 'TODOS' : filters.nivel) as NivelAtendimento | 'TODOS';

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Itens a alocar às unidades internas"
        subtitle="Quanto de cada item da ata cada unidade interna recebeu, comparado ao quantitativo SENASP."
        hint="Alocado é o que as unidades internas receberam, comparado ao quantitativo SENASP do item (a mesma conta da Carteira › Itens). Só o coordenador e o gestor de saldos alocam; os demais perfis consultam."
        icon={<Boxes size={26} color="var(--primary)" aria-hidden="true" />}
      />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando itens...">
          <SkeletonLoader variant="rectangular" height="40px" count={1} />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
        <>
          <CarteiraSegmentTabs
            testIdPrefix="vinc-itens-nivel"
            ariaLabel="Alocação do item"
            active={nivelAtivo}
            onSelect={(v) => setFilter('nivel', v)}
            segments={[
              { id: 'SEM', label: 'Sem alocação', count: nivelCounts.SEM, dot: nivelCounts.SEM ? AMBAR : undefined, title: 'Nenhuma unidade recebeu o item' },
              { id: 'PARCIAL', label: 'Parcialmente alocados', count: nivelCounts.PARCIAL, dot: nivelCounts.PARCIAL ? AMBAR : undefined, title: 'O alocado não alcança o quantitativo SENASP' },
              { id: 'TOTAL', label: 'Alocados', count: nivelCounts.TOTAL, title: 'O alocado alcança o quantitativo SENASP' },
              { id: 'TODOS', label: 'Todos', count: nivelCounts.SEM + nivelCounts.PARCIAL + nivelCounts.TOTAL }
            ]}
            meta={faltaTotal > 0 ? `${formatNumber(faltaTotal)} un ainda sem unidade` : undefined}
          />

          <CarteiraFilterBar
            busca={filters.busca}
            searchPlaceholder="Buscar por item, ata, descrição, unidade..."
            onChangeBusca={(v) => setFilter('busca', v)}
            hasActiveFilters={hasActive}
            onResetFilters={resetFilters}
            counter={carteiraCounter(lista.length, base.length, hasActive, 'item', 'itens')}
            testIdPrefix="vinc-itens"
          >
            <CarteiraFilterButton
              label="Vigência"
              value={filters.vigencia}
              emptyValue={TODOS}
              options={[
                { value: 'VIGENTES', label: 'Atas vigentes' },
                { value: 'HISTORICO', label: 'Atas encerradas' }
              ]}
              onChange={(v) => setFilter('vigencia', v)}
              testId="vinc-itens-filter-vigencia"
            />
            <CarteiraUnidadeSelect value={filters.unidade} unidades={unidades} onChange={(v) => setFilter('unidade', v)} testId="vinc-itens-filter-unidade" />
            <CarteiraFilterButton label="UASG" value={filters.uasg} emptyValue={TODOS} options={[...uasgs.keys()].sort().map((u) => ({ value: u, label: u, count: uasgs.get(u) }))} onChange={(v) => setFilter('uasg', v)} testId="vinc-itens-filter-uasg" />
            {showGestorFilter && <CarteiraGestorSelect value={filters.gestor} gestores={gestores} onChange={(v) => setFilter('gestor', v)} testId="vinc-itens-filter-gestor" />}
          </CarteiraFilterBar>

          {base.length === 0 ? (
            <EmptyState title="Nenhum item com quantitativo SENASP na sua carteira." description="Os itens aparecem aqui depois que o saldo da ata é sincronizado." testId="vinc-itens-vazio" />
          ) : lista.length === 0 ? (
            <CarteiraNoResults title="Nenhum item nesta situação." description="Altere os critérios ou limpe os filtros." onResetFilters={resetFilters} />
          ) : (
            <div data-testid="vinc-itens-table" className="carteira-shell" style={carteiraTableShell}>
              <div style={{ overflowX: 'auto' }}>
                <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <CarteiraSortHeader label="Item" sortKey="item" {...sort} />
                      <CarteiraSortHeader label="Quantitativo SENASP" sortKey="senasp" align="right" {...sort} />
                      <CarteiraSortHeader label="Alocado" sortKey="alocado" {...sort} />
                      <th style={carteiraTh}>Unidades</th>
                      <CarteiraSortHeader label="Falta alocar" sortKey="falta" align="right" {...sort} />
                      <th style={carteiraTh}>Situação</th>
                      {showGestorFilter && <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sort} />}
                      {podeAlocar && <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((r) => {
                      const falta = Math.max(0, r.quantitativoSenasp - r.alocado);
                      const unidadesDoItem = Object.entries(r.alocadoPorUnidade).filter(([, q]) => q > 0);
                      return (
                        <tr key={r.key} data-testid={`vinc-itens-row-${r.key}`} className="carteira-row-link" onClick={abrirAoClicarNaLinha(() => abrirItem(r))}>
                          <td data-role="id" style={{ ...carteiraTd, minWidth: '240px', maxWidth: '380px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <CarteiraIdLink onClick={() => abrirItem(r)} label={`Abrir o item ${r.item.numeroItem} da ata ${r.arp.numeroAtaRegistroPreco}`} title="Abrir o item na aba Alocação interna">
                                {Number(r.item.numeroItem)}
                              </CarteiraIdLink>
                              <span style={subtle}>·</span>
                              <CarteiraCellFilter descricao={`ata ${r.arp.numeroAtaRegistroPreco}`} onFilter={() => setFilter('busca', r.arp.numeroAtaRegistroPreco)}>
                                <span style={{ ...subtle, fontWeight: 700 }}>Ata {r.arp.numeroAtaRegistroPreco}</span>
                              </CarteiraCellFilter>
                              <CarteiraCellFilter descricao={`UASG ${r.arp.codigoUnidadeGerenciadora}`} onFilter={() => setFilter('uasg', r.arp.codigoUnidadeGerenciadora)}>
                                <span style={subtle}>UASG {r.arp.codigoUnidadeGerenciadora}</span>
                              </CarteiraCellFilter>
                              {r.faixa === 'EXPIRADO' && <span style={subtle}>· ata encerrada</span>}
                            </div>
                            <div title={r.item.descricaoItem} style={{ fontSize: '0.8rem', color: '#0f172a', marginTop: '0.15rem', ...clamp2 }}>
                              {toSentenceCaseIfAllCaps(r.item.descricaoItem) || '—'}
                            </div>
                          </td>
                          <td data-label="Quantitativo SENASP" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(r.quantitativoSenasp)} un</td>
                          <td data-label="Alocado" style={carteiraTd}>
                            <AlocadoBar row={r} />
                          </td>
                          <td data-label="Unidades" style={{ ...carteiraTd, fontSize: '0.8rem' }}>
                            {unidadesDoItem.length > 0 ? unidadesDoItem.map(([u, q]) => `${unidades.find((x) => x.chave === u)?.nome ?? u} ${formatNumber(q)}`).join(' · ') : <span style={{ color: '#94a3b8' }}>—</span>}
                          </td>
                          <td data-label="Falta alocar" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: falta > 0 ? 'var(--color-warning-text)' : undefined }}>
                            {falta > 0 ? `${formatNumber(falta)} un` : '—'}
                          </td>
                          <td data-label="Situação" style={carteiraTd}>
                            <CarteiraNivelPill nivel={r.nivelAlocacao} labels={NIVEL_ALOCACAO_LABEL} />
                          </td>
                          {showGestorFilter && (
                            <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                              {r.gestorNome ? (
                                <CarteiraCellFilter descricao={`gestor ${r.gestorNome}`} onFilter={() => setFilter('gestor', r.gestorNome!)}>
                                  <span>{r.gestorNome}</span>
                                </CarteiraCellFilter>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>—</span>
                              )}
                            </td>
                          )}
                          {podeAlocar && (
                            <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {r.nivelAlocacao !== 'TOTAL' && (
                                <ActionButton action="novo" size="sm" onClick={() => alocar(r)} data-testid={`vinc-itens-alocar-${r.key}`} title="Alocar quantitativo a uma unidade interna">
                                  Alocar
                                </ActionButton>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <CarteiraPagination page={currentPage} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} testIdPrefix="vinc-itens" />
            </div>
          )}
        </>
      )}

      <AlocarUnidadeModal item={alocando} onFechar={() => setAlocando(null)} />
    </PageContainer>
  );
};
