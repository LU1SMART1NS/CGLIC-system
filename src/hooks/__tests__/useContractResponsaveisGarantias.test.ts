import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContractDashboardRecord } from '../../types';

const fetchResponsaveis = vi.fn();
const fetchGarantias = vi.fn();
vi.mock('../../services/api', () => ({
  fetchContratosGovResponsaveis: (...a: unknown[]) => fetchResponsaveis(...a),
  fetchContratosGovGarantias: (...a: unknown[]) => fetchGarantias(...a)
}));

import { getContractResponsaveisQueryOptions } from '../useContractResponsaveis';
import { getContractGarantiasQueryOptions } from '../useContractGarantias';

const contrato = (over: Partial<ContractDashboardRecord> = {}) =>
  ({ id: '110099-00009-2024', numero: '00009', ano: 2024, uasg: '110099', contratoId: 299693, fonteDados: 'Contratos.gov.br', ...over }) as ContractDashboardRecord;

describe('consultas de responsáveis e garantias do Contratos.gov.br', () => {
  beforeEach(() => {
    fetchResponsaveis.mockReset();
    fetchGarantias.mockReset();
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
    expect(await r.queryFn()).toEqual([{ id: 1 }]);
    expect(await g.queryFn()).toEqual([{ id: 2 }]);
    expect(fetchResponsaveis).toHaveBeenCalledWith(299693);
    expect(fetchGarantias).toHaveBeenCalledWith(299693);
  });

  it('ficam desligadas para contrato de outra fonte ou sem id', () => {
    for (const c of [contrato({ fonteDados: 'Compras.gov.br' }), contrato({ contratoId: undefined }), null]) {
      expect(getContractResponsaveisQueryOptions(c).enabled).toBe(false);
      expect(getContractGarantiasQueryOptions(c).enabled).toBe(false);
    }
  });
});
