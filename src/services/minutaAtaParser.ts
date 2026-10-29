/**
 * Leitor da minuta da Ata de Registro de Preços (Anexo III do edital), a partir do texto do PDF.
 *
 * Usado pelo recurso 'atas_a_montar' (atasAMontarSyncService.ts) para montar os quadros da ata antes da
 * publicação (protótipo aprovado em 28/10/2026). Lê duas partes da minuta:
 *   - seção 3 (órgão gerenciador e participantes): quantidade do gerenciador e de cada órgão participante
 *     por item;
 *   - tabela de itens (seções 1 e 2): descrição e CATMAT/CATSER de cada item.
 *
 * A tabela de participantes aparece em três modelos, e os três são tentados:
 *   A "blocos por órgão"  : SIGLA UASG + linhas "item descrição quantidade" (os itens recomeçam a cada órgão)
 *   B "matriz órgão×item" : uma linha por órgão com UASG e uma coluna de quantidade por item
 *   C "blocos por item"   : para cada item, linhas "UF órgão UASG unidade quantidade"
 * Vale o modelo que fecha mais somas: a soma dos participantes de um item tem de ser igual ao total do item no
 * PNCP menos a quantidade do gerenciador. Item cuja soma não fecha fica "a conferir" (o gestor corrige na tela).
 *
 * Medição (28/10/2026, texto extraído pelo unpdf, o mesmo do servidor): 5 pregões, 1.022 pares órgão × item,
 * 100% iguais às atas assinadas.
 */

const RODAPE = /^(Câmara Nacional de Modelos|Modelo de (Modelo )?Ata|Aprovado pela Secretaria|Identidade visual|Atualização:|\d+ de \d+$|=== PAG|PAGINAS:)/;
const NUM = /^\d{1,3}(?:\.\d{3})+$|^\d{1,5}$/;
const UASG = /^\d{6}$/;
const UF = /^[A-Z]{2}$/;
const UNIDADES = new Set(['unidade', 'und', 'und.', 'unid', 'unid.', 'un', 'un.', 'conjunto', 'unidades', 'kit', 'par', 'serviço', 'servico']);

const num = (t: string) => Number(t.replace(/\./g, ''));

export type ModeloDaTabela = 'A' | 'B' | 'C';

/** Órgão participante de um item, como está na minuta. */
export interface ParticipanteDaMinuta {
  uasg: string;
  /** Nome ou sigla como a minuta escreve (pode vir cortado; a tela usa o cadastro de UASGs). */
  nome: string;
  quantidade: number;
}

export interface LeituraDosParticipantes {
  modelo: ModeloDaTabela | null;
  /** Quantidade do gerenciador (SENASP) por número do item. */
  gerenciador: Record<number, number>;
  /** Participantes por número do item, na ordem da minuta (o mesmo órgão pode repetir: somar). */
  participantes: Record<number, ParticipanteDaMinuta[]>;
  /** Itens cuja soma dos participantes fecha com o total do PNCP menos o gerenciador. */
  itensQueFecham: number[];
  avisos: string[];
  erro?: string;
}

function linhas(s: string): string[] {
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !RODAPE.test(l));
}

/** Seção 3 da minuta, partida em gerenciador (antes de "participantes do registro") e participantes. */
export function secao3(texto: string): { gerenciador: string; participantes: string; inicio: number } | null {
  const m = /3\.?\s*(?:Ó|O|ó|o)rg(?:ã|a|Ã|A)o\(s\)\s*gerenciador/i.exec(texto);
  if (!m) return null;
  const resto = texto.slice(m.index);
  const fim = /DA ADES[ÃA]O|Da ades[ãa]o/.exec(resto);
  const sec = resto.slice(0, fim ? fim.index : 20000);
  const p = /participantes do registro/i.exec(sec);
  if (!p) return { gerenciador: sec, participantes: '', inicio: m.index };
  return { gerenciador: sec.slice(0, p.index), participantes: sec.slice(p.index + p[0].length), inicio: m.index };
}

