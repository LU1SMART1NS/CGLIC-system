/**
 * Empenhado × pedido (protótipo aprovado em 25/10/2026, migration 187). O banco compara, por emenda e item, as linhas
 * dos pedidos já empenhados com as notas da emenda lidas no Portal; aqui ficam as chaves do ✓ Resolvido, os avisos de
 * cada pedido, a etiqueta de cada linha e a lista "ainda não dá para conferir".
 */
import type { ConferenciaEmpenho, ItemCaep } from '../services/emendasService';
import type { AvisoPedido } from './emendasPedidos';
import { curto } from './emendasKits';
import { formatNumber } from './format';

/** Chave do ✓ Resolvido (tipo EMPENHO): as duas quantidades entram, então o aviso volta se uma delas mudar. */
export function chaveAvisoEmpenho(c: Pick<ConferenciaEmpenho, 'emenda' | 'itemKey' | 'situacao' | 'qtdPedido' | 'qtdNasNotas'>): string {
  return `EMPENHO::${c.emenda}::${c.itemKey}::${c.situacao}-${c.qtdPedido}-${c.qtdNasNotas}`;
}

/** Só a mais e a menos viram aviso; a conferir fica na lista recolhida do Início e na etiqueta da linha. */
export const ehDiferenca = (c: Pick<ConferenciaEmpenho, 'situacao'>) => c.situacao === 'A_MAIS' || c.situacao === 'A_MENOS';

/** Diferenças ainda não resolvidas, por pedido (um item da emenda pode estar em vários pedidos). */
export function diferencasPorPedido(conferencia: ConferenciaEmpenho[], resolvidas: { has: (chave: string) => boolean }): Map<string, ConferenciaEmpenho[]> {
  const out = new Map<string, ConferenciaEmpenho[]>();
  for (const c of conferencia) {
    if (!ehDiferenca(c) || resolvidas.has(chaveAvisoEmpenho(c))) continue;
    for (const id of c.pedidoIds) out.set(id, [...(out.get(id) ?? []), c]);
  }
  return out;
}

/** Conferência de cada item da emenda, para a etiqueta da linha do pedido. */
export function conferenciaPorItem(conferencia: ConferenciaEmpenho[]): Map<string, ConferenciaEmpenho> {
  return new Map(conferencia.map((c) => [`${c.emenda}|${c.itemKey}`, c]));
}

export const nomeDoItemConferido = (itemKey: string, itens: Map<string, ItemCaep>): string => {
  const i = itens.get(itemKey);
  return i?.nomeCurto?.trim() || curto(i?.descricao ?? itemKey, 32);
};

const qtd = (n: number) => formatNumber(n);

/** Frase da diferença: "Trailblazer: 200 na nota × 197 no pedido". */
export function fraseDaDiferenca(c: ConferenciaEmpenho, itens: Map<string, ItemCaep>): string {
  return `${nomeDoItemConferido(c.itemKey, itens)}: ${qtd(c.qtdNasNotas)} ${c.notas.length > 1 ? 'nas notas' : 'na nota'} × ${qtd(c.qtdPedido)} no pedido`;
}

/** Avisos do pedido: um para o que a nota tem a mais (vermelho) e um para o que falta (amarelo). */
export function avisosDeEmpenho(diferencas: ConferenciaEmpenho[] | undefined, itens: Map<string, ItemCaep>): AvisoPedido[] {
  if (!diferencas?.length) return [];
  const out: AvisoPedido[] = [];
  const mais = diferencas.filter((c) => c.situacao === 'A_MAIS');
  const menos = diferencas.filter((c) => c.situacao === 'A_MENOS');
  if (mais.length) {
    out.push({
      tipo: 'empenhoAMais',
      curto: 'Empenhado a mais',
      texto: `Empenhado a mais que o pedido: ${mais.map((c) => fraseDaDiferenca(c, itens)).join('; ')}. Corrija o pedido ou a reserva, ou marque como resolvido.`
    });
  }
  if (menos.length) {
    out.push({
      tipo: 'empenhoAMenos',
      curto: 'Empenhado a menos',
      texto: `Empenhado a menos que o pedido, com todas as notas do SEI lidas: ${menos.map((c) => fraseDaDiferenca(c, itens)).join('; ')}. Confira se falta nota no SEI, mande a diferença para a reserva ou marque como resolvido.`
    });
  }
  return out;
}

/** Etiqueta da linha do pedido: o que a nota tem daquele item (soma da emenda). */
export interface EtiquetaConferencia {
  texto: string;
  tom: 'ok' | 'mais' | 'menos' | 'cinza';
  dica: string;
}

