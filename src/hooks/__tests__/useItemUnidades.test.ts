import { describe, it, expect, vi, beforeEach } from 'vitest';
import { escolherUnidades, getCopiaDoItemQueryOptions, getItemUnidadesQueryOptions } from '../useItemUnidades';
import * as api from '../../services/api';
import * as copia from '../../services/unidadesItensSyncService';

vi.mock('../../services/api', () => ({
  fetchUnidadesItem: vi.fn()
}));
vi.mock('../../services/unidadesItensSyncService', () => ({
  lerCopiaUnidadesItem: vi.fn()
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
    expect(result).toEqual({ unidades: mockResultado, origem: 'API', copiadoEm: null });
    expect(copia.lerCopiaUnidadesItem).not.toHaveBeenCalled();
  });

  it('API vazia: usa a cópia guardada pelo servidor, com a data', async () => {
    vi.mocked(api.fetchUnidadesItem).mockResolvedValueOnce({ resultado: [], totalRegistros: 0 } as any);
    const unidadesCopia = [{ codigoUnidade: '200331', quantidadeRegistrada: 30 }] as any[];
    vi.mocked(copia.lerCopiaUnidadesItem).mockResolvedValueOnce({ unidades: unidadesCopia, copiadoEm: '2026-10-05T17:32:00Z' });

    const result = await getItemUnidadesQueryOptions('00036/2024', '200331', '2').queryFn();

    expect(copia.lerCopiaUnidadesItem).toHaveBeenCalledWith('00036/2024-200331-00002');
    expect(result).toEqual({ unidades: unidadesCopia, origem: 'COPIA', copiadoEm: '2026-10-05T17:32:00Z' });
  });

  it('API vazia e sem cópia: lista vazia, sem montar a gerenciadora no lugar', async () => {
    vi.mocked(api.fetchUnidadesItem).mockResolvedValueOnce({ resultado: [], totalRegistros: 0 } as any);
    vi.mocked(copia.lerCopiaUnidadesItem).mockResolvedValueOnce(null);

    const result = await getItemUnidadesQueryOptions('00036/2024', '200331', '00002').queryFn();
    expect(result).toEqual({ unidades: [], origem: 'SEM_DADOS', copiadoEm: null });
  });

  it('falha ao ler a cópia não derruba a tela: fica sem dados', async () => {
    vi.mocked(api.fetchUnidadesItem).mockResolvedValueOnce({ resultado: [], totalRegistros: 0 } as any);
    vi.mocked(copia.lerCopiaUnidadesItem).mockRejectedValueOnce(new Error('rede'));

    const result = await getItemUnidadesQueryOptions('00036/2024', '200331', '2').queryFn();
    expect(result.origem).toBe('SEM_DADOS');
  });

  it('deve retornar lista vazia se os parâmetros forem vazios durante a execução de queryFn', async () => {
    const options = getItemUnidadesQueryOptions('', '', '');
    const result = await options.queryFn();
    expect(result).toEqual({ unidades: [], origem: 'SEM_DADOS', copiadoEm: null });
    expect(api.fetchUnidadesItem).not.toHaveBeenCalled();
  });

  describe('cópia primeiro, enquanto o Compras.gov.br responde', () => {
    const copiaUnidades = [{ codigoUnidade: '200331', quantidadeRegistrada: 89 }] as any[];
    const copia = { unidades: { unidades: copiaUnidades, copiadoEm: '2026-11-16T01:43:00Z' }, adesoes: null };

    it('sem resposta da API: mostra a cópia marcada como conferindo', () => {
      expect(escolherUnidades(undefined, copia)).toEqual({
        unidades: copiaUnidades,
        origem: 'COPIA',
        copiadoEm: '2026-11-16T01:43:00Z',
        conferindo: true
      });
    });

    it('a API respondeu: a lista de agora substitui a cópia', () => {
      const aoVivo = { unidades: [{ codigoUnidade: '200331', quantidadeRegistrada: 90 }] as any[], origem: 'API' as const, copiadoEm: null };
      expect(escolherUnidades(aoVivo, copia)).toBe(aoVivo);
    });

    it('sem API e sem cópia: ainda carregando (nenhuma lista)', () => {
      expect(escolherUnidades(undefined, { unidades: null, adesoes: null })).toBeUndefined();
      expect(escolherUnidades(undefined, undefined)).toBeUndefined();
    });

    it('consulta da cópia só com a chave do item', () => {
      expect(getCopiaDoItemQueryOptions('').enabled).toBe(false);
      expect(getCopiaDoItemQueryOptions('00067/2024-200331-00010').queryKey).toEqual(['item-copia', '00067/2024-200331-00010']);
    });
  });
});
