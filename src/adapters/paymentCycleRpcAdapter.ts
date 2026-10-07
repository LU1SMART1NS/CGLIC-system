/**
 * Adapter RPC — Ciclo Operacional de Pagamentos/CGOFI (Fase 10-A.2)
 *
 * Substitui a persistência em localStorage (useContractPaymentFollowUp.ts)
 * por leitura/escrita real em contract_payment_cycles via Supabase/RPCs
 * (create_payment_cycle_atomic, register_payment_cycle_marco_atomic, add/remove_payment_cycle_document_atomic,
 * update_payment_cycle_info_atomic — migrations 22 e 58).
 */
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { mapPostgresErrorToAppError } from './rpcErrorAdapter';
import type {
  RpcContractPaymentCycleRow,
  RpcCreatePaymentCycleResult,
  RpcPaymentCycleChecklistRow,
  RpcPaymentCycleDocumentRow,
  RpcPaymentCycleEventRow,
  RpcPaymentCycleFaturaRow,
  RpcPaymentCycleItemRow,
  RpcPaymentCycleInfoResult,
  RpcPaymentCycleMarcoResult
} from '../types/rpc';

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado'));
  }
  return supabase;
}

/**
 * Busca todos os ciclos de pagamento persistidos para um contrato.
 * RLS restringe a leitura a usuários autenticados com papel válido.
 */
export async function fetchPaymentCyclesForContract(contractKey: string): Promise<RpcContractPaymentCycleRow[]> {
  if (!isSupabaseConfigured || !supabase || !contractKey) return [];

  const { data, error } = await supabase
    .from('contract_payment_cycles')
    .select('*')
    .eq('contract_key', contractKey)
    .order('criado_em', { ascending: false });

  if (error) throw mapPostgresErrorToAppError(error);
  return (data || []) as RpcContractPaymentCycleRow[];
}

/**
 * Busca ciclos de pagamento persistidos para VÁRIOS contratos de uma vez
 * (visão consolidada — Dashboard Gerencial / Central de Atenção). Reutilizada
 * por dashboardService.ts para eliminar a dependência de localStorage que a
 * visão agregada ainda tinha (fetchAllPaymentCyclesFromStorage, Fase 10-A.2.1
 * — GAP encontrado durante o fechamento de pendências: a migração da Fase
 * 10-A.2 havia corrigido apenas a visão por contrato).
 */
export async function fetchPaymentCyclesForContracts(contractKeys: string[]): Promise<RpcContractPaymentCycleRow[]> {
  const cleanKeys = Array.from(new Set((contractKeys || []).filter(Boolean)));
  if (!isSupabaseConfigured || !supabase || cleanKeys.length === 0) return [];

  const { data, error } = await supabase
    .from('contract_payment_cycles')
    .select('*')
    .in('contract_key', cleanKeys)
    .order('criado_em', { ascending: false });

  if (error) throw mapPostgresErrorToAppError(error);
  return (data || []) as RpcContractPaymentCycleRow[];
}

/** Documentos e histórico dos ciclos informados (uma consulta para todos). */
export async function fetchPaymentCycleDetails(cycleIds: string[]): Promise<{
  documentos: RpcPaymentCycleDocumentRow[];
  eventos: RpcPaymentCycleEventRow[];
  itens: RpcPaymentCycleItemRow[];
  checklist: RpcPaymentCycleChecklistRow[];
  faturas: RpcPaymentCycleFaturaRow[];
}> {
  const ids = Array.from(new Set((cycleIds || []).filter(Boolean)));
  if (!isSupabaseConfigured || !supabase || ids.length === 0) return { documentos: [], eventos: [], itens: [], checklist: [], faturas: [] };

  const [docs, events, itens, checklist, faturas] = await Promise.all([
    supabase.from('contract_payment_cycle_documents').select('*').in('cycle_id', ids).order('created_at', { ascending: true }),
    supabase.from('contract_payment_cycle_events').select('*').in('cycle_id', ids).order('created_at', { ascending: true }),
    supabase.from('contract_payment_cycle_itens').select('*').in('cycle_id', ids).order('ordem', { ascending: true }),
    supabase.from('contract_payment_cycle_checklist').select('*').in('cycle_id', ids),
    supabase.from('contract_payment_cycle_faturas').select('*').in('cycle_id', ids)
  ]);
  for (const r of [docs, events, itens, checklist, faturas]) {
    if (r.error) throw mapPostgresErrorToAppError(r.error);
  }
  return {
    documentos: (docs.data || []) as RpcPaymentCycleDocumentRow[],
    eventos: (events.data || []) as RpcPaymentCycleEventRow[],
    itens: (itens.data || []) as RpcPaymentCycleItemRow[],
    checklist: (checklist.data || []) as RpcPaymentCycleChecklistRow[],
    faturas: (faturas.data || []) as RpcPaymentCycleFaturaRow[]
  };
}

