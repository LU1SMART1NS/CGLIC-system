/**
 * Serviço Soberano de Sincronização e Reconciliação de Empenhos (CGLIC 3.0)
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

/** Campos mínimos de um empenho para a persistência soberana (M17: save_empenho_soberano_atomic). */
export interface EmpenhoSoberanoInput {
  uasg: string;
  ano: number;
  numero_oficial: string;
  numero_normalizado: string;
  data_emissao?: string;
  fonte_origem: NormalizedEmpenho['fonte_origem'];
  valor_empenhado?: number;
  valor_liquidado?: number;
  valor_pago?: number;
  valor_rpinscrito?: number;
  credor_nome?: string;
  credor_cnpj_cpf?: string;
  situacao?: string;
  identificador_fonte?: string;
  url_oficial?: string;
}

/**
 * Grava (ou atualiza) a Nota de Empenho soberana e devolve seu UUID.
 * Não cria nenhum vínculo com item ou contrato.
 */
export async function saveEmpenhoSoberanoM17(empenho: EmpenhoSoberanoInput): Promise<{ empenhoId: string; isNew: boolean }> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(
      new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado para persistência M17')
    );
  }

  const p_empenho = {
    uasg_emitente: empenho.uasg,
    ano_exercicio: empenho.ano,
    numero_oficial: empenho.numero_oficial,
    numero_normalizado: empenho.numero_normalizado,
    data_emissao: empenho.data_emissao,
    fonte_origem: empenho.fonte_origem,
    valor_empenhado: empenho.valor_empenhado ?? 0,
    valor_liquidado: empenho.valor_liquidado ?? 0,
    valor_pago: empenho.valor_pago ?? 0,
    valor_rpinscrito: empenho.valor_rpinscrito ?? 0,
    credor_nome: empenho.credor_nome || null,
    credor_cnpj_cpf: empenho.credor_cnpj_cpf || null,
    situacao: empenho.situacao || null,
    identificador_fonte: empenho.identificador_fonte || null,
    url_oficial: empenho.url_oficial || null
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

  return { empenhoId, isNew: Boolean(saveResult?.is_new) };
}

/**
 * Persiste um único empenho reconciliado utilizando exclusivamente as RPCs M17
 */
export interface PersistOptions {
  /**
   * Vincula cada empenho aos contratos dele, um por vez (padrão). O fluxo do contrato desliga e grava o
   * conjunto inteiro de uma vez com syncContractEmpenhosM17, que também remove os ausentes.
   */
  vincularContratos?: boolean;
}

export async function persistReconciledEmpenhoM17(
  reconciled: EmpenhoReconciliado,
  opts: PersistOptions = {}
): Promise<{
  success: boolean;
  empenho_id: string;
  is_new: boolean;
  items_linked: number;
  contracts_linked: number;
  /** Vínculos que a RPC recusou: o empenho foi gravado, mas não ficou ligado ao item/contrato. */
  falhas_vinculo: string[];
}> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(
      new Error('NETWORK_OR_CONFIG_ERROR: Supabase não está configurado para persistência M17')
    );
  }

  // 1. Persistência Soberana da Nota de Empenho (M17: save_empenho_soberano_atomic)
  const { empenhoId, isNew } = await saveEmpenhoSoberanoM17(reconciled);
  let itemsLinked = 0;
  let contractsLinked = 0;
  const falhasVinculo: string[] = [];

  // 2. Vínculo Físico Quantitativo com Itens de Ata (M17: link_empenho_to_item_atomic)
  for (const itemLink of reconciled.item_links) {
    // Quantidade deduzida por valor é estimativa: não vira consumo oficial do item (fica como sugestão no fluxo por contrato).
    if (itemLink.is_deduzido) continue;
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
      falhasVinculo.push(
        `Empenho ${reconciled.numero_oficial} gravado, mas não vinculado ao item ${itemLink.item_key}: ${mapPostgresErrorToAppError(linkItemError).message}`
      );
    } else {
      itemsLinked++;
    }
  }

  // 3. Vínculo Financeiro de Lastro com Contratos (M17: link_empenho_to_contract_atomic)
  for (const contractLink of opts.vincularContratos === false ? [] : reconciled.contract_links) {
    const { error: linkContractError } = await supabase.rpc('link_empenho_to_contract_atomic', {
      p_contract_key: contractLink.contract_key,
      p_empenho_id: empenhoId,
      // 0 é valor (NE anulada): só undefined vira NULL, que mantém o valor anterior.
      p_valor_vinculado: contractLink.valor_vinculado ?? null
    });

    if (linkContractError) {
      console.warn(`[EmpenhoSyncService] Falha ao vincular empenho ${empenhoId} ao contrato ${contractLink.contract_key}:`, linkContractError);
      falhasVinculo.push(
        `Empenho ${reconciled.numero_oficial} gravado, mas não vinculado ao contrato ${contractLink.contract_key}: ${mapPostgresErrorToAppError(linkContractError).message}`
      );
    } else {
      contractsLinked++;
    }
  }

  return {
    success: true,
    empenho_id: empenhoId,
    is_new: isNew,
    items_linked: itemsLinked,
    contracts_linked: contractsLinked,
    falhas_vinculo: falhasVinculo
  };
}

/**
 * Executa o sync em lote de uma lista de empenhos reconciliados
 */
