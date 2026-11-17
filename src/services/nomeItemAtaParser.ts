/**
 * Nome do item na tabela de preços da ata assinada (PDF do PNCP), para as atas novas (recurso 'nome_item_ata',
 * migration 313). A carga de 16/11/2026 (migration 312) leu as atas vigentes e foi conferida pelo usuário; esta é a
 * regra para as que chegam depois.
 *
 * O texto vem do pdf.js com a posição de cada pedaço. A leitura monta a tabela pelas colunas do cabeçalho:
 * - tabela de preços = cabeçalho com ITEM, uma coluna de nome (ESPECIFICAÇÃO, DESCRIÇÃO, OBJETO…) e uma de valor;
 *   as tabelas dos participantes (sem valor) ficam de fora;
 * - o número do item fica na coluna ITEM; com duas numerações (TR e PNCP), vale a do PNCP;
 * - a célula do nome pode ter várias linhas, alinhada no topo ou no meio: as linhas de uma célula ficam juntas, e a
 *   célula pertence ao número que está na sua altura.
 *
 * Em dúvida, não devolve nome (o item fica sem nome e a tela mostra a descrição): número repetido com nomes
 * diferentes, célula que cai em dois números, tabela partida na troca de página, numeração só do TR sem o preço para
 * confirmar, texto que não é nome (R$, TOTAL, só códigos).
 *
 * As fontes do SEI desenham "ti" como um só sinal, sem letra: o pdf.js devolve um caractere de controle ("Jus\0ça",
 * "en\x1adade"; nos 145 PDFs da carga, \0, \x18, \x19, \x1a, \x1b e \x1c, todos "ti"). Em "h\0p" o sinal é "tt" (http).
 */

export interface PedacoDoPdf {
  x: number;
  y: number;
  /** Largura e altura do pedaço (altura ≈ tamanho da letra). */
  w: number;
  h: number;
  s: string;
}

export type PaginaDoPdf = PedacoDoPdf[];

export interface ItemParaNomear {
  /** Número do item no PNCP (o de itens_ata.numero_item, sem os zeros). */
  numero: number;
  /** Preço de hoje no banco: pode estar acima do PDF pelo reajuste. Só serve de pista. */
  valorUnitario: number | null;
}

export interface LinhaDaTabela {
  numero: number;
  bruto: string;
  preco: number | null;
}

export interface NomeLido {
  numero: number;
  nome: string;
}

export interface LeituraDosNomes {
  nomes: NomeLido[];
  /** Por que um item pedido ficou sem nome (para o resumo da execução). */
  semNome: Array<{ numero: number; motivo: string }>;
  tabelas: number;
}

export const TAMANHO_MAXIMO_DO_NOME = 80;

// ------------------------------------------------------------------------------
// Texto
// ------------------------------------------------------------------------------

/** O sinal do "ti" das fontes do SEI: o pdf.js devolve um caractere de controle no lugar. */
const SINAL = '[\\u0000-\\u0008\\u000e-\\u001f]';
const SINAL_EM_HTTP = new RegExp(`h${SINAL}p`, 'g');
const SINAL_NO_FIM = new RegExp(`(\\p{L})${SINAL}(?!\\p{L})`, 'gu');
const SINAL_SOLTO = new RegExp(SINAL, 'g');

export function consertarTexto(s: string): string {
  return (
    s
      .replace(SINAL_EM_HTTP, 'http')
      // No fim da palavra o sinal é "tt" ("Sco\0" = Scott, "Wa\0" = Watt): em português quase nenhuma acaba em "ti".
      .replace(SINAL_NO_FIM, '$1tt')
      .replace(SINAL_SOLTO, 'ti')
      .replace(/[\u00a0\s]+/g, ' ')
  );
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** "R$ 1.977,60" → 1977.6; "2.438,27" → 2438.27. */
export function lerValor(s: string): number | null {
  const m = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+),(\d{2,4})(?!\d)/.exec(s);
  if (!m) return null;
  return Number(m[1].replace(/\./g, '') + '.' + m[2]);
}

interface Pedaco extends PedacoDoPdf {
  cx: number;
}

interface Linha {
  y: number;
  h: number;
  pedacos: Pedaco[];
  texto: string;
}

const alturaDe = (p: PedacoDoPdf) => (p.h > 0 ? p.h : 8);

function juntar(pedacos: Pedaco[]): string {
  const ordem = [...pedacos].sort((a, b) => a.x - b.x);
  let texto = '';
  let fim = Number.NEGATIVE_INFINITY;
  for (const p of ordem) {
    // Pedaços colados (o "ti" do SEI vem à parte) se juntam sem espaço.
    if (texto && p.x - fim > 0.2 * alturaDe(p) && !texto.endsWith(' ') && !p.s.startsWith(' ')) texto += ' ';
    texto += p.s;
    fim = Math.max(fim, p.x + p.w);
  }
  return texto.replace(/ +/g, ' ').trim();
}

