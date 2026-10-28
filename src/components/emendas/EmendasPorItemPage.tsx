import React, { useEffect, useMemo, useState } from 'react';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { buildAtaItemPath } from '../../hooks/useAta';
import { useSearchParams } from 'react-router-dom';
import { Boxes } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { ActionButton } from '../../design-system/components/ActionButton';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { ProgressBar } from '../../design-system/components/ProgressBar';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { carteiraDetalhe, carteiraNumero, carteiraValor } from '../carteira/carteiraStyles';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { hojeEmBrasilia, useItensCaep, usePedidosEmendas, usePodeGerirEmendas } from '../../hooks/useEmendas';
import { formatCurrencyCompact, formatNumber } from '../../utils/format';
import { descricaoItemEmFrase } from '../../utils/textCase';
import { buscarItensCaep, rotuloItemDaAta } from '../../utils/emendasKits';
import { ItemDaAta, ValorPrevisto, VigenciaDaAta } from './emendasPartes';
import { usePrecosParaEmenda } from '../../hooks/useEmendasQuadro';
import { DadosItemModal } from './DadosItemModal';
import { itemComSaldo, montarLinhasItensCaep, type LinhaItemCaep } from '../../utils/emendasItensSaldo';
import type { ItemCaep } from '../../services/emendasService';
import { GtiCelulaAta } from '../gti/GtiVisual';
import { ROTULO_GTI_ITENS, useFatiasItensGtiLeitura } from '../../hooks/useGruposGti';
import { GRUPO_GTI_INFO } from '../../config/gruposGti';
import { useLeiturasComFalha } from '../fonte/useLeiturasComFalha';
import { FontesComFalhaAviso } from '../fonte/FontesComFalhaAviso';

type Segmento = 'com' | 'sem' | 'encerrada' | 'todos';
type Linha = LinhaItemCaep;

// Ordenação pelo cabeçalho, como nas carteiras (?ordem=); sem escolha, pela descrição do item.
const ORDEM: Record<string, CarteiraSortColumn<Linha>> = {
  item: { value: (l) => descricaoItemEmFrase(l.descricao) },
  quadro: { value: (l) => l.nomeCurto },
  gti: { value: (l) => (l.fatias?.principal ? GRUPO_GTI_INFO[l.fatias.principal.grupo].rotulo : null) },
  vigencia: { value: (l) => l.vigenciaFinal },
  alocado: { value: (l) => l.alocado, firstDir: 'desc' },
  reservado: { value: (l) => l.reservado, firstDir: 'desc' },
  saldo: { value: (l) => l.saldo, firstDir: 'desc' },
  valor: { value: (l) => l.previsto, firstDir: 'desc' }
};

interface Props {
  /** Seletor Por item · Por kit da aba Itens de Emendas, no cabeçalho. */
  seletor?: React.ReactNode;
  /** Item que chega filtrado (vindo da composição de um kit). */
  abrir?: string | null;
  /** Botão Exportar da aba Itens (itens e kits com saldo), ao lado de Atualizar. */
  exportar?: React.ReactNode;
}

/**
 * Emendas › Itens › Por item (migration 157): todos os itens com alocação para a CAEP, quanto já está reservado nos pedidos
 * (kits abertos) e o saldo a oferecer. A linha inteira abre o Item 360 na aba Emendas, que mostra quem reservou, em que
 * fase está cada pedido e em quais kits o item entra (decisão de 24/10/2026: a lista é só o saldo).
 */
