import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as supabaseClientModule from '../../services/supabaseClient';
import { executeSaveManualQuantitiesRpc } from '../manualQuantityRpcAdapter';

describe('manualQuantityRpcAdapter - Testes Unitários de Invocação e Payload (Fase 4.3D.3B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve formatar payload como array de objetos { emp_key, quantidade } a partir de um Record', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        success: true,
        item_key: '00037/2026-200331-00001',
        previous_version: 1,
        new_version: 2,
        count: 2,
        timestamp: '2026-09-18T12:00:00Z'
      },
      error: null
    });

    const mockSupabase = { rpc: mockRpc } as any;
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
    vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

    const result = await executeSaveManualQuantitiesRpc(
      '37/2026-200331-1',
      { '2026NE000123': 35, '2026NE000173': 2 },
      1
    );

    expect(mockRpc).toHaveBeenCalledWith('save_empenho_manual_quantities_atomic', {
      p_item_key: '00037/2026-200331-00001',
      p_quantities: [
        { emp_key: '2026NE000123', quantidade: 35 },
        { emp_key: '2026NE000173', quantidade: 2 }
      ],
      p_expected_version: 1
    });

    expect(result.success).toBe(true);
    expect(result.new_version).toBe(2);
  });

  it('deve aceitar array de RpcManualQuantityItem diretamente', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        success: true,
        item_key: '00037/2026-200331-00001',
        previous_version: 2,
        new_version: 3,
        count: 1,
        timestamp: '2026-09-18T12:00:00Z'
      },
      error: null
    });

    const mockSupabase = { rpc: mockRpc } as any;
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
    vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

    const result = await executeSaveManualQuantitiesRpc(
      '00037/2026-200331-00001',
      [{ emp_key: '2026NE000459', quantidade: 40 }],
      2
    );

    expect(mockRpc).toHaveBeenCalledWith('save_empenho_manual_quantities_atomic', {
      p_item_key: '00037/2026-200331-00001',
      p_quantities: [{ emp_key: '2026NE000459', quantidade: 40 }],
      p_expected_version: 2
    });

    expect(result.new_version).toBe(3);
  });

  it('deve propagar erro de concorrência 40001 da RPC mapeado via rpcErrorAdapter', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '40001',
        message: 'CONCURRENT_MODIFICATION_ERROR: Conflito de concorrência.'
      }
    });

    const mockSupabase = { rpc: mockRpc } as any;
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
    vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

    await expect(
      executeSaveManualQuantitiesRpc('00037/2026-200331-00001', {}, 1)
    ).rejects.toMatchObject({
      code: 'CONCURRENT_MODIFICATION_ERROR',
      sqlState: '40001'
    });
  });

  it('deve lançar erro de configuração quando Supabase não estiver disponível', async () => {
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(false);

    await expect(
      executeSaveManualQuantitiesRpc('00037/2026-200331-00001', {}, 1)
    ).rejects.toMatchObject({
      code: 'NETWORK_OR_CONFIG_ERROR'
    });
  });
});
