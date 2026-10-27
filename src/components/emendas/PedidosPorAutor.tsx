import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { MetricStrip } from '../../design-system/components/MetricStrip';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { carteiraDetalhe, carteiraNumero, carteiraValor } from '../carteira/carteiraStyles';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { formatCurrency, formatNumber } from '../../utils/format';
import { AUTOR_A_DEFINIR, numeroDaEmendaEmTexto, reservadoPorItem, valorDoPedidoNaEtapa } from '../../utils/emendasPedidos';
import { menorPrecoDisponivel, ROTULO_SITUACAO_SOBRA, type ExecucaoNoPortal, sobraDasEmendas, sobraPorAutor, type SituacaoDaSobra, type SobraDaEmenda, type SobraDoAutor } from '../../utils/emendasSobra';
import { usePrecosParaEmenda } from '../../hooks/useEmendasQuadro';
import { useExecucaoEmendas, useMapaGruposBeneficiarios } from '../../hooks/useEmendas';
import { contarPorGti, passaFiltroGti, type FatiasDaAta } from '../../config/gruposGti';
import { GRUPOS_CAPTACAO, fatiasDaCaptacao, lerFiltroCaptacao, lerModoCaptacao } from '../../config/captacaoEmendas';
import { CelulaCaptacao, FiltroCaptacao } from './CaptacaoDoPedido';
import type { AutorEmenda, ItemCaep, NotaDaLinha, PedidoEmenda, TipoAutor } from '../../services/emendasService';
import { AutorDoPedido, LARGURA_AUTOR } from './emendasPartes';

/** Chave do filtro de autor para as reservas sem parlamentar (migration 163). */
export const AUTOR_A_DEFINIR_CHAVE = 'a-definir';

interface Linha {
  autorId: string | null;
  autor: AutorEmenda | undefined;
  pedidos: number;
  valor: number;
  /** Emendas do ano corrente do autor (migration 204). */
  emendas: SobraDoAutor | undefined;
  /** Pedidos da fase, para a Captação principal (migration 218). */
  lista: PedidoEmenda[];
  captacao?: FatiasDaAta;
}

const TIPOS: Array<{ value: TipoAutor; label: string }> = [
  { value: 'DEPUTADO', label: 'Deputados' },
  { value: 'SENADOR', label: 'Senadores' },
  { value: 'BANCADA', label: 'Bancadas' }
];

const POR_PAGINA = 25;
const chaveDaLinha = (l: Linha) => l.autorId ?? AUTOR_A_DEFINIR_CHAVE;
// Ordenação pelo cabeçalho, como nas carteiras (?ordem=); sem escolha, quem tem mais valor primeiro.
const ORDEM: Record<string, CarteiraSortColumn<Linha>> = {
  autor: { value: (l) => (l.autorId ? l.autor?.nome ?? l.autorId : null) },
  pedidos: { value: (l) => l.pedidos, firstDir: 'desc' },
  valor: { value: (l) => l.valor, firstDir: 'desc' },
  emendas: { value: (l) => l.emendas?.valor ?? null, firstDir: 'desc' },
  empenhado: { value: (l) => l.emendas?.empenhado ?? null, firstDir: 'desc' },
  andamento: { value: (l) => l.emendas?.emAndamento ?? null, firstDir: 'desc' },
  sobra: { value: (l) => l.emendas?.sobra ?? null, firstDir: 'desc' }
};
const VARIANTE_SOBRA: Record<SituacaoDaSobra, StatusBadgeVariant> = { sobra: 'warning', conferir: 'info', acima: 'danger', executada: 'success', semValor: 'neutral' };

