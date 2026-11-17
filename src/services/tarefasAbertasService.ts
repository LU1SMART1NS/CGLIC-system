import { supabase, isSupabaseConfigured } from './supabaseClient';
import { lerTodasAsPaginas } from './lerTodasAsPaginas';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { DIAS_DA_FILA } from '../components/atas/distribuicao/complexidade';

/**
 * Tarefas abertas com o gestor e prazo em até 30 dias (inclui as vencidas), por instrumento, no formato da
 * Distribuição: "ATA:<chave de gestão>" e "CONTRATO:<chave>" (RPC tarefas_abertas_por_instrumento, migration 323).
 */
export async function fetchTarefasAbertasPorInstrumento(dias: number = DIAS_DA_FILA): Promise<Record<string, number>> {
  if (!isSupabaseConfigured || !supabase) return {};
  try {
    const db = supabase;
    const linhas = await lerTodasAsPaginas<{ tipo: string; chave: string; abertas: number }>((de, ate) =>
      db.rpc('tarefas_abertas_por_instrumento', { p_dias: dias }).order('tipo').order('chave').range(de, ate)
    );
    const mapa: Record<string, number> = {};
    for (const l of linhas) if (l.abertas > 0) mapa[`${l.tipo}:${l.chave}`] = l.abertas;
    return mapa;
  } catch (error) {
    throw mapPostgresErrorToAppError(error);
  }
}