// ---------------- gerenciador ----------------

interface LeituraDoGerenciador {
  quantidades: Record<number, number>;
  /** Primeira palavra da descrição de cada item: separa o número do item da quantidade no modelo C. */
  primeiraPalavra: Record<number, string>;
}

function lerGerenciador(sec: string, nItens: number): LeituraDoGerenciador {
  const toks = linhas(sec).join(' ').split(/\s+/).filter(Boolean);
  const ini = new Map<number, number>();
  let pos = 0;
  for (let k = 1; k <= nItens; k++) {
    for (let j = pos; j < toks.length; j++) {
      if (toks[j] === String(k)) {
        ini.set(k, j);
        pos = j + 1;
        break;
      }
    }
  }
  const ks = [...ini.keys()].sort((a, b) => a - b);
  const nums = new Map<number, number[]>();
  ks.forEach((k, i) => {
    const fim = i + 1 < ks.length ? (ini.get(ks[i + 1]) as number) : toks.length;
    nums.set(k, toks.slice((ini.get(k) as number) + 1, fim).filter((t) => NUM.test(t)).map(num));
  });
  const primeiraPalavra: Record<number, string> = {};
  for (const k of ks) {
    const j = ini.get(k) as number;
    const w = toks.slice(j + 1, j + 4).find((t) => /^[A-Za-zÀ-ú]/.test(t));
    if (w) primeiraPalavra[k] = w.toLowerCase();
  }
  const quantidades: Record<number, number> = {};
  ks.forEach((k, i) => {
    const n = nums.get(k) as number[];
    if (n.length) quantidades[k] = n[n.length - 1];
    else if (i + 1 < ks.length && (nums.get(ks[i + 1]) as number[]).length >= 2) {
      // Célula mesclada: "8 desc 9 desc 84 116" — a quantidade do 8 vem antes da do 9.
      quantidades[k] = (nums.get(ks[i + 1]) as number[]).shift() as number;
    }
  });
  return { quantidades, primeiraPalavra };
}

// ---------------- tokens com linha ----------------

interface Token {
  t: string;
  l: number;
  j: number;
  n: number;
  line: string;
}

function tokens(sec: string): Token[] {
  const out: Token[] = [];
  linhas(sec).forEach((line, l) => {
    const ts = line.split(/\s+/).filter(Boolean);
    ts.forEach((t, j) => out.push({ t, l, j, n: ts.length, line }));
  });
  return out;
}

/** Texto da mesma linha antes do UASG (sem ordinal/UF iniciais); se vazio, depois do UASG ou a linha anterior. */
function nomeAntes(tk: Token[], i: number): string {
  const { line, j } = tk[i];
  const palavras = line.split(/\s+/).filter(Boolean);
  let ws = palavras.slice(0, j);
  while (ws.length && (NUM.test(ws[0]) || UF.test(ws[0]))) ws = ws.slice(1);
  if (!ws.length) {
    // UASG no começo da linha: o nome vem depois ("200323 Diretoria ... DF 60").
    ws = palavras.slice(j + 1).filter((w) => !NUM.test(w) && !UNIDADES.has(w.toLowerCase()));
    while (ws.length && UF.test(ws[ws.length - 1])) ws = ws.slice(0, -1);
  }
  if (!ws.length) {
    const anterior = tk.slice(0, i).filter((x) => x.l === tk[i].l - 1);
    ws = anterior.map((x) => x.t).filter((t) => !NUM.test(t));
  }
  return ws.join(' ').slice(0, 80);
}

type Participacao = Record<number, ParticipanteDaMinuta[]>;

function adicionar(part: Participacao, k: number, uasg: string, nome: string, quantidade: number) {
  (part[k] ??= []).push({ uasg, nome, quantidade });
}

// ---------------- modelo A: blocos por órgão ----------------

