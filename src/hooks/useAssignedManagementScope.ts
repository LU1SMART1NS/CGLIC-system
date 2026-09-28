import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAllContractManagers } from './useAllContractManagers';
import { useAllAtaManagers, useArpItemContractLinks } from './useAtaManagers';

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
export function useAssignedManagementScope(uasg?: string): AssignedManagementScope {
  const { user, role } = useAuth();
  const isGestor = role === 'gestor';

  const { data: contractManagers, isLoading: loadingContractManagers } = useAllContractManagers(uasg);
  const { data: ataManagers, isLoading: loadingAtaManagers } = useAllAtaManagers();
  const { data: links, isLoading: loadingLinks } = useArpItemContractLinks(isGestor);

  return useMemo(() => {
    if (!isGestor || !user) {
      return { contractKeys: undefined, ataKeys: undefined, isLoading: false };
    }

    const directContractKeys = new Set<string>();
    for (const manager of Object.values(contractManagers || {})) {
      if (manager.gestorUserId === user.id) directContractKeys.add(manager.contractKey);
    }

    const directAtaKeys = new Set<string>();
    for (const manager of Object.values(ataManagers || {})) {
      if (manager.gestorUserId === user.id) directAtaKeys.add(manager.ataKey);
    }

    const contractKeys = new Set(directContractKeys);
    const ataKeys = new Set(directAtaKeys);

    for (const link of links || []) {
      if (directAtaKeys.has(link.ataKey)) contractKeys.add(link.contractKey);
      if (directContractKeys.has(link.contractKey)) ataKeys.add(link.ataKey);
    }

    return {
      contractKeys: Array.from(contractKeys),
      ataKeys: Array.from(ataKeys),
      isLoading: loadingContractManagers || loadingAtaManagers || loadingLinks
    };
  }, [isGestor, user, contractManagers, ataManagers, links, loadingContractManagers, loadingAtaManagers, loadingLinks]);
}
