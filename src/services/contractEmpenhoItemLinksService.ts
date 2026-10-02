import { supabase, isSupabaseConfigured } from './supabaseClient';

/** Ligação de um empenho do contrato com um item da ata (linha de `arp_item_empenhos`). */
export interface ContractEmpenhoItemLink {
  empenhoId: string;
  /** Número oficial do empenho (ex.: 2026NE000262). */
  numeroEmpenho: string;
  itemKey: string;
  /** Nula = quantidade ainda pendente de confirmação no item. */
  quantidade: number | null;
  fonte: 'API' | 'USUARIO' | null;
  quantidadeSugerida: number | null;
}

/** Itens da ata em que cada empenho de um contrato consome saldo. Só lê o banco. */
export async function fetchContractEmpenhoItemLinks(contractKey: string): Promise<ContractEmpenhoItemLink[]> {
  if (!isSupabaseConfigured || !supabase || !contractKey) return [];
  const { data, error } = await supabase
    .from('arp_item_empenhos')
    .select('empenho_id, item_key, quantidade_consumida, fonte_quantidade, quantidade_sugerida, empenho:empenhos(numero_oficial)')
    .eq('contract_key', contractKey);
  if (error) throw error;
  return ((data as any[]) ?? []).map((d) => ({
    empenhoId: String(d.empenho_id),
    numeroEmpenho: d.empenho?.numero_oficial ?? '',
    itemKey: d.item_key,
    quantidade: d.quantidade_consumida == null ? null : Number(d.quantidade_consumida),
    fonte: d.fonte_quantidade ?? null,
    quantidadeSugerida: d.quantidade_sugerida == null ? null : Number(d.quantidade_sugerida)
  }));
}
