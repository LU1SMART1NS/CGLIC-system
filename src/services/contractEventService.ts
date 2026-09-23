/**
 * Serviço Puro de Gestão de Eventos e Ciclos Contratuais (SaldoARP — Fase 4.1)
 *
 * Funções Puras e Determinísticas:
 * 1. Identidade Canônica de Eventos (Idempotência e linhagem);
 * 2. Classificação Conceitual de Eventos (Fato Formal, Natureza, Impacto);
 * 3. Avaliação Assistida de Limites Legais (Art. 125 e 126 da Lei 14.133/2021);
 * 4. Explicabilidade e Transição de Vigência e Ciclos Temporais;
 * 5. Derivação de Estados do Ciclo de Vida do Contrato;
 * 6. Mapeamento de Eventos a partir de Dados Oficiais de APIs Governamentais.
 */

import type {
  ContractEvent,
  ContractEventType,
  ContractEventNature,
  ContractEventImpact,
  ContractLifecycleState,
  ContractVigenciaTransition,
  AditamentoLimitEvaluation,
  ConformidadeLimiteStatus
} from '../types/contractEvents';
import type { ContractDashboardRecord } from '../types';
import {
  calculateDeadline,
  REGRAS_OPERACIONAIS_PADRAO
} from './temporalEngineService';

import { generateIdempotentItemId } from './centralPrazosService';

/**
 * 1. Gera chave canônica e determinística de identidade de um evento contratual.
 * Formato: CONTRATO::{contractKey}::{tipoEvento}::{identificadorOficial}::{cicloRef}
 */
export function generateIdempotentEventId(params: {
  contractKey: string;
  tipoEvento: ContractEventType;
  identificadorOficial: string;
  cicloRef?: string;
}): string {
  const sanitize = (s: string) => s.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').toUpperCase();
  const cKey = sanitize(params.contractKey);
  const tipo = sanitize(params.tipoEvento);
  const idOficial = sanitize(params.identificadorOficial || 'REGISTRO');
  const ciclo = sanitize(params.cicloRef || 'CICLO_INICIAL');

  return `CONTRATO::${cKey}::${tipo}::${idOficial}::${ciclo}`;
}

/**
 * 2. Classifica a natureza, instrumento formal e impacto de um evento contratual com base em dados formais.
 */
