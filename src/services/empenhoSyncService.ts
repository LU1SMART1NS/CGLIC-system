/**
 * Serviço Soberano de Sincronização e Reconciliação de Empenhos (SaldoARP 3.0)
 * Orquestra o fluxo completo: Adapters -> Normalização -> Reconciliação -> M17 RPCs -> M16 SSOT.
 *
 * Invariante Inviolável: Toda persistência é realizada EXCLUSIVAMENTE via RPCs M17
 * (save_empenho_soberano_atomic, link_empenho_to_item_atomic, link_empenho_to_contract_atomic).
 * Zero INSERT/UPDATE direto em tabelas M16.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { fetchAndNormalizeComprasGovEmpenhos } from '../adapters/comprasGovEmpenhoAdapter';
import { fetchAndNormalizeContratosGovEmpenhos } from '../adapters/contratosGovEmpenhoAdapter';
import { fetchAndNormalizePncpEmpenhos } from '../adapters/pncpEmpenhoAdapter';
import { reconcileNormalizedEmpenhos } from './empenhoReconciliationService';
import type {
  NormalizedEmpenho,
  EmpenhoReconciliado,
  EmpenhoSyncSummary
} from '../types/empenhoSync';

export interface SyncItemEmpenhosOptions {
  numeroAta: string;
  uasg: string;
  numeroItem?: string;
  unitPrice?: number;
  contracts?: Array<{
    contratoId?: number | string;
    contractKey: string;
    cnpj?: string;
    ano?: number | string;
    sequencialContrato?: number | string;
    unitPrice?: number;
    historicoPrecos?: Array<{ dataTermo: string; valorUnitario: number }>;
  }>;
}

/**
 * Persiste um único empenho reconciliado utilizando exclusivamente as RPCs M17
 */
export async function persistReconciledEmpenhoM17(
  reconciled: EmpenhoReconciliado
): Promise<{
  success: boolean;
  empenho_id: string;
  is_new: boolean;
  items_linked: number;
  contracts_linked: number;
}> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(
      new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado para persistência M17')
    );
  }

  // 1. Persistência Soberana da Nota de Empenho (M17: save_empenho_soberano_atomic)
  const p_empenho = {
    uasg_emitente: reconciled.uasg,
    ano_exercicio: reconciled.ano,
    numero_oficial: reconciled.numero_oficial,
    numero_normalizado: reconciled.numero_normalizado,
    data_emissao: reconciled.data_emissao,
    fonte_origem: reconciled.fonte_origem,
    valor_empenhado: reconciled.valor_empenhado,
    valor_liquidado: reconciled.valor_liquidado,
    valor_pago: reconciled.valor_pago,
    valor_rpinscrito: reconciled.valor_rpinscrito,
    credor_nome: reconciled.credor_nome || null,
    credor_cnpj_cpf: reconciled.credor_cnpj_cpf || null,
    situacao: reconciled.situacao || null,
    identificador_fonte: reconciled.identificador_fonte || null,
    url_oficial: reconciled.url_oficial || null
  };

  const { data: saveResult, error: saveError } = await supabase.rpc('save_empenho_soberano_atomic', {
    p_empenho
  });

  if (saveError) {
    throw mapPostgresErrorToAppError(saveError);
  }

  const empenhoId = saveResult?.empenho?.id;
  if (!empenhoId) {
    throw mapPostgresErrorToAppError(
      new Error('INVALID_PAYLOAD: save_empenho_soberano_atomic não retornou o UUID do empenho')
    );
  }

  const isNew = Boolean(saveResult?.is_new);
  let itemsLinked = 0;
  let contractsLinked = 0;

  // 2. Vínculo Físico Quantitativo com Itens de Ata (M17: link_empenho_to_item_atomic)
  for (const itemLink of reconciled.item_links) {
    const { error: linkItemError } = await supabase.rpc('link_empenho_to_item_atomic', {
      p_item_key: itemLink.item_key,
      p_empenho_id: empenhoId,
      p_quantidade_consumida: itemLink.quantidade_consumida,
      p_tipo_consumo: itemLink.tipo_consumo || 'ORDINARIO',
      p_numero_item_minuta: itemLink.numero_item_minuta || null,
      p_observacoes: itemLink.observacoes || null
    });

    if (linkItemError) {
      console.warn(`[EmpenhoSyncService] Falha ao vincular empenho ${empenhoId} ao item ${itemLink.item_key}:`, linkItemError);
    } else {
      itemsLinked++;
    }
  }

  // 3. Vínculo Financeiro de Lastro com Contratos (M17: link_empenho_to_contract_atomic)
  for (const contractLink of reconciled.contract_links) {
    const { error: linkContractError } = await supabase.rpc('link_empenho_to_contract_atomic', {
      p_contract_key: contractLink.contract_key,
      p_empenho_id: empenhoId,
      p_valor_vinculado: contractLink.valor_vinculado ?? null
    });

    if (linkContractError) {
      console.warn(`[EmpenhoSyncService] Falha ao vincular empenho ${empenhoId} ao contrato ${contractLink.contract_key}:`, linkContractError);
    } else {
      contractsLinked++;
    }
  }

  return {
    success: true,
    empenho_id: empenhoId,
    is_new: isNew,
    items_linked: itemsLinked,
    contracts_linked: contractsLinked
  };
}

