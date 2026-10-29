import type { ItemCaep, KitEmenda, PedidoEmenda } from '../services/emendasService';
import type { PrecoDoItem } from '../services/emendasQuadroService';
import { chaveItemGti, type FatiasDaAta } from '../config/gruposGti';
import { itensDaLinha, linhasAtivas, precoParaEmenda } from './emendasPedidos';
import { reajusteDoItem, type ReajusteDoItem } from './emendasReajuste';
import { calcularKit, type CalculoDoKit } from './emendasKits';

/** preco: preço de hoje, o do quadro do parlamentar; reajuste: se o item ainda entra em reserva (migration 246). pedidos: quantos pedidos reservam o item. fatias: interesse de cada GTI no item (o mesmo da Carteira › Itens). */
export type LinhaItemCaep = ItemCaep & { reservado: number; saldo: number; pedidos: number; preco: number; reajuste: ReajusteDoItem; fatias: FatiasDaAta | undefined };
export type LinhaKitCaep = KitEmenda & { calculo: CalculoDoKit };

/**
 * Linhas de Emendas › Itens › Por item: reservado nos pedidos não cancelados (kits abertos nos itens), saldo = alocado −
 * reservado e o preço de hoje (o da emenda). A tela e a exportação para o Excel usam a mesma conta.
 */
export function montarLinhasItensCaep(
  itens: ItemCaep[],
  pedidos: PedidoEmenda[],
  precos: Map<string, PrecoDoItem> | undefined,
  hoje: string,
  fatias: Map<string, FatiasDaAta>
): LinhaItemCaep[] {
  const reservado = new Map<string, number>();
  const pedidosDoItem = new Map<string, Set<string>>();
  for (const p of pedidos) {
    if (p.etapa === 'CANCELADO') continue;
    for (const l of linhasAtivas(p)) {
      for (const x of itensDaLinha(l)) {
        reservado.set(x.itemKey, (reservado.get(x.itemKey) ?? 0) + x.quantidade);
        pedidosDoItem.set(x.itemKey, (pedidosDoItem.get(x.itemKey) ?? new Set()).add(p.id));
      }
    }
  }
  const porChave = new Map(itens.map((i) => [i.itemKey, i]));
  return itens.map((i) => {
    const r = reservado.get(i.itemKey) ?? 0;
    const preco = precoParaEmenda(i.itemKey, porChave, precos);
    return {
      ...i,
      reservado: r,
      saldo: i.alocado - r,
      pedidos: pedidosDoItem.get(i.itemKey)?.size ?? 0,
      preco: preco.valor,
      reajuste: reajusteDoItem(preco.preco, hoje),
      fatias: fatias.get(chaveItemGti(i.numeroAta, i.codigoUasg, i.numeroItem))
    };
  });
}

/** Saldo do item para os kits = alocado à CAEP − reservado nos pedidos. */
export const saldoDoItemParaKits =
  (reservado: Map<string, number> | undefined) =>
  (i: { itemKey: string; alocado: number }): number =>
    i.alocado - (reservado?.get(i.itemKey) ?? 0);

/** Linhas de Emendas › Itens › Por kit: saldo do item para os kits = alocado à CAEP − reservado nos pedidos (o do banco). */
export function montarLinhasKitsCaep(
  kits: KitEmenda[],
  itens: ItemCaep[],
  hoje: string,
  reservado: Map<string, number> | undefined,
  precos: Map<string, PrecoDoItem> | undefined
): LinhaKitCaep[] {
  const porChave = new Map(itens.map((i) => [i.itemKey, i]));
  const saldoDoItem = saldoDoItemParaKits(reservado);
  return kits.map((k) => ({ ...k, calculo: calcularKit(k, porChave, hoje, saldoDoItem, precos) }));
}

/** "Com saldo" do trilho de Por item: ata vigente e saldo a oferecer. */
export const itemComSaldo = (l: Pick<LinhaItemCaep, 'ataEncerrada' | 'saldo'>): boolean => !l.ataEncerrada && l.saldo > 0;

/** Kit com saldo: ativo e cabe ao menos um no saldo dos itens. */
export const kitComSaldo = (l: LinhaKitCaep): boolean => l.calculo.situacao !== 'desativado' && l.calculo.kitsPossiveis > 0;
