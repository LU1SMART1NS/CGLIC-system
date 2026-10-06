import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sincronizarEmpenhosDoContrato } from '../services/contratoEmpenhosSincronizacaoService';
import { SINCRONIZACAO_EMPENHOS_QUERY_KEY } from './useSincronizacaoEmpenhosContrato';
import { refreshLinkedItemsOfContract, type ContractForItemsRefresh, type ContractItemsRefreshSummary } from '../services/contractItemsRefreshService';
import type { OrchestrationResult, ContractTarget } from '../types/empenhoSync';

/** Resultado do refresh dos itens da ata ligados ao contrato, quando pedido. */
export type SyncContractEmpenhosResult = OrchestrationResult & { itens_refresh?: ContractItemsRefreshSummary };

export interface SyncContractEmpenhosParams {
  contratoId?: number | string;
  pncpParams?: ContractTarget['pncpParams'];
  /** Quando informado, depois dos empenhos do contrato refaz também os itens da ata ligados a ele. */
  refreshItems?: ContractForItemsRefresh;
}

/**
 * Hook React Query para orquestração on-demand de sincronização de empenhos de Contrato.
 * 
 * Invariantes Invioláveis:
 * 1. O hook NÃO contém lógica contábil, de normalização ou reconciliação.
 * 2. Delega integralmente a execução para `sincronizarEmpenhosDoContrato` (orquestração + registro da situação).
 * 3. Invalida exclusivamente as query keys necessárias (M18 e detalhes do contrato).
 */
export function useSyncContractEmpenhos(contractKey: string) {
  const queryClient = useQueryClient();

  return useMutation<SyncContractEmpenhosResult, Error, SyncContractEmpenhosParams | void>({
    mutationFn: async (params) => {
      const target: ContractTarget = {
        tipo: 'CONTRATO',
        contractKey,
        contratoId: params?.contratoId,
        pncpParams: params?.pncpParams
      };
      const result = await sincronizarEmpenhosDoContrato(target);
      if (!params?.refreshItems) return result;
      // Os empenhos do contrato já estão gravados; a parte do item não pode desfazer isso se falhar.
      try {
        return { ...result, itens_refresh: await refreshLinkedItemsOfContract(params.refreshItems, contractKey) };
      } catch (err: any) {
        return { ...result, itens_refresh: { itens: 0, pendentes: 0, falhas: [{ itemKey: '', motivo: err?.message || 'Itens não atualizados.' }] } };
      }
    },
    onSuccess: () => {
      // Invalidação cirúrgica de caches M18 e visões relacionadas ao Contrato
      queryClient.invalidateQueries({ queryKey: ['contract', contractKey] });
      queryClient.invalidateQueries({ queryKey: ['v_contrato_empenhos_lastro', contractKey] });
      queryClient.invalidateQueries({ queryKey: ['v_empenhos_resumo'] });
      queryClient.invalidateQueries({ queryKey: ['management-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['contract-empenhos', contractKey] });
      queryClient.invalidateQueries({ queryKey: ['contract-empenho-item-links', contractKey] });
      // Itens da ata ligados ao contrato: empenhos, quantidades e saldos
      queryClient.invalidateQueries({ queryKey: ['item-empenho-vinculos'] });
      queryClient.invalidateQueries({ queryKey: ['contract-item-quantities'] });
      queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
      queryClient.invalidateQueries({ queryKey: ['contract-events', contractKey] });
      queryClient.invalidateQueries({ queryKey: SINCRONIZACAO_EMPENHOS_QUERY_KEY(contractKey) });
    }
  });
}
