import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buscarContratosNasFontes, deriveIdCompraContratosGov, FONTE_COMPRAS_GOV, FONTE_CONTRATOS_GOV } from '../contractService';

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

// Só a sincronização no servidor consulta as fontes oficiais; as telas leem o banco (contratosOficiaisService).
describe('buscarContratosNasFontes — fontes e lista incompleta', () => {
  beforeEach(() => {
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

    const { contracts, fontesComFalha } = await buscarContratosNasFontes(UASG);

    expect(contracts.map((c) => c.id).sort()).toEqual([`${UASG}-00001-2022`, `${UASG}-00002-2025`]);
    expect(contracts.find((c) => c.numero === '00001/2022')?.fonteDados).toBe('Contratos.gov.br');
    expect(contracts.find((c) => c.numero === '00002/2025')?.fonteDados).toBe('Compras.gov.br');
    expect(fontesComFalha).toEqual([]);
  });

  it('consulta as duas fontes ao mesmo tempo (a segunda não espera a primeira terminar)', async () => {
    let resolveGov: (r: Response) => void = () => {};
    const spy = mockFetch({
      gov: () => new Promise<Response>((resolve) => { resolveGov = resolve; }),
      compras: async () => jsonResponse({ resultado: [comprasContrato('00002/2025')], paginasRestantes: 0 })
    });

    const pending = buscarContratosNasFontes(UASG);
    await vi.waitFor(() => {
      const urls = spy.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('/api-contratos-gov/'))).toBe(true);
      expect(urls.some((u) => u.includes('1_consultarContratos'))).toBe(true);
    });

    resolveGov(jsonResponse([govContrato('00001/2022')]));
    expect((await pending).contracts).toHaveLength(2);
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

    const pending = buscarContratosNasFontes(UASG);
    let settled = false;
    pending.then(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(40_000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(10_000);
    const { fontesComFalha } = await pending;
    expect(settled).toBe(true);
    expect(fontesComFalha).toEqual([FONTE_CONTRATOS_GOV]);
  });

  it('fonte completa fora do ar: devolve o que veio e lista a fonte que falhou', async () => {
    mockFetch({
      gov: async () => { throw new Error('timeout'); },
      compras: async () => jsonResponse({ resultado: [comprasContrato('00002/2025')], paginasRestantes: 0 })
    });

    const { contracts, fontesComFalha } = await buscarContratosNasFontes(UASG);
    expect(contracts).toHaveLength(1);
    expect(fontesComFalha).toEqual([FONTE_CONTRATOS_GOV]);
  });

  it('fonte fora do ar não encolhe a carteira: o que já se sabia (base do banco) continua', async () => {
    mockFetch({
      gov: async () => jsonResponse([govContrato('00001/2022'), govContrato('00003/2020')]),
      compras: async () => jsonResponse({ resultado: [comprasContrato('00002/2025')], paginasRestantes: 0 })
    });
    const { contracts: base } = await buscarContratosNasFontes(UASG);
    expect(base).toHaveLength(3);

    // Com a fonte completa fora do ar, o Compras.gov.br só traz o 00002/2025.
    mockFetch({
      gov: async () => { throw new Error('fora do ar'); },
      compras: async () => jsonResponse({ resultado: [comprasContrato('00002/2025')], paginasRestantes: 0 })
    });
    const { contracts, fontesComFalha } = await buscarContratosNasFontes(UASG, base);
    expect(contracts).toHaveLength(3);
    expect(fontesComFalha).toEqual([FONTE_CONTRATOS_GOV]);
  });

  it('lista incompleta também quando o Compras.gov.br responde erro', async () => {
    mockFetch({
      gov: async () => jsonResponse([govContrato('00001/2022')]),
      compras: async () => jsonResponse({}, { ok: false, status: 503 })
    });
    const { contracts, fontesComFalha } = await buscarContratosNasFontes(UASG);
    expect(contracts).toHaveLength(1);
    expect(fontesComFalha).toEqual([FONTE_COMPRAS_GOV]);
  });

  it('fonte que responde sem contratos não é falha', async () => {
    mockFetch({ gov: async () => jsonResponse([]), compras: async () => jsonResponse({ resultado: [], paginasRestantes: 0 }) });
    expect((await buscarContratosNasFontes(UASG)).fontesComFalha).toEqual([]);
  });
});

describe('deriveIdCompraContratosGov — compra de origem a partir do Contratos.gov.br', () => {
  it('monta o idCompra oficial: UASG da compra + modalidade + número + ano', () => {
    expect(deriveIdCompraContratosGov({ unidade_compra: '200331', codigo_modalidade: '05', licitacao_numero: '90024/2024' })).toBe('20033105900242024');
  });

  it('completa zeros à esquerda no número e na modalidade', () => {
    expect(deriveIdCompraContratosGov({ unidade_compra: '200109', codigo_modalidade: '5', licitacao_numero: '23/2023' })).toBe('20010905000232023');
  });

  it('aceita o número sem barra quando vem com 9 dígitos', () => {
    expect(deriveIdCompraContratosGov({ unidade_compra: '200331', codigo_modalidade: '06', licitacao_numero: '001132026' })).toBe('20033106001132026');
  });

  it('não inventa a compra quando falta campo ou o formato é estranho', () => {
    expect(deriveIdCompraContratosGov({ codigo_modalidade: '05', licitacao_numero: '90024/2024' })).toBeUndefined();
    expect(deriveIdCompraContratosGov({ unidade_compra: '200331', licitacao_numero: '90024/2024' })).toBeUndefined();
    expect(deriveIdCompraContratosGov({ unidade_compra: '200331', codigo_modalidade: '05' })).toBeUndefined();
    expect(deriveIdCompraContratosGov({ unidade_compra: '200331', codigo_modalidade: '05', licitacao_numero: '90024/24' })).toBeUndefined();
    expect(deriveIdCompraContratosGov({ unidade_compra: '200331', codigo_modalidade: '05', licitacao_numero: '123456/2024' })).toBeUndefined();
    expect(deriveIdCompraContratosGov({ unidade_compra: '2003', codigo_modalidade: '05', licitacao_numero: '90024/2024' })).toBeUndefined();
  });
});

describe('buscarContratosNasFontes — idCompra do contrato', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const comCompra = (numero: string) => ({ ...govContrato(numero), unidade_compra: '200331', codigo_modalidade: '05', licitacao_numero: '90024/2024' });

  it('contrato que só existe no Contratos.gov.br já sai com a compra de origem', async () => {
    mockFetch({ gov: async () => jsonResponse([comCompra('00200/2026')]) });
    const {
      contracts: [c]
    } = await buscarContratosNasFontes(UASG);
    expect(c.idCompra).toBe('20033105900242024');
  });

  it('sem os campos de compra no Contratos.gov.br, o Compras.gov.br completa o idCompra', async () => {
    mockFetch({
      gov: async () => jsonResponse([govContrato('00001/2022')]),
      compras: async () => jsonResponse({ resultado: [{ ...comprasContrato('00001/2022'), dataVigenciaInicial: '2022-01-10', idCompra: '20033105000012022' }], paginasRestantes: 0 })
    });
    const { contracts: result } = await buscarContratosNasFontes(UASG);
    expect(result.find((c) => c.numero === '00001/2022')?.idCompra).toBe('20033105000012022');
  });
});
