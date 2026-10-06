import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  sincronizarEmpenhosDoContrato,
  situacaoDoResultado,
  mensagemDoResultado,
  falhaTransitoria,
  type SituacaoSincronizacaoEmpenhos
} from '../services/contratoEmpenhosSincronizacaoService';
import { resolveContractKey } from '../utils/contractKeyUtils';
import { SINCRONIZACAO_EMPENHOS_QUERY_KEY } from './useSincronizacaoEmpenhosContrato';
import type { ContractTarget, OrchestrationResult } from '../types/empenhoSync';
import type { ContractDashboardRecord } from '../types';

/** Mesmo teto de concorrência usado em orchestrateAtaEmpenhoSync, para não saturar as APIs oficiais (HTTP 429). */
const CONCURRENCY_LIMIT = 3;

export interface BatchSyncProgress {
  current: number;
  total: number;
  percent: number;
  contractLabel?: string;
  /** Fase de novas tentativas dos contratos cuja fonte não respondeu na primeira passada. */
  novaTentativa?: boolean;
}

export interface BatchSyncFalha {
  contractKey: string;
  /** Número do contrato para exibição (ex.: 00021/2017). */
  numero: string;
  uasg: string;
  situacao: Extract<SituacaoSincronizacaoEmpenhos, 'PARCIAL' | 'ERRO'>;
  erro: string;
}

export interface BatchSyncSummary {
  totalContratos: number;
  /** A fonte respondeu e os empenhos foram gravados. */
  atualizados: number;
  /** A fonte respondeu que o contrato não tem empenho. */
  semEmpenhos: number;
  /** Algum empenho ou vínculo não foi gravado. */
  parciais: number;
  /** A fonte não respondeu, ou o contrato não tem o id do Contratos.gov.br. */
  comErro: number;
  empenhosPersistidos: number;
  /** Contratos que passaram por uma segunda tentativa. */
  novasTentativas: number;
  cancelado: boolean;
  /** Contratos que terminaram em PARCIAL ou ERRO, para mostrar e tentar de novo. */
  falhas: BatchSyncFalha[];
}

export function buildContractTarget(contract: ContractDashboardRecord): ContractTarget {
  const contractKey = contract.id || resolveContractKey(contract.uasg, contract.numero, contract.ano).key;

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
    // Só o id do Contratos.gov.br: a chave do contrato no lugar dele faz a consulta falhar.
    contratoId: contract.contratoId,
    pncpParams
  };
}