export const EmendasPorItemPage: React.FC<Props> = ({ seletor, abrir, exportar }) => {
  const { data: itens = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useItensCaep();
  const { data: pedidos = [], refetch: recarregarPedidos } = usePedidosEmendas();
  const hoje = hojeEmBrasilia();
  const { precos, ipca } = usePrecosParaEmenda();
  // Interesse por GTI de cada item (migration 139): a mesma coluna da Carteira › Itens.
  const { fatias: fatiasItens, consulta: fatiasItensQuery } = useFatiasItensGtiLeitura();
  const leituras = useLeiturasComFalha([{ rotulo: ROTULO_GTI_ITENS, query: fatiasItensQuery }]);
  const [segmento, setSegmento] = useState<Segmento>('todos');
  // Vindo do Início (saldo livre perto do fim): ?busca= já filtra o item.
  const [searchParams] = useSearchParams();
  const [busca, setBusca] = useState(() => searchParams.get('busca') ?? '');
  const podeGerir = usePodeGerirEmendas();
  const [editando, setEditando] = useState<ItemCaep | null>(null);
  const navigate = useNavigateWithOrigin();

  const linhas: Linha[] = useMemo(() => montarLinhasItensCaep(itens, pedidos, precos, ipca, fatiasItens), [itens, pedidos, precos, ipca, fatiasItens]);

  const situacao = (l: Linha): Segmento => (l.ataEncerrada ? 'encerrada' : itemComSaldo(l) ? 'com' : 'sem');
  const contagem = useMemo(() => {
    const c: Record<Segmento, number> = { com: 0, sem: 0, encerrada: 0, todos: linhas.length };
    for (const l of linhas) c[situacao(l)]++;
    return c;
  }, [linhas]);

  const doSegmento = linhas.filter((l) => segmento === 'todos' || situacao(l) === segmento);
  const filtradas = (buscarItensCaep(doSegmento, busca) as Linha[]).sort((a, b) => descricaoItemEmFrase(a.descricao).localeCompare(descricaoItemEmFrase(b.descricao), 'pt-BR'));
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, ORDEM);
  const vigentes = linhas.filter((l) => !l.ataEncerrada);
  // O alocado é o que a CAEP tem hoje (preço de hoje); o reservado vai para as emendas (preço previsto, o do quadro).
  const valorAlocado = vigentes.reduce((s, l) => s + l.alocado * l.hoje, 0);
  const valorReservado = vigentes.reduce((s, l) => s + Math.min(l.reservado, l.alocado) * l.previsto, 0);

  // Vindo do kit: o trilho vai para a situação do item e a busca deixa só ele.
  const alvo = abrir ? linhas.find((l) => l.itemKey === abrir) : undefined;
  useEffect(() => {
    if (!alvo) return;
    setSegmento(situacao(alvo));
    setBusca(`${alvo.numeroAta} item ${Number(alvo.numeroItem)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo?.itemKey]);

  const colunas: Column<Linha>[] = [
    {
      key: 'item',
      header: 'Item',
      priority: 'primary',
      minWidth: '280px',
      sortValue: ORDEM.item.value,
      render: (l) => <ItemDaAta item={l} />
    },
    {
      key: 'quadro',
      header: 'Nome na Ata',
      minWidth: '160px',
      sortValue: ORDEM.quadro.value,
      render: (l) => (
        <>
          {l.nomeCurto ? <div style={carteiraValor}>{l.nomeCurto}</div> : <div style={{ ...carteiraDetalhe, marginTop: 0 }}>sem nome da ata assinada</div>}
          <div style={{ marginTop: '0.2rem' }}>
            {l.gnd ? <StatusBadge label={l.gnd === 'GND-4' ? 'GND-4 · Investimento' : 'GND-3 · Custeio'} variant="neutral" size="sm" dot={false} /> : <StatusBadge label="GND a informar" variant="warning" size="sm" dot={false} />}
          </div>
        </>
      )
    },
    {
      key: 'gti',
      header: 'Interesse principal',
      minWidth: '150px',
      sortValue: ORDEM.gti.value,
      render: (l) => <GtiCelulaAta fatias={l.fatias} testId={`emendas-itens-gti-${l.itemKey}`} />
    },
    {
      key: 'vigencia',
      header: 'Vigência',
      nowrap: true,
      sortValue: ORDEM.vigencia.value,
      render: (l) => <VigenciaDaAta item={l} hoje={hoje} />
    },
    { key: 'alocado', header: 'Alocado à CAEP', align: 'right', nowrap: true, sortValue: ORDEM.alocado.value, sortFirstDir: 'desc', render: (l) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatNumber(l.alocado)}</span> },
    {
      key: 'reservado',
      header: 'Reservado',
      align: 'right',
      nowrap: true,
      sortValue: ORDEM.reservado.value,
      sortFirstDir: 'desc',
      render: (l) => (
        <>
          <div style={carteiraNumero}>{formatNumber(l.reservado)}</div>
          {l.pedidos > 0 && <div style={carteiraDetalhe}>{l.pedidos === 1 ? '1 pedido' : `${l.pedidos} pedidos`}</div>}
          <div style={{ marginTop: 4, minWidth: 80 }} aria-hidden="true">
            <ProgressBar value={Math.min(l.reservado, l.alocado)} max={l.alocado} showPercent={false} height="4px" colorScheme="primary" testId={`emendas-itens-barra-${l.itemKey}`} />
          </div>
        </>
      )
    },
    {
      key: 'saldo',
      header: 'Saldo',
      align: 'right',
      nowrap: true,
      sortValue: ORDEM.saldo.value,
      sortFirstDir: 'desc',
      render: (l) => <span style={{ ...carteiraValor, ...carteiraNumero, color: l.saldo <= 0 ? 'var(--text-muted)' : undefined }}>{formatNumber(l.saldo)}</span>
    },
    { key: 'valor', header: 'Valor previsto', align: 'right', nowrap: true, sortValue: ORDEM.valor.value, sortFirstDir: 'desc', render: (l) => <ValorPrevisto previsto={l.previsto} hoje={l.hoje} nota={l.nota} /> }
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Itens"
        subtitle="Quanto de cada item alocado à CAEP já foi reservado a parlamentares."
        hint="Saldo = alocado à CAEP − reservado nos pedidos não cancelados (kits abertos nos itens). O valor é o previsto para a emenda, com o reajuste da ata (o mesmo do quadro do parlamentar); o reservado soma pelo preço previsto e o alocado pelo preço de hoje."
        icon={<Boxes size={26} color="var(--primary)" aria-hidden="true" />}
        viewToggle={seletor}
        actions={
          <>
            {exportar}
            <HeaderRefreshAction onRefresh={() => Promise.all([refetch(), recarregarPedidos()])} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-itens-atualizar" tooltipTitle="Recarregar os itens e os pedidos" />
          </>
        }
      />

      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-itens-situacao"
        ariaLabel="Saldo dos itens"
        active={segmento}
        onSelect={setSegmento}
        meta={valorAlocado > 0 ? `${formatCurrencyCompact(valorReservado)} reservados · ${formatCurrencyCompact(valorAlocado)} alocados` : undefined}
        segments={[
          { id: 'com', label: 'Com saldo', count: contagem.com, dot: 'var(--color-success)' },
          { id: 'sem', label: 'Sem saldo', count: contagem.sem, dot: 'var(--color-warning-solid)' },
          { id: 'todos', label: 'Todos', count: contagem.todos },
          { id: 'encerrada', label: 'Ata encerrada', count: contagem.encerrada }
        ]}
      />

      <FontesComFalhaAviso falhas={leituras.falhas} onTentar={() => void leituras.tentarDeNovo()} tentando={leituras.tentando} onde="dos itens" testIdPrefix="emendas-itens-fontes" />

      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar pela descrição, ata (ex.: 31/2025) ou item (ex.: item 2)..."
        onChangeBusca={setBusca}
        hasActiveFilters={Boolean(busca.trim())}
        onResetFilters={() => setBusca('')}
        counter={carteiraCounter(filtradas.length, doSegmento.length, Boolean(busca.trim()), 'item', 'itens')}
        testIdPrefix="emendas-itens"
      />

      <AdminListShell
        testId="emendas-itens-lista"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar os itens da CAEP"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar os itens.'}
        onRetry={() => refetch()}
        isEmpty={!isLoading && filtradas.length === 0}
        emptyTitle={itens.length === 0 ? 'A CAEP ainda não tem itens alocados.' : 'Nenhum item nesta situação.'}
        emptyDescription={itens.length === 0 ? 'O gestor de saldo aloca os itens à CAEP em Alocação.' : 'Ajuste a busca ou escolha outra situação.'}
      >
        <DataTable<Linha>
          testId="emendas-itens-tabela"
          className="data-table-container--flush"
          data={sorted}
          keyExtractor={(l) => l.itemKey}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={toggle}
          rowStyle={(l) => (l.ataEncerrada ? { opacity: 0.7 } : undefined)}
          columns={colunas}
          rowOpen={(l) => () => navigate(`${buildAtaItemPath(l.numeroAta, l.codigoUasg, l.numeroItem)}?aba=emendas`)}
          rowActions={
            podeGerir
              ? (l) => <ActionButton action="editar" iconOnly label={`Nome na ata assinada e GND de ${l.nomeCurto ?? rotuloItemDaAta(l)}`} onClick={() => setEditando(l)} data-testid={`emendas-itens-dados-${l.itemKey}`} />
              : undefined
          }
        />
      </AdminListShell>

      {editando && <DadosItemModal item={editando} onClose={() => setEditando(null)} />}
    </PageContainer>
  );
};
