import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: null }));

import { lerDeputados, lerSenadores } from '../autoresEmendasSyncService';

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

const dep = (id: number, nome: string, uf: string, leg = 57) => ({ id, nome, siglaPartido: 'PL', siglaUf: uf, idLegislatura: leg, urlFoto: `f${id}`, email: `d${id}@camara.leg.br` });

describe('lerDeputados', () => {
  it('traz a legislatura inteira e marca quem está no cargo hoje', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('idLegislatura=57')) return resposta({ dados: [dep(1, 'Ana', 'RJ'), dep(2, 'Bruno', 'SP'), dep(3, 'Saiu', 'BA')] });
      return resposta({ dados: [dep(1, 'Ana', 'RJ'), dep(2, 'Bruno', 'SP')] });
    }) as unknown as typeof fetch;
    const { legislatura, autores } = await lerDeputados(fetcher);
    expect(legislatura).toBe(57);
    expect(autores.map((a) => [a.id, a.em_exercicio])).toEqual([['C:1', true], ['C:2', true], ['C:3', false]]);
    expect(autores[0]).toMatchObject({ tipo: 'DEPUTADO', partido: 'PL', uf: 'RJ', legislatura: 57 });
  });

  it('falha da Câmara vira erro (nada é gravado)', async () => {
    const fetcher = vi.fn(async () => resposta({}, 503)) as unknown as typeof fetch;
    await expect(lerDeputados(fetcher)).rejects.toThrow(/Câmara dos Deputados respondeu 503/);
  });
});

describe('lerSenadores', () => {
  const ident = (c: string, n: string, extra: Record<string, string> = {}) => ({ IdentificacaoParlamentar: { CodigoParlamentar: c, NomeParlamentar: n, NomeCompletoParlamentar: n + ' Completo', ...extra } });

  it('só entra quem exerceu o mandato; os do cargo hoje trazem partido e UF', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/atual.json')) {
        return resposta({ ListaParlamentarEmExercicio: { Parlamentares: { Parlamentar: [ident('10', 'Titular', { SiglaPartidoParlamentar: 'PT', UfParlamentar: 'PE' })] } } });
      }
      return resposta({ ListaParlamentarLegislatura: { Parlamentares: { Parlamentar: [
        { ...ident('10', 'Titular'), Mandatos: { Mandato: { UfParlamentar: 'PE', Exercicios: { Exercicio: [] } } } },
        { ...ident('11', 'Suplente que assumiu'), Mandatos: { Mandato: [{ UfParlamentar: 'RJ', Exercicios: { Exercicio: {} } }] } },
        { ...ident('12', 'Suplente que nunca assumiu'), Mandatos: { Mandato: [{ UfParlamentar: 'RJ' }] } }
      ] } } });
    }) as unknown as typeof fetch;
    const autores = await lerSenadores(57, fetcher);
    expect(autores.map((a) => [a.id, a.em_exercicio, a.partido, a.uf])).toEqual([
      ['S:10', true, 'PT', 'PE'],
      ['S:11', false, null, 'RJ']
    ]);
  });
});
