/**
 * Leitura das fontes do reajuste das atas (migrations 158 e 159), no servidor e sob a trava do banco
 * (recurso 'reajuste_atas', UASG 000000: vale para as duas carteiras).
 *
 * Em cada execução, dentro de um orçamento de tempo:
 *   1. Índices: IPCA oficial (Banco Central, série 433 do SGS) e projetado (mediana do Focus mais recente).
 *   2. Fila do banco (atas_para_reajuste): atas vigentes gerenciadas pela SENASP. Para cada uma:
 *      - edital da compra, uma vez: índice e data do orçamento da cláusula de reajuste (só sugestão);
 *      - arquivos novos da ata no PNCP (apostilamentos e termos aditivos): percentual, período e efeitos;
 *      - preço homologado dos itens que ainda não têm (resultado do item no PNCP).
 *   Cada ata é gravada assim que lida (gravar_reajuste_fontes); o que não couber fica para a próxima.
 *
 * A data-base do reajuste é o Termo de Conformidade da pesquisa de preços, que fica no SEI (não é público):
 * o gestor informa. O que este serviço lê serve de sugestão (edital) ou de fato publicado (apostilamento).
 *
 * PDF e zip: o serviço recebe um leitor (LeitorDeArquivos). No servidor, ele usa unpdf e fflate, carregados
 * só quando este recurso roda (server/sincronizar-fontes/leitorDeArquivos.ts).
 */
import { supabase } from './supabaseClient';
import {
  executarComReserva,
  mensagemDeErro,
  UASG_TODAS,
  type ResultadoSincronizacao
} from './sincronizacaoFontesService';
import {
  lerClausulaDoEdital,
  lerReajustesDoDocumento,
  resolverEfeito,
  type ClausulaDoEdital
} from './reajusteFontesParser';

export const RECURSO_REAJUSTE_ATAS = 'reajuste_atas' as const;
export const FONTE_PNCP_REAJUSTE = 'PNCP (editais e apostilamentos)';
export const FONTE_BCB = 'Banco Central (IPCA e Focus)';

/** Tempo máximo lendo as fontes numa execução (a Edge Function tem 150 s). */
export const ORCAMENTO_REAJUSTE_ATAS_MS = 95_000;
/** Agendamento de 3 em 3 horas (migration 159): a validade é menor para nenhuma execução ser pulada. */
const VALIDADE_REAJUSTE = '2 hours';

/** O PNCP devolve uma página HTML de bloqueio quando recebe pedidos seguidos demais (medido em 23/10/2026). */
const PAUSA_ENTRE_PEDIDOS_MS = 1_200;
const TENTATIVAS = 3;
const ESPERA_POR_TENTATIVA_MS = 4_000;
const FALHAS_SEGUIDAS_PARA_PARAR = 4;
/** Arquivo maior que isso não é baixado (o maior edital lido em 23/10/2026 tinha 15 MB). */
const TAMANHO_MAXIMO_ARQUIVO = 30 * 1024 * 1024;
/** Tempo de cada download de arquivo (o proxy usa 30 s para as consultas). */
const TEMPO_DOWNLOAD_MS = 60_000;

const URL_SGS_IPCA = '/api-bcb/dados/serie/bcdata.sgs.433/dados';
const URL_FOCUS_MENSAL = '/api-bcb-olinda/olinda/servico/Expectativas/versao/v1/odata/ExpectativaMercadoMensais';
const URL_PNCP = '/api-pncp/api/pncp/v1/orgaos';

const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface LeitorDeArquivos {
  /** Texto do PDF, até `maxPaginas` páginas (a cláusula de reajuste fica no começo do TR e da minuta). */
  textoDoPdf(bytes: Uint8Array, opts?: { maxPaginas?: number }): Promise<string>;
  /** Arquivos do zip. Com `aceitar`, só os aceitos são descompactados (os outros nem ocupam memória). */
  arquivosDoZip(bytes: Uint8Array, aceitar?: (nome: string, tamanho: number) => boolean): Promise<Array<{ nome: string; bytes: Uint8Array }>>;
}