export function classifyContractEvent(params: {
  tipoOuDescricao?: string;
  variacaoValor?: number;
  novaVigencia?: string;
  vigenciaAnterior?: string;
  isApostilamento?: boolean;
  isRescisao?: boolean;
  isEncerramento?: boolean;
}): {
  tipoEvento: ContractEventType;
  naturezaInstrumento: ContractEventNature;
  impacto: ContractEventImpact;
} {
  const desc = (params.tipoOuDescricao || '').toLowerCase();
  const isApost = params.isApostilamento || desc.includes('apostilamento') || desc.includes('apostila');
  const isResc = params.isRescisao || desc.includes('rescis') || desc.includes('distrato');
  const isEnc = params.isEncerramento || desc.includes('encerramento') || desc.includes('termo definitivo') || desc.includes('recebimento definitivo');

  // A) Extinções e Encerramentos
  if (isResc) {
    return {
      tipoEvento: 'RESCISAO',
      naturezaInstrumento: 'NOTIFICACAO_RESCISAO',
      impacto: 'EXTINGUE_CONTRATO'
    };
  }

  if (isEnc) {
    return {
      tipoEvento: 'ENCERRAMENTO',
      naturezaInstrumento: 'TERMO_RECEBIMENTO_DEFINITIVO',
      impacto: 'EXTINGUE_CONTRATO'
    };
  }

  // B) Apostilamento
  if (isApost) {
    const isReajusteApost = desc.includes('reajuste') || desc.includes('índice') || desc.includes('ipca') || desc.includes('inpc');
    return {
      tipoEvento: isReajusteApost ? 'REAJUSTE' : 'APOSTILAMENTO',
      naturezaInstrumento: 'TERMO_APOSTILAMENTO',
      impacto: (params.variacaoValor && params.variacaoValor !== 0) ? 'ALTERA_VALOR' : 'ATUALIZA_DADOS'
    };
  }

  // C) Repactuação de Mão de Obra
  if (desc.includes('repactua') || desc.includes('convenção coletiva') || desc.includes('cct') || desc.includes('dissídio')) {
    return {
      tipoEvento: 'REPACTUACAO',
      naturezaInstrumento: 'TERMO_ADITIVO',
      impacto: 'ALTERA_VALOR'
    };
  }

  // D) Prorrogação de Vigência
  const hasVigenciaChange = Boolean(params.novaVigencia && params.vigenciaAnterior && params.novaVigencia !== params.vigenciaAnterior);
  if (desc.includes('prorroga') || desc.includes('renova') || desc.includes('vigência') || hasVigenciaChange) {
    const hasValorChange = Boolean(params.variacaoValor && params.variacaoValor !== 0);
    return {
      tipoEvento: 'PRORROGACAO',
      naturezaInstrumento: 'TERMO_ADITIVO',
      impacto: hasValorChange ? 'ALTERA_VALOR' : 'ALTERA_VIGENCIA'
    };
  }

  // E) Acréscimo ou Supressão de Valor / Quantitativo
  if (params.variacaoValor !== undefined && params.variacaoValor !== 0) {
    if (params.variacaoValor > 0 || desc.includes('acréscimo') || desc.includes('aditamento de valor')) {
      return {
        tipoEvento: 'ACRESCIMO',
        naturezaInstrumento: 'TERMO_ADITIVO',
        impacto: 'ALTERA_VALOR'
      };
    } else {
      return {
        tipoEvento: 'SUPRESSAO',
        naturezaInstrumento: 'TERMO_ADITIVO',
        impacto: 'ALTERA_VALOR'
      };
    }
  }

  // F) Default / Aditivo Geral
  return {
    tipoEvento: 'APOSTILAMENTO',
    naturezaInstrumento: 'TERMO_APOSTILAMENTO',
    impacto: 'SEM_IMPACTO_FINANCEIRO_TEMPORAL'
  };
}

/**
 * 3. Avaliação Assistida de Limites Legais de Aditamento (Art. 125 e 126 da Lei 14.133/2021)
 *
 * Regras estritas:
 * - Acréscimos e Supressões são apurados ISOLADAMENTE (sem compensação de sinais);
 * - Teto de Acréscimo: até 25% para contratos ordinários; até 50% para reforma de edifício/equipamento;
 * - Teto de Supressão: até 25% unilateral; supressões superiores a 25% exigem acordo bilateral (art. 126);
 * - O resultado orienta o gestor via badges e NUNCA bloqueia a operação (Assistência, não decisão jurídica).
 */
