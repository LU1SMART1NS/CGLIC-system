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
 * 2. Instanciação determinística e idempotente do template de 3 etapas
 *    (só tarefas humanas) (agora via contract_task_plans/contract_tasks reais, reaproveitando
 *    a mesma infraestrutura de tarefas contratuais — nenhum segundo sistema de
 *    tarefas foi criado).
 * 3. Cálculo contínuo de prazos e alertas em dias úteis via paymentFollowUpService
 *    (regra de negócio inalterada — apenas a persistência mudou).
 * 4. Integração transparente com a Central de Atenção e Visão 360° do Contrato.
 *
 * A situação do ciclo vem dos marcos registrados (migration 58): registerMarco grava cada marco com
 * os dados reais (SEI, datas, ordem bancária) e o servidor deduz a situação; ninguém a escolhe à mão.
 */

import { useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PaymentFollowUpCycle,
  PaymentAlert
} from '../types/paymentFollowUp';
import type { FinancialBalances } from '../types/financialExecution';
import type {
  RpcContractPaymentCycleRow,
  RpcPaymentCycleDocumentRow,
  RpcPaymentCycleEventRow
} from '../types/rpc';
import { isPaymentCycleEncerrado, rowToPaymentFollowUpCycle } from '../services/paymentFollowUpService';
import {
  fetchPaymentCyclesForContract,
  fetchPaymentCycleDetails,
  createPaymentCycleRpc,
  registerPaymentMarcoRpc,
  addPaymentDocumentRpc,
  removePaymentDocumentRpc,
  updatePaymentCycleInfoRpc,
  deletePaymentCycleRpc,
  type CreatePaymentCycleInput,
  type RegisterPaymentMarcoInput
} from '../adapters/paymentCycleRpcAdapter';

function paymentCyclesQueryKey(contractKey: string) {
  return ['contract-payment-cycles', contractKey] as const;
}

interface PaymentCyclesData {
  rows: RpcContractPaymentCycleRow[];
  documentos: RpcPaymentCycleDocumentRow[];
  eventos: RpcPaymentCycleEventRow[];
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
  /** Cria o ciclo com os documentos recebidos (o atesto é obrigatório). */
  registerPaymentCycle: (input: CreatePaymentCycleInput) => Promise<void>;
  /** Registra um marco (conferido, pendência, enviado, devolvido, pago ou cancelado) com os dados reais. */
  registerMarco: (input: RegisterPaymentMarcoInput) => Promise<void>;
  addDocument: (input: { cycleKey: string; tipo: string; sei: string; numero?: string; valor?: number }) => Promise<void>;
  removeDocument: (documentId: string) => Promise<void>;
  /** Exclusão definitiva (só admin). */
  deleteCycle: (cycleKey: string) => Promise<void>;
  updateCycleInfo: (input: { cycleKey: string; responsavelNome?: string; responsavelUserId?: string; observacoes?: string }) => Promise<void>;
  refetch: () => void;
}

export function useContractPaymentFollowUp(
  contractKey: string,
  options?: UseContractPaymentFollowUpOptions
): UseContractPaymentFollowUpResult {
  const queryClient = useQueryClient();
  const baseDate = options?.baseDate;
  const financialBalances = options?.financialBalances;

  const { data, isLoading, refetch: refetchQuery } = useQuery<PaymentCyclesData, Error>({
    queryKey: paymentCyclesQueryKey(contractKey),
    queryFn: async () => {
      const rows = await fetchPaymentCyclesForContract(contractKey);
      const { documentos, eventos } = await fetchPaymentCycleDetails(rows.map((r) => r.id));
      return { rows, documentos, eventos };
    },
    enabled: Boolean(contractKey),
    staleTime: 60 * 1000
  });

  const cycles = useMemo<PaymentFollowUpCycle[]>(() => {
    if (!data) return [];
    return data.rows.map((row) =>
      rowToPaymentFollowUpCycle(row, {
        baseDate,
        empenhoBalances: financialBalances,
        documentos: data.documentos.filter((d) => d.cycle_id === row.id),
        eventos: data.eventos.filter((e) => e.cycle_id === row.id)
      })
    );
  }, [data, baseDate, financialBalances]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: paymentCyclesQueryKey(contractKey) });
    // Fila de ações, painel gerencial e tela geral de Pagamentos leem os mesmos ciclos
    queryClient.invalidateQueries({ queryKey: ['management-dashboard'] });
  }, [queryClient, contractKey]);

  const createMutation = useMutation({ mutationFn: createPaymentCycleRpc, onSuccess: invalidate });
  const marcoMutation = useMutation({ mutationFn: registerPaymentMarcoRpc, onSuccess: invalidate });
  const addDocMutation = useMutation({ mutationFn: addPaymentDocumentRpc, onSuccess: invalidate });
  const removeDocMutation = useMutation({ mutationFn: removePaymentDocumentRpc, onSuccess: invalidate });
  const infoMutation = useMutation({ mutationFn: updatePaymentCycleInfoRpc, onSuccess: invalidate });
  const deleteMutation = useMutation({ mutationFn: deletePaymentCycleRpc, onSuccess: invalidate });

  const registerPaymentCycle = useCallback(
    async (input: CreatePaymentCycleInput): Promise<void> => {
      await createMutation.mutateAsync(input);
    },
    [createMutation]
  );
  const registerMarco = useCallback(
    async (input: RegisterPaymentMarcoInput): Promise<void> => {
      await marcoMutation.mutateAsync(input);
    },
    [marcoMutation]
  );
  const addDocument = useCallback(
    async (input: { cycleKey: string; tipo: string; sei: string; numero?: string; valor?: number }): Promise<void> => {
      await addDocMutation.mutateAsync(input);
    },
    [addDocMutation]
  );
  const removeDocument = useCallback(
    async (documentId: string): Promise<void> => {
      await removeDocMutation.mutateAsync(documentId);
    },
    [removeDocMutation]
  );
  const updateCycleInfo = useCallback(
    async (input: { cycleKey: string; responsavelNome?: string; responsavelUserId?: string; observacoes?: string }): Promise<void> => {
      await infoMutation.mutateAsync(input);
    },
    [infoMutation]
  );

  const deleteCycle = useCallback(
    async (cycleKey: string): Promise<void> => {
      await deleteMutation.mutateAsync(cycleKey);
    },
    [deleteMutation]
  );

  const allAlerts = useMemo<PaymentAlert[]>(() => cycles.flatMap((c) => c.alerts ?? []), [cycles]);

  const activeCount = useMemo(() => cycles.filter((c) => !isPaymentCycleEncerrado(c.status)).length, [cycles]);
  const completedCount = useMemo(() => cycles.filter((c) => c.status === 'PAGO').length, [cycles]);

  return {
    cycles,
    alerts: allAlerts,
    activeCount,
    completedCount,
    isLoading,
    registerPaymentCycle,
    registerMarco,
    addDocument,
    removeDocument,
    updateCycleInfo,
    deleteCycle,
    refetch: refetchQuery
  };
}
