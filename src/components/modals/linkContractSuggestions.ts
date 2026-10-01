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
