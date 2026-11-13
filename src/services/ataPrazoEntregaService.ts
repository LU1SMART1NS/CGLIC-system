import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import type { ContagemPrazo, InicioPrazo } from '../utils/fiscalizacaoPrazo';
import type { RegraDoRecebimento } from '../utils/fiscalizacaoRecebimento';

/**
 * Prazo de entrega da ata (migration 301): sugestão lida do Termo de Referência no PNCP e o prazo confirmado pelo gestor
 * da ata ou pelo coordenador. Os contratos da ata herdam o prazo confirmado.
 */
export interface PrazoDaAta {
  ataKey: string;
  numeroAta: string;
  leitura: 'CLARO' | 'CONFERIR' | 'SEM_CLAUSULA' | null;
  leituraMotivo: string | null;
  sugeridoDias: number | null;
  sugeridoContagem: ContagemPrazo | null;
  contagemDita: boolean;
  sugeridoInicio: InicioPrazo | null;
  trechos: string[];
  documento: string | null;
  url: string | null;
  semPrazo: boolean;
  dias: number | null;
  contagem: ContagemPrazo | null;
  inicio: InicioPrazo | null;
  porItem: Record<string, number>;
  motivo: string | null;
  confirmadoPorNome: string | null;
  confirmadoEm: string | null;
  /** Prazos do TRP e do TRD lidos do TR (sugestão) e os confirmados pelo gestor da ata, na mesma janela. */
  recebimentoSugerido?: RegraDoRecebimentoDaAta | null;
  recebimentoTrechos?: string[];
  recebimento?: RegraDoRecebimentoDaAta | null;
  /** O recebimento tem confirmação própria: atas com o prazo de entrega já confirmado ainda pedem a do recebimento. */
  recebimentoConfirmadoEm?: string | null;
  /** Valem pela leitura clara do TR, sem confirmação do gestor (migration 309). */
  confirmadoAutomatico?: boolean;
  recebimentoAutomatico?: boolean;
}

export type RegraDoRecebimentoDaAta = Pick<RegraDoRecebimento, 'trpDias' | 'trpContagem' | 'trdDias' | 'trdContagem' | 'trdInicio'>;

function cliente() {
  if (!isSupabaseConfigured || !supabase) throw new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado');
  return supabase;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function linhaParaPrazoDaAta(r: any): PrazoDaAta {
  return {
    ataKey: r.ata_key,
    numeroAta: r.numero_ata,
    leitura: r.leitura || null,
    leituraMotivo: r.leitura_motivo || null,
    sugeridoDias: r.sugerido_dias == null ? null : Number(r.sugerido_dias),
    sugeridoContagem: r.sugerido_contagem || null,
    contagemDita: Boolean(r.contagem_dita),
    sugeridoInicio: r.sugerido_inicio || null,
    trechos: Array.isArray(r.trechos) ? r.trechos.filter(Boolean) : [],
    documento: r.documento || null,
    url: r.url || null,
    semPrazo: Boolean(r.sem_prazo),
    dias: r.dias == null ? null : Number(r.dias),
    contagem: r.contagem || null,
    inicio: r.inicio || null,
    porItem: r.por_item && typeof r.por_item === 'object' ? r.por_item : {},
    motivo: r.motivo || null,
    confirmadoPorNome: r.confirmado_por_nome || null,
    confirmadoEm: r.confirmado_em || null,
    recebimentoSugerido: r.recebimento_sugerido || null,
    recebimentoTrechos: Array.isArray(r.recebimento_trechos) ? r.recebimento_trechos.filter(Boolean) : [],
    recebimento: r.recebimento || null,
    recebimentoConfirmadoEm: r.recebimento_confirmado_em || null,
    confirmadoAutomatico: Boolean(r.confirmado_automatico),
    recebimentoAutomatico: Boolean(r.recebimento_automatico)
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchPrazoDaAta(ataKey: string): Promise<PrazoDaAta | null> {
  const { data, error } = await cliente().from('ata_prazo_entrega').select('*').eq('ata_key', ataKey).maybeSingle();
  if (error) throw mapPostgresErrorToAppError(error);
  return data ? linhaParaPrazoDaAta(data) : null;
}

/**
 * Atas com o prazo do TR a confirmar que têm contrato acompanhado pela Fiscalização (migration 302): o aviso do Início
 * do gestor da ata e do coordenador. As outras atas mantêm o item na aba Ações da Ata 360.
 */
export async function fetchPrazosAConfirmar(): Promise<PrazoDaAta[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await cliente().rpc('atas_prazo_a_confirmar');
  if (error) throw mapPostgresErrorToAppError(error);
  return ((data || []) as unknown[]).map(linhaParaPrazoDaAta);
}

export async function confirmarPrazoDaAta(input: {
  ataKey: string;
  semPrazo: boolean;
  dias: number | null;
  contagem: ContagemPrazo;
  inicio: InicioPrazo;
  porItem: Record<string, number>;
  motivo: string | null;
  /** Prazos do TRP e do TRD como estão no TR; null = o TR não diz. */
  recebimento?: RegraDoRecebimentoDaAta | null;
}): Promise<{ contratos: number; itensComData: number }> {
  const { data, error } = await cliente().rpc('confirmar_prazo_entrega_ata', {
    p_ata_key: input.ataKey,
    p_sem_prazo: input.semPrazo,
    p_dias: input.semPrazo ? null : input.dias,
    p_contagem: input.semPrazo ? null : input.contagem,
    p_inicio: input.semPrazo ? null : input.inicio,
    p_por_item: input.semPrazo ? {} : input.porItem,
    p_motivo: (input.motivo || '').trim() || null,
    // undefined: não mexe no recebimento; null: o TR não traz o prazo (migration 305).
    p_recebimento: input.recebimento === undefined ? null : input.recebimento ?? { naoDiz: true }
  });
  if (error) throw mapPostgresErrorToAppError(error);
  const r = (data ?? {}) as { contratos?: number; itens_com_data?: number };
  return { contratos: Number(r.contratos) || 0, itensComData: Number(r.itens_com_data) || 0 };
}
