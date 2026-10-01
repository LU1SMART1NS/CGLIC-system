import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItemHero, itemSaldoStatus } from '../ItemHero';
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

const report = {
  quantidadeRegistrada: 100,
  totalEmpenhadoApi: 30,
  totalEmpenhadoManual: 0,
  totalEmpenhado: 30,
  saldoCalculado: 70,
  saldoApi: 70,
  divergencia: 0,
  status: 'CONSISTENTE',
  mensagem: ''
} as any;

const baseProps = {
  arp: mockArp,
  item: mockItem,
  onBack: vi.fn(),
  onRefresh: vi.fn(),
  onGoTo: vi.fn(),
  canSync: true,
  report,
  metrics: {
    officialSaldo: 70,
    itemTotalQty: 100,
    totalEmpenhado: 30,
    empenhoConsumidoPercent: 30,
    rawEmpenhoPercentRestante: 70,
    saldoAdesoes: 200,
    limiteAdesao: 200,
    valorFinanceiroDisponivel: 1750000,
    valorFinanceiroConsumido: 750000
  }
};

describe('ItemHero — topo do Item da Ata: indicadores, conferência e sincronização', () => {
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

  it('1. gestor e admin veem "Sincronizar empenhos" habilitado', () => {
    vi.mocked(syncHookModule.useSyncItemEmpenhos).mockReturnValue(defaultMockMutation as any);

    const html = renderToStaticMarkup(
      <ItemHero {...baseProps} canSync={true} />
    );

    expect(html).toContain('Sincronizar empenhos');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('Atualizando...');
  });

  it('2. quem não sincroniza vê apenas "Atualizar" (uma única ação, habilitada)', () => {
    vi.mocked(syncHookModule.useSyncItemEmpenhos).mockReturnValue(defaultMockMutation as any);

    const html = renderToStaticMarkup(<ItemHero {...baseProps} canSync={false} />);

    expect(html).toContain('Atualizar');
    expect(html).not.toContain('Sincronizar empenhos');
    expect(html).not.toContain('disabled=""');
  });

  it('3. deve exibir spinner e estado "Atualizando..." quando a mutação estiver pendente', () => {
    vi.mocked(syncHookModule.useSyncItemEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      isPending: true
    } as any);

    const html = renderToStaticMarkup(
      <ItemHero {...baseProps} canSync={true} />
    );

    expect(html).toContain('Atualizando...');
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
      <ItemHero {...baseProps} canSync={true} />
    );

    expect(html).toContain('Sincronização concluída. 4 empenho(s) processado(s) e saldo do item atualizado.');
    expect(html).toContain('item-sync-notice');
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
      <ItemHero {...baseProps} canSync={true} />
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
      <ItemHero {...baseProps} canSync={true} />
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
      <ItemHero {...baseProps} canSync={true} />
    );

    expect(html).toContain('Falha de comunicação com a API Compras.gov.br');
  });

  it('8. mostra os indicadores uma única vez, com a conferência consistente', () => {
    vi.mocked(syncHookModule.useSyncItemEmpenhos).mockReturnValue(defaultMockMutation as any);

    const html = renderToStaticMarkup(<ItemHero {...baseProps} />);

    expect(html).toContain('Item 1');
    expect(html).toContain('Saldo disponível');
    expect(html).toContain('item-health-saldo');
    expect(html).toContain('Consistente');
    expect(html).toContain('Aceita adesão');
    expect(html).toContain('TECNOLOGIA AVANCADA S/A');
  });

  it('9. conferência divergente destaca a diferença', () => {
    vi.mocked(syncHookModule.useSyncItemEmpenhos).mockReturnValue(defaultMockMutation as any);

    const html = renderToStaticMarkup(
      <ItemHero {...baseProps} report={{ ...report, status: 'DIVERGENTE', saldoApi: 63, divergencia: 7 }} />
    );

    expect(html).toContain('Divergência +7 un');
  });

  it('10. situação do saldo segue as faixas das barras de progresso', () => {
    expect(itemSaldoStatus(0, 0).label).toBe('Saldo esgotado');
    expect(itemSaldoStatus(10, 10).label).toBe('Saldo crítico');
    expect(itemSaldoStatus(40, 40).label).toBe('Saldo em atenção');
    expect(itemSaldoStatus(80, 80).label).toBe('Saldo disponível');
  });
});
