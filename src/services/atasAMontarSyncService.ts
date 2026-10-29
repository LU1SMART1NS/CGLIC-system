/**
 * Leitura das atas a montar (migration 238), no servidor e sob a trava do banco (recurso 'atas_a_montar',
 * UASG 000000).
 *
 * Depois da homologação de um pregão de registro de preços da SENASP, a ata leva semanas para ser publicada. Nesse
 * meio-tempo o gestor monta os quadros da ata (protótipo aprovado em 28/10/2026). Em cada execução, dentro de um
 * orçamento de tempo:
 *   1. Compras: pregões de registro de preços das UASGs da CGLIC publicados no PNCP nos últimos 18 meses e com valor
 *      homologado (consulta pública /api/consulta/v1/contratacoes/publicacao).
 *   2. Itens e resultados de cada compra ainda com fornecedor sem ata (o banco diz quais; as encerradas não são
 *      relidas). Releitura a cada RELEITURA_DOS_ITENS_MS: o pregão pode homologar mais itens depois.
 *   3. Minuta da ata do edital (Anexo III): uma vez por compra (2 tentativas). Descrição, CATMAT, gerenciador e
 *      participantes (minutaAtaParser.ts). O item só vale quando a soma dos órgãos fecha com o total do PNCP.
 * Cada compra é gravada assim que lida (gravar_ata_a_montar_compra); o que não couber fica para a próxima.
 *
 * PDF e zip: o mesmo leitor do reajuste (server/sincronizar-fontes/leitorDeArquivos.ts).
 */
import { supabase } from './supabaseClient';
import { executarComReserva, mensagemDeErro, UASG_TODAS, type ResultadoSincronizacao } from './sincronizacaoFontesService';
import type { LeitorDeArquivos } from './reajusteAtasSyncService';
import { lerItensDaMinuta, lerParticipantesDaMinuta, secao3, type ModeloDaTabela, type ParticipanteDaMinuta } from './minutaAtaParser';

export const RECURSO_ATAS_A_MONTAR = 'atas_a_montar' as const;
export const FONTE_PNCP_ATAS_A_MONTAR = 'PNCP (resultado do pregão e minuta da ata)';

/** Tempo máximo lendo as fontes numa execução (a Edge Function tem 150 s). */
export const ORCAMENTO_ATAS_A_MONTAR_MS = 95_000;
/** Agendamento de 2 em 2 horas (migration 238); a trava do banco aceita no mínimo 1 hora. */
const VALIDADE_ATAS_A_MONTAR = '1 hour';
/** Itens e resultados são relidos depois disso (o pregão pode homologar mais itens). */
export const RELEITURA_DOS_ITENS_MS = 6 * 60 * 60 * 1000;
/** Compras publicadas no PNCP nos últimos 18 meses (a consulta aceita no máximo 365 dias por pedido). */
const DIAS_DE_BUSCA = 540;
/** CNPJ do Ministério da Justiça e Segurança Pública (órgão das UASGs da CGLIC no PNCP). */
const CNPJ_MJSP = '00394494000136';
const UASGS = ['200331', '200330'];
/** Pregão eletrônico (modalidade 6 do PNCP). */
const MODALIDADE_PREGAO = 6;
/** Situação da compra no PNCP: 1 = divulgada (as outras são revogada, anulada e suspensa). */
const COMPRA_DIVULGADA = 1;
/** Situação do resultado no PNCP: 1 = informado (2 = cancelado). */
const RESULTADO_INFORMADO = 1;

const PAUSA_ENTRE_PEDIDOS_MS = 1_200;
const TENTATIVAS = 3;
const ESPERA_POR_TENTATIVA_MS = 4_000;
const TAMANHO_MAXIMO_ARQUIVO = 30 * 1024 * 1024;
const TEMPO_DOWNLOAD_MS = 60_000;
/** Minuta dentro do PDF único do edital: lida até esta página (a de 90027/2025 vai da 89 à 116). */
const MAX_PAGINAS = 400;
const MAX_PDFS = 4;

const URL_CONSULTA = '/api-pncp/api/consulta/v1/contratacoes/publicacao';
const URL_PNCP = '/api-pncp/api/pncp/v1/orgaos';

const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------------------------
// Tipos gravados (atas_a_montar_compras)
// ------------------------------------------------------------------------------

