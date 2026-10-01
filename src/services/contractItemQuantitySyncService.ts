/**
 * Quantidade contratada do item em cada contrato vinculado = dado oficial do Contratos.gov.br.
 * Esta rotina lê a API e grava uma CÓPIA no vínculo (nunca digitada), para a view de saldo
 * (Ata, busca de atas, dashboards) enxergar o consumo do item sem consultar a API.
 */
import { fetchContractItemDetails } from './contractItemsService';
import { syncContractItemQuantityRpc } from '../adapters/arpContractLinkRpcAdapter';
import { normalizeItemKey } from '../utils/itemKeyUtils';
import type { ContractDashboardRecord } from '../types';

export interface SyncContractItemQuantityParams {
  numeroAta: string;
  /** UASG gerenciadora da ata (compõe a chave do item). */
  uasg: string;
  numeroItem: string;
  contractKey: string;
  contract: Pick<ContractDashboardRecord, 'uasg' | 'numero' | 'ano' | 'numeroControlePncp'>;
}

export interface SyncContractItemQuantityResult {
  quantidade: number | null;
  valorUnitario: number | null;
  /** A API listou o item no contrato. */
  listado: boolean;
}

export async function syncContractItemQuantity(params: SyncContractItemQuantityParams): Promise<SyncContractItemQuantityResult> {
  const { numeroAta, uasg, numeroItem, contractKey, contract } = params;
  const itemKey = normalizeItemKey(numeroAta, uasg, numeroItem);

  const details = await fetchContractItemDetails(contract);
  if (details.size === 0) {
    // API fora do ar ou contrato ainda não publicado: não marca como lido, para tentar de novo depois.
    throw new Error('A API oficial não retornou os itens do contrato.');
  }

  const detail = details.get(parseInt(numeroItem, 10));
  await syncContractItemQuantityRpc({
    itemKey,
    contractKey,
    quantidade: detail?.quantidade ?? null,
    valorUnitario: detail?.valorUnitario ?? null
  });

  return {
    quantidade: detail?.quantidade ?? null,
    valorUnitario: detail?.valorUnitario ?? null,
    listado: Boolean(detail)
  };
}
