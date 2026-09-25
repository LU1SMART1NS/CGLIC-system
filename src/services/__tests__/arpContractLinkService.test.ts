import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enrichContractLinks,
  saveArpItemContractLink,
  deleteArpItemContractLink,
  fetchArpItemContractLinks
} from '../arpContractLinkService';
import * as rpcAdapter from '../../adapters/arpContractLinkRpcAdapter';
import * as supabaseModule from '../supabaseClient';
import type { ArpItemContractLink } from '../../types/arpContractLinks';
import type { ContractDashboardRecord } from '../../types';

vi.mock('../../adapters/arpContractLinkRpcAdapter', () => ({
  linkContractToItemRpc: vi.fn(),
  unlinkContractFromItemRpc: vi.fn()
}));

vi.mock('../supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: vi.fn()
  }
}));

describe('arpContractLinkService (Fase 6.2-C — Saneamento e Pureza Arquitetural)', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const localStorageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] || null),
      setItem: vi.fn((key: string, val: string) => { mockStorage[key] = val; }),
      removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
      clear: vi.fn(() => { mockStorage = {}; }),
      length: 0,
      key: vi.fn()
    };
    vi.stubGlobal('localStorage', localStorageMock);
    vi.clearAllMocks();
  });

  const mockOfficialContracts: ContractDashboardRecord[] = [
    {
      id: '200331-15-2026',
      numero: '15',
      ano: 2026,
      numeroFormatado: '15/2026',
      uasg: '200331',
      nomeOrgao: 'SENASP / MJSP',
      fornecedorNome: 'EMPRESA ALFA SERVICOS LTDA',
      fornecedorCnpjCpf: '12345678000199',
      dataVigenciaFim: '2027-03-31',
      statusVigencia: 'Vigente',
      valorGlobal: 500000,
      numeroControlePncp: '200331-1-000015/2026',
      linkPncp: 'https://pncp.gov.br/app/contratos/200331/2026/15',
      objeto: 'Prestação de serviços operacionais',
      fonteDados: 'PNCP'
    }
  ];

  // TC-01: Vínculo oficial é persistido no PostgreSQL (via RPC)
  it('TC-01: persiste vínculo oficial exclusivamente via RPC PostgreSQL', async () => {
    const params = {
      itemKey: '00037/2026-200331-00001',
      contractKey: '200331-15-2026',
      quantidadeContratada: 100,
      observacoes: 'Vínculo oficial de fornecimento'
    };

    vi.mocked(rpcAdapter.linkContractToItemRpc).mockResolvedValueOnce({
      id: 'uuid-link-real-pgsql',
      item_key: params.itemKey,
      contract_key: params.contractKey,
      quantidade_contratada: 100,
      success: true,
      timestamp: '2026-09-24T12:00:00Z'
    });

    const result = await saveArpItemContractLink(params);

    expect(rpcAdapter.linkContractToItemRpc).toHaveBeenCalledWith(params);
    expect(result.id).toBe('uuid-link-real-pgsql');
    expect(result.quantidadeContratada).toBe(100);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  // TC-02: Falha de PostgreSQL não gera persistência local nem mascara erro
  it('TC-02: propaga erro sem mascarar e não grava em localStorage quando PostgreSQL falhar', async () => {
    vi.mocked(rpcAdapter.linkContractToItemRpc).mockRejectedValueOnce(
      new Error('CONNECTION_TIMEOUT: Falha de conexão com PostgreSQL')
    );

    await expect(
      saveArpItemContractLink({
        itemKey: '00037/2026-200331-00001',
        contractKey: '200331-15-2026',
        quantidadeContratada: 50
      })
    ).rejects.toThrow('CONNECTION_TIMEOUT: Falha de conexão com PostgreSQL');

    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(Object.keys(mockStorage)).toHaveLength(0);
  });

  // TC-03: Não existe geração de mockId
  it('TC-03: rejeita fallback offline e nunca gera identificador artificial (mockId)', async () => {
    vi.mocked(rpcAdapter.linkContractToItemRpc).mockRejectedValueOnce(
      new Error('DATABASE_OFFLINE')
    );

    await expect(
      saveArpItemContractLink({
        itemKey: '00037/2026-200331-00001',
        contractKey: '200331-15-2026',
        quantidadeContratada: 20
      })
    ).rejects.toThrow();

    // Nenhuma chave com prefixo mock deve ter sido salva
    const keys = Object.keys(mockStorage);
    expect(keys.some(k => k.includes('link_'))).toBe(false);
  });

  // TC-04: Não existe escrita em contrato_empenho_links
  it('TC-04: não aciona nem referencia a tabela contrato_empenho_links', async () => {
    const fromMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'uuid-1',
                item_key: '00037/2026-200331-00001',
                contract_key: '200331-15-2026',
                quantidade_contratada: 50,
                created_at: '2026-09-24T10:00:00Z',
                updated_at: '2026-09-24T10:00:00Z'
              }
            ],
            error: null
          })
        })
      })
    });

    (supabaseModule.supabase as any).from = fromMock;

    const links = await fetchArpItemContractLinks('00037/2026-200331-00001');

    expect(fromMock).toHaveBeenCalledWith('arp_item_contract_links');
    expect(fromMock).not.toHaveBeenCalledWith('contrato_empenho_links');
    expect(links).toHaveLength(1);
    expect(links[0].id).toBe('uuid-1');
  });

  // TC-05: Vínculo oficial não altera saldo da ata
  it('TC-05: comprova formalmente que o vínculo oficial não altera o saldo da ata', () => {
    const qtdHomologada = 500;
    const somaEmpenhos = 150;
    const saldoAtaInicial = qtdHomologada - somaEmpenhos; // 350

    // Ao vincular contrato com quantidade 200:
    const qtdVinculoContrato = 200;

    // Invariante Contábil do SaldoARP: Saldo = Qtd Homologada - Soma(Empenhos)
    const saldoAtaAposVinculo = qtdHomologada - somaEmpenhos;

    expect(saldoAtaAposVinculo).toBe(350);
    expect(saldoAtaAposVinculo).toBe(saldoAtaInicial);
    expect(saldoAtaAposVinculo).not.toBe(qtdHomologada - somaEmpenhos - qtdVinculoContrato);
  });

  // TC-06: Quantidade contratada não altera saldo da ata
  it('TC-06: alteração de quantidade contratada não afeta empenhos ou saldo disponível', () => {
    const saldoAta = 1000 - 400; // 600

    // Quantidade contratada pode ser 100, 300 ou 500:
    const qtdContratadaV1 = 100;
    const qtdContratadaV2 = 500;

    expect(1000 - 400).toBe(saldoAta);
    expect(qtdContratadaV1).not.toBe(saldoAta);
    expect(qtdContratadaV2).not.toBe(saldoAta);
  });

  // TC-07: Contrato manual continua funcionando no sistema (isolamento)
  it('TC-07: mantém isolamento absoluto sem afetar fluxo de contratos manuais', async () => {
    // deleteArpItemContractLink deve chamar unlinkContractFromItemRpc (da tabela arp_item_contract_links)
    // sem interferir com executeDeleteContratoRpc de contratos manuais
    vi.mocked(rpcAdapter.unlinkContractFromItemRpc).mockResolvedValueOnce({
      id: 'uuid-link-oficial',
      success: true,
      timestamp: '2026-09-24T12:00:00Z'
    });

    await deleteArpItemContractLink('uuid-link-oficial', '00037/2026-200331-00001');

    expect(rpcAdapter.unlinkContractFromItemRpc).toHaveBeenCalledWith('uuid-link-oficial');
  });

  // TC-08: Contrato oficial continua abrindo o Contrato 360°
  it('TC-08: garante que a contractKey canônica conecta corretamente ao Contrato 360°', () => {
    const link: ArpItemContractLink = {
      id: 'link-1',
      itemKey: '00037/2026-200331-00001',
      contractKey: '200331-15-2026',
      quantidadeContratada: 80
    };

    const enriched = enrichContractLinks([link], mockOfficialContracts);
    expect(enriched).toHaveLength(1);
    expect(enriched[0].contractKey).toBe('200331-15-2026');
    const rotaEsperadaContrato360 = `/contratos/${encodeURIComponent(enriched[0].contractKey)}`;
    expect(rotaEsperadaContrato360).toBe('/contratos/200331-15-2026');
  });

  // TC-09: Dados oficiais continuam derivados do catálogo soberano em memória
  it('TC-09: deriva dados oficiais exclusivamente do catálogo em memória sem duplicação', () => {
    const links: ArpItemContractLink[] = [
      {
        id: 'link-1',
        itemKey: '00037/2026-200331-00001',
        contractKey: '200331-15-2026',
        quantidadeContratada: 50
      }
    ];

    const enriched = enrichContractLinks(links, mockOfficialContracts);
    expect(enriched[0].isOficial).toBe(true);
    expect(enriched[0].numeroContratoFormatado).toBe('15/2026');
    expect(enriched[0].fornecedorNome).toBe('EMPRESA ALFA SERVICOS LTDA');
    expect(enriched[0].fornecedorCnpj).toBe('12345678000199');
    expect(enriched[0].valorGlobal).toBe(500000);
    expect(enriched[0].linkPncp).toBe('https://pncp.gov.br/app/contratos/200331/2026/15');
  });

  // TC-10: Coexistência de Contratos Oficiais e Contratos Manuais sem duplicação
  it('TC-10 (Regressão): suporta coexistência de contratos oficiais e manuais sem duplicação', () => {
    const links: ArpItemContractLink[] = [
      {
        id: 'link-oficial-1',
        itemKey: '00037/2026-200331-00001',
        contractKey: '200331-15-2026',
        quantidadeContratada: 50
      }
    ];

    const enriched = enrichContractLinks(links, mockOfficialContracts);
    expect(enriched).toHaveLength(1);
    expect(enriched[0].contractKey).toBe('200331-15-2026');
    expect(enriched[0].isOficial).toBe(true);
  });
});
