import { useMemo } from 'react';
import type { ArpRecord, AtaTaskPlan } from '../types';
import { buildAtaActionQueue, type AtaActionQueue, type AtaItemSaldoInput } from '../services/ataActionQueueService';
import { useReminderDismissals } from './useReminderDismissals';

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
  const { dismissedIds } = useReminderDismissals('ATA', arp?.numeroAtaRegistroPreco || '');

  return useMemo(
    () => (arp ? buildAtaActionQueue({ arp, saldos, plan, dismissedReminderIds: dismissedIds }) : EMPTY_QUEUE),
    [arp, saldos, plan, dismissedIds]
  );
}