export async function syncReconciledBatch(
  reconciledList: EmpenhoReconciliado[],
  opts: PersistOptions = {}
): Promise<EmpenhoSyncSummary> {
  const idsPorChave: Record<string, string> = {};
  let totalSalvos = 0;
  let totalItensVinculados = 0;
  let totalContratosVinculados = 0;
  let totalConflitos = 0;
  const erros: Array<{ canonical_key?: string; erro: string }> = [];

  for (const rec of reconciledList) {
    totalConflitos += rec.conflitos.length;
    try {
      const result = await persistReconciledEmpenhoM17(rec, opts);
      if (result.success) {
        idsPorChave[rec.canonical_key] = result.empenho_id;
        totalSalvos++;
        totalItensVinculados += result.items_linked;
        totalContratosVinculados += result.contracts_linked;
      }
      for (const falha of result.falhas_vinculo ?? []) {
        erros.push({ canonical_key: rec.canonical_key, erro: falha });
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
    reconciliados: reconciledList,
    ids_por_chave: idsPorChave
  };
}

export interface SyncContractEmpenhosRpcResult {
  inseridos: number;
  atualizados: number;
  removidos: number;
  removidos_numeros: string[];
  /** Vínculos que não foram removidos porque a fonte devolveu lista vazia. */
  remocao_bloqueada: number;
  /** NEs que a fonte lista no contrato, mas a equipe descartou (migration 85): não vinculadas. */
  ignorados_descartados?: number;
  ignorados_numeros?: string[];
  /** Vínculos feitos à mão que a fonte passou a listar (viraram FONTE). */
  promovidos?: number;
}

/** A RPC não existe no banco (migration ainda não aplicada): PostgREST responde PGRST202. */
export function rpcInexistente(err: any): boolean {
  const details = err?.details ?? err;
  return details?.code === 'PGRST202' || /Could not find the function/i.test(String(details?.message ?? err?.message ?? ''));
}

/**
 * Vincula os empenhos ao contrato um por vez (link_empenho_to_contract_atomic), sem remover nada.
 * Usado enquanto a migration 81 não está aplicada. Devolve as falhas.
 */
export async function vincularEmpenhosAoContratoUmAUm(
  contractKey: string,
  empenhos: Array<{ empenho_id: string; valor_vinculado: number; numero?: string }>
): Promise<{ vinculados: number; falhas: string[] }> {
  if (!isSupabaseConfigured || !supabase) return { vinculados: 0, falhas: [] };
  let vinculados = 0;
  const falhas: string[] = [];
  for (const e of empenhos) {
    const { error } = await supabase.rpc('link_empenho_to_contract_atomic', {
      p_contract_key: contractKey,
      p_empenho_id: e.empenho_id,
      p_valor_vinculado: e.valor_vinculado
    });
    if (error) {
      falhas.push(`Empenho ${e.numero ?? e.empenho_id} gravado, mas não vinculado ao contrato ${contractKey}: ${mapPostgresErrorToAppError(error).message}`);
    } else {
      vinculados++;
    }
  }
  return { vinculados, falhas };
}

/**
 * Grava a natureza de despesa e o plano interno dos empenhos (migration 87). Devolve quantos foram atualizados;
 * null sem Supabase configurado.
 */
export async function gravarClassificacaoEmpenhos(
  itens: Array<{ empenho_id: string; natureza_despesa?: string; plano_interno?: string }>
): Promise<number | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const comDados = itens.filter((i) => i.natureza_despesa || i.plano_interno);
  if (comDados.length === 0) return 0;
  const { data, error } = await supabase.rpc('gravar_classificacao_empenhos', { p_itens: comDados });
  if (error) throw Object.assign(mapPostgresErrorToAppError(error), { details: error });
  return Number(data ?? 0);
}

/**
 * Grava de uma vez o conjunto de empenhos do contrato (migration 81: sync_contract_empenhos_atomic):
 * insere, atualiza o valor (inclusive para 0) e, com `removerAusentes`, remove os que não vieram.
 * Devolve null sem Supabase configurado; lança o erro da RPC já traduzido.
 */
export async function syncContractEmpenhosM17(
  contractKey: string,
  empenhos: Array<{ empenho_id: string; valor_vinculado: number }>,
  removerAusentes: boolean
): Promise<SyncContractEmpenhosRpcResult | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.rpc('sync_contract_empenhos_atomic', {
    p_contract_key: contractKey,
    p_empenhos: empenhos,
    p_remover_ausentes: removerAusentes
  });
  if (error) throw Object.assign(mapPostgresErrorToAppError(error), { details: error });
  return {
    inseridos: Number(data?.inseridos ?? 0),
    atualizados: Number(data?.atualizados ?? 0),
    removidos: Number(data?.removidos ?? 0),
    removidos_numeros: Array.isArray(data?.removidos_numeros) ? data.removidos_numeros.map(String) : [],
    remocao_bloqueada: Number(data?.remocao_bloqueada ?? 0),
    ignorados_descartados: Number(data?.ignorados_descartados ?? 0),
    ignorados_numeros: Array.isArray(data?.ignorados_numeros) ? data.ignorados_numeros.map(String) : [],
    promovidos: Number(data?.promovidos ?? 0)
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

  // 2. Leitura e normalização de Contratos.gov.br para cada contrato vinculado
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

    // O PNCP não entra: ele não informa a UASG emitente, e gravar o que vem dele criaria a NE com
    // chave errada. A conferência com o PNCP fica no fluxo do contrato (empenhoOrchestrationService).
  }

  // 3. Reconciliação determinística campo a campo
  const reconciledList = reconcileNormalizedEmpenhos(allNormalized);

  // 4. Persistência via M17
  return syncReconciledBatch(reconciledList);
}
