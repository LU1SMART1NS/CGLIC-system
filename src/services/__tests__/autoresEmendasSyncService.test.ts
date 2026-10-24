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
      // Sexo: siglaSexo com a data de início da legislatura 57 (01/02/2023).
      if (url.includes('siglaSexo=F&dataInicio=2023-02-01')) return resposta({ dados: [dep(1, 'Ana', 'RJ')] });
      if (url.includes('siglaSexo=M&dataInicio=2023-02-01')) return resposta({ dados: [dep(2, 'Bruno', 'SP')] });
      if (url.includes('idLegislatura=57')) return resposta({ dados: [dep(1, 'Ana', 'RJ'), dep(2, 'Bruno', 'SP'), dep(3, 'Saiu', 'BA')] });
      return resposta({ dados: [dep(1, 'Ana', 'RJ'), dep(2, 'Bruno', 'SP')] });
    }) as unknown as typeof fetch;
    const { legislatura, autores } = await lerDeputados(fetcher);
    expect(legislatura).toBe(57);
    expect(autores.map((a) => [a.id, a.em_exercicio, a.sexo])).toEqual([['C:1', true, 'F'], ['C:2', true, 'M'], ['C:3', false, null]]);
    expect(autores[0]).toMatchObject({ tipo: 'DEPUTADO', partido: 'PL', uf: 'RJ', legislatura: 57 });
  });

  it('falha na leitura do sexo não impede a leitura dos deputados', async () => {
    const fetcher = vi.fn(async (url: string) => (url.includes('siglaSexo') ? resposta({}, 504) : resposta({ dados: [dep(1, 'Ana', 'RJ')] }))) as unknown as typeof fetch;
    const { autores } = await lerDeputados(fetcher);
    expect(autores.map((a) => [a.id, a.sexo])).toEqual([['C:1', null]]);
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
        return resposta({ ListaParlamentarEmExercicio: { Parlamentares: { Parlamentar: [ident('10', 'Titular', { SiglaPartidoParlamentar: 'PT', UfParlamentar: 'PE', SexoParlamentar: 'Feminino' })] } } });
      }
      return resposta({ ListaParlamentarLegislatura: { Parlamentares: { Parlamentar: [
        { ...ident('10', 'Titular'), Mandatos: { Mandato: { UfParlamentar: 'PE', Exercicios: { Exercicio: [] } } } },
        { ...ident('11', 'Suplente que assumiu', { SexoParlamentar: 'Masculino' }), Mandatos: { Mandato: [{ UfParlamentar: 'RJ', Exercicios: { Exercicio: {} } }] } },
        { ...ident('12', 'Suplente que nunca assumiu'), Mandatos: { Mandato: [{ UfParlamentar: 'RJ' }] } }
      ] } } });
    }) as unknown as typeof fetch;
    const autores = await lerSenadores(57, fetcher);
    expect(autores.map((a) => [a.id, a.em_exercicio, a.partido, a.uf, a.sexo])).toEqual([
      ['S:10', true, 'PT', 'PE', 'F'],
      ['S:11', false, null, 'RJ', 'M']
    ]);
  });
});
