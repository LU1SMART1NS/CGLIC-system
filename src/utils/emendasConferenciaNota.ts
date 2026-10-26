/**
 * Conferência pela nota de empenho (migration 190, M7 e M4 da revisão de 25/10/2026): a nota ligada à linha com outro
 * credor que o fornecedor da ata do item, e a nota de emenda da UG 200330 cuja emenda nenhum pedido tem. Os dois
 * avisos são marcados como resolvidos com justificativa pelo mesmo ✓ Resolvido do empenhado × pedido (tipo EMPENHO).
 */
import type { CredorDiferente, ItemCaep, NotaSemPedido, PedidoProvavel } from '../services/emendasService';
import type { AvisoPedido } from './emendasPedidos';
import { nomeDoItemConferido } from './emendasEmpenho';

/** Uma nota de outro fornecedor num pedido, com as linhas em que ela está. */
export interface CredorNoPedido {
  pedidoId: string;
  pedido: number;
  nota: string;
  ug: string;
  credorNome: string | null;
  linhas: CredorDiferente[];
}

/** Chave do ✓ Resolvido: o número de linhas entra, então o aviso volta se a nota passar a outras linhas. */
export const chaveAvisoCredor = (c: Pick<CredorNoPedido, 'ug' | 'nota' | 'pedido' | 'linhas'>): string => `EMPENHO::CREDOR::${c.ug}::${c.nota}::${c.pedido}-${c.linhas.length}`;

export const chaveNotaSemPedido = (n: Pick<NotaSemPedido, 'ug' | 'nota'>): string => `EMPENHO::SEM-PEDIDO::${n.ug}::${n.nota}`;

/** As notas de outro fornecedor de cada pedido; `resolvidas` tira as já marcadas. */
export function credorPorPedido(lista: CredorDiferente[], resolvidas?: { has: (chave: string) => boolean }): Map<string, CredorNoPedido[]> {
  const grupos = new Map<string, CredorNoPedido>();
  for (const c of lista) {
    const k = `${c.pedidoId}|${c.ug}|${c.nota}`;
    const g = grupos.get(k) ?? { pedidoId: c.pedidoId, pedido: c.pedido, nota: c.nota, ug: c.ug, credorNome: c.credorNome, linhas: [] };
    g.linhas.push(c);
    grupos.set(k, g);
  }
  const out = new Map<string, CredorNoPedido[]>();
  for (const g of grupos.values()) {
    if (resolvidas?.has(chaveAvisoCredor(g))) continue;
    out.set(g.pedidoId, [...(out.get(g.pedidoId) ?? []), g]);
  }
  return out;
}

/** "Nota 2026NE000189 (3M GLOBAL CHANNEL SERVICES) em 57 linhas": título de cada nota de outro fornecedor. */
export const tituloCredor = (g: CredorNoPedido): string =>
  `Nota ${g.nota}${g.credorNome ? ` (${g.credorNome})` : ''} ${g.linhas.length === 1 ? 'em 1 item' : `em ${g.linhas.length} itens`}`;

/** Os itens e os fornecedores das atas, até 3, e "e mais N". */
export function contextoCredor(g: CredorNoPedido, itens: Map<string, ItemCaep>): string {
  const partes = g.linhas.map((l) => `${nomeDoItemConferido(l.itemKey, itens)} (fornecedor da ata: ${l.fornecedorNome ?? 'sem nome'})`);
  const unicas = [...new Set(partes)];
  return unicas.length <= 3 ? unicas.join('; ') : `${unicas.slice(0, 3).join('; ')} e mais ${unicas.length - 3}`;
}

/** Aviso do pedido: a nota ligada é de outro credor que o fornecedor da ata. */
export function avisoDeCredor(grupos: CredorNoPedido[] | undefined): AvisoPedido | null {
  if (!grupos?.length) return null;
  const linhas = grupos.reduce((n, g) => n + g.linhas.length, 0);
  return {
    tipo: 'credorDiferente',
    curto: 'Nota de outro fornecedor',
    texto: `${grupos.map((g) => `${g.nota}${g.credorNome ? ` (${g.credorNome})` : ''}`).join(', ')}: credor diferente do fornecedor da ata em ${linhas === 1 ? '1 item' : `${linhas} itens`}. A nota pode estar ligada ao item errado, ou o item ou a ata do pedido estão trocados. Confira; se estiver certo, marque como resolvido.`,
    linhaId: grupos[0].linhas[0].linhaId
  };
}

