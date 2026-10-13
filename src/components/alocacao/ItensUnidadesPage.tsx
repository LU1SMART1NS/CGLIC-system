import React, { useMemo, useState } from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import { EmptyState } from '../../design-system/components/EmptyState';
import { ActionButton, AppButton, AvisoCarregando } from '../../design-system';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useAuth } from '../../context/AuthContext';
import { useAtasPortfolio } from '../../hooks/useAtasPortfolio';
import { useCarteiraItens } from '../../hooks/useCarteiraItens';
import { buildAtaItemPath, buildAtaPath } from '../../hooks/useAta';
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
import { CarteiraPrazoPill } from '../carteira/CarteiraPrazoPill';
import { CarteiraDetailLabel, CARTEIRA_EXPANDED_CELL_STYLE } from '../carteira/CarteiraDetailLabel';
import { toSentenceCaseIfAllCaps } from '../../utils/textCase';
import { carteiraFornecedor, carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { SeloPapelSenasp } from '../atas/SeloPapelSenasp';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { TODOS_GESTORES, canFilterByGestor, listGestores, matchesGestorFilter } from '../carteira/carteiraGestor';
import { comparePrazo } from '../carteira/carteiraPrazo';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { NIVEL_ALOCACAO_LABEL, agregarNivel, type NivelAtendimento } from '../../utils/itemAtendimento';
import type { CarteiraItemRow } from '../../utils/carteiraItens';
import { formatNumber } from '../item-balances/itemBalanceUtils';
import { Boxes } from 'lucide-react';
import { PageHeader } from '../../design-system/components/PageHeader';
import { AlocarUnidadeModal, type ItemParaAlocar } from './AlocarUnidadeModal';
import { carteiraDaAta } from '../../utils/ataIdentidade';
import { formatDateBR } from '../../utils/format';


interface Filtros {
  nivel: string;
  vigencia: string;
  unidade: string;
  uasg: string;
  gestor: string;
  busca: string;
  ver: string;
}
const TODOS = 'TODOS';
const PAGE_SIZE = 20;
const SCHEMA: CarteiraFilterSchema<Filtros> = {
  nivel: { param: 'alocacao', default: 'SEM', values: ['SEM', 'PARCIAL', 'TOTAL', TODOS] },
  vigencia: { param: 'situacao', default: 'VIGENTES', values: ['VIGENTES', 'HISTORICO', TODOS] },
  unidade: { param: 'unidade', default: TODAS_UNIDADES },
  uasg: { param: 'uasg', default: TODOS },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  busca: { param: 'busca', default: '' },
  ver: { param: 'ver', default: 'ATA', values: ['ATA', 'ITEM'] }
};
const VERDE = 'var(--color-success)';
const AMARELO = 'var(--color-warning-solid)';
const VERMELHO = 'var(--color-danger)';
const subtle: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 600 };
const clamp2: React.CSSProperties = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
/** "00059/2025" → "2025/00059": ordena pelo ano e depois pelo número (igual à Carteira › Itens). */
const ataOrdem = (numero: string) => numero.split('/').reverse().join('/');
const NIVEL_ATA_LABEL: Record<NivelAtendimento, string> = { SEM: 'Sem alocação', PARCIAL: 'Parcialmente alocada', TOTAL: 'Alocada' };
const CHIP: Record<NivelAtendimento, { color: string; bg: string; label: (n: number) => string }> = {
  SEM: { color: 'var(--color-danger-text)', bg: 'var(--color-danger-bg)', label: () => 'sem' },
  PARCIAL: { color: 'var(--color-warning-text)', bg: 'var(--color-warning-bg)', label: () => 'parcial' },
  TOTAL: { color: 'var(--color-success-text)', bg: 'var(--color-success-bg)', label: (n) => (n === 1 ? 'alocado' : 'alocados') }
};

/** Alocado contra o quantitativo SENASP: número e barra (âmbar enquanto parcial, verde quando completo). */
const AlocadoBar: React.FC<{ alocado: number; senasp: number }> = ({ alocado, senasp }) => {
  const pct = senasp > 0 ? Math.min(100, (alocado / senasp) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '110px' }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatNumber(alocado)} <span style={subtle}>de {formatNumber(senasp)}</span>
      </span>
      <div aria-hidden="true" style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: senasp > 0 && alocado >= senasp ? 'var(--color-success-solid)' : 'var(--color-warning)' }} />
      </div>
    </div>
  );
};

