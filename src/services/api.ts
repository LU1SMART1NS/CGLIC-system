import type { ArpResponse, ArpItemsResponse, ArpItemRecord, UnidadesItemResponse, FilterParams, ArpRecord, EmpenhosSaldoItemResponse, EmpenhoSaldoItemRecord, PncpContract, PncpContractEmpenho, AdesoesItemResponse, AdesaoItemRecord, ComprasGovContratoItemRecord, ComprasGovContratosItemResponse, ContratosGovEmpenhoRecord } from '../types';
import { cacheArpsInDb, cacheArpItemsInDb, fetchArpsFromDb } from './dbCacheService';
import { formatPncpContractUrl } from '../utils/pncpUtils';

const BASE_URL = '/api-arp/modulo-arp';

export function getSimulationMode(): boolean {
  return false;
}

export function setSimulationMode(_value: boolean) {
  // Simulation mode permanently disabled
}

/**
 * Encodes query parameters safely.
 */
function buildQueryString(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const key in params) {
    if (params[key] !== undefined && params[key] !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Splits a date range into chunks of at most 365 days to respect the Compras.gov API limit.
 */
function splitDateRange(startDateStr: string, endDateStr: string): { start: string; end: string }[] {
  const start = new Date(startDateStr + 'T00:00:00Z');
  const end = new Date(endDateStr + 'T00:00:00Z');
  const chunks: { start: string; end: string }[] = [];
  
  let currentStart = new Date(start);
  while (currentStart <= end) {
    let currentEnd = new Date(currentStart);
    currentEnd.setUTCDate(currentEnd.getUTCDate() + 364); // 365 days inclusive (currentStart + 364 days)
    if (currentEnd > end) {
      currentEnd = new Date(end);
    }
    
    const format = (d: Date) => d.toISOString().split('T')[0];
    chunks.push({
      start: format(currentStart),
      end: format(currentEnd)
    });
    
    currentStart = new Date(currentEnd);
    currentStart.setUTCDate(currentStart.getUTCDate() + 1);
  }
  return chunks;
}

/**
 * Normaliza e compara números de Atas de Registro de Preços com robustez
 * Aceita padrões como: "41/2025", "00041/2025", "41", "00041", etc.
 */
export function matchAtaNumber(target?: string, query?: string): boolean {
  if (!query) return true;
  const cleanQuery = query.trim().toLowerCase();
  const cleanTarget = (target || '').trim().toLowerCase();
  if (!cleanQuery) return true;
  if (!cleanTarget) return false;

  // 1. Verificação direta de substring
  if (cleanTarget.includes(cleanQuery)) return true;

  // 2. Extração e comparação estruturada de número e ano (ex: 41 e 2025)
  const parseParts = (str: string) => {
    if (str.includes('/')) {
      const [n, y] = str.split('/');
      const num = parseInt(n.replace(/\D/g, ''), 10);
      const year = y.replace(/\D/g, '');
      return { num: isNaN(num) ? null : num, year: year || null };
    }
    const digits = str.replace(/\D/g, '');
    const num = parseInt(digits, 10);
    return { num: isNaN(num) ? null : num, year: null };
  };

  const qParts = parseParts(cleanQuery);
  const tParts = parseParts(cleanTarget);

  if (qParts.num !== null && tParts.num !== null) {
    if (qParts.year && tParts.year) {
      return qParts.num === tParts.num && tParts.year.includes(qParts.year);
    }
    if (!qParts.year && qParts.num === tParts.num) {
      return true;
    }
  }

  // 3. Comparação removendo zeros à esquerda
  const cleanTargetNoZeros = cleanTarget.replace(/^0+/, '');
  const cleanQueryNoZeros = cleanQuery.replace(/^0+/, '');
  return cleanTargetNoZeros.includes(cleanQueryNoZeros);
}

// Cache em memória para requisições de atas por chave de consulta (UASG + período)
const arpsMemoryCache = new Map<string, ArpRecord[]>();
const contratosGovUgListCache = new Map<string, any[]>();

/**
 * 1. Consultar ARP
 * Endereço: /modulo-arp/1_consultarARP
 */
export async function fetchArps(params: FilterParams): Promise<ArpResponse> {
  const cacheKey = `${params.codigoUnidadeGerenciadora || 'ALL'}_${params.dataVigenciaInicialMin}_${params.dataVigenciaInicialMax}`;

  try {
    let allArps: ArpRecord[] = [];

    if (arpsMemoryCache.has(cacheKey)) {
      allArps = arpsMemoryCache.get(cacheKey)!;
    } else {
      const chunks = splitDateRange(params.dataVigenciaInicialMin, params.dataVigenciaInicialMax);
      const allArpsMap = new Map<string, ArpRecord>();

      // Executa os chunks de datas em PARALELO para máxima velocidade
      const chunkPromises = chunks.map(async (chunk) => {
        let currentPage = 1;
        let hasMorePages = true;
        const chunkArps: ArpRecord[] = [];

        while (hasMorePages) {
          const queryParams = {
            pagina: currentPage,
            tamanhoPagina: 500,
            codigoUnidadeGerenciadora: params.codigoUnidadeGerenciadora,
            dataVigenciaInicialMin: chunk.start,
            dataVigenciaInicialMax: chunk.end
          };

          const url = `${BASE_URL}/1_consultarARP${buildQueryString(queryParams)}`;
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const data = await response.json() as ArpResponse;

          if (data.resultado && data.resultado.length > 0) {
            chunkArps.push(...data.resultado);
          }

          if (data.paginasRestantes && data.paginasRestantes > 0) {
            currentPage++;
          } else {
            hasMorePages = false;
          }
        }
        return chunkArps;
      });

      const chunksResults = await Promise.all(chunkPromises);
      for (const chunkArps of chunksResults) {
        for (const arp of chunkArps) {
          const key = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`;
          allArpsMap.set(key, arp);
        }
      }

      // Carregar Atas publicadas via Contratos.gov.br diretamente do PNCP
      const supplementalArps = await fetchSupplementalPncpArps(params.codigoUnidadeGerenciadora);
      for (const sArp of supplementalArps) {
        const key = `${sArp.numeroAtaRegistroPreco}-${sArp.codigoUnidadeGerenciadora}`;
        if (!allArpsMap.has(key)) {
          allArpsMap.set(key, sArp);
        }
      }

      allArps = Array.from(allArpsMap.values());
      // Enriquece com vigências oficiais do PNCP (prorrogações e cancelamentos)
      allArps = await enrichArpsBatchWithPncpVigencia(allArps);
      allArps.sort((a, b) => b.dataVigenciaFinal.localeCompare(a.dataVigenciaFinal));
      arpsMemoryCache.set(cacheKey, allArps);
      cacheArpsInDb(allArps);
    }

    // Filtrar pelo número da Ata especificado (se houver)
    const filteredList = params.numeroAtaRegistroPreco
      ? allArps.filter(arp => matchAtaNumber(arp.numeroAtaRegistroPreco, params.numeroAtaRegistroPreco))
      : allArps;

    return {
      resultado: filteredList,
      totalRegistros: filteredList.length,
      totalPaginas: 1,
      paginasRestantes: 0
    };
  } catch (error) {
    console.warn("Falha na requisição API. Consultando cache do Supabase...", error);
    const cached = await fetchArpsFromDb(params.codigoUnidadeGerenciadora, params.numeroAtaRegistroPreco);
    return {
      resultado: cached.arps,
      totalRegistros: cached.arps.length,
      totalPaginas: 1,
      paginasRestantes: 0
    };
  }
}

export interface PncpAtaVigenciaInfo {
  dataVigenciaFim?: string;
  cancelado?: boolean;
  dataCancelamento?: string | null;
  dataAtualizacao?: string;
}

const pncpVigenciaCache = new Map<string, PncpAtaVigenciaInfo>();
let supplementalPncpArpsCache: ArpRecord[] | null = null;
const pncpCompraItemsCache = new Map<string, ArpItemRecord[]>();

/**
 * Consulta a vigência oficial atualizada da Ata diretamente no PNCP com cache em memória
 * Endpoint: GET /api-pncp/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seqCompra}/atas/{seqAta}
 */
export async function fetchPncpAtaVigencia(numeroControlePncpAta?: string): Promise<PncpAtaVigenciaInfo | null> {
  if (!numeroControlePncpAta) return null;
  if (pncpVigenciaCache.has(numeroControlePncpAta)) {
    return pncpVigenciaCache.get(numeroControlePncpAta)!;
  }

  const match = numeroControlePncpAta.match(/^(\d{14})-1-(\d{6})\/(\d{4})-(\d{6})$/);
  if (!match) return null;

  const cnpj = match[1];
  const seqCompra = parseInt(match[2], 10);
  const ano = match[3];
  const seqAta = parseInt(match[4], 10);

  try {
    const url = `/api-pncp/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seqCompra}/atas/${seqAta}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const info: PncpAtaVigenciaInfo = {
        dataVigenciaFim: data.dataVigenciaFim,
        cancelado: data.cancelado,
        dataCancelamento: data.dataCancelamento,
        dataAtualizacao: data.dataAtualizacao || data.dataAtualizacaoGlobal
      };
      pncpVigenciaCache.set(numeroControlePncpAta, info);
      return info;
    }
  } catch (e) {
    console.warn(`Falha na consulta de vigência PNCP para a ata ${numeroControlePncpAta}:`, e);
  }
  return null;
}

/**
 * Enriquece o registro da Ata com os dados oficiais de vigência retornados pelo PNCP
 */
export function enrichArpWithPncpVigencia(arp: ArpRecord, pncpInfo?: PncpAtaVigenciaInfo | null): ArpRecord {
  if (!pncpInfo) return arp;
  const pncpFim = pncpInfo.dataVigenciaFim ? pncpInfo.dataVigenciaFim.split('T')[0] : '';
  const currentFim = arp.dataVigenciaFinal ? arp.dataVigenciaFinal.split('T')[0] : '';
  
  const isProrrogada = !!(pncpFim && currentFim && pncpFim > currentFim);
  const effectiveFim = isProrrogada ? pncpFim : arp.dataVigenciaFinal;

  return {
    ...arp,
    dataVigenciaFinal: effectiveFim,
    dataVigenciaFinalPncp: pncpFim || undefined,
    isCanceladaPncp: pncpInfo.cancelado,
    prorrogadaPncp: isProrrogada,
    dataAtualizacaoPncp: pncpInfo.dataAtualizacao
  };
}

/**
 * Enriquece em lote uma lista de Atas com as vigências oficiais do PNCP de forma otimizada
 */
export async function enrichArpsBatchWithPncpVigencia(
  arpsList: ArpRecord[],
  onUpdateProgress?: (updatedArps: ArpRecord[]) => void
): Promise<ArpRecord[]> {
  if (!arpsList || arpsList.length === 0) return [];
  const results = [...arpsList];

  // Priorizar atas que precisam de checagem (evita requisições redundantes)
  const toCheckIndices = results
    .map((arp, idx) => ({ arp, idx }))
    .filter(({ arp }) => !!arp.numeroControlePncpAta && !arp.prorrogadaPncp);

  if (toCheckIndices.length === 0) return results;

  let hasAnyChanges = false;
  const batchSize = 10;
  for (let i = 0; i < toCheckIndices.length; i += batchSize) {
    const chunk = toCheckIndices.slice(i, i + batchSize);
    let chunkChanged = false;

    await Promise.all(
      chunk.map(async ({ arp, idx }) => {
        if (arp.numeroControlePncpAta) {
          const info = await fetchPncpAtaVigencia(arp.numeroControlePncpAta);
          if (info) {
            const enriched = enrichArpWithPncpVigencia(arp, info);
            if (enriched.dataVigenciaFinal !== arp.dataVigenciaFinal || enriched.isCanceladaPncp !== arp.isCanceladaPncp) {
              results[idx] = enriched;
              chunkChanged = true;
              hasAnyChanges = true;
            }
          }
        }
      })
    );

    if (chunkChanged && onUpdateProgress) {
      onUpdateProgress([...results]);
    }
  }

  if (hasAnyChanges) {
    cacheArpsInDb(results);
  }
  return results;
}

export const SUPPLEMENTAL_PNCP_ATAS = [
  { anoCompra: '2025', seqCompra: 1102, seqAta: 1, numeroAta: '00069/2025' },
  { anoCompra: '2025', seqCompra: 1576, seqAta: 2, numeroAta: '00023/2026' },
  { anoCompra: '2025', seqCompra: 1665, seqAta: 1, numeroAta: '00039/2026', cnpjFornecedor: '03871566000349' },
  { anoCompra: '2025', seqCompra: 1665, seqAta: 2, numeroAta: '00040/2026', cnpjFornecedor: '03622266000164' },
  { anoCompra: '2025', seqCompra: 1331, seqAta: 1, numeroAta: '00041/2026' }
];

export async function fetchSupplementalPncpArps(targetUasg?: string): Promise<ArpRecord[]> {
  if (targetUasg && targetUasg !== '200331') return [];
  if (supplementalPncpArpsCache && supplementalPncpArpsCache.length > 0) {
    return supplementalPncpArpsCache;
  }

  const cnpj = '00394494000136';
  const supplemental: ArpRecord[] = [];

  await Promise.all(
    SUPPLEMENTAL_PNCP_ATAS.map(async (item) => {
      try {
        const url = `/api-pncp/api/pncp/v1/orgaos/${cnpj}/compras/${item.anoCompra}/${item.seqCompra}/atas/${item.seqAta}`;
        const res = await fetch(url);
        if (res.ok) {
          const d = await res.json();
          const anoAta = String(d.anoAta || item.numeroAta.split('/')[1]);
          const numAta = String(d.numeroAtaRegistroPreco || item.numeroAta.split('/')[0]).padStart(5, '0');
          const fullNumAta = `${numAta}/${anoAta}`;

          // Obter itens específicos da Ata para calcular valorTotal e quantidadeItens exatos
          const itemsOfAta = await fetchPncpCompraItems(item.anoCompra, item.seqCompra, fullNumAta, '200331', item.cnpjFornecedor);
          const totalVal = itemsOfAta.reduce((acc, it) => acc + (it.valorTotal || 0), 0);

          const arpRec: ArpRecord = {
            numeroAtaRegistroPreco: fullNumAta,
            codigoUnidadeGerenciadora: d.unidadeOrgao?.codigoUnidade || '200331',
            nomeUnidadeGerenciadora: d.unidadeOrgao?.nomeUnidade || 'SECRETARIA NACIONAL DE SEGURANCA PUBLICA - SENASP',
            codigoOrgao: 30911,
            nomeOrgao: 'SECRETARIA NACIONAL DE SEGURANCA PUBLICA',
            linkAtaPNCP: `https://pncp.gov.br/app/atas/${cnpj}/${item.anoCompra}/${item.seqCompra}/${item.seqAta}`,
            linkCompraPNCP: `https://pncp.gov.br/app/editais/${cnpj}/${item.anoCompra}/${String(item.seqCompra).padStart(6, '0')}`,
            numeroCompra: String(item.seqCompra),
            anoCompra: item.anoCompra,
            codigoModalidadeCompra: '05',
            nomeModalidadeCompra: d.modalidadeNome || 'Pregão',
            dataAssinatura: d.dataAssinatura || '',
            dataVigenciaInicial: d.dataVigenciaInicio || '',
            dataVigenciaFinal: d.dataVigenciaFim || '',
            valorTotal: totalVal,
            statusAta: 'Ata de Registro de Preços',
            objeto: d.objetoCompra || '',
            quantidadeItens: itemsOfAta.length || 1,
            dataHoraAtualizacao: d.dataAtualizacao || '',
            dataHoraInclusao: d.dataInclusao || '',
            dataHoraExclusao: null,
            ataExcluido: false,
            numeroControlePncpAta: d.numeroControlePNCP || `${cnpj}-1-${String(item.seqCompra).padStart(6, '0')}/${item.anoCompra}-${String(item.seqAta).padStart(6, '0')}`,
            numeroControlePncpCompra: d.numeroControlePncpCompra || `${cnpj}-1-${String(item.seqCompra).padStart(6, '0')}/${item.anoCompra}`,
            idCompra: `20033105${String(item.seqCompra)}${item.anoCompra}`,
            dataVigenciaFinalPncp: d.dataVigenciaFim,
            isCanceladaPncp: !!d.cancelado,
            prorrogadaPncp: false,
            dataAtualizacaoPncp: d.dataAtualizacao || d.dataAtualizacaoGlobal
          };
          supplemental.push(arpRec);
        }
      } catch (e) {
        console.warn(`Erro ao carregar Ata suplementar PNCP ${item.numeroAta}:`, e);
      }
    })
  );

  supplementalPncpArpsCache = supplemental;
  return supplemental;
}

export function parsePncpControlNumber(ctrl?: string): { cnpj: string; seqCompra: number; anoCompra: string; seqAta: number } | null {
  if (!ctrl) return null;
  const match = ctrl.match(/^(\d{14})-1-(\d+)\/(\d{4})-(\d+)$/);
  if (!match) return null;
  return {
    cnpj: match[1],
    seqCompra: parseInt(match[2], 10),
    anoCompra: match[3],
    seqAta: parseInt(match[4], 10)
  };
}

export async function fetchPncpCompraItems(
  anoCompra: string,
  seqCompra: number | string,
  numeroAta: string,
  uasg: string,
  targetSupplierCnpj?: string,
  customCnpj?: string
): Promise<ArpItemRecord[]> {
  const cleanTargetCnpj = (targetSupplierCnpj || '').replace(/\D/g, '');
  const cnpj = (customCnpj || '00394494000136').replace(/\D/g, '');
  const cacheKey = `${cnpj}-${anoCompra}-${seqCompra}-${numeroAta}-${uasg}-${cleanTargetCnpj}`;
  if (pncpCompraItemsCache.has(cacheKey)) {
    return pncpCompraItemsCache.get(cacheKey)!;
  }

  try {
    const itemsUrl = `/api-pncp/api/pncp/v1/orgaos/${cnpj}/compras/${anoCompra}/${seqCompra}/itens`;
    const res = await fetch(itemsUrl);
    if (!res.ok) return [];
    const itemsData = await res.json();
    if (!Array.isArray(itemsData)) return [];

    const arpItems: ArpItemRecord[] = await Promise.all(
      itemsData.map(async (it: any) => {
        let niFornecedor = '';
        let nomeRazaoSocialFornecedor = '';
        let valorUnitario = it.valorUnitarioEstimado || 0;
        let valorTotal = it.valorTotal || 0;
        let quantidadeHomologada = it.quantidade || 0;

        try {
          const resUrl = `/api-pncp/api/pncp/v1/orgaos/${cnpj}/compras/${anoCompra}/${seqCompra}/itens/${it.numeroItem}/resultados`;
          const resResponse = await fetch(resUrl);
          if (resResponse.ok) {
            const resultsData = await resResponse.json();
            if (Array.isArray(resultsData) && resultsData.length > 0) {
              const r = resultsData[0];
              niFornecedor = r.niFornecedor || '';
              nomeRazaoSocialFornecedor = r.nomeRazaoSocialFornecedor || '';
              if (r.valorUnitarioHomologado) valorUnitario = r.valorUnitarioHomologado;
              if (r.valorTotalHomologado) valorTotal = r.valorTotalHomologado;
              if (r.quantidadeHomologada) quantidadeHomologada = r.quantidadeHomologada;
            }
          }
        } catch {}

        return {
          numeroAtaRegistroPreco: numeroAta,
          codigoUnidadeGerenciadora: uasg || '200331',
          numeroCompra: String(seqCompra),
          anoCompra: String(anoCompra),
          codigoModalidadeCompra: '05',
          dataAssinatura: '',
          dataVigenciaInicial: '',
          dataVigenciaFinal: '',
          numeroItem: String(it.numeroItem).padStart(5, '0'),
          codigoItem: it.numeroItem,
          descricaoItem: it.descricao || '',
          tipoItem: it.materialOuServicoNome || 'Material',
          quantidadeHomologadaItem: quantidadeHomologada,
          quantidadeEstimadaEdital: it.quantidade || quantidadeHomologada,
          classificacaoFornecedor: '001',
          niFornecedor: niFornecedor,
          nomeRazaoSocialFornecedor: nomeRazaoSocialFornecedor,
          quantidadeHomologadaVencedor: quantidadeHomologada,
          valorUnitario: valorUnitario,
          valorTotal: valorTotal,
          maximoAdesao: 0,
          nomeUnidadeGerenciadora: 'SECRETARIA NACIONAL DE SEGURANCA PUBLICA - SENASP',
          nomeModalidadeCompra: 'Pregão',
          termoHomologacao: '',
          isCancelado: false,
          isSuspenso: false,
          idCompra: `20033105${seqCompra}${anoCompra}`,
          numeroControlePncpCompra: `${cnpj}-1-${String(seqCompra).padStart(6, '0')}/${anoCompra}`,
          dataHoraInclusao: it.dataInclusao || '',
          dataHoraAtualizacao: it.dataAtualizacao || '',
          quantidadeEmpenhada: 0,
          percentualMaiorDesconto: 0,
          situacaoSicaf: '1',
          dataHoraExclusao: null,
          itemExcluido: false,
          numeroControlePncpAta: '',
          codigoPdm: 0,
          nomePdm: it.descricao || ''
        } as ArpItemRecord;
      })
    );

    let filteredItems = arpItems;
    if (cleanTargetCnpj) {
      filteredItems = arpItems.filter(item => (item.niFornecedor || '').replace(/\D/g, '') === cleanTargetCnpj);
    }

    pncpCompraItemsCache.set(cacheKey, filteredItems);
    return filteredItems;
  } catch (e) {
    console.warn(`Erro ao carregar itens da compra ${seqCompra}/${anoCompra} no PNCP:`, e);
    return [];
  }
}

const memoryItemsCache = new Map<string, ArpItemRecord[]>();

/**
 * 2. Consultar ARP Item
 * Endereço: /modulo-arp/2_consultarARPItem com fallback dinâmico completo ao PNCP
 */
export async function fetchArpItems(
  dataVigenciaInicial: string,
  codigoUnidadeGerenciadora: string,
  numeroAtaRegistroPreco: string,
  arpContext?: Partial<ArpRecord> | string
): Promise<ArpItemsResponse> {
  const cacheKey = `${numeroAtaRegistroPreco}-${codigoUnidadeGerenciadora}`;
  if (memoryItemsCache.has(cacheKey)) {
    const cached = memoryItemsCache.get(cacheKey)!;
    return {
      resultado: cached,
      totalRegistros: cached.length,
      totalPaginas: 1,
      paginasRestantes: 0
    };
  }

  const cleanDate = dataVigenciaInicial ? dataVigenciaInicial.split('T')[0] : '';
  
  // Extrai o ano da ata ou da data (ex: "00037/2026" -> "2026")
  const parts = numeroAtaRegistroPreco.split('/');
  const ataYear = parts.length === 2 ? parts[1] : (cleanDate ? cleanDate.split('-')[0] : '2026');

  const executeQuery = async (minDate: string, maxDate: string) => {
    const queryParams = {
      pagina: 1,
      tamanhoPagina: 500,
      codigoUnidadeGerenciadora,
      dataVigenciaInicialMin: minDate,
      dataVigenciaInicialMax: maxDate
    };
    const url = `${BASE_URL}/2_consultarARPItem${buildQueryString(queryParams)}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json() as ArpItemsResponse;
  };

  try {
    // 1. Tenta com a data exata informada no Compras.gov
    let data: ArpItemsResponse | null = null;
    if (cleanDate) {
      data = await executeQuery(cleanDate, cleanDate);
    }

    let foundItems = (data?.resultado || []).filter(item =>
      matchAtaNumber(item.numeroAtaRegistroPreco, numeroAtaRegistroPreco)
    );

    // 2. Se não encontrou pelo dia exato, busca no ano da Ata no Compras.gov
    if (foundItems.length === 0 && ataYear) {
      const yearData = await executeQuery(`${ataYear}-01-01`, `${ataYear}-12-31`);
      if (yearData?.resultado) {
        foundItems = yearData.resultado.filter(item =>
          matchAtaNumber(item.numeroAtaRegistroPreco, numeroAtaRegistroPreco)
        );
      }
    }

    // 3. Se não encontrou no Compras.gov, realiza fallback dinâmico para a compra do PNCP
    if (foundItems.length === 0) {
      // 3.1. Verifica se foi passado o contexto com número de controle PNCP ou ano/número da compra
      let pncpCtrl = typeof arpContext === 'string' ? arpContext : arpContext?.numeroControlePncpAta;
      let anoCompra = typeof arpContext === 'object' ? arpContext?.anoCompra : undefined;
      let seqCompra = typeof arpContext === 'object' ? (arpContext?.numeroCompra ? parseInt(arpContext.numeroCompra, 10) : undefined) : undefined;
      let cnpjFornecedor: string | undefined;

      // 3.2. Se não veio no contexto, verifica no cache da memória das atas
      if (!pncpCtrl && !seqCompra) {
        for (const list of arpsMemoryCache.values()) {
          const matchArp = list.find(a => matchAtaNumber(a.numeroAtaRegistroPreco, numeroAtaRegistroPreco));
          if (matchArp) {
            pncpCtrl = matchArp.numeroControlePncpAta;
            anoCompra = matchArp.anoCompra;
            seqCompra = matchArp.numeroCompra ? parseInt(matchArp.numeroCompra, 10) : undefined;
            break;
          }
        }
      }

      // 3.3. Se temos o controle PNCP, decompõe os identificadores
      if (pncpCtrl) {
        const parsed = parsePncpControlNumber(pncpCtrl);
        if (parsed) {
          anoCompra = parsed.anoCompra;
          seqCompra = parsed.seqCompra;
        }
      }

      // 3.4. Se ainda não temos a compra, verifica na lista de suplementares pré-mapeadas
      if (!seqCompra || !anoCompra) {
        const cleanTargetAta = numeroAtaRegistroPreco.split('/')[0].replace(/\D/g, '').replace(/^0+/, '');
        const supp = SUPPLEMENTAL_PNCP_ATAS.find(s => {
          const sNum = s.numeroAta.split('/')[0].replace(/\D/g, '').replace(/^0+/, '');
          return sNum === cleanTargetAta;
        });
        if (supp) {
          anoCompra = supp.anoCompra;
          seqCompra = supp.seqCompra;
          cnpjFornecedor = supp.cnpjFornecedor;
        }
      }

      // 3.5. Busca itens na API do PNCP se possuir ano e sequência da compra
      if (anoCompra && seqCompra) {
        foundItems = await fetchPncpCompraItems(anoCompra, seqCompra, numeroAtaRegistroPreco, codigoUnidadeGerenciadora, cnpjFornecedor);
      }
    }

    if (foundItems.length > 0) {
      // Invariante Contábil: 1 Ata de Registro de Preços pertence a 1 único fornecedor
      const primaryItem = foundItems.find(i => (i.niFornecedor && i.niFornecedor.trim()) || (i.nomeRazaoSocialFornecedor && i.nomeRazaoSocialFornecedor !== 'FORNECEDOR NÃO INFORMADO'));
      if (primaryItem) {
        const primaryCnpjDigits = (primaryItem.niFornecedor || '').replace(/\D/g, '');
        const primaryName = (primaryItem.nomeRazaoSocialFornecedor || '').toUpperCase().trim();
        
        if (primaryCnpjDigits) {
          const filtered = foundItems.filter(i => {
            const itemCnpjDigits = (i.niFornecedor || '').replace(/\D/g, '');
            return itemCnpjDigits === primaryCnpjDigits;
          });
          if (filtered.length > 0) foundItems = filtered;
        } else if (primaryName) {
          const filtered = foundItems.filter(i => {
            const itemName = (i.nomeRazaoSocialFornecedor || '').toUpperCase().trim();
            return itemName === primaryName;
          });
          if (filtered.length > 0) foundItems = filtered;
        }
      }

      foundItems.sort((a, b) => (parseInt(a.numeroItem, 10) || 0) - (parseInt(b.numeroItem, 10) || 0));

      foundItems.forEach((item, idx) => {
        if (!item.numeroItem) {
          item.numeroItem = String(idx + 1).padStart(5, '0');
        }
      });

      memoryItemsCache.set(cacheKey, foundItems);
      cacheArpItemsInDb(numeroAtaRegistroPreco, codigoUnidadeGerenciadora, foundItems);
      return {
        resultado: foundItems,
        totalRegistros: foundItems.length,
        totalPaginas: 1,
        paginasRestantes: 0
      };
    }

    return { resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 };
  } catch (error) {
    console.warn("Falha na requisição de itens da API.", error);
    return { resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 };
  }
}

/**
 * Consulta itens de ARP em lote para o intervalo e unidade gerenciadora informados
 */
export async function fetchArpItemsBatch(params: FilterParams): Promise<Record<string, ArpItemRecord[]>> {
  const itemsMap: Record<string, ArpItemRecord[]> = {};

  try {
    const chunks = splitDateRange(params.dataVigenciaInicialMin, params.dataVigenciaInicialMax);

    for (const chunk of chunks) {
      let currentPage = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        const queryParams = {
          pagina: currentPage,
          tamanhoPagina: 500,
          codigoUnidadeGerenciadora: params.codigoUnidadeGerenciadora,
          dataVigenciaInicialMin: chunk.start,
          dataVigenciaInicialMax: chunk.end
        };

        const url = `${BASE_URL}/2_consultarARPItem${buildQueryString(queryParams)}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json() as ArpItemsResponse;

        if (data.resultado && data.resultado.length > 0) {
          for (const item of data.resultado) {
            if (params.numeroAtaRegistroPreco && !item.numeroAtaRegistroPreco.includes(params.numeroAtaRegistroPreco)) {
              continue;
            }
            if (!item.numeroItem) {
              item.numeroItem = '00001';
            }
            const key = `${item.numeroAtaRegistroPreco}-${params.codigoUnidadeGerenciadora}`;
            if (!itemsMap[key]) {
              itemsMap[key] = [];
            }
            itemsMap[key].push(item);
          }
        }

        if (data.paginasRestantes && data.paginasRestantes > 0) {
          currentPage++;
        } else {
          hasMorePages = false;
        }
      }
    }

    // Carregar itens das atas suplementares do PNCP
    const suppArps = await fetchSupplementalPncpArps(params.codigoUnidadeGerenciadora);
    for (const supp of SUPPLEMENTAL_PNCP_ATAS) {
      const sArp = suppArps.find(a => a.numeroAtaRegistroPreco.includes(supp.numeroAta));
      if (sArp) {
        const key = `${sArp.numeroAtaRegistroPreco}-${sArp.codigoUnidadeGerenciadora}`;
        if (!itemsMap[key] || itemsMap[key].length === 0) {
          const suppItems = await fetchPncpCompraItems(supp.anoCompra, supp.seqCompra, sArp.numeroAtaRegistroPreco, sArp.codigoUnidadeGerenciadora, supp.cnpjFornecedor);
          if (suppItems.length > 0) {
            itemsMap[key] = suppItems;
          }
        }
      }
    }

    for (const key in itemsMap) {
      itemsMap[key].sort((a, b) => (parseInt(a.numeroItem, 10) || 0) - (parseInt(b.numeroItem, 10) || 0));
    }

    return itemsMap;
  } catch (error) {
    console.warn("Falha na requisição de itens em lote da API.", error);
    return itemsMap;
  }
}

/**
 * 3. Consultar Unidades Item
 * Endereço: /modulo-arp/3_consultarUnidadesItem
 */
export async function fetchUnidadesItem(
  numeroAta: string,
  unidadeGerenciadora: string,
  numeroItem: string
): Promise<UnidadesItemResponse> {
  const formattedItem = (numeroItem || '').toString().padStart(5, '0');
  
  const queryParams = {
    pagina: 1,
    tamanhoPagina: 50,
    numeroAta,
    unidadeGerenciadora,
    numeroItem: formattedItem
  };

  const url = `${BASE_URL}/3_consultarUnidadesItem${buildQueryString(queryParams)}`;

  try {
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json() as UnidadesItemResponse;
      if (data.resultado && data.resultado.length > 0) {
        return data;
      }
    }
  } catch (error) {
    console.warn("Falha na consulta de unidades do item.", error);
  }

  // Sem dados reais retornados pela API: retorna vazio em vez de fabricar um registro fictício.
  return { resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 };
}

