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
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { carteiraDetalhe, carteiraValor } from '../carteira/carteiraStyles';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { hojeEmBrasilia, useItensCaep, usePedidosEmendas, usePodeGerirEmendas } from '../../hooks/useEmendas';
import { formatCurrencyCompact, formatNumber } from '../../utils/format';
import { descricaoItemEmFrase } from '../../utils/textCase';
import { buscarItensCaep, rotuloItemDaAta } from '../../utils/emendasKits';
import { PrecoDaEmenda, ValoresEmBarra, VigenciaDaAta } from './emendasPartes';
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

// Nome na ata em até 2 linhas e descrição em 1: o texto inteiro aparece ao passar o mouse e no Item 360.
const DUAS_LINHAS: React.CSSProperties = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
const UMA_LINHA: React.CSSProperties = { ...DUAS_LINHAS, WebkitLineClamp: 1 };

// Ordenação pelo cabeçalho, como nas carteiras (?ordem=); sem escolha, pela descrição do item.
const ORDEM: Record<string, CarteiraSortColumn<Linha>> = {
  item: { value: (l) => descricaoItemEmFrase(l.descricao) },
  quadro: { value: (l) => l.nomeCurto },
  gti: { value: (l) => (l.fatias?.principal ? GRUPO_GTI_INFO[l.fatias.principal.grupo].rotulo : null) },
  vigencia: { value: (l) => l.vigenciaFinal },
  alocado: { value: (l) => l.alocado, firstDir: 'desc' },
  reservado: { value: (l) => l.reservado, firstDir: 'desc' },
  saldo: { value: (l) => l.saldo, firstDir: 'desc' },
  valor: { value: (l) => l.preco, firstDir: 'desc' }
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
  const { precos } = usePrecosParaEmenda();
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

  const linhas: Linha[] = useMemo(() => montarLinhasItensCaep(itens, pedidos, precos, hoje, fatiasItens), [itens, pedidos, precos, hoje, fatiasItens]);

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
  // Alocado e reservado pelo preço de hoje, o mesmo do quadro do parlamentar.
  const valorAlocado = vigentes.reduce((s, l) => s + l.alocado * l.preco, 0);
  const valorReservado = vigentes.reduce((s, l) => s + Math.min(l.reservado, l.alocado) * l.preco, 0);

  // Vindo do kit: o trilho vai para a situação do item e a busca deixa só ele.
  const alvo = abrir ? linhas.find((l) => l.itemKey === abrir) : undefined;
  useEffect(() => {
    if (!alvo) return;
    setSegmento(situacao(alvo));
    setBusca(`${alvo.numeroAta} item ${Number(alvo.numeroItem)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo?.itemKey]);

  // D6 da revisão das tabelas (30/10/2026): item, nome na ata e descrição numa coluna; vigência e preço em Ata; alocado,
  // reservado e saldo como uma barra. Cada coluna juntada ordena pelo valor escolhido no cabeçalho.
  const colunas: Column<Linha>[] = [
    {
      key: 'item',
      header: 'Item',
      priority: 'primary',
      minWidth: '280px',
      sortOptions: [
        { key: 'item', label: 'Descrição', sortValue: ORDEM.item.value },
        { key: 'quadro', label: 'Nome na ata', sortValue: ORDEM.quadro.value }
      ],
      render: (l) => {
        const descricao = descricaoItemEmFrase(l.descricao);
        return (
          <>
            <div style={{ ...carteiraDetalhe, marginTop: 0, fontWeight: 700, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem' }}>
              <span>{rotuloItemDaAta(l)}</span>
              {l.gnd ? <span>· {l.gnd === 'GND-4' ? 'GND-4 · Investimento' : 'GND-3 · Custeio'}</span> : <StatusBadge label="GND a informar" variant="warning" size="sm" dot={false} />}
            </div>
            {l.nomeCurto ? (
              <div style={{ ...carteiraValor, ...DUAS_LINHAS }} title={l.nomeCurto}>
                {l.nomeCurto}
              </div>
            ) : (
              <div style={{ ...carteiraDetalhe, color: 'var(--color-warning-text)' }}>sem nome da ata assinada</div>
            )}
            <div style={{ ...carteiraDetalhe, ...UMA_LINHA }} title={descricao}>
              {descricao}
            </div>
          </>
        );
      }
    },
    {
      key: 'gti',
      header: 'Interesse principal',
      minWidth: '150px',
      sortValue: ORDEM.gti.value,
      render: (l) => <GtiCelulaAta fatias={l.fatias} testId={`emendas-itens-gti-${l.itemKey}`} />
    },
    {
      key: 'ata',
      header: 'Ata',
      nowrap: true,
      sortOptions: [
        { key: 'vigencia', label: 'Vigência', sortValue: ORDEM.vigencia.value },
        { key: 'valor', label: 'Valor', sortValue: ORDEM.valor.value, sortFirstDir: 'desc' }
      ],
      render: (l) => (
        <>
          <VigenciaDaAta item={l} hoje={hoje} />
          <div style={{ ...carteiraDetalhe, display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
            <PrecoDaEmenda valor={l.preco} reajuste={l.reajuste} />
          </div>
        </>
      )
    },
    {
      key: 'saldo',
      header: 'Saldo da CAEP',
      minWidth: '220px',
      sortOptions: [
        { key: 'saldo', label: 'Saldo', sortValue: ORDEM.saldo.value, sortFirstDir: 'desc' },
        { key: 'alocado', label: 'Alocado à CAEP', sortValue: ORDEM.alocado.value, sortFirstDir: 'desc' },
        { key: 'reservado', label: 'Reservado', sortValue: ORDEM.reservado.value, sortFirstDir: 'desc' }
      ],
      render: (l) => (
        <ValoresEmBarra
          total={formatNumber(l.saldo)}
          rotulo={`livres de ${formatNumber(l.alocado)}`}
          max={l.alocado}
          partes={[{ valor: Math.min(l.reservado, l.alocado), tom: 'forte' }]}
          legenda={[{ rotulo: 'Reservado', valor: l.pedidos > 0 ? `${formatNumber(l.reservado)} · ${l.pedidos === 1 ? '1 pedido' : `${l.pedidos} pedidos`}` : formatNumber(l.reservado), tom: 'forte' }]}
          testId={`emendas-itens-barra-${l.itemKey}`}
        />
      )
    }
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Itens"
        subtitle="Quanto de cada item alocado à CAEP já foi reservado a parlamentares."
        hint="Saldo = alocado à CAEP − reservado nos pedidos não cancelados (kits abertos nos itens). O valor é o preço de hoje da ata, o mesmo do quadro do parlamentar e do empenho. Perto do reajuste da ata o item sai da reserva e o motivo aparece embaixo do valor."
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
