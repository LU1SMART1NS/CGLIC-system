import { FISCALIZACAO_RULES } from '../config/alertRules';
import type { EntregaFiscalizacao } from '../services/fiscalizacaoService';

/*
 * Ocorrências do item (entrega B): cobrança ao fornecedor, notificação formal com prazo de resposta, pedido de
 * prorrogação e recusa com prazo de substituição. Cada uma tem data, documento SEI e texto curto, vale para vários
 * itens de uma vez e fica no histórico do item (base para eventual sanção). O banco resume, por item, o que está em
 * aberto (última cobrança, notificação sem resposta, pedido sem decisão, substituição pendente).
 */

export type TipoOcorrencia = 'COBRANCA' | 'NOTIFICACAO' | 'RESPOSTA' | 'PEDIDO_PRORROGACAO' | 'PEDIDO_NEGADO' | 'RECUSA' | 'SUBSTITUICAO';

export const NOME_DA_OCORRENCIA: Record<TipoOcorrencia, string> = {
  COBRANCA: 'Cobrança ao fornecedor',
  NOTIFICACAO: 'Notificação ao fornecedor',
  RESPOSTA: 'Resposta à notificação',
  PEDIDO_PRORROGACAO: 'Pedido de prorrogação',
  PEDIDO_NEGADO: 'Pedido de prorrogação negado',
  RECUSA: 'Recusa no recebimento',
  SUBSTITUICAO: 'Item substituído'
};

/** O que está em aberto no item (o banco calcula pelas ocorrências). */
export interface OcorrenciasDoItem {
  /** Última cobrança ao fornecedor por atraso (data). */
  ultimaCobranca: string | null;
  cobrancas: number;
  /** Notificação sem resposta registrada: quando e até quando responder. */
  notificacao: { em: string; ate: string; sei: string | null } | null;
  /** Pedido de prorrogação do fornecedor ainda sem decisão. */
  pedido: { em: string; sei: string | null; novaData: string | null } | null;
  /** Recusa no recebimento à espera da troca: notificado em e substituir até. */
  substituicao: { recusadoEm: string; notificadoEm: string; ate: string; motivo: string } | null;
}

const dias = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 864e5);
export const somarDias = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/**
 * Atraso e cobrança: sem cobrança registrada, o item atrasado é do fiscal ("atrasado sem cobrança"); cobrado há menos
 * de N dias (Ajustes › Regras e alertas), espera o fornecedor; passado esse tempo, volta ao fiscal para cobrar de novo.
 */
export function situacaoDaCobranca(
  e: Pick<EntregaFiscalizacao, 'prevista'> & { ocorrencias?: OcorrenciasDoItem | null },
  hoje: string
): { estado: 'SEM_COBRANCA' | 'COBRADO' | 'COBRAR_DE_NOVO'; desde: string | null; cobrarEm: string | null } {
  const ultima = e.ocorrencias?.ultimaCobranca ?? null;
  // Cobrança anterior ao atraso (de outro prazo, antes da prorrogação) não conta.
  if (!ultima || (e.prevista && ultima < e.prevista)) return { estado: 'SEM_COBRANCA', desde: null, cobrarEm: null };
  const cobrarEm = somarDias(ultima, FISCALIZACAO_RULES.cobrarFornecedorDias);
  return { estado: hoje >= cobrarEm ? 'COBRAR_DE_NOVO' : 'COBRADO', desde: ultima, cobrarEm };
}

/** Notificação sem resposta: vence no prazo dado na própria notificação. */
export function situacaoDaNotificacao(o: OcorrenciasDoItem | null | undefined, hoje: string) {
  const n = o?.notificacao;
  if (!n) return null;
  const d = dias(n.ate, hoje);
  return { ...n, vencida: d < 0, dias: d };
}

/** Substituição pendente (depois da recusa): vence no prazo do TR, contado da notificação. */
export function situacaoDaSubstituicao(o: OcorrenciasDoItem | null | undefined, hoje: string) {
  const s = o?.substituicao;
  if (!s) return null;
  const d = dias(s.ate, hoje);
  return { ...s, vencida: d < 0, dias: d };
}

/** Texto de quanto falta ou passou: "vence em 3 dias", "venceu há 5 dias", "vence hoje". */
export const textoDoVencimento = (d: number) =>
  d < 0 ? `venceu há ${-d} ${d === -1 ? 'dia' : 'dias'}` : d === 0 ? 'vence hoje' : `vence em ${d} ${d === 1 ? 'dia' : 'dias'}`;

/** Prazo de substituição do contrato (do TR da ata, ou corrigido no contrato): dias a contar da notificação. */
export interface PrazoDeSubstituicao {
  dias: number;
  contagem: 'CORRIDOS' | 'UTEIS';
  origem: 'TR' | 'CONTRATO';
  ata?: string | null;
  automatico?: boolean;
  trecho?: string | null;
}
export const textoDaSubstituicao = (p: PrazoDeSubstituicao) => `${p.dias} dias ${p.contagem === 'UTEIS' ? 'úteis' : 'corridos'} da notificação`;
