import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getItemAdesoesQueryOptions } from '../useItemAdesoes';
import * as api from '../../services/api';

vi.mock('../../services/api', () => ({
  fetchAdesoesItem: vi.fn()
}));

describe('useItemAdesoes Hook / Query Options - Testes Unitários de Contrato e Cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve desabilitar a query (enabled: false) quando parâmetros obrigatórios estiverem ausentes', () => {
    const options = getItemAdesoesQueryOptions('', '', '');
    expect(options.queryKey).toEqual(['item-adesoes', '', '', '']);
    expect(options.enabled).toBe(false);

    const optionsPartial = getItemAdesoesQueryOptions('00041/2025', '200331', '');
    expect(optionsPartial.enabled).toBe(false);
  });

  it('deve habilitar a query (enabled: true) e gerar queryKey canônica com os parâmetros preenchidos', () => {
    const options = getItemAdesoesQueryOptions('00041/2025', '200331', '1');
    expect(options.queryKey).toEqual(['item-adesoes', '00041/2025', '200331', '1']);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(300000); // 5 min
  });

  it('deve chamar fetchAdesoesItem com parâmetros normalizados e devolver as adesões do item', async () => {
    const mockResultado = [
      {
        numeroAta: '00041/2025',
        unidadeGerenciadora: '200331',
        unidadeNaoParticipante: '158123 - POLÍCIA FEDERAL - SR/DF',
        dataAprovacaoAnalise: '2026-01-01T10:00:00',
        quantidadeAprovadaAdesao: 50
      },
      {
        numeroAta: '00041/2025',
        unidadeGerenciadora: '200331',
        unidadeNaoParticipante: '158124 - POLÍCIA RODOVIÁRIA FEDERAL',
        dataAprovacaoAnalise: '2026-02-01T10:00:00',
        quantidadeAprovadaAdesao: null
      }
    ];

    vi.mocked(api.fetchAdesoesItem).mockResolvedValueOnce({
      resultado: mockResultado,
      totalRegistros: 2,
      totalPaginas: 1,
      paginasRestantes: 0
    });

    const options = getItemAdesoesQueryOptions(' 00041/2025 ', '200331', '1');
    const result = await options.queryFn();

    expect(api.fetchAdesoesItem).toHaveBeenCalledWith('00041/2025', '200331', '1');
    expect(result.map(r => r.unidadeNaoParticipante)).toEqual([
      '158123 - POLÍCIA FEDERAL - SR/DF',
      '158124 - POLÍCIA RODOVIÁRIA FEDERAL'
    ]);
  });

  it('deve retornar lista vazia se a API retornar resultado vazio', async () => {
    vi.mocked(api.fetchAdesoesItem).mockResolvedValueOnce({
      resultado: [],
      totalRegistros: 0,
      totalPaginas: 0,
      paginasRestantes: 0
    });

    const options = getItemAdesoesQueryOptions('00041/2025', '200331', '1');
    const result = await options.queryFn();

    expect(api.fetchAdesoesItem).toHaveBeenCalledWith('00041/2025', '200331', '1');
    expect(result).toEqual([]);
  });

  it('deve retornar lista vazia se os parâmetros forem vazios durante a execução de queryFn', async () => {
    const options = getItemAdesoesQueryOptions('', '', '');
    const result = await options.queryFn();
    expect(result).toEqual([]);
    expect(api.fetchAdesoesItem).not.toHaveBeenCalled();
  });

  it('deve manter isolamento estrito de query keys entre itens e atas distintos', () => {
    const optionsA = getItemAdesoesQueryOptions('00041/2025', '200331', '1');
    const optionsB = getItemAdesoesQueryOptions('00041/2025', '200331', '2');
    const optionsC = getItemAdesoesQueryOptions('00042/2025', '200331', '1');

    expect(optionsA.queryKey).not.toEqual(optionsB.queryKey);
    expect(optionsA.queryKey).not.toEqual(optionsC.queryKey);
    expect(optionsA.queryKey).toEqual(['item-adesoes', '00041/2025', '200331', '1']);
    expect(optionsB.queryKey).toEqual(['item-adesoes', '00041/2025', '200331', '2']);
    expect(optionsC.queryKey).toEqual(['item-adesoes', '00042/2025', '200331', '1']);
  });
});
