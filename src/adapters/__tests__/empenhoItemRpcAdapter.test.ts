import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncItemContractEmpenhosRpc, confirmEmpenhoItemQuantityRpc } from '../empenhoItemRpcAdapter';
import * as supabaseModule from '../../services/supabaseClient';

vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: vi.fn() }
}));

const rpc = () => supabaseModule.supabase!.rpc as any;
const ITEM = '00037/2026-200331-00001';
const CONTRACT = '200331-15-2026';
const EMP = '11111111-1111-1111-1111-111111111111';

describe('empenhoItemRpcAdapter', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('syncItemContractEmpenhosRpc', () => {
    it('envia o conjunto de empenhos do par item + contrato em uma única chamada', async () => {
      rpc().mockResolvedValueOnce({
        data: { success: true, item_key: ITEM, contract_key: CONTRACT, sincronizados: 2, removidos: 0, pendentes: 1, timestamp: 't' },
        error: null
      });

      const result = await syncItemContractEmpenhosRpc({
        itemKey: ITEM,
        contractKey: CONTRACT,
        empenhos: [
          { empenhoId: EMP, quantidade: 2, numeroItemMinuta: '1' },
          { empenhoId: EMP.replace(/1/g, '2'), quantidade: null, quantidadeSugerida: 7 }
        ]
      });

      expect(rpc()).toHaveBeenCalledTimes(1);
      expect(rpc()).toHaveBeenCalledWith('sync_item_contract_empenhos_atomic', {
        p_item_key: ITEM,
        p_contract_key: CONTRACT,
        p_empenhos: [
          { empenho_id: EMP, quantidade: 2, quantidade_sugerida: null, numero_item_minuta: '1' },
          { empenho_id: EMP.replace(/1/g, '2'), quantidade: null, quantidade_sugerida: 7, numero_item_minuta: null }
        ]
      });
      expect(result.pendentes).toBe(1);
    });

    it('aceita lista vazia (remove os empenhos do contrato no item)', async () => {
      rpc().mockResolvedValueOnce({ data: { success: true, sincronizados: 0, removidos: 3, pendentes: 0 }, error: null });
      const result = await syncItemContractEmpenhosRpc({ itemKey: ITEM, contractKey: CONTRACT, empenhos: [] });
      expect(result.removidos).toBe(3);
    });

    it('rejeita chaves vazias e quantidade negativa antes de chamar a RPC', async () => {
      await expect(syncItemContractEmpenhosRpc({ itemKey: ' ', contractKey: CONTRACT, empenhos: [] })).rejects.toBeTruthy();
      await expect(syncItemContractEmpenhosRpc({ itemKey: ITEM, contractKey: '', empenhos: [] })).rejects.toBeTruthy();
      await expect(
        syncItemContractEmpenhosRpc({ itemKey: ITEM, contractKey: CONTRACT, empenhos: [{ empenhoId: EMP, quantidade: -1 }] })
      ).rejects.toBeTruthy();
      expect(rpc()).not.toHaveBeenCalled();
    });

    it('converte erro de autorização em AppError', async () => {
      rpc().mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'UNAUTHORIZED' } });
      await expect(
        syncItemContractEmpenhosRpc({ itemKey: ITEM, contractKey: CONTRACT, empenhos: [] })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('confirmEmpenhoItemQuantityRpc', () => {
    it('confirma a quantidade de um empenho', async () => {
      rpc().mockResolvedValueOnce({
        data: { success: true, item_key: ITEM, empenho_id: EMP, quantidade_consumida: 5, fonte_quantidade: 'USUARIO', timestamp: 't' },
        error: null
      });
      const result = await confirmEmpenhoItemQuantityRpc({ itemKey: ITEM, empenhoId: EMP, quantidade: 5 });
      expect(rpc()).toHaveBeenCalledWith('confirm_empenho_item_quantity_atomic', {
        p_item_key: ITEM,
        p_empenho_id: EMP,
        p_quantidade: 5
      });
      expect(result.fonte_quantidade).toBe('USUARIO');
    });

    it('nulo devolve o empenho a pendente', async () => {
      rpc().mockResolvedValueOnce({ data: { success: true, quantidade_consumida: null, fonte_quantidade: null }, error: null });
      await confirmEmpenhoItemQuantityRpc({ itemKey: ITEM, empenhoId: EMP, quantidade: null });
      expect(rpc()).toHaveBeenCalledWith('confirm_empenho_item_quantity_atomic', expect.objectContaining({ p_quantidade: null }));
    });

    it('rejeita quantidade zero ou negativa e ids vazios antes de chamar a RPC', async () => {
      await expect(confirmEmpenhoItemQuantityRpc({ itemKey: ITEM, empenhoId: EMP, quantidade: 0 })).rejects.toBeTruthy();
      await expect(confirmEmpenhoItemQuantityRpc({ itemKey: ITEM, empenhoId: '', quantidade: 3 })).rejects.toBeTruthy();
      expect(rpc()).not.toHaveBeenCalled();
    });

    it('propaga o erro quando a quantidade vem da API', async () => {
      rpc().mockResolvedValueOnce({ data: null, error: { code: '23514', message: 'QUANTITY_FROM_API' } });
      await expect(confirmEmpenhoItemQuantityRpc({ itemKey: ITEM, empenhoId: EMP, quantidade: 3 })).rejects.toBeTruthy();
    });
  });
});
