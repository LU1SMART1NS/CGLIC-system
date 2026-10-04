import { describe, it, expect, vi } from 'vitest';
import { getAtaSourceQueryOptions } from '../useAta';
import { getArpPrazo } from '../useAtasPortfolio';
import * as dbCacheService from '../../services/dbCacheService';
import type { ArpRecord } from '../../types';

vi.mock('../../services/dbCacheService', () => ({
  fetchArpsWithItemsFromDb: vi.fn(),
  fetchAtasWithEmpenhosSet: vi.fn(),
  fetchAtasWithAllocationsSet: vi.fn()
}));

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

describe('useAtasPortfolio — fonte de dados e prazo', () => {
  it('a Carteira de Atas e a Ata 360 usam a mesma query por UASG', async () => {
    const options = getAtaSourceQueryOptions(' 200331 ');
    expect(options.queryKey).toEqual(['ata-detail-source', '200331']);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(300000);

    vi.mocked(dbCacheService.fetchArpsWithItemsFromDb).mockResolvedValueOnce({ arps: [], itemsByAta: {}, syncInfo: { isCachedInDb: true } });
    await options.queryFn();
    expect(dbCacheService.fetchArpsWithItemsFromDb).toHaveBeenCalledWith('200331');
  });

  it('UASG vazia desabilita a consulta', () => {
    expect(getAtaSourceQueryOptions('').enabled).toBe(false);
  });

  it('classifica o prazo pela vigência e trata ata cancelada no PNCP como encerrada', () => {
    const base = { dataVigenciaFinal: isoDaysFromNow(10) } as ArpRecord;
    expect(getArpPrazo(base).faixa).toBe('CRITICO');
    expect(getArpPrazo({ ...base, dataVigenciaFinal: isoDaysFromNow(60) }).faixa).toBe('ATENCAO');
    expect(getArpPrazo({ ...base, isCanceladaPncp: true }).faixa).toBe('EXPIRADO');
    expect(getArpPrazo({ ...base, dataVigenciaFinal: '' }).faixa).toBe('SEM_DATA');
  });
});
