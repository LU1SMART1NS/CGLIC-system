import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as seiService from '../../services/seiService';
import { getProcessosSeiQueryOptions } from '../useProcessosSei';

vi.mock('../../services/seiService', () => ({
  fetchProcessosSei: vi.fn()
}));

describe('useProcessosSei Hook / Query Options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar a queryKey canônica ["processos-sei"]', () => {
    const options = getProcessosSeiQueryOptions();
    expect(options.queryKey).toEqual(['processos-sei']);
  });

  it('deve invocar fetchProcessosSei na queryFn', async () => {
    const mockProcessos = [
      {
        id: 'sei-1',
        numeroProcessoSei: '10154.000123/2024-11',
        descricaoObjeto: 'Objeto 1',
        statusProcesso: 'Em Instrução'
      }
    ];

    vi.mocked(seiService.fetchProcessosSei).mockResolvedValueOnce(mockProcessos as any);

    const options = getProcessosSeiQueryOptions();
    const result = await options.queryFn();

    expect(seiService.fetchProcessosSei).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockProcessos);
  });
});
