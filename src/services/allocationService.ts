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

  // Sem banco configurado (só nos testes): não há de onde ler.
  return [];
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

    return { allocations: mapped, version };
  }

  // Sem banco configurado (só nos testes): não há de onde ler.
  return { allocations: [], version: 1 };
}

export async function fetchAllocations(itemKey: string): Promise<InternalAllocation[]> {
  const result = await fetchAllocationsWithState(itemKey);
  return result.allocations;
}

/**
 * Persiste alocações departamentais via RPC transacional canônica save_allocations_atomic. Sem banco configurado, a
 * RPC recusa com erro (não há mais cópia no navegador para gravar).
 */
export async function saveAllocations(
  itemKey: string,
  allocations: InternalAllocation[],
  expectedVersion?: number | null
): Promise<RpcAllocationResult> {
  try {
    return await executeSaveAllocationsRpc(
      getCanonicalKey(itemKey),
      allocations.map(a => ({
        id: a.id,
        unit_name: a.unitName,
        allocated_qty: a.allocatedQty,
        empenhada_qty: a.empenhadaQty
      })),
      expectedVersion
    );
  } catch (e) {
    console.warn('Erro ao persistir alocações via RPC no Supabase', e);
    throw e;
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

    return { links: map, version };
  }

  // Sem banco configurado (só nos testes): não há de onde ler.
  return { links: {}, version: 1 };
}

export async function fetchEmpenhoLinks(itemKey: string): Promise<Record<string, string>> {
  const state = await fetchEmpenhoLinksWithState(itemKey);
  return state.links;
}

/** Persiste os vínculos nota → unidade via RPC save_empenho_links_atomic. Sem banco configurado, a RPC recusa com erro. */
export async function saveEmpenhoLinks(
  itemKey: string,
  links: Record<string, string>,
  expectedVersion: number
): Promise<RpcEmpenhoLinkResult> {
  try {
    return await executeSaveEmpenhoLinksRpc(getCanonicalKey(itemKey), links, expectedVersion);
  } catch (e) {
    console.warn('Erro ao persistir vínculos via RPC no Supabase', e);
    throw e;
  }
}
