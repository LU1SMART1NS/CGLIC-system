import { supabase, isSupabaseConfigured } from './supabaseClient';

/** Vínculo item↔contrato com a quantidade do item no contrato (lida da API; nula quando ainda não foi lida). */
export interface CarteiraItemLink {
  itemKey: string;
  contractKey: string;
  quantidadeContratada: number | null;
}

/** Empenhado de um item em um contrato: soma das parcelas deste item nas notas vinculadas aos itens (em unidades). */
export interface CarteiraItemEmpenho {
  itemKey: string;
  quantidade: number;
}

const PAGE_SIZE = 1000;

/** O PostgREST devolve no máximo 1000 linhas por consulta: lê a tabela inteira, página a página. */
async function fetchAllRows<T>(table: string, columns: string): Promise<T[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data as unknown as T[]) || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Todos os vínculos item↔contrato da carteira (base da quantidade contratada por item e dos contratos de cada unidade). */
export async function fetchCarteiraItemLinks(): Promise<CarteiraItemLink[]> {
  const rows = await fetchAllRows<{ item_key: string; contract_key: string; quantidade_contratada_api: number | null }>(
    'arp_item_contract_links',
    'item_key, contract_key, quantidade_contratada_api'
  );
  return rows.map((r) => ({
    itemKey: r.item_key,
    contractKey: r.contract_key,
    quantidadeContratada: r.quantidade_contratada_api == null ? null : Number(r.quantidade_contratada_api)
  }));
}

/**
 * Empenhado de cada item da ata em cada contrato vinculado (v_arp_item_contrato_empenhado, migration 94): o item do
 * contrato com o mesmo número, somando as parcelas das notas vinculadas aos itens. Item sem preço unitário no contrato
 * (ex.: serviço) não tem quantidade e fica de fora.
 */
export async function fetchCarteiraItemEmpenhos(): Promise<CarteiraItemEmpenho[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const rows: Array<{ item_key: string; quantidade_empenhada: number | null }> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('v_arp_item_contrato_empenhado')
      .select('item_key, quantidade_empenhada')
      .order('item_key', { ascending: true })
      .order('contract_key', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data as unknown as typeof rows) || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows
    .filter((r) => r.quantidade_empenhada != null && Number(r.quantidade_empenhada) > 0)
    .map((r) => ({ itemKey: r.item_key, quantidade: Number(r.quantidade_empenhada) }));
}
