import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getItemEmpenhoLinksQueryOptions } from '../useItemEmpenhoLinks';
import * as allocationService from '../../services/allocationService';

vi.mock('../../services/allocationService', () => ({
  fetchEmpenhoLinksWithState: vi.fn()
}));

describe('useItemEmpenhoLinks Hook / Query Options - Testes Unitários de Leitura e Versão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve desabilitar a query (enabled: false) quando parâmetros obrigatórios estiverem ausentes', () => {
    const options = getItemEmpenhoLinksQueryOptions('', '', '');
    expect(options.queryKey).toEqual(['item-empenho-links', '']);
    expect(options.enabled).toBe(false);

    const optionsPartial = getItemEmpenhoLinksQueryOptions('00037/2026', '200331', '');
    expect(optionsPartial.enabled).toBe(false);
  });

  it('deve habilitar a query (enabled: true) e gerar queryKey canônica normalizada', () => {
    const options = getItemEmpenhoLinksQueryOptions('37/2026', '200331', '1');
    expect(options.queryKey).toEqual(['item-empenho-links', '00037/2026-200331-00001']);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(300000); // 5 min
  });

  it('deve chamar fetchEmpenhoLinksWithState com a chave canônica e retornar links e versão', async () => {
    const mockState = {
      links: {
        '2026NE000123': 'alloc-1',
        '2026NE000124': 'alloc-2'
      },
      version: 4
    };

    vi.mocked(allocationService.fetchEmpenhoLinksWithState).mockResolvedValueOnce(mockState);

    const options = getItemEmpenhoLinksQueryOptions('00037/2026', '200331', '00001');
    const result = await options.queryFn();

    expect(allocationService.fetchEmpenhoLinksWithState).toHaveBeenCalledWith('00037/2026-200331-00001');
    expect(result).toEqual(mockState);
    expect(result.version).toBe(4);
    expect(Object.keys(result.links)).toHaveLength(2);
  });

  it('deve retornar links vazios e versão 1 quando queryFn for executada com parâmetros vazios', async () => {
    const options = getItemEmpenhoLinksQueryOptions('', '', '');
    const result = await options.queryFn();

    expect(result).toEqual({ links: {}, version: 1 });
    expect(allocationService.fetchEmpenhoLinksWithState).not.toHaveBeenCalled();
  });

  it('deve manter isolamento estrito de query keys entre itens e atas distintos', () => {
    const optionsA = getItemEmpenhoLinksQueryOptions('00037/2026', '200331', '1');
    const optionsB = getItemEmpenhoLinksQueryOptions('00037/2026', '200331', '2');
    const optionsC = getItemEmpenhoLinksQueryOptions('00038/2026', '200331', '1');

    expect(optionsA.queryKey).not.toEqual(optionsB.queryKey);
    expect(optionsA.queryKey).not.toEqual(optionsC.queryKey);
    expect(optionsA.queryKey).toEqual(['item-empenho-links', '00037/2026-200331-00001']);
    expect(optionsB.queryKey).toEqual(['item-empenho-links', '00037/2026-200331-00002']);
    expect(optionsC.queryKey).toEqual(['item-empenho-links', '00038/2026-200331-00001']);
  });
});
