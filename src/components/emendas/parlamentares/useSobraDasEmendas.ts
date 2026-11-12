import { useMemo } from 'react';
import { hojeEmBrasilia, useEmendasSiop, useExecucaoEmendas } from '../../../hooks/useEmendas';
import { usePrecosParaEmenda } from '../../../hooks/useEmendasQuadro';
import { reservadoPorItem } from '../../../utils/emendasPedidos';
import { menorPrecoDisponivel, sobraDasEmendas, sobraPorAutor, type ExecucaoNoPortal } from '../../../utils/emendasSobra';
import type { EmendaSiop, ItemCaep, NotaDaLinha, PedidoEmenda } from '../../../services/emendasService';

const SEM_PORTAL: ExecucaoNoPortal[] = [];
const SEM_EMENDAS: EmendaSiop[] = [];

/**
 * Sobra das emendas do ano (migration 204), com todos os pedidos: por emenda e por parlamentar, e o item mais barato
 * que a CAEP ainda oferece. A mesma conta em Parlamentares e no Parlamentar 360. Ano antes do corrente = encerrado:
 * o resto vira "Não empenhado" (28/10/2026).
 */
export function useSobraDasEmendas(
  pedidos: PedidoEmenda[],
  itens: Map<string, ItemCaep>,
  notas: Map<string, NotaDaLinha>,
  ano: number | readonly number[],
  incluirSemPedido = false
) {
  const { precos } = usePrecosParaEmenda();
  const { data: portal = SEM_PORTAL } = useExecucaoEmendas();
  // Valor da emenda no SIOP: o da emenda registrada (migration 232).
  const { data: registradas = SEM_EMENDAS } = useEmendasSiop();
  const minimo = useMemo(() => menorPrecoDisponivel(itens, reservadoPorItem(pedidos), precos), [itens, pedidos, precos]);
  // Um ano (Parlamentares: o corrente) ou vários (Emendas: os anos das emendas da lista).
  const anos = useMemo(() => (Array.isArray(ano) ? [...new Set(ano as readonly number[])] : [ano as number]), [ano]);
  const portalPorCodigo = useMemo(() => new Map(portal.map((x) => [x.codigo, x])), [portal]);
  const anoCorrente = Number(hojeEmBrasilia().slice(0, 4));
  const emendas = useMemo(
    () => anos.flatMap((a) => sobraDasEmendas({ pedidos, ano: a, itens, notas, portal: portalPorCodigo, precos, minimo, encerrado: a < anoCorrente, emendas: registradas, incluirSemPedido })),
    [pedidos, anos, itens, notas, portalPorCodigo, precos, minimo, anoCorrente, registradas, incluirSemPedido]
  );
  const porAutor = useMemo(() => sobraPorAutor(emendas), [emendas]);
  return { emendas, porAutor, minimo, precos, portalPorCodigo };
}