function modeloA(sec: string, nItens: number): { part: Participacao; avisos: string[] } {
  const orgaos: Array<[string, string]> = [];
  const linhasItem: Array<[number, number]> = [];
  for (const l of linhas(sec)) {
    let m = /^(.*?)\b(\d{6})$/.exec(l);
    if (m && l.split(/\s+/).length <= 6) {
      orgaos.push([m[2], m[1].trim()]);
      continue;
    }
    m = /^(\d{1,3})\s+\D.*\s(\d{1,3}(?:\.\d{3})+|\d+|-)$/.exec(l);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= nItens) linhasItem.push([Number(m[1]), m[2] === '-' ? 0 : num(m[2])]);
  }
  // As linhas de item de cada órgão recomeçam do item 1: o recomeço separa os grupos.
  const grupos: Array<Array<[number, number]>> = [];
  let atual: Array<[number, number]> = [];
  let ult = 0;
  for (const [k, q] of linhasItem) {
    if (atual.length && k <= ult) {
      grupos.push(atual);
      atual = [];
    }
    atual.push([k, q]);
    ult = k;
  }
  if (atual.length) grupos.push(atual);
  const avisos = grupos.length !== orgaos.length ? [`A: ${orgaos.length} órgãos x ${grupos.length} grupos de linhas`] : [];
  const part: Participacao = {};
  orgaos.forEach(([u, nome], i) => {
    for (const [k, q] of grupos[i] ?? []) adicionar(part, k, u, nome, q);
  });
  return { part, avisos };
}

// ---------------- modelo B: matriz órgão x item ----------------

function modeloB(sec: string, nItens: number): { part: Participacao; avisos: string[] } {
  const tk = tokens(sec);
  const K = nItens;
  const idxU = tk.map((x, i) => (UASG.test(x.t) ? i : -1)).filter((i) => i >= 0);
  const linhasM: Array<[string, string, number[]]> = [];
  const pend: number[] = [];
  const avisos: string[] = [];
  idxU.forEach((i, a) => {
    const fim = a + 1 < idxU.length ? idxU[a + 1] : tk.length;
    const colado = (i + 1 < tk.length && UASG.test(tk[i + 1].t)) || (i > 0 && UASG.test(tk[i - 1].t));
    if (colado) {
      // Lista de UASG em sequência: os números vêm depois, fora da linha.
      pend.push(i);
      return;
    }
    let run: number[] = [];
    let achou: number[] | null = null;
    for (const x of tk.slice(i + 1, fim)) {
      if (NUM.test(x.t) || x.t === '-') {
        run.push(x.t === '-' ? 0 : num(x.t));
        if (run.length >= K) {
          achou = run.slice(0, K);
          break;
        }
      } else run = [];
    }
    if (achou) linhasM.push([tk[i].t, nomeAntes(tk, i), achou]);
    else pend.push(i);
  });
  // UASGs listados em sequência sem números (tabela quebrada): números vêm depois, em grupos de colunas, cada grupo
  // seguido do TOTAL das colunas, que confere a leitura.
  if (pend.length) {
    const ult = pend[pend.length - 1];
    const stream = tk.slice(ult + 1).filter((x) => NUM.test(x.t)).map((x) => num(x.t));
    const n = pend.length;
    let ok = false;
    for (let g = 1; g <= K && !ok; g++) {
      if (K % g !== 0) continue;
      const need = (K / g) * (n * g + g);
      if (stream.length < need) continue;
      const vals = new Map<number, number[]>(pend.map((p) => [p, new Array<number>(K).fill(0)]));
      let s = 0;
      let confere = true;
      for (let grp = 0; grp < K / g && confere; grp++) {
        for (const p of pend) {
          for (let c = 0; c < g; c++) (vals.get(p) as number[])[grp * g + c] = stream[s++];
        }
        const tot = stream.slice(s, s + g);
        s += g;
        for (let c = 0; c < g; c++) {
          const col = grp * g + c;
          const soma = [...vals.values()].reduce((acc, v) => acc + v[col], 0) + linhasM.reduce((acc, l) => acc + l[2][col], 0);
          if (soma !== tot[c]) {
            confere = false;
            break;
          }
        }
      }
      if (confere) {
        ok = true;
        for (const p of pend) linhasM.push([tk[p].t, nomeAntes(tk, p), vals.get(p) as number[]]);
        avisos.push(`B: ${n} órgãos com números separados, lidos em grupos de ${g} coluna(s) e conferidos pelo TOTAL`);
      }
    }
    if (!ok) avisos.push(`B: ${n} UASG sem números legíveis: ${pend.map((p) => tk[p].t).join(',')}`);
  }
  const part: Participacao = {};
  for (const [u, nome, qs] of linhasM) {
    for (let k = 1; k <= K; k++) adicionar(part, k, u, nome, qs[k - 1]);
  }
  return { part, avisos };
}

