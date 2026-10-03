import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContractDashboardRecord } from '../../types';

const fetchPncpContratoMock = vi.fn();
vi.mock('../../services/pncpContratoService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/pncpContratoService')>()),
  fetchPncpContrato: (...a: unknown[]) => fetchPncpContratoMock(...a)
}));
const fetchPncpAtaVigencia = vi.fn();
vi.mock('../../services/api', () => ({ fetchPncpAtaVigencia: (...a: unknown[]) => fetchPncpAtaVigencia(...a) }));

import { getContractPncpQueryOptions } from '../useContractPncp';
import { getAtaPncpQueryOptions } from '../useAtaPncp';

const contrato = (over: Partial<ContractDashboardRecord> = {}) =>
  ({ id: 'c1', numero: '00230/2026', ano: 2026, uasg: '200331', dataAssinatura: '2026-07-07', raw: {}, ...over }) as ContractDashboardRecord;

describe('consultas ao PNCP do contrato e da ata', () => {
  beforeEach(() => {
    fetchPncpContratoMock.mockReset();
    fetchPncpAtaVigencia.mockReset();
  });

  it('contrato: liga quando há como consultar, e sem nova tentativa', async () => {
    fetchPncpContratoMock.mockResolvedValue({ numeroControlePncp: 'x', dataPublicacaoPncp: '2026-07-07' });
    const opcoes = getContractPncpQueryOptions(contrato());
    expect(opcoes.enabled).toBe(true);
    expect(opcoes.retry).toBe(false);
    expect(opcoes.queryKey).toEqual(['contract-pncp', 'c1']);
    expect((await opcoes.queryFn())?.dataPublicacaoPncp).toBe('2026-07-07');
  });

  it('contrato com Id PNCP no cadastro também consulta', () => {
    expect(getContractPncpQueryOptions(contrato({ uasg: '110099', numeroControlePncp: '00394494000136-2-001220/2026' })).enabled).toBe(true);
  });

  it('contrato sem CNPJ da UASG e sem Id fica desligado', () => {
    expect(getContractPncpQueryOptions(contrato({ uasg: '110099' })).enabled).toBe(false);
    expect(getContractPncpQueryOptions(null).enabled).toBe(false);
  });

  it('ata: consulta pelo Id PNCP da ata', async () => {
    fetchPncpAtaVigencia.mockResolvedValue({ dataPublicacaoPncp: '2025-10-09T10:45:06' });
    const opcoes = getAtaPncpQueryOptions({ numeroControlePncpAta: '00394494000136-1-000916/2025-000001' });
    expect(opcoes.enabled).toBe(true);
    expect(opcoes.retry).toBe(false);
    expect(opcoes.queryKey).toEqual(['ata-pncp', '00394494000136-1-000916/2025-000001']);
    expect((await opcoes.queryFn())?.dataPublicacaoPncp).toBe('2025-10-09T10:45:06');
    expect(fetchPncpAtaVigencia).toHaveBeenCalledWith('00394494000136-1-000916/2025-000001');
  });

  it('ata sem Id PNCP fica desligada', () => {
    expect(getAtaPncpQueryOptions({ numeroControlePncpAta: '' }).enabled).toBe(false);
    expect(getAtaPncpQueryOptions(null).enabled).toBe(false);
  });
});
