import { describe, it, expect } from 'vitest';
import {
  generateProrrogationWorkflowId,
  calculateProrrogationDeadlines,
  buildDefaultProrrogationTemplate,
  evaluateProrrogationReadiness,
  deriveProrrogationStatus,
  assembleProrrogationWorkflow,
  completeProrrogationCycle
} from '../contractProrrogationService';
import type { ContractDashboardRecord } from '../../types';

describe('contractProrrogationService (Fase 4.2 — Workflow de Prorrogação Contratual)', () => {
  const mockContract: ContractDashboardRecord = {
    id: '200331-00015-2026',
    numero: '15',
    ano: 2026,
    numeroFormatado: '00015/2026',
    uasg: '200331',
    nomeUnidadeGestora: 'SENASP',
    objeto: 'Serviços de Tecnologia da Informação',
    processo: '08020.001234/2026-11',
    fornecedorNome: 'TechCorp Brasil Ltda',
    fornecedorCnpjCpf: '12.345.678/0001-90',
    valorGlobal: 1200000.0,
    valorInicial: 1200000.0,
    dataAssinatura: '2026-01-10',
    dataVigenciaInicio: '2026-01-15',
    dataVigenciaFim: '2027-01-15',
    statusVigencia: 'Vigente',
    fonteDados: 'Contratos.gov.br'
  };

  describe('1. generateProrrogationWorkflowId', () => {
    it('deve gerar chave determinística no formato WF::PRORROGACAO::{contractKey}::{cycleRef}', () => {
      const id = generateProrrogationWorkflowId('200331-00015-2026', 'VIG_20270115');
      expect(id).toBe('WF::PRORROGACAO::200331-00015-2026::VIG_20270115');
    });

    it('deve sanitizar espaços e minúsculas mantendo estabilidade', () => {
      const id = generateProrrogationWorkflowId(' 200331-00015-2026 ', ' vig 20270115 ');
      expect(id).toBe('WF::PRORROGACAO::200331-00015-2026::VIG_20270115');
    });
  });

  describe('2. calculateProrrogationDeadlines', () => {
    it('deve calcular corretamente as datas do cronograma preventivo (-180d, -120d, 10d úteis, -90d, -60d, -15d)', () => {
      const currentDate = new Date(2026, 6, 15); // 2026-07-15
      const deadlines = calculateProrrogationDeadlines('2027-01-15', currentDate);

      expect(deadlines).not.toBeNull();
      expect(deadlines?.dataVigenciaAtual).toBe('2027-01-15');
      expect(deadlines?.inicioAnalise180d).toBe('2026-07-19');
      expect(deadlines?.consultaFornecedor120d).toBe('2026-09-17');
      expect(deadlines?.pesquisaPrecos90d).toBe('2026-10-17');
      expect(deadlines?.remessaJuridica60d).toBe('2026-11-16');
      expect(deadlines?.previsaoAssinatura15d).toBe('2026-12-31');
      expect(deadlines?.limitePeremptorioVigencia0d).toBe('2027-01-15');
      expect(deadlines?.diasRestantesVigencia).toBe(184);
      expect(deadlines?.estadoTemporal).toBe('FUTURO');
      expect(deadlines?.nivelAtencao).toBe('NORMAL');
    });

    it('deve retornar null para data inválida', () => {
      const deadlines = calculateProrrogationDeadlines('data_invalida');
      expect(deadlines).toBeNull();
    });
  });

  describe('3. buildDefaultProrrogationTemplate', () => {
    it('deve retornar o template padrão estruturado em 4 macrotarefas e 10 tarefas da Lei 14.133/21', () => {
      const template = buildDefaultProrrogationTemplate();

      expect(template.id).toBe('tpl-prorrogacao-padrao-14133');
      expect(template.macrotarefas.length).toBe(4);

      const totalTasks = template.macrotarefas.reduce((acc, m) => acc + m.tarefas.length, 0);
      expect(totalTasks).toBe(10);

      // Validação das macrotarefas sequenciais
      expect(template.macrotarefas[0].nome).toContain('1. Avaliação de Interesse e Consulta');
      expect(template.macrotarefas[1].nome).toContain('2. Economicidade, Vantajosidade');
      expect(template.macrotarefas[2].nome).toContain('3. Instrução Processual e Análise Jurídica');
      expect(template.macrotarefas[3].nome).toContain('4. Assinatura, Eficácia e Publicação');

      // Tarefas essenciais presentes
      const taskNames = template.macrotarefas.flatMap(m => m.tarefas.map(t => t.nome));
      expect(taskNames.some(n => n.includes('Nota Técnica'))).toBe(true);
      expect(taskNames.some(n => n.includes('Ofício de Consulta'))).toBe(true);
      expect(taskNames.some(n => n.includes('Pesquisa de Preços'))).toBe(true);
      expect(taskNames.some(n => n.includes('SICAF'))).toBe(true);
      expect(taskNames.some(n => n.includes('CONJUR/AGU'))).toBe(true);
      expect(taskNames.some(n => n.includes('Publicar Termo Aditivo'))).toBe(true);
    });
  });

  describe('4. evaluateProrrogationReadiness', () => {
    it('deve identificar pendências quando o checklist estiver incompleto', () => {
      const partialWorkflow = {
        manifestacaoFornecedor: 'PENDENTE' as const,
        vantajosidadeComprovada: false,
        regularidadeFiscalSicaf: false,
        parecerConjurFavoravel: false
      };

      const readiness = evaluateProrrogationReadiness(partialWorkflow, '2027-01-15', new Date(2026, 6, 1));
      expect(readiness.isProntoParaAssinatura).toBe(false);
      expect(readiness.itensPendentes.length).toBeGreaterThanOrEqual(4);
      expect(readiness.fornecedorConcordancia).toBe(false);
      expect(readiness.vantajosidadePrecoComprovada).toBe(false);
      expect(readiness.regularidadeFiscalValida).toBe(false);
      expect(readiness.parecerJuridicoAprovado).toBe(false);
    });

    it('deve considerar pronto para assinatura quando todos os requisitos forem satisfeitos tempestivamente', () => {
      const fullWorkflow = {
        decisaoFinal: 'PRORROGAR' as const,
        vantajosidadeDocumentoSei: 'DOC-123456',
        manifestacaoFornecedor: 'CONFIRMADO' as const,
        vantajosidadeComprovada: true,
        regularidadeFiscalSicaf: true,
        parecerConjurFavoravel: true
      };

      const readiness = evaluateProrrogationReadiness(fullWorkflow, '2027-01-15', new Date(2026, 11, 20));
      expect(readiness.isProntoParaAssinatura).toBe(true);
      expect(readiness.itensPendentes.length).toBe(0);
      expect(readiness.tempestividadeGarantida).toBe(true);
    });

    it('deve alertar sobre preclusão e nulidade caso a vigência já esteja expirada', () => {
      const expiredWorkflow = {
        decisaoFinal: 'PRORROGAR' as const,
        vantajosidadeDocumentoSei: 'DOC-123456',
        manifestacaoFornecedor: 'CONFIRMADO' as const,
        vantajosidadeComprovada: true,
        regularidadeFiscalSicaf: true,
        parecerConjurFavoravel: true
      };

      // Data corrente 2027-02-01 após vigência 2027-01-15
      const readiness = evaluateProrrogationReadiness(expiredWorkflow, '2027-01-15', new Date(2027, 1, 1));
      expect(readiness.isProntoParaAssinatura).toBe(false);
      expect(readiness.tempestividadeGarantida).toBe(false);
      expect(readiness.itensPendentes.some(p => p.includes('expirada'))).toBe(true);
    });
  });

  describe('5. deriveProrrogationStatus', () => {
    it('deve derivar status conforme o avanço das etapas formais', () => {
      expect(deriveProrrogationStatus({})).toBe('NAO_INICIADO');

      expect(deriveProrrogationStatus({ dataInicio: '2026-07-20' })).toBe('EM_ANALISE_INTERESSE');

      expect(deriveProrrogationStatus({ manifestacaoFornecedor: 'PENDENTE' })).toBe('AGUARDANDO_FORNECEDOR');

      expect(deriveProrrogationStatus({ manifestacaoFornecedor: 'CONFIRMADO' })).toBe('EM_PESQUISA_PRECOS');

      expect(deriveProrrogationStatus({ vantajosidadeComprovada: true })).toBe('EM_INSTRUCAO_MINUTA');

      expect(deriveProrrogationStatus({ parecerConjurNumero: 'Parecer 45/2026' })).toBe('EM_ANALISE_JURIDICA');

      expect(deriveProrrogationStatus({ parecerConjurFavoravel: true })).toBe('AGUARDANDO_ASSINATURA_PUBLICACAO');

      expect(deriveProrrogationStatus({ termoAditivoPublicadoEm: '2026-12-30' })).toBe('CONCLUIDO_PRORROGADO');

      expect(deriveProrrogationStatus({ decisaoFinal: 'NAO_PRORROGAR' })).toBe('CONCLUIDO_NAO_PRORROGADO');

      expect(deriveProrrogationStatus({ status: 'CANCELADO' })).toBe('CANCELADO');
    });
  });

  describe('6. assembleProrrogationWorkflow', () => {
    it('deve montar a entidade agregada completa do workflow', () => {
      const workflow = assembleProrrogationWorkflow({
        contract: mockContract,
        overrideData: {
          responsavelGestorNome: 'Dr. Carlos Silva',
          processoSeiNumero: '08020.001234/2026-11'
        },
        currentDate: new Date(2026, 6, 15)
      });

      expect(workflow.workflowId).toBe('WF::PRORROGACAO::200331-00015-2026::VIG_20270115');
      expect(workflow.contractKey).toBe('200331-00015-2026');
      expect(workflow.dataVigenciaAtual).toBe('2027-01-15');
      expect(workflow.novaVigenciaPretendida).toBe('2028-01-15'); // +12m automático
      expect(workflow.responsavelGestorNome).toBe('Dr. Carlos Silva');
      expect(workflow.deadlinesPlan).toBeDefined();
      expect(workflow.readiness).toBeDefined();
    });
  });

  describe('7. completeProrrogationCycle', () => {
    it('deve concluir o ciclo de prorrogação gerando novo evento e transição temporal determinística', () => {
      const workflow = assembleProrrogationWorkflow({
        contract: mockContract,
        overrideData: {
          decididoEm: '2026-12-28',
          decididoPor: 'Diretoria Executiva',
          processoSeiNumero: '08020.001234/2026-11'
        }
      });

      const result = completeProrrogationCycle({
        contract: mockContract,
        workflow,
        novaVigencia: '2028-01-15',
        termoAditivoNumero: '1º Termo Aditivo',
        dataPublicacaoPncp: '2026-12-29',
        linkPncp: 'https://pncp.gov.br/app/contratos/123',
        currentDate: new Date(2026, 11, 29)
      });

      expect(result.updatedContract.dataVigenciaFim).toBe('2028-01-15');
      expect(result.updatedContract.statusVigencia).toBe('Vigente');

      // Evento formal gerado
      expect(result.event.tipoEvento).toBe('PRORROGACAO');
      expect(result.event.identificadorOficial).toBe('1º Termo Aditivo');
      expect(result.event.vigenciaPosterior).toBe('2028-01-15');
      expect(result.event.vigenciaAnterior).toBe('2027-01-15');

      // Transição de ciclo temporal
      expect(result.transition.novoCicloRef).toBe('VIG_20280115');
      expect(result.transition.novoGatilhoId).toContain('PRORROGACAO::GATILHO_180D::VIG_20280115');
      expect(result.transition.explicabilidadeTexto).toContain('Vigência contratual alterada de 2027-01-15 para 2028-01-15');
    });
  });
});