// ---------------- modelo C: blocos por item ----------------

type Evento = { e: 'u'; uasg: string; nome: string } | { e: 'q'; n: number } | { e: 'T'; n: number };

function modeloC(sec: string, nItens: number, alvo: Record<number, number>, primeiraPalavra: Record<number, string>): { part: Participacao; avisos: string[] } {
  const tk = tokens(sec);
  const ev: Evento[] = [];
  const linhasComUasg = new Set(tk.filter((x) => UASG.test(x.t)).map((x) => x.l));
  tk.forEach((x, i) => {
    const t = x.t;
    if (UASG.test(t)) {
      ev.push({ e: 'u', uasg: t, nome: nomeAntes(tk, i) });
      return;
    }
    if (!NUM.test(t)) return;
    const prev = i > 0 && tk[i - 1].l === x.l ? tk[i - 1].t.toLowerCase() : '';
    if (prev === 'total') {
      ev.push({ e: 'T', n: num(t) });
      return;
    }
    const sozinho = x.n === 1;
    if (sozinho) {
      // Número do item sozinho na linha (rótulo de célula mesclada), ex.: "8" / "Mini bandeira...".
      const pw = primeiraPalavra[num(t)];
      const vizinhas = tk.filter((y) => y.j === 0 && y.l >= x.l - 2 && y.l <= x.l + 1 && y.l !== x.l).map((y) => y.t.toLowerCase());
      if (pw && vizinhas.includes(pw)) return;
    }
    const aposUnidade = UNIDADES.has(prev);
    const fimDaLinhaComUasg = x.j === x.n - 1 && linhasComUasg.has(x.l);
    if (sozinho || aposUnidade || fimDaLinhaComUasg) ev.push({ e: 'q', n: num(t) });
  });
  // Casa UASG e quantidade na ordem (fila), guardando os TOTAL como cortes.
  const pares: ParticipanteDaMinuta[] = [];
  const filaU: Array<{ uasg: string; nome: string }> = [];
  const filaQ: number[] = [];
  const cortes = new Set<number>();
  const avisos: string[] = [];
  const descarrega = () => {
    while (filaU.length && filaQ.length) {
      const u = filaU.shift() as { uasg: string; nome: string };
      pares.push({ uasg: u.uasg, nome: u.nome, quantidade: filaQ.shift() as number });
    }
  };
  for (const e of ev) {
    if (e.e === 'u') {
      filaU.push({ uasg: e.uasg, nome: e.nome });
      descarrega();
    } else if (e.e === 'q') {
      filaQ.push(e.n);
      descarrega();
    } else cortes.add(pares.length);
  }
  if (filaU.length || filaQ.length) avisos.push(`C: sobraram ${filaU.length} UASG e ${filaQ.length} quantidades sem par`);
  // Corta em blocos de item pela soma esperada (total do PNCP menos o gerenciador).
  const part: Participacao = {};
  let p = 0;
  for (let k = 1; k <= nItens; k++) {
    const alvoK = alvo[k];
    if (alvoK === undefined) {
      avisos.push(`C: item ${k} sem soma esperada`);
      break;
    }
    const bloco: ParticipanteDaMinuta[] = [];
    let s = 0;
    while (p < pares.length && s < alvoK) {
      bloco.push(pares[p]);
      s += pares[p].quantidade;
      p++;
    }
    // Zeros no fim do bloco ficam no bloco.
    while (p < pares.length && pares[p].quantidade === 0 && !cortes.has(p)) {
      bloco.push(pares[p]);
      p++;
    }
    if (s !== alvoK) avisos.push(`C: item ${k} soma ${s} ≠ esperado ${alvoK}`);
    part[k] = bloco;
  }
  if (p < pares.length) avisos.push(`C: ${pares.length - p} linhas sobraram depois do último item`);
  return { part, avisos };
}

