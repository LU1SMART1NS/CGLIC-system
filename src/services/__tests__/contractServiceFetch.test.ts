import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchContractsForDashboard,
  clearContractsCache,
  isContractsListPartial,
  subscribeContractsPartial
} from '../contractService';

const UASG = '200331';

const govContrato = (numero: string, fim = '2030-12-31') => ({
  id: Number(numero.slice(0, 5)),
  numero,
  vigencia_inicio: '2022-01-10',
  vigencia_fim: fim,
  data_assinatura: '2022-01-10',
  unidade_gestora: UASG,
  objeto: `Objeto ${numero}`,
  fornecedor: { nome: 'Fornecedor X', cnpj_cpf_idgener: '00.000.000/0001-00' },
  valor_global: '1.000,00'
});

const comprasContrato = (numeroContrato: string) => ({
  numeroContrato,
  codigoUnidadeGestora: UASG,
  dataVigenciaInicial: '2025-03-01',
  dataVigenciaFinal: '2030-03-01',
  objeto: `Objeto ${numeroContrato}`,
  nomeRazaoSocialFornecedor: 'Fornecedor Y',
  niFornecedor: '11.111.111/0001-11',
  valorGlobal: 500
});

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: { get: () => 'application/json' },
    json: async () => body
  } as unknown as Response;
}

type Handlers = { gov?: () => Promise<Response>; compras?: () => Promise<Response> };

