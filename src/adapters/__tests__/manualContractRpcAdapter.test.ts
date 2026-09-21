import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSaveContratoRpc, executeDeleteContratoRpc } from '../manualContractRpcAdapter';
import * as supabaseClientModule from '../../services/supabaseClient';

describe('manualContractRpcAdapter (Fase 4.4D - GAP-43D4-DELETE)', () => {
  let mockRpc: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = vi.fn();
    const mockSupabase = { rpc: mockRpc } as any;
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
    vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);
  });

  describe('executeDeleteContratoRpc', () => {
    it('deve chamar a RPC delete_manual_contrato_atomic com id limpo', async () => {
      const mockResult = {
        success: true,
        id: 'ctr-123',
        item_key: '00037/2026-200331-00001',
        message: 'Contrato manual excluído com sucesso.'
      };

      mockRpc.mockResolvedValueOnce({
        data: mockResult,
        error: null
      });

      const result = await executeDeleteContratoRpc(' ctr-123 ');

      expect(mockRpc).toHaveBeenCalledWith('delete_manual_contrato_atomic', {
        p_id: 'ctr-123'
      });
      expect(result).toEqual(mockResult);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar se id estiver vazio', async () => {
      await expect(executeDeleteContratoRpc('')).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD'
      });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('deve rejeitar com NETWORK_OR_CONFIG_ERROR se supabase não estiver configurado', async () => {
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(false);
      await expect(executeDeleteContratoRpc('ctr-123')).rejects.toMatchObject({
        code: 'NETWORK_OR_CONFIG_ERROR'
      });
    });

    it('deve mapear erro CONTRACT_NOT_FOUND (P0002) retornado pela RPC', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'CONTRACT_NOT_FOUND: Contrato manual com ID "ctr-999" não encontrado.',
          code: 'P0002'
        }
      });

      await expect(executeDeleteContratoRpc('ctr-999')).rejects.toMatchObject({
        code: 'CONTRACT_NOT_FOUND',
        sqlState: 'P0002'
      });
    });

    it('deve mapear erro UNAUTHORIZED (42501) retornado pela RPC', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'UNAUTHORIZED: Acesso restrito a gestores e administradores',
          code: '42501'
        }
      });

      await expect(executeDeleteContratoRpc('ctr-123')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        sqlState: '42501'
      });
    });
  });

  describe('executeSaveContratoRpc (Re-export)', () => {
    it('deve executar save_manual_contrato_atomic com payload normalizado', async () => {
      const mockResult = {
        success: true,
        contrato_id: 'ctr_00037/2026-200331-00001_12/2026_2026',
        item_key: '00037/2026-200331-00001',
        links_count: 1,
        timestamp: new Date().toISOString()
      };

      mockRpc.mockResolvedValueOnce({
        data: mockResult,
        error: null
      });

      const result = await executeSaveContratoRpc({
        contrato: {
          item_key: '37/2026-200331-1',
          numero: '12/2026',
          ano: 2026,
          uasg: '200331'
        },
        empenhoIds: ['2026NE000123']
      });

      expect(mockRpc).toHaveBeenCalledWith('save_manual_contrato_atomic', expect.objectContaining({
        p_contrato: expect.objectContaining({
          item_key: '00037/2026-200331-00001',
          numero: '12/2026',
          ano: 2026
        }),
        p_empenho_ids: ['2026NE000123']
      }));
      expect(result.success).toBe(true);
    });
  });
});
