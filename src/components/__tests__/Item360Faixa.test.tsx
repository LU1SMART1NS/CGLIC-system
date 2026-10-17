import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Item 360 quando uma leitura falha (passo 2 da auditoria das telas, achados 3d, 3f e 3h): a faixa diz o que não
 * carregou e nada que grava roda sobre leitura que falhou (sem o saldo ou a ata assinada, alocar fica fechado).
 * As outras leituras do item seguem reais, só que sem resposta (render no servidor não busca nada).
 */
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'gestor_saldos', user: { id: 'u' } })) }));
vi.mock('../../hooks/useDetailOrigin', () => ({ useNavigateWithOrigin: () => vi.fn() }));
vi.mock('../../hooks/useAta', async (orig) => ({ ...(await orig<typeof import('../../hooks/useAta')>()), useAtaItemSaldos: vi.fn() }));
vi.mock('../../hooks/useQuantitativosDoItem', async (orig) => ({ ...(await orig<typeof import('../../hooks/useQuantitativosDoItem')>()), useQuantitativosDoItem: vi.fn() }));
// Sem órgãos lidos, a aba mostra as unidades internas direto (com eles, ficam dentro da linha da SENASP, fechada).
vi.mock('../../hooks/useItemUnidades', async (orig) => ({
  ...(await orig<typeof import('../../hooks/useItemUnidades')>()),
  useItemUnidades: () => ({ data: { unidades: [], origem: 'SEM_DADOS', copiadoEm: null }, isLoading: false, isError: false, error: null, refetch: vi.fn() })
}));
vi.mock('../../hooks/useItemAdesoes', async (orig) => ({ ...(await orig<typeof import('../../hooks/useItemAdesoes')>()), useItemAdesoes: vi.fn() }));

import { useAtaItemSaldos } from '../../hooks/useAta';
import { useQuantitativosDoItem } from '../../hooks/useQuantitativosDoItem';
import { useItemAdesoes } from '../../hooks/useItemAdesoes';
import { vazioDoItem } from '../../services/quantitativosService';
import { ItemBalances } from '../ItemBalances';

const arp = {
  numeroAtaRegistroPreco: '00043/2026',
  codigoUnidadeGerenciadora: '200331',
  dataVigenciaInicial: '2026-01-10',
  dataVigenciaFinal: '2027-01-10',
  numeroControlePncpAta: '',
  uasgCarteira: '200331',
  papelSenasp: 'GERENCIADORA'
} as any;
const item = { numeroItem: '00003', descricaoItem: 'Capacete balístico', quantidadeHomologadaItem: 1440, valorUnitario: 100 } as any;

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, isSuccess: true, error: null, refetch: vi.fn() });
const falhou = (mensagem = 'canceling statement due to statement timeout') => ({
  data: undefined,
  isLoading: false,
  isError: true,
  isSuccess: false,
  error: new Error(mensagem),
  refetch: vi.fn()
});

const render = () =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ItemBalances arp={arp} item={item} onBack={vi.fn()} backLabel="Voltar" />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('Item 360: uma leitura falha, a faixa avisa e nada grava sobre ela', () => {
  beforeEach(() => {
    vi.mocked(useAtaItemSaldos).mockReturnValue({ saldos: [], isLoading: false, consulta: ok([]) } as any);
    const vazio = vazioDoItem();
    vi.mocked(useQuantitativosDoItem).mockReturnValue({ ...ok(vazio), data: vazio, consulta: ok(vazio) } as any);
    vi.mocked(useItemAdesoes).mockReturnValue(ok({ aoVivo: [], copia: null, falhaAoVivo: null }) as any);
  });

  it('tudo carregou: sem faixa e com alocar aberto', () => {
    const html = render();
    expect(html).not.toContain('item360-fontes-com-falha');
    expect(html).not.toContain('item-alocar-fechado');
  });

  it('o saldo dos itens não carregou (3d): a faixa diz, e alocar fica fechado (o limite viraria o homologado)', () => {
    vi.mocked(useAtaItemSaldos).mockReturnValue({ saldos: [], isLoading: false, consulta: falhou() } as any);
    const html = render();
    expect(html).toContain('data-testid="item360-fontes-com-falha"');
    expect(html).toContain('Parte do item não carregou');
    expect(html).toContain('<strong>Saldo dos itens</strong>');
    expect(html).toContain('data-testid="item-alocar-fechado"');
  });

  it('a ata assinada não carregou (3f): a faixa diz, e alocar fica fechado (o limite viraria o registrado)', () => {
    const vazio = vazioDoItem();
    vi.mocked(useQuantitativosDoItem).mockReturnValue({ ...falhou(), data: vazio, consulta: falhou() } as any);
    const html = render();
    expect(html).toContain('<strong>Ata assinada e órgãos do item</strong>');
    expect(html).toContain('data-testid="item-alocar-fechado"');
  });

  it('adesões (3h): a API falhou e só há a cópia do servidor → "não atualizou — mostrando a última leitura"', () => {
    vi.mocked(useItemAdesoes).mockReturnValue(
      ok({ aoVivo: [], copia: { adesoes: [], copiadoEm: '2026-10-05T17:32:00Z' }, falhaAoVivo: 'HTTP error! status: 504' }) as any
    );
    const html = render();
    expect(html).toContain('<strong>Adesões do item no Compras.gov.br</strong>');
    expect(html).toContain('não atualizou — mostrando a última leitura');
    expect(html).toContain('HTTP error! status: 504');
  });

  it('adesões (3h): a API falhou e não há cópia → a faixa diz que não carregou', () => {
    vi.mocked(useItemAdesoes).mockReturnValue(falhou('O Compras.gov.br não respondeu às adesões do item: HTTP error! status: 504') as any);
    const html = render();
    expect(html).toContain('<strong>Adesões do item no Compras.gov.br</strong>');
    expect(html).toContain('não carregou');
  });
});
