import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapPostgresErrorToAppError } from '../rpcErrorAdapter';
import { executeSaveAllocationsRpc } from '../allocationRpcAdapter';
import { executeSaveEmpenhoLinksRpc } from '../empenhoLinkRpcAdapter';
import { saveAllocations, saveEmpenhoLinks } from '../../services/allocationService';
import * as supabaseClientModule from '../../services/supabaseClient';

describe('RPC Persistence Adapters & Error Mapping (Fase 3 & Fase 4.3C.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });


  describe('rpcErrorAdapter - Mapeamento de Erros e SQLSTATE', () => {
    it('deve mapear erro de autorização 42501 para UNAUTHORIZED', () => {
      const err = { message: 'UNAUTHORIZED: Acesso restrito a gestores e administradores', code: '42501' };
      const mapped = mapPostgresErrorToAppError(err);
      expect(mapped.code).toBe('UNAUTHORIZED');
      expect(mapped.sqlState).toBe('42501');
    });

    it('deve mapear erro de concorrência 40001 para CONCURRENT_MODIFICATION_ERROR', () => {
      const err = { message: 'CONCURRENT_MODIFICATION_ERROR: Conflito de versão detectado', code: '40001' };
      const mapped = mapPostgresErrorToAppError(err);
      expect(mapped.code).toBe('CONCURRENT_MODIFICATION_ERROR');
      expect(mapped.sqlState).toBe('40001');
    });

    it('deve mapear erro de versão esperada obrigatória para EXPECTED_VERSION_REQUIRED', () => {
      const err = { message: 'EXPECTED_VERSION_REQUIRED: O item possui versão ativa 2...', code: '40001' };
      const mapped = mapPostgresErrorToAppError(err);
      expect(mapped.code).toBe('EXPECTED_VERSION_REQUIRED');
      expect(mapped.sqlState).toBe('40001');
    });

    it('deve mapear violação de RN-07 para INVALID_CONTRACT_LINK', () => {
      const err = { message: 'INVALID_CONTRACT_LINK: Regra RN-07 violada. Todo contrato exige vinculação...', code: '23514' };
      const mapped = mapPostgresErrorToAppError(err);
      expect(mapped.code).toBe('INVALID_CONTRACT_LINK');
      expect(mapped.sqlState).toBe('23514');
    });

    it('deve mapear formato de empenho inválido para INVALID_EMPENHO_ID_FORMAT', () => {
      const err = { message: 'INVALID_EMPENHO_ID_FORMAT: Identificador inválido', code: '22023' };
      const mapped = mapPostgresErrorToAppError(err);
      expect(mapped.code).toBe('INVALID_EMPENHO_ID_FORMAT');
      expect(mapped.sqlState).toBe('22023');
    });

    it('unidade em uso: devolve o texto do banco, sem cair em INVALID_ALLOCATION', () => {
      const err = { message: 'CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS: A unidade "DGI" está em uso (2 alocação(ões), 0 divisão(ões) do contratado, 0 permissão(ões) de usuário) e não pode ser excluída. Desative-a.', code: '23503' };
      const mapped = mapPostgresErrorToAppError(err);
      expect(mapped.code).toBe('CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS');
      expect(mapped.message).toMatch(/^A unidade "DGI" está em uso/);
    });

    it('unidade desativada na alocação vira INACTIVE_DEPARTMENT', () => {
      const mapped = mapPostgresErrorToAppError({ message: 'INACTIVE_DEPARTMENT: A unidade "DGI" está desativada e não pode receber novas alocações.', code: '22023' });
      expect(mapped.code).toBe('INACTIVE_DEPARTMENT');
      expect(mapped.message).toBe('A unidade "DGI" está desativada e não pode receber novas alocações.');
    });

    it('deve mapear departamento inválido 23503 para INVALID_DEPARTMENT', () => {
      const err = { message: 'INVALID_DEPARTMENT: Departamento "XYZ" não existe', code: '23503' };
      const mapped = mapPostgresErrorToAppError(err);
      expect(mapped.code).toBe('INVALID_DEPARTMENT');
      expect(mapped.sqlState).toBe('23503');
    });

    it('deve mapear erro genérico de rede/fetch para NETWORK_OR_CONFIG_ERROR', () => {
      const err = new Error('Failed to fetch from server');
      const mapped = mapPostgresErrorToAppError(err);
      expect(mapped.code).toBe('NETWORK_OR_CONFIG_ERROR');
    });
  });

  describe('allocationRpcAdapter - Invocação e Payload', () => {
    it('deve falhar adequadamente se Supabase não estiver configurado', async () => {
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(false);
      await expect(executeSaveAllocationsRpc('00037/2026-200331-00001', [])).rejects.toThrow();
    });

    it('deve normalizar a chave e preparar o payload corretamente para a RPC', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          item_key: '00037/2026-200331-00001',
          previous_version: 1,
          new_version: 2,
          count: 2,
          timestamp: new Date().toISOString()
        },
        error: null
      });

      const mockSupabase = { rpc: mockRpc } as any;
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

      const result = await executeSaveAllocationsRpc(
        '37/2026-200331-1', // Chave despadronizada que deve ser normalizada pelo adapter
        [
          { unit_name: 'DTI', allocated_qty: 100, empenhada_qty: 10 },
          { unit_name: 'DEPE', allocated_qty: 50, empenhada_qty: 0 }
        ],
        1
      );

      expect(mockRpc).toHaveBeenCalledWith('save_allocations_atomic', {
        p_item_key: '00037/2026-200331-00001',
        p_allocations: [
          { id: undefined, unit_name: 'DTI', allocated_qty: 100, empenhada_qty: 10, processo_sei_id: null },
          { id: undefined, unit_name: 'DEPE', allocated_qty: 50, empenhada_qty: 0, processo_sei_id: null }
        ],
        p_expected_version: 1
      });

      expect(result.success).toBe(true);
      expect(result.new_version).toBe(2);
    });
  });

  describe('allocationService - Integração com RPCs', () => {
    it('saveAllocations deve propagar chamada para executeSaveAllocationsRpc', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { success: true, item_key: '00037/2026-200331-00001', previous_version: 1, new_version: 2, count: 1, timestamp: '' },
        error: null
      });

      const mockSupabase = { rpc: mockRpc } as any;
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

      await saveAllocations('00037/2026-200331-00001', [
        { id: '1', unitName: 'DTI', allocatedQty: 10, empenhadaQty: 0 }
      ], 1);

      expect(mockRpc).toHaveBeenCalled();
    });

    it('saveEmpenhoLinks deve invocar executeSaveEmpenhoLinksRpc com payload normalizado', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { success: true, item_key: '00037/2026-200331-00001', previous_version: 1, new_version: 2, count: 1, timestamp: '' },
        error: null
      });

      const mockSupabase = { rpc: mockRpc } as any;
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

      await saveEmpenhoLinks('37/2026-200331-1', { '2026NE000123': 'alloc-1' }, 1);

      expect(mockRpc).toHaveBeenCalledWith('save_empenho_links_atomic', {
        p_item_key: '00037/2026-200331-00001',
        p_links: [{ empenho_numero: '2026NE000123', allocation_id: 'alloc-1' }],
        p_expected_version: 1
      });
    });

  });

  describe('empenhoLinkRpcAdapter - Invocação e Payload', () => {
    it('deve normalizar chave canônica e array de vínculos', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          item_key: '00037/2026-200331-00001',
          previous_version: 1,
          new_version: 2,
          count: 2,
          timestamp: new Date().toISOString()
        },
        error: null
      });

      const mockSupabase = { rpc: mockRpc } as any;
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

      const result = await executeSaveEmpenhoLinksRpc(
        '37/2026-200331-1',
        { '2026NE000123': 'alloc-1', '2026NE000124': 'alloc-2' },
        1
      );

      expect(mockRpc).toHaveBeenCalledWith('save_empenho_links_atomic', {
        p_item_key: '00037/2026-200331-00001',
        p_links: [
          { empenho_numero: '2026NE000123', allocation_id: 'alloc-1' },
          { empenho_numero: '2026NE000124', allocation_id: 'alloc-2' }
        ],
        p_expected_version: 1
      });

      expect(result.success).toBe(true);
      expect(result.new_version).toBe(2);
    });

    it('deve rejeitar e mapear erro de concorrência 40001 retornado pela RPC', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'CONCURRENT_MODIFICATION_ERROR: Versão divergente', code: '40001' }
      });

      const mockSupabase = { rpc: mockRpc } as any;
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

      await expect(executeSaveEmpenhoLinksRpc('00037/2026-200331-00001', {}, 1))
        .rejects.toMatchObject({
          code: 'CONCURRENT_MODIFICATION_ERROR',
          sqlState: '40001'
        });
    });
  });

});

describe('mapPostgresErrorToAppError: departamento recusado pelo catálogo', () => {
  it('nomeia o departamento e orienta o cadastro quando o banco informa qual foi recusado', () => {
    const err = mapPostgresErrorToAppError({
      code: '23503',
      message: 'INVALID_DEPARTMENT: Departamento "DSUSP" não existe ou está inativo no catálogo oficial.'
    });
    expect(err.code).toBe('INVALID_DEPARTMENT');
    expect(err.message).toContain('"DSUSP"');
    expect(err.message).toContain('Unidades Internas');
  });

  it('mantém a mensagem genérica quando não há nome no texto do erro', () => {
    const err = mapPostgresErrorToAppError({ code: '23503', message: 'INVALID_DEPARTMENT' });
    expect(err.message).toBe('Departamento inválido ou inativo no catálogo oficial.');
  });
});
