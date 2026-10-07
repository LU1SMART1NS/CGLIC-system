import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchPaymentCyclesForContract,
  createPaymentCycleRpc,
  registerPaymentMarcoRpc,
  addPaymentDocumentRpc,
  removePaymentDocumentRpc,
  updatePaymentCycleInfoRpc,
  deletePaymentCycleRpc
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
    const entrada = {
      contractKey: 'C1',
      dataAssinaturaAtesto: '2026-08-29',
      dataRecebimento: '2026-09-01',
      dataVencimentoFatura: '2026-09-20',
      numeroProcessoPagamentoSei: '08020.012345/2026-11',
      itens: [{ notaFiscal: '231', atestoSei: 'Doc 1', empenhoCanonicalKey: '200331-2026-2026NE412', valorBruto: 10000, glosa: 100 }]
    };

    it('chama create_payment_cycle_atomic com a data do atesto, o processo SEI e os itens "DO PAGAMENTO"', async () => {
      const mockResult = {
        success: true,
        cycle: { id: 'uuid-1', cycle_key: 'C1-PGTO-202608-DOC1', contract_key: 'C1', competencia: '2026-08', status: 'RECEBIDO', criado_em: 'x' }
      };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await createPaymentCycleRpc(entrada);

      expect(mockRpc).toHaveBeenCalledWith('create_payment_cycle_atomic', expect.objectContaining({
        p_contract_key: 'C1',
        p_data_assinatura_atesto: '2026-08-29',
        p_data_recebimento: '2026-09-01',
        p_numero_processo_pagamento_sei: '08020.012345/2026-11',
        p_itens: [expect.objectContaining({ nota_fiscal: '231', atesto_sei: 'Doc 1', empenho_canonical_key: '200331-2026-2026NE412', valor_bruto: 10000, glosa: 100, juros_multa: 0 })]
      }));
      expect(result.cycle.cycle_key).toBe('C1-PGTO-202608-DOC1');
    });

    it('mapeia erro PAYMENT_CYCLE_ALREADY_EXISTS (idempotência) sem criar duplicata', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'PAYMENT_CYCLE_ALREADY_EXISTS: Já existe um ciclo...', code: '23505' }
      });
      await expect(createPaymentCycleRpc(entrada)).rejects.toMatchObject({ code: 'PAYMENT_CYCLE_ALREADY_EXISTS' });
    });
  });

  describe('registerPaymentMarcoRpc', () => {
    it('rejeita quando cycleKey está vazio, sem chamar a RPC', () => {
      expect(() => registerPaymentMarcoRpc({ cycleKey: '', marco: 'CONFERIDO', data: '2026-09-02' })).toThrowError(
        expect.objectContaining({ code: 'INVALID_PAYLOAD' })
      );
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('registra o envio à CGOFI com o SEI do despacho e a data de cobrança', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, cycle: { id: 'x', cycle_key: 'C1-PGTO-202609-DOC1', status: 'ENVIADO_CGOFI' } },
        error: null
      });

      const result = await registerPaymentMarcoRpc({
        cycleKey: 'C1-PGTO-202609-DOC1',
        marco: 'ENVIADO_CGOFI',
        data: '2026-09-15',
        sei: '99887766',
        prazoNovo: '2026-09-22',
        prazoPadrao: '2026-09-22'
      });

      expect(mockRpc).toHaveBeenCalledWith('register_payment_cycle_marco_atomic', expect.objectContaining({
        p_cycle_key: 'C1-PGTO-202609-DOC1',
        p_marco: 'ENVIADO_CGOFI',
        p_data: '2026-09-15',
        p_sei: '99887766',
        p_prazo_novo: '2026-09-22',
        p_prazo_padrao: '2026-09-22'
      }));
      expect(result.cycle.status).toBe('ENVIADO_CGOFI');
    });

    it('na conferência envia o checklist do Anexo I', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, cycle: { id: 'x', cycle_key: 'C1', status: 'CONFERIDO' } },
        error: null
      });
      await registerPaymentMarcoRpc({ cycleKey: 'C1', marco: 'CONFERIDO', data: '2026-09-02', checklist: [{ item: 'SICAF', resposta: 'SIM', sei: '123' }] });
      expect(mockRpc).toHaveBeenCalledWith('register_payment_cycle_marco_atomic', expect.objectContaining({
        p_marco: 'CONFERIDO',
        p_checklist: [{ item: 'SICAF', resposta: 'SIM', sei: '123' }]
      }));
    });

    it('no envio à CGOFI manda as faturas e o envio à COLOG', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true, cycle: { id: 'x', cycle_key: 'C1', status: 'ENVIADO_CGOFI' } }, error: null });
      await registerPaymentMarcoRpc({ cycleKey: 'C1', marco: 'ENVIADO_CGOFI', data: '2026-09-02', sei: '1', faturas: [605039], enviarColog: true });
      expect(mockRpc).toHaveBeenCalledWith('register_payment_cycle_marco_atomic', expect.objectContaining({
        p_faturas: [605039],
        p_enviar_colog: true
      }));
    });

    it('mapeia a exigência de justificativa do servidor', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'PRAZO_JUSTIFICATIVA_REQUIRED: Prazo além do padrão exige justificativa.', code: '22023' }
      });
      await expect(
        registerPaymentMarcoRpc({ cycleKey: 'C1', marco: 'CONFERIDO', data: '2026-09-02', prazoNovo: '2026-09-30' })
      ).rejects.toMatchObject({ code: 'PRAZO_JUSTIFICATIVA_REQUIRED' });
    });
  });

  describe('documentos e dados do ciclo', () => {
    it('inclui um documento no ciclo', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true, document_id: 'd1' }, error: null });
      await addPaymentDocumentRpc({ cycleKey: 'C1', tipo: 'Nota Fiscal', sei: '555', numero: '1234', valor: 100 });
      expect(mockRpc).toHaveBeenCalledWith('add_payment_cycle_document_atomic', expect.objectContaining({
        p_cycle_key: 'C1', p_tipo: 'Nota Fiscal', p_sei: '555', p_numero: '1234', p_valor: 100
      }));
    });

    it('remove um documento pelo id', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });
      await removePaymentDocumentRpc('d1');
      expect(mockRpc).toHaveBeenCalledWith('remove_payment_cycle_document_atomic', { p_document_id: 'd1' });
    });

    it('atualiza só responsável e observações (a situação não se edita à mão)', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true, cycle_key: 'C1' }, error: null });
      await updatePaymentCycleInfoRpc({ cycleKey: 'C1', responsavelNome: 'Maria' });
      expect(mockRpc).toHaveBeenCalledWith('update_payment_cycle_info_atomic', {
        p_cycle_key: 'C1', p_responsavel_nome: 'Maria', p_responsavel_user_id: null, p_observacoes: null
      });
    });
  });

  describe('deletePaymentCycleRpc', () => {
    it('rejeita chave vazia sem chamar a RPC', () => {
      expect(() => deletePaymentCycleRpc('')).toThrowError(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('chama delete_payment_cycle_atomic com a chave do ciclo', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true, cycle_key: 'C1', planos_removidos: 1 }, error: null });
      const result = await deletePaymentCycleRpc('C1');
      expect(mockRpc).toHaveBeenCalledWith('delete_payment_cycle_atomic', { p_cycle_key: 'C1' });
      expect(result.planos_removidos).toBe(1);
    });

    it('propaga a negativa do servidor quando o perfil não é admin', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'UNAUTHORIZED: restrita a administradores', code: '42501' } });
      await expect(deletePaymentCycleRpc('C1')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });
});
