/**
 * Empenhos de um item da Ata = empenhos dos contratos vinculados a ele.
 *
 * Para cada contrato vinculado, lê os empenhos do contrato no Contratos.gov.br com a minuta
 * (itens do empenho) e decide, para o item, o que cada empenho é:
 *  - a minuta tem a linha do item: quantidade oficial (fonte API);
 *  - a minuta existe mas não cita o item: o empenho é de outro item do contrato e é ignorado;
 *  - não há minuta: o empenho fica pendente de quantidade, com a estimativa por valor só como sugestão.
 * Depois persiste os empenhos e substitui o conjunto do par (item, contrato) no banco.
 */
import { fetchContratosGovData, fetchContratosGovEmpenhos, fetchContratoEmpenhoDetalhe } from './api';
import { normalizeFromContratosGov } from './empenhoNormalizationService';
import { deduceEmpenhoQuantity } from './balanceService';
import { saveEmpenhoSoberanoM17 } from './empenhoSyncService';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import {
  syncItemContractEmpenhosRpc,
  type ItemContractEmpenhoInput
} from '../adapters/empenhoItemRpcAdapter';
import type { ContratosGovEmpenhoRecord } from '../types';
import type { NormalizedEmpenho } from '../types/empenhoSync';
import { normalizeItemKey } from '../utils/itemKeyUtils';

export interface ItemContractEmpenhoDecision {
  empenho: NormalizedEmpenho;
  /** Quantidade oficial da minuta; nula quando a API não trouxe a linha do item. */
  quantidade: number | null;
  /** Estimativa por valor, só quando não há quantidade oficial. */
  quantidadeSugerida: number | null;
  numeroItemMinuta?: string;
}

export interface ClassifyOptions {
  /** Número do item da ata (igual ao `numero_item_compra` da minuta). */
  targetItemNum: number;
  /** UASG do contrato, usada quando o empenho não informa a unidade gestora. */
  fallbackUasg: string;
  contractKey: string;
  unitPrice?: number;
  historicoPrecos?: Array<{ dataTermo: string; valorUnitario: number }>;
}

/**
 * Decide o que cada empenho do contrato é para o item. Função pura.
 * Os registros devem trazer `itens_minuta` quando a API a informar.
 */
export function classifyContractEmpenhosForItem(
  records: ContratosGovEmpenhoRecord[],
  options: ClassifyOptions
): ItemContractEmpenhoDecision[] {
  const decisions: ItemContractEmpenhoDecision[] = [];

  for (const record of records) {
    const withUasg: ContratosGovEmpenhoRecord = {
      ...record,
      unidade_gestora: record.unidade_gestora || options.fallbackUasg
    };
    // Sem contexto de item o normalizador não calcula vínculos de item; a decisão é toda daqui.
    const normalized = normalizeFromContratosGov(withUasg, { contractKey: options.contractKey });

    const minuta = Array.isArray(record.itens_minuta) ? record.itens_minuta : [];
    let quantidade: number | null = null;
    let numeroItemMinuta: string | undefined;

    if (minuta.length > 0) {
      const line = minuta.find((i) => parseInt(String(i.numero_item_compra ?? '0'), 10) === options.targetItemNum);
      if (!line) continue; // empenho de outro item do contrato
      numeroItemMinuta = line.numero_item_compra;
      if (typeof line.quantidade === 'number') quantidade = line.quantidade;
    }

    let quantidadeSugerida: number | null = null;
    if (quantidade === null && options.unitPrice && (normalized.valor_empenhado ?? 0) > 0) {
      const deduction = deduceEmpenhoQuantity(
        normalized.valor_empenhado as number,
        options.unitPrice,
        normalized.data_emissao,
        options.historicoPrecos
      );
      if (deduction.quantidade > 0) quantidadeSugerida = deduction.quantidade;
    }

    decisions.push({ empenho: normalized, quantidade, quantidadeSugerida, numeroItemMinuta });
  }

  return decisions;
}

async function linkEmpenhoToContract(contractKey: string, empenhoId: string, valor?: number): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.rpc('link_empenho_to_contract_atomic', {
    p_contract_key: contractKey,
    p_empenho_id: empenhoId,
    p_valor_vinculado: valor && valor > 0 ? valor : null
  });
  // Sem o vínculo, a aba Financeiro do contrato não mostra o empenho: interrompe antes de mexer no item.
  if (error) {
    throw new Error(`Empenho gravado, mas não vinculado ao contrato ${contractKey}: ${mapPostgresErrorToAppError(error).message}`);
  }
}

