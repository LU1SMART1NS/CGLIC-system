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

export async function fetchContractItemDetails(
  contract: Pick<ContractDashboardRecord, 'uasg' | 'numero' | 'ano' | 'numeroControlePncp'>
): Promise<ContractItemDetails> {
  const result: ContractItemDetails = new Map();

  // 1. Contratos.gov.br: itens do contrato
  if (contract.uasg && contract.numero) {
    const gov = await fetchContratosGovData(contract.uasg, contract.numero, contract.ano);
    for (const i of gov.items || []) {
      const n = toInt(i.numero_item_compra);
      if (isNaN(n)) continue;
      result.set(n, { quantidade: toNumberOrNull(i.quantidade), valorUnitario: toNumberOrNull(i.valorunitario) });
    }
  }
  if (result.size > 0) return result;

  // 2. Compras.gov.br (dados abertos) pelo número de controle do PNCP
  for (const i of await fetchContratoItensComprasGov(contract.numeroControlePncp)) {
    const n = toInt(i.numeroItem ?? i.codigoItem);
    if (isNaN(n)) continue;
    result.set(n, {
      quantidade: typeof i.quantidadeItem === 'number' ? i.quantidadeItem : null,
      valorUnitario: typeof i.valorUnitarioItem === 'number' ? i.valorUnitarioItem : null
    });
  }
  return result;
}

export async function fetchContractItemQuantities(
  contract: Pick<ContractDashboardRecord, 'uasg' | 'numero' | 'ano' | 'numeroControlePncp'>
): Promise<ContractItemQuantities> {
  const details = await fetchContractItemDetails(contract);
  return new Map(Array.from(details, ([n, d]) => [n, d.quantidade]));
}
