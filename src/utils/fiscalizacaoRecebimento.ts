import { FISCALIZACAO_RULES } from '../config/alertRules';
import type { EntregaFiscalizacao } from '../services/fiscalizacaoService';
import { dataBR } from './fiscalizacao';
import { previstaPelaRegra, textoDosDias, type ContagemPrazo } from './fiscalizacaoPrazo';

/*
 * Prazos de recebimento (TRP e TRD) e do envio para pagamento. Vêm do Termo de Referência da ata (modelo da AGU:
 * "recebidos provisoriamente, de forma sumária, no ato da entrega, juntamente com a nota fiscal" e "o recebimento
 * definitivo ocorrerá no prazo de N dias úteis, a contar do recebimento da nota fiscal") e podem ser corrigidos no
 * contrato. Como a nota chega com a entrega, o TRD conta da entrega, a não ser que o TR diga "do recebimento provisório".
 * Sem regra no TR, vale a IN SEGES 77/2022, art. 7º, I (10 dias úteis do recebimento da nota; 5 no pequeno valor).
 */

export type InicioDoTrd = 'ENTREGA' | 'TRP';
export interface RegraDoRecebimento {
  /** 0 = no ato da entrega. */
  trpDias: number;
  trpContagem: ContagemPrazo;
  trdDias: number;
  trdContagem: ContagemPrazo;
  trdInicio: InicioDoTrd;
  /** TR = lido do Termo de Referência e confirmado pelo gestor da ata; CONTRATO = corrigido no contrato; LEI = IN 77. */
  origem?: 'TR' | 'CONTRATO' | 'LEI';
  ata?: string | null;
  trechoTrp?: string | null;
  trechoTrd?: string | null;
  confirmadoPor?: string | null;
  motivo?: string | null;
}


export const textoDoTrp = (r: Pick<RegraDoRecebimento, 'trpDias' | 'trpContagem'>) =>
  r.trpDias === 0 ? 'no ato da entrega' : `${textoDosDias(r.trpDias, r.trpContagem)} da entrega`;
export const textoDoTrd = (r: Pick<RegraDoRecebimento, 'trdDias' | 'trdContagem' | 'trdInicio'>) =>
  `${textoDosDias(r.trdDias, r.trdContagem)} ${r.trdInicio === 'TRP' ? 'do recebimento provisório' : 'da entrega (nota fiscal)'}`;
export const textoDaRegraDeRecebimento = (r: RegraDoRecebimento) => `TRP ${textoDoTrp(r)} · TRD em ${textoDoTrd(r)}`;

export const origemDoRecebimento = (r: RegraDoRecebimento) =>
  r.origem === 'CONTRATO'
    ? 'informado no contrato'
    : r.origem === 'LEI'
      ? 'o TR não diz; vale a IN SEGES 77/2022'
      : `do TR da ata ${r.ata ?? ''}${r.confirmadoPor ? `, confirmado por ${r.confirmadoPor}` : ''}`.trim();

/** Até quando emitir o TRP (no ato da entrega: no próprio dia). */
export const trpAte = (entregueEm: string, r: RegraDoRecebimento) => (r.trpDias === 0 ? entregueEm : previstaPelaRegra(entregueEm, r.trpDias, r.trpContagem));
/** Até quando emitir o TRD, da entrega ou do TRP. */
export const trdAte = (entregueEm: string, trpEm: string | null, r: RegraDoRecebimento) => previstaPelaRegra(r.trdInicio === 'TRP' ? trpEm ?? entregueEm : entregueEm, r.trdDias, r.trdContagem);
/** Até quando mandar para pagamento: dias úteis do TRD (Ajustes › Regras e alertas › Fiscalização). */
export const envioAte = (trdEm: string) => previstaPelaRegra(trdEm, FISCALIZACAO_RULES.envioPagamentoDiasUteis, 'UTEIS');

/** As três datas do item, conforme a etapa (o banco calcula o mesmo na lista). */
export function datasDoRecebimento(
  e: Pick<EntregaFiscalizacao, 'etapa' | 'entregueEm' | 'etapaEm'>,
  r: RegraDoRecebimento | null | undefined
): { trpAte: string | null; trdAte: string | null; envioAte: string | null } {
  const vazio = { trpAte: null, trdAte: null, envioAte: null };
  // O envio conta do TRD com o prazo interno, mesmo sem a regra do TR.
  if (e.etapa === 'TRD') return { ...vazio, envioAte: e.etapaEm ? envioAte(e.etapaEm) : null };
  if (!r || !e.entregueEm) return vazio;
  if (e.etapa === 'ENTREGUE') return { ...vazio, trpAte: trpAte(e.entregueEm, r) };
  if (e.etapa === 'TRP') return { ...vazio, trdAte: trdAte(e.entregueEm, e.etapaEm, r) };
  return vazio;
}

