import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getContractDetailsQueryOptions } from '../useContractDetails';
import * as contractService from '../../services/contractService';
import type { ContractDashboardRecord } from '../../types';

vi.mock('../../services/contractService', () => ({
  fetchContractDetails: vi.fn()
}));

describe('useContractDetails Hook / Query Options - Testes Unitários de Detalhes de Contrato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleContract: ContractDashboardRecord = {
    id: 'can-key-10-2025',
    numero: '10',
    ano: '2025',
    numeroFormatado: '10/2025',
    uasg: '200331',
    nomeUnidadeGestora: 'SENASP',
    objeto: 'Aquisição de Viaturas',
    statusVigencia: 'Vigente',
    fonteDados: 'Contratos.gov.br'
  };

  it('deve desabilitar query (enabled: false) quando enabled for false ou contract ausente', () => {
    const optionsDisabled = getContractDetailsQueryOptions(sampleContract, false);
    expect(optionsDisabled.enabled).toBe(false);

    const optionsNoContract = getContractDetailsQueryOptions(null, true);
    expect(optionsNoContract.enabled).toBe(false);
  });

  it('deve habilitar query (enabled: true) quando enabled for true e contract presente', () => {
    const options = getContractDetailsQueryOptions(sampleContract, true);
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual(['contract-details', 'can-key-10-2025']);
    expect(options.staleTime).toBe(300000);
  });

  it('deve chamar fetchContractDetails quando queryFn for executada', async () => {
    const mockDetails = {
      items: [
        {
          numeroItem: 1,
          descricao: 'Item 1',
          quantidade: 10,
          valorUnitario: 100,
          valorTotal: 1000
        }
      ],
      empenhos: [
        {
          numeroEmpenho: '2025NE000123',
          dataEmissao: '2025-01-10',
          valor: 1000
        }
      ]
    };

    vi.mocked(contractService.fetchContractDetails).mockResolvedValueOnce(mockDetails as any);

    const options = getContractDetailsQueryOptions(sampleContract, true);
    const result = await options.queryFn();

    expect(contractService.fetchContractDetails).toHaveBeenCalledWith(sampleContract);
    expect(result).toEqual(mockDetails);
  });

  it('deve retornar itens e empenhos vazios se contract for nulo na execução da queryFn', async () => {
    const options = getContractDetailsQueryOptions(null, false);
    const result = await options.queryFn();

    expect(result).toEqual({ items: [], empenhos: [] });
    expect(contractService.fetchContractDetails).not.toHaveBeenCalled();
  });
});
