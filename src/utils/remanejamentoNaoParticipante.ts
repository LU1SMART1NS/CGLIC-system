/**
 * Remanejamento para órgão não participante (migration 219). As mesmas regras do banco, para a tela mostrar os
 * limites antes de gravar: o banco confere de novo e é quem decide.
 * - Livre na origem: na SENASP, a base do saldo menos o alocado às unidades; no participante, o registrado mais a
 *   redução sem destino, menos o contratado e o já remanejado que o Compras.gov.br ainda não mostra.
 * - 50% do homologado por não participante, somando as adesões que ele já tem.
 * - Limite de adesão do item, somando adesões e remanejamentos a não participantes.
 * - Adesão que aparece depois de um remanejamento para a mesma UASG fica "a conferir" e não conta até o gestor decidir.
 */
import type { AdesaoItemRecord } from '../types';
import type { AdesaoConferida, OrgaoQuantitativo, RemanejamentoNaoParticipante } from '../services/quantitativosService';

/** CONTA: entra no limite · A_CONFERIR: o gestor ainda não decidiu · MESMO: é o próprio remanejamento. */
export type SituacaoDaAdesao = 'CONTA' | 'A_CONFERIR' | 'MESMO';

export interface AdesaoNoLimite {
  uasg: string;
  /** dataAprovacaoAnalise sem fuso (19 caracteres), a chave da adesão. */
  aprovadaEm: string;
  quantidade: number;
  situacao: SituacaoDaAdesao;
  adesao: AdesaoItemRecord;
}

/** UASG da adesão ("929777 - SECRETARIA ..." → "929777"). */
export const uasgDaAdesao = (a: Pick<AdesaoItemRecord, 'unidadeNaoParticipante'>) => /^\s*(\d{6})/.exec(a.unidadeNaoParticipante || '')?.[1] ?? '';

/** Situação de cada adesão no limite, como adesoes_do_item no banco. */
export function adesoesNoLimite(adesoes: AdesaoItemRecord[], remanejamentos: RemanejamentoNaoParticipante[], conferidas: AdesaoConferida[]): AdesaoNoLimite[] {
  return adesoes.map((adesao) => {
    const uasg = uasgDaAdesao(adesao);
    const aprovadaEm = (adesao.dataAprovacaoAnalise ?? '').slice(0, 19);
    const decisao = conferidas.find((c) => c.uasg === uasg && c.aprovadaEm === aprovadaEm)?.decisao;
    const nova = remanejamentos.some((r) => r.uasgDestino === uasg && !r.adesoesConhecidas.includes(aprovadaEm));
    const situacao: SituacaoDaAdesao = decisao === 'MESMO' ? 'MESMO' : decisao === 'DIFERENTES' ? 'CONTA' : nova ? 'A_CONFERIR' : 'CONTA';
    return { uasg, aprovadaEm, quantidade: Number(adesao.quantidadeAprovadaAdesao) || 0, situacao, adesao };
  });
}

/** Quanto do limite de adesão está usado: adesões que contam + remanejamentos a não participantes. */
export function usadoNoLimite(lista: AdesaoNoLimite[], remanejamentos: RemanejamentoNaoParticipante[], uasg?: string) {
  const adesoes = lista.filter((a) => a.situacao === 'CONTA' && (!uasg || a.uasg === uasg)).reduce((s, a) => s + a.quantidade, 0);
  const remanejado = remanejamentos.filter((r) => !uasg || r.uasgDestino === uasg).reduce((s, r) => s + r.quantidade, 0);
  return { adesoes, remanejado, total: adesoes + remanejado };
}

/** Livre na origem (o banco confere de novo). */
export function livreNaOrigem(p: { orgao: OrgaoQuantitativo; baseSaldo: number; alocado: number; contratado: number }): number {
  const { orgao: o } = p;
  if (o.ehSenasp) return Math.max(p.baseSaldo - p.alocado, 0);
  return Math.max((o.quantidadeRegistrada ?? 0) - o.naoParticipanteAguardaFonte + o.resto - p.contratado, 0);
}

export interface RegraDoLimite {
  chave: 'ORIGEM' | 'POR_ORGAO' | 'TOTAL';
  livre: number;
  /** Conta que explica o livre, ex.: "cota 379 − alocado 340". */
  conta: string;
}

/**
 * As três regras para uma quantidade: livre na origem, 50% do item para a UASG de destino e limite de adesão.
 * Sem UASG de destino, só a da origem.
 */
export function regrasDoRemanejamento(p: {
  origem: { livre: number; conta: string };
  destino: string | null;
  homologado: number;
  limiteAdesao: number;
  adesoes: AdesaoNoLimite[];
  remanejamentos: RemanejamentoNaoParticipante[];
  fmt: (n: number) => string;
}): RegraDoLimite[] {
  const regras: RegraDoLimite[] = [{ chave: 'ORIGEM', livre: p.origem.livre, conta: p.origem.conta }];
  if (!p.destino) return regras;
  const porOrgao = p.homologado / 2;
  const daUasg = usadoNoLimite(p.adesoes, p.remanejamentos, p.destino).total;
  const total = usadoNoLimite(p.adesoes, p.remanejamentos).total;
  regras.push({ chave: 'POR_ORGAO', livre: Math.max(porOrgao - daUasg, 0), conta: `máximo ${p.fmt(porOrgao)}${daUasg > 0 ? ` − já tem ${p.fmt(daUasg)}` : ''}` });
  regras.push({ chave: 'TOTAL', livre: Math.max(p.limiteAdesao - total, 0), conta: `limite ${p.fmt(p.limiteAdesao)} − usado ${p.fmt(total)}` });
  return regras;
}