/**
 * Limites da leitura do edital no servidor. A primeira leitura em produção (23/10/2026) foi derrubada ao abrir o
 * pacote da compra 275/2026 (zip com 13 PDFs) inteiro: agora só as partes com a cláusula, uma de cada vez, até achar.
 */
export const LIMITES_DO_EDITAL = { maxPdfs: 4, maxPaginas: 400, maxBytesPdf: 10 * 1024 * 1024, maxBytesZip: 25 * 1024 * 1024 };
/** Depois de 2 tentativas que derrubaram a leitura, o edital da compra fica "a conferir" (migration 161). */
export const TENTATIVAS_DO_EDITAL = 2;

export interface OpcoesReajuste {
  forcar?: boolean;
  orcamentoMs?: number;
  leitor: LeitorDeArquivos;
  fetcher?: typeof fetch;
  agora?: () => number;
  esperar?: (ms: number) => Promise<void>;
  hoje?: () => Date;
}

// ------------------------------------------------------------------------------
// Rede
// ------------------------------------------------------------------------------

class FonteBloqueada extends Error {}
class NaoEncontrado extends Error {}

async function pedir(url: string, fetcher: typeof fetch, esperar: (ms: number) => Promise<void>, init?: RequestInit): Promise<Response> {
  let ultimoErro: unknown = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    if (tentativa > 1) await esperar(ESPERA_POR_TENTATIVA_MS * (tentativa - 1));
    try {
      const resposta = await fetcher(url, init);
      if (resposta.ok) return resposta;
      ultimoErro = resposta.status === 404
        ? new NaoEncontrado(`${url.split('?')[0]} não existe no PNCP (404).`)
        : new Error(`${url.split('?')[0]} respondeu ${resposta.status}.`);
      if (resposta.status !== 429 && resposta.status < 500) break;
    } catch (err) {
      ultimoErro = err;
    }
  }
  throw ultimoErro;
}

async function pedirJson<T>(url: string, fetcher: typeof fetch, esperar: (ms: number) => Promise<void>): Promise<T> {
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const texto = await (await pedir(url, fetcher, esperar)).text();
    // Bloqueio do PNCP: HTML com status 200.
    if (texto.trim().startsWith('<')) {
      if (tentativa < TENTATIVAS) {
        await esperar(ESPERA_POR_TENTATIVA_MS * tentativa);
        continue;
      }
      throw new FonteBloqueada(`${url.split('?')[0]} devolveu uma página de bloqueio.`);
    }
    return JSON.parse(texto) as T;
  }
  throw new FonteBloqueada(url);
}

/** Lista que a fonte não tem (404) vem vazia: a ata ou a compra simplesmente não tem arquivos. */
async function pedirLista<T>(url: string, fetcher: typeof fetch, esperar: (ms: number) => Promise<void>): Promise<T[]> {
  try {
    const dados = await pedirJson<T[]>(url, fetcher, esperar);
    return Array.isArray(dados) ? dados : [];
  } catch (err) {
    if (err instanceof NaoEncontrado) return [];
    throw err;
  }
}

async function baixar(url: string, fetcher: typeof fetch, esperar: (ms: number) => Promise<void>): Promise<Uint8Array | null> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_DOWNLOAD_MS);
  try {
    const resposta = await pedir(url, fetcher, esperar, { signal: controle.signal, headers: { accept: '*/*' } });
    const tamanho = Number(resposta.headers.get('content-length') ?? 0);
    if (tamanho > TAMANHO_MAXIMO_ARQUIVO) return null;
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    return bytes.length > TAMANHO_MAXIMO_ARQUIVO ? null : bytes;
  } finally {
    clearTimeout(relogio);
  }
}

// ------------------------------------------------------------------------------
// Índices (Banco Central)
// ------------------------------------------------------------------------------

