/**
 * Leitura do Painel do Orçamento Federal do SIOP (QlikView AJAX, documento IAS/Execucao_Orcamentaria.qvw), aba
 * Emendas Parlamentares, direto do servidor do painel, sem o "Enviar para Excel". Mapeado pelo HAR do navegador em
 * 03/11/2026:
 *
 *   1. <update mark="">…<set name="Document.TabRow.Document\SH08"/> abre a sessão anônima já na aba das emendas
 *      (SH06 é o menu inicial; o botão TX1738 do menu leva à SH08). O servidor devolve mark e stamp, que vão em
 *      todas as chamadas seguintes.
 *   2. <poll name="N" clearcache="true"/> pede os objetos da aba. A tabela é o gráfico Document\CH102 (no
 *      navegador, name="79"), com totalsize="13:562": 13 colunas e as linhas, sendo a linha 0 o Total.
 *   3. <get name="79" offset="0:K"/> devolve 40 linhas a partir de K. Cada coluna vem num <value name="C0".."C12">
 *      com um <element text="…"> por célula; o 1º é o cabeçalho e as células mescladas já vêm repetidas por linha.
 *
 * Só o servidor lê (não há CORS nem proxy da Vercel para o painel): o endereço /api-siop/ é traduzido pelo
 * proxyDeFontes da Edge Function. Os valores do painel são em R$ 1,00, no formato "1.234.567".
 */

export const ENDERECO_DO_PAINEL = '/api-siop/QvAjaxZfc/QvsViewClient.aspx';
export const HOST_DO_PAINEL = 'QVS@pqlk04';
export const DOCUMENTO_DO_PAINEL = 'IAS/Execucao_Orcamentaria.qvw';
/** Aba "Emendas Parlamentares" do painel. */
export const ABA_DAS_EMENDAS = 'SH08';
/** Tabela das emendas (id estável dentro do .qvw; o número de sessão, "79", pode mudar). */
export const TABELA_DAS_EMENDAS = 'Document\\CH102';
/** Botão "Emendas Parlamentares" do menu inicial (SH06): plano B, se a aba não abrir direto. */
export const BOTAO_DAS_EMENDAS = 'Document\\TX1738';
/** Quantos objetos da aba pedir no poll (a aba das emendas tem ~115). */
const OBJETOS_NO_POLL = 160;

// ------------------------------------------------------------------------------
// XML mínimo (o servidor do painel devolve XML simples; Deno e Node não têm DOMParser)
// ------------------------------------------------------------------------------

export interface NoXml {
  tag: string;
  atributos: Record<string, string>;
  filhos: NoXml[];
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodificar(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (inteira, ent: string) => {
    if (ent[0] === '#') {
      const codigo = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : inteira;
    }
    return ENTIDADES[ent.toLowerCase()] ?? inteira;
  });
}

/** Árvore das tags e atributos do XML (o texto entre as tags não interessa: o painel põe tudo em atributos). */
export function lerXml(xml: string): NoXml {
  const raiz: NoXml = { tag: '#documento', atributos: {}, filhos: [] };
  const pilha: NoXml[] = [raiz];
  const tag = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  const atributo = /([\w.:-]+)\s*=\s*"([^"]*)"/g;
  for (const m of xml.matchAll(tag)) {
    const [, fecha, nome, attrs, autoFecha] = m;
    if (fecha) {
      // Fecha até a tag de mesmo nome (tolera XML mal fechado).
      for (let i = pilha.length - 1; i > 0; i--) {
        if (pilha[i].tag === nome) {
          pilha.length = i;
          break;
        }
      }
      continue;
    }
    const no: NoXml = { tag: nome, atributos: {}, filhos: [] };
    for (const a of attrs.matchAll(atributo)) no.atributos[a[1]] = decodificar(a[2]);
    pilha[pilha.length - 1].filhos.push(no);
    if (!autoFecha) pilha.push(no);
  }
  return raiz.filhos.length === 1 ? raiz.filhos[0] : raiz;
}

