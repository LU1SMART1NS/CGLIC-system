import { supabase, isSupabaseConfigured } from './supabaseClient';
import { lerTodasAsPaginas } from './lerTodasAsPaginas';

/** Uma linha de arp_item_contract_links com as colunas que as carteiras e o escopo do gestor usam. */
export interface LinhaVinculoItemContrato {
  id: string | number;
  item_key: string;
  contract_key: string;
  origem?: string | null;
  quantidade_contratada_api: number | null;
  quantidade_ajustada: number | null;
}

const COLUNAS = 'id, item_key, contract_key, origem, quantidade_contratada_api, quantidade_ajustada';

let emAndamento: Promise<LinhaVinculoItemContrato[]> | null = null;

/**
 * Todos os vínculos item↔contrato, em páginas de mil na ordem do id. Duas leituras que começam juntas dividem a mesma
 * consulta: ao abrir a Carteira de Contratos, o escopo do gestor (fetchAllArpItemContractLinks) e a carteira de itens
 * (fetchCarteiraItemLinks) liam a tabela inteira duas vezes no mesmo segundo (medição de 18/11/2026). Terminada a
 * leitura, a próxima chamada lê de novo: o cache de cada tela continua decidindo quando reler.
 */
export function lerVinculosItemContrato(): Promise<LinhaVinculoItemContrato[]> {
  if (!isSupabaseConfigured || !supabase) return Promise.resolve([]);
  const db = supabase;
  if (!emAndamento) {
    emAndamento = lerTodasAsPaginas<LinhaVinculoItemContrato>((de, ate) =>
      db.from('arp_item_contract_links').select(COLUNAS).order('id', { ascending: true }).range(de, ate)
    ).finally(() => {
      emAndamento = null;
    });
  }
  return emAndamento;
}
