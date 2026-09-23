import { describe, it, expect } from 'vitest';
import type { ContractDashboardRecord } from '../../types';
import {
  generateRescissionWorkflowId,
  buildConditionalRescissionTemplate,
  deriveRescissionWorkflowStatus,
  assembleRescissionWorkflow,
  confirmRescissionWorkflowOfficially
} from '../contractRescissionWorkflowService';

const mockContract: ContractDashboardRecord = {
  id: 'CONTRACT-BR-2026-999',
  numero: '15/2026',
  ano: 2026,
  numeroFormatado: '15/2026',
  uasg: '160001',
  objeto: 'Prestação de serviços contínuos de suporte de TI',
  statusVigencia: 'Vigente',
  dataVigenciaInicio: '2026-01-01',
  dataVigenciaFim: '2026-12-31',
  fonteDados: 'Compras.gov.br',
  processo: '23000.001234/2026-11'
};

describe('Fase 4.4C — ContractRescissionWorkflowService (Workflow de Extinção Antecipada / Rescisão)', () => {
  describe('1. Geração de IDs Canônicos e Idempotência', () => {
    it('deve gerar chave lógica determinística e canônica para o workflow de rescisão', () => {
      const id1 = generateRescissionWorkflowId('CONTRACT-BR-2026-999', 'EXTINCAO_UNILATERAL', 'VIG_20261231');
      const id2 = generateRescissionWorkflowId('CONTRACT-BR-2026-999', 'EXTINCAO_UNILATERAL', 'VIG_20261231');

      expect(id1).toBe('WF::EXTINCAO::CONTRACT-BR-2026-999::EXTINCAO_UNILATERAL::VIG_20261231');
      expect(id1).toBe(id2);
    });

    it('deve suportar sufixo identificador para distinguir múltiplos procedimentos na mesma vigência', () => {
      const idUnilateral = generateRescissionWorkflowId('CONTRACT-BR-2026-999', 'EXTINCAO_UNILATERAL', 'VIG_20261231', 'PAD-01');
      const idConsensual = generateRescissionWorkflowId('CONTRACT-BR-2026-999', 'EXTINCAO_CONSENSUAL', 'VIG_20261231', 'DISTRATO-01');

      expect(idUnilateral).toBe('WF::EXTINCAO::CONTRACT-BR-2026-999::EXTINCAO_UNILATERAL::VIG_20261231::PAD-01');
      expect(idConsensual).toBe('WF::EXTINCAO::CONTRACT-BR-2026-999::EXTINCAO_CONSENSUAL::VIG_20261231::DISTRATO-01');
      expect(idUnilateral).not.toBe(idConsensual);
    });
  });

  describe('2. Template Condicional e Não Duplicação ("Digite uma vez, use em todo lugar")', () => {
    it('Cenário A: Extinção unilateral sem contraditório e sem parecer deve gerar tarefas instrutórias de notificação e parecer com TaskExecutionMode', () => {
      const template = buildConditionalRescissionTemplate({
        tipoExtincao: 'EXTINCAO_UNILATERAL',
        motivacao: {
          descricaoMotivo: 'Inadimplemento contínuo de cláusula de nível de serviço (SLA)',
          contraditorioAmplaDefesaAssegurado: false
        }
      });

      const macroInstrucao = template.macrotarefas.find(m => m.id === 'macro-resc-instrucao');
      expect(macroInstrucao).toBeDefined();

      const taskContraditorio = macroInstrucao?.tarefas.find(t => t.id === 'task-resc-contraditorio');
      expect(taskContraditorio).toBeDefined();
      expect(taskContraditorio?.executionMode).toBe('INTERNA');
      expect(taskContraditorio?.sistemaDestino).toBe('SEI');

      const taskParecer = macroInstrucao?.tarefas.find(t => t.id === 'task-resc-parecer-juridico');
      expect(taskParecer).toBeDefined();
      expect(taskParecer?.executionMode).toBe('INTERNA');

      // Todas as tarefas devem possuir TaskExecutionMode válido
      template.macrotarefas.forEach(macro => {
        macro.tarefas.forEach(t => {
          expect(['INTERNA', 'EXTERNA', 'AUTOMATICA', 'CONFIRMACAO']).toContain(t.executionMode);
        });
      });
    });

    it('Cenário B: Extinção unilateral com contraditório e parecer já concluídos NÃO deve duplicar tarefas de notificação nem parecer', () => {
      const template = buildConditionalRescissionTemplate({
        tipoExtincao: 'EXTINCAO_UNILATERAL',
        motivacao: {
          descricaoMotivo: 'Inadimplemento reiterado',
          processoSeiNumero: '23000.001234/2026-11',
          contraditorioAmplaDefesaAssegurado: true,
          parecerJuridicoNumero: 'Parecer Jurídico nº 123/2026/CONJUR'
        }
      });

      const macroInstrucao = template.macrotarefas.find(m => m.id === 'macro-resc-instrucao');
      // Não deve conter task de contraditório nem parecer nem SEI
      expect(macroInstrucao?.tarefas.some(t => t.id === 'task-resc-contraditorio')).toBeFalsy();
      expect(macroInstrucao?.tarefas.some(t => t.id === 'task-resc-parecer-juridico')).toBeFalsy();
      expect(macroInstrucao?.tarefas.some(t => t.id === 'task-resc-sei')).toBeFalsy();
    });

    it('Cenário C: Extinção consensual (distrato) deve gerar tarefa de minuta de distrato e não exigir contraditório litigioso', () => {
      const template = buildConditionalRescissionTemplate({
        tipoExtincao: 'EXTINCAO_CONSENSUAL',
        motivacao: {
          descricaoMotivo: 'Acordo bilateral por conveniência e oportunidade da Administração',
          processoSeiNumero: '23000.001234/2026-11'
        }
      });

      const macroInstrucao = template.macrotarefas.find(m => m.id === 'macro-resc-instrucao');
      const taskDistrato = macroInstrucao?.tarefas.find(t => t.id === 'task-resc-minuta-distrato');
      expect(taskDistrato).toBeDefined();
      expect(taskDistrato?.executionMode).toBe('INTERNA');

      // Não deve gerar contraditório litigioso
      expect(macroInstrucao?.tarefas.some(t => t.id === 'task-resc-contraditorio')).toBeFalsy();
    });

    it('Cenário D: Extinção judicial/arbitral deve gerar tarefa de juntada de sentença / laudo arbitral', () => {
      const template = buildConditionalRescissionTemplate({
        tipoExtincao: 'EXTINCAO_JUDICIAL_ARBITRAL',
        motivacao: {
          descricaoMotivo: 'Cumprimento de sentença judicial transitada em julgado',
          processoSeiNumero: '23000.001234/2026-11'
        }
      });

      const macroInstrucao = template.macrotarefas.find(m => m.id === 'macro-resc-instrucao');
      const taskSentenca = macroInstrucao?.tarefas.find(t => t.id === 'task-resc-sentenca-judicial');
      expect(taskSentenca).toBeDefined();
      expect(taskSentenca?.executionMode).toBe('INTERNA');
    });

    it('Cenário E: Checklist com pendências financeiras e de garantia deve incluir apuração financeira e destinação de garantia', () => {
      const template = buildConditionalRescissionTemplate({
        tipoExtincao: 'EXTINCAO_UNILATERAL',
        motivacao: {
          processoSeiNumero: '23000.001234/2026-11',
          contraditorioAmplaDefesaAssegurado: true,
          parecerJuridicoNumero: 'Parecer nº 01/2026'
        },
        checklist: {
          pagamentosPendentes: true,
          garantiaExigida: true,
          garantiaLiberada: false
        }
      });

      const macroInstrucao = template.macrotarefas.find(m => m.id === 'macro-resc-instrucao');
      expect(macroInstrucao?.tarefas.some(t => t.id === 'task-resc-apuracao-financeira')).toBe(true);
      expect(macroInstrucao?.tarefas.some(t => t.id === 'task-resc-garantia')).toBe(true);
    });

    it('Cenário F: Quando formalização e decisão já existem, omite tarefas já executadas', () => {
      const template = buildConditionalRescissionTemplate({
        tipoExtincao: 'EXTINCAO_UNILATERAL',
        motivacao: {
          processoSeiNumero: '23000.001234/2026-11',
          contraditorioAmplaDefesaAssegurado: true,
          parecerJuridicoNumero: 'Parecer 1/2026'
        },
        decisao: {
          status: 'APROVADO',
          decididoEm: '2026-05-10',
          decididoPor: 'Diretor-Geral'
        },
        formalizacao: {
          numeroTermo: 'Termo de Rescisão nº 01/2026',
          dataAssinatura: '2026-05-12',
          dataPublicacao: '2026-05-15',
          numeroPublicacaoPncpDoi: 'PNCP-PUB-2026-999'
        }
      });

      // Macro formalização não deve ter tarefas pendentes
      const macroFormalizacao = template.macrotarefas.find(m => m.id === 'macro-resc-formalizacao');
      expect(macroFormalizacao).toBeUndefined();

      // Confirmação oficial permanece até a confirmação soberana
      const macroConfirmacao = template.macrotarefas.find(m => m.id === 'macro-resc-confirmacao');
      expect(macroConfirmacao).toBeDefined();
      expect(macroConfirmacao?.tarefas[0].executionMode).toBe('CONFIRMACAO');
    });
  });

  describe('3. Derivação Determinística de Status do Workflow', () => {
    it('deve derivar NAO_INICIADO quando vazio', () => {
      const status = deriveRescissionWorkflowStatus({
        contract: mockContract,
        workflow: {}
      });
      expect(status).toBe('NAO_INICIADO');
    });

    it('deve derivar COM_PENDENCIAS quando faltam informações obrigatórias da rescisão', () => {
      const status = deriveRescissionWorkflowStatus({
        contract: mockContract,
        workflow: {
          tipoExtincao: 'EXTINCAO_UNILATERAL',
          processoSeiNumero: '23000.001234/2026-11',
          motivacao: {
            descricaoMotivo: 'Inadimplemento',
            contraditorioAmplaDefesaAssegurado: false // falta contraditório
          }
        }
      });
      expect(status).toBe('COM_PENDENCIAS');
    });

    it('deve derivar AGUARDANDO_DECISAO quando instrução concluída com parecer jurídico', () => {
      const status = deriveRescissionWorkflowStatus({
        contract: mockContract,
        workflow: {
          tipoExtincao: 'EXTINCAO_UNILATERAL',
          motivacao: {
            descricaoMotivo: 'Inadimplemento',
            contraditorioAmplaDefesaAssegurado: true,
            parecerJuridicoNumero: 'Parecer 123/2026'
          }
        }
      });
      expect(status).toBe('AGUARDANDO_DECISAO');
    });

    it('deve derivar EM_FORMALIZACAO quando decisão aprovada mas sem termo lavrado', () => {
      const status = deriveRescissionWorkflowStatus({
        contract: mockContract,
        workflow: {
          tipoExtincao: 'EXTINCAO_UNILATERAL',
          decisao: {
            status: 'APROVADO',
            decididoEm: '2026-06-01'
          }
        }
      });
      expect(status).toBe('EM_FORMALIZACAO');
    });

    it('deve derivar AGUARDANDO_CONFIRMACAO quando termo publicado aguardando confirmação externa', () => {
      const status = deriveRescissionWorkflowStatus({
        contract: mockContract,
        workflow: {
          tipoExtincao: 'EXTINCAO_UNILATERAL',
          formalizacao: {
            dataPublicacao: '2026-06-15',
            numeroPublicacaoPncpDoi: 'PNCP-RES-2026-001'
          }
        }
      });
      expect(status).toBe('AGUARDANDO_CONFIRMACAO');
    });

    it('deve derivar CONCLUIDO_OFICIALMENTE quando há confirmação oficial soberana', () => {
      const status = deriveRescissionWorkflowStatus({
        contract: mockContract,
        workflow: {
          confirmacaoOficial: {
            confirmado: true,
            fonteOficial: 'PNCP'
          }
        }
      });
      expect(status).toBe('CONCLUIDO_OFICIALMENTE');
    });
  });

  describe('4. Montagem e Conclusão Interna vs Soberana (assembleRescissionWorkflow)', () => {
    it('Cenário K: Conclusão interna NÃO torna o contrato extinto nem soberano (isFatoSoberano = false)', () => {
      const wf = assembleRescissionWorkflow({
        contract: mockContract,
        tipoExtincao: 'EXTINCAO_UNILATERAL',
        motivacao: {
          descricaoMotivo: 'Descumprimento grave de cláusula contratual',
          contraditorioAmplaDefesaAssegurado: true,
          parecerJuridicoNumero: 'Parecer Jurídico 44/2026',
          processoSeiNumero: '23000.001234/2026-11'
        },
        decisao: {
          status: 'APROVADO',
          decididoEm: '2026-06-01',
          decididoPor: 'Ordenador de Despesas'
        },
        formalizacao: {
          numeroTermo: 'Termo de Rescisão Unilateral nº 01/2026',
          dataAssinatura: '2026-06-02'
        }
      });

      expect(wf.status).toBe('CONCLUIDO_INTERNAMENTE');
      expect(wf.oficialidade.nivelOficialidade).toBe('DECISAO_INTERNA');
      expect(wf.oficialidade.isFatoSoberano).toBe(false);
      expect(wf.confirmacaoOficial.confirmado).toBe(false);
    });
  });

  describe('5. Confirmação Oficial Soberana (confirmRescissionWorkflowOfficially)', () => {
    it('Cenário L: Confirmação soberana transiciona para CONCLUIDO_OFICIALMENTE, emite evento EXTINGUE_CONTRATO e atualiza contrato', () => {
      const wf = assembleRescissionWorkflow({
        contract: mockContract,
        tipoExtincao: 'EXTINCAO_UNILATERAL',
        motivacao: {
          descricaoMotivo: 'Descumprimento contratual grave',
          contraditorioAmplaDefesaAssegurado: true,
          processoSeiNumero: '23000.001234/2026-11'
        },
        decisao: {
          status: 'APROVADO',
          decididoEm: '2026-06-01'
        },
        formalizacao: {
          numeroTermo: 'Termo de Rescisão nº 01/2026',
          dataAssinatura: '2026-06-02',
          dataPublicacao: '2026-06-05',
          numeroPublicacaoPncpDoi: 'PNCP-PUB-2026-999'
        }
      });

      const result = confirmRescissionWorkflowOfficially({
        workflow: wf,
        contract: mockContract,
        fonteOficial: 'PNCP',
        numeroControlePncp: 'PNCP-RES-2026-999-OK',
        dataEfeitoOficial: '2026-06-05',
        linkPncp: 'https://pncp.gov.br/app/contratos/160001/2026/15'
      });

      // 1. Workflow atualizado
      expect(result.updatedWorkflow.status).toBe('CONCLUIDO_OFICIALMENTE');
      expect(result.updatedWorkflow.oficialidade.isFatoSoberano).toBe(true);
      expect(result.updatedWorkflow.oficialidade.nivelOficialidade).toBe('FATO_OFICIAL');
      expect(result.updatedWorkflow.confirmacaoOficial.confirmado).toBe(true);
      expect(result.updatedWorkflow.confirmacaoOficial.fonteOficial).toBe('PNCP');

      // 2. Evento Contratual formal
      expect(result.event).toBeDefined();
      expect(result.event.tipoEvento).toBe('RESCISAO');
      expect(result.event.impacto).toBe('EXTINGUE_CONTRATO');
      expect(result.event.fonteOrigem).toBe('PNCP');

      // 3. Projeção do Contrato
      expect(result.updatedContract.statusVigencia).toBe('Expirado');
    });
  });
});