function* percorrer(no: NoXml): Generator<NoXml> {
  yield no;
  for (const f of no.filhos) yield* percorrer(f);
}

// ------------------------------------------------------------------------------
// Tabela do painel
// ------------------------------------------------------------------------------

export interface InfoDaTabela {
  /** Número do objeto na sessão (o "79" do navegador). */
  nome: string;
  colunas: number;
  /** Linhas da tabela, contando a linha 0 (Total). */
  linhas: number;
  /** Linhas por página (40). */
  porPagina: number;
}

/** Tamanho da tabela das emendas, se ela veio na resposta. */
export function infoDaTabela(raiz: NoXml, objectid: string = TABELA_DAS_EMENDAS): InfoDaTabela | null {
  for (const n of percorrer(raiz)) {
    if (n.tag !== 'group' || n.atributos.objectid !== objectid || !n.atributos.totalsize) continue;
    const [colunas, linhas] = n.atributos.totalsize.split(':').map(Number);
    const porPagina = Number((n.atributos.pagesize ?? '40:40').split(':')[1]) || 40;
    if (!Number.isFinite(colunas) || !Number.isFinite(linhas)) continue;
    return { nome: n.atributos.name, colunas, linhas, porPagina };
  }
  return null;
}

/** O <group> da tabela que traz células (<value name="C0">). */
export function grupoComDados(raiz: NoXml, nome: string): NoXml | null {
  for (const n of percorrer(raiz)) {
    if (n.tag === 'group' && n.atributos.name === nome && n.filhos.some((f) => f.tag === 'value' && f.atributos.name === 'C0')) return n;
  }
  return null;
}

/** Número do objeto, na sessão, que tem o objectid pedido (ex.: o botão das emendas). */
export function nomeDoObjeto(raiz: NoXml, objectid: string): string | null {
  for (const n of percorrer(raiz)) if (n.tag === 'group' && n.atributos.objectid === objectid) return n.atributos.name ?? null;
  return null;
}

export interface PaginaDaTabela {
  cabecalhos: string[];
  /** Índice da linha na tabela (0 = Total) → texto de cada coluna. */
  linhas: Map<number, string[]>;
}

/** Uma página da tabela: cabeçalhos e linhas pelo índice (pageoffset + posição). */
export function lerPagina(grupo: NoXml): PaginaDaTabela {
  const inicio = Number((grupo.atributos.pageoffset ?? '0:0').split(':')[1]) || 0;
  const colunas = grupo.filhos
    .filter((f) => f.tag === 'value' && /^C\d+$/.test(f.atributos.name ?? ''))
    .sort((a, b) => Number(a.atributos.name.slice(1)) - Number(b.atributos.name.slice(1)));
  const cabecalhos: string[] = [];
  const celulas: string[][] = [];
  for (const c of colunas) {
    const elementos = c.filhos.filter((f) => f.tag === 'element');
    cabecalhos.push(elementos[0]?.atributos.text ?? c.atributos.name);
    celulas.push(elementos.slice(1).map((e) => e.atributos.text ?? ''));
  }
  const n = Math.max(0, ...celulas.map((c) => c.length));
  const linhas = new Map<number, string[]>();
  for (let i = 0; i < n; i++) linhas.set(inicio + i, celulas.map((c) => c[i] ?? ''));
  return { cabecalhos, linhas };
}

