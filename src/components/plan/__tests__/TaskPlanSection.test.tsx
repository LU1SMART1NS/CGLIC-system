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
  useMarcarPedido: mutacao as unknown as TaskPlanController['useMarcarPedido'],
  useRegistrarResposta: mutacao as unknown as TaskPlanController['useRegistrarResposta'],
  useAjustarPrazo: mutacao as unknown as TaskPlanController['useAjustarPrazo'],
  useAtualizarModulo: mutacao as unknown as TaskPlanController['useAtualizarModulo'],
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

describe('Plano do gestor: ação, marcas do orientar e contadores (modelo de gestão da CCGA)', () => {
  const planoCcga: ContractTaskPlan = {
    ...plano,
    progresso: { total: 3, concluidas: 0, pendentes: 2, emAndamento: 1, naoAplicaveis: 0, atrasadas: 0, percentual: 0 },
    macrotarefas: [
      {
        id: 'm1',
        planId: 'p1',
        nome: 'Prorrogação',
        ordem: 1,
        modulo: { id: 'mod1', nome: 'Prorrogação do contrato', processoTipo: 'Processo do pregão', ancoraData: '2026-10-13' },
        tarefas: [
          {
            id: 'a',
            macrotaskId: 'm1',
            nome: 'Pedir à requisitante a manifestação',
            ordem: 1,
            status: 'PENDENTE',
            acao: 'ORIENTAR',
            comQuem: 'Requisitante',
            lista: ['Interesse na prorrogação', 'Justificativa'],
            prazo: '2028-01-02',
            prazoAncora: 'VIGENCIA_FIM',
            prazoDias: -180,
            prazoTexto: 'D−180',
            criadoEm: 'x',
            atualizadoEm: 'x'
          },
          {
            id: 'b',
            macrotaskId: 'm1',
            nome: 'Pedir ao ComprasSusp a pesquisa',
            ordem: 2,
            status: 'EM_ANDAMENTO',
            acao: 'ORIENTAR',
            prazo: '2028-01-10',
            pedidoEnviadoEm: '2028-01-05',
            prazoResposta: '2028-02-20',
            criadoEm: 'x',
            atualizadoEm: 'x'
          },
          {
            id: 'c',
            macrotaskId: 'm1',
            nome: 'Acompanhar a nota de empenho',
            ordem: 3,
            status: 'PENDENTE',
            acao: 'ACOMPANHAR',
            comQuem: 'CGOFI',
            criadoEm: 'x',
            atualizadoEm: 'x'
          }
        ]
      }
    ]
  };

  it('mostra a ação, o com quem, a regra, a lista e os botões do orientar', () => {
    const html = render(planoCcga, false);
    expect(html).toContain('data-testid="plan-acao"');
    expect(html).toContain('Orientar');
    expect(html).toContain('Requisitante');
    expect(html).toContain('Acompanhar');
    expect(html).toContain('· D−180');
    expect(html).toContain('O que pedir (2)');
    expect(html).toContain('Pedido enviado');
    expect(html).toContain('Resposta recebida');
    expect(html).toContain('Resposta até 20/02/2028');
  });

  it('conta comigo agora, aguardando e fecha sozinha', () => {
    const html = render(planoCcga, false);
    expect(html).toContain('data-testid="plan-contadores"');
    expect(html).toMatch(/>1<\/span><span[^>]*>Comigo agora/);
    expect(html).toMatch(/>1<\/span><span[^>]*>Aguardando resposta/);
    expect(html).toMatch(/>1<\/span><span[^>]*>Fecha sozinha/);
    expect(html).toMatch(/>0<\/span><span[^>]*>Cobrar resposta/);
  });

  it('mostra o processo SEI do módulo e a data de partida', () => {
    const html = render(planoCcga, false);
    expect(html).toContain('data-testid="plan-modulo-dados"');
    expect(html).toContain('Processo do pregão');
    expect(html).toContain('Partida: 13/10/2026');
    expect(html).toContain('Informar processo');
  });

  it('consulta vê a ação e a lista, sem as marcas do orientar nem alterar o módulo', () => {
    const html = render(planoCcga, true);
    expect(html).toContain('Orientar');
    expect(html).toContain('O que pedir (2)');
    expect(html).not.toContain('Pedido enviado');
    expect(html).not.toContain('Informar processo');
  });
});
