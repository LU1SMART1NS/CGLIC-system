import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { definirExpectativaPagamento, fetchExpectativasPagamento, type ExpectativaPagamento } from '../services/expectativaPagamentoService';
import { fetchEntregasParaPagamento, type EntregaParaPagamento } from '../services/entregasParaPagamentoService';
import { PAGAMENTO_RULES } from '../config/alertRules';

const SEM_MARCAS = new Map<string, ExpectativaPagamento>();
const SEM_ENTREGAS: EntregaParaPagamento[] = [];

export const EXPECTATIVAS_QUERY_KEY = ['expectativas-pagamento'] as const;
export const ENTREGAS_PARA_PAGAMENTO_KEY = ['entregas-para-pagamento'] as const;

/** Marcas de expectativa de pagamento de todos os contratos (tabela pequena, lida inteira). */
export function useExpectativasPagamento() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: EXPECTATIVAS_QUERY_KEY,
    queryFn: fetchExpectativasPagamento,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });
  const reler = useCallback(() => queryClient.invalidateQueries({ queryKey: EXPECTATIVAS_QUERY_KEY }), [queryClient]);

  const definir = useCallback(
    async (input: Parameters<typeof definirExpectativaPagamento>[0]) => {
      await definirExpectativaPagamento(input);
      await reler();
    },
    [reler]
  );

  return {
    marcas: query.data?.marcas ?? SEM_MARCAS,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    /** A leitura, para a faixa "não carregou" (sem ela a Previsão sairia sem mensais, calada). */
    consulta: query,
    definir
  };
}

/**
 * Entregas da Fiscalização para os pagamentos (migration 305): de um contrato ou de todos. A janela das entregues é a
 * regra "pagamento.avisoEntregaJanelaDias" da tela Regras e alertas.
 */
export function useEntregasParaPagamento(contractKey: string | null = null, opts: { enabled?: boolean } = {}) {
  const janela = PAGAMENTO_RULES.avisoEntregaJanelaDias;
  const query = useQuery({
    queryKey: [...ENTREGAS_PARA_PAGAMENTO_KEY, contractKey ?? 'todas', janela],
    queryFn: () => fetchEntregasParaPagamento(contractKey, janela),
    enabled: opts.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });
  return { entregas: query.data ?? SEM_ENTREGAS, isLoading: query.isLoading, consulta: query };
}
