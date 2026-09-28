import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchPaymentCyclesForContract,
  createPaymentCycleRpc,
  updatePaymentCycleRpc,
  cancelPaymentCycleRpc
} from '../paymentCycleRpcAdapter';
import * as supabaseClientModule from '../../services/supabaseClient';

describe('paymentCycleRpcAdapter (Fase 10-A.2 — persistência canônica de contract_payment_cycles)', () => {
  let mockRpc: any;
  let mockFrom: any;
  let mockOrder: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = vi.fn();
    mockOrder = vi.fn();
    mockFrom = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: mockOrder
        }))
      }))
    }));
    const mockSupabase = { rpc: mockRpc, from: mockFrom } as any;
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
    vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);
  });

  describe('fetchPaymentCyclesForContract', () => {
    it('busca ciclos filtrando por contract_key e ordenando por criado_em desc', async () => {
      const rows = [{ id: 'uuid-1', cycle_key: 'C1-PGTO-202609-DOC1', contract_key: 'C1' }];
      mockOrder.mockResolvedValueOnce({ data: rows, error: null });

      const result = await fetchPaymentCyclesForContract('C1');

      expect(mockFrom).toHaveBeenCalledWith('contract_payment_cycles');
      expect(result).toEqual(rows);
    });

    it('retorna array vazio quando o Supabase não está configurado (sem lançar exceção)', async () => {
      vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(false);
      const result = await fetchPaymentCyclesForContract('C1');
      expect(result).toEqual([]);
    });

    it('propaga erro mapeado quando a consulta falha', async () => {
      mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'boom', code: '500' } });
      await expect(fetchPaymentCyclesForContract('C1')).rejects.toBeDefined();
    });
  });

  describe('createPaymentCycleRpc', () => {
    it('chama create_payment_cycle_atomic com todos os campos mapeados e aplica o template por padrão', async () => {
      const mockResult = {
        success: true,
        cycle: { id: 'uuid-1', cycle_key: 'C1-PGTO-202609-DOC1', contract_key: 'C1', competencia: '2026-09', status: 'RECEBIDO', criado_em: 'x' },
        task_plan: { success: true, plan_id: 'plan-1' }
      };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await createPaymentCycleRpc({
        contractKey: 'C1',
        competencia: '2026-09',
        documentoAtestoSei: 'Doc 1',
        dataAssinaturaAtesto: '2026-09-01',
        dataVencimentoFatura: '2026-09-20',
        valorAtesto: 10000
      });

      expect(mockRpc).toHaveBeenCalledWith('create_payment_cycle_atomic', expect.objectContaining({
        p_contract_key: 'C1',
        p_competencia: '2026-09',
        p_documento_atesto_sei: 'Doc 1',
        p_valor_atesto: 10000,
        p_apply_task_template: true
      }));
      expect(result.cycle.cycle_key).toBe('C1-PGTO-202609-DOC1');
    });

    it('permite desativar a aplicação automática do template (applyTaskTemplate: false)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, cycle: { id: 'x' }, task_plan: null },
        error: null
      });

      await createPaymentCycleRpc({
        contractKey: 'C1',
        competencia: '2026-09',
        documentoAtestoSei: 'Doc 1',
        dataAssinaturaAtesto: '2026-09-01',
        dataVencimentoFatura: '2026-09-20',
        valorAtesto: 10000,
        applyTaskTemplate: false
      });

      expect(mockRpc).toHaveBeenCalledWith('create_payment_cycle_atomic', expect.objectContaining({
        p_apply_task_template: false
      }));
    });

    it('mapeia erro PAYMENT_CYCLE_ALREADY_EXISTS (idempotência) sem criar duplicata', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'PAYMENT_CYCLE_ALREADY_EXISTS: Já existe um ciclo...', code: '23505' }
      });

      await expect(
        createPaymentCycleRpc({
          contractKey: 'C1',
          competencia: '2026-09',
          documentoAtestoSei: 'Doc 1',
          dataAssinaturaAtesto: '2026-09-01',
          dataVencimentoFatura: '2026-09-20',
          valorAtesto: 10000
        })
      ).rejects.toMatchObject({ code: 'PAYMENT_CYCLE_ALREADY_EXISTS' });
    });
  });

  describe('updatePaymentCycleRpc', () => {
    it('rejeita quando cycleKey está vazio, sem chamar a RPC', async () => {
      await expect(updatePaymentCycleRpc({ cycleKey: '' })).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('chama update_payment_cycle_atomic com os campos operacionais informados', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, cycle: { id: 'x', cycle_key: 'C1-PGTO-202609-DOC1', status: 'ENVIADO_CGOFI' } },
        error: null
      });

      const result = await updatePaymentCycleRpc({
        cycleKey: 'C1-PGTO-202609-DOC1',
        status: 'ENVIADO_CGOFI',
        dataEnvioCgofi: '2026-09-15'
      });

      expect(mockRpc).toHaveBeenCalledWith('update_payment_cycle_atomic', expect.objectContaining({
        p_cycle_key: 'C1-PGTO-202609-DOC1',
        p_status: 'ENVIADO_CGOFI',
        p_data_envio_cgofi: '2026-09-15'
      }));
      expect(result.cycle.status).toBe('ENVIADO_CGOFI');
    });
  });

  describe('cancelPaymentCycleRpc — "exclusão" é sempre cancelamento, nunca DELETE físico', () => {
    it('chama update_payment_cycle_atomic com status CANCELADO', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, cycle: { id: 'x', status: 'CANCELADO' } },
        error: null
      });

      await cancelPaymentCycleRpc('C1-PGTO-202609-DOC1', 'Maria Souza');

      expect(mockRpc).toHaveBeenCalledWith('update_payment_cycle_atomic', expect.objectContaining({
        p_cycle_key: 'C1-PGTO-202609-DOC1',
        p_status: 'CANCELADO',
        p_concluido_por: 'Maria Souza'
      }));
    });
  });
});
