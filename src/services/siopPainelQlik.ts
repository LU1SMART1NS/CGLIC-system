/**
 * Leitura do Painel do Orçamento Federal do SIOP (QlikView AJAX, documento IAS/Execucao_Orcamentaria.qvw), aba
 * Emendas Parlamentares, direto do servidor do painel, sem o "Enviar para Excel". Mapeado pelo HAR do navegador e pelo
 * cliente do próprio painel (QvAjax.js) em 03/11/2026:
 *
 *   1. <update mark="">…<set name="Document.TabRow.Document\SH08"/> abre a sessão anônima já na aba das emendas
 *      (SH06 é o menu inicial; o botão TX1738 do menu leva à SH08). O servidor devolve mark e stamp, que vão em
 *      todas as chamadas seguintes.
 *   2. <poll name="N" clearcache="true"/> pede os objetos da aba. A tabela é o gráfico Document\CH102 (no
 *      navegador, name="79"); totalsize="colunas:linhas", com a linha 0 = Total.
 *   3. Como o painel abre limitado (filtros do Passo 1 em Ano 2026, Órgão 30000 e RP 6; seis dos doze agrupadores
 *      do Passo 2 desligados), a leitura completa:
 *        - aciona "Limpar": <set name="Document.StandardActions.CLEARSTATE" action=""/> (Qva.PageBinding.Clear);
 *        - liga cada agrupador desligado clicando no botão à esquerda do rótulo ("Por GND"…):
 *          <set name="Document.N.Content" action=""/>; o clique certo aumenta as colunas da tabela, e o que
 *          diminuir é desfeito (o agrupador já estava ligado);
 *        - pede páginas grandes: <set name="79" pageSize="colunas:linhas"/> (SetPagesize do QvAjax.js); se o
 *          servidor não aceitar, segue com o tamanho que ele devolver.
 *   4. <get name="79" offset="0:K"/> devolve as linhas a partir de K. Cada coluna vem num <value name="Cn"> com um
 *      <element text="…"> por célula; o 1º é o cabeçalho e as células mescladas já vêm repetidas em cada linha.
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
/** Rótulos dos agrupadores do Passo 2, como aparecem no painel. */
export const AGRUPADORES = [
  'Por Autor da Emenda', 'Por Tipo de Autor', 'Por Partido',
  'Por UF do Autor', 'Por Número de Emenda', 'Por Órgão Orçamentário',
  'Por Unidade Orçamentária', 'Por Ação', 'Por Localizador',
  'Por GND', 'Por Modalidade', 'Por Natureza de Despesa'
] as const;
/** Linhas por página pedidas ao painel (o padrão do navegador é 40). */
export const LINHAS_POR_PAGINA = 2000;
/** Quantos objetos da aba pedir no poll (a aba das emendas tem ~115). */
const OBJETOS_NO_POLL = 200;
const TAMANHO_DA_JANELA = 'clientsizeWH="1600:1000"';

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
// Objetos da aba
// ------------------------------------------------------------------------------

