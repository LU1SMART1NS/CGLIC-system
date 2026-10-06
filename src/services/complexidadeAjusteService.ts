import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';

export type TipoInstrumentoAjuste = 'ATA' | 'CONTRATO';
export type NivelAjuste = 'ALTA' | 'MEDIA' | 'BAIXA';

/** Ajuste manual de complexidade de um instrumento (public.instrument_complexity_overrides, migration 66). */
export interface ComplexidadeAjuste {
  tipo: TipoInstrumentoAjuste;
  /** Número da ata (como em ata_managers) ou chave canônica do contrato. */
  chave: string;
  nivel: NivelAjuste;
  motivo: string;
  ajustadoPorNome?: string;
  atualizadoEm?: string;
}

/** Chave única do ajuste no mapa (mesma forma usada na Distribuição: "ATA:00059/2025"). */
export const chaveAjuste = (tipo: TipoInstrumentoAjuste, chave: string) => `${tipo}:${chave}`;

/**
 * Todos os ajustes (tabela pequena: só o que o coordenador corrigiu). Sem a tabela (migration 66 ainda não
 * aplicada) ou com erro, devolve vazio: a Distribuição segue só com a complexidade automática.
 */
export async function fetchComplexidadeAjustes(): Promise<Record<string, ComplexidadeAjuste>> {
  if (!isSupabaseConfigured || !supabase) return {};
  try {
    const { data, error } = await supabase.from('instrument_complexity_overrides').select('*');
    if (error) throw error;
    const map: Record<string, ComplexidadeAjuste> = {};
    for (const row of data || []) {
      map[chaveAjuste(row.tipo, row.chave)] = {
        tipo: row.tipo,
        chave: row.chave,
        nivel: row.nivel,
        motivo: row.motivo,
        ajustadoPorNome: row.ajustado_por_nome || undefined,
        atualizadoEm: row.updated_at || undefined
      };
    }
    return map;
  } catch (err) {
    console.warn('Ajustes de complexidade indisponíveis (migration 66 aplicada?)', err);
    return {};
  }
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado');
  }
  return supabase;
}

/** Grava (ou troca) o ajuste — só admin; motivo obrigatório (RPC set_instrument_complexity). */
export async function salvarComplexidadeAjuste(input: { tipo: TipoInstrumentoAjuste; chave: string; nivel: NivelAjuste; motivo: string }) {
  const client = requireSupabase();
  const motivo = (input.motivo || '').trim();
  if (!motivo) throw mapPostgresErrorToAppError(new Error('INVALID_PAYLOAD: Informe o motivo do ajuste.'));
  const { error } = await client.rpc('set_instrument_complexity', {
    p_tipo: input.tipo,
    p_chave: input.chave,
    p_nivel: input.nivel,
    p_motivo: motivo
  });
  if (error) throw mapPostgresErrorToAppError(error);
}

/** Volta o instrumento à complexidade automática (RPC clear_instrument_complexity). */
export async function removerComplexidadeAjuste(input: { tipo: TipoInstrumentoAjuste; chave: string }) {
  const client = requireSupabase();
  const { error } = await client.rpc('clear_instrument_complexity', { p_tipo: input.tipo, p_chave: input.chave });
  if (error) throw mapPostgresErrorToAppError(error);
}
