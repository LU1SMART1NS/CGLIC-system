/**
 * Vínculo automático entre ata e contrato (migration 95). Quem vincula é o banco (cron de hora em hora); aqui a tela
 * lê o motivo dos contratos que ficaram para a equipe, a última execução, e o coordenador simula ou roda na hora.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';

/** Por que o sistema deixou o contrato para a equipe (prever_vinculos_automaticos, situacao = MANUAL). */
export type MotivoVinculoManual =
  | 'VINCULO_MANUAL'
  | 'NAO_PERTENCE_A_ATA'
  | 'OUTRO_FORNECEDOR'
  | 'ITENS_NAO_LIDOS'
  | 'ITEM_SEM_NUMERO'
  | 'ITEM_FORA_DA_ATA'
  | 'ITEM_EM_VARIAS_ATAS'
  | 'ATA_DESCARTADA'
  | 'VINCULO_DESFEITO'
  | 'VALOR_FORA_DO_LIMITE'
  | 'GESTORES_DIFERENTES'
  | 'TROCARIA_GESTOR'
  | 'ATA_SEM_GESTOR';

export interface ResumoVinculoAutomatico {
  simulacao: boolean;
  /** Vínculos (item da ata × contrato) novos. */
  novos: number;
  contratosNovos: number;
  /** Vínculos do sistema com quantidade ou preço atualizados pela fonte. */
  atualizados: number;
  /** Vínculos do sistema retirados porque a fonte deixou de confirmá-los. */
  retirados: number;
  automaticosTotal: number;
  /** Contratos deixados para a equipe, por motivo. */
  manuais: Partial<Record<MotivoVinculoManual, number>>;
  /** Contratos sem gestor que passam a ser do gestor da ata, por gestor. */
  herdamGestor: Record<string, number>;
  erros: Array<{ contrato: string; erro: string }>;
}

export interface ExecucaoVinculoAutomatico {
  executadoEm: string;
  origem: 'CRON' | 'COORDENADOR' | 'SERVIDOR';
  executadoPorNome?: string;
  resumo: ResumoVinculoAutomatico;
}

const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

export function lerResumo(r: any): ResumoVinculoAutomatico {
  return {
    simulacao: Boolean(r?.simulacao),
    novos: numero(r?.novos),
    contratosNovos: numero(r?.contratos_novos),
    atualizados: numero(r?.atualizados),
    retirados: numero(r?.retirados),
    automaticosTotal: numero(r?.automaticos_total),
    manuais: r?.manuais && typeof r.manuais === 'object' ? r.manuais : {},
    herdamGestor: r?.herdam_gestor && typeof r.herdam_gestor === 'object' ? r.herdam_gestor : {},
    erros: Array.isArray(r?.erros) ? r.erros : []
  };
}

/** Motivo de cada contrato que ficou para a equipe, por chave do contrato. Sem a migration 95, vazio. */
export async function fetchMotivosVinculoManual(): Promise<Map<string, MotivoVinculoManual>> {
  const mapa = new Map<string, MotivoVinculoManual>();
  if (!isSupabaseConfigured || !supabase) return mapa;
  try {
    const { data, error } = await supabase.rpc('prever_vinculos_automaticos').select('contract_key, motivo').eq('situacao', 'MANUAL');
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ contract_key: string; motivo: MotivoVinculoManual }>) {
      if (r.contract_key && r.motivo) mapa.set(r.contract_key, r.motivo);
    }
  } catch (err) {
    console.warn('Motivos do vínculo automático indisponíveis (migration 95 aplicada?)', err);
  }
  return mapa;
}

/** Última execução que gravou (não as simulações). Nula antes da primeira ou sem a migration 95. */
export async function fetchUltimaExecucaoVinculo(): Promise<ExecucaoVinculoAutomatico | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('vinculo_automatico_execucoes')
      .select('executado_em, origem, executado_por_nome, resumo')
      .eq('simulacao', false)
      .order('executado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      executadoEm: data.executado_em,
      origem: data.origem,
      executadoPorNome: data.executado_por_nome || undefined,
      resumo: lerResumo(data.resumo)
    };
  } catch (err) {
    console.warn('Execuções do vínculo automático indisponíveis (migration 95 aplicada?)', err);
    return null;
  }
}

/** O coordenador simula (nada é gravado) ou roda o vínculo automático na hora. */
export async function rodarVinculoAutomatico(simular: boolean): Promise<ResumoVinculoAutomatico> {
  if (!isSupabaseConfigured || !supabase) throw new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado');
  const { data, error } = await supabase.rpc('vincular_contratos_automaticamente', { p_simular: simular });
  if (error) throw mapPostgresErrorToAppError(error);
  return lerResumo(data);
}
