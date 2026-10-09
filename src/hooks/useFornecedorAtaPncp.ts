import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { desfazerIndicacaoFornecedorDaAtaRpc, indicarFornecedorDaAtaRpc } from '../adapters/contractManagementRpcAdapter';
import { fetchRegistrosFornecedorPncp, type RegistroFornecedorPncp } from '../services/fornecedorAtaPncpService';
import { useAuth } from '../context/AuthContext';

export const FORNECEDOR_ATA_PNCP_QUERY_KEY = ['atas-fornecedor-pncp'] as const;

/** Só o coordenador indica o fornecedor da ata (RPC indicar_fornecedor_da_ata, has_role('admin')). */
export function podeIndicarFornecedor(role: string | null | undefined): boolean {
  return role === 'admin';
}

/**
 * Atas que o PNCP publicou sem fornecedor (atas_fornecedor_pncp): uma consulta só, pequena, compartilhada pela
 * Ata 360 e pela Visão Geral, com as ações do coordenador (indicar e desfazer).
 */
export function useFornecedorAtaPncp() {
  const queryClient = useQueryClient();
  const { role } = useAuth();

  const { data = [], isLoading } = useQuery<RegistroFornecedorPncp[], Error>({
    queryKey: FORNECEDOR_ATA_PNCP_QUERY_KEY,
    queryFn: fetchRegistrosFornecedorPncp,
    staleTime: 5 * 60 * 1000
  });

  const porControle = useMemo(() => new Map(data.map((r) => [r.numeroControlePncp, r])), [data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: FORNECEDOR_ATA_PNCP_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['management-dashboard'] });
  };

  const indicar = useMutation({
    mutationFn: indicarFornecedorDaAtaRpc,
    retry: 0,
    onSuccess: invalidate
  });

  const desfazer = useMutation({
    mutationFn: desfazerIndicacaoFornecedorDaAtaRpc,
    retry: 0,
    onSuccess: invalidate
  });

  return { registros: data, porControle, isLoading, indicar, desfazer, podeIndicar: podeIndicarFornecedor(role) };
}