export interface ResultadoDoItem {
  fornecedor_ni: string;
  fornecedor_nome: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  data_resultado: string | null;
  /** Empresa estrangeira: moeda e valor unitário na moeda da proposta, quando o PNCP informa. */
  moeda_estrangeira: string | null;
  valor_moeda_estrangeira: number | null;
}

export interface ItemDaCompra {
  numero: number;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  situacao: string | null;
  /** Código do catálogo informado pelo PNCP, quando há (a minuta é a fonte principal do CATMAT). */
  catalogo_codigo: string | null;
  resultados: ResultadoDoItem[];
}

export interface ItemDaLeitura {
  descricao: string | null;
  catmat: string | null;
  gerenciador: number | null;
  /** Um por UASG (o mesmo órgão em duas linhas da minuta é somado). */
  participantes: ParticipanteDaMinuta[];
  fecha: boolean;
}

export interface LeituraDaMinuta {
  arquivo: string;
  modelo: ModeloDaTabela | null;
  avisos: string[];
  itens: Record<string, ItemDaLeitura>;
}

export type EstadoDaMinuta = 'LIDA' | 'A_CONFERIR' | 'SEM_MINUTA';

export interface CompraParaGravar {
  numero_controle_compra: string;
  codigo_uasg: string;
  ano_compra: number;
  sequencial_compra: number;
  numero_compra: string | null;
  processo: string | null;
  objeto: string | null;
  itens?: ItemDaCompra[];
  minuta?: { estado: EstadoDaMinuta; leitura: LeituraDaMinuta } | { estado: 'FALHOU'; erro: string };
}

export interface CompraDaFila {
  numero_controle_compra: string;
  itens_lidos_em: string | null;
  minuta_estado: string;
  minuta_tentativas: number;
  tem_fornecedor_sem_ata: boolean;
}

/** O que o serviço precisa do banco. No servidor, o cliente service_role; nos testes, uma imitação. */
export interface BancoDasAtasAMontar {
  fila(): Promise<CompraDaFila[]>;
  gravar(compra: CompraParaGravar): Promise<void>;
  /** A compra ainda tem fornecedor vencedor sem ata (v_atas_a_montar)? */
  temFornecedorSemAta(numeroControleCompra: string): Promise<boolean>;
}

const BANCO_SUPABASE: BancoDasAtasAMontar = {
  async fila() {
    if (!supabase) throw new Error('Banco indisponível.');
    const { data, error } = await supabase.rpc('atas_a_montar_para_ler');
    if (error) throw new Error(mensagemDeErro(error));
    return (data ?? []) as CompraDaFila[];
  },
  async gravar(compra) {
    if (!supabase) throw new Error('Banco indisponível.');
    const { error } = await supabase.rpc('gravar_ata_a_montar_compra', { p_compra: compra });
    if (error) throw new Error(mensagemDeErro(error));
  },
  async temFornecedorSemAta(numeroControleCompra) {
    if (!supabase) throw new Error('Banco indisponível.');
    const { count, error } = await supabase
      .from('v_atas_a_montar')
      .select('numero_controle_compra', { count: 'exact', head: true })
      .eq('numero_controle_compra', numeroControleCompra);
    if (error) throw new Error(mensagemDeErro(error));
    return (count ?? 0) > 0;
  }
};

export interface OpcoesAtasAMontar {
  forcar?: boolean;
  orcamentoMs?: number;
  leitor: LeitorDeArquivos;
  banco?: BancoDasAtasAMontar;
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

interface Rede {
  fetcher: typeof fetch;
  esperar: (ms: number) => Promise<void>;
}

async function pedir(url: string, rede: Rede, init?: RequestInit): Promise<Response> {
  let ultimoErro: unknown = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    if (tentativa > 1) await rede.esperar(ESPERA_POR_TENTATIVA_MS * (tentativa - 1));
    try {
      const resposta = await rede.fetcher(url, init);
      // 204: a consulta do PNCP responde assim quando não há nada (ex.: item sem resultado).
      if (resposta.status === 204) throw new NaoEncontrado(`${url.split('?')[0]} não tem dados (204).`);
      if (resposta.ok) return resposta;
      ultimoErro = resposta.status === 404
        ? new NaoEncontrado(`${url.split('?')[0]} não existe no PNCP (404).`)
        : new Error(`${url.split('?')[0]} respondeu ${resposta.status}.`);
      if (resposta.status !== 429 && resposta.status < 500) break;
    } catch (err) {
      if (err instanceof NaoEncontrado) throw err;
      ultimoErro = err;
    }
  }
  throw ultimoErro;
}

