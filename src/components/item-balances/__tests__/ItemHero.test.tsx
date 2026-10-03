import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItemHero, itemSaldoStatus } from '../ItemHero';
import * as ataManagersModule from '../../../hooks/useAtaManagers';
import type { ArpRecord, ArpItemRecord } from '../../../types';
import { addDays, formatDateISO } from '../../../services/temporalEngineService';

vi.mock('../../../hooks/useAtaManagers', () => ({ useAtaManager: vi.fn() }));

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
  beforeEach(() => {
    vi.mocked(ataManagersModule.useAtaManager).mockReturnValue({ data: { gestorNome: 'Maria Gestora' }, isLoading: false, isError: false } as any);
  });

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
    expect(html).toContain('Saldo SENASP');
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

  it('11. o topo segue o padrão das telas 360: UASG, fornecedor com CNPJ e identificadores só do item', () => {
    const html = renderToStaticMarkup(
      <ItemHero {...baseProps} item={{ ...mockItem, niFornecedor: '12345678000190', codigoPdm: 4321, nomePdm: 'Servidor' } as any} />
    );

    expect(html).toContain('UASG 200331 · MINISTERIO DA JUSTICA E SEGURANCA PUBLICA');
    expect(html).toContain('CNPJ 12.345.678/0001-90');
    // Identificadores do item; o que é da ata (modalidade, compra, Id PNCP) fica na Ata 360
    expect(html).toContain('Tipo');
    expect(html).toContain('Código do item');
    // PDM: só o código, sem o nome
    expect(html).toContain('4321');
    expect(html).not.toContain('Servidor</dd>');
    expect(html).not.toContain('4321 · Servidor');
    expect(html).not.toContain('Modalidade');
    expect(html).not.toContain('Id PNCP');
    // O que já está nos indicadores não se repete no rodapé
    expect(html).not.toContain('Preço unitário');
    expect(html).not.toContain('Valor total do item');
  });

  it('12. mostra só o fim da vigência da ata (o item não tem prazo próprio), com aviso quando crítico', () => {
    const daqui = (n: number) => formatDateISO(addDays(new Date(), n));
    const critica = renderToStaticMarkup(<ItemHero {...baseProps} arp={{ ...mockArp, dataVigenciaFinal: daqui(8) }} />);
    expect(critica).toContain('Vigência da ata');
    expect(critica).toContain('vence em 8 dias');
    expect(critica).not.toContain('Assinatura');

    const folgada = renderToStaticMarkup(<ItemHero {...baseProps} arp={{ ...mockArp, dataVigenciaFinal: daqui(200) }} />);
    expect(folgada).toContain('Vigência da ata');
    expect(folgada).not.toContain('vence em');

    const encerrada = renderToStaticMarkup(<ItemHero {...baseProps} arp={{ ...mockArp, dataVigenciaFinal: daqui(-3) }} />);
    expect(encerrada).toContain('encerrada há 3 dias');
  });

  it('13. usa o fim da vigência corrigido pelo PNCP quando existir', () => {
    const html = renderToStaticMarkup(
      <ItemHero {...baseProps} arp={{ ...mockArp, dataVigenciaFinal: '2027-01-15', dataVigenciaFinalPncp: '2028-03-20' }} />
    );
    expect(html).toContain('20/03/2028');
    expect(html).not.toContain('15/01/2027');
  });

  it('14. o número da ata é link quando há como abrir a ata, e texto quando não há', () => {
    expect(renderToStaticMarkup(<ItemHero {...baseProps} onOpenAta={vi.fn()} />)).toContain('<button');
    const semLink = renderToStaticMarkup(<ItemHero {...baseProps} />);
    expect(semLink).toContain('nº 90001/2026');
    expect(semLink).not.toContain('>nº 90001/2026</button>');
  });

  it('15. empenhos pendentes de confirmação ganham o selo de atenção; zero fica neutro', () => {
    const com = renderToStaticMarkup(<ItemHero {...baseProps} metrics={{ ...baseProps.metrics, empenhosPendentes: 3 }} />);
    expect(com).toContain('Empenhos pendentes');
    expect(com).toContain('Atenção');
    const sem = renderToStaticMarkup(<ItemHero {...baseProps} metrics={{ ...baseProps.metrics, empenhosPendentes: 0 }} />);
    expect(sem).not.toContain('Atenção');
  });

  it('10. situação do saldo segue as faixas das barras de progresso', () => {
    expect(itemSaldoStatus(0, 0).label).toBe('Saldo esgotado');
    expect(itemSaldoStatus(10, 10).label).toBe('Saldo crítico');
    expect(itemSaldoStatus(40, 40).label).toBe('Saldo em atenção');
    expect(itemSaldoStatus(80, 80).label).toBe('Saldo disponível');
  });
  it('16. mostra o gestor da ata, que é o do item, no mesmo formato das outras telas 360', () => {
    const html = renderToStaticMarkup(<ItemHero {...baseProps} />);

    expect(html).toContain('data-testid="item-manager-info"');
    expect(html).toContain('Gestor da ata');
    expect(html).toContain('Maria Gestora');
    // A consulta é pela ata do item
    expect(vi.mocked(ataManagersModule.useAtaManager)).toHaveBeenCalledWith('90001/2026');
  });

  it('17. ata sem gestor atribuído aparece como "Não atribuído"', () => {
    vi.mocked(ataManagersModule.useAtaManager).mockReturnValue({ data: null, isLoading: false, isError: false } as any);
    const html = renderToStaticMarkup(<ItemHero {...baseProps} />);

    expect(html).toContain('Gestor da ata');
    expect(html).toContain('Não atribuído');
  });

  it('18. enquanto o gestor carrega, mostra "Carregando..." e não "Não atribuído"', () => {
    vi.mocked(ataManagersModule.useAtaManager).mockReturnValue({ data: undefined, isLoading: true, isError: false } as any);
    const html = renderToStaticMarkup(<ItemHero {...baseProps} />);

    expect(html).toContain('Carregando...');
    expect(html).not.toContain('Não atribuído');
  });

  it('19. se a consulta do gestor falhar, o bloco some em vez de dizer que não há gestor', () => {
    vi.mocked(ataManagersModule.useAtaManager).mockReturnValue({ data: undefined, isLoading: false, isError: true } as any);
    const html = renderToStaticMarkup(<ItemHero {...baseProps} />);

    expect(html).not.toContain('item-manager-info');
    expect(html).not.toContain('Não atribuído');
    expect(html).toContain('Item 1'); // o resto do topo continua
  });
});
