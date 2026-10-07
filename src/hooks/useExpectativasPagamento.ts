import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelarEntregaPrevista,
  definirExpectativaPagamento,
  fetchExpectativasPagamento,
  salvarEntregaPrevista,
  type EntregaPrevista,
  type ExpectativaPagamento
} from '../services/expectativaPagamentoService';

const SEM_MARCAS = new Map<string, ExpectativaPagamento>();
const SEM_ENTREGAS: EntregaPrevista[] = [];

export const EXPECTATIVAS_QUERY_KEY = ['expectativas-pagamento'] as const;

/** Marcas de expectativa de pagamento e entregas previstas de todos os contratos (tabelas pequenas, lidas inteiras). */
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
  const salvarEntrega = useCallback(
    async (input: Parameters<typeof salvarEntregaPrevista>[0]) => {
      await salvarEntregaPrevista(input);
      await reler();
    },
    [reler]
  );
  const cancelarEntrega = useCallback(
    async (id: string, motivo: string) => {
      await cancelarEntregaPrevista(id, motivo);
      await reler();
    },
    [reler]
  );

  return {
    marcas: query.data?.marcas ?? SEM_MARCAS,
    entregas: query.data?.entregas ?? SEM_ENTREGAS,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    definir,
    salvarEntrega,
    cancelarEntrega
  };
}
