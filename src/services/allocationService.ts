import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { InternalAllocation } from '../types';
import type { RpcAllocationResult, RpcEmpenhoLinkResult } from '../types/rpc';
import { executeSaveAllocationsRpc } from '../adapters/allocationRpcAdapter';
import { executeSaveEmpenhoLinksRpc } from '../adapters/empenhoLinkRpcAdapter';
import { normalizeItemKey, parseItemKey } from '../utils/itemKeyUtils';


export interface GlobalAllocationRecord {
  id: string;
  itemKey: string;
  unitName: string;
  allocatedQty: number;
  empenhadaQty: number;
}

/**
 * Normaliza internamente a chave de item para o padrão canônico
 */
function getCanonicalKey(itemKey: string): string {
  const parsed = parseItemKey(itemKey);
  return normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);
}

export async function fetchAllAllocationsGlobal(): Promise<GlobalAllocationRecord[]> {
  const records: GlobalAllocationRecord[] = [];

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('arp_allocations')
        .select('*');

      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          itemKey: d.item_key,
          unitName: d.unit_name,
          allocatedQty: Number(d.allocated_qty),
          empenhadaQty: Number(d.empenhada_qty) || 0
        }));
      }
    } catch (e) {
      console.warn('Erro ao carregar todas as alocações do Supabase', e);
    }
  }

  // Fallback para localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('saldoarp-allocations-')) {
          const itemKey = key.replace('saldoarp-allocations-', '');
          const raw = localStorage.getItem(key);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              list.forEach((a: any) => {
                records.push({
                  id: a.id,
                  itemKey,
                  unitName: a.unitName,
                  allocatedQty: Number(a.allocatedQty),
                  empenhadaQty: Number(a.empenhadaQty) || 0
                });
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('Erro ao ler alocações do localStorage', e);
    }
  }

  return records;
}

export interface ItemAllocationsState {
  allocations: InternalAllocation[];
  version: number;
}

export async function fetchAllocationsWithState(itemKey: string): Promise<ItemAllocationsState> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: allocData, error: allocError } = await supabase
        .from('arp_allocations')
        .select('*')
        .eq('item_key', canonicalKey);

      const { data: stateData } = await supabase
        .from('item_allocation_state')
        .select('version')
        .eq('item_key', canonicalKey)
        .maybeSingle();

      const version = stateData?.version ?? 1;

      if (!allocError && allocData) {
        const mapped: InternalAllocation[] = allocData.map((d: any) => ({
          id: d.id,
          unitName: d.unit_name,
          allocatedQty: Number(d.allocated_qty),
          empenhadaQty: Number(d.empenhada_qty) || 0
        }));

        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(`saldoarp-allocations-${canonicalKey}`, JSON.stringify(mapped));
            if (itemKey !== canonicalKey) {
              localStorage.setItem(`saldoarp-allocations-${itemKey}`, JSON.stringify(mapped));
            }
          } catch {}
        }

        return { allocations: mapped, version };
      }
    } catch (e) {
      console.warn('Erro ao conectar com Supabase (allocations with state), utilizando localStorage como fallback.', e);
    }
  }

  // LocalStorage Fallback (somente quando offline ou sem Supabase configurado)
  if (typeof localStorage !== 'undefined') {
    try {
      const key = `saldoarp-allocations-${canonicalKey}`;
      const stored = localStorage.getItem(key) || localStorage.getItem(`saldoarp-allocations-${itemKey}`);
      if (stored) {
        return { allocations: JSON.parse(stored), version: 1 };
      }
    } catch (e) {
      console.error('Erro no fallback do localStorage', e);
    }
  }

  return { allocations: [], version: 1 };
}

export async function fetchAllocations(itemKey: string): Promise<InternalAllocation[]> {
  const result = await fetchAllocationsWithState(itemKey);
  return result.allocations;
}

/**
 * Persiste alocações departamentais via RPC transacional canônica save_allocations_atomic
 */
