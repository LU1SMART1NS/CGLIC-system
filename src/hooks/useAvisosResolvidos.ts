import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reexibirAvisoRpc, resolverAvisoRpc, type ResolverAvisoInput } from '../adapters/contractManagementRpcAdapter';
import { fetchAvisosResolvidos, type AvisoResolvido } from '../services/avisosResolvidosService';
import { useAuth } from '../context/AuthContext';

export const AVISOS_RESOLVIDOS_QUERY_KEY = ['avisos-resolvidos'] as const;

/** Quem pode marcar aviso como resolvido e reexibir (decisão de 08/10/2026). */
export function podeResolverAvisos(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'gestor' || role === 'gestor_saldos';
}

/** Concluir tarefa do plano continua só com gestor e coordenador (RPCs das tarefas). */
export function podeConcluirTarefas(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'gestor';
}

/**
 * Avisos marcados como resolvidos, de todas as telas (uma consulta só, pequena), com as
 * ações de resolver (com justificativa) e reexibir. As telas separam os avisos pela chave.
 */
export function useAvisosResolvidos() {
  const queryClient = useQueryClient();
  const { role } = useAuth();

  const { data = [] } = useQuery<AvisoResolvido[], Error>({
    queryKey: AVISOS_RESOLVIDOS_QUERY_KEY,
    queryFn: fetchAvisosResolvidos,
    staleTime: 5 * 60 * 1000
  });

  const porChave = useMemo(() => new Map(data.map((a) => [a.chave, a])), [data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: AVISOS_RESOLVIDOS_QUERY_KEY });
    // Os números da Visão Geral (cartões, outras telas) leem os avisos já sem os resolvidos.
    void queryClient.invalidateQueries({ queryKey: ['management-dashboard'] });
  };

  const resolver = useMutation<unknown, Error, ResolverAvisoInput>({
    mutationFn: resolverAvisoRpc,
    retry: 0,
    onSuccess: invalidate
  });

  const reexibir = useMutation<unknown, Error, { chave: string }>({
    mutationFn: ({ chave }) => reexibirAvisoRpc(chave),
    retry: 0,
    onSuccess: invalidate
  });

  return { porChave, resolver, reexibir, podeResolver: podeResolverAvisos(role), podeConcluirTarefas: podeConcluirTarefas(role) };
}
