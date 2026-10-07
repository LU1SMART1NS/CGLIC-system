import { contractMatchesCompra, type ContractSuggestionCriteria } from '../components/modals/linkContractSuggestions';

/**
 * Contrato em mais de uma ata (migration 86): cada ITEM do contrato pertence a uma só ata, e o contrato pode estar em
 * várias atas da mesma compra. Ex.: o 00033/2026 tem o item 10 na Ata 00053/2025 e o item 11 na Ata 00025/2025.
 * O banco recusa o resto (mesmo item em duas atas, ata de outra compra); estas regras só adiantam isso na tela.
 */

export interface VinculoItemContrato {
  ataKey: string;
  contractKey: string;
  numeroItem?: number;
}

export interface OutraAtaDoContrato {
  numeroAta: string;
  /** Itens do contrato já vinculados nessa ata. */
  itens: number[];
}

/** As outras atas (diferentes de `numeroAta`) a que o contrato já está vinculado, com os itens de cada uma. */
export function outrasAtasDoContrato(contractKey: string, numeroAta: string, vinculos: VinculoItemContrato[]): OutraAtaDoContrato[] {
  const key = contractKey.trim().toUpperCase();
  const porAta = new Map<string, Set<number>>();
  for (const v of vinculos) {
    if (v.contractKey.trim().toUpperCase() !== key || v.ataKey === numeroAta) continue;
    const itens = porAta.get(v.ataKey) ?? new Set<number>();
    if (v.numeroItem != null && Number.isFinite(v.numeroItem)) itens.add(v.numeroItem);
    porAta.set(v.ataKey, itens);
  }
  return Array.from(porAta, ([ata, itens]) => ({ numeroAta: ata, itens: Array.from(itens).sort((a, b) => a - b) })).sort((a, b) =>
    a.numeroAta.localeCompare(b.numeroAta)
  );
}

/** Mapa contract_key (maiúsculas) → outras atas do contrato, para listas com muitos contratos. */
export function outrasAtasPorContrato(numeroAta: string, vinculos: VinculoItemContrato[]): Map<string, OutraAtaDoContrato[]> {
  const chaves = new Set(vinculos.filter((v) => v.ataKey !== numeroAta).map((v) => v.contractKey.trim().toUpperCase()));
  const mapa = new Map<string, OutraAtaDoContrato[]>();
  for (const k of chaves) mapa.set(k, outrasAtasDoContrato(k, numeroAta, vinculos));
  return mapa;
}

/**
 * O contrato já em outra ata pode entrar nesta? Só se for da mesma compra desta ata: a API devolve os números dos itens
 * na compra do contrato, e só na mesma compra o "item 11" do contrato é o "item 11" da ata.
 */
export function podeEntrarEmMaisUmaAta(
  contract: { idCompra?: string },
  compraDestaAta: ContractSuggestionCriteria['compra'] | undefined,
  outras: OutraAtaDoContrato[]
): boolean {
  if (outras.length === 0) return true;
  return Boolean(compraDestaAta && contractMatchesCompra(contract, compraDestaAta));
}

/** Número do item → ata em que esse item do contrato já está (os que não podem ser vinculados aqui). */
export function itensEmOutraAta(outras: OutraAtaDoContrato[]): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const o of outras) for (const i of o.itens) mapa.set(i, o.numeroAta);
  return mapa;
}

/** "Ata 00053/2025 (item 10)" · "Ata 00053/2025 (itens 3 e 4)". */
export function textoOutrasAtas(outras: OutraAtaDoContrato[]): string {
  const lista = (n: number[]) => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`);
  return outras
    .map((o) => (o.itens.length === 0 ? `Ata ${o.numeroAta}` : `Ata ${o.numeroAta} (${o.itens.length === 1 ? 'item' : 'itens'} ${lista(o.itens)})`))
    .join(', ');
}