async function pedirJson<T>(url: string, rede: Rede): Promise<T | null> {
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    let texto: string;
    try {
      texto = await (await pedir(url, rede)).text();
    } catch (err) {
      if (err instanceof NaoEncontrado) return null;
      throw err;
    }
    // Bloqueio: o PNCP devolve HTML com status 200.
    if (texto.trim().startsWith('<')) {
      if (tentativa < TENTATIVAS) {
        await rede.esperar(ESPERA_POR_TENTATIVA_MS * tentativa);
        continue;
      }
      throw new FonteBloqueada(`${url.split('?')[0]} devolveu uma página de bloqueio.`);
    }
    return texto.trim() === '' ? null : (JSON.parse(texto) as T);
  }
  throw new FonteBloqueada(url);
}

/**
 * O PNCP devolve o endereço do arquivo com a porta interna ("https://pncp.gov.br:14986/pncp-api/..."), que não
 * responde de fora (medido em 28/10/2026); sem a porta, o mesmo arquivo baixa normalmente.
 */
export const enderecoDoArquivo = (url: string) => url.replace(/^https:\/\/pncp\.gov\.br:\d+\//, 'https://pncp.gov.br/');

async function baixar(url: string, rede: Rede): Promise<Uint8Array | null> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_DOWNLOAD_MS);
  try {
    const resposta = await pedir(enderecoDoArquivo(url), rede, { signal: controle.signal, headers: { accept: '*/*' } });
    const tamanho = Number(resposta.headers.get('content-length') ?? 0);
    if (tamanho > TAMANHO_MAXIMO_ARQUIVO) return null;
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    return bytes.length > TAMANHO_MAXIMO_ARQUIVO ? null : bytes;
  } finally {
    clearTimeout(relogio);
  }
}

// ------------------------------------------------------------------------------
// PNCP
// ------------------------------------------------------------------------------

interface CompraPncp {
  anoCompra: number;
  sequencialCompra: number;
  numeroCompra?: string;
  processo?: string;
  objetoCompra?: string;
  srp?: boolean;
  situacaoCompraId?: number;
  valorTotalHomologado?: number | null;
  numeroControlePNCP?: string;
  unidadeOrgao?: { codigoUnidade?: string };
}

interface ItemPncp {
  numeroItem: number;
  descricao?: string;
  unidadeMedida?: string;
  quantidade?: number;
  situacaoCompraItemNome?: string;
  temResultado?: boolean;
  catalogoCodigoItem?: string | null;
}

interface ResultadoPncp {
  niFornecedor?: string;
  nomeRazaoSocialFornecedor?: string;
  quantidadeHomologada?: number;
  valorUnitarioHomologado?: number;
  valorTotalHomologado?: number;
  dataResultado?: string | null;
  situacaoCompraItemResultadoId?: number;
  moedaEstrangeira?: { codigo?: string; nome?: string } | string | null;
  valorNominalMoedaEstrangeira?: number | null;
}

interface ArquivoPncp {
  sequencialDocumento: number;
  titulo?: string;
  tipoDocumentoNome?: string;
  url: string;
}

const aaaammdd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

/** "00394494000136-1-001664/2025" a partir do ano e sequencial. */
export const controleDaCompra = (ano: number, sequencial: number) => `${CNPJ_MJSP}-1-${String(sequencial).padStart(6, '0')}/${ano}`;

