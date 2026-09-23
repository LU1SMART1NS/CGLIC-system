import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractWorkflowsSection } from '../ContractWorkflowsSection';
import type { ContractDashboardRecord } from '../../../types';
import * as useContractWorkflowsModule from '../../../hooks/useContractWorkflows';

describe('ContractWorkflowsSection (Fase 5.4 — Container de Workflows no 360°)', () => {
  const mockContract: ContractDashboardRecord = {
    id: '200331-00015-2026',
    numero: '15',
    ano: 2026,
    numeroFormatado: '00015/2026',
    uasg: '200331',
    nomeUnidadeGestora: 'SENASP',
    objeto: 'Serviços de Tecnologia da Informação',
    processo: '08020.001234/2026-11',
    fornecedorNome: 'TechCorp Brasil Ltda',
    fornecedorCnpjCpf: '12.345.678/0001-90',
    valorGlobal: 1200000.0,
    valorInicial: 1200000.0,
    dataAssinatura: '2026-01-10',
    dataVigenciaInicio: '2026-01-15',
    dataVigenciaFim: '2027-01-15',
    statusVigencia: 'Vigente',
    fonteDados: 'Contratos.gov.br'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. deve renderizar skeleton/indicador de loading quando estiver carregando', () => {
    vi.spyOn(useContractWorkflowsModule, 'useContractWorkflows').mockReturnValue({
      workflows: [],
      activeCount: 0,
      completedCount: 0,
      isLoading: true,
      error: null
    });

    const html = renderToStaticMarkup(<ContractWorkflowsSection contract={mockContract} isLoading={true} />);

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Verificando workflows operacionais do contrato...');
  });

  it('2. deve renderizar banner de erro claro caso ocorra falha na obtenção', () => {
    vi.spyOn(useContractWorkflowsModule, 'useContractWorkflows').mockReturnValue({
      workflows: [],
      activeCount: 0,
      completedCount: 0,
      isLoading: false,
      error: new Error('Falha de conexão')
    });

    const html = renderToStaticMarkup(<ContractWorkflowsSection contract={mockContract} />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('Não foi possível carregar os workflows deste contrato');
  });

  it('3. deve renderizar Empty State amigável quando o contrato não tiver workflows ativos ou passíveis', () => {
    vi.spyOn(useContractWorkflowsModule, 'useContractWorkflows').mockReturnValue({
      workflows: [],
      activeCount: 0,
      completedCount: 0,
      isLoading: false,
      error: null
    });

    const html = renderToStaticMarkup(<ContractWorkflowsSection contract={mockContract} />);

    expect(html).toContain('Nenhum workflow operacional em andamento');
    expect(html).toContain('Os processos de Prorrogação');
  });

  it('4. deve renderizar os cards dos workflows existentes com contadores resumidos', () => {
    vi.spyOn(useContractWorkflowsModule, 'useContractWorkflows').mockReturnValue({
      workflows: [
        {
          id: 'WF::PRORROGACAO::200331-00015-2026::VIG_20270115',
          kind: 'PRORROGACAO',
          tipoNomeAmigavel: 'Prorrogação Contratual (Lei 14.133/21)',
          statusRaw: 'EM_ANALISE_INTERESSE',
          statusLabel: 'Em Análise de Interesse',
          statusVariant: 'info',
          isActive: true,
          isCompleted: false,
          hasAttention: false,
          etapaAtual: 'Avaliação de Interesse Público',
          progresso: { concluidas: 1, total: 4, percentual: 25 },
          macroetapas: [
            { id: 'm1', label: '1. Avaliação de Interesse', status: 'CONCLUIDA', ordem: 1 },
            { id: 'm2', label: '2. Vantajosidade', status: 'ATUAL', ordem: 2 }
          ],
          canonicalWorkflow: {} as any
        },
        {
          id: 'WF::ALTERACAO::200331-00015-2026::REAJUSTE::VIG_20270115',
          kind: 'ALTERACAO',
          tipoNomeAmigavel: 'Apostilamento de Reajuste de Preços',
          statusRaw: 'CONCLUIDO_CONFIRMADO',
          statusLabel: 'Concluído e Confirmado',
          statusVariant: 'success',
          isActive: false,
          isCompleted: true,
          hasAttention: false,
          etapaAtual: 'Concluído',
          progresso: { concluidas: 4, total: 4, percentual: 100 },
          macroetapas: [],
          canonicalWorkflow: {} as any
        }
      ],
      activeCount: 1,
      completedCount: 1,
      isLoading: false,
      error: null
    });

    const html = renderToStaticMarkup(<ContractWorkflowsSection contract={mockContract} />);

    expect(html).toContain('2 workflows identificados');
    expect(html).toContain('1 em andamento');
    expect(html).toContain('1 concluído(s)');
    expect(html).toContain('Prorrogação Contratual (Lei 14.133/21)');
    expect(html).toContain('Apostilamento de Reajuste de Preços');
  });
});