export interface SyncItemContractEmpenhosParams {
  numeroAta: string;
  /** UASG gerenciadora da ata (compõe a chave do item). */
  uasg: string;
  numeroItem: string;
  contract: {
    contractKey: string;
    uasg: string;
    numero: string;
    ano: string | number;
    /** ID numérico do contrato no Contratos.gov.br, quando já conhecido. */
    contratoId?: number | string;
  };
  unitPrice?: number;
  historicoPrecos?: Array<{ dataTermo: string; valorUnitario: number }>;
}

export interface SyncItemContractEmpenhosSummary {
  /** Empenhos que a API devolveu para o contrato. */
  lidos: number;
  sincronizados: number;
  removidos: number;
  pendentes: number;
  ignorados: number;
}

/**
 * Sincroniza os empenhos de UM contrato vinculado para UM item: lê o Contratos.gov.br,
 * grava os empenhos e substitui o conjunto do par (item, contrato).
 */
export async function syncItemContractEmpenhos(params: SyncItemContractEmpenhosParams): Promise<SyncItemContractEmpenhosSummary> {
  const { numeroAta, uasg, numeroItem, contract, unitPrice, historicoPrecos } = params;
  const itemKey = normalizeItemKey(numeroAta, uasg, numeroItem);

  let contratoId = contract.contratoId;
  if (!contratoId) {
    const gov = await fetchContratosGovData(contract.uasg, contract.numero, contract.ano);
    contratoId = gov.contratoId;
  }
  if (!contratoId) {
    throw new Error('Contrato não encontrado no Contratos.gov.br: não foi possível ler os empenhos dele.');
  }

  const rawEmpenhos = await fetchContratosGovEmpenhos(contratoId);
  const records: ContratosGovEmpenhoRecord[] = [];
  // A minuta (itens do empenho) exige token no Contratos.gov. Se a primeira consulta não a devolve,
  // não repete a chamada para os demais empenhos do contrato.
  let minutaDisponivel = true;
  for (const emp of Array.isArray(rawEmpenhos) ? rawEmpenhos : []) {
    let enriched: ContratosGovEmpenhoRecord = { ...emp };
    if (emp.id && minutaDisponivel) {
      try {
        const detalhe = await fetchContratoEmpenhoDetalhe(emp.id);
        if (detalhe?.itens_minuta) enriched = { ...enriched, itens_minuta: detalhe.itens_minuta };
        else if (!detalhe) minutaDisponivel = false;
      } catch (err) {
        minutaDisponivel = false;
        console.warn(`[itemContractEmpenhoService] Minuta do empenho ${emp.id} não obtida:`, err);
      }
    }
    records.push(enriched);
  }

  const decisions = classifyContractEmpenhosForItem(records, {
    targetItemNum: parseInt(numeroItem, 10),
    fallbackUasg: contract.uasg,
    contractKey: contract.contractKey,
    unitPrice,
    historicoPrecos
  });

  const inputs: ItemContractEmpenhoInput[] = [];
  for (const d of decisions) {
    if (!d.empenho.data_emissao) {
      console.warn(`[itemContractEmpenhoService] Empenho ${d.empenho.numero_oficial} sem data de emissão: ignorado.`);
      continue;
    }
    let empenhoId: string;
    try {
      ({ empenhoId } = await saveEmpenhoSoberanoM17(d.empenho));
    } catch (err: any) {
      // Não envia lista parcial: a RPC substitui o conjunto do par e removeria empenhos já gravados.
      throw new Error(`Empenho ${d.empenho.numero_oficial} não pôde ser gravado (${inputs.length} de ${decisions.length} gravados): ${err?.message || err}`);
    }
    // O empenho também é do contrato: o vínculo faz a aba Financeiro do Contrato ler o mesmo registro gravado aqui.
    await linkEmpenhoToContract(contract.contractKey, empenhoId, d.empenho.valor_empenhado);
    inputs.push({
      empenhoId,
      quantidade: d.quantidade,
      quantidadeSugerida: d.quantidadeSugerida,
      numeroItemMinuta: d.numeroItemMinuta
    });
  }

  console.info(
    `[itemContractEmpenhoService] ${contract.contractKey} x item ${numeroItem}: lidos=${records.length} classificados=${decisions.length} a gravar=${inputs.length}`
  );

  const result = await syncItemContractEmpenhosRpc({
    itemKey,
    contractKey: contract.contractKey,
    empenhos: inputs
  });

  return {
    lidos: records.length,
    sincronizados: result.sincronizados,
    removidos: result.removidos,
    pendentes: result.pendentes,
    ignorados: records.length - decisions.length
  };
}

/** Remove do item os empenhos que um contrato trouxe (ao desvincular o contrato do item). */
export async function removeItemContractEmpenhos(itemKey: string, contractKey: string): Promise<number> {
  const result = await syncItemContractEmpenhosRpc({ itemKey, contractKey, empenhos: [] });
  return result.removidos;
}