export interface InfoDaTabela {
  /** Número do objeto na sessão (o "79" do navegador). */
  nome: string;
  colunas: number;
  /** Linhas da tabela, contando a linha 0 (Total). */
  linhas: number;
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

/**
 * Botão de cada agrupador do Passo 2: o objeto de texto clicável (Content actions="true", sem texto) que fica logo à
 * esquerda do rótulo, na mesma linha. As posições vêm nos <object name="N" left top> do poll.
 */
export function botoesDosAgrupadores(raiz: NoXml): Map<string, string> {
  const posicao = new Map<string, { x: number; y: number }>();
  const rotulos = new Map<string, string>();
  const botoes: string[] = [];
  for (const n of percorrer(raiz)) {
    if (n.tag === 'object' && /^\d+$/.test(n.atributos.name ?? '') && n.atributos.left != null && n.atributos.top != null) {
      posicao.set(n.atributos.name, { x: Number(n.atributos.left), y: Number(n.atributos.top) });
    }
    if (n.tag !== 'group' || n.atributos.type !== 'TX' || n.atributos.mode === 'hidden') continue;
    const conteudo = n.filhos.find((f) => f.tag === 'value' && f.atributos.name === 'Content');
    const texto = conteudo?.atributos.text ?? '';
    if ((AGRUPADORES as readonly string[]).includes(texto)) rotulos.set(texto, n.atributos.name);
    else if (conteudo?.atributos.actions === 'true' && texto === '') botoes.push(n.atributos.name);
  }
  const mapa = new Map<string, string>();
  for (const [rotulo, nome] of rotulos) {
    const r = posicao.get(nome);
    if (!r) continue;
    let melhor: { nome: string; d: number } | null = null;
    for (const b of botoes) {
      const p = posicao.get(b);
      if (!p) continue;
      const d = r.x - p.x;
      if (d > 0 && d <= 80 && Math.abs(p.y - r.y) <= 12 && (!melhor || d < melhor.d)) melhor = { nome: b, d };
    }
    if (melhor) mapa.set(rotulo, melhor.nome);
  }
  return mapa;
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

type CampoDeValor = 'dotacao_inicial' | 'dotacao_atual' | 'empenhado' | 'liquidado' | 'pago';
type CampoDeTexto =
  | 'rp' | 'autor' | 'tipo_autor' | 'partido' | 'uf' | 'orgao' | 'unidade_orcamentaria'
  | 'acao' | 'localizador' | 'gnd' | 'modalidade' | 'natureza_despesa';

/** Uma linha do painel, com todos os agrupadores. É o que vai para o banco. */
export interface LinhaDoPainelSiop extends Record<CampoDeTexto, string | null>, Record<CampoDeValor, number | null> {
  ano: number;
  /** 8 dígitos, como no SIOP (código do autor + sequencial). */
  emenda: string;
  /** Todas as colunas de texto da linha, pelo cabeçalho do painel (inclusive as que o sistema não separa). */
  dimensoes: Record<string, string>;
  /** Identifica a linha dentro do ano: a emenda e todas as dimensões, na ordem dos cabeçalhos. */
  chave: string;
}

/** Cabeçalho do painel → campo. Os nomes das colunas novas variam um pouco; por isso, expressões. */
const CAMPOS_POR_CABECALHO: Array<[RegExp, 'ano' | 'emenda' | CampoDeTexto | CampoDeValor]> = [
  [/^ano$/i, 'ano'],
  [/^n(ro|º|°|úmero)\.?\s*(da\s+)?emenda$/i, 'emenda'],
  [/^rp$|resultado prim/i, 'rp'],
  [/^tipo\s+(de\s+)?autor$/i, 'tipo_autor'],
  [/^autor(\s+da\s+emenda)?$/i, 'autor'],
  [/partido/i, 'partido'],
  [/^uf\b|uf do autor/i, 'uf'],
  [/unidade or[çc]ament/i, 'unidade_orcamentaria'],
  [/^[óo]rg[ãa]o/i, 'orgao'],
  [/^a[çc][ãa]o$/i, 'acao'],
  [/localizador/i, 'localizador'],
  [/^gnd\b|grupo de natureza/i, 'gnd'],
  [/modalidade/i, 'modalidade'],
  [/natureza de despesa|^nd$|elemento/i, 'natureza_despesa'],
  [/dota[çc][ãa]o inicial/i, 'dotacao_inicial'],
  [/dota[çc][ãa]o atual/i, 'dotacao_atual'],
  [/^empenhado$/i, 'empenhado'],
  [/^liquidado$/i, 'liquidado'],
  [/^pago$/i, 'pago']
];
const CAMPOS_DE_VALOR: CampoDeValor[] = ['dotacao_inicial', 'dotacao_atual', 'empenhado', 'liquidado', 'pago'];
const CAMPOS_DE_TEXTO: CampoDeTexto[] = [
  'rp', 'autor', 'tipo_autor', 'partido', 'uf', 'orgao', 'unidade_orcamentaria', 'acao', 'localizador', 'gnd', 'modalidade', 'natureza_despesa'
];
/** Sem estas o painel não serve: a linha não teria emenda nem valores. */
const OBRIGATORIOS: Array<'ano' | 'emenda' | CampoDeValor> = ['ano', 'emenda', ...CAMPOS_DE_VALOR];

export type TotaisDoPainel = Record<CampoDeValor, number | null>;

export interface TabelaDasEmendas {
  linhas: LinhaDoPainelSiop[];
  /** Cabeçalhos como vieram do painel. */
  cabecalhos: string[];
  /** Linha "Total" que o próprio painel calcula. */
  totais: TotaisDoPainel;
  /** Campos cuja soma das linhas não bate com o Total do painel (vazio = conferido). */
  divergencias: string[];
}

export function campoDoCabecalho(cabecalho: string): string | null {
  const c = cabecalho.trim();
  return CAMPOS_POR_CABECALHO.find(([re]) => re.test(c))?.[1] ?? null;
}

/**
 * Converte as linhas da tabela (com a linha 0 = Total) nas linhas das emendas, confere com o Total do painel e junta
 * linhas repetidas pela chave (a emenda e todas as dimensões).
 */
export function montarTabela(cabecalhos: string[], linhas: Map<number, string[]>): TabelaDasEmendas {
  const indice = new Map<string, number>();
  cabecalhos.forEach((c, i) => {
    const campo = campoDoCabecalho(c);
    if (campo && !indice.has(campo)) indice.set(campo, i);
  });
  const faltam = OBRIGATORIOS.filter((c) => !indice.has(c));
  if (faltam.length) throw new Error(`O painel do SIOP mudou: faltam as colunas ${faltam.join(', ')}.`);
  const posicoesDeValor = new Set(CAMPOS_DE_VALOR.map((c) => indice.get(c)!));
  const col = (celulas: string[], campo: string) => (indice.has(campo) ? (celulas[indice.get(campo)!] ?? '').trim() : '');

  const total = linhas.get(0);
  const ehTotal = (c: string[]) => (c[0] ?? '').trim() === 'Total';
  const totais = Object.fromEntries(CAMPOS_DE_VALOR.map((c) => [c, total && ehTotal(total) ? valorDoPainel(col(total, c)) : null])) as TotaisDoPainel;

  const porChave = new Map<string, LinhaDoPainelSiop>();
  for (const i of [...linhas.keys()].sort((a, b) => a - b)) {
    const c = linhas.get(i)!;
    if (ehTotal(c)) continue;
    const ano = Number(col(c, 'ano'));
    const emenda = col(c, 'emenda').replace(/\D/g, '');
    if (!Number.isInteger(ano) || !/^\d{8}$/.test(emenda)) continue;
    const dimensoes: Record<string, string> = {};
    cabecalhos.forEach((h, j) => {
      if (!posicoesDeValor.has(j)) dimensoes[h.trim()] = (c[j] ?? '').trim();
    });
    const fora = new Set([...posicoesDeValor, indice.get('ano'), indice.get('emenda')]);
    const chave = [emenda, ...cabecalhos.flatMap((_, j) => (fora.has(j) ? [] : [(c[j] ?? '').trim()]))].join('|');
    const linha = { ano, emenda, dimensoes, chave } as LinhaDoPainelSiop;
    for (const campo of CAMPOS_DE_TEXTO) linha[campo] = col(c, campo) || null;
    for (const campo of CAMPOS_DE_VALOR) linha[campo] = valorDoPainel(col(c, campo));
    const ja = porChave.get(`${ano}#${chave}`);
    if (!ja) {
      porChave.set(`${ano}#${chave}`, linha);
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
  return { linhas: resultado, cabecalhos, totais, divergencias };
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

export interface OpcoesDaLeitura extends OpcoesDoPainel {
  orcamentoMs?: number;
  agora?: () => number;
  /** Limita as páginas lidas (teste de acesso): a leitura não é conferida. */
  paginas?: number;
  /** Tirar os filtros do Passo 1 ("Limpar"). Padrão: sim. */
  limparFiltros?: boolean;
  /** Agrupadores a ligar. Padrão: todos. */
  agrupadores?: readonly string[];
  /** Linhas por página pedidas ao painel. */
  linhasPorPagina?: number;
}

export interface LeituraDoPainel extends TabelaDasEmendas {
  /** Dia da base SIAFI do painel ("Dados referentes à Base SIAFI de …"), AAAA-MM-DD. */
  baseSiafi: string | null;
  /** Linhas da tabela no painel, contando o Total. */
  linhasNoPainel: number;
  /** Agrupadores que a leitura ligou e os que não achou na tela. */
  agrupadoresLigados: string[];
  agrupadoresNaoEncontrados: string[];
  /** Chamadas feitas ao painel. */
  chamadas: number;
}

/**
 * Abre a sessão, vai à aba das emendas, tira os filtros, liga os agrupadores e lê a tabela inteira. Lança se não
 * conseguir ler tudo dentro do orçamento de tempo: uma leitura incompleta não serve, porque o banco troca a foto dos
 * anos lidos de uma vez.
 */
export async function lerEmendasDoPainel(opts: OpcoesDaLeitura = {}): Promise<LeituraDoPainel> {
  const agora = opts.agora ?? (() => Date.now());
  const inicio = agora();
  const sessao = criarSessaoDoPainel(opts);
  const agrupadores = opts.agrupadores ?? AGRUPADORES;
  let chamadas = 0;
  let baseSiafi: string | null = null;
  const chamar = async (comandos: string, primeira = false) => {
    if (opts.orcamentoMs != null && agora() - inicio > opts.orcamentoMs) {
      throw new Error('O tempo acabou antes de terminar a leitura do painel; nada foi gravado.');
    }
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
      await chamar(`<set name="Document.${botao}.Content" action="" ${TAMANHO_DA_JANELA} />`);
      raiz = await chamar(pedirObjetos());
      info = infoDaTabela(raiz);
    }
  }
  if (!info) throw new Error(`O painel do SIOP não mostrou a tabela das emendas (${TABELA_DAS_EMENDAS}); o painel pode ter mudado.`);

  if (opts.limparFiltros !== false) {
    await chamar(`<set name="Document.StandardActions.CLEARSTATE" action="" ${TAMANHO_DA_JANELA} />`);
    raiz = await chamar(pedirObjetos());
    info = infoDaTabela(raiz);
    if (!info) throw new Error('Sem filtros, o painel do SIOP não mostrou a tabela das emendas (o painel pode exigir algum filtro).');
  }

  const agrupadoresLigados: string[] = [];
  const agrupadoresNaoEncontrados: string[] = [];
  for (const rotulo of agrupadores) {
    const botao = botoesDosAgrupadores(raiz).get(rotulo);
    if (!botao) {
      agrupadoresNaoEncontrados.push(rotulo);
      continue;
    }
    const antes = info!.colunas;
    await chamar(`<set name="Document.${botao}.Content" action="" ${TAMANHO_DA_JANELA} />`);
    raiz = await chamar(pedirObjetos());
    info = infoDaTabela(raiz) ?? info;
    if (info!.colunas < antes) {
      // Já estava ligado: o clique desligou. Clica de novo para voltar.
      const deNovo = botoesDosAgrupadores(raiz).get(rotulo) ?? botao;
      await chamar(`<set name="Document.${deNovo}.Content" action="" ${TAMANHO_DA_JANELA} />`);
      raiz = await chamar(pedirObjetos());
      info = infoDaTabela(raiz) ?? info;
    } else if (info!.colunas > antes) {
      agrupadoresLigados.push(rotulo);
    }
  }
  const tabela = info!;

  // Páginas grandes; se o servidor não aceitar, vale o tamanho que ele devolver em cada página.
  const pedido = opts.linhasPorPagina ?? LINHAS_POR_PAGINA;
  await chamar(`<set name="${tabela.nome}" pageSize="${tabela.colunas}:${pedido}" />`);

  const linhas = new Map<number, string[]>();
  let cabecalhos: string[] = [];
  const limite = opts.paginas == null ? tabela.linhas : Math.min(tabela.linhas, opts.paginas * pedido);
  let lidas = 0;
  for (let offset = 0; offset < limite && (opts.paginas == null || lidas < opts.paginas); ) {
    const r = await chamar(`<get name="${tabela.nome}" offset="0:${offset}" />`);
    const grupo = grupoComDados(r, tabela.nome);
    if (!grupo) throw new Error(`O painel do SIOP não devolveu a página que começa na linha ${offset}.`);
    const p = lerPagina(grupo);
    if (!cabecalhos.length) cabecalhos = p.cabecalhos;
    for (const [i, l] of p.linhas) linhas.set(i, l);
    lidas++;
    const ultima = Math.max(-1, ...p.linhas.keys());
    if (ultima < offset) throw new Error(`O painel do SIOP devolveu uma página vazia na linha ${offset}.`);
    offset = ultima + 1;
  }

  if (opts.paginas == null) {
    const faltam: number[] = [];
    for (let i = 0; i < tabela.linhas; i++) if (!linhas.has(i)) faltam.push(i);
    if (faltam.length) throw new Error(`Faltaram ${faltam.length} linhas do painel (ex.: ${faltam.slice(0, 3).join(', ')}).`);
  }
  const montada = montarTabela(cabecalhos, linhas);
  return { ...montada, baseSiafi, linhasNoPainel: tabela.linhas, agrupadoresLigados, agrupadoresNaoEncontrados, chamadas };
}
