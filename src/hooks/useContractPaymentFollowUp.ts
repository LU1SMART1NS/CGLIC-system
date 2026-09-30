/**
 * Hook do React para Acompanhamento Operacional de Pagamentos / Faturamento
 * (CGLIC 3.0 - Fase 7.4-D; persistência canônica desde a Fase 10-A.2)
 *
 * Responsável por:
 * 1. Consulta e persistência REAL (Supabase — contract_payment_cycles) dos ciclos
 *    operacionais de faturamento/atesto vinculados a um contrato. Antes da Fase
 *    10-A.2, este hook persistia exclusivamente em localStorage do navegador —
 *    ver FASE_10_A_AUDITORIA_AUTOMACAO_NOTIFICACOES.md e
 *    FASE_10_A1_SANEAMENTO_PRE_REQUISITOS_AUTOMACAO.md para o histórico do GAP.
 * 2. Instanciação determinística e idempotente do template de 5 macroetapas e 11
 *    tarefas (agora via contract_task_plans/contract_tasks reais, reaproveitando
 *    a mesma infraestrutura de tarefas contratuais — nenhum segundo sistema de
 *    tarefas foi criado).
 * 3. Cálculo contínuo de prazos e alertas em dias úteis via paymentFollowUpService
 *    (regra de negócio inalterada — apenas a persistência mudou).
 * 4. Integração transparente com a Central de Atenção e Visão 360° do Contrato.
 *
 * IMPORTANTE (mudança de contrato desta fase): registerPaymentCycle,
 * updatePaymentCycle e deletePaymentCycle agora são ASSÍNCRONOS (retornam
 * Promise), pois persistem de fato no servidor. Os dois únicos consumidores
 * existentes (ContractPaymentFollowUpSection.tsx) já descartavam o retorno
 * síncrono anterior, então a migração não exigiu mudança de UI além de tratar
 * a Promise (await/catch).
 */

import { useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PaymentCycleInput,
  PaymentFollowUpCycle,
  PaymentAlert,
  PaymentWorkflowStatus
} from '../types/paymentFollowUp';
import type { FinancialBalances } from '../types/financialExecution';
import type { RpcContractPaymentCycleRow } from '../types/rpc';
import {
  buildPaymentFollowUpCycle,
  rowToPaymentFollowUpCycle
} from '../services/paymentFollowUpService';
import {
  fetchPaymentCyclesForContract,
  createPaymentCycleRpc,
  updatePaymentCycleRpc,
  cancelPaymentCycleRpc
} from '../adapters/paymentCycleRpcAdapter';

function paymentCyclesQueryKey(contractKey: string) {
  return ['contract-payment-cycles', contractKey] as const;
}

export interface UseContractPaymentFollowUpOptions {
  financialBalances?: FinancialBalances;
  baseDate?: string;
}

export interface UseContractPaymentFollowUpResult {
  cycles: PaymentFollowUpCycle[];
  alerts: PaymentAlert[];
  activeCount: number;
  completedCount: number;
  isLoading: boolean;
  registerPaymentCycle: (input: PaymentCycleInput) => Promise<PaymentFollowUpCycle | null>;
  updatePaymentCycle: (cycleKey: string, updates: Partial<PaymentCycleInput> & { status?: PaymentWorkflowStatus }) => Promise<PaymentFollowUpCycle | null>;
  deletePaymentCycle: (cycleKey: string) => Promise<void>;
  refetch: () => void;
}

