/**
 * Serviço do Radar Preditivo de Reajuste / Repactuação na Central de Atenção (SaldoARP — Fase 7.5-C3)
 *
 * Princípios Fundamentais:
 * 1. Radar operacional preventivo: avisa a proximidade do marco anual para análise administrativa;
 * 2. Sem conclusão jurídica automática: não declara direito ao reajuste nem obrigação de conceder;
 * 3. Chave lógica determinística e deduplicada: ALERT::ANIVERSARIO_REAJUSTE::{contractKey}::{ciclo};
 * 4. Janela temporal: 60 dias antes do marco de 1 ano (Arts. 25, §7º e 135 da Lei nº 14.133/2021).
 */

import type {
  ReajusteRadarAlert,
  ReajusteRadarPriorityLevel,
  ReajusteRadarOrigemDataBase
} from '../types/contractReajusteRadar';
import type { ContractEvent } from '../types/contractEvents';
import type { ContractDashboardRecord, StatusVigenciaContrato } from '../types';
import {
  parseDateBRT,
  formatDateISO,
  formatDateBR,
  differenceInDays
} from './temporalEngineService';
import { getEventCanonicalDate } from './contractValueEvolutionService';

/**
 * 1. Gera chave determinística e idempotente para o alerta de radar de reajuste.
 */
export function generateReajusteRadarAlertId(contractKey: string, ciclo: number): string {
  const sanitize = (s: string) => s.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-:]/g, '').toUpperCase();
  return `ALERT::ANIVERSARIO_REAJUSTE::${sanitize(contractKey)}::ANO_${ciclo}`;
}

/**
 * 2. Adiciona N anos a uma data mantendo o mesmo dia/mês (tratando anos bissextos).
 */
export function addYears(date: Date, years: number): Date {
  const res = new Date(date);
  res.setFullYear(res.getFullYear() + years);
  res.setHours(0, 0, 0, 0);
  return res;
}

/**
 * 3. Avalia se o contrato está se aproximando do marco de 1 ano de reajuste/repactuação
 * e gera o alerta preditivo caso esteja dentro da janela de 60 dias.
 */