/**
 * 4. Consultar Empenhos Saldo Item
 * Endereço: /modulo-arp/4_consultarEmpenhosSaldoItem
 */
export async function fetchEmpenhosSaldoItem(
  numeroAta: string,
  unidadeGerenciadora: string
): Promise<EmpenhosSaldoItemResponse> {
  try {
    let currentPage = 1;
    let hasMorePages = true;
    const allRecords: EmpenhoSaldoItemRecord[] = [];

    while (hasMorePages) {
      const queryParams = {
        pagina: currentPage,
        tamanhoPagina: 500,
        numeroAta,
        unidadeGerenciadora
      };

      const url = `${BASE_URL}/4_consultarEmpenhosSaldoItem${buildQueryString(queryParams)}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json() as EmpenhosSaldoItemResponse;

      if (data.resultado && data.resultado.length > 0) {
        allRecords.push(...data.resultado);
      }

      if (data.paginasRestantes && data.paginasRestantes > 0) {
        currentPage++;
      } else {
        hasMorePages = false;
      }
    }

    return {
      resultado: allRecords,
      totalRegistros: allRecords.length,
      totalPaginas: 1,
      paginasRestantes: 0
    };
  } catch (error) {
    console.warn("Falha na consulta de empenhos do item.", error);
    return { resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 };
  }
}

/**
 * Normaliza e gera uma chave única canônica para o contrato
 * Evita duplicações causadas por formatos distintos (ex: "00214/2026", "002142026", "214/2026", "00394494000136-2-000214/2026")
 */
export function getCanonicalContractKey(
  numeroRaw?: string,
  anoRaw?: string | number,
  numeroControlePncp?: string
): string {
  const cleanNum = String(numeroRaw || '').trim();

  if (cleanNum) {
    const neMatch = cleanNum.match(/^(\d{4})NE(\d+)$/i);
    if (neMatch) {
      return `${neMatch[1]}NE${parseInt(neMatch[2], 10)}`;
    }

    if (cleanNum.includes('/')) {
      const parts = cleanNum.split('/');
      const n = parseInt(parts[0].replace(/\D/g, ''), 10);
      let a = parts[1].replace(/\D/g, '');
      if (a.length === 2) a = '20' + a;
      if (!isNaN(n) && a) return `${n}/${a}`;
    }

    const numDigits = cleanNum.replace(/\D/g, '');
    if (numDigits) {
      const anoStr = String(anoRaw || '').replace(/\D/g, '');
      if (numDigits.length > 4) {
        const possibleYear = numDigits.slice(-4);
        if (possibleYear.startsWith('20')) {
          const n = parseInt(numDigits.slice(0, -4), 10);
          if (!isNaN(n)) return `${n}/${possibleYear}`;
        }
      }

      const parsedN = parseInt(numDigits, 10);
      if (!isNaN(parsedN)) {
        return `${parsedN}/${anoStr || '2026'}`;
      }
    }

    return cleanNum;
  }

  const cleanPncp = String(numeroControlePncp || '').trim();
  if (cleanPncp) {
    const pncpMatch = cleanPncp.match(/-2-0*(\d+)\/(\d{4})/);
    if (pncpMatch) {
      return `${parseInt(pncpMatch[1], 10)}/${pncpMatch[2]}`;
    }
    const pncpDashMatch = cleanPncp.match(/-2-0*(\d+)-(\d{4})/);
    if (pncpDashMatch) {
      return `${parseInt(pncpDashMatch[1], 10)}/${pncpDashMatch[2]}`;
    }
  }

  return '';
}

/**
 * Formata número e ano do contrato para o padrão do Contratos.gov.br (comprasnet)
 * Ex: "00244", 2026 -> "002442026"
 * Ex: "00061/2025" -> "000612025"
 * Ex: "044/2026" -> "000442026"
 */
export function formatNumeroAnoContrato(numeroRaw: string, anoRaw?: string | number): string {
  const clean = String(numeroRaw || '').trim();
  const neMatch = clean.match(/^(\d{4})NE(\d+)$/i);
  if (neMatch) {
    const neAno = neMatch[1];
    const neNum = parseInt(neMatch[2], 10).toString().padStart(5, '0');
    return neNum + neAno;
  }
  const parts = clean.split('/');
  let numOnly = parts[0].replace(/\D/g, '');
  let anoOnly = parts[1] ? parts[1].replace(/\D/g, '') : String(anoRaw || '').replace(/\D/g, '');

  if (!numOnly) return '';
  numOnly = numOnly.padStart(5, '0');
  if (anoOnly.length === 2) {
    anoOnly = '20' + anoOnly;
  }
  return numOnly + (anoOnly || '2026');
}

/**
 * Consulta itens e dados do contrato no Contratos.gov.br (comprasnet)
 * Endpoints:
 * 1. GET /api/contrato/ugorigem/{uasg}/numeroano/{numeroAno}
 * 2. GET /api/contrato/{contratoId}/itens
 */
export async function fetchContratosGovData(
  uasg: string,
  numeroContrato: string,
  anoContrato?: string | number
): Promise<{ contratoId?: number; orgaoNome?: string; items: any[] }> {
  const numeroAno = formatNumeroAnoContrato(numeroContrato, anoContrato);
  if (!numeroAno) return { items: [] };

  const candidateUgs = Array.from(new Set([uasg, '200331', '200330'])).filter(Boolean);

  for (const ug of candidateUgs) {
    try {
      const listRes = await fetch(`/api-contratos-gov/api/contrato/ugorigem/${ug}/numeroano/${numeroAno}`);
      if (listRes.ok) {
        const data = await listRes.json();
        const cObj = Array.isArray(data) ? data[0] : data;
        const contratoId = cObj?.id || cObj?.contrato_id;
        const orgaoNome = cObj?.contratante?.orgao?.nome || cObj?.contratante?.orgao_origem?.nome;

        if (contratoId) {
          const itemsRes = await fetch(`/api-contratos-gov/api/contrato/${contratoId}/itens`);
          const itemsData = itemsRes.ok ? await itemsRes.json() : [];
          return {
            contratoId,
            orgaoNome,
            items: Array.isArray(itemsData) ? itemsData : []
          };
        }
      }
    } catch (e) {
      console.warn(`Falha na consulta ao Contratos.gov.br (ug=${ug}, numAno=${numeroAno})`, e);
    }
  }

  return { items: [] };
}

/**
 * Consulta empenhos do contrato no Contratos.gov.br (comprasnet)
 * Endpoint: GET /api/contrato/{contrato_id}/empenhos
 */
export async function fetchContratosGovEmpenhos(
  contratoId: string | number
): Promise<ContratosGovEmpenhoRecord[]> {
  try {
    const res = await fetch(`/api-contratos-gov/api/contrato/${contratoId}/empenhos`);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  } catch (e) {
    console.warn(`Falha na consulta de empenhos do contrato no Contratos.gov.br (id=${contratoId})`, e);
  }
  return [];
}

/**
 * Consulta o detalhe do empenho e seus itens na API do Contratos.gov.br
 * Endpoint: GET /api/v1/contrato/empenho/consultar/{empenho_id}
 */
export async function fetchContratoEmpenhoDetalhe(
  empenhoId: string | number
): Promise<{ itens_minuta?: any[] } | null> {
  try {
    const res = await fetch(`/api-contratos-gov/api/v1/contrato/empenho/consultar/${empenhoId}`);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (e) {
    console.warn(`Falha na consulta de detalhe do empenho (id=${empenhoId})`, e);
  }
  return null;
}

/**
 * Consulta itens do contrato no Compras.gov.br Dados Abertos
 * Endpoint: /modulo-contratos/2.1_consultarContratosItem_Id
 */
export async function fetchContratoItensComprasGov(
  numeroControlePncp?: string
): Promise<ComprasGovContratoItemRecord[]> {
  if (!numeroControlePncp) return [];

  try {
    const url = `${BASE_URL.replace('/modulo-arp', '/modulo-contratos')}/2.1_consultarContratosItem_Id?tipo=numeroControlePncpContrato&codigo=${encodeURIComponent(numeroControlePncp)}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json() as ComprasGovContratosItemResponse;
      if (data.resultado && data.resultado.length > 0) {
        return data.resultado;
      }
    }
  } catch (e) {
    console.warn(`Falha na consulta de itens de contrato Compras.gov (numeroControlePncp=${numeroControlePncp})`, e);
  }

  return [];
}

