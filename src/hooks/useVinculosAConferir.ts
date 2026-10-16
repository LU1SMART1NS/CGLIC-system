import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { manterVinculoAConferirRpc, retirarVinculoAConferirRpc } from '../adapters/contractManagementRpcAdapter';
import { fetchVinculosAConferir, type VinculoAConferir } from '../services/vinculosAConferirService';
import { useAuth } from '../context/AuthContext';

export const VINCULOS_A_CONFERIR_QUERY_KEY = ['vinculos-a-conferir'] as const;

/** Só o coordenador decide (RPCs manter_ e retirar_vinculo_a_conferir, has_role('admin')). */
export function podeDecidirVinculo(role: string | null | undefined): boolean {
  return role === 'admin';
}

/**
 * Vínculos automáticos desmentidos pela fonte que têm trabalho do gestor (migration 112): uma consulta pequena,
 * compartilhada pelas filas de ações, pelo Item 360 e pela Ata 360, com as decisões do coordenador.
 */
export function useVinculosAConferir() {
  const queryClient = useQueryClient();
  const { role } = useAuth();

  const { data = [], isLoading } = useQuery<VinculoAConferir[], Error>({
    queryKey: VINCULOS_A_CONFERIR_QUERY_KEY,
    queryFn: fetchVinculosAConferir,
    staleTime: 5 * 60 * 1000
  });

  const porPar = useMemo(() => new Map(data.map((v) => [`${v.itemKey}|${v.contractKey}`, v])), [data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: VINCULOS_A_CONFERIR_QUERY_KEY });
    // Mesmas telas que o Desvincular atualiza: vínculos do item e da ata, saldo, contratado e distribuição das notas.
    for (const key of ['management-dashboard', 'item-contract-links', 'ata-linked-contracts', 'all-arp-item-contract-links', 'contratado-do-item', 'contrato-empenho-distribuicao', 'ata-item-saldos', 'vinculo-automatico']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const manter = useMutation({ mutationFn: manterVinculoAConferirRpc, retry: 0, onSuccess: invalidate });
  const retirar = useMutation({ mutationFn: retirarVinculoAConferirRpc, retry: 0, onSuccess: invalidate });

  return { vinculos: data, porPar, isLoading, manter, retirar, podeDecidir: podeDecidirVinculo(role) };
}
