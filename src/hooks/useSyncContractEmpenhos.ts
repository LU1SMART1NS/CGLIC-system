import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sincronizarEmpenhosDoContrato, sincronizarEmpenhosDoRegistro } from '../services/contratoEmpenhosSincronizacaoService';
import { SINCRONIZACAO_EMPENHOS_QUERY_KEY } from './useSincronizacaoEmpenhosContrato';
import { refreshLinkedItemsOfContract, type ContractForItemsRefresh, type ContractItemsRefreshSummary } from '../services/contractItemsRefreshService';
import type { OrchestrationResult, ContractTarget } from '../types/empenhoSync';
import type { ContractDashboardRecord } from '../types';

/** Resultado do refresh dos itens da ata ligados ao contrato, quando pedido. */
export type SyncContractEmpenhosResult = OrchestrationResult & { itens_refresh?: ContractItemsRefreshSummary };

export interface SyncContractEmpenhosParams {
  /**
   * Registro do contrato. Quando informado, o alvo sai dele (id do Contratos.gov.br, buscado e gravado
   * se faltar; UASG; PNCP pelo id do PNCP) e `contratoId`/`pncpParams` são ignorados.
   */
  contrato?: ContractDashboardRecord;
  /** Id do contrato no PNCP, quando a tela o conhece e o registro não ("cnpj-2-sequencial/ano"). */
  numeroControlePncp?: string | null;
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
      const result = params?.contrato
        ? (await sincronizarEmpenhosDoRegistro(params.contrato, { numeroControlePncp: params.numeroControlePncp })).result
        : await sincronizarEmpenhosDoContrato({
            tipo: 'CONTRATO',
            contractKey,
            contratoId: params?.contratoId,
            pncpParams: params?.pncpParams
          } satisfies ContractTarget);
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
      // O id do Contratos.gov.br pode ter sido completado e gravado no registro do contrato.
      queryClient.invalidateQueries({ queryKey: ['contracts-dashboard'] });
    }
  });
}
