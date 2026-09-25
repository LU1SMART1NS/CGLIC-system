/**
 * Módulo Canônico de Normalização de Empenhos (SaldoARP 3.0)
 * Responsável por higienizar dados de fontes externas (Compras.gov, Contratos.gov, PNCP)
 * e produzir representações transitórias NormalizedEmpenho conforme FASE 7.2-F / FASE 7.2-G.
 *
 * Invariante: Pura computação determinística em memória. Zero persistência, zero chamadas diretas ao banco.
 */

import type {
  EmpenhoSaldoItemRecord,
  ContratosGovEmpenhoRecord,
  PncpContractEmpenho
} from '../types';
import type {
  NormalizedEmpenho,
  NormalizedItemLink,
  NormalizedContractLink,
  VinculoPendente
} from '../types/empenhoSync';
import { normalizeItemKey } from '../utils/itemKeyUtils';
import { parseMoneyValue, getEmpenhoEffectiveValue, deduceEmpenhoQuantity } from './balanceService';

/**
 * Normaliza e sanitiza a UASG emitente para exatamente 6 dígitos numéricos.
 * Compatível com a restrição ^[0-9]{6}$ da RPC save_empenho_soberano_atomic (M17).
 */
export function normalizeUasgEmitente(rawUasg?: string | number | null, fallback = '200331'): string {
  if (rawUasg === undefined || rawUasg === null) return fallback;
  const digitsOnly = String(rawUasg).replace(/\D/g, '').trim();
  if (!digitsOnly) return fallback;
  return digitsOnly.padStart(6, '0');
}

/**
 * Normaliza o número de empenho para chave canônica.
 * Exemplos:
 * - "2026NE000142" -> "2026NE142"
 * - "2026 NE 000142" -> "2026NE142"
 * - "2026-NE-000142" -> "2026NE142"
 * - "000142" -> "142"
 * - "142" -> "142"
 */
export function normalizeEmpenhoNumero(numeroRaw?: string | null): string {
  if (!numeroRaw) return '';
  const trimmed = numeroRaw.trim().toUpperCase();

  // Padrão estruturado ANO + NE + NUMERO (com espaços, hífens ou zeros opcionais)
  const neMatch = trimmed.match(/^(\d{4})\s*[-_/\s]?\s*NE\s*[-_/\s]?\s*0*(\d+)$/i);
  if (neMatch) {
    return `${neMatch[1]}NE${neMatch[2]}`;
  }

  // Padrão apenas dígitos com zeros à esquerda
  const digitsOnly = trimmed.match(/^0*(\d+)$/);
  if (digitsOnly) {
    return digitsOnly[1];
  }

  // Limpeza geral para preservar padrão alfanumérico seguro
  const sanitized = trimmed.replace(/[^A-Z0-9]/g, '');
  if (sanitized) {
    const subNe = sanitized.match(/^(\d{4})NE0*(\d+)$/);
    if (subNe) {
      return `${subNe[1]}NE${subNe[2]}`;
    }
    return sanitized;
  }

  return trimmed;
}

/**
 * Extrai o ano de exercício do empenho com fallback determinístico.
 */
export function normalizeAnoExercicio(
  anoRaw?: string | number | null,
  fallbackData?: string | null,
  numeroRaw?: string | null
): number {
  // 1. Extrai do número se for padrão NExx (ex: "2026NE142" -> 2026)
  if (numeroRaw) {
    const numClean = String(numeroRaw).trim().toUpperCase();
    const match = numClean.match(/^(\d{4})\s*[-_/\s]?\s*NE/i);
    if (match) {
      const parsedYear = parseInt(match[1], 10);
      if (parsedYear >= 2000 && parsedYear <= 2100) {
        return parsedYear;
      }
    }
  }

  // 2. Extrai de anoRaw
  if (anoRaw !== undefined && anoRaw !== null) {
    const digits = String(anoRaw).replace(/\D/g, '');
    if (digits.length === 4) {
      const parsed = parseInt(digits, 10);
      if (parsed >= 2000 && parsed <= 2100) return parsed;
    }
  }

  // 3. Extrai da data (YYYY-MM-DD)
  if (fallbackData) {
    const dateDigits = String(fallbackData).trim().slice(0, 4);
    const parsed = parseInt(dateDigits, 10);
    if (parsed >= 2000 && parsed <= 2100) return parsed;
  }

  return new Date().getFullYear();
}