/** Notas de emenda sem pedido ainda não marcadas como resolvidas, da maior para a menor. */
export const notasSemPedidoPendentes = (lista: NotaSemPedido[], resolvidas: { has: (chave: string) => boolean }): NotaSemPedido[] =>
  lista.filter((n) => !resolvidas.has(chaveNotaSemPedido(n))).sort((a, b) => b.valorEmpenhado - a.valorEmpenhado);

// ------------------------------------------------------------------------------
// Várias emendas por pedido (migration 211)
// ------------------------------------------------------------------------------

/** Nota e itens do pedido com o mesmo valor: até 5 centavos de diferença, como na regra das notas (migration 192). */
export const valorIgual = (a: number, b: number): boolean => Math.abs(a - b) <= 0.05 + 1e-9;

/** O pedido sugerido para a emenda: o que tem mais notas com o valor igual ao dos itens do fornecedor ainda sem nota. */
export interface SugestaoDePedido {
  pedidoId: string;
  pedidoNumero: number;
  autorId: string | null;
  pedidoEmenda: string | null;
  pedidoEmendaAno: number | null;
  /** Notas da emenda com o valor igual aos itens do fornecedor no pedido. */
  iguais: number;
  mesmoCodigo: boolean;
}

/** As notas sem pedido de uma emenda (ano + nº): vão juntas para o mesmo pedido. */
export interface EmendaSemPedido {
  chave: string;
  emenda: string;
  ano: number | null;
  planoInterno: string | null;
  notas: NotaSemPedido[];
  valor: number;
  sugestao: SugestaoDePedido | null;
  /** Sem sugestão: quantos pedidos empatam com notas de valor igual (0 = nenhum pedido parecido). */
  empatados: number;
}

/** Como o pedido confere com a nota: a linha do pedido provável daquele pedido, se houver. */
export const pedidoDaNota = (n: NotaSemPedido, pedidoId: string): PedidoProvavel | undefined => n.pedidosProvaveis.find((c) => c.pedidoId === pedidoId);

/**
 * Notas sem pedido pendentes agrupadas por emenda, da de maior valor à menor. O pedido sugerido tem mais notas de valor
 * igual; no empate, vale o do mesmo código de autor; se ainda empatar, não há sugestão (o gestor escolhe).
 */
export function notasSemPedidoPorEmenda(lista: NotaSemPedido[], resolvidas: { has: (chave: string) => boolean }): EmendaSemPedido[] {
  const grupos = new Map<string, NotaSemPedido[]>();
  for (const n of notasSemPedidoPendentes(lista, resolvidas)) {
    const chave = `${n.emendaAno ?? ''}|${n.emenda}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), n]);
  }
  return [...grupos.entries()]
    .map(([chave, notas]) => {
      const placar = new Map<string, SugestaoDePedido>();
      for (const n of notas) {
        for (const c of n.pedidosProvaveis) {
          if (!valorIgual(c.valorSemNota, n.valorEmpenhado)) continue;
          const atual = placar.get(c.pedidoId) ?? {
            pedidoId: c.pedidoId,
            pedidoNumero: c.pedidoNumero,
            autorId: c.autorId,
            pedidoEmenda: c.pedidoEmenda,
            pedidoEmendaAno: c.pedidoEmendaAno,
            iguais: 0,
            mesmoCodigo: c.mesmoCodigo
          };
          atual.iguais += 1;
          placar.set(c.pedidoId, atual);
        }
      }
      const ordem = [...placar.values()].sort((a, b) => b.iguais - a.iguais || Number(b.mesmoCodigo) - Number(a.mesmoCodigo));
      const [primeiro, segundo] = ordem;
      const empata = segundo && segundo.iguais === primeiro.iguais && segundo.mesmoCodigo === primeiro.mesmoCodigo;
      return {
        chave,
        emenda: notas[0].emenda,
        ano: notas[0].emendaAno,
        planoInterno: notas[0].planoInterno,
        notas,
        valor: notas.reduce((t, n) => t + n.valorEmpenhado, 0),
        sugestao: primeiro && !empata ? primeiro : null,
        empatados: primeiro && empata ? ordem.filter((x) => x.iguais === primeiro.iguais && x.mesmoCodigo === primeiro.mesmoCodigo).length : 0
      };
    })
    .sort((a, b) => b.valor - a.valor);
}