export function calculateAditamentoLimits(params: {
  valorInicialAtualizado: number;
  acrescimos: number | number[];
  supressoes: number | number[];
  isReforma?: boolean;
}): AditamentoLimitEvaluation {
  const baseVal = Math.max(0, params.valorInicialAtualizado || 0);

  const arrAcresc = Array.isArray(params.acrescimos) ? params.acrescimos : [params.acrescimos || 0];
  const arrSupress = Array.isArray(params.supressoes) ? params.supressoes : [params.supressoes || 0];

  const totalAcrescimos = arrAcresc.reduce((acc, v) => acc + Math.max(0, v || 0), 0);
  const totalSupressoes = arrSupress.reduce((acc, v) => acc + Math.abs(v || 0), 0);

  const percentualAcrescimo = baseVal > 0 ? (totalAcrescimos / baseVal) * 100 : 0;
  const percentualSupressao = baseVal > 0 ? (totalSupressoes / baseVal) * 100 : 0;

  const isReforma = Boolean(params.isReforma);
  const tetoAcrescimo = isReforma ? 50 : 25;
  const tetoSupressao = 25;

  // Status de Acréscimo
  let statusAcrescimo: ConformidadeLimiteStatus = 'CONFORME';
  let badgeAcrescColor: 'verde' | 'amarelo' | 'vermelho' = 'verde';
  let badgeAcrescLabel = `Acréscimo de ${percentualAcrescimo.toFixed(2)}% (Conforme limite de 25%)`;
  let orientacaoAcresc = 'Alteração quantitativa/qualitativa dentro do limite ordinário do art. 125 da Lei 14.133/2021.';

  if (percentualAcrescimo > tetoAcrescimo) {
    statusAcrescimo = 'ALERTA_EXCEDE_ORDINARIO';
    badgeAcrescColor = 'vermelho';
    badgeAcrescLabel = `Acréscimo de ${percentualAcrescimo.toFixed(2)}% (Excede teto de ${tetoAcrescimo}%)`;
    orientacaoAcresc = `Alerta de Conformidade: O percentual de acréscimo acumulado (${percentualAcrescimo.toFixed(2)}%) ultrapassa o limite ordinário de ${tetoAcrescimo}%. Exige justificativa técnica e parecer jurídico circunstanciado nos autos.`;
  } else if (percentualAcrescimo > 25 && isReforma) {
    statusAcrescimo = 'ATENCAO_REFORMA';
    badgeAcrescColor = 'amarelo';
    badgeAcrescLabel = `Acréscimo de ${percentualAcrescimo.toFixed(2)}% (Hipótese de Reforma até 50%)`;
    orientacaoAcresc = 'Atenção: Percentual admissível exclusivamente para obras/reformas de edifício ou equipamentos (art. 125 da Lei 14.133/2021).';
  }

  // Status de Supressão
  let statusSupressao: 'CONFORME' | 'ALERTA_EXCEDE_ORDINARIO_EXIGE_CONSENSO' = 'CONFORME';
  let badgeSupressColor: 'verde' | 'amarelo' | 'vermelho' = 'verde';
  let badgeSupressLabel = `Supressão de ${percentualSupressao.toFixed(2)}% (Conforme limite de 25%)`;
  let orientacaoSupress = 'Supressão unilateral ou bilateral dentro do teto legal ordinário do art. 125.';

  if (percentualSupressao > tetoSupressao) {
    statusSupressao = 'ALERTA_EXCEDE_ORDINARIO_EXIGE_CONSENSO';
    badgeSupressColor = 'amarelo';
    badgeSupressLabel = `Supressão de ${percentualSupressao.toFixed(2)}% (Acordo Bilateral Necessário)`;
    orientacaoSupress = 'Atenção: Supressões superiores a 25% não podem ser impostas unilateralmente pela Administração e exigem celebração de acordo bilateral consensual com a Contratada (art. 126 da Lei 14.133/2021).';
  }

  return {
    valorInicialAtualizado: baseVal,
    totalAcrescimos,
    percentualAcrescimo,
    totalSupressoes,
    percentualSupressao,
    isReforma,
    tetoAcrescimoPermitidoPercentual: tetoAcrescimo,
    tetoSupressaoPermitidoPercentual: tetoSupressao,
    statusAcrescimo,
    statusSupressao,
    badgeAcrescimo: {
      color: badgeAcrescColor,
      label: badgeAcrescLabel,
      orientacao: orientacaoAcresc
    },
    badgeSupressao: {
      color: badgeSupressColor,
      label: badgeSupressLabel,
      orientacao: orientacaoSupress
    },
    podeRegistrarComJustificativa: true
  };
}

/**
 * 4. Explicabilidade e Transição de Vigência e Ciclos Temporais.
 * Responde de forma transparente aos 6 quesitos de rastreabilidade institucional.
 */
