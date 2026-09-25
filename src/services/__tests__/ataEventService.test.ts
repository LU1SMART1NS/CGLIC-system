import { describe, it, expect } from 'vitest';
import {
  generateAtaEventId,
  classifyAtaEvent,
  buildAtaEvent,
  evaluateAtaProrrogationReadiness
} from '../ataEventService';
import {
  isInstrumentoSubstitutivo,
  type Contrato,
  type TipoInstrumentoContratual
} from '../../types';

describe('ataEventService (Fase 6.5 — Domínio Puro de Atas e Saneamento de Instrumentos)', () => {
  describe('1. generateAtaEventId', () => {
    it('deve gerar chave canônica determinística no formato ATA::{numeroAta}::{uasgGerenciadora}::{tipoEvento}::{identificadorOficial}::{cicloRef}', () => {
      const id = generateAtaEventId({
        numeroAta: '00077/2025',
        uasgGerenciadora: '200331',
        tipoEvento: 'PRORROGACAO',
        identificadorOficial: 'ADIT-01/2026',
        cicloRef: 'CICLO_2026'
      });

      expect(id).toBe('ATA::000772025::200331::PRORROGACAO::ADIT-012026::CICLO_2026');
    });

    it('deve sanitizar espaços em branco e caracteres especiais', () => {
      const id = generateAtaEventId({
        numeroAta: ' 00015 / 2026 ',
        uasgGerenciadora: '200331',
        tipoEvento: 'REAJUSTE',
        identificadorOficial: 'Apostila 02 / 2026'
      });

      expect(id).toBe('ATA::00015__2026::200331::REAJUSTE::APOSTILA_02__2026::CICLO_INICIAL');
    });
  });

  describe('2. classifyAtaEvent', () => {
    it('deve classificar Prorrogação de Vigência (Art. 84, Lei 14.133/2021)', () => {
      const res = classifyAtaEvent({
        tipoOuDescricao: '1º Termo Aditivo de Prorrogação de Vigência da Ata'
      });

      expect(res.tipoEvento).toBe('PRORROGACAO');
      expect(res.naturezaInstrumento).toBe('TERMO_ADITIVO_ATA');
      expect(res.impacto).toBe('ALTERA_VIGENCIA_ATA');
      expect(res.oficialidade).toBe('FATO_OFICIAL');
    });

    it('deve classificar Reajuste por Índice oficial em Apostilamento', () => {
      const res = classifyAtaEvent({
        tipoOuDescricao: 'Apostilamento de reajuste de preços pelo índice IPCA'
      });

      expect(res.tipoEvento).toBe('REAJUSTE');
      expect(res.naturezaInstrumento).toBe('TERMO_APOSTILAMENTO_ATA');
      expect(res.impacto).toBe('ALTERA_PRECO_REGISTRADO');
    });

    it('deve classificar Repactuação de custos decorrente de CCT', () => {
      const res = classifyAtaEvent({
        tipoOuDescricao: 'Termo Aditivo de Repactuação decorrente da Convenção Coletiva de Trabalho'
      });

      expect(res.tipoEvento).toBe('REPACTUACAO');
      expect(res.naturezaInstrumento).toBe('TERMO_ADITIVO_ATA');
      expect(res.impacto).toBe('ALTERA_PRECO_REGISTRADO');
    });

    it('deve classificar Reequilíbrio Econômico-Financeiro (Revisão extraordinária)', () => {
      const res = classifyAtaEvent({
        tipoOuDescricao: 'Pedido de reequilíbrio econômico-financeiro por álea extraordinária'
      });

      expect(res.tipoEvento).toBe('REEQUILIBRIO');
      expect(res.naturezaInstrumento).toBe('TERMO_ADITIVO_ATA');
      expect(res.impacto).toBe('ALTERA_PRECO_REGISTRADO');
    });

    it('deve classificar Remanejamento de quantitativos entre participantes (soma-zero)', () => {
      const res = classifyAtaEvent({
        tipoOuDescricao: 'Termo de Remanejamento de cotas entre órgãos participantes'
      });

      expect(res.tipoEvento).toBe('REMANEJAMENTO');
      expect(res.naturezaInstrumento).toBe('TERMO_REMANEJAMENTO');
      expect(res.impacto).toBe('REMANEJA_QUANTITATIVO');
    });

    it('deve classificar Encerramento por Escopo (consumo integral)', () => {
      const res = classifyAtaEvent({
        tipoOuDescricao: 'Encerramento de escopo por esgotamento de saldo registrado'
      });

      expect(res.tipoEvento).toBe('ENCERRAMENTO_ESCOPO');
      expect(res.impacto).toBe('EXTINGUE_ATA');
    });

    it('deve classificar Encerramento por Vigência (decurso de prazo)', () => {
      const res = classifyAtaEvent({
        tipoOuDescricao: 'Encerramento vigência por decurso do prazo regulamentar'
      });

      expect(res.tipoEvento).toBe('ENCERRAMENTO_VIGENCIA');
      expect(res.impacto).toBe('EXTINGUE_ATA');
    });

    it('deve classificar Celebração Inicial', () => {
      const res = classifyAtaEvent({
        tipoOuDescricao: 'Celebração e assinatura inicial da Ata de Registro de Preços'
      });

      expect(res.tipoEvento).toBe('CELEBRACAO');
      expect(res.naturezaInstrumento).toBe('ATA_INICIAL');
      expect(res.impacto).toBe('SEM_IMPACTO_FINANCEIRO_TEMPORAL');
    });

    it('REGRA CARDINAL LEI 14.133: deve lançar erro se tentar registrar acréscimo de quantitativo na Ata', () => {
      expect(() => {
        classifyAtaEvent({
          tipoOuDescricao: 'Termo Aditivo de Acréscimo de 25% de quantitativo na Ata'
        });
      }).toThrow(/VIOLACAO_REGULATORIA_ATA/);
    });
  });

  describe('3. buildAtaEvent', () => {
    it('deve construir um AtaEvent válido com id canônico e metadados', () => {
      const evt = buildAtaEvent({
        numeroAta: '00077/2025',
        anoAta: 2025,
        uasgGerenciadora: '200331',
        tipoEvento: 'PRORROGACAO',
        naturezaInstrumento: 'TERMO_ADITIVO_ATA',
        identificadorOficial: 'ADIT-01/2026',
        descricao: 'Prorrogação de vigência da ata por 12 meses',
        vigenciaAnterior: '2026-03-31',
        vigenciaPosterior: '2027-03-31',
        fonteOrigem: 'PNCP'
      });

      expect(evt.id).toContain('ATA::000772025::200331::PRORROGACAO::ADIT-012026');
      expect(evt.numeroAta).toBe('00077/2025');
      expect(evt.anoAta).toBe(2025);
      expect(evt.uasgGerenciadora).toBe('200331');
      expect(evt.tipoEvento).toBe('PRORROGACAO');
      expect(evt.impacto).toBe('ALTERA_VIGENCIA_ATA');
      expect(evt.oficialidade).toBe('FATO_OFICIAL');
      expect(evt.vigenciaPosterior).toBe('2027-03-31');
      expect(evt.fonteOrigem).toBe('PNCP');
      expect(evt.capturedAt).toBeDefined();
    });
  });

  describe('4. evaluateAtaProrrogationReadiness (Art. 84, Lei 14.133/2021 c/c Parecer 75/2024 AGU)', () => {
    it('Cenário 1: Deve aprovar prorrogação quando vantajosa, com anuência e saldo disponível', () => {
      const evalResult = evaluateAtaProrrogationReadiness({
        numeroAta: '00077/2025',
        uasgGerenciadora: '200331',
        vigenciaAtual: '2026-06-30',
        saldoDisponivelTotal: 500,
        pesquisaPrecoVantajosa: true,
        fornecedorConcordou: true
      });

      expect(evalResult.status).toBe('PRONTA');
      expect(evalResult.aptaParaProrrogacao).toBe(true);
      expect(evalResult.badge.color).toBe('verde');
      expect(evalResult.badge.label).toBe('Apta para Prorrogação');
      expect(evalResult.novaVigenciaSugerida).toBe('2027-06-30');
      expect(evalResult.podeProsseguirComJustificativa).toBe(true);
      expect(evalResult.alertas).toHaveLength(0);
    });

    it('Cenário 2: Deve aprovar prorrogação com saldo zerado quando houver previsão expressa no edital de renovação de cotas (Parecer 75/2024 AGU)', () => {
      const evalResult = evaluateAtaProrrogationReadiness({
        numeroAta: '00077/2025',
        uasgGerenciadora: '200331',
        vigenciaAtual: '2026-06-30',
        saldoDisponivelTotal: 0,
        pesquisaPrecoVantajosa: true,
        fornecedorConcordou: true,
        editalPreveRenovacaoQuantitativos: true
      });

      expect(evalResult.status).toBe('PRONTA');
      expect(evalResult.aptaParaProrrogacao).toBe(true);
      expect(evalResult.badge.color).toBe('verde');
      expect(evalResult.alertas.some(a => a.includes('edital prevê expressamente a renovação'))).toBe(true);
      expect(evalResult.podeProsseguirComJustificativa).toBe(true);
    });

    it('Cenário 3: Deve reprovar e alertar quando saldo estiver zerado SEM previsão de renovação em edital', () => {
      const evalResult = evaluateAtaProrrogationReadiness({
        numeroAta: '00077/2025',
        uasgGerenciadora: '200331',
        vigenciaAtual: '2026-06-30',
        saldoDisponivelTotal: 0,
        pesquisaPrecoVantajosa: true,
        fornecedorConcordou: true,
        editalPreveRenovacaoQuantitativos: false
      });

      expect(evalResult.status).toBe('SALDO_ESGOTADO_SEM_PREVISAO_EDITAL');
      expect(evalResult.aptaParaProrrogacao).toBe(false);
      expect(evalResult.badge.color).toBe('vermelho');
      expect(evalResult.badge.label).toBe('Saldo Zerado sem Previsão');
      expect(evalResult.alertas.some(a => a.includes('sem previsão no edital a prorrogação de ata exaurida é vedada'))).toBe(true);
      expect(evalResult.podeProsseguirComJustificativa).toBe(true); // Assistência, não bloqueio cego
    });

    it('Cenário 4: Deve apontar pendência quando a pesquisa de preços não tiver sido realizada', () => {
      const evalResult = evaluateAtaProrrogationReadiness({
        numeroAta: '00077/2025',
        uasgGerenciadora: '200331',
        vigenciaAtual: '2026-06-30',
        saldoDisponivelTotal: 300,
        pesquisaPrecoVantajosa: undefined,
        fornecedorConcordou: true
      });

      expect(evalResult.status).toBe('PENDENTE_PESQUISA_PRECO');
      expect(evalResult.aptaParaProrrogacao).toBe(false);
      expect(evalResult.badge.color).toBe('amarelo');
    });

    it('Cenário 5: Deve alertar quando os preços registrados forem desvantajosos perante o mercado', () => {
      const evalResult = evaluateAtaProrrogationReadiness({
        numeroAta: '00077/2025',
        uasgGerenciadora: '200331',
        vigenciaAtual: '2026-06-30',
        saldoDisponivelTotal: 300,
        pesquisaPrecoVantajosa: false,
        fornecedorConcordou: true
      });

      expect(evalResult.status).toBe('PRECO_DESVANTAJOSO');
      expect(evalResult.aptaParaProrrogacao).toBe(false);
      expect(evalResult.badge.color).toBe('vermelho');
      expect(evalResult.alertas.some(a => a.includes('preços registrados não são mais vantajosos'))).toBe(true);
    });

    it('Cenário 6: Deve indicar impedimento caso o fornecedor recuse prorrogar', () => {
      const evalResult = evaluateAtaProrrogationReadiness({
        numeroAta: '00077/2025',
        uasgGerenciadora: '200331',
        vigenciaAtual: '2026-06-30',
        saldoDisponivelTotal: 300,
        pesquisaPrecoVantajosa: true,
        fornecedorConcordou: false
      });

      expect(evalResult.status).toBe('IMPEDIDA');
      expect(evalResult.aptaParaProrrogacao).toBe(false);
      expect(evalResult.badge.color).toBe('vermelho');
      expect(evalResult.badge.label).toBe('Prorrogação Impedida');
    });
  });

  describe('5. Saneamento de Instrumentos Contratuais e Art. 95', () => {
    it('deve permitir contrato legítimo sem arpId (dispensa/inexigibilidade de licitação)', () => {
      const contratoCompraDireta: Contrato = {
        id: 'ct-dispensa-01',
        numero: '05/2026',
        ano: 2026,
        uasg: '200331',
        // arpId é opcional após saneamento da Fase 6.5
        objeto: 'Aquisição emergencial direta por dispensa (Art. 75, II)',
        fornecedor: 'Fornecedor Direto Ltda',
        origem: 'MANUAL',
        tipoInstrumento: 'TERMO_CONTRATO',
        criadoEm: '2026-01-01',
        atualizadoEm: '2026-01-01'
      };

      expect(contratoCompraDireta.arpId).toBeUndefined();
      expect(contratoCompraDireta.tipoInstrumento).toBe('TERMO_CONTRATO');
    });

    it('deve identificar corretamente instrumentos substitutivos pelo Art. 95 da Lei 14.133/2021', () => {
      const tipos: TipoInstrumentoContratual[] = [
        'TERMO_CONTRATO',
        'CARTA_CONTRATO',
        'NOTA_EMPENHO',
        'AUTORIZACAO_COMPRA',
        'ORDEM_EXECUCAO_SERVICO',
        'OUTRO_INSTRUMENTO_HABIL'
      ];

      expect(isInstrumentoSubstitutivo(tipos[0])).toBe(false); // TERMO_CONTRATO é solene bilateral
      expect(isInstrumentoSubstitutivo(tipos[1])).toBe(true);  // CARTA_CONTRATO é substitutivo
      expect(isInstrumentoSubstitutivo(tipos[2])).toBe(true);  // NOTA_EMPENHO é substitutivo
      expect(isInstrumentoSubstitutivo(tipos[3])).toBe(true);  // AUTORIZACAO_COMPRA é substitutivo
      expect(isInstrumentoSubstitutivo(tipos[4])).toBe(true);  // ORDEM_EXECUCAO_SERVICO é substitutivo
      expect(isInstrumentoSubstitutivo(tipos[5])).toBe(true);  // OUTRO_INSTRUMENTO_HABIL é substitutivo
      expect(isInstrumentoSubstitutivo(undefined)).toBe(false);
    });
  });
});
