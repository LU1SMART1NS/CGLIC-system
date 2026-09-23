import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractWorkflowCard } from '../ContractWorkflowCard';
import type { ContractWorkflowPresentationItem } from '../../../hooks/useContractWorkflows';

describe('ContractWorkflowCard (Fase 5.4 — Card Operacional do Workflow)', () => {
  const mockWorkflow: ContractWorkflowPresentationItem = {
    id: 'WF::PRORROGACAO::200331-00015-2026::VIG_20270115',
    kind: 'PRORROGACAO',
    tipoNomeAmigavel: 'Prorrogação Contratual (Lei 14.133/21)',
    statusRaw: 'EM_ANALISE_INTERESSE',
    statusLabel: 'Em Análise de Interesse',
    statusVariant: 'info',
    isActive: true,
    isCompleted: false,
    hasAttention: true,
    etapaAtual: 'Avaliação de Interesse e Consulta à Contratada',
    progresso: {
      concluidas: 1,
      total: 4,
      percentual: 25
    },
    macroetapas: [
      { id: 'm1', label: '1. Avaliação de Interesse', status: 'CONCLUIDA', ordem: 1 },
      { id: 'm2', label: '2. Vantajosidade', status: 'ATUAL', ordem: 2 },
      { id: 'm3', label: '3. Minuta Jurídica', status: 'FUTURA', ordem: 3 },
      { id: 'm4', label: '4. Publicação PNCP', status: 'FUTURA', ordem: 4 }
    ],
    proximaAcao: 'Consultar manifestação prévia da contratada',
    proximaTarefa: {
      id: 'task-101',
      nome: 'Expedir Ofício de Consulta de Interesse à Contratada',
      responsavelNome: 'Carlos Gestor',
      prazo: '2026-10-20',
      atencaoNivel: 'URGENTE',
      diasRestantes: 5
    },
    responsavelNome: 'Carlos Gestor',
    prazoLimite: '2027-01-15',
    processoSeiNumero: '08020.001234/2026-11',
    canonicalWorkflow: {} as any
  };

  it('1. deve renderizar corretamente o cabeçalho com nome amigável, ID e badges', () => {
    const html = renderToStaticMarkup(<ContractWorkflowCard workflow={mockWorkflow} />);

    expect(html).toContain('Prorrogação Contratual (Lei 14.133/21)');
    expect(html).toContain('WF::PRORROGACAO::200331-00015-2026::VIG_20270115');
    expect(html).toContain('Em Análise de Interesse');
    expect(html).toContain('Em Andamento');
    expect(html).toContain('Atenção');
  });

  it('2. deve exibir a etapa atual, progresso e metadados operacionais (responsável, SEI, prazo)', () => {
    const html = renderToStaticMarkup(<ContractWorkflowCard workflow={mockWorkflow} />);

    expect(html).toContain('Avaliação de Interesse e Consulta à Contratada');
    expect(html).toContain('1 de 4 macroetapas (25%)');
    expect(html).toContain('Carlos Gestor');
    expect(html).toContain('08020.001234/2026-11');
    expect(html).toContain('2027-01-15');
    expect(html).toContain('Consultar manifestação prévia da contratada');
  });

  it('3. deve projetar a próxima tarefa operacional vinculada sem criar segundo task engine', () => {
    const html = renderToStaticMarkup(<ContractWorkflowCard workflow={mockWorkflow} />);

    expect(html).toContain('Próxima Tarefa do Plano');
    expect(html).toContain('Expedir Ofício de Consulta de Interesse à Contratada');
    expect(html).toContain('Prazo: 2026-10-20');
  });
});
