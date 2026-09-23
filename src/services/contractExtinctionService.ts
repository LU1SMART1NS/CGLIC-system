/**
 * Serviço de Domínio Puro de Extinção, Encerramento e Rescisão Contratual (SaldoARP — Fase 4.4A)
 *
 * Funções Puras e Determinísticas:
 * 1. Geração de Identidade Canônica de Extinção (`generateExtinctionDomainId`);
 * 2. Classificação de Modalidade de Extinção (`classifyContractExtinction`);
 * 3. Avaliação Assistida de Prontidão para Encerramento Regular (`evaluateContractClosureReadiness`);
 * 4. Avaliação Assistida de Consistência para Extinção Antecipada/Rescisão (`evaluateExtinctionReadiness`);
 * 5. Derivação Determinística da Situação Operacional Assistiva (`deriveContractExtinctionState`);
 * 6. Construtor da Entidade Canônica de Extinção (`buildContractExtinctionDomain`);
 * 7. Mapeamento para Evento Contratual Formal (`buildExtinctionContractEvent`).
 *
 * Princípios Fundamentais:
 * - FIM DA VIGÊNCIA ≠ ENCERRAMENTO FORMAL ≠ EXTINÇÃO CONTRATUAL
 * - DECISÃO INTERNA ≠ FATO OFICIAL SOBERANO (PNCP / Contratos.gov.br)
 * - NENHUM EFEITO COLATERAL, NENHUMA CHAMADA EXTERNA, NENHUMA MUTAÇÃO DE BANCO.
 */

import type {
  ContractExtinctionType,
  ContractExtinctionInstrument,
  ContractClosureOperationalState,
  ContractClosureChecklist,
  ExtinctionMotivation,
  ContractClosureEvaluationResult,
  ContractExtinctionDomain
} from '../types/contractExtinctions';
import type {
  ContractDashboardRecord,
  ContractEvent,
  ContractEventNature,
  ContractEventType
} from '../types';
import type { AmendmentOfficialityClassification } from '../types/contractAmendments';
import { generateIdempotentEventId } from './contractEventService';

/**
 * 1. Gera chave lógica determinística e canônica para a entidade de Extinção / Encerramento.
 * Formato: EXTINCAO::{contractKey}::{tipoExtincao}::{cycleRef}{::identificador}
 */
export function generateExtinctionDomainId(
  contractKey: string,
  tipoExtincao: ContractExtinctionType,
  cycleRef: string,
  identificador?: string
): string {
  const sanitize = (s: string) => s.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').toUpperCase();
  const idSuffix = identificador ? `::${sanitize(identificador)}` : '';
  return `EXTINCAO::${sanitize(contractKey)}::${sanitize(tipoExtincao)}::${sanitize(cycleRef)}${idSuffix}`;
}

/**
 * 2. Classifica a modalidade jurídica de extinção e sugere o instrumento formal cabível.
 * Não produz efeitos colaterais nem substitui juízo discricionário da Administração.
 */
