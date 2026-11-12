import type { PedidoEmenda } from '../../../services/emendasService';

/** Acha o pedido do endereço: pelo número (parlamentar, ano e ordem) ou, sem número, pelo identificador interno. */
export function pedidoDoEndereco(
  pedidos: PedidoEmenda[],
  params: { autorId?: string; ano?: string; ordem?: string; id?: string }
): PedidoEmenda | undefined {
  if (params.id) return pedidos.find((p) => p.id === params.id);
  const ano = Number(params.ano);
  const ordem = Number(params.ordem);
  return pedidos.find((p) => p.autorId === params.autorId && p.anoDoNumero === ano && p.numeroNoAno === ordem);
}
