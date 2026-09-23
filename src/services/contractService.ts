import type { ContractDashboardRecord, ContractFilterParams, ContractDashboardKPIs, StatusVigenciaContrato, ContractDetailItem, ContractDetailEmpenho } from '../types';
import { formatNumeroAnoContrato, fetchContratosGovData, fetchContratosGovEmpenhos, fetchContratoItensComprasGov, splitDateRange } from './api';
import { resolveContractKey } from '../utils/contractKeyUtils';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { parseDateBRT, differenceInDays } from './temporalEngineService';

const BASE_URL = '/api-arp/modulo-contratos';
const CONTRATOS_CACHE = new Map<string, { timestamp: number; data: ContractDashboardRecord[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos de cache

/**
 * Limpa o cache em memória de contratos para forçar recarregamento imediato
 */
export function clearContractsCache(uasg?: string): void {
  if (uasg) {
    CONTRATOS_CACHE.delete(`contracts_${uasg.trim()}`);
  } else {
    CONTRATOS_CACHE.clear();
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
  } else if (diffDays <= 60) {
    return 'A Vencer (60d)';
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
  } else if (CONTRATOS_CACHE.has(cacheKey)) {
    const cached = CONTRATOS_CACHE.get(cacheKey)!;
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const contractsMap = new Map<string, ContractDashboardRecord>();
  const orgao = (cleanUasg === '200331' || cleanUasg === '200330') ? '30911' : '';

  // 1. Tentar buscar da API Contratos.gov.br (diretamente pela UG)
  try {
    const res = await fetchWithTimeout(`/api-contratos-gov/api/contrato/ug/${cleanUasg}`, 12000);
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const list = await res.json();
      if (Array.isArray(list)) {
        for (const c of list) {
          const numRaw = c.numero ? String(c.numero).trim() : '';
          const ugCodigo = c.unidade_gestora || c.contratante?.orgao?.unidade_gestora?.codigo || c.contratante?.orgao_origem?.unidade_gestora_origem?.codigo || cleanUasg;

          const keyResolution = resolveContractKey(ugCodigo, numRaw, c.data_assinatura || c.vigencia_inicio);
          if (keyResolution.tipo === 'INVALIDO') {
            console.warn(`[contractService] Contrato descartado: número "${numRaw}" não permitiu derivar identidade (sem "/" reconhecível e sem data de fallback).`);
            continue;
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

          contractsMap.set(canKey, record);
        }
      }
    } else if (res.ok) {
      console.warn(`[contractService] API /api-contratos-gov retornou tipo não-JSON (${contentType}).`);
    }
  } catch (err) {
    console.warn(`[contractService] Falha ao consultar Contratos.gov.br para UG ${cleanUasg}:`, err);
  }

  // 2. Buscar também no Compras.gov.br Dados Abertos (módulo-contratos)
  try {
    const anoAtual = new Date().getFullYear();
    const dateChunks = splitDateRange(`${anoAtual - 2}-01-01`, `${anoAtual}-12-31`);
    const maxPages = 5;

    for (const chunk of dateChunks) {
      let pagina = 1;
      let hasNext = true;

      while (hasNext && pagina <= maxPages) {
        const url = `${BASE_URL}/1_consultarContratos?pagina=${pagina}&tamanhoPagina=500${orgao ? `&codigoOrgao=${orgao}` : ''}&codigoUnidadeGestora=${cleanUasg}&dataVigenciaInicialMin=${chunk.start}&dataVigenciaInicialMax=${chunk.end}`;
        const res = await fetchWithTimeout(url, 8000).catch(() => null);
        if (!res || !res.ok) break;

        const data = await res.json().catch(() => null);
        if (!data) break;
        const list = data.resultado || [];
        if (!Array.isArray(list) || list.length === 0) break;

        for (const c of list) {
          const numRaw = c.numeroContrato ? String(c.numeroContrato).trim() : '';

          const keyResolution = resolveContractKey(c.codigoUnidadeGestora || cleanUasg, numRaw, c.dataVigenciaInicial);
          if (keyResolution.tipo === 'INVALIDO') {
            continue;
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
              uasg: String(c.codigoUnidadeGestora || cleanUasg),
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

        if (data.paginasRestantes && data.paginasRestantes > 0) {
          pagina++;
        } else {
          hasNext = false;
        }
      }
    }
  } catch (err) {
    console.warn(`[contractService] Falha ao consultar Compras.gov.br módulo-contratos para UG ${cleanUasg}:`, err);
  }

  // 3. Fallback e consolidação com contratos manuais registrados no Supabase
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: manualList, error: manualErr } = await supabase
        .from('contratos_manuais')
        .select('*');

      if (!manualErr && Array.isArray(manualList)) {
        for (const m of manualList) {
          const mUasg = String(m.uasg || '').trim();
          const matchesUasg = !cleanUasg || mUasg === cleanUasg || (m.item_key && m.item_key.includes(`-${cleanUasg}-`));
          if (!matchesUasg) continue;

          const numRaw = m.numero ? String(m.numero).trim() : '';
          const anoRaw = m.ano ? String(m.ano).trim() : '2025';
          const keyResolution = resolveContractKey(m.uasg || cleanUasg, numRaw, anoRaw);
          const canKey = keyResolution.tipo !== 'INVALIDO' ? keyResolution.key : `${m.uasg || cleanUasg}-${numRaw}-${anoRaw}`;

          const existing = contractsMap.get(canKey);
          if (!existing) {
            const record: ContractDashboardRecord = {
              id: canKey,
              numero: numRaw,
              ano: anoRaw,
              numeroFormatado: formatNumeroAnoContrato(numRaw, anoRaw) || `${numRaw}/${anoRaw}`,
              uasg: String(m.uasg || cleanUasg),
              objeto: m.objeto || 'Contrato Manual SaldoARP',
              fornecedorNome: m.fornecedor || 'Fornecedor Cadastrado',
              fornecedorCnpjCpf: m.cnpj_fornecedor,
              valorGlobal: parseMoney(m.valor_total),
              valorInicial: parseMoney(m.valor_total),
              statusVigencia: 'Vigente',
              numeroControlePncp: m.numero_controle_pncp,
              fonteDados: 'Sistema SaldoARP (Manual)',
              sourceSystem: 'SaldoARP DB',
              sourceRecordId: m.id || canKey,
              sourceUpdatedAt: m.atualizado_em || m.criado_em || new Date().toISOString(),
              lastSyncedAt: new Date().toISOString(),
              origem: 'MANUAL',
              raw: m
            };
            contractsMap.set(canKey, record);
          }
        }
      }
    } catch (dbErr) {
      console.warn(`[contractService] Falha ao consultar contratos manuais do Supabase:`, dbErr);
    }
  }

  const result = Array.from(contractsMap.values());
  result.sort((a, b) => {
    const anoA = parseInt(String(a.ano), 10) || 0;
    const anoB = parseInt(String(b.ano), 10) || 0;
    if (anoB !== anoA) return anoB - anoA;
    const numA = parseInt(a.numero.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.numero.replace(/\D/g, ''), 10) || 0;
    return numB - numA;
  });

  // Apenas grava no cache se houver resultados encontrados
  if (result.length > 0) {
    CONTRATOS_CACHE.set(cacheKey, { timestamp: Date.now(), data: result });
  }

  return result;
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
    } else if (c.statusVigencia === 'A Vencer (60d)') {
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
      if (filters.statusVigencia === 'vigente' && c.statusVigencia !== 'Vigente' && c.statusVigencia !== 'A Vencer (60d)') {
        return false;
      }
      if (filters.statusVigencia === 'expirado' && c.statusVigencia !== 'Expirado') {
        return false;
      }
      if (filters.statusVigencia === 'a_vencer' && c.statusVigencia !== 'A Vencer (60d)') {
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
 * informações operacionais internas cadastradas no SaldoARP (gestor, tarefas, observações),
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

