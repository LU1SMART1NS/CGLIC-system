import { describe, it, expect } from 'vitest';
import { getContractManagementKey, calculateContractTaskPlanProgress } from '../contractManagementService';
import type { ContractTaskMacrotask } from '../../types';

function makeMacrotask(id: string, tasks: Partial<ContractTaskMacrotask['tarefas'][number]>[]): ContractTaskMacrotask {
  return {
    id,
    planId: 'plan-1',
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

describe('getContractManagementKey', () => {
  // NOTA: estes dois testes usam '15' (número sintético, sem "/ano") de
  // propósito — exercitam o ramo FALLBACK de resolveContractKey, que
  // preserva o número original sem reformatar. Continuam válidos após a
  // unificação com contractKeyUtils.resolveContractKey (ver esse módulo).
  it('deve derivar a chave canônica no formato {uasg}-{numero}-{ano} (número sintético sem "/")', () => {
    expect(getContractManagementKey('200331', '15', 2026)).toBe('200331-15-2026');
  });

  it('deve normalizar espaços em branco', () => {
    expect(getContractManagementKey(' 200331 ', ' 15 ', 2026)).toBe('200331-15-2026');
  });

  it('REGRESSÃO — número real com "/" deve derivar o ano do NÚMERO, ignorando um `ano` divergente informado pelo chamador', () => {
    // Caso real: contract.numero = "00012/2016" (formato bruto vindo da API),
    // mas algum chamador antigo poderia informar `ano` incorreto (ex.: 2018,
    // vindo de um cálculo baseado em data_assinatura). O ano do número deve
    // prevalecer sempre que for determinístico.
    expect(getContractManagementKey('200331', '00012/2016', 2018)).toBe('200331-00012-2016');
  });

  it('deve derivar a chave para número no formato de Nota de Empenho direta (NE)', () => {
    expect(getContractManagementKey('200331', '2021NE000171', 2020)).toBe('200331-NE00171-2021');
  });
});

describe('calculateContractTaskPlanProgress', () => {
  it('deve retornar zerado para um plano sem macrotarefas', () => {
    const progresso = calculateContractTaskPlanProgress([]);
    expect(progresso).toEqual({
      total: 0, concluidas: 0, pendentes: 0, emAndamento: 0, naoAplicaveis: 0, atrasadas: 0, percentual: 0
    });
  });

  it('deve calcular o percentual correto (exemplo do mockup: 24 de 31 = 78%)', () => {
    const concluidas = Array.from({ length: 24 }, () => ({ status: 'CONCLUIDA' as const }));
    const pendentes = Array.from({ length: 4 }, () => ({ status: 'PENDENTE' as const }));
    const emAndamento = Array.from({ length: 2 }, () => ({ status: 'EM_ANDAMENTO' as const }));
    const naoAplicaveis = Array.from({ length: 1 }, () => ({ status: 'NAO_APLICAVEL' as const }));

    const macrotarefas = [makeMacrotask('m1', [...concluidas, ...pendentes, ...emAndamento, ...naoAplicaveis])];
    const progresso = calculateContractTaskPlanProgress(macrotarefas);

    expect(progresso.total).toBe(31);
    expect(progresso.concluidas).toBe(24);
    expect(progresso.pendentes).toBe(4);
    expect(progresso.emAndamento).toBe(2);
    expect(progresso.naoAplicaveis).toBe(1);
    // 24 / (31 - 1 não aplicável) = 24/30 = 80% (o denominador exclui NAO_APLICAVEL)
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
    const progresso = calculateContractTaskPlanProgress(macrotarefas);
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
    const progresso = calculateContractTaskPlanProgress(macrotarefas);
    expect(progresso.atrasadas).toBe(2);
  });
});
