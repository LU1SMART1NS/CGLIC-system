import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { AtaCardSkeleton } from '../cards/AtaCardSkeleton';
import { EmptyState } from '../../design-system/components/EmptyState';
import { buildAtaKey } from '../../hooks/useAta';
import { getArpVigenciaStatus } from '../../services/temporalEngineService';
import { CarteiraPrazoPill } from '../carteira/CarteiraPrazoPill';
import { CarteiraDetailLabel, CARTEIRA_EXPANDED_CELL_STYLE } from '../carteira/CarteiraDetailLabel';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraNoResults } from '../carteira/CarteiraNoResults';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { ActionButton } from '../../design-system/components/ActionButton';
import { carteiraFornecedor, carteiraTableShell, carteiraTd, carteiraTdBarra, carteiraTh } from '../carteira/carteiraStyles';
import { classifyPrazo, situacaoDaFaixa } from '../carteira/carteiraPrazo';
import { CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { CarteiraCellFilter } from '../carteira/CarteiraCellFilter';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../carteira/CarteiraRowLink';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { ManagerCell } from '../carteira/ManagerAssign';
import { CarteiraNivelPill } from '../carteira/CarteiraNivelPill';
import { TODAS_UNIDADES } from '../carteira/CarteiraExecucaoSelects';
import { NIVEL_ALOCACAO_ATA_LABEL, NIVEL_EMPENHO_LABEL } from '../../utils/itemAtendimento';
import type { CarteiraAtaExecucao, CarteiraItemRow } from '../../utils/carteiraItens';
import { ItensDaAtaTabela } from './ItensDaAtaTabela';
import type { ArpPortfolioFilterState } from './ArpPortfolioFilters';
import { normalizeItemNumber, type AtaSaldoStats } from './ataSaldoStats';
import type { ArpRecord, ArpItemRecord, AtaGroupedCard } from '../../types';
import { chaveGestaoDaArp } from '../../utils/ataIdentidade';
import { AvisoCarregando } from '../../design-system';
import { ConsumoItensCelula, type ConsumoItem } from './ConsumoItensCelula';
import { SeloPapelSenasp } from './SeloPapelSenasp';
import { GtiCelulaAta } from '../gti/GtiVisual';
import { chaveAtaGti, type FatiasDaAta } from '../../config/gruposGti';
import { CarteiraNovoBadge } from '../carteira/CarteiraNovoBadge';
import { ataEhNova } from '../carteira/carteiraNovidade';

interface ArpPortfolioListProps {
  cards: AtaGroupedCard[];
  totalAtas: number;
  isLoading?: boolean;
  /** Resumo de consumo de saldo por número de ata. */
  saldoStatsByAta?: Record<string, AtaSaldoStats>;
  /** Alocação, empenho e unidades de cada ata (chave "{numeroAta}-{uasg}"), somados dos itens. */
  execucaoPorAta?: Map<string, CarteiraAtaExecucao>;
  /** Linhas dos itens (as mesmas da Carteira de Itens): saldo, alocação e empenho na tabela de itens da ata. */
  linhasDosItens?: CarteiraItemRow[];
  /** Gestor de saldo não vê empenho. */
  mostrarEmpenhoDosItens?: boolean;
  /** Fatia de cada GTI do ComprasSUSP por ata (chave "{numeroAta}-{uasg}", migration 139). */
  fatiasGti?: Map<string, FatiasDaAta>;
  /** Unidades internas (para exibir o nome da unidade filtrada). */
  unidades?: Array<{ chave: string; nome: string }>;
  /** Filtros ativos: alocação, empenho e unidade ganham uma coluna quando filtrados. */
  filters?: Pick<ArpPortfolioFilterState, 'filtroAlocacao' | 'filtroEmpenho' | 'unidade' | 'ataAssinada'>;
  /** Nome do gestor por número de ata. */
  gestorByAta?: Record<string, string>;
  /** Texto da busca — quando algum item da ata casa com ela, a linha abre já mostrando esse item. */
  busca?: string;
  onSelectArp: (arp: ArpRecord) => void;
  onSelectItem: (arp: ArpRecord, item: ArpItemRecord) => void;
  onResetFilters: () => void;
  pageSize?: number;
  /** Coordenador: "Sem gestor" vira atalho para a Central de Distribuição (a atribuição é feita só lá). */
  canAssign?: boolean;
  /** Clique num valor da célula aplica o filtro correspondente (prazo → situação, fornecedor → busca). */
  onFilter?: <K extends keyof ArpPortfolioFilterState>(key: K, value: ArpPortfolioFilterState[K]) => void;
}

const MAX_ITENS_EXPANDIDOS = 5;
const cardNovo = (c: AtaGroupedCard) => ataEhNova(c.arp);

function formatDateBR(dateStr?: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('T')[0].split('-');
  return y && m && d ? `${d}/${m}/${y}` : dateStr;
}

export const ArpPortfolioList: React.FC<ArpPortfolioListProps> = ({
  cards,
  totalAtas,
  isLoading = false,
  saldoStatsByAta = {},
  execucaoPorAta,
  linhasDosItens,
  mostrarEmpenhoDosItens = true,
  fatiasGti,
  unidades = [],
  filters,
  gestorByAta = {},
  busca = '',
  onSelectItem,
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
      consumo: { value: (c) => saldoStatsByAta[chaveGestaoDaArp(c.arp)]?.maxPct ?? null, firstDir: 'desc' },
      gestor: { value: (c) => gestorByAta[chaveGestaoDaArp(c.arp)] }
    }),
    [saldoStatsByAta, gestorByAta]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(cards, sortColumns, cardNovo);
  const sortProps = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };
  const linhaPorChave = useMemo(() => new Map((linhasDosItens ?? []).map((l) => [l.key, l])), [linhasDosItens]);
  const nomesDasUnidades = useMemo(() => new Map((unidades ?? []).map((u) => [u.chave, u.nome])), [unidades]);
  const nomeDaUnidade = useCallback((chave: string) => nomesDasUnidades.get(chave) ?? chave, [nomesDasUnidades]);
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
  const colAtaAssinada = filters != null && filters.ataAssinada !== 'TODOS';
  const totalColunas = 7 + Number(colAlocacao) + Number(colEmpenho) + Number(colUnidade) + Number(colAtaAssinada);

  if (isLoading && totalAtas === 0) {
    return (
      <div className="ata-cards-container" aria-busy="true" aria-label="Carregando atas...">
        <AvisoCarregando label="Carregando atas" />
        <AtaCardSkeleton />
        <AtaCardSkeleton />
        <AtaCardSkeleton />
      </div>
    );
  }

  if (totalAtas === 0) {
    return (
      <EmptyState
        title="Nenhuma ata de registro de preços encontrada."
        description="Não há atas sincronizadas ou cadastradas para a unidade gerenciadora atual."
      />
    );
  }

  if (cards.length === 0) {
    return (
      <CarteiraNoResults
        title="Nenhuma ata corresponde aos filtros aplicados."
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
              <CarteiraSortHeader label="Consumo dos itens" sortKey="consumo" {...sortProps} />
              <th style={carteiraTh} title="GTI com a maior fatia e a fatia de cada Grupo de Trabalho Integrado no valor registrado dos participantes (quantidade × valor unitário de cada item)">Interesse principal</th>
              {colAlocacao && <th style={carteiraTh}>Alocação interna</th>}
              {colEmpenho && <th style={carteiraTh}>Empenho</th>}
              {colAtaAssinada && <th style={carteiraTh}>Qtd. assinada</th>}
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
              const chaveGestao = chaveGestaoDaArp(arp);
              const stats = saldoStatsByAta[chaveGestao];
              const gestor = gestorByAta[chaveGestao];
              const totalItens = card.itens.length || arp.quantidadeItens || 0;
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
              const consumoItens: ConsumoItem[] = card.itens.flatMap((item) => {
                const pct = pctOf(item);
                return pct === null ? [] : [{ numero: normalizeItemNumber(item.numeroItem), descricao: item.descricaoItem || '', pct }];
              });
              const visibleItems = orderedItems.slice(0, MAX_ITENS_EXPANDIDOS);
              const hiddenCount = orderedItems.length - visibleItems.length;

              return (
                <React.Fragment key={card.key}>
                  <tr data-testid={`arp-row-${numeroAta}`} className="carteira-row-link" onClick={abrirAoClicarNaLinha(abrirAta)}>
                    <td data-role="expand" style={{ ...carteiraTd, padding: '0.7rem 0.4rem', textAlign: 'center' }}>
                      <ActionButton
                        action={isExpanded ? 'recolher' : 'expandir'}
                        iconOnly
                        type="button"
                        size="xs"
                        onClick={() => {
                          setOverrides((prev) => ({ ...prev, [card.key]: !isExpanded }));
                        }}
                        expanded={isExpanded}
                        label={isExpanded ? 'Recolher itens da ata' : 'Expandir itens da ata'}
                        data-testid={`arp-expand-${numeroAta}`}
                      />
                    </td>
                    <td data-role="id" style={{ ...carteiraTd, minWidth: '200px', maxWidth: '320px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '0.5rem', rowGap: '0.15rem' }}>
                      <CarteiraIdLink onClick={abrirAta} label={`Ver detalhes da ata ${numeroAta}`} title={`Ver detalhes · UASG ${arp.codigoUnidadeGerenciadora}`} testId={`ata-360-link-${numeroAta}`}>
                        {numeroAta}
                      </CarteiraIdLink>
                      {ataEhNova(arp) && <CarteiraNovoBadge genero="f" testId={`ata-nova-${numeroAta}`} />}
                      <SeloPapelSenasp arp={arp} testId={`ata-papel-${numeroAta}-${arp.codigoUnidadeGerenciadora}`} />
                      </div>
                      {card.fornecedorNome && (
                        <CarteiraCellFilter
                          descricao={`fornecedor ${card.fornecedorNome}`}
                          onFilter={onFilter ? () => onFilter('busca', card.fornecedorNome) : undefined}
                        >
                          <div title={card.fornecedorNome} style={carteiraFornecedor}>{card.fornecedorNome}</div>
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
                    <td data-label="Consumo dos itens" style={carteiraTdBarra}>
                      <ConsumoItensCelula itens={consumoItens} testId={`arp-consumo-${numeroAta}`} />
                    </td>
                    <td data-label="GTI" style={carteiraTdBarra}>
                      {(() => {
                        const fatias = fatiasGti?.get(chaveAtaGti(numeroAta, arp.codigoUnidadeGerenciadora));
                        const principal = fatias?.principal?.grupo;
                        return (
                          <CarteiraCellFilter
                            descricao="este GTI"
                            bloco
                            onFilter={onFilter && principal ? () => onFilter('gti', principal) : undefined}
                          >
                            <GtiCelulaAta fatias={fatias} testId={`arp-gti-${numeroAta}`} />
                          </CarteiraCellFilter>
                        );
                      })()}
                    </td>
                    {colAlocacao && (
                      <td data-label="Alocação interna" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                        <CarteiraCellFilter
                          descricao="este nível de alocação"
                          onFilter={onFilter && execucaoPorAta?.get(ataKey)?.nivelAlocacao ? () => onFilter('filtroAlocacao', execucaoPorAta.get(ataKey)!.nivelAlocacao!) : undefined}
                        >
                          <CarteiraNivelPill nivel={execucaoPorAta?.get(ataKey)?.nivelAlocacao ?? null} labels={NIVEL_ALOCACAO_ATA_LABEL} />
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
                    {colAtaAssinada && (
                      <td data-label="Qtd. assinada" style={{ ...carteiraTd, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {(() => {
                          const a = execucaoPorAta?.get(ataKey)?.ataAssinada;
                          if (!a) return '—';
                          return a.total === 1 ? (a.informados === 1 ? 'Informada' : 'A informar') : `${a.informados} de ${a.total} itens informados`;
                        })()}
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
                        {orderedItems.length === 0 ? (
                          // Os itens vêm só do banco (gravados pela sincronização do servidor); a faixa da carteira lista as atas sem itens.
                          <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Itens ainda não gravados no banco. A sincronização do servidor traz os itens de hora em hora.</div>
                        ) : (
                          <>
                            <CarteiraDetailLabel>Itens da ata</CarteiraDetailLabel>
                            <ItensDaAtaTabela
                              numeroAta={numeroAta}
                              itens={visibleItems}
                              linhaDoItem={(item) => linhaPorChave.get(`${ataKey}-${item.numeroItem}`)}
                              pctDoItem={pctOf}
                              nomeDaUnidade={nomeDaUnidade}
                              mostrarEmpenho={mostrarEmpenhoDosItens}
                              onSelectItem={(item) => onSelectItem(arp, item)}
                            />
                            {hiddenCount > 0 && (
                              <div style={{ fontSize: '0.76rem', color: 'var(--primary)', fontWeight: 700, paddingTop: '0.5rem' }}>
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
