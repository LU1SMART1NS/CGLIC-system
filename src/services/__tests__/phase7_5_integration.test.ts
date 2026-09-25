import { describe, it, expect } from 'vitest';
import {
  buildContractValueEvolutionModel
} from '../contractValueEvolutionService';
import {
  evaluateContractReajusteRadar
} from '../contractReajusteRadarService';
import {
  evaluateProrrogationReadiness,
  buildDefaultProrrogationTemplate
} from '../contractProrrogationService';
import type {
  ContractDashboardRecord,
  ContractEvent
} from '../../types';

describe('FASE 7.5-C5 — HOMOLOGAÇÃO INTEGRADA DE REAJUSTES E EVENTOS CONTRATUAIS', () => {
  const baseContract: ContractDashboardRecord = {
    id: 'CONTRATO::123456::00050::2026',
    numero: '00050',
    ano: 2026,
    numeroFormatado: '00050/2026',
    uasg: '123456',
    nomeUnidadeGestora: 'Coordenação-Geral de Logística',
    objeto: 'Prestação de Serviços de TI e Suporte de Infraestrutura',
    processo: '08020.001234/2026-11',
    fornecedorNome: 'TechSoluções em Nuvem Ltda',
    fornecedorCnpjCpf: '12.345.678/0001-90',
    valorGlobal: 1000000.0,
    valorInicial: 1000000.0,
    dataAssinatura: '2026-01-15',
    dataVigenciaInicio: '2026-01-15',
    dataVigenciaFim: '2027-01-15',
    statusVigencia: 'Vigente',
    fonteDados: 'Contratos.gov.br'
  };

  const createEvent = (partial: Partial<ContractEvent>): ContractEvent => ({
    id: partial.id || `EVT::${Math.random()}`,
    contractKey: 'CONTRATO::123456::00050::2026',
    uasg: '123456',
    numeroContrato: '00050',
    anoContrato: 2026,
    tipoEvento: partial.tipoEvento || 'REAJUSTE',
    naturezaInstrumento: partial.naturezaInstrumento || 'TERMO_APOSTILAMENTO',
    identificadorOficial: partial.identificadorOficial || 'APOST-01/2026',
    descricao: partial.descricao || 'Apostilamento de reajuste',
    impacto: partial.impacto || 'ALTERA_VALOR',
    fonteOrigem: partial.fonteOrigem || 'PNCP',
    capturedAt: '2026-01-15T12:00:00Z',
    ...partial
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 1: Contrato sem eventos
  // --------------------------------------------------------------------------
  describe('CENÁRIO 1: Contrato sem eventos', () => {
    it('deve manter Valor Vigente = Valor Original, delta zero e sem alertas indevidos', () => {
      const evolution = buildContractValueEvolutionModel(baseContract, []);

      expect(evolution.valorOriginal).toBe(1000000.0);
      expect(evolution.valorVigente).toBe(1000000.0);
      expect(evolution.deltaAcumulado).toBe(0);
      expect(evolution.percentualVariacaoAcumulada).toBe(0);
      expect(evolution.eventos.length).toBe(0);
      expect(evolution.totalEventosMonetarios).toBe(0);

      // Radar fora da janela (> 60 dias)
      const radar = evaluateContractReajusteRadar({
        contract: baseContract,
        events: [],
        currentDate: new Date(2026, 5, 1) // Junho 2026 (aniversário Jan 2027)
      });
      expect(radar).toBeNull();

      // Prontidão de prorrogação
      const readiness = evaluateProrrogationReadiness(
        {
          decisaoFinal: 'PRORROGAR',
          manifestacaoFornecedor: 'CONFIRMADO',
          vantajosidadeComprovada: true,
          regularidadeFiscalSicaf: true,
          parecerConjurFavoravel: true
        },
        baseContract.dataVigenciaFim,
        new Date(2026, 5, 1),
        { contract: baseContract, events: [] }
      );
      expect(readiness.isProntoParaAssinatura).toBe(true);
      expect(readiness.reajusteStatus?.situacao).toBe('SEM_PENDENCIA');
    });
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 2: Reajuste positivo único
  // --------------------------------------------------------------------------
  describe('CENÁRIO 2: Reajuste positivo único', () => {
    it('deve calcular rigorosamente Valor Original + Δ Reajuste = Valor Vigente', () => {
      const reajusteEvent = createEvent({
        id: 'EVT-REAJUSTE-01',
        tipoEvento: 'REAJUSTE',
        naturezaInstrumento: 'TERMO_APOSTILAMENTO',
        identificadorOficial: 'Apostilamento 01/2026',
        variacaoValor: 50000.0,
        valorAnterior: 1000000.0,
        valorPosterior: 1050000.0,
        dataPublicacao: '2026-06-15'
      });

      const evolution = buildContractValueEvolutionModel(baseContract, [reajusteEvent]);

      expect(evolution.valorOriginal).toBe(1000000.0);
      expect(evolution.valorVigente).toBe(1050000.0);
      expect(evolution.deltaAcumulado).toBe(50000.0);
      expect(evolution.percentualVariacaoAcumulada).toBe(5.0);
      expect(evolution.eventos.length).toBe(1);
      expect(evolution.totalEventosMonetarios).toBe(1);

      // O evento registrado formalmente acalma o radar do ciclo passado
      const readiness = evaluateProrrogationReadiness(
        {
          decisaoFinal: 'PRORROGAR',
          manifestacaoFornecedor: 'CONFIRMADO',
          vantajosidadeComprovada: true,
          regularidadeFiscalSicaf: true,
          parecerConjurFavoravel: true
        },
        baseContract.dataVigenciaFim,
        new Date(2026, 6, 1),
        { contract: baseContract, events: [reajusteEvent] }
      );
      expect(readiness.isProntoParaAssinatura).toBe(true);
      expect(readiness.reajusteStatus?.situacao).toBe('SEM_PENDENCIA');
      expect(readiness.reajusteStatus?.possuiEventoSubsequente).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 3: Múltiplos eventos combinados (Reajuste, Repactuação, Acréscimo, Supressão)
  // --------------------------------------------------------------------------
  describe('CENÁRIO 3: Múltiplos eventos combinados sem dupla contagem', () => {
    it('deve acumular sequencialmente todos os deltas: Original + Σ Δ = Vigente', () => {
      const evt1Reajuste = createEvent({
        id: 'EVT-1-REAJUSTE',
        tipoEvento: 'REAJUSTE',
        naturezaInstrumento: 'TERMO_APOSTILAMENTO',
        identificadorOficial: 'Apostila 01/2026',
        variacaoValor: 30000.0, // +30k
        dataPublicacao: '2026-03-01'
      });

      const evt2Acrescimo = createEvent({
        id: 'EVT-2-ACRESCIMO',
        tipoEvento: 'ACRESCIMO',
        naturezaInstrumento: 'TERMO_ADITIVO',
        identificadorOficial: '1º Termo Aditivo',
        variacaoValor: 70000.0, // +70k
        dataPublicacao: '2026-05-01'
      });

      const evt3Supressao = createEvent({
        id: 'EVT-3-SUPRESSAO',
        tipoEvento: 'SUPRESSAO',
        naturezaInstrumento: 'TERMO_ADITIVO',
        identificadorOficial: '2º Termo Aditivo',
        variacaoValor: -20000.0, // -20k
        dataPublicacao: '2026-08-01'
      });

      const evt4Repactuacao = createEvent({
        id: 'EVT-4-REPACTUACAO',
        tipoEvento: 'REPACTUACAO',
        naturezaInstrumento: 'TERMO_ADITIVO',
        identificadorOficial: '3º Termo Aditivo',
        variacaoValor: 40000.0, // +40k
        dataPublicacao: '2026-10-01'
      });

      const evolution = buildContractValueEvolutionModel(baseContract, [
        evt1Reajuste,
        evt2Acrescimo,
        evt3Supressao,
        evt4Repactuacao
      ]);

      // 1.000.000 + 30.000 + 70.000 - 20.000 + 40.000 = 1.120.000 (+120.000 / +12%)
      expect(evolution.valorOriginal).toBe(1000000.0);
      expect(evolution.valorVigente).toBe(1120000.0);
      expect(evolution.deltaAcumulado).toBe(120000.0);
      expect(evolution.percentualVariacaoAcumulada).toBe(12.0);
      expect(evolution.eventos.length).toBe(4);

      // Verificação da evolução acumulada passo a passo
      expect(evolution.eventos[0].valorResultante).toBe(1030000.0);
      expect(evolution.eventos[1].valorResultante).toBe(1100000.0);
      expect(evolution.eventos[2].valorResultante).toBe(1080000.0);
      expect(evolution.eventos[3].valorResultante).toBe(1120000.0);
    });
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 4: Eventos sem impacto monetário
  // --------------------------------------------------------------------------
  describe('CENÁRIO 4: Eventos sem impacto financeiro', () => {
    it('deve preservar o valor sem criar deltas artificiais para prorrogação simples ou dotação', () => {
      const evtProrrogacao = createEvent({
        id: 'EVT-PRORR-01',
        tipoEvento: 'PRORROGACAO',
        naturezaInstrumento: 'TERMO_ADITIVO',
        identificadorOficial: '1º Termo Aditivo de Prorrogação',
        impacto: 'ALTERA_VIGENCIA',
        variacaoValor: 0,
        dataPublicacao: '2026-12-01'
      });

      const evtApostilaDotacao = createEvent({
        id: 'EVT-APOST-DOT',
        tipoEvento: 'APOSTILAMENTO',
        naturezaInstrumento: 'TERMO_APOSTILAMENTO',
        identificadorOficial: 'Apostilamento de Dotação Orçamentária',
        impacto: 'ATUALIZA_DADOS',
        variacaoValor: 0,
        dataPublicacao: '2026-12-10'
      });

      const evolution = buildContractValueEvolutionModel(baseContract, [
        evtProrrogacao,
        evtApostilaDotacao
      ]);

      expect(evolution.valorOriginal).toBe(1000000.0);
      expect(evolution.valorVigente).toBe(1000000.0);
      expect(evolution.deltaAcumulado).toBe(0);
      expect(evolution.totalEventosMonetarios).toBe(0);
      expect(evolution.eventos.length).toBe(2);
      expect(evolution.eventos[0].deltaValor).toBe(0);
      expect(evolution.eventos[1].deltaValor).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 5: Hierarquia de data-base sem evento posterior
  // --------------------------------------------------------------------------
  describe('CENÁRIO 5: Hierarquia de data-base (C3)', () => {
    it('Prioridade 1: dataBaseProposta quando presente', () => {
      const contractWithProposal = {
        ...baseContract,
        dataBaseProposta: '2025-11-01', // Marco em 2026-11-01
        dataAssinatura: '2026-01-15'
      };

      const alert = evaluateContractReajusteRadar({
        contract: contractWithProposal,
        events: [],
        currentDate: new Date(2026, 9, 15) // 15/10/2026 (faltam 17 dias)
      });

      expect(alert).not.toBeNull();
      expect(alert?.origemDataBase).toBe('PROPOSTA');
      expect(alert?.dataBase).toBe('2025-11-01');
      expect(alert?.dataAniversario).toBe('2026-11-01');
      expect(alert?.nivel).toBe('URGENTE');
      expect(alert?.diasRestantes).toBe(17);
    });

    it('Prioridade 2: dataAssinatura quando dataBaseProposta ausente', () => {
      const contractWithSignature = {
        ...baseContract,
        dataBaseProposta: undefined,
        dataAssinatura: '2026-01-15'
      };

      const alert = evaluateContractReajusteRadar({
        contract: contractWithSignature,
        events: [],
        currentDate: new Date(2026, 11, 25) // 25/12/2026 (faltam 21 dias para 15/01/2027)
      });

      expect(alert).not.toBeNull();
      expect(alert?.origemDataBase).toBe('ASSINATURA');
      expect(alert?.dataBase).toBe('2026-01-15');
      expect(alert?.dataAniversario).toBe('2027-01-15');
      expect(alert?.nivel).toBe('URGENTE');
      expect(alert?.diasRestantes).toBe(21);
    });

    it('Prioridade 3 (Fallback): dataVigenciaInicio quando assinatura ausente', () => {
      const contractWithVigenciaOnly = {
        ...baseContract,
        dataBaseProposta: undefined,
        dataAssinatura: undefined,
        dataVigenciaInicio: '2026-02-01'
      };

      const alert = evaluateContractReajusteRadar({
        contract: contractWithVigenciaOnly,
        events: [],
        currentDate: new Date(2027, 0, 15) // 15/01/2027 (faltam 17 dias para 01/02/2027)
      });

      expect(alert).not.toBeNull();
      expect(alert?.origemDataBase).toBe('ASSINATURA');
      expect(alert?.dataBase).toBe('2026-02-01');
      expect(alert?.dataAniversario).toBe('2027-02-01');
      expect(alert?.diasRestantes).toBe(17);
    });
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 6: Reajuste posterior com avanço de ciclo anual (+12 meses)
  // --------------------------------------------------------------------------
  describe('CENÁRIO 6: Ciclo de vida com reajuste posterior (+12 meses)', () => {
    it('deve avançar o marco para +12 meses após concessão e registro formal do reajuste', () => {
      // Reajuste concedido em 01/06/2026
      const reajuste2026 = createEvent({
        id: 'EVT-REAJUSTE-2026',
        tipoEvento: 'REAJUSTE',
        dataPublicacao: '2026-06-01'
      });

      // Em 15/06/2026 (logo após o reajuste), o marco é 01/06/2027 (> 60 dias -> sem alerta)
      const radarAposReajuste = evaluateContractReajusteRadar({
        contract: baseContract,
        events: [reajuste2026],
        currentDate: new Date(2026, 5, 15)
      });
      expect(radarAposReajuste).toBeNull();

      // Em 15/05/2027 (faltando 17 dias para 01/06/2027), ativa alerta do Ano 2
      const radarAno2 = evaluateContractReajusteRadar({
        contract: baseContract,
        events: [reajuste2026],
        currentDate: new Date(2027, 4, 15)
      });
      expect(radarAno2).not.toBeNull();
      expect(radarAno2?.ciclo).toBe(2);
      expect(radarAno2?.origemDataBase).toBe('ULTIMO_REAJUSTE');
      expect(radarAno2?.dataBase).toBe('2026-06-01');
      expect(radarAno2?.dataAniversario).toBe('2027-06-01');
      expect(radarAno2?.diasRestantes).toBe(17);
    });
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 7: Guarda assistida de prorrogação integrada (C4)
  // --------------------------------------------------------------------------
  describe('CENÁRIO 7: Guarda assistida de prorrogação integrada', () => {
    it('deve prover orientações e sugestão de ressalva sem jamais bloquear isProntoParaAssinatura', () => {
      const fullWorkflow = {
        decisaoFinal: 'PRORROGAR' as const,
        vantajosidadeDocumentoSei: 'SEI-998877',
        manifestacaoFornecedor: 'CONFIRMADO' as const,
        vantajosidadeComprovada: true,
        regularidadeFiscalSicaf: true,
        parecerConjurFavoravel: true
      };

      // Situação A: Marco próximo
      const readinessA = evaluateProrrogationReadiness(
        fullWorkflow,
        '2027-01-15',
        new Date(2026, 11, 20), // 20/12/2026 (faltam 21 dias para dataAssinatura 2026-01-10 -> aniversário 2027-01-10)
        { contract: baseContract }
      );
      expect(readinessA.isProntoParaAssinatura).toBe(true);
      expect(readinessA.reajusteStatus?.situacao).toBe('MARCO_PROXIMO');
      expect(readinessA.reajusteStatus?.sugestaoRessalva).toContain('consignar ressalva');

      // Template possui a tarefa de verificação e ressalva
      const template = buildDefaultProrrogationTemplate();
      const taskRessalva = template.macrotarefas
        .flatMap((m) => m.tarefas)
        .find((t) => t.id === 'task-prorr-6b');
      expect(taskRessalva).toBeDefined();
      expect(taskRessalva?.nome).toContain('ressalva');
      expect(taskRessalva?.sistemaDestino).toBe('SEI');
    });
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 8: Preservação financeira, SSOT e isolamento
  // --------------------------------------------------------------------------
  describe('CENÁRIO 8: Preservação de SSOT e isolamento estrutural', () => {
    it('os modelos de leitura são funções puras que não causam efeitos colaterais no contrato original', () => {
      const contractClone = { ...baseContract };
      const events: ContractEvent[] = [
        createEvent({
          tipoEvento: 'REAJUSTE',
          variacaoValor: 100000.0,
          dataPublicacao: '2026-06-01'
        })
      ];

      const evolution = buildContractValueEvolutionModel(contractClone, events);
      expect(evolution.valorVigente).toBe(1100000.0);

      // O objeto original permanece 100% inalterado
      expect(contractClone.valorGlobal).toBe(1000000.0);
      expect(contractClone.valorInicial).toBe(1000000.0);
    });
  });
});