/** Agrupa os pedaços em linhas visuais (mesma altura), de cima para baixo. */
function linhasDe(pedacos: Pedaco[]): Linha[] {
  const ordem = [...pedacos].sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: Linha[] = [];
  for (const p of ordem) {
    const l = linhas.find((x) => Math.abs(x.y - p.y) < Math.max(1.5, 0.3 * alturaDe(p)));
    if (l) {
      l.pedacos.push(p);
      l.h = Math.max(l.h, alturaDe(p));
    } else {
      linhas.push({ y: p.y, h: alturaDe(p), pedacos: [p], texto: '' });
    }
  }
  for (const l of linhas) l.texto = juntar(l.pedacos);
  return linhas.sort((a, b) => b.y - a.y);
}

// ------------------------------------------------------------------------------
// Cabeçalho
// ------------------------------------------------------------------------------

/** Título da coluna do número: "ITEM", "ITEM Nº", "Nº DO ITEM", "Item no PNCP"; nas atas de 2026, "ITE" + "M". */
const TITULO_ITEM = /^(?:n[º°o.]?\s*(?:do\s+)?)?ite(?:m|ns)?(?:\s|$|n[º°o.])/i;
const SEMENTE_ITEM = /^(?:n[º°o.]?\s*(?:do\s+)?)?ite(?:m|ns)?\b|^ite?$/i;
const TITULO_NOME = /especifica|descri|objeto|produto|materia(?:l|is)|equipamento|denomina|nome/i;
const TITULO_VALOR = /valor|pre[cç]o|r\$/i;
const TITULO_UNITARIO = /unit|mensal/i;
const SO_NUMERO = /^0*(\d{1,4})$/;
/** Fim da tabela: total, nova cláusula, dados do próximo fornecedor. */
const FIM_DA_TABELA = /^(?:valor\s+)?total\b|total\s+(?:geral|global|da\s+ata|do\s+(?:grupo|lote|registro))|^\d{1,2}\.\d{1,2}\.?\s+\p{Lu}|^\d{1,2}\.\s+\p{Lu}{3}|^(?:fornecedor|empresa|raz[aã]o social|cnpj|representante)\b/iu;
/** Cabeçalho e rodapé das páginas impressas do SEI: não fazem parte da tabela. */
const RUIDO_DA_PAGINA = /SEI\/\w+\s*-|SEI n[º°]|sei\.\w+\.gov\.br|controlador\.php|\bpg\.\s*\d+|^\d{2}\/\d{2}\/\d{4},?\s+\d{2}:\d{2}|^\d+\/\d+$|^Refer[êe]ncia:|Processo n[º°]/i;

interface Coluna {
  esquerda: number;
  direita: number;
}

interface Titulo {
  /** Texto do título, linha a linha com espaço ("VALOR UNITÁRIO") e colado ("ITE"+"M" = "ITEM"). */
  texto: string;
  colado: string;
  cx: number;
  esquerda: number;
  direita: number;
  topo: number;
  base: number;
  /** Texto do título da linha do "ITEM" para baixo (o que fica acima pode ser o fim do bloco do fornecedor). */
  daSementeParaBaixo: string;
  /** Alguma linha abaixo da do "ITEM" tem minúsculas: pode ser o começo da célula da primeira linha da tabela. */
  minusculasAbaixo: boolean;
}

interface Cabecalho {
  pagina: number;
  /** Altura do título mais alto e do mais baixo: o corpo começa abaixo da base. */
  topo: number;
  base: number;
  /** Só a tabela de preços (com coluna de valor) tem os nomes; as outras só limitam o corpo. */
  precos: boolean;
  numero: Coluna;
  nome: Coluna;
  unitario: Coluna | null;
  /** Numeração: 'PNCP' (dita ou única) ou 'TR' (só a do Termo de Referência: precisa do preço para confirmar). */
  numeracao: 'PNCP' | 'TR';
  /** Duas numerações sem dizer qual é a do PNCP. */
  ambigua: boolean;
  /** O título do nome encostou na primeira linha da tabela: a primeira célula pode ter perdido o começo. */
  primeiraDuvidosa: boolean;
}

const dentro = (c: Coluna, x: number) => x > c.esquerda && x < c.direita;
const testa = (re: RegExp, t: Titulo) => re.test(semAcento(t.texto)) || re.test(semAcento(t.colado));

/** Colunas a partir dos centros dos títulos: cada coluna vai do meio até o título vizinho. */
function colunaEntre(cx: number, vizinhos: number[]): Coluna {
  const esq = vizinhos.filter((v) => v < cx - 1).sort((a, b) => b - a)[0];
  const dir = vizinhos.filter((v) => v > cx + 1).sort((a, b) => a - b)[0];
  return { esquerda: esq === undefined ? Number.NEGATIVE_INFINITY : (esq + cx) / 2, direita: dir === undefined ? Number.POSITIVE_INFINITY : (dir + cx) / 2 };
}

