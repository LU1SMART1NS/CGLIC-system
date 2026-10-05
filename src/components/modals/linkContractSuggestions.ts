import type { ContractDashboardRecord } from '../../types';

/** Critérios da Ata usados para sugerir contratos no LinkContractModal. */
export interface ContractSuggestionCriteria {
  /** Compra de origem da Ata (idCompra oficial e/ou numero+ano). */
  compra?: {
    idCompra?: string;
    uasg?: string;
    numeroCompra?: string;
    anoCompra?: string;
  };
  /** CNPJs dos fornecedores dos itens da Ata. */
  fornecedorCnpjs?: string[];
}

export type ContractSuggestionReason = 'compra' | 'fornecedor';

const digits = (v?: string | number | null) => String(v ?? '').replace(/\D/g, '');

/**
 * Verifica se o idCompra do contrato corresponde à compra da Ata.
 *
 * O idCompra oficial (Compras.gov.br) tem 17 dígitos: UASG(6) + modalidade(2) +
 * número(5) + ano(4). Na base local ele pode vir sem a modalidade
 * (dbCacheService) — por isso a comparação é pelo sufixo número+ano e, quando
 * os dois lados têm UASG, também pelo prefixo UASG.
 */
export function contractMatchesCompra(
  contract: Pick<ContractDashboardRecord, 'idCompra'>,
  compra: NonNullable<ContractSuggestionCriteria['compra']>
): boolean {
  const contractId = digits(contract.idCompra);
  if (!contractId) return false;

  const ataId = digits(compra.idCompra);
  if (ataId && ataId === contractId) return true;

  const numero = digits(compra.numeroCompra);
  const ano = digits(compra.anoCompra);
  if (!numero || ano.length !== 4) return false;

  // numeroCompra às vezes já vem com o ano embutido ("900452024")
  const numeroSemAno = numero.length > 5 && numero.endsWith(ano) ? numero.slice(0, -4) : numero;
  const suffix = `${numeroSemAno.padStart(5, '0')}${ano}`;
  if (!contractId.endsWith(suffix)) return false;

  const uasg = digits(compra.uasg);
  if (uasg.length === 6 && contractId.length >= 15) {
    return contractId.startsWith(uasg);
  }
  return true;
}

/** Motivos pelos quais um contrato é sugerido para a Ata (vazio = não sugerido). */
export function getContractSuggestionReasons(
  contract: ContractDashboardRecord,
  criteria?: ContractSuggestionCriteria
): ContractSuggestionReason[] {
  if (!criteria) return [];
  const reasons: ContractSuggestionReason[] = [];

  if (criteria.compra && contractMatchesCompra(contract, criteria.compra)) {
    reasons.push('compra');
  }

  const cnpj = digits(contract.fornecedorCnpjCpf);
  if (cnpj && (criteria.fornecedorCnpjs || []).some((c) => digits(c) === cnpj)) {
    reasons.push('fornecedor');
  }

  return reasons;
}

/**
 * Ordena os contratos colocando os sugeridos primeiro (mesma compra antes de
 * mesmo fornecedor), preservando a ordem original dentro de cada grupo.
 */
export function rankContractsBySuggestion(
  contracts: ContractDashboardRecord[],
  criteria?: ContractSuggestionCriteria
): Array<{ contract: ContractDashboardRecord; reasons: ContractSuggestionReason[] }> {
  const score = (reasons: ContractSuggestionReason[]) =>
    (reasons.includes('compra') ? 2 : 0) + (reasons.includes('fornecedor') ? 1 : 0);

  return contracts
    .map((contract, index) => ({ contract, reasons: getContractSuggestionReasons(contract, criteria), index }))
    .sort((a, b) => score(b.reasons) - score(a.reasons) || a.index - b.index)
    .map(({ contract, reasons }) => ({ contract, reasons }));
}

/**
 * Em quantos dos itens da ata o contrato já está vinculado. Serve ao modo Ata do modal de vínculo:
 * o contrato só deixa de ser oferecido quando já cobre todos os itens (`completo`).
 */
export function ataLinkCoverage(
  contractKey: string,
  itemOptions: Array<{ linkedContractKeys?: string[] }>
): { vinculados: number; total: number; completo: boolean } {
  const key = contractKey.toUpperCase();
  const total = itemOptions.length;
  const vinculados = itemOptions.filter((i) => i.linkedContractKeys?.some((k) => k.toUpperCase() === key)).length;
  return { vinculados, total, completo: total > 0 && vinculados === total };
}

/** Linha da lista do modal de vínculo, já com as restrições de vínculo da CGLIC. */
export interface ContratoParaVincular {
  contract: ContractDashboardRecord;
  reasons: ContractSuggestionReason[];
  /** Número da ata a que o contrato já está vinculado (outra ata): não pode ser escolhido. */
  vinculadoAOutraAta?: string;
  /** O coordenador marcou que o contrato não pertence a ata: não é sugerido (vincular desfaz a marcação). */
  naoPertenceAAta?: boolean;
}

/**
 * Aplica as regras de vínculo à lista já ordenada por sugestão:
 * - um contrato pertence a uma só ata: o já vinculado a outra ata perde a sugestão, vai para o fim e fica bloqueado;
 * - o marcado "não pertence a ata" perde a sugestão (continua pesquisável).
 * A ordem relativa dentro de cada grupo é preservada.
 */
export function aplicarRestricoesDeVinculo(
  ranked: Array<{ contract: ContractDashboardRecord; reasons: ContractSuggestionReason[] }>,
  opts: {
    contractKeyOf: (c: ContractDashboardRecord) => string;
    /** contract_key (maiúsculas) → número da ata a que já está vinculado, só para atas diferentes desta. */
    ataDeOutroVinculo: Map<string, string>;
    /** contract_key (maiúsculas) dos contratos marcados "não pertence a ata". */
    naoPertencemAAta: Set<string>;
  }
): ContratoParaVincular[] {
  const sugeridos: ContratoParaVincular[] = [];
  const demais: ContratoParaVincular[] = [];
  const bloqueados: ContratoParaVincular[] = [];
  for (const row of ranked) {
    const key = opts.contractKeyOf(row.contract).toUpperCase();
    const outraAta = opts.ataDeOutroVinculo.get(key);
    if (outraAta) {
      bloqueados.push({ contract: row.contract, reasons: [], vinculadoAOutraAta: outraAta });
      continue;
    }
    if (opts.naoPertencemAAta.has(key)) {
      demais.push({ contract: row.contract, reasons: [], naoPertenceAAta: true });
      continue;
    }
    (row.reasons.length > 0 ? sugeridos : demais).push({ contract: row.contract, reasons: row.reasons });
  }
  return [...sugeridos, ...demais, ...bloqueados];
}
