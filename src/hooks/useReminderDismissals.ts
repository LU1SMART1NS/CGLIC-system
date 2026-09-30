import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dismissReminderRpc,
  restoreReminderRpc,
  type ReminderEntityType
} from '../adapters/contractManagementRpcAdapter';
import { fetchDismissedReminders } from '../services/contractManagementService';

/**
 * Lembretes de prazo legal dispensados pelo gestor para um contrato ou Ata, com as
 * ações de dispensar ("já resolvi / não se aplica") e reexibir.
 */
export function useReminderDismissals(entityType: ReminderEntityType, entityKey: string) {
  const queryClient = useQueryClient();
  const queryKey = ['reminder-dismissals', entityType, entityKey] as const;

  const { data: dismissedIds = [] } = useQuery<string[], Error>({
    queryKey,
    queryFn: () => fetchDismissedReminders(entityType, entityKey),
    enabled: Boolean(entityKey),
    staleTime: 5 * 60 * 1000
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const dismiss = useMutation<unknown, Error, { itemId: string }>({
    mutationFn: ({ itemId }) => dismissReminderRpc({ entityType, entityKey, itemId }),
    retry: 0,
    onSuccess: invalidate
  });

  const restore = useMutation<unknown, Error, { itemId: string }>({
    mutationFn: ({ itemId }) => restoreReminderRpc({ entityType, entityKey, itemId }),
    retry: 0,
    onSuccess: invalidate
  });

  return { dismissedIds, dismiss, restore };
}
