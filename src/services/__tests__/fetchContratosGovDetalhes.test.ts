import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchContratosGovGarantias, fetchContratosGovHistorico, fetchContratosGovResponsaveis } from '../api';

const resposta = (ok: boolean, corpo: unknown, status = ok ? 200 : 503) => ({ ok, status, json: async () => corpo });

describe('consultas por contrato no Contratos.gov.br', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sem opção: falha vira lista vazia (comportamento antigo)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(false, null)));
    await expect(fetchContratosGovHistorico(1)).resolves.toEqual([]);
    await expect(fetchContratosGovResponsaveis(1)).resolves.toEqual([]);
    await expect(fetchContratosGovGarantias(1)).resolves.toEqual([]);
  });

  it('falharSeErro: erro HTTP, formato inesperado e falha de rede lançam', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(false, null)));
    await expect(fetchContratosGovHistorico(1, { falharSeErro: true })).rejects.toThrow('503');
    vi.stubGlobal('fetch', vi.fn(async () => resposta(true, { erro: 'x' })));
    await expect(fetchContratosGovResponsaveis(1, { falharSeErro: true })).rejects.toThrow('formato inesperado');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(fetchContratosGovGarantias(1, { falharSeErro: true })).rejects.toThrow('Failed to fetch');
  });

  it('falharSeErro: lista vazia com sucesso é "não há" de verdade', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(true, [])));
    await expect(fetchContratosGovGarantias(1, { falharSeErro: true })).resolves.toEqual([]);
  });
});
