import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePncpIdentifiers, fetchPncpContracts } from '../api';

describe('Resolução Universal de Identificadores e Contratos de Atas', () => {
  describe('parsePncpIdentifiers', () => {
    it('deve extrair identificadores a partir de linkAtaPNCP com formato padrão', () => {
      const arp = {
        linkAtaPNCP: 'https://pncp.gov.br/app/atas/00394494000136/2024/001436/1',
        numeroAtaRegistroPreco: '00019/2025',
        codigoUnidadeGerenciadora: '200331'
      };

      const res = parsePncpIdentifiers(arp);
      expect(res).toEqual({
        cnpj: '00394494000136',
        ano: '2024',
        sequencial: '1436',
        sequencialAta: '1',
        numeroAta: '00019',
        anoAta: '2025'
      });
    });

    it('deve extrair identificadores a partir de numeroControlePncpAta', () => {
      const arp = {
        numeroControlePncpAta: '00394494000136-1-001436/2024-000001',
        numeroAtaRegistroPreco: '19/2025',
        codigoUnidadeGerenciadora: '200331'
      };

      const res = parsePncpIdentifiers(arp);
      expect(res).toEqual({
        cnpj: '00394494000136',
        ano: '2024',
        sequencial: '1436',
        sequencialAta: '1',
        numeroAta: '19',
        anoAta: '2025'
      });
    });

    it('deve extrair identificadores a partir de linkCompraPNCP e fallback', () => {
      const arp = {
        linkCompraPNCP: 'https://pncp.gov.br/app/editais/00394494000136/2024/001436',
        numeroAtaRegistroPreco: '00020/2025',
        codigoUnidadeGerenciadora: '200331'
      };

      const res = parsePncpIdentifiers(arp);
      expect(res?.cnpj).toBe('00394494000136');
      expect(res?.ano).toBe('2024');
      expect(res?.sequencial).toBe('1436');
      expect(res?.numeroAta).toBe('00020');
      expect(res?.anoAta).toBe('2025');
    });

    it('deve extrair identificadores a partir de numeroControlePncpCompra', () => {
      const arp = {
        numeroControlePncpCompra: '00394494000136-1-001436/2024',
        numeroAtaRegistroPreco: '35/2025',
        codigoUnidadeGerenciadora: '200331'
      };

      const res = parsePncpIdentifiers(arp);
      expect(res?.cnpj).toBe('00394494000136');
      expect(res?.ano).toBe('2024');
      expect(res?.sequencial).toBe('1436');
    });
  });

  describe('fetchPncpContracts - Mapeamento e Isolamento', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('deve desduplicar contratos e atribuir tipoUnidade corretamente', async () => {
      // Mock global fetch para simular retorno de PNCP
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/atas/1/contratos') || url.includes('/compras/2024/1436/atas')) {
          if (url.includes('/atas') && !url.includes('/contratos')) {
            return {
              ok: true,
              json: async () => ({
                data: [
                  {
                    sequencialAta: 1,
                    numeroAtaRegistroPreco: '00019/2025',
                    anoAta: 2025,
                    niFornecedor: '02797247000196'
                  }
                ]
              })
            };
          }
          return {
            ok: true,
            json: async () => ({
              data: [
                {
                  numeroContratoEmpenho: '00162',
                  anoContrato: 2026,
                  numeroControlePNCP: '00394494000136-2-001025/2026',
                  valorGlobal: 1146469.92,
                  unidadeExecutora: {
                    codigo: '200331',
                    nomeUnidade: 'SENASP'
                  },
                  orgaoEntidade: {
                    cnpj: '00394494000136',
                    razaoSocial: 'MINISTERIO DA JUSTICA'
                  },
                  niFornecedor: '02797247000196',
                  nomeRazaoSocialFornecedor: 'BEM ESTAR HOSPITALAR'
                },
                {
                  numeroContratoEmpenho: '00010',
                  anoContrato: 2026,
                  numeroControlePNCP: '090014-2-000010/2026',
                  valorGlobal: 300000,
                  unidadeExecutora: {
                    codigo: '090014',
                    nomeUnidade: 'JUSTICA FEDERAL - ES'
                  },
                  orgaoEntidade: {
                    cnpj: '00394494000136',
                    razaoSocial: 'JUSTICA FEDERAL'
                  },
                  niFornecedor: '02797247000196',
                  nomeRazaoSocialFornecedor: 'BEM ESTAR HOSPITALAR'
                }
              ]
            })
          };
        }

        if (url.includes('/compras/2024/1436/contratos')) {
          return {
            ok: true,
            json: async () => []
          };
        }

        if (url.includes('/api/contrato/ugorigem') || url.includes('/api/contrato/ug/')) {
          return {
            ok: true,
            json: async () => []
          };
        }

        return {
          ok: false,
          json: async () => ({})
        };
      });

      const contracts = await fetchPncpContracts(
        '00394494000136',
        '2024',
        '1436',
        '1',
        undefined,
        { codigoUnidadeGestora: '200331' },
        { niFornecedor: '02797247000196', nomeFornecedor: 'BEM ESTAR HOSPITALAR' },
        '00019/2025'
      );

      expect(contracts.length).toBe(2);

      const gerenciadorContract = contracts.find(c => c.numeroContrato === '00162');
      expect(gerenciadorContract).toBeDefined();
      expect(gerenciadorContract?.tipoUnidade).toBe('GERENCIADORA');
      expect(gerenciadorContract?.uasg).toBe('200331');

      const participanteContract = contracts.find(c => c.numeroContrato === '00010');
      expect(participanteContract).toBeDefined();
      expect(participanteContract?.tipoUnidade).toBe('PARTICIPANTE');
      expect(participanteContract?.uasg).toBe('090014');
      expect(participanteContract?.unidadeNome).toBe('JUSTICA FEDERAL - ES');
    });

    it('deve filtrar estritamente contratos de outros fornecedores da mesma compra', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/atas/1/contratos') || url.includes('/atas')) {
          return {
            ok: true,
            json: async () => ({
              data: [
                {
                  numeroContratoEmpenho: '00162',
                  anoContrato: 2026,
                  niFornecedor: '02797247000196',
                  nomeRazaoSocialFornecedor: 'BEM ESTAR HOSPITALAR'
                },
                {
                  numeroContratoEmpenho: '00163',
                  anoContrato: 2026,
                  niFornecedor: '59275792000150', // GM do Brasil (outro fornecedor)
                  nomeRazaoSocialFornecedor: 'GENERAL MOTORS'
                }
              ]
            })
          };
        }
        return {
          ok: false,
          json: async () => ({})
        };
      });

      const contracts = await fetchPncpContracts(
        '00394494000136',
        '2024',
        '1436',
        '1',
        undefined,
        { codigoUnidadeGestora: '200331' },
        { niFornecedor: '02797247000196', nomeFornecedor: 'BEM ESTAR' },
        '00019/2025'
      );

      expect(contracts.length).toBe(1);
      expect(contracts[0].numeroContrato).toBe('00162');
      expect(contracts[0].niFornecedor).toBe('02797247000196');
    });
  });
});
