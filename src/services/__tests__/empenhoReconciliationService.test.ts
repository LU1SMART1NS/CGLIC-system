import { describe, it, expect } from 'vitest';
import { reconcileNormalizedEmpenhos } from '../empenhoReconciliationService';
import type { NormalizedEmpenho } from '../../types/empenhoSync';

describe('empenhoReconciliationService — Testes Unitários de Reconciliação (FASE 7.2-G)', () => {
  describe('1. Matriz de Precedência por Campo', () => {
    it('deve priorizar Compras.gov para quantidade física e Contratos.gov para dados financeiros', () => {
      const comprasGov: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE000142',
        numero_normalizado: '2026NE142',
        data_emissao: '2026-02-10',
        valor_empenhado: 24000,
        credor_nome: 'FORNECEDOR COMPRAS',
        fonte_origem: 'COMPRASNET',
        item_links: [
          {
            item_key: '00037/2026-200331-00001',
            quantidade_consumida: 50,
            tipo_consumo: 'ORDINARIO'
          }
        ]
      };

      const contratosGov: NormalizedEmpenho = {
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
        credor_nome: 'FORNECEDOR OFICIAL SIAFI LTDA',
        credor_cnpj_cpf: '12345678000190',
        fonte_origem: 'CONTRATOSNET',
        contract_links: [
          {
            contract_key: '12/2026',
            valor_vinculado: 25000
          }
        ],
        item_links: [
          {
            item_key: '00037/2026-200331-00001',
            quantidade_consumida: 50,
            tipo_consumo: 'ORDINARIO'
          }
        ]
      };

      const pncp: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE000142',
        numero_normalizado: '2026NE142',
        data_emissao: '2026-02-10',
        valor_empenhado: 25000,
        fonte_origem: 'PNCP',
        contract_links: [
          {
            contract_key: '12/2026',
            valor_vinculado: 25000
          }
        ]
      };

      const result = reconcileNormalizedEmpenhos([comprasGov, contratosGov, pncp]);

      expect(result).toHaveLength(1);
      const reconciled = result[0];

      // Identidade e Precedência
      expect(reconciled.canonical_key).toBe('200331-2026-2026NE142');
      expect(reconciled.valor_empenhado).toBe(25000); // Prevaleceu Contratos.gov
      expect(reconciled.valor_liquidado).toBe(10000); // Exclusivo Contratos.gov
      expect(reconciled.valor_pago).toBe(5000); // Exclusivo Contratos.gov
      expect(reconciled.credor_nome).toBe('FORNECEDOR OFICIAL SIAFI LTDA'); // Prevaleceu Contratos.gov
      expect(reconciled.credor_cnpj_cpf).toBe('12345678000190');
      expect(reconciled.fonte_origem).toBe('SINCRONIZADO');

      // Vínculo Quantitativo do Item
      expect(reconciled.item_links).toHaveLength(1);
      expect(reconciled.item_links[0].item_key).toBe('00037/2026-200331-00001');
      expect(reconciled.item_links[0].quantidade_consumida).toBe(50);

      // Vínculo Financeiro do Contrato
      expect(reconciled.contract_links).toHaveLength(1);
      expect(reconciled.contract_links[0].contract_key).toBe('12/2026');
      expect(reconciled.contract_links[0].valor_vinculado).toBe(25000);

      // Fontes consultadas registradas
      expect(reconciled.fontes_consultadas).toContain('COMPRASNET');
      expect(reconciled.fontes_consultadas).toContain('CONTRATOSNET');
      expect(reconciled.fontes_consultadas).toContain('PNCP');
    });
  });

  describe('2. Detecção e Registro de Divergências', () => {
    it('deve registrar divergência financeira quando valor_empenhado diferir entre fontes', () => {
      const rec1: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        valor_empenhado: 50000,
        fonte_origem: 'CONTRATOSNET'
      };

      const rec2: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        valor_empenhado: 50100,
        fonte_origem: 'PNCP'
      };

      const result = reconcileNormalizedEmpenhos([rec1, rec2]);
      expect(result).toHaveLength(1);
      const conf = result[0].conflitos.find(c => c.campo === 'valor_empenhado');
      expect(conf).toBeDefined();
      expect(conf?.tipo).toBe('VALOR');
      expect(conf?.valor_primario).toBe(50000);
      expect(conf?.valor_secundario).toBe(50100);
    });

    it('deve registrar divergência de datas quando diferirem entre fontes', () => {
      const rec1: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        data_emissao: '2026-02-10',
        fonte_origem: 'CONTRATOSNET'
      };

      const rec2: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        data_emissao: '2026-02-15',
        fonte_origem: 'COMPRASNET'
      };

      const result = reconcileNormalizedEmpenhos([rec1, rec2]);
      expect(result).toHaveLength(1);
      const conf = result[0].conflitos.find(c => c.campo === 'data_emissao');
      expect(conf).toBeDefined();
      expect(conf?.tipo).toBe('DATA');
      expect(result[0].data_emissao).toBe('2026-02-10'); // Prevaleceu Contratos.gov
    });

    it('deve registrar divergência de credor e marcar status DIVERGENTE quando CNPJs conflitarem', () => {
      const rec1: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        credor_cnpj_cpf: '11111111000111',
        fonte_origem: 'CONTRATOSNET'
      };

      const rec2: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        credor_cnpj_cpf: '22222222000122',
        fonte_origem: 'COMPRASNET'
      };

      const result = reconcileNormalizedEmpenhos([rec1, rec2]);
      expect(result).toHaveLength(1);
      expect(result[0].status_reconciliacao).toBe('DIVERGENTE');
      const conf = result[0].conflitos.find(c => c.campo === 'credor_cnpj_cpf');
      expect(conf).toBeDefined();
      expect(conf?.resolvido_automaticamente).toBe(false);
    });
  });

  describe('3. Promoção MANUAL → SINCRONIZADO', () => {
    it('deve promover empenho manual para SINCRONIZADO quando fonte oficial confirmar canonical_key', () => {
      const manual: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        valor_empenhado: 20000,
        fonte_origem: 'MANUAL',
        item_links: [
          {
            item_key: '00037/2026-200331-00001',
            quantidade_consumida: 40
          }
        ]
      };

      const oficial: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE000142',
        numero_normalizado: '2026NE142',
        valor_empenhado: 25000,
        fonte_origem: 'COMPRASNET',
        item_links: [
          {
            item_key: '00037/2026-200331-00001',
            quantidade_consumida: 50
          }
        ]
      };

      const result = reconcileNormalizedEmpenhos([manual, oficial]);
      expect(result).toHaveLength(1);
      expect(result[0].fonte_origem).toBe('SINCRONIZADO');
      expect(result[0].valor_empenhado).toBe(25000); // Oficial prevaleceu
      expect(result[0].item_links[0].quantidade_consumida).toBe(50); // Oficial prevaleceu
    });

    it('deve manter origem MANUAL se nenhuma fonte oficial retornar o empenho', () => {
      const manual: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE999',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE999',
        numero_normalizado: '2026NE999',
        valor_empenhado: 10000,
        fonte_origem: 'MANUAL'
      };

      const result = reconcileNormalizedEmpenhos([manual]);
      expect(result).toHaveLength(1);
      expect(result[0].fonte_origem).toBe('MANUAL');
    });
  });

  describe('4. Cenários Obrigatórios A / B / C / D', () => {
    it('CENÁRIO A: Ata → Item → Contrato → Empenho', () => {
      const recItem: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        fonte_origem: 'COMPRASNET',
        item_links: [{ item_key: '00037/2026-200331-00001', quantidade_consumida: 50 }]
      };
      const recContract: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        fonte_origem: 'CONTRATOSNET',
        contract_links: [{ contract_key: '12/2026', valor_vinculado: 25000 }]
      };

      const result = reconcileNormalizedEmpenhos([recItem, recContract]);
      expect(result[0].item_links).toHaveLength(1);
      expect(result[0].contract_links).toHaveLength(1);
    });

    it('CENÁRIO B: Ata → Item → Empenho (sem contrato / instrumento substitutivo Art. 95)', () => {
      const recItem: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        fonte_origem: 'COMPRASNET',
        item_links: [{ item_key: '00037/2026-200331-00001', quantidade_consumida: 30 }]
      };

      const result = reconcileNormalizedEmpenhos([recItem]);
      expect(result[0].item_links).toHaveLength(1);
      expect(result[0].contract_links).toHaveLength(0); // Sem contrato vinculado
    });

    it('CENÁRIO C: Contrato sem Ata → Empenho', () => {
      const recContract: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        fonte_origem: 'CONTRATOSNET',
        contract_links: [{ contract_key: '99/2026', valor_vinculado: 100000 }]
      };

      const result = reconcileNormalizedEmpenhos([recContract]);
      expect(result[0].item_links).toHaveLength(0); // Sem item de ata
      expect(result[0].contract_links).toHaveLength(1);
    });

    it('CENÁRIO D: Empenho sem vínculo determinístico identificado', () => {
      const recSemVinculo: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        fonte_origem: 'CONTRATOSNET',
        vinculos_pendentes: [
          { tipo: 'ITEM', motivo: 'Item não identificado' },
          { tipo: 'CONTRATO', motivo: 'Contrato não informado' }
        ]
      };

      const result = reconcileNormalizedEmpenhos([recSemVinculo]);
      expect(result[0].canonical_key).toBe('200331-2026-2026NE142');
      expect(result[0].item_links).toHaveLength(0);
      expect(result[0].contract_links).toHaveLength(0);
      expect(result[0].vinculos_pendentes).toHaveLength(2);
    });
  });

  describe('5. Idempotência e Concorrência Determinística', () => {
    it('deve produzir o mesmo resultado consolidado independentemente da ordem das leituras', () => {
      const recA: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        valor_empenhado: 25000,
        fonte_origem: 'CONTRATOSNET'
      };
      const recB: NormalizedEmpenho = {
        canonical_key: '200331-2026-2026NE142',
        uasg: '200331',
        ano: 2026,
        numero_oficial: '2026NE142',
        numero_normalizado: '2026NE142',
        valor_empenhado: 25000,
        fonte_origem: 'COMPRASNET'
      };

      const res1 = reconcileNormalizedEmpenhos([recA, recB]);
      const res2 = reconcileNormalizedEmpenhos([recB, recA]);

      expect(res1[0].canonical_key).toBe(res2[0].canonical_key);
      expect(res1[0].valor_empenhado).toBe(res2[0].valor_empenhado);
      expect(res1[0].fonte_origem).toBe(res2[0].fonte_origem);
    });
  });
});
