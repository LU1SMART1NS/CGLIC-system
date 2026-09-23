import { describe, it, expect } from 'vitest';
import {
  generateIdempotentEventId,
  classifyContractEvent,
  calculateAditamentoLimits,
  explainVigenciaTransition,
  deriveContractLifecycleState,
  buildContractEventsFromOfficialData
} from '../contractEventService';
import type { ContractDashboardRecord, ContractEvent } from '../../types';

describe('contractEventService (Fase 4.1 — Modelo de Domínio e Eventos)', () => {
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
    valorGlobal: 1000000.0,
    valorInicial: 1000000.0,
    dataAssinatura: '2026-01-10',
    dataVigenciaInicio: '2026-01-15',
    dataVigenciaFim: '2027-01-15',
    statusVigencia: 'Vigente',
    fonteDados: 'Contratos.gov.br'
  };

  describe('1. generateIdempotentEventId', () => {
    it('deve gerar chave canônica determinística no formato esperado', () => {
      const id = generateIdempotentEventId({
        contractKey: '200331-00015-2026',
        tipoEvento: 'PRORROGACAO',
        identificadorOficial: 'TA-01/2026',
        cicloRef: 'VIG_20270115'
      });

      expect(id).toBe('CONTRATO::200331-00015-2026::PRORROGACAO::TA-012026::VIG_20270115');
    });

    it('deve sanitizar espaços, minúsculas e caracteres inválidos', () => {
      const id = generateIdempotentEventId({
        contractKey: '  200331-00015-2026  ',
        tipoEvento: 'reajuste' as any,
        identificadorOficial: 'Apostilamento 02 / 2026',
        cicloRef: 'Ciclo Anual 2026'
      });

      expect(id).toBe('CONTRATO::200331-00015-2026::REAJUSTE::APOSTILAMENTO_02__2026::CICLO_ANUAL_2026');
    });
  });

  describe('2. classifyContractEvent', () => {
    it('deve classificar Prorrogação de Vigência corretamente', () => {
      const result = classifyContractEvent({
        tipoOuDescricao: '1º Termo Aditivo de Prorrogação de Vigência',
        novaVigencia: '2028-01-15',
        vigenciaAnterior: '2027-01-15'
      });

      expect(result.tipoEvento).toBe('PRORROGACAO');
      expect(result.naturezaInstrumento).toBe('TERMO_ADITIVO');
      expect(result.impacto).toBe('ALTERA_VIGENCIA');
    });

    it('deve classificar Repactuação Salarial decorrente de CCT', () => {
      const result = classifyContractEvent({
        tipoOuDescricao: 'Termo Aditivo de Repactuação decorrente da Convenção Coletiva de Trabalho 2026',
        variacaoValor: 50000
      });

      expect(result.tipoEvento).toBe('REPACTUACAO');
      expect(result.naturezaInstrumento).toBe('TERMO_ADITIVO');
      expect(result.impacto).toBe('ALTERA_VALOR');
    });

    it('deve classificar Reajuste por Apostilamento', () => {
      const result = classifyContractEvent({
        tipoOuDescricao: 'Termo de Apostilamento para aplicação do índice IPCA acumulado',
        isApostilamento: true,
        variacaoValor: 35000
      });

      expect(result.tipoEvento).toBe('REAJUSTE');
      expect(result.naturezaInstrumento).toBe('TERMO_APOSTILAMENTO');
      expect(result.impacto).toBe('ALTERA_VALOR');
    });

    it('deve classificar Acréscimo e Supressão de valor', () => {
      const acresc = classifyContractEvent({
        tipoOuDescricao: 'Termo Aditivo de Acréscimo Quantitativo de 15%',
        variacaoValor: 150000
      });
      expect(acresc.tipoEvento).toBe('ACRESCIMO');
      expect(acresc.impacto).toBe('ALTERA_VALOR');

      const supress = classifyContractEvent({
        tipoOuDescricao: 'Termo Aditivo de Supressão de Itens',
        variacaoValor: -80000
      });
      expect(supress.tipoEvento).toBe('SUPRESSAO');
      expect(supress.impacto).toBe('ALTERA_VALOR');
    });

    it('deve classificar Encerramento e Rescisão', () => {
      const enc = classifyContractEvent({
        tipoOuDescricao: 'Termo de Recebimento Definitivo e Encerramento',
        isEncerramento: true
      });
      expect(enc.tipoEvento).toBe('ENCERRAMENTO');
      expect(enc.naturezaInstrumento).toBe('TERMO_RECEBIMENTO_DEFINITIVO');
      expect(enc.impacto).toBe('EXTINGUE_CONTRATO');

      const resc = classifyContractEvent({
        tipoOuDescricao: 'Notificação de Rescisão Unilateral por Inadimplemento',
        isRescisao: true
      });
      expect(resc.tipoEvento).toBe('RESCISAO');
      expect(resc.naturezaInstrumento).toBe('NOTIFICACAO_RESCISAO');
      expect(resc.impacto).toBe('EXTINGUE_CONTRATO');
    });
  });

  describe('3. calculateAditamentoLimits (Art. 125 e 126 Lei 14.133/21)', () => {
    it('deve validar acréscimo ordinário de até 25% como CONFORME (verde)', () => {
      const eval20 = calculateAditamentoLimits({
        valorInicialAtualizado: 1000000,
        acrescimos: 200000, // 20%
        supressoes: 0
      });

      expect(eval20.percentualAcrescimo).toBe(20);
      expect(eval20.statusAcrescimo).toBe('CONFORME');
      expect(eval20.badgeAcrescimo.color).toBe('verde');
      expect(eval20.podeRegistrarComJustificativa).toBe(true);
    });

    it('deve emitir ALERTA_EXCEDE_ORDINARIO (vermelho) quando acréscimo ultrapassar 25% em contrato ordinário', () => {
      const eval30 = calculateAditamentoLimits({
        valorInicialAtualizado: 1000000,
        acrescimos: 300000, // 30%
        supressoes: 0,
        isReforma: false
      });

      expect(eval30.percentualAcrescimo).toBe(30);
      expect(eval30.statusAcrescimo).toBe('ALERTA_EXCEDE_ORDINARIO');
      expect(eval30.badgeAcrescimo.color).toBe('vermelho');
      // Garante princípio de não-bloqueio cego (assistência, não decisão jurídica)
      expect(eval30.podeRegistrarComJustificativa).toBe(true);
    });

    it('deve admitir até 50% de acréscimo em hipótese de REFORMA com status ATENCAO_REFORMA (amarelo)', () => {
      const evalReforma40 = calculateAditamentoLimits({
        valorInicialAtualizado: 1000000,
        acrescimos: 400000, // 40%
        supressoes: 0,
        isReforma: true
      });

      expect(evalReforma40.percentualAcrescimo).toBe(40);
      expect(evalReforma40.statusAcrescimo).toBe('ATENCAO_REFORMA');
      expect(evalReforma40.badgeAcrescimo.color).toBe('amarelo');
    });

    it('deve alertar sobre necessidade de ACORDO BILATERAL em supressões acima de 25% (art. 126)', () => {
      const evalSupress35 = calculateAditamentoLimits({
        valorInicialAtualizado: 1000000,
        acrescimos: 0,
        supressoes: 350000 // 35%
      });

      expect(evalSupress35.percentualSupressao).toBe(35);
      expect(evalSupress35.statusSupressao).toBe('ALERTA_EXCEDE_ORDINARIO_EXIGE_CONSENSO');
      expect(evalSupress35.badgeSupressao.color).toBe('amarelo');
    });

    it('NÃO deve compensar acréscimos e supressões (cálculo estrito e isolado)', () => {
      // Acréscimo de R$ 200.000 (20%) e Supressão de R$ 200.000 (20%)
      const evalComp = calculateAditamentoLimits({
        valorInicialAtualizado: 1000000,
        acrescimos: 200000,
        supressoes: -200000
      });

      expect(evalComp.percentualAcrescimo).toBe(20);
      expect(evalComp.percentualSupressao).toBe(20);
      expect(evalComp.totalAcrescimos).toBe(200000);
      expect(evalComp.totalSupressoes).toBe(200000);
    });
  });

  describe('4. explainVigenciaTransition', () => {
    it('deve fornecer explicabilidade completa com os 6 quesitos institucionais', () => {
      const mockEvent: ContractEvent = {
        id: 'CONTRATO::200331-00015-2026::PRORROGACAO::TA_01::SEQ_1',
        contractKey: '200331-00015-2026',
        uasg: '200331',
        numeroContrato: '15',
        anoContrato: 2026,
        tipoEvento: 'PRORROGACAO',
        naturezaInstrumento: 'TERMO_ADITIVO',
        identificadorOficial: '1º Termo Aditivo',
        descricao: 'Prorrogação de vigência por 12 meses',
        dataPublicacao: '2026-10-15',
        vigenciaAnterior: '2027-01-15',
        vigenciaPosterior: '2028-01-15',
        impacto: 'ALTERA_VIGENCIA',
        fonteOrigem: 'PNCP',
        capturedAt: '2026-10-16T10:00:00Z'
      };

      const currentDate = new Date(2026, 9, 20); // 2026-10-20
      const transition = explainVigenciaTransition({
        contract: mockContract,
        event: mockEvent,
        currentDate
      });

      expect(transition.contractKey).toBe('200331-00015-2026');
      expect(transition.vigenciaAnterior).toBe('2027-01-15');
      expect(transition.novaVigencia).toBe('2028-01-15');
      expect(transition.eventoGeradorId).toBe(mockEvent.id);
      expect(transition.fonteOficialConfirmadora).toBe('PNCP');
      expect(transition.novoCicloRef).toBe('VIG_20280115');
      expect(transition.novoGatilhoId).toContain('PRORROGACAO::GATILHO_180D::VIG_20280115');
      expect(transition.explicabilidadeTexto).toContain('Vigência contratual alterada de 2027-01-15 para 2028-01-15');
    });
  });

  describe('5. deriveContractLifecycleState', () => {
    it('deve derivar VIGENTE para contrato em execução normal', () => {
      const state = deriveContractLifecycleState({
        contract: mockContract
      });
      expect(state).toBe('VIGENTE');
    });

    it('deve derivar EM_PRORROGACAO quando houver workflow ativo de prorrogação', () => {
      const state = deriveContractLifecycleState({
        contract: mockContract,
        hasActiveProrrogationWorkflow: true
      });
      expect(state).toBe('EM_PRORROGACAO');
    });

    it('deve derivar RESCINDIDO quando rescindido', () => {
      const state = deriveContractLifecycleState({
        contract: mockContract,
        isRescindido: true
      });
      expect(state).toBe('RESCINDIDO');
    });

    it('deve derivar ENCERRADO quando contrato expirou vigência', () => {
      const state = deriveContractLifecycleState({
        contract: { ...mockContract, statusVigencia: 'Expirado' }
      });
      expect(state).toBe('ENCERRADO');
    });
  });

  describe('6. buildContractEventsFromOfficialData', () => {
    it('deve construir evento inicial de celebração a partir do contrato', () => {
      const events = buildContractEventsFromOfficialData(mockContract, []);
      expect(events.length).toBe(1);
      expect(events[0].tipoEvento).toBe('CELEBRACAO');
      expect(events[0].naturezaInstrumento).toBe('CONTRATO_INICIAL');
      expect(events[0].contractKey).toBe(mockContract.id);
      expect(events[0].fonteOrigem).toBe('Contratos.gov.br');
    });

    it('deve mapear aditivos oficiais adicionais sem duplicidades', () => {
      const aditivosRaw = [
        {
          sequencial: 1,
          tipoTermoContrato: 'Termo Aditivo de Prorrogação',
          dataAssinatura: '2026-11-20',
          dataVigenciaFim: '2028-01-15',
          valorGlobal: 1200000,
          fonte: 'PNCP'
        }
      ];

      const events = buildContractEventsFromOfficialData(mockContract, aditivosRaw);
      expect(events.length).toBe(2);
      expect(events[0].tipoEvento).toBe('CELEBRACAO');
      expect(events[1].tipoEvento).toBe('PRORROGACAO');
      expect(events[1].identificadorOficial).toBe('1º Termo Aditivo');
      expect(events[1].vigenciaPosterior).toBe('2028-01-15');
      expect(events[1].valorPosterior).toBe(1200000);
    });
  });
});
