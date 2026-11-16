/**
 * Nome curto do item (o nome na ata assinada que a CAEP grava em Emendas > Itens, migration 165), lido para as telas de
 * Atas e Contratos. Só os itens com nome: os demais seguem com a descrição do catálogo.
 */
import { supabase } from './supabaseClient';

/** Nome curto por item (chave "{numeroAta}-{uasg}-{00001}"). */
export async function fetchNomesCurtosItens(): Promise<Map<string, string>> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.from('emenda_itens_dados').select('item_key, nome_curto').not('nome_curto', 'is', null);
  if (error) throw error;
  const nomes = new Map<string, string>();
  for (const r of data ?? []) {
    const nome = String(r.nome_curto ?? '').trim();
    if (nome) nomes.set(String(r.item_key), nome);
  }
  return nomes;
}
