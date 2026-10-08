import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as orchestrationModule from '../../services/empenhoOrchestrationService';
import { useSyncContractEmpenhos } from '../useSyncContractEmpenhos';
import type { OrchestrationResult } from '../../types/empenhoSync';

vi.mock('../../services/empenhoOrchestrationService', () => ({
  orchestrateContractEmpenhoSync: vi.fn()
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

describe('useSyncContractEmpenhos Hook — Integração UI Contrato 360°', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSuccessResult: OrchestrationResult = {
    alvo: {
      tipo: 'CONTRATO',
      contractKey: '200331-00015-2026',
      contratoId: '15'
    },
    status: 'SUCESSO',
    fontes_consultadas: ['COMPRASNET', 'PNCP'],
    fontes_nao_aplicaveis: [],
    empenhos_encontrados: 2,
    empenhos_persistidos: 2,
    empenhos_atualizados: 0,
    vinculos_item_criados: 0,
    vinculos_contrato_criados: 2,
    divergencias: [],
    pendencias: [],
    erros: [],
    resumo_sync: {
      total_processados: 2,
      total_salvos: 2,
      total_itens_vinculados: 0,
      total_contratos_vinculados: 2,
      total_conflitos: 0,
      erros: [],
      reconciliados: []
    },
    executado_em: '2026-09-24T12:00:00.000Z'
  };

  it('1. deve delegar execução para orchestrateContractEmpenhoSync com alvo correto', async () => {
    vi.mocked(orchestrationModule.orchestrateContractEmpenhoSync).mockResolvedValueOnce(mockSuccessResult);

    const mutation = useSyncContractEmpenhos('200331-00015-2026');
    const result = await mutation.mutateAsync({
      contratoId: '15',
      pncpParams: {
        cnpj: '00394494000136',
        ano: 2026,
        sequencialContrato: 12
      }
    });

    expect(orchestrationModule.orchestrateContractEmpenhoSync).toHaveBeenCalledTimes(1);
    expect(orchestrationModule.orchestrateContractEmpenhoSync).toHaveBeenCalledWith({
      tipo: 'CONTRATO',
      contractKey: '200331-00015-2026',
      contratoId: '15',
      pncpParams: {
        cnpj: '00394494000136',
        ano: 2026,
        sequencialContrato: 12
      }
    });
    expect(result).toEqual(mockSuccessResult);
  });

  it('2. deve invalidar cirurgicamente as chaves de query M18 no onSuccess com grafia canônica', async () => {
    vi.mocked(orchestrationModule.orchestrateContractEmpenhoSync).mockResolvedValueOnce(mockSuccessResult);

    const mutation = useSyncContractEmpenhos('200331-00015-2026');
    await mutation.mutateAsync();

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['contract', '200331-00015-2026']
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['v_contrato_empenhos_lastro', '200331-00015-2026']
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['v_empenhos_resumo']
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['contract-events', '200331-00015-2026']
    });
    // Não deve invalidar chaves incorretas ou não-relacionadas
    expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['contract_events', '200331-00015-2026']
    });
    expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['v_arp_item_saldo_detalhado']
    });
    // O Financeiro do Contrato lê o dashboard gerencial: precisa recarregar após a sincronização
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['management-dashboard']
    });
    // Situação da sincronização mostrada na aba de empenhos do contrato
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['contrato-empenhos-sincronizacao', '200331-00015-2026']
    });
    // O id do Contratos.gov.br pode ter sido completado e gravado no registro do contrato
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['contracts-dashboard'] });
    // A divisão das notas entre os itens do contrato (migration 94) muda com os empenhos.
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['contrato-empenho-distribuicao', '200331-00015-2026'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledTimes(13);
  });

  it('3. falha inesperada do orquestrador vira resultado ERRO com a mensagem (e é registrada, não lançada)', async () => {
    const errorObj = new Error('Falha de conexão com fontes oficiais');
    vi.mocked(orchestrationModule.orchestrateContractEmpenhoSync).mockRejectedValueOnce(errorObj);

    const mutation = useSyncContractEmpenhos('200331-00015-2026');
    const result = await mutation.mutateAsync();
    expect(result.status).toBe('ERRO');
    expect(result.erros[0].erro).toBe('Falha de conexão com fontes oficiais');
    expect(result.empenhos_persistidos).toBe(0);
  });
});
