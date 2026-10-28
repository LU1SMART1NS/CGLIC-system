/**
 * Conferência do ofício (protótipo aprovado em 28/10/2026, migration 234): a CAEP confere se o ofício pede os itens do
 * pedido, ajusta o pedido ao ofício (quantidade, item tirado ou acrescentado) e confere a emenda no SIOP. O previsto do
 * pedido (com o reajuste projetado e a folga de Ajustes) tem de caber no que sobra da emenda.
 */
import type { ItemCaep, ItemDoKit, LinhaPedido, LinhaParaSalvar, PedidoEmenda } from '../services/emendasService';
import type { PrecoPrevisto } from '../services/emendasQuadroService';
import { itensDaLinha, linhasAtivas, precoParaEmenda, valorDoPedidoNaEtapa } from './emendasPedidos';

/** O que se confere no SIOP. Na compra direta o beneficiário no SIOP é o próprio MJ e não há objeto. */
export const PONTOS_SIOP: ReadonlyArray<{
  chave: string;
  rotulo: string;
  dica?: string;
}> = [
  { chave: 'numero_emenda', rotulo: 'Nº da emenda' },
  { chave: 'autor', rotulo: 'Parlamentar' },
  { chave: 'valor', rotulo: 'Valor' },
  { chave: 'gnd', rotulo: 'GND' },
  {
    chave: 'compra_direta',
    rotulo: 'Compra direta pelo MJ',
    dica: 'modalidade 90 · beneficiário MJ · ação 21BM'
  },
  {
    chave: 'uf',
    rotulo: 'UF da emenda',
    dica: 'o localizador é a UF dos órgãos do ofício'
  }
];

/** Uma linha do pedido na conferência: a quantidade ajustada ao ofício e se a pessoa já marcou que confere. */
export interface LinhaConferida {
  /** O id da linha gravada, ou "nova-N" para a acrescentada na conferência. */
  chave: string;
  id: string | null;
  tipo: 'ITEM' | 'KIT';
  itemKey: string | null;
  kitId: string | null;
  kitNome: string | null;
  kitComposicao: ItemDoKit[] | null;
  beneficiarioId: string | null;
  quantidade: number;
  /** A quantidade no pedido antes da conferência; 0 na linha acrescentada. */
  original: number;
  retirada: boolean;
  confere: boolean;
}

const centavos = (v: number): number => Math.round(v * 100) / 100;
export const mesmoValor = (a: number, b: number): boolean => Math.abs(a - b) < 0.005;

export function linhasParaConferir(p: PedidoEmenda): LinhaConferida[] {
  return linhasAtivas(p).map((l) => ({
    chave: l.id,
    id: l.id,
    tipo: l.tipo,
    itemKey: l.itemKey,
    kitId: l.kitId,
    kitNome: l.kitNome,
    kitComposicao: l.kitComposicao,
    beneficiarioId: l.beneficiarioId,
    quantidade: l.quantidade,
    original: l.quantidade,
    retirada: false,
    confere: false
  }));
}

type ComoLinha = Pick<LinhaPedido, 'tipo' | 'itemKey' | 'kitComposicao'>;

/** Preço de uma unidade da linha (um item, ou um kit inteiro) pelo preço previsto de hoje. */
export function precoUnitarioDeHoje(l: ComoLinha, itens: Map<string, ItemCaep>, precos?: Map<string, PrecoPrevisto>): number {
  return centavos(itensDaLinha({ ...l, quantidade: 1 }).reduce((s, x) => s + x.quantidade * precoParaEmenda(x.itemKey, itens, precos).previsto, 0));
}

/** Previsto do pedido ajustado: o preço previsto de hoje (reajuste projetado e folga de Ajustes) das linhas que ficam. */
export function valorPrevisto(linhas: LinhaConferida[], itens: Map<string, ItemCaep>, precos?: Map<string, PrecoPrevisto>): number {
  return centavos(linhas.filter((l) => !l.retirada).reduce((s, l) => s + centavos(l.quantidade * precoUnitarioDeHoje(l, itens, precos)), 0));
}

/**
 * O que sobra da emenda para este pedido (decisão de 28/10/2026): o valor da emenda no SIOP menos os outros pedidos da
 * mesma emenda (pelo valor do ofício, ou pelo previsto quando o ofício ainda não foi informado). O pedido confere quando o
 * previsto cabe aqui; o valor do ofício deixa de travar a conferência.
 */
export function sobraDaEmendaParaOPedido(
  valorDaEmenda: number,
  outros: PedidoEmenda[],
  itens: Map<string, ItemCaep>,
  precos?: Map<string, PrecoPrevisto>
): { outros: number; sobra: number } {
  const usado = centavos(outros.reduce((s, o) => s + valorDoPedidoNaEtapa(o, itens, precos).valor, 0));
  return { outros: usado, sobra: centavos(valorDaEmenda - usado) };
}

