/**
 * Adaptador do histórico de contratos do Contratos.gov.br (CGLIC)
 *
 * Transforma os registros de `GET /api/contrato/{id}/historico` em eventos formais
 * (`ContractEvent`) para a aba Histórico e para as marcas da linha da vida.
 *
 * Decisões:
 * 1. A linha do tipo "Contrato" é a celebração e já vira evento em
 *    `buildContractEventsFromOfficialData`; só os termos ("Termo Aditivo", "Termo de Apostilamento",
 *    rescisão, encerramento) viram eventos aqui.
 * 2. O `valor_global` de cada registro é o valor na hora do cadastro, e termos retroativos são
 *    cadastrados depois dos mais recentes. Por isso o valor novo vem de `novo_valor_global`
 *    (> 0 quando o termo altera o valor) e a ordem de comparação é a de cadastro (`criado_em`).
 * 3. O tipo do evento segue `qualificacao_termo` (VIGÊNCIA, REAJUSTE, ACRÉSCIMO / SUPRESSÃO,
 *    INFORMATIVO) e, na falta dela, a variação de valor e de vigência. Termo aditivo informativo,
 *    sem efeito em valor ou vigência, fica como APOSTILAMENTO com instrumento TERMO_ADITIVO.
 */

import type { ContractDashboardRecord } from '../types';
import type {
  ContractEvent,
  ContractEventImpact,
  ContractEventNature,
  ContractEventType
} from '../types/contractEvents';
import type { ContratosGovHistoricoRecord } from '../types/contractHistorico';
import { classifyContractEvent, generateIdempotentEventId } from './contractEventService';

