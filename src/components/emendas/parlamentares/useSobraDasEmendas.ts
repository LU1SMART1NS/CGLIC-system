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
export function useSobraDasEmendas(pedidos: PedidoEmenda[], itens: Map<string, ItemCaep>, notas: Map<string, NotaDaLinha>, ano: number) {
  const { precos } = usePrecosParaEmenda();
  const { data: portal = SEM_PORTAL } = useExecucaoEmendas();
  const minimo = useMemo(() => menorPrecoDisponivel(itens, reservadoPorItem(pedidos), precos), [itens, pedidos, precos]);
  const emendas = useMemo(
    () => sobraDasEmendas({ pedidos, ano, itens, notas, portal: new Map(portal.map((x) => [x.codigo, x])), precos, minimo }),
    [pedidos, ano, itens, notas, portal, precos, minimo]
  );
  const porAutor = useMemo(() => sobraPorAutor(emendas), [emendas]);
  return { emendas, porAutor, minimo, precos };
}
