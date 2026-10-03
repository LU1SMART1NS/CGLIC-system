import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Ata360Header } from '../Ata360Header';
import * as pncpHookModule from '../../../hooks/useAtaPncp';
import type { ArpRecord } from '../../../types';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../hooks/useAtaManagers', () => ({ useAtaManager: () => ({ data: { gestorNome: 'Gestora Teste' }, isLoading: false }) }));
vi.mock('../../../hooks/useAtaPncp', () => ({ useAtaPncp: vi.fn() }));

const arp = {
  numeroAtaRegistroPreco: '00059/2025',
  codigoUnidadeGerenciadora: '200331',
  nomeUnidadeGerenciadora: 'SECRETARIA NACIONAL DE SEGURANCA PUBLICA - SENASP',
  dataAssinatura: '2025-09-30',
  dataVigenciaInicial: '2025-10-10',
  dataVigenciaFinal: '2099-10-10',
  objeto: 'Registro de preços para aquisição de Tablets',
  numeroControlePncpAta: '00394494000136-1-000916/2025-000001'
} as ArpRecord;

const render = () =>
  renderToStaticMarkup(<Ata360Header arp={arp} itens={[]} saldos={[]} linkedContractsCount={0} onOpenActions={vi.fn()} onOpenItens={vi.fn()} onOpenContratos={vi.fn()} />);

describe('Ata360Header: divulgação no PNCP', () => {
  beforeEach(() => vi.mocked(pncpHookModule.useAtaPncp).mockReturnValue({ data: undefined } as any));

  it('sem resposta do PNCP, a linha de datas só leva assinatura e vigência', () => {
    const html = render();
    expect(html).toContain('Assinatura');
    expect(html).toContain('Vigência');
    expect(html).not.toContain('Divulgação no PNCP');
  });

  it('com a resposta, mostra a divulgação entre a assinatura e a vigência', () => {
    vi.mocked(pncpHookModule.useAtaPncp).mockReturnValue({ data: { dataPublicacaoPncp: '2025-10-09T10:45:06' } } as any);
    const html = render();
    expect(html).toContain('Divulgação no PNCP');
    expect(html).toContain('09/10/2025');
    const ordem = ['Assinatura', 'Divulgação no PNCP', 'Vigência'].map((t) => html.indexOf(t));
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it('resposta sem data de divulgação não mostra a linha', () => {
    vi.mocked(pncpHookModule.useAtaPncp).mockReturnValue({ data: { cancelado: false } } as any);
    expect(render()).not.toContain('Divulgação no PNCP');
  });
describe('Ata360Header: aceita adesão', () => {
  beforeEach(() => vi.mocked(pncpHookModule.useAtaPncp).mockReturnValue({ data: undefined } as any));

  it('sem resposta do PNCP, o rodapé não diz se aceita adesão', () => {
    expect(render()).not.toContain('Aceita adesão');
  });

  it('mostra Sim e Não conforme o PNCP, entre a compra e o Id PNCP', () => {
    vi.mocked(pncpHookModule.useAtaPncp).mockReturnValue({ data: { possibilidadeAdesao: true } } as any);
    const sim = render();
    expect(sim).toContain('Aceita adesão');
    const ordem = ['Compra', 'Aceita adesão', 'Id PNCP'].map((t) => sim.indexOf(t));
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(sim).toMatch(/Aceita adesão<\/dt><dd[^>]*>Sim</);

    vi.mocked(pncpHookModule.useAtaPncp).mockReturnValue({ data: { possibilidadeAdesao: false } } as any);
    expect(render()).toMatch(/Aceita adesão<\/dt><dd[^>]*>Não</);
  });

  it('resposta sem a informação não vira "Não": o campo não aparece', () => {
    vi.mocked(pncpHookModule.useAtaPncp).mockReturnValue({ data: { dataPublicacaoPncp: '2025-10-09T10:45:06' } } as any);
    expect(render()).not.toContain('Aceita adesão');
  });
});

  it('o campo Id PNCP some quando a ata não tem o Id', () => {
    const semId = renderToStaticMarkup(
      <Ata360Header arp={{ ...arp, numeroControlePncpAta: '' } as ArpRecord} itens={[]} saldos={[]} linkedContractsCount={0} onOpenActions={vi.fn()} onOpenItens={vi.fn()} onOpenContratos={vi.fn()} />
    );
    expect(semId).not.toContain('Id PNCP');
    expect(render()).toContain('Id PNCP');
  });
});

describe('Ata360Header: itens em risco', () => {
  beforeEach(() => vi.mocked(pncpHookModule.useAtaPncp).mockReturnValue({ data: undefined } as any));

  const renderComSaldos = (saldos: any[]) =>
    renderToStaticMarkup(
      <Ata360Header arp={arp} itens={[]} saldos={saldos} linkedContractsCount={0} onOpenActions={vi.fn()} onOpenItens={vi.fn()} onOpenContratos={vi.fn()} />
    );
  const riscoValor = (html: string) => html.match(/ata-health-itens-risco[\s\S]*?(\d+ de \d+)/)?.[1];

  it('conta só item acima de 80% consumido (50% a 80% fica de fora)', () => {
    const html = renderComSaldos([
      { numero_item: 1, quantidade_base_senasp: 100, quantidade_consumida: 60 },
      { numero_item: 2, quantidade_base_senasp: 100, quantidade_consumida: 80 },
      { numero_item: 3, quantidade_base_senasp: 100, quantidade_consumida: 81 },
      { numero_item: 4, quantidade_base_senasp: 100, quantidade_consumida: 100 }
    ]);
    expect(riscoValor(html)).toBe('2 de 4');
    expect(html).toContain('item 4 a 100% consumido');
  });

  it('calcula sobre a quantidade base da SENASP, não sobre a homologada da ata', () => {
    const html = renderComSaldos([{ numero_item: 1, quantidade_homologada: 1000, quantidade_base_senasp: 100, quantidade_consumida: 90 }]);
    expect(riscoValor(html)).toBe('1 de 1');
    expect(html).toContain('item 1 a 90% consumido');
  });

  it('sem item acima de 80%, a dica diz o corte', () => {
    const html = renderComSaldos([{ numero_item: 1, quantidade_base_senasp: 100, quantidade_consumida: 60 }]);
    expect(riscoValor(html)).toBe('0 de 1');
    expect(html).toContain('nenhum acima de 80% consumido');
  });
});
