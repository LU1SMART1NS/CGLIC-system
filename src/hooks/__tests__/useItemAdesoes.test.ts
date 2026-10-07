import { describe, it, expect, vi, beforeEach } from 'vitest';
import { escolherAdesoes, getItemAdesoesQueryOptions } from '../useItemAdesoes';
import * as api from '../../services/api';
import * as copia from '../../services/unidadesItensSyncService';

vi.mock('../../services/api', () => ({
  fetchAdesoesItem: vi.fn()
}));
vi.mock('../../services/unidadesItensSyncService', () => ({
  lerCopiaAdesoesItem: vi.fn()
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
    expect(result.copia).toBeNull();
    expect(copia.lerCopiaAdesoesItem).not.toHaveBeenCalled();
    expect(result.aoVivo.map(r => r.unidadeNaoParticipante)).toEqual([
      '158123 - POLÍCIA FEDERAL - SR/DF',
      '158124 - POLÍCIA RODOVIÁRIA FEDERAL'
    ]);
  });

  it('API vazia: lê também a cópia guardada pelo servidor', async () => {
    vi.mocked(api.fetchAdesoesItem).mockResolvedValueOnce({
      resultado: [],
      totalRegistros: 0,
      totalPaginas: 0,
      paginasRestantes: 0
    });

    const guardada = { adesoes: [{ unidadeNaoParticipante: '929777 - X', quantidadeAprovadaAdesao: 5 }] as any[], copiadoEm: '2026-10-05T17:32:00Z' };
    vi.mocked(copia.lerCopiaAdesoesItem).mockResolvedValueOnce(guardada);

    const options = getItemAdesoesQueryOptions('00041/2025', '200331', '1');
    const result = await options.queryFn();

    expect(api.fetchAdesoesItem).toHaveBeenCalledWith('00041/2025', '200331', '1');
    expect(copia.lerCopiaAdesoesItem).toHaveBeenCalledWith('00041/2025-200331-00001');
    expect(result).toEqual({ aoVivo: [], copia: guardada });
  });

  it('falha ao ler a cópia não derruba a tela', async () => {
    vi.mocked(api.fetchAdesoesItem).mockResolvedValueOnce({ resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 });
    vi.mocked(copia.lerCopiaAdesoesItem).mockRejectedValueOnce(new Error('rede'));
    const result = await getItemAdesoesQueryOptions('00041/2025', '200331', '1').queryFn();
    expect(result).toEqual({ aoVivo: [], copia: null });
  });

  it('deve retornar lista vazia se os parâmetros forem vazios durante a execução de queryFn', async () => {
    const options = getItemAdesoesQueryOptions('', '', '');
    const result = await options.queryFn();
    expect(result).toEqual({ aoVivo: [], copia: null });
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

describe('escolherAdesoes', () => {
  const ade = { unidadeNaoParticipante: '929777 - X', quantidadeAprovadaAdesao: 5 } as any;
  const guardada = { adesoes: [ade], copiadoEm: '2026-10-05T17:32:00Z' };

  it('lista ao vivo com adesões vale sempre', () => {
    expect(escolherAdesoes({ aoVivo: [ade], copia: null }, 'SEM_DADOS')).toEqual({ adesoes: [ade], origem: 'API', copiadoEm: null });
  });

  it('vazio com os órgãos vindos da API agora: o item não tem adesão (não usa a cópia)', () => {
    expect(escolherAdesoes({ aoVivo: [], copia: guardada }, 'API')).toEqual({ adesoes: [], origem: 'API', copiadoEm: null });
  });

  it('vazio com a API fora do ar: usa a cópia guardada, com a data', () => {
    expect(escolherAdesoes({ aoVivo: [], copia: guardada }, 'COPIA')).toEqual({ adesoes: [ade], origem: 'COPIA', copiadoEm: guardada.copiadoEm });
  });

  it('vazio, API fora do ar e sem cópia: sem dados (não afirma "nenhuma adesão")', () => {
    expect(escolherAdesoes({ aoVivo: [], copia: null }, 'SEM_DADOS')).toEqual({ adesoes: [], origem: 'SEM_DADOS', copiadoEm: null });
    expect(escolherAdesoes(undefined, undefined).origem).toBe('SEM_DADOS');
  });
});
