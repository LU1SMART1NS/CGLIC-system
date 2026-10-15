import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAllContractManagers } from './useAllContractManagers';
import { useAllAtaManagers, useArpItemContractLinks } from './useAtaManagers';
import { escopoDoGestor } from '../utils/escopoDoGestor';

export interface AssignedManagementScope {
  /** `undefined` = sem restrição (perfil diferente de "gestor"). */
  contractKeys: string[] | undefined;
  /** `undefined` = sem restrição (perfil diferente de "gestor"). */
  ataKeys: string[] | undefined;
  isLoading: boolean;
}

/**
 * Escopo do perfil "Gestor de Atas e Contratos" (role_domain_scopes.contracts,
 * migration 20260925000023): atribuir um gestor a uma Ata
 * (public.ata_managers) dá acesso automático a todos os contratos vinculados
 * a ela via public.arp_item_contract_links — e vice-versa, um contrato
 * atribuído diretamente (public.contract_managers) também revela a(s) Ata(s)
 * a que ele pertence. Contratos sem nenhum vínculo de Ata ("avulsos") só
 * entram no escopo por atribuição direta.
 *
 * Retorna `undefined` para os demais perfis (escopo GLOBAL, sem restrição) —
 * nunca um array vazio nesse caso, para não ser confundido com "gestor sem
 * nada atribuído ainda".
 */
export function useAssignedManagementScope(
  uasg?: string,
  /** Coordenador e consulta: carteira de um gestor escolhido no filtro da Visão Geral (o perfil "gestor" ignora). */
  opts: { gestorUserId?: string } = {}
): AssignedManagementScope {
  const { user, role } = useAuth();
  const isGestor = role === 'gestor';
  const userId = isGestor ? user?.id : opts.gestorUserId;

  const { data: contractManagers, isLoading: loadingContractManagers } = useAllContractManagers(uasg);
  const { data: ataManagers, isLoading: loadingAtaManagers } = useAllAtaManagers();
  const { data: links, isLoading: loadingLinks } = useArpItemContractLinks(Boolean(userId));

  return useMemo(() => {
    if (!userId) {
      return { contractKeys: undefined, ataKeys: undefined, isLoading: false };
    }
    const { contractKeys, ataKeys } = escopoDoGestor(
      userId,
      Object.values(contractManagers || {}),
      Object.values(ataManagers || {}),
      links || []
    );
    return {
      contractKeys: Array.from(contractKeys),
      ataKeys: Array.from(ataKeys),
      isLoading: loadingContractManagers || loadingAtaManagers || loadingLinks
    };
  }, [userId, contractManagers, ataManagers, links, loadingContractManagers, loadingAtaManagers, loadingLinks]);
}
