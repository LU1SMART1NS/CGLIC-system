import { describe, it, expect } from 'vitest';
import {
  generateAmendmentWorkflowId,
  buildDefaultAmendmentTemplate,
  deriveAmendmentWorkflowStatus,
  assembleAmendmentWorkflow,
  confirmAmendmentWorkflowOfficially
} from '../contractAmendmentWorkflowService';
import type { ContractDashboardRecord } from '../../types';

describe('contractAmendmentWorkflowService — Fase 4.3B', () => {
  const mockContract: ContractDashboardRecord = {
    id: 'CTR-2026-001',
    numero: '01/2026',
    ano: 2026,
    numeroFormatado: '00001/2026',
    uasg: '200005',
    nomeOrgao: 'SENASP/MJSP',
    fornecedorNome: 'EMPRESA VIGILANCIA LTDA',
    fornecedorCnpjCpf: '12.345.678/0001-90',
    objeto: 'Prestação de serviços contínuos de vigilância armada',
    valorGlobal: 1000000.0,
    valorInicial: 1000000.0,
    dataVigenciaInicio: '2026-01-15',
    dataVigenciaFim: '2027-01-15',
    statusVigencia: 'Vigente',
    processo: '08001.000123/2026-11',
    fonteDados: 'PNCP'
  };

  describe('1. generateAmendmentWorkflowId', () => {
    it('deve gerar chave lógica determinística e canônica para o workflow', () => {
      const id = generateAmendmentWorkflowId('CTR-2026-001', 'ACRESCIMO', 'VIG_20270115');
      expect(id).toBe('WF::ALTERACAO::CTR-2026-001::ACRESCIMO::VIG_20270115');
    });

    it('deve suportar identificador customizado opcional para múltiplos workflows', () => {
      const id = generateAmendmentWorkflowId('CTR-2026-001', 'REAJUSTE', 'VIG_20270115', 'IPCA-2026');
      expect(id).toBe('WF::ALTERACAO::CTR-2026-001::REAJUSTE::VIG_20270115::IPCA-2026');
    });
  });

  describe('2. buildDefaultAmendmentTemplate', () => {
    it('deve gerar template instrutório adequado para ACRÉSCIMO com limites legais', () => {
      const tpl = buildDefaultAmendmentTemplate('ACRESCIMO');
      expect(tpl.id).toBe('tpl-acrescimo-padrao-14133');
      expect(tpl.macrotarefas).toHaveLength(3);
      const allTasks = tpl.macrotarefas.flatMap(m => m.tarefas);
      expect(allTasks.some(t => t.nome.includes('limites legais'))).toBe(true);
      expect(allTasks.some(t => t.nome.includes('CONJUR/AGU'))).toBe(true);
    });

    it('deve gerar template instrutório adequado para SUPRESSÃO com regra de não compensação', () => {
      const tpl = buildDefaultAmendmentTemplate('SUPRESSAO');
      expect(tpl.id).toBe('tpl-supressao-padrao-14133');
      const allTasks = tpl.macrotarefas.flatMap(m => m.tarefas);
      expect(allTasks.some(t => t.nome.includes('sem compensação'))).toBe(true);
      expect(allTasks.some(t => t.nome.includes('concordância formal'))).toBe(true);
    });

    it('deve gerar template instrutório adequado para REAJUSTE por índice de preços', () => {
      const tpl = buildDefaultAmendmentTemplate('REAJUSTE');
      expect(tpl.id).toBe('tpl-reajuste-padrao-14133');
      const allTasks = tpl.macrotarefas.flatMap(m => m.tarefas);
      expect(allTasks.some(t => t.nome.includes('Memória de Cálculo'))).toBe(true);
      expect(allTasks.some(t => t.nome.includes('Lavrar Termo de Apostilamento'))).toBe(true);
    });

    it('deve gerar template instrutório adequado para REPACTUAÇÃO de mão de obra CCT', () => {
      const tpl = buildDefaultAmendmentTemplate('REPACTUACAO');
      expect(tpl.id).toBe('tpl-repactuacao-padrao-14133');
      const allTasks = tpl.macrotarefas.flatMap(m => m.tarefas);
      expect(allTasks.some(t => t.nome.includes('Convenção Coletiva de Trabalho (CCT)'))).toBe(true);
      expect(allTasks.some(t => t.nome.includes('preclusão lógica'))).toBe(true);
      expect(allTasks.some(t => t.nome.includes('Planilha de Custos'))).toBe(true);
    });

    it('deve retornar template de prorrogação quando tipo for PRORROGACAO', () => {
      const tpl = buildDefaultAmendmentTemplate('PRORROGACAO');
      expect(tpl.id).toBe('tpl-prorrogacao-padrao-14133');
    });

    it('deve retornar template padrão para ALTERACAO_QUALITATIVA', () => {
      const tpl = buildDefaultAmendmentTemplate('ALTERACAO_QUALITATIVA');
      expect(tpl.id).toBe('tpl-alteracao-geral-14133');
    });
  });

  describe('3. deriveAmendmentWorkflowStatus', () => {
    it('deve retornar CANCELADO se o status for CANCELADO', () => {
      expect(deriveAmendmentWorkflowStatus({ status: 'CANCELADO' })).toBe('CANCELADO');
    });

    it('deve retornar NAO_APROVADO se a decisão administrativa interna for desfavorável', () => {
      expect(deriveAmendmentWorkflowStatus({
        decisao: { status: 'NAO_APROVADO', justificativaDecisao: 'Falta de disponibilidade orçamentária' }
      })).toBe('NAO_APROVADO');
    });

    it('deve retornar CONCLUIDO_CONFIRMADO se houver confirmação oficial soberana', () => {
      expect(deriveAmendmentWorkflowStatus({
        confirmacaoOficial: { confirmado: true, fonteOficial: 'PNCP' }
      })).toBe('CONCLUIDO_CONFIRMADO');
    });

    it('deve retornar AGUARDANDO_CONFIRMACAO_OFICIAL se o termo foi publicado no PNCP/DOU', () => {
      expect(deriveAmendmentWorkflowStatus({
        formalizacao: { dataPublicacao: '2026-09-20', numeroPublicacaoPncpDoi: '12345/2026' }
      })).toBe('AGUARDANDO_CONFIRMACAO_OFICIAL');
    });

    it('deve retornar AGUARDANDO_PUBLICACAO se o termo foi assinado mas ainda não publicado', () => {
      expect(deriveAmendmentWorkflowStatus({
        formalizacao: { dataAssinatura: '2026-09-18' }
      })).toBe('AGUARDANDO_PUBLICACAO');
    });

    it('deve retornar AGUARDANDO_FORMALIZACAO se a decisão foi favorável mas sem assinatura', () => {
      expect(deriveAmendmentWorkflowStatus({
        decisao: { status: 'APROVADO', decididoEm: '2026-09-15' }
      })).toBe('AGUARDANDO_FORMALIZACAO');
    });

    it('deve retornar EM_INSTRUCAO se houver data de início ou tarefas em andamento', () => {
      expect(deriveAmendmentWorkflowStatus({ dataInicio: '2026-08-01' })).toBe('EM_INSTRUCAO');
    });

    it('deve retornar NAO_INICIADO por padrão', () => {
      expect(deriveAmendmentWorkflowStatus({})).toBe('NAO_INICIADO');
    });
  });

  describe('4. assembleAmendmentWorkflow', () => {
    it('deve instanciar o workflow de Acréscimo com separação de proposta vs fato oficial', () => {
      const wf = assembleAmendmentWorkflow({
        contract: mockContract,
        tipoAlteracao: 'ACRESCIMO',
        objetoDescricao: 'Acréscimo de 10 postos de vigilância armada',
        justificativa: 'Inauguração de nova ala do complexo predial',
        valorProposto: 1200000.0,
        processoSeiNumero: '08001.000999/2026-99',
        responsavelNome: 'Gestor da Execução'
      });

      expect(wf.workflowId).toBe('WF::ALTERACAO::CTR-2026-001::ACRESCIMO::VIG_20270115');
      expect(wf.naturezaInstrumento).toBe('TERMO_ADITIVO');
      expect(wf.categoria).toBe('QUANTITATIVA');
      expect(wf.status).toBe('EM_INSTRUCAO');

      // Separação de valores
      expect(wf.valores.valorOriginal).toBe(1000000.0);
      expect(wf.valores.valorVigenteAnterior).toBe(1000000.0);
      expect(wf.valores.valorProposto).toBe(1200000.0);
      expect(wf.valores.valorResultante).toBe(1200000.0);
      expect(wf.valores.isOficial).toBe(false);

      // Oficialidade
      expect(wf.oficialidade.isFatoSoberano).toBe(false);
      expect(wf.oficialidade.nivelOficialidade).toBe('PROPOSTA_ADMINISTRATIVA');
    });

    it('deve instanciar o workflow de Reajuste como Apostilamento', () => {
      const wf = assembleAmendmentWorkflow({
        contract: mockContract,
        tipoAlteracao: 'REAJUSTE',
        naturezaInstrumento: 'TERMO_APOSTILAMENTO',
        objetoDescricao: 'Reajuste anual pelo IPCA de 4,5%',
        justificativa: 'Completado interregno de 1 ano da proposta',
        valorProposto: 1045000.0,
        reajusteMeta: {
          indicePactuado: 'IPCA',
          percentualIndiceApurado: 4.5,
          periodicidadeMeses: 12,
          dataBaseProposta: '2025-01-15',
          fonteDados: 'IBGE'
        }
      });

      expect(wf.naturezaInstrumento).toBe('TERMO_APOSTILAMENTO');
      expect(wf.categoria).toBe('ECONOMICA');
      expect(wf.reajusteMeta?.indicePactuado).toBe('IPCA');
    });
  });

  describe('5. confirmAmendmentWorkflowOfficially e Soberania PNCP', () => {
    it('deve concluir o workflow, atualizar o contrato e emitir ContractEvent soberano', () => {
      const initialWf = assembleAmendmentWorkflow({
        contract: mockContract,
        tipoAlteracao: 'ACRESCIMO',
        objetoDescricao: 'Acréscimo de postos de vigilância',
        justificativa: 'Expansão predial',
        valorProposto: 1200000.0,
        valorAprovado: 1200000.0,
        decisao: {
          status: 'APROVADO',
          decididoEm: '2026-09-15',
          decididoPor: 'Secretário Nacional'
        },
        formalizacao: {
          numeroTermo: '1º Termo Aditivo',
          dataAssinatura: '2026-09-18',
          dataPublicacao: '2026-09-20',
          numeroPublicacaoPncpDoi: 'PNCP-200005-01-2026-ADIT-01'
        }
      });

      // Estado antes da confirmação oficial
      expect(initialWf.status).toBe('AGUARDANDO_CONFIRMACAO_OFICIAL');
      expect(mockContract.valorGlobal).toBe(1000000.0);

      // Confirmação oficial soberana
      const result = confirmAmendmentWorkflowOfficially({
        workflow: initialWf,
        contract: mockContract,
        fonteOficial: 'PNCP',
        numeroControlePncp: 'PNCP-200005-01-2026-ADIT-01',
        valorOficialConfirmado: 1200000.0
      });

      // Workflow atualizado
      expect(result.updatedWorkflow.status).toBe('CONCLUIDO_CONFIRMADO');
      expect(result.updatedWorkflow.confirmacaoOficial.confirmado).toBe(true);
      expect(result.updatedWorkflow.valores.valorResultante).toBe(1200000.0);
      expect(result.updatedWorkflow.valores.isOficial).toBe(true);
      expect(result.updatedWorkflow.oficialidade.isFatoSoberano).toBe(true);

      // Contrato atualizado
      expect(result.updatedContract.valorGlobal).toBe(1200000.0);

      // Evento Contratual gerado
      expect(result.event).toBeDefined();
      expect(result.event.tipoEvento).toBe('ACRESCIMO');
      expect(result.event.naturezaInstrumento).toBe('TERMO_ADITIVO');
      expect(result.event.valorPosterior).toBe(1200000.0);
      expect(result.event.fonteOrigem).toBe('PNCP');
    });

    it('deve preservar a invariante PROPOSTA ≠ DECISÃO ≠ EFICÁCIA OFICIAL', () => {
      // 1. Proposta criada
      const wfProposta = assembleAmendmentWorkflow({
        contract: mockContract,
        tipoAlteracao: 'ACRESCIMO',
        objetoDescricao: 'Proposta de acréscimo de 20%',
        justificativa: 'Necessidade administrativa',
        valorProposto: 1200000.0
      });
      expect(wfProposta.status).toBe('EM_INSTRUCAO');
      expect(wfProposta.valores.isOficial).toBe(false);
      expect(mockContract.valorGlobal).toBe(1000000.0);

      // 2. Decisão aprovada internamente
      const wfDecidido = assembleAmendmentWorkflow({
        contract: mockContract,
        tipoAlteracao: 'ACRESCIMO',
        objetoDescricao: 'Proposta de acréscimo de 20%',
        justificativa: 'Necessidade administrativa',
        valorProposto: 1200000.0,
        valorAprovado: 1200000.0,
        decisao: {
          status: 'APROVADO',
          decididoEm: '2026-09-10'
        }
      });
      expect(wfDecidido.status).toBe('AGUARDANDO_FORMALIZACAO');
      // Mesmo aprovado pelo ordenador, o valor oficial do contrato no SaldoARP permanece R$ 1.000.000,00
      expect(wfDecidido.valores.isOficial).toBe(false);
      expect(mockContract.valorGlobal).toBe(1000000.0);

      // 3. Somente com confirmação oficial soberana o valor é oficializado no contrato
      const { updatedContract } = confirmAmendmentWorkflowOfficially({
        workflow: wfDecidido,
        contract: mockContract,
        fonteOficial: 'PNCP',
        valorOficialConfirmado: 1200000.0
      });
      expect(updatedContract.valorGlobal).toBe(1200000.0);
    });
  });
});