export interface IndiceMensal {
  indice: 'IPCA';
  mes: string;
  tipo: 'OFICIAL' | 'PROJETADO';
  variacao: number;
  fonte: string;
  referencia?: string;
}

const dd = (n: number) => String(n).padStart(2, '0');

/** IPCA oficial dos últimos 4 anos e a mediana mensal do Focus mais recente para os meses seguintes. */
export async function lerIndicesIpca(fetcher: typeof fetch, esperar: (ms: number) => Promise<void>, hoje: Date): Promise<IndiceMensal[]> {
  const inicio = `01/${dd(hoje.getUTCMonth() + 1)}/${hoje.getUTCFullYear() - 4}`;
  const sgs = await pedirJson<Array<{ data: string; valor: string }>>(`${URL_SGS_IPCA}?formato=json&dataInicial=${inicio}`, fetcher, esperar);
  const oficiais: IndiceMensal[] = [];
  for (const r of sgs) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(r.data ?? '');
    const v = Number(String(r.valor ?? '').replace(',', '.'));
    if (m && Number.isFinite(v)) oficiais.push({ indice: 'IPCA', mes: `${m[3]}-${m[2]}-01`, tipo: 'OFICIAL', variacao: v, fonte: 'BCB_SGS_433' });
  }

  const filtro = encodeURIComponent("Indicador eq 'IPCA' and baseCalculo eq 0");
  const focus = await pedirJson<{ value?: Array<{ Data: string; DataReferencia: string; Mediana: number }> }>(
    `${URL_FOCUS_MENSAL}?$top=120&$filter=${filtro}&$orderby=Data%20desc&$format=json&$select=Data,DataReferencia,Mediana`,
    fetcher,
    esperar
  );
  const linhas = focus.value ?? [];
  const maisRecente = linhas.reduce((max, l) => (l.Data > max ? l.Data : max), '');
  const ultimoOficial = oficiais.reduce((max, o) => (o.mes > max ? o.mes : max), '');
  const projetados: IndiceMensal[] = [];
  for (const l of linhas) {
    if (l.Data !== maisRecente) continue;
    const m = /^(\d{2})\/(\d{4})$/.exec(l.DataReferencia ?? '');
    if (!m || !Number.isFinite(l.Mediana)) continue;
    const mes = `${m[2]}-${m[1]}-01`;
    if (mes <= ultimoOficial) continue;
    projetados.push({ indice: 'IPCA', mes, tipo: 'PROJETADO', variacao: l.Mediana, fonte: 'BCB_FOCUS', referencia: maisRecente });
  }
  return [...oficiais, ...projetados];
}

// ------------------------------------------------------------------------------
// Arquivos (PDF e zip)
// ------------------------------------------------------------------------------

const ehPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
const ehZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;

/** Partes do pacote do edital que trazem a cláusula de reajuste. */
const NOME_UTIL = /edital|termo.?de.?refer|minuta|contrato|\bTR\b|anexo.?i\b/i;
const NOME_INUTIL = /especifica|estudo|\betp\b|planilha|mapa|risco|rela[cç][aã]o.?(de.?)?itens|english|annex|terms of|proposta|declara|modelo de/i;