export function classifyContractExtinction(params: {
  tipoOuDescricao?: string;
  isRescisaoUnilateral?: boolean;
  isConsensual?: boolean;
  isJudicialArbitral?: boolean;
  isOrdinaria?: boolean;
}): {
  tipoExtincao: ContractExtinctionType;
  sugestaoInstrumento: ContractExtinctionInstrument;
  explicabilidade: string;
} {
  const desc = (params.tipoOuDescricao || '').toLowerCase();

  // A) Extinção Judicial ou Arbitral
  if (params.isJudicialArbitral || desc.includes('judicial') || desc.includes('arbitral') || desc.includes('sentença') || desc.includes('laudo')) {
    return {
      tipoExtincao: 'EXTINCAO_JUDICIAL_ARBITRAL',
      sugestaoInstrumento: desc.includes('arbitral') ? 'DECISAO_ARBITRAL' : 'DECISAO_JUDICIAL',
      explicabilidade: 'Extinção decorrente de decisão judicial transitada em julgado ou sentença arbitral (art. 138, III da Lei 14.133/21).'
    };
  }

  // B) Extinção Consensual / Distrato Bilateral
  if (params.isConsensual || desc.includes('consensual') || desc.includes('distrato') || desc.includes('amigável') || desc.includes('bilateral')) {
    return {
      tipoExtincao: 'EXTINCAO_CONSENSUAL',
      sugestaoInstrumento: 'INSTRUMENTO_CONSENSUAL',
      explicabilidade: 'Extinção consensual por acordo formal entre as partes, com justificativa de interesse público (art. 138, II da Lei 14.133/21).'
    };
  }

  // C) Extinção Unilateral pela Administração (Rescisão Motivada / PAD)
  if (
    params.isRescisaoUnilateral ||
    desc.includes('unilateral') ||
    desc.includes('rescisão') ||
    desc.includes('inadimplemento') ||
    desc.includes('descumprimento') ||
    desc.includes('sancionador') ||
    desc.includes('falta grave')
  ) {
    return {
      tipoExtincao: 'EXTINCAO_UNILATERAL',
      sugestaoInstrumento: 'ATO_UNILATERAL',
      explicabilidade: 'Extinção unilateral por ato motivado da Administração, assegurados o contraditório e ampla defesa (art. 137 c/c art. 138, I da Lei 14.133/21).'
    };
  }

  // D) Extinção Ordinária (Encerramento Regular)
  return {
    tipoExtincao: 'EXTINCAO_ORDINARIA',
    sugestaoInstrumento: 'TERMO_RECEBIMENTO_DEFINITIVO',
    explicabilidade: 'Extinção ordinária pelo integral cumprimento do objeto, exaurimento ou termo de recebimento definitivo (art. 140 da Lei 14.133/21).'
  };
}

/**
 * 3. Avaliação Assistida de Prontidão para Encerramento Regular (Checklist Operacional).
 * Verifica pendências de TRD, financeiras, garantias e regularidade sem bloqueio automático.
 */
export function evaluateContractClosureReadiness(
  checklist: ContractClosureChecklist = {},
  vigenciaExpirada: boolean = false
): ContractClosureEvaluationResult {
  const pendencias: string[] = [];
  const orientacoes: string[] = [];

  // 1. Recebimento do Objeto
  if (checklist.objetoRecebidoDefinitivo === false || (!checklist.objetoRecebidoDefinitivo && !checklist.termoRecebimentoDefinitivoSei)) {
    pendencias.push('Ausência de Termo de Recebimento Definitivo (TRD) formalizado.');
    orientacoes.push('A comissão de fiscalização deve lavrar o TRD no SEI atestando a conformidade dos bens/serviços (art. 140, II da Lei 14.133/21).');
  }

  // 2. Pendências de Execução
  if (checklist.pendenciasExecucaoIdentificadas) {
    pendencias.push(`Pendências de execução não resolvidas: ${checklist.descricaoPendenciasExecucao || 'Verificar relatório de fiscalização'}.`);
    orientacoes.push('Exigir correção de falhas ou adotar glosa/penalidade antes da liquidação final.');
  }

  // 3. Pagamentos e Liquidação Financeira
  if (checklist.pagamentosPendentes || (checklist.saldoFinanceiroRemanescente && checklist.saldoFinanceiroRemanescente > 0 && !checklist.empenhosRemanescentesParaEstorno)) {
    pendencias.push('Existem pagamentos pendentes de liquidação ou saldo de empenho remanescente sem destinação.');
    orientacoes.push('Concluir a liquidação das notas fiscais entregues e providenciar o estorno/anulação de saldos não utilizados.');
  }

  // 4. Liberação de Garantia
  if (checklist.garantiaExigida && !checklist.garantiaLiberada) {
    pendencias.push('Garantia de execução contratual exigida ainda não foi formalmente liberada/restituída.');
    orientacoes.push('Atestada a quitação de todos os encargos e obrigações, expedir termo de restituição/liberação da garantia.');
  }

  // 5. Pendências Fiscais / Trabalhistas
  if (checklist.pendenciasTrabalhistasFiscais) {
    pendencias.push('Identificadas pendências na comprovação de encargos trabalhistas, previdenciários ou fiscais.');
    orientacoes.push('Reter cautelarmente créditos para cobertura de eventuais débitos trabalhistas/previdenciários (art. 121, § 3º).');
  }

  if (pendencias.length === 0) {
    return {
      status: 'PRONTO_PARA_ENCERRAMENTO',
      pendenciasIdentificadas: [],
      orientacoesAssistivas: ['Contrato apto para encerramento regular, emissão do despacho homologatório final e arquivamento do processo SEI.'],
      podeProsseguirComJustificativa: true
    };
  }

  if (!vigenciaExpirada && pendencias.length > 0) {
    return {
      status: 'REQUER_ANALISE',
      pendenciasIdentificadas: pendencias,
      orientacoesAssistivas: orientacoes,
      podeProsseguirComJustificativa: true
    };
  }

  return {
    status: 'PENDENCIAS_IMPEDITIVAS',
    pendenciasIdentificadas: pendencias,
    orientacoesAssistivas: orientacoes,
    podeProsseguirComJustificativa: true
  };
}