/** Pregões de registro de preços homologados das UASGs da CGLIC, publicados nos últimos 18 meses. */
export async function buscarComprasHomologadas(rede: Rede, hoje: Date): Promise<CompraParaGravar[]> {
  const out = new Map<string, CompraParaGravar>();
  const fim = new Date(hoje);
  for (const uasg of UASGS) {
    // Janelas de até 365 dias, da mais recente para a mais antiga.
    for (let dias = 0; dias < DIAS_DE_BUSCA; dias += 365) {
      const ate = new Date(fim.getTime() - dias * 86_400_000);
      const de = new Date(ate.getTime() - Math.min(364, DIAS_DE_BUSCA - dias) * 86_400_000);
      for (let pagina = 1; pagina <= 20; pagina++) {
        const url = `${URL_CONSULTA}?dataInicial=${aaaammdd(de)}&dataFinal=${aaaammdd(ate)}&codigoModalidadeContratacao=${MODALIDADE_PREGAO}` +
          `&cnpj=${CNPJ_MJSP}&codigoUnidadeAdministrativa=${uasg}&pagina=${pagina}&tamanhoPagina=50`;
        const r = await pedirJson<{ data?: CompraPncp[]; totalPaginas?: number }>(url, rede);
        for (const c of r?.data ?? []) {
          if (!c.srp || c.situacaoCompraId !== COMPRA_DIVULGADA || c.valorTotalHomologado == null) continue;
          const controle = controleDaCompra(c.anoCompra, c.sequencialCompra);
          out.set(controle, {
            numero_controle_compra: controle,
            codigo_uasg: c.unidadeOrgao?.codigoUnidade ?? uasg,
            ano_compra: c.anoCompra,
            sequencial_compra: c.sequencialCompra,
            numero_compra: c.numeroCompra ?? null,
            processo: c.processo ?? null,
            objeto: c.objetoCompra ?? null
          });
        }
        if (!r || pagina >= (r.totalPaginas ?? 1)) break;
        await rede.esperar(PAUSA_ENTRE_PEDIDOS_MS);
      }
      await rede.esperar(PAUSA_ENTRE_PEDIDOS_MS);
    }
  }
  return [...out.values()];
}

const moedaDe = (m: ResultadoPncp['moedaEstrangeira']) => (m == null ? null : typeof m === 'string' ? m : m.codigo ?? m.nome ?? null);

/** Itens da compra e o resultado de cada item homologado. */
export async function lerItensDaCompra(compra: CompraParaGravar, rede: Rede, restaMs: () => number): Promise<ItemDaCompra[] | null> {
  const base = `${URL_PNCP}/${CNPJ_MJSP}/compras/${compra.ano_compra}/${compra.sequencial_compra}`;
  const itensPncp: ItemPncp[] = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const lote = (await pedirJson<ItemPncp[]>(`${base}/itens?pagina=${pagina}&tamanhoPagina=100`, rede)) ?? [];
    itensPncp.push(...lote);
    if (lote.length < 100) break;
    await rede.esperar(PAUSA_ENTRE_PEDIDOS_MS);
  }
  const itens: ItemDaCompra[] = [];
  for (const it of itensPncp.sort((a, b) => a.numeroItem - b.numeroItem)) {
    let resultados: ResultadoDoItem[] = [];
    if (it.temResultado) {
      // Sem tempo para os resultados de todos os itens: a compra fica para a próxima execução inteira.
      if (restaMs() < 8_000) return null;
      await rede.esperar(PAUSA_ENTRE_PEDIDOS_MS);
      const rs = (await pedirJson<ResultadoPncp[]>(`${base}/itens/${it.numeroItem}/resultados`, rede)) ?? [];
      resultados = rs
        .filter((r) => (r.situacaoCompraItemResultadoId ?? RESULTADO_INFORMADO) === RESULTADO_INFORMADO && r.niFornecedor)
        .map((r) => ({
          fornecedor_ni: String(r.niFornecedor).trim(),
          fornecedor_nome: String(r.nomeRazaoSocialFornecedor ?? '').trim(),
          quantidade: Number(r.quantidadeHomologada ?? 0),
          valor_unitario: Number(r.valorUnitarioHomologado ?? 0),
          valor_total: Number(r.valorTotalHomologado ?? 0),
          data_resultado: r.dataResultado ? String(r.dataResultado).slice(0, 10) : null,
          moeda_estrangeira: moedaDe(r.moedaEstrangeira),
          valor_moeda_estrangeira: r.valorNominalMoedaEstrangeira ?? null
        }));
    }
    itens.push({
      numero: it.numeroItem,
      descricao: String(it.descricao ?? '').trim(),
      unidade: it.unidadeMedida ?? null,
      quantidade: Number(it.quantidade ?? 0),
      situacao: it.situacaoCompraItemNome ?? null,
      catalogo_codigo: it.catalogoCodigoItem ? String(it.catalogoCodigoItem) : null,
      resultados
    });
  }
  return itens;
}