/** Nota fiscal do item "DO PAGAMENTO" (Portaria 50, Anexo II). */
export interface CreatePaymentCycleItemInput {
  notaFiscal: string;
  notaFiscalSei?: string;
  atestoSei: string;
  empenhoCanonicalKey: string;
  subelemento?: string;
  valorBruto: number;
  jurosMulta?: number;
  glosa?: number;
  desconto?: number;
  justificativaJuros?: string;
}

export interface CreatePaymentCycleInput {
  contractKey: string;
  /** Data do atesto: início dos prazos (recebimento da nota pela Administração). */
  dataAssinaturaAtesto: string;
  /** Chegada do processo à CGLIC. */
  dataRecebimento: string;
  dataVencimentoFatura: string;
  /** Um processo SEI por pagamento (Portaria 50 art. 5º § 1º). */
  numeroProcessoPagamentoSei: string;
  itens: CreatePaymentCycleItemInput[];
  prazoConferenciaAte?: string;
  /** Prazo padrão de Regras de Alertas, para o servidor saber se o prazo foi alongado. */
  prazoPadrao?: string;
  justificativaPrazo?: string;
  responsavelNome?: string;
  responsavelUserId?: string;
  observacoes?: string;
  registradoPorNome?: string;
}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = requireSupabase();
  try {
    const { data, error } = await client.rpc(name, args);
    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error(`INVALID_PAYLOAD: Resposta inválida da RPC ${name}`));
    }
    return data as T;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export function createPaymentCycleRpc(input: CreatePaymentCycleInput): Promise<RpcCreatePaymentCycleResult> {
  return callRpc<RpcCreatePaymentCycleResult>('create_payment_cycle_atomic', {
    p_contract_key: input.contractKey,
    p_data_assinatura_atesto: input.dataAssinaturaAtesto,
    p_data_recebimento: input.dataRecebimento,
    p_data_vencimento_fatura: input.dataVencimentoFatura,
    p_numero_processo_pagamento_sei: input.numeroProcessoPagamentoSei,
    p_itens: input.itens.map((i) => ({
      nota_fiscal: i.notaFiscal,
      nota_fiscal_sei: i.notaFiscalSei ?? null,
      atesto_sei: i.atestoSei,
      empenho_canonical_key: i.empenhoCanonicalKey,
      subelemento: i.subelemento ?? null,
      valor_bruto: i.valorBruto,
      juros_multa: i.jurosMulta ?? 0,
      glosa: i.glosa ?? 0,
      desconto: i.desconto ?? 0,
      justificativa_juros: i.justificativaJuros ?? null
    })),
    p_prazo_conferencia_ate: input.prazoConferenciaAte ?? null,
    p_prazo_padrao: input.prazoPadrao ?? null,
    p_justificativa_prazo: input.justificativaPrazo ?? null,
    p_responsavel_nome: input.responsavelNome ?? null,
    p_responsavel_user_id: input.responsavelUserId ?? null,
    p_observacoes: input.observacoes ?? null,
    p_registrado_por_nome: input.registradoPorNome ?? null
  });
}

