/**
 * Preenche em lote o quantitativo SENASP dos itens que ainda usam o homologado da ata como base.
 * A tela do Item/Ata grava um item de cada vez ao abrir; os painéis só enxergam o que já está gravado.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { syncItemSenaspQuantity } from './itemSenaspSyncService';

export interface PendingSenaspItem {
  numeroAta: string;
  uasg: string;
  numeroItem: string;
}

export interface ItemSenaspBatchSummary {
  pendentes: number;
  gravados: number;
  semUnidadeSenasp: number;
  falhas: number;
}

// Poucas leituras em paralelo: respeita o limite de requisições da API oficial.
const CONCURRENCY = 3;

export function toPendingItems(rows: Array<{ numero_ata?: string | null; codigo_uasg?: string | null; numero_item?: string | number | null }>): PendingSenaspItem[] {
  const seen = new Set<string>();
  const out: PendingSenaspItem[] = [];
  for (const r of rows) {
    if (!r.numero_ata || !r.codigo_uasg || r.numero_item == null) continue;
    const item = { numeroAta: String(r.numero_ata), uasg: String(r.codigo_uasg), numeroItem: String(r.numero_item) };
    const key = `${item.numeroAta}|${item.uasg}|${item.numeroItem}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function syncAllPendingItemSenasp(): Promise<ItemSenaspBatchSummary> {
  const summary: ItemSenaspBatchSummary = { pendentes: 0, gravados: 0, semUnidadeSenasp: 0, falhas: 0 };
  if (!isSupabaseConfigured || !supabase) return summary;

  // item_ata_id preenchido = item existe na tabela de itens (a RPC só grava nesses).
  const { data, error } = await supabase
    .from('v_arp_item_saldo_detalhado')
    .select('numero_ata, codigo_uasg, numero_item')
    .is('quantidade_senasp', null)
    .not('item_ata_id', 'is', null);
  if (error) throw error;

  const pending = toPendingItems(data ?? []);
  summary.pendentes = pending.length;

  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      const item = pending[next++];
      try {
        const r = await syncItemSenaspQuantity(item);
        if (r.quantidade == null) summary.semUnidadeSenasp++;
        else summary.gravados++;
      } catch {
        summary.falhas++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  return summary;
}
