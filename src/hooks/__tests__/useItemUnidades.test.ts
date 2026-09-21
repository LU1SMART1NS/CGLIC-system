import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getItemUnidadesQueryOptions } from '../useItemUnidades';
import * as api from '../../services/api';

vi.mock('../../services/api', () => ({
  fetchUnidadesItem: vi.fn()
}));

describe('useItemUnidades Hook / Query Options - Testes Unitários de Contrato e Fallbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve desabilitar a query (enabled: false) quando os parâmetros obrigatórios não forem informados', () => {
    const options = getItemUnidadesQueryOptions('', '', '');
    expect(options.queryKey).toEqual(['item-unidades', '', '', '']);
    expect(options.enabled).toBe(false);
  });

  it('deve habilitar a query (enabled: true) e gerar a queryKey canônica com os parâmetros preenchidos', () => {
    const options = getItemUnidadesQueryOptions('00041/2025', '200331', '1');
    expect(options.queryKey).toEqual(['item-unidades', '00041/2025', '200331', '1']);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(300000); // 5 min
  });

  it('deve retornar a lista de unidades retornada pela API com sucesso', async () => {
    const mockResultado = [
      {
        numeroAta: '00041/2025',
        unidadeGerenciadora: '200331',
        numeroItem: '1',
        codigoPdm: '12345',
        descricaoItem: 'Item Teste',
        fornecedor: 'Fornecedor A',
        codigoUnidade: '200331',
        nomeUnidade: 'MINISTERIO DA JUSTICA',
        tipoUnidade: 'GERENCIADORA',
        quantidadeRegistrada: 100,
        saldoRemanejamentoEmpenho: 100,
        saldoAdesoes: 0,
        qtdLimiteAdesao: 50,
        qtdLimiteInformadoCompra: 50,
        aceitaAdesao: true,
        dataHoraInclusao: '2026-01-01T00:00:00.000Z',
        dataHoraAtualizacao: '2026-01-01T00:00:00.000Z',
        dataHoraExclusao: null
      }
    ];

    vi.mocked(api.fetchUnidadesItem).mockResolvedValueOnce({
      resultado: mockResultado,
      totalRegistros: 1,
      paginasTotais: 1
    } as any);

    const options = getItemUnidadesQueryOptions('00041/2025', '200331', '1');
    const result = await options.queryFn();

    expect(api.fetchUnidadesItem).toHaveBeenCalledWith('00041/2025', '200331', '1');
    expect(result).toEqual(mockResultado);
  });

  it('deve acionar o fallback gracioso para a Unidade Gerenciadora se a API retornar resultado vazio', async () => {
    vi.mocked(api.fetchUnidadesItem).mockResolvedValueOnce({
      resultado: [],
      totalRegistros: 0,
      paginasTotais: 0
    } as any);

    const mockArp = {
      numeroAtaRegistroPreco: '00041/2025',
      codigoUnidadeGerenciadora: '200331',
      nomeUnidadeGerenciadora: 'MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA'
    };

    const mockItem = {
      numeroItem: '2',
      codigoPdm: 99999,
      descricaoItem: 'Notebook Corporativo',
      nomeRazaoSocialFornecedor: 'Dell Computadores',
      quantidadeHomologadaItem: 250,
      maximoAdesao: 500
    };

    const options = getItemUnidadesQueryOptions('00041/2025', '200331', '2', mockArp as any, mockItem as any);
    const result = await options.queryFn();

    expect(api.fetchUnidadesItem).toHaveBeenCalledWith('00041/2025', '200331', '2');
    expect(result.length).toBe(1);
    expect(result[0].tipoUnidade).toBe('GERENCIADORA');
    expect(result[0].codigoUnidade).toBe('200331');
    expect(result[0].quantidadeRegistrada).toBe(250);
    expect(result[0].qtdLimiteAdesao).toBe(500);
    expect(result[0].descricaoItem).toBe('Notebook Corporativo');
    expect(result[0].fornecedor).toBe('Dell Computadores');
    expect(result[0].aceitaAdesao).toBe(true);
  });

  it('deve retornar lista vazia se os parâmetros forem vazios durante a execução de queryFn', async () => {
    const options = getItemUnidadesQueryOptions('', '', '');
    const result = await options.queryFn();
    expect(result).toEqual([]);
    expect(api.fetchUnidadesItem).not.toHaveBeenCalled();
  });
});

