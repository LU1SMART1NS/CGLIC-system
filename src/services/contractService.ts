import type { ContractDashboardRecord, ContractFilterParams, ContractDashboardKPIs, StatusVigenciaContrato, ContractDetailItem, ContractDetailEmpenho } from '../types';
import { formatNumeroAnoContrato, fetchContratosGovData, fetchContratosGovEmpenhos, fetchContratoItensComprasGov, splitDateRange } from './api';
import { resolveContractKey } from '../utils/contractKeyUtils';
import { parseDateBRT, differenceInDays } from './temporalEngineService';
import { codigoOrgaoDaUasg } from '../config/unidadesGestoras';
import { VIGENCIA_RULES } from '../config/alertRules';
import { STATUS_A_VENCER } from '../utils/statusVigencia';

const BASE_URL = '/api-arp/modulo-contratos';
const CONTRATOS_CACHE = new Map<string, { timestamp: number; data: ContractDashboardRecord[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos de cache

/**
 * Limite de espera da lista da UG no Contratos.gov.br. É a única fonte com todos os contratos
 * (inclusive vigentes iniciados há mais de 3 anos) e leva ~20s para a UASG 200331: com um limite
 * menor a lista saía incompleta sem aviso.
 */
export const CONTRATOS_GOV_TIMEOUT_MS = 45000;
const COMPRAS_GOV_TIMEOUT_MS = 8000;

/** Carregamentos em andamento por UASG: telas que pedem a mesma lista ao mesmo tempo dividem uma só consulta. */
const CONTRATOS_INFLIGHT = new Map<string, Promise<ContractDashboardRecord[]>>();

/**
 * Última lista COMPLETA conhecida por UASG. Se uma consulta seguinte sair incompleta (fonte fora do ar),
 * ela é somada a esta lista em vez de substituí-la: a carteira não encolhe por uma falha momentânea.
 */
const CONTRATOS_ULTIMA_COMPLETA = new Map<string, ContractDashboardRecord[]>();

/**
 * UASGs cuja última consulta saiu incompleta (alguma fonte falhou). Resultado incompleto não vai
 * para o cache, e as telas podem avisar e tentar de novo (ver useContractsDashboard).
 */
const CONTRATOS_PARCIAIS = new Map<string, boolean>();
const parciaisListeners = new Set<() => void>();

function setContractsPartial(uasg: string, partial: boolean): void {
  if ((CONTRATOS_PARCIAIS.get(uasg) ?? false) === partial) return;
  CONTRATOS_PARCIAIS.set(uasg, partial);
  parciaisListeners.forEach((listener) => listener());
}

/** A última consulta de contratos da UASG ficou incompleta (alguma fonte não respondeu). */
export function isContractsListPartial(uasg: string): boolean {
  return CONTRATOS_PARCIAIS.get(uasg.trim()) ?? false;
}

/** Assina mudanças no estado "lista incompleta" (para useSyncExternalStore). */
export function subscribeContractsPartial(listener: () => void): () => void {
  parciaisListeners.add(listener);
  return () => {
    parciaisListeners.delete(listener);
  };
}

/**
 * Limpa o cache em memória de contratos para forçar recarregamento imediato
 */
export function clearContractsCache(uasg?: string): void {
  if (uasg) {
    CONTRATOS_CACHE.delete(`contracts_${uasg.trim()}`);
    CONTRATOS_INFLIGHT.delete(`contracts_${uasg.trim()}`);
  } else {
    CONTRATOS_CACHE.clear();
    CONTRATOS_INFLIGHT.clear();
    CONTRATOS_ULTIMA_COMPLETA.clear();
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

/**
 * Calcula o status de vigência com base na data final de vigência utilizando o motor temporal centralizado
 */
export function calculateStatusVigencia(dataFim?: string): StatusVigenciaContrato {
  if (!dataFim) return 'Não Informado';
  const target = parseDateBRT(dataFim);
  if (!target) return 'Não Informado';

  const diffDays = differenceInDays(target);
  if (diffDays < 0) {
    return 'Expirado';
  } else if (diffDays <= VIGENCIA_RULES.aVencerAteDias) {
    return STATUS_A_VENCER;
  } else {
    return 'Vigente';
  }
}

function parseMoney(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).trim();
  if (str.includes(',')) {
    const clean = str.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * idCompra oficial (17 dígitos: UASG da compra 6 + modalidade 2 + número 5 + ano 4) a partir dos campos do
 * Contratos.gov.br (`unidade_compra`, `codigo_modalidade`, `licitacao_numero`). O Compras.gov.br, que traz o
 * idCompra pronto, demora a publicar os contratos novos: sem esta derivação eles ficavam sem compra e a Central
 * não reconhecia a ata de origem. Devolve undefined quando algum campo falta ou não tem o formato esperado.
 */
export function deriveIdCompraContratosGov(c: any): string | undefined {
  const uasgCompra = String(c?.unidade_compra ?? '').replace(/\D/g, '');
  const modalidade = String(c?.codigo_modalidade ?? '').replace(/\D/g, '');
  const licitacao = String(c?.licitacao_numero ?? '').trim();
  if (uasgCompra.length !== 6 || !modalidade || modalidade.length > 2 || !licitacao) return undefined;

  let numero: string;
  let ano: string;
  const partes = licitacao.split('/');
  if (partes.length === 2) {
    numero = partes[0].replace(/\D/g, '');
    ano = partes[1].replace(/\D/g, '');
  } else {
    const d = licitacao.replace(/\D/g, '');
    if (d.length !== 9) return undefined;
    numero = d.slice(0, 5);
    ano = d.slice(5);
  }
  if (!numero || numero.length > 5 || !/^(19|20)\d{2}$/.test(ano)) return undefined;
  return `${uasgCompra}${modalidade.padStart(2, '0')}${numero.padStart(5, '0')}${ano}`;
}

/**
 * Monta o registro do painel a partir de um contrato do Contratos.gov.br, venha ele da lista da UG
 * ou da consulta por número. Devolve null quando o número não permite derivar a identidade.
 */
export function mapContratosGovRecord(c: any, uasgPadrao: string): ContractDashboardRecord | null {
  const orgao = codigoOrgaoDaUasg(uasgPadrao);
  const numRaw = c.numero ? String(c.numero).trim() : '';
  const ugCodigo = c.unidade_gestora || c.contratante?.orgao?.unidade_gestora?.codigo || c.contratante?.orgao_origem?.unidade_gestora_origem?.codigo || uasgPadrao;

  const keyResolution = resolveContractKey(ugCodigo, numRaw, c.data_assinatura || c.vigencia_inicio);
  if (keyResolution.tipo === 'INVALIDO') {
    console.warn(`[contractService] Contrato descartado: número "${numRaw}" não permitiu derivar identidade (sem "/" reconhecível e sem data de fallback).`);
    return null;
  }
  const canKey = keyResolution.key;
  const anoRaw = keyResolution.ano;

  const dataFim = c.vigencia_fim || c.dataVigenciaFinal;
  const status = calculateStatusVigencia(dataFim);

  const ugNome = c.unidade_gestora_nome || c.contratante?.orgao?.unidade_gestora?.nome || c.contratante?.orgao_origem?.unidade_gestora_origem?.nome || c.contratante?.unidade_origem?.nome;
  const orgaoNome = c.contratante?.orgao?.nome || c.contratante?.orgao_origem?.nome;

  const record: ContractDashboardRecord = {
    id: canKey,
    numero: numRaw,
    ano: anoRaw,
    numeroFormatado: formatNumeroAnoContrato(numRaw, anoRaw) || `${numRaw}/${anoRaw}`,
    uasg: String(ugCodigo),
    nomeUnidadeGestora: ugNome,
    codigoOrgao: c.orgao || orgao,
    nomeOrgao: orgaoNome,
    objeto: c.objeto || '',
    processo: c.processo || c.licitacao_numero,
    fornecedorNome: c.fornecedor?.nome || c.nomeRazaoSocialFornecedor,
    fornecedorCnpjCpf: c.fornecedor?.cnpj_cpf_idgener || c.niFornecedor,
    // Compra de origem já no Contratos.gov.br; o Compras.gov.br só completa quando ela não pôde ser derivada.
    idCompra: deriveIdCompraContratosGov(c),
    valorGlobal: parseMoney(c.valor_global || c.valor_inicial),
    valorInicial: parseMoney(c.valor_inicial),
    dataAssinatura: c.data_assinatura,
    dataVigenciaInicio: c.vigencia_inicio || c.dataVigenciaInicial,
    dataVigenciaFim: dataFim,
    statusVigencia: status,
    numeroControlePncp: c.numeroControlePncp || c.numeroControlePncpContrato,
    contratoId: c.id || c.contrato_id,
    fonteDados: 'Contratos.gov.br',
    sourceSystem: 'Contratos.gov.br',
    sourceRecordId: c.id || c.contrato_id || canKey,
    sourceUpdatedAt: c.data_assinatura || c.vigencia_inicio,
    lastSyncedAt: new Date().toISOString(),
    origem: 'API',
    raw: c
  };
  return record;
}

/**
 * Lista da UG no Contratos.gov.br (fonte completa). `ok = false` quando não respondeu a tempo,
 * respondeu erro ou não devolveu JSON: a lista fica incompleta.
 */
async function fetchContratosGovList(uasg: string): Promise<{ list: any[]; ok: boolean }> {
  try {
    const res = await fetchWithTimeout(`/api-contratos-gov/api/contrato/ug/${uasg}`, CONTRATOS_GOV_TIMEOUT_MS);
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const list = await res.json();
      if (Array.isArray(list)) return { list, ok: true };
      console.warn(`[contractService] Contratos.gov.br retornou formato inesperado para a UG ${uasg}.`);
      return { list: [], ok: false };
    }
    console.warn(`[contractService] Contratos.gov.br indisponível para a UG ${uasg} (status ${res.status}, tipo ${contentType || 'desconhecido'}).`);
    return { list: [], ok: false };
  } catch (err) {
    console.warn(`[contractService] Falha ao consultar Contratos.gov.br para UG ${uasg}:`, err);
    return { list: [], ok: false };
  }
}

/**
 * Contratos do Compras.gov.br Dados Abertos (módulo-contratos) iniciados nos últimos 3 anos.
 * `ok = false` quando alguma página falhou: o que veio até ali é devolvido, mas a lista fica incompleta.
 */
async function fetchComprasGovList(uasg: string): Promise<{ list: any[]; ok: boolean }> {
  const list: any[] = [];
  let ok = true;
  const orgao = codigoOrgaoDaUasg(uasg);
  try {
    const anoAtual = new Date().getFullYear();
    const dateChunks = splitDateRange(`${anoAtual - 2}-01-01`, `${anoAtual}-12-31`);
    const maxPages = 5;

    for (const chunk of dateChunks) {
      let pagina = 1;
      let hasNext = true;

      while (hasNext && pagina <= maxPages) {
        const url = `${BASE_URL}/1_consultarContratos?pagina=${pagina}&tamanhoPagina=500${orgao ? `&codigoOrgao=${orgao}` : ''}&codigoUnidadeGestora=${uasg}&dataVigenciaInicialMin=${chunk.start}&dataVigenciaInicialMax=${chunk.end}`;
        const res = await fetchWithTimeout(url, COMPRAS_GOV_TIMEOUT_MS).catch(() => null);
        if (!res || !res.ok) {
          ok = false;
          break;
        }

        const data = await res.json().catch(() => null);
        if (!data) {
          ok = false;
          break;
        }
        const page = data.resultado || [];
        if (!Array.isArray(page) || page.length === 0) break;
        list.push(...page);

        if (data.paginasRestantes && data.paginasRestantes > 0) {
          pagina++;
        } else {
          hasNext = false;
        }
      }
    }
  } catch (err) {
    console.warn(`[contractService] Falha ao consultar Compras.gov.br módulo-contratos para UG ${uasg}:`, err);
    ok = false;
  }
  return { list, ok };
}

/** Compras.gov.br: completa o registro vindo do Contratos.gov.br ou cria o contrato que só existe nele. */
function mergeComprasGovRecord(contractsMap: Map<string, ContractDashboardRecord>, c: any, uasg: string): void {
  const orgao = codigoOrgaoDaUasg(uasg);
  const numRaw = c.numeroContrato ? String(c.numeroContrato).trim() : '';

  const keyResolution = resolveContractKey(c.codigoUnidadeGestora || uasg, numRaw, c.dataVigenciaInicial);
  if (keyResolution.tipo === 'INVALIDO') {
    return;
  }
  const canKey = keyResolution.key;
  const anoRaw = keyResolution.ano;

  const dataFim = c.dataVigenciaFinal || c.vigencia_fim;
  const status = calculateStatusVigencia(dataFim);

  const existing = contractsMap.get(canKey);
  if (existing) {
    if (!existing.numeroControlePncp && c.numeroControlePncpContrato) {
      existing.numeroControlePncp = c.numeroControlePncpContrato;
    }
    if (!existing.idCompra && c.idCompra) {
      existing.idCompra = c.idCompra;
    }
    if (!existing.modalidadeCompra && c.modalidadeCompra) {
      existing.modalidadeCompra = c.modalidadeCompra;
    }
    if (!existing.nomeUnidadeGestora && c.nomeUnidadeGestora) {
      existing.nomeUnidadeGestora = c.nomeUnidadeGestora;
    }
    if (!existing.nomeOrgao && c.nomeOrgao) {
      existing.nomeOrgao = c.nomeOrgao;
    }
    if (!existing.processo && c.processo) {
      existing.processo = c.processo;
    }
    if (!existing.valorGlobal && c.valorGlobal) {
      existing.valorGlobal = typeof c.valorGlobal === 'number' ? c.valorGlobal : parseFloat(c.valorGlobal || '0');
    }
  } else {
    const record: ContractDashboardRecord = {
      id: canKey,
      numero: numRaw,
      ano: anoRaw,
      numeroFormatado: formatNumeroAnoContrato(numRaw, anoRaw) || `${numRaw}/${anoRaw}`,
      uasg: String(c.codigoUnidadeGestora || uasg),
      nomeUnidadeGestora: c.nomeUnidadeGestora,
      codigoOrgao: c.codigoOrgao || orgao,
      nomeOrgao: c.nomeOrgao,
      objeto: c.objeto || '',
      processo: c.processo,
      fornecedorNome: c.nomeRazaoSocialFornecedor,
      fornecedorCnpjCpf: c.niFornecedor,
      valorGlobal: typeof c.valorGlobal === 'number' ? c.valorGlobal : parseFloat(c.valorGlobal || '0'),
      dataVigenciaInicio: c.dataVigenciaInicial,
      dataVigenciaFim: dataFim,
      statusVigencia: status,
      numeroControlePncp: c.numeroControlePncpContrato,
      idCompra: c.idCompra,
      modalidadeCompra: c.modalidadeCompra,
      fonteDados: 'Compras.gov.br',
      sourceSystem: 'Compras.gov.br',
      sourceRecordId: c.numeroControlePncpContrato || canKey,
      sourceUpdatedAt: c.dataHoraAtualizacao || c.dataHoraInclusao || c.dataVigenciaInicial,
      lastSyncedAt: new Date().toISOString(),
      origem: 'API',
      raw: c
    };
    contractsMap.set(canKey, record);
  }
}

/** Ordem da carteira: ano mais recente primeiro e, no mesmo ano, número maior primeiro. */
export function ordenarContratos(contracts: ContractDashboardRecord[]): ContractDashboardRecord[] {
  return contracts.sort((a, b) => {
    const anoA = parseInt(String(a.ano), 10) || 0;
    const anoB = parseInt(String(b.ano), 10) || 0;
    if (anoB !== anoA) return anoB - anoA;
    const numA = parseInt(a.numero.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.numero.replace(/\D/g, ''), 10) || 0;
    return numB - numA;
  });
}

export const FONTE_CONTRATOS_GOV = 'Contratos.gov.br';
export const FONTE_COMPRAS_GOV = 'Compras.gov.br';

interface RespostaFontes {
  contratosGov: { list: any[]; ok: boolean };
  comprasGov: { list: any[]; ok: boolean };
}

/** Consulta as duas fontes oficiais ao mesmo tempo: a espera é a da fonte mais lenta, não a soma. */
async function consultarFontes(cleanUasg: string): Promise<RespostaFontes> {
  const [contratosGov, comprasGov] = await Promise.all([
    fetchContratosGovList(cleanUasg),
    fetchComprasGovList(cleanUasg)
  ]);
  return { contratosGov, comprasGov };
}

/**
 * Junta as respostas das fontes sobre uma base de contratos já conhecidos. O Contratos.gov.br
 * substitui o registro; o Compras.gov.br só completa campos vazios e acrescenta o que só existe nele.
 */
function montarContratos(
  resposta: RespostaFontes,
  cleanUasg: string,
  base: ContractDashboardRecord[]
): { contracts: ContractDashboardRecord[]; fontesComFalha: string[] } {
  const contractsMap = new Map<string, ContractDashboardRecord>();
  for (const record of base) contractsMap.set(record.id, { ...record });
  for (const c of resposta.contratosGov.list) {
    const record = mapContratosGovRecord(c, cleanUasg);
    if (record) contractsMap.set(record.id, record);
  }
  for (const c of resposta.comprasGov.list) {
    mergeComprasGovRecord(contractsMap, c, cleanUasg);
  }

  // Contratos manuais (tabela contratos_manuais) deixaram de ser carregados: o cadastro manual
  // foi retirado e o resíduo aparecia como "Vigente" sem data de fim, divergindo das carteiras.

  const fontesComFalha = [
    ...(resposta.contratosGov.ok ? [] : [FONTE_CONTRATOS_GOV]),
    ...(resposta.comprasGov.ok ? [] : [FONTE_COMPRAS_GOV])
  ];
  return { contracts: ordenarContratos(Array.from(contractsMap.values())), fontesComFalha };
}

/**
 * Contratos da UASG direto das fontes oficiais, sem cache. `fontesComFalha` lista as fontes que não
 * responderam. `base`: contratos já conhecidos (por exemplo, os do banco); o que as fontes trazem
 * atualiza a base, e uma fonte fora do ar não apaga nem empobrece o que já se sabia.
 * Usada pela sincronização com o banco (contratosOficiaisService).
 */
export async function buscarContratosNasFontes(
  uasg: string,
  base: ContractDashboardRecord[] = []
): Promise<{ contracts: ContractDashboardRecord[]; fontesComFalha: string[] }> {
  const cleanUasg = (uasg || '').trim();
  return montarContratos(await consultarFontes(cleanUasg), cleanUasg, base);
}

async function loadContractsForDashboard(cleanUasg: string, cacheKey: string): Promise<ContractDashboardRecord[]> {
  const resposta = await consultarFontes(cleanUasg);
  const partial = !resposta.contratosGov.ok || !resposta.comprasGov.ok;

  // Lista incompleta: parte do que já se sabia (última lista completa), para não encolher a carteira.
  const base = partial ? CONTRATOS_ULTIMA_COMPLETA.get(cleanUasg) ?? [] : [];
  const result = montarContratos(resposta, cleanUasg, base).contracts;

  // Só grava no cache a lista completa: uma lista incompleta ficaria 5 minutos valendo como se fosse a carteira inteira.
  setContractsPartial(cleanUasg, partial);
  if (!partial && result.length > 0) {
    CONTRATOS_CACHE.set(cacheKey, { timestamp: Date.now(), data: result });
    CONTRATOS_ULTIMA_COMPLETA.set(cleanUasg, result);
  }

  return result;
}

/**
 * Busca contratos para o Dashboard unificando Compras.gov.br e Contratos.gov.br
 */
export async function fetchContractsForDashboard(
  uasg: string = '200331',
  forceRefresh: boolean = false
): Promise<ContractDashboardRecord[]> {
  const cleanUasg = (uasg || '200331').trim();
  const cacheKey = `contracts_${cleanUasg}`;

  if (forceRefresh) {
    CONTRATOS_CACHE.delete(cacheKey);
  } else {
    const cached = CONTRATOS_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    const inflight = CONTRATOS_INFLIGHT.get(cacheKey);
    if (inflight) return inflight;
  }

  const promise = loadContractsForDashboard(cleanUasg, cacheKey).finally(() => {
    if (CONTRATOS_INFLIGHT.get(cacheKey) === promise) CONTRATOS_INFLIGHT.delete(cacheKey);
  });
  CONTRATOS_INFLIGHT.set(cacheKey, promise);
  return promise;
}

/**
 * Calcula os KPIs do painel de contratos
 */
export function calculateContractKPIs(contracts: ContractDashboardRecord[]): ContractDashboardKPIs {
  const fornecedoresSet = new Set<string>();
  let valorTotalGlobal = 0;
  let vigentes = 0;
  let expirados = 0;
  let aVencer = 0;

  for (const c of contracts) {
    if (c.fornecedorCnpjCpf || c.fornecedorNome) {
      fornecedoresSet.add(c.fornecedorCnpjCpf || c.fornecedorNome!);
    }
    if (typeof c.valorGlobal === 'number' && !isNaN(c.valorGlobal)) {
      valorTotalGlobal += c.valorGlobal;
    }
    if (c.statusVigencia === 'Vigente') {
      vigentes++;
    } else if (c.statusVigencia === 'Expirado') {
      expirados++;
    } else if (c.statusVigencia === STATUS_A_VENCER) {
      aVencer++;
    }
  }

  return {
    totalContratos: contracts.length,
    contratosVigentes: vigentes,
    contratosExpirados: expirados,
    contratosAVencer: aVencer,
    totalFornecedores: fornecedoresSet.size,
    valorTotalGlobal
  };
}

/**
 * Aplica os filtros aos contratos carregados
 */
export function filterContracts(
  contracts: ContractDashboardRecord[],
  filters: ContractFilterParams
): ContractDashboardRecord[] {
  return contracts.filter(c => {
    // 1. Filtro por UASG
    if (filters.uasg && filters.uasg.trim()) {
      if (c.uasg !== filters.uasg.trim()) return false;
    }

    // 2. Filtro por Número / Ano
    if (filters.numeroAno && filters.numeroAno.trim()) {
      const q = filters.numeroAno.trim().toLowerCase();
      const numMatch = c.numero.toLowerCase().includes(q);
      const numFmtMatch = c.numeroFormatado.toLowerCase().includes(q);
      const anoMatch = String(c.ano).includes(q);
      if (!numMatch && !numFmtMatch && !anoMatch) return false;
    }

    // 3. Filtro por Ano específico
    if (filters.anoContrato && filters.anoContrato.trim()) {
      if (String(c.ano) !== filters.anoContrato.trim()) return false;
    }

    // 4. Filtro por Fornecedor (Nome ou CNPJ)
    if (filters.fornecedor && filters.fornecedor.trim()) {
      const q = filters.fornecedor.trim().toLowerCase();
      const nomeMatch = c.fornecedorNome ? c.fornecedorNome.toLowerCase().includes(q) : false;
      const cnpjMatch = c.fornecedorCnpjCpf ? c.fornecedorCnpjCpf.toLowerCase().includes(q) : false;
      if (!nomeMatch && !cnpjMatch) return false;
    }

    // 5. Filtro por Status de Vigência
    if (filters.statusVigencia && filters.statusVigencia !== 'todos') {
      if (filters.statusVigencia === 'vigente' && c.statusVigencia !== 'Vigente' && c.statusVigencia !== STATUS_A_VENCER) {
        return false;
      }
      if (filters.statusVigencia === 'expirado' && c.statusVigencia !== 'Expirado') {
        return false;
      }
      if (filters.statusVigencia === 'a_vencer' && c.statusVigencia !== STATUS_A_VENCER) {
        return false;
      }
    }

    // 6. Filtro por Data de Vigência Início / Fim
    if (filters.dataVigenciaMin && c.dataVigenciaFim) {
      if (c.dataVigenciaFim < filters.dataVigenciaMin) return false;
    }
    if (filters.dataVigenciaMax && c.dataVigenciaInicio) {
      if (c.dataVigenciaInicio > filters.dataVigenciaMax) return false;
    }

    return true;
  });
}

/**
 * Carrega itens e empenhos detalhados de um contrato sob demanda
 */
export async function fetchContractDetails(contract: ContractDashboardRecord): Promise<{ items: ContractDetailItem[]; empenhos: ContractDetailEmpenho[] }> {
  let items: ContractDetailItem[] = [];
  let empenhos: ContractDetailEmpenho[] = [];

  // Se tem contratoId ou dados para Contratos.gov.br
  try {
    const govData = await fetchContratosGovData(contract.uasg, contract.numero, contract.ano);
    if (govData.items && govData.items.length > 0) {
      items = govData.items;
    }
    const contratoId = govData.contratoId || contract.contratoId;
    if (contratoId) {
      empenhos = await fetchContratosGovEmpenhos(contratoId);
    }
  } catch (err) {
    console.warn('[contractService] Erro ao carregar detalhes Contratos.gov:', err);
  }

  // Se não encontrou itens e tem numeroControlePncp, busca no compras.gov.br
  if (items.length === 0 && contract.numeroControlePncp) {
    try {
      items = await fetchContratoItensComprasGov(contract.numeroControlePncp);
    } catch (err) {
      console.warn('[contractService] Erro ao carregar itens compras.gov:', err);
    }
  }

  return { items, empenhos };
}

export interface MergedContractRecord extends ContractDashboardRecord {
  gestorNome?: string;
  gestorUpdatedAt?: string;
  hasTaskPlan?: boolean;
  observacoesInternas?: string;
}

/**
 * Regra Arquitetural Fundamental — Sincronização Não-Destrutiva:
 * Unifica dados oficiais obtidos de APIs (Compras.gov / Contratos.gov / PNCP) com
 * informações operacionais internas cadastradas no CGLIC (gestor, tarefas, observações),
 * garantindo que atualizações oficiais NUNCA sobrescrevam ou apaguem dados gerenciais da equipe.
 */
export function mergeOfficialAndInternalContractData(
  officialRecord: ContractDashboardRecord,
  internalManager?: { gestorNome: string; updatedAt: string } | null,
  internalPlan?: { id?: string; progresso?: any } | null,
  internalMeta?: { observacoes?: string } | null
): MergedContractRecord {
  return {
    ...officialRecord,
    gestorNome: internalManager?.gestorNome,
    gestorUpdatedAt: internalManager?.updatedAt,
    hasTaskPlan: !!internalPlan,
    observacoesInternas: internalMeta?.observacoes
  };
}

