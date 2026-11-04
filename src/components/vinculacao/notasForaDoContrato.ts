import type { ContratoDoFornecedor, NotaForaDoContrato } from '../../services/notasForaDoContratoService';
import type { EmpenhoForaDoContrato } from '../../services/empenhosForaDoContratoService';

/**
 * Regras da fila Vínculos › Notas fora do contrato (migration 256). O sistema não vincula: indica o contrato onde
 * incluir a nota no Contratos.gov.br e acompanha a marca "Vou incluir" do gestor.
 */

/** Dias que a marca "Vou incluir" segura a nota fora de "A incluir". */
export const PRAZO_DA_MARCA_DIAS = 7;

export type SituacaoNotaFora = 'A_INCLUIR' | 'INCLUINDO' | 'INCLUSAO_NAO_CHEGOU';
export type SegmentoNotaFora = 'A_INCLUIR' | 'INCLUINDO' | 'TODAS';

export function situacaoDaNota(n: Pick<NotaForaDoContrato, 'marca'>, agora: Date = new Date()): SituacaoNotaFora {
  if (!n.marca) return 'A_INCLUIR';
  const dias = (agora.getTime() - new Date(n.marca.em).getTime()) / 86_400_000;
  return dias >= PRAZO_DA_MARCA_DIAS ? 'INCLUSAO_NAO_CHEGOU' : 'INCLUINDO';
}

export function notaNoSegmento(n: Pick<NotaForaDoContrato, 'marca'>, segmento: SegmentoNotaFora, agora?: Date): boolean {
  if (segmento === 'TODAS') return true;
  const s = situacaoDaNota(n, agora);
  return segmento === 'INCLUINDO' ? s === 'INCLUINDO' : s !== 'INCLUINDO';
}

/**
 * Contrato indicado: o da marca, senão o do pedido de emenda (a Carteira já mostra a nota nele), senão a 1ª sugestão
 * entre os contratos do fornecedor. Nulo quando o fornecedor não tem contrato.
 */
export function contratoIndicado(n: Pick<NotaForaDoContrato, 'marca' | 'contratoPeloPedido' | 'contratosDoFornecedor'>): string | null {
  return n.marca?.contractKey ?? n.contratoPeloPedido ?? n.contratosDoFornecedor[0]?.contractKey ?? null;
}

/** Até 3 contratos para escolher: o do pedido primeiro, depois a ordem da sugestão. */
export function contratosSugeridos(n: Pick<NotaForaDoContrato, 'contratoPeloPedido' | 'contratosDoFornecedor'>, quantos = 3): ContratoDoFornecedor[] {
  const todos = n.contratosDoFornecedor;
  const doPedido = n.contratoPeloPedido ? todos.find((c) => c.contractKey === n.contratoPeloPedido) : undefined;
  const resto = todos.filter((c) => c !== doPedido);
  return (doPedido ? [doPedido, ...resto] : resto).slice(0, quantos);
}

const dias = (de: string, ate: string) => Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 86_400_000);

/** Motivos de um contrato sugerido: ✓ quando conta a favor. */
export function motivosDoContrato(n: Pick<NotaForaDoContrato, 'pedidos' | 'dataEmissao'>, c: ContratoDoFornecedor): Array<{ aFavor: boolean; texto: string }> {
  const r: Array<{ aFavor: boolean; texto: string }> = [];
  if (n.pedidos.length === 0) r.push({ aFavor: false, texto: 'Nota sem pedido de emenda' });
  else r.push(c.temItemDoPedido ? { aFavor: true, texto: `Item do pedido ${n.pedidos[0].numero}` } : { aFavor: false, texto: 'Não tem o item do pedido' });
  if (c.assinatura && n.dataEmissao) {
    const d = dias(n.dataEmissao, c.assinatura);
    r.push(
      d >= 0
        ? { aFavor: true, texto: `Assinado ${d} dia${d === 1 ? '' : 's'} depois da nota` }
        : { aFavor: false, texto: `Assinado ${-d} dia${d === -1 ? '' : 's'} antes da nota` }
    );
  }
  r.push(c.semNotasDaFonte ? { aFavor: true, texto: 'Sem notas da fonte' } : { aFavor: false, texto: 'Já tem notas da fonte' });
  return r;
}

/** "O que aconteceu", numa frase. */
export function fraseDaNota(n: NotaForaDoContrato, numeroDoContrato: (key: string) => string): string {
  if (n.contratoPeloPedido) {
    const p = n.pedidos.map((x) => x.numero).join(', ');
    return `A nota está no pedido de emenda ${p}, que aponta o contrato ${numeroDoContrato(n.contratoPeloPedido)}. A Carteira já a mostra nesse contrato pelo pedido, mas o Contratos.gov.br não a lista em contrato nenhum: lá, o contrato fica sem o empenho.`;
  }
  if (n.contratosDoFornecedor.length === 0)
    return 'O Contratos.gov.br não lista a nota em contrato nenhum, e o credor dela não tem contrato na carteira. Confira no SEI de que contratação é a nota.';
  return 'O Contratos.gov.br não lista a nota em contrato nenhum, então ela não aparece em contrato na Carteira. Nota de uma UG pode ser incluída em contrato da outra UASG.';
}

/** Situação "Na Carteira": em contrato pelo pedido ou sem contrato. */
export type NaCarteira = 'PELO_PEDIDO' | 'SEM_CONTRATO';
export const naCarteira = (n: Pick<NotaForaDoContrato, 'contratoPeloPedido'>): NaCarteira => (n.contratoPeloPedido ? 'PELO_PEDIDO' : 'SEM_CONTRATO');

/**
 * Tira as notas que uma fatura já cita fora do contrato: elas ficam só em "Citadas em fatura", que diz o contrato da
 * fatura (as duas visões da aba Empenhos ao contrato não repetem a nota, nem o número do menu).
 */
export function semNotasCitadasEmFatura<T extends Pick<NotaForaDoContrato, 'empenhoId'>>(notas: T[], citadas: Array<Pick<EmpenhoForaDoContrato, 'nota'>>): T[] {
  const ids = new Set(citadas.map((c) => c.nota?.empenhoId).filter(Boolean));
  return ids.size === 0 ? [...notas] : notas.filter((n) => !ids.has(n.empenhoId));
}