// ------------------------------------------------------------------------------
// Minuta
// ------------------------------------------------------------------------------

const ehPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
const ehZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;

/** No pacote do edital, a minuta da ata é o Anexo III ("Minuta de Ata de Registro de Preços"). */
const NOME_DA_MINUTA = /minuta.{0,20}ata|ata.{0,5}de.{0,5}registro/i;
/** Versões em inglês e documentos do ETP (o ETP pode trazer uma ata antiga como anexo). */
const NOME_FORA = /annex|draft|english|price.?registration|(^|[^a-z])etp([^a-z]|$)|estudo|proposta|contrato|termo.?de.?refer/i;
/** Edital sem pacote: o PDF único traz a minuta no fim. */
const NOME_DO_EDITAL = /edital/i;

/** Tipos de documento da compra no PNCP, na ordem em que a minuta é procurada. */
const ORDEM_DOS_DOCUMENTOS = ['Minuta de Ata de Registro de Preços', 'Edital'];

/** PDFs do arquivo baixado na ordem de procura: minuta da ata; senão o edital inteiro. */
export async function pdfsDaMinuta(bytes: Uint8Array, leitor: LeitorDeArquivos, profundidade = 0): Promise<Array<{ nome: string; bytes: Uint8Array }>> {
  if (ehPdf(bytes)) return [{ nome: 'documento.pdf', bytes }];
  if (!ehZip(bytes) || profundidade > 2) return [];
  const partes = await leitor.arquivosDoZip(bytes, (nome) => /\.(pdf|zip)$/i.test(nome) && !NOME_FORA.test(nome));
  const pdfs = partes.filter((p) => /\.pdf$/i.test(p.nome));
  const peso = (n: string) => (NOME_DA_MINUTA.test(n) ? 0 : NOME_DO_EDITAL.test(n) ? 1 : 2);
  const ordenados = pdfs.filter((p) => peso(p.nome) < 2).sort((a, b) => peso(a.nome) - peso(b.nome));
  for (const z of partes.filter((p) => /\.zip$/i.test(p.nome))) ordenados.push(...(await pdfsDaMinuta(z.bytes, leitor, profundidade + 1)));
  return ordenados;
}

/** Lê a minuta a partir do texto: descrição, CATMAT, gerenciador e participantes de cada item. */
export function leituraDoTexto(texto: string, itens: ItemDaCompra[], arquivo: string): { estado: EstadoDaMinuta; leitura: LeituraDaMinuta } {
  const totais: Record<number, number> = {};
  for (const it of itens) totais[it.numero] = Math.round(it.quantidade);
  const p = lerParticipantesDaMinuta(texto, totais);
  if (p.erro) return { estado: 'SEM_MINUTA', leitura: { arquivo, modelo: null, avisos: [p.erro], itens: {} } };
  const d = lerItensDaMinuta(texto, totais);
  const lidos: Record<string, ItemDaLeitura> = {};
  for (const it of itens) {
    const porUasg = new Map<string, ParticipanteDaMinuta>();
    for (const x of p.participantes[it.numero] ?? []) {
      const atual = porUasg.get(x.uasg);
      if (atual) atual.quantidade += x.quantidade;
      else porUasg.set(x.uasg, { ...x });
    }
    lidos[String(it.numero)] = {
      descricao: d[it.numero]?.descricao ?? null,
      catmat: d[it.numero]?.catmat ?? null,
      gerenciador: p.gerenciador[it.numero] ?? null,
      participantes: [...porUasg.values()],
      fecha: p.itensQueFecham.includes(it.numero)
    };
  }
  // Só os itens homologados importam para a ata: os fracassados ou em andamento não entram na conta.
  const homologados = itens.filter((i) => i.resultados.length > 0).map((i) => String(i.numero));
  const todosFecham = homologados.every((n) => lidos[n]?.fecha);
  return { estado: todosFecham ? 'LIDA' : 'A_CONFERIR', leitura: { arquivo, modelo: p.modelo, avisos: p.avisos, itens: lidos } };
}

