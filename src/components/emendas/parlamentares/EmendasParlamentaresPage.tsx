import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { PageContainer } from '../../../design-system/components/PageContainer';
import { PageHeader } from '../../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../../design-system/components/DataTable';
import { MetricStrip } from '../../../design-system/components/MetricStrip';
import { StatusBadge } from '../../../design-system/components/StatusBadge';
import { CarteiraFilterBar, carteiraCounter } from '../../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../../carteira/CarteiraFilterButton';
import { CarteiraSegmentTabs } from '../../carteira/CarteiraSegmentTabs';
import { CarteiraPagination } from '../../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../../carteira/useCarteiraSort';
import { carteiraDetalhe, carteiraNumero, carteiraValor } from '../../carteira/carteiraStyles';
import { AdminListShell } from '../../admin/shared/AdminListShell';
import { useNavigateWithOrigin } from '../../../hooks/useDetailOrigin';
import { hojeEmBrasilia, useAutoresEmendas, useItensCaep, useNotasDasLinhas, usePedidosEmendas } from '../../../hooks/useEmendas';
import { formatCurrency, formatNumber } from '../../../utils/format';
import { AUTOR_A_DEFINIR, AUTOR_A_DEFINIR_CHAVE } from '../../../utils/emendasPedidos';
import { ROTULO_SITUACAO_SOBRA, type SobraDoAutor } from '../../../utils/emendasSobra';
import { pagoPorParlamentar, type ExecucaoDoParlamentar } from '../../../utils/emendasParlamentar';
import type { AutorEmenda, NotaDaLinha, TipoAutor } from '../../../services/emendasService';
import { AutorDoPedido, LARGURA_AUTOR } from '../emendasPartes';
import { BarraDaEmenda } from './SobraDaEmendaCartao';
import { VARIANTE_SOBRA } from './sobraVisual';
import { useSobraDasEmendas } from './useSobraDasEmendas';

interface Linha {
  autorId: string | null;
  autor: AutorEmenda | undefined;
  pedidos: number;
  /** Emendas do ano corrente do parlamentar (migration 204). */
  emendas: SobraDoAutor | undefined;
  execucao: ExecucaoDoParlamentar | undefined;
}

type Tipo = 'todos' | TipoAutor;
const TIPOS: Array<{ id: TipoAutor; label: string }> = [
  { id: 'DEPUTADO', label: 'Deputados' },
  { id: 'SENADOR', label: 'Senadores' },
  { id: 'BANCADA', label: 'Bancadas' }
];
const POR_PAGINA = 25;
const SEM_NOTAS = new Map<string, NotaDaLinha>();
const chaveDaLinha = (l: Linha) => l.autorId ?? AUTOR_A_DEFINIR_CHAVE;
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ORDEM: Record<string, CarteiraSortColumn<Linha>> = {
  autor: { value: (l) => (l.autorId ? l.autor?.nome ?? l.autorId : null) },
  pedidos: { value: (l) => l.pedidos, firstDir: 'desc' },
  emendas: { value: (l) => l.emendas?.valor ?? null, firstDir: 'desc' },
  empenhado: { value: (l) => l.emendas?.empenhado ?? null, firstDir: 'desc' },
  pago: { value: (l) => l.execucao?.pago ?? null, firstDir: 'desc' },
  sobra: { value: (l) => l.emendas?.sobra ?? null, firstDir: 'desc' }
};
const vazio = <span style={{ ...carteiraDetalhe, marginTop: 0 }}>—</span>;

/**
 * Emendas › Parlamentares (protótipo aprovado em 27/10/2026): uma linha por parlamentar ou bancada com pedido, como
 * nas carteiras; a linha abre o Parlamentar 360. Substitui Pedidos › Por parlamentar. Filtros no endereço
 * (?tipo=, ?uf=, ?emendas=, ?mostrar=) para o Voltar do Parlamentar 360 trazer a lista como estava.
 */
