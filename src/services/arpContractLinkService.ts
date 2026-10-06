import { supabase, isSupabaseConfigured } from './supabaseClient';
import type {
  ArpItemContractLink,
  LinkContractToItemParams,
  LinkContractToItemsParams,
  EnrichedArpItemContract,
  ArpItemContractDismissal,
  DismissContractSuggestionParams
} from '../types/arpContractLinks';
import type { ContractDashboardRecord } from '../types';
import {
  linkContractToItemRpc,
  linkContractToItemsRpc,
  unlinkContractFromItemRpc,
  dismissContractSuggestionRpc,
  restoreContractSuggestionRpc
} from '../adapters/arpContractLinkRpcAdapter';
import { displayContractNumber, formatContractKey } from '../utils/contractNumber';

/**
 * Consulta os vínculos de um item de ARP com contratos oficiais diretamente da SSOT (PostgreSQL).
 * FASE 6.2-C: Persistência exclusiva no PostgreSQL. Zero fallback offline em localStorage.
 */
export async function fetchArpItemContractLinks(itemKey: string): Promise<ArpItemContractLink[]> {
  const cleanItemKey = (itemKey || '').trim();
  if (!cleanItemKey) return [];

  if (!isSupabaseConfigured || !supabase) {
    throw new Error('CONFIG_ERROR: Supabase não está configurado.');
  }

  // Limpeza defensiva de eventuais resíduos legados de localStorage da fase anterior
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(`saldoarp-arp-item-contract-links-${cleanItemKey}`);
    } catch {}
  }

  const { data: linksData, error: linksError } = await supabase
    .from('arp_item_contract_links')
    .select('*')
    .eq('item_key', cleanItemKey)
    .order('created_at', { ascending: true });

  if (linksError) {
    console.error('Erro ao consultar vínculos de contrato no PostgreSQL:', linksError);
    throw linksError;
  }

  if (!linksData || !Array.isArray(linksData)) {
    return [];
  }

  return linksData.map((d: any) => ({
    id: String(d.id),
    itemKey: d.item_key,
    contractKey: d.contract_key,
    observacoes: d.observacoes || undefined,
    quantidadeContratadaApi: d.quantidade_contratada_api == null ? null : Number(d.quantidade_contratada_api),
    valorUnitarioApi: d.valor_unitario_api == null ? null : Number(d.valor_unitario_api),
    quantidadeLidaEm: d.quantidade_lida_em || undefined,
    createdAt: d.created_at,
    updatedAt: d.updated_at
  }));
}

/**
 * Cria ou atualiza o vínculo de um contrato oficial com o item da ARP de forma atômica no PostgreSQL.
 * FASE 6.2-C: Zero mockId, zero localStorage. Falha de rede propaga erro explícito.
 */
export async function saveArpItemContractLink(
  params: LinkContractToItemParams
): Promise<ArpItemContractLink> {
  const cleanItemKey = (params.itemKey || '').trim();
  const cleanContractKey = (params.contractKey || '').trim();

  if (!cleanItemKey) throw new Error('A chave do item da ata é obrigatória.');
  if (!cleanContractKey) throw new Error('A chave canônica do contrato oficial é obrigatória.');

  const res = await linkContractToItemRpc(params);

  return {
    id: res.id,
    itemKey: res.item_key,
    contractKey: res.contract_key,
    observacoes: params.observacoes,
    updatedAt: res.timestamp
  };
}

/**
 * Vincula um mesmo contrato oficial a vários itens da ARP numa única transação.
 * Retorna quantos itens foram vinculados.
 */
export async function saveArpContractItemLinks(params: LinkContractToItemsParams): Promise<number> {
  if (!(params.contractKey || '').trim()) throw new Error('A chave canônica do contrato oficial é obrigatória.');
  if (!params.itemKeys || params.itemKeys.length === 0) throw new Error('Selecione ao menos um item para vincular.');

  const res = await linkContractToItemsRpc(params);
  return res.count;
}

/**
 * Remove o vínculo de um contrato oficial com o item da ARP de forma atômica no PostgreSQL.
 * FASE 6.2-C: Operação estrita na SSOT.
 */
