import { describe, it, expect } from 'vitest';
import {
  classifyAmendment,
  evaluateInstrumentCompatibility,
  calculateAmendmentValueEvolution,
  classifyOfficiality,
  evaluateAmendmentLimits,
  buildContractAmendmentDomain,
  buildAmendmentEvent
} from '../contractAmendmentService';

describe('contractAmendmentService (Fase 4.3A — Domínio de Alterações Contratuais e Apostilamento)', () => {
  describe('1. Classificação de Instrumentos e Alterações', () => {
    it('deve classificar Acréscimo Quantitativo como QUANTITATIVA / TERMO_ADITIVO com múltiplos impactos', () => {
      const result = classifyAmendment({
        tipoOuDescricao: '1º Termo Aditivo de Acréscimo Quantitativo de 15%',
        variacaoValor: 150000
      });

      expect(result.tipoAlteracao).toBe('ACRESCIMO');
      expect(result.categoria).toBe('QUANTITATIVA');
      expect(result.naturezaInstrumento).toBe('TERMO_ADITIVO');
      expect(result.impactos).toContain('ALTERA_QUANTITATIVO');
      expect(result.impactos).toContain('ALTERA_VALOR');
    });

    it('deve classificar Supressão Quantitativa como QUANTITATIVA / TERMO_ADITIVO', () => {
      const result = classifyAmendment({
        tipoOuDescricao: 'Termo Aditivo de Supressão de Postos de Trabalho',
        variacaoValor: -80000
      });

      expect(result.tipoAlteracao).toBe('SUPRESSAO');
      expect(result.categoria).toBe('QUANTITATIVA');
      expect(result.naturezaInstrumento).toBe('TERMO_ADITIVO');
      expect(result.impactos).toContain('ALTERA_QUANTITATIVO');
      expect(result.impactos).toContain('ALTERA_VALOR');
    });

    it('deve classificar Alteração Qualitativa como QUALITATIVA / TERMO_ADITIVO', () => {
      const result = classifyAmendment({
        tipoOuDescricao: 'Alteração de especificação técnica e metodologia executiva',
        isQualitativa: true,
        variacaoValor: 0
      });

      expect(result.tipoAlteracao).toBe('ALTERACAO_QUALITATIVA');
      expect(result.categoria).toBe('QUALITATIVA');
      expect(result.naturezaInstrumento).toBe('TERMO_ADITIVO');
      expect(result.impactos).toContain('ATUALIZA_DADOS');
    });

    it('deve classificar Reajuste de Índice como ECONOMICA / TERMO_APOSTILAMENTO', () => {
      const result = classifyAmendment({
        tipoOuDescricao: 'Reajuste anual de preços por aplicação do índice IPCA acumulado',
        isReajuste: true,
        variacaoValor: 45000
      });

      expect(result.tipoAlteracao).toBe('REAJUSTE');
      expect(result.categoria).toBe('ECONOMICA');
      expect(result.naturezaInstrumento).toBe('TERMO_APOSTILAMENTO');
      expect(result.impactos).toContain('ALTERA_VALOR');
    });

    it('deve classificar Repactuação Salarial como ECONOMICA / TERMO_ADITIVO', () => {
      const result = classifyAmendment({
        tipoOuDescricao: 'Repactuação decorrente da Convenção Coletiva de Trabalho 2026',
        isRepactuacao: true,
        variacaoValor: 60000
      });

      expect(result.tipoAlteracao).toBe('REPACTUACAO');
      expect(result.categoria).toBe('ECONOMICA');
      expect(result.naturezaInstrumento).toBe('TERMO_ADITIVO');
      expect(result.impactos).toContain('ALTERA_VALOR');
    });

    it('deve classificar Prorrogação de Vigência como TEMPORAL / TERMO_ADITIVO', () => {
      const result = classifyAmendment({
        tipoOuDescricao: 'Prorrogação de vigência por 12 meses',
        novaVigencia: '2028-01-15',
        vigenciaAnterior: '2027-01-15',
        variacaoValor: 1200000
      });

      expect(result.tipoAlteracao).toBe('PRORROGACAO');
      expect(result.categoria).toBe('TEMPORAL');
      expect(result.naturezaInstrumento).toBe('TERMO_ADITIVO');
      expect(result.impactos).toContain('ALTERA_VIGENCIA');
      expect(result.impactos).toContain('ALTERA_VALOR');
    });

    it('deve classificar Apostilamento Administrativo como ADMINISTRATIVA / TERMO_APOSTILAMENTO', () => {
      const result = classifyAmendment({
        tipoOuDescricao: 'Apostilamento para alteração da dotação orçamentária',
        isApostilamento: true
      });

      expect(result.tipoAlteracao).toBe('OUTRA_ALTERACAO');
      expect(result.categoria).toBe('ADMINISTRATIVA');
      expect(result.naturezaInstrumento).toBe('TERMO_APOSTILAMENTO');
      expect(result.impactos).toContain('ATUALIZA_DADOS');
    });
  });

  describe('2. Matriz de Compatibilidade Jurídica Assistida', () => {
    it('deve avaliar Acréscimo com Termo Aditivo como COMPATIVEL e com Apostilamento como INCOMPATIVEL', () => {
      const compAditivo = evaluateInstrumentCompatibility('ACRESCIMO', 'TERMO_ADITIVO');
      expect(compAditivo.status).toBe('COMPATIVEL');
      expect(compAditivo.exigeParecerJuridico).toBe(true);

      const compApost = evaluateInstrumentCompatibility('ACRESCIMO', 'TERMO_APOSTILAMENTO');
      expect(compApost.status).toBe('INCOMPATIVEL');
      expect(compApost.justificativa).toContain('Incompatível');
    });

    it('deve avaliar Supressão com Termo Aditivo como COMPATIVEL e com Apostilamento como INCOMPATIVEL', () => {
      const compAditivo = evaluateInstrumentCompatibility('SUPRESSAO', 'TERMO_ADITIVO');
      expect(compAditivo.status).toBe('COMPATIVEL');

      const compApost = evaluateInstrumentCompatibility('SUPRESSAO', 'TERMO_APOSTILAMENTO');
      expect(compApost.status).toBe('INCOMPATIVEL');
    });

    it('deve avaliar Alteração Qualitativa com Termo Aditivo como COMPATIVEL e com Apostilamento como INCOMPATIVEL', () => {
      const compAditivo = evaluateInstrumentCompatibility('ALTERACAO_QUALITATIVA', 'TERMO_ADITIVO');
      expect(compAditivo.status).toBe('COMPATIVEL');

      const compApost = evaluateInstrumentCompatibility('ALTERACAO_QUALITATIVA', 'TERMO_APOSTILAMENTO');
      expect(compApost.status).toBe('INCOMPATIVEL');
    });

    it('deve avaliar Reajuste com Apostilamento como COMPATIVEL (dispensa parecer) e com Aditivo como REQUER_ANALISE', () => {
      const compApost = evaluateInstrumentCompatibility('REAJUSTE', 'TERMO_APOSTILAMENTO');
      expect(compApost.status).toBe('COMPATIVEL');
      expect(compApost.exigeParecerJuridico).toBe(false);

      const compAditivo = evaluateInstrumentCompatibility('REAJUSTE', 'TERMO_ADITIVO');
      expect(compAditivo.status).toBe('REQUER_ANALISE');
    });

    it('deve avaliar Repactuação com Termo Aditivo como COMPATIVEL e com Apostilamento como INCOMPATIVEL', () => {
      const compAditivo = evaluateInstrumentCompatibility('REPACTUACAO', 'TERMO_ADITIVO');
      expect(compAditivo.status).toBe('COMPATIVEL');
      expect(compAditivo.exigeParecerJuridico).toBe(true);

      const compApost = evaluateInstrumentCompatibility('REPACTUACAO', 'TERMO_APOSTILAMENTO');
      expect(compApost.status).toBe('INCOMPATIVEL');
    });

    it('deve avaliar Prorrogação com Termo Aditivo como COMPATIVEL e com Apostilamento como INCOMPATIVEL', () => {
      const compAditivo = evaluateInstrumentCompatibility('PRORROGACAO', 'TERMO_ADITIVO');
      expect(compAditivo.status).toBe('COMPATIVEL');

      const compApost = evaluateInstrumentCompatibility('PRORROGACAO', 'TERMO_APOSTILAMENTO');
      expect(compApost.status).toBe('INCOMPATIVEL');
    });
  });

  describe('3. Rastreabilidade e Evolução de Valores', () => {
    it('deve preservar valorOriginal sem sobrescrever, calculando variações corretas', () => {
      const evolution = calculateAmendmentValueEvolution({
        valorOriginal: 1000000,
        valorVigenteAnterior: 1100000, // Contrato já tinha um aditivo anterior
        valorProposto: 1250000,
        valorAprovado: 1200000,
        isOficial: false,
        fonteValor: 'Instrução SEI'
      });

      expect(evolution.valorOriginal).toBe(1000000);
      expect(evolution.valorVigenteAnterior).toBe(1100000);
      expect(evolution.valorProposto).toBe(1250000);
      expect(evolution.valorAprovado).toBe(1200000);
      expect(evolution.valorResultante).toBe(1200000);
      expect(evolution.variacaoAbsoluta).toBe(100000); // 1.200.000 - 1.100.000
      expect(evolution.variacaoPercentual).toBeCloseTo(9.09, 2);
      expect(evolution.isOficial).toBe(false);
    });

    it('deve usar valorVigenteAnterior como resultante se nenhum novo valor foi aprovado ou proposto', () => {
      const evolution = calculateAmendmentValueEvolution({
        valorOriginal: 500000,
        valorVigenteAnterior: 500000
      });

      expect(evolution.valorResultante).toBe(500000);
      expect(evolution.variacaoAbsoluta).toBe(0);
      expect(evolution.variacaoPercentual).toBe(0);
    });
  });

  describe('4. Classificação de Oficialidade dos Dados', () => {
    it('deve classificar como FATO_OFICIAL dados soberanos do PNCP com publicação confirmada', () => {
      const oficial = classifyOfficiality({
        fonte: 'PNCP',
        dataPublicacaoOficial: '2026-10-15',
        numeroPublicacaoOficial: '12345/2026'
      });

      expect(oficial.nivelOficialidade).toBe('FATO_OFICIAL');
      expect(oficial.isFatoSoberano).toBe(true);
      expect(oficial.explicabilidade).toContain('fonte soberana');
    });

    it('deve classificar como DECISAO_INTERNA atos do SEI formalizados internamente sem publicação oficial', () => {
      const interno = classifyOfficiality({
        fonte: 'SEI / SENASP',
        numeroPublicacaoOficial: 'Portaria 15/2026'
      });

      expect(interno.nivelOficialidade).toBe('DECISAO_INTERNA');
      expect(interno.isFatoSoberano).toBe(false);
    });

    it('deve classificar como PROPOSTA_ADMINISTRATIVA dados em fase de instrução', () => {
      const proposta = classifyOfficiality({
        fonte: 'SaldoARP (Instrução)'
      });

      expect(proposta.nivelOficialidade).toBe('PROPOSTA_ADMINISTRATIVA');
      expect(proposta.isFatoSoberano).toBe(false);
    });
  });

  describe('5. Avaliação Assistida de Limites Quantitativos', () => {
    it('deve reutilizar calculateAditamentoLimits apurando acréscimos e supressões isoladamente', () => {
      const limits = evaluateAmendmentLimits({
        valorInicialAtualizado: 1000000,
        acrescimos: 200000,
        supressoes: 100000
      });

      expect(limits.percentualAcrescimo).toBe(20);
      expect(limits.percentualSupressao).toBe(10);
      expect(limits.statusAcrescimo).toBe('CONFORME');
      expect(limits.statusSupressao).toBe('CONFORME');
      expect(limits.podeRegistrarComJustificativa).toBe(true);
    });
  });

  describe('6. Construção da Entidade Canônica de Alteração e Mapeamento para Evento Formal', () => {
    it('deve construir entidade canônica de alteração associada ao contrato e ciclo', () => {
      const domain = buildContractAmendmentDomain({
        contractKey: '200331-00015-2026',
        uasg: '200331',
        numeroContrato: '15',
        anoContrato: 2026,
        cycleRef: 'VIG_20270115',
        tipoAlteracao: 'ACRESCIMO',
        categoria: 'QUANTITATIVA',
        naturezaInstrumento: 'TERMO_ADITIVO',
        numeroTermo: '1º Termo Aditivo',
        descricao: 'Acréscimo de 15% nos serviços de sustentação',
        impactos: ['ALTERA_QUANTITATIVO', 'ALTERA_VALOR'],
        valores: {
          valorOriginal: 1000000,
          valorVigenteAnterior: 1000000,
          valorAprovado: 1150000,
          valorResultante: 1150000,
          variacaoAbsoluta: 150000,
          variacaoPercentual: 15,
          isOficial: true,
          fonteValor: 'PNCP'
        },
        oficialidade: {
          nivelOficialidade: 'FATO_OFICIAL',
          fonte: 'PNCP',
          dataPublicacaoOficial: '2026-10-15',
          isFatoSoberano: true,
          explicabilidade: 'Publicado no PNCP'
        }
      });

      expect(domain.id).toContain('CONTRATO::200331-00015-2026::ACRESCIMO::1_TERMO_ADITIVO::VIG_20270115');
      expect(domain.compatibilidade.status).toBe('COMPATIVEL');
      expect(domain.valores.variacaoAbsoluta).toBe(150000);

      // Mapeamento para ContractEvent formal
      const event = buildAmendmentEvent(domain);
      expect(event.id).toBe(domain.id);
      expect(event.tipoEvento).toBe('ACRESCIMO');
      expect(event.naturezaInstrumento).toBe('TERMO_ADITIVO');
      expect(event.identificadorOficial).toBe('1º Termo Aditivo');
      expect(event.valorPosterior).toBe(1150000);
      expect(event.variacaoValor).toBe(150000);
    });
  });
});