/**
 * 4. Avaliação Assistida de Consistência para Extinção Antecipada / Rescisão.
 * Checa a presença de fundamentação, processo instrutório e respeito ao contraditório.
 */
export function evaluateExtinctionReadiness(params: {
  tipoExtincao: ContractExtinctionType;
  motivacao?: ExtinctionMotivation;
  checklist?: ContractClosureChecklist;
}): ContractClosureEvaluationResult {
  const { tipoExtincao, motivacao, checklist } = params;
  const pendencias: string[] = [];
  const orientacoes: string[] = [];

  if (tipoExtincao === 'EXTINCAO_ORDINARIA') {
    return evaluateContractClosureReadiness(checklist, true);
  }

  // Verificação de Motivação
  if (!motivacao || !motivacao.descricaoMotivo || motivacao.descricaoMotivo.trim().length === 0) {
    pendencias.push('Descrição da motivação do ato de extinção não informada.');
    orientacoes.push('Registrar a fundamentação fática e jurídica circunstanciada para o desfazimento do vínculo.');
  }

  // Verificação de Contraditório para Rescisão Unilateral
  if (tipoExtincao === 'EXTINCAO_UNILATERAL') {
    if (!motivacao?.contraditorioAmplaDefesaAssegurado) {
      pendencias.push('Não há registro formal de garantia prévia do contraditório e da ampla defesa à contratada.');
      orientacoes.push('A rescisão unilateral exige notificação prévia da contratada com concessão de prazo para defesa técnica (art. 137, § 1º).');
    }
    if (!motivacao?.parecerJuridicoNumero) {
      orientacoes.push('Recomenda-se submeter a minuta de termo rescisório à análise jurídica prévia do órgão de assessoramento.');
    }
  }

  // Verificação de Processo SEI
  if (!motivacao?.processoSeiNumero) {
    pendencias.push('Número dos autos do processo administrativo (SEI) não vinculado.');
  }

  if (pendencias.length === 0) {
    return {
      status: 'PRONTO_PARA_ENCERRAMENTO',
      pendenciasIdentificadas: [],
      orientacoesAssistivas: orientacoes.length > 0 ? orientacoes : ['Instrução rescisória consistente para publicação formal e envio ao PNCP.'],
      podeProsseguirComJustificativa: true
    };
  }

  return {
    status: 'INFORMACOES_INSUFICIENTES',
    pendenciasIdentificadas: pendencias,
    orientacoesAssistivas: orientacoes,
    podeProsseguirComJustificativa: true
  };
}

/**
 * 5. Derivação Determinística da Situação Operacional Assistiva.
 * Mapeia o estado assistivo sem produzir efeitos colaterais nem sobrescrever o lifecycle global.
 */
