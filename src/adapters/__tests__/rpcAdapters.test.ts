import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapPostgresErrorToAppError } from '../rpcErrorAdapter';
import { executeSaveAllocationsRpc } from '../allocationRpcAdapter';
import { executeSaveContratoRpc } from '../contractRpcAdapter';
import { executeSaveEmpenhoLinksRpc } from '../empenhoLinkRpcAdapter';
import { executeSaveManualEmpenhosRpc } from '../manualEmpenhoRpcAdapter';
import { saveAllocations, saveManualContratoWithEmpenhos, saveEmpenhoLinks, saveManualEmpenhos } from '../../services/allocationService';
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

  describe('contractRpcAdapter - Invocação e Payload', () => {
    it('deve normalizar contrato e empenhos e invocar save_manual_contrato_atomic', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          contrato_id: 'ctr_00037/2026-200331-00001_12/2026_2026_uuid',
          item_key: '00037/2026-200331-00001',
          links_count: 2,
          timestamp: new Date().toISOString()
        },
        error: null
      });

      const mockSupabase = { rpc: mockRpc } as any;
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

      const result = await executeSaveContratoRpc({
        contrato: {
          item_key: '37/2026-200331-1',
          numero: '12/2026',
          ano: 2026,
          arp_id: '00037/2026',
          uasg: '200331',
          objeto: 'Aquisição de suprimentos'
        },
        empenhoIds: ['2026NE000123', '2026NE000124']
      });

      expect(mockRpc).toHaveBeenCalledWith('save_manual_contrato_atomic', {
        p_contrato: expect.objectContaining({
          item_key: '00037/2026-200331-00001',
          numero: '12/2026',
          ano: 2026,
          uasg: '200331'
        }),
        p_empenho_ids: ['2026NE000123', '2026NE000124']
      });

      expect(result.success).toBe(true);
      expect(result.links_count).toBe(2);
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

    it('saveManualContratoWithEmpenhos deve validar e persistir contrato via RPC', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { success: true, contrato_id: 'c1', item_key: '00037/2026-200331-00001', links_count: 1, timestamp: '' },
        error: null
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null })
        })
      });

      const mockSupabase = { rpc: mockRpc, from: mockFrom } as any;
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

      await saveManualContratoWithEmpenhos({
        id: 'c1',
        numero: '01/2026',
        ano: 2026,
        arpId: '00037/2026',
        itemId: '00001',
        uasg: '200331',
        origem: 'MANUAL',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
      }, ['2026NE000123']);

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

    it('saveManualEmpenhos deve invocar executeSaveManualEmpenhosRpc com payload normalizado', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { success: true, item_key: '00037/2026-200331-00001', previous_version: 1, new_version: 2, count: 1, timestamp: '' },
        error: null
      });

      const mockSupabase = { rpc: mockRpc } as any;
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

      await saveManualEmpenhos('37/2026-200331-1', [
        {
          id: 'emp-1',
          numero: '2026NE000123',
          ano: 2026,
          arpId: '00037/2026',
          itemId: '00001',
          uasg: '200331',
          quantidade: 10,
          origem: 'MANUAL',
          status: 'CONFIRMADO',
          criadoEm: '',
          atualizadoEm: ''
        }
      ], 1);

      expect(mockRpc).toHaveBeenCalledWith('save_manual_empenhos_atomic', {
        p_item_key: '00037/2026-200331-00001',
        p_empenhos: [
          expect.objectContaining({
            numero: '2026NE000123',
            ano: 2026,
            quantidade: 10,
            origem: 'MANUAL'
          })
        ],
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

  describe('manualEmpenhoRpcAdapter - Invocação e Payload (Fase 4.3D.2B)', () => {
    it('deve normalizar chave canônica e payload estruturado para save_manual_empenhos_atomic', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          item_key: '00037/2026-200331-00001',
          previous_version: 1,
          new_version: 2,
          count: 1,
          timestamp: new Date().toISOString()
        },
        error: null
      });

      const mockSupabase = { rpc: mockRpc } as any;
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

      const result = await executeSaveManualEmpenhosRpc(
        '37/2026-200331-1',
        [
          {
            id: 'emp-1',
            numero: '2026ne000123',
            ano: 2026,
            arpId: '00037/2026',
            itemId: '00001',
            uasg: '200331',
            quantidade: 25.5,
            valorUnitario: 100,
            valorTotal: 2550,
            origem: 'MANUAL',
            status: 'CONFIRMADO',
            criadoEm: '',
            atualizadoEm: ''
          }
        ],
        1
      );

      expect(mockRpc).toHaveBeenCalledWith('save_manual_empenhos_atomic', {
        p_item_key: '00037/2026-200331-00001',
        p_empenhos: [
          {
            id: 'emp-1',
            numero: '2026NE000123',
            ano: 2026,
            arp_id: '00037/2026',
            item_id: '00001',
            uasg: '200331',
            quantidade: 25.5,
            valor_unitario: 100,
            valor_total: 2550,
            data: null,
            fornecedor: null,
            cnpj_fornecedor: null,
            unidade_interna_id: null,
            observacao: null,
            origem: 'MANUAL',
            status: 'CONFIRMADO'
          }
        ],
        p_expected_version: 1
      });

      expect(result.success).toBe(true);
      expect(result.new_version).toBe(2);
    });

    it('deve rejeitar e mapear erro de concorrência 40001 na RPC de empenhos manuais', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'CONCURRENT_MODIFICATION_ERROR: Conflito de versão detectado', code: '40001' }
      });

      const mockSupabase = { rpc: mockRpc } as any;
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

      await expect(executeSaveManualEmpenhosRpc('00037/2026-200331-00001', [], 1))
        .rejects.toMatchObject({
          code: 'CONCURRENT_MODIFICATION_ERROR',
          sqlState: '40001'
        });
    });

    it('deve rejeitar e mapear erro de autorização 42501', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'UNAUTHORIZED: Acesso restrito', code: '42501' }
      });

      const mockSupabase = { rpc: mockRpc } as any;
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);

      await expect(executeSaveManualEmpenhosRpc('00037/2026-200331-00001', [], 1))
        .rejects.toMatchObject({
          code: 'UNAUTHORIZED',
          sqlState: '42501'
        });
    });
  });
});

