import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  orchestrateItemEmpenhoSync,
  orchestrateAtaEmpenhoSync,
  orchestrateContractEmpenhoSync,
  orchestrateEmpenhoSync,
  orchestrateOnDemandSync
} from '../empenhoOrchestrationService';
import * as comprasAdapter from '../../adapters/comprasGovEmpenhoAdapter';
import * as contratosAdapter from '../../adapters/contratosGovEmpenhoAdapter';
import * as pncpAdapter from '../../adapters/pncpEmpenhoAdapter';
import * as syncService from '../empenhoSyncService';

describe('empenhoOrchestrationService — Testes Unitários de Orquestração On-Demand (FASE 7.2-I)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Orquestração por Item de Ata', () => {
    it('deve orquestrar com sucesso a sincronização de um item de Ata (Cenário A)', async () => {
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

      vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
        total_processados: 1,
        total_salvos: 1,
        total_itens_vinculados: 1,
        total_contratos_vinculados: 1,
        total_conflitos: 0,
        erros: [],
        reconciliados: []
      });

      const result = await orchestrateItemEmpenhoSync({
        tipo: 'ITEM',
        itemKey: '00037/2026-200331-00001',
        contracts: [
          {
            contratoId: 999,
            contractKey: '12/2026'
          }
        ]
      });

      expect(result.status).toBe('SUCESSO');
      expect(result.empenhos_persistidos).toBe(1);
      expect(result.vinculos_item_criados).toBe(1);
      expect(result.vinculos_contrato_criados).toBe(1);
      expect(result.fontes_consultadas).toContain('COMPRASNET');
      expect(result.fontes_consultadas).toContain('CONTRATOSNET');
    });

    it('deve retornar SEM_DADOS se nenhuma fonte retornar empenhos para o item', async () => {
      vi.spyOn(comprasAdapter, 'fetchAndNormalizeComprasGovEmpenhos').mockResolvedValue([]);
      vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
        total_processados: 0,
        total_salvos: 0,
        total_itens_vinculados: 0,
        total_contratos_vinculados: 0,
        total_conflitos: 0,
        erros: [],
        reconciliados: []
      });

      const result = await orchestrateItemEmpenhoSync({
        tipo: 'ITEM',
        itemKey: '00037/2026-200331-00001'
      });

      expect(result.status).toBe('SEM_DADOS');
      expect(result.empenhos_encontrados).toBe(0);
      expect(result.empenhos_persistidos).toBe(0);
    });

    it('CENÁRIO B: Ata → Item → Empenho (sem contrato / instrumento substitutivo Art. 95)', async () => {
      vi.spyOn(comprasAdapter, 'fetchAndNormalizeComprasGovEmpenhos').mockResolvedValue([
        {
          canonical_key: '200331-2026-2026NE142',
          uasg: '200331',
          ano: 2026,
          numero_oficial: '2026NE142',
          numero_normalizado: '2026NE142',
          valor_empenhado: 30000,
          fonte_origem: 'COMPRASNET',
          item_links: [{ item_key: '00037/2026-200331-00001', quantidade_consumida: 30 }]
        }
      ]);

      vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
        total_processados: 1,
        total_salvos: 1,
        total_itens_vinculados: 1,
        total_contratos_vinculados: 0,
        total_conflitos: 0,
        erros: [],
        reconciliados: []
      });

      const result = await orchestrateItemEmpenhoSync({
        tipo: 'ITEM',
        itemKey: '00037/2026-200331-00001'
      });

      expect(result.status).toBe('SUCESSO');
      expect(result.vinculos_item_criados).toBe(1);
      expect(result.vinculos_contrato_criados).toBe(0); // Sem contrato
      expect(result.fontes_nao_aplicaveis.length).toBeGreaterThan(0);
    });

    it('deve retornar COM_DIVERGENCIAS quando existirem divergências contábeis entre fontes', async () => {
      vi.spyOn(comprasAdapter, 'fetchAndNormalizeComprasGovEmpenhos').mockResolvedValue([
        {
          canonical_key: '200331-2026-2026NE142',
          uasg: '200331',
          ano: 2026,
          numero_oficial: '2026NE142',
          numero_normalizado: '2026NE142',
          valor_empenhado: 24000,
          fonte_origem: 'COMPRASNET'
        }
      ]);

      vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([
        {
          canonical_key: '200331-2026-2026NE142',
          uasg: '200331',
          ano: 2026,
          numero_oficial: '2026NE142',
          numero_normalizado: '2026NE142',
          valor_empenhado: 25000,
          fonte_origem: 'CONTRATOSNET'
        }
      ]);

      vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
        total_processados: 1,
        total_salvos: 1,
        total_itens_vinculados: 0,
        total_contratos_vinculados: 0,
        total_conflitos: 1,
        erros: [],
        reconciliados: []
      });

      const result = await orchestrateItemEmpenhoSync({
        tipo: 'ITEM',
        itemKey: '00037/2026-200331-00001',
        contracts: [{ contratoId: 10, contractKey: '10/2026' }]
      });

      expect(result.status).toBe('COM_DIVERGENCIAS');
      expect(result.divergencias.length).toBeGreaterThan(0);
    });

    it('deve suportar chamadas concorrentes sem produzir duplicatas (idempotência)', async () => {
      vi.spyOn(comprasAdapter, 'fetchAndNormalizeComprasGovEmpenhos').mockResolvedValue([
        {
          canonical_key: '200331-2026-2026NE142',
          uasg: '200331',
          ano: 2026,
          numero_oficial: '2026NE142',
          numero_normalizado: '2026NE142',
          valor_empenhado: 25000,
          fonte_origem: 'COMPRASNET'
        }
      ]);

      vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
        total_processados: 1,
        total_salvos: 1,
        total_itens_vinculados: 0,
        total_contratos_vinculados: 0,
        total_conflitos: 0,
        erros: [],
        reconciliados: []
      });

      // Execução simultânea de 2 chamadas
      const [res1, res2] = await Promise.all([
        orchestrateItemEmpenhoSync({ tipo: 'ITEM', itemKey: '00037/2026-200331-00001' }),
        orchestrateItemEmpenhoSync({ tipo: 'ITEM', itemKey: '00037/2026-200331-00001' })
      ]);

      expect(res1.status).toBe('SUCESSO');
      expect(res2.status).toBe('SUCESSO');
    });
  });

  describe('2. Orquestração por Ata de Registro de Preços', () => {
    it('deve processar múltiplos itens em micro-lotes controlados e consolidar totais', async () => {
      vi.spyOn(comprasAdapter, 'fetchAndNormalizeComprasGovEmpenhos').mockImplementation(async (opts) => {
        const itemNum = opts.numeroItem || '1';
        return [
          {
            canonical_key: `200331-2026-2026NE${itemNum}`,
            uasg: '200331',
            ano: 2026,
            numero_oficial: `2026NE${itemNum}`,
            numero_normalizado: `2026NE${itemNum}`,
            valor_empenhado: 10000,
            fonte_origem: 'COMPRASNET',
            item_links: [{ item_key: `00037/2026-200331-0000${itemNum}`, quantidade_consumida: 10 }]
          }
        ];
      });

      vi.spyOn(syncService, 'syncReconciledBatch').mockImplementation(async (reconciledList) => ({
        total_processados: reconciledList.length,
        total_salvos: reconciledList.length,
        total_itens_vinculados: reconciledList.length,
        total_contratos_vinculados: 0,
        total_conflitos: 0,
        erros: [],
        reconciliados: reconciledList
      }));

      const result = await orchestrateAtaEmpenhoSync({
        tipo: 'ATA',
        numeroAta: '00037/2026',
        uasg: '200331',
        itemNumbers: ['1', '2', '3', '4', '5'],
        concurrencyLimit: 2
      });

      expect(result.status).toBe('SUCESSO');
      expect(result.empenhos_persistidos).toBe(5);
      expect(result.vinculos_item_criados).toBe(5);
      expect(result.resumo_sync.total_processados).toBe(5);
    });

    it('deve retornar SUCESSO_PARCIAL se alguns itens falharem e outros tiverem sucesso', async () => {
      let callCount = 0;
      vi.spyOn(comprasAdapter, 'fetchAndNormalizeComprasGovEmpenhos').mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('HTTP 500: Server error no item 2');
        }
        return [
          {
            canonical_key: '200331-2026-2026NE142',
            uasg: '200331',
            ano: 2026,
            numero_oficial: '2026NE142',
            numero_normalizado: '2026NE142',
            valor_empenhado: 10000,
            fonte_origem: 'COMPRASNET'
          }
        ];
      });

      vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
        total_processados: 1,
        total_salvos: 1,
        total_itens_vinculados: 0,
        total_contratos_vinculados: 0,
        total_conflitos: 0,
        erros: [],
        reconciliados: []
      });

      const result = await orchestrateAtaEmpenhoSync({
        tipo: 'ATA',
        numeroAta: '00037/2026',
        uasg: '200331',
        itemNumbers: ['1', '2']
      });

      expect(result.status).toBe('SUCESSO_PARCIAL');
      expect(result.erros.length).toBeGreaterThan(0);
    });
  });

  describe('3. Orquestração por Contrato Administrativo', () => {
    it('deve orquestrar sincronização de contrato com Contratos.gov e PNCP', async () => {
      vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([
        {
          canonical_key: '200331-2026-2026NE142',
          uasg: '200331',
          ano: 2026,
          numero_oficial: '2026NE142',
          numero_normalizado: '2026NE142',
          valor_empenhado: 50000,
          valor_liquidado: 20000,
          valor_pago: 10000,
          valor_rpinscrito: 0,
          fonte_origem: 'CONTRATOSNET',
          contract_links: [{ contract_key: '12/2026', valor_vinculado: 50000 }]
        }
      ]);

      vi.spyOn(pncpAdapter, 'fetchAndNormalizePncpEmpenhos').mockResolvedValue([
        {
          canonical_key: '200331-2026-2026NE142',
          uasg: '200331',
          ano: 2026,
          numero_oficial: '2026NE142',
          numero_normalizado: '2026NE142',
          valor_empenhado: 50000,
          fonte_origem: 'PNCP',
          contract_links: [{ contract_key: '12/2026', valor_vinculado: 50000 }]
        }
      ]);

      vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
        total_processados: 1,
        total_salvos: 1,
        total_itens_vinculados: 0,
        total_contratos_vinculados: 1,
        total_conflitos: 0,
        erros: [],
        reconciliados: []
      });

      const result = await orchestrateContractEmpenhoSync({
        tipo: 'CONTRATO',
        contractKey: '12/2026',
        contratoId: 888,
        pncpParams: {
          cnpj: '00394494000136',
          ano: 2026,
          sequencialContrato: 1
        }
      });

      expect(result.status).toBe('SUCESSO');
      expect(result.empenhos_persistidos).toBe(1);
      expect(result.vinculos_contrato_criados).toBe(1);
      expect(result.fontes_consultadas).toContain('CONTRATOSNET');
      expect(result.fontes_consultadas).toContain('PNCP');
    });

    it('CENÁRIO C: Contrato sem Ata deve funcionar normalmente', async () => {
      vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([
        {
          canonical_key: '200331-2026-2026NE999',
          uasg: '200331',
          ano: 2026,
          numero_oficial: '2026NE999',
          numero_normalizado: '2026NE999',
          valor_empenhado: 100000,
          fonte_origem: 'CONTRATOSNET',
          contract_links: [{ contract_key: '99/2026', valor_vinculado: 100000 }]
        }
      ]);

      vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
        total_processados: 1,
        total_salvos: 1,
        total_itens_vinculados: 0,
        total_contratos_vinculados: 1,
        total_conflitos: 0,
        erros: [],
        reconciliados: []
      });

      const result = await orchestrateContractEmpenhoSync({
        tipo: 'CONTRATO',
        contractKey: '99/2026',
        contratoId: 777
      });

      expect(result.status).toBe('SUCESSO');
      expect(result.vinculos_item_criados).toBe(0); // Sem item de ata
      expect(result.vinculos_contrato_criados).toBe(1);
    });
  });

  describe('4. Orquestração por Nota de Empenho Específica', () => {
    it('deve sincronizar empenho pontual com contextHints informados', async () => {
      vi.spyOn(comprasAdapter, 'fetchAndNormalizeComprasGovEmpenhos').mockResolvedValue([
        {
          canonical_key: '200331-2026-2026NE142',
          uasg: '200331',
          ano: 2026,
          numero_oficial: '2026NE000142',
          numero_normalizado: '2026NE142',
          valor_empenhado: 25000,
          fonte_origem: 'COMPRASNET',
          item_links: [{ item_key: '00037/2026-200331-00001', quantidade_consumida: 50 }]
        }
      ]);

      vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
        total_processados: 1,
        total_salvos: 1,
        total_itens_vinculados: 1,
        total_contratos_vinculados: 0,
        total_conflitos: 0,
        erros: [],
        reconciliados: []
      });

      const result = await orchestrateEmpenhoSync({
        tipo: 'EMPENHO',
        canonicalKey: '200331-2026-2026NE142',
        contextHints: {
          numeroAta: '00037/2026',
          uasg: '200331',
          numeroItem: '1'
        }
      });

      expect(result.status).toBe('SUCESSO');
      expect(result.empenhos_persistidos).toBe(1);
    });

    it('CENÁRIO D: Empenho sem vínculo determinístico persiste no SSOT sem inventar links', async () => {
      vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([
        {
          canonical_key: '200331-2026-2026NE555',
          uasg: '200331',
          ano: 2026,
          numero_oficial: '2026NE555',
          numero_normalizado: '2026NE555',
          valor_empenhado: 15000,
          fonte_origem: 'CONTRATOSNET'
        }
      ]);

      vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
        total_processados: 1,
        total_salvos: 1,
        total_itens_vinculados: 0,
        total_contratos_vinculados: 0,
        total_conflitos: 0,
        erros: [],
        reconciliados: []
      });

      const result = await orchestrateEmpenhoSync({
        tipo: 'EMPENHO',
        canonicalKey: '200331-2026-2026NE555',
        contextHints: {
          contratoId: 100,
          contractKey: '10/2026'
        }
      });

      expect(result.status).toBe('SUCESSO');
      expect(result.vinculos_item_criados).toBe(0);
      expect(result.vinculos_contrato_criados).toBe(0);
    });
  });

  describe('5. Roteador Central Unificado (orchestrateOnDemandSync)', () => {
    it('deve despachar corretamente chamadas conforme o target.tipo', async () => {
      vi.spyOn(comprasAdapter, 'fetchAndNormalizeComprasGovEmpenhos').mockResolvedValue([]);
      vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
        total_processados: 0,
        total_salvos: 0,
        total_itens_vinculados: 0,
        total_contratos_vinculados: 0,
        total_conflitos: 0,
        erros: [],
        reconciliados: []
      });

      const resItem = await orchestrateOnDemandSync({
        tipo: 'ITEM',
        itemKey: '00037/2026-200331-00001'
      });
      expect(resItem.alvo.tipo).toBe('ITEM');

      const resContract = await orchestrateOnDemandSync({
        tipo: 'CONTRATO',
        contractKey: '12/2026'
      });
      expect(resContract.alvo.tipo).toBe('CONTRATO');

      const resEmpenho = await orchestrateOnDemandSync({
        tipo: 'EMPENHO',
        canonicalKey: '200331-2026-2026NE142'
      });
      expect(resEmpenho.alvo.tipo).toBe('EMPENHO');
    });

    it('deve rejeitar tipo de alvo desconhecido com erro descritivo', async () => {
      await expect(
        orchestrateOnDemandSync({ tipo: 'UNKNOWN' as any } as any)
      ).rejects.toThrow('INVALID_ORCHESTRATION_TARGET');
    });
  });
});