/** Textos dos PDFs de um arquivo baixado (PDF solto ou zip, inclusive zip dentro de zip). */
export async function textosDoArquivo(
  bytes: Uint8Array,
  leitor: LeitorDeArquivos,
  opts: { soPartesDoEdital?: boolean; profundidade?: number; parar?: (texto: string) => boolean; lidos?: { pdfs: number } } = {}
): Promise<string[]> {
  const lidos = opts.lidos ?? { pdfs: 0 };
  const maxPdfs = opts.soPartesDoEdital ? LIMITES_DO_EDITAL.maxPdfs : Number.POSITIVE_INFINITY;
  const maxPaginas = opts.soPartesDoEdital ? LIMITES_DO_EDITAL.maxPaginas : undefined;
  if (ehPdf(bytes)) {
    lidos.pdfs++;
    return [await leitor.textoDoPdf(bytes, { maxPaginas })];
  }
  if (!ehZip(bytes) || (opts.profundidade ?? 0) > 2) return [];
  const util = (nome: string) => NOME_UTIL.test(nome) && !NOME_INUTIL.test(nome);
  // No edital, só descompacta os PDFs úteis (ou, se nenhum tiver nome útil, os que não são inúteis) e os zips.
  const aceitar = opts.soPartesDoEdital
    ? (nome: string, tamanho: number) =>
        (/\.zip$/i.test(nome) && tamanho <= LIMITES_DO_EDITAL.maxBytesZip) || (/\.pdf$/i.test(nome) && tamanho <= LIMITES_DO_EDITAL.maxBytesPdf && !NOME_INUTIL.test(nome))
    : undefined;
  const partes = await leitor.arquivosDoZip(bytes, aceitar);
  const pdfs = partes.filter((p) => /\.pdf$/i.test(p.nome));
  const escolhidos = opts.soPartesDoEdital
    ? (() => {
        const uteis = pdfs.filter((p) => util(p.nome));
        // Minuta do contrato e TR primeiro: é onde ficam a data do orçamento e o índice.
        const peso = (n: string) => (/minuta.*contrato|contrato/i.test(n) ? 0 : /termo.?de.?refer|\bTR\b/i.test(n) ? 1 : 2);
        return (uteis.length > 0 ? uteis : pdfs.filter((p) => !NOME_INUTIL.test(p.nome))).sort((a, b) => peso(a.nome) - peso(b.nome));
      })()
    : pdfs;
  const textos: string[] = [];
  for (const p of escolhidos) {
    if (lidos.pdfs >= maxPdfs) break;
    try {
      lidos.pdfs++;
      textos.push(await leitor.textoDoPdf(p.bytes, { maxPaginas }));
    } catch (err) {
      console.warn(`[reajuste] PDF ${p.nome} não pôde ser lido:`, mensagemDeErro(err));
    }
    if (opts.parar?.(textos.join('\n'))) return textos;
  }
  for (const z of partes.filter((p) => /\.zip$/i.test(p.nome))) {
    if (lidos.pdfs >= maxPdfs) break;
    textos.push(...(await textosDoArquivo(z.bytes, leitor, { ...opts, lidos, profundidade: (opts.profundidade ?? 0) + 1 })));
    if (opts.parar?.(textos.join('\n'))) return textos;
  }
  return textos;
}

// ------------------------------------------------------------------------------
// Fila e PNCP
// ------------------------------------------------------------------------------

export interface AtaDaFila {
  ata_id: string;
  numero_ata: string;
  codigo_uasg: string;
  numero_controle_pncp: string;
  data_vigencia_inicial: string;
  data_vigencia_final: string;
  edital_lido_em: string | null;
  documentos_pncp_lidos: number[];
  documentos_lidos_em: string | null;
  itens_sem_homologado: number;
  /** Tentativas de ler o edital que derrubaram a função (migration 161). */
  edital_tentativas?: number;
}

interface ArquivoPncp {
  sequencialDocumento: number;
  titulo?: string;
  tipoDocumentoNome?: string;
  url: string;
  dataPublicacaoPncp?: string;
}

/** "00394494000136-1-001132/2024-000003" → partes do endereço no PNCP. */
export function partesDoControle(controle: string): { cnpj: string; ano: string; sequencial: number; sequencialAta: number } | null {
  const m = /^(\d{14})-1-(\d{6})\/(\d{4})-(\d{6})$/.exec(controle.trim());
  return m ? { cnpj: m[1], sequencial: Number(m[2]), ano: m[3], sequencialAta: Number(m[4]) } : null;
}

const ORDEM_DO_EDITAL = ['Edital', 'Termo de Referência', 'Aviso de Contratação Direta', 'Minuta do Contrato', 'Minuta de Ata de Registro de Preços'];