/** Uma ata da carteira com os itens que têm quantitativo SENASP: o resumo soma todos; `visiveis` são os que passam nos filtros. */
interface GrupoAta {
  ataKey: string;
  primeiro: CarteiraItemRow;
  itens: CarteiraItemRow[];
  visiveis: CarteiraItemRow[];
  fornecedor: string | null;
  senasp: number;
  alocado: number;
  falta: number;
  nivel: NivelAtendimento;
  contagem: Record<NivelAtendimento, number>;
  /** A busca achou um item (e não a ata em si): a ata já abre mostrando o item. */
  achouItem: boolean;
}

/**
 * Alocação → Itens às unidades: os itens com o alocado contra o quantitativo SENASP (a mesma conta da Carteira › Itens),
 * em segmentos Sem alocação · Parcialmente alocados · Alocados. Por padrão agrupa por ata (a linha da ata abre os itens);
 * "Por item" mostra a lista corrida. O coordenador e o gestor de saldos alocam direto da linha do item; os demais consultam.
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
  const porAta = filters.ver === 'ATA';
  // Abrir/fechar à mão vence a abertura automática da busca; "todos" mostra também os itens fora da situação escolhida.
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const [todosItens, setTodosItens] = useState<Record<string, boolean>>({});

  // Itens com quantitativo SENASP conhecido: sem ele não há o que alocar.
  const base = useMemo(() => rows.filter((r) => r.quantitativoSenasp > 0), [rows]);
  const nivelCounts = useMemo(() => {
    const n: Record<NivelAtendimento, number> = { SEM: 0, PARCIAL: 0, TOTAL: 0 };
    for (const r of base) if (filters.vigencia === TODOS || (filters.vigencia === 'HISTORICO' ? r.faixa === 'EXPIRADO' : r.faixa !== 'EXPIRADO')) n[r.nivelAlocacao]++;
    return n;
  }, [base, filters.vigencia]);
  const uasgs = useMemo(() => {
    const m = new Map<string, number>();
    // Filtro pela carteira da CGLIC (nas atas de outros órgãos, a UASG da ata é a do outro órgão).
    for (const r of base) m.set(carteiraDaAta(r.arp), (m.get(carteiraDaAta(r.arp)) ?? 0) + 1);
    return m;
  }, [base]);
  const gestores = useMemo(() => listGestores(base.map((r) => r.gestorNome)), [base]);

  const busca = filters.busca.trim().toLowerCase();
  const ataCasaBusca = React.useCallback(
    (r: CarteiraItemRow) => !!busca && ((r.arp.numeroAtaRegistroPreco || '').toLowerCase().includes(busca) || (r.item.nomeRazaoSocialFornecedor || '').toLowerCase().includes(busca)),
    [busca]
  );
  const lista = useMemo(() => {
    return base
      .filter((r) => {
        if (filters.nivel !== TODOS && r.nivelAlocacao !== filters.nivel) return false;
        if (filters.vigencia === 'VIGENTES' && r.faixa === 'EXPIRADO') return false;
        if (filters.vigencia === 'HISTORICO' && r.faixa !== 'EXPIRADO') return false;
        if (filters.unidade !== TODAS_UNIDADES && !(r.alocadoPorUnidade[filters.unidade] > 0)) return false;
        if (filters.uasg !== TODOS && carteiraDaAta(r.arp) !== filters.uasg) return false;
        if (showGestorFilter && !matchesGestorFilter(r.gestorNome, filters.gestor)) return false;
        if (busca) {
          const casa =
            ataCasaBusca(r) ||
            String(r.item.numeroItem).toLowerCase().includes(busca) ||
            (r.item.descricaoItem || '').toLowerCase().includes(busca) ||
            Object.keys(r.alocadoPorUnidade).some((u) => u.includes(busca));
          if (!casa) return false;
        }
        return true;
      })
      .sort((a, b) => comparePrazo(a.diasRestantes, b.diasRestantes) || a.arp.numeroAtaRegistroPreco.localeCompare(b.arp.numeroAtaRegistroPreco) || Number(a.item.numeroItem) - Number(b.item.numeroItem));
  }, [base, filters, showGestorFilter, busca, ataCasaBusca]);

  const grupos = useMemo<GrupoAta[]>(() => {
    const todosDaAta = new Map<string, CarteiraItemRow[]>();
    for (const r of base) todosDaAta.set(r.ataKey, [...(todosDaAta.get(r.ataKey) ?? []), r]);
    const visiveis = new Map<string, CarteiraItemRow[]>();
    for (const r of lista) visiveis.set(r.ataKey, [...(visiveis.get(r.ataKey) ?? []), r]);
    // A ordem das atas segue a da lista de itens (prazo mais curto primeiro).
    return [...visiveis.entries()].map(([ataKey, vis]) => {
      const itens = [...(todosDaAta.get(ataKey) ?? vis)].sort((a, b) => Number(a.item.numeroItem) - Number(b.item.numeroItem));
      const contagem: Record<NivelAtendimento, number> = { SEM: 0, PARCIAL: 0, TOTAL: 0 };
      let senasp = 0;
      let alocado = 0;
      for (const r of itens) {
        contagem[r.nivelAlocacao]++;
        senasp += r.quantitativoSenasp;
        alocado += Math.min(r.alocado, r.quantitativoSenasp);
      }
      return {
        ataKey,
        primeiro: vis[0],
        itens,
        visiveis: vis,
        // Um fornecedor por ata: o nome vem dos itens.
        fornecedor: itens.map((r) => (r.item.nomeRazaoSocialFornecedor || '').trim()).find((n) => n && n !== 'FORNECEDOR NÃO INFORMADO') ?? null,
        senasp,
        alocado,
        falta: Math.max(0, senasp - alocado),
        nivel: agregarNivel(itens.map((r) => r.nivelAlocacao)) ?? 'SEM',
        contagem,
        achouItem: !!busca && !ataCasaBusca(vis[0])
      };
    });
  }, [base, lista, busca, ataCasaBusca]);

  const colunasItem = useMemo<Record<string, CarteiraSortColumn<CarteiraItemRow>>>(
    () => ({
      item: { value: (r) => `${ataOrdem(r.arp.numeroAtaRegistroPreco)}-${String(Number(r.item.numeroItem)).padStart(5, '0')}` },
      senasp: { value: (r) => r.quantitativoSenasp, firstDir: 'desc' },
      alocado: { value: (r) => (r.quantitativoSenasp > 0 ? r.alocado / r.quantitativoSenasp : 0), firstDir: 'desc' },
      falta: { value: (r) => r.quantitativoSenasp - r.alocado, firstDir: 'desc' },
      gestor: { value: (r) => r.gestorNome }
    }),
    []
  );
  const colunasAta = useMemo<Record<string, CarteiraSortColumn<GrupoAta>>>(
    () => ({
      ata: { value: (g) => ataOrdem(g.primeiro.arp.numeroAtaRegistroPreco) },
      vigencia: { value: (g) => g.primeiro.diasRestantes ?? Number.MAX_SAFE_INTEGER },
      itens: { value: (g) => g.itens.length, firstDir: 'desc' },
      alocado: { value: (g) => (g.senasp > 0 ? g.alocado / g.senasp : 0), firstDir: 'desc' },
      falta: { value: (g) => g.falta, firstDir: 'desc' },
      gestor: { value: (g) => g.primeiro.gestorNome }
    }),
    []
  );
  const itensOrdenados = useCarteiraSort(lista, colunasItem);
  const atasOrdenadas = useCarteiraSort(grupos, colunasAta);
  const sortItem = { activeKey: itensOrdenados.sortKey, activeDir: itensOrdenados.sortDir, onSort: itensOrdenados.toggle };
  const sortAta = { activeKey: atasOrdenadas.sortKey, activeDir: atasOrdenadas.sortDir, onSort: atasOrdenadas.toggle };
  const paginaItens = useCarteiraPagination(itensOrdenados.sorted, React.useCallback((r: CarteiraItemRow) => r.key, []), PAGE_SIZE);
  const paginaAtas = useCarteiraPagination(atasOrdenadas.sorted, React.useCallback((g: GrupoAta) => g.ataKey, []), PAGE_SIZE);

  const abrirItem = (r: CarteiraItemRow) => navigate(`${buildAtaItemPath(r.arp.numeroAtaRegistroPreco, r.arp.codigoUnidadeGerenciadora, r.item.numeroItem)}?aba=quantitativos`);
  const abrirAta = (r: CarteiraItemRow) => navigate(buildAtaPath(r.arp.numeroAtaRegistroPreco, r.arp.codigoUnidadeGerenciadora));
  const alocar = (r: CarteiraItemRow) =>
    setAlocando({ numeroAta: r.arp.numeroAtaRegistroPreco, uasg: r.arp.codigoUnidadeGerenciadora, numeroItem: String(r.item.numeroItem), descricao: r.item.descricaoItem, quantitativoSenasp: r.quantitativoSenasp });
  const estaAberta = (g: GrupoAta) => abertas[g.ataKey] ?? g.achouItem;
  const todasAbertas = paginaAtas.pageItems.length > 0 && paginaAtas.pageItems.every(estaAberta);
  const abrirOuFecharTodas = () =>
    setAbertas((prev) => {
      const next = { ...prev };
      for (const g of paginaAtas.pageItems) next[g.ataKey] = !todasAbertas;
      return next;
    });

  if (syncError && arps.length === 0) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState title="Erro ao carregar os itens" message={syncError} onRetry={() => reload()} />
      </PageContainer>
    );
  }
  const hasActive = hasActiveCarteiraFilters(SCHEMA, { ...filters, ver: SCHEMA.ver.default }) && filters.nivel === SCHEMA.nivel.default;
  const isBusy = (isLoading && arps.length === 0) || scopeLoading || loadingExecucao;
  const nivelAtivo = (filters.nivel === TODOS ? 'TODOS' : filters.nivel) as NivelAtendimento | 'TODOS';
  const nomeUnidade = (u: string) => unidades.find((x) => x.chave === u)?.nome ?? u;

  /** Colunas do item, as mesmas na lista corrida e dentro da ata aberta. */
  const celulasDoItem = (r: CarteiraItemRow, comAta: boolean) => {
    const falta = Math.max(0, r.quantitativoSenasp - r.alocado);
    const unidadesDoItem = Object.entries(r.alocadoPorUnidade).filter(([, q]) => q > 0);
    return (
      <>
        <td data-role="id" style={{ ...carteiraTd, minWidth: '240px', maxWidth: '380px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
            <CarteiraIdLink onClick={() => abrirItem(r)} label={`Abrir o item ${r.item.numeroItem} da ata ${r.arp.numeroAtaRegistroPreco}`} title="Abrir o item na aba Quantitativos">
              {r.item.numeroItem}
            </CarteiraIdLink>
            {comAta && (
              <>
                <span style={subtle}>·</span>
                <CarteiraCellFilter descricao={`ata ${r.arp.numeroAtaRegistroPreco}`} onFilter={() => setFilter('busca', r.arp.numeroAtaRegistroPreco)}>
                  <span style={{ ...subtle, fontWeight: 700 }} title={`UASG ${r.arp.codigoUnidadeGerenciadora}`}>
                    Ata {r.arp.numeroAtaRegistroPreco}
                  </span>
                </CarteiraCellFilter>
                {r.faixa === 'EXPIRADO' && <span style={subtle}>· ata encerrada</span>}
              </>
            )}
          </div>
          <div title={r.item.descricaoItem} style={{ fontSize: '0.8rem', color: '#0f172a', marginTop: '0.15rem', ...clamp2 }}>
            {toSentenceCaseIfAllCaps(r.item.descricaoItem) || '—'}
          </div>
        </td>
        <td data-label="Quantitativo SENASP" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(r.quantitativoSenasp)} un</td>
        <td data-label="Alocado" style={carteiraTd}>
          <AlocadoBar alocado={r.alocado} senasp={r.quantitativoSenasp} />
        </td>
        <td data-label="Unidades" style={{ ...carteiraTd, fontSize: '0.8rem' }}>
          {unidadesDoItem.length > 0 ? unidadesDoItem.map(([u, q]) => `${nomeUnidade(u)} ${formatNumber(q)}`).join(' · ') : <span style={{ color: '#94a3b8' }}>—</span>}
        </td>
        <td data-label="Contratado" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {r.contratada != null && r.contratada > 0 ? (
            <>
              {formatNumber(r.contratada)} un
              {r.contratadoSemUnidade > 0 && (
                <div style={{ ...subtle, color: 'var(--color-warning-text)' }} title="Contratado que ainda não foi dividido entre as unidades internas">
                  {formatNumber(r.contratadoSemUnidade)} sem unidade
                </div>
              )}
            </>
          ) : (
            <span style={{ color: '#94a3b8' }}>—</span>
          )}
        </td>
        <td data-label="Falta alocar" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: falta > 0 ? 'var(--color-warning-text)' : undefined }}>
          {falta > 0 ? `${formatNumber(falta)} un` : '—'}
        </td>
        <td data-label="Situação" style={carteiraTd}>
          <CarteiraNivelPill nivel={r.nivelAlocacao} labels={NIVEL_ALOCACAO_LABEL} />
        </td>
        {comAta && showGestorFilter && (
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
      </>
    );
  };

  const tabelaPorItem = (
    <div data-testid="vinc-itens-table" className="carteira-shell" style={carteiraTableShell}>
      <div style={{ overflowX: 'auto' }}>
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <CarteiraSortHeader label="Item" sortKey="item" {...sortItem} />
              <CarteiraSortHeader label="Quantitativo SENASP" sortKey="senasp" align="right" {...sortItem} />
              <CarteiraSortHeader label="Alocado" sortKey="alocado" {...sortItem} />
              <th style={carteiraTh}>Unidades</th>
              <th style={{ ...carteiraTh, textAlign: 'right' }}>Contratado</th>
              <CarteiraSortHeader label="Falta alocar" sortKey="falta" align="right" {...sortItem} />
              <th style={carteiraTh}>Situação</th>
              {showGestorFilter && <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sortItem} />}
              {podeAlocar && <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>}
            </tr>
          </thead>
          <tbody>
            {paginaItens.pageItems.map((r) => (
              <tr key={r.key} data-testid={`vinc-itens-row-${r.key}`} className="carteira-row-link" onClick={abrirAoClicarNaLinha(() => abrirItem(r))}>
                {celulasDoItem(r, true)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CarteiraPagination page={paginaItens.currentPage} pageSize={PAGE_SIZE} total={itensOrdenados.sorted.length} onChange={paginaItens.setPage} testIdPrefix="vinc-itens" />
    </div>
  );

  const totalColunasAta = 7 + (showGestorFilter ? 1 : 0);
  const tabelaPorAta = (
    <div data-testid="vinc-atas-table" className="carteira-shell" style={carteiraTableShell}>
      <div style={{ overflowX: 'auto' }}>
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...carteiraTh, width: '32px', padding: '0.65rem 0.4rem' }} aria-label="Abrir itens" />
              <CarteiraSortHeader label="Ata" sortKey="ata" {...sortAta} />
              <CarteiraSortHeader label="Vigência" sortKey="vigencia" {...sortAta} />
              <CarteiraSortHeader label="Itens" sortKey="itens" {...sortAta} />
              <CarteiraSortHeader label="Alocado (soma)" sortKey="alocado" {...sortAta} />
              <CarteiraSortHeader label="Falta alocar" sortKey="falta" align="right" {...sortAta} />
              <th style={carteiraTh}>Situação</th>
              {showGestorFilter && <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sortAta} />}
            </tr>
          </thead>
          <tbody>
            {paginaAtas.pageItems.map((g) => {
              const { arp } = g.primeiro;
              const numero = arp.numeroAtaRegistroPreco;
              const aberta = estaAberta(g);
              const alternar = () => setAbertas((prev) => ({ ...prev, [g.ataKey]: !aberta }));
              const mostrarTodos = todosItens[g.ataKey] || filters.nivel === TODOS;
              const itensMostrados = mostrarTodos ? g.itens : g.visiveis;
              const outros = g.itens.length - g.visiveis.length;
              return (
                <React.Fragment key={g.ataKey}>
                  <tr
                    data-testid={`vinc-atas-row-${g.ataKey}`}
                    className="carteira-row-link"
                    aria-expanded={aberta}
                    onClick={abrirAoClicarNaLinha(alternar)}
                  >
                    <td data-role="expand" style={{ ...carteiraTd, padding: '0.7rem 0.4rem', textAlign: 'center' }}>
                      <ActionButton
                        action={aberta ? 'recolher' : 'expandir'}
                        iconOnly
                        type="button"
                        size="xs"
                        onClick={alternar}
                        expanded={aberta}
                        label={aberta ? `Fechar os itens da ata ${numero}` : `Abrir os itens da ata ${numero}`}
                        data-testid={`vinc-atas-expand-${g.ataKey}`}
                      />
                    </td>
                    <td data-role="id" style={{ ...carteiraTd, minWidth: '200px', maxWidth: '320px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '0.5rem', rowGap: '0.15rem' }}>
                          <CarteiraIdLink onClick={() => abrirAta(g.primeiro)} label={`Abrir a ata ${numero}`} title={`Abrir a Ata 360 · UASG ${arp.codigoUnidadeGerenciadora}`}>
                            {numero}
                          </CarteiraIdLink>
                          <SeloPapelSenasp arp={arp} testId={`vinc-atas-papel-${g.ataKey}`} />
                        </div>
                        {g.fornecedor && (
                          <CarteiraCellFilter descricao={`fornecedor ${g.fornecedor}`} onFilter={() => setFilter('busca', g.fornecedor!)}>
                            <div title={g.fornecedor} style={carteiraFornecedor}>
                              {g.fornecedor}
                            </div>
                          </CarteiraCellFilter>
                        )}
                      </div>
                    </td>
                    <td data-label="Vigência" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <CarteiraPrazoPill faixa={g.primeiro.faixa} diasRestantes={g.primeiro.diasRestantes} />
                      {arp.dataVigenciaFinal && <div style={{ ...subtle, fontWeight: 400, marginTop: '0.2rem' }}>até {formatDateBR(arp.dataVigenciaFinal)}</div>}
                    </td>
                    <td data-label="Itens" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {g.itens.length} {g.itens.length === 1 ? 'item' : 'itens'}
                        </div>
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                          {(['SEM', 'PARCIAL', 'TOTAL'] as const)
                            .filter((n) => g.contagem[n] > 0)
                            .map((n) => (
                              <span key={n} style={{ fontSize: '0.7rem', fontWeight: 700, borderRadius: '4px', padding: '0.05rem 0.4rem', color: CHIP[n].color, background: CHIP[n].bg }}>
                                {g.contagem[n]} {CHIP[n].label(g.contagem[n])}
                              </span>
                            ))}
                        </div>
                      </div>
                    </td>
                    <td data-label="Alocado" style={carteiraTd}>
                      <AlocadoBar alocado={g.alocado} senasp={g.senasp} />
                    </td>
                    <td data-label="Falta alocar" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: g.falta > 0 ? 'var(--color-warning-text)' : undefined }}>
                      {g.falta > 0 ? `${formatNumber(g.falta)} un` : '—'}
                    </td>
                    <td data-label="Situação" style={carteiraTd}>
                      <CarteiraNivelPill nivel={g.nivel} labels={NIVEL_ATA_LABEL} />
                    </td>
                    {showGestorFilter && (
                      <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                        {g.primeiro.gestorNome ? (
                          <CarteiraCellFilter descricao={`gestor ${g.primeiro.gestorNome}`} onFilter={() => setFilter('gestor', g.primeiro.gestorNome!)}>
                            <span>{g.primeiro.gestorNome}</span>
                          </CarteiraCellFilter>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                    )}
                  </tr>
                  {aberta && (
                    <tr className="carteira-expanded" data-testid={`vinc-atas-itens-${g.ataKey}`}>
                      <td colSpan={totalColunasAta} style={CARTEIRA_EXPANDED_CELL_STYLE}>
                        <CarteiraDetailLabel>{mostrarTodos ? 'Itens da ata' : `Itens da ata · ${NIVEL_ALOCACAO_LABEL[filters.nivel as NivelAtendimento].toLowerCase()}`}</CarteiraDetailLabel>
                        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto' }}>
                          <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={carteiraTh}>Item</th>
                                <th style={{ ...carteiraTh, textAlign: 'right' }}>Quantitativo SENASP</th>
                                <th style={carteiraTh}>Alocado</th>
                                <th style={carteiraTh}>Unidades</th>
                                <th style={{ ...carteiraTh, textAlign: 'right' }}>Contratado</th>
                                <th style={{ ...carteiraTh, textAlign: 'right' }}>Falta alocar</th>
                                <th style={carteiraTh}>Situação</th>
                                {podeAlocar && <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {itensMostrados.map((r) => (
                                <tr key={r.key} data-testid={`vinc-itens-row-${r.key}`} className="carteira-row-link" onClick={abrirAoClicarNaLinha(() => abrirItem(r))}>
                                  {celulasDoItem(r, false)}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {outros > 0 && filters.nivel !== TODOS && (
                          <AppButton
                            variant="link"
                            size="sm"
                            type="button"
                            onClick={() => setTodosItens((prev) => ({ ...prev, [g.ataKey]: !prev[g.ataKey] }))}
                            data-testid={`vinc-atas-todos-${g.ataKey}`}
                            style={{ marginTop: '0.5rem' }}
                          >
                            {todosItens[g.ataKey] ? 'Mostrar só os itens desta situação' : `Mostrar os outros ${outros} ${outros === 1 ? 'item' : 'itens'} da ata`}
                          </AppButton>
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
      <CarteiraPagination page={paginaAtas.currentPage} pageSize={PAGE_SIZE} total={atasOrdenadas.sorted.length} onChange={paginaAtas.setPage} testIdPrefix="vinc-atas" />
    </div>
  );

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Itens a alocar às unidades internas"
        subtitle="Quanto de cada item da ata cada unidade interna recebeu, comparado ao quantitativo SENASP."
        hint="Alocado é o que as unidades internas receberam, comparado ao quantitativo SENASP do item (a mesma conta da Carteira › Itens). Por ata, clique na linha para abrir os itens; o número da ata abre a Ata 360. Só o coordenador e o gestor de saldos alocam; os demais perfis consultam."
        icon={<Boxes size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <CarteiraSegmentTabs
            testIdPrefix="vinc-itens-ver"
            ariaLabel="Ver por"
            active={filters.ver as 'ATA' | 'ITEM'}
            onSelect={(v) => setFilter('ver', v)}
            segments={[
              { id: 'ATA', label: 'Por ata', count: grupos.length, title: 'Uma linha por ata; clique para abrir os itens' },
              { id: 'ITEM', label: 'Por item', count: lista.length, title: 'Lista corrida de itens' }
            ]}
          />
        }
      />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando itens...">
          <AvisoCarregando label="Carregando itens" />
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
              { id: 'TOTAL', label: 'Alocados', count: nivelCounts.TOTAL, dot: VERDE, title: 'O alocado alcança o quantitativo SENASP' },
              { id: 'PARCIAL', label: 'Parcialmente alocados', count: nivelCounts.PARCIAL, dot: AMARELO, title: 'O alocado não alcança o quantitativo SENASP' },
              { id: 'SEM', label: 'Sem alocação', count: nivelCounts.SEM, dot: VERMELHO, title: 'Nenhuma unidade recebeu o item' },
              { id: 'TODOS', label: 'Todos', count: nivelCounts.SEM + nivelCounts.PARCIAL + nivelCounts.TOTAL }
            ]}
          />

          <CarteiraFilterBar
            busca={filters.busca}
            searchPlaceholder="Buscar por ata, fornecedor, item, descrição, unidade..."
            onChangeBusca={(v) => {
              setAbertas({});
              setFilter('busca', v);
            }}
            hasActiveFilters={hasActive}
            onResetFilters={resetFilters}
            counter={
              porAta
                ? `${lista.length} ${lista.length === 1 ? 'item' : 'itens'} em ${grupos.length} ${grupos.length === 1 ? 'ata' : 'atas'}`
                : carteiraCounter(lista.length, base.length, hasActive, 'item', 'itens')
            }
            testIdPrefix="vinc-itens"
          >
            <CarteiraFilterButton
              label="Vigência"
              value={filters.vigencia}
              emptyValue={TODOS}
              options={[
                { value: 'VIGENTES', label: 'Vigentes' },
                { value: 'HISTORICO', label: 'Encerradas' }
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
          ) : porAta ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <AppButton variant="link" size="sm" type="button" onClick={abrirOuFecharTodas} data-testid="vinc-atas-abrir-todas">
                  {todasAbertas ? 'Fechar todas' : 'Abrir todas'}
                </AppButton>
              </div>
              {tabelaPorAta}
            </div>
          ) : (
            tabelaPorItem
          )}
        </>
      )}

      <AlocarUnidadeModal item={alocando} onFechar={() => setAlocando(null)} />
    </PageContainer>
  );
};
