import { describe, it, expect } from 'vitest';
import { calculateAtaTaskPlanProgress } from '../ataManagementService';
import type { AtaTaskMacrotask } from '../../types';

function makeMacrotask(id: string, tasks: Partial<AtaTaskMacrotask['tarefas'][number]>[]): AtaTaskMacrotask {
  return {
    id,
    planId: 'ataplan-1',
    nome: id,
    ordem: 0,
    tarefas: tasks.map((t, idx) => ({
      id: `${id}-t${idx}`,
      macrotaskId: id,
      nome: `Tarefa ${idx}`,
      ordem: idx,
      status: 'PENDENTE',
      criadoEm: '2026-01-01T00:00:00Z',
      atualizadoEm: '2026-01-01T00:00:00Z',
      ...t
    }))
  };
}

describe('calculateAtaTaskPlanProgress', () => {
  it('deve retornar zerado para um plano sem macrotarefas', () => {
    const progresso = calculateAtaTaskPlanProgress([]);
    expect(progresso).toEqual({
      total: 0, concluidas: 0, pendentes: 0, emAndamento: 0, naoAplicaveis: 0, atrasadas: 0, percentual: 0
    });
  });

  it('deve calcular o percentual correto (exemplo: 24 de 31, excluindo NAO_APLICAVEL do denominador)', () => {
    const concluidas = Array.from({ length: 24 }, () => ({ status: 'CONCLUIDA' as const }));
    const pendentes = Array.from({ length: 4 }, () => ({ status: 'PENDENTE' as const }));
    const emAndamento = Array.from({ length: 2 }, () => ({ status: 'EM_ANDAMENTO' as const }));
    const naoAplicaveis = Array.from({ length: 1 }, () => ({ status: 'NAO_APLICAVEL' as const }));

    const macrotarefas = [makeMacrotask('m1', [...concluidas, ...pendentes, ...emAndamento, ...naoAplicaveis])];
    const progresso = calculateAtaTaskPlanProgress(macrotarefas);

    expect(progresso.total).toBe(31);
    expect(progresso.concluidas).toBe(24);
    expect(progresso.pendentes).toBe(4);
    expect(progresso.emAndamento).toBe(2);
    expect(progresso.naoAplicaveis).toBe(1);
    // 24 / (31 - 1 não aplicável) = 24/30 = 80%
    expect(progresso.percentual).toBe(80);
  });

  it('NÃO deve contar tarefas NAO_APLICAVEL no denominador do percentual', () => {
    const macrotarefas = [
      makeMacrotask('m1', [
        { status: 'CONCLUIDA' },
        { status: 'NAO_APLICAVEL' },
        { status: 'NAO_APLICAVEL' }
      ])
    ];
    const progresso = calculateAtaTaskPlanProgress(macrotarefas);
    // 1 concluída / (3 - 2 não aplicáveis) = 1/1 = 100%
    expect(progresso.percentual).toBe(100);
  });

  it('deve identificar tarefas atrasadas (prazo no passado e status ainda aberto)', () => {
    const macrotarefas = [
      makeMacrotask('m1', [
        { status: 'PENDENTE', prazo: '2020-01-01' },
        { status: 'EM_ANDAMENTO', prazo: '2020-01-01' },
        { status: 'CONCLUIDA', prazo: '2020-01-01' }, // concluída não conta como atrasada
        { status: 'PENDENTE', prazo: '2999-01-01' } // futuro, não atrasada
      ])
    ];
    const progresso = calculateAtaTaskPlanProgress(macrotarefas);
    expect(progresso.atrasadas).toBe(2);
  });
});