/** O previsto cabe no que sobra da emenda (menor ou igual, ao centavo). */
export const cabeNaEmenda = (previsto: number, sobra: number): boolean => previsto <= sobra + 0.004;

/** Os preços unitários que a minuta guardou para cada item: os que o quadro mostra hoje (vão no registro da minuta). */
export function precosDaMinuta(p: PedidoEmenda, itens: Map<string, ItemCaep>, precos?: Map<string, PrecoPrevisto>): Record<string, number> {
  const r: Record<string, number> = {};
  for (const l of linhasAtivas(p)) for (const x of itensDaLinha(l)) r[x.itemKey] = precoParaEmenda(x.itemKey, itens, precos).previsto;
  return r;
}

export interface PrecoQueMudou {
  itemKey: string;
  numeroAta: string | null;
  naMinuta: number;
  hoje: number;
}

/** Itens cujo preço previsto mudou depois da minuta (só informa: o que trava é o pedido não caber na emenda). */
export function precosQueMudaram(
  linhas: LinhaConferida[],
  p: Pick<PedidoEmenda, 'minutaPrecos'>,
  itens: Map<string, ItemCaep>,
  precos?: Map<string, PrecoPrevisto>
): PrecoQueMudou[] {
  if (!p.minutaPrecos) return [];
  const vistos = new Map<string, PrecoQueMudou>();
  for (const l of linhas) {
    if (l.retirada || l.original === 0) continue;
    for (const x of itensDaLinha({ ...l, quantidade: 1 })) {
      const naMinuta = p.minutaPrecos[x.itemKey];
      if (typeof naMinuta !== 'number' || vistos.has(x.itemKey)) continue;
      const hoje = precoParaEmenda(x.itemKey, itens, precos).previsto;
      if (!mesmoValor(naMinuta, hoje))
        vistos.set(x.itemKey, {
          itemKey: x.itemKey,
          numeroAta: itens.get(x.itemKey)?.numeroAta ?? null,
          naMinuta,
          hoje
        });
    }
  }
  return [...vistos.values()];
}

/** Os ajustes em texto, para o histórico: "Acrescentado: 10 × Rádio → PMX", "Viatura → PMX: 3 → 2". */
export function ajustesFeitos(linhas: LinhaConferida[], nome: (l: LinhaConferida) => string): string[] {
  const r: string[] = [];
  for (const l of linhas) {
    if (l.original === 0 && !l.retirada) r.push(`Acrescentado: ${l.quantidade} × ${nome(l)}`);
    else if (l.original > 0 && l.retirada) r.push(`Retirado: ${l.original} × ${nome(l)}`);
    else if (l.original > 0 && l.quantidade !== l.original) r.push(`${nome(l)}: ${l.original} → ${l.quantidade}`);
  }
  return r;
}

/** As linhas que vão para o banco, ou null quando nada mudou (a conferência só registra a etapa). */
export function linhasParaSalvar(linhas: LinhaConferida[]): LinhaParaSalvar[] | null {
  const mudou = linhas.some((l) => (l.original === 0 ? !l.retirada : l.retirada || l.quantidade !== l.original));
  if (!mudou) return null;
  return linhas
    .filter((l) => !l.retirada)
    .map((l) => ({
      id: l.id ?? undefined,
      tipo: l.tipo,
      itemKey: l.itemKey,
      kitId: l.kitId,
      quantidade: l.quantidade,
      beneficiarioId: l.beneficiarioId
    }));
}

/** Saldo livre da CAEP de cada item com as linhas da conferência: alocado − reservado em outros pedidos − este pedido. */
export function livrePorItem(linhas: LinhaConferida[], itens: Map<string, ItemCaep>, reservadoFora: Map<string, number>): (itemKey: string) => number {
  const consumo = new Map<string, number>();
  for (const l of linhas) if (!l.retirada) for (const x of itensDaLinha(l)) consumo.set(x.itemKey, (consumo.get(x.itemKey) ?? 0) + x.quantidade);
  return (k) => (itens.get(k)?.alocado ?? 0) - (reservadoFora.get(k) ?? 0) - (consumo.get(k) ?? 0);
}

/** A linha passa do saldo livre da CAEP (só conta quando a quantidade subiu ou a linha é nova: o gravado já cabia). */
export function passaDoSaldo(l: LinhaConferida, livre: (itemKey: string) => number): boolean {
  if (l.retirada || l.quantidade <= l.original) return false;
  return itensDaLinha(l).some((x) => livre(x.itemKey) < 0);
}
