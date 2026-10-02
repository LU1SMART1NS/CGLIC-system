import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { syncItemSenaspQuantity, type SyncItemSenaspParams, type SyncItemSenaspResult } from '../services/itemSenaspSyncService';

/** Lê as unidades do item na API e grava o quantitativo SENASP. */
export function useSyncItemSenasp() {
  const queryClient = useQueryClient();
  return useMutation<SyncItemSenaspResult, Error, SyncItemSenaspParams>({
    mutationFn: syncItemSenaspQuantity,
    onSuccess: (r) => {
      if (r.quantidade != null) queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
    }
  });
}

/**
 * Sincroniza o quantitativo SENASP dos itens que ainda não o têm gravado (um de cada vez, uma vez por
 * item por sessão). Só roda para quem pode gravar (gestor/admin).
 */
export function useBackfillItemSenasp(params: {
  enabled: boolean;
  numeroAta?: string;
  uasg?: string;
  /** Itens sem quantitativo SENASP gravado. */
  numerosItem: string[];
}) {
  const { enabled, numeroAta, uasg, numerosItem } = params;
  const { mutateAsync } = useSyncItemSenasp();
  const feitos = useRef(new Set<string>());
  const pendentes = numerosItem.join(',');

  useEffect(() => {
    if (!enabled || !numeroAta || !uasg || !pendentes) return;
    let cancelado = false;
    (async () => {
      for (const numeroItem of pendentes.split(',')) {
        const chave = `${numeroAta}|${uasg}|${numeroItem}`;
        if (cancelado) return;
        if (feitos.current.has(chave)) continue;
        feitos.current.add(chave);
        try {
          await mutateAsync({ numeroAta, uasg, numeroItem });
        } catch {
          // Falha pontual (API ou permissão): o item segue com o homologado da ata e tenta de novo na próxima sessão.
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [enabled, numeroAta, uasg, pendentes, mutateAsync]);
}