export interface FallbackPurchaseParams {
  codigoOrgao?: string | number;
  codigoUnidadeGestora?: string;
  idCompra?: string;
  numeroCompra?: string;
  anoCompra?: string | number;
  codigoModalidadeCompra?: string;
  dataVigenciaInicial?: string;
  numeroControlePncpCompra?: string;
  numeroControlePncpAta?: string;
}

export interface SupplierFilterInfo {
  niFornecedor?: string;
  nomeFornecedor?: string;
}

/**
 * Consulta de contingência para contratos vinculados à Compra/Licitação
 * utilizando as Unidades Gestoras 200331 e 200330 e desduplicação por chave canônica.
 */
export async function fetchComprasGovContratosByPurchase(
  params: FallbackPurchaseParams
): Promise<any[]> {
  const contractsMap = new Map<string, any>();
  const candidateUasgs = Array.from(new Set([
    '200331',
    '200330',
    params.codigoUnidadeGestora
  ].filter(Boolean))) as string[];

  // Anos de busca da compra e execução (incluindo o ano de vigência subsequente)
  const baseYear = parseInt(params.anoCompra ? String(params.anoCompra) : (params.dataVigenciaInicial?.split('-')[0] || '2025'), 10);
  const yearsToSearch = Array.from(new Set([
    String(baseYear),
    String(baseYear + 1),
    String(new Date().getFullYear())
  ].filter(Boolean))) as string[];

  // 1. Tentar por idCompra no modulo-contratos (1.1_consultarContratos_Id)
  if (params.idCompra) {
    try {
      const url = `${BASE_URL.replace('/modulo-arp', '/modulo-contratos')}/1.1_consultarContratos_Id?tipo=idCompra&codigo=${encodeURIComponent(params.idCompra)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.resultado && data.resultado.length > 0) {
          data.resultado.forEach((c: any) => {
            const canKey = getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncpContrato);
            if (canKey) contractsMap.set(canKey, c);
          });
        }
      }
    } catch (e) {
      console.warn('Falha na busca de contratos por idCompra no modulo-contratos', e);
    }
  }

  // 1.1 Tentar por numeroControlePncpCompra no modulo-contratos
  if (params.numeroControlePncpCompra) {
    try {
      const url = `${BASE_URL.replace('/modulo-arp', '/modulo-contratos')}/1.1_consultarContratos_Id?tipo=numeroControlePncpCompra&codigo=${encodeURIComponent(params.numeroControlePncpCompra)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.resultado && data.resultado.length > 0) {
          data.resultado.forEach((c: any) => {
            const canKey = getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncpContrato);
            if (canKey && !contractsMap.has(canKey)) contractsMap.set(canKey, c);
          });
        }
      }
    } catch (e) {
      console.warn('Falha na busca de contratos por numeroControlePncpCompra no modulo-contratos', e);
    }
  }

  // 2. Buscar em 1_consultarContratos para as UGs gerenciadoras nos anos relevantes
  for (const uasg of candidateUasgs) {
    const orgao = params.codigoOrgao || (uasg === '200331' || uasg === '200330' ? '30911' : '');
    for (const yr of yearsToSearch) {
      try {
        const url = `${BASE_URL.replace('/modulo-arp', '/modulo-contratos')}/1_consultarContratos?pagina=1&tamanhoPagina=500&codigoOrgao=${orgao}&codigoUnidadeGestora=${uasg}&dataVigenciaInicialMin=${yr}-01-01&dataVigenciaInicialMax=${yr}-12-31`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const list = data.resultado || [];
          list.forEach((c: any) => {
            let matched = false;

            // Critério 1: idCompra idêntico
            if (!matched && params.idCompra && c.idCompra && c.idCompra === params.idCompra) {
              const canKey = getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncpContrato);
              if (canKey) { contractsMap.set(canKey, c); matched = true; }
            }

            // Critério 2: numeroControlePncpCompra idêntico
            if (!matched && params.numeroControlePncpCompra && c.numeroControlePncpCompra && c.numeroControlePncpCompra === params.numeroControlePncpCompra) {
              const canKey = getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncpContrato);
              if (canKey) { contractsMap.set(canKey, c); matched = true; }
            }

            // Critério 3: numeroCompra + anoCompra + modalidade
            if (!matched && params.numeroCompra && c.numeroCompra) {
              const cleanParamsNum = params.numeroCompra.replace(/\D/g, '').replace(/^0+/, '');
              const cleanCNum = String(c.numeroCompra).split('/')[0].replace(/\D/g, '').replace(/^0+/, '');
              
              const cAnoRaw = c.anoCompra || (String(c.numeroCompra).includes('/') ? String(c.numeroCompra).split('/').pop() : '') || (c.dataVigenciaInicial ? c.dataVigenciaInicial.split('-')[0] : '');
              const cAno = String(cAnoRaw).trim();
              const paramsAnoRaw = params.anoCompra || (String(params.numeroCompra).includes('/') ? String(params.numeroCompra).split('/').pop() : '');
              const paramsAno = String(paramsAnoRaw || '').trim();

              const sameNum = cleanParamsNum && cleanCNum && cleanParamsNum === cleanCNum;
              const sameAno = !paramsAno || !cAno || paramsAno === cAno;
              const sameMod = !params.codigoModalidadeCompra || !c.codigoModalidadeCompra || String(params.codigoModalidadeCompra) === String(c.codigoModalidadeCompra);

              if (sameNum && sameAno && sameMod) {
                const canKey = getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncpContrato);
                if (canKey) contractsMap.set(canKey, c);
              }
            }
          });
        }
      } catch (e) {
        console.warn(`Falha na busca de contratos em lote no modulo-contratos para a UG ${uasg} e ano ${yr}`, e);
      }
    }
  }

  // 3. Buscar diretamente na API do Contratos.gov.br (/api/contrato/ug/{uasg})
  for (const uasg of candidateUasgs) {
    try {
      let ugContratos = contratosGovUgListCache.get(uasg);
      if (!ugContratos) {
        const res = await fetch(`/api-contratos-gov/api/contrato/ug/${uasg}`);
        if (res.ok) {
          ugContratos = await res.json();
          contratosGovUgListCache.set(uasg, ugContratos || []);
        }
      }
      if (Array.isArray(ugContratos)) {
        const cleanParamsNum = (params.numeroCompra || '').replace(/\D/g, '').replace(/^0+/, '');
        const cleanParamsAno = (params.anoCompra ? String(params.anoCompra) : (params.dataVigenciaInicial ? params.dataVigenciaInicial.split('-')[0] : '')).replace(/\D/g, '');

        for (const c of ugContratos) {
          let matched = false;
          if (c.licitacao_numero && cleanParamsNum) {
            const parts = String(c.licitacao_numero).split('/');
            const cleanLicNum = parts[0].replace(/\D/g, '').replace(/^0+/, '');
            const cleanLicAno = parts[1] ? parts[1].replace(/\D/g, '') : '';

            const sameAno = !cleanParamsAno || !cleanLicAno || cleanParamsAno === cleanLicAno;
            const sameNum = cleanLicNum === cleanParamsNum ||
                            ('900' + cleanLicNum === cleanParamsNum) ||
                            (cleanLicNum === '900' + cleanParamsNum) ||
                            ('90' + cleanLicNum === cleanParamsNum);

            if (sameNum && sameAno) {
              matched = true;
            }
          }
          if (matched) {
            const canKey = getCanonicalContractKey(c.numero, c.ano || (c.data_assinatura ? c.data_assinatura.split('-')[0] : '2025'));
            if (canKey && !contractsMap.has(canKey)) {
              contractsMap.set(canKey, {
                numeroContrato: c.numero,
                anoContrato: c.ano || (c.data_assinatura ? c.data_assinatura.split('-')[0] : '2025'),
                codigoUnidadeGestora: c.unidade_gestora || uasg,
                codigoUnidadeGestoraOrigemContrato: uasg,
                objeto: c.objeto,
                niFornecedor: c.fornecedor?.cnpj_cpf_idgener,
                nomeRazaoSocialFornecedor: c.fornecedor?.nome,
                contrato_id: c.id,
                valor_global: c.valor_global,
                dataVigenciaInicial: c.vigencia_inicio,
                dataVigenciaFinal: c.vigencia_fim
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Falha na consulta de contratos na API Contratos.gov.br para UG ${uasg}`, err);
    }
  }

  return Array.from(contractsMap.values());
}

export interface ParsedPncpParams {
  cnpj: string;
  ano: string;
  sequencial: string;
  sequencialAta?: string;
  numeroAta?: string;
  anoAta?: string;
}

/**
 * Extrai e normaliza os identificadores do PNCP a partir de múltiplos padrões de URLs e números de controle
 */
export function parsePncpIdentifiers(arp?: Partial<ArpRecord> | any): ParsedPncpParams | null {
  if (!arp) return null;

  let cnpj = '';
  let ano = '';
  let sequencial = '';
  let sequencialAta = '';
  let numeroAta = '';
  let anoAta = '';

  // 1. Extração via linkAtaPNCP (ex: https://pncp.gov.br/app/atas/00394494000136/2024/001436/1 ou /atas/00394494000136/2024/1436/1)
  if (arp.linkAtaPNCP) {
    const match = arp.linkAtaPNCP.match(/atas\/(\d+)\/(\d+)\/(\d+)\/(\d+)/);
    if (match) {
      cnpj = match[1];
      ano = match[2];
      sequencial = parseInt(match[3], 10).toString();
      sequencialAta = parseInt(match[4], 10).toString();
    }
  }

  // 2. Extração via numeroControlePncpAta (ex: 00394494000136-1-001436/2024-000001)
  if ((!cnpj || !sequencial) && arp.numeroControlePncpAta) {
    const clean = String(arp.numeroControlePncpAta).trim();
    const match = clean.match(/^(\d{14})-[^-]+-0*(\d+)\/(\d{4})-0*(\d+)/);
    if (match) {
      cnpj = match[1];
      sequencial = match[2];
      ano = match[3];
      sequencialAta = match[4];
    } else {
      const parts = clean.split('-');
      if (parts.length >= 4) {
        cnpj = parts[0];
        const purchasePart = parts[2];
        const purchaseMatch = purchasePart.split('/');
        sequencial = purchaseMatch[0]?.replace(/\D/g, '') || '';
        ano = purchaseMatch[1]?.replace(/\D/g, '') || '';
        sequencialAta = parts[parts.length - 1]?.replace(/\D/g, '') || '';
      }
    }
  }

  // 3. Extração via linkCompraPNCP (ex: https://pncp.gov.br/app/editais/00394494000136/2024/001436)
  if ((!cnpj || !sequencial) && arp.linkCompraPNCP) {
    const match = arp.linkCompraPNCP.match(/editais\/(\d+)\/(\d+)\/(\d+)/);
    if (match) {
      cnpj = match[1];
      ano = match[2];
      sequencial = parseInt(match[3], 10).toString();
    }
  }

  // 4. Extração via numeroControlePncpCompra (ex: 00394494000136-1-001436/2024)
  if ((!cnpj || !sequencial) && arp.numeroControlePncpCompra) {
    const clean = String(arp.numeroControlePncpCompra).trim();
    const match = clean.match(/^(\d{14})-[^-]+-0*(\d+)\/(\d{4})/);
    if (match) {
      cnpj = match[1];
      sequencial = match[2];
      ano = match[3];
    }
  }

  // 5. Fallback por UASG Gerenciadora conhecida
  if (!cnpj) {
    if (arp.codigoUnidadeGerenciadora === '200331' || arp.codigoUnidadeGerenciadora === '200330') {
      cnpj = '00394494000136';
    }
  }

  if (!ano && arp.anoCompra) {
    ano = String(arp.anoCompra).trim();
  }
  if (!sequencial && arp.numeroCompra) {
    sequencial = String(arp.numeroCompra).replace(/\D/g, '').replace(/^0+/, '') || String(arp.numeroCompra).trim();
  }

  // Extração do número e ano da Ata
  if (arp.numeroAtaRegistroPreco) {
    const parts = String(arp.numeroAtaRegistroPreco).split('/');
    numeroAta = parts[0]?.trim() || '';
    anoAta = parts[1]?.trim() || ano || '';
  }

  if (cnpj && ano && sequencial) {
    return {
      cnpj,
      ano,
      sequencial,
      sequencialAta: sequencialAta || undefined,
      numeroAta: numeroAta || undefined,
      anoAta: anoAta || undefined
    };
  }

  return null;
}

/**
 * 5. Consultar Contratos da Contratação no PNCP e Compras.gov
 * Utiliza o número da Contratação/Compra + UASGs Gerenciadoras e Participantes
 * e aplica filtro estrito por fornecedor e item da Ata.
 */
export async function fetchPncpContracts(
  cnpj: string,
  ano: string,
  sequencial: string,
  sequencialAta: string,
  numeroItemDesejado?: string,
  fallbackParams?: FallbackPurchaseParams,
  fornecedorInfo?: SupplierFilterInfo,
  numeroAtaRegistroPreco?: string
): Promise<PncpContract[]> {
  const contractsMergedMap = new Map<string, any>();
  const effectiveCnpj = (cnpj || fallbackParams?.numeroControlePncpCompra?.match(/^(\d{14})/)?.[1] || fallbackParams?.numeroControlePncpAta?.match(/^(\d{14})/)?.[1] || '').trim();

  // 1. Consulta contratos diretos da Contratação/Compra no PNCP (apenas se CNPJ e sequencial válidos)
  if (effectiveCnpj && ano && sequencial) {
    try {
      const purchaseContractsUrl = `/api-pncp/api/pncp/v1/orgaos/${effectiveCnpj}/compras/${ano}/${sequencial}/contratos`;
      const res = await fetch(purchaseContractsUrl);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        list.forEach((c: any) => {
          const canKey = getCanonicalContractKey(c.numeroContrato || c.numeroContratoEmpenho || c.numero, c.anoContrato || ano, c.numeroControlePNCP || c.numeroControlePncpContrato);
          if (canKey) contractsMergedMap.set(canKey, { ...c, _fromPncp: true });
        });
      }
    } catch (e) {
      console.warn("Falha na consulta de contratos da contratação no PNCP", e);
    }
  }

  // 2. Resolução dinâmica de Atas e Contratos da Ata no PNCP
  if (effectiveCnpj && ano && sequencial) {
    try {
      const atasListUrl = `/api-pncp/api/pncp/v1/orgaos/${effectiveCnpj}/compras/${ano}/${sequencial}/atas`;
      const resAtas = await fetch(atasListUrl);
      if (resAtas.ok) {
        const atasData = await resAtas.json();
        const atasList = Array.isArray(atasData) ? atasData : (Array.isArray(atasData?.data) ? atasData.data : []);

        let matchedSeqAta: number | string | undefined = undefined;
        const cleanAtaNum = (numeroAtaRegistroPreco || '').replace(/\D/g, '').replace(/^0+/, '');
        const targetSupplierCnpjDigits = (fornecedorInfo?.niFornecedor || '').replace(/\D/g, '');

        for (const a of atasList) {
          const aNumDigits = String(a.numeroAtaRegistroPreco || '').replace(/\D/g, '').replace(/^0+/, '');
          const aSupplierCnpj = String(a.niFornecedor || '').replace(/\D/g, '');

          if (cleanAtaNum && aNumDigits && (cleanAtaNum === aNumDigits || aNumDigits.endsWith(cleanAtaNum) || cleanAtaNum.endsWith(aNumDigits))) {
            matchedSeqAta = a.sequencialAta;
            break;
          } else if (targetSupplierCnpjDigits && aSupplierCnpj && targetSupplierCnpjDigits === aSupplierCnpj) {
            matchedSeqAta = a.sequencialAta;
            break;
          }
        }

        const seqsToFetch = Array.from(new Set([matchedSeqAta, sequencialAta].filter(Boolean)));
        for (const s of seqsToFetch) {
          try {
            const ataContractsUrl = `/api-pncp/api/pncp/v1/orgaos/${effectiveCnpj}/compras/${ano}/${sequencial}/atas/${s}/contratos`;
            const resAtaContratos = await fetch(ataContractsUrl);
            if (resAtaContratos.ok) {
              const ataContratosData = await resAtaContratos.json();
              const list = Array.isArray(ataContratosData) ? ataContratosData : (Array.isArray(ataContratosData?.data) ? ataContratosData.data : []);
              list.forEach((c: any) => {
                const canKey = getCanonicalContractKey(c.numeroContrato || c.numeroContratoEmpenho || c.numero, c.anoContrato || ano, c.numeroControlePNCP || c.numeroControle || c.numeroControlePncpContrato);
                if (canKey) {
                  const existing = contractsMergedMap.get(canKey);
                  contractsMergedMap.set(canKey, { ...(existing || {}), ...c, _fromPncp: true });
                }
              });
            }
          } catch (errAta) {
            console.warn(`Falha na busca de contratos da ata seq ${s} no PNCP`, errAta);
          }
        }
      }
    } catch (e) {
      console.warn("Falha na consulta de atas no PNCP", e);
    }
  }

  // 3. Sempre complementar/unificar com contratos vinculados à compra no Compras.gov.br e Contratos.gov.br
  if (fallbackParams) {
    try {
      const purchaseContracts = await fetchComprasGovContratosByPurchase(fallbackParams);
      purchaseContracts.forEach((c: any) => {
        const canKey = getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncpContrato);
        if (canKey) {
          const existing = contractsMergedMap.get(canKey);
          contractsMergedMap.set(canKey, { ...(existing || {}), ...c, _fromPncp: existing ? existing._fromPncp : false });
        }
      });
    } catch (e) {
      console.warn('Falha ao complementar contratos com dados da compra Compras.gov', e);
    }
  }

  const mergedList = Array.from(contractsMergedMap.values());
  if (mergedList.length === 0) {
    return [];
  }

  // Extração de CNPJ limpo do fornecedor alvo para validação estrita
  const targetSupplierCnpjDigits = (fornecedorInfo?.niFornecedor || '').replace(/\D/g, '');
  const targetSupplierName = (fornecedorInfo?.nomeFornecedor || '').toUpperCase().trim();

  const mapped = await Promise.all(mergedList.map(async (c: any): Promise<PncpContract | null> => {
    const isFromPncp = c._fromPncp === true;
    const contractCnpj = isFromPncp ? (c.orgaoEntidade?.cnpj || effectiveCnpj) : (c.niFornecedor || effectiveCnpj);
    const anoContrato = c.anoContrato || (c.dataVigenciaInicial ? new Date(c.dataVigenciaInicial).getFullYear() : Number(ano));
    const sequencialContrato = c.sequencialContrato || (c.numeroControlePncpContrato ? parseInt(c.numeroControlePncpContrato.split('-').pop() || '', 10) || undefined : undefined);

    let detail: any = null;
    if (sequencialContrato && isFromPncp) {
      try {
        const detailUrl = `/api-pncp/api/pncp/v1/orgaos/${contractCnpj}/contratos/${anoContrato}/${sequencialContrato}`;
        const detailResponse = await fetch(detailUrl);
        if (detailResponse.ok) {
          detail = await detailResponse.json();
        }
      } catch (detailError) {
        console.warn("Falha na consulta de detalhe do contrato PNCP.", detailError);
      }
    }

    // 4. Validação estrita de Fornecedor: eliminar contratos de outras empresas da mesma licitação
    const contractSupplierCnpj = (detail?.niFornecedor || c.niFornecedor || '').replace(/\D/g, '');
    const contractSupplierName = (detail?.nomeRazaoSocialFornecedor || c.nomeRazaoSocialFornecedor || '').toUpperCase().trim();

    if (targetSupplierCnpjDigits && contractSupplierCnpj) {
      if (contractSupplierCnpj !== targetSupplierCnpjDigits) {
        return null; // Fornecedor diferente (ex: General Motors x Renault)
      }
    } else if (targetSupplierName && contractSupplierName) {
      // Se não temos CNPJ em ambos, valida por coincidência de palavras-chave
      const targetKeywords = targetSupplierName.split(/\s+/).filter(w => w.length > 3);
      const isNameMatch = targetKeywords.some(kw => contractSupplierName.includes(kw));
      if (!isNameMatch) {
        return null;
      }
    }

    const numeroControlePncp = detail?.numeroControlePNCP || detail?.numeroControlePncp || c.numeroControlePNCP || c.numeroControle || c.numeroControlePncpContrato;
    const rawLinkVisualizacao = detail?.linkVisualizacao || detail?.linkContrato || c.linkVisualizacao || c.linkContrato || c.linkContratoPNCP || c.urlContrato;
    const linkVisualizacao = formatPncpContractUrl(numeroControlePncp, rawLinkVisualizacao);

    // Identificação precisa da UASG e classificação (200331 e 200330 são Gerenciadoras)
    const rawUasg = c.codigoUnidadeGestora || 
                    c.codigoUnidadeGestoraOrigemContrato || 
                    detail?.unidadeOrgao?.codigoUnidade || 
                    detail?.unidadeExecutora?.codigoUnidade || 
                    c.unidadeExecutora?.codigo || 
                    c.unidadeExecutora?.codigoUnidade || 
                    c.unidadeOrgao?.codigoUnidade || 
                    c.unidadeGestora || 
                    (c.unidadeNome?.match(/(\d{5,6})/)?.[1]) || 
                    fallbackParams?.codigoUnidadeGestora || 
                    '200331';
    const resolvedUasg = String(rawUasg).trim();
    const isGerenciadora = resolvedUasg === String(fallbackParams?.codigoUnidadeGestora || '200331') || resolvedUasg === '200331' || resolvedUasg === '200330';
    const tipoUnidade: 'GERENCIADORA' | 'PARTICIPANTE' = isGerenciadora ? 'GERENCIADORA' : 'PARTICIPANTE';

    const numContrato = c.numeroContrato || c.numeroContratoEmpenho || c.numero || detail?.numeroContratoEmpenho || '';

    // Consulta a quantidade do item contratado
    let quantidadeContratada: number | null = null;
    let valorUnitarioItem: number | null = null;
    let valorTotalItem: number | null = null;
    let numeroItemContratado: string | undefined = undefined;
    let pertenceAoItem: boolean | undefined = undefined;
    let historicoPrecos: Array<{ dataTermo: string; valorUnitario: number; quantidade?: number; tipoHistorico?: string }> | undefined = undefined;

    // 1. Consulta em tempo real no Contratos.gov.br (/api/contrato/ugorigem/... e /itens)
    let contratoId: number | undefined = undefined;
    let orgaoNomeGov: string | undefined = undefined;

    if (numContrato && resolvedUasg) {
      const govData = await fetchContratosGovData(resolvedUasg, numContrato, anoContrato);
      contratoId = govData.contratoId;
      orgaoNomeGov = govData.orgaoNome;

      if (govData.items && govData.items.length > 0) {
        let matchedItemObj: any = null;
        if (numeroItemDesejado) {
          const targetNum = parseInt(numeroItemDesejado, 10);
          matchedItemObj = govData.items.find(i => parseInt(i.numero_item_compra || '', 10) === targetNum);
          if (matchedItemObj) {
            pertenceAoItem = true;
          } else {
            pertenceAoItem = false;
          }
        } else {
          matchedItemObj = govData.items[0];
        }

        if (matchedItemObj) {
          const rawQtd = parseInt(matchedItemObj.quantidade, 10);
          if (!isNaN(rawQtd)) {
            quantidadeContratada = rawQtd;
          }
          if (matchedItemObj.valorunitario) {
            const rawVal = parseFloat(String(matchedItemObj.valorunitario).replace(/\./g, '').replace(',', '.'));
            if (!isNaN(rawVal)) valorUnitarioItem = rawVal;
          }
          if (matchedItemObj.valortotal) {
            const rawTot = parseFloat(String(matchedItemObj.valortotal).replace(/\./g, '').replace(',', '.'));
            if (!isNaN(rawTot)) valorTotalItem = rawTot;
          }
          numeroItemContratado = matchedItemObj.numero_item_compra;

          if (Array.isArray(matchedItemObj.historico_item) && matchedItemObj.historico_item.length > 0) {
            historicoPrecos = matchedItemObj.historico_item.map((h: any) => {
              let unit = 0;
              if (h.valor_unitario) {
                unit = parseFloat(String(h.valor_unitario).replace(/\./g, '').replace(',', '.'));
              }
              return {
                dataTermo: h.data_termo || '',
                valorUnitario: isNaN(unit) ? 0 : unit,
                quantidade: parseInt(h.quantidade || '0', 10),
                tipoHistorico: h.tipo_historico
              };
            }).filter((h: any) => h.valorUnitario > 0);
          }
        }
      }
    }

    // 2. Fallback: Compras.gov.br Dados Abertos (/modulo-contratos/2.1_consultarContratosItem_Id)
    if (quantidadeContratada == null && pertenceAoItem !== false && numeroControlePncp) {
      const itemsComprasGov = await fetchContratoItensComprasGov(numeroControlePncp);
      if (itemsComprasGov.length > 0) {
        if (numeroItemDesejado) {
          const numDesejado = parseInt(numeroItemDesejado, 10);
          const matchedItem = itemsComprasGov.find(i => {
            const numI = parseInt(i.numeroItem || '', 10) || i.codigoItem;
            return numI === numDesejado;
          });
          if (matchedItem) {
            pertenceAoItem = true;
            if (matchedItem.quantidadeItem !== undefined && matchedItem.quantidadeItem !== null) {
              quantidadeContratada = matchedItem.quantidadeItem;
              valorUnitarioItem = matchedItem.valorUnitarioItem ?? null;
              valorTotalItem = matchedItem.valorTotalItem ?? null;
              numeroItemContratado = matchedItem.numeroItem;
            }
          } else {
            pertenceAoItem = false;
          }
        } else {
          const target = itemsComprasGov[0];
          if (target && target.quantidadeItem !== undefined && target.quantidadeItem !== null) {
            quantidadeContratada = target.quantidadeItem;
            valorUnitarioItem = target.valorUnitarioItem ?? null;
            valorTotalItem = target.valorTotalItem ?? null;
            numeroItemContratado = target.numeroItem;
          }
        }
      }
    }

    // Se confirmou pertencer a outro item do mesmo fornecedor, descarta
    if (numeroItemDesejado && pertenceAoItem === false) {
      return null;
    }

    const orgaoNome = orgaoNomeGov || c.nomeOrgao || detail?.orgaoEntidade?.razaoSocial || c.orgaoEntidade?.razaoSocial || detail?.unidadeOrgao?.nomeUnidade || c.unidadeExecutora?.nomeUnidade;
    const unidadeNome = c.nomeUnidadeGestora || detail?.unidadeOrgao?.nomeUnidade || c.unidadeExecutora?.nomeUnidade;

    return {
      numeroContrato: c.numeroContrato || c.numeroContratoEmpenho || c.numero || '',
      cnpj: contractCnpj,
      anoContrato,
      sequencialContrato,
      contratoId,
      orgaoNome,
      unidadeNome,
      uasg: resolvedUasg,
      tipoUnidade,
      objeto: c.objeto || detail?.objetoContrato || c.objetoContrato,
      valorInicial: c.valorGlobal ?? detail?.valorInicial ?? detail?.valorGlobal,
      nomeRazaoSocialFornecedor: detail?.nomeRazaoSocialFornecedor || c.nomeRazaoSocialFornecedor || fornecedorInfo?.nomeFornecedor,
      niFornecedor: detail?.niFornecedor || c.niFornecedor || fornecedorInfo?.niFornecedor,
      dataAssinatura: c.dataAssinatura || detail?.dataAssinatura,
      dataVigenciaInicial: c.dataVigenciaInicial || detail?.dataVigenciaInicio || c.dataVigenciaInicio,
      dataVigenciaFinal: c.dataVigenciaFinal || detail?.dataVigenciaFim || c.dataVigenciaFim,
      numeroControlePncp,
      quantidadeContratada,
      valorUnitarioItem,
      valorTotalItem,
      numeroItemContratado,
      linkVisualizacao: linkVisualizacao || undefined,
      historicoPrecos
    };
  }));

  const uniqueContractsMap = new Map<string, PncpContract>();
  mapped.forEach((c) => {
    if (!c) return;
    const canKey = getCanonicalContractKey(c.numeroContrato, c.anoContrato, c.numeroControlePncp);
    if (canKey) {
      if (!uniqueContractsMap.has(canKey)) {
        uniqueContractsMap.set(canKey, c);
      } else {
        const existing = uniqueContractsMap.get(canKey)!;
        uniqueContractsMap.set(canKey, {
          ...existing,
          ...c,
          contratoId: existing.contratoId || c.contratoId,
          quantidadeContratada: existing.quantidadeContratada ?? c.quantidadeContratada,
          valorUnitarioItem: existing.valorUnitarioItem ?? c.valorUnitarioItem,
          valorTotalItem: existing.valorTotalItem ?? c.valorTotalItem,
          linkVisualizacao: existing.linkVisualizacao || c.linkVisualizacao,
          numeroControlePncp: existing.numeroControlePncp || c.numeroControlePncp,
          historicoPrecos: existing.historicoPrecos || c.historicoPrecos
        });
      }
    } else {
      const fallbackKey = `${c.numeroContrato}-${c.anoContrato}-${c.uasg}`;
      if (!uniqueContractsMap.has(fallbackKey)) {
        uniqueContractsMap.set(fallbackKey, c);
      }
    }
  });

  return Array.from(uniqueContractsMap.values());
}

/**
 * 6. Consultar Empenhos do Contrato no PNCP
 * Endereço: /api/pncp/v1/orgaos/{cnpj}/contratos/{ano}/{sequencialContrato}/empenhos
 */
export async function fetchPncpContractEmpenhos(
  cnpj: string,
  ano: string,
  sequencialContrato: string
): Promise<PncpContractEmpenho[]> {
  const url = `/api-pncp/api/pncp/v1/orgaos/${cnpj}/contratos/${ano}/${sequencialContrato}/empenhos`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.data)) {
      return data.data;
    }
    return [];
  } catch (error) {
    console.warn("Falha na consulta de empenhos do contrato PNCP.", error);
    return [];
  }
}

/**
 * 7. Consultar Adesões do Item (Caronas Externas)
 * Endereço: /modulo-arp/5_consultarAdesoesItem
 */
export async function fetchAdesoesItem(
  numeroAta: string,
  unidadeGerenciadora: string,
  numeroItem: string
): Promise<AdesoesItemResponse> {
  const formattedItem = (numeroItem || '').toString().padStart(5, '0');
  
  try {
    let currentPage = 1;
    let hasMorePages = true;
    const allRecords: AdesaoItemRecord[] = [];

    while (hasMorePages) {
      const queryParams = {
        pagina: currentPage,
        tamanhoPagina: 500,
        numeroAta,
        unidadeGerenciadora,
        numeroItem: formattedItem
      };

      const url = `${BASE_URL}/5_consultarAdesoesItem${buildQueryString(queryParams)}`;
      const response = await fetch(url);
      if (!response.ok) {
        // Se a API retornar erro ou 404, tenta também com numeroItem sem formatação
        if (formattedItem !== numeroItem) {
          const fallbackParams = {
            pagina: currentPage,
            tamanhoPagina: 500,
            numeroAta,
            unidadeGerenciadora,
            numeroItem
          };
          const fbResponse = await fetch(`${BASE_URL}/5_consultarAdesoesItem${buildQueryString(fallbackParams)}`);
          if (fbResponse.ok) {
            const fbData = await fbResponse.json() as AdesoesItemResponse;
            if (fbData.resultado && fbData.resultado.length > 0) {
              allRecords.push(...fbData.resultado);
            }
          }
        }
        break;
      }

      const data = await response.json() as AdesoesItemResponse;
      if (data.resultado && data.resultado.length > 0) {
        allRecords.push(...data.resultado);
      }

      if (data.paginasRestantes && data.paginasRestantes > 0) {
        currentPage++;
      } else {
        hasMorePages = false;
      }
    }

    return {
      resultado: allRecords,
      totalRegistros: allRecords.length,
      totalPaginas: 1,
      paginasRestantes: 0
    };
  } catch (error) {
    console.warn("Falha na consulta de adesões do item (caronas).", error);
    return { resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 };
  }
}

