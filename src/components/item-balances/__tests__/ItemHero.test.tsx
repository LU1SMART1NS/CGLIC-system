import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItemHero, itemSaldoStatus } from '../ItemHero';
import type { ArpRecord, ArpItemRecord } from '../../../types';

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

const referencia = { status: 'CONSISTENTE', consumido: 30, delta: 0 } as const;

const baseProps = {
  arp: mockArp,
  item: mockItem,
  onBack: vi.fn(),
  onRefresh: vi.fn(),
  onGoTo: vi.fn(),
  referencia,
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

describe('ItemHero — topo do Item da Ata: indicadores e atualização', () => {
  it('1. todos veem uma única ação, "Atualizar", habilitada, e não "Sincronizar empenhos"', () => {
    const html = renderToStaticMarkup(<ItemHero {...baseProps} />);

    expect(html).toContain('Atualizar');
    expect(html).not.toContain('Sincronizar empenhos');
    expect(html).toContain('aria-disabled="false"');
  });

  it('2. durante a atualização mostra "Atualizando..." e desabilita o botão', () => {
    const html = renderToStaticMarkup(<ItemHero {...baseProps} isRefreshing />);

    expect(html).toContain('Atualizando...');
    expect(html).toContain('aria-disabled="true"');
  });

  it('8. mostra os indicadores uma única vez, sem referência quando o Compras.gov é consistente', () => {
    const html = renderToStaticMarkup(<ItemHero {...baseProps} />);

    expect(html).toContain('Item 1');
    expect(html).toContain('Saldo da ata');
    expect(html).toContain('item-health-saldo');
    expect(html).not.toContain('item-health-reconciliacao');
    expect(html).toContain('Saldo para adesões');
    expect(html).not.toContain('Aceita adesão');
    expect(html).toContain('TECNOLOGIA AVANCADA S/A');
  });

  it('8b. item que não aceita adesão mostra o cartão como "Não aceita", sem selo e sem atalho', () => {
    const html = renderToStaticMarkup(<ItemHero {...baseProps} item={{ ...mockItem, maximoAdesao: 0 }} />);

    expect(html).toContain('Não aceita');
    expect(html).toContain('adesão não prevista no item');
    expect(html).not.toContain('Não aceita adesão');
  });

  it('9. Compras.gov acima do contratado destaca a diferença', () => {
    const html = renderToStaticMarkup(
      <ItemHero {...baseProps} referencia={{ status: 'ACIMA', consumido: 37, delta: 7 }} />
    );

    expect(html).toContain('Diferença +7 un');
  });

  it('10. situação do saldo segue as faixas das barras de progresso', () => {
    expect(itemSaldoStatus(0, 0).label).toBe('Saldo esgotado');
    expect(itemSaldoStatus(10, 10).label).toBe('Saldo crítico');
    expect(itemSaldoStatus(40, 40).label).toBe('Saldo em atenção');
    expect(itemSaldoStatus(80, 80).label).toBe('Saldo disponível');
  });
});
