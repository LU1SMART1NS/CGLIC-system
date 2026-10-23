import { describe, it, expect, vi } from 'vitest';
import { medirEmendasDoPortal } from '../emendasPortalService';

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

describe('medirEmendasDoPortal', () => {
  it('sem chave não consulta nada', async () => {
    const fetcher = vi.fn();
    expect(await medirEmendasDoPortal({ chave: undefined, fetcher: fetcher as unknown as typeof fetch })).toHaveProperty('erro');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('lê as emendas da função 06, os documentos das empenhadas e a busca por código, com a chave no cabeçalho', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['chave-api-dados']).toBe('k');
      if (url.includes('/emendas/documentos/')) return json([{ codigoDocumento: '200331000012026NE000123', fase: 'Empenho' }, { codigoDocumento: '110001000012026NE000001' }]);
      if (url.includes('codigoEmenda=')) return json([{ codigoEmenda: '202640950004' }]);
      if (url.includes('ano=2026')) return json([{ codigoEmenda: '202640950004', tipoEmenda: 'Emenda Individual', nomeAutor: 'Fulano', valorEmpenhado: '1.000,00' }, { codigoEmenda: 'x', tipoEmenda: 'Emenda de Bancada', nomeAutor: 'Bancada', valorEmpenhado: '0,00' }]);
      return json([]);
    }) as unknown as typeof fetch;
    const r = await medirEmendasDoPortal({ chave: 'k', anos: [2026, 2025], fetcher, esperar: async () => {} });
    expect(r.ano2026).toMatchObject({ emendas: 2, comValorEmpenhado: 1, porTipo: { 'Emenda Individual': 1, 'Emenda de Bancada': 1 } });
    expect(r.documentos).toEqual([expect.objectContaining({ codigoEmenda: '202640950004', documentos: 2, daSenasp: 1 })]);
    expect(r.buscaPorCodigo).toEqual({ codigo: '202640950004', achadas: 1 });
  });
});
