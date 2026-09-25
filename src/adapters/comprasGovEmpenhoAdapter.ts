/**
 * Adapter Oficial Compras.gov.br para Empenhos (SaldoARP 3.0)
 * Responsável por consultar a API /modulo-arp/4_consultarEmpenhosSaldoItem
 * e delegar para a normalização determinística em NormalizedEmpenho[].
 *
 * Invariante: Zero persistência, zero decisão de reconciliação, zero acesso direto ao banco.
 */

import { fetchEmpenhosSaldoItem } from '../services/api';
import { normalizeFromComprasGov } from '../services/empenhoNormalizationService';
import type { NormalizedEmpenho } from '../types/empenhoSync';

export interface ComprasGovAdapterOptions {
  numeroAta: string;
  uasg: string;
  numeroItem?: string;
}

/**
 * Consulta e normaliza todos os empenhos do item de Ata via Compras.gov.br
 */
export async function fetchAndNormalizeComprasGovEmpenhos(
  options: ComprasGovAdapterOptions
): Promise<NormalizedEmpenho[]> {
  const { numeroAta, uasg, numeroItem } = options;

  if (!numeroAta || !uasg) {
    return [];
  }

  try {
    const response = await fetchEmpenhosSaldoItem(numeroAta, uasg);
    const records = response?.resultado || [];

    // Se numeroItem especificado, filtra os registros correspondentes
    const targetItemNum = numeroItem ? parseInt(numeroItem, 10) : undefined;
    const filteredRecords = targetItemNum !== undefined
      ? records.filter(r => parseInt(r.numeroItem, 10) === targetItemNum || r.numeroItem === numeroItem)
      : records;

    const normalizedList: NormalizedEmpenho[] = [];

    for (const record of filteredRecords) {
      // Ignora registros sem identificação mínima de empenho
      if (!record.numeroEmpenho && !record.quantidadeEmpenhada && !record.quantidadeIncluida) {
        continue;
      }

      const normalized = normalizeFromComprasGov(record, {
        numeroAta,
        uasg,
        numeroItem: record.numeroItem || numeroItem
      });

      normalizedList.push(normalized);
    }

    return normalizedList;
  } catch (error) {
    console.warn(`[ComprasGovEmpenhoAdapter] Falha ao consultar empenhos da Ata ${numeroAta}:`, error);
    return [];
  }
}
