/**
 * Entregas da Fiscalização para os pagamentos (migration 305): itens acompanhados pela SFC/CGLIC, por contrato ×
 * situação × data. A_ENTREGAR (com data prevista) e ENTREGUE (na janela da regra "pagamento.avisoEntregaJanelaDias",
 * antes do envio para pagamento e sem pagamento registrado). Substitui o cadastro manual de entregas previstas.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';

export interface EntregaParaPagamento {
  contractKey: string;
  situacao: 'A_ENTREGAR' | 'ENTREGUE';
  /** A_ENTREGAR: data prevista; ENTREGUE: data da entrega registrada pelo fiscal (AAAA-MM-DD). */
  data: string;
  itens: number;
  valor: number;
  semPreco: number;
}

export async function fetchEntregasParaPagamento(contractKey: string | null, janelaDias: number): Promise<EntregaParaPagamento[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.rpc('fisc_entregas_para_pagamento', { p_contrato: contractKey, p_janela_dias: janelaDias });
  if (error) throw mapPostgresErrorToAppError(error);
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({
      contractKey: String(r.contract_key),
      situacao: r.situacao === 'ENTREGUE' ? ('ENTREGUE' as const) : ('A_ENTREGAR' as const),
      data: String(r.data),
      itens: Number(r.itens) || 0,
      valor: Number(r.valor) || 0,
      semPreco: Number(r.sem_preco) || 0
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
}
