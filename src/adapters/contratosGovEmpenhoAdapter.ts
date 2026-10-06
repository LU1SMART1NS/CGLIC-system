/**
 * Adapter Oficial Contratos.gov.br para Empenhos (CGLIC 3.0)
 * Responsável por consultar a API /api/contrato/{id}/empenhos e /consultar/{id}
 * e delegar para a normalização determinística em NormalizedEmpenho[].
 *
 * Invariante: Zero persistência, zero decisão de reconciliação, zero acesso direto ao banco.
 * Falha da fonte (rede, tempo, HTTP de erro) é propagada como exceção: lista vazia significa
 * que o Contratos.gov.br respondeu que o contrato não tem empenho.
 */

import { fetchContratosGovEmpenhos, fetchContratoEmpenhoDetalhe } from '../services/api';
import { normalizeFromContratosGov } from '../services/empenhoNormalizationService';
import type { NormalizedEmpenho } from '../types/empenhoSync';

export interface ContratosGovAdapterOptions {
  contratoId: number | string;
  contractKey: string;
  targetItemNum?: number;
  /**
   * Busca a minuta (itens) de cada empenho. Padrão: só quando há `itemContext`, porque a minuta
   * só serve para a quantidade do item; no fluxo do contrato ela não é usada.
   */
  fetchDetails?: boolean;
  itemContext?: {
    numeroAta?: string;
    uasg?: string;
    numeroItem?: string;
  };
  unitPrice?: number;
  historicoPrecos?: Array<{ dataTermo: string; valorUnitario: number }>;
  /** UASG do contrato: compõe a chave do empenho que vier sem unidade gestora emitente. */
  uasgFallback?: string;
}

/**
 * Consulta e normaliza todos os empenhos do contrato via Contratos.gov.br.
 * Lança erro quando a fonte falha.
 */
export async function fetchAndNormalizeContratosGovEmpenhos(
  options: ContratosGovAdapterOptions
): Promise<NormalizedEmpenho[]> {
  const {
    contratoId,
    contractKey,
    targetItemNum,
    itemContext,
    unitPrice,
    historicoPrecos,
    uasgFallback
  } = options;
  const fetchDetails = options.fetchDetails ?? Boolean(itemContext);

  if (!contratoId || !contractKey) {
    return [];
  }

  const rawEmpenhos = await fetchContratosGovEmpenhos(contratoId);
  if (rawEmpenhos.length === 0) {
    return [];
  }

  const normalizedList: NormalizedEmpenho[] = [];
  // A minuta exige token no Contratos.gov.br: se a primeira não vem, não insiste nos demais empenhos.
  let minutaDisponivel = fetchDetails;

  for (const emp of rawEmpenhos) {
    const enrichedEmp = { ...emp };

    if (minutaDisponivel && emp.id) {
      try {
        const detalhe = await fetchContratoEmpenhoDetalhe(emp.id);
        if (detalhe && detalhe.itens_minuta) {
          enrichedEmp.itens_minuta = detalhe.itens_minuta;
        } else if (!detalhe) {
          minutaDisponivel = false;
        }
      } catch (detailErr) {
        minutaDisponivel = false;
        console.warn(`[ContratosGovEmpenhoAdapter] Detalhe de empenho ${emp.id} não obtido:`, detailErr);
      }
    }

    normalizedList.push(
      normalizeFromContratosGov(enrichedEmp, {
        contractKey,
        targetItemNum,
        itemContext,
        unitPrice,
        historicoPrecos,
        uasgFallback
      })
    );
  }

  return normalizedList;
}
