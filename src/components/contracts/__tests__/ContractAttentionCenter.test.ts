import { describe, it, expect } from 'vitest';
import type { ContractTask, ContractTaskPlan } from '../../../types';
import {
  classifyTaskAttention,
  getExecutionModeDisplay,
  type AttentionItem
} from '../ContractAttentionCenter';
import { addDays, formatDateISO } from '../../../services/temporalEngineService';

describe('Fase 5.2 — Central de Atenção e Tarefas do Contrato 360°', () => {
  describe('1. Classificação Temporal de Tarefas (classifyTaskAttention)', () => {
    it('deve classificar tarefa com prazo no passado como VENCIDA', () => {
      const pastDate = addDays(new Date(), -3);
      const task: ContractTask = {
        id: 'task-1',
        macrotaskId: 'macro-1',
        nome: 'Apresentar certidão negativa',
        ordem: 1,
        status: 'PENDENTE',
        prazo: formatDateISO(pastDate),
        criadoEm: '2026-09-01T00:00:00Z',
        atualizadoEm: '2026-09-01T00:00:00Z'
      };

      const result = classifyTaskAttention(task);
      expect(result.level).toBe('VENCIDA');
      expect(result.diasRestantes).toBeLessThan(0);
    });

    it('deve classificar tarefa vencendo hoje como HOJE', () => {
      const today = new Date();
      const task: ContractTask = {
        id: 'task-2',
        macrotaskId: 'macro-1',
        nome: 'Assinar termo aditivo',
        ordem: 2,
        status: 'EM_ANDAMENTO',
        prazo: formatDateISO(today),
        criadoEm: '2026-09-01T00:00:00Z',
        atualizadoEm: '2026-09-01T00:00:00Z'
      };

      const result = classifyTaskAttention(task);
      expect(result.level).toBe('HOJE');
      expect(result.diasRestantes).toBe(0);
    });

    it('deve classificar tarefa em até 7 dias como URGENTE', () => {
      const nearFuture = addDays(new Date(), 4);
      const task: ContractTask = {
        id: 'task-3',
        macrotaskId: 'macro-1',
        nome: 'Pesquisa de preços para prorrogação',
        ordem: 3,
        status: 'PENDENTE',
        prazo: formatDateISO(nearFuture),
        criadoEm: '2026-09-01T00:00:00Z',
        atualizadoEm: '2026-09-01T00:00:00Z'
      };

      const result = classifyTaskAttention(task);
      expect(result.level).toBe('URGENTE');
      expect(result.diasRestantes).toBeGreaterThan(0);
      expect(result.diasRestantes).toBeLessThanOrEqual(7);
    });

    it('deve classificar tarefa entre 8 e 30 dias como PROXIMA', () => {
      const futureDate = addDays(new Date(), 15);
      const task: ContractTask = {
        id: 'task-4',
        macrotaskId: 'macro-1',
        nome: 'Elaborar nota técnica',
        ordem: 4,
        status: 'PENDENTE',
        prazo: formatDateISO(futureDate),
        criadoEm: '2026-09-01T00:00:00Z',
        atualizadoEm: '2026-09-01T00:00:00Z'
      };

      const result = classifyTaskAttention(task);
      expect(result.level).toBe('PROXIMA');
      expect(result.diasRestantes).toBeGreaterThan(7);
      expect(result.diasRestantes).toBeLessThanOrEqual(30);
    });

    it('deve classificar tarefa sem prazo como SEM_PRAZO', () => {
      const task: ContractTask = {
        id: 'task-5',
        macrotaskId: 'macro-1',
        nome: 'Tarefa sem deadline fixado',
        ordem: 5,
        status: 'PENDENTE',
        criadoEm: '2026-09-01T00:00:00Z',
        atualizadoEm: '2026-09-01T00:00:00Z'
      };

      const result = classifyTaskAttention(task);
      expect(result.level).toBe('SEM_PRAZO');
      expect(result.diasRestantes).toBeNull();
    });
  });

  describe('2. Semântica de Execução (TaskExecutionMode — getExecutionModeDisplay)', () => {
    it('deve mapear INTERNA para "Providência Interna"', () => {
      const display = getExecutionModeDisplay('INTERNA');
      expect(display.label).toBe('Providência Interna');
    });

    it('deve mapear EXTERNA para "Ação Externa"', () => {
      const display = getExecutionModeDisplay('EXTERNA');
      expect(display.label).toBe('Ação Externa');
    });

    it('deve mapear AUTOMATICA para "Processamento Automático"', () => {
      const display = getExecutionModeDisplay('AUTOMATICA');
      expect(display.label).toBe('Processamento Automático');
    });

    it('deve mapear CONFIRMACAO para "Confirmação Oficial"', () => {
      const display = getExecutionModeDisplay('CONFIRMACAO');
      expect(display.label).toBe('Confirmação Oficial');
    });
  });

  describe('3. Filtragem e Ordenação por Prioridade na Central de Atenção', () => {
    it('deve filtrar tarefas concluídas e não aplicáveis da Central de Atenção e ordenar vencidas no topo', () => {
      const pastDate = addDays(new Date(), -2);
      const nearDate = addDays(new Date(), 3);
      const futureDate = addDays(new Date(), 20);

      const mockPlan: ContractTaskPlan = {
        id: 'plan-1',
        contractKey: '200331-00015-2026',
        uasg: '200331',
        numero: '15/2026',
        ano: 2026,
        templateNome: 'Modelo Contratos Contínuos',
        appliedAt: '2026-09-01T00:00:00Z',
        progresso: {
          total: 5,
          concluidas: 1,
          pendentes: 3,
          emAndamento: 0,
          naoAplicaveis: 1,
          atrasadas: 1,
          percentual: 25
        },
        macrotarefas: [
          {
            id: 'macro-1',
            planId: 'plan-1',
            nome: '1. Instrução Preliminar',
            ordem: 1,
            tarefas: [
              {
                id: 't-concluida',
                macrotaskId: 'macro-1',
                nome: 'Tarefa já finalizada',
                ordem: 1,
                status: 'CONCLUIDA',
                prazo: formatDateISO(pastDate),
                criadoEm: '2026-09-01T00:00:00Z',
                atualizadoEm: '2026-09-01T00:00:00Z'
              },
              {
                id: 't-nao-aplicavel',
                macrotaskId: 'macro-1',
                nome: 'Tarefa dispensada',
                ordem: 2,
                status: 'NAO_APLICAVEL',
                criadoEm: '2026-09-01T00:00:00Z',
                atualizadoEm: '2026-09-01T00:00:00Z'
              },
              {
                id: 't-futura',
                macrotaskId: 'macro-1',
                nome: 'Elaboração de minuta futura',
                ordem: 3,
                status: 'PENDENTE',
                prazo: formatDateISO(futureDate),
                executionMode: 'INTERNA',
                criadoEm: '2026-09-01T00:00:00Z',
                atualizadoEm: '2026-09-01T00:00:00Z'
              },
              {
                id: 't-vencida',
                macrotaskId: 'macro-1',
                nome: 'Notificação com prazo expirado',
                ordem: 4,
                status: 'PENDENTE',
                prazo: formatDateISO(pastDate),
                executionMode: 'INTERNA',
                criadoEm: '2026-09-01T00:00:00Z',
                atualizadoEm: '2026-09-01T00:00:00Z'
              },
              {
                id: 't-urgente',
                macrotaskId: 'macro-1',
                nome: 'Pesquisa de mercado urgente',
                ordem: 5,
                status: 'PENDENTE',
                prazo: formatDateISO(nearDate),
                executionMode: 'EXTERNA',
                sistemaDestino: 'Painel de Preços',
                criadoEm: '2026-09-01T00:00:00Z',
                atualizadoEm: '2026-09-01T00:00:00Z'
              }
            ]
          }
        ]
      };

      // Simulação da lógica de extração e ordenação do componente
      const items: AttentionItem[] = [];
      for (const macro of mockPlan.macrotarefas) {
        for (const t of macro.tarefas) {
          if (t.status !== 'CONCLUIDA' && t.status !== 'NAO_APLICAVEL') {
            const { level, diasRestantes } = classifyTaskAttention(t);
            items.push({
              task: t,
              macrotaskName: macro.nome,
              level,
              diasRestantes
            });
          }
        }
      }

      const priorityWeights = { VENCIDA: 1, HOJE: 2, URGENTE: 3, PROXIMA: 4, SEM_PRAZO: 5 };
      items.sort((a, b) => priorityWeights[a.level] - priorityWeights[b.level]);

      expect(items).toHaveLength(3);
      expect(items[0].task.id).toBe('t-vencida');
      expect(items[0].level).toBe('VENCIDA');
      expect(items[1].task.id).toBe('t-urgente');
      expect(items[1].level).toBe('URGENTE');
      expect(items[2].task.id).toBe('t-futura');
      expect(items[2].level).toBe('PROXIMA');
    });
  });
});
