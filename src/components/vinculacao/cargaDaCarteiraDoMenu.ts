import type { QueryClient } from '@tanstack/react-query';
import { UASGS_CGLIC } from '../../config/unidadesGestoras';
import { getAtaSourceQueryOptions } from '../../hooks/useAta';
import { getContractsDashboardQueryOptions } from '../../hooks/useContractsDashboard';

/** Espera depois de abrir o sistema antes de carregar a carteira para o menu: a tela aberta carrega primeiro. */
export const ESPERA_CARGA_DO_MENU_MS = 3000;

/**
 * Carrega no cache as atas e, se o perfil conta contratos, os contratos de cada UASG. O que já está no cache e
 * ainda vale (staleTime) não é buscado de novo.
 */
export function carregarCarteiraParaOMenu(queryClient: Pick<QueryClient, 'prefetchQuery'>, opts: { contratos: boolean }) {
  const pedidos: Promise<void>[] = [];
  for (const uasg of UASGS_CGLIC) {
    pedidos.push(queryClient.prefetchQuery(getAtaSourceQueryOptions(uasg)));
    if (opts.contratos) pedidos.push(queryClient.prefetchQuery(getContractsDashboardQueryOptions(uasg)));
  }
  return Promise.all(pedidos);
}
