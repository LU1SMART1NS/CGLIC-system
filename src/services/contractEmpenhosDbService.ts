import { supabase, isSupabaseConfigured } from './supabaseClient';

/** Coluna ou tabela ainda inexistente (migration 85 não aplicada). */
const colunaAusente = (error: any) =>
  ['42703', 'PGRST204', 'PGRST200'].includes(String(error?.code ?? '')) || /does not exist|Could not find/i.test(String(error?.message ?? ''));

interface VinculoGravado {
  empenho_id: string;
  origem?: 'FONTE' | 'MANUAL';
  vinculado_por_nome?: string | null;
  motivo_manual?: string | null;
  created_at?: string | null;
}

/** Vínculos do contrato; sem as colunas da migration 85, lê só o empenho (todos contam como FONTE). */
async function lerVinculos(contractKey: string): Promise<VinculoGravado[]> {
  const completo = await supabase!
    .from('contrato_empenhos')
    .select('empenho_id, origem, vinculado_por_nome, motivo_manual, created_at')
    .eq('contract_key', contractKey);
  if (!completo.error) return (completo.data ?? []) as VinculoGravado[];
  if (!colunaAusente(completo.error)) throw completo.error;
  const simples = await supabase!.from('contrato_empenhos').select('empenho_id').eq('contract_key', contractKey);
  if (simples.error) throw simples.error;
  return (simples.data ?? []) as VinculoGravado[];
}

/**
 * Empenhos gravados no sistema para um contrato: os vínculos de `contrato_empenhos` ligados à
 * `v_empenhos_resumo`. É a mesma fonte que o Item usa; nada é lido da API aqui.
 * Cada linha traz `outros_contratos`: as chaves dos demais contratos a que a mesma NE está ligada
 * (o Contratos.gov.br lista a NE em mais de um contrato; o valor dela entra inteiro em cada um),
 * e a origem do vínculo (FONTE ou MANUAL, migration 85), com quem vinculou à mão e por quê.
 */
export async function fetchContractEmpenhosFromDb(contractKey: string): Promise<any[]> {
  if (!isSupabaseConfigured || !supabase || !contractKey) return [];

  const links = await lerVinculos(contractKey);
  const vinculoPorEmpenho = new Map(links.map((l) => [String(l.empenho_id), l]));
  const ids = Array.from(vinculoPorEmpenho.keys());
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
  return (rows ?? []).map((r: any) => {
    const v = vinculoPorEmpenho.get(String(r.empenho_id));
    return {
      ...r,
      outros_contratos: (outrosPorEmpenho.get(String(r.empenho_id)) ?? []).sort(),
      origem_vinculo: v?.origem === 'MANUAL' ? 'MANUAL' : 'FONTE',
      vinculado_por_nome: v?.vinculado_por_nome ?? undefined,
      motivo_manual: v?.motivo_manual ?? undefined,
      vinculado_em: v?.created_at ?? undefined
    };
  });
}