/** Baixa o edital da compra e lê a minuta. Sem a seção 3 em nenhum PDF: SEM_MINUTA. */
export async function lerMinutaDaCompra(
  compra: CompraParaGravar,
  itens: ItemDaCompra[],
  ctx: Rede & { leitor: LeitorDeArquivos; restaMs: () => number }
): Promise<{ estado: EstadoDaMinuta; leitura: LeituraDaMinuta } | null> {
  const base = `${URL_PNCP}/${CNPJ_MJSP}/compras/${compra.ano_compra}/${compra.sequencial_compra}`;
  const arquivos = (await pedirJson<ArquivoPncp[]>(`${base}/arquivos`, ctx)) ?? [];
  const candidatos = arquivos
    .filter((a) => ORDEM_DOS_DOCUMENTOS.includes(String(a.tipoDocumentoNome ?? '')))
    // Minuta antes do edital; entre editais, o mais recente (republicação).
    .sort((a, b) => ORDEM_DOS_DOCUMENTOS.indexOf(String(a.tipoDocumentoNome)) - ORDEM_DOS_DOCUMENTOS.indexOf(String(b.tipoDocumentoNome)) || b.sequencialDocumento - a.sequencialDocumento);
  let pdfsLidos = 0;
  for (const a of candidatos) {
    // Sem tempo para baixar e ler: fica para a próxima execução (não conta tentativa).
    if (ctx.restaMs() < 25_000) return null;
    await ctx.esperar(PAUSA_ENTRE_PEDIDOS_MS);
    const bytes = await baixar(a.url, ctx);
    if (!bytes) continue;
    for (const pdf of await pdfsDaMinuta(bytes, ctx.leitor)) {
      if (pdfsLidos >= MAX_PDFS || ctx.restaMs() < 15_000) break;
      pdfsLidos++;
      const texto = await ctx.leitor.textoDoPdf(pdf.bytes, { maxPaginas: MAX_PAGINAS });
      const s = secao3(texto);
      if (s && s.participantes.trim()) return leituraDoTexto(texto, itens, pdf.nome === 'documento.pdf' ? String(a.titulo ?? a.tipoDocumentoNome ?? 'edital') : pdf.nome);
    }
  }
  if (ctx.restaMs() < 15_000) return null;
  return { estado: 'SEM_MINUTA', leitura: { arquivo: '', modelo: null, avisos: ['O edital publicado no PNCP não traz a minuta da ata com os participantes.'], itens: {} } };
}

// ------------------------------------------------------------------------------
// Execução
// ------------------------------------------------------------------------------

interface ContextoDaExecucao extends Rede {
  leitor: LeitorDeArquivos;
  banco: BancoDasAtasAMontar;
  restaMs: () => number;
  agora: () => number;
}

interface Contagem {
  compras: number;
  itensLidos: number;
  minutasLidas: number;
  pendentes: number;
  falhas: string[];
}

async function processar(compras: CompraParaGravar[], fila: Map<string, CompraDaFila>, ctx: ContextoDaExecucao): Promise<Contagem> {
  const c: Contagem = { compras: compras.length, itensLidos: 0, minutasLidas: 0, pendentes: 0, falhas: [] };
  // As mais recentes primeiro: são as que estão sendo montadas.
  const ordenadas = [...compras].sort((a, b) => b.ano_compra - a.ano_compra || b.sequencial_compra - a.sequencial_compra);
  for (const compra of ordenadas) {
    const conhecida = fila.get(compra.numero_controle_compra);
    // Todos os fornecedores já têm ata: nada a montar.
    if (conhecida && !conhecida.tem_fornecedor_sem_ata) continue;
    const precisaItens = !conhecida?.itens_lidos_em || ctx.agora() - Date.parse(conhecida.itens_lidos_em) > RELEITURA_DOS_ITENS_MS;
    const precisaMinuta = !conhecida || conhecida.minuta_estado === 'PENDENTE';
    if (!precisaItens && !precisaMinuta) continue;
    if (ctx.restaMs() < 15_000) {
      c.pendentes++;
      continue;
    }
    try {
      const itens = await lerItensDaCompra(compra, ctx, ctx.restaMs);
      if (!itens) {
        c.pendentes++;
        continue;
      }
      c.itensLidos++;
      await ctx.banco.gravar({ ...compra, itens });
      // A minuta só interessa enquanto houver fornecedor sem ata (as compras antigas, todas publicadas, não).
      const semAta = await ctx.banco.temFornecedorSemAta(compra.numero_controle_compra);
      if (!precisaMinuta || !semAta || !itens.some((i) => i.resultados.length > 0)) continue;
      let minuta: CompraParaGravar['minuta'];
      try {
        const lida = await lerMinutaDaCompra(compra, itens, ctx);
        if (!lida) {
          c.pendentes++;
          continue;
        }
        minuta = lida;
        c.minutasLidas++;
      } catch (err) {
        minuta = { estado: 'FALHOU', erro: mensagemDeErro(err) };
        c.falhas.push(`${compra.numero_compra ?? compra.numero_controle_compra}: minuta (${mensagemDeErro(err)})`);
      }
      await ctx.banco.gravar({ ...compra, minuta });
    } catch (err) {
      c.falhas.push(`${compra.numero_compra ?? compra.numero_controle_compra}: ${mensagemDeErro(err)}`);
      if (err instanceof FonteBloqueada) break;
    }
  }
  return c;
}

