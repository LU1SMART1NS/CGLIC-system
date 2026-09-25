/**
 * Serviço de Orquestração On-Demand de Sincronização de Empenhos (SaldoARP 3.0)
 * Coordenador central do fluxo: Alvo -> Fontes Oficiais -> Adapters -> Normalização -> Reconciliação -> M17 -> M16.
 *
 * Invariantes Invioláveis:
 * 1. O orquestrador NÃO cria nova lógica de negócio, delegando estritamente aos serviços homologados.
 * 2. Toda persistência ocorre EXCLUSIVAMENTE através das RPCs M17 via empenhoSyncService.
 * 3. Separação Ontológica Ata ≠ Contrato estritamente preservada.
 * 4. Zero persistência paralela, zero segundo SSOT, zero nova chave de negócio.
 */

import { parseItemKey, normalizeItemKey } from '../utils/itemKeyUtils';
import { fetchAndNormalizeComprasGovEmpenhos } from '../adapters/comprasGovEmpenhoAdapter';
import { fetchAndNormalizeContratosGovEmpenhos } from '../adapters/contratosGovEmpenhoAdapter';
import { fetchAndNormalizePncpEmpenhos } from '../adapters/pncpEmpenhoAdapter';
import { reconcileNormalizedEmpenhos } from './empenhoReconciliationService';
import { syncReconciledBatch } from './empenhoSyncService';
import type {
  OrchestrationTarget,
  ItemTarget,
  AtaTarget,
  ContractTarget,
  EmpenhoTarget,
  OrchestrationResult,
  OrchestrationStatus,
  NormalizedEmpenho,
  EmpenhoFonteOrigem,
  ConflitoCampo,
  VinculoPendente,
  EmpenhoSyncSummary
} from '../types/empenhoSync';

/**
 * 1. Orquestração On-Demand por Item de Ata de Registro de Preços
 */
