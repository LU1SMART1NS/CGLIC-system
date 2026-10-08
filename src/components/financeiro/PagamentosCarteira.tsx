import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchEnvioPrevisao, mesDaProximaPrevisao, prazoDaPrevisao } from '../../services/previsaoMensalService';
import { dataBR, rotuloDoMes } from './financeiroFormat';
import { CreditCard } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { ActionButton } from '../../design-system/components/ActionButton';
import { useToast } from '../../design-system';
import { useAuth } from '../../context/AuthContext';
import { createPaymentCycleRpc, type CreatePaymentCycleInput } from '../../adapters/paymentCycleRpcAdapter';
import { CreateCycleModal } from '../contracts/payment/PaymentCycleModals';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { usePagamentosCarteira, useSincronizacaoPagamentos } from '../../hooks/useFinanceiroCarteira';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { TODOS_GESTORES, listGestores, matchesGestorFilter } from '../carteira/carteiraGestor';
import { formatCurrencyCompact } from '../carteira/carteiraFormat';
import { GRUPO_DA_ETAPA, type EtapaPagamento, type GrupoPagamento } from '../../services/financeiroCarteiraService';
import { useContratosDoFinanceiro, uasgDaChave } from './useContratosDoFinanceiro';
import { normalizarBusca } from './financeiroFormat';
import { descreverLinha } from './pagamentoLinha';
import { PagamentosCarteiraTable, type PagamentoComLinha } from './PagamentosCarteiraTable';

export interface PagamentosFilterState {
  grupo: string;
  etapa: string;
  ano: string;
  uasg: string;
  gestor: string;
  busca: string;
}

const TODOS = 'TODOS';
const ETAPAS: EtapaPagamento[] = ['NA_CGLIC', 'ERRO_SIAFI', 'DEVOLVIDO_CORRECAO', 'NA_CGOFI', 'EM_ANDAMENTO', 'AGUARDANDO_OB', 'PAGA', 'CANCELADA'];

const ROTULO_ETAPA: Record<EtapaPagamento, string> = {
  NA_CGLIC: 'Na CGLIC',
  ERRO_SIAFI: 'Erro no SIAFI',
  DEVOLVIDO_CORRECAO: 'Devolvido para correção',
  NA_CGOFI: 'Na CGOFI',
  EM_ANDAMENTO: 'Não liquidada',
  AGUARDANDO_OB: 'Aguardando OB',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada'
};

const PAGAMENTOS_FILTER_SCHEMA: CarteiraFilterSchema<PagamentosFilterState> = {
  grupo: { param: 'situacao', default: 'ACAO', values: ['ACAO', 'TRAMITACAO', 'PAGA', TODOS] },
  etapa: { param: 'etapa', default: TODOS, values: [...ETAPAS, TODOS] },
  ano: { param: 'ano', default: TODOS },
  uasg: { param: 'uasg', default: TODOS },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  busca: { param: 'busca', default: '' }
};

/** Ordem padrão: ciclos pelo prazo mais próximo; faturas da mais recente para a mais antiga. */
function ordemPadrao(a: PagamentoComLinha, b: PagamentoComLinha): number {
  if (a.row.tipo !== b.row.tipo) return a.row.tipo === 'CICLO' ? -1 : 1;
  const da = a.linha.prazo.ordem ?? '';
  const db = b.linha.prazo.ordem ?? '';
  return a.row.tipo === 'CICLO' ? da.localeCompare(db) : db.localeCompare(da);
}

/**
 * Financeiro → Pagamentos: os ciclos de pagamento em aberto (etapas da CGLIC e da CGOFI) e todas as faturas dos
 * contratos no Contratos.gov.br, com a liquidação no SIAFI e a ordem bancária do Tesouro. Mesma moldura da Carteira.
 */
