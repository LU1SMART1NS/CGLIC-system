import { describe, it, expect } from 'vitest';
import {
  normalizeUasgEmitente,
  normalizeEmpenhoNumero,
  normalizeAnoExercicio,
  buildCanonicalEmpenhoKey,
  normalizeIsoDate,
  normalizeFromComprasGov,
  normalizeFromContratosGov,
  normalizeFromPncp
} from '../empenhoNormalizationService';
import type {
  EmpenhoSaldoItemRecord,
  ContratosGovEmpenhoRecord,
  PncpContractEmpenho
} from '../../types';

describe('empenhoNormalizationService — Testes Unitários Canônicos (FASE 7.2-G)', () => {
  describe('1. Normalização de UASG', () => {
    it('deve sanitizar e preencher zeros à esquerda para exatamente 6 dígitos', () => {
      expect(normalizeUasgEmitente('200331')).toBe('200331');
      expect(normalizeUasgEmitente('200 331')).toBe('200331');
      expect(normalizeUasgEmitente('331')).toBe('000331');
      expect(normalizeUasgEmitente(200330)).toBe('200330');
    });

    it('deve utilizar fallback padrão (200331) para valores nulos ou vazios', () => {
      expect(normalizeUasgEmitente(null)).toBe('200331');
      expect(normalizeUasgEmitente(undefined)).toBe('200331');
      expect(normalizeUasgEmitente('')).toBe('200331');
      expect(normalizeUasgEmitente('   ')).toBe('200331');
      expect(normalizeUasgEmitente(null, '200330')).toBe('200330');
    });
  });

  describe('2. Normalização de Número de Empenho', () => {
    it('deve normalizar formato padrão 2026NE000142 para 2026NE142', () => {
      expect(normalizeEmpenhoNumero('2026NE000142')).toBe('2026NE142');
      expect(normalizeEmpenhoNumero('2026ne000142')).toBe('2026NE142');
      expect(normalizeEmpenhoNumero('2025NE000001')).toBe('2025NE1');
      expect(normalizeEmpenhoNumero('2026NE000700')).toBe('2026NE700');
    });

    it('deve remover espaços e hífens em variações de NE', () => {
      expect(normalizeEmpenhoNumero('2026 NE 000142')).toBe('2026NE142');
      expect(normalizeEmpenhoNumero('2026-NE-000142')).toBe('2026NE142');
      expect(normalizeEmpenhoNumero('2026/NE/000142')).toBe('2026NE142');
    });

    it('deve normalizar formato apenas numérico removendo zeros à esquerda', () => {
      expect(normalizeEmpenhoNumero('000142')).toBe('142');
      expect(normalizeEmpenhoNumero('000001')).toBe('1');
      expect(normalizeEmpenhoNumero('142')).toBe('142');
    });

    it('deve retornar string vazia para valores nulos ou vazios', () => {
      expect(normalizeEmpenhoNumero(null)).toBe('');
      expect(normalizeEmpenhoNumero(undefined)).toBe('');
      expect(normalizeEmpenhoNumero('')).toBe('');
      expect(normalizeEmpenhoNumero('   ')).toBe('');
    });
  });

  describe('3. Normalização de Ano de Exercício', () => {
    it('deve extrair ano a partir do padrão NExx no número', () => {
      expect(normalizeAnoExercicio(null, null, '2026NE142')).toBe(2026);
      expect(normalizeAnoExercicio('2024', null, '2025NE001')).toBe(2025);
    });

    it('deve extrair ano a partir de anoRaw quando número não tem prefixo NE', () => {
      expect(normalizeAnoExercicio('2026', null, '142')).toBe(2026);
      expect(normalizeAnoExercicio(2025, null, '001')).toBe(2025);
    });

    it('deve extrair ano a partir de data de emissão quando anoRaw for nulo', () => {
      expect(normalizeAnoExercicio(null, '2026-03-15', '142')).toBe(2026);
    });

    it('deve retornar ano corrente como fallback quando nenhuma informação estiver disponível', () => {
      const currentYear = new Date().getFullYear();
      expect(normalizeAnoExercicio(null, null, null)).toBe(currentYear);
    });
  });

  describe('4. Construção da canonical_key', () => {
    it('deve gerar chave canônica no formato oficial {uasg}-{ano}-{numeroNormalizado}', () => {
      expect(buildCanonicalEmpenhoKey('200331', 2026, '2026NE000142')).toBe('200331-2026-2026NE142');
      expect(buildCanonicalEmpenhoKey('200330', '2025', '000005')).toBe('200330-2025-5');
      expect(buildCanonicalEmpenhoKey(null, null, '2026NE142')).toBe('200331-2026-2026NE142');
    });
  });

  describe('5. Normalização de Datas ISO', () => {
    it('deve normalizar formato ISO com timestamp', () => {
      expect(normalizeIsoDate('2026-03-15T14:30:00Z')).toBe('2026-03-15');
      expect(normalizeIsoDate('2026-03-15')).toBe('2026-03-15');
    });

    it('deve converter formato brasileiro DD/MM/YYYY', () => {
      expect(normalizeIsoDate('15/03/2026')).toBe('2026-03-15');
      expect(normalizeIsoDate('01/01/2025')).toBe('2025-01-01');
    });

    it('deve retornar undefined para valores inválidos ou vazios', () => {
      expect(normalizeIsoDate(null)).toBeUndefined();
      expect(normalizeIsoDate('')).toBeUndefined();
    });
  });

  describe('6. Normalização a partir de Compras.gov.br', () => {
    it('deve mapear corretamente registro com contexto de item de Ata', () => {
      const raw: EmpenhoSaldoItemRecord = {
        numeroItem: '1',
        unidade: '200331',
        tipo: 'GERENCIADORA',
        quantidadeRegistrada: 1000,
        quantidadeEmpenhada: 50,
        saldoEmpenho: 950,
        dataHoraInclusao: '2026-02-10T10:00:00',
        dataHoraAtualizacao: '2026-02-10T10:00:00',
        numeroEmpenho: '2026NE000142',
        dataEmpenho: '2026-02-10',
        quantidadeIncluida: 50,
        valorEmpenhado: 25000,
        fornecedorNome: 'FORNECEDOR ALFA LTDA',
        fornecedorCnpj: '12.345.678/0001-90'
      };

      const normalized = normalizeFromComprasGov(raw, {
        numeroAta: '00037/2026',
        uasg: '200331',
        numeroItem: '1'
      });

      expect(normalized.canonical_key).toBe('200331-2026-2026NE142');
      expect(normalized.uasg).toBe('200331');
      expect(normalized.ano).toBe(2026);
      expect(normalized.numero_normalizado).toBe('2026NE142');
      expect(normalized.data_emissao).toBe('2026-02-10');
      expect(normalized.valor_empenhado).toBe(25000);
      expect(normalized.credor_nome).toBe('FORNECEDOR ALFA LTDA');
      expect(normalized.credor_cnpj_cpf).toBe('12.345.678/0001-90');
      expect(normalized.fonte_origem).toBe('COMPRASNET');

      // Vínculo com item de Ata
      expect(normalized.item_links).toHaveLength(1);
      expect(normalized.item_links![0]).toEqual({
        item_key: '00037/2026-200331-00001',
        quantidade_consumida: 50,
        tipo_consumo: 'ORDINARIO'
      });
      expect(normalized.contract_links).toBeUndefined();
    });

    it('deve registrar vinculo_pendente quando não houver contexto de Ata', () => {
      const raw: EmpenhoSaldoItemRecord = {
        numeroItem: '1',
        unidade: '200331',
        tipo: 'GERENCIADORA',
        quantidadeRegistrada: 1000,
        quantidadeEmpenhada: 50,
        saldoEmpenho: 950,
        dataHoraInclusao: null,
        dataHoraAtualizacao: '2026-02-10T10:00:00',
        numeroEmpenho: '2026NE000142'
      };

      const normalized = normalizeFromComprasGov(raw);
      expect(normalized.item_links).toBeUndefined();
      expect(normalized.vinculos_pendentes).toHaveLength(1);
      expect(normalized.vinculos_pendentes![0].tipo).toBe('ITEM');
    });
  });

  describe('7. Normalização a partir de Contratos.gov.br', () => {
    it('deve mapear execução financeira e vínculo contratual determinístico', () => {
      const raw: ContratosGovEmpenhoRecord = {
        id: 998877,
        numero: '2026NE000142',
        data_emissao: '2026-02-10',
        unidade_gestora: '200331',
        empenhado: '25.000,00',
        liquidado: '10.000,00',
        pago: '5.000,00',
        rpinscrito: '0,00',
        credor_obj: {
          nome: 'FORNECEDOR ALFA LTDA',
          cnpj_cpf_idgener: '12345678000190'
        },
        itens_minuta: [
          {
            numero_item_compra: '1',
            quantidade: 50,
            valor_unitario: 500,
            valor_total: 25000
          }
        ]
      };

      const normalized = normalizeFromContratosGov(raw, {
        contractKey: '12/2026',
        targetItemNum: 1,
        itemContext: {
          numeroAta: '00037/2026',
          uasg: '200331',
          numeroItem: '1'
        }
      });

      expect(normalized.canonical_key).toBe('200331-2026-2026NE142');
      expect(normalized.valor_empenhado).toBe(25000);
      expect(normalized.valor_liquidado).toBe(10000);
      expect(normalized.valor_pago).toBe(5000);
      expect(normalized.valor_rpinscrito).toBe(0);
      expect(normalized.fonte_origem).toBe('CONTRATOSNET');
      expect(normalized.identificador_fonte).toBe('998877');

      // Vínculo Contratual
      expect(normalized.contract_links).toHaveLength(1);
      expect(normalized.contract_links![0]).toEqual({
        contract_key: '12/2026',
        valor_vinculado: 25000
      });

      // Vínculo com Item extraído da Minuta oficial
      expect(normalized.item_links).toHaveLength(1);
      expect(normalized.item_links![0]).toEqual({
        item_key: '00037/2026-200331-00001',
        quantidade_consumida: 50,
        tipo_consumo: 'ORDINARIO',
        numero_item_minuta: '1',
        is_deduzido: false
      });
    });

    it('deve aplicar regra contábil de Restos a Pagar (rpinscrito) quando empenhado = 0', () => {
      const raw: ContratosGovEmpenhoRecord = {
        id: 112233,
        numero: '2025NE000999',
        data_emissao: '2025-11-20',
        unidade_gestora: '200331',
        empenhado: '0,00',
        rpinscrito: '15.000,00',
        liquidado: '0,00',
        pago: '0,00'
      };

      const normalized = normalizeFromContratosGov(raw, { contractKey: '5/2025' });
      expect(normalized.canonical_key).toBe('200331-2025-2025NE999');
      expect(normalized.valor_empenhado).toBe(15000);
      expect(normalized.valor_rpinscrito).toBe(15000);
    });
  });

  describe('8. Normalização a partir de PNCP', () => {
    it('deve mapear identificação e vínculo de publicidade contratual', () => {
      const raw: PncpContractEmpenho = {
        numeroEmpenho: '2026NE000142',
        valorTotal: 25000,
        dataEmissaoEmpenho: '2026-02-10',
        sequencialEmpenho: 1
      };

      const normalized = normalizeFromPncp(raw, {
        contractKey: '12/2026',
        uasg: '200331',
        ano: 2026
      });

      expect(normalized.canonical_key).toBe('200331-2026-2026NE142');
      expect(normalized.valor_empenhado).toBe(25000);
      expect(normalized.data_emissao).toBe('2026-02-10');
      expect(normalized.fonte_origem).toBe('PNCP');
      expect(normalized.identificador_fonte).toBe('1');
      expect(normalized.contract_links).toHaveLength(1);
      expect(normalized.contract_links![0].contract_key).toBe('12/2026');
      expect(normalized.item_links).toBeUndefined();
    });
  });
});