export function explainVigenciaTransition(params: {
  contract: ContractDashboardRecord;
  event: ContractEvent;
  currentDate?: Date;
}): ContractVigenciaTransition {
  const { contract, event, currentDate } = params;
  const vigenciaAnterior = event.vigenciaAnterior || contract.dataVigenciaFim || 'Não Informado';
  const novaVigencia = event.vigenciaPosterior || contract.dataVigenciaFim || 'Não Informado';
  const contractKey = contract.id;
  const novoCicloRef = `VIG_${novaVigencia.replace(/\D/g, '')}`;

  // Calcula novo gatilho preventivo de 180d
  const deadlineCalc = calculateDeadline({
    dataBase: novaVigencia,
    fonteDataBase: event.fonteOrigem,
    regra: REGRAS_OPERACIONAIS_PADRAO.PRORROGACAO_180D,
    currentDate
  });

  const novoGatilhoId = generateIdempotentItemId({
    tipoEntidade: 'CONTRATO',
    idEntidade: contractKey,
    eventoId: 'PRORROGACAO',
    regraId: 'GATILHO_180D',
    cicloRef: novoCicloRef
  });

  const dataAlvoGatilho = deadlineCalc?.dataAlvo || novaVigencia;
  const diasRestantes = deadlineCalc?.diasRestantes ?? 0;
  const estadoTemporal = deadlineCalc?.statusTemporal || 'FUTURO';
  const nivelAtencao = deadlineCalc?.nivelAtencao || 'NORMAL';

  const explicabilidadeTexto =
    `Vigência contratual alterada de ${vigenciaAnterior} para ${novaVigencia} em razão do evento "${event.descricao}" ` +
    `(Instrumento: ${event.identificadorOficial}, formalizado em ${event.dataPublicacao || event.dataAssinatura || 'data não informada'}). ` +
    `Fonte oficial confirmadora: ${event.fonteOrigem}. ` +
    `Novo ciclo temporal inicializado com gatilho preventivo de prorrogação para ${dataAlvoGatilho} (${diasRestantes} dias restantes).`;

  return {
    contractKey,
    vigenciaAnterior,
    novaVigencia,
    eventoGeradorId: event.id,
    eventoDescricao: event.descricao,
    dataPublicacaoEvento: event.dataPublicacao,
    fonteOficialConfirmadora: event.fonteOrigem,
    novoCicloRef,
    novoGatilhoId,
    novoGatilhoDataAlvo: dataAlvoGatilho,
    diasRestantesNovoCiclo: diasRestantes,
    estadoTemporalNovoCiclo: estadoTemporal,
    nivelAtencaoNovoCiclo: nivelAtencao,
    explicabilidadeTexto
  };
}

/**
 * 5. Deriva o estado de ciclo de vida do contrato com base no estado atual e nos eventos/workflows ativos.
 */
export function deriveContractLifecycleState(params: {
  contract: ContractDashboardRecord;
  activeEvents?: ContractEvent[];
  isRescindido?: boolean;
  hasActiveProrrogationWorkflow?: boolean;
  hasActiveReajusteWorkflow?: boolean;
  hasActiveRepactuacaoWorkflow?: boolean;
  hasActiveCloseoutWorkflow?: boolean;
}): ContractLifecycleState {
  const { contract, isRescindido, hasActiveProrrogationWorkflow, hasActiveReajusteWorkflow, hasActiveRepactuacaoWorkflow, hasActiveCloseoutWorkflow } = params;

  if (isRescindido) return 'RESCINDIDO';

  if (hasActiveCloseoutWorkflow) return 'EM_ENCERRAMENTO';
  if (hasActiveProrrogationWorkflow) return 'EM_PRORROGACAO';
  if (hasActiveRepactuacaoWorkflow) return 'EM_REPACTUACAO';
  if (hasActiveReajusteWorkflow) return 'EM_REAJUSTE';

  if (contract.statusVigencia === 'Expirado') {
    return 'ENCERRADO';
  }

  return 'VIGENTE';
}

/**
 * 6. Constrói a lista canônica de eventos contratuais a partir do registro do contrato e dos termos aditivos oficiais.
 */
