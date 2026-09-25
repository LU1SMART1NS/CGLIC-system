/**
 * Hook do React para Acompanhamento Operacional de Pagamentos / Faturamento (SaldoARP 3.0 - Fase 7.4-D)
 * 
 * Responsável por:
 * 1. Consulta e persistência dos ciclos operacionais de faturamento/atesto vinculados a um contrato.
 * 2. Instanciação determinística e idempotente do template de 5 macroetapas e 11 tarefas.
 * 3. Atualização de status e evidências das tarefas operacionais com respeito ao TaskExecutionMode.
 * 4. Cálculo contínuo de prazos e alertas em dias úteis via paymentFollowUpService.
 * 5. Integração transparente com a Central de Atenção e Visão 360° do Contrato.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  PaymentCycleInput,
  PaymentFollowUpCycle,
  PaymentAlert
} from '../types/paymentFollowUp';
import type { FinancialBalances } from '../types/financialExecution';
import {
  buildPaymentCycleKey,
  buildPaymentFollowUpCycle,
  calculatePaymentCyclePrazos,
  derivePaymentCycleAlerts,
  determinePaymentCycleStatus
} from '../services/paymentFollowUpService';
import { buildPaymentFollowUpTemplate } from '../services/paymentFollowUpTemplateService';

const STORAGE_PREFIX = 'saldoarp:payment-cycles:';

function getStorageKey(contractKey: string): string {
  return `${STORAGE_PREFIX}${contractKey}`;
}

function loadPersistedCycles(contractKey: string): PaymentFollowUpCycle[] {
  if (!contractKey || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(contractKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[useContractPaymentFollowUp] Erro ao carregar ciclos persistidos:', err);
    return [];
  }
}

function savePersistedCycles(contractKey: string, cycles: PaymentFollowUpCycle[]): void {
  if (!contractKey || typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(contractKey), JSON.stringify(cycles));
  } catch (err) {
    console.warn('[useContractPaymentFollowUp] Erro ao persistir ciclos:', err);
  }
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
  registerPaymentCycle: (input: PaymentCycleInput) => PaymentFollowUpCycle;
  updatePaymentCycle: (cycleKey: string, updates: Partial<PaymentCycleInput>) => PaymentFollowUpCycle | null;
  deletePaymentCycle: (cycleKey: string) => void;
  refetch: () => void;
}

export function useContractPaymentFollowUp(
  contractKey: string,
  options?: UseContractPaymentFollowUpOptions
): UseContractPaymentFollowUpResult {
  const [cycles, setCycles] = useState<PaymentFollowUpCycle[]>(() =>
    loadPersistedCycles(contractKey)
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const baseDate = options?.baseDate;
  const financialBalances = options?.financialBalances;

  // Carregar ciclos quando o contractKey mudar
  const refresh = useCallback(() => {
    if (!contractKey) {
      setCycles([]);
      return;
    }
    setIsLoading(true);
    try {
      const persisted = loadPersistedCycles(contractKey);
      // Recalcular métricas dinâmicas e alertas para cada ciclo
      const recalculated = persisted.map(c => {
        const prazos = calculatePaymentCyclePrazos(c.input, baseDate);
        const status = determinePaymentCycleStatus(c.input);
        const alerts = derivePaymentCycleAlerts(
          c.cycleKey,
          c.contractKey,
          status,
          c.input,
          prazos,
          financialBalances,
          baseDate
        );
        return {
          ...c,
          prazos,
          alerts,
          status,
          atualizadoEm: c.atualizadoEm
        };
      });
      setCycles(recalculated);
    } finally {
      setIsLoading(false);
    }
  }, [contractKey, baseDate, financialBalances]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Registra um novo ciclo de faturamento/atesto (ou atualiza existente) de forma DETERMINÍSTICA e IDEMPOTENTE.
   */
  const registerPaymentCycle = useCallback(
    (input: PaymentCycleInput): PaymentFollowUpCycle => {
      const cycleKey = buildPaymentCycleKey(
        input.contractKey,
        input.competencia,
        input.documentoAtestoSei
      );

      setCycles(prevCycles => {
        const existingIndex = prevCycles.findIndex(c => c.cycleKey === cycleKey);

        if (existingIndex >= 0) {
          // Idempotência: Se já existe, atualiza os dados do input sem resetar ou duplicar tarefas
          const existing = prevCycles[existingIndex];
          const mergedInput: PaymentCycleInput = {
            ...existing.input,
            ...input
          };
          const updatedCycle = buildPaymentFollowUpCycle(
            mergedInput,
            {
              baseDate,
              empenhoBalances: financialBalances
            }
          );
          // Preservar tarefas e template já instanciados
          updatedCycle.tasks = existing.tasks;

          const nextCycles = [...prevCycles];
          nextCycles[existingIndex] = updatedCycle;
          savePersistedCycles(contractKey, nextCycles);
          return nextCycles;
        } else {
          // Criar novo ciclo e instanciar tarefas a partir do template canônico
          const newCycle = buildPaymentFollowUpCycle(
            input,
            {
              baseDate,
              empenhoBalances: financialBalances
            }
          );
          const templateTasks = buildPaymentFollowUpTemplate(input);
          newCycle.tasks = templateTasks;

          const nextCycles = [newCycle, ...prevCycles];
          savePersistedCycles(contractKey, nextCycles);
          return nextCycles;
        }
      });

      // Retornar ciclo construído
      return buildPaymentFollowUpCycle(input, {
        baseDate,
        empenhoBalances: financialBalances
      });
    },
    [contractKey, baseDate, financialBalances]
  );

  /**
   * Atualiza dados de um ciclo existente.
   */
  const updatePaymentCycle = useCallback(
    (cycleKey: string, updates: Partial<PaymentCycleInput>): PaymentFollowUpCycle | null => {
      let updated: PaymentFollowUpCycle | null = null;

      setCycles(prevCycles => {
        const index = prevCycles.findIndex(c => c.cycleKey === cycleKey);
        if (index === -1) return prevCycles;

        const current = prevCycles[index];
        const mergedInput: PaymentCycleInput = {
          ...current.input,
          ...updates
        };

        const cycle = buildPaymentFollowUpCycle(
          mergedInput,
          {
            baseDate,
            empenhoBalances: financialBalances
          }
        );
        cycle.tasks = current.tasks;
        cycle.atualizadoEm = new Date().toISOString();

        updated = cycle;
        const nextCycles = [...prevCycles];
        nextCycles[index] = cycle;
        savePersistedCycles(contractKey, nextCycles);
        return nextCycles;
      });

      return updated;
    },
    [contractKey, baseDate, financialBalances]
  );

  /**
   * Remove um ciclo.
   */
  const deletePaymentCycle = useCallback(
    (cycleKey: string) => {
      setCycles(prevCycles => {
        const nextCycles = prevCycles.filter(c => c.cycleKey !== cycleKey);
        savePersistedCycles(contractKey, nextCycles);
        return nextCycles;
      });
    },
    [contractKey]
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
    () =>
      cycles.filter(
        c => c.status !== 'CONCLUIDO' && c.status !== 'CANCELADO'
      ).length,
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
    refetch: refresh
  };
}