export async function orchestrateItemEmpenhoSync(
  target: ItemTarget
): Promise<OrchestrationResult> {
  const executadoEm = new Date().toISOString();
  const parsed = parseItemKey(target.itemKey);

  const isValidItemKey = Boolean(
    target.itemKey &&
    target.itemKey.trim() !== '' &&
    target.itemKey.includes('-') &&
    parsed.numeroAta &&
    parsed.numeroAta.includes('/')
  );

  if (!isValidItemKey) {
    const emptySummary: EmpenhoSyncSummary = {
      total_processados: 0,
      total_salvos: 0,
      total_itens_vinculados: 0,
      total_contratos_vinculados: 0,
      total_conflitos: 0,
      erros: [{ erro: 'INVALID_ITEM_KEY: Chave de item inválida para orquestração on-demand' }],
      reconciliados: []
    };

    return {
      alvo: target,
      status: 'ERRO',
      fontes_consultadas: [],
      fontes_nao_aplicaveis: ['COMPRASNET', 'CONTRATOSNET', 'PNCP'],
      empenhos_encontrados: 0,
      empenhos_persistidos: 0,
      empenhos_atualizados: 0,
      vinculos_item_criados: 0,
      vinculos_contrato_criados: 0,
      divergencias: [],
      pendencias: [],
      erros: [{ origem: 'ORCHESTRATOR', erro: 'Chave de item inválida' }],
      resumo_sync: emptySummary,
      executado_em: executadoEm
    };
  }

  const allNormalized: NormalizedEmpenho[] = [];
  const fontesConsultadas: EmpenhoFonteOrigem[] = [];
  const fontesNaoAplicaveis: string[] = [];
  const erros: Array<{ origem?: string; erro: string }> = [];

  // A. Consulta Compras.gov.br (Fonte Primária de Consumo Físico)
  try {
    const comprasGovEmpenhos = await fetchAndNormalizeComprasGovEmpenhos({
      numeroAta: parsed.numeroAta,
      uasg: parsed.uasg,
      numeroItem: parsed.itemNum
    });
    fontesConsultadas.push('COMPRASNET');
    allNormalized.push(...comprasGovEmpenhos);
  } catch (err: any) {
    erros.push({ origem: 'COMPRASNET', erro: err?.message || 'Falha ao consultar Compras.gov' });
  }

  // B. Consulta Contratos Vinculados e PNCP
  if (target.contracts && target.contracts.length > 0) {
    for (const c of target.contracts) {
      if (c.contratoId) {
        try {
          const contratosGovEmpenhos = await fetchAndNormalizeContratosGovEmpenhos({
            contratoId: c.contratoId,
            contractKey: c.contractKey,
            targetItemNum: parsed.itemNumInteger,
            itemContext: {
              numeroAta: parsed.numeroAta,
              uasg: parsed.uasg,
              numeroItem: parsed.itemNum
            },
            unitPrice: c.unitPrice ?? target.unitPrice,
            historicoPrecos: c.historicoPrecos
          });
          if (!fontesConsultadas.includes('CONTRATOSNET')) {
            fontesConsultadas.push('CONTRATOSNET');
          }
          allNormalized.push(...contratosGovEmpenhos);
        } catch (err: any) {
          erros.push({ origem: 'CONTRATOSNET', erro: err?.message || `Falha no contrato ${c.contractKey}` });
        }
      }

      if (c.cnpj && c.ano && c.sequencialContrato) {
        try {
          const pncpEmpenhos = await fetchAndNormalizePncpEmpenhos({
            cnpj: c.cnpj,
            ano: c.ano,
            sequencialContrato: c.sequencialContrato,
            contractKey: c.contractKey,
            uasg: parsed.uasg
          });
          if (!fontesConsultadas.includes('PNCP')) {
            fontesConsultadas.push('PNCP');
          }
          allNormalized.push(...pncpEmpenhos);
        } catch (err: any) {
          erros.push({ origem: 'PNCP', erro: err?.message || `Falha PNCP contrato ${c.contractKey}` });
        }
      }
    }
  } else {
    fontesNaoAplicaveis.push('CONTRATOSNET (sem contratos vinculados)', 'PNCP (sem contratos vinculados)');
  }

  // C. Reconciliação Determinística por Precedência
  const reconciledList = reconcileNormalizedEmpenhos(allNormalized);

  // D. Persistência Exclusiva via M17
  const syncSummary = await syncReconciledBatch(reconciledList);

  // E. Consolidação de Conflitos e Pendências
  const divergencias: ConflitoCampo[] = [];
  const pendencias: VinculoPendente[] = [];
  for (const rec of reconciledList) {
    divergencias.push(...rec.conflitos);
    pendencias.push(...rec.vinculos_pendentes);
  }

  // F. Determinação do Status da Orquestração
  let status: OrchestrationStatus = 'SUCESSO';
  if (erros.length > 0 && syncSummary.total_salvos === 0 && allNormalized.length === 0) {
    status = 'ERRO';
  } else if (erros.length > 0 || (syncSummary.erros && syncSummary.erros.length > 0)) {
    status = 'SUCESSO_PARCIAL';
  } else if (allNormalized.length === 0) {
    status = 'SEM_DADOS';
  } else if (divergencias.length > 0) {
    status = 'COM_DIVERGENCIAS';
  }

  return {
    alvo: target,
    status,
    fontes_consultadas: fontesConsultadas,
    fontes_nao_aplicaveis: fontesNaoAplicaveis,
    empenhos_encontrados: allNormalized.length,
    empenhos_persistidos: syncSummary.total_salvos,
    empenhos_atualizados: syncSummary.total_processados - syncSummary.total_salvos,
    vinculos_item_criados: syncSummary.total_itens_vinculados,
    vinculos_contrato_criados: syncSummary.total_contratos_vinculados,
    divergencias,
    pendencias,
    erros,
    resumo_sync: syncSummary,
    executado_em: executadoEm
  };
}

/**
 * 2. Orquestração On-Demand por Ata de Registro de Preços Completa
 */
