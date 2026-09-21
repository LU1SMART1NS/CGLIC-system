import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getItemContractsQueryOptions } from '../useItemContracts';
import * as api from '../../services/api';

vi.mock('../../services/api', () => ({
  fetchPncpContracts: vi.fn()
}));

describe('useItemContracts Hook / Query Options - Testes Unitários de Contratos por Item de ARP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve desabilitar a query (enabled: false) quando parâmetros obrigatórios estiverem ausentes', () => {
    const options = getItemContractsQueryOptions('', '', '');
    expect(options.queryKey).toEqual(['item-contracts', '', '', '']);
    expect(options.enabled).toBe(false);

    const optionsPartial = getItemContractsQueryOptions('00041/2025', '200331', '');
    expect(optionsPartial.enabled).toBe(false);
  });

  it('deve habilitar a query (enabled: true) e gerar queryKey canônica com os parâmetros preenchidos', () => {
    const options = getItemContractsQueryOptions('00041/2025', '200331', '1');
    expect(options.queryKey).toEqual(['item-contracts', '00041/2025', '200331', '1']);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(300000); // 5 min
  });

  it('deve chamar fetchPncpContracts com parâmetros normalizados e retornar contratos', async () => {
    const mockContracts = [
      {
        numeroContrato: '10/2025',
        anoContrato: 2025,
        numeroControlePncp: '00394494000136-2-000010/2025',
        quantidadeContratada: 50
      }
    ];

    vi.mocked(api.fetchPncpContracts).mockResolvedValueOnce(mockContracts as any);

    const fallbackParams = { codigoUnidadeGestora: '200331' };
    const fornecedorInfo = { niFornecedor: '12345678000199' };

    const options = getItemContractsQueryOptions(
      '00041/2025',
      '200331',
      '1',
      '00394494000136',
      '2025',
      '41',
      '3',
      fallbackParams,
      fornecedorInfo
    );

    const result = await options.queryFn();

    expect(api.fetchPncpContracts).toHaveBeenCalledWith(
      '00394494000136',
      '2025',
      '41',
      '3',
      '1',
      fallbackParams,
      fornecedorInfo,
      '00041/2025'
    );
    expect(result).toEqual(mockContracts);
  });

  it('deve retornar lista vazia se os parâmetros forem vazios durante a execução de queryFn', async () => {
    const options = getItemContractsQueryOptions('', '', '');
    const result = await options.queryFn();
    expect(result).toEqual([]);
    expect(api.fetchPncpContracts).not.toHaveBeenCalled();
  });

  it('deve manter isolamento estrito de query keys entre itens e atas distintos', () => {
    const optionsA = getItemContractsQueryOptions('00041/2025', '200331', '1');
    const optionsB = getItemContractsQueryOptions('00041/2025', '200331', '2');
    const optionsC = getItemContractsQueryOptions('00042/2025', '200331', '1');

    expect(optionsA.queryKey).not.toEqual(optionsB.queryKey);
    expect(optionsA.queryKey).not.toEqual(optionsC.queryKey);
    expect(optionsA.queryKey).toEqual(['item-contracts', '00041/2025', '200331', '1']);
    expect(optionsB.queryKey).toEqual(['item-contracts', '00041/2025', '200331', '2']);
    expect(optionsC.queryKey).toEqual(['item-contracts', '00042/2025', '200331', '1']);
  });
});
