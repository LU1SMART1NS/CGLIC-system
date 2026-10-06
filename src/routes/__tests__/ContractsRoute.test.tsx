import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractsRoute } from '../ContractsRoute';
import { ContractsPortfolioHeader } from '../../components/contracts/portfolio/ContractsPortfolioHeader';
import { ContractsPortfolioSummary } from '../../components/contracts/portfolio/ContractsPortfolioSummary';
import { ContractsPortfolioFilters } from '../../components/contracts/portfolio/ContractsPortfolioFilters';
import { ContractsPortfolioTable, type ContractPortfolioRow } from '../../components/contracts/portfolio/ContractsPortfolioTable';
import * as useContractsDashboardModule from '../../hooks/useContractsDashboard';
import * as useManagementDashboardModule from '../../hooks/useManagementDashboard';
import * as useAllContractManagersModule from '../../hooks/useAllContractManagers';
import * as useAtaManagersModule from '../../hooks/useAtaManagers';
import * as authContextModule from '../../context/AuthContext';
import { classifyPrazo } from '../../components/carteira/carteiraPrazo';
import { getContractDaysRemaining } from '../../services/dashboardService';
import type { ContractDashboardRecord } from '../../types';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/contratos' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()]
}));

// Situação da sincronização dos contratos (consulta ao banco): fora do teste, carteira em dia.
vi.mock('../../hooks/useSincronizacaoContratos', () => ({
  useSincronizacaoContratos: () => ({
    ultimoSucessoEm: null,
    nuncaSincronizado: false,
    incompleta: false,
    fontesComFalha: [],
    emAndamentoNoBanco: false,
    sincronizando: false,
    podeForcar: false,
    atualizar: vi.fn(),
    isAtualizando: false
  })
}));