/** Até 3 números de nota e "e mais N": a lista inteira está no SEI do pedido. */
const algumas = (notas: string[]) => (notas.length <= 3 ? notas.join(', ') : `${notas.slice(0, 3).join(', ')} e mais ${notas.length - 3}`);

export function motivoAConferir(c: Pick<ConferenciaEmpenho, 'notasFora' | 'notasNaoLidas' | 'notasPorValor' | 'notasComItemSemAta'>): string {
  const partes: string[] = [];
  if (c.notasFora.length) partes.push(`${c.notasFora.length === 1 ? 'falta a nota' : `faltam ${c.notasFora.length} notas`} do SEI no sistema (${algumas(c.notasFora)})`);
  if (c.notasNaoLidas.length) partes.push(`${c.notasNaoLidas.length === 1 ? 'nota ainda não lida' : `${c.notasNaoLidas.length} notas ainda não lidas`} no Portal (${algumas(c.notasNaoLidas)})`);
  if (c.notasPorValor.length) partes.push(`nota em reais, sem quantidade (${algumas(c.notasPorValor)})`);
  if (c.notasComItemSemAta.length) partes.push(`item da nota sem ata conhecida (${algumas(c.notasComItemSemAta)})`);
  return partes.join('; ');
}

export function etiquetaDaConferencia(c: ConferenciaEmpenho | undefined, resolvida: boolean): EtiquetaConferencia | null {
  if (!c || c.situacao === 'SEM_NOTA') return null;
  const outros = c.pedidos.length > 1 ? ` Soma da emenda nos pedidos ${c.pedidos.join(', ')}.` : '';
  const notas = c.notas.length ? ` Notas: ${c.notas.join(', ')}.` : '';
  switch (c.situacao) {
    case 'IGUAL':
      return { texto: `${qtd(c.qtdNasNotas)} de ${qtd(c.qtdPedido)} na nota`, tom: 'ok', dica: `A nota tem o mesmo que o pedido.${notas}${outros}` };
    case 'A_MAIS':
      return {
        texto: resolvida ? `resolvido · ${qtd(c.qtdNasNotas)} na nota` : `${qtd(c.qtdNasNotas)} na nota · ${qtd(c.qtdPedido)} no pedido`,
        tom: resolvida ? 'cinza' : 'mais',
        dica: `A nota tem mais do que o pedido.${notas}${outros}`
      };
    case 'A_MENOS':
      return {
        texto: resolvida ? `resolvido · ${qtd(c.qtdNasNotas)} de ${qtd(c.qtdPedido)}` : `${qtd(c.qtdNasNotas)} de ${qtd(c.qtdPedido)} nas notas`,
        tom: resolvida ? 'cinza' : 'menos',
        dica: `Todas as notas do SEI estão lidas e falta quantidade.${notas}${outros}`
      };
    default:
      return { texto: `${qtd(c.qtdNasNotas)} de ${qtd(c.qtdPedido)} · a conferir`, tom: 'cinza', dica: `Ainda não dá para conferir: ${motivoAConferir(c)}.${notas}${outros}` };
  }
}

/** Linha da lista "Ainda não dá para conferir" do Início: uma por emenda. */
export interface EmendaAConferir {
  emenda: string;
  pedidoIds: string[];
  pedidos: number[];
  itens: number;
  notasFora: string[];
  motivo: string;
  /** Itens em que as notas lidas já mostram parte: "Notebook: 27 de 33". */
  parciais: string[];
}

export function emendasAConferir(conferencia: ConferenciaEmpenho[], itens: Map<string, ItemCaep>): EmendaAConferir[] {
  const por = new Map<string, EmendaAConferir>();
  for (const c of conferencia) {
    if (c.situacao !== 'A_CONFERIR') continue;
    const e = por.get(c.emenda) ?? { emenda: c.emenda, pedidoIds: [], pedidos: [], itens: 0, notasFora: c.notasFora, motivo: motivoAConferir(c), parciais: [] };
    e.itens++;
    e.pedidoIds = [...new Set([...e.pedidoIds, ...c.pedidoIds])];
    e.pedidos = [...new Set([...e.pedidos, ...c.pedidos])].sort((a, b) => a - b);
    if (c.qtdNasNotas > 0) e.parciais.push(`${nomeDoItemConferido(c.itemKey, itens)}: ${qtd(c.qtdNasNotas)} de ${qtd(c.qtdPedido)}`);
    por.set(c.emenda, e);
  }
  return [...por.values()].sort((a, b) => b.itens - a.itens || a.emenda.localeCompare(b.emenda));
}
