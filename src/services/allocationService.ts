import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { InternalAllocation } from '../types';
import { lerTodasAsPaginas } from './lerTodasAsPaginas';
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

/**
 * Todas as alocações às unidades internas (Carteira de Itens, Alocação, Carteira de Atas e Contratos). Com o banco
 * configurado, lê só do banco, todas as páginas em ordem fixa; falha vira erro para a tela avisar e oferecer "Tentar
 * de novo". Antes a falha (ou o banco sem alocações) caía na cópia do navegador, que podia ser velha.
 */
export async function fetchAllAllocationsGlobal(): Promise<GlobalAllocationRecord[]> {
  if (isSupabaseConfigured && supabase) {
    const db = supabase;
    const data = await lerTodasAsPaginas<any>((de, ate) => db.from('arp_allocations').select('*').order('id').range(de, ate));
    return data.map((d: any) => ({
      id: d.id,
      itemKey: d.item_key,
      unitName: d.unit_name,
      allocatedQty: Number(d.allocated_qty),
      empenhadaQty: Number(d.empenhada_qty) || 0
    }));
  }

  // Sem banco configurado (desenvolvimento e testes sem Supabase): a cópia do navegador é a única fonte.
  const records: GlobalAllocationRecord[] = [];
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

/**
 * Alocações de um item e a versão delas (Item 360 e janela de alocação). Com o banco configurado, lê só do banco:
 * falha vira erro. Antes a falha devolvia a cópia do navegador com versão 1 como se fosse sucesso, e a tela podia
 * gravar por cima do que outra pessoa salvou num item que ainda estava na versão 1.
 */
export async function fetchAllocationsWithState(itemKey: string): Promise<ItemAllocationsState> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (isSupabaseConfigured && supabase) {
    // A versão vem ANTES dos dados: se alguém salvar entre as duas leituras, a versão fica velha e o banco recusa
    // (seguro). Lida depois, a tela ficaria com dados velhos e versão nova, e o próximo salvar apagaria o do outro.
    const { data: stateData, error: stateError } = await supabase
      .from('item_allocation_state')
      .select('version')
      .eq('item_key', canonicalKey)
      .maybeSingle();
    if (stateError) throw new Error(`Não foi possível ler as alocações do item: ${stateError.message}`);
    const version = stateData?.version ?? 1;

    const { data: allocData, error: allocError } = await supabase
      .from('arp_allocations')
      .select('*')
      .eq('item_key', canonicalKey);
    if (allocError) throw new Error(`Não foi possível ler as alocações do item: ${allocError.message}`);

    const mapped: InternalAllocation[] = (allocData ?? []).map((d: any) => ({
      id: d.id,
      unitName: d.unit_name,
      allocatedQty: Number(d.allocated_qty),
      empenhadaQty: Number(d.empenhada_qty) || 0
    }));

    // Cópia no navegador, só de leitura feita no banco: o relatório em Excel ainda lê as alocações dela.
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

  // Sem banco configurado (desenvolvimento e testes sem Supabase): a cópia do navegador é a única fonte.
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

/** Vínculos nota → unidade interna de um item e a versão deles. Com o banco configurado, lê só do banco: falha vira erro (ver fetchAllocationsWithState). */
export async function fetchEmpenhoLinksWithState(itemKey: string): Promise<ItemEmpenhoLinksState> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (isSupabaseConfigured && supabase) {
    // Versão antes dos dados (ver fetchAllocationsWithState).
    const { data: stateData, error: stateError } = await supabase
      .from('item_empenho_link_state')
      .select('version')
      .eq('item_key', canonicalKey)
      .maybeSingle();
    if (stateError) throw new Error(`Não foi possível ler os vínculos das notas às unidades: ${stateError.message}`);
    const version = stateData?.version ?? 1;

    const { data: linkData, error: linkError } = await supabase
      .from('empenho_links')
      .select('*')
      .eq('item_key', canonicalKey);
    if (linkError) throw new Error(`Não foi possível ler os vínculos das notas às unidades: ${linkError.message}`);

    const map: Record<string, string> = {};
    (linkData ?? []).forEach((d: any) => {
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

  // Sem banco configurado (desenvolvimento e testes sem Supabase): a cópia do navegador é a única fonte.
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
