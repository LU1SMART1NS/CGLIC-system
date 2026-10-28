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
import { hojeEmBrasilia, useAutoresEmendas, useItensCaep, useMapaGruposBeneficiarios, useNotasDasLinhas, usePedidosEmendas } from '../../../hooks/useEmendas';
import { contarPorGti, passaFiltroGti, type FatiasDaAta } from '../../../config/gruposGti';
import { GRUPOS_CAPTACAO, fatiasDaCaptacao, lerFiltroCaptacao, lerModoCaptacao } from '../../../config/captacaoEmendas';
import { CelulaCaptacao, FiltroCaptacao } from '../CaptacaoDoPedido';
import { formatCurrency, formatNumber } from '../../../utils/format';
import { AUTOR_A_DEFINIR, AUTOR_A_DEFINIR_CHAVE } from '../../../utils/emendasPedidos';
import { ROTULO_SITUACAO_SOBRA, type SobraDoAutor } from '../../../utils/emendasSobra';
import { pagoPorParlamentar, type ExecucaoDoParlamentar } from '../../../utils/emendasParlamentar';
import type { AutorEmenda, NotaDaLinha, PedidoEmenda, TipoAutor } from '../../../services/emendasService';
import { AutorDoPedido, LARGURA_AUTOR } from '../emendasPartes';
import { BarraDaEmenda } from './SobraDaEmendaCartao';
import { VARIANTE_SOBRA } from './sobraVisual';
import { useSobraDasEmendas } from './useSobraDasEmendas';
import { AnoDaEmenda } from '../AnoDaEmenda';
import { ANO_SEM, anoEncerrado, contagemPorAno, lerAnoDaUrl, pedidoNoAno } from '../../../utils/emendasAno';

