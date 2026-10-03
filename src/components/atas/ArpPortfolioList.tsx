import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { AtaCardSkeleton } from '../cards/AtaCardSkeleton';
import { EmptyState } from '../../design-system/components/EmptyState';
import { buildAtaKey } from '../../hooks/useAta';
import { getArpVigenciaStatus } from '../../services/temporalEngineService';
import { CarteiraPrazoPill } from '../carteira/CarteiraPrazoPill';
import { CarteiraDetailLabel, CARTEIRA_EXPANDED_CELL_STYLE } from '../carteira/CarteiraDetailLabel';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { carteiraButton, carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { classifyPrazo } from '../carteira/carteiraPrazo';
import { ManagerCell, type ManagerAssignContext } from '../carteira/ManagerAssign';
import { normalizeItemNumber, saldoBarColor, type AtaSaldoStats } from './ataSaldoStats';
import type { ArpRecord, ArpItemRecord, AtaGroupedCard } from '../../types';

interface ArpPortfolioListProps {
  cards: AtaGroupedCard[];
  totalAtas: number;
  isLoading?: boolean;
  itemsLoadingByAta?: Record<string, boolean>;
  /** Resumo de consumo de saldo por número de ata. */
  saldoStatsByAta?: Record<string, AtaSaldoStats>;
  /** Nome do gestor por número de ata. */
  gestorByAta?: Record<string, string>;
  /** Texto da busca — quando algum item da ata casa com ela, a linha abre já mostrando esse item. */
  busca?: string;
  onSelectArp: (arp: ArpRecord) => void;
  onSelectItem: (arp: ArpRecord, item: ArpItemRecord) => void;
  onExpandAta?: (arp: ArpRecord) => void;
  onResetFilters: () => void;
  pageSize?: number;
  /** Atribuição de gestor na própria carteira (admin e gestor). */
  canAssign?: boolean;
  assignContext?: ManagerAssignContext;
}

const MAX_ITENS_EXPANDIDOS = 5;

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return '—';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

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
  gestorByAta = {},
  busca = '',
  onSelectItem,
  onExpandAta,
  onResetFilters,
  pageSize = 15,
  canAssign = false,
  assignContext = { links: [] }
}) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  /** Escolha explícita do usuário por linha; sem escolha vale o padrão (abrir só se a busca casar com algum item). */
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  // Só volta à página 1 quando o conjunto listado muda (filtro/busca).
  const cardsSignature = useMemo(() => cards.map((c) => c.key).join('|'), [cards]);
  useEffect(() => {
    setPage(1);
    setOverrides({});
  }, [cardsSignature]);

  const query = busca.trim().toLowerCase();
  const currentPage = Math.min(page, Math.max(1, Math.ceil(cards.length / pageSize)));
  const pageCards = useMemo(
    () => cards.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [cards, currentPage, pageSize]
  );

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
          Nenhuma Ata corresponde aos filtros aplicados.
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', maxWidth: '400px' }}>
          Altere os critérios selecionados ou limpe os filtros para visualizar a carteira completa de Atas.
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

  return (
    <div data-testid="arp-portfolio-table" role="feed" aria-label="Lista de Atas de Registro de Preços" style={carteiraTableShell}>
      <div style={{ overflowX: 'auto' }}>
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...carteiraTh, width: '32px', padding: '0.65rem 0.4rem' }} aria-label="Expandir" />
              <th style={carteiraTh}>Ata</th>
              <th style={carteiraTh}>Fornecedor / Objeto</th>
              <th style={carteiraTh}>Vigência</th>
              <th style={carteiraTh}>Itens</th>
              <th style={carteiraTh}>Maior consumo</th>
              <th style={carteiraTh}>Gestor</th>
              <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>
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
                  <tr data-testid={`arp-row-${numeroAta}`}>
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
                    <td data-label="Ata" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 800 }}>ATA {numeroAta}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>UASG {arp.codigoUnidadeGerenciadora}</div>
                    </td>
                    <td style={{ ...carteiraTd, maxWidth: '220px', minWidth: '170px' }}>
                      <div style={{ fontWeight: 600, color: '#334155' }}>{card.fornecedorNome}</div>
                      {arp.objeto && (
                        <div
                          title={arp.objeto}
                          style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {arp.objeto}
                        </div>
                      )}
                    </td>
                    <td data-label="Vigência" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <CarteiraPrazoPill faixa={faixa} diasRestantes={dias} />
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                        até {formatDateBR(arp.dataVigenciaFinal)}
                      </div>
                    </td>
                    <td data-label="Itens" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700 }}>{totalItens} {totalItens === 1 ? 'item' : 'itens'}</div>
                      {stats && (stats.criticos > 0 || stats.atencao > 0) ? (
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: stats.criticos > 0 ? '#b91c1c' : '#b45309' }}>
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
                    <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <ManagerCell
                        target={{ tipo: 'ATA', ataKey: numeroAta }}
                        gestorNome={gestor}
                        canAssign={canAssign}
                        testId={`arp-manager-${numeroAta}`}
                        links={assignContext.links}
                        contractsByKey={assignContext.contractsByKey}
                      />
                    </td>
                    <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/atas/detalhe/${encodeURIComponent(buildAtaKey(numeroAta, arp.codigoUnidadeGerenciadora))}`)}
                        data-testid={`ata-360-link-${numeroAta}`}
                        style={carteiraButton}
                      >
                        Ver Detalhes <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="carteira-expanded" data-testid={`arp-expanded-${numeroAta}`}>
                      <td colSpan={8} style={CARTEIRA_EXPANDED_CELL_STYLE}>
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
                                <span>{formatCurrency(item.valorUnitario)}</span>
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
                              <div style={{ fontSize: '0.76rem', color: '#0c326f', fontWeight: 700, paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
                                + {hiddenCount} {hiddenCount === 1 ? 'item' : 'itens'} · veja todos em Ver Detalhes
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
