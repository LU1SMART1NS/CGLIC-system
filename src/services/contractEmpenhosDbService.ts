import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * Empenhos gravados no sistema para um contrato: os vínculos de `contrato_empenhos` ligados à
 * `v_empenhos_resumo`. É a mesma fonte que o Item usa; nada é lido da API aqui.
 */
export async function fetchContractEmpenhosFromDb(contractKey: string): Promise<any[]> {
  if (!isSupabaseConfigured || !supabase || !contractKey) return [];

  const { data: links, error: linkError } = await supabase
    .from('contrato_empenhos')
    .select('empenho_id')
    .eq('contract_key', contractKey);
  if (linkError) throw linkError;

  const ids = Array.from(new Set((links ?? []).map((l) => String(l.empenho_id))));
  if (ids.length === 0) return [];

  const { data: rows, error } = await supabase.from('v_empenhos_resumo').select('*').in('empenho_id', ids);
  if (error) throw error;
  return rows ?? [];
}