interface Linha {
  autorId: string | null;
  autor: AutorEmenda | undefined;
  pedidos: number;
  /** Emendas do ano escolhido do parlamentar (migration 204). */
  emendas: SobraDoAutor | undefined;
  /** Com "sem ano": as emendas dos pedidos que têm o número, mas não o ano (sem sobra: o Portal não é lido). */
  semAno?: { emendas: number; valor: number };
  execucao: ExecucaoDoParlamentar | undefined;
  /** Pedidos do parlamentar, para a Captação principal (migration 218). */
  lista: PedidoEmenda[];
  captacao?: FatiasDaAta;
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
/** Sobra no ano corrente; "Não empenhado" (crédito perdido) num ano encerrado. */
const restoDa = (e: SobraDoAutor | undefined, encerrado: boolean) => (e ? (encerrado ? e.naoEmpenhado : e.sobra) : undefined);
const ordem = (encerrado: boolean): Record<string, CarteiraSortColumn<Linha>> => ({
  autor: { value: (l) => (l.autorId ? l.autor?.nome ?? l.autorId : null) },
  pedidos: { value: (l) => l.pedidos, firstDir: 'desc' },
  emendas: { value: (l) => l.emendas?.valor ?? l.semAno?.valor ?? null, firstDir: 'desc' },
  empenhado: { value: (l) => l.emendas?.empenhado ?? null, firstDir: 'desc' },
  pago: { value: (l) => l.execucao?.pago ?? null, firstDir: 'desc' },
  sobra: { value: (l) => restoDa(l.emendas, encerrado) ?? null, firstDir: 'desc' }
});
const vazio = <span style={{ ...carteiraDetalhe, marginTop: 0 }}>—</span>;

/**
 * Emendas › Parlamentares (protótipo aprovado em 27/10/2026): uma linha por parlamentar ou bancada com pedido, como
 * nas carteiras; a linha abre o Parlamentar 360. Substitui Pedidos › Por parlamentar. Filtros no endereço
 * (?ano=, ?tipo=, ?uf=, ?emendas=, ?mostrar=) para o Voltar do Parlamentar 360 trazer a lista como estava.
 * Ano da emenda (28/10/2026): abre no ano corrente; num ano encerrado a Sobra vira "Não empenhado"; "sem ano" mostra
 * os pedidos com o nº da emenda e sem o ano. Sem "Todos os anos": somaria sobra com crédito perdido.
 */
export const EmendasParlamentaresPage: React.FC = () => {
  const { data: pedidos = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = usePedidosEmendas();
  const { data: notas = SEM_NOTAS } = useNotasDasLinhas();
  const { data: itensLista = [], isLoading: carregandoItens } = useItensCaep();
  const { data: autores = [] } = useAutoresEmendas();
  const hoje = hojeEmBrasilia();
  const anoCorrente = Number(hoje.slice(0, 4));
  const navegar = useNavigateWithOrigin();
  const [searchParams, setSearchParams] = useSearchParams();
  const filtroAno = lerAnoDaUrl(searchParams.get('ano'), anoCorrente, false);
  const semAnoEscolhido = filtroAno === ANO_SEM;
  const ano = semAnoEscolhido ? anoCorrente : Number(filtroAno);
  const encerrado = anoEncerrado(filtroAno, anoCorrente);
  const [busca, setBusca] = useState('');
  const tipo = (TIPOS.some((t) => t.id === searchParams.get('tipo')) ? searchParams.get('tipo') : 'todos') as Tipo;
  const uf = searchParams.get('uf') ?? '';
  const situacao = searchParams.get('emendas') ?? '';
  const mostrar = searchParams.get('mostrar') ?? '';
  // Captação principal (migration 218), como em Pedidos: ?captacao= e ?captacaoConta=.
  const filtroCaptacao = lerFiltroCaptacao(searchParams.get('captacao'));
  const modoCaptacao = lerModoCaptacao(searchParams.get('captacaoConta'));
  const gruposDosBeneficiarios = useMapaGruposBeneficiarios();
  const mudarUrl = (mudar: (p: URLSearchParams) => void) =>
    setSearchParams((atual) => {
      const prox = new URLSearchParams(atual);
      mudar(prox);
      return prox;
    });
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
  const anoDaUrl = searchParams.get('ano');
  const ativos = useMemo(() => pedidos.filter((p) => p.etapa !== 'CANCELADO' && pedidoNoAno(p, lerAnoDaUrl(anoDaUrl, anoCorrente, false))), [pedidos, anoDaUrl, anoCorrente]);
  const anosDoSeletor = contagemPorAno(pedidos, anoCorrente);
  const { emendas, porAutor, minimo, precos } = useSobraDasEmendas(pedidos, itens, notas, ano);
  const pago = useMemo(() => pagoPorParlamentar(ativos, notas), [ativos, notas]);

  const linhas: Linha[] = useMemo(() => {
    const m = new Map<string, Linha>();
    for (const p of ativos) {
      // Reservas para órgãos (sem parlamentar ainda, migration 163) ficam juntas numa linha "Parlamentar a definir".
      const chave = p.autorId ?? '';
      const emendasDoAutor = p.autorId && !semAnoEscolhido ? porAutor.get(p.autorId) : undefined;
      const l = m.get(chave) ?? { autorId: p.autorId, autor: p.autorId ? autorPorId.get(p.autorId) : undefined, pedidos: 0, emendas: emendasDoAutor, execucao: p.autorId ? pago.get(p.autorId) : undefined, lista: [] };
      l.pedidos++;
      l.lista.push(p);
      m.set(chave, l);
    }
    if (mostrar === 'todos') {
      for (const a of autores) if (!m.has(a.id)) m.set(a.id, { autorId: a.id, autor: a, pedidos: 0, emendas: semAnoEscolhido ? undefined : porAutor.get(a.id), execucao: undefined, lista: [] });
    }
    for (const l of m.values()) {
      if (l.lista.length) l.captacao = fatiasDaCaptacao(l.lista, gruposDosBeneficiarios, itens, precos);
      if (semAnoEscolhido) {
        // O valor de cada emenda uma vez só (cada pedido guarda o da emenda inteira).
        const porEmenda = new Map<string, number>();
        for (const p of l.lista) if (p.siopEmenda) porEmenda.set(p.siopEmenda, Math.max(porEmenda.get(p.siopEmenda) ?? 0, p.siopValor ?? 0));
        l.semAno = { emendas: porEmenda.size, valor: [...porEmenda.values()].reduce((t, v) => t + v, 0) };
      }
    }
    // Quem tem mais em emendas primeiro; sem emenda do ano, pelo número de pedidos e o nome.
    const valorDa = (l: Linha) => l.emendas?.valor ?? l.semAno?.valor ?? 0;
    return [...m.values()].sort((a, b) => valorDa(b) - valorDa(a) || b.pedidos - a.pedidos || (a.autor?.nome ?? '').localeCompare(b.autor?.nome ?? '', 'pt-BR'));
  }, [ativos, autorPorId, autores, mostrar, porAutor, pago, gruposDosBeneficiarios, itens, precos, semAnoEscolhido]);
  const semPedido = useMemo(() => {
    const com = new Set(ativos.map((p) => p.autorId));
    return autores.filter((a) => !com.has(a.id)).length;
  }, [ativos, autores]);
  const ORDEM = ordem(encerrado);

  const doTipo = linhas.filter((l) => tipo === 'todos' || l.autor?.tipo === tipo);
  const termo = semAcento(busca.trim());
  const naSituacao = (l: Linha) => !situacao || (situacao === 'sobra' ? (restoDa(l.emendas, encerrado) ?? 0) > 0 : l.emendas?.emendas.some((e) => e.situacao === 'conferir' || e.situacao === 'acima'));
  const filtradas = doTipo.filter((l) => naSituacao(l) && (!uf || l.autor?.uf === uf) && passaFiltroGti(l.captacao, filtroCaptacao, modoCaptacao) && (!termo || semAcento(`${l.autorId ? l.autor?.nome ?? '' : AUTOR_A_DEFINIR} ${l.autor?.partido ?? ''} ${l.autor?.uf ?? ''}`).includes(termo)));
  const ufs = [...new Set(doTipo.map((l) => l.autor?.uf).filter((x): x is string => Boolean(x)))].sort().map((v) => ({ value: v, label: v, count: doTipo.filter((l) => l.autor?.uf === v).length }));
  const filtrosAtivos = Boolean(termo || uf || mostrar || situacao || filtroCaptacao !== 'TODOS');
  const naoEmpenhadas = emendas.filter((e) => e.situacao === 'naoEmpenhado');
  const contagemCaptacao = contarPorGti(doTipo.map((l) => l.captacao), modoCaptacao, GRUPOS_CAPTACAO);
  const comSobra = emendas.filter((e) => e.situacao === 'sobra');
  const aConferir = emendas.filter((e) => e.situacao === 'conferir' || e.situacao === 'acima');
  const valorOu = (v: number | undefined) => (v == null ? vazio : <span style={carteiraNumero}>{formatCurrency(v)}</span>);
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, ORDEM);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chaveDaLinha, POR_PAGINA);