/**
 * Títulos das colunas em volta do "ITEM": os pedaços da faixa se juntam por coluna (sobrepostos na horizontal) e,
 * em cada coluna, valem as linhas seguidas mais perto do "ITEM" (o texto da primeira linha da tabela, mais abaixo,
 * fica de fora).
 */
function titulosEmVolta(pedacos: Pedaco[], semente: Pedaco): Titulo[] {
  const h = alturaDe(semente);
  const faixa = pedacos.filter((p) => Math.abs(p.y - semente.y) <= 4 * h);
  // Colunas: cada pedaço da linha do "ITEM" abre uma; os das outras linhas (as mais perto primeiro) entram na coluna
  // com que mais se sobrepõem, sem ligar duas colunas (uma linha larga acima da tabela não junta "ITEM" e "DESCRIÇÃO").
  const sobreposicao = (p: Pedaco, q: Pedaco) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
  const grupos: Pedaco[][] = faixa.filter((p) => Math.abs(p.y - semente.y) < 0.5 * h).sort((a, b) => a.x - b.x).map((p) => [p]);
  const resto = faixa.filter((p) => Math.abs(p.y - semente.y) >= 0.5 * h).sort((a, b) => Math.abs(a.y - semente.y) - Math.abs(b.y - semente.y));
  for (const p of resto) {
    let melhor: Pedaco[] | null = null;
    let maior = 0;
    for (const g of grupos) {
      const v = Math.max(...g.map((q) => sobreposicao(p, q) / Math.max(1, Math.min(p.w, q.w))));
      if (v >= 0.5 && v > maior) {
        maior = v;
        melhor = g;
      }
    }
    if (melhor) melhor.push(p);
    else grupos.push([p]);
  }
  // Primeiro número abaixo do "ITEM": dali para baixo é a tabela, não o título.
  const daSemente = grupos.find((g) => g.includes(semente)) ?? [semente];
  const colunaDaSemente = { esquerda: Math.min(...daSemente.map((p) => p.x)) - h, direita: Math.max(...daSemente.map((p) => p.x + p.w)) + h };
  const primeiroNumero = pedacos
    .filter((p) => p.y < semente.y - 0.3 * h && SO_NUMERO.test(p.s.trim()) && dentro(colunaDaSemente, p.cx))
    .sort((a, b) => b.y - a.y)[0];
  const corte = primeiroNumero ? primeiroNumero.y + 0.5 * alturaDe(primeiroNumero) : Number.NEGATIVE_INFINITY;
  const titulos: Titulo[] = [];
  for (const g of grupos) {
    const ordem = [...g].filter((p) => p.y > corte && p.y <= semente.y + 2.6 * h).sort((a, b) => b.y - a.y || a.x - b.x);
    const trechos: Pedaco[][] = [];
    for (const p of ordem) {
      const atual = trechos[trechos.length - 1];
      if (atual && atual[atual.length - 1].y - p.y <= 1.6 * Math.max(alturaDe(p), h)) atual.push(p);
      else trechos.push([p]);
    }
    const perto = trechos
      .filter((t) => t[0].y >= semente.y - 2.5 * h && t[t.length - 1].y <= semente.y + 2.5 * h)
      .sort((a, b) => Math.abs((a[0].y + a[a.length - 1].y) / 2 - semente.y) - Math.abs((b[0].y + b[b.length - 1].y) / 2 - semente.y))[0];
    if (!perto) continue;
    const linhas = linhasDe(perto);
    const esquerda = Math.min(...perto.map((p) => p.x));
    const direita = Math.max(...perto.map((p) => p.x + p.w));
    const abaixo = linhas.filter((l) => l.y < semente.y - 0.5 * h);
    titulos.push({
      texto: linhas.map((l) => l.texto).join(' '),
      colado: linhas.map((l) => l.texto).join(''),
      cx: (esquerda + direita) / 2,
      esquerda,
      direita,
      topo: Math.max(...perto.map((p) => p.y)),
      base: Math.min(...perto.map((p) => p.y)),
      daSementeParaBaixo: linhas.filter((l) => l.y <= semente.y + 0.5 * h).map((l) => l.texto).join(''),
      minusculasAbaixo: abaixo.some((l) => /\p{Ll}{2}/u.test(l.texto))
    });
  }
  return titulos.sort((a, b) => a.cx - b.cx);
}

/**
 * Coluna do nome. Quando ela vem logo depois da do número, começa onde acaba o título do número: a célula do nome é
 * alinhada à esquerda e o título, no meio; uma linha curta ("aramida") tem o centro perto da borda esquerda.
 */