export function deriveContractExtinctionState(params: {
  contractVigente: boolean;
  vigenciaExpirada: boolean;
  tipoExtincao?: ContractExtinctionType;
  checklist?: ContractClosureChecklist;
  motivacao?: ExtinctionMotivation;
  oficialidade?: AmendmentOfficialityClassification;
}): ContractClosureOperationalState {
  const { contractVigente, vigenciaExpirada, tipoExtincao = 'EXTINCAO_ORDINARIA', checklist, oficialidade } = params;

  // 1. Fato Oficial Soberano Confirmado
  if (oficialidade?.isFatoSoberano) {
    return tipoExtincao === 'EXTINCAO_ORDINARIA' ? 'ENCERRADO' : 'EXTINTO';
  }

  // 2. Aguardando Confirmação Externa / Publicado
  if (oficialidade?.dataPublicacaoOficial || oficialidade?.numeroPublicacaoOficial || oficialidade?.nivelOficialidade === 'DECISAO_INTERNA') {
    return 'EXTINCAO_AGUARDANDO_CONFIRMACAO';
  }

  // 3. Extinção Antecipada em Instrução
  if (tipoExtincao !== 'EXTINCAO_ORDINARIA') {
    return 'EM_INSTRUCAO_EXTINCAO';
  }

  // 4. Vigência Expirada com Checklist e Pendências Pós-Vigência
  if (vigenciaExpirada) {
    if (checklist) {
      if (checklist.objetoRecebidoDefinitivo === false && !checklist.termoRecebimentoDefinitivoSei) {
        return 'AGUARDANDO_RECEBIMENTO_DEFINITIVO';
      }
      if (checklist.pagamentosPendentes || (checklist.saldoFinanceiroRemanescente && checklist.saldoFinanceiroRemanescente > 0 && !checklist.empenhosRemanescentesParaEstorno)) {
        return 'AGUARDANDO_QUITACAO';
      }
      if (checklist.garantiaExigida && !checklist.garantiaLiberada) {
        return 'AGUARDANDO_LIBERACAO_GARANTIA';
      }
      if (checklist.pendenciasExecucaoIdentificadas || checklist.pendenciasTrabalhistasFiscais) {
        return 'PENDENCIAS_POS_VIGENCIA';
      }
    }
    return 'FIM_VIGENCIA';
  }

  // 5. Contrato Vigente
  if (contractVigente) {
    return 'VIGENTE';
  }

  return 'EM_ANALISE_ENCERRAMENTO';
}

/**
 * 6. Construtor Puro da Entidade Canônica de Extinção Contratual.
 */
