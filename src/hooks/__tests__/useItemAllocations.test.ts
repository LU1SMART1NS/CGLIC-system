import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getItemAllocationsQueryOptions } from '../useItemAllocations';
import * as allocationService from '../../services/allocationService';

vi.mock('../../services/allocationService', () => ({
  fetchAllocationsWithState: vi.fn()
}));

describe('useItemAllocations Hook / Query Options - Testes Unitários de Leitura e Versão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve desabilitar a query (enabled: false) quando parâmetros obrigatórios estiverem ausentes', () => {
    const options = getItemAllocationsQueryOptions('', '', '');
    expect(options.queryKey).toEqual(['item-allocations', '']);
    expect(options.enabled).toBe(false);

    const optionsPartial = getItemAllocationsQueryOptions('00037/2026', '200331', '');
    expect(optionsPartial.enabled).toBe(false);
  });

  it('deve habilitar a query (enabled: true) e gerar queryKey canônica normalizada', () => {
    const options = getItemAllocationsQueryOptions('37/2026', '200331', '1');
    expect(options.queryKey).toEqual(['item-allocations', '00037/2026-200331-00001']);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(300000); // 5 min
  });

  it('deve chamar fetchAllocationsWithState com a chave canônica e retornar alocações e versão', async () => {
    const mockState = {
      allocations: [
        { id: 'alloc-1', unitName: 'DTI', allocatedQty: 100, empenhadaQty: 10 }
      ],
      version: 3
    };

    vi.mocked(allocationService.fetchAllocationsWithState).mockResolvedValueOnce(mockState);

    const options = getItemAllocationsQueryOptions('00037/2026', '200331', '00001');
    const result = await options.queryFn();

    expect(allocationService.fetchAllocationsWithState).toHaveBeenCalledWith('00037/2026-200331-00001');
    expect(result).toEqual(mockState);
    expect(result.version).toBe(3);
    expect(result.allocations).toHaveLength(1);
  });

  it('deve retornar estado inicial vazio e versão 1 quando queryFn for executada com parâmetros vazios', async () => {
    const options = getItemAllocationsQueryOptions('', '', '');
    const result = await options.queryFn();

    expect(result).toEqual({ allocations: [], version: 1 });
    expect(allocationService.fetchAllocationsWithState).not.toHaveBeenCalled();
  });

  it('deve manter isolamento estrito de query keys entre itens e atas distintos', () => {
    const optionsA = getItemAllocationsQueryOptions('00037/2026', '200331', '1');
    const optionsB = getItemAllocationsQueryOptions('00037/2026', '200331', '2');
    const optionsC = getItemAllocationsQueryOptions('00038/2026', '200331', '1');

    expect(optionsA.queryKey).not.toEqual(optionsB.queryKey);
    expect(optionsA.queryKey).not.toEqual(optionsC.queryKey);
    expect(optionsA.queryKey).toEqual(['item-allocations', '00037/2026-200331-00001']);
    expect(optionsB.queryKey).toEqual(['item-allocations', '00037/2026-200331-00002']);
    expect(optionsC.queryKey).toEqual(['item-allocations', '00038/2026-200331-00001']);
  });
});
