/**
 * Atualiza em lote a cópia da quantidade contratada (arp_item_contract_links.quantidade_contratada_api)
 * de todos os itens de ata vinculados a contratos.
 *
 * A tela do Item relê a quantidade da API ao abrir; os painéis (Visão Geral, carteiras) só enxergam a
 * cópia gravada no banco. Sem esta rotina, o saldo de um item que ninguém abriu aparecia como 0% consumido.
 * Uma leitura de API por contrato (a resposta traz todos os itens), e só o que está sem leitura ou velho.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { fetchContratosParaTela } from './contratosOficiaisService';
import { fetchContractItemDetails } from './contractItemsService';
import { syncContractItemQuantityRpc } from '../adapters/arpContractLinkRpcAdapter';
import { parseItemKey } from '../utils/itemKeyParts';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import { SINCRONIZACAO_RULES } from '../config/alertRules';


export interface ItemSaldoRefreshSummary {
  contratos: number;
  itensAtualizados: number;
  falhas: Array<{ contractKey: string; motivo: string }>;
}

interface LinkRow {
  item_key: string;
  contract_key: string;
  quantidade_lida_em: string | null;
}

export function pickStaleLinksByContract(links: LinkRow[], now = Date.now(), force = false): Map<string, LinkRow[]> {
  const byContract = new Map<string, LinkRow[]>();
  for (const link of links) {
    const lida = link.quantidade_lida_em ? Date.parse(link.quantidade_lida_em) : NaN;
    if (!force && !Number.isNaN(lida) && now - lida < SINCRONIZACAO_RULES.quantidadeContratadaVencidaEmHoras * 60 * 60 * 1000) continue;
    const key = link.contract_key.toUpperCase();
    byContract.set(key, [...(byContract.get(key) ?? []), link]);
  }
  return byContract;
}

export async function refreshAllLinkedItemQuantities(options: { force?: boolean; now?: number } = {}): Promise<ItemSaldoRefreshSummary> {
  const summary: ItemSaldoRefreshSummary = { contratos: 0, itensAtualizados: 0, falhas: [] };
  if (!isSupabaseConfigured || !supabase) return summary;

  const { data, error } = await supabase.from('arp_item_contract_links').select('item_key, contract_key, quantidade_lida_em');
  if (error) throw error;

  const stale = pickStaleLinksByContract((data ?? []) as LinkRow[], options.now, options.force);
  if (stale.size === 0) return summary;

  const contractsByKey = new Map<string, Awaited<ReturnType<typeof fetchContratosParaTela>>[number]>();
  for (const uasg of UASGS_CGLIC) {
    try {
      for (const c of await fetchContratosParaTela(uasg)) contractsByKey.set(c.id.toUpperCase(), c);
    } catch (err) {
      console.warn(`[itemSaldoRefresh] contratos da UASG ${uasg} indisponíveis:`, err);
    }
  }

  // Um contrato por vez: respeita o limite de requisições das APIs oficiais.
  for (const [contractKey, links] of stale) {
    const contract = contractsByKey.get(contractKey);
    if (!contract) {
      summary.falhas.push({ contractKey, motivo: 'Contrato oficial não encontrado.' });
      continue;
    }
    summary.contratos++;
    try {
      const details = await fetchContractItemDetails(contract);
      if (details.size === 0) throw new Error('A API oficial não retornou os itens do contrato.');
      for (const link of links) {
        const parts = parseItemKey(link.item_key);
        if (!parts) continue;
        const detail = details.get(parseInt(parts.numeroItem, 10));
        await syncContractItemQuantityRpc({
          itemKey: link.item_key,
          contractKey: link.contract_key,
          quantidade: detail?.quantidade ?? null,
          valorUnitario: detail?.valorUnitario ?? null
        });
        summary.itensAtualizados++;
      }
    } catch (err: any) {
      summary.falhas.push({ contractKey, motivo: err?.message || 'Falha ao ler a quantidade contratada.' });
    }
  }
  return summary;
}
