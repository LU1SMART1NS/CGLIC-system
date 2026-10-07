import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractHealthStrip } from '../ContractHealthStrip';
import * as eventsModule from '../../../hooks/useContractEvents';
import type { ContractDashboardRecord } from '../../../types';

vi.mock('../../../hooks/useContractEvents', () => ({ useContractEvents: vi.fn() }));
vi.mock('../../../hooks/useContractFinancialSummary', () => ({ useContractFinancialSummary: () => ({ summary: null, isLoading: false }) }));

const contract = {
  id: 'c1',
  uasg: '200331',
  numero: '00017/2023',
  ano: 2023,
  valorInicial: 6948296.5,
  valorGlobal: 7601435.45,
  dataVigenciaFim: '2099-01-01',
  statusVigencia: 'Vigente',
  raw: { valor_acumulado: '224.124.229,80' }
} as unknown as ContractDashboardRecord;

const counts = { CRITICA: 0, URGENTE: 0, ATENCAO: 0, INFO: 0 } as any;
const render = (c = contract) =>
  renderToStaticMarkup(<ContractHealthStrip contract={c} contractKey="c1" counts={counts} onOpenActions={vi.fn()} onOpenFinanceiro={vi.fn()} />);
const evento = (qualificacoes: string[]) =>
  ({ fonteOrigem: 'Contratos.gov.br', rawOfficialData: { qualificacao_termo: qualificacoes.map((descricao) => ({ descricao })) } }) as any;

describe('ContractHealthStrip: valor atual', () => {
  beforeEach(() => vi.mocked(eventsModule.useContractEvents).mockReturnValue({ data: { eventos: [], historico: { origem: 'API', copiadoEm: null } } } as any));

  it('mostra valor atual, inicial com variação e o acumulado só no tooltip', () => {
    const html = render();
    expect(html).toContain('Valor atual');
    expect(html).not.toContain('Valor global');
    expect(html).toMatch(/inicial .*\+9,4%/);
    expect(html).toContain('valor acumulado nas vigências: ');
    expect(html).not.toContain('>valor acumulado');
  });

  it('conta os termos de acréscimo/supressão e os reajustes do histórico', () => {
    vi.mocked(eventsModule.useContractEvents).mockReturnValue({
      data: { eventos: [evento(['ACRÉSCIMO / SUPRESSÃO']), evento(['ACRÉSCIMO / SUPRESSÃO', 'REAJUSTE']), evento(['VIGÊNCIA'])], historico: { origem: 'API', copiadoEm: null } }
    } as any);
    const html = render();
    expect(html).toContain('2 termos de acréscimo/supressão · 1 reajuste');
  });

  it('sem termos de valor e sem acumulado, não aparece linha de termos nem tooltip de acumulado', () => {
    const html = render({ ...contract, valorGlobal: 6948296.5, raw: { valor_acumulado: '0,00' } } as ContractDashboardRecord);
    expect(html).toContain('igual ao valor inicial');
    expect(html).not.toContain('termo');
    expect(html).not.toContain('valor acumulado');
  });
});