export async function orchestrateAtaEmpenhoSync(
  target: AtaTarget
): Promise<OrchestrationResult> {
  const executadoEm = new Date().toISOString();
  const { numeroAta, uasg, itemNumbers, concurrencyLimit = 3 } = target;

  if (!numeroAta || !uasg) {
    const emptySummary: EmpenhoSyncSummary = {
      total_processados: 0,
      total_salvos: 0,
      total_itens_vinculados: 0,
      total_contratos_vinculados: 0,
      total_conflitos: 0,
      erros: [{ erro: 'INVALID_ATA_IDENTIFIER: Número da Ata ou UASG não informados' }],
      reconciliados: []
    };

    return {
      alvo: target,
      status: 'ERRO',
      fontes_consultadas: [],
      fontes_nao_aplicaveis: ['COMPRASNET', 'CONTRATOSNET', 'PNCP'],
      empenhos_encontrados: 0,
      empenhos_persistidos: 0,
      empenhos_atualizados: 0,
      vinculos_item_criados: 0,
      vinculos_contrato_criados: 0,
      divergencias: [],
      pendencias: [],
      erros: [{ origem: 'ORCHESTRATOR', erro: 'Número de Ata ou UASG inválidos' }],
      resumo_sync: emptySummary,
      executado_em: executadoEm
    };
  }

  // Lista de itens a processar (se não informada, processa item 1 padrão como fallback)
  const itemsToProcess = (itemNumbers && itemNumbers.length > 0)
    ? itemNumbers
    : ['1'];

  const itemResults: OrchestrationResult[] = [];
  const batchSize = Math.max(1, concurrencyLimit);

  // Processamento em micro-lotes controlados para evitar saturação de taxa (HTTP 429)
  for (let i = 0; i < itemsToProcess.length; i += batchSize) {
    const chunk = itemsToProcess.slice(i, i + batchSize);
    const chunkPromises = chunk.map(itemNum => {
      const itemKey = normalizeItemKey(numeroAta, uasg, itemNum);
      return orchestrateItemEmpenhoSync({
        tipo: 'ITEM',
        itemKey
      });
    });

    const chunkResults = await Promise.all(chunkPromises);
    itemResults.push(...chunkResults);
  }

  // Consolidação de métricas
  const fontesConsultadas = Array.from(new Set(itemResults.flatMap(r => r.fontes_consultadas)));
  const fontesNaoAplicaveis = Array.from(new Set(itemResults.flatMap(r => r.fontes_nao_aplicaveis)));
  const divergencias = itemResults.flatMap(r => r.divergencias);
  const pendencias = itemResults.flatMap(r => r.pendencias);
  const erros = itemResults.flatMap(r => r.erros);

  let totalProcessados = 0;
  let totalSalvos = 0;
  let totalItensVinculados = 0;
  let totalContratosVinculados = 0;
  let totalConflitos = 0;
  const reconciliados = itemResults.flatMap(r => r.resumo_sync.reconciliados);

  for (const r of itemResults) {
    totalProcessados += r.resumo_sync.total_processados;
    totalSalvos += r.resumo_sync.total_salvos;
    totalItensVinculados += r.resumo_sync.total_itens_vinculados;
    totalContratosVinculados += r.resumo_sync.total_contratos_vinculados;
    totalConflitos += r.resumo_sync.total_conflitos;
  }

  const consolidatedSummary: EmpenhoSyncSummary = {
    total_processados: totalProcessados,
    total_salvos: totalSalvos,
    total_itens_vinculados: totalItensVinculados,
    total_contratos_vinculados: totalContratosVinculados,
    total_conflitos: totalConflitos,
    erros: itemResults.flatMap(r => r.resumo_sync.erros),
    reconciliados
  };

  const hasErrors = itemResults.some(r => r.status === 'ERRO' || r.status === 'SUCESSO_PARCIAL');
  const allEmpty = itemResults.every(r => r.status === 'SEM_DADOS');
  const allErrored = itemResults.every(r => r.status === 'ERRO');

  let status: OrchestrationStatus = 'SUCESSO';
  if (allErrored) {
    status = 'ERRO';
  } else if (hasErrors) {
    status = 'SUCESSO_PARCIAL';
  } else if (allEmpty) {
    status = 'SEM_DADOS';
  } else if (divergencias.length > 0) {
    status = 'COM_DIVERGENCIAS';
  }

  return {
    alvo: target,
    status,
    fontes_consultadas: fontesConsultadas,
    fontes_nao_aplicaveis: fontesNaoAplicaveis,
    empenhos_encontrados: itemResults.reduce((acc, curr) => acc + curr.empenhos_encontrados, 0),
    empenhos_persistidos: totalSalvos,
    empenhos_atualizados: totalProcessados - totalSalvos,
    vinculos_item_criados: totalItensVinculados,
    vinculos_contrato_criados: totalContratosVinculados,
    divergencias,
    pendencias,
    erros,
    resumo_sync: consolidatedSummary,
    executado_em: executadoEm
  };
}

/**
 * 3. Orquestração On-Demand por Contrato Administrativo
 */