/**
 * Constrói a chave canônica soberana do empenho no formato oficial M16:
 * {uasg}-{ano}-{numeroNormalizado}
 */
export function buildCanonicalEmpenhoKey(
  uasg: string | number | null | undefined,
  ano: number | string | null | undefined,
  numeroNormalizado: string | null | undefined
): string {
  const normUasg = normalizeUasgEmitente(uasg);
  const normAno = normalizeAnoExercicio(ano, null, numeroNormalizado);
  const normNum = normalizeEmpenhoNumero(numeroNormalizado);
  return `${normUasg}-${normAno}-${normNum}`;
}

/**
 * Normaliza data para formato YYYY-MM-DD.
 */
export function normalizeIsoDate(rawDate?: string | null): string | undefined {
  if (!rawDate) return undefined;
  const trimmed = rawDate.trim();
  if (!trimmed) return undefined;

  // Se vier no formato ISO "2026-03-15T00:00:00" ou "2026-03-15"
  if (trimmed.includes('T')) {
    return trimmed.split('T')[0];
  }

  // Se vier no formato BR "15/03/2026"
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${year}-${month}-${day}`;
    }
  }

  // Se já for YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

/**
 * Normaliza leitura bruta de Compras.gov.br (/modulo-arp/4_consultarEmpenhosSaldoItem)
 */
export function normalizeFromComprasGov(
  record: EmpenhoSaldoItemRecord,
  context?: {
    numeroAta?: string;
    uasg?: string;
    numeroItem?: string;
  }
): NormalizedEmpenho {
  const rawNumero = record.numeroEmpenho || '';
  const uasg = normalizeUasgEmitente(record.unidade || context?.uasg);
  const dataEmissao = normalizeIsoDate(record.dataEmpenho || record.dataHoraInclusao || record.dataHoraAtualizacao);
  const ano = normalizeAnoExercicio(null, dataEmissao, rawNumero);
  const numeroNorm = normalizeEmpenhoNumero(rawNumero);
  const canonicalKey = buildCanonicalEmpenhoKey(uasg, ano, numeroNorm);

  const valorEmpenhado = record.valorEmpenhado !== undefined && record.valorEmpenhado !== null
    ? parseMoneyValue(record.valorEmpenhado)
    : undefined;

  const itemLinks: NormalizedItemLink[] = [];
  const vinculosPendentes: VinculoPendente[] = [];

  // Vínculo com item de Ata se houver contexto determinístico
  const itemNum = record.numeroItem || context?.numeroItem;
  const numAta = context?.numeroAta;

  if (numAta && itemNum) {
    const itemKey = normalizeItemKey(numAta, uasg, itemNum);
    const qtd = Number(record.quantidadeIncluida ?? record.quantidadeEmpenhada ?? 0);
    itemLinks.push({
      item_key: itemKey,
      quantidade_consumida: qtd,
      tipo_consumo: (record.reforco && record.reforco > 0) ? 'REFORCO' : 'ORDINARIO'
    });
  } else {
    vinculosPendentes.push({
      tipo: 'ITEM',
      motivo: 'Contexto de Ata ou Item não informado na leitura de Compras.gov',
      contexto: { numeroItem: record.numeroItem }
    });
  }

  return {
    canonical_key: canonicalKey,
    uasg,
    ano,
    numero_oficial: rawNumero || numeroNorm,
    numero_normalizado: numeroNorm,
    data_emissao: dataEmissao,
    valor_empenhado: valorEmpenhado,
    credor_nome: record.fornecedorNome?.trim() || undefined,
    credor_cnpj_cpf: record.fornecedorCnpj?.trim() || undefined,
    fonte_origem: 'COMPRASNET',
    item_links: itemLinks.length > 0 ? itemLinks : undefined,
    vinculos_pendentes: vinculosPendentes.length > 0 ? vinculosPendentes : undefined
  };
}

/**
 * Normaliza leitura bruta de Contratos.gov.br (/api/contrato/{id}/empenhos e /consultar/{id})
 */
export function normalizeFromContratosGov(
  record: ContratosGovEmpenhoRecord,
  context?: {
    contractKey?: string;
    targetItemNum?: number;
    itemContext?: {
      numeroAta?: string;
      uasg?: string;
      numeroItem?: string;
    };
    unitPrice?: number;
    historicoPrecos?: Array<{ dataTermo: string; valorUnitario: number }>;
  }
): NormalizedEmpenho {
  const rawNumero = record.numero || '';
  const uasg = normalizeUasgEmitente(record.unidade_gestora);
  const dataEmissao = normalizeIsoDate(record.data_emissao);
  const ano = normalizeAnoExercicio(null, dataEmissao, rawNumero);
  const numeroNorm = normalizeEmpenhoNumero(rawNumero);
  const canonicalKey = buildCanonicalEmpenhoKey(uasg, ano, numeroNorm);

  const valorEmpenhado = getEmpenhoEffectiveValue(record.empenhado, record.rpinscrito);
  const valorLiquidado = parseMoneyValue(record.liquidado);
  const valorPago = parseMoneyValue(record.pago);
  const valorRpinscrito = parseMoneyValue(record.rpinscrito);
  const valorRpALiquidar = parseMoneyValue(record.rpaliquidar);
  const valorRpLiquidado = parseMoneyValue(record.rpliquidado);
  const valorRpPago = parseMoneyValue(record.rppago);

  const credorNome = record.credor_obj?.nome?.trim() || record.credor?.trim() || undefined;
  const credorCnpj = record.credor_obj?.cnpj_cpf_idgener?.trim() || undefined;

  const contractLinks: NormalizedContractLink[] = [];
  const itemLinks: NormalizedItemLink[] = [];
  const vinculosPendentes: VinculoPendente[] = [];

  // Vínculo Contratual determinístico
  if (context?.contractKey) {
    contractLinks.push({
      contract_key: context.contractKey,
      valor_vinculado: valorEmpenhado > 0 ? valorEmpenhado : undefined
    });
  } else {
    vinculosPendentes.push({
      tipo: 'CONTRATO',
      motivo: 'Chave de contrato não informada no contexto de Contratos.gov'
    });
  }

  // Vínculo com Item se minuta ou contexto estiver disponível
  if (context?.itemContext?.numeroAta && context?.itemContext?.numeroItem) {
    const itemKey = normalizeItemKey(
      context.itemContext.numeroAta,
      context.itemContext.uasg || uasg,
      context.itemContext.numeroItem
    );

    let quantidadeFisica: number | undefined = undefined;
    let itemMinutaNumero: string | undefined = undefined;

    // Prioridade 1: Minuta oficial da API
    if (record.itens_minuta && record.itens_minuta.length > 0) {
      const targetNum = context.targetItemNum ?? parseInt(context.itemContext.numeroItem, 10);
      const match = record.itens_minuta.find(i => parseInt(i.numero_item_compra || '0', 10) === targetNum);
      if (match && typeof match.quantidade === 'number') {
        quantidadeFisica = match.quantidade;
        itemMinutaNumero = match.numero_item_compra;
      }
    } else if (record.quantidadeFisicaOriginal !== undefined) {
      quantidadeFisica = record.quantidadeFisicaOriginal;
    }

    // Prioridade 2: Dedução temporal quando aplicável (estimativa)
    let isDeduzido = false;
    let isReforco = false;
    if (quantidadeFisica === undefined && context.unitPrice && valorEmpenhado > 0) {
      const deduction = deduceEmpenhoQuantity(
        valorEmpenhado,
        context.unitPrice,
        dataEmissao,
        context.historicoPrecos
      );
      if (deduction.quantidade > 0 || deduction.isReforco) {
        quantidadeFisica = deduction.quantidade;
        isDeduzido = true;
        isReforco = deduction.isReforco;
      }
    }

    if (quantidadeFisica !== undefined && quantidadeFisica > 0) {
      itemLinks.push({
        item_key: itemKey,
        quantidade_consumida: quantidadeFisica,
        tipo_consumo: isReforco ? 'REFORCO' : 'ORDINARIO',
        numero_item_minuta: itemMinutaNumero,
        is_deduzido: isDeduzido
      });
    }
  }

  return {
    canonical_key: canonicalKey,
    uasg,
    ano,
    numero_oficial: rawNumero || numeroNorm,
    numero_normalizado: numeroNorm,
    data_emissao: dataEmissao,
    valor_empenhado: valorEmpenhado,
    valor_liquidado: valorLiquidado,
    valor_pago: valorPago,
    valor_rpinscrito: valorRpinscrito,
    valor_rp_a_liquidar: valorRpALiquidar > 0 ? valorRpALiquidar : undefined,
    valor_rp_liquidado: valorRpLiquidado > 0 ? valorRpLiquidado : undefined,
    valor_rp_pago: valorRpPago > 0 ? valorRpPago : undefined,
    credor_nome: credorNome,
    credor_cnpj_cpf: credorCnpj,
    fonte_origem: 'CONTRATOSNET',
    identificador_fonte: record.id ? String(record.id) : undefined,
    contract_links: contractLinks.length > 0 ? contractLinks : undefined,
    item_links: itemLinks.length > 0 ? itemLinks : undefined,
    vinculos_pendentes: vinculosPendentes.length > 0 ? vinculosPendentes : undefined
  };
}

/**
 * Normaliza leitura bruta de PNCP (/api/pncp/v1/orgaos/{cnpj}/contratos/{ano}/{seq}/empenhos)
 */
export function normalizeFromPncp(
  record: PncpContractEmpenho,
  context?: {
    contractKey?: string;
    uasg?: string;
    ano?: number;
  }
): NormalizedEmpenho {
  const rawNumero = record.numeroEmpenho || '';
  const uasg = normalizeUasgEmitente(context?.uasg);
  const dataEmissao = normalizeIsoDate(record.dataEmissaoEmpenho);
  const ano = normalizeAnoExercicio(context?.ano, dataEmissao, rawNumero);
  const numeroNorm = normalizeEmpenhoNumero(rawNumero);
  const canonicalKey = buildCanonicalEmpenhoKey(uasg, ano, numeroNorm);
  const valorEmpenhado = parseMoneyValue(record.valorTotal);

  const contractLinks: NormalizedContractLink[] = [];
  const vinculosPendentes: VinculoPendente[] = [];

  if (context?.contractKey) {
    contractLinks.push({
      contract_key: context.contractKey,
      valor_vinculado: valorEmpenhado > 0 ? valorEmpenhado : undefined
    });
  } else {
    vinculosPendentes.push({
      tipo: 'CONTRATO',
      motivo: 'Chave de contrato não informada no contexto PNCP'
    });
  }

  return {
    canonical_key: canonicalKey,
    uasg,
    ano,
    numero_oficial: rawNumero || numeroNorm,
    numero_normalizado: numeroNorm,
    data_emissao: dataEmissao,
    valor_empenhado: valorEmpenhado,
    fonte_origem: 'PNCP',
    identificador_fonte: record.sequencialEmpenho ? String(record.sequencialEmpenho) : undefined,
    contract_links: contractLinks.length > 0 ? contractLinks : undefined,
    vinculos_pendentes: vinculosPendentes.length > 0 ? vinculosPendentes : undefined
  };
}