/** "1.234.567" ou "1.234.567,89" → número; vazio ou "-" → null. */
export function valorDoPainel(texto: string | null | undefined): number | null {
  const t = String(texto ?? '').trim();
  if (!t || t === '-') return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** "Dados referentes à Base SIAFI de 30/10/2026" em qualquer resposta → "2026-10-30". */
export function baseSiafiDaResposta(xml: string): string | null {
  const m = xml.match(/Base SIAFI de (\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// ------------------------------------------------------------------------------
// Linhas das emendas
// ------------------------------------------------------------------------------

/** Uma linha do painel: a emenda numa ação e numa modalidade de aplicação. É o que vai para o banco. */
export interface LinhaDoPainelSiop {
  ano: number;
  /** 8 dígitos, como no SIOP (código do autor + sequencial). */
  emenda: string;
  rp: string;
  autor: string;
  tipo_autor: string;
  orgao: string;
  acao: string;
  modalidade: string;
  dotacao_inicial: number | null;
  dotacao_atual: number | null;
  empenhado: number | null;
  liquidado: number | null;
  pago: number | null;
}

type CampoDeTexto = 'rp' | 'autor' | 'tipo_autor' | 'orgao' | 'acao' | 'modalidade';
type CampoDeValor = 'dotacao_inicial' | 'dotacao_atual' | 'empenhado' | 'liquidado' | 'pago';

/** Cabeçalho do painel → campo. A ordem das colunas no painel pode mudar; os nomes, não. */
const CABECALHOS: Record<string, 'ano' | 'emenda' | CampoDeTexto | CampoDeValor> = {
  Ano: 'ano',
  RP: 'rp',
  Autor: 'autor',
  'Tipo Autor': 'tipo_autor',
  'Nro. Emenda': 'emenda',
  Órgão: 'orgao',
  Ação: 'acao',
  Modalidade: 'modalidade',
  'Dotação Inicial Emenda': 'dotacao_inicial',
  'Dotação Atual Emenda': 'dotacao_atual',
  Empenhado: 'empenhado',
  Liquidado: 'liquidado',
  Pago: 'pago'
};
const CAMPOS_DE_VALOR: CampoDeValor[] = ['dotacao_inicial', 'dotacao_atual', 'empenhado', 'liquidado', 'pago'];

export type TotaisDoPainel = Record<CampoDeValor, number | null>;

export interface TabelaDasEmendas {
  linhas: LinhaDoPainelSiop[];
  /** Linha "Total" que o próprio painel calcula. */
  totais: TotaisDoPainel;
  /** Campos cuja soma das linhas não bate com o Total do painel (vazio = conferido). */
  divergencias: string[];
}

function chave(l: LinhaDoPainelSiop): string {
  return `${l.ano}|${l.emenda}|${l.acao}|${l.modalidade}`;
}

/**
 * Converte as linhas da tabela (com a linha 0 = Total) nas linhas das emendas, confere com o Total do painel e junta
 * linhas repetidas pela chave (ano, emenda, ação, modalidade), que é a chave do banco.
 */
export function montarTabela(cabecalhos: string[], linhas: Map<number, string[]>): TabelaDasEmendas {
  const indice = new Map<string, number>();
  cabecalhos.forEach((c, i) => {
    const campo = CABECALHOS[c.trim()];
    if (campo) indice.set(campo, i);
  });
  const faltam = Object.entries(CABECALHOS).filter(([, campo]) => !indice.has(campo)).map(([c]) => c);
  if (faltam.length) throw new Error(`O painel do SIOP mudou: faltam as colunas ${faltam.join(', ')}.`);
  const col = (celulas: string[], campo: string) => (celulas[indice.get(campo)!] ?? '').trim();

  const ordem = [...linhas.keys()].sort((a, b) => a - b);
  const total = linhas.get(0);
  const totais = Object.fromEntries(CAMPOS_DE_VALOR.map((c) => [c, total && col(total, 'ano') === 'Total' ? valorDoPainel(col(total, c)) : null])) as TotaisDoPainel;

  const porChave = new Map<string, LinhaDoPainelSiop>();
  for (const i of ordem) {
    const c = linhas.get(i)!;
    if (col(c, 'ano') === 'Total') continue;
    const ano = Number(col(c, 'ano'));
    const emenda = col(c, 'emenda').replace(/\D/g, '');
    if (!Number.isInteger(ano) || !/^\d{8}$/.test(emenda)) continue;
    const linha: LinhaDoPainelSiop = {
      ano,
      emenda,
      rp: col(c, 'rp'),
      autor: col(c, 'autor'),
      tipo_autor: col(c, 'tipo_autor'),
      orgao: col(c, 'orgao'),
      acao: col(c, 'acao'),
      modalidade: col(c, 'modalidade'),
      dotacao_inicial: valorDoPainel(col(c, 'dotacao_inicial')),
      dotacao_atual: valorDoPainel(col(c, 'dotacao_atual')),
      empenhado: valorDoPainel(col(c, 'empenhado')),
      liquidado: valorDoPainel(col(c, 'liquidado')),
      pago: valorDoPainel(col(c, 'pago'))
    };
    const ja = porChave.get(chave(linha));
    if (!ja) {
      porChave.set(chave(linha), linha);
      continue;
    }
    for (const campo of CAMPOS_DE_VALOR) {
      ja[campo] = ja[campo] == null && linha[campo] == null ? null : (ja[campo] ?? 0) + (linha[campo] ?? 0);
    }
  }
  const resultado = [...porChave.values()];
  const divergencias = CAMPOS_DE_VALOR.filter((campo) => {
    if (totais[campo] == null) return false;
    const soma = resultado.reduce((s, l) => s + (l[campo] ?? 0), 0);
    return Math.abs(soma - (totais[campo] as number)) > 1;
  });
  return { linhas: resultado, totais, divergencias };
}

// ------------------------------------------------------------------------------
// Sessão no servidor do painel
// ------------------------------------------------------------------------------

export interface OpcoesDoPainel {
  fetcher?: typeof fetch;
  /** Chave anti-CSRF do QlikView (vai no endereço e no cookie); gerada se não vier. */
  xrfkey?: string;
}

function novaXrfkey(): string {
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => letras[b % letras.length]).join('');
}

export interface SessaoDoPainel {
  /** Manda os comandos dentro de um <update> e devolve a resposta lida (e o texto, para a data da base). */
  atualizar: (comandos: string, primeira?: boolean) => Promise<{ raiz: NoXml; texto: string }>;
}

export function criarSessaoDoPainel(opts: OpcoesDoPainel = {}): SessaoDoPainel {
  const fetcher = opts.fetcher ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const xrfkey = opts.xrfkey ?? novaXrfkey();
  const cookies = new Map<string, string>([['xrfkey', xrfkey]]);
  let mark = '';
  let stamp = '';

  return {
    async atualizar(comandos, primeira = false) {
      const corpo =
        `<update mark="${mark}" stamp="${stamp}" cookie="true"${primeira ? ' sharedfile="true"' : ''} scope="Document" ` +
        `view="${DOCUMENTO_DO_PAINEL}" ident="null">${comandos}</update>`;
      const params = new URLSearchParams({ mark, host: HOST_DO_PAINEL, view: DOCUMENTO_DO_PAINEL, slot: '', platform: 'browser.chrome', dpi: '96', xrfkey });
      const resp = await fetcher(`${ENDERECO_DO_PAINEL}?${params.toString()}`, {
        method: 'POST',
        headers: {
          accept: '*/*',
          'content-type': 'text/plain;charset=UTF-8',
          cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')
        },
        body: corpo
      });
      const texto = await resp.text();
      if (resp.status === 403 || /Just a moment|cf-chl/i.test(texto)) {
        throw new Error(`O painel do SIOP recusou o acesso do servidor (HTTP ${resp.status}; proteção da Cloudflare).`);
      }
      if (!resp.ok) throw new Error(`O painel do SIOP respondeu HTTP ${resp.status}.`);
      const novos = (resp.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      for (const c of novos) {
        const [par] = c.split(';');
        const i = par.indexOf('=');
        if (i > 0) cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
      }
      const raiz = lerXml(texto);
      if (raiz.tag !== 'result') throw new Error('O painel do SIOP não devolveu XML (resposta inesperada).');
      mark = raiz.atributos.mark ?? mark;
      stamp = raiz.atributos.stamp ?? stamp;
      if (!mark) throw new Error('O painel do SIOP não abriu a sessão (sem "mark").');
      return { raiz, texto };
    }
  };
}

function pedirObjetos(): string {
  let polls = '';
  for (let i = OBJETOS_NO_POLL; i >= 1; i--) polls += `<poll name="${i}" clearcache="true" />`;
  return polls;
}

export interface LeituraDoPainel extends TabelaDasEmendas {
  /** Dia da base SIAFI do painel ("Dados referentes à Base SIAFI de …"), AAAA-MM-DD. */
  baseSiafi: string | null;
  /** Linhas da tabela no painel, contando o Total. */
  linhasNoPainel: number;
  /** Chamadas feitas ao painel. */
  chamadas: number;
}

/**
 * Abre a sessão, vai à aba das emendas e lê a tabela inteira, página por página. Lança se não conseguir ler tudo
 * dentro do orçamento de tempo: uma leitura incompleta não serve, porque o banco troca a foto do ano inteiro.
 * `paginas` limita as páginas lidas (teste de acesso).
 */
export async function lerEmendasDoPainel(
  opts: OpcoesDoPainel & { orcamentoMs?: number; agora?: () => number; paginas?: number } = {}
): Promise<LeituraDoPainel> {
  const agora = opts.agora ?? (() => Date.now());
  const inicio = agora();
  const sessao = criarSessaoDoPainel(opts);
  let chamadas = 0;
  let baseSiafi: string | null = null;
  const chamar = async (comandos: string, primeira = false) => {
    chamadas++;
    const r = await sessao.atualizar(comandos, primeira);
    baseSiafi = baseSiafi ?? baseSiafiDaResposta(r.texto);
    return r.raiz;
  };

  await chamar(
    '<add name="Document.ActiveSheet" /><set name="Document" add="mode;servercontrol;ie6false" />' +
      `<set name="Document.TabRow.Document\\${ABA_DAS_EMENDAS}" action="" />`,
    true
  );
  let raiz = await chamar(pedirObjetos());
  let info = infoDaTabela(raiz);
  if (!info) {
    // Plano B: a sessão abriu no menu inicial; clica no botão "Emendas Parlamentares", como o navegador faz.
    const botao = nomeDoObjeto(raiz, BOTAO_DAS_EMENDAS);
    if (botao) {
      await chamar(`<set name="Document.${botao}.Content" action="" clientsizeWH="1280:900" />`);
      raiz = await chamar(pedirObjetos());
      info = infoDaTabela(raiz);
    }
  }
  if (!info) throw new Error(`O painel do SIOP não mostrou a tabela das emendas (${TABELA_DAS_EMENDAS}); o painel pode ter mudado.`);

  const linhas = new Map<number, string[]>();
  let cabecalhos: string[] = [];
  const guardar = (grupo: NoXml | null) => {
    if (!grupo) return;
    const p = lerPagina(grupo);
    if (!cabecalhos.length) cabecalhos = p.cabecalhos;
    for (const [i, l] of p.linhas) linhas.set(i, l);
  };
  guardar(grupoComDados(raiz, info.nome));

  const limite = opts.paginas == null ? info.linhas : Math.min(info.linhas, opts.paginas * info.porPagina);
  for (let offset = 0; offset < limite; offset += info.porPagina) {
    if (linhas.has(offset)) continue;
    if (opts.orcamentoMs != null && agora() - inicio > opts.orcamentoMs) {
      throw new Error(`O tempo acabou com ${linhas.size} de ${info.linhas} linhas do painel lidas; nada foi gravado.`);
    }
    const pagina = grupoComDados(await chamar(`<get name="${info.nome}" offset="0:${offset}" />`), info.nome);
    if (!pagina) throw new Error(`O painel do SIOP não devolveu a página que começa na linha ${offset}.`);
    guardar(pagina);
  }

  if (opts.paginas == null) {
    const faltam = [];
    for (let i = 0; i < info.linhas; i++) if (!linhas.has(i)) faltam.push(i);
    if (faltam.length) throw new Error(`Faltaram ${faltam.length} linhas do painel (ex.: ${faltam.slice(0, 3).join(', ')}).`);
  }
  const tabela = montarTabela(cabecalhos, linhas);
  return { ...tabela, baseSiafi, linhasNoPainel: info.linhas, chamadas };
}