async function lerEditalDaCompra(
  p: { cnpj: string; ano: string; sequencial: number },
  ctx: { leitor: LeitorDeArquivos; fetcher: typeof fetch; esperar: (ms: number) => Promise<void>; restaMs: () => number }
): Promise<ClausulaDoEdital & { lido: boolean }> {
  const arquivos = await pedirLista<ArquivoPncp>(`${URL_PNCP}/${p.cnpj}/compras/${p.ano}/${p.sequencial}/arquivos`, ctx.fetcher, ctx.esperar);
  const candidatos = arquivos
    .filter((a) => ORDEM_DO_EDITAL.includes(String(a.tipoDocumentoNome ?? '')))
    .sort((a, b) => ORDEM_DO_EDITAL.indexOf(String(a.tipoDocumentoNome)) - ORDEM_DO_EDITAL.indexOf(String(b.tipoDocumentoNome)));
  let melhor: ClausulaDoEdital = { indice: null, indicesCitados: [], dataOrcamento: null, temClausula: false, dataEmBranco: false };
  // Sem edital publicado, a compra conta como lida (não volta para a fila). Faltou tempo: fica para depois.
  let leuAlgum = candidatos.length === 0;
  for (const a of candidatos) {
    if (ctx.restaMs() < 20_000) break;
    await ctx.esperar(PAUSA_ENTRE_PEDIDOS_MS);
    const bytes = await baixar(a.url, ctx.fetcher, ctx.esperar);
    leuAlgum = true;
    if (!bytes) continue;
    const achou = (texto: string) => {
      const c = lerClausulaDoEdital(texto);
      return c.temClausula && c.dataOrcamento !== null;
    };
    const textos = await textosDoArquivo(bytes, ctx.leitor, { soPartesDoEdital: true, parar: achou });
    const c = lerClausulaDoEdital(textos.join('\n'));
    if (c.temClausula && !melhor.temClausula) melhor = { ...c, dataOrcamento: c.dataOrcamento ?? melhor.dataOrcamento };
    else if (!melhor.dataOrcamento && c.dataOrcamento) melhor = { ...melhor, dataOrcamento: c.dataOrcamento };
    if (melhor.temClausula && melhor.dataOrcamento) break;
  }
  return { ...melhor, lido: leuAlgum };
}

interface ReajusteParaGravar {
  documento_pncp_sequencial: number;
  documento_titulo: string;
  documento_publicado_em: string | null;
  efeito_inicio: string;
  percentual: number | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  indice: string | null;
  sei_citado: string | null;
  sei_citado_conformidade: boolean;
}

