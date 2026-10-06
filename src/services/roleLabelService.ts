import { supabase, isSupabaseConfigured } from './supabaseClient';

/** Id do perfil no catálogo local (SYSTEM_ROLES) -> id em public.roles quando diferem. */
const BACKEND_ID_BY_CATALOG_ID: Record<string, string> = { coordenador: 'admin', consulta: 'leitor' };

export function toBackendRoleId(catalogId: string): string {
  return BACKEND_ID_BY_CATALOG_ID[catalogId] ?? catalogId;
}

/** Nomes cadastrados em public.roles, indexados pelo id do catálogo local. Vazio se indisponível. */
export async function fetchRoleLabels(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured || !supabase) return {};
  const { data, error } = await supabase.from('roles').select('id, label');
  if (error || !data) return {};
  const byBackendId = new Map<string, string>(data.map((r: { id: string; label: string }) => [r.id, r.label]));
  const labels: Record<string, string> = {};
  for (const [catalogId, backendId] of Object.entries(BACKEND_ID_BY_CATALOG_ID)) {
    const label = byBackendId.get(backendId);
    if (label) labels[catalogId] = label;
  }
  for (const [id, label] of byBackendId) {
    if (!(id in labels)) labels[id] = label;
  }
  return labels;
}

export async function renameRole(catalogId: string, label: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.rpc('rename_role', {
    p_role_id: toBackendRoleId(catalogId),
    p_label: label.trim()
  });
  if (error) throw new Error(error.message.replace(/^[A-Z_]+:\s*/, ''));
}
