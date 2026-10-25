/**
 * Conferência pela nota de empenho (migration 190, M7 e M4 da revisão de 25/10/2026): a nota ligada à linha com outro
 * credor que o fornecedor da ata do item, e a nota de emenda da UG 200330 cuja emenda nenhum pedido tem. Os dois
 * avisos são marcados como resolvidos com justificativa pelo mesmo ✓ Resolvido do empenhado × pedido (tipo EMPENHO).
 */
import type { CredorDiferente, ItemCaep, NotaSemPedido } from '../services/emendasService';
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
  `Nota ${g.nota}${g.credorNome ? ` (${g.credorNome})` : ''} ${g.linhas.length === 1 ? 'em 1 linha' : `em ${g.linhas.length} linhas`}`;

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
    texto: `${grupos.map((g) => `${g.nota}${g.credorNome ? ` (${g.credorNome})` : ''}`).join(', ')}: credor diferente do fornecedor da ata em ${linhas === 1 ? '1 linha' : `${linhas} linhas`}. A nota pode estar ligada à linha errada, ou o item ou a ata do pedido estão trocados. Confira; se estiver certo, marque como resolvido.`,
    linhaId: grupos[0].linhas[0].linhaId
  };
}

/** Notas de emenda sem pedido ainda não marcadas como resolvidas, da maior para a menor. */
export const notasSemPedidoPendentes = (lista: NotaSemPedido[], resolvidas: { has: (chave: string) => boolean }): NotaSemPedido[] =>
  lista.filter((n) => !resolvidas.has(chaveNotaSemPedido(n))).sort((a, b) => b.valorEmpenhado - a.valorEmpenhado);
