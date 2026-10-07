/**
 * Itens de um contrato gravados no banco (itens_contrato e itens_contrato_leituras, migration 78) e os
 * vínculos desses itens com os itens da ata (arp_item_contract_links). Só leitura: quem grava é a
 * sincronização (itensContratosSyncService). Nada aqui consulta as APIs do governo.
 */
import { supabase } from './supabaseClient';
import { parseItemKey } from '../utils/itemKeyParts';
import type { FonteItensContrato } from './contractItemsService';

export interface ItemDoContrato {
  posicao: number;
  /** Número do item da compra, o mesmo do item na ata; nulo quando a API não informa. */
  numeroItem: number | null;
  descricao: string | null;
  tipo: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
}

export interface LeituraDosItens {
  lidoEm: string;
  totalItens: number;
  fonte: FonteItensContrato | null;
}

/** Um item da ata vinculado a este contrato. */
export interface VinculoDoContrato {
  itemKey: string;
  numeroAta: string;
  uasgAta: string;
  numeroItem: number;
}

export interface ItensDoContrato {
  /** Nula = os itens deste contrato ainda não foram lidos pela sincronização. */
  leitura: LeituraDosItens | null;
  itens: ItemDoContrato[];
  vinculos: VinculoDoContrato[];
}

const numeroOuNulo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function fetchItensDoContrato(contractKey: string): Promise<ItensDoContrato> {
  const key = (contractKey || '').trim();
  if (!supabase || !key) return { leitura: null, itens: [], vinculos: [] };

  const [itensRes, leituraRes, vinculosRes] = await Promise.all([
    supabase
      .from('itens_contrato')
      .select('posicao, numero_item, descricao, tipo, quantidade, valor_unitario, valor_total')
      .eq('contract_key', key)
      .order('posicao', { ascending: true }),
    supabase.from('itens_contrato_leituras').select('lido_em, total_itens, fonte').eq('contract_key', key).maybeSingle(),
    supabase.from('arp_item_contract_links').select('item_key').eq('contract_key', key)
  ]);
  if (itensRes.error) throw itensRes.error;
  if (leituraRes.error) throw leituraRes.error;
  if (vinculosRes.error) throw vinculosRes.error;

  const itens: ItemDoContrato[] = (itensRes.data ?? []).map((r: any) => ({
    posicao: r.posicao,
    numeroItem: numeroOuNulo(r.numero_item),
    descricao: r.descricao ?? null,
    tipo: r.tipo ?? null,
    quantidade: numeroOuNulo(r.quantidade),
    valorUnitario: numeroOuNulo(r.valor_unitario),
    valorTotal: numeroOuNulo(r.valor_total)
  }));

  const vinculos: VinculoDoContrato[] = [];
  for (const r of (vinculosRes.data ?? []) as any[]) {
    const partes = parseItemKey(r.item_key);
    if (!partes) continue;
    vinculos.push({
      itemKey: r.item_key,
      numeroAta: partes.numeroAta,
      uasgAta: partes.uasg,
      numeroItem: parseInt(partes.numeroItem, 10)
    });
  }

  const l = leituraRes.data as any;
  return {
    leitura: l ? { lidoEm: l.lido_em, totalItens: l.total_itens, fonte: l.fonte ?? null } : null,
    itens,
    vinculos
  };
}

/**
 * Cruza os itens do contrato com os vínculos da ata: o vínculo de cada item (pelo número do item) e os
 * vínculos que apontam para um número de item que o contrato não tem segundo a API.
 */
export function cruzarItensComVinculos(dados: Pick<ItensDoContrato, 'itens' | 'vinculos'>): {
  vinculoPorPosicao: Map<number, VinculoDoContrato>;
  vinculosSemItem: VinculoDoContrato[];
} {
  const porNumero = new Map<number, VinculoDoContrato>();
  for (const v of dados.vinculos) porNumero.set(v.numeroItem, v);
  const vinculoPorPosicao = new Map<number, VinculoDoContrato>();
  const usados = new Set<number>();
  for (const item of dados.itens) {
    if (item.numeroItem === null) continue;
    const v = porNumero.get(item.numeroItem);
    if (v) {
      vinculoPorPosicao.set(item.posicao, v);
      usados.add(v.numeroItem);
    }
  }
  const vinculosSemItem = dados.itens.length > 0 ? dados.vinculos.filter((v) => !usados.has(v.numeroItem)) : [];
  return { vinculoPorPosicao, vinculosSemItem };
}

