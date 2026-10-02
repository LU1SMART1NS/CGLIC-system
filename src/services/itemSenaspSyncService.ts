/**
 * Quantitativo SENASP do item = soma do registrado nas unidades 200330/200331 (Compras.gov).
 * Lê as unidades reais da API e grava uma CÓPIA em itens_ata, para a view de saldo (Ata, dashboards,
 * central de prazos) enxergar a base certa sem consultar a API.
 */
import { fetchUnidadesItem } from './api';
import { syncItemSenaspQuantityRpc } from '../adapters/arpContractLinkRpcAdapter';
import { normalizeItemKey } from '../utils/itemKeyUtils';
import { isUnidadeSenasp, quantitativoSenasp } from '../utils/quantitativoSenasp';

export interface SyncItemSenaspParams {
  numeroAta: string;
  /** UASG gerenciadora da ata (compõe a chave do item). */
  uasg: string;
  numeroItem: string;
}

export interface SyncItemSenaspResult {
  /** Quantitativo gravado; nulo quando a API não trouxe unidades SENASP (nada é gravado). */
  quantidade: number | null;
}

export async function syncItemSenaspQuantity(params: SyncItemSenaspParams): Promise<SyncItemSenaspResult> {
  const { numeroAta, uasg, numeroItem } = params;
  const response = await fetchUnidadesItem(numeroAta.trim(), uasg.trim(), numeroItem.trim());
  const unidades = response.resultado || [];
  // API fora do ar ou sem unidade SENASP: não grava, para não substituir o dado por um palpite.
  if (!unidades.some((u) => isUnidadeSenasp(u, uasg))) return { quantidade: null };

  const quantidade = quantitativoSenasp(unidades, uasg);
  await syncItemSenaspQuantityRpc({ itemKey: normalizeItemKey(numeroAta, uasg, numeroItem), quantidade });
  return { quantidade };
}
