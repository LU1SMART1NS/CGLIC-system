import { describe, it, expect } from 'vitest';
import {
  generateExtinctionDomainId,
  classifyContractExtinction,
  evaluateContractClosureReadiness,
  evaluateExtinctionReadiness,
  deriveContractExtinctionState,
  buildContractExtinctionDomain,
  buildExtinctionContractEvent
} from '../contractExtinctionService';
import type { ContractDashboardRecord } from '../../types';

describe('contractExtinctionService — Fase 4.4A (Domínio Puro de Extinção e Encerramento)', () => {
  const mockContractVigente: ContractDashboardRecord = {
    id: 'CTR-2026-001',
    numero: '01/2026',
    ano: 2026,
    numeroFormatado: '00001/2026',
    uasg: '200005',
    nomeOrgao: 'SENASP/MJSP',
    fornecedorNome: 'EMPRESA EXEMPLO LTDA',
    fornecedorCnpjCpf: '12.345.678/0001-90',
    objeto: 'Prestação de serviços contínuos de TI',
    valorGlobal: 500000.0,
    valorInicial: 500000.0,
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

  describe('1. generateExtinctionDomainId', () => {
    it('deve gerar chave lógica canônica determinística para extinção', () => {
      const id = generateExtinctionDomainId('CTR-2026-001', 'EXTINCAO_ORDINARIA', 'VIG_20261231');
      expect(id).toBe('EXTINCAO::CTR-2026-001::EXTINCAO_ORDINARIA::VIG_20261231');
    });

    it('deve suportar identificador customizado para desambiguação', () => {
      const id = generateExtinctionDomainId('CTR-2026-001', 'EXTINCAO_UNILATERAL', 'VIG_20261231', 'PAD-01-2026');
      expect(id).toBe('EXTINCAO::CTR-2026-001::EXTINCAO_UNILATERAL::VIG_20261231::PAD-01-2026');
    });
  });

  describe('2. classifyContractExtinction', () => {
    it('deve classificar extinção ordinária por padrão', () => {
      const res = classifyContractExtinction({});
      expect(res.tipoExtincao).toBe('EXTINCAO_ORDINARIA');
      expect(res.sugestaoInstrumento).toBe('TERMO_RECEBIMENTO_DEFINITIVO');
    });

    it('deve classificar extinção unilateral quando houver menção a rescisão ou descumprimento', () => {
      const res = classifyContractExtinction({ tipoOuDescricao: 'Rescisão unilateral por inexecução parcial do serviço' });
      expect(res.tipoExtincao).toBe('EXTINCAO_UNILATERAL');
      expect(res.sugestaoInstrumento).toBe('ATO_UNILATERAL');
    });

    it('deve classificar extinção consensual / distrato amigável', () => {
      const res = classifyContractExtinction({ tipoOuDescricao: 'Distrato bilateral consensual por mútuo acordo' });
      expect(res.tipoExtincao).toBe('EXTINCAO_CONSENSUAL');
      expect(res.sugestaoInstrumento).toBe('INSTRUMENTO_CONSENSUAL');
    });

    it('deve classificar extinção judicial ou arbitral', () => {
      const res = classifyContractExtinction({ tipoOuDescricao: 'Extinção por sentença judicial transitada em julgado' });
      expect(res.tipoExtincao).toBe('EXTINCAO_JUDICIAL_ARBITRAL');
      expect(res.sugestaoInstrumento).toBe('DECISAO_JUDICIAL');
    });
  });

  describe('3. evaluateContractClosureReadiness (Checklist de Encerramento Regular)', () => {
    it('deve retornar PRONTO_PARA_ENCERRAMENTO quando todos os requisitos estiverem cumpridos', () => {
      const res = evaluateContractClosureReadiness({
        objetoRecebidoDefinitivo: true,
        termoRecebimentoDefinitivoSei: 'SEI-123456',
        pagamentosPendentes: false,
        saldoFinanceiroRemanescente: 0,
        garantiaExigida: true,
        garantiaLiberada: true,
        pendenciasExecucaoIdentificadas: false,
        pendenciasTrabalhistasFiscais: false
      }, true);

      expect(res.status).toBe('PRONTO_PARA_ENCERRAMENTO');
      expect(res.pendenciasIdentificadas).toHaveLength(0);
      expect(res.podeProsseguirComJustificativa).toBe(true);
    });

    it('deve apontar PENDENCIAS_IMPEDITIVAS quando TRD estiver ausente em contrato vencido', () => {
      const res = evaluateContractClosureReadiness({
        objetoRecebidoDefinitivo: false,
        pagamentosPendentes: false
      }, true);

      expect(res.status).toBe('PENDENCIAS_IMPEDITIVAS');
      expect(res.pendenciasIdentificadas.some(p => p.includes('TRD'))).toBe(true);
    });

    it('deve apontar pendências de garantia quando exigida e não liberada', () => {
      const res = evaluateContractClosureReadiness({
        objetoRecebidoDefinitivo: true,
        garantiaExigida: true,
        garantiaLiberada: false
      }, true);

      expect(res.status).toBe('PENDENCIAS_IMPEDITIVAS');
      expect(res.pendenciasIdentificadas.some(p => p.includes('Garantia'))).toBe(true);
    });
  });

  describe('4. evaluateExtinctionReadiness (Rescisão Antecipada)', () => {
    it('deve apontar pendência de contraditório prévio na rescisão unilateral', () => {
      const res = evaluateExtinctionReadiness({
        tipoExtincao: 'EXTINCAO_UNILATERAL',
        motivacao: {
          descricaoMotivo: 'Desídia reiterada da contratada',
          processoSeiNumero: '08001.000123/2026-11',
          contraditorioAmplaDefesaAssegurado: false
        }
      });

      expect(res.status).toBe('INFORMACOES_INSUFICIENTES');
      expect(res.pendenciasIdentificadas.some(p => p.includes('contraditório'))).toBe(true);
    });

    it('deve aprovar instrução consistente de rescisão quando contraditório e processo existirem', () => {
      const res = evaluateExtinctionReadiness({
        tipoExtincao: 'EXTINCAO_UNILATERAL',
        motivacao: {
          descricaoMotivo: 'Descumprimento reiterado com notificação e prazo para defesa exaurido',
          processoSeiNumero: '08001.000123/2026-11',
          contraditorioAmplaDefesaAssegurado: true,
          parecerJuridicoNumero: 'Parecer 050/2026/CONJUR'
        }
      });

      expect(res.status).toBe('PRONTO_PARA_ENCERRAMENTO');
      expect(res.pendenciasIdentificadas).toHaveLength(0);
    });
  });

  describe('5. deriveContractExtinctionState', () => {
    it('deve retornar VIGENTE para contrato em vigor sem processo de encerramento', () => {
      const state = deriveContractExtinctionState({
        contractVigente: true,
        vigenciaExpirada: false
      });
      expect(state).toBe('VIGENTE');
    });

    it('deve retornar AGUARDANDO_RECEBIMENTO_DEFINITIVO para contrato vencido com TRD pendente', () => {
      const state = deriveContractExtinctionState({
        contractVigente: false,
        vigenciaExpirada: true,
        checklist: { objetoRecebidoDefinitivo: false }
      });
      expect(state).toBe('AGUARDANDO_RECEBIMENTO_DEFINITIVO');
    });

    it('deve retornar AGUARDANDO_QUITACAO para contrato vencido com saldo/pagamento pendente', () => {
      const state = deriveContractExtinctionState({
        contractVigente: false,
        vigenciaExpirada: true,
        checklist: {
          objetoRecebidoDefinitivo: true,
          termoRecebimentoDefinitivoSei: 'SEI-123',
          pagamentosPendentes: true
        }
      });
      expect(state).toBe('AGUARDANDO_QUITACAO');
    });

    it('deve retornar AGUARDANDO_LIBERACAO_GARANTIA quando apenas a garantia estiver retida', () => {
      const state = deriveContractExtinctionState({
        contractVigente: false,
        vigenciaExpirada: true,
        checklist: {
          objetoRecebidoDefinitivo: true,
          termoRecebimentoDefinitivoSei: 'SEI-123',
          pagamentosPendentes: false,
          garantiaExigida: true,
          garantiaLiberada: false
        }
      });
      expect(state).toBe('AGUARDANDO_LIBERACAO_GARANTIA');
    });

    it('deve retornar ENCERRADO somente quando houver fato oficial soberano para extinção ordinária', () => {
      const state = deriveContractExtinctionState({
        contractVigente: false,
        vigenciaExpirada: true,
        tipoExtincao: 'EXTINCAO_ORDINARIA',
        oficialidade: {
          nivelOficialidade: 'FATO_OFICIAL',
          fonte: 'PNCP',
          isFatoSoberano: true,
          explicabilidade: 'Publicado no PNCP'
        }
      });
      expect(state).toBe('ENCERRADO');
    });

    it('deve retornar EXTINTO somente quando houver fato oficial soberano para rescisão', () => {
      const state = deriveContractExtinctionState({
        contractVigente: false,
        vigenciaExpirada: false,
        tipoExtincao: 'EXTINCAO_UNILATERAL',
        oficialidade: {
          nivelOficialidade: 'FATO_OFICIAL',
          fonte: 'PNCP',
          isFatoSoberano: true,
          explicabilidade: 'Rescisão publicada no DOU/PNCP'
        }
      });
      expect(state).toBe('EXTINTO');
    });
  });

  describe('6. buildContractExtinctionDomain e buildExtinctionContractEvent', () => {
    it('deve construir entidade agregadora completa de extinção', () => {
      const domain = buildContractExtinctionDomain({
        contract: mockContractExpirado,
        tipoExtincao: 'EXTINCAO_ORDINARIA',
        checklist: {
          objetoRecebidoDefinitivo: true,
          termoRecebimentoDefinitivoSei: 'SEI-999',
          pagamentosPendentes: false
        },
        processoSeiNumero: '08001.000123/2026-11'
      });

      expect(domain.id).toBe('EXTINCAO::CTR-2025-099::EXTINCAO_ORDINARIA::VIG_20251231');
      expect(domain.tipoExtincao).toBe('EXTINCAO_ORDINARIA');
      expect(domain.avaliacaoProntidao.status).toBe('PRONTO_PARA_ENCERRAMENTO');
      expect(domain.oficialidade.isFatoSoberano).toBe(false);
    });

    it('deve mapear para ContractEvent formal com impacto EXTINGUE_CONTRATO', () => {
      const domain = buildContractExtinctionDomain({
        contract: mockContractExpirado,
        tipoExtincao: 'EXTINCAO_ORDINARIA',
        instrumentoFormal: 'TERMO_RECEBIMENTO_DEFINITIVO',
        identificadorInstrumento: 'TRD-01/2026',
        checklist: { objetoRecebidoDefinitivo: true },
        oficialidade: {
          nivelOficialidade: 'FATO_OFICIAL',
          fonte: 'PNCP',
          isFatoSoberano: true,
          explicabilidade: 'Publicado no PNCP'
        }
      });

      const event = buildExtinctionContractEvent(domain);
      expect(event.tipoEvento).toBe('ENCERRAMENTO');
      expect(event.impacto).toBe('EXTINGUE_CONTRATO');
      expect(event.naturezaInstrumento).toBe('TERMO_RECEBIMENTO_DEFINITIVO');
      expect(event.identificadorOficial).toBe('TRD-01/2026');
    });
  });

  describe('7. Prova das 10 Regras de Segurança do Domínio', () => {
    it('REGRA 1: Fim da vigência ≠ Encerramento formal', () => {
      const domain = buildContractExtinctionDomain({
        contract: mockContractExpirado,
        tipoExtincao: 'EXTINCAO_ORDINARIA',
        checklist: { objetoRecebidoDefinitivo: false } // Sem TRD ainda
      });
      // Contrato expirado cronologicamente NÃO está com status ENCERRADO
      expect(domain.situacaoOperacional).not.toBe('ENCERRADO');
      expect(domain.situacaoOperacional).toBe('AGUARDANDO_RECEBIMENTO_DEFINITIVO');
    });

    it('REGRA 2: Fim da vigência ≠ Rescisão/Extinção antecipada', () => {
      const domain = buildContractExtinctionDomain({
        contract: mockContractExpirado,
        tipoExtincao: 'EXTINCAO_ORDINARIA'
      });
      expect(domain.tipoExtincao).not.toBe('EXTINCAO_UNILATERAL');
      expect(domain.situacaoOperacional).not.toBe('EXTINTO');
    });

    it('REGRA 3: Tarefa concluída ≠ Fato oficial soberano', () => {
      const domain = buildContractExtinctionDomain({
        contract: mockContractExpirado,
        tipoExtincao: 'EXTINCAO_ORDINARIA',
        checklist: { objetoRecebidoDefinitivo: true, regularidadeSicafFinalVerificada: true },
        oficialidade: {
          nivelOficialidade: 'PROPOSTA_ADMINISTRATIVA',
          fonte: 'SaldoARP',
          isFatoSoberano: false,
          explicabilidade: 'Apenas instrução interna concluída'
        }
      });
      expect(domain.oficialidade.isFatoSoberano).toBe(false);
      expect(domain.situacaoOperacional).not.toBe('ENCERRADO');
    });

    it('REGRA 4: Decisão interna ≠ Publicação oficial soberana', () => {
      const domain = buildContractExtinctionDomain({
        contract: mockContractExpirado,
        tipoExtincao: 'EXTINCAO_UNILATERAL',
        motivacao: {
          descricaoMotivo: 'Decisão do Secretário de rescindir o contrato',
          decisaoAdministrativaNumero: 'Despacho nº 45/2026'
        },
        oficialidade: {
          nivelOficialidade: 'DECISAO_INTERNA',
          fonte: 'SEI',
          dataPublicacaoOficial: undefined,
          isFatoSoberano: false,
          explicabilidade: 'Despacho interno assinado, aguardando DOU'
        }
      });
      expect(domain.situacaoOperacional).toBe('EXTINCAO_AGUARDANDO_CONFIRMACAO');
      expect(domain.oficialidade.isFatoSoberano).toBe(false);
    });

    it('REGRA 5: Ausência de TRD não cria modalidade jurídica nova', () => {
      const res = classifyContractExtinction({ tipoOuDescricao: 'Contrato vencido sem TRD' });
      // Permanece na modalidade EXTINCAO_ORDINARIA, e não em um tipo jurídico anômalo
      expect(res.tipoExtincao).toBe('EXTINCAO_ORDINARIA');
    });

    it('REGRA 6: Pendência financeira não é automaticamente inadimplemento culposo', () => {
      const readiness = evaluateContractClosureReadiness({
        objetoRecebidoDefinitivo: true,
        pagamentosPendentes: true,
        saldoFinanceiroRemanescente: 50000
      }, true);
      // Aponta pendência operacional de liquidação, sem classificar como rescisão
      expect(readiness.status).toBe('PENDENCIAS_IMPEDITIVAS');
      expect(readiness.pendenciasIdentificadas.some(p => p.includes('pagamentos pendentes'))).toBe(true);
    });

    it('REGRA 7: Pendência documental não altera fato oficial soberano', () => {
      const domain = buildContractExtinctionDomain({
        contract: mockContractExpirado,
        tipoExtincao: 'EXTINCAO_ORDINARIA',
        checklist: { pendenciasExecucaoIdentificadas: true },
        oficialidade: {
          nivelOficialidade: 'FATO_OFICIAL',
          fonte: 'PNCP',
          isFatoSoberano: true,
          explicabilidade: 'Termo homologado e divulgado oficialmente'
        }
      });
      expect(domain.oficialidade.isFatoSoberano).toBe(true);
    });

    it('REGRA 8: Preservação de histórico e idempotência', () => {
      const id1 = generateExtinctionDomainId('CTR-001', 'EXTINCAO_ORDINARIA', 'VIG_20261231');
      const id2 = generateExtinctionDomainId('CTR-001', 'EXTINCAO_ORDINARIA', 'VIG_20261231');
      expect(id1).toBe(id2);
    });

    it('REGRA 9: Suporte a obrigações pós-vigência', () => {
      const state = deriveContractExtinctionState({
        contractVigente: false,
        vigenciaExpirada: true,
        checklist: {
          objetoRecebidoDefinitivo: true,
          termoRecebimentoDefinitivoSei: 'SEI-123',
          garantiaExigida: true,
          garantiaLiberada: false, // Garantia ainda caucionada após fim da vigência
          obrigacoesPosContratuaisPendentes: true
        }
      });
      expect(state).toBe('AGUARDANDO_LIBERACAO_GARANTIA');
    });

    it('REGRA 10: Pureza de funções — sem efeitos colaterais', () => {
      const contractClone = { ...mockContractExpirado };
      const domain = buildContractExtinctionDomain({
        contract: contractClone,
        tipoExtincao: 'EXTINCAO_ORDINARIA'
      });
      expect(contractClone.valorGlobal).toBe(500000.0);
      expect(contractClone.statusVigencia).toBe('Expirado');
      expect(domain).toBeDefined();
    });

    it('CENÁRIO 20 & 21: Múltiplos eventos no mesmo ciclo com discriminador determinístico', () => {
      const id1 = generateExtinctionDomainId('CTR-001', 'EXTINCAO_UNILATERAL', 'VIG_20261231', 'PAD-01');
      const id2 = generateExtinctionDomainId('CTR-001', 'EXTINCAO_UNILATERAL', 'VIG_20261231', 'PAD-02');
      expect(id1).not.toBe(id2);
      expect(id1).toContain('PAD-01');
      expect(id2).toContain('PAD-02');
    });

    it('CENÁRIO 22: Ausência de instrumento formal na instrução e fornecimento na publicação', () => {
      const domainSemInstrumento = buildContractExtinctionDomain({
        contract: mockContractVigente,
        tipoExtincao: 'EXTINCAO_ORDINARIA'
      });
      expect(domainSemInstrumento.instrumentoFormal).toBeUndefined();

      const domainComInstrumento = buildContractExtinctionDomain({
        contract: mockContractExpirado,
        tipoExtincao: 'EXTINCAO_ORDINARIA',
        instrumentoFormal: 'TERMO_RECEBIMENTO_DEFINITIVO',
        identificadorInstrumento: 'TRD-99/2026'
      });
      expect(domainComInstrumento.instrumentoFormal).toBe('TERMO_RECEBIMENTO_DEFINITIVO');
      expect(domainComInstrumento.identificadorInstrumento).toBe('TRD-99/2026');
    });

    it('CENÁRIO 23: Checklist não gera decisão jurídica automática', () => {
      const readiness = evaluateExtinctionReadiness({
        tipoExtincao: 'EXTINCAO_CONSENSUAL',
        motivacao: {
          descricaoMotivo: 'Acordo amigável para encerramento sem ônus'
        }
      });
      // Permite prosseguir assistivamente sem substituir a deliberação formal da CONJUR/Ordenador
      expect(readiness.podeProsseguirComJustificativa).toBe(true);
      expect(readiness.status).toBe('INFORMACOES_INSUFICIENTES'); // Falta processo SEI vinculado
    });

    it('CENÁRIO 24: Processo SEI vinculado vs ausente', () => {
      const domainSemSei = buildContractExtinctionDomain({
        contract: { ...mockContractExpirado, processo: undefined },
        tipoExtincao: 'EXTINCAO_ORDINARIA'
      });
      expect(domainSemSei.processoSeiNumero).toBeUndefined();

      const domainComSei = buildContractExtinctionDomain({
        contract: mockContractExpirado,
        tipoExtincao: 'EXTINCAO_ORDINARIA',
        processoSeiNumero: '08001.999999/2026-00'
      });
      expect(domainComSei.processoSeiNumero).toBe('08001.999999/2026-00');
    });
  });
});