function colunaDoNome(nome: Titulo, numero: Titulo, titulos: Titulo[]): Coluna {
  const coluna = colunaEntre(nome.cx, titulos.map((t) => t.cx).filter((c) => c !== nome.cx));
  const vizinhoDaEsquerda = titulos.filter((t) => t.cx < nome.cx).sort((a, b) => b.cx - a.cx)[0];
  if (vizinhoDaEsquerda === numero) coluna.esquerda = Math.min(coluna.esquerda, numero.direita + 2);
  return coluna;
}

function acharCabecalhos(paginas: Pedaco[][]): Cabecalho[] {
  const achados: Cabecalho[] = [];
  paginas.forEach((pedacos, pagina) => {
    const sementes = pedacos.filter((p) => p.s.trim().length <= 24 && SEMENTE_ITEM.test(semAcento(p.s.trim())));
    for (const semente of sementes) {
      const titulos = titulosEmVolta(pedacos, semente);
      const itens = titulos.filter((t) => (t.colado.length <= 30 && testa(TITULO_ITEM, t)) || (t.daSementeParaBaixo.length <= 30 && TITULO_ITEM.test(semAcento(t.daSementeParaBaixo))));
      const primeiroItem = itens[0];
      if (!primeiroItem) continue;
      const nome = titulos.find((t) => t.cx > primeiroItem.cx && !itens.includes(t) && t.texto.length <= 80 && testa(TITULO_NOME, t));
      if (!nome) continue;
      const topo = Math.max(...titulos.map((t) => t.topo));
      const base = Math.min(...titulos.map((t) => t.base));
      if (achados.some((c) => c.pagina === pagina && Math.abs(c.base - base) < 2)) continue;
      const doNumero = itens.filter((t) => t.cx < nome.cx);
      const pncp = doNumero.filter((t) => /pncp/i.test(t.texto));
      const tr = doNumero.filter((t) => /\bTR\b|termo/i.test(t.texto));
      let escolhido = doNumero[doNumero.length - 1];
      let numeracao: 'PNCP' | 'TR' = 'PNCP';
      let ambigua = false;
      if (pncp.length === 1) escolhido = pncp[0];
      else if (doNumero.length === 1) numeracao = tr.length === 1 ? 'TR' : 'PNCP';
      else ambigua = true;
      const centros = titulos.map((t) => t.cx);
      // Preço unitário em reais: com duas moedas (USD e BRL), a coluna em dólar fica de fora.
      const unitarios = titulos.filter((t) => t.cx > nome.cx && testa(TITULO_UNITARIO, t) && testa(/valor|pre[cç]o|unit|mensal/i, t));
      const unit = unitarios.find((t) => /BRL|R\$|reais/i.test(t.texto)) ?? unitarios.find((t) => !/USD|US\$|d[oó]lar/i.test(t.texto));
      achados.push({
        pagina,
        topo,
        base,
        precos: titulos.some((t) => t.cx > nome.cx && testa(TITULO_VALOR, t)),
        numero: colunaEntre(escolhido.cx, centros.filter((c) => c !== escolhido.cx)),
        nome: colunaDoNome(nome, escolhido, titulos),
        unitario: unit ? colunaEntre(unit.cx, centros.filter((c) => c !== unit.cx)) : null,
        numeracao,
        ambigua,
        primeiraDuvidosa: nome.minusculasAbaixo
      });
    }
  });
  return achados.sort((a, b) => a.pagina - b.pagina || b.topo - a.topo);
}

// ------------------------------------------------------------------------------
// Corpo da tabela
// ------------------------------------------------------------------------------

interface Ancora {
  numero: number;
  y: number;
  h: number;
}

interface Bloco {
  linhas: Linha[];
  topo: number;
  base: number;
  h: number;
}

/**
 * Largura do pedaço. Alguns PDFs dão larguras infladas (o dobro do texto) para títulos e células: a largura passa a
 * ser no máximo a de um texto comum do mesmo tamanho de letra, para o centro do pedaço cair na coluna certa.
 */
const larguraReal = (p: PedacoDoPdf) => Math.min(p.w, p.s.length * 0.62 * alturaDe(p));

/** Pedaço que continua a palavra do anterior: ligadura do SEI ("pra"+"ti"+"cado", "fotográ"+"fi"+"ca"). */
// oxlint-disable-next-line no-control-regex -- o "ti" das fontes do SEI chega como caractere de controle
const CONTINUA_A_PALAVRA = /^(?:[\u0000-\u0008\u000e-\u001f]|\p{Ll}|f[ilf]|ti)/u;

