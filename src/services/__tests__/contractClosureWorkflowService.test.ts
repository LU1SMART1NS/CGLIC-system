import { describe, it, expect } from 'vitest';
import {
  generateClosureWorkflowId,
  buildConditionalClosureTemplate,
  deriveClosureWorkflowStatus,
  assembleClosureWorkflow,
  confirmClosureWorkflowOfficially
} from '../contractClosureWorkflowService';
import type { ContractDashboardRecord } from '../../types';

describe('contractClosureWorkflowService — Fase 4.4B (Workflow Mínimo de Encerramento Regular)', () => {
  const mockContractVigente: ContractDashboardRecord = {
    id: 'CTR-2026-001',
    numero: '01/2026',
    ano: 2026,
    numeroFormatado: '00001/2026',
    uasg: '200005',
    nomeOrgao: 'SENASP/MJSP',
    fornecedorNome: 'EMPRESA SERVICOS LTDA',
    fornecedorCnpjCpf: '12.345.678/0001-90',
    objeto: 'Serviços contínuos de limpeza predial',
    valorGlobal: 300000.0,
    valorInicial: 300000.0,
    dataVigenciaInicio: '2026-01-01',
    dataVigenciaFim: '2026-12-31',
    statusVigencia: 'Vigente',
    processo: '08001.000123/2026-11',
    fonteDados: 'PNCP'
  };

  const mockContractExpirado: ContractDashboardRecord = {
    ...mockContractVigente,
    id: 'CTR-2025-099',
    numero: '99/2025',
    ano: 2025,
    dataVigenciaInicio: '2025-01-01',
    dataVigenciaFim: '2025-12-31',
    statusVigencia: 'Expirado'
  };

  describe('1. Identidade e Idempotência', () => {
    it('deve gerar chave lógica determinística canônica para o workflow de encerramento', () => {
      const id = generateClosureWorkflowId('CTR-2025-099', 'VIG_20251231');
      expect(id).toBe('WF::ENCERRAMENTO::CTR-2025-099::VIG_20251231');
    });

    it('deve suportar identificador customizado para desambiguação em múltiplos ciclos', () => {
      const id = generateClosureWorkflowId('CTR-2025-099', 'VIG_20251231', 'TERMO-01');
      expect(id).toBe('WF::ENCERRAMENTO::CTR-2025-099::VIG_20251231::TERMO-01');
    });

    it('deve garantir idempotência sem UUIDs voláteis', () => {
      const id1 = generateClosureWorkflowId('CTR-001', 'VIG_20261231');
      const id2 = generateClosureWorkflowId('CTR-001', 'VIG_20261231');
      expect(id1).toBe(id2);
    });
  });

  describe('2. Template Condicional e Princípio de Simplicidade (Testes 8, 20, 21, 22 e 23)', () => {
    it('TESTE ESPECIAL DE SIMPLICIDADE: Contrato sem pendências não recebe tarefas artificiais de pendências', () => {
      const tpl = buildConditionalClosureTemplate({
        objetoRecebidoDefinitivo: true,
        termoRecebimentoDefinitivoSei: 'SEI-123456',
        pagamentosPendentes: false,
        garantiaExigida: false,
        pendenciasTrabalhistasFiscais: false
      });

      // Apenas formalização externa e confirmação (sem macro 1 de pendências artificiais)
      expect(tpl.macrotarefas).toHaveLength(2);
      expect(tpl.macrotarefas[0].nome).toContain('Formalização do Encerramento');
      expect(tpl.macrotarefas[1].nome).toContain('Confirmação Oficial');

      const allTasks = tpl.macrotarefas.flatMap(m => m.tarefas);
      expect(allTasks).toHaveLength(2);
      expect(allTasks.some(t => t.nome.includes('Garantia'))).toBe(false);
      expect(allTasks.some(t => t.nome.includes('TRD'))).toBe(false);
    });

    it('deve criar tarefa de TRD apenas se o recebimento definitivo estiver pendente', () => {
      const tpl = buildConditionalClosureTemplate({
        objetoRecebidoDefinitivo: false,
        pagamentosPendentes: false
      });

      const allTasks = tpl.macrotarefas.flatMap(m => m.tarefas);
      const trdTask = allTasks.find(t => t.id === 'task-close-trd');
      expect(trdTask).toBeDefined();
      expect(trdTask?.executionMode).toBe('INTERNA');
      expect(trdTask?.sistemaDestino).toBe('SEI');
    });

    it('deve criar tarefa de garantia apenas se a garantia for exigida e não liberada', () => {
      const tplComGarantia = buildConditionalClosureTemplate({
        objetoRecebidoDefinitivo: true,
        garantiaExigida: true,
        garantiaLiberada: false
      });
      const allTasks = tplComGarantia.macrotarefas.flatMap(m => m.tarefas);
      expect(allTasks.some(t => t.id === 'task-close-garantia')).toBe(true);

      const tplSemGarantia = buildConditionalClosureTemplate({
        objetoRecebidoDefinitivo: true,
        garantiaExigida: false
      });
      const allTasksSem = tplSemGarantia.macrotarefas.flatMap(m => m.tarefas);
      expect(allTasksSem.some(t => t.id === 'task-close-garantia')).toBe(false);
    });

    it('deve aplicar TaskExecutionMode adequadamente nas tarefas geradas', () => {
      const tpl = buildConditionalClosureTemplate({
        objetoRecebidoDefinitivo: false,
        pagamentosPendentes: true
      });

      const tasks = tpl.macrotarefas.flatMap(m => m.tarefas);
      expect(tasks.some(t => t.executionMode === 'INTERNA')).toBe(true);
      expect(tasks.some(t => t.executionMode === 'EXTERNA')).toBe(true);
      expect(tasks.some(t => t.executionMode === 'CONFIRMACAO')).toBe(true);
    });
  });

  describe('3. Derivação de Estados Operacionais (Testes 1 a 7, 11 e 12)', () => {
    it('deve retornar NAO_INICIADO para contrato vigente sem início de workflow', () => {
      const status = deriveClosureWorkflowStatus({
        contract: mockContractVigente,
        workflow: {}
      });
      expect(status).toBe('NAO_INICIADO');
    });

    it('deve retornar EM_ANALISE para contrato expirado sem pendências cadastradas ainda', () => {
      const status = deriveClosureWorkflowStatus({
        contract: mockContractExpirado,
        workflow: {
          checklist: { objetoRecebidoDefinitivo: true }
        }
      });
      expect(status).toBe('EM_ANALISE');
    });

    it('deve retornar COM_PENDENCIAS quando houver pendências impeditivas (TRD pendente)', () => {
      const status = deriveClosureWorkflowStatus({
        contract: mockContractExpirado,
        workflow: {
          checklist: { objetoRecebidoDefinitivo: false }
        }
      });
      expect(status).toBe('COM_PENDENCIAS');
    });

    it('deve retornar EM_FORMALIZACAO quando formalização ou despacho for iniciado', () => {
      const status = deriveClosureWorkflowStatus({
        contract: mockContractExpirado,
        workflow: {
          formalizacao: { dataAssinatura: '2026-01-10' }
        }
      });
      expect(status).toBe('EM_FORMALIZACAO');
    });

    it('deve retornar CONCLUIDO_INTERNAMENTE quando houver deliberação administrativa interna', () => {
      const status = deriveClosureWorkflowStatus({
        contract: mockContractExpirado,
        workflow: {
          decisao: {
            status: 'CONCLUIDO_INTERNAMENTE',
            decididoPor: 'Gestor de Contratos'
          }
        }
      });
      expect(status).toBe('CONCLUIDO_INTERNAMENTE');
    });

    it('deve retornar AGUARDANDO_CONFIRMACAO quando houver publicação oficial informada', () => {
      const status = deriveClosureWorkflowStatus({
        contract: mockContractExpirado,
        workflow: {
          formalizacao: { dataPublicacao: '2026-01-15', numeroPublicacaoPncpDoi: 'PNCP-123' }
        }
      });
      expect(status).toBe('AGUARDANDO_CONFIRMACAO');
    });

    it('deve retornar CONCLUIDO_OFICIALMENTE apenas com confirmação da fonte oficial', () => {
      const status = deriveClosureWorkflowStatus({
        contract: mockContractExpirado,
        workflow: {
          confirmacaoOficial: { confirmado: true, fonteOficial: 'PNCP' }
        }
      });
      expect(status).toBe('CONCLUIDO_OFICIALMENTE');
    });
  });

  describe('4. Montagem e Confirmação Oficial Soberana (Testes 13 a 19)', () => {
    it('deve instanciar o workflow preservando separação de decisão interna vs fato oficial', () => {
      const wf = assembleClosureWorkflow({
        contract: mockContractExpirado,
        checklist: {
          objetoRecebidoDefinitivo: true,
          termoRecebimentoDefinitivoSei: 'SEI-123456',
          pagamentosPendentes: false,
          garantiaExigida: true,
          garantiaLiberada: true
        },
        decisao: {
          status: 'CONCLUIDO_INTERNAMENTE',
          decididoEm: '2026-01-10',
          decididoPor: 'Comissão de Fiscalização'
        },
        processoSeiNumero: '08001.000123/2026-11'
      });

      expect(wf.workflowId).toBe('WF::ENCERRAMENTO::CTR-2025-099::VIG_20251231');
      expect(wf.status).toBe('CONCLUIDO_INTERNAMENTE');
      expect(wf.oficialidade.isFatoSoberano).toBe(false);
      expect(wf.confirmacaoOficial.confirmado).toBe(false);
    });

    it('deve concluir o workflow oficialmente e emitir ContractEvent soberano com impacto EXTINGUE_CONTRATO', () => {
      const initialWf = assembleClosureWorkflow({
        contract: mockContractExpirado,
        checklist: { objetoRecebidoDefinitivo: true },
        formalizacao: {
          numeroTermo: 'TRD nº 01/2026',
          dataAssinatura: '2026-01-10',
          dataPublicacao: '2026-01-15',
          numeroPublicacaoPncpDoi: 'PNCP-TRD-2026-01'
        }
      });

      const { updatedWorkflow, updatedContract, event } = confirmClosureWorkflowOfficially({
        workflow: initialWf,
        contract: mockContractExpirado,
        fonteOficial: 'PNCP',
        numeroControlePncp: 'PNCP-TRD-2026-01',
        dataConfirmacao: '2026-01-15T10:00:00Z'
      });

      expect(updatedWorkflow.status).toBe('CONCLUIDO_OFICIALMENTE');
      expect(updatedWorkflow.confirmacaoOficial.confirmado).toBe(true);
      expect(updatedWorkflow.oficialidade.isFatoSoberano).toBe(true);

      // Contrato atualizado
      expect(updatedContract.statusVigencia).toBe('Expirado');

      // Evento formal emitido
      expect(event).toBeDefined();
      expect(event.tipoEvento).toBe('ENCERRAMENTO');
      expect(event.impacto).toBe('EXTINGUE_CONTRATO');
      expect(event.fonteOrigem).toBe('PNCP');
    });

    it('deve garantir que conclusão interna não fabrica fato oficial soberano', () => {
      const wfConcluidoInterno = assembleClosureWorkflow({
        contract: mockContractExpirado,
        decisao: { status: 'CONCLUIDO_INTERNAMENTE' }
      });

      expect(wfConcluidoInterno.status).toBe('CONCLUIDO_INTERNAMENTE');
      expect(wfConcluidoInterno.oficialidade.isFatoSoberano).toBe(false);
      expect(wfConcluidoInterno.confirmacaoOficial.confirmado).toBe(false);
    });
  });
});
