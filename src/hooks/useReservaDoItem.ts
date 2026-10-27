import { useMemo } from 'react';
import { useNotasDasLinhas, usePedidosEmendas, useReservadoDoItem } from './useEmendas';
import { reservaDoItem, type ReservaDoItem } from '../utils/emendasPedidos';

/**
 * Reserva a parlamentares de um item, para o mínimo da CAEP: o total vem do banco (a mesma conta da trava da
 * migration 157) e a parte a empenhar vem da situação de cada linha dos pedidos.
 */
export function useReservaDoItem(itemKey: string, { enabled = true }: { enabled?: boolean } = {}) {
  const total = useReservadoDoItem(itemKey, { enabled });
  // Sem reserva no item, não precisa ler os pedidos.
  const comReserva = enabled && (total.data ?? 0) > 0;
  const pedidos = usePedidosEmendas({ enabled: comReserva });
  const notas = useNotasDasLinhas({ enabled: comReserva });
  const data = useMemo<ReservaDoItem | undefined>(() => {
    if (total.data == null) return undefined;
    if (total.data === 0) return { total: 0, aEmpenhar: 0 };
    if (!pedidos.data || !notas.data) return undefined;
    const r = reservaDoItem(pedidos.data, itemKey, notas.data);
    return { total: total.data, aEmpenhar: Math.min(r.aEmpenhar, total.data) };
  }, [total.data, pedidos.data, notas.data, itemKey]);
  const isError = total.isError || (comReserva && (pedidos.isError || notas.isError));
  return {
    data,
    isLoading: !isError && enabled && data === undefined,
    isError,
    isFetching: total.isFetching || pedidos.isFetching || notas.isFetching,
    refetch: () => {
      void total.refetch();
      if (comReserva) { void pedidos.refetch(); void notas.refetch(); }
    }
  };
}
