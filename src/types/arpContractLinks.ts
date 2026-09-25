import type { ContractDashboardRecord } from './index';

/**
 * Representa o vínculo relacional contextual entre um Item de ARP e um Contrato Oficial.
 * Não replica dados oficiais do contrato — todos derivam do catálogo oficial via contractKey.
 */
export interface ArpItemContractLink {
  id: string;
  itemKey: string;
  contractKey: string;
  quantidadeContratada: number;
  observacoes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Parâmetros para criação ou atualização atômica de um vínculo.
 */
export interface LinkContractToItemParams {
  itemKey: string;
  contractKey: string;
  quantidadeContratada: number;
  observacoes?: string;
}

/**
 * Vínculo enriquecido pronto para apresentação na UI, unindo os metadados do vínculo
 * ao registro oficial do Contrato proveniente do catálogo do SaldoARP.
 */
export interface EnrichedArpItemContract {
  linkId: string;
  itemKey: string;
  contractKey: string;
  quantidadeContratada: number;
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
