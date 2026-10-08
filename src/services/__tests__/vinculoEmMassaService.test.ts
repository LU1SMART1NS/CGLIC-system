import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../arpContractLinkService', () => ({ saveArpContractItemLinks: vi.fn() }));
vi.mock('../contractItemQuantitySyncService', () => ({ syncContractItemQuantity: vi.fn() }));

import { saveArpContractItemLinks } from '../arpContractLinkService';
import { syncContractItemQuantity } from '../contractItemQuantitySyncService';
import { executarVinculos, vincularContrato, type PlanoVinculo } from '../vinculoEmMassaService';

const plano = (contractKey: string, itens = ['00001', '00004']): PlanoVinculo => ({
  contractKey,
  numero: contractKey,
  contract: { id: contractKey, uasg: '200331', numero: '00160', ano: 2026 } as any,
  numeroAta: '00059/2025',
  uasg: '200331',
  itens: itens.map((n) => ({ itemKey: `00059/2025-200331-${n}`, numeroItem: n, valorUnitario: 10 }))
});

describe('vinculoEmMassaService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(saveArpContractItemLinks).mockResolvedValue(2);
    vi.mocked(syncContractItemQuantity).mockResolvedValue({ quantidade: 5, valorUnitario: 12, listado: true });
  });

  it('vincula todos os itens de uma vez e lê a quantidade de cada item', async () => {
    const r = await vincularContrato(plano('c1'));
    expect(r).toMatchObject({ ok: true, itens: 2, avisos: [] });
    expect(saveArpContractItemLinks).toHaveBeenCalledWith(expect.objectContaining({ contractKey: 'c1', itemKeys: ['00059/2025-200331-00001', '00059/2025-200331-00004'] }));
    expect(syncContractItemQuantity).toHaveBeenCalledTimes(2);
  });

  it('falha no vínculo (ex.: contrato de outra ata) não lê a API e vira erro do contrato', async () => {
    vi.mocked(saveArpContractItemLinks).mockRejectedValue(new Error('CONTRATO_OUTRA_ATA: já vinculado'));
    const r = await vincularContrato(plano('c1'));
    expect(r).toMatchObject({ ok: false, itens: 0, erro: expect.stringContaining('CONTRATO_OUTRA_ATA') });
    expect(syncContractItemQuantity).not.toHaveBeenCalled();
  });

  it('falha ao ler a API depois de vincular vira aviso: o vínculo vale', async () => {
    vi.mocked(syncContractItemQuantity).mockRejectedValueOnce(new Error('API'));
    const r = await vincularContrato(plano('c1'));
    expect(r.ok).toBe(true);
    expect(r.avisos).toEqual(['quantidade do item 00001']);
  });

  it('o lote segue depois de uma falha, em sequência, e informa o progresso', async () => {
    vi.mocked(saveArpContractItemLinks).mockRejectedValueOnce(new Error('falhou')).mockResolvedValue(1);
    const progresso: Array<[number, number, string]> = [];
    const r = await executarVinculos([plano('c1'), plano('c2'), plano('c3')], { onProgresso: (f, t, p) => progresso.push([f, t, p.contractKey]) });
    expect(r.map((x) => [x.contractKey, x.ok])).toEqual([['c1', false], ['c2', true], ['c3', true]]);
    expect(progresso).toEqual([[0, 3, 'c1'], [1, 3, 'c2'], [2, 3, 'c3']]);
  });

  it('parar encerra depois do contrato em andamento', async () => {
    let n = 0;
    const r = await executarVinculos([plano('c1'), plano('c2'), plano('c3')], { parar: () => n++ >= 1 });
    expect(r.map((x) => x.contractKey)).toEqual(['c1']);
  });
});