export async function orchestrateContractEmpenhoSync(
  target: ContractTarget
): Promise<OrchestrationResult> {
  const executadoEm = new Date().toISOString();
  const { contractKey, contratoId, pncpParams, uasg, itemContext } = target;

  if (!contractKey) {
    const emptySummary: EmpenhoSyncSummary = {
      total_processados: 0,
      total_salvos: 0,
      total_itens_vinculados: 0,
      total_contratos_vinculados: 0,
      total_conflitos: 0,
      erros: [{ erro: 'INVALID_CONTRACT_KEY: contractKey não informada' }],
      reconciliados: []
    };

    return {
      alvo: target,
      status: 'ERRO',
      fontes_consultadas: [],
      fontes_nao_aplicaveis: ['CONTRATOSNET', 'PNCP'],
      empenhos_encontrados: 0,
      empenhos_persistidos: 0,
      empenhos_atualizados: 0,
      vinculos_item_criados: 0,
      vinculos_contrato_criados: 0,
      divergencias: [],
      pendencias: [],
      erros: [{ origem: 'ORCHESTRATOR', erro: 'Chave de contrato inválida' }],
      resumo_sync: emptySummary,
      executado_em: executadoEm
    };
  }

  const allNormalized: NormalizedEmpenho[] = [];
  const fontesConsultadas: EmpenhoFonteOrigem[] = [];
  const fontesNaoAplicaveis: string[] = ['COMPRASNET (consulta contratual direta)'];
  const erros: Array<{ origem?: string; erro: string }> = [];

  // A. Consulta Contratos.gov.br
  if (contratoId) {
    try {
      const contratosGovEmpenhos = await fetchAndNormalizeContratosGovEmpenhos({
        contratoId,
        contractKey,
        itemContext
      });
      fontesConsultadas.push('CONTRATOSNET');
      allNormalized.push(...contratosGovEmpenhos);
    } catch (err: any) {
      erros.push({ origem: 'CONTRATOSNET', erro: err?.message || 'Falha ao consultar Contratos.gov' });
    }
  } else {
    fontesNaoAplicaveis.push('CONTRATOSNET (contratoId não disponível)');
  }

  // B. Consulta PNCP
  if (pncpParams?.cnpj && pncpParams?.ano && pncpParams?.sequencialContrato) {
    try {
      const pncpEmpenhos = await fetchAndNormalizePncpEmpenhos({
        cnpj: pncpParams.cnpj,
        ano: pncpParams.ano,
        sequencialContrato: pncpParams.sequencialContrato,
        contractKey,
        uasg
      });
      fontesConsultadas.push('PNCP');
      allNormalized.push(...pncpEmpenhos);
    } catch (err: any) {
      erros.push({ origem: 'PNCP', erro: err?.message || 'Falha ao consultar PNCP' });
    }
  } else {
    fontesNaoAplicaveis.push('PNCP (parâmetros de controle PNCP não informados)');
  }

  // C. Reconciliação
  const reconciledList = reconcileNormalizedEmpenhos(allNormalized);

  // D. Persistência M17
  const syncSummary = await syncReconciledBatch(reconciledList);

  const divergencias: ConflitoCampo[] = [];
  const pendencias: VinculoPendente[] = [];
  for (const rec of reconciledList) {
    divergencias.push(...rec.conflitos);
    pendencias.push(...rec.vinculos_pendentes);
  }

  let status: OrchestrationStatus = 'SUCESSO';
  if (erros.length > 0 && syncSummary.total_salvos === 0 && allNormalized.length === 0) {
    status = 'ERRO';
  } else if (erros.length > 0 || (syncSummary.erros && syncSummary.erros.length > 0)) {
    status = 'SUCESSO_PARCIAL';
  } else if (allNormalized.length === 0) {
    status = 'SEM_DADOS';
  } else if (divergencias.length > 0) {
    status = 'COM_DIVERGENCIAS';
  }

  return {
    alvo: target,
    status,
    fontes_consultadas: fontesConsultadas,
    fontes_nao_aplicaveis: fontesNaoAplicaveis,
    empenhos_encontrados: allNormalized.length,
    empenhos_persistidos: syncSummary.total_salvos,
    empenhos_atualizados: syncSummary.total_processados - syncSummary.total_salvos,
    vinculos_item_criados: syncSummary.total_itens_vinculados,
    vinculos_contrato_criados: syncSummary.total_contratos_vinculados,
    divergencias,
    pendencias,
    erros,
    resumo_sync: syncSummary,
    executado_em: executadoEm
  };
}

/**
 * 4. Orquestração On-Demand por Nota de Empenho Específica
 */
