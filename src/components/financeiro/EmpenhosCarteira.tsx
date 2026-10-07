import React, { useCallback, useMemo } from 'react';
import { Banknote } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useSincronizacaoEmpenhos } from '../../hooks/useSincronizacaoEmpenhos';
import { useEmpenhosCarteira } from '../../hooks/useFinanceiroCarteira';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { TODOS_GESTORES, listGestores, matchesGestorFilter } from '../carteira/carteiraGestor';
import { formatCurrencyCompact } from '../carteira/carteiraFormat';
import { situacaoDoSaldo, type EmpenhoCarteiraRow } from '../../services/financeiroCarteiraService';
import { useContratosDoFinanceiro } from './useContratosDoFinanceiro';
import { normalizarBusca } from './financeiroFormat';
import { EmpenhosCarteiraTable } from './EmpenhosCarteiraTable';

export interface EmpenhosFilterState {
  saldo: string;
  ano: string;
  uasg: string;
  gestor: string;
  busca: string;
}

const TODOS = 'TODOS';

const EMPENHOS_FILTER_SCHEMA: CarteiraFilterSchema<EmpenhosFilterState> = {
  saldo: { param: 'saldo', default: 'COM_SALDO', values: ['COM_SALDO', 'SEM_SALDO', TODOS] },
  ano: { param: 'ano', default: TODOS },
  uasg: { param: 'uasg', default: TODOS },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  busca: { param: 'busca', default: '' }
};

