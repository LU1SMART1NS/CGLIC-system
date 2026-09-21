import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getItemManualEmpenhosQueryOptions } from '../useItemManualEmpenhos';
import { getItemManualQuantitiesQueryOptions } from '../useItemManualQuantities';
import { getItemManualContractsQueryOptions } from '../useItemManualContracts';
import { getItemContractEmpenhoLinksQueryOptions } from '../useItemContractEmpenhoLinks';
import * as allocationService from '../../services/allocationService';

vi.mock('../../services/allocationService', () => ({
  fetchManualEmpenhosWithState: vi.fn(),
  fetchEmpenhoManualQuantitiesWithState: vi.fn(),
  fetchManualContratos: vi.fn(),
  fetchContratoEmpenhoLinks: vi.fn()
}));

describe('Hooks de Leitura de Dados Manuais - React Query (Fase 4.3D.1A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useItemManualEmpenhos', () => {
    it('deve gerar queryKey canônica com normalização de item_key', () => {
      const options = getItemManualEmpenhosQueryOptions('37/2026', '200331', '1');
      expect(options.queryKey).toEqual(['item-manual-empenhos', '00037/2026-200331-00001']);
      expect(options.enabled).toBe(true);
      expect(options.staleTime).toBe(5 * 60 * 1000);
    });

    it('deve desabilitar query se parâmetros estiverem incompletos', () => {
      const options = getItemManualEmpenhosQueryOptions('37/2026', '', '1');
      expect(options.enabled).toBe(false);
      expect(options.queryKey).toEqual(['item-manual-empenhos', '']);
    });

    it('deve delegar execução para fetchManualEmpenhosWithState', async () => {
      const mockResult = {
        empenhos: [{ id: 'emp-1', numero: '2026NE000123', ano: 2026, arpId: '00037/2026', itemId: '00001', uasg: '200331', quantidade: 10, status: 'CONFIRMADO' as const, origem: 'MANUAL' as const, criadoEm: '', atualizadoEm: '' }],
        version: 2
      };
      vi.mocked(allocationService.fetchManualEmpenhosWithState).mockResolvedValueOnce(mockResult);

      const options = getItemManualEmpenhosQueryOptions('00037/2026', '200331', '00001');
      const result = await options.queryFn();

      expect(allocationService.fetchManualEmpenhosWithState).toHaveBeenCalledWith('00037/2026-200331-00001');
      expect(result).toEqual(mockResult);
    });
  });

  describe('useItemManualQuantities', () => {
    it('deve gerar queryKey canônica com normalização', () => {
      const options = getItemManualQuantitiesQueryOptions('37/2026', '200331', '1');
      expect(options.queryKey).toEqual(['item-manual-quantities', '00037/2026-200331-00001']);
      expect(options.enabled).toBe(true);
      expect(options.staleTime).toBe(5 * 60 * 1000);
    });

    it('deve delegar execução para fetchEmpenhoManualQuantitiesWithState', async () => {
      const mockResult = {
        quantities: { '2026NE000123': 35 },
        version: 1
      };
      vi.mocked(allocationService.fetchEmpenhoManualQuantitiesWithState).mockResolvedValueOnce(mockResult);

      const options = getItemManualQuantitiesQueryOptions('00037/2026', '200331', '00001');
      const result = await options.queryFn();

      expect(allocationService.fetchEmpenhoManualQuantitiesWithState).toHaveBeenCalledWith('00037/2026-200331-00001');
      expect(result).toEqual(mockResult);
    });
  });

  describe('useItemManualContracts', () => {
    it('deve gerar queryKey canônica isolada para contratos manuais', () => {
      const options = getItemManualContractsQueryOptions('37/2026', '200331', '1');
      expect(options.queryKey).toEqual(['item-manual-contracts', '00037/2026-200331-00001']);
      expect(options.enabled).toBe(true);
    });

    it('deve delegar execução para fetchManualContratos', async () => {
      const mockContracts = [{ id: 'ctr-1', numero: '01/2026', ano: 2026, arpId: '00037/2026', uasg: '200331', origem: 'MANUAL' as const, criadoEm: '', atualizadoEm: '' }];
      vi.mocked(allocationService.fetchManualContratos).mockResolvedValueOnce(mockContracts);

      const options = getItemManualContractsQueryOptions('00037/2026', '200331', '00001');
      const result = await options.queryFn();

      expect(allocationService.fetchManualContratos).toHaveBeenCalledWith('00037/2026-200331-00001');
      expect(result).toEqual(mockContracts);
    });
  });

  describe('useItemContractEmpenhoLinks', () => {
    it('deve gerar queryKey canônica isolada para vínculos contrato-empenho', () => {
      const options = getItemContractEmpenhoLinksQueryOptions('37/2026', '200331', '1');
      expect(options.queryKey).toEqual(['item-contract-empenho-links', '00037/2026-200331-00001']);
      expect(options.enabled).toBe(true);
    });

    it('deve delegar execução para fetchContratoEmpenhoLinks', async () => {
      const mockLinks = [{ id: 'l-1', contratoId: 'c-1', empenhoId: '2026NE000123', dataVinculo: '', origem: 'MANUAL' as const }];
      vi.mocked(allocationService.fetchContratoEmpenhoLinks).mockResolvedValueOnce(mockLinks);

      const options = getItemContractEmpenhoLinksQueryOptions('00037/2026', '200331', '00001');
      const result = await options.queryFn();

      expect(allocationService.fetchContratoEmpenhoLinks).toHaveBeenCalledWith('00037/2026-200331-00001');
      expect(result).toEqual(mockLinks);
    });
  });

  describe('Isolamento de Chaves entre Itens Distintos', () => {
    it('não deve compartilhar queryKeys entre itens diferentes da mesma ata', () => {
      const optItem1 = getItemManualEmpenhosQueryOptions('37/2026', '200331', '1');
      const optItem2 = getItemManualEmpenhosQueryOptions('37/2026', '200331', '2');

      expect(optItem1.queryKey[1]).toBe('00037/2026-200331-00001');
      expect(optItem2.queryKey[1]).toBe('00037/2026-200331-00002');
      expect(optItem1.queryKey).not.toEqual(optItem2.queryKey);
    });
  });
});
