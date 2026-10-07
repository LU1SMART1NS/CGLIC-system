import React, { useCallback, useMemo } from 'react';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { NoticeBar, useToast } from '../../design-system';
import { useAuth } from '../../context/AuthContext';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useFaturasCarteira } from '../../hooks/useFinanceiroCarteira';
import { useExpectativasPagamento } from '../../hooks/useExpectativasPagamento';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { TODOS_GESTORES, listGestores, matchesGestorFilter } from '../carteira/carteiraGestor';
import { formatCurrencyCompact } from '../carteira/carteiraFormat';
import {
  historicoDePagamentos,
  sugerirExpectativa,
  ultimosMesesFechados,
  type TipoExpectativa
} from '../../services/expectativaPagamentoService';
import { useContratosDoFinanceiro } from './useContratosDoFinanceiro';
import { normalizarBusca } from './financeiroFormat';
import { classeDaLinha, type ClasseExpectativa, type LinhaExpectativa } from './previsaoLinha';
import { PrevisaoContratosTable } from './PrevisaoContratosTable';

interface PrevisaoFilterState {
  classe: string;
  gestor: string;
  busca: string;
}

const TODOS = 'TODOS';
const CLASSES: ClasseExpectativa[] = ['SUGERIDO_MENSAL', 'TALVEZ_MENSAL', 'MENSAL', 'ENTREGA', 'EVENTUAL', 'SEM_CLASSE'];

const PREVISAO_FILTER_SCHEMA: CarteiraFilterSchema<PrevisaoFilterState> = {
  classe: { param: 'tipo', default: 'SUGERIDO_MENSAL', values: [...CLASSES, TODOS] },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  busca: { param: 'busca', default: '' }
};

/**
 * Pagamentos → Previsão → "Como cada contrato é pago": como cada contrato vigente costuma ser pago. A marca (mensal, por entrega, eventual)
 * alimenta a previsão mensal da Portaria DGFNSP 50/2025 e os avisos de nota que não chegou. Sem marca, o sistema
 * sugere pelo histórico: pago nos 3 últimos meses fechados = mensal; em 2 deles = talvez mensal.
 */
