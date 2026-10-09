import type { ArpResponse, ArpItemsResponse, ArpItemRecord, UnidadesItemResponse, FilterParams, ArpRecord, EmpenhosSaldoItemResponse, EmpenhoSaldoItemRecord, PncpContractEmpenho, AdesoesItemResponse, AdesaoItemRecord, ComprasGovContratoItemRecord, ComprasGovContratosItemResponse, ContratosGovEmpenhoRecord } from '../types';
import { cacheArpsInDb, cacheArpItemsInDb, fetchArpsFromDb } from './dbCacheService';
import type { ContratosGovHistoricoRecord } from '../types/contractHistorico';
import type { ContratosGovResponsavelRecord, ContratosGovGarantiaRecord } from '../types/contractResponsaveis';
import { CNPJ_SENASP, cnpjDaUasg, codigoOrgaoDaUasg } from '../config/unidadesGestoras';

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
export function buildQueryString(params: Record<string, string | number | undefined>): string {
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
export async function fetchComNovaTentativa(url: string, fonte: string, tentativas = 2): Promise<Response> {
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
export async function fetchArpsDasFontes(params: FilterParams, fornecedor: OpcoesFornecedorPncp = {}): Promise<ArpRecord[]> {
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

  // Atas que o PNCP já publicou e o Compras.gov.br ainda não entrega (ex.: 00042, 00043 e 00044/2026 em out/2026).
  // Falha do PNCP não derruba a lista do Compras.gov.br: essas atas entram na próxima execução.
  if (params.codigoUnidadeGerenciadora) {
    try {
      const prazo = Date.now() + PRAZO_ATAS_SO_NO_PNCP_MS;
      // O prazo é conferido entre chamadas; a corrida corta uma chamada pendurada perto do fim (até 30 s cada).
      let cortar: ReturnType<typeof setTimeout> | undefined;
      const soNoPncp = await Promise.race([
        fetchAtasSoNoPncp(params.codigoUnidadeGerenciadora, Array.from(allArpsMap.values()), new Date(), prazo, fornecedor),
        new Promise<never>((_, rejeitar) => { cortar = setTimeout(() => rejeitar(new Error('prazo da busca no PNCP esgotado')), PRAZO_ATAS_SO_NO_PNCP_MS + 5_000); })
      ]).finally(() => clearTimeout(cortar));
      for (const arp of soNoPncp) {
        allArpsMap.set(`${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`, arp);
      }
    } catch (err) {
      console.warn(`[atas] lista de atas do PNCP da UASG ${params.codigoUnidadeGerenciadora} não consultada; atas que só estão no PNCP ficam para a próxima execução.`, err);
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
  pncpCompraCache.clear();
  pncpCompraItemsCache.clear();
  pncpAtasDaCompraCache.clear();
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
const pncpCompraItemsCache = new Map<string, ArpItemRecord[]>();

/** Cadastro da compra no PNCP: o que o sistema usa dele. */
export interface PncpCompraInfo {
  /** Número da compra no Compras.gov.br ("90039"), o mesmo que os contratos citam. Não é o sequencial do PNCP. */
  numeroCompra?: string;
  modalidadeId?: number;
  modalidadeNome?: string;
  processo?: string;
}

/** Cadastro da compra por número de controle (promessa guardada; falha não fica guardada). */
const pncpCompraCache = new Map<string, Promise<PncpCompraInfo | null>>();

/**
 * Cadastro da compra no PNCP. Devolve null quando a consulta falhou (tentar de novo depois).
 * Endpoint: GET /api-pncp/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{seqCompra}
 */
export function fetchPncpCompra(numeroControlePncpCompra?: string): Promise<PncpCompraInfo | null> {
  const match = (numeroControlePncpCompra || '').match(/^(\d{14})-1-0*(\d+)\/(\d{4})$/);
  if (!match) return Promise.resolve(null);
  const chave = `${match[1]}-${match[2]}/${match[3]}`;
  const emCache = pncpCompraCache.get(chave);
  if (emCache) return emCache;
  const promessa = (async (): Promise<PncpCompraInfo | null> => {
    try {
      const res = await fetch(`/api-pncp/api/consulta/v1/orgaos/${match[1]}/compras/${match[3]}/${match[2]}`);
      if (!res.ok) return null;
      const data = await res.json();
      return {
        numeroCompra: typeof data?.numeroCompra === 'string' ? data.numeroCompra.trim() : undefined,
        modalidadeId: typeof data?.modalidadeId === 'number' ? data.modalidadeId : undefined,
        modalidadeNome: typeof data?.modalidadeNome === 'string' ? data.modalidadeNome : undefined,
        processo: typeof data?.processo === 'string' ? data.processo.trim() : ''
      };
    } catch {
      return null;
    }
  })();
  pncpCompraCache.set(chave, promessa);
  promessa.then((r) => { if (r === null) pncpCompraCache.delete(chave); });
  return promessa;
}

/**
 * Processo administrativo da compra, lido do cadastro da compra no PNCP (campo `processo`, só dígitos).
 * O Compras.gov.br não o traz para atas e itens. O número pertence à compra: ata, itens e contratos dela o dividem.
 * Devolve o texto ('' quando o PNCP responde mas não informa) ou null quando a consulta falhou (tentar de novo depois).
 */
export async function fetchPncpProcessoCompra(numeroControlePncpCompra?: string): Promise<string | null> {
  const compra = await fetchPncpCompra(numeroControlePncpCompra);
  return compra ? compra.processo ?? '' : null;
}

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

/**
 * Identificador do fornecedor como o PNCP o publica, comparável: CNPJ só com dígitos ou, para fornecedor estrangeiro
 * (sem CNPJ), o código do SICAF ("ESTRANG0000440"). Comparar só dígitos deixaria passar: "ESTRANG0000440" viraria
 * "0000440".
 */
export function normalizarIdentificadorFornecedor(valor?: string | null): string {
  return (valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Fornecedor com resultado publicado nos itens de uma compra do PNCP (candidato a fornecedor de uma ata da compra). */
export interface CandidatoFornecedorPncp {
  identificador: string;
  nome: string;
  itens: Array<{ numeroItem: number; descricao: string; quantidade: number; valorUnitario: number; valorTotal: number }>;
}

/**
 * Ata cujo fornecedor o PNCP não informa e a compra tem mais de uma ata (ou mais de um fornecedor): a sincronização
 * detecta, grava em atas_fornecedor_pncp e o coordenador indica o fornecedor entre os candidatos.
 */
export interface PendenciaFornecedorPncp {
  numeroControlePncpAta: string;
  numeroAta: string;
  uasg: string;
  numeroControlePncpCompra: string;
  numeroCompra?: string;
  anoCompra: string;
  /** Atas não canceladas que a compra gerou no PNCP. */
  atasNaCompra: number;
  candidatos: CandidatoFornecedorPncp[];
  itensSemResultado: Array<{ numeroItem: number; descricao: string; quantidade: number }>;
}

/** O que a sincronização passa às consultas do PNCP: a indicação do coordenador e para onde vai a pendência detectada. */
export interface OpcoesFornecedorPncp {
  /** Identificador do fornecedor indicado pelo coordenador para a ata (pelo número de controle PNCP da ata). */
  fornecedorIndicado?: (numeroControlePncpAta: string) => string | undefined;
  /** Chamado quando os itens não podem ser atribuídos por falta do fornecedor da ata. */
  aoDetectarPendencia?: (pendencia: PendenciaFornecedorPncp) => void;
}

/** Ata como a lista de atas do PNCP a devolve (/api/consulta/v1/atas). */
interface PncpAtaDaLista {
  numeroControlePNCPAta: string;
  numeroControlePNCPCompra?: string;
  numeroAtaRegistroPreco: string;
  anoAta: number | string;
  cancelado?: boolean;
  dataAssinatura?: string;
  vigenciaInicio?: string;
  vigenciaFim?: string;
  dataPublicacaoPncp?: string;
  dataInclusao?: string;
  dataAtualizacao?: string;
  dataAtualizacaoGlobal?: string;
  objetoContratacao?: string;
  nomeOrgao?: string;
  codigoUnidadeOrgao?: string;
  nomeUnidadeOrgao?: string;
}

/** Modalidade do PNCP → código de modalidade do Compras.gov.br (parte do identificador da compra). */
const MODALIDADE_COMPRAS_POR_PNCP: Record<number, string> = { 4: '03', 5: '03', 6: '05', 7: '05', 8: '06', 9: '07' };

const formatarDataPncp = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

/**
 * Tempo máximo da busca de atas que só estão no PNCP, dentro da lista de atas. Cada chamada pode ficar pendurada até
 * 30 s (proxy de fontes do servidor); sem prazo, em 08/10/2026 a lista inteira passou dos 150 s da Edge Function.
 * Estourado, as atas que faltaram entram na próxima execução.
 */
export const PRAZO_ATAS_SO_NO_PNCP_MS = 45_000;

/** Número da ata no formato do Compras.gov.br ("00043/2026"). */
export function numeroAtaDoPncp(ata: Pick<PncpAtaDaLista, 'numeroAtaRegistroPreco' | 'anoAta'>): string {
  return `${String(ata.numeroAtaRegistroPreco).replace(/\D/g, '').padStart(5, '0')}/${ata.anoAta}`;
}

/**
 * Atas da UASG publicadas no PNCP, de todas as páginas. O PNCP filtra pela vigência e aceita no máximo 365 dias por
 * consulta: pedem-se o último ano e o próximo, o que cobre toda ata vigente hoje ou que começa no próximo ano.
 * Lança erro se o PNCP recusar (a lista sairia incompleta).
 */
async function fetchListaAtasPncpDaUasg(uasg: string, agora: Date, prazo: number): Promise<PncpAtaDaLista[]> {
  const cnpj = cnpjDaUasg(uasg);
  if (!cnpj) return [];
  const dia = 24 * 60 * 60 * 1000;
  const janelas = [
    [new Date(agora.getTime() - 364 * dia), agora],
    [new Date(agora.getTime() + dia), new Date(agora.getTime() + 365 * dia)]
  ];
  const atas: PncpAtaDaLista[] = [];
  for (const [inicio, fim] of janelas) {
    for (let pagina = 1; ; pagina++) {
      if (Date.now() > prazo) throw new Error('prazo da lista de atas do PNCP esgotado');
      const url = `/api-pncp/api/consulta/v1/atas${buildQueryString({
        dataInicial: formatarDataPncp(inicio),
        dataFinal: formatarDataPncp(fim),
        cnpj,
        codigoUnidadeAdministrativa: uasg,
        pagina,
        tamanhoPagina: 50
      })}`;
      const res = await fetchComNovaTentativa(url, 'PNCP', 2);
      if (res.status === 204) break;
      if (!res.ok) throw new FonteIndisponivelError('PNCP', res.status);
      const data = await res.json();
      const lista: PncpAtaDaLista[] = Array.isArray(data?.data) ? data.data : [];
      atas.push(...lista);
      if (lista.length === 0 || pagina >= (Number(data?.totalPaginas) || 1)) break;
    }
  }
  return atas.filter((a) => !a.codigoUnidadeOrgao || String(a.codigoUnidadeOrgao) === uasg);
}

/**
 * Atas da UASG que estão no PNCP e não vieram do Compras.gov.br (`conhecidas`). Uma ata é conhecida pelo número de
 * controle PNCP ou pelo número: o PNCP às vezes numera diferente (a 00068/2024 do Compras.gov.br é a "90068" no PNCP).
 * O Compras.gov.br demora semanas para receber as atas publicadas pelo Contratos.gov.br; o PNCP as tem no mesmo dia.
 * Quando o mesmo número aparece mais de uma vez (ata cancelada e publicada de novo), vale a não cancelada mais recente.
 * Número da compra e modalidade vêm do cadastro da compra no PNCP; valor e quantidade de itens, dos itens que se
 * consegue atribuir à ata com certeza (itensDaAtaPeloPncp). Ata cuja compra ou itens o PNCP não entregou fica para a
 * próxima execução: gravá-la assim trocaria o número da compra pelo sequencial do PNCP e o valor por zero.
 * Vão primeiro as não canceladas e as publicadas há menos tempo; esgotado o `prazo` (ms desde 1970), devolve as que já
 * montou. Lança erro se a lista do PNCP não vier.
 */
export async function fetchAtasSoNoPncp(
  uasg: string,
  conhecidas: Array<Pick<ArpRecord, 'numeroAtaRegistroPreco' | 'numeroControlePncpAta'>>,
  agora: Date = new Date(),
  prazo: number = Date.now() + PRAZO_ATAS_SO_NO_PNCP_MS,
  fornecedor: OpcoesFornecedorPncp = {}
): Promise<ArpRecord[]> {
  const lista = await fetchListaAtasPncpDaUasg(uasg, agora, prazo);
  const numerosConhecidos = new Set(conhecidas.map((a) => a.numeroAtaRegistroPreco));
  const controlesConhecidos = new Set(conhecidas.map((a) => a.numeroControlePncpAta).filter(Boolean));

  const porNumero = new Map<string, PncpAtaDaLista>();
  for (const ata of lista) {
    const numero = numeroAtaDoPncp(ata);
    if (numerosConhecidos.has(numero) || controlesConhecidos.has(ata.numeroControlePNCPAta)) continue;
    const atual = porNumero.get(numero);
    const melhor = !atual
      || (!!atual.cancelado && !ata.cancelado)
      || (!!atual.cancelado === !!ata.cancelado && String(ata.dataPublicacaoPncp || '') > String(atual.dataPublicacaoPncp || ''));
    if (melhor) porNumero.set(numero, ata);
  }

  const ordem = Array.from(porNumero.entries()).sort(([, a], [, b]) =>
    Number(!!a.cancelado) - Number(!!b.cancelado) || String(b.dataPublicacaoPncp || '').localeCompare(String(a.dataPublicacaoPncp || '')));
  const novas: ArpRecord[] = [];
  for (const [numero, ata] of ordem) {
    if (Date.now() > prazo) {
      console.warn(`[atas] prazo da busca no PNCP esgotado; ${ordem.length - novas.length} ata(s) ficam para a próxima execução.`);
      break;
    }
    const ctrl = parsePncpControlNumber(ata.numeroControlePNCPAta);
    if (!ctrl) continue;
    const ctrlCompra = ata.numeroControlePNCPCompra || `${ctrl.cnpj}-1-${String(ctrl.seqCompra).padStart(6, '0')}/${ctrl.anoCompra}`;
    const compra = await fetchPncpCompra(ctrlCompra);
    const itens = ata.cancelado ? [] : await itensDaAtaPeloPncp(
      { anoCompra: ctrl.anoCompra, seqCompra: ctrl.seqCompra, seqAta: ctrl.seqAta, numeroAta: numero, uasg, cnpj: ctrl.cnpj },
      {
        fornecedorIndicado: fornecedor.fornecedorIndicado?.(ata.numeroControlePNCPAta),
        aoDetectarPendencia: fornecedor.aoDetectarPendencia
          ? (p) => fornecedor.aoDetectarPendencia!({ ...p, numeroControlePncpAta: ata.numeroControlePNCPAta, numeroCompra: compra?.numeroCompra || undefined })
          : undefined
      }
    );
    if (!compra || !itens) {
      console.warn(`[atas] ata ${numero}: o PNCP não entregou ${!compra ? 'o cadastro da compra' : 'os itens'}; fica para a próxima execução.`);
      continue;
    }
    // O número da compra do Compras.gov.br é o que os contratos citam; sem ele (o PNCP não informa), o sequencial do PNCP.
    const numeroCompra = compra.numeroCompra || String(ctrl.seqCompra);
    const codigoModalidade = compra.modalidadeId !== undefined ? MODALIDADE_COMPRAS_POR_PNCP[compra.modalidadeId] || '' : '';
    novas.push({
      numeroAtaRegistroPreco: numero,
      codigoUnidadeGerenciadora: uasg,
      nomeUnidadeGerenciadora: ata.nomeUnidadeOrgao || '',
      codigoOrgao: Number(codigoOrgaoDaUasg(uasg)) || 0,
      nomeOrgao: ata.nomeOrgao || '',
      linkAtaPNCP: `https://pncp.gov.br/app/atas/${ctrl.cnpj}/${ctrl.anoCompra}/${ctrl.seqCompra}/${ctrl.seqAta}`,
      linkCompraPNCP: `https://pncp.gov.br/app/editais/${ctrl.cnpj}/${ctrl.anoCompra}/${String(ctrl.seqCompra).padStart(6, '0')}`,
      numeroCompra,
      anoCompra: ctrl.anoCompra,
      codigoModalidadeCompra: codigoModalidade,
      nomeModalidadeCompra: compra.modalidadeNome || '',
      dataAssinatura: ata.dataAssinatura || '',
      dataVigenciaInicial: (ata.vigenciaInicio || '').split('T')[0],
      dataVigenciaFinal: (ata.vigenciaFim || '').split('T')[0],
      valorTotal: itens.reduce((acc, it) => acc + (it.valorTotal || 0), 0),
      statusAta: ata.cancelado ? 'Cancelada' : 'Ata de Registro de Preços',
      objeto: ata.objetoContratacao || '',
      quantidadeItens: itens.length,
      dataHoraAtualizacao: ata.dataAtualizacaoGlobal || ata.dataAtualizacao || '',
      dataHoraInclusao: ata.dataInclusao || '',
      dataHoraExclusao: null,
      ataExcluido: false,
      numeroControlePncpAta: ata.numeroControlePNCPAta,
      numeroControlePncpCompra: ctrlCompra,
      idCompra: codigoModalidade && compra.numeroCompra ? `${uasg}${codigoModalidade}${compra.numeroCompra}${ctrl.anoCompra}` : '',
      dataVigenciaFinalPncp: (ata.vigenciaFim || '').split('T')[0] || undefined,
      isCanceladaPncp: !!ata.cancelado,
      prorrogadaPncp: false,
      dataAtualizacaoPncp: ata.dataAtualizacaoGlobal || ata.dataAtualizacao
    });
  }
  return novas;
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

/** Ata da compra como o PNCP a lista em /compras/{ano}/{seq}/atas. */
export interface PncpAtaDaCompra {
  sequencialAta?: number;
  numeroAtaRegistroPreco?: string;
  anoAta?: number | string;
  cancelado?: boolean;
}

/** Atas de cada compra no PNCP (promessa guardada por compra; falha não fica guardada). */
const pncpAtasDaCompraCache = new Map<string, Promise<PncpAtaDaCompra[] | null>>();

/**
 * Atas que a compra gerou, canceladas inclusive (/compras/{ano}/{seq}/atas).
 * Devolve null quando não dá para saber (consulta falhou ou a lista veio incompleta).
 */
export function fetchAtasDaCompraPncp(anoCompra: string, seqCompra: number, customCnpj?: string): Promise<PncpAtaDaCompra[] | null> {
  const cnpj = (customCnpj || CNPJ_SENASP).replace(/\D/g, '');
  const chave = `${cnpj}-${anoCompra}-${seqCompra}`;
  const emCache = pncpAtasDaCompraCache.get(chave);
  if (emCache) return emCache;
  const promessa = (async (): Promise<PncpAtaDaCompra[] | null> => {
    try {
      const res = await fetch(`/api-pncp/api/pncp/v1/orgaos/${cnpj}/compras/${anoCompra}/${seqCompra}/atas`);
      if (!res.ok) return null;
      const d = await res.json();
      if (!Array.isArray(d?.data)) return null;
      if (typeof d.totalRegistros === 'number' && d.totalRegistros > d.data.length) return null;
      return d.data as PncpAtaDaCompra[];
    } catch {
      return null;
    }
  })();
  pncpAtasDaCompraCache.set(chave, promessa);
  promessa.then((r) => { if (r === null) pncpAtasDaCompraCache.delete(chave); });
  return promessa;
}

/** Fornecedores com resultado publicado nos itens da compra, e os itens ainda sem resultado. */
export function candidatosDaCompra(itensDaCompra: ArpItemRecord[]): Pick<PendenciaFornecedorPncp, 'candidatos' | 'itensSemResultado'> {
  const porFornecedor = new Map<string, CandidatoFornecedorPncp>();
  const itensSemResultado: PendenciaFornecedorPncp['itensSemResultado'] = [];
  for (const it of itensDaCompra) {
    const numeroItem = Number(it.numeroItem) || 0;
    const ident = normalizarIdentificadorFornecedor(it.niFornecedor);
    if (!ident) {
      itensSemResultado.push({ numeroItem, descricao: it.descricaoItem || '', quantidade: Number(it.quantidadeEstimadaEdital || it.quantidadeHomologadaItem) || 0 });
      continue;
    }
    const candidato = porFornecedor.get(ident) || { identificador: ident, nome: it.nomeRazaoSocialFornecedor || '', itens: [] };
    candidato.itens.push({
      numeroItem,
      descricao: it.descricaoItem || '',
      quantidade: Number(it.quantidadeHomologadaItem) || 0,
      valorUnitario: Number(it.valorUnitario) || 0,
      valorTotal: Number(it.valorTotal) || 0
    });
    porFornecedor.set(ident, candidato);
  }
  return { candidatos: Array.from(porFornecedor.values()), itensSemResultado };
}

/**
 * Itens da ata pelo PNCP, só quando é certo que são dela. O PNCP lista os itens da compra, não da ata, e não diz o
 * fornecedor da ata. Atribui os itens quando o coordenador indicou o fornecedor da ata (atas_fornecedor_pncp,
 * `fornecedorIndicado`) ou quando a única ata não cancelada da compra é esta e todos os itens são de um fornecedor.
 * Em 06/10/2026 uma regra mais frouxa gravou itens de outra ata em sete atas: melhor ata sem itens do que itens alheios.
 * Quando não dá para atribuir por falta do fornecedor, informa a pendência (`aoDetectarPendencia`) com os fornecedores
 * que têm resultado na compra, para o coordenador escolher.
 * Devolve null quando o PNCP não respondeu (não dá para saber); [] quando respondeu e os itens não são atribuíveis.
 */
export async function itensDaAtaPeloPncp(
  ata: {
    anoCompra: string;
    seqCompra: number;
    /** Sequencial da ata na compra (do número de controle PNCP); sem ele, compara pelo número da ata. */
    seqAta?: number;
    numeroAta: string;
    uasg: string;
    cnpj?: string;
  },
  opts: {
    fornecedorIndicado?: string;
    aoDetectarPendencia?: (p: Omit<PendenciaFornecedorPncp, 'numeroControlePncpAta' | 'numeroCompra'>) => void;
  } = {}
): Promise<ArpItemRecord[] | null> {
  const { anoCompra, seqCompra, seqAta, numeroAta, uasg, cnpj } = ata;
  if (opts.fornecedorIndicado) return consultarItensDaCompraPncp(anoCompra, seqCompra, numeroAta, uasg, opts.fornecedorIndicado, cnpj);

  const atasDaCompra = await fetchAtasDaCompraPncp(anoCompra, seqCompra, cnpj);
  if (!atasDaCompra) {
    console.warn(`Ata ${numeroAta}: o PNCP não informou as atas da compra ${seqCompra}/${anoCompra}; itens não carregados pelo PNCP.`);
    return null;
  }
  const vigentes = atasDaCompra.filter((a) => !a.cancelado);
  const ehEstaAta = (a: PncpAtaDaCompra) => seqAta !== undefined
    ? a.sequencialAta === seqAta
    : !!a.numeroAtaRegistroPreco && matchAtaNumber(numeroAtaDoPncp({ numeroAtaRegistroPreco: a.numeroAtaRegistroPreco, anoAta: a.anoAta ?? '' }), numeroAta);
  const cnpjDaCompra = (cnpj || CNPJ_SENASP).replace(/\D/g, '');
  const pendencia = async (motivo: string) => {
    console.warn(`Ata ${numeroAta}: ${motivo}; itens não carregados pelo PNCP.`);
    if (!opts.aoDetectarPendencia) return;
    const itensDaCompra = await consultarItensDaCompraPncp(anoCompra, seqCompra, numeroAta, uasg, undefined, cnpj);
    if (!itensDaCompra) return;
    opts.aoDetectarPendencia({
      numeroAta,
      uasg,
      anoCompra,
      numeroControlePncpCompra: `${cnpjDaCompra}-1-${String(seqCompra).padStart(6, '0')}/${anoCompra}`,
      atasNaCompra: vigentes.length,
      ...candidatosDaCompra(itensDaCompra)
    });
  };
  if (vigentes.length !== 1 || !ehEstaAta(vigentes[0])) {
    await pendencia(`a compra ${seqCompra}/${anoCompra} tem ${vigentes.length} ata(s) não cancelada(s) no PNCP e a ata não informa o fornecedor`);
    return [];
  }
  const itensDaCompra = await consultarItensDaCompraPncp(anoCompra, seqCompra, numeroAta, uasg, undefined, cnpj);
  if (!itensDaCompra) return null;
  const itens = itensSeUmFornecedor(itensDaCompra);
  if (itens.length === 0 && itensDaCompra.length > 0) {
    await pendencia(`a compra ${seqCompra}/${anoCompra} tem mais de um fornecedor e a ata não informa qual é o dela`);
  }
  return itens;
}

/** Itens da compra no PNCP; [] quando a consulta falha (as telas seguem sem itens). */
export async function fetchPncpCompraItems(
  anoCompra: string,
  seqCompra: number | string,
  numeroAta: string,
  uasg: string,
  targetSupplierCnpj?: string,
  customCnpj?: string
): Promise<ArpItemRecord[]> {
  return (await consultarItensDaCompraPncp(anoCompra, seqCompra, numeroAta, uasg, targetSupplierCnpj, customCnpj)) ?? [];
}

/** Resultados (fornecedor e valor homologado) consultados ao mesmo tempo: o PNCP recusa rajadas (429). */
const RESULTADOS_EM_PARALELO = 5;

/**
 * Itens da compra no PNCP, com fornecedor e valores homologados. Devolve null quando a lista ou o resultado de algum
 * item não veio (429, 5xx, rede): sem o fornecedor de todos os itens não dá para saber de quem são, e valor e
 * quantidade sairiam errados. Item sem resultado publicado (404 ou lista vazia) não é falha. Falha não fica guardada.
 */
async function consultarItensDaCompraPncp(
  anoCompra: string,
  seqCompra: number | string,
  numeroAta: string,
  uasg: string,
  targetSupplierCnpj?: string,
  customCnpj?: string
): Promise<ArpItemRecord[] | null> {
  // Identificador inteiro (CNPJ ou código de estrangeiro "ESTRANG…"), nunca só os dígitos.
  const alvo = normalizarIdentificadorFornecedor(targetSupplierCnpj);
  const cnpj = (customCnpj || CNPJ_SENASP).replace(/\D/g, '');
  const cacheKey = `${cnpj}-${anoCompra}-${seqCompra}-${numeroAta}-${uasg}-${alvo}`;
  if (pncpCompraItemsCache.has(cacheKey)) {
    return pncpCompraItemsCache.get(cacheKey)!;
  }

  try {
    // Sem tamanhoPagina o PNCP devolve só 10 itens: a checagem de "um fornecedor só" olhava só esses e deixava passar.
    const itemsUrl = `/api-pncp/api/pncp/v1/orgaos/${cnpj}/compras/${anoCompra}/${seqCompra}/itens?tamanhoPagina=500`;
    const res = await fetch(itemsUrl);
    if (!res.ok) return null;
    const itemsData = await res.json();
    if (!Array.isArray(itemsData)) return null;

    let resultadoFalhou = false;
    const montarItem = async (it: any): Promise<ArpItemRecord> => {
        let niFornecedor = '';
        let nomeRazaoSocialFornecedor = '';
        let valorUnitario = it.valorUnitarioEstimado || 0;
        let valorTotal = it.valorTotal || 0;
        let quantidadeHomologada = it.quantidade || 0;

        try {
          const resUrl = `/api-pncp/api/pncp/v1/orgaos/${cnpj}/compras/${anoCompra}/${seqCompra}/itens/${it.numeroItem}/resultados`;
          const resResponse = await fetch(resUrl);
          if (!resResponse.ok && resResponse.status !== 404) resultadoFalhou = true;
          if (resResponse.ok) {
            const resultsData = await resResponse.json().catch(() => null);
            if (Array.isArray(resultsData) && resultsData.length > 0) {
              const r = resultsData[0];
              niFornecedor = r.niFornecedor || '';
              nomeRazaoSocialFornecedor = r.nomeRazaoSocialFornecedor || '';
              if (r.valorUnitarioHomologado) valorUnitario = r.valorUnitarioHomologado;
              if (r.valorTotalHomologado) valorTotal = r.valorTotalHomologado;
              if (r.quantidadeHomologada) quantidadeHomologada = r.quantidadeHomologada;
            }
          }
        } catch {
          resultadoFalhou = true;
        }

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
    };
    const arpItems: ArpItemRecord[] = [];
    for (let i = 0; i < itemsData.length; i += RESULTADOS_EM_PARALELO) {
      arpItems.push(...await Promise.all(itemsData.slice(i, i + RESULTADOS_EM_PARALELO).map(montarItem)));
    }
    if (resultadoFalhou) {
      console.warn(`Itens da compra ${seqCompra}/${anoCompra}: o PNCP não entregou o resultado de algum item; itens não carregados.`);
      return null;
    }

    let filteredItems = arpItems;
    if (alvo) {
      filteredItems = arpItems.filter((item) => normalizarIdentificadorFornecedor(item.niFornecedor) === alvo);
    }

    pncpCompraItemsCache.set(cacheKey, filteredItems);
    return filteredItems;
  } catch (e) {
    console.warn(`Erro ao carregar itens da compra ${seqCompra}/${anoCompra} no PNCP:`, e);
    return null;
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
  opts: { estrito?: boolean } & OpcoesFornecedorPncp = {}
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

    // 2. Se não encontrou pelo dia exato, busca no ano da Ata e, se for outro, no ano da vigência. A data gravada pode
    // diferir da que o Compras.gov.br usa nos itens (00102/2024: ata 20/01/2025, itens 17/01/2025), e o número da ata
    // pode ser de um ano e a vigência começar no seguinte; sem o ano da vigência a ata caía no PNCP e ficava sem itens.
    const anoDaVigencia = cleanDate ? cleanDate.split('-')[0] : '';
    for (const ano of Array.from(new Set([ataYear, anoDaVigencia].filter(Boolean)))) {
      if (foundItems.length > 0) break;
      const yearData = await executeQuery(`${ano}-01-01`, `${ano}-12-31`);
      if (yearData?.resultado) {
        foundItems = yearData.resultado.filter(item =>
          matchAtaNumber(item.numeroAtaRegistroPreco, numeroAtaRegistroPreco)
        );
      }
    }

    // De onde vieram os itens: a sincronização confere o fornecedor indicado quando a fonte oficial chega.
    let origem: ArpItemsResponse['origem'] = 'COMPRAS_GOV';

    // 3. Se não encontrou no Compras.gov, realiza fallback dinâmico para a compra do PNCP
    if (foundItems.length === 0) {
      origem = 'PNCP';
      // 3.1. Verifica se foi passado o contexto com número de controle PNCP ou ano/número da compra
      let pncpCtrl = typeof arpContext === 'string' ? arpContext : arpContext?.numeroControlePncpAta;
      let anoCompra = typeof arpContext === 'object' ? arpContext?.anoCompra : undefined;
      let seqCompra = typeof arpContext === 'object' ? (arpContext?.numeroCompra ? parseInt(arpContext.numeroCompra, 10) : undefined) : undefined;
      let seqAta: number | undefined;

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
      let cnpjDaCompra: string | undefined;
      if (pncpCtrl) {
        const parsed = parsePncpControlNumber(pncpCtrl);
        if (parsed) {
          anoCompra = parsed.anoCompra;
          seqCompra = parsed.seqCompra;
          seqAta = parsed.seqAta;
          cnpjDaCompra = parsed.cnpj;
        }
      }

      // 3.4. Itens pelo PNCP, só quando é certo que são desta ata (regra em itensDaAtaPeloPncp): fornecedor indicado
      // pelo coordenador, ou única ata da compra com um fornecedor só.
      if (anoCompra && seqCompra) {
        const numeroCompraDaAta = typeof arpContext === 'object' ? arpContext?.numeroCompra : undefined;
        foundItems = (await itensDaAtaPeloPncp(
          { anoCompra, seqCompra, seqAta, numeroAta: numeroAtaRegistroPreco, uasg: codigoUnidadeGerenciadora, cnpj: cnpjDaCompra },
          {
            fornecedorIndicado: pncpCtrl ? opts.fornecedorIndicado?.(pncpCtrl) : undefined,
            aoDetectarPendencia: opts.aoDetectarPendencia && pncpCtrl
              ? (p) => opts.aoDetectarPendencia!({ ...p, numeroControlePncpAta: pncpCtrl as string, numeroCompra: numeroCompraDaAta })
              : undefined
          }
        )) ?? [];
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
        paginasRestantes: 0,
        origem
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

