import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as supabaseClientModule from '../supabaseClient';
import {
  persistReconciledEmpenhoM17,
  syncReconciledBatch,
  syncEmpenhosForItem
} from '../empenhoSyncService';
import * as comprasAdapter from '../../adapters/comprasGovEmpenhoAdapter';
import * as contratosAdapter from '../../adapters/contratosGovEmpenhoAdapter';
import * as pncpAdapter from '../../adapters/pncpEmpenhoAdapter';
import type { EmpenhoReconciliado } from '../../types/empenhoSync';

describe('empenhoSyncService — Testes Unitários de Persistência M17 e Orquestração (FASE 7.2-G)', () => {
  let mockRpc: any;
  let mockFrom: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockRpc = vi.fn();
    mockFrom = vi.fn();

    // Mock do Supabase Client para garantir que NUNCA haja acesso direto a tabelas (from), apenas RPCs (M17)
    const mockSupabase = {
      rpc: mockRpc,
      from: mockFrom
    };

    vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase as any);
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
  });

  describe('1. Persistência Soberana Exclusiva via RPCs M17 (Inviolabilidade Arquitetural)', () => {
    it('deve chamar save_empenho_soberano_atomic, link_empenho_to_item_atomic e link_empenho_to_contract_atomic', async () => {
      const empenhoUuid = '11111111-2222-3333-4444-555555555555';

      mockRpc.mockImplementation((rpcName: string, params: any) => {
        if (rpcName === 'save_empenho_soberano_atomic') {
          return Promise.resolve({
            data: {
              success: true,
              is_new: true,
              empenho: { id: empenhoUuid, canonical_key: params.p_empenho.uasg_emitente + '-' + params.p_empenho.ano_exercicio + '-' + params.p_empenho.numero_normalizado }
            },
            error: null
          });
        }
        if (rpcName === 'link_empenho_to_item_atomic') {
          return Promise.resolve({ data: { success: true, link_id: 'link-1' }, error: null });
        }
        if (rpcName === 'link_empenho_to_contract_atomic') {
          return Promise.resolve({ data: { success: true, link_id: 'link-ctr-1' }, error: null });
        }
        return Promise.reject(new Error(`RPC desconhecida: ${rpcName}`));
      });

      const reconciled: EmpenhoReconciliado = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE000142',
        numero_normalizado: '2026NE142',
        data_emissao: '2026-02-10',
        valor_empenhado: 25000,
        valor_liquidado: 10000,
        valor_pago: 5000,
        valor_rpinscrito: 0,
        credor_nome: 'FORNECEDOR BETA LTDA',
        credor_cnpj_cpf: '12345678000190',
        fonte_origem: 'SINCRONIZADO',
        status_reconciliacao: 'CONFIRMADO',
        fontes_consultadas: ['COMPRASNET', 'CONTRATOSNET'],
        conflitos: [],
        item_links: [
          {
            item_key: '00037/2026-200331-00001',
            quantidade_consumida: 50,
            tipo_consumo: 'ORDINARIO'
          }
        ],
        contract_links: [
          {
            contract_key: '12/2026',
            valor_vinculado: 25000
          }
        ],
        vinculos_pendentes: []
      };

      const result = await persistReconciledEmpenhoM17(reconciled);

      expect(result.success).toBe(true);
      expect(result.empenho_id).toBe(empenhoUuid);
      expect(result.items_linked).toBe(1);
      expect(result.contracts_linked).toBe(1);

      // Verificação das chamadas RPC M17
      expect(mockRpc).toHaveBeenCalledTimes(3);
      expect(mockRpc).toHaveBeenCalledWith('save_empenho_soberano_atomic', expect.objectContaining({
        p_empenho: expect.objectContaining({
          uasg_emitente: '200331',
          ano_exercicio: 2026,
          numero_normalizado: '2026NE142',
          data_emissao: '2026-02-10',
          valor_empenhado: 25000
        })
      }));
      expect(mockRpc).toHaveBeenCalledWith('link_empenho_to_item_atomic', {
        p_item_key: '00037/2026-200331-00001',
        p_empenho_id: empenhoUuid,
        p_quantidade_consumida: 50,
        p_tipo_consumo: 'ORDINARIO',
        p_numero_item_minuta: null,
        p_observacoes: null
      });
      expect(mockRpc).toHaveBeenCalledWith('link_empenho_to_contract_atomic', {
        p_contract_key: '12/2026',
        p_empenho_id: empenhoUuid,
        p_valor_vinculado: 25000
      });

      // INVARIANTE: Zero chamadas a supabase.from (DML direto proibido)
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('2. Orquestração Completa e Idempotência', () => {
    it('deve sincronizar item de Ata consultando adapters, reconciliando e persistindo', async () => {
      const empenhoUuid = '22222222-3333-4444-5555-666666666666';

      mockRpc.mockImplementation((rpcName: string) => {
        if (rpcName === 'save_empenho_soberano_atomic') {
          return Promise.resolve({
            data: { success: true, is_new: true, empenho: { id: empenhoUuid } },
            error: null
          });
        }
        return Promise.resolve({ data: { success: true }, error: null });
      });

      vi.spyOn(comprasAdapter, 'fetchAndNormalizeComprasGovEmpenhos').mockResolvedValue([
        {
          canonical_key: '200331-2026-2026NE142',
          uasg: '200331',
          ano: 2026,
          numero_oficial: '2026NE000142',
          numero_normalizado: '2026NE142',
          data_emissao: '2026-02-10',
          valor_empenhado: 25000,
          fonte_origem: 'COMPRASNET',
          item_links: [{ item_key: '00037/2026-200331-00001', quantidade_consumida: 50 }]
        }
      ]);

      vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([
        {
          canonical_key: '200331-2026-2026NE142',
          uasg: '200331',
          ano: 2026,
          numero_oficial: '2026NE000142',
          numero_normalizado: '2026NE142',
          valor_empenhado: 25000,
          valor_liquidado: 10000,
          valor_pago: 5000,
          valor_rpinscrito: 0,
          fonte_origem: 'CONTRATOSNET',
          contract_links: [{ contract_key: '12/2026', valor_vinculado: 25000 }]
        }
      ]);

      vi.spyOn(pncpAdapter, 'fetchAndNormalizePncpEmpenhos').mockResolvedValue([]);

      const summary = await syncEmpenhosForItem({
        numeroAta: '00037/2026',
        uasg: '200331',
        numeroItem: '1',
        contracts: [
          {
            contratoId: 999,
            contractKey: '12/2026',
            cnpj: '00394494000136',
            ano: 2026,
            sequencialContrato: 1
          }
        ]
      });

      expect(summary.total_processados).toBe(1);
      expect(summary.total_salvos).toBe(1);
      expect(summary.total_itens_vinculados).toBe(1);
      expect(summary.total_contratos_vinculados).toBe(1);
      expect(summary.erros).toHaveLength(0);
    });

    it('deve ser resiliente e reportar erro estruturado se a RPC M17 falhar', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'DATABASE_TIMEOUT', code: '57014' }
      });

      const summary = await syncReconciledBatch([
        {
          canonical_key: '200331-2026-2026NE142',
          uasg: '200331',
          ano: 2026,
          numero_oficial: '2026NE142',
          numero_normalizado: '2026NE142',
          data_emissao: '2026-02-10',
          valor_empenhado: 25000,
          valor_liquidado: 0,
          valor_pago: 0,
          valor_rpinscrito: 0,
          fonte_origem: 'SINCRONIZADO',
          status_reconciliacao: 'CONFIRMADO',
          fontes_consultadas: ['COMPRASNET'],
          conflitos: [],
          item_links: [],
          contract_links: [],
          vinculos_pendentes: []
        }
      ]);

      expect(summary.total_salvos).toBe(0);
      expect(summary.erros).toHaveLength(1);
      expect(summary.erros[0].canonical_key).toBe('200331-2026-2026NE142');
    });
  });
});
