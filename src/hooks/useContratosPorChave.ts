import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchContratosParaTelaPorChaves } from '../services/contratosOficiaisService';
import { CONTRACTS_GC_TIME_MS, CONTRACTS_STALE_TIME_MS, getContractsDashboardQueryOptions } from './useContractsDashboard';
import { sementeDaCarteira } from './sementeDaCarteira';
import type { ContractDashboardRecord } from '../types';

/** Chaves com que enrichContractLinks casa um contrato: o id e "uasg-numero-ano", em maiúsculas. */
function chavesDoContrato(c: ContractDashboardRecord): string[] {
  return [c.id, `${c.uasg}-${c.numero}-${c.ano}`].filter(Boolean).map((k) => String(k).toUpperCase());
}

/**
 * Só os contratos destas chaves (os vinculados a uma ata ou a um item), em vez da carteira inteira da UASG.
 * A consulta fica sob o prefixo ['contracts-dashboard', uasg] (a sincronização invalida as duas juntas). Com a lista
 * da carteira no navegador, os contratos saem dela, sem pedido; o resultado é o mesmo que enriquecer com a lista.
 */
export function useContratosPorChave(uasg: string | undefined, chaves: readonly string[] | undefined) {
  const queryClient = useQueryClient();
  const cleanUasg = (uasg || '').trim();
  const ordenadas = useMemo(() => [...new Set((chaves ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean))].sort(), [chaves]);
  const query = useQuery<ContractDashboardRecord[], Error>({
    queryKey: ['contracts-dashboard', cleanUasg, 'chaves', ordenadas.join(',')] as const,
    queryFn: () => fetchContratosParaTelaPorChaves(cleanUasg, ordenadas),
    // Sem chaves (lista ainda carregando ou nenhum vínculo) não há o que ler.
    enabled: Boolean(cleanUasg && chaves && ordenadas.length > 0),
    staleTime: CONTRACTS_STALE_TIME_MS,
    gcTime: CONTRACTS_GC_TIME_MS,
    refetchOnWindowFocus: false,
    ...sementeDaCarteira<ContractDashboardRecord[], ContractDashboardRecord[]>(queryClient, getContractsDashboardQueryOptions(cleanUasg).queryKey, (lista) => {
      const alvo = new Set(ordenadas);
      return lista.filter((c) => chavesDoContrato(c).some((k) => alvo.has(k)));
    })
  });
  return query;
}
