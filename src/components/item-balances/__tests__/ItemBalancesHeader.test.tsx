import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItemBalancesHeader } from '../ItemBalancesHeader';
import * as syncHookModule from '../../../hooks/useSyncItemEmpenhos';
import type { ArpRecord, ArpItemRecord } from '../../../types';

vi.mock('../../../hooks/useSyncItemEmpenhos', () => ({
  useSyncItemEmpenhos: vi.fn()
}));

const mockArp: ArpRecord = {
  numeroAtaRegistroPreco: '90001/2026',
  codigoUnidadeGerenciadora: '200331',
  nomeUnidadeGerenciadora: 'MINISTERIO DA JUSTICA E SEGURANCA PUBLICA',
  codigoOrgao: 200331,
  nomeOrgao: 'MJSP',
  numeroCompra: '90001',
  anoCompra: '2026',
  codigoModalidadeCompra: '5',
  nomeModalidadeCompra: 'Pregão Eletrônico',
  dataAssinatura: '2026-01-10',
  dataVigenciaInicial: '2026-01-15',
  dataVigenciaFinal: '2027-01-15',
  valorTotal: 5000000,
  statusAta: 'Vigente',
  objeto: 'Aquisição de equipamentos de TI',
  quantidadeItens: 5,
  dataHoraAtualizacao: '2026-01-15T10:00:00Z',
  dataHoraInclusao: '2026-01-15T10:00:00Z',
  dataHoraExclusao: null,
  ataExcluido: false,
  numeroControlePncpAta: '200331-1-000001/2026',
  numeroControlePncpCompra: '200331-0-000001/2026',
  idCompra: '20033105900012026'
};

const mockItem: ArpItemRecord = {
  numeroAtaRegistroPreco: '90001/2026',
  codigoUnidadeGerenciadora: '200331',
  numeroCompra: '90001',
  anoCompra: '2026',
  codigoModalidadeCompra: '5',
  dataAssinatura: '2026-01-10',
  dataVigenciaInicial: '2026-01-15',
  dataVigenciaFinal: '2027-01-15',
  numeroItem: '1',
  codigoItem: 101,
  descricaoItem: 'Servidor Rack 2U Alto Desempenho',
  tipoItem: 'Material',
  quantidadeHomologadaItem: 100,
  valorUnitario: 25000,
  valorTotal: 2500000,
  maximoAdesao: 200,
  nomeRazaoSocialFornecedor: 'TECNOLOGIA AVANCADA S/A'
} as any;

describe('ItemBalancesHeader Component — Integração UI de Sincronização de Empenhos no Item da Ata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultMockMutation = {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    data: null,
    reset: vi.fn()
  };

  it('1. deve renderizar o botão "Sincronizar Empenhos" habilitado para perfil gestor', () => {
    vi.mocked(syncHookModule.useSyncItemEmpenhos).mockReturnValue(defaultMockMutation as any);

    const html = renderToStaticMarkup(
      <ItemBalancesHeader arp={mockArp} item={mockItem} onBack={vi.fn()} userRole="gestor" />
    );

    expect(html).toContain('Sincronizar Empenhos');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('Sincronizando...');
  });

  it('2. deve renderizar o botão desabilitado com tooltip para perfil consulta (RBAC)', () => {
    vi.mocked(syncHookModule.useSyncItemEmpenhos).mockReturnValue(defaultMockMutation as any);

    const html = renderToStaticMarkup(
      <ItemBalancesHeader arp={mockArp} item={mockItem} onBack={vi.fn()} userRole="consulta" />
    );

    expect(html).toContain('Sincronizar Empenhos');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Você não possui permissão para sincronizar empenhos deste item.');
  });

  it('3. deve exibir spinner e estado "Sincronizando..." quando a mutação estiver pendente', () => {
    vi.mocked(syncHookModule.useSyncItemEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      isPending: true
    } as any);

    const html = renderToStaticMarkup(
      <ItemBalancesHeader arp={mockArp} item={mockItem} onBack={vi.fn()} userRole="gestor" />
    );

    expect(html).toContain('Sincronizando...');
    expect(html).toContain('disabled=""');
  });

  it('4. deve exibir banner de feedback SUCESSO destacando a atualização do saldo quantitativo', () => {
    vi.mocked(syncHookModule.useSyncItemEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      data: {
        status: 'SUCESSO',
        empenhos_encontrados: 4,
        empenhos_persistidos: 4,
        empenhos_atualizados: 0,
        divergencias: [],
        erros: []
      }
    } as any);

    const html = renderToStaticMarkup(
      <ItemBalancesHeader arp={mockArp} item={mockItem} onBack={vi.fn()} userRole="gestor" />
    );

    expect(html).toContain('Sincronização concluída. 4 empenho(s) processado(s) e saldo quantitativo do item atualizado com sucesso.');
    expect(html).toContain('role="alert"');
  });

  it('5. deve exibir banner de feedback SEM_DADOS quando nenhum empenho de consumo for localizado', () => {
    vi.mocked(syncHookModule.useSyncItemEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      data: {
        status: 'SEM_DADOS',
        empenhos_encontrados: 0,
        empenhos_persistidos: 0,
        empenhos_atualizados: 0,
        divergencias: [],
        erros: []
      }
    } as any);

    const html = renderToStaticMarkup(
      <ItemBalancesHeader arp={mockArp} item={mockItem} onBack={vi.fn()} userRole="gestor" />
    );

    expect(html).toContain('Nenhum empenho de consumo localizado nas bases oficiais para este item da Ata.');
  });

  it('6. deve exibir banner de feedback COM_DIVERGENCIAS informando divergências entre fontes', () => {
    vi.mocked(syncHookModule.useSyncItemEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      data: {
        status: 'COM_DIVERGENCIAS',
        empenhos_encontrados: 2,
        empenhos_persistidos: 2,
        empenhos_atualizados: 0,
        divergencias: [
          {
            campo: 'quantidade',
            fonte_a: 'Compras.gov.br',
            valor_a: 10,
            fonte_b: 'Contratos.gov.br',
            valor_b: 8
          }
        ],
        erros: []
      }
    } as any);

    const html = renderToStaticMarkup(
      <ItemBalancesHeader arp={mockArp} item={mockItem} onBack={vi.fn()} userRole="gestor" />
    );

    expect(html).toContain('Dados sincronizados com 1 divergência(s) entre fontes.');
  });

  it('7. deve exibir banner de feedback ERRO quando a mutação falhar', () => {
    vi.mocked(syncHookModule.useSyncItemEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      isError: true,
      error: new Error('Falha de comunicação com a API Compras.gov.br')
    } as any);

    const html = renderToStaticMarkup(
      <ItemBalancesHeader arp={mockArp} item={mockItem} onBack={vi.fn()} userRole="gestor" />
    );

    expect(html).toContain('Falha de comunicação com a API Compras.gov.br');
  });
});