export const PrevisaoContratos: React.FC = () => {
  const navigate = useNavigateWithOrigin();
  const toast = useToast();
  const { user, role } = useAuth();
  const podeMarcar = role === 'gestor' || role === 'admin';
  const registradoPorNome = (user?.user_metadata as { full_name?: string } | undefined)?.full_name || user?.email || undefined;

  const { lista: contratos, escopo, showGestorFilter, isLoading: carregandoContratos } = useContratosDoFinanceiro();
  const faturas = useFaturasCarteira();
  const { marcas, entregas, isLoading: carregandoMarcas, definir } = useExpectativasPagamento();
  const { filters, setFilter, resetFilters } = useCarteiraFilters(PREVISAO_FILTER_SCHEMA);

  const meses = useMemo(() => ultimosMesesFechados(), []);
  const historicos = useMemo(() => historicoDePagamentos(faturas.data ?? [], meses), [faturas.data, meses]);

  // Contratos vigentes no escopo do perfil, com histórico, marca, sugestão e entregas previstas.
  const linhas = useMemo<LinhaExpectativa[]>(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return contratos
      .filter((c) => !c.expirado && (!escopo || escopo.has(c.contractKey)))
      .map((c) => {
        const historico = historicos.get(c.contractKey);
        const marca = marcas.get(c.contractKey);
        const linha: LinhaExpectativa = {
          contractKey: c.contractKey,
          numero: c.numero,
          fornecedorNome: c.fornecedorNome,
          gestorNome: c.gestorNome,
          marca,
          historico,
          sugestao: sugerirExpectativa(historico, meses.length),
          entregas: entregas.filter((e) => e.contractKey === c.contractKey && e.situacao === 'PREVISTA' && e.dataPrevista >= hoje),
          classe: 'SEM_CLASSE'
        };
        linha.classe = classeDaLinha(linha);
        return linha;
      });
  }, [contratos, escopo, historicos, marcas, entregas, meses.length]);

  const contagem = useMemo(() => {
    const map = new Map<ClasseExpectativa, number>();
    for (const l of linhas) map.set(l.classe, (map.get(l.classe) ?? 0) + 1);
    return map;
  }, [linhas]);
  const n = (c: ClasseExpectativa) => contagem.get(c) ?? 0;
  const mediaSugeridos = linhas.filter((l) => l.classe === 'SUGERIDO_MENSAL').reduce((s, l) => s + (l.historico?.media ?? 0), 0);
  const gestores = useMemo(() => listGestores(linhas.map((l) => l.gestorNome)), [linhas]);

  const lista = useMemo(() => {
    const q = normalizarBusca(filters.busca);
    return linhas
      .filter((l) => {
        if (filters.classe !== TODOS && l.classe !== filters.classe) return false;
        if (showGestorFilter && !matchesGestorFilter(l.gestorNome, filters.gestor)) return false;
        if (q && !normalizarBusca(`${l.numero} ${l.fornecedorNome ?? ''}`).includes(q)) return false;
        return true;
      })
      .sort((a, b) => (b.historico?.media ?? 0) - (a.historico?.media ?? 0) || a.numero.localeCompare(b.numero));
  }, [linhas, filters, showGestorFilter]);

  const marcar = useCallback(
    async (contractKey: string, tipo: TipoExpectativa | null) => {
      try {
        await definir({ contractKey, tipo, registradoPorNome });
        toast.success(tipo ? 'Contrato marcado.' : 'Contrato voltou ao automático.');
      } catch (err) {
        toast.error((err as { message?: string } | null)?.message || 'Não foi possível marcar o contrato.');
      }
    },
    [definir, registradoPorNome, toast]
  );

  const abrir = (l: LinhaExpectativa) => navigate(`/contratos/${encodeURIComponent(l.contractKey)}?aba=pagamentos`);
  const hasActive = hasActiveCarteiraFilters(PREVISAO_FILTER_SCHEMA, filters);
  const isBusy = carregandoContratos || faturas.isLoading || carregandoMarcas;
  const rotuloMes = (mes: string) => {
    const [a, m] = mes.split('-');
    return `${m}/${a}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <NoticeBar tone="info" testId="previsao-contratos-info">
        Como cada contrato costuma ser pago. Os mensais entram sozinhos na previsão do mês (valor mensal informado ou média dos 3
        últimos pagamentos); os por entrega, pelas entregas previstas. A sugestão olha os pagamentos de {meses.map(rotuloMes).join(', ')}.
      </NoticeBar>

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando contratos...">
          <SkeletonLoader variant="rectangular" height="40px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
        <>
          <CarteiraSegmentTabs
            testIdPrefix="previsao-tipo"
            ariaLabel="Tipo de pagamento"
            active={filters.classe}
            onSelect={(v) => setFilter('classe', v)}
            segments={[
              { id: 'SUGERIDO_MENSAL', label: 'Sugeridos mensais', count: n('SUGERIDO_MENSAL'), dot: 'var(--color-warning)', title: 'Sem marca; pagos nos 3 últimos meses' },
              { id: 'TALVEZ_MENSAL', label: 'Talvez mensais', count: n('TALVEZ_MENSAL'), title: 'Sem marca; pagos em 2 dos 3 últimos meses' },
              { id: 'MENSAL', label: 'Mensais', count: n('MENSAL') },
              { id: 'ENTREGA', label: 'Por entrega', count: n('ENTREGA') },
              { id: 'EVENTUAL', label: 'Eventuais', count: n('EVENTUAL') },
              { id: 'SEM_CLASSE', label: 'Sem classificação', count: n('SEM_CLASSE'), title: 'Sem marca e sem padrão de pagamento' },
              { id: TODOS, label: 'Todos', count: linhas.length }
            ]}
            meta={n('SUGERIDO_MENSAL') > 0 ? `${formatCurrencyCompact(mediaSugeridos)}/mês nos sugeridos` : undefined}
          />

          <CarteiraFilterBar
            busca={filters.busca}
            searchPlaceholder="Buscar por contrato ou fornecedor..."
            onChangeBusca={(v) => setFilter('busca', v)}
            hasActiveFilters={hasActive}
            onResetFilters={resetFilters}
            counter={carteiraCounter(lista.length, linhas.length, hasActive, 'contrato', 'contratos')}
            testIdPrefix="previsao"
          >
            {showGestorFilter && (
              <CarteiraGestorSelect value={filters.gestor} gestores={gestores} onChange={(v) => setFilter('gestor', v)} testId="previsao-filter-gestor" />
            )}
          </CarteiraFilterBar>

          <PrevisaoContratosTable
            linhas={lista}
            total={linhas.length}
            meses={meses}
            podeMarcar={podeMarcar}
            onMarcar={marcar}
            onOpen={abrir}
            onResetFilters={resetFilters}
          />
        </>
      )}
    </div>
  );
};
