import { supabase, isSupabaseConfigured } from './supabaseClient';
import type {
  ArpItemContractLink,
  LinkContractToItemParams,
  EnrichedArpItemContract
} from '../types/arpContractLinks';
import type { ContractDashboardRecord } from '../types';
import {
  linkContractToItemRpc,
  unlinkContractFromItemRpc
} from '../adapters/arpContractLinkRpcAdapter';

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
    quantidadeContratada: Number(d.quantidade_contratada) || 0,
    observacoes: d.observacoes || undefined,
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
  if (params.quantidadeContratada <= 0) {
    throw new Error('A quantidade contratada deve ser estritamente maior que zero.');
  }

  const res = await linkContractToItemRpc(params);

  return {
    id: res.id,
    itemKey: res.item_key,
    contractKey: res.contract_key,
    quantidadeContratada: res.quantidade_contratada,
    observacoes: params.observacoes,
    updatedAt: res.timestamp
  };
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
 * Função Pura: Enriquece os vínculos contextuais com os dados soberanos do catálogo
 * oficial de contratos do SaldoARP (sem duplicar nenhuma regra ou fazer chamada de rede).
 */
export function enrichContractLinks(
  links: ArpItemContractLink[],
  officialContracts: ContractDashboardRecord[]
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
        quantidadeContratada: link.quantidadeContratada,
        observacoes: link.observacoes,
        contract,
        numeroContratoFormatado: contract.numeroFormatado || `Contrato ${contract.numero}/${contract.ano}`,
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
    const numeroDisplay = parts.length >= 2 ? `${parts[1]}/${parts[2] || ''}` : link.contractKey;

    return {
      linkId: link.id,
      itemKey: link.itemKey,
      contractKey: link.contractKey,
      quantidadeContratada: link.quantidadeContratada,
      observacoes: link.observacoes,
      numeroContratoFormatado: `Contrato ${numeroDisplay}`,
      uasg,
      orgaoNome,
      fornecedorNome: 'Contrato Oficial (Aguardando sincronização da UG)',
      fornecedorCnpjCpf: '',
      fornecedorCnpj: '',
      isOficial: false
    };
  });
}