export function useContractPaymentFollowUp(
  contractKey: string,
  options?: UseContractPaymentFollowUpOptions
): UseContractPaymentFollowUpResult {
  const queryClient = useQueryClient();
  const baseDate = options?.baseDate;
  const financialBalances = options?.financialBalances;

  const { data: rows, isLoading, refetch: refetchQuery } = useQuery<RpcContractPaymentCycleRow[], Error>({
    queryKey: paymentCyclesQueryKey(contractKey),
    queryFn: () => fetchPaymentCyclesForContract(contractKey),
    enabled: Boolean(contractKey),
    staleTime: 60 * 1000
  });

  const cycles = useMemo<PaymentFollowUpCycle[]>(() => {
    if (!rows) return [];
    return rows.map(row => rowToPaymentFollowUpCycle(row, { baseDate, empenhoBalances: financialBalances }));
  }, [rows, baseDate, financialBalances]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: paymentCyclesQueryKey(contractKey) });
  }, [queryClient, contractKey]);

  const createMutation = useMutation({
    mutationFn: createPaymentCycleRpc,
    onSuccess: invalidate
  });

  const updateMutation = useMutation({
    mutationFn: updatePaymentCycleRpc,
    onSuccess: invalidate
  });

  const cancelMutation = useMutation({
    mutationFn: (key: string) => cancelPaymentCycleRpc(key),
    onSuccess: invalidate
  });

  /**
   * Registra um novo ciclo de faturamento/atesto de forma determinística e
   * idempotente (cycle_key único no servidor). Uma segunda chamada com o
   * mesmo contrato+competência+documento é rejeitada pelo servidor
   * (PAYMENT_CYCLE_ALREADY_EXISTS) em vez de duplicar.
   */
  const registerPaymentCycle = useCallback(
    async (input: PaymentCycleInput): Promise<PaymentFollowUpCycle | null> => {
      const result = await createMutation.mutateAsync({
        contractKey: input.contractKey,
        competencia: input.competencia,
        documentoAtestoSei: input.documentoAtestoSei,
        dataAssinaturaAtesto: input.dataAssinaturaAtesto,
        dataVencimentoFatura: input.dataVencimentoFatura,
        valorAtesto: input.valorAtesto,
        empenhoCanonicalKey: input.empenhoCanonicalKey,
        numeroProcessoPagamentoSei: input.numeroProcessoPagamentoSei,
        numeroProcessoContratoSei: input.numeroProcessoContratoSei,
        numeroNotasFiscais: input.numeroNotasFiscais,
        titularNome: input.titularNome,
        responsavelNome: input.responsavelNome,
        responsavelUserId: input.responsavelUserId,
        observacoes: input.observacoes
      });

      if (!result?.cycle) return null;
      return buildPaymentFollowUpCycle(input, { baseDate, empenhoBalances: financialBalances, overrideStatus: result.cycle.status as PaymentWorkflowStatus });
    },
    [createMutation, baseDate, financialBalances]
  );

  /**
   * Atualiza campos operacionais e/ou status de um ciclo já existente.
   */
  const updatePaymentCycle = useCallback(
    async (
      cycleKey: string,
      updates: Partial<PaymentCycleInput> & { status?: PaymentWorkflowStatus }
    ): Promise<PaymentFollowUpCycle | null> => {
      const current = cycles.find(c => c.cycleKey === cycleKey);

      const result = await updateMutation.mutateAsync({
        cycleKey,
        status: updates.status,
        documentoDespachoSei: updates.documentoDespachoSei,
        dataEnvioCgofi: updates.dataEnvioCgofi,
        numeroOrdemBancaria: updates.numeroOrdemBancaria,
        dataOrdemBancaria: updates.dataOrdemBancaria,
        responsavelNome: updates.responsavelNome,
        responsavelUserId: updates.responsavelUserId,
        observacoes: updates.observacoes
      });

      if (!result?.cycle || !current) return null;

      const mergedInput: PaymentCycleInput = { ...current.input, ...updates };
      return buildPaymentFollowUpCycle(mergedInput, {
        baseDate,
        empenhoBalances: financialBalances,
        overrideStatus: result.cycle.status as PaymentWorkflowStatus
      });
    },
    [cycles, updateMutation, baseDate, financialBalances]
  );

  /**
   * "Remove" um ciclo — na prática, cancela (status CANCELADO). Ciclos de
   * pagamento são registros operacionais auditáveis; não existe exclusão
   * física no servidor (ver cancelPaymentCycleRpc).
   */
  const deletePaymentCycle = useCallback(
    async (cycleKey: string): Promise<void> => {
      await cancelMutation.mutateAsync(cycleKey);
    },
    [cancelMutation]
  );

  // Consolidar todos os alertas de todos os ciclos do contrato
  const allAlerts = useMemo<PaymentAlert[]>(() => {
    const list: PaymentAlert[] = [];
    for (const c of cycles) {
      if (c.alerts && c.alerts.length > 0) {
        list.push(...c.alerts);
      }
    }
    return list;
  }, [cycles]);

  const activeCount = useMemo(
    () => cycles.filter(c => c.status !== 'CONCLUIDO' && c.status !== 'CANCELADO').length,
    [cycles]
  );

  const completedCount = useMemo(
    () => cycles.filter(c => c.status === 'CONCLUIDO').length,
    [cycles]
  );

  return {
    cycles,
    alerts: allAlerts,
    activeCount,
    completedCount,
    isLoading,
    registerPaymentCycle,
    updatePaymentCycle,
    deletePaymentCycle,
    refetch: refetchQuery
  };
}