/** Contagem por valor (ano, UASG) para as opções dos filtros. */
function contar(rows: EmpenhoCarteiraRow[], chave: (r: EmpenhoCarteiraRow) => string | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = chave(r);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

/**
 * Financeiro → Empenhos: as notas de empenho dos contratos, com o pago somado pelas faturas com ordem bancária
 * e o saldo de cada uma. Mesma moldura das abas da Carteira.
 */
export const EmpenhosCarteira: React.FC = () => {
  const navigate = useNavigateWithOrigin();
  const sincronizacao = useSincronizacaoEmpenhos();
  const { rows: todos, isLoading, isFetching, error, refetch } = useEmpenhosCarteira();
  const { contrato, escopo, showGestorFilter, isLoading: carregandoContratos } = useContratosDoFinanceiro();
  const { filters, setFilter, resetFilters } = useCarteiraFilters(EMPENHOS_FILTER_SCHEMA);

  // Perfil gestor: só os empenhos dos próprios contratos.
  const rows = useMemo(
    () => (escopo ? todos.filter((r) => r.contractKeys.some((k) => escopo.has(k))) : todos),
    [todos, escopo]
  );
  const gestorDe = useCallback((r: EmpenhoCarteiraRow) => contrato(r.contractKeys[0]).gestorNome, [contrato]);

  // Segmentos de saldo e o saldo total, sobre todos os empenhos visíveis (independentes dos filtros, como nas carteiras).
  const resumo = useMemo(() => {
    let comSaldo = 0;
    let semSaldo = 0;
    let saldoTotal = 0;
    for (const r of rows) {
      const s = situacaoDoSaldo(r);
      if (s === 'COM_SALDO') {
        comSaldo++;
        saldoTotal += r.saldo ?? 0;
      } else if (s === 'SEM_SALDO') semSaldo++;
    }
    return { comSaldo, semSaldo, saldoTotal };
  }, [rows]);

  const anos = useMemo(() => contar(rows, (r) => (r.ano ? String(r.ano) : null)), [rows]);
  const uasgs = useMemo(() => contar(rows, (r) => r.uasgEmitente), [rows]);
  const gestores = useMemo(() => listGestores(rows.map(gestorDe)), [rows, gestorDe]);

  const lista = useMemo(() => {
    const q = normalizarBusca(filters.busca);
    const qDigitos = q.replace(/\D/g, '');
    return rows
      .filter((r) => {
        if (filters.saldo !== TODOS && situacaoDoSaldo(r) !== filters.saldo) return false;
        if (filters.ano !== TODOS && String(r.ano ?? '') !== filters.ano) return false;
        if (filters.uasg !== TODOS && r.uasgEmitente !== filters.uasg) return false;
        if (showGestorFilter && !matchesGestorFilter(gestorDe(r), filters.gestor)) return false;
        if (q) {
          const contratos = r.contractKeys.map((k) => contrato(k));
          const casa =
            normalizarBusca(r.numero).includes(q) ||
            normalizarBusca(r.credorNome ?? '').includes(q) ||
            contratos.some((c) => normalizarBusca(c.numero).includes(q) || normalizarBusca(c.fornecedorNome ?? '').includes(q)) ||
            (qDigitos.length >= 3 && (r.credorDocumento ?? '').replace(/\D/g, '').includes(qDigitos));
          if (!casa) return false;
        }
        return true;
      })
      .sort((a, b) => (b.dataEmissao ?? '').localeCompare(a.dataEmissao ?? ''));
  }, [rows, filters, showGestorFilter, contrato, gestorDe]);

  const abrir = (row: EmpenhoCarteiraRow) => navigate(`/contratos/${encodeURIComponent(row.contractKeys[0])}?aba=financeiro`);

  if (error && todos.length === 0) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState title="Erro ao carregar os empenhos" message={error.message} onRetry={() => void refetch()} />
      </PageContainer>
    );
  }

  const hasActive = hasActiveCarteiraFilters(EMPENHOS_FILTER_SCHEMA, filters);
  const isBusy = isLoading || carregandoContratos;

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Empenhos"
        subtitle="Notas de empenho dos contratos, com o que já foi pago por fatura e o saldo de cada uma."
        icon={<Banknote size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <HeaderRefreshAction
            // Só o coordenador atualiza com as fontes oficiais; os demais perfis leem o banco, que o servidor mantém em dia.
            onRefresh={sincronizacao.podeForcar ? () => void sincronizacao.atualizar() : undefined}
            isRefreshing={sincronizacao.sincronizando || isFetching}
            lastUpdated={sincronizacao.ultimoSucessoEm}
            tooltipTitle={
              sincronizacao.podeForcar
                ? 'Atualizar os empenhos com o Contratos.gov.br'
                : 'Os empenhos são atualizados automaticamente pelo servidor, de hora em hora'
            }
            dataTestId="financial-execution-refresh-btn"
          />
        }
      />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando empenhos...">
          <SkeletonLoader variant="rectangular" height="40px" count={1} />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
        <>
          <CarteiraSegmentTabs
            testIdPrefix="empenhos-saldo"
            ariaLabel="Saldo do empenho"
            active={filters.saldo}
            onSelect={(v) => setFilter('saldo', v)}
            segments={[
              { id: 'COM_SALDO', label: 'Com saldo', count: resumo.comSaldo, title: 'Empenhado maior que o pago pelas faturas' },
              { id: 'SEM_SALDO', label: 'Sem saldo', count: resumo.semSaldo, title: 'Empenho todo pago' },
              { id: TODOS, label: 'Todos', count: rows.length }
            ]}
            meta={`${formatCurrencyCompact(resumo.saldoTotal)} de saldo a pagar`}
          />

          <CarteiraFilterBar
            busca={filters.busca}
            searchPlaceholder="Buscar por empenho, contrato, credor, CNPJ..."
            onChangeBusca={(v) => setFilter('busca', v)}
            hasActiveFilters={hasActive}
            onResetFilters={resetFilters}
            counter={carteiraCounter(lista.length, rows.length, hasActive, 'empenho', 'empenhos')}
            testIdPrefix="empenhos"
          >
            <CarteiraFilterButton
              label="Ano"
              value={filters.ano}
              emptyValue={TODOS}
              options={[...anos.keys()].sort().reverse().map((a) => ({ value: a, label: a, count: anos.get(a) }))}
              onChange={(v) => setFilter('ano', v)}
              testId="empenhos-filter-ano"
            />
            <CarteiraFilterButton
              label="UASG"
              value={filters.uasg}
              emptyValue={TODOS}
              options={[...uasgs.keys()].sort().map((u) => ({ value: u, label: u, count: uasgs.get(u) }))}
              onChange={(v) => setFilter('uasg', v)}
              testId="empenhos-filter-uasg"
            />
            {showGestorFilter && (
              <CarteiraGestorSelect value={filters.gestor} gestores={gestores} onChange={(v) => setFilter('gestor', v)} testId="empenhos-filter-gestor" />
            )}
          </CarteiraFilterBar>

          <EmpenhosCarteiraTable
            rows={lista}
            totalEmpenhos={rows.length}
            contrato={contrato}
            onOpen={abrir}
            onResetFilters={resetFilters}
            onFilter={setFilter}
            canFilterGestor={showGestorFilter}
          />
        </>
      )}
    </PageContainer>
  );
};
