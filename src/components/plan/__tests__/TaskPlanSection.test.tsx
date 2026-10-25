import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ContractTaskPlan } from '../../../types';
import { TaskPlanSection, type TaskPlanController } from '../TaskPlanSection';

const acao = { run: () => undefined, isPending: false, error: null };
const mutacao = () => ({ mutate: () => undefined, isPending: false, error: null });

const controller = (somenteLeitura: boolean): TaskPlanController => ({
  entityKey: '200331-00015-2026',
  gestorNome: 'Fulano',
  labels: {
    semPlanoTitulo: 'Nenhum Modelo de Gestão aplicado a este contrato',
    semPlanoDescricao: 'Aplique um modelo.',
    gestorLabel: 'gestor do contrato',
    herancaMsg: '',
    semGestorMsg: ''
  },
  useUpdateTask: mutacao as unknown as TaskPlanController['useUpdateTask'],
  useDeleteTask: mutacao as unknown as TaskPlanController['useDeleteTask'],
  templates: [{ id: 't1', nome: 'Modelo padrão' }],
  loadingTemplates: false,
  applyTemplate: acao,
  startPlan: acao,
  saveMacrotask: acao,
  deleteMacrotask: acao,
  deleteModule: acao,
  renameModule: acao,
  createTask: acao,
  somenteLeitura
});

const plano: ContractTaskPlan = {
  id: 'p1',
  contractKey: '200331-00015-2026',
  uasg: '200331',
  numero: '00015',
  ano: 2026,
  templateNome: 'Modelo padrão',
  appliedAt: '2026-10-01',
  progresso: { total: 1, concluidas: 1, pendentes: 0, emAndamento: 0, naoAplicaveis: 0, atrasadas: 0, percentual: 100 },
  macrotarefas: [
    {
      id: 'm1',
      planId: 'p1',
      nome: 'Abertura',
      ordem: 1,
      tarefas: [
        {
          id: 't1',
          macrotaskId: 'm1',
          nome: 'Publicar o extrato',
          ordem: 1,
          status: 'CONCLUIDA',
          observacao: 'Publicado no DOU',
          seiNumero: '28451237',
          criadoEm: '2026-10-01',
          atualizadoEm: '2026-10-02'
        }
      ]
    }
  ]
};

const render = (plan: ContractTaskPlan | null, somenteLeitura: boolean) =>
  renderToStaticMarkup(<TaskPlanSection plan={plan} controller={controller(somenteLeitura)} />);

describe('Plano de gestão: consulta só lê (decisão de 25/10/2026)', () => {
  it('gestor e coordenador: status clicável, editar, excluir, aplicar modelo e tarefa nova', () => {
    const html = render(plano, false);
    expect(html).toContain('plan-status-btn');
    expect(html).toContain('Editar prazo e responsável');
    expect(html).toContain('Excluir tarefa');
    expect(html).toContain('Aplicar modelo');
    expect(html).toContain('Renomear etapa');
  });

  it('consulta: vê tarefas, status, número SEI e observação, sem nenhum botão de alterar', () => {
    const html = render(plano, true);
    expect(html).toContain('Publicar o extrato');
    expect(html).toContain('plan-status-leitura');
    expect(html).toContain('Publicado no DOU');
    expect(html).not.toContain('plan-status-btn');
    expect(html).not.toContain('Editar prazo e responsável');
    expect(html).not.toContain('Excluir tarefa');
    expect(html).not.toContain('Aplicar modelo');
    expect(html).not.toContain('Renomear etapa');
    expect(html).not.toContain('Excluir etapa');
  });

  it('consulta sem plano: só o aviso, sem escolher modelo nem começar do zero', () => {
    const html = render(null, true);
    expect(html).toContain('O gestor do contrato ainda não aplicou um Modelo de Gestão.');
    expect(html).not.toContain('Aplicar Modelo');
    expect(html).not.toContain('Começar do zero');
  });
});
