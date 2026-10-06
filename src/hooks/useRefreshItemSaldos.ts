import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { sincronizarSaldosItens } from '../services/saldosItensSyncService';
import { invalidarDadosDeSaldosItens } from './useSincronizacaoEmSegundoPlano';

/**
 * Botão "Atualizar" da Visão Geral para o coordenador: força a releitura dos saldos dos itens (quantidade
 * contratada nos contratos vinculados e quantitativo SENASP) nas fontes oficiais.
 *
 * Não roda sozinho ao abrir a tela: a atualização periódica é feita em segundo plano, uma vez para todos,
 * por useSincronizacaoEmSegundoPlano (trava no banco, validade de 6 horas).
 */
export function useRefreshItemSaldos() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  // Forçar é só do coordenador (a função do banco recusa os demais perfis).
  const canForce = role === 'admin';

  const refresh = React.useCallback(async () => {
    if (!canForce) return;
    setIsRefreshing(true);
    try {
      const resultado = await sincronizarSaldosItens({ forcar: true });
      if (resultado.status === 'ERRO') console.warn('[itemSaldos] falha ao atualizar saldos dos itens:', resultado.erro);
      await invalidarDadosDeSaldosItens(queryClient);
    } catch (err) {
      console.warn('[itemSaldos] falha ao atualizar saldos dos itens:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [canForce, queryClient]);

  return { refresh, isRefreshing };
}
