import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getItemEmpenhosQueryOptions } from '../useItemEmpenhos';
import * as api from '../../services/api';

vi.mock('../../services/api', () => ({
  fetchEmpenhosSaldoItem: vi.fn()
}));

describe('useItemEmpenhos Hook / Query Options - Testes Unitários de Contrato e Cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve desabilitar a query (enabled: false) quando parâmetros obrigatórios estiverem ausentes', () => {
    const options = getItemEmpenhosQueryOptions('', '', '');
    expect(options.queryKey).toEqual(['item-empenhos', '', '', '']);
    expect(options.enabled).toBe(false);

    const optionsPartial = getItemEmpenhosQueryOptions('00041/2025', '200331', '');
    expect(optionsPartial.enabled).toBe(false);
  });

  it('deve habilitar a query (enabled: true) e gerar queryKey canônica com os parâmetros preenchidos', () => {
    const options = getItemEmpenhosQueryOptions('00041/2025', '200331', '1');
    expect(options.queryKey).toEqual(['item-empenhos', '00041/2025', '200331', '1']);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(300000); // 5 min
  });

  it('deve chamar fetchEmpenhosSaldoItem com parâmetros normalizados e filtrar registros do item correspondente', async () => {
    const mockResultado = [
      {
        numeroAta: '00041/2025',
        unidadeGerenciadora: '200331',
        numeroItem: '1',
        numeroEmpenho: '2026NE000100',
        quantidadeEmpenhadaItem: 10,
        saldoRemanejamentoEmpenho: 90
      },
      {
        numeroAta: '00041/2025',
        unidadeGerenciadora: '200331',
        numeroItem: '00001',
        numeroEmpenho: '2026NE000101',
        quantidadeEmpenhadaItem: 5,
        saldoRemanejamentoEmpenho: 85
      },
      {
        numeroAta: '00041/2025',
        unidadeGerenciadora: '200331',
        numeroItem: '2', // Item diferente, deve ser filtrado
        numeroEmpenho: '2026NE000200',
        quantidadeEmpenhadaItem: 50,
        saldoRemanejamentoEmpenho: 50
      }
    ];

    vi.mocked(api.fetchEmpenhosSaldoItem).mockResolvedValueOnce({
      resultado: mockResultado as any,
      totalRegistros: 3,
      totalPaginas: 1,
      paginasRestantes: 0
    });

    const options = getItemEmpenhosQueryOptions('00041/2025', '200331', '1');
    const result = await options.queryFn();

    expect(api.fetchEmpenhosSaldoItem).toHaveBeenCalledWith('00041/2025', '200331');
    expect(result.length).toBe(2);
    expect(result.map(r => r.numeroEmpenho)).toEqual(['2026NE000100', '2026NE000101']);
  });

  it('deve retornar lista vazia se a API retornar resultado vazio', async () => {
    vi.mocked(api.fetchEmpenhosSaldoItem).mockResolvedValueOnce({
      resultado: [],
      totalRegistros: 0,
      totalPaginas: 0,
      paginasRestantes: 0
    });

    const options = getItemEmpenhosQueryOptions('00041/2025', '200331', '1');
    const result = await options.queryFn();

    expect(api.fetchEmpenhosSaldoItem).toHaveBeenCalledWith('00041/2025', '200331');
    expect(result).toEqual([]);
  });

  it('deve retornar lista vazia se os parâmetros forem vazios durante a execução de queryFn', async () => {
    const options = getItemEmpenhosQueryOptions('', '', '');
    const result = await options.queryFn();
    expect(result).toEqual([]);
    expect(api.fetchEmpenhosSaldoItem).not.toHaveBeenCalled();
  });

  it('deve manter isolamento estrito de query keys entre itens e atas distintos', () => {
    const optionsA = getItemEmpenhosQueryOptions('00041/2025', '200331', '1');
    const optionsB = getItemEmpenhosQueryOptions('00041/2025', '200331', '2');
    const optionsC = getItemEmpenhosQueryOptions('00042/2025', '200331', '1');

    expect(optionsA.queryKey).not.toEqual(optionsB.queryKey);
    expect(optionsA.queryKey).not.toEqual(optionsC.queryKey);
    expect(optionsA.queryKey).toEqual(['item-empenhos', '00041/2025', '200331', '1']);
    expect(optionsB.queryKey).toEqual(['item-empenhos', '00041/2025', '200331', '2']);
    expect(optionsC.queryKey).toEqual(['item-empenhos', '00042/2025', '200331', '1']);
  });
});