export async function orchestrateEmpenhoSync(
  target: EmpenhoTarget
): Promise<OrchestrationResult> {
  const executadoEm = new Date().toISOString();
  const { canonicalKey, contextHints } = target;

  if (!canonicalKey || !canonicalKey.includes('-')) {
    const emptySummary: EmpenhoSyncSummary = {
      total_processados: 0,
      total_salvos: 0,
      total_itens_vinculados: 0,
      total_contratos_vinculados: 0,
      total_conflitos: 0,
      erros: [{ erro: 'INVALID_CANONICAL_KEY: Formato esperado {uasg}-{ano}-{numeroNormalizado}' }],
      reconciliados: []
    };

    return {
      alvo: target,
      status: 'ERRO',
      fontes_consultadas: [],
      fontes_nao_aplicaveis: [],
      empenhos_encontrados: 0,
      empenhos_persistidos: 0,
      empenhos_atualizados: 0,
      vinculos_item_criados: 0,
      vinculos_contrato_criados: 0,
      divergencias: [],
      pendencias: [],
      erros: [{ origem: 'ORCHESTRATOR', erro: 'canonicalKey inválida' }],
      resumo_sync: emptySummary,
      executado_em: executadoEm
    };
  }

  const allNormalized: NormalizedEmpenho[] = [];
  const fontesConsultadas: EmpenhoFonteOrigem[] = [];
  const fontesNaoAplicaveis: string[] = [];
  const erros: Array<{ origem?: string; erro: string }> = [];

  // Se houver pistas de contexto de Ata/Item, consulta Compras.gov
  if (contextHints?.numeroAta && contextHints?.uasg) {
    try {
      const comprasEmpenhos = await fetchAndNormalizeComprasGovEmpenhos({
        numeroAta: contextHints.numeroAta,
        uasg: contextHints.uasg,
        numeroItem: contextHints.numeroItem
      });
      fontesConsultadas.push('COMPRASNET');
      const matched = comprasEmpenhos.filter(e => e.canonical_key === canonicalKey);
      allNormalized.push(...matched);
    } catch (err: any) {
      erros.push({ origem: 'COMPRASNET', erro: err?.message || 'Falha ao buscar NE em Compras.gov' });
    }
  }

  // Se houver pistas de contrato, consulta Contratos.gov
  if (contextHints?.contratoId && contextHints?.contractKey) {
    try {
      const contratosEmpenhos = await fetchAndNormalizeContratosGovEmpenhos({
        contratoId: contextHints.contratoId,
        contractKey: contextHints.contractKey
      });
      fontesConsultadas.push('CONTRATOSNET');
      const matched = contratosEmpenhos.filter(e => e.canonical_key === canonicalKey);
      allNormalized.push(...matched);
    } catch (err: any) {
      erros.push({ origem: 'CONTRATOSNET', erro: err?.message || 'Falha ao buscar NE em Contratos.gov' });
    }
  }

  // Reconciliação
  const reconciledList = reconcileNormalizedEmpenhos(allNormalized);

  // Persistência M17
  const syncSummary = await syncReconciledBatch(reconciledList);

  const divergencias: ConflitoCampo[] = [];
  const pendencias: VinculoPendente[] = [];
  for (const rec of reconciledList) {
    divergencias.push(...rec.conflitos);
    pendencias.push(...rec.vinculos_pendentes);
  }

  let status: OrchestrationStatus = 'SUCESSO';
  if (erros.length > 0 && syncSummary.total_salvos === 0 && allNormalized.length === 0) {
    status = 'ERRO';
  } else if (erros.length > 0 || (syncSummary.erros && syncSummary.erros.length > 0)) {
    status = 'SUCESSO_PARCIAL';
  } else if (allNormalized.length === 0) {
    status = 'SEM_DADOS';
  } else if (divergencias.length > 0) {
    status = 'COM_DIVERGENCIAS';
  }

  return {
    alvo: target,
    status,
    fontes_consultadas: fontesConsultadas,
    fontes_nao_aplicaveis: fontesNaoAplicaveis,
    empenhos_encontrados: allNormalized.length,
    empenhos_persistidos: syncSummary.total_salvos,
    empenhos_atualizados: syncSummary.total_processados - syncSummary.total_salvos,
    vinculos_item_criados: syncSummary.total_itens_vinculados,
    vinculos_contrato_criados: syncSummary.total_contratos_vinculados,
    divergencias,
    pendencias,
    erros,
    resumo_sync: syncSummary,
    executado_em: executadoEm
  };
}

/**
 * 5. Ponto de Entrada Unificado da Camada de Orquestração On-Demand
 */
export async function orchestrateOnDemandSync(
  target: OrchestrationTarget
): Promise<OrchestrationResult> {
  switch (target.tipo) {
    case 'ITEM':
      return orchestrateItemEmpenhoSync(target);
    case 'ATA':
      return orchestrateAtaEmpenhoSync(target);
    case 'CONTRATO':
      return orchestrateContractEmpenhoSync(target);
    case 'EMPENHO':
      return orchestrateEmpenhoSync(target);
    default: {
      const unknownTarget = target as any;
      throw new Error(`INVALID_ORCHESTRATION_TARGET: Tipo de alvo desconhecido "${unknownTarget?.tipo}"`);
    }
  }
}