function prepararPaginas(paginasDoPdf: PaginaDoPdf[]): Pedaco[][] {
  return paginasDoPdf.map((pg) => {
    // Junta os pedaços de uma mesma palavra (encostados, o segundo começando em minúscula ou ligadura).
    const juntos: PedacoDoPdf[] = [];
    for (const p of pg) {
      if (!p.s) continue;
      const ant = juntos[juntos.length - 1];
      // oxlint-disable-next-line no-control-regex -- o "ti" das fontes do SEI chega como caractere de controle
      if (ant && Math.abs(ant.y - p.y) < 0.3 * alturaDe(p) && Math.abs(p.x - (ant.x + ant.w)) < 0.15 * alturaDe(p) && /[\p{L}\u0000-\u001f]$/u.test(ant.s) && CONTINUA_A_PALAVRA.test(p.s)) {
        juntos[juntos.length - 1] = { ...ant, s: ant.s + p.s, w: p.x + p.w - ant.x, h: Math.max(ant.h, p.h) };
      } else {
        juntos.push({ ...p });
      }
    }
    const pedacos = juntos.map((p) => ({ ...p, s: consertarTexto(p.s) })).filter((p) => p.s.trim());
    // A largura também não passa do começo do pedaço seguinte na mesma linha (nas atas de 2026 o PDF dá o dobro).
    const ordem = [...pedacos].sort((a, b) => a.x - b.x);
    return pedacos.map((p) => {
      const seguinte = ordem.find((q) => q !== p && q.x > p.x + 0.5 && Math.abs(q.y - p.y) < 0.3 * alturaDe(p));
      const w = Math.min(larguraReal(p), seguinte ? seguinte.x - p.x : Number.POSITIVE_INFINITY);
      return { ...p, w, cx: p.x + w / 2 };
    });
  });
}

/** Títulos em volta de cada "ITEM" do PDF (para conferir a leitura). */
export function titulosDoPdf(paginasDoPdf: PaginaDoPdf[]): Array<{ pagina: number; titulos: string[] }> {
  const paginas = prepararPaginas(paginasDoPdf);
  return paginas.flatMap((pedacos, pagina) =>
    pedacos
      .filter((p) => p.s.trim().length <= 24 && SEMENTE_ITEM.test(semAcento(p.s.trim())))
      .map((semente) => ({ pagina, titulos: titulosEmVolta(pedacos, semente).map((t) => `${t.colado}@${Math.round(t.cx)}[${Math.round(t.topo)}-${Math.round(t.base)}]`) }))
  );
}

/** Linhas da tabela de preços (número, texto da célula do nome e preço), na ordem da ata. */
export function linhasDaTabelaDePrecos(paginasDoPdf: PaginaDoPdf[]): { linhas: LinhaDaTabela[]; duvidas: Map<number, string>; tabelas: number; numeracao: 'PNCP' | 'TR' | null } {
  const paginas = prepararPaginas(paginasDoPdf);
  const cabecalhos = acharCabecalhos(paginas);
  const linhas: LinhaDaTabela[] = [];
  const duvidas = new Map<number, string>();
  let numeracao: 'PNCP' | 'TR' | null = null;
  let tabelas = 0;

  cabecalhos.forEach((cab, k) => {
    if (!cab.precos) return;
    const proximo = cabecalhos[k + 1];
    tabelas++;
    if (cab.ambigua) {
      // Duas numerações sem dizer qual é a do PNCP: a tabela inteira fica sem nome.
      numeracao = numeracao ?? 'TR';
      return;
    }
    if (numeracao === null || cab.numeracao === 'TR') numeracao = cab.numeracao;
    // Corpo: abaixo do cabeçalho até o fim da tabela, podendo seguir nas páginas seguintes.
    const estado: EstadoDoCorpo = { pendente: cab.primeiraDuvidosa, ultima: null };
    for (let pagina = cab.pagina; pagina < paginas.length; pagina++) {
      if (proximo && pagina > proximo.pagina) break;
      const limiteDeBaixo = proximo && proximo.pagina === pagina ? proximo.topo + 4 : Number.NEGATIVE_INFINITY;
      const doCorpo = paginas[pagina].filter((p) => (pagina > cab.pagina || p.y < cab.base - 0.3 * alturaDe(p)) && p.y > limiteDeBaixo);
      const todas = linhasDe(doCorpo).filter((l) => !RUIDO_DA_PAGINA.test(l.texto));
      const fim = todas.findIndex((l) => FIM_DA_TABELA.test(l.texto) && !l.pedacos.some((p) => dentro(cab.numero, p.cx) && SO_NUMERO.test(p.s.trim())));
      const corpo = fim >= 0 ? todas.slice(0, fim) : todas;
      const seguiu = lerCorpo(cab, corpo, pagina > cab.pagina, linhas, duvidas, estado);
      if (fim >= 0 || !seguiu || (proximo && proximo.pagina === pagina)) break;
    }
  });
  return { linhas, duvidas, tabelas, numeracao };
}

interface EstadoDoCorpo {
  /** A página anterior acabou com texto do nome sem número: a primeira célula desta página está partida. */
  pendente: boolean;
  ultima: number | null;
}

