import type { ContratoDoFornecedor, NotaForaDoContrato } from '../../services/notasForaDoContratoService';
import type { EmpenhoForaDoContrato } from '../../services/empenhosForaDoContratoService';

/**
 * Regras da fila Vínculos › Notas fora do contrato (migration 256). O sistema não vincula: indica o contrato onde
 * incluir a nota no Contratos.gov.br e acompanha a marca "Vou incluir" do gestor.
 */

/** Dias que a marca "Vou incluir" segura a nota fora de "A incluir". */
export const PRAZO_DA_MARCA_DIAS = 7;

export type SituacaoNotaFora = 'A_INCLUIR' | 'INCLUINDO' | 'INCLUSAO_NAO_CHEGOU';
export type SegmentoNotaFora = 'A_INCLUIR' | 'INCLUINDO' | 'AGUARDANDO' | 'ANULADAS' | 'TODAS';

/**
 * O que a nota pede (13/11/2026):
 * - ANULADA: valor empenhado zero no Tesouro; não precisa entrar em contrato.
 * - INCLUIR: o contrato é conhecido: o do pedido de emenda, ou um contrato do fornecedor assinado depois da nota, com o
 *   item do pedido e ainda sem notas da fonte (é o contrato novo que espera a nota).
 * - AGUARDANDO_CONTRATO: nota de pedido de emenda sem contrato do fornecedor com o item do pedido assinado depois dela:
 *   o contrato ainda não foi assinado (ou não chegou do Contratos.gov.br). Não sugere contrato.
 * - A_CONFERIR: o resto (sem pedido de emenda, ou contrato provável que já tem notas da fonte): sugestões para conferir.
 */
export type TipoNotaFora = 'INCLUIR' | 'A_CONFERIR' | 'AGUARDANDO_CONTRATO' | 'ANULADA';

const assinadoDepois = (n: Pick<NotaForaDoContrato, 'dataEmissao'>, c: ContratoDoFornecedor) =>
  Boolean(c.assinatura && n.dataEmissao && c.assinatura >= n.dataEmissao);

/** Contrato novo que espera a nota: item do pedido, assinado depois da nota e sem notas da fonte. */
export function contratoNovoDoPedido(n: Pick<NotaForaDoContrato, 'dataEmissao' | 'contratosDoFornecedor' | 'pedidos'>): ContratoDoFornecedor | null {
  if (n.pedidos.length === 0) return null;
  return n.contratosDoFornecedor.find((c) => c.temItemDoPedido && c.semNotasDaFonte && assinadoDepois(n, c)) ?? null;
}

export function tipoDaNota(n: Pick<NotaForaDoContrato, 'valorEmpenhado' | 'contratoPeloPedido' | 'pedidos' | 'dataEmissao' | 'contratosDoFornecedor'>): TipoNotaFora {
  if (n.valorEmpenhado <= 0) return 'ANULADA';
  if (n.contratoPeloPedido || contratoNovoDoPedido(n)) return 'INCLUIR';
  if (n.pedidos.length > 0 && !n.contratosDoFornecedor.some((c) => c.temItemDoPedido && assinadoDepois(n, c))) return 'AGUARDANDO_CONTRATO';
  return 'A_CONFERIR';
}

export function situacaoDaNota(n: Pick<NotaForaDoContrato, 'marca'>, agora: Date = new Date()): SituacaoNotaFora {
  if (!n.marca) return 'A_INCLUIR';
  const dias = (agora.getTime() - new Date(n.marca.em).getTime()) / 86_400_000;
  return dias >= PRAZO_DA_MARCA_DIAS ? 'INCLUSAO_NAO_CHEGOU' : 'INCLUINDO';
}

type NotaDoSegmento = Pick<NotaForaDoContrato, 'marca' | 'valorEmpenhado' | 'contratoPeloPedido' | 'pedidos' | 'dataEmissao' | 'contratosDoFornecedor'>;

/**
 * Abas da fila. A marca "Vou incluir" vale em qualquer tipo (o gestor pode saber do contrato antes do sistema). Só "A
 * incluir" conta no número do menu: anuladas e notas à espera do contrato não pedem nada ao gestor.
 */
export function notaNoSegmento(n: NotaDoSegmento, segmento: SegmentoNotaFora, agora?: Date): boolean {
  if (segmento === 'TODAS') return true;
  const s = situacaoDaNota(n, agora);
  if (segmento === 'INCLUINDO') return s === 'INCLUINDO';
  if (s === 'INCLUINDO') return false;
  const t = tipoDaNota(n);
  if (segmento === 'ANULADAS') return t === 'ANULADA';
  if (segmento === 'AGUARDANDO') return t === 'AGUARDANDO_CONTRATO';
  return t === 'INCLUIR' || t === 'A_CONFERIR';
}

/**
 * Contrato indicado: o da marca, senão o do pedido de emenda (a Carteira já mostra a nota nele), senão a 1ª sugestão
 * entre os contratos do fornecedor. Nulo quando o fornecedor não tem contrato.
 */
export function contratoIndicado(n: NotaDoSegmento): string | null {
  if (n.marca) return n.marca.contractKey;
  const t = tipoDaNota(n);
  if (t === 'ANULADA' || t === 'AGUARDANDO_CONTRATO') return null;
  return n.contratoPeloPedido ?? contratoNovoDoPedido(n)?.contractKey ?? n.contratosDoFornecedor[0]?.contractKey ?? null;
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
  const t = tipoDaNota(n);
  if (t === 'ANULADA') {
    const s = n.substituta;
    return s
      ? `A nota foi anulada: o Tesouro mostra R$ 0,00 empenhado. Ela foi substituída pela ${s.numero}, do mesmo credor, plano interno e dia${s.contractKey ? `, que já está no contrato ${numeroDoContrato(s.contractKey)}` : ''}. Não precisa entrar em contrato.`
      : 'A nota foi anulada: o Tesouro mostra R$ 0,00 empenhado. Não precisa entrar em contrato.';
  }
  if (t === 'AGUARDANDO_CONTRATO') {
    const p = n.pedidos[0];
    const ccga = p?.ccga === 'ENVIADA' ? `, enviado à CCGA${p.ccgaEm ? ` em ${p.ccgaEm.split('-').reverse().join('/')}` : ''}` : p?.ccga === 'DEVOLVIDA' ? ', devolvido pela CCGA' : '';
    return `O pedido de emenda ${n.pedidos.map((x) => x.numero).join(', ')} está na contratação${ccga}, e o fornecedor não tem contrato com o item do pedido assinado depois da nota: o contrato ainda não foi assinado. Quando ele chegar do Contratos.gov.br, a nota passa para "A incluir" com esse contrato.`;
  }
  const novo = contratoNovoDoPedido(n);
  if (!n.contratoPeloPedido && novo)
    return `O contrato ${numeroDoContrato(novo.contractKey)} foi assinado depois da nota, tem o item do pedido de emenda ${n.pedidos[0].numero} e ainda não tem notas: é nele que a nota deve entrar. O Contratos.gov.br ainda não a lista em contrato nenhum.`;
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