function contexto(opts: OpcoesAtasAMontar): ContextoDaExecucao {
  const agora = opts.agora ?? (() => Date.now());
  const inicio = agora();
  const orcamento = opts.orcamentoMs ?? ORCAMENTO_ATAS_A_MONTAR_MS;
  return {
    fetcher: opts.fetcher ?? fetch,
    esperar: opts.esperar ?? dormir,
    leitor: opts.leitor,
    banco: opts.banco ?? BANCO_SUPABASE,
    agora,
    restaMs: () => orcamento - (agora() - inicio)
  };
}

export async function sincronizarAtasAMontar(opts: OpcoesAtasAMontar): Promise<ResultadoSincronizacao> {
  return executarComReserva(RECURSO_ATAS_A_MONTAR, UASG_TODAS, { forcar: opts.forcar, validade: VALIDADE_ATAS_A_MONTAR }, async () => {
    const ctx = contexto(opts);
    const compras = await buscarComprasHomologadas(ctx, (opts.hoje ?? (() => new Date()))());
    const fila = new Map((await ctx.banco.fila()).map((f) => [f.numero_controle_compra, f]));
    const c = await processar(compras, fila, ctx);
    const mensagem = `${c.compras} pregão(ões) homologado(s); itens lidos em ${c.itensLidos}, minuta em ${c.minutasLidas}` +
      (c.pendentes ? `; ${c.pendentes} para a próxima execução` : '') +
      (c.falhas.length ? `; falhas: ${c.falhas.join('; ')}` : '');
    return {
      status: c.falhas.length || c.pendentes ? 'PARCIAL' : 'SUCESSO',
      total: c.compras,
      fontesComFalha: c.falhas.length ? [FONTE_PNCP_ATAS_A_MONTAR] : [],
      mensagem: mensagem.slice(0, 1000)
    };
  });
}

/**
 * Teste sem gravar (dry): lista as compras e lê itens e minuta das que ainda não estão no banco, sem gravar nada.
 * Antes da migration 238, a fila não existe: todas as compras contam como novas.
 */
export async function testarAtasAMontar(opts: OpcoesAtasAMontar): Promise<Record<string, unknown>> {
  const ctx = contexto(opts);
  const compras = await buscarComprasHomologadas(ctx, (opts.hoje ?? (() => new Date()))());
  let fila: CompraDaFila[] = [];
  try {
    fila = await ctx.banco.fila();
  } catch {
    // Migration ainda não aplicada.
  }
  const leituras: Array<Record<string, unknown>> = [];
  const banco: BancoDasAtasAMontar = { ...ctx.banco, gravar: async (x) => void leituras.push(resumo(x)), temFornecedorSemAta: async () => true };
  const c = await processar(compras, new Map(fila.map((f) => [f.numero_controle_compra, f])), { ...ctx, banco });
  return { ...c, pregoes: compras.map((x) => `${x.numero_compra}/${x.ano_compra}`), naFila: fila.length, leituras };
}

function resumo(x: CompraParaGravar): Record<string, unknown> {
  return {
    compra: `${x.numero_compra}/${x.ano_compra}`,
    itens: x.itens?.length,
    fornecedores: x.itens ? [...new Set(x.itens.flatMap((i) => i.resultados.map((r) => r.fornecedor_nome)))] : undefined,
    minuta: x.minuta ? (x.minuta.estado === 'FALHOU' ? x.minuta : { estado: x.minuta.estado, modelo: x.minuta.leitura.modelo, arquivo: x.minuta.leitura.arquivo }) : undefined
  };
}
