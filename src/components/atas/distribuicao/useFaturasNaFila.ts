import { useMemo } from 'react';
import { usePagamentosCarteira } from '../../../hooks/useFinanceiroCarteira';
import { GRUPO_DA_ETAPA, type PagamentoCarteiraRow } from '../../../services/financeiroCarteiraService';

/**
 * Linhas de "Precisa de ação" em Financeiro › Pagamentos (ciclo com a CGLIC; fatura com erro no SIAFI) por contrato.
 * Um ciclo conta uma vez, mesmo com várias notas fiscais.
 */
export function faturasNaFilaPorContrato(rows: PagamentoCarteiraRow[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const r of rows) {
    if (GRUPO_DA_ETAPA[r.etapa] !== 'ACAO') continue;
    mapa[r.contractKey] = (mapa[r.contractKey] ?? 0) + 1;
  }
  return mapa;
}

/**
 * Faturas na fila de cada contrato para a carga da Distribuição. Usa a mesma leitura do número do menu Financeiro
 * (já em cache). Enquanto carrega ou se falhar, `undefined`: a carga fica sem as faturas, em vez de pela metade.
 */
export function useFaturasNaFila(): Record<string, number> | undefined {
  const { rows, isLoading, error } = usePagamentosCarteira();
  return useMemo(() => (isLoading || error ? undefined : faturasNaFilaPorContrato(rows)), [rows, isLoading, error]);
}
