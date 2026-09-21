import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { InternalAllocation, Empenho, Contrato, ContratoEmpenho } from '../types';
import type { RpcAllocationResult, RpcContratoResult, RpcEmpenhoLinkResult, RpcManualEmpenhoResult, RpcManualQuantityResult } from '../types/rpc';
import { executeSaveAllocationsRpc } from '../adapters/allocationRpcAdapter';
import { executeSaveContratoRpc } from '../adapters/contractRpcAdapter';
import { executeSaveEmpenhoLinksRpc } from '../adapters/empenhoLinkRpcAdapter';
import { executeSaveManualEmpenhosRpc } from '../adapters/manualEmpenhoRpcAdapter';
import { executeSaveManualQuantitiesRpc } from '../adapters/manualQuantityRpcAdapter';
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


export interface ItemManualQuantitiesState {
  quantities: Record<string, number>;
  version: number;
}

export async function fetchEmpenhoManualQuantitiesWithState(itemKey: string): Promise<ItemManualQuantitiesState> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('empenho_manual_quantidades')
        .select('*')
        .eq('item_key', canonicalKey);

      const { data: stateData } = await supabase
        .from('item_manual_quantity_state')
        .select('version')
        .eq('item_key', canonicalKey)
        .maybeSingle();

      const version = stateData?.version ?? 1;

      if (!error && data) {
        const map: Record<string, number> = {};
        data.forEach((d: any) => {
          map[d.emp_key] = Number(d.quantidade);
        });

        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(`saldoarp-empenho-quantities-${canonicalKey}`, JSON.stringify(map));
            if (itemKey !== canonicalKey) {
              localStorage.setItem(`saldoarp-empenho-quantities-${itemKey}`, JSON.stringify(map));
            }
          } catch {}
        }

        return { quantities: map, version };
      }
    } catch (e) {
      console.warn('Erro ao carregar quantidades manuais de empenhos do Supabase', e);
    }
  }

  // LocalStorage Fallback
  if (typeof localStorage !== 'undefined') {
    try {
      const key = `saldoarp-empenho-quantities-${canonicalKey}`;
      const stored = localStorage.getItem(key) || localStorage.getItem(`saldoarp-empenho-quantities-${itemKey}`);
      if (stored) {
        return { quantities: JSON.parse(stored), version: 1 };
      }
    } catch (e) {
      console.error('Erro ao ler quantidades manuais de empenhos no localStorage', e);
    }
  }
  return { quantities: {}, version: 1 };
}

export async function fetchEmpenhoManualQuantities(itemKey: string): Promise<Record<string, number>> {
  const result = await fetchEmpenhoManualQuantitiesWithState(itemKey);
  return result.quantities;
}

export async function saveEmpenhoManualQuantities(
  itemKey: string,
  quantities: Record<string, number>,
  expectedVersion: number
): Promise<RpcManualQuantityResult | void> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (isSupabaseConfigured && supabase) {
    try {
      const result = await executeSaveManualQuantitiesRpc(canonicalKey, quantities, expectedVersion);

      // Atualiza cache local estritamente após confirmação do PostgreSQL
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(`saldoarp-empenho-quantities-${canonicalKey}`, JSON.stringify(quantities));
          if (itemKey !== canonicalKey) {
            localStorage.setItem(`saldoarp-empenho-quantities-${itemKey}`, JSON.stringify(quantities));
          }
        } catch (e) {
          console.error('Erro ao salvar quantidades manuais de empenhos no localStorage', e);
        }
      }

      return result;
    } catch (e) {
      console.warn('Erro ao persistir quantidades manuais de empenhos via RPC no Supabase', e);
      throw e;
    }
  } else {
    // Fallback offline puro
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`saldoarp-empenho-quantities-${canonicalKey}`, JSON.stringify(quantities));
        if (itemKey !== canonicalKey) {
          localStorage.setItem(`saldoarp-empenho-quantities-${itemKey}`, JSON.stringify(quantities));
        }
      } catch (e) {
        console.error('Erro ao salvar quantidades manuais de empenhos no localStorage', e);
      }
    }
  }
}

export async function removeEmpenhoManualQuantity(
  itemKey: string,
  empKey: string,
  expectedVersion: number
): Promise<RpcManualQuantityResult | void> {
  const canonicalKey = getCanonicalKey(itemKey);
  const current = await fetchEmpenhoManualQuantities(canonicalKey);
  const updated = { ...current };
  delete updated[empKey];

  return saveEmpenhoManualQuantities(canonicalKey, updated, expectedVersion);
}

// -------------------------------------------------------------
// Persistência de Empenhos Manuais Canônicos
// -------------------------------------------------------------
export interface ItemManualEmpenhosState {
  empenhos: Empenho[];
  version: number;
}

