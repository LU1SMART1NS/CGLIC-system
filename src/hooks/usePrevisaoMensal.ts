import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FINANCEIRO_QUERY_KEYS, useEmpenhosCarteira, useFaturasCarteira } from './useFinanceiroCarteira';
import { useExpectativasPagamento } from './useExpectativasPagamento';
import { fetchCiclosEmAberto, fetchLigacoesCicloFatura } from '../services/financeiroCarteiraService';
import { historicoDePagamentos, ultimosMesesFechados } from '../services/expectativaPagamentoService';
import {
  fetchAjustesPrevisao,
  fetchEnvioPrevisao,
  fetchPrazosEmendas,
  montarPrevisao,
  registrarEnvioPrevisao,
  salvarAjustePrevisao,
  salvarPrazoEmenda,
  type PrazoEmenda
} from '../services/previsaoMensalService';

const OPCOES = { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } as const;
export const PRAZOS_EMENDAS_QUERY_KEY = ['prazos-emendas'] as const;

/** Prazos das emendas (portaria anual), cadastrados pelo coordenador em Regras de Alertas. */
export function usePrazosEmendas() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: PRAZOS_EMENDAS_QUERY_KEY, queryFn: fetchPrazosEmendas, ...OPCOES });
  const salvar = useCallback(
    async (p: PrazoEmenda) => {
      await salvarPrazoEmenda(p);
      await queryClient.invalidateQueries({ queryKey: PRAZOS_EMENDAS_QUERY_KEY });
    },
    [queryClient]
  );
  return { prazos: query.data ?? [], isLoading: query.isLoading, salvar };
}

/**
 * Previsão de um mês (AAAA-MM): as linhas montadas (faturas, ciclos, mensais, entregas, incluídas) com os ajustes do
 * mês, o envio registrado e o prazo das emendas. `contratosVigentes` limita os mensais aos contratos no escopo.
 */
export function usePrevisaoMensal(mes: string, contratosVigentes: Set<string>) {
  const queryClient = useQueryClient();
  const faturas = useFaturasCarteira();
  const empenhos = useEmpenhosCarteira();
  const ciclos = useQuery({ queryKey: FINANCEIRO_QUERY_KEYS.ciclos, queryFn: fetchCiclosEmAberto, ...OPCOES });
  const ligacoes = useQuery({ queryKey: FINANCEIRO_QUERY_KEYS.ligacoes, queryFn: fetchLigacoesCicloFatura, ...OPCOES });
  const expectativas = useExpectativasPagamento();
  const ajustes = useQuery({ queryKey: ['previsao-ajustes', mes], queryFn: () => fetchAjustesPrevisao(mes), ...OPCOES });
  const envio = useQuery({ queryKey: ['previsao-envio', mes], queryFn: () => fetchEnvioPrevisao(mes), ...OPCOES });
  const prazosEmendas = usePrazosEmendas();

  const meses = useMemo(() => ultimosMesesFechados(), []);
  const historicos = useMemo(() => historicoDePagamentos(faturas.data ?? [], meses), [faturas.data, meses]);

  const linhas = useMemo(
    () =>
      montarPrevisao({
        mesAlvo: mes,
        faturas: faturas.data ?? [],
        ciclos: ciclos.data ?? [],
        ligacoes: ligacoes.data ?? [],
        empenhos: empenhos.rows,
        marcas: expectativas.marcas,
        entregas: expectativas.entregas,
        historicos,
        ajustes: ajustes.data ?? [],
        contratosVigentes
      }),
    [mes, faturas.data, ciclos.data, ligacoes.data, empenhos.rows, expectativas.marcas, expectativas.entregas, historicos, ajustes.data, contratosVigentes]
  );

  const [ano, mesNum] = mes.split('-').map(Number);
  const prazoEmenda = prazosEmendas.prazos.find((p) => p.ano === ano && p.mes === mesNum) ?? null;

  const reler = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['previsao-ajustes', mes] }),
        queryClient.invalidateQueries({ queryKey: ['previsao-envio', mes] })
      ]),
    [queryClient, mes]
  );
  const ajustar = useCallback(
    async (input: Omit<Parameters<typeof salvarAjustePrevisao>[0], 'mes'>) => {
      await salvarAjustePrevisao({ ...input, mes });
      await reler();
    },
    [mes, reler]
  );
  const registrarEnvio = useCallback(
    async (input: Omit<Parameters<typeof registrarEnvioPrevisao>[0], 'mes'>) => {
      await registrarEnvioPrevisao({ ...input, mes });
      await reler();
    },
    [mes, reler]
  );

  return {
    linhas,
    ajustes: ajustes.data ?? [],
    envio: envio.data ?? null,
    prazoEmenda,
    sugeridosSemMarca: [...historicos.entries()].filter(([k, h]) => h.mesesComPagamento >= meses.length && !expectativas.marcas.has(k) && contratosVigentes.has(k)).length,
    isLoading: faturas.isLoading || empenhos.isLoading || ciclos.isLoading || ligacoes.isLoading || expectativas.isLoading || ajustes.isLoading || envio.isLoading,
    ajustar,
    registrarEnvio
  };
}
