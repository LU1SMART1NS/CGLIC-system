import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { orchestrateContractEmpenhoSync } from '../services/empenhoOrchestrationService';
import type { ContractTarget, OrchestrationResult, OrchestrationStatus } from '../types/empenhoSync';
import type { ContractDashboardRecord } from '../types';

/** Mesmo teto de concorrência usado em orchestrateAtaEmpenhoSync, para não saturar as APIs oficiais (HTTP 429). */
const CONCURRENCY_LIMIT = 3;

export interface BatchSyncProgress {
  current: number;
  total: number;
  percent: number;
  contractLabel?: string;
}

export interface BatchSyncSummary {
  totalContratos: number;
  sucesso: number;
  semDados: number;
  parcial: number;
  comDivergencias: number;
  erro: number;
  empenhosPersistidos: number;
  cancelado: boolean;
  erros: Array<{ contractKey: string; erro: string }>;
}

function buildContractTarget(contract: ContractDashboardRecord): ContractTarget {
  const contractKey =
    contract.id ||
    (contract.uasg && contract.numero && contract.ano
      ? `${contract.uasg}-${contract.numero}-${contract.ano}`
      : contract.numeroControlePncp || 'unknown-contract');

  const pncpParams =
    contract.codigoOrgao && contract.ano && contract.numero
      ? {
          cnpj: contract.codigoOrgao,
          ano: contract.ano,
          sequencialContrato: contract.numero
        }
      : undefined;

  return {
    tipo: 'CONTRATO',
    contractKey,
    contratoId: contract.contratoId || contract.id,
    pncpParams
  };
}

function accountResult(stats: BatchSyncSummary, contractKey: string, status: OrchestrationStatus, result: OrchestrationResult | null, erro?: string) {
  switch (status) {
    case 'SUCESSO':
      stats.sucesso++;
      break;
    case 'SEM_DADOS':
      stats.semDados++;
      break;
    case 'SUCESSO_PARCIAL':
      stats.parcial++;
      break;
    case 'COM_DIVERGENCIAS':
      stats.comDivergencias++;
      break;
    case 'ERRO':
    default:
      stats.erro++;
      stats.erros.push({ contractKey, erro: erro || result?.erros?.[0]?.erro || 'Falha desconhecida' });
  }
  stats.empenhosPersistidos += result?.empenhos_persistidos || 0;
}

/**
 * Sincronização em lote de empenhos para todos os contratos informados, reaproveitando
 * o mesmo orquestrador on-demand por contrato (empenhoOrchestrationService) já usado
 * no botão individual do Contract360Header — apenas iterado em micro-lotes.
 */
export function useBatchSyncContractEmpenhos() {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BatchSyncProgress | null>(null);
  const [summary, setSummary] = useState<BatchSyncSummary | null>(null);
  const cancelRef = useRef(false);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const run = useCallback(
    async (contracts: ContractDashboardRecord[]) => {
      cancelRef.current = false;
      setIsRunning(true);
      setSummary(null);
      const total = contracts.length;
      setProgress({ current: 0, total, percent: total > 0 ? 0 : 100 });

      const stats: BatchSyncSummary = {
        totalContratos: total,
        sucesso: 0,
        semDados: 0,
        parcial: 0,
        comDivergencias: 0,
        erro: 0,
        empenhosPersistidos: 0,
        cancelado: false,
        erros: []
      };

      const processedContractKeys = new Set<string>();

      try {
        for (let i = 0; i < contracts.length; i += CONCURRENCY_LIMIT) {
          if (cancelRef.current) {
            stats.cancelado = true;
            break;
          }

          const chunk = contracts.slice(i, i + CONCURRENCY_LIMIT);
          const chunkResults = await Promise.all(
            chunk.map(async (contract) => {
              const target = buildContractTarget(contract);
              processedContractKeys.add(target.contractKey);
              try {
                const result = await orchestrateContractEmpenhoSync(target);
                return { contractKey: target.contractKey, status: result.status, result };
              } catch (err: any) {
                return {
                  contractKey: target.contractKey,
                  status: 'ERRO' as OrchestrationStatus,
                  result: null,
                  erro: err?.message || 'Falha ao consultar bases oficiais'
                };
              }
            })
          );

          chunkResults.forEach(({ contractKey, status, result, erro }) => {
            accountResult(stats, contractKey, status, result, erro);
          });

          const current = Math.min(i + chunk.length, total);
          setProgress({
            current,
            total,
            percent: total > 0 ? Math.round((current / total) * 100) : 100,
            contractLabel: chunk[chunk.length - 1]?.numeroFormatado
          });
        }
      } finally {
        setIsRunning(false);
        setSummary(stats);
        queryClient.invalidateQueries({ queryKey: ['v_empenhos_resumo'] });
        queryClient.invalidateQueries({ queryKey: ['management-dashboard'] });
        processedContractKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: ['contract', key] });
          queryClient.invalidateQueries({ queryKey: ['v_contrato_empenhos_lastro', key] });
          queryClient.invalidateQueries({ queryKey: ['contract-events', key] });
        });
      }

      return stats;
    },
    [queryClient]
  );

  return { run, cancel, isRunning, progress, summary, resetSummary: () => setSummary(null) };
}
