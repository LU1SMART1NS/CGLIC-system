import React from 'react';
import type { ContractDashboardRecord } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSyncContractEmpenhos } from './useSyncContractEmpenhos';

const SYNC_ROLES = ['gestor', 'coordenador', 'admin'];

// Uma tentativa por contrato e por sessão: o botão "Atualizar empenhos" cobre as seguintes.
const attempted = new Set<string>();

export function shouldAutoSyncEmpenhos(input: {
  isLoading: boolean;
  isError: boolean;
  empenhosCount: number;
  authorized: boolean;
  alreadyTried: boolean;
  isSyncing: boolean;
}): boolean {
  return (
    !input.isLoading && !input.isError && input.empenhosCount === 0 && input.authorized && !input.alreadyTried && !input.isSyncing
  );
}

/**
 * Na primeira abertura do contrato sem nenhum empenho gravado, busca os empenhos nas bases oficiais
 * (como o Item faz ao abrir), para o gestor não precisar saber que existe o botão "Atualizar empenhos".
 */
export function useAutoSyncContractEmpenhos(
  contract: ContractDashboardRecord,
  contractKey: string,
  state: { isLoading: boolean; isError: boolean; empenhosCount: number }
) {
  const { role } = useAuth();
  const sync = useSyncContractEmpenhos(contractKey);
  const { mutate, isPending } = sync;

  React.useEffect(() => {
    const ok = shouldAutoSyncEmpenhos({
      ...state,
      authorized: SYNC_ROLES.includes(role ?? ''),
      alreadyTried: attempted.has(contractKey),
      isSyncing: isPending
    });
    if (!ok) return;
    attempted.add(contractKey);
    const pncpParams =
      contract.codigoOrgao && contract.ano && contract.numero
        ? { cnpj: contract.codigoOrgao, ano: contract.ano, sequencialContrato: contract.numero }
        : undefined;
    mutate({
      contratoId: contract.contratoId || contract.id,
      pncpParams,
      refreshItems: role === 'gestor' || role === 'admin' ? contract : undefined
    });
  }, [state.isLoading, state.isError, state.empenhosCount, role, contractKey, contract, isPending, mutate, state]);

  return { isSyncing: isPending };
}
