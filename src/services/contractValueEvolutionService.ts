/**
 * Serviço do Read Model de Evolução do Valor Contratual (SaldoARP — Fase 7.5-C1)
 *
 * Princípios Fundamentais:
 * 1. Projeção determinística em memória e 100% pura: ValorVigente = ValorOriginal + Σ DeltaValor;
 * 2. Precisão monetária rigorosa em centavos (2 casas decimais);
 * 3. Ordenação cronológica determinística (data -> sequencial -> id);
 * 4. Imutabilidade absoluta: não altera contratos, eventos, empenhos nem saldos da Ata.
 */

import type { ContractEvent } from '../types/contractEvents';
import type { OfficialityLevel } from '../types/contractAmendments';
import type {
  ContractValueEvolutionReadModel,
  ContractValueEvolutionEventItem
} from '../types/contractValueEvolution';
import type { ContractDashboardRecord } from '../types';
import { formatDateBR } from './temporalEngineService';

/**
 * 1. Arredonda valor monetário garantindo precisão estrita de centavos (2 casas decimais)
 * e mitigando inconsistências de ponto flutuante IEEE 754.
 */
export function roundCurrency(val: number): number {
  if (typeof val !== 'number' || isNaN(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * 2. Extrai a data canônica para ordenação e exibição de um evento contratual.
 */
export function getEventCanonicalDate(event: ContractEvent): { dateStr: string; displayDate: string } {
  const dateStr =
    event.dataVigenciaEfeito ||
    event.dataPublicacao ||
    event.dataAssinatura ||
    (event.capturedAt ? event.capturedAt.split('T')[0] : '');

  return {
    dateStr,
    displayDate: dateStr ? formatDateBR(dateStr) : 'Data não informada'
  };
}

/**
 * 3. Ordena os eventos cronologicamente de forma ASCENDENTE (do mais antigo ao mais recente)
 * para permitir o cálculo aditivo progressivo da evolução de valor.
 * Desempate determinístico: data -> sequencial do termo -> id único.
 */
export function sortEventsForEvolution(events: readonly ContractEvent[]): ContractEvent[] {
  return [...events].sort((a, b) => {
    const dateA = getEventCanonicalDate(a).dateStr;
    const dateB = getEventCanonicalDate(b).dateStr;

    // 1. Data canônica ASC
    if (dateA !== dateB) {
      if (!dateA) return -1;
      if (!dateB) return 1;
      return dateA.localeCompare(dateB);
    }

    // 2. Desempate por tipo de evento (CELEBRACAO vem sempre antes de aditivos na mesma data)
    if (a.tipoEvento === 'CELEBRACAO' && b.tipoEvento !== 'CELEBRACAO') return -1;
    if (b.tipoEvento === 'CELEBRACAO' && a.tipoEvento !== 'CELEBRACAO') return 1;

    // 3. Desempate por número sequencial ASC (ex: 1º Termo Aditivo antes do 2º)
    const seqA = typeof a.numeroSequencial === 'number' ? a.numeroSequencial : parseInt(String(a.numeroSequencial || '0'), 10) || 0;
    const seqB = typeof b.numeroSequencial === 'number' ? b.numeroSequencial : parseInt(String(b.numeroSequencial || '0'), 10) || 0;
    if (seqA !== seqB) {
      return seqA - seqB;
    }

    // 4. Desempate determinístico por ID do evento
    return a.id.localeCompare(b.id);
  });
}

/**
 * 4. Classifica o grau de oficialidade do evento sem inferências arbitrárias.
 */
export function classifyEventOfficiality(event: ContractEvent): OfficialityLevel {
  const desc = (event.descricao || '').toUpperCase();
  if (desc.includes('PROPOSTA') || desc.includes('ESTUDO PRELIMINAR') || desc.includes('MINUTA')) {
    return 'PROPOSTA_ADMINISTRATIVA';
  }

  const fonte = (event.fonteOrigem || '').toUpperCase();
  const hasOfficialEvidence =
    fonte === 'PNCP' ||
    fonte === 'CONTRATOS.GOV.BR' ||
    fonte === 'COMPRAS.GOV.BR' ||
    Boolean(event.numeroControlePncp || event.linkPncp || event.dataPublicacao);

  if (hasOfficialEvidence) {
    return 'FATO_OFICIAL';
  }

  if (fonte === 'SEI' || Boolean(event.processoSeiNumero)) {
    return 'DECISAO_INTERNA';
  }

  return 'DADO_INTERNO';
}

/**
 * 5. Extrai a variação monetária líquida (delta) do evento contratual com seu devido sinal
 * conforme a matriz de decisão da Fase 7.5-B.
 */
export function extractEventMonetaryDelta(event: ContractEvent, runningBaseValue: number): number {
  const tipo = String(event.tipoEvento);

  if (tipo === 'CELEBRACAO') {
    return 0;
  }

  if (tipo === 'REAJUSTE' || tipo === 'REPACTUACAO' || tipo === 'REEQUILIBRIO') {
    if (typeof event.variacaoValor === 'number' && !isNaN(event.variacaoValor)) {
      return roundCurrency(event.variacaoValor);
    }
    if (
      typeof event.valorPosterior === 'number' &&
      typeof event.valorAnterior === 'number' &&
      !isNaN(event.valorPosterior) &&
      !isNaN(event.valorAnterior)
    ) {
      return roundCurrency(event.valorPosterior - event.valorAnterior);
    }
    if (typeof event.valorPosterior === 'number' && !isNaN(event.valorPosterior)) {
      return roundCurrency(event.valorPosterior - runningBaseValue);
    }
    return 0;
  }

  if (tipo === 'ACRESCIMO') {
    if (typeof event.variacaoValor === 'number' && !isNaN(event.variacaoValor)) {
      return roundCurrency(Math.abs(event.variacaoValor));
    }
    if (
      typeof event.valorPosterior === 'number' &&
      typeof event.valorAnterior === 'number' &&
      !isNaN(event.valorPosterior) &&
      !isNaN(event.valorAnterior)
    ) {
      return roundCurrency(Math.abs(event.valorPosterior - event.valorAnterior));
    }
    if (typeof event.valorPosterior === 'number' && !isNaN(event.valorPosterior)) {
      return roundCurrency(Math.max(0, event.valorPosterior - runningBaseValue));
    }
    return 0;
  }

  if (tipo === 'SUPRESSAO') {
    if (typeof event.variacaoValor === 'number' && !isNaN(event.variacaoValor)) {
      return roundCurrency(-Math.abs(event.variacaoValor));
    }
    if (
      typeof event.valorAnterior === 'number' &&
      typeof event.valorPosterior === 'number' &&
      !isNaN(event.valorAnterior) &&
      !isNaN(event.valorPosterior)
    ) {
      return roundCurrency(-Math.abs(event.valorAnterior - event.valorPosterior));
    }
    if (typeof event.valorPosterior === 'number' && !isNaN(event.valorPosterior)) {
      return roundCurrency(-Math.max(0, runningBaseValue - event.valorPosterior));
    }
    return 0;
  }

  if (tipo === 'APOSTILAMENTO' || tipo === 'PRORROGACAO') {
    if (
      event.impacto === 'ALTERA_VALOR' ||
      (typeof event.variacaoValor === 'number' && event.variacaoValor !== 0)
    ) {
      if (typeof event.variacaoValor === 'number' && !isNaN(event.variacaoValor)) {
        return roundCurrency(event.variacaoValor);
      }
      if (
        typeof event.valorPosterior === 'number' &&
        typeof event.valorAnterior === 'number' &&
        !isNaN(event.valorPosterior) &&
        !isNaN(event.valorAnterior)
      ) {
        return roundCurrency(event.valorPosterior - event.valorAnterior);
      }
    }
    return 0;
  }

  if (tipo === 'ENCERRAMENTO' || tipo === 'RESCISAO') {
    return 0;
  }

  if (event.impacto === 'ALTERA_VALOR' && typeof event.variacaoValor === 'number' && !isNaN(event.variacaoValor)) {
    return roundCurrency(event.variacaoValor);
  }

  return 0;
}

/**
 * 6. Construtor puro do Read Model de Evolução do Valor Contratual.
 *
 * @param contract Contrato base ou registro do dashboard
 * @param events Lista de eventos contratuais oficiais ou internos
 * @returns Read Model consolidado com todos os acumulados, deltas e itens analíticos
 */
export function buildContractValueEvolutionModel(
  contract: Partial<ContractDashboardRecord> & {
    id?: string;
    contractKey?: string;
    valorInicial?: number;
    valorGlobal?: number;
    valorTotal?: number;
    uasg?: string;
    numero?: string;
    ano?: number | string;
  },
  events: readonly ContractEvent[] = []
): ContractValueEvolutionReadModel {
  const contractKey = contract.contractKey || contract.id || `${contract.uasg || ''}-${contract.numero || ''}-${contract.ano || ''}`;
  const uasg = contract.uasg;
  const numeroContrato = contract.numero;
  const anoContrato = typeof contract.ano === 'number' ? contract.ano : (parseInt(String(contract.ano || '0'), 10) || undefined);

  // Valor base original: prioriza valorInicial; se ausente, valorGlobal ou valorTotal
  const rawOriginal = contract.valorInicial !== undefined && contract.valorInicial > 0
    ? contract.valorInicial
    : (contract.valorGlobal !== undefined && contract.valorGlobal > 0 ? contract.valorGlobal : (contract.valorTotal || 0));

  const valorOriginal = roundCurrency(rawOriginal);

  // Ordena eventos de forma determinística
  const sortedEvents = sortEventsForEvolution(events || []);

  let runningValue = valorOriginal;
  let totalAcrescimos = 0;
  let totalSupressoes = 0;
  let totalReajustes = 0;
  let totalRepactuacoes = 0;
  let totalReequilibrios = 0;
  let totalOutrosAditivos = 0;
  let totalEventosMonetarios = 0;
  let dataUltimoEventoRelevante: string | undefined;

  const eventItems: ContractValueEvolutionEventItem[] = [];

  for (const ev of sortedEvents) {
    const { dateStr } = getEventCanonicalDate(ev);
    const delta = extractEventMonetaryDelta(ev, runningValue);
    const impactoMonetario = delta !== 0;
    const valorAnterior = runningValue;
    const valorResultante = roundCurrency(runningValue + delta);

    if (impactoMonetario) {
      runningValue = valorResultante;
      totalEventosMonetarios += 1;
      if (dateStr) {
        dataUltimoEventoRelevante = dateStr;
      }

      // Categorização estrita
      const evTipoStr = String(ev.tipoEvento);
      if (evTipoStr === 'ACRESCIMO') {
        totalAcrescimos = roundCurrency(totalAcrescimos + delta);
      } else if (evTipoStr === 'SUPRESSAO') {
        totalSupressoes = roundCurrency(totalSupressoes + Math.abs(delta));
      } else if (evTipoStr === 'REAJUSTE') {
        totalReajustes = roundCurrency(totalReajustes + delta);
      } else if (evTipoStr === 'REPACTUACAO') {
        totalRepactuacoes = roundCurrency(totalRepactuacoes + delta);
      } else if (evTipoStr === 'REEQUILIBRIO') {
        totalReequilibrios = roundCurrency(totalReequilibrios + delta);
      } else {
        totalOutrosAditivos = roundCurrency(totalOutrosAditivos + delta);
      }
    } else if (dateStr && !dataUltimoEventoRelevante) {
      dataUltimoEventoRelevante = dateStr;
    }

    eventItems.push({
      eventoId: ev.id,
      tipoEvento: ev.tipoEvento,
      identificadorOficial: ev.identificadorOficial || 'Evento sem número',
      descricao: ev.descricao,
      dataEfeito: dateStr,
      impacto: ev.impacto,
      impactoMonetario,
      deltaValor: delta,
      valorAnterior,
      valorResultante,
      instrumento: ev.naturezaInstrumento,
      oficialidade: classifyEventOfficiality(ev),
      fonteOrigem: ev.fonteOrigem || 'Não informada',
      linkPncp: ev.linkPncp,
      processoSeiNumero: ev.processoSeiNumero
    });
  }

  const valorVigente = roundCurrency(runningValue);
  const deltaAcumulado = roundCurrency(valorVigente - valorOriginal);
  const percentualVariacaoAcumulada = valorOriginal > 0
    ? roundCurrency((deltaAcumulado / valorOriginal) * 100)
    : 0;

  return {
    contractKey,
    uasg,
    numeroContrato,
    anoContrato,
    valorOriginal,
    valorVigente,
    deltaAcumulado,
    percentualVariacaoAcumulada,
    totalAcrescimos,
    totalSupressoes,
    totalReajustes,
    totalRepactuacoes,
    totalReequilibrios,
    totalOutrosAditivos,
    totalEventosConsiderados: sortedEvents.length,
    totalEventosMonetarios,
    dataUltimoEventoRelevante,
    eventos: eventItems
  };
}