async function lerDocumentosDaAta(
  ata: AtaDaFila,
  p: { cnpj: string; ano: string; sequencial: number; sequencialAta: number },
  ctx: { leitor: LeitorDeArquivos; fetcher: typeof fetch; esperar: (ms: number) => Promise<void>; restaMs: () => number }
): Promise<{ lidos: number[]; reajustes: ReajusteParaGravar[]; pendentes: number }> {
  const arquivos = await pedirLista<ArquivoPncp>(
    `${URL_PNCP}/${p.cnpj}/compras/${p.ano}/${p.sequencial}/atas/${p.sequencialAta}/arquivos`,
    ctx.fetcher,
    ctx.esperar
  );
  const jaLidos = new Set(ata.documentos_pncp_lidos ?? []);
  const lidos: number[] = [];
  const reajustes: ReajusteParaGravar[] = [];
  let pendentes = 0;
  for (const a of arquivos.sort((x, y) => x.sequencialDocumento - y.sequencialDocumento)) {
    if (jaLidos.has(a.sequencialDocumento)) continue;
    // O arquivo 1 é a própria ata: a cláusula dela não é um reajuste aplicado.
    if (a.sequencialDocumento <= 1) {
      lidos.push(a.sequencialDocumento);
      continue;
    }
    if (ctx.restaMs() < 10_000) {
      pendentes++;
      continue;
    }
    await ctx.esperar(PAUSA_ENTRE_PEDIDOS_MS);
    const bytes = await baixar(a.url, ctx.fetcher, ctx.esperar);
    if (!bytes) {
      // Grande demais: não volta a tentar.
      lidos.push(a.sequencialDocumento);
      continue;
    }
    const texto = (await textosDoArquivo(bytes, ctx.leitor)).join('\n');
    const leitura = lerReajustesDoDocumento(texto);
    const publicado = a.dataPublicacaoPncp ? a.dataPublicacaoPncp.slice(0, 10) : null;
    const titulo = String(a.titulo ?? a.tipoDocumentoNome ?? '').slice(0, 300);
    const contexto = {
      inicioVigencia: ata.data_vigencia_inicial,
      publicadoEm: publicado,
      dataAssinatura: leitura.dataAssinatura,
      tituloFalaDeAditivo: /aditivo|prorroga/i.test(titulo)
    };
    const r = leitura.reajustes[0];
    if (r) {
      const efeito = resolverEfeito(r, contexto);
      if (efeito) {
        reajustes.push({
          documento_pncp_sequencial: a.sequencialDocumento,
          documento_titulo: titulo,
          documento_publicado_em: publicado,
          efeito_inicio: efeito,
          percentual: r.percentual,
          periodo_inicio: r.periodoInicio,
          periodo_fim: r.periodoFim,
          indice: r.indice,
          sei_citado: r.seiCitado,
          sei_citado_conformidade: r.seiEhConformidade
        });
      }
    } else if (leitura.aplicaReajusteSemPercentual) {
      // Aplica reajuste, mas sem número legível: o gestor informa o percentual.
      const efeito = resolverEfeito({ efeitoInicio: null, noNovoCiclo: /novo ciclo/i.test(texto), aPartirDaAssinatura: false }, contexto);
      if (efeito) {
        reajustes.push({
          documento_pncp_sequencial: a.sequencialDocumento,
          documento_titulo: titulo,
          documento_publicado_em: publicado,
          efeito_inicio: efeito,
          percentual: null,
          periodo_inicio: null,
          periodo_fim: null,
          indice: null,
          sei_citado: null,
          sei_citado_conformidade: false
        });
      }
    }
    lidos.push(a.sequencialDocumento);
  }
  // O termo aditivo de prorrogação e o apostilamento repetem o mesmo reajuste: fica o primeiro documento.
  const vistos = new Set<string>();
  const unicos = reajustes.filter((r) => {
    const chave = r.periodo_inicio ? `${r.percentual}|${r.periodo_inicio}|${r.periodo_fim}` : `${r.percentual}|${r.efeito_inicio}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
  return { lidos, reajustes: unicos, pendentes };
}

const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

async function lerHomologados(
  ata: AtaDaFila,
  p: { cnpj: string; ano: string; sequencial: number },
  ctx: { fetcher: typeof fetch; esperar: (ms: number) => Promise<void>; restaMs: () => number }
): Promise<{ homologados: Array<{ numero_item: string; valor: number }>; completo: boolean }> {
  if (!supabase) return { homologados: [], completo: false };
  const [{ data: itens, error: e1 }, { data: ja, error: e2 }] = await Promise.all([
    supabase.from('itens_ata').select('numero_item, fornecedor_cnpj_cpf').eq('ata_id', ata.ata_id),
    supabase.from('itens_ata_preco_homologado').select('numero_item').eq('ata_id', ata.ata_id)
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const tem = new Set((ja ?? []).map((r: { numero_item: string }) => r.numero_item));
  const faltam = (itens ?? []).filter((i: { numero_item: string }) => !tem.has(i.numero_item));
  const homologados: Array<{ numero_item: string; valor: number }> = [];
  for (const it of faltam as Array<{ numero_item: string; fornecedor_cnpj_cpf: string | null }>) {
    if (ctx.restaMs() < 8_000) return { homologados, completo: false };
    const n = Number(it.numero_item);
    if (!Number.isInteger(n) || n <= 0) continue;
    await ctx.esperar(PAUSA_ENTRE_PEDIDOS_MS);
    // Item sem resultado no PNCP (404) fica sem preço homologado; a conta usa o preço atual.
    const resultados = await pedirLista<{ valorUnitarioHomologado?: number; niFornecedor?: string }>(
      `${URL_PNCP}/${p.cnpj}/compras/${p.ano}/${p.sequencial}/itens/${n}/resultados`,
      ctx.fetcher,
      ctx.esperar
    );
    const doFornecedor = resultados.find((r) => digitos(r.niFornecedor) && digitos(r.niFornecedor) === digitos(it.fornecedor_cnpj_cpf));
    const escolhido = doFornecedor ?? (resultados.length === 1 ? resultados[0] : undefined);
    if (escolhido && typeof escolhido.valorUnitarioHomologado === 'number') {
      homologados.push({ numero_item: it.numero_item, valor: escolhido.valorUnitarioHomologado });
    }
  }
  return { homologados, completo: true };
}

// ------------------------------------------------------------------------------
// Banco
// ------------------------------------------------------------------------------

async function filaDoBanco(): Promise<AtaDaFila[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('atas_para_reajuste', { p_limite: 300 });
  if (error) throw error;
  return (data ?? []) as AtaDaFila[];
}

async function gravar(payload: Record<string, unknown>): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('gravar_reajuste_fontes', { p_payload: payload });
  if (error) throw error;
}

// ------------------------------------------------------------------------------
// Execução
// ------------------------------------------------------------------------------

/** Teste do servidor, sem gravar: tamanho da fila e últimos índices lidos. */
export async function contarReajusteAtasPendentes(opts: { fetcher?: typeof fetch; hoje?: () => Date } = {}): Promise<Record<string, unknown>> {
  const fila = await filaDoBanco();
  const indices = await lerIndicesIpca(opts.fetcher ?? fetch, dormir, (opts.hoje ?? (() => new Date()))());
  const oficiais = indices.filter((i) => i.tipo === 'OFICIAL');
  const projetados = indices.filter((i) => i.tipo === 'PROJETADO');
  return {
    pendentes: fila.length,
    semEdital: fila.filter((a) => !a.edital_lido_em).length,
    ultimoIpcaOficial: oficiais.at(-1) ?? null,
    focusReferencia: projetados[0]?.referencia ?? null,
    mesesProjetados: projetados.length
  };
}

export async function sincronizarReajusteAtas(opts: OpcoesReajuste): Promise<ResultadoSincronizacao> {
  const agora = opts.agora ?? (() => Date.now());
  const esperar = opts.esperar ?? dormir;
  const fetcher = opts.fetcher ?? fetch;
  const orcamento = opts.orcamentoMs ?? ORCAMENTO_REAJUSTE_ATAS_MS;

  return executarComReserva(RECURSO_REAJUSTE_ATAS, UASG_TODAS, { forcar: opts.forcar, validade: VALIDADE_REAJUSTE }, async () => {
    const inicio = agora();
    const restaMs = () => orcamento - (agora() - inicio);
    const ctx = { leitor: opts.leitor, fetcher, esperar, restaMs };
    const fontesComFalha = new Set<string>();
    const problemas: string[] = [];

    try {
      const indices = await lerIndicesIpca(fetcher, esperar, (opts.hoje ?? (() => new Date()))());
      if (indices.length > 0) await gravar({ indices, projetados_substituir: ['IPCA'] });
    } catch (err) {
      fontesComFalha.add(FONTE_BCB);
      problemas.push(`os índices não puderam ser lidos (${mensagemDeErro(err)})`);
    }

    const fila = await filaDoBanco();
    const editais = new Map<string, (ClausulaDoEdital & { lido: boolean }) | null>();
    let gravadas = 0;
    let falhas = 0;
    let seguidas = 0;
    let pendentes = 0;
    let primeiroErro: string | null = null;

    for (let i = 0; i < fila.length; i++) {
      if (restaMs() < 15_000) {
        pendentes = fila.length - i;
        break;
      }
      const ata = fila[i];
      const p = partesDoControle(ata.numero_controle_pncp);
      if (!p) continue;
      const chaveCompra = `${p.cnpj}-${p.ano}-${p.sequencial}`;
      try {
        // Primeiro o que é leve (arquivos da ata e preço homologado), gravado antes do edital: se a leitura do edital
        // derrubar a função, a ata não perde o resto.
        const payload: Record<string, unknown> = { ata_id: ata.ata_id };
        const docs = await lerDocumentosDaAta(ata, p, ctx);
        payload.documentos_lidos = docs.lidos;
        payload.reajustes = docs.reajustes;
        if (docs.pendentes > 0) pendentes++;
        if (ata.itens_sem_homologado > 0 && restaMs() > 15_000) {
          const h = await lerHomologados(ata, p, ctx);
          payload.homologados = h.homologados;
          // Lidos só em parte (faltou tempo): grava o que veio e a ata volta para a fila.
          payload.homologados_completos = h.completo;
        }
        await gravar({ atas: [payload] });

        if (!ata.edital_lido_em) {
          if ((ata.edital_tentativas ?? 0) >= TENTATIVAS_DO_EDITAL) {
            // O edital já derrubou a leitura duas vezes: fica "a conferir" e a ata sai da fila do edital.
            await gravar({ atas: [{ ata_id: ata.ata_id, clausula: 'A_CONFERIR' }] });
            problemas.push(`o edital da ata ${ata.numero_ata} ficou a conferir (pesado demais para o servidor)`);
          } else if (restaMs() > 25_000) {
            if (!editais.has(chaveCompra)) {
              await gravar({ atas: fila.filter((x) => !x.edital_lido_em && partesDoControle(x.numero_controle_pncp)?.sequencial === p.sequencial && partesDoControle(x.numero_controle_pncp)?.ano === p.ano).map((x) => ({ ata_id: x.ata_id, edital_tentativa: true })) });
              editais.set(chaveCompra, await lerEditalDaCompra(p, ctx));
            }
            const e = editais.get(chaveCompra);
            if (e?.lido) {
              await gravar({ atas: [{ ata_id: ata.ata_id, clausula: e.temClausula ? 'COM_REAJUSTE' : 'A_CONFERIR', indice: e.indice, data_orcamento_edital: e.dataOrcamento }] });
            }
          } else {
            pendentes++;
          }
        }
        gravadas++;
        seguidas = 0;
      } catch (err) {
        falhas++;
        seguidas++;
        primeiroErro ??= mensagemDeErro(err);
        fontesComFalha.add(FONTE_PNCP_REAJUSTE);
        console.warn(`[reajuste] ata ${ata.numero_ata} não pôde ser lida:`, mensagemDeErro(err));
        if (err instanceof FonteBloqueada || seguidas >= FALHAS_SEGUIDAS_PARA_PARAR) {
          pendentes = fila.length - i - 1;
          break;
        }
      }
    }

    if (falhas > 0) problemas.push(`${falhas} ${falhas === 1 ? 'ata não pôde ser lida' : 'atas não puderam ser lidas'} (${primeiroErro})`);
    if (pendentes > 0) problemas.push(`${pendentes} ${pendentes === 1 ? 'ata ficou' : 'atas ficaram'} para a próxima execução`);
    return problemas.length > 0
      ? { status: 'PARCIAL', total: gravadas, fontesComFalha: [...fontesComFalha], mensagem: `${problemas.join(' e ')}.` }
      : { status: 'SUCESSO', total: gravadas, fontesComFalha: [] };
  });
}