/** Faixas da tabela: linhas de todas as colunas que ficam juntas; o espaço entre duas faixas é a borda da célula. */
function blocosDe(linhas: Linha[]): Bloco[] {
  const blocos: Bloco[] = [];
  for (const l of linhas) {
    const atual = blocos[blocos.length - 1];
    const limiar = 1.5 * Math.max(l.h, atual?.h ?? 0);
    if (atual && atual.base - l.y <= limiar) {
      atual.linhas.push(l);
      atual.base = l.y;
      atual.h = Math.max(atual.h, l.h);
    } else {
      blocos.push({ linhas: [l], topo: l.y, base: l.y, h: l.h });
    }
  }
  return blocos;
}

/** Lê as linhas da tabela numa página. Devolve false quando a tabela não continua (página sem número). */
function lerCorpo(cab: Cabecalho, corpo: Linha[], continuacao: boolean, saida: LinhaDaTabela[], duvidas: Map<number, string>, estado: EstadoDoCorpo): boolean {
  const duvida = (n: number | null, motivo: string) => {
    if (n !== null && !duvidas.has(n)) duvidas.set(n, motivo);
  };
  const faixas = blocosDe(corpo).map((b) => {
    const pedacos = b.linhas.flatMap((l) => l.pedacos);
    const ancoras: Ancora[] = pedacos
      .filter((p) => dentro(cab.numero, p.cx) && SO_NUMERO.test(p.s.trim()))
      .map((p) => ({ numero: Number((SO_NUMERO.exec(p.s.trim()) as RegExpExecArray)[1]), y: p.y, h: alturaDe(p) }));
    const doNome = linhasDe(pedacos.filter((p) => dentro(cab.nome, p.cx)));
    const precos = cab.unitario ? pedacos.filter((p) => dentro(cab.unitario as Coluna, p.cx)) : [];
    return { ancoras, doNome, precos };
  });
  const comNumero = faixas.filter((f) => f.ancoras.length);
  if (!comNumero.length) {
    if (continuacao) {
      // Página seguinte sem números: texto no topo é o resto da última célula; a tabela acabou.
      if (faixas.some((f) => f.doNome.length)) duvida(estado.ultima, 'célula do nome partida entre páginas');
      return false;
    }
    // Só texto, sem número, na página do cabeçalho: a primeira célula segue na página seguinte.
    if (faixas.some((f) => f.doNome.length)) estado.pendente = true;
    return true;
  }
  let primeira = true;
  faixas.forEach((f, i) => {
    if (!f.ancoras.length) {
      if (!f.doNome.length) return;
      const antes = faixas.slice(0, i).reverse().find((x) => x.ancoras.length);
      const depois = faixas.slice(i + 1).find((x) => x.ancoras.length);
      if (!antes) {
        // Topo da página, acima do primeiro número: resto da célula da página anterior (ou a célula partida).
        if (continuacao) duvida(estado.ultima, 'célula do nome partida entre páginas');
        if (depois) duvida(depois.ancoras[0].numero, 'texto solto acima do número');
      } else if (!depois) {
        // Fim da página: a célula do último número ou a do próximo, que segue na outra página.
        duvida(antes.ancoras[antes.ancoras.length - 1].numero, 'texto solto abaixo do último número');
        estado.pendente = true;
      } else {
        duvida(antes.ancoras[antes.ancoras.length - 1].numero, 'texto solto entre dois números');
        duvida(depois.ancoras[0].numero, 'texto solto entre dois números');
      }
      return;
    }
    if (primeira && estado.pendente) duvida(f.ancoras[0].numero, 'célula do nome partida entre páginas');
    primeira = false;
    estado.pendente = false;
    const textoDe = (ls: Linha[]) => ls.map((l) => l.texto).join(' ').replace(/ +/g, ' ').trim();
    const precoDe = (topo: number, base: number, h: number) =>
      f.precos.filter((p) => p.y <= topo + 1.2 * h && p.y >= base - 1.2 * h).map((p) => lerValor(p.s)).find((v) => v !== null) ?? null;
    if (f.ancoras.length === 1) {
      const a = f.ancoras[0];
      estado.ultima = a.numero;
      if (!f.doNome.length) return duvida(a.numero, 'sem texto na coluna do nome');
      saida.push({ numero: a.numero, bruto: textoDe(f.doNome), preco: precoDe(Math.max(a.y, ...f.doNome.map((l) => l.y)), Math.min(a.y, ...f.doNome.map((l) => l.y)), a.h) });
      return;
    }
    // Vários números na mesma faixa (linhas de uma só linha, bem juntas): cada linha do nome na altura de um número.
    const naAltura = (a: Ancora, l: Linha) => Math.abs(a.y - l.y) < 0.5 * Math.max(a.h, l.h);
    const certas = f.doNome.length === f.ancoras.length && f.doNome.every((l) => f.ancoras.filter((a) => naAltura(a, l)).length === 1);
    for (const a of f.ancoras) {
      const l = certas ? f.doNome.find((x) => naAltura(a, x)) : undefined;
      if (l) saida.push({ numero: a.numero, bruto: l.texto, preco: precoDe(a.y, a.y, a.h) });
      else duvida(a.numero, 'célula do nome entre dois números');
    }
    estado.ultima = f.ancoras[f.ancoras.length - 1].numero;
  });
  return true;
}