export async function fetchManualEmpenhosWithState(itemKey: string): Promise<ItemManualEmpenhosState> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('empenhos_manuais')
        .select('*')
        .eq('item_key', canonicalKey);

      const { data: stateData } = await supabase
        .from('item_manual_empenho_state')
        .select('version')
        .eq('item_key', canonicalKey)
        .maybeSingle();

      const version = stateData?.version ?? 1;

      if (!error && data) {
        const mapped: Empenho[] = data.map((d: any) => ({
          id: d.id,
          numero: d.numero,
          ano: Number(d.ano),
          arpId: d.arp_id,
          itemId: d.item_id,
          uasg: d.uasg,
          quantidade: Number(d.quantidade),
          valorUnitario: d.valor_unitario !== null && d.valor_unitario !== undefined ? Number(d.valor_unitario) : undefined,
          valorTotal: d.valor_total !== null && d.valor_total !== undefined ? Number(d.valor_total) : undefined,
          data: d.data || undefined,
          fornecedor: d.fornecedor || undefined,
          cnpjFornecedor: d.cnpj_fornecedor || undefined,
          unidadeInternaId: d.unidade_interna_id || undefined,
          observacao: d.observacao || undefined,
          origem: d.origem || 'MANUAL',
          status: d.status || 'CONFIRMADO',
          criadoEm: d.criado_em || new Date().toISOString(),
          atualizadoEm: d.atualizado_em || new Date().toISOString()
        }));

        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(`saldoarp-manual-empenhos-${canonicalKey}`, JSON.stringify(mapped));
            if (itemKey !== canonicalKey) {
              localStorage.setItem(`saldoarp-manual-empenhos-${itemKey}`, JSON.stringify(mapped));
            }
          } catch {}
        }

        return { empenhos: mapped, version };
      }
    } catch (e) {
      console.warn('Erro ao ler empenhos manuais do Supabase', e);
    }
  }

  // LocalStorage Fallback
  if (typeof localStorage !== 'undefined') {
    try {
      const key = `saldoarp-manual-empenhos-${canonicalKey}`;
      const stored = localStorage.getItem(key) || localStorage.getItem(`saldoarp-manual-empenhos-${itemKey}`);
      if (stored) {
        return { empenhos: JSON.parse(stored), version: 1 };
      }
    } catch (e) {
      console.error('Erro ao ler empenhos manuais do localStorage', e);
    }
  }
  return { empenhos: [], version: 1 };
}

export async function fetchManualEmpenhos(itemKey: string): Promise<Empenho[]> {
  const result = await fetchManualEmpenhosWithState(itemKey);
  return result.empenhos;
}

export async function saveManualEmpenhos(
  itemKey: string,
  empenhos: Empenho[],
  expectedVersion: number
): Promise<RpcManualEmpenhoResult | void> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (isSupabaseConfigured && supabase) {
    try {
      const result = await executeSaveManualEmpenhosRpc(canonicalKey, empenhos, expectedVersion);

      // Atualiza cache local estritamente após confirmação do PostgreSQL
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(`saldoarp-manual-empenhos-${canonicalKey}`, JSON.stringify(empenhos));
          if (itemKey !== canonicalKey) {
            localStorage.setItem(`saldoarp-manual-empenhos-${itemKey}`, JSON.stringify(empenhos));
          }
        } catch (e) {
          console.error('Erro ao salvar empenhos manuais no localStorage', e);
        }
      }

      return result;
    } catch (e) {
      console.warn('Erro ao persistir empenhos manuais via RPC no Supabase', e);
      throw e;
    }
  } else {
    // Fallback offline puro
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`saldoarp-manual-empenhos-${canonicalKey}`, JSON.stringify(empenhos));
        if (itemKey !== canonicalKey) {
          localStorage.setItem(`saldoarp-manual-empenhos-${itemKey}`, JSON.stringify(empenhos));
        }
      } catch (e) {
        console.error('Erro ao salvar empenhos manuais no localStorage', e);
      }
    }
  }
}

