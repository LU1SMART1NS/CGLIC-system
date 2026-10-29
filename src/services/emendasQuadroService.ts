/**
 * Quadro da reserva para o parlamentar (migration 165): o que a CAEP copia para o SEI ou para o WhatsApp no formato do
 * Anexo (DESCRIÇÃO ITEM · BENEFICIÁRIO FINAL · MUNICÍPIO · QTD · VR UNITÁRIO · VR TOTAL · TOTAL A EMPENHAR).
 *
 * Lê o preço de hoje e a data do reajuste de cada item (emendas_reajuste_dos_itens) e grava o nome na ata assinada e
 * o GND do item (salvar_dados_item_emenda, emendas.manage, com conferência de versão).
 */
import { supabase } from './supabaseClient';
import { mensagemDoBanco } from './emendasService';

export type GndItem = 'GND-3' | 'GND-4';

/** De onde vem a data do reajuste: o próximo reajuste da ata, a prorrogação, ou o fim da vigência (ata sem data-base). */
export type OrigemDoReajuste = 'REAJUSTE' | 'PRORROGACAO' | 'FIM_DA_VIGENCIA' | 'DEVIDO';

/**
 * Preço de hoje de um item da CAEP e a data do próximo reajuste da ata (migration 246). Desde 29/10/2026 o ofício e o
 * empenho são pelo preço de hoje, sem projeção; a data do reajuste decide até quando o item entra em reserva e minuta.
 */
export interface PrecoDoItem {
  itemKey: string;
  precoAtual: number;
  /** Data do próximo reajuste (ou do fim da vigência, na ata sem data-base); null sem reajuste na vigência ou com o devido. */
  dataReajuste: string | null;
  origem: OrigemDoReajuste | null;
  /** Reajuste devido e ainda não aplicado: o preço do banco é o antigo e o item fica fora até o apostilamento. */
  devido: boolean;
  /** Preço com o reajuste devido, só para o texto do aviso. */
  precoDevido: number | null;
}

function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export async function fetchPrecosDosItens(): Promise<Map<string, PrecoDoItem>> {
  const { data, error } = await db().rpc('emendas_reajuste_dos_itens');
  if (error) throw new Error(mensagemDoBanco(error));
  const m = new Map<string, PrecoDoItem>();
  for (const r of (data ?? []) as Record<string, any>[]) {
    m.set(r.item_key, {
      itemKey: r.item_key,
      precoAtual: num(r.preco_atual),
      dataReajuste: r.data_reajuste ?? null,
      origem: r.origem ?? null,
      devido: Boolean(r.devido),
      precoDevido: r.preco_devido == null ? null : Number(r.preco_devido)
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
