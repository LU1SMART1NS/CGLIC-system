/**
 * Quadro da reserva para o parlamentar (migration 165): o que a CAEP copia para o SEI ou para o WhatsApp no formato do
 * Anexo (DESCRIÇÃO ITEM · BENEFICIÁRIO FINAL · MUNICÍPIO · QTD · VR UNITÁRIO · VR TOTAL · TOTAL A EMPENHAR).
 *
 * Lê o preço previsto de cada item pela projeção do reajuste da ata (emendas_precos_previstos) e grava o nome na ata assinada e
 * o GND do item (salvar_dados_item_emenda, emendas.manage, com conferência de versão).
 */
import { supabase } from './supabaseClient';
import { mensagemDoBanco } from './emendasService';

export type GndItem = 'GND-3' | 'GND-4';

/**
 * Por que o preço previsto é o que é:
 * - PREVISTO: próximo reajuste dentro da vigência; SE_PRORROGAR: reajuste na prorrogação da ata;
 * - DEVIDO: reajuste já devido e ainda não aplicado na ata;
 * - SEM_PREVISAO: falta base para calcular (termo de conformidade, percentual ou índice);
 * - EM_DIA / SEM_REAJUSTE: vale o preço de hoje.
 * No quadro (aplicarPrazoDoEmpenho) ainda entram: FORA_DO_PRAZO, reajuste depois do empenho provável (preço de hoje);
 * FOLGA_IPCA, sem base, com a folga do IPCA dos últimos 12 meses.
 */
export type MotivoPrecoPrevisto = 'PREVISTO' | 'SE_PRORROGAR' | 'DEVIDO' | 'SEM_PREVISAO' | 'SEM_REAJUSTE' | 'EM_DIA' | 'FORA_DO_PRAZO' | 'FOLGA_IPCA';

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
  /** Folga (%) somada ao reajuste projetado na tela (aplicarPrazoDoEmpenho); ausente no preço que vem do banco. */
  folga?: number;
}

function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export interface IpcaDozeMeses {
  /** IPCA acumulado (%) nos últimos 12 meses publicados. */
  percentual: number;
  /** Primeiro e último mês (AAAA-MM-01). */
  de: string;
  ate: string;
}

/** IPCA acumulado dos 12 últimos meses publicados (série do BCB lida pelo servidor); null sem os 12 meses. */
export async function fetchIpcaDozeMeses(): Promise<IpcaDozeMeses | null> {
  const { data, error } = await db()
    .from('indices_precos_mensais')
    .select('mes, variacao')
    .eq('indice', 'IPCA')
    .eq('tipo', 'OFICIAL')
    .order('mes', { ascending: false })
    .range(0, 11);
  if (error) throw new Error(mensagemDoBanco(error));
  const meses = (data ?? []) as { mes: string; variacao: number | string }[];
  if (meses.length < 12) return null;
  const fator = meses.reduce((f, m) => f * (1 + Number(m.variacao) / 100), 1);
  return { percentual: Math.round((fator - 1) * 10000) / 100, de: String(meses[11].mes).slice(0, 10), ate: String(meses[0].mes).slice(0, 10) };
}

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
