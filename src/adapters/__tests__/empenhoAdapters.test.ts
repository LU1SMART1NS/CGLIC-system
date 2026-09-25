import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../../services/api';
import { fetchAndNormalizeComprasGovEmpenhos } from '../comprasGovEmpenhoAdapter';
import { fetchAndNormalizeContratosGovEmpenhos } from '../contratosGovEmpenhoAdapter';
import { fetchAndNormalizePncpEmpenhos } from '../pncpEmpenhoAdapter';

describe('Empenho Adapters — Testes Unitários de Integração de Fontes (FASE 7.2-G)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. comprasGovEmpenhoAdapter', () => {
    it('deve consultar Compras.gov e retornar lista de NormalizedEmpenho filtrada por item', async () => {
      vi.spyOn(api, 'fetchEmpenhosSaldoItem').mockResolvedValue({
        resultado: [
          {
            numeroItem: '1',
            unidade: '200331',
            tipo: 'GERENCIADORA',
            quantidadeRegistrada: 500,
            quantidadeEmpenhada: 50,
            saldoEmpenho: 450,
            dataHoraInclusao: '2026-03-01T10:00:00',
            dataHoraAtualizacao: '2026-03-01T10:00:00',
            numeroEmpenho: '2026NE000142',
            quantidadeIncluida: 50,
            valorEmpenhado: 25000,
            fornecedorNome: 'FORNECEDOR X'
          },
          {
            numeroItem: '2',
            unidade: '200331',
            tipo: 'GERENCIADORA',
            quantidadeRegistrada: 300,
            quantidadeEmpenhada: 10,
            saldoEmpenho: 290,
            dataHoraInclusao: '2026-03-01T10:00:00',
            dataHoraAtualizacao: '2026-03-01T10:00:00',
            numeroEmpenho: '2026NE000143',
            quantidadeIncluida: 10,
            valorEmpenhado: 5000,
            fornecedorNome: 'FORNECEDOR Y'
          }
        ],
        totalRegistros: 2,
        totalPaginas: 1,
        paginasRestantes: 0
      });

      const result = await fetchAndNormalizeComprasGovEmpenhos({
        numeroAta: '00037/2026',
        uasg: '200331',
        numeroItem: '1'
      });

      expect(result).toHaveLength(1);
      expect(result[0].canonical_key).toBe('200331-2026-2026NE142');
      expect(result[0].item_links).toHaveLength(1);
      expect(result[0].item_links![0].item_key).toBe('00037/2026-200331-00001');
      expect(result[0].item_links![0].quantidade_consumida).toBe(50);
    });

    it('deve retornar array vazio se os parâmetros essenciais forem nulos', async () => {
      const result = await fetchAndNormalizeComprasGovEmpenhos({
        numeroAta: '',
        uasg: ''
      });
      expect(result).toEqual([]);
    });

    it('deve tratar falha na API (resiliência) retornando array vazio sem quebrar', async () => {
      vi.spyOn(api, 'fetchEmpenhosSaldoItem').mockRejectedValue(new Error('HTTP 500: Server Error'));

      const result = await fetchAndNormalizeComprasGovEmpenhos({
        numeroAta: '00037/2026',
        uasg: '200331'
      });
      expect(result).toEqual([]);
    });
  });

  describe('2. contratosGovEmpenhoAdapter', () => {
    it('deve consultar empenhos do contrato e enriquecer com itens da minuta', async () => {
      vi.spyOn(api, 'fetchContratosGovEmpenhos').mockResolvedValue([
        {
          id: 12345,
          numero: '2026NE000142',
          data_emissao: '2026-02-15',
          unidade_gestora: '200331',
          empenhado: '25.000,00',
          liquidado: '10.000,00',
          pago: '5.000,00',
          credor_obj: { nome: 'FORNECEDOR BETA' }
        }
      ]);

      vi.spyOn(api, 'fetchContratoEmpenhoDetalhe').mockResolvedValue({
        itens_minuta: [
          {
            numero_item_compra: '1',
            quantidade: 50,
            valor_unitario: 500,
            valor_total: 25000
          }
        ]
      });

      const result = await fetchAndNormalizeContratosGovEmpenhos({
        contratoId: 999,
        contractKey: '12/2026',
        targetItemNum: 1,
        itemContext: {
          numeroAta: '00037/2026',
          uasg: '200331',
          numeroItem: '1'
        }
      });

      expect(result).toHaveLength(1);
      expect(result[0].canonical_key).toBe('200331-2026-2026NE142');
      expect(result[0].valor_empenhado).toBe(25000);
      expect(result[0].contract_links).toHaveLength(1);
      expect(result[0].contract_links![0].contract_key).toBe('12/2026');
      expect(result[0].item_links).toHaveLength(1);
      expect(result[0].item_links![0].quantidade_consumida).toBe(50);
      expect(result[0].item_links![0].numero_item_minuta).toBe('1');
    });

    it('deve tratar falhas de rede com resiliência sem propagar exceção', async () => {
      vi.spyOn(api, 'fetchContratosGovEmpenhos').mockRejectedValue(new Error('HTTP 429: Rate limit'));

      const result = await fetchAndNormalizeContratosGovEmpenhos({
        contratoId: 999,
        contractKey: '12/2026'
      });
      expect(result).toEqual([]);
    });
  });

  describe('3. pncpEmpenhoAdapter', () => {
    it('deve consultar empenhos do contrato no PNCP e normalizar vínculo contratual', async () => {
      vi.spyOn(api, 'fetchPncpContractEmpenhos').mockResolvedValue([
        {
          numeroEmpenho: '2026NE000142',
          valorTotal: 25000,
          dataEmissaoEmpenho: '2026-02-15',
          sequencialEmpenho: 1
        }
      ]);

      const result = await fetchAndNormalizePncpEmpenhos({
        cnpj: '00394494000136',
        ano: 2026,
        sequencialContrato: 1,
        contractKey: '12/2026',
        uasg: '200331'
      });

      expect(result).toHaveLength(1);
      expect(result[0].canonical_key).toBe('200331-2026-2026NE142');
      expect(result[0].valor_empenhado).toBe(25000);
      expect(result[0].contract_links).toHaveLength(1);
      expect(result[0].contract_links![0].contract_key).toBe('12/2026');
    });

    it('deve tratar falhas de rede com resiliência', async () => {
      vi.spyOn(api, 'fetchPncpContractEmpenhos').mockRejectedValue(new Error('Timeout'));

      const result = await fetchAndNormalizePncpEmpenhos({
        cnpj: '00394494000136',
        ano: 2026,
        sequencialContrato: 1,
        contractKey: '12/2026'
      });
      expect(result).toEqual([]);
    });
  });
});
