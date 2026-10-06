import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * Empenhos gravados no sistema para um contrato: os vínculos de `contrato_empenhos` ligados à
 * `v_empenhos_resumo`. É a mesma fonte que o Item usa; nada é lido da API aqui.
 * Cada linha traz `outros_contratos`: as chaves dos demais contratos a que a mesma NE está ligada
 * (o Contratos.gov.br lista a NE em mais de um contrato; o valor dela entra inteiro em cada um).
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

  const [{ data: rows, error }, { data: outros, error: outrosError }] = await Promise.all([
    supabase.from('v_empenhos_resumo').select('*').in('empenho_id', ids),
    supabase.from('contrato_empenhos').select('empenho_id, contract_key').in('empenho_id', ids).neq('contract_key', contractKey)
  ]);
  if (error) throw error;
  // Sem a lista dos outros contratos a tabela ainda funciona: só não marca as NEs compartilhadas.
  if (outrosError) console.warn('[contractEmpenhosDb] outros contratos das NEs não lidos:', outrosError);

  const outrosPorEmpenho = new Map<string, string[]>();
  for (const o of outros ?? []) {
    const id = String(o.empenho_id);
    outrosPorEmpenho.set(id, [...(outrosPorEmpenho.get(id) ?? []), String(o.contract_key)]);
  }
  return (rows ?? []).map((r: any) => ({ ...r, outros_contratos: (outrosPorEmpenho.get(String(r.empenho_id)) ?? []).sort() }));
}