export async function deleteArpItemContractLink(linkId: string, itemKey?: string): Promise<void> {
  const cleanId = (linkId || '').trim();
  if (!cleanId) throw new Error('O identificador do vínculo é obrigatório.');

  await unlinkContractFromItemRpc(cleanId);

  // Limpeza defensiva de eventuais resíduos legados
  if (itemKey && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(`saldoarp-arp-item-contract-links-${itemKey.trim()}`);
    } catch {}
  }
}

/**
 * Consulta as sugestões de contrato descartadas para um item de ARP.
 */
export async function fetchDismissedContractSuggestions(itemKey: string): Promise<ArpItemContractDismissal[]> {
  const cleanItemKey = (itemKey || '').trim();
  if (!cleanItemKey) return [];

  if (!isSupabaseConfigured || !supabase) {
    throw new Error('CONFIG_ERROR: Supabase não está configurado.');
  }

  const { data, error } = await supabase
    .from('arp_item_contract_dismissals')
    .select('item_key, contract_key, dismissed_at')
    .eq('item_key', cleanItemKey)
    .order('dismissed_at', { ascending: true });

  if (error) {
    console.error('Erro ao consultar sugestões descartadas:', error);
    throw error;
  }

  return (data || []).map((d: any) => ({
    itemKey: d.item_key,
    contractKey: d.contract_key,
    dismissedAt: d.dismissed_at
  }));
}

/** Descarta a sugestão de um contrato para o item (idempotente). */
export async function dismissContractSuggestion(params: DismissContractSuggestionParams): Promise<void> {
  await dismissContractSuggestionRpc(params);
}

/** Restaura uma sugestão descartada, fazendo-a voltar a ser sugerida. */
export async function restoreContractSuggestion(params: DismissContractSuggestionParams): Promise<void> {
  await restoreContractSuggestionRpc(params);
}

/**
 * Extrai o número da Ata (ex. "00037/2026") do item_key de um vínculo
 * (formato "{numeroAta}-{uasg}-{numeroItem}", validado em
 * link_contract_to_item_atomic, migration 20260924000015). Retorna null se o
 * item_key não seguir o formato esperado.
 */
export function extractAtaKeyFromItemKey(itemKey: string): string | null {
  const match = /^(\d{5}\/\d{4})-\d{6}-\d{5}$/.exec((itemKey || '').trim());
  return match ? match[1] : null;
}

export interface ArpItemContractLinkPair {
  ataKey: string;
  contractKey: string;
}

/**
 * Busca TODOS os vínculos item↔contrato (sem filtro por item), já reduzidos
 * ao par {ataKey, contractKey} — usado só para resolver o escopo de acesso do
 * perfil "gestor" (useAssignedManagementScope): "de qual(is) Ata(s) este
 * contrato faz parte" e vice-versa. Vínculos com item_key fora do formato
 * esperado são ignorados silenciosamente (não têm Ata resolvível).
 */
export async function fetchAllArpItemContractLinks(): Promise<ArpItemContractLinkPair[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('arp_item_contract_links')
      .select('item_key, contract_key');

    if (error) throw error;
    if (!data || !Array.isArray(data)) return [];

    const pairs: ArpItemContractLinkPair[] = [];
    for (const row of data) {
      const ataKey = extractAtaKeyFromItemKey(row.item_key);
      if (ataKey && row.contract_key) {
        pairs.push({ ataKey, contractKey: row.contract_key });
      }
    }
    return pairs;
  } catch (err) {
    console.warn('Erro ao carregar vínculos item↔contrato', err);
    return [];
  }
}

/**
 * Busca todos os vínculos item↔contrato de UMA Ata específica (todos os itens
 * cujo item_key começa com "{numeroAta}-{uasg}-"), já no formato completo
 * `ArpItemContractLink[]` pronto para `enrichContractLinks`. Usado pela Ata 360
 * para listar os contratos vinculados a qualquer item da Ata.
 */