const normalize = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** "1.270.002,00" → 1270002; número passa direto; vazio → undefined. */
export function parseValorBR(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const parsed = text.includes(',') ? Number(text.replace(/\./g, '').replace(',', '.')) : Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const isTermo = (row: ContratosGovHistoricoRecord): boolean => normalize(row.tipo).includes('termo');

/** Ordem em que os registros foram cadastrados (a que reflete o estado acumulado do contrato). */
function byRegistro(a: ContratosGovHistoricoRecord, b: ContratosGovHistoricoRecord): number {
  const ka = String(a.criado_em || a.data_assinatura || '');
  const kb = String(b.criado_em || b.data_assinatura || '');
  if (ka !== kb) return ka.localeCompare(kb);
  return String(a.id).localeCompare(String(b.id));
}

interface TermoClassification {
  tipoEvento: ContractEventType;
  naturezaInstrumento: ContractEventNature;
  impacto: ContractEventImpact;
}

function classifyTermo(params: {
  tipo: string;
  qualificacoes: string;
  variacaoValor?: number;
  vigenciaMudou: boolean;
}): TermoClassification {
  const { tipo, qualificacoes, variacaoValor, vigenciaMudou } = params;
  const tipoN = normalize(tipo);
  const mudouValor = Boolean(variacaoValor && variacaoValor !== 0);

  // Rescisão e encerramento seguem o classificador geral.
  if (tipoN.includes('rescis') || tipoN.includes('encerr')) {
    return classifyContractEvent({ tipoOuDescricao: tipo });
  }

  // Apostilamento: nunca altera vigência por si; reajuste e repactuação ficam com o tipo próprio.
  if (tipoN.includes('apostil')) {
    const tipoEvento: ContractEventType = qualificacoes.includes('repactua')
      ? 'REPACTUACAO'
      : qualificacoes.includes('reajuste')
        ? 'REAJUSTE'
        : 'APOSTILAMENTO';
    return {
      tipoEvento,
      naturezaInstrumento: 'TERMO_APOSTILAMENTO',
      impacto: mudouValor ? 'ALTERA_VALOR' : 'ATUALIZA_DADOS'
    };
  }

  // Termo aditivo: a qualificação manda; sem ela, valem a vigência e o valor.
  if (qualificacoes.includes('vigencia') || qualificacoes.includes('prorroga')) {
    return { tipoEvento: 'PRORROGACAO', naturezaInstrumento: 'TERMO_ADITIVO', impacto: mudouValor ? 'ALTERA_VALOR' : 'ALTERA_VIGENCIA' };
  }
  if (qualificacoes.includes('repactua')) {
    return { tipoEvento: 'REPACTUACAO', naturezaInstrumento: 'TERMO_ADITIVO', impacto: 'ALTERA_VALOR' };
  }
  if (qualificacoes.includes('reajuste')) {
    return { tipoEvento: 'REAJUSTE', naturezaInstrumento: 'TERMO_ADITIVO', impacto: mudouValor ? 'ALTERA_VALOR' : 'ATUALIZA_DADOS' };
  }
  if (qualificacoes.includes('acrescimo') || qualificacoes.includes('supressao')) {
    if (variacaoValor !== undefined && variacaoValor < 0) {
      return { tipoEvento: 'SUPRESSAO', naturezaInstrumento: 'TERMO_ADITIVO', impacto: 'ALTERA_VALOR' };
    }
    return {
      tipoEvento: 'ACRESCIMO',
      naturezaInstrumento: 'TERMO_ADITIVO',
      impacto: mudouValor ? 'ALTERA_VALOR' : 'ALTERA_QUANTITATIVO'
    };
  }
  if (vigenciaMudou) {
    return { tipoEvento: 'PRORROGACAO', naturezaInstrumento: 'TERMO_ADITIVO', impacto: mudouValor ? 'ALTERA_VALOR' : 'ALTERA_VIGENCIA' };
  }
  if (mudouValor) {
    return {
      tipoEvento: (variacaoValor as number) < 0 ? 'SUPRESSAO' : 'ACRESCIMO',
      naturezaInstrumento: 'TERMO_ADITIVO',
      impacto: 'ALTERA_VALOR'
    };
  }
  // Informativo: sem efeito em valor nem em vigência.
  return { tipoEvento: 'APOSTILAMENTO', naturezaInstrumento: 'TERMO_ADITIVO', impacto: 'ATUALIZA_DADOS' };
}

/**
 * Eventos (termos) do contrato a partir do histórico oficial. Não inclui a celebração inicial.
 */
export function buildContractEventsFromHistorico(
  contract: ContractDashboardRecord,
  rows: ContratosGovHistoricoRecord[]
): ContractEvent[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const ordered = [...rows].sort(byRegistro);
  const base = ordered.find((row) => !isTermo(row));

  let valorAtual = parseValorBR(base?.valor_global) ?? parseValorBR(base?.valor_inicial) ?? contract.valorInicial;
  let vigenciaAtual: string | undefined = base?.vigencia_fim || undefined;

  const anoContrato = typeof contract.ano === 'number' ? contract.ano : parseInt(String(contract.ano), 10) || 0;
  const events: ContractEvent[] = [];

  for (const row of ordered) {
    if (!isTermo(row)) continue;

    const tipoRotulo = String(row.tipo || 'Termo').trim();
    const numero = String(row.numero || '').trim();
    const qualificacoes = (row.qualificacao_termo || []).map((q) => normalize(q.descricao)).join(' ');

    const novoValor = parseValorBR(row.novo_valor_global);
    const valorAnterior = valorAtual;
    const valorPosterior = novoValor !== undefined && novoValor > 0 ? novoValor : valorAtual;
    const variacaoValor =
      valorAnterior !== undefined && valorPosterior !== undefined ? round2(valorPosterior - valorAnterior) : undefined;
    const percentualVariacaoValor =
      variacaoValor !== undefined && valorAnterior ? round2((variacaoValor / valorAnterior) * 100) : undefined;

    const vigenciaAnterior = vigenciaAtual;
    const vigenciaPosterior = row.vigencia_fim || vigenciaAtual;
    const vigenciaMudou = Boolean(vigenciaAnterior && vigenciaPosterior && vigenciaAnterior !== vigenciaPosterior);

    const classification = classifyTermo({ tipo: tipoRotulo, qualificacoes, variacaoValor, vigenciaMudou });
    const identificadorOficial = `${tipoRotulo} ${numero}`.trim();

    events.push({
      id: generateIdempotentEventId({
        contractKey: contract.id,
        tipoEvento: classification.tipoEvento,
        identificadorOficial,
        cicloRef: `HIST_${row.id}`
      }),
      contractKey: contract.id,
      uasg: contract.uasg,
      numeroContrato: contract.numero,
      anoContrato,
      tipoEvento: classification.tipoEvento,
      naturezaInstrumento: classification.naturezaInstrumento,
      numeroSequencial: numero || undefined,
      identificadorOficial,
      descricao: String(row.observacao || '').trim() || identificadorOficial,
      dataAssinatura: row.data_assinatura || undefined,
      dataPublicacao: row.data_publicacao || undefined,
      dataVigenciaEfeito: row.vigencia_inicio || undefined,
      impacto: classification.impacto,
      vigenciaAnterior,
      vigenciaPosterior,
      valorAnterior,
      valorPosterior,
      variacaoValor,
      percentualVariacaoValor,
      fonteOrigem: 'Contratos.gov.br',
      capturedAt: row.alterado_em || row.criado_em || new Date().toISOString(),
      rawOfficialData: row
    });

    valorAtual = valorPosterior;
    vigenciaAtual = vigenciaPosterior;
  }

  return events;
}
