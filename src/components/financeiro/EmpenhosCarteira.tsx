import React, { useCallback, useMemo } from 'react';
import { Banknote } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { FontesComFalhaAviso } from '../fonte/FontesComFalhaAviso';
import { naoCarregou, useLeiturasComFalha } from '../fonte/useLeiturasComFalha';
import { ListaNaoCarregou } from '../fonte/ListaNaoCarregou';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useSincronizacaoEmpenhos } from '../../hooks/useSincronizacaoEmpenhos';
import { ROTULOS_FINANCEIRO, useEmpenhosCarteira } from '../../hooks/useFinanceiroCarteira';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { TODOS_GESTORES, listGestores, matchesGestorFilter } from '../carteira/carteiraGestor';
import { formatCurrencyCompact } from '../carteira/carteiraFormat';
import { saldoRestosAPagar, situacaoDoSaldo, situacaoRestosAPagar, type EmpenhoCarteiraRow } from '../../services/financeiroCarteiraService';
import { useContratosDoFinanceiro } from './useContratosDoFinanceiro';
import { dataHoraTesouro, normalizarBusca } from './financeiroFormat';
import { EmpenhosCarteiraTable } from './EmpenhosCarteiraTable';
import { AvisoCarregando } from '../../design-system';
import { useSituacaoDistribuicaoPorEmpenho } from '../../hooks/useVinculacaoEmpenhos';

export interface EmpenhosFilterState {
  saldo: string;
  rp: string;
  ano: string;
  uasg: string;
  gestor: string;
  busca: string;
}

const TODOS = 'TODOS';

/** Filtro "Restos a pagar" (Tesouro, ano corrente). */
const OPCOES_RP = [
  { value: 'RP', label: 'Com restos a pagar' },
  { value: 'NAO_PROCESSADO', label: 'Não processados' },
  { value: 'PROCESSADO', label: 'Processados' },
  { value: 'SEM_RP', label: 'Sem restos a pagar' }
] as const;

function casaComRp(r: EmpenhoCarteiraRow, filtro: string): boolean {
  const s = situacaoRestosAPagar(r.restosAPagar);
  if (filtro === 'RP') return s !== null;
  if (filtro === 'NAO_PROCESSADO') return s === 'NAO_PROCESSADO' || s === 'OS_DOIS';
  if (filtro === 'PROCESSADO') return s === 'PROCESSADO' || s === 'OS_DOIS';
  if (filtro === 'SEM_RP') return s === null;
  return true;
}

