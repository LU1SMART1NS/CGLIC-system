import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';

/** Motivo da ausência (public.transferencias_temporarias, migration 254). */
export type MotivoAusencia = 'FERIAS' | 'LICENCA' | 'AFASTAMENTO' | 'OUTRO';

export const ROTULO_MOTIVO_AUSENCIA: Record<MotivoAusencia, string> = {
  FERIAS: 'Férias',
  LICENCA: 'Licença',
  AFASTAMENTO: 'Afastamento',
  OUTRO: 'Outro'
};

/** Ata ou contrato que mudou de mãos, com o gestor de antes (para o Desfazer). */
export interface TransferenciaItem {
  tipo: 'ATA' | 'CONTRATO';
  chave: string;
  origemNome: string;
  origemUserId: string | null;
  destinoNome: string;
  destinoUserId: string;
  /** `null` até o Desfazer; `true` voltou; `false` mudou de mãos no período e ficou. */
  devolvido: boolean | null;
}

export interface TransferenciaTemporaria {
  id: string;
  ausenteUserId: string;
  ausenteNome: string;
  motivo: MotivoAusencia;
  /** Datas no formato AAAA-MM-DD. */
  inicio: string;
  retornoPrevisto: string;
  seiNumero: string | null;
  criadoPorNome: string | null;
  criadoEm: string;
  desfeitaEm: string | null;
  desfeitaPorNome: string | null;
  itens: TransferenciaItem[];
}

/**
 * Todas as transferências, a mais recente primeiro. Sem a tabela (migration 254 ainda não aplicada) ou com erro,
 * devolve vazio: a Central segue sem a aba Ausências.
 */
export async function fetchTransferenciasTemporarias(): Promise<TransferenciaTemporaria[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('transferencias_temporarias')
      .select(
        'id, ausente_user_id, ausente_nome, motivo, inicio, retorno_previsto, sei_numero, criado_por_nome, criado_em, desfeita_em, desfeita_por_nome, ' +
          'transferencias_temporarias_itens (tipo, chave, origem_nome, origem_user_id, destino_nome, destino_user_id, devolvido)'
      )
      .order('criado_em', { ascending: false });
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data || []) as any[]).map((row) => ({
      id: row.id,
      ausenteUserId: row.ausente_user_id,
      ausenteNome: row.ausente_nome,
      motivo: row.motivo,
      inicio: row.inicio,
      retornoPrevisto: row.retorno_previsto,
      seiNumero: row.sei_numero || null,
      criadoPorNome: row.criado_por_nome || null,
      criadoEm: row.criado_em,
      desfeitaEm: row.desfeita_em || null,
      desfeitaPorNome: row.desfeita_por_nome || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      itens: ((row.transferencias_temporarias_itens || []) as any[]).map((i) => ({
        tipo: i.tipo,
        chave: i.chave,
        origemNome: i.origem_nome,
        origemUserId: i.origem_user_id || null,
        destinoNome: i.destino_nome,
        destinoUserId: i.destino_user_id,
        devolvido: i.devolvido ?? null
      }))
    }));
  } catch (err) {
    console.warn('Transferências temporárias indisponíveis (migration 254 aplicada?)', err);
    return [];
  }
}

export interface TransferirInput {
  ausenteUserId: string;
  motivo: MotivoAusencia;
  inicio: string;
  retornoPrevisto: string;
  seiNumero?: string;
  /** Quem assume tudo o que não estiver em `destinos`. */
  padrao: { userId: string; nome: string };
  /** Exceções ao padrão, por ata ou contrato. */
  destinos?: Array<{ tipo: 'ATA' | 'CONTRATO'; chave: string; userId: string; nome: string }>;
}

function cliente() {
  if (!isSupabaseConfigured || !supabase) throw new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado');
  return supabase;
}

/** Passa a carteira inteira do servidor (só admin; RPC transferir_carteira_temporaria). */
export async function transferirCarteiraTemporaria(input: TransferirInput): Promise<{ atas: number; contratos: number }> {
  const { data, error } = await cliente().rpc('transferir_carteira_temporaria', {
    p_ausente_user_id: input.ausenteUserId,
    p_motivo: input.motivo,
    p_inicio: input.inicio,
    p_retorno_previsto: input.retornoPrevisto,
    p_sei_numero: (input.seiNumero || '').trim() || null,
    p_padrao_user_id: input.padrao.userId,
    p_padrao_nome: input.padrao.nome,
    p_destinos: (input.destinos || []).map((d) => ({ tipo: d.tipo, chave: d.chave, user_id: d.userId, nome: d.nome }))
  });
  if (error) throw mapPostgresErrorToAppError(error);
  return { atas: Number(data?.atas ?? 0), contratos: Number(data?.contratos ?? 0) };
}

/** Devolve ao gestor anterior o que ainda está com quem assumiu (só admin). */
export async function desfazerTransferenciaTemporaria(id: string): Promise<{ devolvidos: number; ficaram: number }> {
  const { data, error } = await cliente().rpc('desfazer_transferencia_temporaria', { p_id: id });
  if (error) throw mapPostgresErrorToAppError(error);
  return { devolvidos: Number(data?.devolvidos ?? 0), ficaram: Number(data?.ficaram ?? 0) };
}

/** Férias prorrogadas ou antecipadas: só a data muda (só admin). */
export async function mudarRetornoTransferencia(input: { id: string; retornoPrevisto: string }): Promise<void> {
  const { error } = await cliente().rpc('mudar_retorno_transferencia_temporaria', { p_id: input.id, p_retorno_previsto: input.retornoPrevisto });
  if (error) throw mapPostgresErrorToAppError(error);
}
