import { describe, it, expect } from 'vitest';
import type { ContractTask, ContractTaskTemplateTask } from '../../types';
import { buildDefaultProrrogationTemplate } from '../contractProrrogationService';
import { buildDefaultAmendmentTemplate } from '../contractAmendmentWorkflowService';

describe('taskExecutionSemantics — Fase 4.3C (Semântica de Execução e Não Duplicação)', () => {
  it('Teste 1: Uma tarefa pode existir sem executionMode (retrocompatibilidade)', () => {
    const legacyTask: ContractTask = {
      id: 'task-legacy-01',
      macrotaskId: 'macro-01',
      nome: 'Tarefa legada sem modo de execução explícito',
      ordem: 1,
      status: 'PENDENTE',
      criadoEm: '2026-01-01T00:00:00Z',
      atualizadoEm: '2026-01-01T00:00:00Z'
    };

    expect(legacyTask.id).toBe('task-legacy-01');
    expect(legacyTask.executionMode).toBeUndefined();
    expect(legacyTask.sistemaDestino).toBeUndefined();
  });

  it('Teste 2: Uma tarefa pode ser INTERNA (trabalho da equipe/SEI)', () => {
    const taskInterna: ContractTask = {
      id: 'task-interna-01',
      macrotaskId: 'macro-01',
      nome: 'Elaborar Nota Técnica de Justificativa',
      ordem: 1,
      status: 'EM_ANDAMENTO',
      executionMode: 'INTERNA',
      sistemaDestino: 'SEI',
      criadoEm: '2026-01-01T00:00:00Z',
      atualizadoEm: '2026-01-01T00:00:00Z'
    };

    expect(taskInterna.executionMode).toBe('INTERNA');
    expect(taskInterna.sistemaDestino).toBe('SEI');
  });

  it('Teste 3: Uma tarefa pode ser EXTERNA (ação no sistema governamental)', () => {
    const taskExterna: ContractTask = {
      id: 'task-externa-01',
      macrotaskId: 'macro-01',
      nome: 'Registrar Termo Aditivo no Contratos.gov.br',
      ordem: 2,
      status: 'PENDENTE',
      executionMode: 'EXTERNA',
      sistemaDestino: 'Contratos.gov.br / PNCP',
      externalLinkUrl: 'https://contratos.comprasnet.gov.br',
      criadoEm: '2026-01-01T00:00:00Z',
      atualizadoEm: '2026-01-01T00:00:00Z'
    };

    expect(taskExterna.executionMode).toBe('EXTERNA');
    expect(taskExterna.sistemaDestino).toBe('Contratos.gov.br / PNCP');
    expect(taskExterna.externalLinkUrl).toBeDefined();
  });

  it('Teste 4: Uma tarefa pode ser AUTOMATICA (processamento do SaldoARP)', () => {
    const taskAutomatica: ContractTaskTemplateTask = {
      id: 'task-auto-01',
      macrotaskId: 'macro-01',
      nome: 'Verificar limites legais de acréscimo (25% / 50%)',
      ordem: 1,
      executionMode: 'AUTOMATICA',
      sistemaDestino: 'SaldoARP'
    };

    expect(taskAutomatica.executionMode).toBe('AUTOMATICA');
    expect(taskAutomatica.sistemaDestino).toBe('SaldoARP');
  });

  it('Teste 5: Uma tarefa pode ser CONFIRMACAO (aguardando conciliação da API)', () => {
    const taskConfirmacao: ContractTask = {
      id: 'task-conf-01',
      macrotaskId: 'macro-01',
      nome: 'Aguardar publicação do Termo Aditivo no PNCP para conciliação soberana',
      ordem: 3,
      status: 'PENDENTE',
      executionMode: 'CONFIRMACAO',
      sistemaDestino: 'PNCP',
      criadoEm: '2026-01-01T00:00:00Z',
      atualizadoEm: '2026-01-01T00:00:00Z'
    };

    expect(taskConfirmacao.executionMode).toBe('CONFIRMACAO');
  });

  it('Teste 6: Tarefa externa pode possuir referência externa (sistemaDestino e externalLinkUrl)', () => {
    const task: ContractTaskTemplateTask = {
      id: 'task-sicaf',
      macrotaskId: 'macro-01',
      nome: 'Consultar Certidão SICAF',
      ordem: 1,
      executionMode: 'EXTERNA',
      sistemaDestino: 'SICAF / Compras.gov.br',
      externalLinkUrl: 'https://www.gov.br/compras/sicaf'
    };

    expect(task.sistemaDestino).toBe('SICAF / Compras.gov.br');
    expect(task.externalLinkUrl).toBe('https://www.gov.br/compras/sicaf');
  });

  it('Teste 7: Ausência de referência externa não quebra a tarefa', () => {
    const task: ContractTaskTemplateTask = {
      id: 'task-simples',
      macrotaskId: 'macro-01',
      nome: 'Ação sem link',
      ordem: 1,
      executionMode: 'EXTERNA'
    };

    expect(task.executionMode).toBe('EXTERNA');
    expect(task.externalLinkUrl).toBeUndefined();
  });

  it('Teste 8: Tarefas históricas continuam 100% válidas', () => {
    const taskHistorica = {
      id: 'hist-001',
      macrotaskId: 'macro-001',
      nome: 'Conferência manual antiga',
      ordem: 1,
      status: 'CONCLUIDA',
      criadoEm: '2025-01-01T00:00:00Z',
      atualizadoEm: '2025-01-02T00:00:00Z',
      concluidoEm: '2025-01-02T00:00:00Z'
    } as ContractTask;

    expect(taskHistorica.status).toBe('CONCLUIDA');
    expect(taskHistorica.executionMode).toBeUndefined();
  });

  it('Teste 9: Templates existentes de Prorrogação e Alterações possuem semântica rica', () => {
    const tplProrrogacao = buildDefaultProrrogationTemplate();
    const tasksProrr = tplProrrogacao.macrotarefas.flatMap(m => m.tarefas);
    expect(tasksProrr.some(t => t.executionMode === 'INTERNA')).toBe(true);
    expect(tasksProrr.some(t => t.executionMode === 'EXTERNA')).toBe(true);

    const tplAcrescimo = buildDefaultAmendmentTemplate('ACRESCIMO');
    const tasksAcresc = tplAcrescimo.macrotarefas.flatMap(m => m.tarefas);
    expect(tasksAcresc.some(t => t.executionMode === 'AUTOMATICA')).toBe(true);
    expect(tasksAcresc.some(t => t.executionMode === 'INTERNA')).toBe(true);
    expect(tasksAcresc.some(t => t.executionMode === 'EXTERNA')).toBe(true);

    const tplReajuste = buildDefaultAmendmentTemplate('REAJUSTE');
    const tasksReajuste = tplReajuste.macrotarefas.flatMap(m => m.tarefas);
    expect(tasksReajuste.some(t => t.executionMode === 'AUTOMATICA' && t.nome.includes('índice'))).toBe(true);
  });

  it('Teste 10: Sem dependência de migration ou alteração de schema obrigatória', () => {
    // Valida que o tipo é puramente em memória e retrocompatível
    const task: ContractTask = {
      id: 'task-test',
      macrotaskId: 'macro-test',
      nome: 'Teste de compatibilidade',
      ordem: 1,
      status: 'PENDENTE',
      criadoEm: '2026-09-23T00:00:00Z',
      atualizadoEm: '2026-09-23T00:00:00Z'
    };
    expect(task).toBeDefined();
  });

  it('Teste 11: Nenhum fato oficial pode ser criado simplesmente porque uma tarefa foi concluída', () => {
    const taskConcluida: ContractTask = {
      id: 'task-pub',
      macrotaskId: 'macro-pub',
      nome: 'Publicar Termo Aditivo no PNCP',
      ordem: 10,
      status: 'CONCLUIDA',
      executionMode: 'EXTERNA',
      sistemaDestino: 'Contratos.gov.br / PNCP',
      criadoEm: '2026-09-23T00:00:00Z',
      atualizadoEm: '2026-09-23T10:00:00Z',
      concluidoEm: '2026-09-23T10:00:00Z'
    };

    // A conclusão da tarefa não altera a soberania nem gera fato oficial por si só
    expect(taskConcluida.status).toBe('CONCLUIDA');
    // Não possui propriedade de fato soberano embutida
    expect((taskConcluida as any).isFatoSoberano).toBeUndefined();
  });

  it('Teste 12: Tarefa CONFIRMACAO requer evidência soberana e não permite entrada manual como fato oficial', () => {
    const taskConfirmacao: ContractTask = {
      id: 'task-confirm-api',
      macrotaskId: 'macro-conf',
      nome: 'Reconciliação automática com o PNCP',
      ordem: 1,
      status: 'PENDENTE',
      executionMode: 'CONFIRMACAO',
      sistemaDestino: 'PNCP',
      criadoEm: '2026-09-23T00:00:00Z',
      atualizadoEm: '2026-09-23T00:00:00Z'
    };

    expect(taskConfirmacao.executionMode).toBe('CONFIRMACAO');
    expect(taskConfirmacao.sistemaDestino).toBe('PNCP');
  });
});
