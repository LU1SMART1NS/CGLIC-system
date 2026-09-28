/**
 * Adapter RPC — Ciclo Operacional de Pagamentos/CGOFI (Fase 10-A.2)
 *
 * Substitui a persistência em localStorage (useContractPaymentFollowUp.ts)
 * por leitura/escrita real em contract_payment_cycles via Supabase/RPCs
 * (create_payment_cycle_atomic, update_payment_cycle_atomic — migration
 * 20260927000022_contract_payment_cycles.sql).
 */
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { mapPostgresErrorToAppError } from './rpcErrorAdapter';
import type {
  RpcContractPaymentCycleRow,
  RpcCreatePaymentCycleResult,
  RpcUpdatePaymentCycleResult
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

export interface CreatePaymentCycleInput {
  contractKey: string;
  competencia: string;
  documentoAtestoSei: string;
  dataAssinaturaAtesto: string;
  dataVencimentoFatura: string;
  valorAtesto: number;
  empenhoCanonicalKey?: string;
  numeroProcessoPagamentoSei?: string;
  numeroProcessoContratoSei?: string;
  numeroNotasFiscais?: number;
  titularNome?: string;
  responsavelNome?: string;
  responsavelUserId?: string;
  observacoes?: string;
  applyTaskTemplate?: boolean;
}

export async function createPaymentCycleRpc(input: CreatePaymentCycleInput): Promise<RpcCreatePaymentCycleResult> {
  const client = requireSupabase();

  try {
    const { data, error } = await client.rpc('create_payment_cycle_atomic', {
      p_contract_key: input.contractKey,
      p_competencia: input.competencia,
      p_documento_atesto_sei: input.documentoAtestoSei,
      p_data_assinatura_atesto: input.dataAssinaturaAtesto,
      p_data_vencimento_fatura: input.dataVencimentoFatura,
      p_valor_atesto: input.valorAtesto,
      p_empenho_canonical_key: input.empenhoCanonicalKey ?? null,
      p_numero_processo_pagamento_sei: input.numeroProcessoPagamentoSei ?? null,
      p_numero_processo_contrato_sei: input.numeroProcessoContratoSei ?? null,
      p_numero_notas_fiscais: input.numeroNotasFiscais ?? null,
      p_titular_nome: input.titularNome ?? null,
      p_responsavel_nome: input.responsavelNome ?? null,
      p_responsavel_user_id: input.responsavelUserId ?? null,
      p_observacoes: input.observacoes ?? null,
      p_apply_task_template: input.applyTaskTemplate ?? true
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC create_payment_cycle_atomic'));
    }
    return data as RpcCreatePaymentCycleResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export interface UpdatePaymentCycleInput {
  cycleKey: string;
  status?: string;
  documentoDespachoSei?: string;
  dataEnvioCgofi?: string;
  numeroOrdemBancaria?: string;
  dataOrdemBancaria?: string;
  responsavelNome?: string;
  responsavelUserId?: string;
  observacoes?: string;
  concluidoPor?: string;
}

export async function updatePaymentCycleRpc(input: UpdatePaymentCycleInput): Promise<RpcUpdatePaymentCycleResult> {
  const client = requireSupabase();

  const cleanCycleKey = (input.cycleKey || '').trim();
  if (!cleanCycleKey) {
    throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: A chave do ciclo (cycleKey) é obrigatória.'));
  }

  try {
    const { data, error } = await client.rpc('update_payment_cycle_atomic', {
      p_cycle_key: cleanCycleKey,
      p_status: input.status ?? null,
      p_documento_despacho_sei: input.documentoDespachoSei ?? null,
      p_data_envio_cgofi: input.dataEnvioCgofi ?? null,
      p_numero_ordem_bancaria: input.numeroOrdemBancaria ?? null,
      p_data_ordem_bancaria: input.dataOrdemBancaria ?? null,
      p_responsavel_nome: input.responsavelNome ?? null,
      p_responsavel_user_id: input.responsavelUserId ?? null,
      p_observacoes: input.observacoes ?? null,
      p_concluido_por: input.concluidoPor ?? null
    });

    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Resposta inválida da RPC update_payment_cycle_atomic'));
    }
    return data as RpcUpdatePaymentCycleResult;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

/**
 * "Exclusão" de um ciclo = cancelamento (status CANCELADO), nunca DELETE físico.
 * Ciclos de pagamento são registros operacionais auditáveis — não há RPC de
 * exclusão física, consistente com o tratamento dado a fatos operacionais
 * em todo o restante do sistema (contract_tasks também nunca é hard-deletado
 * pela UI).
 */
export async function cancelPaymentCycleRpc(cycleKey: string, concluidoPor?: string): Promise<RpcUpdatePaymentCycleResult> {
  return updatePaymentCycleRpc({ cycleKey, status: 'CANCELADO', concluidoPor });
}
