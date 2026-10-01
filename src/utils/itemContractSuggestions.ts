import type { ContractDashboardRecord, PncpContract } from '../types';
import { getCanonicalContractKey } from '../services/api';
import {
  contractMatchesCompra,
  type ContractSuggestionCriteria
} from '../components/modals/linkContractSuggestions';

/** De onde a sugestão veio. Uma mesma sugestão pode ter as duas origens. */
export type ItemContractSuggestionSource = 'pncp' | 'catalogo';

export interface ItemContractSuggestion {
  /** Chave gravada em arp_item_contract_links.contract_key ao vincular. */
  contractKey: string;
  sources: ItemContractSuggestionSource[];
  /** Registro do catálogo oficial, quando o contrato foi encontrado nele. */
  contract?: ContractDashboardRecord;
  /** Registro do PNCP/Compras.gov, quando a sugestão veio dele. */
  pncp?: PncpContract;
  /** Quantidade do item no contrato, quando a API informa (para pré-preencher o vínculo). */
  quantidadeContratada?: number;
}

export interface ItemContractSuggestionInput {
  /** Contratos obtidos automaticamente para o item (useItemContracts). */
  pncpContracts?: PncpContract[];
  /** Catálogo oficial de contratos da UASG (useContractsDashboard). */
  officialContracts?: ContractDashboardRecord[];
  /** Compra da Ata e CNPJ do fornecedor do item. */
  criteria?: ContractSuggestionCriteria;
  /** contract_key dos vínculos já confirmados no item. */
  linkedContractKeys?: string[];
  /** contract_key das sugestões já descartadas no item. */
  dismissedContractKeys?: string[];
}

export interface ItemContractSuggestionResult {
  /** Sugestões pendentes de decisão. */
  suggestions: ItemContractSuggestion[];
  /** Sugestões que o gestor descartou (podem ser restauradas). */
  dismissed: ItemContractSuggestion[];
}

/** Chave de vínculo de um contrato do catálogo (mesma regra do LinkContractModal). */
export const contractKeyOf = (c: ContractDashboardRecord) => c.id || `${c.uasg}-${c.numero}-${c.ano}`;

const digits = (v?: string | number | null) => String(v ?? '').replace(/\D/g, '');
const norm = (k: string) => k.trim().toUpperCase();

const numeroAnoKey = (numero?: string, ano?: string | number, pncp?: string) =>
  getCanonicalContractKey(numero, ano, pncp);

/** Acha, no catálogo oficial, o contrato correspondente a um contrato do PNCP/Compras.gov. */
function findOfficialMatch(
  pncp: PncpContract,
  official: ContractDashboardRecord[]
): ContractDashboardRecord | undefined {
  const controle = (pncp.numeroControlePncp || '').trim();
  if (controle) {
    const byControle = official.find((c) => (c.numeroControlePncp || '').trim() === controle);
    if (byControle) return byControle;
  }

  if (pncp.contratoId != null && pncp.contratoId !== ('' as any)) {
    const byId = official.find((c) => c.contratoId != null && String(c.contratoId) === String(pncp.contratoId));
    if (byId) return byId;
  }

  const numeroAno = numeroAnoKey(pncp.numeroContrato, pncp.anoContrato, pncp.numeroControlePncp);
  const uasg = digits(pncp.uasg);
  if (!numeroAno || !uasg) return undefined;
  return official.find(
    (c) => digits(c.uasg) === uasg && numeroAnoKey(c.numero, c.ano, c.numeroControlePncp) === numeroAno
  );
}

/** Chave de vínculo para um contrato do PNCP que não existe no catálogo; vazio se não der para derivar. */
function fallbackKeyFromPncp(pncp: PncpContract): string {
  const uasg = digits(pncp.uasg);
  const numeroAno = numeroAnoKey(pncp.numeroContrato, pncp.anoContrato, pncp.numeroControlePncp);
  if (!uasg || !numeroAno) return '';
  const [numero, ano] = numeroAno.split('/');
  return numero && ano ? `${uasg}-${numero}-${ano}` : '';
}

/**
 * Sugestão de contrato de um item contra o catálogo: a compra da Ata tem que
 * casar e, se o fornecedor do item for conhecido, o CNPJ também (o item tem um
 * único fornecedor; contratos da mesma compra de outro fornecedor são de outros itens).
 */
