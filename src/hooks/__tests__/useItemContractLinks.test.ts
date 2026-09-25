import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as arpContractLinkService from '../../services/arpContractLinkService';
import type { ArpItemContractLink } from '../../types/arpContractLinks';

vi.mock('../../services/arpContractLinkService', () => ({
  fetchArpItemContractLinks: vi.fn(),
  saveArpItemContractLink: vi.fn(),
  deleteArpItemContractLink: vi.fn(),
  enrichContractLinks: vi.fn()
}));

describe('Hooks de Vínculo ARP ↔ Contratos Oficiais (Fase 6.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchArpItemContractLinks recupera contratos oficiais vinculados a um item', async () => {
    const mockLinks: ArpItemContractLink[] = [
      {
        id: 'link-1',
        itemKey: '00037/2026-200331-00001',
        contractKey: '200331-15-2026',
        quantidadeContratada: 50
      }
    ];

    vi.mocked(arpContractLinkService.fetchArpItemContractLinks).mockResolvedValueOnce(mockLinks);

    const result = await arpContractLinkService.fetchArpItemContractLinks('00037/2026-200331-00001');

    expect(arpContractLinkService.fetchArpItemContractLinks).toHaveBeenCalledWith('00037/2026-200331-00001');
    expect(result).toEqual(mockLinks);
  });

  it('saveArpItemContractLink persiste um novo vínculo contextual com quantidade', async () => {
    const params = {
      itemKey: '00037/2026-200331-00001',
      contractKey: '200331-15-2026',
      quantidadeContratada: 50
    };

    const mockCreated: ArpItemContractLink = {
      id: 'link-uuid-abc',
      ...params
    };

    vi.mocked(arpContractLinkService.saveArpItemContractLink).mockResolvedValueOnce(mockCreated);

    const result = await arpContractLinkService.saveArpItemContractLink(params);

    expect(arpContractLinkService.saveArpItemContractLink).toHaveBeenCalledWith(params);
    expect(result.id).toBe('link-uuid-abc');
    expect(result.quantidadeContratada).toBe(50);
  });

  it('deleteArpItemContractLink remove o vínculo sem afetar dados do contrato oficial', async () => {
    vi.mocked(arpContractLinkService.deleteArpItemContractLink).mockResolvedValueOnce(undefined);

    await arpContractLinkService.deleteArpItemContractLink('link-uuid-abc', '00037/2026-200331-00001');

    expect(arpContractLinkService.deleteArpItemContractLink).toHaveBeenCalledWith(
      'link-uuid-abc',
      '00037/2026-200331-00001'
    );
  });
});