export function buildContractEventsFromOfficialData(
  contract: ContractDashboardRecord,
  officialAditivos: any[] = []
): ContractEvent[] {
  const events: ContractEvent[] = [];
  const contractKey = contract.id;
  const anoContrato = typeof contract.ano === 'number' ? contract.ano : (parseInt(String(contract.ano), 10) || 2026);

  // A) Evento de Celebração Inicial
  const celebracaoId = generateIdempotentEventId({
    contractKey,
    tipoEvento: 'CELEBRACAO',
    identificadorOficial: `CONTRATO_INICIAL_${contract.numero}`,
    cicloRef: `INI_${(contract.dataAssinatura || contract.dataVigenciaInicio || '20260101').replace(/\D/g, '')}`
  });

  events.push({
    id: celebracaoId,
    contractKey,
    uasg: contract.uasg,
    numeroContrato: contract.numero,
    anoContrato,
    tipoEvento: 'CELEBRACAO',
    naturezaInstrumento: 'CONTRATO_INICIAL',
    identificadorOficial: `Contrato ${contract.numeroFormatado}`,
    descricao: `Celebração inicial do Contrato ${contract.numeroFormatado}`,
    dataAssinatura: contract.dataAssinatura,
    dataVigenciaEfeito: contract.dataVigenciaInicio,
    impacto: 'ALTERA_VIGENCIA',
    vigenciaPosterior: contract.dataVigenciaFim,
    valorPosterior: contract.valorInicial || contract.valorGlobal,
    fonteOrigem: (contract.fonteDados as any) || 'Contratos.gov.br',
    numeroControlePncp: contract.numeroControlePncp,
    linkPncp: contract.linkPncp,
    processoSeiNumero: contract.processo,
    sourceUpdatedAt: contract.sourceUpdatedAt,
    capturedAt: contract.lastSyncedAt || new Date().toISOString()
  });

  // B) Eventos de Termos Aditivos / Apostilamentos Oficiais (se existirem nos dados oficiais)
  if (Array.isArray(officialAditivos) && officialAditivos.length > 0) {
    for (const [idx, adit] of officialAditivos.entries()) {
      const seq = adit.sequencial || adit.numero || idx + 1;
      const tipoRaw = adit.tipo || adit.tipoTermoContrato || adit.descricao || 'Termo Aditivo';
      const classification = classifyContractEvent({
        tipoOuDescricao: tipoRaw,
        variacaoValor: adit.valorGlobal || adit.variacaoValor,
        novaVigencia: adit.dataVigenciaFim || adit.vigencia_fim,
        vigenciaAnterior: contract.dataVigenciaInicio
      });

      const aditId = generateIdempotentEventId({
        contractKey,
        tipoEvento: classification.tipoEvento,
        identificadorOficial: `TA_${seq}`,
        cicloRef: `SEQ_${seq}`
      });

      events.push({
        id: aditId,
        contractKey,
        uasg: contract.uasg,
        numeroContrato: contract.numero,
        anoContrato,
        tipoEvento: classification.tipoEvento,
        naturezaInstrumento: classification.naturezaInstrumento,
        numeroSequencial: seq,
        identificadorOficial: `${seq}º Termo Aditivo`,
        descricao: adit.objeto || adit.descricao || `${seq}º Termo Aditivo ao Contrato ${contract.numeroFormatado}`,
        dataAssinatura: adit.dataAssinatura,
        dataPublicacao: adit.dataPublicacaoPncp || adit.dataPublicacao,
        dataVigenciaEfeito: adit.dataVigenciaInicio,
        impacto: classification.impacto,
        vigenciaPosterior: adit.dataVigenciaFim || adit.vigencia_fim,
        valorPosterior: adit.valorGlobal,
        fonteOrigem: adit.fonte || 'PNCP',
        numeroControlePncp: adit.numeroControlePncp,
        linkPncp: adit.linkPncp,
        capturedAt: new Date().toISOString(),
        rawOfficialData: adit
      });
    }
  }

  return events;
}
