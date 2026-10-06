import React from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { RECURSO_SALDOS_ITENS } from '../services/saldosItensSyncService';
import { UASG_TODAS } from '../services/sincronizacaoFontesService';
import { useAtualizacaoNoServidor } from './useAtualizacaoNoServidor';

/** Relê do banco tudo o que depende dos saldos dos itens (quantidade contratada e quantitativo SENASP). */
export async function invalidarDadosDeSaldosItens(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] }),
    queryClient.invalidateQueries({ queryKey: ['ata-detail-source'] }),
    queryClient.invalidateQueries({ queryKey: ['management-dashboard'] })
  ]);
}

/**
 * Botão "Atualizar" da Visão Geral para o coordenador: pede ao servidor a releitura forçada dos saldos dos
 * itens (quantidade contratada nos contratos vinculados e quantitativo SENASP) e espera terminar.
 *
 * Não roda sozinho ao abrir a tela: a atualização periódica é feita pelo servidor, de hora em hora
 * (agendamento do banco, trava e validade de 6 horas).
 */
export function useRefreshItemSaldos() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const atualizarNoServidor = useAtualizacaoNoServidor();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  // Forçar é só do coordenador (a função de sincronização recusa os demais perfis).
  const canForce = role === 'admin';

  const refresh = React.useCallback(async () => {
    if (!canForce) return;
    setIsRefreshing(true);
    try {
      await atualizarNoServidor(RECURSO_SALDOS_ITENS, [UASG_TODAS]);
      await invalidarDadosDeSaldosItens(queryClient);
    } finally {
      setIsRefreshing(false);
    }
  }, [canForce, queryClient, atualizarNoServidor]);

  return { refresh, isRefreshing };
}
