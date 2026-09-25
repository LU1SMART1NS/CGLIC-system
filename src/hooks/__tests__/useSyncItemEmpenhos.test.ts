import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as orchestrationModule from '../../services/empenhoOrchestrationService';
import { useSyncItemEmpenhos } from '../useSyncItemEmpenhos';
import type { OrchestrationResult } from '../../types/empenhoSync';

vi.mock('../../services/empenhoOrchestrationService', () => ({
  orchestrateItemEmpenhoSync: vi.fn()
}));

const mockQueryClient = {
  invalidateQueries: vi.fn()
};

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
  useMutation: (options: any) => ({
    mutate: (vars: any) => options.mutationFn(vars).then((res: any) => {
      if (options.onSuccess) options.onSuccess(res, vars);
      return res;
    }),
    mutateAsync: (vars: any) => options.mutationFn(vars).then((res: any) => {
      if (options.onSuccess) options.onSuccess(res, vars);
      return res;
    }),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    data: null,
    reset: vi.fn()
  })
}));

describe('useSyncItemEmpenhos Hook — Integração UI Item da Ata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSuccessResult: OrchestrationResult = {
    alvo: {
      tipo: 'ITEM',
      itemKey: '90001/2026-200331-1'
    },
    status: 'SUCESSO',
    fontes_consultadas: ['COMPRASNET'],
    fontes_nao_aplicaveis: [],
    empenhos_encontrados: 2,
    empenhos_persistidos: 2,
    empenhos_atualizados: 0,
    vinculos_item_criados: 2,
    vinculos_contrato_criados: 0,
    divergencias: [],
    pendencias: [],
    erros: [],
    resumo_sync: {
      total_processados: 2,
      total_salvos: 2,
      total_itens_vinculados: 2,
      total_contratos_vinculados: 0,
      total_conflitos: 0,
      erros: [],
      reconciliados: []
    },
    executado_em: '2026-09-24T12:00:00.000Z'
  };

  it('1. deve delegar execução para orchestrateItemEmpenhoSync com itemKey e parâmetros corretos', async () => {
    vi.mocked(orchestrationModule.orchestrateItemEmpenhoSync).mockResolvedValueOnce(mockSuccessResult);

    const mutation = useSyncItemEmpenhos('90001/2026-200331-1');
    const result = await mutation.mutateAsync({
      unitPrice: 150.50
    });

    expect(orchestrationModule.orchestrateItemEmpenhoSync).toHaveBeenCalledTimes(1);
    expect(orchestrationModule.orchestrateItemEmpenhoSync).toHaveBeenCalledWith({
      tipo: 'ITEM',
      itemKey: '90001/2026-200331-1',
      unitPrice: 150.50,
      contracts: undefined
    });
    expect(result).toEqual(mockSuccessResult);
  });

  it('2. deve invalidar cirurgicamente as chaves de query do Item e de Saldo M18 no onSuccess', async () => {
    vi.mocked(orchestrationModule.orchestrateItemEmpenhoSync).mockResolvedValueOnce(mockSuccessResult);

    const mutation = useSyncItemEmpenhos('90001/2026-200331-00001');
    await mutation.mutateAsync();

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['item-empenhos', '90001/2026', '200331', '00001']
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['item-unidades', '90001/2026', '200331', '00001']
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['item-empenhos', '90001/2026', '200331', '1']
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['item-unidades', '90001/2026', '200331', '1']
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['v_arp_item_saldo_detalhado', '90001/2026-200331-00001']
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['v_arp_item_saldo_detalhado']
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['v_arp_item_empenhos_resumo', '90001/2026-200331-00001']
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['v_empenhos_resumo']
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['item-allocations', '90001/2026-200331-00001']
    });
    // Não deve invalidar chaves desconectadas de contrato isolado
    expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['contracts-dashboard']
    });
  });

  it('3. deve propagar erros de execução se o orquestrador falhar', async () => {
    const errorObj = new Error('Falha de conexão com a API Compras.gov.br');
    vi.mocked(orchestrationModule.orchestrateItemEmpenhoSync).mockRejectedValueOnce(errorObj);

    const mutation = useSyncItemEmpenhos('90001/2026-200331-1');
    await expect(mutation.mutateAsync()).rejects.toThrow('Falha de conexão com a API Compras.gov.br');
  });
});
