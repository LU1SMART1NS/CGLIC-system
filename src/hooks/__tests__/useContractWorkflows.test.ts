import { describe, it, expect } from 'vitest';
import { projectContractWorkflows } from '../useContractWorkflows';
import type { ContractDashboardRecord, ContractTaskPlan } from '../../types';

describe('useContractWorkflows / projectContractWorkflows (Fase 5.4 — Projeção de Workflows Canônicos)', () => {
  const baseContract: ContractDashboardRecord = {
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
    dataVigenciaFim: '2028-12-31', // Muito no futuro (> 180 dias)
    statusVigencia: 'Vigente',
    fonteDados: 'Contratos.gov.br'
  };

  it('1. deve retornar lista vazia para contrato nulo ou indefinido', () => {
    const workflows = projectContractWorkflows(null);
    expect(workflows).toHaveLength(0);
  });

  it('2. deve retornar lista vazia para contrato vigente sem planos e distante do prazo de renovação (> 180d)', () => {
    const workflows = projectContractWorkflows(baseContract);
    expect(workflows).toHaveLength(0);
  });

  it('3. deve projetar workflow de Prorrogação quando o contrato estiver na janela preventiva (<= 180d)', () => {
    // Contrato com vigência terminando em 60 dias a partir da data atual
    const now = new Date();
    const futureDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const yyyy = futureDate.getFullYear();
    const mm = String(futureDate.getMonth() + 1).padStart(2, '0');
    const dd = String(futureDate.getDate()).padStart(2, '0');

    const expiringContract: ContractDashboardRecord = {
      ...baseContract,
      dataVigenciaFim: `${yyyy}-${mm}-${dd}`,
      statusVigencia: 'A Vencer (60d)'
    };

    const workflows = projectContractWorkflows(expiringContract);
    expect(workflows.length).toBeGreaterThanOrEqual(1);

    const prorr = workflows.find(w => w.kind === 'PRORROGACAO');
    expect(prorr).toBeDefined();
    expect(prorr?.tipoNomeAmigavel).toContain('Prorrogação');
    expect(prorr?.isActive).toBe(true);
    expect(prorr?.macroetapas).toHaveLength(4);
    expect(prorr?.id).toContain('WF::PRORROGACAO::200331-00015-2026');
  });

  it('4. deve projetar workflow de Alteração/Acréscimo quando houver plano de tarefas de aditivo aplicado', () => {
    const amendmentPlan: ContractTaskPlan = {
      id: 'plan-amend-1',
      contractKey: baseContract.id,
      uasg: baseContract.uasg,
      numero: baseContract.numero,
      ano: 2026,
      templateId: 'tpl-acrescimo-padrao-14133',
      templateNome: 'Workflow Padrão de Acréscimo Quantitativo (Lei 14.133/21)',
      appliedAt: '2026-09-20T10:00:00Z',
      progresso: {
        total: 4,
        concluidas: 1,
        pendentes: 3,
        emAndamento: 0,
        naoAplicaveis: 0,
        atrasadas: 0,
        percentual: 25
      },
      macrotarefas: [
        {
          id: 'macro-1',
          planId: 'plan-amend-1',
          nome: '1. Instrução Técnica',
          ordem: 1,
          tarefas: [
            {
              id: 'task-1',
              macrotaskId: 'macro-1',
              nome: 'Elaborar Nota Técnica com justificativa da necessidade',
              ordem: 1,
              status: 'CONCLUIDA',
              criadoEm: '2026-09-20T10:00:00Z',
              atualizadoEm: '2026-09-21T10:00:00Z'
            },
            {
              id: 'task-2',
              macrotaskId: 'macro-1',
              nome: 'Verificar limites legais de acréscimo',
              ordem: 2,
              status: 'PENDENTE',
              prazo: '2026-10-15',
              responsavelNome: 'Maria Fiscal',
              criadoEm: '2026-09-20T10:00:00Z',
              atualizadoEm: '2026-09-20T10:00:00Z'
            }
          ]
        }
      ]
    };

    const workflows = projectContractWorkflows(baseContract, amendmentPlan);
    expect(workflows).toHaveLength(1);

    const amend = workflows[0];
    expect(amend.kind).toBe('ALTERACAO');
    expect(amend.tipoNomeAmigavel).toContain('Acréscimo');
    expect(amend.isActive).toBe(true);
    expect(amend.proximaTarefa?.nome).toContain('Verificar limites legais');
    expect(amend.proximaTarefa?.responsavelNome).toBe('Maria Fiscal');
  });

  it('5. deve projetar workflow de Encerramento Regular quando o contrato estiver expirado ou com template de encerramento', () => {
    const expiredContract: ContractDashboardRecord = {
      ...baseContract,
      statusVigencia: 'Expirado',
      dataVigenciaFim: '2025-12-31'
    };

    const workflows = projectContractWorkflows(expiredContract);
    expect(workflows.length).toBeGreaterThanOrEqual(1);

    const close = workflows.find(w => w.kind === 'ENCERRAMENTO');
    expect(close).toBeDefined();
    expect(close?.tipoNomeAmigavel).toContain('Encerramento');
    expect(close?.macroetapas).toHaveLength(3);
    expect(close?.id).toContain('WF::ENCERRAMENTO');
  });

  it('6. deve suportar múltiplos workflows e aplicar ordenação determinística por atenção e atividade', () => {
    // Contrato expirando em 150 dias (Prorrogação ativa sem atenção) e plano de aditivo com tarefa vencida (com atenção)
    const now = new Date();
    const futureDate = new Date(now.getTime() + 150 * 24 * 60 * 60 * 1000);
    const yyyy = futureDate.getFullYear();
    const mm = String(futureDate.getMonth() + 1).padStart(2, '0');
    const dd = String(futureDate.getDate()).padStart(2, '0');

    const multiContract: ContractDashboardRecord = {
      ...baseContract,
      dataVigenciaFim: `${yyyy}-${mm}-${dd}`,
      statusVigencia: 'A Vencer (60d)'
    };

    const amendmentPlan: ContractTaskPlan = {
      id: 'plan-amend-2',
      contractKey: multiContract.id,
      uasg: multiContract.uasg,
      numero: multiContract.numero,
      ano: 2026,
      templateId: 'tpl-reajuste-padrao-14133',
      templateNome: 'Workflow Padrão de Reajuste de Preços',
      appliedAt: '2026-09-20T10:00:00Z',
      progresso: { total: 2, concluidas: 0, pendentes: 2, emAndamento: 0, naoAplicaveis: 0, atrasadas: 1, percentual: 0 },
      macrotarefas: [
        {
          id: 'macro-reaj-1',
          planId: 'plan-amend-2',
          nome: '1. Reajuste',
          ordem: 1,
          tarefas: [
            {
              id: 'task-vencida',
              macrotaskId: 'macro-reaj-1',
              nome: 'Calcular variação do índice IPCA',
              ordem: 1,
              status: 'PENDENTE',
              prazo: '2026-01-01', // Vencida
              criadoEm: '2026-01-01T00:00:00Z',
              atualizadoEm: '2026-01-01T00:00:00Z'
            }
          ]
        }
      ]
    };

    const workflows = projectContractWorkflows(multiContract, amendmentPlan);
    expect(workflows).toHaveLength(2);

    // O workflow com tarefa vencida (Reajuste) deve ser priorizado no topo (Regra 11)
    expect(workflows[0].hasAttention).toBe(true);
    expect(workflows[0].kind).toBe('ALTERACAO');
  });
});
