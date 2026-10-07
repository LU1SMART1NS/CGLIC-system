import { useMemo } from 'react';
import type { ContractDashboardRecord, ContractTaskPlan } from '../types';
import { useContractPaymentFollowUp } from './useContractPaymentFollowUp';
import { useContractEmpenhoItemLinks } from './useContractEmpenhoItemLinks';
import { buildContractActionQueue, type ContractActionQueue, type PendingEmpenhoQuantity } from '../services/contractActionQueueService';
import { useReminderDismissals } from './useReminderDismissals';
import { buildAtaItemPath } from './useAta';
import { formatItemKeyLabel, parseItemKey } from '../utils/itemKeyParts';
import { getContractManagementKey } from '../services/contractManagementService';
import { parseDateBRT } from '../services/temporalEngineService';
import { useAvisosPagamentoDoContrato } from './useAvisosPagamento';

const EMPTY_QUEUE: ContractActionQueue = {
  items: [],
  counts: { CRITICA: 0, URGENTE: 0, ATENCAO: 0, INFO: 0 },
  tarefasSemPrazo: 0,
  dispensados: []
};

export function useContractActionQueue(
  contract: ContractDashboardRecord | null | undefined,
  plan: ContractTaskPlan | null
): { queue: ContractActionQueue; contractKey: string; isLoading: boolean } {
  const contractKey = contract ? contract.id || getContractManagementKey(contract.uasg, contract.numero, contract.ano) : '';
  const { cycles, isLoading } = useContractPaymentFollowUp(contractKey);
  const { dismissedIds } = useReminderDismissals('CONTRATO', contractKey);
  const { data: itemLinks } = useContractEmpenhoItemLinks(contractKey);
  const fimVigencia = parseDateBRT(contract?.dataVigenciaFim);
  const vigente = Boolean(contract) && !(fimVigencia && fimVigencia.getTime() < new Date().setHours(0, 0, 0, 0));
  const avisosPagamento = useAvisosPagamentoDoContrato(contractKey, cycles, vigente);

  const pendingEmpenhos = useMemo(() => {
    const out: PendingEmpenhoQuantity[] = [];
    for (const l of itemLinks ?? []) {
      const parts = parseItemKey(l.itemKey);
      if (l.quantidade != null || !parts) continue;
      out.push({
        empenhoId: l.empenhoId,
        numeroEmpenho: l.numeroEmpenho,
        itemKey: l.itemKey,
        itemLabel: formatItemKeyLabel(l.itemKey),
        href: `${buildAtaItemPath(parts.numeroAta, parts.uasg, parseInt(parts.numeroItem, 10))}?aba=contratos`
      });
    }
    return out;
  }, [itemLinks]);

  const queue = useMemo(
    () => (contract ? buildContractActionQueue({ contract, contractKey, plan, paymentCycles: cycles, pendingEmpenhos, avisosPagamento, dismissedReminderIds: dismissedIds }) : EMPTY_QUEUE),
    [contract, contractKey, plan, cycles, pendingEmpenhos, avisosPagamento, dismissedIds]
  );

  return { queue, contractKey, isLoading };
}