export async function fetchArpItemContractLinksByAta(numeroAta: string, uasg: string): Promise<ArpItemContractLink[]> {
  const cleanAta = (numeroAta || '').trim();
  const cleanUasg = (uasg || '').trim();
  if (!cleanAta || !cleanUasg || !isSupabaseConfigured || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('arp_item_contract_links')
      .select('*')
      .like('item_key', `${cleanAta}-${cleanUasg}-%`)
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!data || !Array.isArray(data)) return [];

    return data.map((d: any) => ({
      id: String(d.id),
      itemKey: d.item_key,
      contractKey: d.contract_key,
      observacoes: d.observacoes || undefined,
      quantidadeContratadaApi: d.quantidade_contratada_api == null ? null : Number(d.quantidade_contratada_api),
      valorUnitarioApi: d.valor_unitario_api == null ? null : Number(d.valor_unitario_api),
      quantidadeLidaEm: d.quantidade_lida_em || undefined,
      createdAt: d.created_at,
      updatedAt: d.updated_at
    }));
  } catch (err) {
    console.warn('Erro ao carregar contratos vinculados à Ata', err);
    return [];
  }
}

/**
 * Função Pura: Enriquece os vínculos contextuais com os dados soberanos do catálogo
 * oficial de contratos do CGLIC (sem duplicar nenhuma regra ou fazer chamada de rede).
 */
export function enrichContractLinks(
  links: ArpItemContractLink[],
  officialContracts: ContractDashboardRecord[],
  /** Quantidade do item em cada contrato (API oficial), por chave de contrato em maiúsculas. */
  quantidades?: ReadonlyMap<string, number>
): EnrichedArpItemContract[] {
  if (!links || links.length === 0) return [];

  const contractMap = new Map<string, ContractDashboardRecord>();
  (officialContracts || []).forEach(c => {
    if (c.id) contractMap.set(c.id.toUpperCase(), c);
    // Variação por chave de gestão defensiva
    const altKey = `${c.uasg}-${c.numero}-${c.ano}`.toUpperCase();
    contractMap.set(altKey, c);
  });

  return links.map(link => {
    const targetKey = link.contractKey.toUpperCase();
    const contract = contractMap.get(targetKey);
    const parts = link.contractKey.split('-');
    const uasg = contract?.uasg || (parts.length >= 1 ? parts[0] : '');
    const orgaoNome = contract?.nomeOrgao || contract?.nomeUnidadeGestora || (uasg ? `UASG ${uasg}` : 'Órgão Não Informado');

    if (contract) {
      return {
        linkId: link.id,
        itemKey: link.itemKey,
        contractKey: link.contractKey,
        quantidadeContratada: quantidades?.get(link.contractKey.toUpperCase()) ?? link.quantidadeContratadaApi ?? undefined,
        quantidadeLidaEm: link.quantidadeLidaEm,
        valorUnitarioContrato: link.valorUnitarioApi ?? undefined,
        observacoes: link.observacoes,
        contract,
        numeroContratoFormatado: displayContractNumber(contract) || `${contract.numero}/${contract.ano}`,
        uasg,
        orgaoNome,
        fornecedorNome: contract.fornecedorNome || 'Não informado',
        fornecedorCnpjCpf: contract.fornecedorCnpjCpf || '',
        fornecedorCnpj: contract.fornecedorCnpjCpf || '',
        dataVigenciaFim: contract.dataVigenciaFim,
        statusVigencia: contract.statusVigencia,
        valorGlobal: contract.valorGlobal || contract.valorInicial,
        numeroControlePncp: contract.numeroControlePncp,
        linkPncp: contract.linkPncp,
        objeto: contract.objeto,
        isOficial: true
      };
    }

    // Caso o contrato oficial ainda não tenha sido sincronizado ou pertença a outra UG
    const numeroDisplay = formatContractKey(link.contractKey);

    return {
      linkId: link.id,
      itemKey: link.itemKey,
      contractKey: link.contractKey,
      quantidadeContratada: quantidades?.get(link.contractKey.toUpperCase()) ?? link.quantidadeContratadaApi ?? undefined,
        quantidadeLidaEm: link.quantidadeLidaEm,
        valorUnitarioContrato: link.valorUnitarioApi ?? undefined,
      observacoes: link.observacoes,
      numeroContratoFormatado: numeroDisplay,
      uasg,
      orgaoNome,
      fornecedorNome: 'Contrato Oficial (Aguardando sincronização da UG)',
      fornecedorCnpjCpf: '',
      fornecedorCnpj: '',
      isOficial: false
    };
  });
}