export type PaymentMarco =
  | 'CONFERIDO' | 'PENDENCIA' | 'RETORNO' | 'ENVIADO_CGOFI' | 'DEVOLVIDO' | 'PAGO' | 'CANCELADO'
  | 'ENVIADO_COLOG' | 'PRORROGACAO_LIQUIDACAO';

export interface RegisterPaymentMarcoInput {
  cycleKey: string;
  marco: PaymentMarco;
  data: string;
  sei?: string;
  numeroOb?: string;
  motivo?: string;
  origemPendencia?: 'FORNECEDOR' | 'FISCAL';
  prazoNovo?: string;
  prazoPadrao?: string;
  justificativa?: string;
  /** Checklist do Anexo I (conferência e devolução). */
  checklist?: Array<{ item: string; resposta: 'SIM' | 'NAO' | 'NA'; sei?: string }>;
  /** Envio à CGOFI: faturas do Contratos.gov.br pagas por este ciclo. */
  faturas?: number[];
  /** Envio à CGOFI: também à COLOG (bens a incorporar). */
  enviarColog?: boolean;
  registradoPorNome?: string;
}

export function registerPaymentMarcoRpc(input: RegisterPaymentMarcoInput): Promise<RpcPaymentCycleMarcoResult> {
  const cycleKey = (input.cycleKey || '').trim();
  if (!cycleKey) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do ciclo (cycleKey) é obrigatória.'));
  }
  return callRpc<RpcPaymentCycleMarcoResult>('register_payment_cycle_marco_atomic', {
    p_cycle_key: cycleKey,
    p_marco: input.marco,
    p_data: input.data,
    p_sei: input.sei ?? null,
    p_numero_ob: input.numeroOb ?? null,
    p_motivo: input.motivo ?? null,
    p_origem_pendencia: input.origemPendencia ?? null,
    p_prazo_novo: input.prazoNovo ?? null,
    p_prazo_padrao: input.prazoPadrao ?? null,
    p_justificativa: input.justificativa ?? null,
    p_registrado_por_nome: input.registradoPorNome ?? null,
    p_checklist: input.checklist ?? null,
    p_faturas: input.faturas && input.faturas.length > 0 ? input.faturas : null,
    p_enviar_colog: input.enviarColog ?? false
  });
}

export function addPaymentDocumentRpc(input: {
  cycleKey: string;
  tipo: string;
  sei: string;
  numero?: string;
  valor?: number;
  dataRecebimento?: string;
}): Promise<{ success: boolean; document_id: string }> {
  return callRpc('add_payment_cycle_document_atomic', {
    p_cycle_key: input.cycleKey,
    p_tipo: input.tipo,
    p_sei: input.sei,
    p_numero: input.numero ?? null,
    p_valor: input.valor ?? null,
    p_data_recebimento: input.dataRecebimento ?? null
  });
}

export function removePaymentDocumentRpc(documentId: string): Promise<{ success: boolean }> {
  return callRpc('remove_payment_cycle_document_atomic', { p_document_id: documentId });
}

export function updatePaymentCycleInfoRpc(input: {
  cycleKey: string;
  responsavelNome?: string;
  responsavelUserId?: string;
  observacoes?: string;
}): Promise<RpcPaymentCycleInfoResult> {
  return callRpc<RpcPaymentCycleInfoResult>('update_payment_cycle_info_atomic', {
    p_cycle_key: input.cycleKey,
    p_responsavel_nome: input.responsavelNome ?? null,
    p_responsavel_user_id: input.responsavelUserId ?? null,
    p_observacoes: input.observacoes ?? null
  });
}

/** Exclusão definitiva (só admin): apaga o ciclo, os documentos, o histórico e o checklist. Cancelar é o caminho comum. */
export function deletePaymentCycleRpc(cycleKey: string): Promise<{ success: boolean; cycle_key: string; planos_removidos: number }> {
  const key = (cycleKey || '').trim();
  if (!key) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do ciclo (cycleKey) é obrigatória.'));
  }
  return callRpc('delete_payment_cycle_atomic', { p_cycle_key: key });
}
