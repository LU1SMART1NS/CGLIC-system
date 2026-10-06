import type { ContractDashboardRecord, PncpContract } from '../types';
import { getCanonicalContractKey } from '../services/api';
import { ataTemFornecedorConhecido, contratoDoFornecedorDaAta } from './fornecedorMatch';
import {
  contractMatchesCompra,
  type ContractSuggestionCriteria
} from '../components/modals/linkContractSuggestions';

/** De onde a sugestão veio. Uma mesma sugestão pode ter as duas origens. */
export type ItemContractSuggestionSource = 'pncp' | 'catalogo';

export interface ItemContractSuggestion {
  /**
   * Chave gravada em arp_item_contract_links.contract_key ao vincular. Quando `linkable` é falso é só
   * um identificador estável para descartar a sugestão (prefixo "PNCP:"), nunca uma chave de contrato.
   */
  contractKey: string;
  /** Falso quando a API não informa a UASG do contrato: dá para ver e descartar, não para vincular. */
  linkable: boolean;
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
  /**
   * contract_key que nunca são sugeridos: já vinculados a outra ata (um contrato pertence a uma só ata) ou
   * marcados pelo coordenador como "não pertence a ata".
   */
  excludedContractKeys?: string[];
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
  if (uasg.length !== 6 || !numeroAno) return '';
  const [numero, ano] = numeroAno.split('/');
  return numero && ano ? `${uasg}-${numero}-${ano}` : '';
}

/** Identificador estável (não vinculável) de um contrato do PNCP sem UASG válida. */
function unlinkableKeyFromPncp(pncp: PncpContract): string {
  const controle = (pncp.numeroControlePncp || '').trim();
  if (controle) return `PNCP:${controle}`;
  const numeroAno = numeroAnoKey(pncp.numeroContrato, pncp.anoContrato, pncp.numeroControlePncp);
  return numeroAno ? `PNCP:${numeroAno}` : '';
}

/** Chave de vínculo (e registro do catálogo, se houver) de um contrato do PNCP/Compras.gov. */
export function resolvePncpContract(
  pncp: PncpContract,
  official: ContractDashboardRecord[]
): { key: string; match?: ContractDashboardRecord } {
  const match = findOfficialMatch(pncp, official);
  return { key: match ? contractKeyOf(match) : fallbackKeyFromPncp(pncp), match };
}

const quantidadeDoPncp = (pncp: PncpContract): number | undefined =>
  typeof pncp.quantidadeContratada === 'number' && pncp.quantidadeContratada > 0 ? pncp.quantidadeContratada : undefined;

/**
 * Quantidade do item em cada contrato, como informada pela API oficial, por chave de
 * contrato em maiúsculas. A quantidade não é gravada no vínculo: é lida daqui.
 */
export function quantidadesPorContrato(
  pncpContracts: PncpContract[] | undefined,
  officialContracts: ContractDashboardRecord[] | undefined
): Map<string, number> {
  const map = new Map<string, number>();
  for (const pncp of pncpContracts || []) {
    const qtd = quantidadeDoPncp(pncp);
    if (qtd === undefined) continue;
    const { key } = resolvePncpContract(pncp, officialContracts || []);
    if (key) map.set(norm(key), qtd);
  }
  return map;
}

/**
 * Sugestão de contrato de um item contra o catálogo: a compra da Ata tem que
 * casar e, se o fornecedor do item for conhecido, o CNPJ também (o item tem um
 * único fornecedor; contratos da mesma compra de outro fornecedor são de outros itens).
 */
function catalogMatchesItem(contract: ContractDashboardRecord, criteria?: ContractSuggestionCriteria): boolean {
  if (!criteria?.compra || !contractMatchesCompra(contract, criteria.compra)) return false;

  const fornecedores = { cnpjs: criteria.fornecedorCnpjs, nomes: criteria.fornecedorNomes };
  if (!ataTemFornecedorConhecido(fornecedores)) return true;
  return contratoDoFornecedorDaAta({ cnpj: contract.fornecedorCnpjCpf, nome: contract.fornecedorNome }, fornecedores);
}

/**
 * Reúne o que antes era "contratos automáticos" (PNCP/Compras.gov) e a sugestão
 * da Ata numa única lista de sugestões por item, sem os já vinculados.
 */
export function buildItemContractSuggestions(input: ItemContractSuggestionInput): ItemContractSuggestionResult {
  const official = input.officialContracts || [];
  const linked = new Set((input.linkedContractKeys || []).map(norm));
  const dismissedKeys = new Set((input.dismissedContractKeys || []).map(norm));
  const excluded = new Set((input.excludedContractKeys || []).map(norm));

  const byKey = new Map<string, ItemContractSuggestion>();

  const add = (
    key: string,
    source: ItemContractSuggestionSource,
    patch: Partial<ItemContractSuggestion>,
    linkable = true
  ) => {
    if (!key) return;
    const id = norm(key);
    const existing = byKey.get(id);
    if (!existing) {
      byKey.set(id, { contractKey: key, linkable, sources: [source], ...patch });
      return;
    }
    if (!existing.sources.includes(source)) existing.sources.push(source);
    existing.contract = existing.contract || patch.contract;
    existing.pncp = existing.pncp || patch.pncp;
    existing.quantidadeContratada = existing.quantidadeContratada ?? patch.quantidadeContratada;
  };

  for (const pncp of input.pncpContracts || []) {
    const { key, match } = resolvePncpContract(pncp, official);
    if (key) {
      add(key, 'pncp', { contract: match, pncp, quantidadeContratada: quantidadeDoPncp(pncp) });
    } else {
      add(unlinkableKeyFromPncp(pncp), 'pncp', { pncp, quantidadeContratada: quantidadeDoPncp(pncp) }, false);
    }
  }

  for (const contract of official) {
    if (catalogMatchesItem(contract, input.criteria)) {
      add(contractKeyOf(contract), 'catalogo', { contract });
    }
  }

  const suggestions: ItemContractSuggestion[] = [];
  const dismissed: ItemContractSuggestion[] = [];
  for (const [id, suggestion] of byKey) {
    if (linked.has(id) || excluded.has(id)) continue;
    (dismissedKeys.has(id) ? dismissed : suggestions).push(suggestion);
  }

  return { suggestions, dismissed };
}

/** Critérios de sugestão de um item: compra da Ata e fornecedor do próprio item. */
export function buildItemSuggestionCriteria(
  arp: { idCompra?: string; codigoUnidadeGerenciadora?: string; numeroCompra?: string; anoCompra?: string },
  item: { niFornecedor?: string; nomeRazaoSocialFornecedor?: string }
): ContractSuggestionCriteria {
  return {
    compra: {
      idCompra: arp.idCompra,
      uasg: arp.codigoUnidadeGerenciadora,
      numeroCompra: arp.numeroCompra,
      anoCompra: arp.anoCompra
    },
    fornecedorCnpjs: item.niFornecedor ? [item.niFornecedor] : [],
    fornecedorNomes: item.nomeRazaoSocialFornecedor ? [item.nomeRazaoSocialFornecedor] : []
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
