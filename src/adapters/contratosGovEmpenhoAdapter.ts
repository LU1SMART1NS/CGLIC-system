/**
 * Adapter Oficial Contratos.gov.br para Empenhos (SaldoARP 3.0)
 * Responsável por consultar a API /api/contrato/{id}/empenhos e /consultar/{id}
 * e delegar para a normalização determinística em NormalizedEmpenho[].
 *
 * Invariante: Zero persistência, zero decisão de reconciliação, zero acesso direto ao banco.
 */

import { fetchContratosGovEmpenhos, fetchContratoEmpenhoDetalhe } from '../services/api';
import { normalizeFromContratosGov } from '../services/empenhoNormalizationService';
import type { NormalizedEmpenho } from '../types/empenhoSync';

export interface ContratosGovAdapterOptions {
  contratoId: number | string;
  contractKey: string;
  targetItemNum?: number;
  fetchDetails?: boolean;
  itemContext?: {
    numeroAta?: string;
    uasg?: string;
    numeroItem?: string;
  };
  unitPrice?: number;
  historicoPrecos?: Array<{ dataTermo: string; valorUnitario: number }>;
}

/**
 * Consulta e normaliza todos os empenhos do contrato via Contratos.gov.br
 */
export async function fetchAndNormalizeContratosGovEmpenhos(
  options: ContratosGovAdapterOptions
): Promise<NormalizedEmpenho[]> {
  const {
    contratoId,
    contractKey,
    targetItemNum,
    fetchDetails = true,
    itemContext,
    unitPrice,
    historicoPrecos
  } = options;

  if (!contratoId || !contractKey) {
    return [];
  }

  try {
    const rawEmpenhos = await fetchContratosGovEmpenhos(contratoId);
    if (!Array.isArray(rawEmpenhos) || rawEmpenhos.length === 0) {
      return [];
    }

    const normalizedList: NormalizedEmpenho[] = [];

    for (const emp of rawEmpenhos) {
      let enrichedEmp = { ...emp };

      // Se solicitado, busca detalhes individuais na minuta para obter quantidade física
      if (fetchDetails && emp.id) {
        try {
          const detalhe = await fetchContratoEmpenhoDetalhe(emp.id);
          if (detalhe && detalhe.itens_minuta) {
            enrichedEmp.itens_minuta = detalhe.itens_minuta;
          }
        } catch (detailErr) {
          // Continua com o registro base se falhar detalhe da minuta
          console.warn(`[ContratosGovEmpenhoAdapter] Detalhe de empenho ${emp.id} não obtido:`, detailErr);
        }
      }

      const normalized = normalizeFromContratosGov(enrichedEmp, {
        contractKey,
        targetItemNum,
        itemContext,
        unitPrice,
        historicoPrecos
      });

      normalizedList.push(normalized);
    }

    return normalizedList;
  } catch (error) {
    console.warn(`[ContratosGovEmpenhoAdapter] Falha ao consultar empenhos do contrato ${contratoId}:`, error);
    return [];
  }
}
