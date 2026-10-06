import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { criarProvedorListaContratosGov } from '../../hooks/useItemContracts';

vi.mock('../contratosOficiaisService', () => ({
  fetchContratosParaTela: vi.fn()
}));
import { fetchContratosParaTela } from '../contratosOficiaisService';

// Contrato no formato da lista da UG do Contratos.gov.br ("raw" guardado no banco).
const contratoGov = {
  id: 928023,
  numero: '00160/2026',
  ano: 2026,
  licitacao_numero: '90025/2025',
  unidade_gestora: '200331',
  objeto: 'Objeto X',
  fornecedor: { cnpj_cpf_idgener: '11031398000140', nome: 'Empresa A' },
  valor_global: '1000,00',
  vigencia_inicio: '2026-01-01',
  vigencia_fim: '2026-12-31'
};

// Compra 90025/2025 da UASG 200331 (idCompra e demais consultas do Compras.gov.br sem resultado).
const params = { codigoUnidadeGestora: '200331', numeroCompra: '90025', anoCompra: '2025' };

let urls: string[] = [];
// O módulo guarda em memória a lista baixada da API; cada teste importa uma cópia nova para não herdar o cache.
let fetchComprasGovContratosByPurchase: typeof import('../api').fetchComprasGovContratosByPurchase;
beforeEach(async () => {
  vi.resetModules();
  ({ fetchComprasGovContratosByPurchase } = await import('../api'));
  urls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url);
    if (url.includes('/api-contratos-gov/api/contrato/ug/')) {
      return { ok: true, json: async () => [contratoGov] };
    }
    return { ok: true, json: async () => ({ resultado: [] }) };
  }));
});
afterEach(() => vi.unstubAllGlobals());

const baixouListaDaApi = () => urls.some((u) => u.includes('/api-contratos-gov/api/contrato/ug/'));

describe('busca de contratos por compra — lista da UG vinda do banco', () => {
  it('com a lista do banco: acha o contrato da compra e não baixa a lista da API (20 a 35 s)', async () => {
    const provedor = vi.fn(async () => [contratoGov]);
    const contratos = await fetchComprasGovContratosByPurchase(params, provedor);
    expect(baixouListaDaApi()).toBe(false);
    expect(provedor).toHaveBeenCalledWith('200331');
    expect(contratos.map((c) => c.numeroContrato)).toContain('00160/2026');
    const achado = contratos.find((c) => c.numeroContrato === '00160/2026');
    expect(achado).toMatchObject({ niFornecedor: '11031398000140', contrato_id: 928023, dataVigenciaFinal: '2026-12-31' });
  });

  it('banco sem a lista (null, vazia ou com erro): baixa da API como antes', async () => {
    for (const provedor of [async () => null, async () => [], async () => { throw new Error('banco fora'); }]) {
      vi.resetModules();
      ({ fetchComprasGovContratosByPurchase } = await import('../api'));
      urls = [];
      const contratos = await fetchComprasGovContratosByPurchase({ ...params, anoCompra: '2025' }, provedor);
      expect(baixouListaDaApi()).toBe(true);
      expect(contratos.length).toBeGreaterThan(0);
    }
  });

  it('sem provedor: comportamento antigo, baixa da API', async () => {
    await fetchComprasGovContratosByPurchase(params);
    expect(baixouListaDaApi()).toBe(true);
  });
});

describe('criarProvedorListaContratosGov', () => {
  const novoCliente = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

  beforeEach(() => {
    vi.mocked(fetchContratosParaTela).mockReset();
  });

  it('devolve só o "raw" dos contratos que vieram da lista do Contratos.gov.br', async () => {
    vi.mocked(fetchContratosParaTela).mockResolvedValue([
      { id: 'a', raw: contratoGov },
      { id: 'b', raw: { numeroContrato: '1', idCompra: 'x' } }, // veio do Compras.gov.br: não tem licitacao_numero
      { id: 'c' }
    ] as any);
    const lista = await criarProvedorListaContratosGov(novoCliente())('200331');
    expect(lista).toEqual([contratoGov]);
  });

  it('usa o cache da tela: duas buscas, uma leitura', async () => {
    vi.mocked(fetchContratosParaTela).mockResolvedValue([{ id: 'a', raw: contratoGov }] as any);
    const provedor = criarProvedorListaContratosGov(novoCliente());
    await provedor('200331');
    await provedor('200331');
    expect(fetchContratosParaTela).toHaveBeenCalledTimes(1);
  });

  it('UASG que não é da CGLIC: null, para a busca baixar da API (os contratos dela não são sincronizados)', async () => {
    expect(await criarProvedorListaContratosGov(novoCliente())('090014')).toBeNull();
    expect(fetchContratosParaTela).not.toHaveBeenCalled();
  });

  it('sem nenhum registro do Contratos.gov.br: null', async () => {
    vi.mocked(fetchContratosParaTela).mockResolvedValue([{ id: 'b', raw: { numeroContrato: '1' } }] as any);
    expect(await criarProvedorListaContratosGov(novoCliente())('200330')).toBeNull();
  });
});