export const PagamentosCarteira: React.FC = () => {
  const navigate = useNavigateWithOrigin();
  const sincronizacao = useSincronizacaoPagamentos();
  const { rows: todos, isLoading, isFetching, error, refetch } = usePagamentosCarteira();
  const { contrato, lista: contratos, escopo, showGestorFilter, isLoading: carregandoContratos } = useContratosDoFinanceiro();
  const { user, role } = useAuth();
  const podeAbrirCiclo = role === 'gestor' || role === 'admin';
  const [abrindoCiclo, setAbrindoCiclo] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const registradoPorNome = (user?.user_metadata as { full_name?: string } | undefined)?.full_name || user?.email || undefined;

  // Botão da previsão do mês (Portaria 50): mostra o mês da próxima previsão e se já foi enviada.
  const irPara = useNavigate();
  const mesPrevisao = mesDaProximaPrevisao();
  const envioPrevisao = useQuery({ queryKey: ['previsao-envio', mesPrevisao], queryFn: () => fetchEnvioPrevisao(mesPrevisao), staleTime: 5 * 60 * 1000 });
  const rotuloPrevisao = `Previsão de ${rotuloDoMes(mesPrevisao).split('/')[0]} · ${envioPrevisao.data ? 'enviada' : `até ${dataBR(prazoDaPrevisao(mesPrevisao)).slice(0, 5)}`}`;

  const abrirCiclo = async (input: CreatePaymentCycleInput) => {
    await createPaymentCycleRpc(input);
    toast.success('Ciclo de pagamento aberto.');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['financeiro-ciclos-em-aberto'] }),
      queryClient.invalidateQueries({ queryKey: ['contract-payment-cycles', input.contractKey] }),
      queryClient.invalidateQueries({ queryKey: ['management-dashboard'] })
    ]);
  };
  const { filters, setFilter, setFilters, resetFilters } = useCarteiraFilters(PAGAMENTOS_FILTER_SCHEMA);

  // Perfil gestor: só os pagamentos dos próprios contratos.
  const itens = useMemo<PagamentoComLinha[]>(() => {
    const hoje = new Date();
    return todos
      .filter((row) => !escopo || escopo.has(row.contractKey))
      .map((row) => ({ row, linha: descreverLinha(row, hoje), contrato: contrato(row.contractKey) }));
  }, [todos, escopo, contrato]);

  // Contagem das etapas e valor aguardando OB, sobre todos os pagamentos visíveis (independentes dos filtros).
  const resumo = useMemo(() => {
    const porEtapa = new Map<string, number>();
    let aguardandoOb = 0;
    for (const { row, linha } of itens) {
      porEtapa.set(row.etapa, (porEtapa.get(row.etapa) ?? 0) + 1);
      if (row.etapa === 'AGUARDANDO_OB') aguardandoOb += linha.valor;
    }
    return { porEtapa, aguardandoOb };
  }, [itens]);

  const anos = useMemo(() => {
    const map = new Map<string, number>();
    for (const { linha } of itens) if (linha.ano) map.set(linha.ano, (map.get(linha.ano) ?? 0) + 1);
    return map;
  }, [itens]);
  const uasgs = useMemo(() => {
    const map = new Map<string, number>();
    for (const { row } of itens) map.set(uasgDaChave(row.contractKey), (map.get(uasgDaChave(row.contractKey)) ?? 0) + 1);
    return map;
  }, [itens]);
  const gestores = useMemo(() => listGestores(itens.map((i) => i.contrato.gestorNome)), [itens]);

  const lista = useMemo(() => {
    const q = normalizarBusca(filters.busca);
    return itens
      .filter(({ row, linha, contrato: c }) => {
        if (filters.grupo !== TODOS && GRUPO_DA_ETAPA[row.etapa] !== filters.grupo) return false;
        if (filters.etapa !== TODOS && row.etapa !== filters.etapa) return false;
        if (filters.ano !== TODOS && linha.ano !== filters.ano) return false;
        if (filters.uasg !== TODOS && uasgDaChave(row.contractKey) !== filters.uasg) return false;
        if (showGestorFilter && !matchesGestorFilter(c.gestorNome, filters.gestor)) return false;
        if (q && !normalizarBusca(`${c.numero} ${c.fornecedorNome ?? ''} ${linha.busca}`).includes(q)) return false;
        return true;
      })
      .sort(ordemPadrao);
  }, [itens, filters, showGestorFilter]);

  const abrir = ({ row }: PagamentoComLinha) => navigate(`/contratos/${encodeURIComponent(row.contractKey)}?aba=pagamentos`);

  if (error && todos.length === 0) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState title="Erro ao carregar os pagamentos" message={error.message} onRetry={() => void refetch()} />
      </PageContainer>
    );
  }

  const hasActive = hasActiveCarteiraFilters(PAGAMENTOS_FILTER_SCHEMA, filters);
  const isBusy = isLoading || carregandoContratos;
  const n = (etapa: EtapaPagamento) => resumo.porEtapa.get(etapa) ?? 0;
  const nGrupo = (grupo: GrupoPagamento) => ETAPAS.filter((e) => GRUPO_DA_ETAPA[e] === grupo).reduce((s, e) => s + n(e), 0);
  // Opções do filtro de etapa: as do segmento escolhido (em Todas, todas), com a contagem.
  const etapasDoGrupo = ETAPAS.filter((e) => (filters.grupo === TODOS || GRUPO_DA_ETAPA[e] === filters.grupo) && n(e) > 0);
  // Trocar de segmento solta a etapa que não é dele; escolher uma etapa (no botão ou na célula) leva ao segmento dela.
  const escolherGrupo = (grupo: string) => {
    const etapaFora = filters.etapa !== TODOS && grupo !== TODOS && GRUPO_DA_ETAPA[filters.etapa as EtapaPagamento] !== grupo;
    setFilters(etapaFora ? { grupo, etapa: TODOS } : { grupo });
  };
  const escolherEtapa = (etapa: string) =>
    setFilters(etapa === TODOS || filters.grupo === TODOS ? { etapa } : { etapa, grupo: GRUPO_DA_ETAPA[etapa as EtapaPagamento] ?? TODOS });
  const filtrarPelaCelula: typeof setFilter = (key, value) => (key === 'etapa' ? escolherEtapa(value) : setFilter(key, value));

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Pagamentos"
        subtitle="Ciclos da CGLIC e faturas dos contratos, da liquidação no SIAFI à ordem bancária."
        icon={<CreditCard size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <>
          <ActionButton action="abrir" onClick={() => irPara('/pagamentos/previsao')} label={rotuloPrevisao} title="Previsão mensal de pagamentos (Portaria 50, art. 5º, § 2º, III)" data-testid="pagamentos-previsao" />
          {podeAbrirCiclo && <ActionButton action="novo" onClick={() => setAbrindoCiclo(true)} label="Abrir ciclo" data-testid="pagamentos-abrir-ciclo" />}
          <HeaderRefreshAction
            onRefresh={sincronizacao.podeForcar ? () => void sincronizacao.atualizar() : undefined}
            isRefreshing={sincronizacao.sincronizando || isFetching}
            lastUpdated={sincronizacao.ultimoSucessoEm}
            tooltipTitle={
              sincronizacao.podeForcar
                ? 'Atualizar as faturas e as ordens bancárias com o Contratos.gov.br e o Tesouro'
                : 'As faturas e as ordens bancárias são atualizadas automaticamente pelo servidor, de hora em hora'
            }
            dataTestId="payments-refresh-btn"
          />
          </>
        }
      />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando pagamentos...">
          <SkeletonLoader variant="rectangular" height="40px" count={1} />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
        <>
          <CarteiraSegmentTabs
            testIdPrefix="pagamentos-situacao"
            ariaLabel="Situação do pagamento"
            active={filters.grupo}
            onSelect={escolherGrupo}
            segments={[
              {
                id: 'ACAO',
                label: 'Precisa de ação',
                count: nGrupo('ACAO'),
                dot: n('ERRO_SIAFI') > 0 ? 'var(--color-danger)' : undefined,
                title: 'Ciclos com a CGLIC (conferência, pendência, envio) e faturas com erro no SIAFI'
              },
              { id: 'TRAMITACAO', label: 'Em tramitação', count: nGrupo('TRAMITACAO'), title: 'Devolvidos para correção, na CGOFI, faturas ainda não liquidadas e liquidadas aguardando a ordem bancária' },
              { id: 'PAGA', label: 'Pagas', count: nGrupo('PAGA'), title: 'Faturas cuja nota de pagamento tem ordem bancária válida' },
              { id: TODOS, label: 'Todas', count: itens.length }
            ]}
            meta={`${formatCurrencyCompact(resumo.aguardandoOb)} aguardando OB`}
          />

          <CarteiraFilterBar
            busca={filters.busca}
            searchPlaceholder="Buscar por contrato, fornecedor, fatura, empenho, NP, OB..."
            onChangeBusca={(v) => setFilter('busca', v)}
            hasActiveFilters={hasActive}
            onResetFilters={resetFilters}
            counter={carteiraCounter(lista.length, itens.length, hasActive, 'pagamento', 'pagamentos')}
            testIdPrefix="pagamentos"
          >
            <CarteiraFilterButton
              label="Etapa"
              value={filters.etapa}
              emptyValue={TODOS}
              options={etapasDoGrupo.map((e) => ({ value: e, label: ROTULO_ETAPA[e], count: n(e) }))}
              onChange={escolherEtapa}
              testId="pagamentos-filter-etapa"
            />
            <CarteiraFilterButton
              label="Ano"
              value={filters.ano}
              emptyValue={TODOS}
              options={[...anos.keys()].sort().reverse().map((a) => ({ value: a, label: a, count: anos.get(a) }))}
              onChange={(v) => setFilter('ano', v)}
              testId="pagamentos-filter-ano"
            />
            <CarteiraFilterButton
              label="UASG"
              value={filters.uasg}
              emptyValue={TODOS}
              options={[...uasgs.keys()].sort().map((u) => ({ value: u, label: u, count: uasgs.get(u) }))}
              onChange={(v) => setFilter('uasg', v)}
              testId="pagamentos-filter-uasg"
            />
            {showGestorFilter && (
              <CarteiraGestorSelect value={filters.gestor} gestores={gestores} onChange={(v) => setFilter('gestor', v)} testId="pagamentos-filter-gestor" />
            )}
          </CarteiraFilterBar>

          <PagamentosCarteiraTable
            items={lista}
            total={itens.length}
            onOpen={abrir}
            onResetFilters={resetFilters}
            onFilter={filtrarPelaCelula}
            canFilterGestor={showGestorFilter}
          />
        </>
      )}
      <CreateCycleModal
        isOpen={abrindoCiclo}
        onClose={() => setAbrindoCiclo(false)}
        contratos={escopo ? contratos.filter((c) => escopo.has(c.contractKey)) : contratos}
        registradoPorNome={registradoPorNome}
        onSubmit={abrirCiclo}
      />
    </PageContainer>
  );
};
