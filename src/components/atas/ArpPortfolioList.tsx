import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { AtaCardSkeleton } from '../cards/AtaCardSkeleton';
import { EmptyState } from '../../design-system/components/EmptyState';
import { buildAtaKey } from '../../hooks/useAta';
import { getArpVigenciaStatus } from '../../services/temporalEngineService';
import { CarteiraPrazoPill } from '../carteira/CarteiraPrazoPill';
import { CarteiraDetailLabel, CARTEIRA_EXPANDED_CELL_STYLE } from '../carteira/CarteiraDetailLabel';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraNoResults } from '../carteira/CarteiraNoResults';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { formatCurrencyOrDash } from '../carteira/carteiraFormat';
import { carteiraButton, carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { classifyPrazo, situacaoDaFaixa } from '../carteira/carteiraPrazo';
import { CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { CarteiraCellFilter } from '../carteira/CarteiraCellFilter';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../carteira/CarteiraRowLink';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { ManagerCell } from '../carteira/ManagerAssign';
import { CarteiraNivelPill } from '../carteira/CarteiraNivelPill';
import { TODAS_UNIDADES } from '../carteira/CarteiraExecucaoSelects';
import { NIVEL_ALOCACAO_LABEL, NIVEL_EMPENHO_LABEL } from '../../utils/itemAtendimento';
import type { CarteiraAtaExecucao } from '../../utils/carteiraItens';
import type { ArpPortfolioFilterState } from './ArpPortfolioFilters';
import { normalizeItemNumber, saldoBarColor, type AtaSaldoStats } from './ataSaldoStats';
import type { ArpRecord, ArpItemRecord, AtaGroupedCard } from '../../types';

interface ArpPortfolioListProps {
  cards: AtaGroupedCard[];
  totalAtas: number;
  isLoading?: boolean;
  itemsLoadingByAta?: Record<string, boolean>;
  /** Resumo de consumo de saldo por número de ata. */
  saldoStatsByAta?: Record<string, AtaSaldoStats>;
  /** Alocação, empenho e unidades de cada ata (chave "{numeroAta}-{uasg}"), somados dos itens. */
  execucaoPorAta?: Map<string, CarteiraAtaExecucao>;
  /** Unidades internas (para exibir o nome da unidade filtrada). */
  unidades?: Array<{ chave: string; nome: string }>;
  /** Filtros ativos: alocação, empenho e unidade ganham uma coluna quando filtrados. */
  filters?: Pick<ArpPortfolioFilterState, 'filtroAlocacao' | 'filtroEmpenho' | 'unidade'>;
  /** Nome do gestor por número de ata. */
  gestorByAta?: Record<string, string>;
  /** Texto da busca — quando algum item da ata casa com ela, a linha abre já mostrando esse item. */
  busca?: string;
  onSelectArp: (arp: ArpRecord) => void;
  onSelectItem: (arp: ArpRecord, item: ArpItemRecord) => void;
  onExpandAta?: (arp: ArpRecord) => void;
  onResetFilters: () => void;
  pageSize?: number;
  /** Coordenador: "Sem gestor" vira atalho para a Central de Distribuição (a atribuição é feita só lá). */
  canAssign?: boolean;
  /** Clique num valor da célula aplica o filtro correspondente (prazo → situação, fornecedor → busca). */
  onFilter?: <K extends keyof ArpPortfolioFilterState>(key: K, value: ArpPortfolioFilterState[K]) => void;
}

const MAX_ITENS_EXPANDIDOS = 5;

function formatDateBR(dateStr?: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('T')[0].split('-');
  return y && m && d ? `${d}/${m}/${y}` : dateStr;
}

const SaldoBar: React.FC<{ pct: number | null }> = ({ pct }) => {
  if (pct === null) return <span style={{ color: '#94a3b8' }}>—</span>;
  return (
    <div style={{ minWidth: '84px' }}>
      <span style={{ fontWeight: 800 }}>{pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</span>
      <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', marginTop: '0.2rem', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: saldoBarColor(pct) }} />
      </div>
    </div>
  );
};

export const ArpPortfolioList: React.FC<ArpPortfolioListProps> = ({
  cards,
  totalAtas,
  isLoading = false,
  itemsLoadingByAta = {},
  saldoStatsByAta = {},
  execucaoPorAta,
  unidades = [],
  filters,
  gestorByAta = {},
  busca = '',
  onSelectItem,
  onExpandAta,
  onResetFilters,
  pageSize = 15,
  canAssign = false,
  onFilter
}) => {
  const navigate = useNavigateWithOrigin();
  /** Escolha explícita do usuário por linha; sem escolha vale o padrão (abrir só se a busca casar com algum item). */
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const sortColumns = useMemo<Record<string, CarteiraSortColumn<AtaGroupedCard>>>(
    () => ({
      numero: { value: (c) => c.arp.numeroAtaRegistroPreco.split('/').reverse().join('/') },
      vigencia: { value: (c) => getArpVigenciaStatus(c.arp.dataVigenciaFinal)?.diasRestantes ?? null },
      itens: { value: (c) => c.itens.length || c.arp.quantidadeItens || 0, firstDir: 'desc' },
      consumo: { value: (c) => saldoStatsByAta[c.arp.numeroAtaRegistroPreco]?.maxPct ?? null, firstDir: 'desc' },
      gestor: { value: (c) => gestorByAta[c.arp.numeroAtaRegistroPreco] }
    }),
    [saldoStatsByAta, gestorByAta]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(cards, sortColumns);
  const sortProps = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };
  const { currentPage, setPage, pageItems: pageCards, signature } = useCarteiraPagination(
    sorted,
    useCallback((c: AtaGroupedCard) => c.key, []),
    pageSize
  );
  useEffect(() => {
    setOverrides({});
  }, [signature]);

  const query = busca.trim().toLowerCase();
  // Alocação, empenho e unidade só viram coluna quando filtrados (a tabela sem filtro fica como sempre foi).
  const colAlocacao = filters != null && filters.filtroAlocacao !== 'TODOS';
  const colEmpenho = filters != null && filters.filtroEmpenho !== 'TODOS';
  const colUnidade = filters != null && filters.unidade !== TODAS_UNIDADES;
  const totalColunas = 6 + Number(colAlocacao) + Number(colEmpenho) + Number(colUnidade);

  if (isLoading && totalAtas === 0) {
    return (
      <div className="ata-cards-container" aria-busy="true" aria-label="Carregando atas...">
        <AtaCardSkeleton />
        <AtaCardSkeleton />
        <AtaCardSkeleton />
      </div>
    );
  }

  if (totalAtas === 0) {
    return (
      <EmptyState
        title="Nenhuma Ata de Registro de Preços encontrada."
        description="Não há atas sincronizadas ou cadastradas para a unidade gerenciadora atual."
      />
    );
  }

  if (cards.length === 0) {
    return (
      <CarteiraNoResults
        title="Nenhuma Ata corresponde aos filtros aplicados."
        description="Altere os critérios selecionados ou limpe os filtros para visualizar a carteira completa de Atas."
        onResetFilters={onResetFilters}
      />
    );
  }

  return (
    <div data-testid="arp-portfolio-table" role="feed" aria-label="Lista de Atas de Registro de Preços" className="carteira-shell" style={carteiraTableShell}>
      <div style={{ overflowX: 'auto' }}>
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...carteiraTh, width: '32px', padding: '0.65rem 0.4rem' }} aria-label="Expandir" />
              <CarteiraSortHeader label="Ata" sortKey="numero" {...sortProps} />
              <CarteiraSortHeader label="Vigência" sortKey="vigencia" {...sortProps} />
              <CarteiraSortHeader label="Itens" sortKey="itens" {...sortProps} />
              <CarteiraSortHeader label="Maior consumo" sortKey="consumo" {...sortProps} />
              {colAlocacao && <th style={carteiraTh}>Alocação interna</th>}
              {colEmpenho && <th style={carteiraTh}>Empenho</th>}
              {colUnidade && <th style={carteiraTh}>Unidade</th>}
              <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {pageCards.map((card) => {
              const { arp } = card;
              const numeroAta = arp.numeroAtaRegistroPreco;
              const ataKey = `${numeroAta}-${arp.codigoUnidadeGerenciadora}`;
              const vigencia = getArpVigenciaStatus(arp.dataVigenciaFinal);
              const dias = vigencia ? vigencia.diasRestantes : null;
              const faixa = classifyPrazo(dias, Boolean(arp.isCanceladaPncp));
              const stats = saldoStatsByAta[numeroAta];
              const gestor = gestorByAta[numeroAta];
              const totalItens = card.itens.length || arp.quantidadeItens || 0;
              const isItemsLoading = Boolean(itemsLoadingByAta[ataKey]);
              const abrirAta = () => navigate(`/atas/detalhe/${encodeURIComponent(buildAtaKey(numeroAta, arp.codigoUnidadeGerenciadora))}`);

              const matchedItems = query
                ? card.itens.filter((item) =>
                    (item.descricaoItem || '').toLowerCase().includes(query) ||
                    (item.nomeRazaoSocialFornecedor || '').toLowerCase().includes(query)
                  )
                : [];
              const autoExpand = matchedItems.length > 0;
              const isExpanded = overrides[card.key] ?? autoExpand;

              // Itens de maior consumo primeiro; os que casaram com a busca vêm antes de tudo.
              const pctOf = (item: ArpItemRecord): number | null => stats?.pctByItem[normalizeItemNumber(item.numeroItem)] ?? null;
              const orderedItems = [...card.itens].sort((a, b) => {
                const aHit = matchedItems.includes(a) ? 1 : 0;
                const bHit = matchedItems.includes(b) ? 1 : 0;
                if (aHit !== bHit) return bHit - aHit;
                return (pctOf(b) ?? -1) - (pctOf(a) ?? -1);
              });
              const visibleItems = orderedItems.slice(0, MAX_ITENS_EXPANDIDOS);
              const hiddenCount = orderedItems.length - visibleItems.length;

              return (
                <React.Fragment key={card.key}>
                  <tr data-testid={`arp-row-${numeroAta}`} className="carteira-row-link" onClick={abrirAoClicarNaLinha(abrirAta)}>
                    <td data-role="expand" style={{ ...carteiraTd, padding: '0.7rem 0.4rem', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isExpanded) onExpandAta?.(arp);
                          setOverrides((prev) => ({ ...prev, [card.key]: !isExpanded }));
                        }}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Recolher itens da ata' : 'Expandir itens da ata'}
                        data-testid={`arp-expand-${numeroAta}`}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', padding: '0.2rem' }}
                      >
                        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                    </td>
                    <td data-role="id" style={{ ...carteiraTd, minWidth: '200px', maxWidth: '320px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem' }}>
                      <CarteiraIdLink onClick={abrirAta} label={`Ver detalhes da ata ${numeroAta}`} title={`Ver detalhes · UASG ${arp.codigoUnidadeGerenciadora}`} testId={`ata-360-link-${numeroAta}`}>
                        {numeroAta}
                      </CarteiraIdLink>
                      {card.fornecedorNome && (
                        <CarteiraCellFilter
                          descricao={`fornecedor ${card.fornecedorNome}`}
                          onFilter={onFilter ? () => onFilter('busca', card.fornecedorNome) : undefined}
                        >
                          <div title={card.fornecedorNome} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{card.fornecedorNome}</div>
                        </CarteiraCellFilter>
                      )}
                      </div>
                    </td>
                    <td data-label="Vigência" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <CarteiraCellFilter
                        descricao="esta situação de prazo"
                        onFilter={onFilter && situacaoDaFaixa(faixa) ? () => onFilter('statusVigencia', situacaoDaFaixa(faixa)!) : undefined}
                      >
                        <CarteiraPrazoPill faixa={faixa} diasRestantes={dias} />
                      </CarteiraCellFilter>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                        até {formatDateBR(arp.dataVigenciaFinal)}
                      </div>
                    </td>
                    <td data-label="Itens" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700 }}>{totalItens} {totalItens === 1 ? 'item' : 'itens'}</div>
                      {stats && (stats.criticos > 0 || stats.atencao > 0) ? (
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: stats.criticos > 0 ? 'var(--color-danger-text)' : 'var(--color-warning-text)' }}>
                          {[
                            stats.criticos > 0 ? `${stats.criticos} ${stats.criticos === 1 ? 'crítico' : 'críticos'}` : null,
                            stats.atencao > 0 ? `${stats.atencao} em atenção` : null
                          ].filter(Boolean).join(' · ')}
                        </div>
                      ) : null}
                    </td>
                    <td data-label="Maior consumo" style={carteiraTd}>
                      <SaldoBar pct={stats?.maxPct ?? null} />
                    </td>
                    {colAlocacao && (
                      <td data-label="Alocação interna" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                        <CarteiraCellFilter
                          descricao="este nível de alocação"
                          onFilter={onFilter && execucaoPorAta?.get(ataKey)?.nivelAlocacao ? () => onFilter('filtroAlocacao', execucaoPorAta.get(ataKey)!.nivelAlocacao!) : undefined}
                        >
                          <CarteiraNivelPill nivel={execucaoPorAta?.get(ataKey)?.nivelAlocacao ?? null} labels={NIVEL_ALOCACAO_LABEL} />
                        </CarteiraCellFilter>
                      </td>
                    )}
                    {colEmpenho && (
                      <td data-label="Empenho" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                        <CarteiraCellFilter
                          descricao="este nível de empenho"
                          onFilter={onFilter && execucaoPorAta?.get(ataKey)?.nivelEmpenho ? () => onFilter('filtroEmpenho', execucaoPorAta.get(ataKey)!.nivelEmpenho!) : undefined}
                        >
                          <CarteiraNivelPill nivel={execucaoPorAta?.get(ataKey)?.nivelEmpenho ?? null} labels={NIVEL_EMPENHO_LABEL} />
                        </CarteiraCellFilter>
                      </td>
                    )}
                    {colUnidade && (
                      <td data-label="Unidade" style={{ ...carteiraTd, whiteSpace: 'nowrap', fontWeight: 700 }}>
                        {unidades.find((u) => u.chave === filters?.unidade)?.nome ?? filters?.unidade}
                      </td>
                    )}
                    <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <ManagerCell gestorNome={gestor} canAssign={canAssign} testId={`arp-manager-${numeroAta}`} />
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="carteira-expanded" data-testid={`arp-expanded-${numeroAta}`}>
                      <td colSpan={totalColunas} style={CARTEIRA_EXPANDED_CELL_STYLE}>
                        {isItemsLoading ? (
                          <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Carregando itens…</div>
                        ) : orderedItems.length === 0 ? (
                          <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Nenhum item disponível.</div>
                        ) : (
                          <>
                            <CarteiraDetailLabel>Itens da ata</CarteiraDetailLabel>
                            {visibleItems.map((item, idx) => (
                              <div
                                key={`${item.numeroItem}-${item.codigoItem}-${idx}`}
                                className="arp-item-row"
                                style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) 120px 110px auto', gap: '0.75rem', alignItems: 'center', fontSize: '0.82rem', padding: '0.45rem 0', borderTop: '1px solid #e2e8f0' }}
                              >
                                <span style={{ fontWeight: 700 }}>{item.numeroItem}</span>
                                <span title={item.descricaoItem} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.descricaoItem}</span>
                                <span>{formatCurrencyOrDash(item.valorUnitario)}</span>
                                <SaldoBar pct={pctOf(item)} />
                                <button
                                  type="button"
                                  onClick={() => onSelectItem(arp, item)}
                                  data-testid={`arp-item-${numeroAta}-${item.numeroItem}`}
                                  style={carteiraButton}
                                >
                                  Ver saldo <ArrowRight size={13} />
                                </button>
                              </div>
                            ))}
                            {hiddenCount > 0 && (
                              <div style={{ fontSize: '0.76rem', color: 'var(--primary)', fontWeight: 700, paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
                                + {hiddenCount} {hiddenCount === 1 ? 'item' : 'itens'} · veja todos nos detalhes da ata
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <CarteiraPagination
        page={currentPage}
        pageSize={pageSize}
        total={cards.length}
        onChange={setPage}
        testIdPrefix="arp"
      />
    </div>
  );
};
