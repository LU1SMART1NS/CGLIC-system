import type { ArpResponse, ArpItemsResponse, ArpItemRecord, UnidadesItemResponse, FilterParams, ArpRecord, EmpenhosSaldoItemResponse, EmpenhoSaldoItemRecord, PncpContractEmpenho, AdesoesItemResponse, AdesaoItemRecord, ComprasGovContratoItemRecord, ComprasGovContratosItemResponse, ContratosGovEmpenhoRecord } from '../types';
import { cacheArpsInDb, cacheArpItemsInDb, fetchArpsFromDb } from './dbCacheService';
import type { ContratosGovHistoricoRecord } from '../types/contractHistorico';
import type { ContratosGovResponsavelRecord, ContratosGovGarantiaRecord } from '../types/contractResponsaveis';
import { CNPJ_SENASP } from '../config/unidadesGestoras';

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
 * Exportada para reuso em contractService.ts (endpoint /modulo-contratos/1_consultarContratos
 * tem o MESMO limite de 365 dias por chamada, confirmado por sondagem read-only em produção).
 */
export function splitDateRange(startDateStr: string, endDateStr: string): { start: string; end: string }[] {
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

/** Erro de rede do navegador (servidor local fora do ar, conexão caiu): não é resposta da fonte. */
function isErroDeRede(err: unknown): boolean {
  return err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String((err as Error)?.message ?? err));
}

/**
 * GET com novas tentativas quando a conexão cai ou a fonte responde 429 (limite de requisições) ou 5xx.
 * Espera 2 s, depois 4 s, 8 s... (ou o que a fonte pedir em Retry-After, até 15 s).
 * Usado pela sincronização, que não pode tratar recusa da fonte como "não há dados".
 */
async function fetchComNovaTentativa(url: string, fonte: string, tentativas = 2): Promise<Response> {
  const esperar = (tentativa: number, response?: Response) => {
    const pedido = Number(response?.headers.get('retry-after'));
    const ms = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, 15) * 1000 : 2000 * 2 ** (tentativa - 1);
    return new Promise((r) => setTimeout(r, ms));
  };
  for (let tentativa = 1; ; tentativa++) {
    try {
      const response = await fetch(url);
      if ((response.status === 429 || response.status >= 500) && tentativa < tentativas) {
        await esperar(tentativa, response);
        continue;
      }
      return response;
    } catch (err) {
      if (tentativa < tentativas && isErroDeRede(err)) {
        await esperar(tentativa);
        continue;
      }
      if (isErroDeRede(err)) {
        throw new Error(`Sem conexão com o ${fonte}: a consulta não chegou à fonte oficial (falha de rede ou servidor local fora do ar).`);
      }
      throw err;
    }
  }
}

/** A fonte recusou ou falhou (429, 5xx): diferente de "não há dados". */
export class FonteIndisponivelError extends Error {
  constructor(fonte: string, status: number) {
    super(status === 429
      ? `${fonte} recusou por excesso de requisições (429).`
      : `${fonte} respondeu ${status}.`);
    this.name = 'FonteIndisponivelError';
  }
}

/**
 * Atas da UASG direto das fontes oficiais (Compras.gov.br + atas suplementares do PNCP), já com as
 * vigências do PNCP. Sem cache e sem cair para o banco: se a fonte falhar, lança erro.
 * Usada pela sincronização (sincronizarAtas), que precisa saber se a consulta deu certo.
 */