export function evaluateContractReajusteRadar(params: {
  contract: Partial<ContractDashboardRecord> & {
    id?: string;
    contractKey?: string;
    uasg?: string;
    numero?: string;
    ano?: number | string;
    dataBaseProposta?: string;
    dataAssinatura?: string;
    dataVigenciaInicio?: string;
    statusVigencia?: StatusVigenciaContrato | string;
  };
  events?: readonly ContractEvent[];
  currentDate?: Date;
}): ReajusteRadarAlert | null {
  const { contract, events = [], currentDate } = params;

  // 1. Contratos extintos, encerrados, expirados ou cancelados não geram radar preditivo futuro
  const statusVig = (contract.statusVigencia || '').toUpperCase();
  if (
    statusVig === 'ENCERRADO' ||
    statusVig === 'RESCINDIDO' ||
    statusVig === 'CANCELADO' ||
    statusVig === 'EXTINTO' ||
    statusVig === 'EXPIRADO'
  ) {
    return null;
  }

  const hasExtinctionEvent = events.some(
    (e) => e.tipoEvento === 'ENCERRAMENTO' || e.tipoEvento === 'RESCISAO'
  );
  if (hasExtinctionEvent) {
    return null;
  }

  const contractKey =
    contract.contractKey ||
    contract.id ||
    `${contract.uasg || ''}-${contract.numero || ''}-${contract.ano || ''}`;

  const anoContrato = typeof contract.ano === 'number'
    ? contract.ano
    : (parseInt(String(contract.ano || '0'), 10) || undefined);

  // 2. Determinação da Data-Base conforme hierarquia da Fase 7.5-B:
  // Prioridade 1: Último evento formal de REAJUSTE ou REPACTUACAO registrado
  // Prioridade 2: Data-base da proposta / orçamento estimativo informada
  // Prioridade 3: Data de assinatura / início de vigência do contrato
  let dataBaseStr: string | undefined;
  let origemDataBase: ReajusteRadarOrigemDataBase = 'ASSINATURA';
  let cicloRef = 1;

  // Localiza o evento de reajuste/repactuação mais recente
  const reajusteEvents = events
    .filter((e) => e.tipoEvento === 'REAJUSTE' || e.tipoEvento === 'REPACTUACAO')
    .map((e) => ({ event: e, dateStr: getEventCanonicalDate(e).dateStr }))
    .filter((e) => Boolean(e.dateStr))
    .sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  if (reajusteEvents.length > 0) {
    dataBaseStr = reajusteEvents[0].dateStr;
    origemDataBase = 'ULTIMO_REAJUSTE';
    cicloRef = reajusteEvents.length + 1;
  } else if (contract.dataBaseProposta) {
    dataBaseStr = contract.dataBaseProposta;
    origemDataBase = 'PROPOSTA';
  } else if (contract.dataAssinatura) {
    dataBaseStr = contract.dataAssinatura;
    origemDataBase = 'ASSINATURA';
  } else if (contract.dataVigenciaInicio) {
    dataBaseStr = contract.dataVigenciaInicio;
    origemDataBase = 'ASSINATURA';
  }

  if (!dataBaseStr) {
    return null; // Sem data-base válida disponível: não gera alerta
  }

  const baseDate = parseDateBRT(dataBaseStr);
  if (!baseDate) {
    return null;
  }

  // 3. Cálculo do próximo marco de aniversário anual (12 meses)
  let nextMilestoneDate: Date = addYears(baseDate, 1);
  let ciclo = cicloRef;

  if (origemDataBase === 'ULTIMO_REAJUSTE') {
    nextMilestoneDate = addYears(baseDate, 1);
  } else {
    // Para PROPOSTA ou ASSINATURA, itera ciclos de 12 meses até achar o ciclo relevante atual
    let foundMilestone = false;
    let testCycle = 1;
    let targetDate = addYears(baseDate, testCycle);

    while (testCycle <= 10) { // Contratos contínuos sob Lei 14.133 até 10 anos
      const diff = differenceInDays(targetDate, currentDate);
      // Se estiver na janela de alerta ou tiver passado há menos de 30 dias, este é o marco ativo
      if (diff >= -30) {
        nextMilestoneDate = targetDate;
        ciclo = testCycle;
        foundMilestone = true;
        break;
      }
      testCycle++;
      targetDate = addYears(baseDate, testCycle);
    }

    if (!foundMilestone) {
      return null;
    }
  }

  // 4. Verificação da Janela Operacional do Radar (até 60 dias antes do marco)
  const diasRestantes = differenceInDays(nextMilestoneDate, currentDate);

  // Janela ativa: de 60 dias antes até 30 dias após o marco
  if (diasRestantes > 60 || diasRestantes < -30) {
    return null;
  }

  // 5. Classificação do Nível de Severidade
  let nivel: ReajusteRadarPriorityLevel;
  if (diasRestantes > 30) {
    nivel = 'PROXIMA';
  } else if (diasRestantes >= 1) {
    nivel = 'URGENTE';
  } else if (diasRestantes === 0) {
    nivel = 'HOJE';
  } else {
    nivel = 'VENCIDA';
  }

  const dataAniversarioISO = formatDateISO(nextMilestoneDate);
  const dataAniversarioBR = formatDateBR(dataAniversarioISO);
  const id = generateReajusteRadarAlertId(contractKey, ciclo);

  // 6. Mensagem Operacional Preventiva (Sem Julgamento Jurídico de Mérito)
  const tempoStr =
    diasRestantes > 0
      ? `faltam ${diasRestantes} dia(s)`
      : diasRestantes === 0
      ? 'atingido hoje'
      : `atingido há ${Math.abs(diasRestantes)} dia(s)`;

  const titulo = `Marco Anual de Reajuste / Repactuação (Ano ${ciclo})`;
  const descricao = `O contrato completa ${ciclo} ano(s) da data-base (${formatDateBR(dataBaseStr)}) em ${dataAniversarioBR} (${tempoStr}).`;
  const recomendacao = `Recomenda-se verificar a publicação de índices oficiais ou homologação de nova CCT/DEMO para instrução tempestiva da análise de equilíbrio econômico-financeiro.`;

  return {
    id,
    contractKey,
    uasg: contract.uasg,
    numeroContrato: contract.numero,
    anoContrato,
    ciclo,
    dataBase: dataBaseStr,
    origemDataBase,
    dataAniversario: dataAniversarioISO,
    diasRestantes,
    nivel,
    titulo,
    descricao,
    recomendacao
  };
}
