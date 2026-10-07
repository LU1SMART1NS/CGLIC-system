import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContractDashboardRecord } from '../../types';

const fetchResponsaveis = vi.fn();
const fetchGarantias = vi.fn();
const lerCopia = vi.fn();
vi.mock('../../services/api', () => ({
  fetchContratosGovResponsaveis: (...a: unknown[]) => fetchResponsaveis(...a),
  fetchContratosGovGarantias: (...a: unknown[]) => fetchGarantias(...a),
  fetchContratosGovHistorico: vi.fn()
}));
vi.mock('../../services/contratoDetalhesCopiaService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/contratoDetalhesCopiaService')>()),
  lerCopiaDetalheContrato: (...a: unknown[]) => lerCopia(...a)
}));

import { getContractResponsaveisQueryOptions } from '../useContractResponsaveis';
import { getContractGarantiasQueryOptions } from '../useContractGarantias';

const contrato = (over: Partial<ContractDashboardRecord> = {}) =>
  ({ id: '110099-00009-2024', numero: '00009', ano: 2024, uasg: '110099', contratoId: 299693, fonteDados: 'Contratos.gov.br', ...over }) as ContractDashboardRecord;

describe('consultas de responsáveis e garantias do Contratos.gov.br', () => {
  beforeEach(() => {
    fetchResponsaveis.mockReset();
    fetchGarantias.mockReset();
    lerCopia.mockReset();
  });

  it('consultam pelo id do contrato no Contratos.gov.br', async () => {
    fetchResponsaveis.mockResolvedValue([{ id: 1 }]);
    fetchGarantias.mockResolvedValue([{ id: 2 }]);
    const r = getContractResponsaveisQueryOptions(contrato());
    const g = getContractGarantiasQueryOptions(contrato());

    expect(r.enabled).toBe(true);
    expect(g.enabled).toBe(true);
    expect(r.queryKey).toEqual(['contract-responsaveis', '299693']);
    expect(g.queryKey).toEqual(['contract-garantias', '299693']);
    expect(await r.queryFn()).toEqual({ dados: [{ id: 1 }], origem: 'API', copiadoEm: null });
    expect(await g.queryFn()).toEqual({ dados: [{ id: 2 }], origem: 'API', copiadoEm: null });
    expect(fetchResponsaveis).toHaveBeenCalledWith(299693, { falharSeErro: true });
    expect(fetchGarantias).toHaveBeenCalledWith(299693, { falharSeErro: true });
    expect(lerCopia).not.toHaveBeenCalled();
  });

  it('consulta falhou: usam a cópia guardada pelo servidor, com a data', async () => {
    fetchResponsaveis.mockRejectedValue(new Error('503'));
    fetchGarantias.mockRejectedValue(new Error('503'));
    lerCopia.mockImplementation(async (_k: string, d: string) => ({ dados: [{ id: d }], copiadoEm: '2026-10-05T17:32:00Z' }));
    expect(await getContractResponsaveisQueryOptions(contrato()).queryFn()).toEqual({ dados: [{ id: 'responsaveis' }], origem: 'COPIA', copiadoEm: '2026-10-05T17:32:00Z' });
    expect(await getContractGarantiasQueryOptions(contrato()).queryFn()).toEqual({ dados: [{ id: 'garantias' }], origem: 'COPIA', copiadoEm: '2026-10-05T17:32:00Z' });
    expect(lerCopia).toHaveBeenCalledWith('110099-00009-2024', 'responsaveis');
  });

  it('consulta falhou e sem cópia: a query falha (a tela não mostra "não há")', async () => {
    fetchGarantias.mockRejectedValue(new Error('503'));
    lerCopia.mockResolvedValue(null);
    await expect(getContractGarantiasQueryOptions(contrato()).queryFn()).rejects.toThrow('503');
  });

  it('ficam desligadas para contrato de outra fonte ou sem id', () => {
    for (const c of [contrato({ fonteDados: 'Compras.gov.br' }), contrato({ contratoId: undefined }), null]) {
      expect(getContractResponsaveisQueryOptions(c).enabled).toBe(false);
      expect(getContractGarantiasQueryOptions(c).enabled).toBe(false);
    }
  });
});