export async function fetchArpsDasFontes(params: FilterParams): Promise<ArpRecord[]> {
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
      const response = await fetchComNovaTentativa(url, 'Compras.gov.br');
      if (!response.ok) {
        throw new Error(`Compras.gov.br respondeu ${response.status} na consulta de atas.`);
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

  // Enriquece com vigências oficiais do PNCP (prorrogações e cancelamentos)
  const allArps = await enrichArpsBatchWithPncpVigencia(Array.from(allArpsMap.values()));
  allArps.sort((a, b) => b.dataVigenciaFinal.localeCompare(a.dataVigenciaFinal));
  return allArps;
}

/**
 * Esvazia os caches em memória das consultas de atas (lista, vigências PNCP, atas suplementares e itens).
 * A sincronização chama antes de começar: sem isso, uma segunda sincronização na mesma sessão
 * reaproveitaria as respostas da primeira e não traria prorrogações nem itens novos.
 */
export function limparCachesAtas(): void {
  arpsMemoryCache.clear();
  pncpVigenciaCache.clear();
  supplementalPncpArpsCache = null;
  pncpCompraItemsCache.clear();
  memoryItemsCache.clear();
  itensComprasQueryCache.clear();
}

/**
 * 1. Consultar ARP
 * Endereço: /modulo-arp/1_consultarARP
 * Com cache em memória por consulta; se a fonte falhar, devolve o que está no banco.
 */
export async function fetchArps(params: FilterParams): Promise<ArpResponse> {
  const cacheKey = `${params.codigoUnidadeGerenciadora || 'ALL'}_${params.dataVigenciaInicialMin}_${params.dataVigenciaInicialMax}`;

  try {
    let allArps: ArpRecord[] = [];

    if (arpsMemoryCache.has(cacheKey)) {
      allArps = arpsMemoryCache.get(cacheKey)!;
    } else {
      allArps = await fetchArpsDasFontes(params);
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
  /** Data em que a ata foi divulgada no PNCP (YYYY-MM-DDTHH:mm:ss). */
  dataPublicacaoPncp?: string;
  /** Número da ata como o PNCP o guarda ("00059"); com `anoAta` forma "00059/2025". */
  numeroAtaRegistroPreco?: string;
  anoAta?: number | string;
  /** UASG da unidade gerenciadora da ata. */
  codigoUnidade?: string;
  /** Se a ata aceita adesão (carona). Ausente quando o PNCP não informa. */
  possibilidadeAdesao?: boolean;
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
        dataAtualizacao: data.dataAtualizacao || data.dataAtualizacaoGlobal,
        dataPublicacaoPncp: data.dataPublicacaoPncp,
        numeroAtaRegistroPreco: data.numeroAtaRegistroPreco,
        anoAta: data.anoAta,
        codigoUnidade: data.unidadeOrgao?.codigoUnidade,
        possibilidadeAdesao: typeof data.possibilidadeAdesao === 'boolean' ? data.possibilidadeAdesao : undefined
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

  const cnpj = CNPJ_SENASP;
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

/**
 * Itens que podem ser atribuídos a uma ata sem saber o fornecedor dela: só quando todos são de um único fornecedor
 * (matriz e filiais, que compartilham a raiz do CNPJ, contam como o mesmo). Com mais de um, devolve vazio.
 */
export function itensSeUmFornecedor<T extends { niFornecedor?: string; nomeRazaoSocialFornecedor?: string }>(items: T[]): T[] {
  const chaves = new Set(
    items.map((i) => {
      const ni = (i.niFornecedor || '').trim().toUpperCase();
      const digitos = ni.replace(/\D/g, '');
      if (digitos.length === 14) return digitos.slice(0, 8);
      return ni || (i.nomeRazaoSocialFornecedor || '').trim().toUpperCase();
    })
  );
  return chaves.size <= 1 ? items : [];
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
  const cnpj = (customCnpj || CNPJ_SENASP).replace(/\D/g, '');
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
/**
 * A fonte às vezes publica o mesmo item da ata duas vezes (mesmo número, mesmos dados, outra data de
 * inclusão). Fica só a publicação mais recente: sem isso, a ata mostrava itens em dobro e o banco
 * recusava gravar (dois itens com o mesmo número na mesma ata).
 */
export function deduplicarItensPorNumero(itens: ArpItemRecord[]): ArpItemRecord[] {
  const porNumero = new Map<string, ArpItemRecord>();
  for (const item of itens) {
    const chave = String(item.numeroItem || '');
    const atual = porNumero.get(chave);
    if (!chave || !atual || String(item.dataHoraInclusao || '') > String(atual.dataHoraInclusao || '')) {
      porNumero.set(chave || `sem-numero-${porNumero.size}`, item);
    }
  }
  return Array.from(porNumero.values());
}

/**
 * Consultas de itens do Compras.gov.br já feitas (por endereço). A mesma consulta (o ano inteiro, ou um
 * dia com várias atas) se repetia para cada ata e estourava o limite de requisições da fonte.
 * Guarda a promessa: consultas simultâneas iguais dividem uma só. Falha não fica guardada.
 */
const itensComprasQueryCache = new Map<string, Promise<ArpItemsResponse>>();

function consultarItensCompras(url: string): Promise<ArpItemsResponse> {
  const emCache = itensComprasQueryCache.get(url);
  if (emCache) return emCache;
  const promessa = (async () => {
    const response = await fetchComNovaTentativa(url, 'Compras.gov.br', 4);
    if (!response.ok) throw new FonteIndisponivelError('Compras.gov.br', response.status);
    return await response.json() as ArpItemsResponse;
  })();
  itensComprasQueryCache.set(url, promessa);
  promessa.catch(() => itensComprasQueryCache.delete(url));
  return promessa;
}

/**
 * Itens da ata. `estrito` (sincronização): se a fonte recusar ou falhar, lança erro em vez de devolver
 * a ata sem itens, para a sincronização contar a falha e tentar de novo depois.
 */
export async function fetchArpItems(
  dataVigenciaInicial: string,
  codigoUnidadeGerenciadora: string,
  numeroAtaRegistroPreco: string,
  arpContext?: Partial<ArpRecord> | string,
  opts: { estrito?: boolean } = {}
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

  const executeQuery = async (minDate: string, maxDate: string): Promise<ArpItemsResponse | null> => {
    const queryParams = {
      pagina: 1,
      tamanhoPagina: 500,
      codigoUnidadeGerenciadora,
      dataVigenciaInicialMin: minDate,
      dataVigenciaInicialMax: maxDate
    };
    const url = `${BASE_URL}/2_consultarARPItem${buildQueryString(queryParams)}`;
    try {
      return await consultarItensCompras(url);
    } catch (err) {
      // Na sincronização, recusa da fonte é falha (a ata fica para a próxima); nas telas, segue como antes.
      if (opts.estrito) throw err;
      return null;
    }
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
        // Uma compra pode gerar várias atas, cada uma de um fornecedor. Sem o fornecedor da ata, não dá para saber quais
        // itens são dela: melhor não gravar nada do que gravar itens de outra ata (e ficar para sempre no banco).
        if (!cnpjFornecedor) {
          const itensDaCompra = foundItems;
          foundItems = itensSeUmFornecedor(foundItems);
          if (foundItems.length === 0 && itensDaCompra.length > 0) {
            console.warn(`Ata ${numeroAtaRegistroPreco}: a compra ${seqCompra}/${anoCompra} tem mais de um fornecedor e a ata não informa qual é o dela; itens não carregados pelo PNCP.`);
          }
        }
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

      foundItems = deduplicarItensPorNumero(foundItems);
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
    if (opts.estrito) throw error;
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

/** Tempo máximo de espera pela lista de empenhos de um contrato (Contratos.gov.br e PNCP). */
export const TEMPO_LIMITE_EMPENHOS_MS = 30_000;
/** Tempo máximo de espera pela minuta de um empenho. */
const TEMPO_LIMITE_DETALHE_EMPENHO_MS = 15_000;

/** Erro de uma consulta que não terminou no tempo limite. Quem chama pode tentar de novo. */
export class TempoEsgotadoError extends Error {
  constructor(fonte: string, ms: number) {
    super(`${fonte} não respondeu em ${Math.round(ms / 1000)} s.`);
    this.name = 'TempoEsgotadoError';
  }
}

/** fetch que desiste depois de `ms` milissegundos, com mensagem legível em falha de rede ou de tempo. */
async function fetchComTempoLimite(url: string, ms: number, fonte: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err: any) {
    if (controller.signal.aborted) throw new TempoEsgotadoError(fonte, ms);
    throw new Error(`Falha de rede ao consultar o ${fonte}: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consulta empenhos do contrato no Contratos.gov.br (comprasnet)
 * Endpoint: GET /api/contrato/{contrato_id}/empenhos
 */
export async function fetchContratosGovEmpenhos(
  contratoId: string | number
): Promise<ContratosGovEmpenhoRecord[]> {
  // Lista vazia só quando o Contratos.gov.br respondeu que o contrato não tem empenho (HTTP 200 com []).
  // Falha de rede, tempo esgotado ou HTTP de erro viram exceção: quem chama não pode confundir
  // "a fonte falhou" com "o contrato não tem empenho" (a sincronização do item apagaria os empenhos dele).
  const res = await fetchComTempoLimite(
    `/api-contratos-gov/api/contrato/${contratoId}/empenhos`,
    TEMPO_LIMITE_EMPENHOS_MS,
    'Contratos.gov.br'
  );
  if (!res.ok) {
    throw new Error(`Contratos.gov.br respondeu ${res.status} ao listar os empenhos do contrato (id ${contratoId}).`);
  }
  const data = await res.json().catch(() => {
    throw new Error(`Contratos.gov.br devolveu uma resposta ilegível para os empenhos do contrato (id ${contratoId}).`);
  });
  if (!Array.isArray(data)) {
    throw new Error(`Contratos.gov.br devolveu um formato inesperado para os empenhos do contrato (id ${contratoId}).`);
  }
  return data;
}

/**
 * Faturas (instrumentos de cobrança) do contrato no Contratos.gov.br.
 * Endpoint aberto: GET /api/contrato/{contrato_id}/faturas. Lança erro se a fonte falhar; lista vazia só
 * quando ela responde que o contrato não tem fatura.
 */
export async function fetchContratosGovFaturas(contratoId: string | number): Promise<any[]> {
  const res = await fetchComTempoLimite(
    `/api-contratos-gov/api/contrato/${contratoId}/faturas`,
    TEMPO_LIMITE_EMPENHOS_MS,
    'Contratos.gov.br'
  );
  if (!res.ok) {
    throw new Error(`Contratos.gov.br respondeu ${res.status} ao listar as faturas do contrato (id ${contratoId}).`);
  }
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) {
    throw new Error(`Contratos.gov.br devolveu um formato inesperado para as faturas do contrato (id ${contratoId}).`);
  }
  return data;
}

/**
 * Ordens bancárias de uma nota de pagamento (NP) no Tesouro Nacional (STA).
 * Endpoint aberto: GET https://sta.api.gov.br/api/ordembancaria/documento/{UG}{gestão}{NP}; a gestão das
 * UASGs da CGLIC é 00001 (com 30911 a consulta volta vazia). Lista vazia: a NP ainda não foi paga.
 */
export async function fetchOrdensBancariasDaNp(ug: string, np: string, gestao = '00001'): Promise<any[]> {
  const res = await fetchComTempoLimite(
    `/api-sta/api/ordembancaria/documento/${ug}${gestao}${np}`,
    TEMPO_LIMITE_EMPENHOS_MS,
    'Tesouro (STA)'
  );
  if (!res.ok) {
    throw new Error(`Tesouro (STA) respondeu ${res.status} ao consultar as ordens bancárias da ${np}.`);
  }
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) {
    throw new Error(`Tesouro (STA) devolveu um formato inesperado para as ordens bancárias da ${np}.`);
  }
  return data;
}

/** Opção das consultas por contrato: lançar em vez de devolver vazio, para a falha não virar "não há". */
export interface OpcoesLeituraContratosGov {
  falharSeErro?: boolean;
}

/** Lê uma lista do Contratos.gov.br. Sem `falharSeErro`, a falha vira lista vazia (comportamento antigo). */
async function lerListaContratosGov<T>(url: string, descricao: string, opts: OpcoesLeituraContratosGov): Promise<T[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`O Contratos.gov.br respondeu ${res.status} ao consultar ${descricao}.`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error(`O Contratos.gov.br devolveu um formato inesperado para ${descricao}.`);
    return data as T[];
  } catch (e) {
    if (opts.falharSeErro) throw e;
    console.warn(`Falha na consulta de ${descricao} no Contratos.gov.br`, e);
    return [];
  }
}

/**
 * Consulta o histórico do contrato (celebração, termos aditivos e apostilamentos) no Contratos.gov.br
 * Endpoint: GET /api/contrato/{contrato_id}/historico
 */
export async function fetchContratosGovHistorico(
  contratoId: string | number,
  opts: OpcoesLeituraContratosGov = {}
): Promise<ContratosGovHistoricoRecord[]> {
  return lerListaContratosGov(`/api-contratos-gov/api/contrato/${contratoId}/historico`, `histórico do contrato (id=${contratoId})`, opts);
}

/**
 * Consulta os responsáveis do contrato (gestor, fiscais e substitutos) no Contratos.gov.br
 * Endpoint: GET /api/contrato/{contrato_id}/responsaveis
 */
export async function fetchContratosGovResponsaveis(
  contratoId: string | number,
  opts: OpcoesLeituraContratosGov = {}
): Promise<ContratosGovResponsavelRecord[]> {
  return lerListaContratosGov(`/api-contratos-gov/api/contrato/${contratoId}/responsaveis`, `responsáveis do contrato (id=${contratoId})`, opts);
}

/**
 * Consulta as garantias do contrato no Contratos.gov.br
 * Endpoint: GET /api/contrato/{contrato_id}/garantias
 */
export async function fetchContratosGovGarantias(
  contratoId: string | number,
  opts: OpcoesLeituraContratosGov = {}
): Promise<ContratosGovGarantiaRecord[]> {
  return lerListaContratosGov(`/api-contratos-gov/api/contrato/${contratoId}/garantias`, `garantias do contrato (id=${contratoId})`, opts);
}

/**
 * Consulta o detalhe do empenho e seus itens na API do Contratos.gov.br
 * Endpoint: GET /api/v1/contrato/empenho/consultar/{empenho_id}
 */
export async function fetchContratoEmpenhoDetalhe(
  empenhoId: string | number
): Promise<{ itens_minuta?: any[] } | null> {
  // A minuta exige token no Contratos.gov.br (401 sem ele): null quando não vem, sem interromper a sincronização.
  try {
    const res = await fetchComTempoLimite(
      `/api-contratos-gov/api/v1/contrato/empenho/consultar/${empenhoId}`,
      TEMPO_LIMITE_DETALHE_EMPENHO_MS,
      'Contratos.gov.br'
    );
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

  const response = await fetchComTempoLimite(url, TEMPO_LIMITE_EMPENHOS_MS, 'PNCP');
  // 404 é a resposta do PNCP para "nenhum empenho do contrato"; 400, parâmetro que o PNCP não aceita.
  // Nos dois casos não há o que ler. Limite de requisições (429) e erro do servidor são falha da fonte.
  if (response.status === 429 || response.status >= 500) {
    throw new Error(`PNCP respondeu ${response.status} ao listar os empenhos do contrato.`);
  }
  if (!response.ok) {
    return [];
  }
  const data = await response.json().catch(() => null);
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.data)) {
    return data.data;
  }
  return [];
}

/**
 * 7. Consultar Adesões do Item (Caronas Externas)
 * Endereço: /modulo-arp/5_consultarAdesoesItem
 */
export async function fetchAdesoesItem(
  numeroAta: string,
  unidadeGerenciadora: string,
  numeroItem: string,
  /** falharSeErro: lança em vez de devolver vazio (a sincronização não pode confundir falha com "sem adesões"). */
  opts: { falharSeErro?: boolean } = {}
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
            break;
          }
        }
        if (opts.falharSeErro) throw new Error(`HTTP error! status: ${response.status}`);
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
    if (opts.falharSeErro) throw error;
    console.warn("Falha na consulta de adesões do item (caronas).", error);
    return { resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 };
  }
}