/**
 * Lê gerenciador e participantes. `totais` = quantidade total de cada item no PNCP (todos os itens da compra,
 * numerados de 1 a n como na minuta).
 */
export function lerParticipantesDaMinuta(texto: string, totais: Record<number, number>): LeituraDosParticipantes {
  const numeros = Object.keys(totais).map(Number);
  const vazio: LeituraDosParticipantes = { modelo: null, gerenciador: {}, participantes: {}, itensQueFecham: [], avisos: [] };
  if (!numeros.length) return { ...vazio, erro: 'A compra não tem itens.' };
  const n = Math.max(...numeros);
  const sec = secao3(texto);
  if (!sec) return { ...vazio, erro: 'Seção 3 (órgão gerenciador e participantes) não encontrada.' };
  const ger = lerGerenciador(sec.gerenciador, n);
  const alvo: Record<number, number> = {};
  for (const k of numeros) if (ger.quantidades[k] !== undefined) alvo[k] = totais[k] - ger.quantidades[k];

  const tentativas: Array<{ modelo: ModeloDaTabela; ler: () => { part: Participacao; avisos: string[] } }> = [
    { modelo: 'A', ler: () => modeloA(sec.participantes, n) },
    { modelo: 'B', ler: () => modeloB(sec.participantes, n) },
    { modelo: 'C', ler: () => modeloC(sec.participantes, n, alvo, ger.primeiraPalavra) }
  ];
  const resultados = tentativas.map(({ modelo, ler }) => {
    let r: { part: Participacao; avisos: string[] };
    try {
      r = ler();
    } catch (err) {
      r = { part: {}, avisos: [`${modelo}: erro ${err instanceof Error ? err.message : String(err)}`] };
    }
    const fecham = Object.keys(alvo)
      .map(Number)
      .filter((k) => r.part[k]?.length && r.part[k].reduce((s, x) => s + x.quantidade, 0) === alvo[k]);
    const linhasLidas = Object.values(r.part).reduce((s, v) => s + v.length, 0);
    return { modelo, ...r, fecham, linhasLidas };
  });
  // Vale o modelo que fecha mais somas; no empate, o que leu mais linhas (mesma regra da medição).
  resultados.sort((a, b) => b.fecham.length - a.fecham.length || b.linhasLidas - a.linhasLidas);
  const melhor = resultados[0];
  return {
    modelo: melhor.modelo,
    gerenciador: ger.quantidades,
    participantes: melhor.part,
    itensQueFecham: melhor.fecham.sort((a, b) => a - b),
    avisos: melhor.avisos
  };
}

// ---------------- tabela de itens (descrição e CATMAT) ----------------

export interface ItemDaMinuta {
  descricao: string | null;
  /** CATMAT (6 dígitos) ou CATSER (até 6), quando a tabela traz. */
  catmat: string | null;
}

const LIXO_DA_TABELA = /^(x+|X+|R\$|-|–|\.|total|un\.?|und\.?|unid\.?|unidade|unidades|conjunto|kit|par|serviço|servico)$/i;
const FIM_DA_TABELA = /^(\d+\.\d+\.|total\b|\d+\.\s+[A-ZÀ-Ú])/i;

/** Junta a quebra de linha com hífen ("especifi-" + "cação") e espaços repetidos. */
const juntar = (s: string) => s.replace(/-\s+(?=[a-zà-ú])/g, '').replace(/\s+/g, ' ').trim();

