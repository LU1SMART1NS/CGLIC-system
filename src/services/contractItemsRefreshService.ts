import { supabase, isSupabaseConfigured } from './supabaseClient';
import { syncContractItemQuantity } from './contractItemQuantitySyncService';
import { parseItemKey } from '../utils/itemKeyParts';
import type { ContractDashboardRecord } from '../types';

export interface ContractItemsRefreshSummary {
  /** Itens da ata ligados ao contrato. */
  itens: number;
  /** Itens cujo refresh falhou (a quantidade contratada não pôde ser lida). */
  falhas: Array<{ itemKey: string; motivo: string }>;
}

export type ContractForItemsRefresh = Pick<ContractDashboardRecord, 'id' | 'uasg' | 'numero' | 'ano' | 'numeroControlePncp' | 'contratoId'>;

/** Itens da ata ligados a um contrato, com o preço unitário da ata (usado só para estimar quantidade). */
async function fetchLinkedItems(contractKey: string): Promise<Array<{ itemKey: string; ataUnitPrice?: number }>> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data: links, error } = await supabase.from('arp_item_contract_links').select('item_key').eq('contract_key', contractKey);
  if (error) throw error;
  const keys = (links ?? []).map((l) => l.item_key as string);
  if (keys.length === 0) return [];

  const { data: prices } = await supabase.from('v_arp_item_saldo_detalhado').select('item_key, valor_unitario').in('item_key', keys);
  const priceByKey = new Map((prices ?? []).map((p) => [p.item_key as string, Number(p.valor_unitario) || undefined]));
  return keys.map((itemKey) => ({ itemKey, ataUnitPrice: priceByKey.get(itemKey) }));
}

/**
 * Relê, para cada item da ata ligado ao contrato, a quantidade contratada (que entra no saldo do item). O empenho do
 * item vem do vínculo das notas aos itens do contrato (migration 94), não de uma cópia por item. Um item que falha não
 * interrompe os outros; um por vez, para não estourar o limite de requisições das APIs oficiais.
 */
export async function refreshLinkedItemsOfContract(
  contract: ContractForItemsRefresh,
  contractKey: string
): Promise<ContractItemsRefreshSummary> {
  const linked = await fetchLinkedItems(contractKey);
  const summary: ContractItemsRefreshSummary = { itens: linked.length, falhas: [] };

  for (const { itemKey } of linked) {
    const parts = parseItemKey(itemKey);
    if (!parts) {
      summary.falhas.push({ itemKey, motivo: 'Chave de item inválida.' });
      continue;
    }
    const { numeroAta, uasg, numeroItem } = parts;
    try {
      await syncContractItemQuantity({ numeroAta, uasg, numeroItem, contractKey, contract });
    } catch (err: any) {
      summary.falhas.push({ itemKey, motivo: err?.message || 'Quantidade contratada não sincronizada.' });
    }
  }
  return summary;
}