function catalogMatchesItem(contract: ContractDashboardRecord, criteria?: ContractSuggestionCriteria): boolean {
  if (!criteria?.compra || !contractMatchesCompra(contract, criteria.compra)) return false;

  const cnpjs = (criteria.fornecedorCnpjs || []).map(digits).filter(Boolean);
  if (cnpjs.length === 0) return true;
  return cnpjs.includes(digits(contract.fornecedorCnpjCpf));
}

/**
 * Reúne o que antes era "contratos automáticos" (PNCP/Compras.gov) e a sugestão
 * da Ata numa única lista de sugestões por item, sem os já vinculados.
 */
export function buildItemContractSuggestions(input: ItemContractSuggestionInput): ItemContractSuggestionResult {
  const official = input.officialContracts || [];
  const linked = new Set((input.linkedContractKeys || []).map(norm));
  const dismissedKeys = new Set((input.dismissedContractKeys || []).map(norm));

  const byKey = new Map<string, ItemContractSuggestion>();

  const add = (
    key: string,
    source: ItemContractSuggestionSource,
    patch: Partial<ItemContractSuggestion>
  ) => {
    if (!key) return;
    const id = norm(key);
    const existing = byKey.get(id);
    if (!existing) {
      byKey.set(id, { contractKey: key, sources: [source], ...patch });
      return;
    }
    if (!existing.sources.includes(source)) existing.sources.push(source);
    existing.contract = existing.contract || patch.contract;
    existing.pncp = existing.pncp || patch.pncp;
    existing.quantidadeContratada = existing.quantidadeContratada ?? patch.quantidadeContratada;
  };

  for (const pncp of input.pncpContracts || []) {
    const match = findOfficialMatch(pncp, official);
    const key = match ? contractKeyOf(match) : fallbackKeyFromPncp(pncp);
    const quantidade = typeof pncp.quantidadeContratada === 'number' && pncp.quantidadeContratada > 0
      ? pncp.quantidadeContratada
      : undefined;
    add(key, 'pncp', { contract: match, pncp, quantidadeContratada: quantidade });
  }

  for (const contract of official) {
    if (catalogMatchesItem(contract, input.criteria)) {
      add(contractKeyOf(contract), 'catalogo', { contract });
    }
  }

  const suggestions: ItemContractSuggestion[] = [];
  const dismissed: ItemContractSuggestion[] = [];
  for (const [id, suggestion] of byKey) {
    if (linked.has(id)) continue;
    (dismissedKeys.has(id) ? dismissed : suggestions).push(suggestion);
  }

  return { suggestions, dismissed };
}

/** Critérios de sugestão de um item: compra da Ata e fornecedor do próprio item. */
export function buildItemSuggestionCriteria(
  arp: { idCompra?: string; codigoUnidadeGerenciadora?: string; numeroCompra?: string; anoCompra?: string },
  item: { niFornecedor?: string }
): ContractSuggestionCriteria {
  return {
    compra: {
      idCompra: arp.idCompra,
      uasg: arp.codigoUnidadeGerenciadora,
      numeroCompra: arp.numeroCompra,
      anoCompra: arp.anoCompra
    },
    fornecedorCnpjs: item.niFornecedor ? [item.niFornecedor] : []
  };
}

/**
 * Registro de contrato pronto para o modal de vínculo. Usa o do catálogo
 * quando existe; senão monta um mínimo a partir do PNCP (contrato ainda não
 * sincronizado no catálogo da UASG).
 */
export function suggestionToContractRecord(s: ItemContractSuggestion): ContractDashboardRecord {
  if (s.contract) return s.contract;

  const pncp = s.pncp;
  const [uasg = '', numero = '', ano = ''] = s.contractKey.split('-');
  return {
    id: s.contractKey,
    numero: numero || pncp?.numeroContrato || '',
    ano: pncp?.anoContrato ?? ano,
    numeroFormatado: pncp?.numeroContrato?.includes('/') ? pncp.numeroContrato : `${numero}/${ano}`,
    uasg: pncp?.uasg || uasg,
    objeto: pncp?.objeto,
    fornecedorNome: pncp?.nomeRazaoSocialFornecedor,
    fornecedorCnpjCpf: pncp?.niFornecedor,
    valorInicial: pncp?.valorInicial,
    dataVigenciaFim: pncp?.dataVigenciaFinal,
    statusVigencia: 'Não Informado',
    numeroControlePncp: pncp?.numeroControlePncp,
    fonteDados: 'PNCP'
  };
}
