import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PageContainer } from '../../design-system/components/PageContainer';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import { EmptyState } from '../../design-system/components/EmptyState';
import { ActionButton, AppButton, AppTextarea, Modal, StatusBadge, useToast, useConfirm, AvisoCarregando } from '../../design-system';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useAuth } from '../../context/AuthContext';
import { useEmpenhosParaVincularAosItens } from '../../hooks/useVinculacaoEmpenhos';
import { desfazerDistribuicaoEmpenho, vincularEmpenhoAosItens, type DistribuicaoDoEmpenho } from '../../services/distribuicaoEmpenhoService';
import { ehConflitoEdicao } from '../../utils/conflitoEdicao';
import { motivoDaNota, motivoDaRevisao, rotuloDaSituacao, sugestaoCurta, textoDaSugestao } from '../../utils/distribuicaoEmpenho';
import { useConferenciasDaNota } from '../../hooks/useConferenciaNota';
import { ConferirNoContratosGov } from './ConferirNoContratosGov';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraNoResults } from '../carteira/CarteiraNoResults';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../carteira/CarteiraRowLink';
import { CarteiraCellFilter } from '../carteira/CarteiraCellFilter';
import { carteiraFornecedor, carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { TODOS_GESTORES, listGestores, matchesGestorFilter } from '../carteira/carteiraGestor';
import { formatCurrency } from '../carteira/carteiraFormat';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { SELECIONADA_BG, SelecaoCell, SelecaoHeaderCell, useSelecaoFila } from '../atas/distribuicao/DistribuicaoSelecao';
import { useContratosDoFinanceiro, uasgDaChave } from '../financeiro/useContratosDoFinanceiro';
import { dataBR, normalizarBusca } from '../financeiro/financeiroFormat';
import { VinculacaoPageHeader } from './VinculacaoPageHeader';
import { VincularAosItensDialog } from './VincularAosItensDialog';
import { MarcaDeixada, textoEncerrado, useDeixarComoEsta } from './DeixarComoEsta';
import { chaveAvisoDeixarNota } from '../../services/avisosResolvidosService';
import {
  aguardaVinculoAosItens,
  deixadaComoEsta,
  entraNoLote,
  ordenarFila,
  passaFiltroSugestao,
  passaVigencia,
  temSugestaoUnica,
  vinculadaPelaEquipe,
  vinculadaPeloValor,
  type FiltroSugestao,
  type FiltroVigencia
} from './vinculacaoEmpenhos';

interface Filtros {
  fila: string;
  vigencia: string;
  sugestao: string;
  uasg: string;
  gestor: string;
  busca: string;
}

const TODOS = 'TODOS';
const PAGE_SIZE = 20;
const SCHEMA: CarteiraFilterSchema<Filtros> = {
  fila: { param: 'fila', default: 'A_VINCULAR', values: ['A_VINCULAR', 'CONFERIR', 'VALOR', 'EQUIPE'] },
  vigencia: { param: 'vigencia', default: 'VIGENTES', values: ['VIGENTES', 'ENCERRADOS', TODOS] },
  sugestao: { param: 'sugestao', default: TODOS, values: [TODOS, 'UNICA', 'VARIAS', 'NENHUMA'] },
  uasg: { param: 'uasg', default: TODOS },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  busca: { param: 'busca', default: '' }
};
const VERDE = 'var(--color-success)';
const VERMELHO = 'var(--color-danger)';
const subtle: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 600 };
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const SUGESTAO_LABEL: Record<Exclude<FiltroSugestao, 'TODOS'>, string> = { UNICA: 'Única', VARIAS: 'Mais de uma', NENHUMA: 'Nenhuma' };

/**
 * Vínculos → Empenhos aos itens: notas de contratos com dois ou mais itens que ainda não foram vinculadas aos
 * itens (a rever primeiro), as que não batem com o contrato (conferir no Contratos.gov.br), as que o servidor
 * vinculou pelo valor e as que a equipe vinculou nos últimos dias. As vinculadas pela nota no SIAFI não aparecem.
 * A linha abre a mesma janela do Contrato 360; as com sugestão única podem ser vinculadas em lote.
 */
