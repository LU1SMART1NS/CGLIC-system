/**
 * Nome curto do item para as listas de Atas e Contratos. Duas fontes, nesta ordem:
 * 1. o nome curto que a CAEP grava em Emendas > Itens (emenda_itens_dados, migration 165), só dos itens da CAEP;
 * 2. o nome do item na tabela da ata assinada, lido do PDF do PNCP (itens_nome_na_ata, migration 312).
 * Sem os dois, a tela mostra a descrição do catálogo.
 */
import { supabase } from './supabaseClient';

/** Tabela ainda não criada (migration não aplicada) ou fora do alcance do perfil: segue sem essa fonte. */
const tabelaAusente = (error: { code?: string } | null) => error?.code === '42P01' || error?.code === 'PGRST205';

async function lerNomes(tabela: 'emenda_itens_dados' | 'itens_nome_na_ata', coluna: 'nome_curto' | 'nome'): Promise<Map<string, string>> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.from(tabela).select(`item_key, ${coluna}`).not(coluna, 'is', null);
  if (tabelaAusente(error)) return new Map();
  if (error) throw error;
  const nomes = new Map<string, string>();
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const nome = String(r[coluna] ?? '').trim();
    if (nome) nomes.set(String(r.item_key), nome);
  }
  return nomes;
}

/** Nome por item (chave "{numeroAta}-{uasg}-{00001}"): o da CAEP primeiro; sem ele, o da ata assinada. */
export async function fetchNomesCurtosItens(): Promise<Map<string, string>> {
  const [daAta, daCaep] = await Promise.all([lerNomes('itens_nome_na_ata', 'nome'), lerNomes('emenda_itens_dados', 'nome_curto')]);
  return new Map([...daAta, ...daCaep]);
}
