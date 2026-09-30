import { describe, it, expect } from 'vitest';
import { groupMacrotasksByModule, moduleFromRow } from '../taskPlanModules';

const plan = { templateId: 'tpl-1', templateNome: 'Execução Contratual', appliedAt: '2026-01-01T00:00:00Z' };
const task = (status: string) => ({ status });

describe('moduleFromRow', () => {
  it('retorna undefined sem modulo_id', () => {
    expect(moduleFromRow({ modulo_id: null })).toBeUndefined();
  });

  it('mapeia as colunas modulo_*', () => {
    expect(
      moduleFromRow({ modulo_id: 'mod-1', modulo_template_id: 'tpl-2', modulo_nome: 'Pagamento', modulo_applied_at: '2026-02-01' })
    ).toEqual({ id: 'mod-1', templateId: 'tpl-2', nome: 'Pagamento', appliedAt: '2026-02-01' });
  });
});

describe('groupMacrotasksByModule', () => {
  it('agrupa por módulo, com personalizadas por último e progresso sem "não aplicável"', () => {
    const modA = { id: 'mod-a', nome: 'A' };
    const modB = { id: 'mod-b', nome: 'B' };
    const groups = groupMacrotasksByModule(
      [
        { id: '1', origem: 'MODELO', modulo: modA, tarefas: [task('CONCLUIDA'), task('NAO_APLICAVEL')] },
        { id: '2', origem: 'PERSONALIZADA', tarefas: [task('PENDENTE')] },
        { id: '3', origem: 'MODELO', modulo: modB, tarefas: [task('PENDENTE')] },
        { id: '4', origem: 'MODELO', modulo: modA, tarefas: [task('PENDENTE')] }
      ],
      plan
    );

    expect(groups.map((g) => g.key)).toEqual(['mod-a', 'mod-b', 'personalizadas']);
    expect(groups[0].macrotarefas.map((m) => m.id)).toEqual(['1', '4']);
    expect(groups[0]).toMatchObject({ totalTarefas: 3, aplicaveis: 2, concluidas: 1 });
    expect(groups[2].modulo).toBeUndefined();
  });

  it('etapas de modelo sem módulo caem no modelo original do plano', () => {
    const groups = groupMacrotasksByModule([{ id: '1', origem: 'MODELO', tarefas: [] }], plan);
    expect(groups).toHaveLength(1);
    expect(groups[0].modulo).toMatchObject({ nome: 'Execução Contratual', templateId: 'tpl-1' });
  });
});