const EMPENHOS_FILTER_SCHEMA: CarteiraFilterSchema<EmpenhosFilterState> = {
  saldo: { param: 'saldo', default: 'COM_SALDO', values: ['COM_SALDO', 'SEM_SALDO', TODOS] },
  rp: { param: 'rp', default: TODOS, values: [...OPCOES_RP.map((o) => o.value), TODOS] },
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
  const { rows: todos, isLoading, isFetching, leituras: leiturasEmpenhos } = useEmpenhosCarteira();
  const { contrato, escopo, showGestorFilter, isLoading: carregandoContratos, leituras: leiturasContratos, contratosNaoCarregaram } = useContratosDoFinanceiro();
  const { filters, setFilter, resetFilters } = useCarteiraFilters(EMPENHOS_FILTER_SCHEMA);
  // Coluna "Itens": situação do vínculo de cada nota aos itens do contrato (o trabalho fica no menu Vínculos).
  const situacaoItensQuery = useSituacaoDistribuicaoPorEmpenho();
  const { data: situacaoItens } = situacaoItensQuery;
  // Uma fonte que falha não trava a tela: o que carregou aparece e a faixa diz o que ficou de fora.
  const leituras = useLeiturasComFalha([
    ...leiturasEmpenhos,
    ...leiturasContratos,
    { rotulo: 'situação das notas nos itens (coluna Itens)', query: situacaoItensQuery }
  ]);

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
    let tesouroEm: string | null = null;
    for (const r of rows) {
      if (r.tesouroAtualizadoEm && (!tesouroEm || r.tesouroAtualizadoEm > tesouroEm)) tesouroEm = r.tesouroAtualizadoEm;
      const s = situacaoDoSaldo(r);
      if (s === 'COM_SALDO') {
        comSaldo++;
        saldoTotal += r.saldo ?? 0;
      } else if (s === 'SEM_SALDO') semSaldo++;
    }
    return { comSaldo, semSaldo, saldoTotal, tesouroEm };
  }, [rows]);

  // Restos a pagar (Tesouro, ano corrente): contagem de cada opção do filtro e totais das que casam com o filtro.
  const restos = useMemo(() => {
    const contagem = new Map<string, number>(OPCOES_RP.map((o) => [o.value, 0]));
    let saldo = 0;
    let liquidado = 0;
    let pagoNoAno = 0;
    for (const r of rows) {
      for (const o of OPCOES_RP) if (casaComRp(r, o.value)) contagem.set(o.value, (contagem.get(o.value) ?? 0) + 1);
      if (filters.rp !== TODOS && filters.rp !== 'SEM_RP' && casaComRp(r, filters.rp) && r.restosAPagar) {
        saldo += saldoRestosAPagar(r.restosAPagar);
        liquidado += r.restosAPagar.naoProcessadoLiquidadoAPagar + r.restosAPagar.processadoAPagar;
        pagoNoAno += r.restosAPagar.pagoNoAno;
      }
    }
    return { contagem, saldo, liquidado, pagoNoAno };
  }, [rows, filters.rp]);
  const resumoRp = filters.rp !== TODOS && filters.rp !== 'SEM_RP';

  const anos = useMemo(() => contar(rows, (r) => (r.ano ? String(r.ano) : null)), [rows]);
  const uasgs = useMemo(() => contar(rows, (r) => r.uasgEmitente), [rows]);
  const gestores = useMemo(() => listGestores(rows.map(gestorDe)), [rows, gestorDe]);

  const lista = useMemo(() => {
    const q = normalizarBusca(filters.busca);
    const qDigitos = q.replace(/\D/g, '');
    return rows
      .filter((r) => {
        if (filters.saldo !== TODOS && situacaoDoSaldo(r) !== filters.saldo) return false;
        if (filters.rp !== TODOS && !casaComRp(r, filters.rp)) return false;
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

  // Lista vazia porque a leitura falhou (empenhos; no perfil gestor, também os contratos do recorte): não é "nenhum empenho".
  const listaNaoCarregou =
    rows.length === 0 &&
    (leiturasEmpenhos.some((l) => l.rotulo === ROTULOS_FINANCEIRO.empenhos && naoCarregou(l.query)) || (Boolean(escopo) && contratosNaoCarregaram));

  const abrir = (row: EmpenhoCarteiraRow) => navigate(`/contratos/${encodeURIComponent(row.contractKeys[0])}?aba=financeiro`);

  const hasActive = hasActiveCarteiraFilters(EMPENHOS_FILTER_SCHEMA, filters);
  const isBusy = isLoading || carregandoContratos;

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Empenhos"
        subtitle="Notas de empenho dos contratos, com o pago e o saldo do Tesouro (SIAFI) e a soma das faturas para comparar."
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

      <FontesComFalhaAviso falhas={leituras.falhas} onTentar={() => void leituras.tentarDeNovo()} tentando={leituras.tentando} onde="dos Empenhos" testIdPrefix="empenhos-fontes" />

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
            testIdPrefix="empenhos-saldo"
            ariaLabel="Saldo do empenho"
            active={filters.saldo}
            onSelect={(v) => setFilter('saldo', v)}
            segments={[
              { id: 'COM_SALDO', label: 'Com saldo', count: resumo.comSaldo, title: 'Ainda há valor a liquidar ou liquidado a pagar no Tesouro' },
              { id: 'SEM_SALDO', label: 'Sem saldo', count: resumo.semSaldo, title: 'Empenho todo pago ou cancelado' },
              { id: TODOS, label: 'Todos', count: rows.length }
            ]}
            meta={
              (resumoRp
                ? `${formatCurrencyCompact(restos.saldo)} em restos a pagar (${formatCurrencyCompact(restos.liquidado)} liquidados) · ${formatCurrencyCompact(restos.pagoNoAno)} pagos no ano`
                : `${formatCurrencyCompact(resumo.saldoTotal)} de saldo a pagar`) + (resumo.tesouroEm ? ` · Tesouro em ${dataHoraTesouro(resumo.tesouroEm)}` : '')
            }
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
              label="Restos a pagar"
              value={filters.rp}
              emptyValue={TODOS}
              options={OPCOES_RP.map((o) => ({ value: o.value, label: o.label, count: restos.contagem.get(o.value) }))}
              onChange={(v) => setFilter('rp', v)}
              testId="empenhos-filter-rp"
            />
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

          {listaNaoCarregou ? (
            <ListaNaoCarregou titulo="Os empenhos não carregaram." testId="empenhos-nao-carregou" />
          ) : (
            <EmpenhosCarteiraTable
              rows={lista}
              totalEmpenhos={rows.length}
              contrato={contrato}
              onOpen={abrir}
              onResetFilters={resetFilters}
              onFilter={setFilter}
              canFilterGestor={showGestorFilter}
              itensDe={(empenhoId) => situacaoItens?.get(empenhoId)}
            />
          )}
        </>
      )}
    </PageContainer>
  );
};