export function buildContractExtinctionDomain(params: {
  contract: ContractDashboardRecord;
  tipoExtincao: ContractExtinctionType;
  instrumentoFormal?: ContractExtinctionInstrument;
  identificadorInstrumento?: string;
  dataEfeitoExtincao?: string;
  checklist?: ContractClosureChecklist;
  motivacao?: ExtinctionMotivation;
  oficialidade?: AmendmentOfficialityClassification;
  processoSeiId?: string;
  processoSeiNumero?: string;
  linkPncp?: string;
  observacoes?: string;
  identificador?: string;
}): ContractExtinctionDomain {
  const {
    contract,
    tipoExtincao,
    instrumentoFormal,
    identificadorInstrumento,
    dataEfeitoExtincao,
    checklist = {},
    motivacao,
    oficialidade = {
      nivelOficialidade: 'PROPOSTA_ADMINISTRATIVA',
      fonte: contract.fonteDados || 'SaldoARP',
      isFatoSoberano: false,
      explicabilidade: 'Instrução do encerramento/extinção em andamento no SaldoARP.'
    },
    processoSeiId,
    processoSeiNumero,
    linkPncp,
    observacoes,
    identificador
  } = params;

  const contractKey = contract.id;
  const anoContrato = typeof contract.ano === 'number' ? contract.ano : (parseInt(String(contract.ano), 10) || 2026);
  const dataVigenciaAtual = contract.dataVigenciaFim || 'Não Informado';
  const cycleRef = `VIG_${dataVigenciaAtual.replace(/\D/g, '') || 'INICIAL'}`;

  const id = generateExtinctionDomainId(contractKey, tipoExtincao, cycleRef, identificador);

  const contractVigente = contract.statusVigencia === 'Vigente' || contract.statusVigencia === 'A Vencer (60d)';
  const vigenciaExpirada = contract.statusVigencia === 'Expirado' || (contract.dataVigenciaFim ? new Date(contract.dataVigenciaFim) < new Date() : false);

  const situacaoOperacional = deriveContractExtinctionState({
    contractVigente,
    vigenciaExpirada,
    tipoExtincao,
    checklist,
    motivacao,
    oficialidade
  });

  const avaliacaoProntidao = tipoExtincao === 'EXTINCAO_ORDINARIA'
    ? evaluateContractClosureReadiness(checklist, vigenciaExpirada)
    : evaluateExtinctionReadiness({ tipoExtincao, motivacao, checklist });

  return {
    id,
    contractKey,
    uasg: contract.uasg,
    numeroContrato: contract.numero,
    anoContrato,
    cycleRef,
    tipoExtincao,
    situacaoOperacional,
    instrumentoFormal,
    identificadorInstrumento,
    dataEfeitoExtincao: dataEfeitoExtincao || contract.dataVigenciaFim,
    checklist,
    motivacao,
    avaliacaoProntidao,
    oficialidade,
    processoSeiId,
    processoSeiNumero: processoSeiNumero || contract.processo,
    linkPncp,
    observacoes
  };
}

/**
 * 7. Mapeia a Entidade Canônica de Extinção para o Evento Formal (`ContractEvent`).
 * NOTA: Só deve ser emitido quando houver confirmação oficial soberana.
 */
export function buildExtinctionContractEvent(domain: ContractExtinctionDomain): ContractEvent {
  const mapTipoEvento = (): ContractEventType => {
    return domain.tipoExtincao === 'EXTINCAO_ORDINARIA' ? 'ENCERRAMENTO' : 'RESCISAO';
  };

  const mapNaturezaInstrumento = (): ContractEventNature => {
    if (domain.instrumentoFormal === 'TERMO_RECEBIMENTO_DEFINITIVO') return 'TERMO_RECEBIMENTO_DEFINITIVO';
    if (domain.instrumentoFormal === 'ATO_UNILATERAL') return 'NOTIFICACAO_RESCISAO';
    return 'REGISTRO_ADMINISTRATIVO';
  };

  const eventId = generateIdempotentEventId({
    contractKey: domain.contractKey,
    tipoEvento: mapTipoEvento(),
    identificadorOficial: domain.identificadorInstrumento || (domain.tipoExtincao === 'EXTINCAO_ORDINARIA' ? 'TRD' : 'RESCISAO'),
    cicloRef: domain.cycleRef
  });

  return {
    id: eventId,
    contractKey: domain.contractKey,
    uasg: domain.uasg,
    numeroContrato: domain.numeroContrato,
    anoContrato: domain.anoContrato,
    tipoEvento: mapTipoEvento(),
    naturezaInstrumento: mapNaturezaInstrumento(),
    identificadorOficial: domain.identificadorInstrumento || 'Termo de Extinção',
    descricao: domain.motivacao?.descricaoMotivo || (domain.tipoExtincao === 'EXTINCAO_ORDINARIA' ? 'Encerramento regular do contrato' : 'Rescisão contratual'),
    impacto: 'EXTINGUE_CONTRATO',
    vigenciaAnterior: domain.dataEfeitoExtincao,
    vigenciaPosterior: domain.dataEfeitoExtincao,
    fonteOrigem: (domain.oficialidade.fonte as any) || 'SaldoARP',
    processoSeiNumero: domain.processoSeiNumero,
    linkPncp: domain.linkPncp,
    capturedAt: new Date().toISOString()
  };
}
