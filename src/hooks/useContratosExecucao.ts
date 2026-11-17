import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmarExecucaoContrato,
  desfazerDecisaoExecucao,
  fetchExecucaoDosContratos,
  marcarContratoNaoTerminou
} from '../services/contratoExecucaoService';
import type { ExecucaoDoContrato } from '../utils/contratoExecutado';
import { useAuth } from '../context/AuthContext';

export const CONTRATOS_EXECUCAO_QUERY_KEY = ['contratos-execucao'] as const;
/** Rótulo da leitura na faixa "não carregou". */
export const ROTULO_CONTRATOS_EXECUCAO = 'contratos com escopo cumprido';

const VAZIO = new Map<string, ExecucaoDoContrato>();

/** Quem confirma o escopo cumprido: o gestor do contrato e o coordenador (o banco confere o alcance). */
export function podeDecidirExecucao(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'gestor';
}

/** Escopo cumprido dos contratos vigentes (uma consulta pequena) e as decisões do gestor. */
export function useContratosExecucao({ enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const { role } = useAuth();

  const consulta = useQuery<Map<string, ExecucaoDoContrato>, Error>({
    queryKey: CONTRATOS_EXECUCAO_QUERY_KEY,
    queryFn: fetchExecucaoDosContratos,
    staleTime: 5 * 60 * 1000,
    enabled
  });
  const porContrato = consulta.data ?? VAZIO;

  /** Contratos confirmados como executados: saem de Vigentes e dos avisos de prorrogação e vencimento. */
  const executados = useMemo(() => {
    const s = new Set<string>();
    for (const [key, e] of porContrato) if (e.estado === 'EXECUTADO') s.add(key);
    return s;
  }, [porContrato]);

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: CONTRATOS_EXECUCAO_QUERY_KEY });
    // O Início e as filas do contrato leem os executados para tirar os avisos de prorrogação.
    void queryClient.invalidateQueries({ queryKey: ['management-dashboard'] });
  };

  const confirmar = useMutation({ mutationFn: confirmarExecucaoContrato, retry: 0, onSuccess: invalidar });
  const naoTerminou = useMutation({ mutationFn: marcarContratoNaoTerminou, retry: 0, onSuccess: invalidar });
  const desfazer = useMutation({ mutationFn: desfazerDecisaoExecucao, retry: 0, onSuccess: invalidar });

  return { porContrato, executados, confirmar, naoTerminou, desfazer, podeDecidir: podeDecidirExecucao(role), consulta };
}