/** Barra da emenda: empenhado, em andamento e sobra sobre o valor no SIOP (ou o empenhado, se passar dele). */
const BarraDaEmenda: React.FC<{ valor: number; empenhado: number; emAndamento: number; sobra: number }> = ({ valor, empenhado, emAndamento, sobra }) => {
  const base = Math.max(valor, empenhado + emAndamento) || 1;
  const pct = (v: number) => `${(Math.max(v, 0) / base) * 100}%`;
  return (
    <div className="emendas-sobra-barra" title={`Empenhado ${formatCurrency(empenhado)} · Em andamento ${formatCurrency(emAndamento)} · Sobra ${formatCurrency(Math.max(sobra, 0))}`}>
      <i className="emendas-sobra-barra__empenhado" style={{ width: pct(Math.min(empenhado, base)) }} />
      <i className="emendas-sobra-barra__andamento" style={{ width: pct(emAndamento) }} />
      <i className="emendas-sobra-barra__sobra" style={{ width: pct(sobra) }} />
    </div>
  );
};
const SEM_PORTAL: ExecucaoNoPortal[] = [];
const vazio = <span style={{ ...carteiraDetalhe, marginTop: 0 }}>—</span>;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Props {
  /** Pedidos da fase escolhida no trilho de Pedidos ("Todos" já vem sem os cancelados). */
  pedidos: PedidoEmenda[];
  /** Etapa escolhida: fora de "Todos" a coluna "Já empenhado" não faz sentido. */
  todasAsEtapas: boolean;
  autores: AutorEmenda[];
  itens: Map<string, ItemCaep>;
  /** Todos os pedidos, de todas as fases: a sobra das emendas não depende da fase escolhida. */
  todosOsPedidos: PedidoEmenda[];
  notas: Map<string, NotaDaLinha>;
  /** Ano das emendas da conta da sobra (o corrente). */
  ano: number;
  podeGerir: boolean;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  onRetry: () => void;
  /** "Ver os pedidos": a lista Por pedido filtrada pelo autor. */
  onAbrirAutor: (chave: string) => void;
  /** "Novo pedido com a sobra": a janela de reserva com o parlamentar e a emenda. */
  onNovoComSobra: (e: SobraDaEmenda) => void;
  /** Emenda vinda do Início (?emenda=): o autor dela já abre. */
  emendaInicial?: string | null;
}

/**
 * Pedidos › Ver por autor: o que cada parlamentar ou bancada tem com a CAEP na fase escolhida (substitui a antiga aba
 * Por autor). O filtro "Mostrar" traz também quem não tem pedido (cadastro da Câmara e do Senado, migration 155).
 */
