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

  it('deve chamar fetchAdesoesItem com parâmetros normalizados e filtrar registros do item correspondente', async () => {
    const mockResultado = [
      {
        numeroAta: '00041/2025',
        unidadeGerenciadora: '200331',
        numeroItem: '1',
        unidade: '158123 - POLÍCIA FEDERAL - SR/DF',
        orgaoAdesao: 'POLÍCIA FEDERAL',
        quantidadeRegistrada: 50,
        quantidadeEmpenhada: 20,
        saldoEmpenho: 30,
        dataHoraInclusao: '2026-01-01T00:00:00.000Z',
        dataHoraAtualizacao: '2026-01-01T00:00:00.000Z'
      },
      {
        numeroAta: '00041/2025',
        unidadeGerenciadora: '200331',
        numeroItem: '00001',
        unidade: '158124 - POLÍCIA RODOVIÁRIA FEDERAL',
        orgaoAdesao: 'POLÍCIA RODOVIÁRIA FEDERAL',
        quantidadeRegistrada: 30,
        quantidadeEmpenhada: 10,
        saldoEmpenho: 20,
        dataHoraInclusao: '2026-01-01T00:00:00.000Z',
        dataHoraAtualizacao: '2026-01-01T00:00:00.000Z'
      },
      {
        numeroAta: '00041/2025',
        unidadeGerenciadora: '200331',
        numeroItem: '2', // Item diferente, deve ser filtrado
        unidade: '158125 - IBAMA',
        orgaoAdesao: 'IBAMA',
        quantidadeRegistrada: 100,
        quantidadeEmpenhada: 0,
        saldoEmpenho: 100,
        dataHoraInclusao: '2026-01-01T00:00:00.000Z',
        dataHoraAtualizacao: '2026-01-01T00:00:00.000Z'
      }
    ];

    vi.mocked(api.fetchAdesoesItem).mockResolvedValueOnce({
      resultado: mockResultado,
      totalRegistros: 3,
      totalPaginas: 1,
      paginasRestantes: 0
    });

    const options = getItemAdesoesQueryOptions('00041/2025', '200331', '1');
    const result = await options.queryFn();

    expect(api.fetchAdesoesItem).toHaveBeenCalledWith('00041/2025', '200331', '1');
    expect(result.length).toBe(2);
    expect(result.map(r => r.unidade)).toEqual([
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