export async function saveAllocations(
  itemKey: string,
  allocations: InternalAllocation[],
  expectedVersion?: number | null
): Promise<RpcAllocationResult | void> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (isSupabaseConfigured && supabase) {
    try {
      const result = await executeSaveAllocationsRpc(
        canonicalKey,
        allocations.map(a => ({
          id: a.id,
          unit_name: a.unitName,
          allocated_qty: a.allocatedQty,
          empenhada_qty: a.empenhadaQty
        })),
        expectedVersion
      );

      // Atualiza cache local após confirmação do servidor
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(`saldoarp-allocations-${canonicalKey}`, JSON.stringify(allocations));
          if (itemKey !== canonicalKey) {
            localStorage.setItem(`saldoarp-allocations-${itemKey}`, JSON.stringify(allocations));
          }
        } catch (e) {
          console.error('Erro ao salvar no localStorage', e);
        }
      }

      return result;
    } catch (e) {
      console.warn('Erro ao persistir alocações via RPC no Supabase', e);
      throw e;
    }
  } else {
    // Fallback offline puro
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`saldoarp-allocations-${canonicalKey}`, JSON.stringify(allocations));
        if (itemKey !== canonicalKey) {
          localStorage.setItem(`saldoarp-allocations-${itemKey}`, JSON.stringify(allocations));
        }
      } catch (e) {
        console.error('Erro ao salvar no localStorage', e);
      }
    }
  }
}

export interface ItemEmpenhoLinksState {
  links: Record<string, string>;
  version: number;
}

export async function fetchEmpenhoLinksWithState(itemKey: string): Promise<ItemEmpenhoLinksState> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: linkData, error: linkError } = await supabase
        .from('empenho_links')
        .select('*')
        .eq('item_key', canonicalKey);

      const { data: stateData } = await supabase
        .from('item_empenho_link_state')
        .select('version')
        .eq('item_key', canonicalKey)
        .maybeSingle();

      const version = stateData?.version ?? 1;

      if (!linkError && linkData) {
        const map: Record<string, string> = {};
        linkData.forEach((d: any) => {
          map[d.empenho_numero] = d.allocation_id;
        });

        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(`saldoarp-empenho-links-${canonicalKey}`, JSON.stringify(map));
            if (itemKey !== canonicalKey) {
              localStorage.setItem(`saldoarp-empenho-links-${itemKey}`, JSON.stringify(map));
            }
          } catch {}
        }

        return { links: map, version };
      }
    } catch (e) {
      console.warn('Erro ao carregar vínculos de empenhos do Supabase', e);
    }
  }

  // LocalStorage Fallback (somente quando offline ou sem Supabase configurado)
  if (typeof localStorage !== 'undefined') {
    try {
      const key = `saldoarp-empenho-links-${canonicalKey}`;
      const stored = localStorage.getItem(key) || localStorage.getItem(`saldoarp-empenho-links-${itemKey}`);
      if (stored) {
        return { links: JSON.parse(stored), version: 1 };
      }
    } catch (e) {
      console.error('Erro no fallback do localStorage (empenho links)', e);
    }
  }

  return { links: {}, version: 1 };
}

export async function fetchEmpenhoLinks(itemKey: string): Promise<Record<string, string>> {
  const state = await fetchEmpenhoLinksWithState(itemKey);
  return state.links;
}

export async function saveEmpenhoLinks(
  itemKey: string,
  links: Record<string, string>,
  expectedVersion: number
): Promise<RpcEmpenhoLinkResult | void> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (isSupabaseConfigured && supabase) {
    try {
      const result = await executeSaveEmpenhoLinksRpc(canonicalKey, links, expectedVersion);

      // Atualiza cache local após confirmação do servidor
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(`saldoarp-empenho-links-${canonicalKey}`, JSON.stringify(links));
          if (itemKey !== canonicalKey) {
            localStorage.setItem(`saldoarp-empenho-links-${itemKey}`, JSON.stringify(links));
          }
        } catch (e) {
          console.error('Erro ao salvar vínculos no localStorage', e);
        }
      }

      return result;
    } catch (e) {
      console.warn('Erro ao persistir vínculos via RPC no Supabase', e);
      throw e;
    }
  } else {
    // Fallback offline puro
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`saldoarp-empenho-links-${canonicalKey}`, JSON.stringify(links));
        if (itemKey !== canonicalKey) {
          localStorage.setItem(`saldoarp-empenho-links-${itemKey}`, JSON.stringify(links));
        }
      } catch (e) {
        console.error('Erro ao salvar vínculos no localStorage', e);
      }
    }
  }
}
