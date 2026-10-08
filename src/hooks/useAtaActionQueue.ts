import { useMemo } from 'react';
import type { ArpRecord, AtaTaskPlan } from '../types';
import { buildAtaActionQueue, type AtaActionQueue, type AtaItemSaldoInput } from '../services/ataActionQueueService';
import { useAvisosResolvidos } from './useAvisosResolvidos';

const EMPTY_QUEUE: AtaActionQueue = {
  items: [],
  counts: { CRITICA: 0, URGENTE: 0, ATENCAO: 0, INFO: 0 },
  tarefasSemPrazo: 0,
  dispensados: []
};

export function useAtaActionQueue(
  arp: ArpRecord | null | undefined,
  saldos: AtaItemSaldoInput[],
  plan: AtaTaskPlan | null
): AtaActionQueue {
  const { porChave } = useAvisosResolvidos();
  const resolvidos = useMemo(() => new Set(porChave.keys()), [porChave]);

  return useMemo(
    () => (arp ? buildAtaActionQueue({ arp, saldos, plan, avisosResolvidos: resolvidos }) : EMPTY_QUEUE),
    [arp, saldos, plan, resolvidos]
  );
}