/** Contratos das carteiras das duas UASGs, sem repetir a mesma chave, que o lote sincroniza. */
export function contratosParaSincronizar(...carteiras: Array<ContractDashboardRecord[] | undefined>): ContractDashboardRecord[] {
  const vistos = new Set<string>();
  const lista: ContractDashboardRecord[] = [];
  for (const carteira of carteiras) {
    for (const contrato of carteira || []) {
      if (contrato.statusVigencia === 'Expirado') continue;
      const chave = contrato.id || `${contrato.uasg}-${contrato.numero}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      lista.push(contrato);
    }
  }
  return lista;
}

interface ResultadoContrato {
  contract: ContractDashboardRecord;
  contractKey: string;
  result: OrchestrationResult;
}

async function sincronizarContrato(contract: ContractDashboardRecord): Promise<ResultadoContrato> {
  const target = buildContractTarget(contract);
  const result = await sincronizarEmpenhosDoContrato(target);
  return { contract, contractKey: target.contractKey, result };
}

/** Consolida os resultados finais (depois das novas tentativas) no resumo do lote. */
export function resumirLote(
  resultados: ResultadoContrato[],
  totalContratos: number,
  novasTentativas: number,
  cancelado: boolean
): BatchSyncSummary {
  const summary: BatchSyncSummary = {
    totalContratos,
    atualizados: 0,
    semEmpenhos: 0,
    parciais: 0,
    comErro: 0,
    empenhosPersistidos: 0,
    novasTentativas,
    cancelado,
    falhas: []
  };

  for (const { contract, contractKey, result } of resultados) {
    const situacao = situacaoDoResultado(result);
    summary.empenhosPersistidos += result.empenhos_persistidos || 0;
    if (situacao === 'OK') summary.atualizados++;
    else if (situacao === 'SEM_EMPENHOS') summary.semEmpenhos++;
    else {
      if (situacao === 'PARCIAL') summary.parciais++;
      else summary.comErro++;
      summary.falhas.push({
        contractKey,
        numero: contract.numeroFormatado || contract.numero || contractKey,
        uasg: contract.uasg,
        situacao,
        erro: mensagemDoResultado(result) || 'Falha sem mensagem da fonte.'
      });
    }
  }

  return summary;
}

/**
 * Sincronização em lote dos empenhos dos contratos informados, reaproveitando o mesmo serviço do
 * botão individual do Contrato 360 (orquestração + registro da situação de cada contrato).
 *
 * Primeira passada em micro-lotes; depois, uma nova tentativa, um contrato por vez, para os que
 * falharam por indisponibilidade da fonte (tempo esgotado, 429, 5xx, rede). Os que continuam com
 * falha ficam em `summary.falhas` e podem ser refeitos com `retryFailed`.
 */
export function useBatchSyncContractEmpenhos() {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BatchSyncProgress | null>(null);
  const [summary, setSummary] = useState<BatchSyncSummary | null>(null);
  const cancelRef = useRef(false);
  const failedContractsRef = useRef<ContractDashboardRecord[]>([]);

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

      const porChave = new Map<string, ResultadoContrato>();
      let cancelado = false;
      let novasTentativas = 0;
      let stats: BatchSyncSummary | null = null;

      try {
        for (let i = 0; i < contracts.length; i += CONCURRENCY_LIMIT) {
          if (cancelRef.current) {
            cancelado = true;
            break;
          }
          const chunk = contracts.slice(i, i + CONCURRENCY_LIMIT);
          const chunkResults = await Promise.all(chunk.map(sincronizarContrato));
          chunkResults.forEach((r) => porChave.set(r.contractKey, r));

          const current = Math.min(i + chunk.length, total);
          setProgress({
            current,
            total,
            percent: total > 0 ? Math.round((current / total) * 100) : 100,
            contractLabel: chunk[chunk.length - 1]?.numeroFormatado
          });
        }

        // Nova tentativa, um por vez, só para indisponibilidade da fonte.
        const transitorios = cancelado ? [] : [...porChave.values()].filter((r) => falhaTransitoria(r.result));
        for (let j = 0; j < transitorios.length; j++) {
          if (cancelRef.current) {
            cancelado = true;
            break;
          }
          const anterior = transitorios[j];
          setProgress({
            current: j,
            total: transitorios.length,
            percent: Math.round((j / transitorios.length) * 100),
            contractLabel: anterior.contract.numeroFormatado,
            novaTentativa: true
          });
          const novo = await sincronizarContrato(anterior.contract);
          porChave.set(novo.contractKey, novo);
          novasTentativas++;
        }
      } finally {
        const resultados = [...porChave.values()];
        stats = resumirLote(resultados, total, novasTentativas, cancelado);
        failedContractsRef.current = resultados
          .filter((r) => {
            const s = situacaoDoResultado(r.result);
            return s === 'PARCIAL' || s === 'ERRO';
          })
          .map((r) => r.contract);

        setIsRunning(false);
        setSummary(stats);
        queryClient.invalidateQueries({ queryKey: ['v_empenhos_resumo'] });
        queryClient.invalidateQueries({ queryKey: ['management-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['item-empenho-vinculos'] });
        for (const key of porChave.keys()) {
          queryClient.invalidateQueries({ queryKey: ['contract', key] });
          queryClient.invalidateQueries({ queryKey: ['v_contrato_empenhos_lastro', key] });
          queryClient.invalidateQueries({ queryKey: ['contract-events', key] });
          queryClient.invalidateQueries({ queryKey: ['contract-empenhos', key] });
          queryClient.invalidateQueries({ queryKey: ['contract-empenho-item-links', key] });
          queryClient.invalidateQueries({ queryKey: SINCRONIZACAO_EMPENHOS_QUERY_KEY(key) });
        }
      }

      return stats;
    },
    [queryClient]
  );

  /** Refaz só os contratos que terminaram a última execução com falha (PARCIAL ou ERRO). */
  const retryFailed = useCallback(() => run([...failedContractsRef.current]), [run]);

  return { run, retryFailed, cancel, isRunning, progress, summary, resetSummary: () => setSummary(null) };
}
