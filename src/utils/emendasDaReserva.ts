/**
 * Emenda escolhida na reserva (migration 243, protótipo aprovado em 29/10/2026): todo pedido nasce com a emenda. A janela
 * da reserva lista as emendas registradas do parlamentar com o valor a indicar de cada uma, pela mesma conta da
 * conferência do ofício: o valor da emenda no SIOP menos os outros pedidos dela (pelo valor do ofício, ou pelo previsto
 * quando o ofício ainda não foi informado).
 */
import type { EmendaSiop, ItemCaep, PedidoEmenda } from '../services/emendasService';
import type { PrecoPrevisto } from '../services/emendasQuadroService';
import { sobraDaEmendaParaOPedido } from './emendasConferenciaOficio';

export interface EmendaParaAReserva {
  emenda: EmendaSiop;
  /** Outros pedidos ativos da emenda (sem o pedido aberto). */
  outros: PedidoEmenda[];
  /** O que os outros pedidos já usam da emenda. */
  usado: number;
  /** Valor a indicar para este pedido; nulo quando a emenda ainda não tem o valor do SIOP. */
  aIndicar: number | null;
}

/** O pedido é da emenda: ligado a ela, ou com o mesmo nº e ano. */
export function pedidoDaEmenda(p: Pick<PedidoEmenda, 'emendaId' | 'siopEmenda' | 'siopEmendaAno'>, e: Pick<EmendaSiop, 'id' | 'numero' | 'ano'>): boolean {
  return p.emendaId === e.id || (p.siopEmenda === e.numero && p.siopEmendaAno === e.ano);
}

/** Emendas do parlamentar para a reserva, da mais nova para a mais antiga. */
export function emendasParaAReserva(opts: {
  autorId: string | null;
  /** Pedido aberto (não conta como "outro"); nulo na reserva nova. */
  pedidoId: string | null;
  emendas: EmendaSiop[];
  pedidos: PedidoEmenda[];
  itens: Map<string, ItemCaep>;
  precos?: Map<string, PrecoPrevisto>;
}): EmendaParaAReserva[] {
  const { autorId, pedidoId, emendas, pedidos, itens, precos } = opts;
  if (!autorId) return [];
  return emendas
    .filter((e) => e.autorId === autorId)
    .sort((a, b) => b.ano - a.ano || a.numero.localeCompare(b.numero))
    .map((emenda) => {
      const outros = pedidos.filter((p) => p.id !== pedidoId && p.etapa !== 'CANCELADO' && pedidoDaEmenda(p, emenda));
      if (emenda.valor == null) return { emenda, outros, usado: 0, aIndicar: null };
      const conta = sobraDaEmendaParaOPedido(emenda.valor, outros, itens, precos);
      return { emenda, outros, usado: conta.outros, aIndicar: conta.sobra };
    });
}

/** Emenda que a reserva já abre escolhida: a única do parlamentar, quando ainda tem valor a indicar (ou não tem valor). */
export function emendaSugerida(lista: EmendaParaAReserva[]): string | null {
  if (lista.length !== 1) return null;
  const [x] = lista;
  return x.aIndicar == null || x.aIndicar > 0.004 ? x.emenda.id : null;
}
