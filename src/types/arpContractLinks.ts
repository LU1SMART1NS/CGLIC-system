import type { ContractDashboardRecord } from './index';

/**
 * Representa o vínculo relacional contextual entre um Item de ARP e um Contrato Oficial.
 * Não replica dados oficiais do contrato — todos derivam do catálogo oficial via contractKey.
 */
export interface ArpItemContractLink {
  id: string;
  itemKey: string;
  contractKey: string;
  observacoes?: string;
  /** Cópia da quantidade do item no contrato lida da API (nunca digitada); nulo = a API não listou o item. */
  quantidadeContratadaApi?: number | null;
  valorUnitarioApi?: number | null;
  /** Quando a quantidade foi lida da API; ausente = ainda não sincronizada. */
  quantidadeLidaEm?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Parâmetros para criação ou atualização atômica de um vínculo.
 */
export interface LinkContractToItemParams {
  itemKey: string;
  contractKey: string;
  observacoes?: string;
}

/**
 * Vínculo enriquecido pronto para apresentação na UI, unindo os metadados do vínculo
 * ao registro oficial do Contrato proveniente do catálogo do CGLIC.
 */
export interface EnrichedArpItemContract {
  linkId: string;
  itemKey: string;
  contractKey: string;
  /** Quantidade do item no contrato, lida da API oficial (não é gravada no vínculo). */
  quantidadeContratada?: number;
  /** Quando a quantidade foi lida da API pela última vez; ausente = ainda não sincronizada. */
  quantidadeLidaEm?: string;
  observacoes?: string;
  // Dados oficiais derivados diretamente do catálogo governamental
  contract?: ContractDashboardRecord;
  numeroContratoFormatado: string;
  uasg: string;
  orgaoNome: string;
  fornecedorNome: string;
  fornecedorCnpjCpf: string;
  fornecedorCnpj: string;
  dataVigenciaFim?: string;
  statusVigencia?: string;
  valorGlobal?: number;
  numeroControlePncp?: string;
  linkPncp?: string;
  objeto?: string;
  isOficial: boolean;
}

/**
 * Sugestão de contrato descartada pelo gestor para um item da ARP.
 * Não é vínculo: serve só para a sugestão não voltar a aparecer.
 */
export interface ArpItemContractDismissal {
  itemKey: string;
  contractKey: string;
  dismissedAt?: string;
}

export interface DismissContractSuggestionParams {
  itemKey: string;
  contractKey: string;
}

/** Parâmetros para vincular um mesmo contrato a vários itens de uma só vez. */
export interface LinkContractToItemsParams {
  contractKey: string;
  itemKeys: string[];
  observacoes?: string;
}
