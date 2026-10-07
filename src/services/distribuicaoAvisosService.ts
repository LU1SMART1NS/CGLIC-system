import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';

/** Aviso ao coordenador (public.distribuicao_avisos, migration 70): um vínculo mudou o gestor de uma ata ou contrato. */
export interface DistribuicaoAviso {
  id: string;
  /**
   * CONTRATO_REALINHADO: o contrato passou ao gestor da ata. ATA_ASSUMIU_GESTOR: a ata, sem gestor, passou ao gestor do
   * contrato. GESTORES_DIFERENTES (migration 86): o contrato está também numa ata de outro gestor e ficou como estava
   * (`gestorAnterior` = gestor do contrato, `gestorNovo` = gestor da ata); o coordenador decide.
   */
  tipo: 'CONTRATO_REALINHADO' | 'ATA_ASSUMIU_GESTOR' | 'GESTORES_DIFERENTES';
  ataKey: string;
  contractKey?: string;
  gestorAnterior?: string;
  gestorNovo: string;
  feitoPorNome?: string;
  criadoEm: string;
}

/** Avisos ainda não lidos, os mais recentes primeiro. Sem a tabela (migration 70 não aplicada) ou sem permissão, devolve vazio. */
export async function fetchAvisosDistribuicao(): Promise<DistribuicaoAviso[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('distribuicao_avisos')
      .select('*')
      .is('lido_em', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      tipo: row.tipo,
      ataKey: row.ata_key,
      contractKey: row.contract_key || undefined,
      gestorAnterior: row.gestor_anterior || undefined,
      gestorNovo: row.gestor_novo,
      feitoPorNome: row.feito_por_nome || undefined,
      criadoEm: row.created_at
    }));
  } catch (err) {
    console.warn('Avisos de distribuição indisponíveis (migration 70 aplicada?)', err);
    return [];
  }
}

/** Sem ids, marca todos menos os GESTORES_DIFERENTES (esses só saem quando o coordenador decide). */
export async function marcarAvisosDistribuicaoLidos(ids?: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado');
  const { error } = await supabase.rpc('marcar_avisos_distribuicao_lidos', ids && ids.length > 0 ? { p_ids: ids } : {});
  if (error) throw mapPostgresErrorToAppError(error);
}