  const colunas: Column<Linha>[] = [
    { key: 'autor', header: 'Parlamentar', priority: 'primary', width: LARGURA_AUTOR, minWidth: LARGURA_AUTOR, sortValue: ORDEM.autor.value, render: (l) => <AutorDoPedido autor={l.autor} autorId={l.autorId} destaque /> },
    { key: 'pedidos', header: 'Pedidos', align: 'right', nowrap: true, sortValue: ORDEM.pedidos.value, sortFirstDir: 'desc', render: (l) => <span style={carteiraNumero}>{formatNumber(l.pedidos)}</span> },
    {
      key: 'captacao',
      header: 'Captação principal',
      render: (l) => (l.captacao ? <CelulaCaptacao fatias={l.captacao} testId={`emendas-parlamentares-captacao-${chaveDaLinha(l)}`} /> : vazio)
    },
    {
      key: 'emendas',
      header: semAnoEscolhido ? 'Emendas sem ano' : `Emendas ${ano}`,
      align: 'right',
      nowrap: true,
      sortValue: ORDEM.emendas.value,
      sortFirstDir: 'desc',
      render: (l) => {
        const e = l.emendas ?? (l.semAno?.emendas ? { valor: l.semAno.valor, quantas: l.semAno.emendas } : undefined);
        if (!e) return vazio;
        const quantas = 'quantas' in e ? e.quantas : l.emendas!.emendas.length;
        return (
          <>
            <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatCurrency(e.valor)}</span>
            <div style={carteiraDetalhe}>{quantas === 1 ? '1 emenda' : `${quantas} emendas`}</div>
          </>
        );
      }
    },
    { key: 'empenhado', header: 'Empenhado', align: 'right', nowrap: true, sortValue: ORDEM.empenhado.value, sortFirstDir: 'desc', render: (l) => valorOu(l.emendas?.empenhado) },
    { key: 'pago', header: 'Pago', align: 'right', nowrap: true, sortValue: ORDEM.pago.value, sortFirstDir: 'desc', render: (l) => valorOu(l.execucao && l.execucao.notas > 0 ? l.execucao.pago : undefined) },
    {
      key: 'sobra',
      header: encerrado ? 'Não empenhado' : 'Sobra',
      align: 'right',
      nowrap: true,
      minWidth: '140px',
      sortValue: ORDEM.sobra.value,
      sortFirstDir: 'desc',
      render: (l) =>
        l.emendas ? (
          <>
            <span style={{ ...carteiraValor, ...carteiraNumero, ...(encerrado ? { color: '#64748b' } : {}) }}>{formatCurrency(restoDa(l.emendas, encerrado) ?? 0)}</span>
            <BarraDaEmenda valor={l.emendas.valor} empenhado={l.emendas.empenhado} emAndamento={l.emendas.emAndamento} sobra={restoDa(l.emendas, encerrado) ?? 0} encerrado={encerrado} />
          </>
        ) : (
          vazio
        )
    },
    {
      key: 'situacao',
      header: 'Situação',
      render: (l) =>
        l.emendas?.situacao ? (
          <StatusBadge label={ROTULO_SITUACAO_SOBRA[l.emendas.situacao]} variant={VARIANTE_SOBRA[l.emendas.situacao]} size="sm" dot={false} />
        ) : l.semAno?.emendas ? (
          <StatusBadge label="Informe o ano" variant="warning" size="sm" dot={false} />
        ) : (
          vazio
        )
    }
  ];

  const contaTipo = (t: TipoAutor) => linhas.filter((l) => l.autor?.tipo === t).length;
  // O ano escolhido vai junto para o Parlamentar 360 e para Pedidos (o corrente não precisa).
  const comAno = searchParams.get('ano') ? `?ano=${encodeURIComponent(filtroAno)}` : '';

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Parlamentares"
        subtitle="Quem tem emenda ou pedido com a CAEP: emendas do ano, o que já foi empenhado e pago e o que sobra."
        icon={<Users size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <AnoDaEmenda
              valor={filtroAno}
              anoCorrente={anoCorrente}
              anos={anosDoSeletor.anos}
              semAno={anosDoSeletor.semAno}
              onChange={(v) => mudar('ano', v === String(anoCorrente) ? '' : v)}
              testId="emendas-parlamentares-ano"
            />
            <HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-parlamentares-atualizar" tooltipTitle="Recarregar" />
          </div>
        }
      />
      {semAnoEscolhido ? (
        <MetricStrip
          title="Emendas sem o ano"
          testId="emendas-sobra-faixa"
          items={[
            { label: 'Emendas', value: formatNumber(linhas.reduce((t, l) => t + (l.semAno?.emendas ?? 0), 0)), hint: `${formatNumber(linhas.filter((l) => l.semAno?.emendas).length)} parlamentares`, tone: 'warning' },
            { label: 'Valor no SIOP', value: formatCurrency(linhas.reduce((t, l) => t + (l.semAno?.valor ?? 0), 0)), hint: 'soma das emendas' },
            { label: 'Pedidos', value: formatNumber(ativos.length), hint: 'com o número da emenda, sem o ano: informe o ano no pedido para ler o empenhado e a sobra' }
          ]}
        />
      ) : (
        <MetricStrip
          title={`Emendas de ${ano}${encerrado ? ' (ano encerrado)' : ''}`}
          testId="emendas-sobra-faixa"
          items={[
            { label: 'Emendas', value: formatNumber(emendas.length), hint: `${formatNumber(porAutor.size)} ${porAutor.size === 1 ? 'parlamentar' : 'parlamentares'}` },
            { label: 'Valor no SIOP', value: formatCurrency(emendas.reduce((t, e) => t + (e.valor ?? 0), 0)), hint: 'soma das emendas' },
            encerrado
              ? {
                  label: 'Não empenhado',
                  value: formatCurrency(naoEmpenhadas.reduce((t, e) => t + e.sobra, 0)),
                  hint: `${formatNumber(naoEmpenhadas.length)} ${naoEmpenhadas.length === 1 ? 'emenda' : 'emendas'}: crédito perdido em 31/12/${ano}`
                }
              : {
                  label: 'Sobra para novo pedido',
                  value: formatCurrency(comSobra.reduce((t, e) => t + e.sobra, 0)),
                  hint: `${formatNumber(comSobra.length)} ${comSobra.length === 1 ? 'emenda' : 'emendas'}${minimo != null ? `, a partir de ${formatCurrency(minimo)}` : ''}`,
                  tone: comSobra.length ? 'warning' : 'default'
                },
            { label: 'A conferir', value: formatNumber(aConferir.length), hint: 'itens sem nota ou empenhado acima do valor' }
          ]}
        />
      )}
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
          // O ano não é filtro da lista: fica como está.
          setSearchParams({ ...(tipo === 'todos' ? {} : { tipo }), ...(searchParams.get('ano') ? { ano: searchParams.get('ano')! } : {}) }, { replace: true });
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
            { value: 'sobra', label: encerrado ? 'Com não empenhado' : 'Com sobra', count: doTipo.filter((l) => (restoDa(l.emendas, encerrado) ?? 0) > 0).length },
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
        <FiltroCaptacao gti={filtroCaptacao} modo={modoCaptacao} counts={contagemCaptacao} mudarUrl={mudarUrl} testIdPrefix="emendas-parlamentares" />
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
          rowOpen={(l) => () => navegar(l.autorId ? `/emendas/parlamentares/${encodeURIComponent(l.autorId)}${comAno}` : `/emendas/pedidos?autor=${AUTOR_A_DEFINIR_CHAVE}${comAno.replace('?', '&')}`)}
        />
        <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={sorted.length} onChange={setPage} testIdPrefix="emendas-parlamentares" />
      </AdminListShell>
    </PageContainer>
  );
};