const PASSO: Record<string, string> = { ENTREGUE: 'TRP', TRP: 'TRD', TRD: 'Envio ao pagamento' };

/**
 * Situação do recebimento de um item entregue: o passo que falta (TRP, TRD ou envio), com a data limite.
 * null quando o item não está entre a entrega e o envio para pagamento.
 */
export function prazoDoRecebimento(
  e: Pick<EntregaFiscalizacao, 'etapa' | 'entregueEm'> & Partial<Pick<EntregaFiscalizacao, 'trpAte' | 'trdAte' | 'envioAte' | 'regraDeRecebimento'>>,
  hoje: string
): { texto: string; tom: 'danger' | 'warning' | 'neutral'; dias: number | null; limite: string | null } | null {
  const passo = PASSO[e.etapa];
  if (!passo) return null;
  if (e.etapa === 'ENTREGUE' && !e.entregueEm) return { texto: 'Data da entrega a registrar', tom: 'warning', dias: null, limite: null };
  const limite = e.etapa === 'ENTREGUE' ? e.trpAte : e.etapa === 'TRP' ? e.trdAte : e.envioAte;
  if (!limite) return { texto: e.regraDeRecebimento === false ? 'Prazo de recebimento a informar' : `${passo} sem prazo`, tom: 'neutral', dias: null, limite: null };
  const d = Math.round((Date.parse(`${limite}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 864e5);
  if (d < 0) return { texto: `${passo} vencido há ${-d} ${d === -1 ? 'dia' : 'dias'}`, tom: 'danger', dias: d, limite };
  if (d === 0) return { texto: `${passo} vence hoje`, tom: 'warning', dias: 0, limite };
  return { texto: `${passo} até ${dataBR(limite)}`, tom: d <= FISCALIZACAO_RULES.avisoAntesDias ? 'warning' : 'neutral', dias: d, limite };
}

/**
 * Comissão de recebimento: depois do envio para o TRP, cobrar de novo a cada N dias sem o TRP (Ajustes › Regras e
 * alertas › Fiscalização). null quando o item não está com a comissão.
 */
export function cobrancaDaComissao(
  e: Pick<EntregaFiscalizacao, 'etapa'> & Partial<Pick<EntregaFiscalizacao, 'comissaoEnviadaEm' | 'comissaoCobradaEm'>>,
  hoje: string
): { desde: string; cobrarEm: string; vencida: boolean; dias: number } | null {
  if (e.etapa !== 'ENTREGUE' || !e.comissaoEnviadaEm) return null;
  const base = e.comissaoCobradaEm && e.comissaoCobradaEm > e.comissaoEnviadaEm ? e.comissaoCobradaEm : e.comissaoEnviadaEm;
  const cobrarEm = new Date(Date.parse(`${base}T12:00:00Z`) + FISCALIZACAO_RULES.cobrarComissaoDias * 864e5).toISOString().slice(0, 10);
  const dias = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${e.comissaoEnviadaEm}T12:00:00Z`)) / 864e5);
  return { desde: e.comissaoEnviadaEm, cobrarEm, vencida: hoje >= cobrarEm, dias };
}

/**
 * Prazo do item entre a entrega e o envio para pagamento, para ordenar e filtrar as listas (o prazo de entrega já
 * passou): com a comissão, a data da cobrança; senão, o TRP, o TRD ou o envio. null fora dessas etapas.
 */
export function prazoDoItemNoRecebimento(
  e: Parameters<typeof prazoDoRecebimento>[0] & Partial<Pick<EntregaFiscalizacao, 'comissaoEnviadaEm' | 'comissaoCobradaEm'>>,
  hoje: string
): { dias: number | null; tom: 'danger' | 'warning' | 'neutral' } | null {
  const c = cobrancaDaComissao(e, hoje);
  if (c) {
    const d = Math.round((Date.parse(`${c.cobrarEm}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 864e5);
    return { dias: d, tom: c.vencida ? 'danger' : d <= FISCALIZACAO_RULES.avisoAntesDias ? 'warning' : 'neutral' };
  }
  const r = prazoDoRecebimento(e, hoje);
  return r ? { dias: r.dias, tom: r.tom } : null;
}