/**
 * Executa o sync em lote de uma lista de empenhos reconciliados
 */
export async function syncReconciledBatch(
  reconciledList: EmpenhoReconciliado[]
): Promise<EmpenhoSyncSummary> {
  let totalSalvos = 0;
  let totalItensVinculados = 0;
  let totalContratosVinculados = 0;
  let totalConflitos = 0;
  const erros: Array<{ canonical_key?: string; erro: string }> = [];

  for (const rec of reconciledList) {
    totalConflitos += rec.conflitos.length;
    try {
      const result = await persistReconciledEmpenhoM17(rec);
      if (result.success) {
        totalSalvos++;
        totalItensVinculados += result.items_linked;
        totalContratosVinculados += result.contracts_linked;
      }
    } catch (err: any) {
      erros.push({
        canonical_key: rec.canonical_key,
        erro: err?.message || 'Falha desconhecida na persistência M17'
      });
    }
  }

  return {
    total_processados: reconciledList.length,
    total_salvos: totalSalvos,
    total_itens_vinculados: totalItensVinculados,
    total_contratos_vinculados: totalContratosVinculados,
    total_conflitos: totalConflitos,
    erros,
    reconciliados: reconciledList
  };
}

/**
 * Orquestrador central: consulta todas as fontes para um Item de Ata,
 * normaliza, reconcilia e persiste de forma determinística via M17.
 */
export async function syncEmpenhosForItem(
  options: SyncItemEmpenhosOptions
): Promise<EmpenhoSyncSummary> {
  const { numeroAta, uasg, numeroItem, contracts = [], unitPrice } = options;

  const allNormalized: NormalizedEmpenho[] = [];

  // 1. Leitura e normalização de Compras.gov.br
  const comprasGovEmpenhos = await fetchAndNormalizeComprasGovEmpenhos({
    numeroAta,
    uasg,
    numeroItem
  });
  allNormalized.push(...comprasGovEmpenhos);

  // 2. Leitura e normalização de Contratos.gov.br e PNCP para cada contrato vinculado
  for (const c of contracts) {
    if (c.contratoId) {
      const targetNum = numeroItem ? parseInt(numeroItem, 10) : undefined;
      const contratosGovEmpenhos = await fetchAndNormalizeContratosGovEmpenhos({
        contratoId: c.contratoId,
        contractKey: c.contractKey,
        targetItemNum: targetNum,
        itemContext: { numeroAta, uasg, numeroItem },
        unitPrice: c.unitPrice ?? unitPrice,
        historicoPrecos: c.historicoPrecos
      });
      allNormalized.push(...contratosGovEmpenhos);
    }

    if (c.cnpj && c.ano && c.sequencialContrato) {
      const pncpEmpenhos = await fetchAndNormalizePncpEmpenhos({
        cnpj: c.cnpj,
        ano: c.ano,
        sequencialContrato: c.sequencialContrato,
        contractKey: c.contractKey,
        uasg
      });
      allNormalized.push(...pncpEmpenhos);
    }
  }

  // 3. Reconciliação determinística campo a campo
  const reconciledList = reconcileNormalizedEmpenhos(allNormalized);

  // 4. Persistência via M17
  return syncReconciledBatch(reconciledList);
}
