import { useMemo } from 'react';
import { useExecucaoEmendas } from '../../../hooks/useEmendas';
import { usePrecosParaEmenda } from '../../../hooks/useEmendasQuadro';
import { reservadoPorItem } from '../../../utils/emendasPedidos';
import { menorPrecoDisponivel, sobraDasEmendas, sobraPorAutor, type ExecucaoNoPortal } from '../../../utils/emendasSobra';
import type { ItemCaep, NotaDaLinha, PedidoEmenda } from '../../../services/emendasService';

const SEM_PORTAL: ExecucaoNoPortal[] = [];

/**
 * Sobra das emendas do ano (migration 204), com todos os pedidos: por emenda e por parlamentar, e o item mais barato
 * que a CAEP ainda oferece. A mesma conta em Parlamentares e no Parlamentar 360.
 */
export function useSobraDasEmendas(pedidos: PedidoEmenda[], itens: Map<string, ItemCaep>, notas: Map<string, NotaDaLinha>, ano: number | readonly number[]) {
  const { precos } = usePrecosParaEmenda();
  const { data: portal = SEM_PORTAL } = useExecucaoEmendas();
  const minimo = useMemo(() => menorPrecoDisponivel(itens, reservadoPorItem(pedidos), precos), [itens, pedidos, precos]);
  // Um ano (Parlamentares: o corrente) ou vários (Emendas: os anos das emendas da lista).
  const anos = useMemo(() => (Array.isArray(ano) ? [...new Set(ano as readonly number[])] : [ano as number]), [ano]);
  const portalPorCodigo = useMemo(() => new Map(portal.map((x) => [x.codigo, x])), [portal]);
  const emendas = useMemo(
    () => anos.flatMap((a) => sobraDasEmendas({ pedidos, ano: a, itens, notas, portal: portalPorCodigo, precos, minimo })),
    [pedidos, anos, itens, notas, portalPorCodigo, precos, minimo]
  );
  const porAutor = useMemo(() => sobraPorAutor(emendas), [emendas]);
  return { emendas, porAutor, minimo, precos, portalPorCodigo };
}