// Unidades internas dos contratos vêm de consultas à parte (alocações e vínculos): aqui ficam fora do teste.
vi.mock('../../hooks/useCarteiraItens', () => ({
  useCarteiraItens: () => ({ unidades: [], unidadesDoContrato: new Map(), rows: [], resumoPorAta: new Map(), isLoading: false })
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
    statusVigencia: 'A Vencer',
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

const toRows = (contracts: ContractDashboardRecord[]): ContractPortfolioRow[] =>
  contracts.map((contract) => {
    const diasRestantes = getContractDaysRemaining(contract.dataVigenciaFim);
    return {
      contract,
      contractKey: contract.id,
      diasRestantes,
      faixa: classifyPrazo(diasRestantes, contract.statusVigencia === 'Expirado'),
      pendencias: []
    };
  });

describe('ContractsRoute & Componentes — FASE 9-F: Carteira de Contratos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Perfil "admin" (escopo GLOBAL) por padrão — mantém o comportamento
    // histórico destes testes (carteira completa, sem filtro por gestor).
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'admin-user' } as any,
      session: null,
      loading: false,
      role: 'admin',
      roleStatus: 'ready',
      signOut: vi.fn()
    });
    vi.spyOn(useAllContractManagersModule, 'useAllContractManagers').mockReturnValue({
      data: {},
      isLoading: false
    } as any);
    vi.spyOn(useManagementDashboardModule, 'useManagementDashboard').mockReturnValue({
      readModel: null,
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    } as any);
    vi.spyOn(useAtaManagersModule, 'useAllAtaManagers').mockReturnValue({
      data: {},
      isLoading: false
    } as any);
    vi.spyOn(useAtaManagersModule, 'useArpItemContractLinks').mockReturnValue({
      data: [],
      isLoading: false
    } as any);
  });

  it('1. deve renderizar a rota com cabeçalho "Carteira de Contratos" e subtítulo', () => {
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

    expect(html).toContain('Carteira de Contratos');
    expect(html).toContain('Todos os contratos, com vigência, valor, gestor e pendências em aberto.');
    expect(html).not.toContain('Cockpit');
  });

  it('2. deve renderizar o cabeçalho isolado com botão de atualização', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioHeader onRefresh={vi.fn()} isRefreshing={false} />
    );

    expect(html).toContain('Carteira de Contratos');
    expect(html).toContain('Atualizar');
  });

  it('3. deve renderizar a situação em segmentos com contagem e o valor vigente uma vez', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioSummary
        totalContratos={7}
        vigentes={2}
        criticos={1}
        atencao={1}
        historico={5}
        valorVigenteTotal={2150000}
        activeStatus="VIGENTES"
        onSelectStatus={vi.fn()}
      />
    );

    expect(html).toContain('Vigentes');
    expect(html).toContain('Crítico');
    expect(html).toContain('Atenção');
    expect(html).toContain('Histórico');
    expect(html).toContain('>5<');
    expect(html).toContain('>7<');
    expect((html.match(/em valor vigente/g) || []).length).toBe(1);
  });

  it('4. deve renderizar a barra de filtros com situação, pendência, gestor e busca', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioFilters
        filters={{ status: 'TODOS', pendencia: 'TODOS', unidade: 'TODAS', gestor: 'TODOS', busca: '' }}
        gestores={['Maria Souza']}
        unidades={[{ chave: 'cglic', nome: 'CGLIC' }]}
        onChangeFilter={vi.fn()}
        onResetFilters={vi.fn()}
        totalFiltered={3}
        totalContracts={3}
      />
    );

    expect(html).not.toContain('Todas as Situações');
    expect(html).toContain('contracts-filter-pendencia');
    expect(html).toContain('contracts-filter-unidade');
    expect(html).toContain('contracts-filter-gestor');
    expect(html).toContain('Buscar por contrato, ata, fornecedor, CNPJ...');
    expect(html).toContain('3 contratos');
    expect(html).not.toContain('Todos os Instrumentos');
  });

  it('5. deve renderizar a tabela com colunas operacionais e linhas de contratos', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioTable
        rows={toRows(mockContracts)}
        totalContracts={3}
        onResetFilters={vi.fn()}
      />
    );

    // Cabeçalhos de coluna
    expect(html).toContain('Contrato');
    expect(html).not.toContain('>Fornecedor<');
    expect(html).toContain('Vigência');
    expect(html).toContain('Valor Vigente');
    expect(html).toContain('Pendências');
    expect(html).toContain('Gestor');
    expect(html).not.toContain('Acompanhamento');

    // Registros
    expect(html).toContain('01/2025');
    expect(html).toContain('Empresa Alfa Serviços Ltda');
    expect(html).toContain('02/2024');
    expect(html).toContain('Beta Tecnologia e Inovação S/A');
    expect(html).toContain('03/2023');
    expect(html).toContain('Gamma Locações Comerciais Eireli');

    // Botões de Drill-down
    expect(html).toContain('Ver detalhes do contrato');
  });

  it('5b. mostra a ata de origem ao lado do número: uma ata pelo número, várias pela contagem, nenhuma sem nada', () => {
    const [um, varios, nenhum] = toRows(mockContracts);
    const html = renderToStaticMarkup(
      <ContractsPortfolioTable
        rows={[{ ...um, atas: ['00059/2025'] }, { ...varios, atas: ['00010/2024', '00059/2025'] }, { ...nenhum, atas: [] }]}
        totalContracts={3}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('Ata 00059/2025');
    expect(html).toContain('2 atas');
    expect(html).toContain('title="Atas: 00010/2024, 00059/2025"');
    // Contrato sem ata não ganha rótulo, e o fornecedor continua na segunda linha.
    expect(html).not.toContain(`contracts-ata-${nenhum.contractKey}`);
    expect(html).toContain('Gamma Locações Comerciais Eireli');
  });

  it('6. deve exibir estado vazio quando não há contratos na base', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioTable
        rows={[]}
        totalContracts={0}
        onResetFilters={vi.fn()}
      />
    );

    expect(html).toContain('Nenhum contrato encontrado');
    expect(html).toContain('Não há contratos cadastrados ou sincronizados para as unidades consolidadas.');
  });

  it('7. deve exibir estado de filtro sem resultados com botão de limpar filtros', () => {
    const html = renderToStaticMarkup(
      <ContractsPortfolioTable
        rows={[]}
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

  it('9b. a atribuição é só na Central: na carteira o admin vê o atalho para lá, não o seletor', () => {
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

    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain('atribuir na Central');
    expect(html).not.toContain('Alterar gestor');
  });

  it('10. perfil "gestor" deve ver apenas os contratos onde é o gestor titular (escopo ASSIGNED)', () => {
    vi.spyOn(useContractsDashboardModule, 'useContractsDashboard').mockReturnValue({
      data: mockContracts,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn()
    } as any);

    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'gestor-joao' } as any,
      session: null,
      loading: false,
      role: 'gestor',
      roleStatus: 'ready',
      signOut: vi.fn()
    });

    // Apenas o contrato 200331-00002-2024 tem gestor_user_id = 'gestor-joao'.
    vi.spyOn(useAllContractManagersModule, 'useAllContractManagers').mockReturnValue({
      data: {
        '200331-00001-2025': {
          contractKey: '200331-00001-2025',
          uasg: '200331',
          numero: '00001',
          ano: 2025,
          gestorNome: 'Maria Souza',
          gestorUserId: 'gestor-maria',
          createdAt: '',
          updatedAt: ''
        },
        '200331-00002-2024': {
          contractKey: '200331-00002-2024',
          uasg: '200331',
          numero: '00002',
          ano: 2024,
          gestorNome: 'João Silva',
          gestorUserId: 'gestor-joao',
          createdAt: '',
          updatedAt: ''
        }
      },
      isLoading: false
    } as any);

    const html = renderToStaticMarkup(<ContractsRoute />);

    expect(html).toContain('Beta Tecnologia e Inovação S/A');
    expect(html).not.toContain('Empresa Alfa Serviços Ltda');
    expect(html).not.toContain('Gamma Locações Comerciais Eireli');
  });
});
