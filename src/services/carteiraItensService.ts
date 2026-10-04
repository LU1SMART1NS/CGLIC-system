import { supabase, isSupabaseConfigured } from './supabaseClient';

/** Vínculo item↔contrato com a quantidade do item no contrato (lida da API; nula quando ainda não foi lida). */
export interface CarteiraItemLink {
  itemKey: string;
  contractKey: string;
  quantidadeContratada: number | null;
}

/** Empenho vinculado a um item; quantidade nula = ainda pendente de confirmação (não conta como empenhado). */
export interface CarteiraItemEmpenho {
  itemKey: string;
  quantidade: number | null;
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

/** Todos os empenhos vinculados a itens (arp_item_empenhos), para somar o empenhado de cada item. */
export async function fetchCarteiraItemEmpenhos(): Promise<CarteiraItemEmpenho[]> {
  const rows = await fetchAllRows<{ item_key: string; quantidade_consumida: number | null }>(
    'arp_item_empenhos',
    'item_key, quantidade_consumida'
  );
  return rows.map((r) => ({
    itemKey: r.item_key,
    quantidade: r.quantidade_consumida == null ? null : Number(r.quantidade_consumida)
  }));
}