/**
 * Descrição e CATMAT de cada item, lidos da tabela de itens da minuta (antes da seção 3). A tabela aparece
 * uma ou duas vezes (seção 1 com CATMAT, seção 2 com marca e preço); vale a primeira descrição legível e o
 * primeiro CATMAT. `quantidades` serve para não confundir a quantidade do item com um código.
 */
export function lerItensDaMinuta(texto: string, quantidades: Record<number, number>): Record<number, ItemDaMinuta> {
  const numeros = Object.keys(quantidades).map(Number).sort((a, b) => a - b);
  const out: Record<number, ItemDaMinuta> = {};
  for (const k of numeros) out[k] = { descricao: null, catmat: null };
  const sec = secao3(texto);
  if (!sec || !numeros.length) return out;
  // A tabela de itens fica nas páginas antes da seção 3 da minuta (no edital inteiro, o TR vem antes: só o
  // trecho a partir do último "Do objeto" ou "Dos preços" antes da seção 3).
  const antes = texto.slice(Math.max(0, sec.inicio - 30000), sec.inicio);
  const marcos = [...antes.matchAll(/(?:^|\n)\s*1\.?\s*(?:DO OBJETO|Do objeto)|Processo Administrativo n/g)].map((m) => m.index ?? 0);
  const trecho = antes.slice(marcos.length ? marcos[marcos.length - 1] : 0);
  const ls = linhas(trecho);
  const ehInicioDeItem = (l: string, k: number) => l === String(k) || l.startsWith(`${k} `);
  const conjunto = new Set(numeros);

  for (let i = 0; i < ls.length; i++) {
    const k = numeros.find((n) => ehInicioDeItem(ls[i], n));
    if (k === undefined) continue;
    // O bloco do item vai até a linha que começa com outro número de item, o fim da tabela ou 8 linhas.
    const bloco: string[] = [ls[i].slice(String(k).length)];
    for (let j = i + 1; j < ls.length && j <= i + 8; j++) {
      const outro = ls[j].match(/^(\d{1,3})(?:\s|$)/);
      if ((outro && conjunto.has(Number(outro[1])) && Number(outro[1]) !== k) || FIM_DA_TABELA.test(ls[j])) break;
      bloco.push(ls[j]);
    }
    const palavras = bloco.join(' ').split(/\s+/).filter(Boolean);
    const qtd = quantidades[k];
    const codigo = palavras.find((w) => /^\d{5,6}$/.test(w) && Number(w) !== qtd);
    const texto = palavras.filter((w) => !LIXO_DA_TABELA.test(w) && !NUM.test(w) && !/^\d{5,6}$/.test(w) && !/^R\$/.test(w));
    // Descrição = palavras até o primeiro código, unidade ou placeholder (o resto é marca, quantidade e preço).
    // Número no meio do texto fica ("Câmera tipo 2 - Câmera fotográfica"): só corta o que vem antes de outro
    // número, unidade ou fim.
    const ehTexto = (w: string | undefined) => w !== undefined && (/^[-–]/.test(w) || (/^[A-Za-zÀ-ú(]/.test(w) && !LIXO_DA_TABELA.test(w)));
    const corte = palavras.findIndex(
      (w, idx) => idx > 0 && (/^\d{5,6}$/.test(w) || (LIXO_DA_TABELA.test(w) && !/^[-–]$/.test(w)) || (NUM.test(w) && !ehTexto(palavras[idx + 1])))
    );
    const desc = juntar((corte > 0 ? palavras.slice(0, corte) : texto).filter((w) => !LIXO_DA_TABELA.test(w) || /^[-–]$/.test(w)).join(' '))
      .replace(/^[-–]\s*/, '')
      .replace(/\s*[-–]$/, '');
    const atual = out[k];
    if (!atual.descricao && /[A-Za-zÀ-ú]{3,}/.test(desc)) atual.descricao = desc.slice(0, 300);
    if (!atual.catmat && codigo) atual.catmat = codigo;
  }
  return out;
}