export const EmpenhosItensPage: React.FC = () => {
  const navigate = useNavigateWithOrigin();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { role } = useAuth();
  const podeVincular = role === 'admin' || role === 'gestor';
  const { data: todas = [], isLoading, isFetching, error, refetch } = useEmpenhosParaVincularAosItens();
  const { data: conferencias = [] } = useConferenciasDaNota();
  const { contrato, escopo, showGestorFilter, isLoading: carregandoContratos } = useContratosDoFinanceiro();
  const { filters, setFilter, resetFilters } = useCarteiraFilters(SCHEMA);

  // Contrato encerrado: nada mais será empenhado; o gestor pode deixar a nota como está (sai da fila e do menu).
  const deixar = useDeixarComoEsta(
    'A nota continua "a vincular" no Contrato 360 e no Financeiro; só a fila e o número do menu deixam de cobrar. Se o contrato voltar a ficar vigente, a nota volta à fila. Dá para reexibir a qualquer momento.'
  );
  const marcaDe = (d: DistribuicaoDoEmpenho) => deixar.porChave.get(chaveAvisoDeixarNota(d.contractKey, d.contratoEmpenhoId));
  const deixada = (d: DistribuicaoDoEmpenho) => deixadaComoEsta(contrato(d.contractKey).expirado, Boolean(marcaDe(d)));

  // Perfil gestor: só as notas dos próprios contratos. O filtro Vigência vale para todos os segmentos; as deixadas
  // como está só aparecem em "Todos".
  const visiveis = useMemo(() => (escopo ? todas.filter((d) => escopo.has(d.contractKey)) : todas), [todas, escopo]);
  const naVigencia = useMemo(
    () => visiveis.filter((d) => passaVigencia(contrato(d.contractKey).expirado, filters.vigencia as FiltroVigencia)),
    [visiveis, contrato, filters.vigencia]
  );
  const aVincular = useMemo(
    () => naVigencia.filter((d) => aguardaVinculoAosItens(d) && (filters.vigencia === TODOS || !deixada(d))),
    [naVigencia, filters.vigencia, deixar.porChave, contrato] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const daEquipe = useMemo(() => naVigencia.filter(vinculadaPelaEquipe), [naVigencia]);
  const peloValor = useMemo(() => naVigencia.filter(vinculadaPeloValor), [naVigencia]);
  const aConferir = useMemo(() => (escopo ? conferencias.filter((c) => escopo.has(c.contractKey)) : conferencias), [conferencias, escopo]);
  const vinculadas = filters.fila !== 'A_VINCULAR';
  const base = filters.fila === 'EQUIPE' ? daEquipe : filters.fila === 'VALOR' ? peloValor : aVincular;
  const gestorDe = (d: DistribuicaoDoEmpenho) => contrato(d.contractKey).gestorNome;

  const uasgs = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of base) {
      const u = d.uasgEmitente || uasgDaChave(d.contractKey);
      m.set(u, (m.get(u) ?? 0) + 1);
    }
    return m;
  }, [base]);
  const gestores = useMemo(() => listGestores(base.map(gestorDe)), [base, contrato]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const q = normalizarBusca(filters.busca);
    const filtradas = base.filter((d) => {
      const c = contrato(d.contractKey);
      if (!passaFiltroSugestao(d, filters.sugestao as FiltroSugestao)) return false;
      if (filters.uasg !== TODOS && (d.uasgEmitente || uasgDaChave(d.contractKey)) !== filters.uasg) return false;
      if (showGestorFilter && !matchesGestorFilter(c.gestorNome, filters.gestor)) return false;
      if (q && !normalizarBusca(d.numeroOficial).includes(q) && !normalizarBusca(c.numero).includes(q) && !normalizarBusca(c.fornecedorNome ?? '').includes(q)) return false;
      return true;
    });
    return vinculadas
      ? [...filtradas].sort((a, b) => (b.distribuidoEm ?? '').localeCompare(a.distribuidoEm ?? ''))
      : ordenarFila(filtradas, (d) => d.dataEmissao);
  }, [base, filters, contrato, showGestorFilter, vinculadas]);

  const colunas = useMemo<Record<string, CarteiraSortColumn<DistribuicaoDoEmpenho>>>(
    () => ({
      empenho: { value: (d) => d.numeroOficial },
      contrato: { value: (d) => contrato(d.contractKey).numero.split('/').reverse().join('/') },
      emissao: { value: (d) => d.dataEmissao, firstDir: 'desc' },
      situacao: { value: (d) => (d.situacao === 'REVISAR' ? 0 : 1) },
      gestor: { value: (d) => contrato(d.contractKey).gestorNome }
    }),
    [contrato]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(lista, colunas);
  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };
  const chave = React.useCallback((d: DistribuicaoDoEmpenho) => d.contratoEmpenhoId, []);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chave, PAGE_SIZE);

  // Lote "Vincular pela sugestão": só notas a vincular com sugestão única.
  const selecao = useSelecaoFila(useMemo(() => aVincular.filter((d) => entraNoLote(d) && !deixada(d)).map(chave), [aVincular, chave])); // eslint-disable-line react-hooks/exhaustive-deps
  const selecionadas = aVincular.filter((d) => selecao.selecionadas.has(chave(d)));
  const chavesDaPagina = pageItems.filter(entraNoLote).map(chave);
  const [confirmandoLote, setConfirmandoLote] = useState(false);
  const [obsLote, setObsLote] = useState('');
  const [gravandoLote, setGravandoLote] = useState(false);
  const [nota, setNota] = useState<DistribuicaoDoEmpenho | null>(null);

  const vincularLote = async () => {
    setGravandoLote(true);
    let feitas = 0;
    let puladas = 0;
    const erros: string[] = [];
    for (const d of selecionadas) {
      try {
        // A versão lida na fila: se alguém vinculou a nota nesse meio-tempo, o banco recusa e a nota é pulada.
        await vincularEmpenhoAosItens({
          contratoEmpenhoId: d.contratoEmpenhoId,
          itens: [{ numeroItem: d.sugestao[0].numeroItem, quantidade: d.sugestao[0].quantidade }],
          observacao: obsLote,
          versao: d.versao
        });
        feitas++;
      } catch (err: any) {
        if (ehConflitoEdicao(err)) puladas++;
        else erros.push(`${d.numeroOficial}: ${err?.message || 'erro desconhecido'}`);
      }
    }
    setGravandoLote(false);
    setConfirmandoLote(false);
    setObsLote('');
    selecao.limpar();
    await queryClient.invalidateQueries({ queryKey: ['contrato-empenho-distribuicao'] });
    if (feitas > 0) toast.success(`${plural(feitas, 'nota vinculada', 'notas vinculadas')} aos itens pela sugestão.`);
    if (puladas > 0) {
      toast.error(
        `${plural(puladas, 'nota foi pulada', 'notas foram puladas')} porque outra pessoa as alterou enquanto você editava. A lista foi atualizada; confira antes de vincular de novo.`
      );
    }
    if (erros.length > 0) toast.error(`${plural(erros.length, 'nota não foi vinculada', 'notas não foram vinculadas')}: ${erros.join('; ')}`);
  };

  // "Não é este item": desfaz o vínculo pelo valor; a nota volta para "A vincular" e o servidor não a refaz.
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  const naoEEsteItem = async (d: DistribuicaoDoEmpenho) => {
    const ok = await confirm({
      title: 'Não é este item',
      message: (
        <>
          A nota <strong>{d.numeroOficial}</strong> volta para "A vincular" e sai do empenhado do item até ser vinculada de novo. O sistema não volta a vincular esta nota pelo valor.
        </>
      ),
      confirmLabel: 'Desfazer o vínculo',
      tone: 'danger'
    });
    if (!ok) return;
    setDesfazendo(d.contratoEmpenhoId);
    try {
      await desfazerDistribuicaoEmpenho(d.contratoEmpenhoId, d.versao);
      await queryClient.invalidateQueries({ queryKey: ['contrato-empenho-distribuicao'] });
      toast.success(`${d.numeroOficial} voltou para "A vincular".`);
    } catch (err: any) {
      if (ehConflitoEdicao(err)) await queryClient.invalidateQueries({ queryKey: ['contrato-empenho-distribuicao'] });
      toast.error(err?.message || 'Não foi possível desfazer o vínculo.');
    } finally {
      setDesfazendo(null);
    }
  };

  const abrirContrato = (d: DistribuicaoDoEmpenho) => navigate(`/contratos/${encodeURIComponent(d.contractKey)}?aba=financeiro&abrir=${encodeURIComponent(d.numeroOficial)}`);
  const abrirNota = (d: DistribuicaoDoEmpenho) => (podeVincular ? setNota(d) : abrirContrato(d));

  if (error && todas.length === 0) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState title="Erro ao carregar os empenhos" message={error.message} onRetry={() => void refetch()} />
      </PageContainer>
    );
  }

  const hasActive = hasActiveCarteiraFilters(SCHEMA, filters) && filters.fila === SCHEMA.fila.default;
  const isBusy = isLoading || carregandoContratos;

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <VinculacaoPageHeader
        title="Empenhos a vincular aos itens"
        subtitle="Notas de empenho de contratos com dois ou mais itens. Cada nota só entra no empenhado do item depois de vinculada aos itens."
        hint="O servidor lê cada nota no SIAFI e a vincula aos itens que ela diz, sem clique; essas não aparecem aqui. Quando a nota e o contrato não batem, a nota vai para “Conferir no Contratos.gov.br”. Quando a nota não diz o item ou a quantidade, ela fica em “A vincular”. Em contrato encerrado nada mais será empenhado: se a nota não vale o trabalho de vincular, deixe como está, com justificativa; a linha sai da fila e do número do menu."
      />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando empenhos...">
          <AvisoCarregando label="Carregando empenhos" />
          <SkeletonLoader variant="rectangular" height="40px" count={1} />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
        <>
          <CarteiraSegmentTabs
            testIdPrefix="vinc-empenhos-fila"
            ariaLabel="Situação do vínculo"
            active={filters.fila}
            onSelect={(v) => setFilter('fila', v)}
            segments={[
              { id: 'EQUIPE', label: 'Vinculadas pela equipe', count: daEquipe.length, dot: VERDE, title: 'Vinculadas aos itens pela equipe nos últimos 30 dias' },
              { id: 'VALOR', label: 'Vinculadas pelo valor', count: peloValor.length, dot: VERDE, title: 'O servidor vinculou porque só um item do contrato explica o valor da nota. Confira.' },
              { id: 'CONFERIR', label: 'Conferir no Contratos.gov.br', count: aConferir.length, dot: VERMELHO, title: 'A nota no SIAFI e o contrato não batem' },
              { id: 'A_VINCULAR', label: 'A vincular', count: aVincular.length, dot: VERMELHO, title: 'Notas que ainda não entram no empenhado dos itens' }
            ]}
          />

          {filters.fila === 'CONFERIR' ? (
            <ConferirNoContratosGov linhas={aConferir} contrato={contrato} showGestorFilter={showGestorFilter} podeMarcar={podeVincular} />
          ) : (
            <>
            <CarteiraFilterBar
              busca={filters.busca}
              searchPlaceholder="Buscar por empenho, contrato, fornecedor..."
              onChangeBusca={(v) => setFilter('busca', v)}
              hasActiveFilters={hasActive}
              onResetFilters={resetFilters}
              counter={carteiraCounter(lista.length, base.length, hasActive, 'nota', 'notas')}
              testIdPrefix="vinc-empenhos"
            >
              <CarteiraFilterButton
                label="Vigência"
                value={filters.vigencia}
                emptyValue={TODOS}
                options={[
                  { value: 'VIGENTES', label: 'Vigentes' },
                  { value: 'ENCERRADOS', label: 'Encerrados', count: visiveis.filter((d) => aguardaVinculoAosItens(d) && contrato(d.contractKey).expirado).length }
                ]}

                onChange={(v) => setFilter('vigencia', v)}
                testId="vinc-empenhos-filter-vigencia"
              />
              {filters.fila === 'A_VINCULAR' && (
                <CarteiraFilterButton
                  label="Sugestão"
                  value={filters.sugestao}
                  emptyValue={TODOS}
                  options={(['UNICA', 'VARIAS', 'NENHUMA'] as const).map((v) => ({ value: v, label: SUGESTAO_LABEL[v], count: base.filter((d) => passaFiltroSugestao(d, v)).length }))}
                  onChange={(v) => setFilter('sugestao', v)}
                  testId="vinc-empenhos-filter-sugestao"
                />
              )}
              <CarteiraFilterButton
                label="UASG"
                value={filters.uasg}
                emptyValue={TODOS}
                options={[...uasgs.keys()].sort().map((u) => ({ value: u, label: u, count: uasgs.get(u) }))}
                onChange={(v) => setFilter('uasg', v)}
                testId="vinc-empenhos-filter-uasg"
              />
              {showGestorFilter && <CarteiraGestorSelect value={filters.gestor} gestores={gestores} onChange={(v) => setFilter('gestor', v)} testId="vinc-empenhos-filter-gestor" />}
            </CarteiraFilterBar>

            {podeVincular && selecionadas.length > 0 && (
              <div
                role="region"
                aria-label="Ações em lote"
                data-testid="vinc-empenhos-selecao"
                style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', padding: '0.55rem 0.85rem', background: SELECIONADA_BG, border: '1px solid var(--color-info-border)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--color-info-text-strong)' }}
              >
                <strong>{plural(selecionadas.length, 'nota selecionada', 'notas selecionadas')}</strong>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <ActionButton action="limpar" size="sm" onClick={selecao.limpar} />
                  <ActionButton action="vincular" size="sm" onClick={() => setConfirmandoLote(true)} data-testid="vinc-empenhos-lote">
                    Vincular pela sugestão
                  </ActionButton>
                </span>
              </div>
            )}

            {base.length === 0 ? (
              <EmptyState
                title={
                  filters.fila === 'EQUIPE' ? 'Nenhuma nota vinculada pela equipe nos últimos 30 dias.' : filters.fila === 'VALOR' ? 'Nenhuma nota vinculada pelo valor.' : 'Nenhuma nota a vincular aos itens.'
                }
                description={
                  filters.fila === 'EQUIPE'
                    ? 'As notas vinculadas aos itens pela equipe aparecem aqui por 30 dias.'
                    : filters.fila === 'VALOR'
                      ? 'Quando só um item do contrato explica o valor de uma nota, o servidor a vincula e ela aparece aqui.'
                      : 'Todas as notas dos contratos da sua carteira já estão vinculadas aos itens.'
                }
                testId="vinc-empenhos-vazio"
              />
            ) : lista.length === 0 ? (
              <CarteiraNoResults title="Nenhuma nota corresponde aos filtros." description="Altere os critérios ou limpe os filtros." onResetFilters={resetFilters} />
            ) : (
              <div data-testid="vinc-empenhos-table" className="carteira-shell" style={carteiraTableShell}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {podeVincular && filters.fila === 'A_VINCULAR' && (
                          <SelecaoHeaderCell chavesDaPagina={chavesDaPagina} selecionadas={selecao.selecionadas} onToggle={() => selecao.alternarVarias(chavesDaPagina)} testId="vinc-empenhos-selecionar-pagina" />
                        )}
                        <CarteiraSortHeader label="Empenho" sortKey="empenho" {...sort} />
                        <CarteiraSortHeader label="Contrato" sortKey="contrato" {...sort} />
                        <CarteiraSortHeader label="Emissão" sortKey="emissao" {...sort} />
                        <th style={carteiraTh}>{vinculadas ? 'Itens' : 'Sugestão'}</th>
                        <CarteiraSortHeader label="Situação" sortKey="situacao" {...sort} />
                        {showGestorFilter && <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sort} />}
                        {podeVincular && <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((d) => {
                        const c = contrato(d.contractKey);
                        const r = rotuloDaSituacao(d);
                        const marcada = selecao.selecionadas.has(chave(d));
                        const sugestao = sugestaoCurta(d.sugestaoTipo, d.sugestao);
                        return (
                          <tr
                            key={chave(d)}
                            data-testid={`vinc-empenhos-row-${d.numeroOficial}`}
                            className="carteira-row-link"
                            style={marcada ? { background: SELECIONADA_BG } : undefined}
                            onClick={abrirAoClicarNaLinha(() => abrirNota(d))}
                          >
                            {podeVincular && filters.fila === 'A_VINCULAR' && (
                              <SelecaoCell checked={marcada} onToggle={() => selecao.alternar(chave(d))} label={`Selecionar ${d.numeroOficial}`} testId={`vinc-empenhos-selecionar-${d.numeroOficial}`} disabled={!entraNoLote(d) || gravandoLote} />
                            )}
                            <td data-role="id" style={{ ...carteiraTd, minWidth: '160px' }}>
                              <CarteiraIdLink onClick={() => abrirNota(d)} label={`${podeVincular ? 'Vincular' : 'Ver'} ${d.numeroOficial}`} title={podeVincular ? 'Vincular esta nota aos itens do contrato' : 'Ver a nota no contrato'}>
                                {d.numeroOficial}
                              </CarteiraIdLink>
                              {d.uasgEmitente && <div style={subtle}>UASG {d.uasgEmitente}</div>}
                            </td>
                            <td data-label="Contrato" style={{ ...carteiraTd, minWidth: '180px', maxWidth: '300px' }}>
                              <AppButton variant="link" size="xs" type="button" onClick={() => abrirContrato(d)} title="Abrir o contrato com esta nota aberta">
                                {c.numero}
                              </AppButton>
                              <div style={carteiraFornecedor} title={c.fornecedorNome}>
                                {c.fornecedorNome ?? '—'}
                              </div>
                              <div style={subtle}>
                                {plural(d.itensNoContrato, 'item', 'itens')}
                                {c.expirado ? ` · ${textoEncerrado(c.vigenciaFim)}` : ''}
                              </div>
                            </td>
                            <td data-label="Emissão" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>{dataBR(d.dataEmissao)}</td>
                            <td data-label={vinculadas ? 'Itens' : 'Sugestão'} style={carteiraTd}>
                              {filters.fila === 'VALOR' ? (
                                <>
                                  <span>{d.parcelas.map((p) => `item ${p.numeroItem}`).join(', ')}</span>
                                  <div style={subtle}>{d.observacao ?? 'só este item explica o valor'}</div>
                                </>
                              ) : filters.fila === 'EQUIPE' ? (
                                <>
                                  <span>{d.parcelas.map((p) => `item ${p.numeroItem}${p.quantidadeInformada != null ? ` · ${p.quantidadeInformada} un` : ''}`).join(', ')}</span>
                                  <div style={subtle}>
                                    por {d.distribuidoPorNome || 'usuário'}
                                    {d.distribuidoEm ? ` em ${dataBR(d.distribuidoEm)}` : ''}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <StatusBadge
                                    label={temSugestaoUnica(d) ? 'Sugestão' : d.sugestaoTipo === 'VARIAS_POSSIBILIDADES' ? 'Mais de uma' : 'Sem sugestão'}
                                    variant={temSugestaoUnica(d) ? 'info' : d.sugestaoTipo === 'VARIAS_POSSIBILIDADES' ? 'warning' : 'neutral'}
                                    size="sm"
                                    dot={false}
                                  />
                                  {sugestao && (
                                    <div style={{ ...subtle, whiteSpace: 'nowrap' }} title={textoDaSugestao(d.sugestaoTipo, d.sugestao) ?? undefined}>
                                      {sugestao.replace(/^sugestão: /, '')}
                                    </div>
                                  )}
                                  {motivoDaNota(d.notaSiafi) && (
                                    <div style={{ ...subtle, color: 'var(--text-muted)' }} data-testid={`vinc-empenhos-motivo-nota-${d.numeroOficial}`}>
                                      SIAFI: {motivoDaNota(d.notaSiafi)}
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                            <td data-label="Situação" style={carteiraTd}>
                              {deixada(d) ? (
                                <MarcaDeixada marca={marcaDe(d)!} testId={`vinc-empenhos-deixada-${d.numeroOficial}`} />
                              ) : (
                                <>
                                  <StatusBadge label={r.label} variant={r.variant} size="sm" dot={false} />
                                  {d.situacao === 'REVISAR' && (
                                    <div style={subtle} title={motivoDaRevisao(d) ?? undefined}>
                                      {d.motivoRevisao === 'VALOR_MUDOU' ? 'valor da nota mudou' : 'item fora do contrato'}
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                            {showGestorFilter && (
                              <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                                {c.gestorNome ? (
                                  <CarteiraCellFilter descricao={`gestor ${c.gestorNome}`} onFilter={() => setFilter('gestor', c.gestorNome!)}>
                                    <span>{c.gestorNome}</span>
                                  </CarteiraCellFilter>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>—</span>
                                )}
                              </td>
                            )}
                            {podeVincular && (
                              <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                {filters.fila === 'VALOR' && (
                                  <ActionButton
                                    action="desfazer"
                                    size="sm"
                                    onClick={() => void naoEEsteItem(d)}
                                    isLoading={desfazendo === d.contratoEmpenhoId}
                                    disabled={desfazendo !== null}
                                    data-testid={`vinc-empenhos-nao-e-${d.numeroOficial}`}
                                  >
                                    Não é este item
                                  </ActionButton>
                                )}{' '}
                                {filters.fila === 'A_VINCULAR' && deixada(d) && (
                                  <ActionButton
                                    action="reexibir"
                                    size="sm"
                                    title="Tira a marca: a nota volta para a fila"
                                    onClick={() => deixar.reexibir(chaveAvisoDeixarNota(d.contractKey, d.contratoEmpenhoId), d.numeroOficial)}
                                    disabled={deixar.reexibindo}
                                    data-testid={`vinc-empenhos-reexibir-${d.numeroOficial}`}
                                  />
                                )}
                                {filters.fila === 'A_VINCULAR' && c.expirado && !deixada(d) && (
                                  <ActionButton
                                    action="deixarComoEsta"
                                    size="sm"
                                    title="Contrato encerrado: a nota sai da fila e do número do menu, com justificativa"
                                    onClick={() =>
                                      deixar.abrir({
                                        chave: chaveAvisoDeixarNota(d.contractKey, d.contratoEmpenhoId),
                                        titulo: d.numeroOficial,
                                        contexto: `${formatCurrency(d.valorNota)} · contrato ${c.numero}${c.fornecedorNome ? ` (${c.fornecedorNome})` : ''}, ${textoEncerrado(c.vigenciaFim)}`
                                      })
                                    }
                                    data-testid={`vinc-empenhos-deixar-${d.numeroOficial}`}
                                  />
                                )}{' '}
                                <ActionButton action="vincular" size="sm" onClick={() => setNota(d)} data-testid={`vinc-empenhos-vincular-${d.numeroOficial}`}>
                                  {vinculadas ? 'Editar o vínculo' : 'Vincular aos itens'}
                                </ActionButton>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <CarteiraPagination page={currentPage} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} testIdPrefix="vinc-empenhos" />
              </div>
            )}
            </>
          )}
          {isFetching && <span style={subtle}>Atualizando...</span>}
        </>
      )}

      {confirmDialog}
      {deixar.dialog}
      <VincularAosItensDialog nota={nota} numeroContrato={nota ? contrato(nota.contractKey).numero : ''} onFechar={() => setNota(null)} />

      <Modal
        isOpen={confirmandoLote}
        onClose={() => !gravandoLote && setConfirmandoLote(false)}
        title={`Vincular ${plural(selecionadas.length, 'nota', 'notas')} pela sugestão`}
        subtitle="Cada nota fica vinculada ao item sugerido, com a quantidade sugerida. Dá para editar ou desfazer depois, nota a nota."
        size="md"
        dismissible={!gravandoLote}
        testId="vinc-empenhos-lote-modal"
        footer={
          <>
            <ActionButton action="cancelar" size="sm" onClick={() => setConfirmandoLote(false)} disabled={gravandoLote} />
            <AppButton variant="primary" size="sm" onClick={() => void vincularLote()} isLoading={gravandoLote} disabled={gravandoLote || selecionadas.length === 0} data-testid="vinc-empenhos-lote-confirmar">
              Vincular {selecionadas.length}
            </AppButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
            {selecionadas.map((d) => (
              <div key={d.contratoEmpenhoId} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.45rem 0.65rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.82rem' }}>
                <span>
                  <strong>{d.numeroOficial}</strong> · {contrato(d.contractKey).numero}
                </span>
                <span style={{ whiteSpace: 'nowrap' }}>
                  <strong>
                    {d.sugestao[0]?.quantidade.toLocaleString('pt-BR')} un do item {d.sugestao[0]?.numeroItem}
                  </strong>
                </span>
              </div>
            ))}
          </div>
          <AppTextarea label="Observação (opcional, vale para todas)" value={obsLote} onChange={(e) => setObsLote(e.target.value)} rows={2} maxLength={500} placeholder="Ex.: sugestões conferidas com as notas de empenho." disabled={gravandoLote} />
        </div>
      </Modal>
    </PageContainer>
  );
};
