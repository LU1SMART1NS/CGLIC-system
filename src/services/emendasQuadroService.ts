/**
 * Quadro da reserva para o gabinete (migration 165): o que a CAEP copia para o SEI ou para o WhatsApp no formato do
 * Anexo (DESCRIÇÃO ITEM · ÓRGÃO · BENEFICIÁRIO FINAL · MUNICÍPIO · QTD · VR UNITÁRIO · VR TOTAL · TOTAL A EMPENHAR).
 *
 * Lê o preço previsto de cada item pela projeção do reajuste da ata (emendas_precos_previstos) e grava o nome curto e
 * o GND do item (salvar_dados_item_emenda, emendas.manage, com conferência de versão).
 */
import { supabase } from './supabaseClient';
import { mensagemDoBanco } from './emendasService';

/** Coluna ÓRGÃO do Anexo: a mesma lista da conferência do banco (emenda_beneficiarios_orgao). */
export const ORGAOS_BENEFICIARIO = [
  'Polícia Militar',
  'Corpo de Bombeiros Militar',
  'Polícia Civil',
  'Polícia Científica',
  'Polícia Penal',
  'Guarda Municipal',
  'Secretaria de Segurança Pública',
  'Defesa Civil',
  'Outro'
] as const;

export type GndItem = 'GND-3' | 'GND-4';

/**
 * Por que o preço previsto é o que é:
 * - PREVISTO: próximo reajuste dentro da vigência; SE_PRORROGAR: reajuste na prorrogação da ata;
 * - DEVIDO: reajuste já devido e ainda não aplicado na ata;
 * - SEM_PREVISAO: falta base para calcular (termo de conformidade, percentual ou índice);
 * - EM_DIA / SEM_REAJUSTE: vale o preço de hoje.
 */
export type MotivoPrecoPrevisto = 'PREVISTO' | 'SE_PRORROGAR' | 'DEVIDO' | 'SEM_PREVISAO' | 'SEM_REAJUSTE' | 'EM_DIA';

export interface PrecoPrevisto {
  itemKey: string;
  precoAtual: number;
  precoPrevisto: number;
  motivo: MotivoPrecoPrevisto;
  /** Já havia reajuste devido (o previsto inclui os dois). */
  devido: boolean;
  /** Quando o próximo reajuste passa a valer (só PREVISTO e SE_PRORROGAR). */
  efeito: string | null;
  percentual: number | null;
  /** Meses do percentual que vêm da projeção do Focus, não do IPCA publicado. */
  mesesEstimados: number | null;
}

function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export async function fetchPrecosPrevistos(): Promise<Map<string, PrecoPrevisto>> {
  const { data, error } = await db().rpc('emendas_precos_previstos');
  if (error) throw new Error(mensagemDoBanco(error));
  const m = new Map<string, PrecoPrevisto>();
  for (const r of (data ?? []) as Record<string, any>[]) {
    m.set(r.item_key, {
      itemKey: r.item_key,
      precoAtual: num(r.preco_atual),
      precoPrevisto: num(r.preco_previsto),
      motivo: r.motivo,
      devido: Boolean(r.devido),
      efeito: r.efeito ?? null,
      percentual: r.percentual == null ? null : Number(r.percentual),
      mesesEstimados: r.meses_estimados ?? null
    });
  }
  return m;
}

export async function salvarDadosItemEmenda(d: { itemKey: string; nomeCurto: string | null; gnd: GndItem | null; versao: number | null }): Promise<{ versao: number }> {
  const { data, error } = await db().rpc('salvar_dados_item_emenda', {
    p_item_key: d.itemKey,
    p_nome_curto: d.nomeCurto,
    p_gnd: d.gnd,
    p_versao: d.versao
  });
  if (error) throw new Error(mensagemDoBanco(error));
  return data as { versao: number };
}
