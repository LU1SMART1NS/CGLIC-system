import { supabase, isSupabaseConfigured } from './supabaseClient';
import { confirmEmpenhoItemQuantityRpc } from '../adapters/empenhoItemRpcAdapter';
import type { ItemEmpenhoVinculo } from '../types/itemEmpenhoVinculo';

/** Empenhos vinculados a um item (vindos dos contratos vinculados), com os dados de cada empenho. */
export async function fetchItemEmpenhoVinculos(itemKey: string): Promise<ItemEmpenhoVinculo[]> {
  const cleanKey = (itemKey || '').trim();
  if (!cleanKey) return [];
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('CONFIG_ERROR: Supabase não está configurado.');
  }

  const { data, error } = await supabase
    .from('arp_item_empenhos')
    .select(
      'id, item_key, empenho_id, quantidade_consumida, fonte_quantidade, quantidade_sugerida, contract_key, numero_item_minuta, confirmado_em, ' +
        'empenho:empenhos(canonical_key, numero_oficial, ano_exercicio, uasg_emitente, data_emissao, valor_empenhado, credor_nome)'
    )
    .eq('item_key', cleanKey)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro ao consultar empenhos do item no PostgreSQL:', error);
    throw error;
  }

  return ((data as any[]) || []).map((d) => ({
    id: String(d.id),
    itemKey: d.item_key,
    empenhoId: String(d.empenho_id),
    quantidade: d.quantidade_consumida == null ? null : Number(d.quantidade_consumida),
    fonte: d.fonte_quantidade ?? null,
    quantidadeSugerida: d.quantidade_sugerida == null ? null : Number(d.quantidade_sugerida),
    contractKey: d.contract_key ?? null,
    numeroItemMinuta: d.numero_item_minuta || undefined,
    confirmadoEm: d.confirmado_em || undefined,
    empenho: {
      canonicalKey: d.empenho?.canonical_key ?? '',
      numero: d.empenho?.numero_oficial ?? '',
      ano: Number(d.empenho?.ano_exercicio) || 0,
      uasg: d.empenho?.uasg_emitente ?? '',
      dataEmissao: d.empenho?.data_emissao || undefined,
      valorEmpenhado: Number(d.empenho?.valor_empenhado) || 0,
      credorNome: d.empenho?.credor_nome || undefined
    }
  }));
}

/** Confirma a quantidade de um empenho sem minuta na API (ou, com nulo, devolve-o a pendente). */
export async function confirmEmpenhoItemQuantity(params: {
  itemKey: string;
  empenhoId: string;
  quantidade: number | null;
}): Promise<void> {
  await confirmEmpenhoItemQuantityRpc(params);
}