function mockFetch({ gov, compras }: Handlers) {
  const spy = vi.fn((url: string) => {
    if (String(url).includes('/api-contratos-gov/')) return (gov ?? (async () => jsonResponse([])))();
    return (compras ?? (async () => jsonResponse({ resultado: [], paginasRestantes: 0 })))();
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('fetchContractsForDashboard — fontes, cache e lista incompleta', () => {
  beforeEach(() => {
    clearContractsCache();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('junta as duas fontes: o Contratos.gov.br prevalece e o Compras.gov.br completa e acrescenta', async () => {
    mockFetch({
      gov: async () => jsonResponse([govContrato('00001/2022')]),
      compras: async () => jsonResponse({ resultado: [comprasContrato('00001/2022'), comprasContrato('00002/2025')], paginasRestantes: 0 })
    });

    const result = await fetchContractsForDashboard(UASG, false);

    expect(result.map((c) => c.id).sort()).toEqual([`${UASG}-00001-2022`, `${UASG}-00002-2025`]);
    expect(result.find((c) => c.numero === '00001/2022')?.fonteDados).toBe('Contratos.gov.br');
    expect(result.find((c) => c.numero === '00002/2025')?.fonteDados).toBe('Compras.gov.br');
    expect(isContractsListPartial(UASG)).toBe(false);
  });

  it('consulta as duas fontes ao mesmo tempo (a segunda não espera a primeira terminar)', async () => {
    let resolveGov: (r: Response) => void = () => {};
    const spy = mockFetch({
      gov: () => new Promise<Response>((resolve) => { resolveGov = resolve; }),
      compras: async () => jsonResponse({ resultado: [comprasContrato('00002/2025')], paginasRestantes: 0 })
    });

    const pending = fetchContractsForDashboard(UASG, false);
    await vi.waitFor(() => {
      const urls = spy.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('/api-contratos-gov/'))).toBe(true);
      expect(urls.some((u) => u.includes('1_consultarContratos'))).toBe(true);
    });

    resolveGov(jsonResponse([govContrato('00001/2022')]));
    expect(await pending).toHaveLength(2);
  });

  it('espera mais de 40s pelo Contratos.gov.br (a UASG 200331 leva ~20s) e depois desiste', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url: string, init?: { signal?: AbortSignal }) => {
      if (String(url).includes('/api-contratos-gov/')) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        });
      }
      return Promise.resolve(jsonResponse({ resultado: [], paginasRestantes: 0 }));
    }));

    const pending = fetchContractsForDashboard(UASG, false);
    let settled = false;
    pending.then(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(40_000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(settled).toBe(true);
    expect(isContractsListPartial(UASG)).toBe(true);
  });

  it('lista incompleta (fonte completa falhou): devolve o que veio, marca como incompleta e não guarda em cache', async () => {
    const spy = mockFetch({
      gov: async () => { throw new Error('timeout'); },
      compras: async () => jsonResponse({ resultado: [comprasContrato('00002/2025')], paginasRestantes: 0 })
    });

    const first = await fetchContractsForDashboard(UASG, false);
    expect(first).toHaveLength(1);
    expect(isContractsListPartial(UASG)).toBe(true);

    // Sem cache: a próxima chamada consulta de novo, e ao vir completa limpa a marca.
    const callsAntes = spy.mock.calls.length;
    mockFetch({
      gov: async () => jsonResponse([govContrato('00001/2022')]),
      compras: async () => jsonResponse({ resultado: [comprasContrato('00002/2025')], paginasRestantes: 0 })
    });
    const second = await fetchContractsForDashboard(UASG, false);
    expect(callsAntes).toBeGreaterThan(0);
    expect(second).toHaveLength(2);
    expect(isContractsListPartial(UASG)).toBe(false);
  });

  it('lista incompleta depois de uma completa não encolhe a carteira: soma à última completa', async () => {
    mockFetch({
      gov: async () => jsonResponse([govContrato('00001/2022'), govContrato('00003/2020')]),
      compras: async () => jsonResponse({ resultado: [comprasContrato('00002/2025')], paginasRestantes: 0 })
    });
    expect(await fetchContractsForDashboard(UASG, false)).toHaveLength(3);

    // Atualização manual com a fonte completa fora do ar: o Compras.gov.br só traz o 00002/2025.
    mockFetch({
      gov: async () => { throw new Error('fora do ar'); },
      compras: async () => jsonResponse({ resultado: [comprasContrato('00002/2025')], paginasRestantes: 0 })
    });
    const result = await fetchContractsForDashboard(UASG, true);
    expect(result).toHaveLength(3);
    expect(isContractsListPartial(UASG)).toBe(true);
  });

  it('lista incompleta também quando o Compras.gov.br responde erro', async () => {
    mockFetch({
      gov: async () => jsonResponse([govContrato('00001/2022')]),
      compras: async () => jsonResponse({}, { ok: false, status: 503 })
    });
    const result = await fetchContractsForDashboard(UASG, false);
    expect(result).toHaveLength(1);
    expect(isContractsListPartial(UASG)).toBe(true);
  });

  it('fonte que responde sem contratos não é falha', async () => {
    mockFetch({ gov: async () => jsonResponse([]), compras: async () => jsonResponse({ resultado: [], paginasRestantes: 0 }) });
    await fetchContractsForDashboard(UASG, false);
    expect(isContractsListPartial(UASG)).toBe(false);
  });

  it('lista completa vai para o cache: a segunda chamada não consulta as fontes', async () => {
    const spy = mockFetch({ gov: async () => jsonResponse([govContrato('00001/2022')]) });
    await fetchContractsForDashboard(UASG, false);
    const chamadas = spy.mock.calls.length;
    await fetchContractsForDashboard(UASG, false);
    expect(spy.mock.calls.length).toBe(chamadas);
  });

  it('chamadas simultâneas para a mesma UASG dividem uma só consulta', async () => {
    const spy = mockFetch({ gov: async () => jsonResponse([govContrato('00001/2022')]) });
    const [a, b] = await Promise.all([fetchContractsForDashboard(UASG, false), fetchContractsForDashboard(UASG, false)]);
    expect(a).toBe(b);
    const govCalls = spy.mock.calls.filter((c) => String(c[0]).includes('/api-contratos-gov/'));
    expect(govCalls).toHaveLength(1);
  });

  it('avisa os interessados quando o estado "incompleta" muda', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeContractsPartial(listener);
    mockFetch({ gov: async () => { throw new Error('fora'); } });
    await fetchContractsForDashboard(UASG, false);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
