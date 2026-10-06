import { fetchContratosGovData, fetchContratoItensComprasGov } from './api';
import { parseMoneyValue } from './balanceService';
import type { ContractDashboardRecord } from '../types';

/** Um item de um contrato segundo a API oficial. */
export interface ContractItemDetail {
  /** Quantidade contratada; nula quando a API não informa. */
  quantidade: number | null;
  /** Preço unitário no contrato; nulo quando a API não informa. */
  valorUnitario: number | null;
}

/**
 * Itens de um contrato segundo a API oficial, por número do item da compra (o mesmo número do item da Ata).
 * Mapa vazio = a API não devolveu itens (contrato não sincronizado ou API fora do ar).
 */
export type ContractItemDetails = Map<number, ContractItemDetail>;

/** Quantidade por número de item (visão resumida de `ContractItemDetails`). */
export type ContractItemQuantities = Map<number, number | null>;

const toInt = (v: unknown): number => parseInt(String(v ?? ''), 10);
const toNumberOrNull = (v: unknown): number | null => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = parseMoneyValue(v as any);
  return Number.isFinite(n) ? n : null;
};

/** API de onde os itens do contrato foram lidos. */
export type FonteItensContrato = 'CONTRATOS_GOV' | 'COMPRAS_GOV';

/** Um item do contrato como a API oficial devolve, já normalizado. */
export interface ItemContratoLido {
  /** Número do item da compra (o mesmo número do item na ata); nulo quando a API não informa. */
  numeroItem: number | null;
  descricao: string | null;
  /** Material / Serviço, como a API informa. */
  tipo: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
}

/** Itens do contrato na ordem da API. Fonte nula = nenhuma API devolveu itens. */
export interface LeituraItensContrato {
  fonte: FonteItensContrato | null;
  itens: ItemContratoLido[];
}

const toIntOrNull = (v: unknown): number | null => {
  const n = toInt(v);
  return isNaN(n) ? null : n;
};
const textoOuNulo = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t === '' ? null : t;
};
const numeroOuNulo = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Itens do contrato no Contratos.gov.br; pelo id do contrato quando já se sabe, sem a consulta que o descobre. */
async function itensContratosGov(
  contract: Pick<ContractDashboardRecord, 'uasg' | 'numero' | 'ano' | 'contratoId'>
): Promise<any[]> {
  const contratoId = String(contract.contratoId ?? '').trim();
  if (/^\d+$/.test(contratoId)) {
    try {
      const res = await fetch(`/api-contratos-gov/api/contrato/${contratoId}/itens`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (err) {
      console.warn(`[contractItems] itens do contrato ${contratoId} indisponíveis no Contratos.gov.br:`, err);
    }
  }
  if (!contract.uasg || !contract.numero) return [];
  const gov = await fetchContratosGovData(contract.uasg, contract.numero, contract.ano);
  return gov.items || [];
}

/**
 * Itens de um contrato nas APIs oficiais: Contratos.gov.br e, se ele não devolver nada, Compras.gov.br
 * (dados abertos) pelo número de controle do PNCP. É a leitura única dos itens de contrato do sistema: a
 * sincronização grava daqui (itens_contrato) e a quantidade dos vínculos com a ata também sai daqui.
 */
export async function lerItensDoContrato(
  contract: Pick<ContractDashboardRecord, 'uasg' | 'numero' | 'ano' | 'numeroControlePncp' | 'contratoId'>
): Promise<LeituraItensContrato> {
  // 1. Contratos.gov.br
  const gov = await itensContratosGov(contract);
  if (gov.length > 0) {
    return {
      fonte: 'CONTRATOS_GOV',
      itens: gov.map((i) => ({
        numeroItem: toIntOrNull(i.numero_item_compra),
        descricao: textoOuNulo(i.descricao_complementar) ?? textoOuNulo(i.catmatseritem_id),
        tipo: textoOuNulo(i.tipo_id),
        quantidade: toNumberOrNull(i.quantidade),
        valorUnitario: toNumberOrNull(i.valorunitario),
        valorTotal: toNumberOrNull(i.valortotal)
      }))
    };
  }

  // 2. Compras.gov.br (dados abertos) pelo número de controle do PNCP
  const compras = await fetchContratoItensComprasGov(contract.numeroControlePncp);
  if (compras.length > 0) {
    return {
      fonte: 'COMPRAS_GOV',
      itens: compras.map((i) => ({
        numeroItem: toIntOrNull(i.numeroItem ?? i.codigoItem),
        descricao: textoOuNulo(i.descricaoIitem),
        tipo: textoOuNulo(i.tipoItem),
        quantidade: numeroOuNulo(i.quantidadeItem),
        valorUnitario: numeroOuNulo(i.valorUnitarioItem),
        valorTotal: numeroOuNulo(i.valorTotalItem)
      }))
    };
  }
  return { fonte: null, itens: [] };
}

export async function fetchContractItemDetails(
  contract: Pick<ContractDashboardRecord, 'uasg' | 'numero' | 'ano' | 'numeroControlePncp' | 'contratoId'>
): Promise<ContractItemDetails> {
  const result: ContractItemDetails = new Map();
  const { itens } = await lerItensDoContrato(contract);
  for (const i of itens) {
    if (i.numeroItem === null) continue;
    result.set(i.numeroItem, { quantidade: i.quantidade, valorUnitario: i.valorUnitario });
  }
  return result;
}

export async function fetchContractItemQuantities(
  contract: Pick<ContractDashboardRecord, 'uasg' | 'numero' | 'ano' | 'numeroControlePncp' | 'contratoId'>
): Promise<ContractItemQuantities> {
  const details = await fetchContractItemDetails(contract);
  return new Map(Array.from(details, ([n, d]) => [n, d.quantidade]));
}
