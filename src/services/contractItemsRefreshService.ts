import { supabase, isSupabaseConfigured } from './supabaseClient';
import { syncContractItemQuantity } from './contractItemQuantitySyncService';
import { syncItemContractEmpenhos } from './itemContractEmpenhoService';
import { parseItemKey } from '../utils/itemKeyParts';
import type { ContractDashboardRecord } from '../types';

export interface ContractItemsRefreshSummary {
  /** Itens da ata ligados ao contrato. */
  itens: number;
  /** Itens cujo refresh falhou (a quantidade ou os empenhos não puderam ser lidos). */
  falhas: Array<{ itemKey: string; motivo: string }>;
  /** Empenhos que ficaram com quantidade pendente de confirmação, somando os itens. */
  pendentes: number;
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
 * Refaz, para cada item da ata ligado ao contrato, o que o Item faz ao atualizar: a quantidade contratada
 * e os empenhos do item (com as quantidades pendentes). Um item que falha não interrompe os outros.
 * Os itens são processados um a um para não estourar o limite de requisições das APIs oficiais.
 */
export async function refreshLinkedItemsOfContract(
  contract: ContractForItemsRefresh,
  contractKey: string
): Promise<ContractItemsRefreshSummary> {
  const linked = await fetchLinkedItems(contractKey);
  const summary: ContractItemsRefreshSummary = { itens: linked.length, falhas: [], pendentes: 0 };

  for (const { itemKey, ataUnitPrice } of linked) {
    const parts = parseItemKey(itemKey);
    if (!parts) {
      summary.falhas.push({ itemKey, motivo: 'Chave de item inválida.' });
      continue;
    }
    const { numeroAta, uasg, numeroItem } = parts;
    let unitPrice = ataUnitPrice;
    try {
      const q = await syncContractItemQuantity({ numeroAta, uasg, numeroItem, contractKey, contract });
      if (q.valorUnitario) unitPrice = q.valorUnitario;
    } catch (err: any) {
      summary.falhas.push({ itemKey, motivo: err?.message || 'Quantidade contratada não sincronizada.' });
      continue;
    }
    try {
      const r = await syncItemContractEmpenhos({
        numeroAta,
        uasg,
        numeroItem,
        contract: { contractKey, uasg: contract.uasg, numero: contract.numero, ano: contract.ano, contratoId: contract.contratoId },
        unitPrice
      });
      summary.pendentes += r.pendentes;
    } catch (err: any) {
      summary.falhas.push({ itemKey, motivo: err?.message || 'Empenhos do item não sincronizados.' });
    }
  }
  return summary;
}