export const PedidosPorAutor: React.FC<Props> = ({ pedidos, todasAsEtapas, autores, itens, todosOsPedidos, notas, ano, podeGerir, isLoading, isError, errorMessage, onRetry, onAbrirAutor, onNovoComSobra, emendaInicial }) => {
  const [tipo, setTipo] = useState('');
  const [situacao, setSituacao] = useState('');
  const [uf, setUf] = useState('');
  const [mostrar, setMostrar] = useState('');
  const [busca, setBusca] = useState('');

  const autorPorId = useMemo(() => new Map(autores.map((a) => [a.id, a])), [autores]);
  const { precos } = usePrecosParaEmenda();
  const gruposDosBeneficiarios = useMapaGruposBeneficiarios();
  const [searchParams, setSearchParams] = useSearchParams();
  const filtroCaptacao = lerFiltroCaptacao(searchParams.get('captacao'));
  const modoCaptacao = lerModoCaptacao(searchParams.get('captacaoConta'));
  const mudarUrl = (mudar: (p: URLSearchParams) => void) =>
    setSearchParams((atual) => {
      const prox = new URLSearchParams(atual);
      mudar(prox);
      return prox;
    });
  const { data: portal = SEM_PORTAL } = useExecucaoEmendas();
  // Sobra das emendas do ano (migration 204): com todos os pedidos, não só os da fase.
  const minimo = useMemo(() => menorPrecoDisponivel(itens, reservadoPorItem(todosOsPedidos), precos), [itens, todosOsPedidos, precos]);
  const emendas = useMemo(
    () => sobraDasEmendas({ pedidos: todosOsPedidos, ano, itens, notas, portal: new Map(portal.map((x) => [x.codigo, x])), precos, minimo }),
    [todosOsPedidos, ano, itens, notas, portal, precos, minimo]
  );
  const porAutor = useMemo(() => sobraPorAutor(emendas), [emendas]);
  const autorDaEmendaInicial = emendaInicial ? emendas.find((e) => e.codigo === emendaInicial)?.autorId ?? null : null;
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => new Set(autorDaEmendaInicial ? [autorDaEmendaInicial] : []));

  const linhas: Linha[] = useMemo(() => {
    const m = new Map<string, Linha>();
    for (const p of pedidos) {
      // Reservas para órgãos (sem parlamentar ainda, migration 163) ficam juntas numa linha "Parlamentar a definir".
      const chave = p.autorId ?? '';
      const l = m.get(chave) ?? { autorId: p.autorId, autor: p.autorId ? autorPorId.get(p.autorId) : undefined, pedidos: 0, valor: 0, emendas: p.autorId ? porAutor.get(p.autorId) : undefined, lista: [] };
      // O da emenda depois da conferência; antes, o previsto pelos itens (o mesmo da lista de pedidos).
      l.pedidos++;
      l.lista.push(p);
      l.valor += valorDoPedidoNaEtapa(p, itens, precos).valor;
      m.set(chave, l);
    }
    if (mostrar === 'todos') {
      for (const a of autores) if (!m.has(a.id)) m.set(a.id, { autorId: a.id, autor: a, pedidos: 0, valor: 0, emendas: porAutor.get(a.id), lista: [] });
    }
    for (const l of m.values()) if (l.lista.length) l.captacao = fatiasDaCaptacao(l.lista, gruposDosBeneficiarios, itens, precos);
    // Sem pedido vem depois, em ordem alfabética.
    return [...m.values()].sort((a, b) => b.valor - a.valor || (a.autor?.nome ?? '').localeCompare(b.autor?.nome ?? '', 'pt-BR'));
  }, [pedidos, autorPorId, itens, autores, mostrar, precos, porAutor, gruposDosBeneficiarios]);
  const semPedido = useMemo(() => {
    const com = new Set(pedidos.map((p) => p.autorId));
    return autores.filter((a) => !com.has(a.id)).length;
  }, [pedidos, autores]);

  const doTipo = linhas.filter((l) => !tipo || l.autor?.tipo === tipo);
  const termo = semAcento(busca.trim());
  const naSituacao = (l: Linha) => !situacao || (situacao === 'sobra' ? (l.emendas?.sobra ?? 0) > 0 : l.emendas?.emendas.some((e) => e.situacao === 'conferir' || e.situacao === 'acima'));
  const filtradas = doTipo.filter((l) => naSituacao(l) && (!uf || l.autor?.uf === uf) && passaFiltroGti(l.captacao, filtroCaptacao, modoCaptacao) && (!termo || semAcento(`${l.autorId ? l.autor?.nome ?? '' : AUTOR_A_DEFINIR} ${l.autor?.partido ?? ''}`).includes(termo)));
  const ufs = [...new Set(doTipo.map((l) => l.autor?.uf).filter((x): x is string => Boolean(x)))].sort().map((v) => ({ value: v, label: v, count: doTipo.filter((l) => l.autor?.uf === v).length }));
  const filtrosAtivos = Boolean(termo || tipo || uf || mostrar || situacao || filtroCaptacao !== 'TODOS');
  const contagemCaptacao = contarPorGti(doTipo.map((l) => l.captacao), modoCaptacao, GRUPOS_CAPTACAO);
  const comSobra = emendas.filter((e) => e.situacao === 'sobra');
  const aConferir = emendas.filter((e) => e.situacao === 'conferir' || e.situacao === 'acima');
  const vazioOu = (l: Linha, v: (e: SobraDoAutor) => number) => (l.emendas ? <span style={carteiraNumero}>{formatCurrency(v(l.emendas))}</span> : vazio);
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, ORDEM);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chaveDaLinha, POR_PAGINA);

  const colunas: Column<Linha>[] = [
    { key: 'autor', header: 'Parlamentar', priority: 'primary', width: LARGURA_AUTOR, minWidth: LARGURA_AUTOR, sortValue: ORDEM.autor.value, render: (l) => <AutorDoPedido autor={l.autor} autorId={l.autorId} destaque /> },
    { key: 'pedidos', header: 'Pedidos', align: 'right', nowrap: true, sortValue: ORDEM.pedidos.value, sortFirstDir: 'desc', render: (l) => <span style={carteiraNumero}>{formatNumber(l.pedidos)}</span> },
    {
      key: 'valor',
      header: todasAsEtapas ? 'Valor reservado' : 'Valor nesta fase',
      align: 'right',
      nowrap: true,
      sortValue: ORDEM.valor.value,
      sortFirstDir: 'desc',
      render: (l) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatCurrency(l.valor)}</span>
    },
    {
      key: 'captacao',
      header: 'Captação principal',
      render: (l) => (l.captacao ? <CelulaCaptacao fatias={l.captacao} testId={`emendas-por-autor-captacao-${chaveDaLinha(l)}`} /> : vazio)
    },
    { key: 'emendas', header: `Emendas ${ano}`, align: 'right', nowrap: true, sortValue: ORDEM.emendas.value, sortFirstDir: 'desc', render: (l) => vazioOu(l, (e) => e.valor) },
    { key: 'empenhado', header: 'Empenhado', align: 'right', nowrap: true, sortValue: ORDEM.empenhado.value, sortFirstDir: 'desc', render: (l) => vazioOu(l, (e) => e.empenhado) },
    { key: 'andamento', header: 'Em andamento', align: 'right', nowrap: true, sortValue: ORDEM.andamento.value, sortFirstDir: 'desc', render: (l) => vazioOu(l, (e) => e.emAndamento) },
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

  // A linha do autor abre as emendas dele, cada uma com a sua sobra (protótipo de 26/10/2026).
  const emendasDoAutor = (l: Linha) => (
    <div className="emendas-sobra-autor" data-testid={`emendas-por-autor-emendas-${chaveDaLinha(l)}`}>
      {(l.emendas?.emendas ?? []).map((e) => (
        <div key={e.codigo} className="emendas-sobra-emenda" data-testid={`emendas-sobra-${e.codigo}`}>
          <div className="emendas-sobra-emenda__topo">
            <b>
              Emenda {numeroDaEmendaEmTexto(e.emenda)} / {e.ano}
            </b>
            <span style={{ ...carteiraDetalhe, marginTop: 0 }}>pedidos {e.pedidos.map((p) => p.numero).join(', ')}</span>
            <StatusBadge label={ROTULO_SITUACAO_SOBRA[e.situacao]} variant={VARIANTE_SOBRA[e.situacao]} size="sm" dot={false} />
            <span style={{ flex: 1 }} />
            {podeGerir && (
              <ActionButton
                action="novo"
                size="sm"
                label="Novo pedido com a sobra"
                disabled={e.situacao !== 'sobra'}
                title={e.situacao !== 'sobra' ? 'Só com sobra que compre pelo menos o item mais barato da CAEP.' : undefined}
                onClick={() => onNovoComSobra(e)}
                data-testid={`emendas-sobra-novo-${e.codigo}`}
              />
            )}
          </div>
          {e.valor != null && <BarraDaEmenda valor={e.valor} empenhado={e.empenhado} emAndamento={e.emAndamento} sobra={e.sobra} />}
          <div className="emendas-sobra-emenda__valores">
            <span>
              Valor no SIOP <b>{e.valor == null ? '—' : formatCurrency(e.valor)}</b>
            </span>
            <span>
              Empenhado <b>{formatCurrency(e.empenhado)}</b> {e.fonteDoEmpenhado === 'PORTAL' ? '(notas da SENASP no Portal da Transparência)' : '(notas ligadas no sistema)'}
            </span>
            <span>
              Em andamento <b>{formatCurrency(e.emAndamento)}</b>
            </span>
            <span>
              Sobra <b>{formatCurrency(e.sobra)}</b>
            </span>
          </div>
          {e.situacao === 'conferir' && e.notasSemValor > 0 && (
            <div style={carteiraDetalhe}>
              {e.notasSemValor === 1 ? '1 nota da SENASP' : `${e.notasSemValor} notas da SENASP`} desta emenda no Portal ainda não {e.notasSemValor === 1 ? 'está' : 'estão'} no sistema: o empenhado fica a menos até a busca diária das notas trazê-las.
            </div>
          )}
          {e.situacao === 'conferir' && e.notasSemValor === 0 && (
            <div style={carteiraDetalhe}>
              {e.linhasSemNota === 1 ? '1 item empenhado ainda sem nota ligada' : `${e.linhasSemNota} itens empenhados ainda sem nota ligada`}: a sobra pelas notas do sistema não é confiável. As notas da emenda ainda não foram lidas no Portal da Transparência.
            </div>
          )}
          {e.situacao === 'acima' && <div style={carteiraDetalhe}>O empenhado passa do valor no SIOP: confira o valor da emenda no pedido ou a nota ligada.</div>}
          {e.situacao === 'semValor' && <div style={carteiraDetalhe}>Sem o valor da emenda: ele é informado na conferência com o SIOP.</div>}
          {e.situacao === 'executada' && e.sobra > 0.004 && minimo != null && <div style={carteiraDetalhe}>A sobra não compra nem o item mais barato da CAEP ({formatCurrency(minimo)}).</div>}
        </div>
      ))}
      {l.pedidos > 0 && (
        <AppButton variant="link" size="xs" onClick={() => onAbrirAutor(chaveDaLinha(l))} data-testid={`emendas-por-autor-ver-pedidos-${chaveDaLinha(l)}`}>
          Ver {l.pedidos === 1 ? 'o pedido' : `os ${formatNumber(l.pedidos)} pedidos`}
        </AppButton>
      )}
    </div>
  );

  return (
    <>
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
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar pelo nome ou partido..."
        onChangeBusca={setBusca}
        hasActiveFilters={filtrosAtivos}
        onResetFilters={() => {
          setBusca('');
          setTipo('');
          setUf('');
          setMostrar('');
          setSituacao('');
          mudarUrl((p) => {
            p.delete('captacao');
            p.delete('captacaoConta');
          });
        }}
        counter={carteiraCounter(filtradas.length, linhas.length, filtrosAtivos, 'autor', 'autores')}
        testIdPrefix="emendas-por-autor"
      >
        <CarteiraFilterButton
          label="Tipo"
          value={tipo}
          emptyValue=""
          options={TIPOS.map((t) => ({ ...t, count: linhas.filter((l) => l.autor?.tipo === t.value).length }))}
          onChange={setTipo}
          testId="emendas-por-autor-filtro-tipo"
        />
        <CarteiraFilterButton label="UF" value={uf} emptyValue="" options={ufs} onChange={setUf} testId="emendas-por-autor-filtro-uf" />
        <CarteiraFilterButton
          label="Emendas"
          value={situacao}
          emptyValue=""
          options={[
            { value: 'sobra', label: 'Com sobra', count: linhas.filter((l) => (l.emendas?.sobra ?? 0) > 0).length },
            { value: 'conferir', label: 'A conferir', count: linhas.filter((l) => l.emendas?.emendas.some((e) => e.situacao === 'conferir' || e.situacao === 'acima')).length }
          ]}
          onChange={setSituacao}
          testId="emendas-por-autor-filtro-emendas"
        />
        <CarteiraFilterButton
          label="Mostrar"
          value={mostrar}
          emptyValue=""
          options={[{ value: 'todos', label: 'Também quem não tem pedido', count: semPedido }]}
          onChange={setMostrar}
          testId="emendas-por-autor-filtro-mostrar"
        />
        <FiltroCaptacao gti={filtroCaptacao} modo={modoCaptacao} counts={contagemCaptacao} mudarUrl={mudarUrl} testIdPrefix="emendas-por-autor" />
      </CarteiraFilterBar>

      <AdminListShell
        testId="emendas-por-autor-lista"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar os pedidos"
        errorMessage={errorMessage}
        onRetry={onRetry}
        isEmpty={!isLoading && filtradas.length === 0}
        emptyTitle={linhas.length === 0 ? 'Nenhum parlamentar com pedido nesta fase.' : 'Nenhum parlamentar encontrado.'}
        emptyDescription={linhas.length === 0 ? 'Escolha outra fase ou use "Mostrar" para ver também quem não tem pedido.' : 'Ajuste a busca ou os filtros.'}
      >
        <DataTable<Linha>
          testId="emendas-por-autor-tabela"
          className="data-table-container--flush"
          data={pageItems}
          keyExtractor={chaveDaLinha}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={toggle}
          columns={colunas}
          expandedKeys={abertos}
          onToggleExpand={(chave) =>
            setAbertos((atual) => {
              const prox = new Set(atual);
              if (prox.has(chave)) prox.delete(chave);
              else prox.add(chave);
              return prox;
            })
          }
          renderExpanded={emendasDoAutor}
        />
        <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={sorted.length} onChange={setPage} testIdPrefix="emendas-por-autor" />
      </AdminListShell>
    </>
  );
};
