import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { PaymentsRoute } from '../PaymentsRoute';
import * as financeiroModule from '../../hooks/useFinanceiroCarteira';
import { montarPagamentosCarteira, type FaturaCarteira } from '../../services/financeiroCarteiraService';
import type { PaymentFollowUpCycle } from '../../types/paymentFollowUp';

vi.mock('../../hooks/useFinanceiroCarteira', () => ({ usePagamentosCarteira: vi.fn(), useSincronizacaoPagamentos: vi.fn() }));
vi.mock('../../hooks/useContractsPortfolio', () => ({
  useContractsPortfolio: vi.fn(() => ({
    rows: [{ contractKey: '200331-00094-2022', contract: { numero: '00094', ano: 2022, fornecedorNome: 'MIRANDA TURISMO' }, gestorNome: 'Marina Costa' }],
    isLoading: false,
    isLoadingScope: false
  }))
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'admin' })) }));

const fatura = (over: Partial<FaturaCarteira>): FaturaCarteira => ({
  idFatura: 1,
  contractKey: '200331-00094-2022',
  numero: '202600000000231',
  tipo: 'Nota Fiscal',
  emissao: '2026-09-10',
  vencimento: '2026-10-10',
  valorLiquido: 112002.91,
  dataLiquidacao: null,
  situacao: 'Pendente',
  cancelada: false,
  np: null,
  referencia: '09/2026',
  ordensBancarias: null,
  obEmissao: null,
  paga: false,
  npContratos: 0,
  empenhos: '2026NE000412',
  ...over
});

const ciclo = {
  cycleKey: 'C1',
  contractKey: '200331-00094-2022',
  competencia: '2026-10',
  status: 'RECEBIDO',
  input: { contractKey: '200331-00094-2022', documentoAtestoSei: '4512345', valorAtesto: 5000, dataRecebimento: '2026-10-07', responsavelNome: 'Ana Souza' },
  etapaAtual: { etapa: 'CONFERENCIA', dono: 'CGLIC', dataAlvo: '2026-10-09', diasUteisRestantes: 2, atrasado: false },
  alerts: []
} as unknown as PaymentFollowUpCycle;

const render = (url = '/pagamentos') =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <PaymentsRoute />
    </MemoryRouter>
  );

describe('Financeiro → Pagamentos', () => {
  beforeEach(() => {
    vi.mocked(financeiroModule.useSincronizacaoPagamentos).mockReturnValue({
      podeForcar: true,
      sincronizando: false,
      ultimoSucessoEm: null,
      atualizar: vi.fn()
    } as never);
    vi.mocked(financeiroModule.usePagamentosCarteira).mockReturnValue({
      rows: montarPagamentosCarteira(
        [ciclo],
        [
          fatura({}),
          fatura({ idFatura: 2, numero: 'NF-LIQ', dataLiquidacao: '2026-10-01', np: '2026NP000811', situacao: 'Siafi Apropriado' }),
          fatura({ idFatura: 3, numero: 'NF-PAGA', dataLiquidacao: '2026-09-01', paga: true, ordensBancarias: '2026OB018840', obEmissao: '2026-09-03' })
        ]
      ),
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn()
    } as never);
  });

  it('abre em "Precisa de ação" com o ciclo da CGLIC; segmentos agrupam as etapas', () => {
    const html = render();
    expect(html).toContain('data-testid="pagamentos-situacao-ACAO"');
    expect(html).toMatch(/Precisa de ação<span[^>]*>1</);
    // Em tramitação: a fatura não liquidada e a liquidada aguardando OB.
    expect(html).toMatch(/Em tramitação<span[^>]*>2</);
    expect(html).toMatch(/Pagas<span[^>]*>1</);
    expect(html).toContain('data-testid="pagamentos-filter-etapa"');
    expect(html).toContain('Atesto 4512345');
    expect(html).toContain('Conferir até 09/10/2026');
    expect(html).not.toContain('NF-PAGA');
    expect(html).toContain('carteira-row-link');
  });

  it('faturas liquidadas mostram a NP; pagas mostram a OB', () => {
    const liquidadas = render('/pagamentos?situacao=TRAMITACAO&etapa=AGUARDANDO_OB');
    expect(liquidadas).toContain('2026NP000811');
    const pagas = render('/pagamentos?situacao=PAGA');
    expect(pagas).toContain('2026OB018840');
    expect(pagas).toContain('OB em 03/09/2026');
  });

  it('não mostra os quadros antigos de CGOFI nem o fluxo de tramitação', () => {
    const html = render('/pagamentos?situacao=TODOS');
    expect(html).not.toContain('Gargalo CGOFI');
    expect(html).not.toContain('Fluxo Operacional');
    expect(html).not.toContain('Ver contrato');
  });
});