// ------------------------------------------------------------------------------
// Nome
// ------------------------------------------------------------------------------

/** Onde o nome acaba: marca, modelo, códigos, prazos, preços. */
const CORTES: RegExp[] = [
  /\s*[-–,;:]?\s*\b(?:marca|modelo|fabricante|refer[eê]ncia|ref\.|procedencia|proced[eê]ncia|part\s*number|p\/n)\s*[:.\-–]/i,
  /\s*[-–,;]?\s*\b(?:catmat|catser)\b|\s*[-–,;]?\s*\bc[oó]d(?:igo)?\.?\s*(?:br|catmat|catser|siasg)?\s*[:nº°.]*\s*\d{4,}/i,
  /\s*[-–,;]?\s*\bR\$/,
  /\s*[-–,;(]?\s*\b\d+\s*(?:\(\w+\)\s*)?meses\b/i,
  /\s*[-–,;]?\s+com\s+(?:atualiza|suporte|garantia|assist[eê]ncia|instala)/i,
  /\s*[-–,;]?\s*\b(?:conforme|de acordo com)\s+(?:especifica|o\s+termo|termo|anexo|tr\b|edital)/i,
  /\s*[-–,;]?\s*\b(?:especifica[cç](?:[aã]o|[oõ]es)\s+(?:t[eé]cnica|m[ií]nima|completa|detalhada)s?)\b/i
];

/** Texto que não é nome de item. */
const NAO_E_NOME = /^(?:r\$|us\$|total|subtotal|valor|item|grupo|lote|und|unid|unidade|quantidade|qtd|n\/?a|-+)\b/i;

export function limparNome(bruto: string, max = TAMANHO_MAXIMO_DO_NOME): string | null {
  let s = consertarTexto(bruto).trim();
  // Código CATMAT no começo ("150913 - Arma…") e rótulos ("Descrição:", "Nome:").
  s = s.replace(/^\d{5,6}\s*[-–:]\s*/, '').replace(/^(?:descri[cç][aã]o|especifica[cç][aã]o|objeto|nome|item)\s*[:\-–]\s*/i, '');
  for (const c of CORTES) {
    const m = c.exec(s);
    if (m && m.index >= 3) s = s.slice(0, m.index);
  }
  s = s.replace(/\s+/g, ' ').replace(/[\s,;:.\-–/]+$/, '').trim();
  if (s.length > max) {
    // Corta no último detalhe que cabe (vírgula, ponto e vírgula, dois pontos, travessão, parêntese); sem nenhum,
    // no último espaço, sem deixar preposição solta no fim ("em fibra de").
    const separadores = [', ', '; ', ': ', ' - ', ' – ', ' (']
      .flatMap((sep) => [...s.slice(0, max + 1).matchAll(new RegExp(sep.replace(/[()]/g, '\\$&'), 'g'))].map((m) => m.index as number))
      .filter((i) => i >= 15 && i <= max);
    const ultimo = separadores.length ? Math.max(...separadores) : -1;
    if (ultimo >= 40) {
      s = s.slice(0, ultimo);
    } else {
      const espaco = s.lastIndexOf(' ', max);
      if (espaco < 20) return null;
      s = s.slice(0, Math.max(espaco, ultimo));
      while (/\s(?:de|da|do|das|dos|e|em|com|para|por|a|o|as|os|ou|no|na|nos|nas|ao|à|via|sem)$/i.test(s)) s = s.replace(/\s\S+$/, '');
    }
    s = s.replace(/[\s,;:.\-–/(]+$/, '').trim();
  }
  // Parêntese aberto e não fechado no fim ("Rastreador (Imantado"): tira o pedaço.
  const aberto = s.lastIndexOf('(');
  if (aberto > s.lastIndexOf(')')) s = s.slice(0, aberto).replace(/[\s,;:.\-–/]+$/, '').trim();
  if (s.length < 3 || !/\p{L}{3}/u.test(s)) return null;
  if (NAO_E_NOME.test(semAcento(s))) return null;
  // Começa no meio de uma palavra ou de uma frase ("mastro)", "spargidor"): pedaço de outra célula.
  if (/^[)\]},.;:]/.test(s) || /^\p{Ll}/u.test(s)) return null;
  if (/\d{1,3}(?:\.\d{3})+,\d{2}/.test(s)) return null;
  // Código de catálogo (5 ou mais algarismos) no meio: a célula pegou outra coluna.
  if (/\d{5,}/.test(s)) return null;
  return s;
}

/** Faixa aceita entre o preço de hoje (banco) e o do PDF: o reajuste sobe, a revisão pode descer. */
const RAZAO_MINIMA = 0.6;
const RAZAO_MAXIMA = 1.8;

