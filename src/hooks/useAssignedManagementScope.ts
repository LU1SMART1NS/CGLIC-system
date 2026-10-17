import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAllContractManagers } from './useAllContractManagers';
import { useAllAtaManagers, useArpItemContractLinks } from './useAtaManagers';
import { escopoDoGestor } from '../utils/escopoDoGestor';
import type { LeituraDaTela } from '../components/fonte/useLeiturasComFalha';

/** Rótulos das leituras do escopo na faixa "não carregou" (os mesmos das telas, para a faixa juntar numa linha só). */
export const ROTULO_GESTORES_CONTRATOS = 'gestores dos contratos';
export const ROTULO_GESTORES_ATAS = 'gestores das atas';
export const ROTULO_VINCULOS_ITEM_CONTRATO = 'vínculos entre itens de ata e contratos';

export interface AssignedManagementScope {
  /** `undefined` = sem restrição (perfil diferente de "gestor"). */
  contractKeys: string[] | undefined;
  /** `undefined` = sem restrição (perfil diferente de "gestor"). */
  ataKeys: string[] | undefined;
  isLoading: boolean;
  /**
   * Leituras de que o escopo depende (só quando há escopo). Se uma falhar, a carteira do gestor sai vazia ou pela
   * metade: a tela põe estas leituras na faixa "não carregou" em vez de mostrar "nada atribuído".
   */
  leituras?: LeituraDaTela[];
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
  /**
   * gestorUserId — coordenador e consulta: carteira de um gestor escolhido no filtro do Início (o perfil "gestor" ignora).
   * enabled — false segura as leituras (os números do menu esperam a tela encher).
   */
  opts: { gestorUserId?: string; enabled?: boolean } = {}
): AssignedManagementScope {
  const { user, role } = useAuth();
  const isGestor = role === 'gestor';
  const userId = isGestor ? user?.id : opts.gestorUserId;

  const enabled = opts.enabled ?? true;
  const contractManagersQuery = useAllContractManagers(uasg, { enabled });
  const ataManagersQuery = useAllAtaManagers({ enabled });
  const linksQuery = useArpItemContractLinks(enabled && Boolean(userId));
  const { data: contractManagers, isLoading: loadingContractManagers } = contractManagersQuery;
  const { data: ataManagers, isLoading: loadingAtaManagers } = ataManagersQuery;
  const { data: links, isLoading: loadingLinks } = linksQuery;

  const escopo = useMemo(() => {
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

  const leituras: LeituraDaTela[] = userId
    ? [
        { rotulo: ROTULO_GESTORES_CONTRATOS, query: contractManagersQuery },
        { rotulo: ROTULO_GESTORES_ATAS, query: ataManagersQuery },
        { rotulo: ROTULO_VINCULOS_ITEM_CONTRATO, query: linksQuery }
      ]
    : [];
  return { ...escopo, leituras };
}
