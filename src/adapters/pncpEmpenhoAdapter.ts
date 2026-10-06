/**
 * Adapter Oficial PNCP para Empenhos (CGLIC 3.0)
 * Responsável por consultar a API /api/pncp/v1/orgaos/{cnpj}/contratos/{ano}/{seq}/empenhos
 * e delegar para a normalização determinística em NormalizedEmpenho[].
 *
 * Invariante: Zero persistência, zero decisão de reconciliação, zero acesso direto ao banco.
 * Falha da fonte (rede, tempo, 429 ou 5xx) é propagada como exceção.
 */

import { fetchPncpContractEmpenhos } from '../services/api';
import { normalizeFromPncp } from '../services/empenhoNormalizationService';
import type { NormalizedEmpenho } from '../types/empenhoSync';

export interface PncpAdapterOptions {
  cnpj: string;
  ano: string | number;
  sequencialContrato: string | number;
  contractKey: string;
  uasg?: string;
}

/**
 * Consulta e normaliza todos os empenhos do contrato via PNCP. Lança erro quando a fonte falha.
 */
export async function fetchAndNormalizePncpEmpenhos(
  options: PncpAdapterOptions
): Promise<NormalizedEmpenho[]> {
  const { cnpj, ano, sequencialContrato, contractKey, uasg } = options;

  if (!cnpj || !ano || !sequencialContrato || !contractKey) {
    return [];
  }

  const rawEmpenhos = await fetchPncpContractEmpenhos(cnpj, String(ano), String(sequencialContrato));
  if (!Array.isArray(rawEmpenhos) || rawEmpenhos.length === 0) {
    return [];
  }

  return rawEmpenhos.map((emp) =>
    normalizeFromPncp(emp, {
      contractKey,
      uasg,
      ano: typeof ano === 'number' ? ano : parseInt(String(ano), 10)
    })
  );
}
