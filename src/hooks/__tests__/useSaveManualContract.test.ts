import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as allocationService from '../../services/allocationService';
import { normalizeItemKey, parseItemKey } from '../../utils/itemKeyUtils';
import type { Contrato } from '../../types';

vi.mock('../../services/allocationService', () => ({
  saveManualContratoWithEmpenhos: vi.fn(),
  saveAllocations: vi.fn(),
  saveEmpenhoLinks: vi.fn(),
  saveManualEmpenhos: vi.fn(),
  saveEmpenhoManualQuantities: vi.fn()
}));

describe('useSaveManualContract Hook / Mutation - Testes Unitários de Persistência e Invalidação (Fase 4.3D.4B)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
  });

  it('deve chamar saveManualContratoWithEmpenhos com contrato e array de empenhoIds', async () => {
    const mockResult = {
      success: true,
      contrato_id: 'ctr_00037/2026-200331-00001_12/2026_2026',
      item_key: '00037/2026-200331-00001',
      links_count: 2,
      timestamp: new Date().toISOString()
    };

    vi.mocked(allocationService.saveManualContratoWithEmpenhos).mockResolvedValueOnce(mockResult);

    const mockContrato: Contrato = {
      id: 'manual-contrato-123',
      numero: '12/2026',
      ano: 2026,
      arpId: '00037/2026',
      itemId: '00001',
      uasg: '200331',
      fornecedor: 'Empresa Alpha Ltda',
      cnpjFornecedor: '12.345.678/0001-90',
      objeto: 'Aquisição de equipamentos de TI',
      origem: 'MANUAL',
      criadoEm: '2026-09-18T10:00:00Z',
      atualizadoEm: '2026-09-18T10:00:00Z'
    };

    const variables = {
      contrato: mockContrato,
      empenhoIds: ['2026NE000123', '2026NE000124']
    };

    const mutationFn = async (vars: typeof variables) => {
      return allocationService.saveManualContratoWithEmpenhos(vars.contrato, vars.empenhoIds);
    };

    const result = await mutationFn(variables);

    expect(allocationService.saveManualContratoWithEmpenhos).toHaveBeenCalledWith(
      mockContrato,
      ['2026NE000123', '2026NE000124']
    );
    expect(result).toEqual(mockResult);
  });

  it('deve invalidar cirurgicamente item-manual-contracts e item-contract-empenho-links, sem afetar outros agregados', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const variables = {
      contrato: {
        id: 'c1',
        numero: '12/2026',
        ano: 2026,
        arpId: '37/2026',
        itemId: '1',
        uasg: '200331',
        origem: 'MANUAL' as const,
        criadoEm: '',
        atualizadoEm: ''
      },
      empenhoIds: ['2026NE000123']
    };

    // Simulação do onSuccess canônico do hook
    const rawKey = `${variables.contrato.arpId}-${variables.contrato.uasg}-${variables.contrato.itemId || '00001'}`;
    const parsed = parseItemKey(rawKey);
    const canonicalKey = normalizeItemKey(parsed.numeroAta, parsed.uasg, parsed.itemNum);

    queryClient.invalidateQueries({
      queryKey: ['item-manual-contracts', canonicalKey]
    });
    queryClient.invalidateQueries({
      queryKey: ['item-contract-empenho-links', canonicalKey]
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['item-manual-contracts', '00037/2026-200331-00001']
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['item-contract-empenho-links', '00037/2026-200331-00001']
    });

    // Garante que outros agregados NÃO foram afetados
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-allocations'])
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-manual-empenhos'])
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-manual-quantities'])
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['item-empenho-links'])
    });
  });

  it('deve propagar erro de violação da regra RN-07 (INVALID_CONTRACT_LINK / 23514) sem retry', async () => {
    const rn07Error = {
      code: 'INVALID_CONTRACT_LINK',
      message: 'Regra RN-07 violada. Todo contrato exige vinculação a pelo menos um empenho.',
      sqlState: '23514'
    };

    vi.mocked(allocationService.saveManualContratoWithEmpenhos).mockRejectedValueOnce(rn07Error);

    const mutationFn = async (vars: { contrato: Contrato; empenhoIds: string[] }) => {
      return allocationService.saveManualContratoWithEmpenhos(vars.contrato, vars.empenhoIds);
    };

    const mockContrato: Contrato = {
      id: 'c1',
      numero: '99/2026',
      ano: 2026,
      arpId: '00037/2026',
      itemId: '00001',
      uasg: '200331',
      origem: 'MANUAL',
      criadoEm: '',
      atualizadoEm: ''
    };

    await expect(mutationFn({
      contrato: mockContrato,
      empenhoIds: []
    })).rejects.toEqual(rn07Error);

    expect(allocationService.saveManualContratoWithEmpenhos).toHaveBeenCalledTimes(1); // retry = 0
  });

  it('deve propagar erro de rede/configuração (NETWORK_OR_CONFIG_ERROR)', async () => {
    const networkError = {
      code: 'NETWORK_OR_CONFIG_ERROR',
      message: 'Falha de comunicação com o servidor de dados.'
    };

    vi.mocked(allocationService.saveManualContratoWithEmpenhos).mockRejectedValueOnce(networkError);

    const mutationFn = async (vars: { contrato: Contrato; empenhoIds: string[] }) => {
      return allocationService.saveManualContratoWithEmpenhos(vars.contrato, vars.empenhoIds);
    };

    const mockContrato: Contrato = {
      id: 'c1',
      numero: '99/2026',
      ano: 2026,
      arpId: '00037/2026',
      itemId: '00001',
      uasg: '200331',
      origem: 'MANUAL',
      criadoEm: '',
      atualizadoEm: ''
    };

    await expect(mutationFn({
      contrato: mockContrato,
      empenhoIds: ['2026NE000123']
    })).rejects.toEqual(networkError);
  });

  it('não deve invocar persistências de outros domínios como efeito colateral', async () => {
    const mockResult = {
      success: true,
      contrato_id: 'c1',
      item_key: '00037/2026-200331-00001',
      links_count: 1,
      timestamp: new Date().toISOString()
    };

    vi.mocked(allocationService.saveManualContratoWithEmpenhos).mockResolvedValueOnce(mockResult);

    const mockContrato: Contrato = {
      id: 'c1',
      numero: '12/2026',
      ano: 2026,
      arpId: '00037/2026',
      itemId: '00001',
      uasg: '200331',
      origem: 'MANUAL',
      criadoEm: '',
      atualizadoEm: ''
    };

    await allocationService.saveManualContratoWithEmpenhos(mockContrato, ['2026NE000123']);

    expect(allocationService.saveAllocations).not.toHaveBeenCalled();
    expect(allocationService.saveEmpenhoLinks).not.toHaveBeenCalled();
    expect(allocationService.saveManualEmpenhos).not.toHaveBeenCalled();
    expect(allocationService.saveEmpenhoManualQuantities).not.toHaveBeenCalled();
  });
});
