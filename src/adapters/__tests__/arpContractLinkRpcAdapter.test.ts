import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  linkContractToItemRpc,
  unlinkContractFromItemRpc,
  dismissContractSuggestionRpc,
  restoreContractSuggestionRpc,
  linkContractToItemsRpc
} from '../arpContractLinkRpcAdapter';
import * as supabaseModule from '../../services/supabaseClient';

vi.mock('../../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: vi.fn()
  }
}));

describe('arpContractLinkRpcAdapter (Fase 6.2 - RPCs de Vínculo)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('linkContractToItemRpc', () => {
    it('executa RPC link_contract_to_item_atomic com sucesso', async () => {
      const mockResponse = {
        data: {
          id: 'link-uuid-123',
          item_key: '00037/2026-200331-00001',
          contract_key: '200331-15-2026',
          quantidade_contratada: 50,
          success: true,
          timestamp: '2026-09-24T12:00:00Z'
        },
        error: null
      };

      (supabaseModule.supabase!.rpc as any).mockResolvedValueOnce(mockResponse);

      const result = await linkContractToItemRpc({
        itemKey: '00037/2026-200331-00001',
        contractKey: '200331-15-2026',
        quantidadeContratada: 50,
        observacoes: 'Observação teste'
      });

      expect(supabaseModule.supabase!.rpc).toHaveBeenCalledWith('link_contract_to_item_atomic', {
        p_item_key: '00037/2026-200331-00001',
        p_contract_key: '200331-15-2026',
        p_quantidade_contratada: 50,
        p_observacoes: 'Observação teste'
      });

      expect(result.id).toBe('link-uuid-123');
      expect(result.success).toBe(true);
    });

    it('converte erro 42501 em AppError de autorização', async () => {
      (supabaseModule.supabase!.rpc as any).mockResolvedValueOnce({
        data: null,
        error: {
          code: '42501',
          message: 'permission denied for table arp_item_contract_links',
          details: 'RLS check failed'
        }
      });

      await expect(
        linkContractToItemRpc({
          itemKey: '00037/2026-200331-00001',
          contractKey: '200331-15-2026',
          quantidadeContratada: 50
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });

    it('valida localmente se a quantidade contratada é maior que zero', async () => {
      await expect(
        linkContractToItemRpc({
          itemKey: '00037/2026-200331-00001',
          contractKey: '200331-15-2026',
          quantidadeContratada: 0
        })
      ).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD'
      });
    });

    it('converte erro 23514 do Postgres em AppError de validação ou payload', async () => {
      (supabaseModule.supabase!.rpc as any).mockResolvedValueOnce({
        data: null,
        error: {
          code: '23514',
          message: 'check constraint violation: chk_link_quantidade_positiva',
          details: 'chk_link_quantidade_positiva'
        }
      });

      await expect(
        linkContractToItemRpc({
          itemKey: '00037/2026-200331-00001',
          contractKey: '200331-15-2026',
          quantidadeContratada: 10
        })
      ).rejects.toHaveProperty('code');
    });
  });

  describe('unlinkContractFromItemRpc', () => {
    it('executa RPC unlink_contract_from_item_atomic com sucesso', async () => {
      (supabaseModule.supabase!.rpc as any).mockResolvedValueOnce({
        data: {
          id: 'link-uuid-123',
          success: true,
          timestamp: '2026-09-24T12:00:00Z'
        },
        error: null
      });

      const result = await unlinkContractFromItemRpc('link-uuid-123');

      expect(supabaseModule.supabase!.rpc).toHaveBeenCalledWith('unlink_contract_from_item_atomic', {
        p_link_id: 'link-uuid-123'
      });

      expect(result.id).toBe('link-uuid-123');
      expect(result.success).toBe(true);
    });

    it('converte erro de banco em AppError genérico', async () => {
      (supabaseModule.supabase!.rpc as any).mockResolvedValueOnce({
        data: null,
        error: {
          code: '50000',
          message: 'Database internal error'
        }
      });

      await expect(unlinkContractFromItemRpc('link-uuid-123')).rejects.toMatchObject({
        code: 'UNKNOWN'
      });
    });
  });
  describe('descarte de sugestão de contrato', () => {
    const params = { itemKey: '00037/2026-200331-00001', contractKey: '200331-15-2026' };
    const rpcArgs = { p_item_key: params.itemKey, p_contract_key: params.contractKey };

    it('dismissContractSuggestionRpc chama a RPC de descarte', async () => {
      (supabaseModule.supabase!.rpc as any).mockResolvedValueOnce({
        data: { success: true, item_key: params.itemKey, contract_key: params.contractKey, timestamp: 't' },
        error: null
      });

      const result = await dismissContractSuggestionRpc(params);

      expect(supabaseModule.supabase!.rpc).toHaveBeenCalledWith('dismiss_contract_suggestion_atomic', rpcArgs);
      expect(result.success).toBe(true);
    });

    it('restoreContractSuggestionRpc chama a RPC de restauração', async () => {
      (supabaseModule.supabase!.rpc as any).mockResolvedValueOnce({
        data: { success: true, item_key: params.itemKey, contract_key: params.contractKey, timestamp: 't' },
        error: null
      });

      await restoreContractSuggestionRpc(params);

      expect(supabaseModule.supabase!.rpc).toHaveBeenCalledWith('restore_contract_suggestion_atomic', rpcArgs);
    });

    it('rejeita payload sem chave de contrato antes de chamar a RPC', async () => {
      await expect(dismissContractSuggestionRpc({ itemKey: params.itemKey, contractKey: ' ' })).rejects.toBeTruthy();
      expect(supabaseModule.supabase!.rpc).not.toHaveBeenCalled();
    });

    it('propaga erro de autorização (42501)', async () => {
      (supabaseModule.supabase!.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'UNAUTHORIZED' }
      });

      await expect(dismissContractSuggestionRpc(params)).rejects.toBeTruthy();
    });
  });
  describe('linkContractToItemsRpc (vínculo em lote)', () => {
    const links = [
      { itemKey: '00037/2026-200331-00001', quantidadeContratada: 50 },
      { itemKey: '00037/2026-200331-00002', quantidadeContratada: 10 }
    ];

    it('envia todos os itens numa única chamada da RPC', async () => {
      (supabaseModule.supabase!.rpc as any).mockResolvedValueOnce({
        data: { success: true, contract_key: '200331-15-2026', count: 2, links: [], timestamp: 't' },
        error: null
      });

      const result = await linkContractToItemsRpc({ contractKey: '200331-15-2026', links, observacoes: ' nota ' });

      expect(supabaseModule.supabase!.rpc).toHaveBeenCalledTimes(1);
      expect(supabaseModule.supabase!.rpc).toHaveBeenCalledWith('link_contract_to_items_atomic', {
        p_contract_key: '200331-15-2026',
        p_links: [
          { item_key: '00037/2026-200331-00001', quantidade_contratada: 50, observacoes: 'nota' },
          { item_key: '00037/2026-200331-00002', quantidade_contratada: 10, observacoes: 'nota' }
        ]
      });
      expect(result.count).toBe(2);
    });

    it('rejeita lista vazia e quantidade inválida antes de chamar a RPC', async () => {
      await expect(linkContractToItemsRpc({ contractKey: '200331-15-2026', links: [] })).rejects.toBeTruthy();
      await expect(
        linkContractToItemsRpc({ contractKey: '200331-15-2026', links: [{ itemKey: links[0].itemKey, quantidadeContratada: 0 }] })
      ).rejects.toBeTruthy();
      expect(supabaseModule.supabase!.rpc).not.toHaveBeenCalled();
    });
  });
});
