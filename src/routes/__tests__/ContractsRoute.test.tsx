import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractsRoute } from '../ContractsRoute';
import { ContractsPortfolioHeader } from '../../components/contracts/portfolio/ContractsPortfolioHeader';
import { ContractsPortfolioSummary } from '../../components/contracts/portfolio/ContractsPortfolioSummary';
import { ContractsPortfolioFilters } from '../../components/contracts/portfolio/ContractsPortfolioFilters';
import { ContractsPortfolioTable } from '../../components/contracts/portfolio/ContractsPortfolioTable';
import * as useContractsDashboardModule from '../../hooks/useContractsDashboard';
import type { ContractDashboardRecord } from '../../types';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/contratos' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()]
}));

const mockContracts: ContractDashboardRecord[] = [
  {
    id: '200331-00001-2025',
    uasg: '200331',
    numero: '00001',
    ano: 2025,
    numeroFormatado: '01/2025',
    tipoInstrumento: 'TERMO_CONTRATO',
    fornecedorNome: 'Empresa Alfa Serviços Ltda',
    fornecedorCnpjCpf: '12.345.678/0001-90',
    objeto: 'Prestação de serviços contínuos de suporte técnico e infraestrutura de TI.',
    dataVigenciaInicio: '2025-01-01',
    dataVigenciaFim: '2026-12-31',
    valorInicial: 1200000,
    valorGlobal: 1200000,
    statusVigencia: 'Vigente',
    fonteDados: 'Compras.gov.br'
  },
  {
    id: '200331-00002-2024',
    uasg: '200331',
    numero: '00002',
    ano: 2024,
    numeroFormatado: '02/2024',
    tipoInstrumento: 'CARTA_CONTRATO',
    fornecedorNome: 'Beta Tecnologia e Inovação S/A',
    fornecedorCnpjCpf: '98.765.432/0001-10',
    objeto: 'Aquisição e manutenção preventiva de estações de trabalho e equipamentos de segurança.',
    dataVigenciaInicio: '2024-05-01',
    dataVigenciaFim: '2026-10-15', // a vencer em ~21 dias a partir de 24/09/2026
    valorInicial: 800000,
    valorGlobal: 950000,
    statusVigencia: 'A Vencer (60d)',
    fonteDados: 'Compras.gov.br'
  },
  {
    id: '200331-00003-2023',
    uasg: '200331',
    numero: '00003',
    ano: 2023,
    numeroFormatado: '03/2023',
    tipoInstrumento: 'TERMO_CONTRATO',
    fornecedorNome: 'Gamma Locações Comerciais Eireli',
    fornecedorCnpjCpf: '11.222.333/0001-44',
    objeto: 'Locação de veículos executivos para deslocamento operacional.',
    dataVigenciaInicio: '2023-01-01',
    dataVigenciaFim: '2024-01-01', // expirado
    valorInicial: 350000,
    valorGlobal: 350000,
    statusVigencia: 'Expirado',
    fonteDados: 'Compras.gov.br'
  }
];

describe('ContractsRoute & Componentes — FASE 9-F: Carteira de Contratos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. deve renderizar a rota com cabeçalho limpo "Acompanhamento e Prazos" e subtítulo', () => {
    vi.spyOn(useContractsDashboardModule, 'useContractsDashboard').mockReturnValue({
      data: mockContracts,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    } as any);

    const html = renderToStaticMarkup(<ContractsRoute />);

    expect(html).toContain('Acompanhamento e Prazos');
    expect(html).toContain('Carteira de contratos, vigências, valores e situações de acompanhamento.');
    expect(html).not.toContain('Cockpit');
  });

  it('2. deve renderizar o cabeçalho isolado com botão de atualização', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioHeader onRefresh={vi.fn()} isRefreshing={false} />
    );

    expect(html).toContain('Acompanhamento e Prazos');
    expect(html).toContain('Atualizar');
  });

  it('3. deve renderizar os 4 cards de resumo com os contadores corretos', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioSummary
        total={3}
        vigentes={2}
        aVencer60d={1}
        expirados={1}
        activeStatus="TODOS"
        onSelectStatus={vi.fn()}
      />
    );

    expect(html).toContain('Total de Contratos');
    expect(html).toContain('3');
    expect(html).toContain('Contratos Vigentes');
    expect(html).toContain('2');
    expect(html).toContain('Próximos do Vencimento');
    expect(html).toContain('1');
    expect(html).toContain('Expirados / Encerrados');
  });

  it('4. deve renderizar a barra de filtros com opções de situação, tipo e busca', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioFilters
        filters={{ status: 'TODOS', tipoInstrumento: 'TODOS', busca: '' }}
        onChangeFilter={vi.fn()}
        onResetFilters={vi.fn()}
        totalFiltered={3}
        totalContracts={3}
      />
    );

    expect(html).toContain('Todas as Situações');
    expect(html).toContain('Todos os Instrumentos');
    expect(html).toContain('Buscar por contrato, fornecedor, CNPJ...');
    expect(html).toContain('3 contratos');
  });

  it('5. deve renderizar a tabela com colunas operacionais e linhas de contratos', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioTable
        contracts={mockContracts}
        totalContracts={3}
        onResetFilters={vi.fn()}
      />
    );

    // Cabeçalhos de coluna
    expect(html).toContain('Contrato &amp; Objeto');
    expect(html).toContain('Situação');
    expect(html).toContain('Vigência');
    expect(html).toContain('Valor Vigente');
    expect(html).toContain('Acompanhamento');
    expect(html).toContain('Ações');

    // Registros
    expect(html).toContain('Contrato nº 01/2025');
    expect(html).toContain('Empresa Alfa Serviços Ltda');
    expect(html).toContain('Contrato nº 02/2024');
    expect(html).toContain('Beta Tecnologia e Inovação S/A');
    expect(html).toContain('Contrato nº 03/2023');
    expect(html).toContain('Gamma Locações Comerciais Eireli');

    // Botões de Drill-down
    expect(html).toContain('Abrir 360°');
  });

  it('6. deve exibir estado vazio quando não há contratos na base', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioTable
        contracts={[]}
        totalContracts={0}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('Nenhum contrato encontrado');
    expect(html).toContain('Não há contratos cadastrados ou sincronizados para a unidade atual.');
  });

  it('7. deve exibir estado de filtro sem resultados com botão de limpar filtros', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioTable
        contracts={[]}
        totalContracts={3}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('Nenhum contrato corresponde aos filtros aplicados.');
    expect(html).toContain('Limpar Filtros');
  });

  it('8. deve renderizar estado de erro explícito com mensagem quando a query falhar', () => {
    vi.spyOn(useContractsDashboardModule, 'useContractsDashboard').mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error('Falha de conexão com a API de Contratos'),
      refetch: vi.fn(),
      refresh: vi.fn()
    } as any);

    const html = renderToStaticMarkup(<ContractsRoute />);

    expect(html).toContain('Erro ao carregar carteira de contratos');
    expect(html).toContain('Falha de conexão com a API de Contratos');
    expect(html).toContain('Tentar Novamente');
  });

  it('9. deve renderizar loading skeleton quando isLoading for verdadeiro', () => {
    vi.spyOn(useContractsDashboardModule, 'useContractsDashboard').mockReturnValue({
      data: [],
      isLoading: true,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    } as any);

    const html = renderToStaticMarkup(<ContractsRoute />);

    expect(html).toContain('skeleton');
    expect(html).not.toContain('Empresa Alfa Serviços');
  });
});