/**
 * Números dos itens de vários contratos (itens_contrato), para a Central ver se um contrato vinculado ainda tem item
 * sem ata. Em lotes de 100 contratos; o banco devolve no máximo 1000 linhas por consulta, então pagina.
 */
export async function fetchNumerosDosItensDosContratos(contractKeys: string[]): Promise<Map<string, number[]>> {
  const mapa = new Map<string, number[]>();
  const chaves = Array.from(new Set(contractKeys.map((k) => (k || '').trim()).filter(Boolean)));
  if (!supabase || chaves.length === 0) return mapa;
  const PAGINA = 1000;
  for (let i = 0; i < chaves.length; i += 100) {
    const lote = chaves.slice(i, i + 100);
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await supabase
        .from('itens_contrato')
        .select('contract_key, numero_item, posicao')
        .in('contract_key', lote)
        .order('contract_key', { ascending: true })
        .order('posicao', { ascending: true })
        .range(desde, desde + PAGINA - 1);
      if (error) throw error;
      for (const r of (data ?? []) as any[]) {
        const n = numeroOuNulo(r.numero_item);
        if (n === null) continue;
        const lista = mapa.get(r.contract_key) ?? [];
        if (!lista.includes(n)) lista.push(n);
        mapa.set(r.contract_key, lista);
      }
      if (!data || data.length < PAGINA) break;
    }
  }
  return mapa;
}

/** Um item da ata nos contratos candidatos: em quais contratos dá para saber e quanto cada um tem do item. */
export interface ItemNosContratos {
  /**
   * Contratos (chave em maiúsculas) com itens gravados que trazem o número do item: só neles dá para dizer se o
   * item está ou não. Contrato não lido, ou com itens sem número (a API às vezes não informa), fica fora.
   */
  comItensLidos: Set<string>;
  /** Quantidade do item em cada contrato (chave em maiúsculas), somando as posições com esse número de item. */
  quantidadePorContrato: Map<string, number>;
}

/**
 * Onde o item da ata aparece entre os contratos informados, pelos itens gravados (itens_contrato). Em lotes de
 * 100 contratos, paginando (o banco devolve no máximo 1000 linhas por consulta).
 */
export async function fetchItemNosContratos(contractKeys: string[], numeroItem: number): Promise<ItemNosContratos> {
  const resultado: ItemNosContratos = { comItensLidos: new Set(), quantidadePorContrato: new Map() };
  const chaves = Array.from(new Set(contractKeys.map((k) => (k || '').trim()).filter(Boolean)));
  if (!supabase || chaves.length === 0 || !Number.isInteger(numeroItem)) return resultado;
  const PAGINA = 1000;
  for (let i = 0; i < chaves.length; i += 100) {
    const lote = chaves.slice(i, i + 100);
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await supabase
        .from('itens_contrato')
        .select('contract_key, numero_item, quantidade, posicao')
        .in('contract_key', lote)
        .not('numero_item', 'is', null)
        .order('contract_key', { ascending: true })
        .order('posicao', { ascending: true })
        .range(desde, desde + PAGINA - 1);
      if (error) throw error;
      for (const r of (data ?? []) as any[]) {
        const key = String(r.contract_key).toUpperCase();
        resultado.comItensLidos.add(key);
        if (numeroOuNulo(r.numero_item) !== numeroItem) continue;
        const qtd = numeroOuNulo(r.quantidade);
        if (qtd === null) continue;
        resultado.quantidadePorContrato.set(key, (resultado.quantidadePorContrato.get(key) ?? 0) + qtd);
      }
      if (!data || data.length < PAGINA) break;
    }
  }
  return resultado;
}
