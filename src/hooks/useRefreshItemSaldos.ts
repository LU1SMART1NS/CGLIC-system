import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { refreshAllLinkedItemQuantities } from '../services/itemSaldoRefreshService';
import { syncAllPendingItemSenasp } from '../services/itemSenaspBatchService';

// Quem grava a cópia da quantidade contratada (RPC exige gestor/admin).
const WRITER_ROLES = ['gestor', 'admin'];

let attemptedThisSession = false;

/**
 * Mantém o saldo dos itens (quantidade contratada lida da API) em dia para os painéis. Roda uma vez por
 * sessão ao abrir a tela, só relê o que está sem leitura ou com mais de 6 horas, e recarrega os painéis
 * se algo mudou. `refresh()` roda de novo sob demanda (botão Atualizar).
 */
export function useRefreshItemSaldos() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const canWrite = WRITER_ROLES.includes(role ?? '');

  const refresh = React.useCallback(async () => {
    if (!canWrite) return;
    setIsRefreshing(true);
    try {
      const summary = await refreshAllLinkedItemQuantities();
      // Base SENASP dos itens ainda não sincronizados (sem isso o percentual usa o total da ata).
      const senasp = await syncAllPendingItemSenasp().catch((err) => {
        console.warn('[itemSaldoRefresh] falha ao sincronizar quantitativo SENASP:', err);
        return null;
      });
      if (summary.itensAtualizados > 0 || (senasp?.gravados ?? 0) > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['management-dashboard'] }),
          queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] })
        ]);
      }
      if (summary.falhas.length > 0) console.warn('[itemSaldoRefresh] contratos não atualizados:', summary.falhas);
    } catch (err) {
      console.warn('[itemSaldoRefresh] falha ao atualizar saldos dos itens:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [canWrite, queryClient]);

  React.useEffect(() => {
    if (!canWrite || attemptedThisSession) return;
    attemptedThisSession = true;
    void refresh();
  }, [canWrite, refresh]);

  return { refresh, isRefreshing };
}