// -------------------------------------------------------------
// Persistência de Contratos Manuais Canônicos via RPC
// -------------------------------------------------------------
export async function fetchManualContratos(itemKey: string): Promise<Contrato[]> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('contratos_manuais')
        .select('*')
        .eq('item_key', canonicalKey);

      if (!error && data) {
        const mapped: Contrato[] = data.map((d: any) => ({
          id: d.id,
          numero: d.numero,
          ano: Number(d.ano),
          arpId: d.arp_id,
          itemId: d.item_id || undefined,
          uasg: d.uasg,
          numeroControlePncp: d.numero_controle_pncp || undefined,
          linkPncp: d.link_pncp || undefined,
          fornecedor: d.fornecedor || undefined,
          cnpjFornecedor: d.cnpj_fornecedor || undefined,
          objeto: d.objeto || undefined,
          quantidadeContratada: d.quantidade_contratada !== null && d.quantidade_contratada !== undefined ? Number(d.quantidade_contratada) : undefined,
          valorTotal: d.valor_total !== null && d.valor_total !== undefined ? Number(d.valor_total) : undefined,
          origem: d.origem || 'MANUAL',
          criadoEm: d.criado_em || new Date().toISOString(),
          atualizadoEm: d.atualizado_em || new Date().toISOString()
        }));

        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(`saldoarp-manual-contratos-${canonicalKey}`, JSON.stringify(mapped));
            if (itemKey !== canonicalKey) {
              localStorage.setItem(`saldoarp-manual-contratos-${itemKey}`, JSON.stringify(mapped));
            }
          } catch {}
        }

        return mapped;
      }
    } catch (e) {
      console.warn('Erro ao ler contratos manuais do Supabase', e);
    }
  }

  // LocalStorage Fallback
  if (typeof localStorage !== 'undefined') {
    try {
      const key = `saldoarp-manual-contratos-${canonicalKey}`;
      const stored = localStorage.getItem(key) || localStorage.getItem(`saldoarp-manual-contratos-${itemKey}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Erro ao ler contratos manuais do localStorage', e);
    }
  }
  return [];
}

/**
 * Salva um Contrato Manual e seus vínculos de empenhos via RPC transacional save_manual_contrato_atomic
 */
export async function saveManualContratoWithEmpenhos(
  contrato: Contrato,
  empenhoIds: string[]
): Promise<RpcContratoResult | void> {
  const rawItemKey = contrato.arpId ? `${contrato.arpId}-${contrato.uasg}-${contrato.itemId || '00001'}` : '';
  const canonicalKey = getCanonicalKey(rawItemKey);

  if (isSupabaseConfigured && supabase) {
    try {
      const result = await executeSaveContratoRpc({
        contrato: {
          id: contrato.id,
          item_key: canonicalKey,
          numero: contrato.numero,
          ano: contrato.ano,
          arp_id: contrato.arpId,
          item_id: contrato.itemId,
          uasg: contrato.uasg,
          numero_controle_pncp: contrato.numeroControlePncp,
          link_pncp: contrato.linkPncp,
          fornecedor: contrato.fornecedor,
          cnpj_fornecedor: contrato.cnpjFornecedor,
          objeto: contrato.objeto,
          quantidade_contratada: contrato.quantidadeContratada,
          valor_total: contrato.valorTotal,
          origem: contrato.origem || 'MANUAL'
        },
        empenhoIds
      });

      // Atualiza LocalStorage estritamente após confirmação atômica do PostgreSQL
      if (typeof localStorage !== 'undefined') {
        try {
          const key = `saldoarp-manual-contratos-${canonicalKey}`;
          const current = await fetchManualContratos(canonicalKey);
          const assignedId = result?.contrato_id || contrato.id;
          const index = current.findIndex(c => c.numero === contrato.numero && c.ano === contrato.ano);
          const updatedContract: Contrato = { ...contrato, id: assignedId };
          const updatedList = index >= 0
            ? current.map((c, i) => (i === index ? updatedContract : c))
            : [...current, updatedContract];
          localStorage.setItem(key, JSON.stringify(updatedList));
          if (rawItemKey && rawItemKey !== canonicalKey) {
            localStorage.setItem(`saldoarp-manual-contratos-${rawItemKey}`, JSON.stringify(updatedList));
          }

          // Atualiza vínculos locais de forma consistente
          const linksKey = `saldoarp-contrato-empenho-links-${canonicalKey}`;
          const currentLinks = await fetchContratoEmpenhoLinks(canonicalKey);
          const otherLinks = currentLinks.filter(l => l.contratoId !== assignedId);
          const newLinks: ContratoEmpenho[] = empenhoIds.map(empId => ({
            id: `link-${assignedId}-${empId}`,
            contratoId: assignedId,
            empenhoId: empId,
            dataVinculo: new Date().toISOString(),
            origem: 'MANUAL'
          }));
          const updatedLinks = [...otherLinks, ...newLinks];
          localStorage.setItem(linksKey, JSON.stringify(updatedLinks));
          if (rawItemKey && rawItemKey !== canonicalKey) {
            localStorage.setItem(`saldoarp-contrato-empenho-links-${rawItemKey}`, JSON.stringify(updatedLinks));
          }
        } catch (e) {
          console.error('Erro ao salvar contrato no localStorage', e);
        }
      }

      return result;
    } catch (e) {
      console.warn('Erro ao salvar contrato via RPC no Supabase', e);
      throw e;
    }
  } else {
    // Fallback offline puro
    if (typeof localStorage !== 'undefined') {
      try {
        const key = `saldoarp-manual-contratos-${canonicalKey}`;
        const current = await fetchManualContratos(canonicalKey);
        const index = current.findIndex(c => c.numero === contrato.numero && c.ano === contrato.ano);
        const updatedList = index >= 0 ? current.map((c, i) => (i === index ? contrato : c)) : [...current, contrato];
        localStorage.setItem(key, JSON.stringify(updatedList));
        if (rawItemKey && rawItemKey !== canonicalKey) {
          localStorage.setItem(`saldoarp-manual-contratos-${rawItemKey}`, JSON.stringify(updatedList));
        }

        const linksKey = `saldoarp-contrato-empenho-links-${canonicalKey}`;
        const currentLinks = await fetchContratoEmpenhoLinks(canonicalKey);
        const otherLinks = currentLinks.filter(l => l.contratoId !== contrato.id);
        const newLinks: ContratoEmpenho[] = empenhoIds.map(empId => ({
          id: `link-${contrato.id}-${empId}`,
          contratoId: contrato.id,
          empenhoId: empId,
          dataVinculo: new Date().toISOString(),
          origem: 'MANUAL'
        }));
        const updatedLinks = [...otherLinks, ...newLinks];
        localStorage.setItem(linksKey, JSON.stringify(updatedLinks));
        if (rawItemKey && rawItemKey !== canonicalKey) {
          localStorage.setItem(`saldoarp-contrato-empenho-links-${rawItemKey}`, JSON.stringify(updatedLinks));
        }
      } catch (e) {
        console.error('Erro ao salvar contrato no localStorage', e);
      }
    }
  }
}

/**
 * @deprecated Função legada mantida para compatibilidade com rotinas locais e testes.
 * A persistência canônica de contratos é realizada atômica e conjuntamente com os vínculos via saveManualContratoWithEmpenhos.
 */
export async function saveManualContratos(itemKey: string, contratos: Contrato[]): Promise<void> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(`saldoarp-manual-contratos-${canonicalKey}`, JSON.stringify(contratos));
      if (itemKey !== canonicalKey) {
        localStorage.setItem(`saldoarp-manual-contratos-${itemKey}`, JSON.stringify(contratos));
      }
    } catch (e) {
      console.error('Erro ao salvar contratos manuais no localStorage', e);
    }
  }
}

// -------------------------------------------------------------
// Persistência de Relacionamentos Contrato-Empenho
// -------------------------------------------------------------
export async function fetchContratoEmpenhoLinks(itemKey: string): Promise<ContratoEmpenho[]> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('contrato_empenho_links')
        .select('*')
        .eq('item_key', canonicalKey);

      if (!error && data) {
        const mapped: ContratoEmpenho[] = data.map((d: any) => ({
          id: d.id,
          contratoId: d.contrato_id,
          empenhoId: d.empenho_id,
          quantidadeVinculada: d.quantidade_vinculada !== null && d.quantidade_vinculada !== undefined ? Number(d.quantidade_vinculada) : undefined,
          dataVinculo: d.data_vinculo || new Date().toISOString(),
          origem: d.origem || 'MANUAL'
        }));

        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(`saldoarp-contrato-empenho-links-${canonicalKey}`, JSON.stringify(mapped));
            if (itemKey !== canonicalKey) {
              localStorage.setItem(`saldoarp-contrato-empenho-links-${itemKey}`, JSON.stringify(mapped));
            }
          } catch {}
        }

        return mapped;
      }
    } catch (e) {
      console.warn('Erro ao ler links contrato-empenho do Supabase', e);
    }
  }

  // LocalStorage Fallback
  if (typeof localStorage !== 'undefined') {
    try {
      const key = `saldoarp-contrato-empenho-links-${canonicalKey}`;
      const stored = localStorage.getItem(key) || localStorage.getItem(`saldoarp-contrato-empenho-links-${itemKey}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Erro ao ler links contrato-empenho do localStorage', e);
    }
  }
  return [];
}

/**
 * @deprecated Escrita direta PostgREST eliminada do fluxo produtivo em conformidade com RLS.
 * A persistência canônica de vínculos contrato-empenho é realizada atomicamente pela RPC save_manual_contrato_atomic via saveManualContratoWithEmpenhos.
 */
export async function saveContratoEmpenhoLinks(itemKey: string, links: ContratoEmpenho[]): Promise<void> {
  const canonicalKey = getCanonicalKey(itemKey);

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(`saldoarp-contrato-empenho-links-${canonicalKey}`, JSON.stringify(links));
      if (itemKey !== canonicalKey) {
        localStorage.setItem(`saldoarp-contrato-empenho-links-${itemKey}`, JSON.stringify(links));
      }
    } catch (e) {
      console.error('Erro ao salvar links contrato-empenho no localStorage', e);
    }
  }
}