export const EmendasParlamentaresPage: React.FC = () => {
  const { data: pedidos = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = usePedidosEmendas();
  const { data: notas = SEM_NOTAS } = useNotasDasLinhas();
  const { data: itensLista = [], isLoading: carregandoItens } = useItensCaep();
  const { data: autores = [] } = useAutoresEmendas();
  const hoje = hojeEmBrasilia();
  const ano = Number(hoje.slice(0, 4));
  const navegar = useNavigateWithOrigin();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busca, setBusca] = useState('');
  const tipo = (TIPOS.some((t) => t.id === searchParams.get('tipo')) ? searchParams.get('tipo') : 'todos') as Tipo;
  const uf = searchParams.get('uf') ?? '';
  const situacao = searchParams.get('emendas') ?? '';
  const mostrar = searchParams.get('mostrar') ?? '';
  const mudar = (chave: string, valor: string) =>
    setSearchParams(
      (atual) => {
        const prox = new URLSearchParams(atual);
        if (valor) prox.set(chave, valor);
        else prox.delete(chave);
        return prox;
      },
      { replace: true }
    );

  const itens = useMemo(() => new Map(itensLista.map((i) => [i.itemKey, i])), [itensLista]);
  const autorPorId = useMemo(() => new Map(autores.map((a) => [a.id, a])), [autores]);
  const ativos = useMemo(() => pedidos.filter((p) => p.etapa !== 'CANCELADO'), [pedidos]);
  const { emendas, porAutor, minimo } = useSobraDasEmendas(pedidos, itens, notas, ano);
  const pago = useMemo(() => pagoPorParlamentar(ativos, notas), [ativos, notas]);

  const linhas: Linha[] = useMemo(() => {
    const m = new Map<string, Linha>();
    for (const p of ativos) {
      // Reservas para órgãos (sem parlamentar ainda, migration 163) ficam juntas numa linha "Parlamentar a definir".
      const chave = p.autorId ?? '';
      const l = m.get(chave) ?? { autorId: p.autorId, autor: p.autorId ? autorPorId.get(p.autorId) : undefined, pedidos: 0, emendas: p.autorId ? porAutor.get(p.autorId) : undefined, execucao: p.autorId ? pago.get(p.autorId) : undefined };
      l.pedidos++;
      m.set(chave, l);
    }
    if (mostrar === 'todos') {
      for (const a of autores) if (!m.has(a.id)) m.set(a.id, { autorId: a.id, autor: a, pedidos: 0, emendas: porAutor.get(a.id), execucao: undefined });
    }
    // Quem tem mais em emendas primeiro; sem emenda do ano, pelo número de pedidos e o nome.
    return [...m.values()].sort(
      (a, b) => (b.emendas?.valor ?? 0) - (a.emendas?.valor ?? 0) || b.pedidos - a.pedidos || (a.autor?.nome ?? '').localeCompare(b.autor?.nome ?? '', 'pt-BR')
    );
  }, [ativos, autorPorId, autores, mostrar, porAutor, pago]);
  const semPedido = useMemo(() => {
    const com = new Set(ativos.map((p) => p.autorId));
    return autores.filter((a) => !com.has(a.id)).length;
  }, [ativos, autores]);

  const doTipo = linhas.filter((l) => tipo === 'todos' || l.autor?.tipo === tipo);
  const termo = semAcento(busca.trim());
  const naSituacao = (l: Linha) => !situacao || (situacao === 'sobra' ? (l.emendas?.sobra ?? 0) > 0 : l.emendas?.emendas.some((e) => e.situacao === 'conferir' || e.situacao === 'acima'));
  const filtradas = doTipo.filter((l) => naSituacao(l) && (!uf || l.autor?.uf === uf) && (!termo || semAcento(`${l.autorId ? l.autor?.nome ?? '' : AUTOR_A_DEFINIR} ${l.autor?.partido ?? ''} ${l.autor?.uf ?? ''}`).includes(termo)));
  const ufs = [...new Set(doTipo.map((l) => l.autor?.uf).filter((x): x is string => Boolean(x)))].sort().map((v) => ({ value: v, label: v, count: doTipo.filter((l) => l.autor?.uf === v).length }));
  const filtrosAtivos = Boolean(termo || uf || mostrar || situacao);
  const comSobra = emendas.filter((e) => e.situacao === 'sobra');
  const aConferir = emendas.filter((e) => e.situacao === 'conferir' || e.situacao === 'acima');
  const valorOu = (v: number | undefined) => (v == null ? vazio : <span style={carteiraNumero}>{formatCurrency(v)}</span>);
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, ORDEM);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chaveDaLinha, POR_PAGINA);

  const colunas: Column<Linha>[] = [
    { key: 'autor', header: 'Parlamentar', priority: 'primary', width: LARGURA_AUTOR, minWidth: LARGURA_AUTOR, sortValue: ORDEM.autor.value, render: (l) => <AutorDoPedido autor={l.autor} autorId={l.autorId} destaque /> },
    { key: 'pedidos', header: 'Pedidos', align: 'right', nowrap: true, sortValue: ORDEM.pedidos.value, sortFirstDir: 'desc', render: (l) => <span style={carteiraNumero}>{formatNumber(l.pedidos)}</span> },
    {
      key: 'emendas',
      header: `Emendas ${ano}`,
      align: 'right',
      nowrap: true,
      sortValue: ORDEM.emendas.value,
      sortFirstDir: 'desc',
      render: (l) =>
        l.emendas ? (
          <>
            <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatCurrency(l.emendas.valor)}</span>
            <div style={carteiraDetalhe}>{l.emendas.emendas.length === 1 ? '1 emenda' : `${l.emendas.emendas.length} emendas`}</div>
          </>
        ) : (
          vazio
        )
    },
    { key: 'empenhado', header: 'Empenhado', align: 'right', nowrap: true, sortValue: ORDEM.empenhado.value, sortFirstDir: 'desc', render: (l) => valorOu(l.emendas?.empenhado) },
    { key: 'pago', header: 'Pago', align: 'right', nowrap: true, sortValue: ORDEM.pago.value, sortFirstDir: 'desc', render: (l) => valorOu(l.execucao && l.execucao.notas > 0 ? l.execucao.pago : undefined) },
    {
      key: 'sobra',
      header: 'Sobra',
      align: 'right',
      nowrap: true,
      minWidth: '140px',
      sortValue: ORDEM.sobra.value,
      sortFirstDir: 'desc',
      render: (l) =>
        l.emendas ? (
          <>
            <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatCurrency(l.emendas.sobra)}</span>
            <BarraDaEmenda valor={l.emendas.valor} empenhado={l.emendas.empenhado} emAndamento={l.emendas.emAndamento} sobra={l.emendas.sobra} />
          </>
        ) : (
          vazio
        )
    },
    {
      key: 'situacao',
      header: 'Situação',
      render: (l) => (l.emendas?.situacao ? <StatusBadge label={ROTULO_SITUACAO_SOBRA[l.emendas.situacao]} variant={VARIANTE_SOBRA[l.emendas.situacao]} size="sm" dot={false} /> : vazio)
    }
  ];

  const contaTipo = (t: TipoAutor) => linhas.filter((l) => l.autor?.tipo === t).length;

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Parlamentares"
        subtitle="Quem tem emenda ou pedido com a CAEP: emendas do ano, o que já foi empenhado e pago e o que sobra."
        icon={<Users size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-parlamentares-atualizar" tooltipTitle="Recarregar" />}
      />
      <MetricStrip
        title={`Emendas de ${ano}`}
        testId="emendas-sobra-faixa"
        items={[
          { label: 'Emendas', value: formatNumber(emendas.length), hint: `${formatNumber(porAutor.size)} ${porAutor.size === 1 ? 'parlamentar' : 'parlamentares'}` },
          { label: 'Valor no SIOP', value: formatCurrency(emendas.reduce((t, e) => t + (e.valor ?? 0), 0)), hint: 'soma das emendas' },
          {
            label: 'Sobra para novo pedido',
            value: formatCurrency(comSobra.reduce((t, e) => t + e.sobra, 0)),
            hint: `${formatNumber(comSobra.length)} ${comSobra.length === 1 ? 'emenda' : 'emendas'}${minimo != null ? `, a partir de ${formatCurrency(minimo)}` : ''}`,
            tone: comSobra.length ? 'warning' : 'default'
          },
          { label: 'A conferir', value: formatNumber(aConferir.length), hint: 'itens sem nota ou empenhado acima do valor' }
        ]}
      />
      <CarteiraSegmentTabs<Tipo>
        testIdPrefix="emendas-parlamentares-tipo"
        ariaLabel="Tipo de parlamentar"
        active={tipo}
        onSelect={(t) => mudar('tipo', t === 'todos' ? '' : t)}
        segments={[...TIPOS.map((t) => ({ id: t.id as Tipo, label: t.label, count: contaTipo(t.id) })), { id: 'todos', label: 'Todos', count: linhas.length }]}
      />
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar pelo nome, partido ou UF..."
        onChangeBusca={setBusca}
        hasActiveFilters={filtrosAtivos}
        onResetFilters={() => {
          setBusca('');
          setSearchParams(tipo === 'todos' ? {} : { tipo }, { replace: true });
        }}
        counter={carteiraCounter(filtradas.length, doTipo.length, filtrosAtivos, 'parlamentar', 'parlamentares')}
        testIdPrefix="emendas-parlamentares"
      >
        <CarteiraFilterButton label="UF" value={uf} emptyValue="" options={ufs} onChange={(v) => mudar('uf', v)} testId="emendas-parlamentares-filtro-uf" />
        <CarteiraFilterButton
          label="Emendas"
          value={situacao}
          emptyValue=""
          options={[
            { value: 'sobra', label: 'Com sobra', count: doTipo.filter((l) => (l.emendas?.sobra ?? 0) > 0).length },
            { value: 'conferir', label: 'A conferir', count: doTipo.filter((l) => l.emendas?.emendas.some((e) => e.situacao === 'conferir' || e.situacao === 'acima')).length }
          ]}
          onChange={(v) => mudar('emendas', v)}
          testId="emendas-parlamentares-filtro-emendas"
        />
        <CarteiraFilterButton
          label="Mostrar"
          value={mostrar}
          emptyValue=""
          options={[{ value: 'todos', label: 'Também quem não tem pedido', count: semPedido }]}
          onChange={(v) => mudar('mostrar', v)}
          testId="emendas-parlamentares-filtro-mostrar"
        />
      </CarteiraFilterBar>

      <AdminListShell
        testId="emendas-parlamentares-lista"
        isLoading={isLoading || carregandoItens}
        isError={isError}
        errorTitle="Não foi possível carregar os parlamentares"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar os pedidos.'}
        onRetry={() => refetch()}
        isEmpty={!isLoading && !carregandoItens && filtradas.length === 0}
        emptyTitle={linhas.length === 0 ? 'Nenhum parlamentar com pedido.' : 'Nenhum parlamentar encontrado.'}
        emptyDescription={linhas.length === 0 ? 'Use "Mostrar" para ver também quem não tem pedido.' : 'Ajuste a busca ou os filtros.'}
      >
        <DataTable<Linha>
          testId="emendas-parlamentares-tabela"
          className="data-table-container--flush"
          data={pageItems}
          keyExtractor={chaveDaLinha}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={toggle}
          columns={colunas}
          // A linha abre o Parlamentar 360; "Parlamentar a definir" (reservas para órgãos) abre os pedidos dessas reservas.
          rowOpen={(l) => () => navegar(l.autorId ? `/emendas/parlamentares/${encodeURIComponent(l.autorId)}` : `/emendas/pedidos?autor=${AUTOR_A_DEFINIR_CHAVE}`)}
        />
        <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={sorted.length} onChange={setPage} testIdPrefix="emendas-parlamentares" />
      </AdminListShell>
    </PageContainer>
  );
};