/**
 * Nome de cada item pedido. `itens` são os que ainda não têm nome no banco (nunca reescreve o que já existe).
 * Com a numeração só do TR, o item vale quando o preço da linha é o mais próximo do preço do banco entre todas as
 * linhas (confirma que o número do TR é o do PNCP).
 */
export function lerNomesDosItens(paginas: PaginaDoPdf[], itens: ItemParaNomear[]): LeituraDosNomes {
  const { linhas, duvidas, tabelas, numeracao } = linhasDaTabelaDePrecos(paginas);
  const nomes: NomeLido[] = [];
  const semNome: LeituraDosNomes['semNome'] = [];
  const porNumero = new Map<number, LinhaDaTabela[]>();
  for (const l of linhas) porNumero.set(l.numero, [...(porNumero.get(l.numero) ?? []), l]);

  for (const item of itens) {
    const achadas = porNumero.get(item.numero) ?? [];
    if (duvidas.has(item.numero)) {
      semNome.push({ numero: item.numero, motivo: duvidas.get(item.numero) as string });
      continue;
    }
    if (!tabelas) {
      semNome.push({ numero: item.numero, motivo: 'sem tabela de preços com coluna de nome' });
      continue;
    }
    if (!achadas.length) {
      semNome.push({ numero: item.numero, motivo: numeracao === 'TR' && !linhas.length ? 'duas numerações sem a do PNCP' : 'item não está na tabela de preços' });
      continue;
    }
    const limpos = [...new Set(achadas.map((l) => limparNome(l.bruto)).filter((n): n is string => n !== null))];
    if (limpos.length !== 1 || achadas.some((l) => limparNome(l.bruto) === null)) {
      semNome.push({ numero: item.numero, motivo: limpos.length > 1 ? 'número repetido com nomes diferentes' : 'texto da célula não parece nome' });
      continue;
    }
    const linha = achadas[0];
    const razao = item.valorUnitario && linha.preco ? item.valorUnitario / linha.preco : null;
    if (razao !== null && (razao < RAZAO_MINIMA || razao > RAZAO_MAXIMA)) {
      semNome.push({ numero: item.numero, motivo: 'preço da linha não confere com o do item' });
      continue;
    }
    if (numeracao === 'TR') {
      // Numeração do TR: o preço do banco precisa apontar para esta linha.
      const comPreco = linhas.filter((l) => l.preco);
      const distancia = (l: LinhaDaTabela) => Math.abs(Math.log((item.valorUnitario as number) / (l.preco as number)));
      const maisPerto = item.valorUnitario && comPreco.length ? [...comPreco].sort((a, b) => distancia(a) - distancia(b)) : [];
      if (!item.valorUnitario || !linha.preco || maisPerto[0] !== linha || (maisPerto[1] && distancia(maisPerto[1]) === distancia(linha))) {
        semNome.push({ numero: item.numero, motivo: 'numeração do TR sem o preço para confirmar' });
        continue;
      }
    }
    nomes.push({ numero: item.numero, nome: limpos[0], bruto: linha.bruto } as NomeLido & { bruto: string });
  }
  // Dois itens com textos diferentes que ficaram com o mesmo nome depois do corte (a diferença estava no fim, como o
  // equipamento): sem nome, para não confundir. Textos iguais (a mesma munição em cotas diferentes) ficam.
  const repetidos = new Set(
    nomes.filter((n, _, todos) => todos.some((o) => o !== n && o.nome === n.nome && (o as NomeLido & { bruto: string }).bruto !== (n as NomeLido & { bruto: string }).bruto)).map((n) => n.numero)
  );
  for (const n of repetidos) semNome.push({ numero: n, motivo: 'nome igual ao de outro item depois do corte' });
  return { nomes: nomes.filter((n) => !repetidos.has(n.numero)).map((n) => ({ numero: n.numero, nome: n.nome })), semNome, tabelas };
}

/**
 * O PDF é desta ata? O título das primeiras páginas traz o número ("ATA DE REGISTRO DE PREÇOS Nº 48/2024",
 * "nº 00047/2024"). Na carga, o PNCP tinha na ata 00037/2026 o PDF da ata 27/2026: sem o número, não lê.
 */
export function pdfEhDaAta(paginas: PaginaDoPdf[], numeroAta: string): boolean {
  const m = /^0*(\d{1,5})\/(\d{4})$/.exec(numeroAta.trim());
  if (!m) return false;
  const texto = semAcento(
    prepararPaginas(paginas.slice(0, 2))
      .map((pg) => linhasDe(pg).map((l) => l.texto).join('\n'))
      .join('\n')
  );
  const numero = new RegExp(`\\bata\\b[^\\n]{0,80}?(?<![\\d.])0*${m[1]}\\s*/\\s*${m[2]}(?!\\d)`, 'i');
  return numero.test(texto);
}
