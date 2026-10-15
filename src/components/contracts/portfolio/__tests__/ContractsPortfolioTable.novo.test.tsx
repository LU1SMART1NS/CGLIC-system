import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ContractsPortfolioTable, type ContractPortfolioRow } from '../ContractsPortfolioTable';
import type { ContractDashboardRecord } from '../../../../types';

const iso = (diasAtras: number) => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d.toISOString().slice(0, 10);
};

const linha = (key: string, assinatura: string): ContractPortfolioRow => ({
  contract: { numero: key, ano: '2026', uasg: '200330', dataAssinatura: assinatura, dataVigenciaFim: '2027-12-31' } as unknown as ContractDashboardRecord,
  contractKey: key,
  diasRestantes: 400,
  faixa: 'REGULAR',
  pendencias: []
});

describe('contratos novos na carteira', () => {
  it('mostra "Novo" e põe o contrato novo no topo', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ContractsPortfolioTable rows={[linha('antigo', iso(90)), linha('novo', iso(5))]} totalContracts={2} onResetFilters={() => {}} />
      </MemoryRouter>
    );
    expect(html).toContain('data-testid="contracts-novo-novo"');
    expect(html).not.toContain('contracts-novo-antigo');
    expect(html.indexOf('contracts-row-novo')).toBeLessThan(html.indexOf('contracts-row-antigo'));
    expect(html).toContain('>Novo<');
  });

  it('a ordem escolhida no cabeçalho prevalece', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/contratos?ordem=numero:desc']}>
        <ContractsPortfolioTable rows={[linha('antigo', iso(90)), linha('novo', iso(5))]} totalContracts={2} onResetFilters={() => {}} />
      </MemoryRouter>
    );
    expect(html.indexOf('contracts-row-antigo')).toBeLessThan(html.indexOf('contracts-row-novo'));
  });
});
