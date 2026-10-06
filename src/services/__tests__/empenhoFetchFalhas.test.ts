import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchContratosGovEmpenhos, fetchPncpContractEmpenhos, TempoEsgotadoError, TEMPO_LIMITE_EMPENHOS_MS } from '../api';

const resposta = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchContratosGovEmpenhos: falha da fonte não vira "sem empenho"', () => {
  it('lista vazia só quando o Contratos.gov.br responde 200 com []', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(200, [])));
    await expect(fetchContratosGovEmpenhos(977042)).resolves.toEqual([]);
  });

  it('devolve os empenhos quando a fonte responde', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(200, [{ id: 1, numero: '2026NE000001' }])));
    await expect(fetchContratosGovEmpenhos(1)).resolves.toHaveLength(1);
  });

  it('HTTP de erro (ex.: 500 para id inválido) lança com o status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(500, '<html>')));
    await expect(fetchContratosGovEmpenhos('200331-00052-2018')).rejects.toThrow(/respondeu 500/);
  });

  it('falha de rede lança com mensagem legível', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(fetchContratosGovEmpenhos(1)).rejects.toThrow(/Falha de rede ao consultar o Contratos\.gov\.br/);
  });

  it('formato inesperado lança', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(200, { erro: 'x' })));
    await expect(fetchContratosGovEmpenhos(1)).rejects.toThrow(/formato inesperado/);
  });

  it('desiste depois do tempo limite (o contrato 22571 não respondia em 300 s)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          })
      )
    );
    const promessa = fetchContratosGovEmpenhos(22571);
    const verificacao = expect(promessa).rejects.toBeInstanceOf(TempoEsgotadoError);
    await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_EMPENHOS_MS + 1);
    await verificacao;
    await expect(promessa).rejects.toThrow(/não respondeu em 30 s/);
  });
});

describe('fetchPncpContractEmpenhos', () => {
  it('404 ("Nenhum empenho do contrato encontrado") é lista vazia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(404, { message: 'Nenhum empenho do contrato encontrado.' })));
    await expect(fetchPncpContractEmpenhos('00394494000136', '2025', '2662')).resolves.toEqual([]);
  });

  it('400 (parâmetro recusado) é lista vazia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(400, { erros: [] })));
    await expect(fetchPncpContractEmpenhos('30911', '2026', '236')).resolves.toEqual([]);
  });

  it('429 e 5xx são falha da fonte', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(503, null)));
    await expect(fetchPncpContractEmpenhos('00394494000136', '2026', '1')).rejects.toThrow(/PNCP respondeu 503/);
    vi.stubGlobal('fetch', vi.fn(async () => resposta(429, null)));
    await expect(fetchPncpContractEmpenhos('00394494000136', '2026', '1')).rejects.toThrow(/PNCP respondeu 429/);
  });
});
