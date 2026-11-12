/**
 * Quadros da ata a montar (protótipo aprovado em 28/10/2026, D1–D8): Quadro 1 (preços, com o fornecedor na primeira
 * linha), Quadro 2 (órgão gerenciador, dividido entre as unidades internas) e Quadro 3 (órgãos participantes), prontos
 * para colar no SEI.
 *
 * Os números vêm do servidor (resultado do pregão e minuta do edital, migration 238); o gestor completa e corrige no
 * rascunho (atas_a_montar_rascunhos.dados). Nada aqui grava: só monta o que a tela mostra e o que a cópia leva.
 *
 * A cópia segue o padrão das atas da SENASP: tabela na largura da página do SEI, cabeçalho em negrito com fundo cinza,
 * totais em negrito, um só tamanho de letra para os três quadros (10, 9 ou 8 pt, o maior em que todos cabem) e
 * números que não quebram no meio (o SEI ignora o "não quebrar": a coluna é medida pelo texto mais longo).
 */
import type { ItemDaCompra, LeituraDaMinuta, ResultadoDoItem } from '../services/atasAMontarSyncService';

export type ModoDeDistribuicao = 'HOMOLOGADO' | 'GERENCIADOR';
export type FormatoDoQuadro3 = 'GRADE' | 'LISTA';

/** O que o gestor preenche (atas_a_montar_rascunhos.dados). Campo ausente = vale o que veio da fonte. */
export interface RascunhoDaAta {
  modo?: ModoDeDistribuicao;
  formato3?: FormatoDoQuadro3 | null;
  /** Informar marca/modelo na ata (padrão: sim). */
  marca?: boolean;
  /** Siglas das unidades internas do Quadro 2, na ordem escolhida. */
  unidades?: string[];
  /** Divisão do gerenciador: item → sigla → quantidade. */
  divisao?: Record<string, Record<string, number>>;
  /** Por item: descrição, CATMAT, marca/modelo e valor unitário na moeda da proposta (empresa estrangeira). */
  itens?: Record<string, { descricao?: string; catmat?: string; marca?: string; valorMoeda?: string }>;
  /** Correções das quantidades da minuta: gerenciador e participantes (UASG → quantidade; inclui órgão acrescentado). */
  quantidades?: Record<string, { gerenciador?: number; participantes?: Record<string, number> }>;
  fornecedor?: {
    /** CNPJ no Brasil de empresa estrangeira (está na proposta ou no SICAF). */
    cnpjBrasil?: string;
    endereco?: string;
    telefone?: string;
    email?: string;
    representante?: string;
    representanteTelefone?: string;
    representanteEmail?: string;
    moeda?: string;
  };
  numeroAta?: string;
  seiProposta?: string;
}

export interface ParticipanteDaAta {
  uasg: string;
  quantidade: number;
}

export type OrigemDoTexto = 'GESTOR' | 'MINUTA' | 'PNCP' | 'NENHUMA';

export interface ItemDaAta {
  numero: number;
  descricao: string;
  origemDescricao: OrigemDoTexto;
  catmat: string;
  origemCatmat: OrigemDoTexto;
  unidade: string;
  /** Quantidade homologada para o fornecedor (PNCP). */
  homologada: number;
  valorUnitario: number;
  valorTotal: number;
  gerenciador: number;
  participantes: ParticipanteDaAta[];
  /** A minuta fechou a soma deste item (antes das correções do gestor). */
  minutaFecha: boolean;
}

const fmt = (n: number, d = 0) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const valorBR = (n: number) => fmt(n, 2);
export const quantidadeBR = (n: number) => fmt(n);
/** Quantidade mínima = 10% arredondado para baixo; "-" quando dá 0 (D7). */
export const minima = (q: number) => Math.floor(q / 10);
export const minimaTexto = (q: number) => (minima(q) ? fmt(minima(q)) : '-');
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
/** Unidade de medida curta, como nas atas ("Und"). */
export const unidadeCurta = (u: string) => (/^unidades?$/i.test(String(u).trim()) ? 'Und' : u);
export const ehEstrangeiro = (ni: string) => /^ESTRANG/i.test(ni);
const soma = (ps: ParticipanteDaAta[]) => ps.reduce((s, p) => s + p.quantidade, 0);

/** Itens que o fornecedor ganhou, com as quantidades da minuta, as correções do gestor e o modo de distribuição. */
export function itensDaAta(itens: ItemDaCompra[], minuta: LeituraDaMinuta | null, fornecedorNi: string, r: RascunhoDaAta): ItemDaAta[] {
  const out: ItemDaAta[] = [];
  for (const it of itens) {
    const res: ResultadoDoItem | undefined = it.resultados.find((x) => x.fornecedor_ni === fornecedorNi);
    if (!res) continue;
    const n = String(it.numero);
    const lido = minuta?.itens?.[n];
    const ed = r.itens?.[n] ?? {};
    const corr = r.quantidades?.[n] ?? {};
    // Participantes: os da minuta, com as quantidades corrigidas, mais os acrescentados pelo gestor.
    const daMinuta = (lido?.participantes ?? []).map((p) => ({ uasg: p.uasg, quantidade: corr.participantes?.[p.uasg] ?? p.quantidade }));
    const acrescentados = Object.entries(corr.participantes ?? {})
      .filter(([u]) => !daMinuta.some((p) => p.uasg === u))
      .map(([uasg, quantidade]) => ({ uasg, quantidade }));
    let participantes = [...daMinuta, ...acrescentados];
    let gerenciador = corr.gerenciador ?? lido?.gerenciador ?? Math.max(0, res.quantidade - soma(participantes));
    if (r.modo === 'GERENCIADOR') {
      // Tudo para o gerenciador (modelo da ata 55/2024): 1 unidade por participante, o restante para a SENASP.
      const total = gerenciador + soma(participantes);
      participantes = participantes.map((p) => ({ ...p, quantidade: p.quantidade > 0 ? 1 : 0 }));
      gerenciador = total - soma(participantes);
    }
    const descricaoMinuta = lido?.descricao?.trim();
    const catmatMinuta = lido?.catmat?.trim() || it.catalogo_codigo?.trim();
    out.push({
      numero: it.numero,
      descricao: ed.descricao ?? descricaoMinuta ?? it.descricao,
      origemDescricao: ed.descricao != null ? 'GESTOR' : descricaoMinuta ? 'MINUTA' : 'PNCP',
      catmat: ed.catmat ?? catmatMinuta ?? '',
      origemCatmat: ed.catmat != null ? 'GESTOR' : lido?.catmat ? 'MINUTA' : it.catalogo_codigo ? 'PNCP' : 'NENHUMA',
      unidade: it.unidade ?? '',
      homologada: res.quantidade,
      valorUnitario: res.valor_unitario,
      valorTotal: res.valor_total,
      gerenciador,
      participantes,
      minutaFecha: Boolean(lido?.fecha)
    });
  }
  return out.sort((a, b) => a.numero - b.numero);
}

export const totalDoItem = (i: ItemDaAta) => i.gerenciador + soma(i.participantes);
export const somaDosParticipantes = (i: ItemDaAta) => soma(i.participantes);

// ------------------------------------------------------------------------------
// Fornecedor
// ------------------------------------------------------------------------------

/** O que a Receita traz do CNPJ (consultarCnpj). */
export interface FornecedorNaReceita {
  razaoSocial: string;
  situacaoCadastral: string | null;
  sedeEndereco: string | null;
  sedeMunicipio: string | null;
  sedeUf: string | null;
  sedeCep: string | null;
  sedeTelefone: string | null;
  sedeEmail: string | null;
}

export const cnpjFormatado = (c: string) => String(c ?? '').replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

/**
 * Sugestões da Receita para os campos do fornecedor (o gestor pode trocar). Empresa estrangeira: o endereço é o do
 * exterior, da proposta (o CNPJ no Brasil traz "NÃO INFORMADO" na Receita).
 */
export function sugestaoDaReceita(rf: FornecedorNaReceita | null, estrangeiro = false): { endereco: string; telefone: string; email: string } {
  if (!rf) return { endereco: '', telefone: '', email: '' };
  if (estrangeiro) return { endereco: '', telefone: rf.sedeTelefone ?? '', email: (rf.sedeEmail ?? '').toLowerCase() };
  const local = [rf.sedeMunicipio, rf.sedeUf].filter(Boolean).join(' - ');
  const cep = rf.sedeCep ? `CEP ${rf.sedeCep.replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : '';
  return {
    endereco: [rf.sedeEndereco, local].filter(Boolean).join(', ') + (cep ? ` · ${cep}` : ''),
    telefone: rf.sedeTelefone ?? '',
    email: (rf.sedeEmail ?? '').toLowerCase()
  };
}

export interface FornecedorDaAta {
  estrangeiro: boolean;
  empresa: string;
  cnpj: string;
  endereco: string;
  telefone: string;
  email: string;
  representante: string;
  representanteTelefone: string;
  representanteEmail: string;
}

export function fornecedorDaAta(ni: string, nomePncp: string, r: RascunhoDaAta, rf: FornecedorNaReceita | null): FornecedorDaAta {
  const estrangeiro = ehEstrangeiro(ni);
  const sug = sugestaoDaReceita(rf, estrangeiro);
  const f = r.fornecedor ?? {};
  return {
    estrangeiro,
    empresa: estrangeiro ? nomePncp : rf?.razaoSocial || nomePncp,
    cnpj: cnpjFormatado(estrangeiro ? f.cnpjBrasil ?? '' : ni),
    endereco: f.endereco ?? sug.endereco,
    telefone: f.telefone ?? sug.telefone,
    email: f.email ?? sug.email,
    representante: f.representante ?? '',
    representanteTelefone: f.representanteTelefone ?? '',
    representanteEmail: f.representanteEmail ?? ''
  };
}

/** Linhas do fornecedor no topo do Quadro 1 (rótulo em negrito). */
export function linhasDoFornecedor(f: FornecedorDaAta): Array<[string, string]> {
  return [
    ['Empresa', f.empresa],
    [f.estrangeiro ? 'CNPJ Internacional' : 'CNPJ', f.cnpj],
    ['Endereço', f.endereco],
    ['Telefone', f.telefone],
    ['E-mail', f.email],
    [f.estrangeiro ? 'Representada no Brasil' : 'Representante legal', f.representante],
    ...(f.representanteTelefone ? ([['Telefone', f.representanteTelefone]] as Array<[string, string]>) : []),
    ...(f.representanteEmail ? ([['E-mail', f.representanteEmail]] as Array<[string, string]>) : [])
  ];
}

// ------------------------------------------------------------------------------
// Moeda da proposta (empresa estrangeira)
// ------------------------------------------------------------------------------

const numeroDigitado = (s: string | undefined) => {
  const x = Number(String(s ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(x) && x > 0 ? x : null;
};

/** "R$ 1.416,97 (€ 240,87)": valor unitário e total também na moeda da proposta, quando o gestor informa. */
export function emMoeda(ni: string, r: RascunhoDaAta, i: ItemDaAta): { vu: string; vt: string; total: number; moeda: string | null } {
  const moeda = (r.fornecedor?.moeda ?? '').trim();
  const vm = numeroDigitado(r.itens?.[String(i.numero)]?.valorMoeda);
  if (!ehEstrangeiro(ni) || !moeda || vm == null) return { vu: '', vt: '', total: 0, moeda: null };
  const total = vm * totalDoItem(i);
  return { vu: ` (${moeda} ${fmt(vm, 2)})`, vt: ` (${moeda} ${fmt(total, 2)})`, total, moeda };
}

// ------------------------------------------------------------------------------
// Quadros
// ------------------------------------------------------------------------------

/** Linha de total: rótulo mesclado à esquerda, alinhado à direita e colado nos valores. */
export interface LinhaDeTotal {
  total: string;
  v: string[];
}
export type LinhaDoQuadro = string[] | LinhaDeTotal;

export interface QuadroDaAta {
  titulo: string;
  cab: string[];
  linhas: LinhaDoQuadro[];
  /** Linhas do topo (fornecedor no Quadro 1). */
  topo?: Array<[string, string]>;
  /** Linha de título mesclada acima do cabeçalho (Quadro 2). */
  tituloDaTabela?: string;
  /** Colunas [ini, ini+n) sob um rótulo comum (unidades internas sob "QUANTIDADE"). */
  grupo?: { ini: number; n: number; rotulo: string };
  /** Texto abaixo da tabela (descrição dos itens da grade). */
  legenda?: string[];
}

export interface EntradaDosQuadros {
  itens: ItemDaAta[];
  rascunho: RascunhoDaAta;
  fornecedorNi: string;
  fornecedor: FornecedorDaAta;
  /** Nome do órgão pela UASG (cadastro de UASGs; "UASG 123456" quando não achado). */
  nomeDoOrgao: (uasg: string) => string;
  /** Título do Quadro 2, ex.: "SENASP - UASG 200331 (BRASÍLIA/DF)". */
  gerenciadora: string;
}

const textoItem = (n: number) => String(n);

export function quadro1(e: EntradaDosQuadros): QuadroDaAta {
  const comMarca = e.rascunho.marca !== false;
  const linhas: LinhaDoQuadro[] = e.itens.map((i) => {
    const m = emMoeda(e.fornecedorNi, e.rascunho, i);
    return [
      textoItem(i.numero),
      i.descricao,
      ...(comMarca ? [e.rascunho.itens?.[String(i.numero)]?.marca ?? ''] : []),
      i.catmat,
      unidadeCurta(i.unidade),
      fmt(i.gerenciador),
      fmt(somaDosParticipantes(i)),
      fmt(totalDoItem(i)),
      valorBR(i.valorUnitario) + m.vu,
      valorBR(i.valorTotal) + m.vt
    ];
  });
  const moedas = e.itens.map((i) => emMoeda(e.fornecedorNi, e.rascunho, i));
  const totalMoeda = moedas.length && moedas.every((x) => x.moeda) ? ` (${moedas[0].moeda} ${fmt(moedas.reduce((s, x) => s + x.total, 0), 2)})` : '';
  linhas.push({ total: 'TOTAL', v: [valorBR(e.itens.reduce((s, i) => s + i.valorTotal, 0)) + totalMoeda] });
  return {
    titulo: 'Quadro 1',
    cab: ['ITEM', 'DESCRIÇÃO', ...(comMarca ? ['MARCA/MODELO'] : []), 'CATMAT', 'UND', 'QTD GERENCIADOR', 'QTD PARTÍCIPES', 'QTD TOTAL', 'VALOR UNITÁRIO (R$)', 'VALOR TOTAL (R$)'],
    linhas,
    topo: linhasDoFornecedor(e.fornecedor)
  };
}

export const divisaoDoItem = (r: RascunhoDaAta, numero: number, sigla: string) => Number(r.divisao?.[String(numero)]?.[sigla] ?? 0) || 0;

export function quadro2(e: EntradaDosQuadros): QuadroDaAta {
  const unidades = e.rascunho.unidades ?? [];
  const ger = e.rascunho.modo === 'GERENCIADOR';
  const porUnidade = (i: ItemDaAta) => unidades.map((u) => fmt(divisaoDoItem(e.rascunho, i.numero, u)));
  return ger
    ? {
        titulo: 'Quadro 2',
        cab: ['ITEM', 'DESCRIÇÃO', 'UND', ...unidades, 'TOTAL'],
        linhas: e.itens.map((i) => [textoItem(i.numero), i.descricao, unidadeCurta(i.unidade), ...porUnidade(i), fmt(i.gerenciador)]),
        tituloDaTabela: e.gerenciadora,
        grupo: { ini: 3, n: unidades.length, rotulo: 'QUANTIDADE' }
      }
    : {
        titulo: 'Quadro 2',
        cab: ['ITEM', 'DESCRIÇÃO', 'UND', 'QTD MÍNIMA', ...unidades, 'TOTAL'],
        linhas: e.itens.map((i) => [textoItem(i.numero), i.descricao, unidadeCurta(i.unidade), minimaTexto(i.gerenciador), ...porUnidade(i), fmt(i.gerenciador)]),
        tituloDaTabela: e.gerenciadora,
        grupo: { ini: 4, n: unidades.length, rotulo: 'QUANTIDADE' }
      };
}

/** Órgãos da grade: cada um uma vez, na ordem em que aparecem nos itens. */
export function orgaosDaGrade(itens: ItemDaAta[]): string[] {
  return [...new Set(itens.flatMap((i) => i.participantes.map((p) => p.uasg)))];
}
const qtdNaGrade = (i: ItemDaAta, uasg: string) => i.participantes.find((p) => p.uasg === uasg)?.quantidade ?? 0;
/** Célula da grade na cópia: quantidade e, embaixo, a mínima. */
const celulaDaGrade = (q: number, ger: boolean) => (q ? fmt(q) + (ger || !minima(q) ? '' : `\nmín. ${fmt(minima(q))}`) : '-');

export function quadro3Grade(e: EntradaDosQuadros): QuadroDaAta {
  const ger = e.rascunho.modo === 'GERENCIADOR';
  const orgaos = orgaosDaGrade(e.itens).filter((u) => !ger || e.itens.some((i) => qtdNaGrade(i, u)));
  return {
    titulo: 'Quadro 3',
    cab: ['ÓRGÃO PARTICIPANTE', 'UASG', ...e.itens.map((i) => `ITEM ${i.numero}`)],
    linhas: [
      ...orgaos.map((u) => [e.nomeDoOrgao(u), u, ...e.itens.map((i) => celulaDaGrade(qtdNaGrade(i, u), ger))]),
      { total: 'TOTAL', v: e.itens.map((i) => fmt(somaDosParticipantes(i))) }
    ],
    legenda: e.itens.map((i) => `Item ${i.numero}: ${i.descricao} (${unidadeCurta(i.unidade)})`)
  };
}

export function quadro3Lista(e: EntradaDosQuadros): QuadroDaAta {
  const ger = e.rascunho.modo === 'GERENCIADOR';
  const totalItem = (i: ItemDaAta): LinhaDeTotal => ({ total: `TOTAL DO ITEM ${i.numero}`, v: [fmt(somaDosParticipantes(i))] });
  return ger
    ? {
        titulo: 'Quadro 3',
        cab: ['ITEM', 'ÓRGÃO PARTICIPANTE', 'UASG', 'UND', 'QTD'],
        linhas: e.itens.flatMap((i) => [
          ...i.participantes.filter((p) => p.quantidade).map((p) => [textoItem(i.numero), e.nomeDoOrgao(p.uasg), p.uasg, unidadeCurta(i.unidade), fmt(p.quantidade)]),
          totalItem(i)
        ])
      }
    : {
        titulo: 'Quadro 3',
        cab: ['ÓRGÃO PARTICIPANTE', 'UASG', 'ITEM', 'DESCRIÇÃO', 'QTD MÍNIMA', 'QTD'],
        linhas: e.itens.flatMap((i) => [
          ...i.participantes.map((p) => [e.nomeDoOrgao(p.uasg), p.uasg, textoItem(i.numero), i.descricao, p.quantidade ? minimaTexto(p.quantidade) : '-', p.quantidade ? fmt(p.quantidade) : '-']),
          totalItem(i)
        ])
      };
}

/** A grade só abre sozinha com mais de um item e se couber em 9 pt ou mais (em 8 pt com muitas colunas fica difícil de ler). */
export function gradeCabe(e: EntradaDosQuadros): boolean {
  const q = quadro3Grade(e);
  const L = larguras(q.cab, q.linhas);
  return L.cabe && L.pt >= 9;
}

export function formatoDoQuadro3(e: EntradaDosQuadros): FormatoDoQuadro3 {
  return e.rascunho.formato3 ?? (e.itens.length > 1 && gradeCabe(e) ? 'GRADE' : 'LISTA');
}

export function quadro3(e: EntradaDosQuadros): QuadroDaAta {
  return formatoDoQuadro3(e) === 'GRADE' ? quadro3Grade(e) : quadro3Lista(e);
}

export const quadros = (e: EntradaDosQuadros): [QuadroDaAta, QuadroDaAta, QuadroDaAta] => [quadro1(e), quadro2(e), quadro3(e)];

// ------------------------------------------------------------------------------
// Medida das colunas (página do SEI)
// ------------------------------------------------------------------------------

/** Alinhamento pelo tipo da coluna: texto longo à esquerda, código ao centro, quantidade e valor à direita. */
export function alinhamento(coluna: string): 'left' | 'center' | 'right' {
  const c = String(coluna).toUpperCase();
  if (/^(QUANTIDADE|QTD|QUANT|VALOR|TOTAL)/.test(c)) return 'right';
  if (/DESCRI|ESPECIFICA|ÓRGÃO|ORGAO|MARCA/.test(c)) return 'left';
  if (/^ITEM$|CATMAT|UASG|^UND|^UNIDADE/.test(c)) return 'center';
  return 'right';
}

/** Largura útil da página do SEI (A4 em pé, margens de 2 cm ≈ 17 cm ≈ 643 px a 96 dpi). */
export const LARGURA_DA_PAGINA = 643;
/** Hífen opcional nas palavras longas do cabeçalho: quebra com hífen ("GEREN-CIADOR") só quando falta espaço. */
const SILABAS: Record<string, string> = { GERENCIADOR: 'GEREN|CIADOR', 'PARTÍCIPES': 'PARTÍ|CIPES', PARTICIPANTE: 'PARTICI|PANTE', 'DESCRIÇÃO': 'DESCRI|ÇÃO', 'UNITÁRIO': 'UNI|TÁRIO', 'MÍNIMA': 'MÍNI|MA' };
const partesDaPalavra = (w: string) => (SILABAS[w] ?? w).split('|');
const cabecalhoHtml = (c: string) =>
  esc(c)
    .split(' ')
    .map((w) => (SILABAS[w] ? SILABAS[w].split('|').join('&shy;') : w))
    .join(' ')
    .replace(/\//g, '/&#8203;');
/** Largura em "em" de Arial, letra a letra (M/W largos, ponto e vírgula estreitos). */
const emArial = (s: string, negrito = false) =>
  [...String(s)].reduce(
    (w, ch) =>
      w +
      (/[0-9]/.test(ch) ? 0.556 : /[.,:;\s|()\-/]/.test(ch) ? 0.3 : /[IÍ]/.test(ch) ? 0.278 : /[MW]/.test(ch) ? 0.87 : /[A-ZÁÉÍÓÚÂÊÔÃÕÇ$€]/.test(ch) ? (negrito ? 0.7 : 0.667) : 0.53),
    0
  );

export interface Larguras {
  pt: number;
  /** Largura de cada coluna em % da tabela. */
  pct: number[];
  cabe: boolean;
}

export function larguras(cab: string[], linhas: LinhaDoQuadro[], ptFixo?: number): Larguras {
  const textos = cab.map((_, x) => linhas.filter(Array.isArray).map((l) => String((l as string[])[x] ?? '')));
  for (const l of linhas) {
    if (!Array.isArray(l)) l.v.forEach((v, j) => textos[cab.length - l.v.length + j].push(String(v)));
  }
  const pesoDoTexto = (c: string) => (/DESCRI|ESPECIFICA|ÓRGÃO|ORGAO/.test(c) ? 3 : 2);
  const pad = 7;
  const palavras = (c: string) => String(c).split(' ').flatMap((w) => w.split(/(?<=\/)/));
  const tamanhos = ptFixo ? [ptFixo] : [10, 9, 8];
  let resultado: Larguras | null = null;
  for (const pt of tamanhos) {
    const px = pt * 1.333;
    const minimoDoTexto = (c: string) => (/ÓRGÃO|ORGAO/.test(c) ? 150 : /DESCRI|ESPECIFICA/.test(c) ? 75 : 60);
    const conteudo = (c: string, x: number) =>
      alinhamento(c) === 'left' ? minimoDoTexto(c) : Math.max(0, ...textos[x].flatMap((t) => t.split('\n')).map((t) => emArial(t))) * px * 1.05;
    const ideal = cab.map((c, x) => Math.max(conteudo(c, x), Math.max(...palavras(c).map((w) => emArial(w, true))) * px) + pad);
    const minimo = cab.map(
      (c, x) =>
        Math.max(
          conteudo(c, x),
          Math.max(
            ...palavras(c).flatMap((w) => {
              const s = partesDaPalavra(w);
              return s.map((q) => emArial(q + (s.length > 1 ? '-' : ''), true));
            })
          ) * px
        ) + pad
    );
    const total = minimo.reduce((s, v) => s + v, 0);
    const cabe = total <= LARGURA_DA_PAGINA;
    if (cabe || pt === tamanhos[tamanhos.length - 1]) {
      const w = [...minimo];
      let sobra = Math.max(0, LARGURA_DA_PAGINA - total);
      // 1º: a sobra deixa as palavras do cabeçalho inteiras (começando pelas que precisam de menos).
      cab
        .map((_, x) => x)
        .sort((p, q) => ideal[p] - minimo[p] - (ideal[q] - minimo[q]))
        .forEach((x) => {
          const d = Math.min(sobra, ideal[x] - minimo[x]);
          w[x] += d;
          sobra -= d;
        });
      // 2º: o resto vai para o texto (descrição e órgão pesam mais); sem coluna de texto, para todas.
      const txt = cab.map((_, x) => x).filter((x) => alinhamento(cab[x]) === 'left');
      const alvo = txt.length ? txt : cab.map((_, x) => x);
      const pesos = alvo.reduce((s, x) => s + pesoDoTexto(cab[x]), 0);
      alvo.forEach((x) => {
        w[x] += (sobra * pesoDoTexto(cab[x])) / pesos;
      });
      const somaW = w.reduce((s, v) => s + v, 0);
      resultado = { pt, pct: w.map((v) => Math.round((v / somaW) * 1000) / 10), cabe };
      break;
    }
  }
  return resultado as Larguras;
}

/** Um só tamanho de letra para os três quadros: o maior em que todos cabem na página. */
export function tamanhoDaAta(qs: QuadroDaAta[]): number {
  return Math.min(...qs.map((q) => larguras(q.cab, q.linhas).pt));
}

// ------------------------------------------------------------------------------
// Cópia (HTML para o SEI e o Word; texto como reserva)
// ------------------------------------------------------------------------------

export function tabelaHtml(q: QuadroDaAta, pt?: number): string {
  const { cab, linhas } = q;
  const L = larguras(cab, linhas, pt);
  const base = `border:1px solid #000;padding:2px 3px;font-family:Calibri,Arial;font-size:${L.pt}pt;vertical-align:middle`;
  const th = (x?: number) => `style="${base};font-weight:bold;text-align:center;background:#f2f2f2${x == null ? '' : `;width:${L.pct[x]}%`}"`;
  const td = (x: number) => `style="${base};text-align:${alinhamento(cab[x])}"`;
  const tdTotal = `style="${base};font-weight:bold;text-align:right"`;
  // Número e código: espaço que não quebra (o SEI respeita o &nbsp;); "\n" vira quebra de linha planejada.
  const cel = (c: string, x: number) => (alinhamento(cab[x]) === 'left' ? esc(c) : esc(c).replace(/ (?!\()/g, '&nbsp;')).replace(/\n/g, '<br>');
  const topo = q.topo
    ? `<tr><td colspan="${cab.length}" style="border:1px solid #000;padding:4px 6px;font-family:Calibri,Arial;font-size:${L.pt}pt;text-align:left">${q.topo
        .map(([r, v]) => `<b>${esc(r)}:</b> ${esc(v)}`)
        .join('<br>')}</td></tr>`
    : '';
  const titulo = q.tituloDaTabela ? `<tr><th colspan="${cab.length}" ${th()}>${esc(q.tituloDaTabela)}</th></tr>` : '';
  const g = q.grupo && q.grupo.n ? q.grupo : null;
  const cabecalho = !g
    ? `<tr>${cab.map((c, x) => `<th ${th(x)}>${cabecalhoHtml(c)}</th>`).join('')}</tr>`
    : `<tr>${cab
        .map((c, x) => (x === g.ini ? `<th colspan="${g.n}" ${th()}>${esc(g.rotulo)}</th>` : x > g.ini && x < g.ini + g.n ? '' : `<th rowspan="2" ${th(x)}>${cabecalhoHtml(c)}</th>`))
        .join('')}</tr><tr>${cab
        .slice(g.ini, g.ini + g.n)
        .map((c, j) => `<th ${th(g.ini + j)}>${cabecalhoHtml(c)}</th>`)
        .join('')}</tr>`;
  const linha = (l: LinhaDoQuadro) =>
    Array.isArray(l)
      ? `<tr>${l.map((c, x) => `<td ${td(x)}>${cel(c, x)}</td>`).join('')}</tr>`
      : `<tr><td colspan="${cab.length - l.v.length}" ${tdTotal}>${esc(l.total)}</td>${l.v.map((c, j) => `<td ${tdTotal}>${cel(c, cab.length - l.v.length + j)}</td>`).join('')}</tr>`;
  const legenda = q.legenda ? `<p style="margin:3px 0 0;font-family:Calibri,Arial;font-size:${L.pt}pt">${q.legenda.map(esc).join('<br>')}</p>` : '';
  // <thead>: o Word e o SEI repetem o cabeçalho quando a tabela passa de página.
  return `<table style="border-collapse:collapse;width:100%"><thead>${topo}${titulo}${cabecalho}</thead><tbody>${linhas.map(linha).join('')}</tbody></table>${legenda}`;
}

const textoDaLinha = (l: LinhaDoQuadro, n: number) =>
  (Array.isArray(l) ? l.join('\t') : [l.total, ...Array<string>(Math.max(0, n - l.v.length - 1)).fill(''), ...l.v].join('\t')).replace(/\n/g, ' ');

export function textoDoQuadro(q: QuadroDaAta): string {
  return [
    q.titulo,
    ...(q.topo ?? []).map(([r, v]) => `${r}: ${v}`),
    ...(q.tituloDaTabela ? [q.tituloDaTabela] : []),
    q.cab.join('\t'),
    ...q.linhas.map((l) => textoDaLinha(l, q.cab.length)),
    ...(q.legenda ?? [])
  ].join('\n');
}

/** HTML e texto da cópia de um ou mais quadros, no tamanho de letra comum aos três. */
export function copiaDosQuadros(qs: QuadroDaAta[], todos: QuadroDaAta[]): { html: string; texto: string } {
  const pt = tamanhoDaAta(todos);
  return { html: qs.map((q) => tabelaHtml(q, pt)).join('<p></p>'), texto: qs.map(textoDoQuadro).join('\n\n') };
}

// ------------------------------------------------------------------------------
// Conferências (não impedem a cópia)
// ------------------------------------------------------------------------------

const listaDeItens = (ns: number[], rotulo: string) => `${rotulo} do${ns.length > 1 ? 's itens' : ' item'} ${ns.join(', ')}`;

/** O que ainda está em branco (D7: aviso "Falta preencher", sem impedir a cópia). */
export function faltaPreencher(e: EntradaDosQuadros): string[] {
  const f = e.fornecedor;
  const r: string[] = [];
  if (f.estrangeiro && !f.cnpj) r.push('CNPJ no Brasil');
  if (!f.endereco) r.push('endereço');
  if (!f.telefone) r.push('telefone');
  if (!f.email) r.push('e-mail');
  if (!f.representante) r.push('representante');
  if (e.rascunho.marca !== false) {
    const semMarca = e.itens.filter((i) => !e.rascunho.itens?.[String(i.numero)]?.marca).map((i) => i.numero);
    if (semMarca.length) r.push(listaDeItens(semMarca, 'marca/modelo'));
  }
  const semCatmat = e.itens.filter((i) => !i.catmat).map((i) => i.numero);
  if (semCatmat.length) r.push(listaDeItens(semCatmat, 'CATMAT'));
  const unidades = e.rascunho.unidades ?? [];
  if (!unidades.length) r.push('unidades internas (Quadro 2)');
  else {
    const dif = e.itens.filter((i) => unidades.reduce((s, u) => s + divisaoDoItem(e.rascunho, i.numero, u), 0) !== i.gerenciador).map((i) => i.numero);
    if (dif.length) r.push(listaDeItens(dif, 'divisão entre as unidades'));
  }
  return r;
}

/** Itens em que gerenciador + participantes ≠ quantidade homologada para o fornecedor. */
export const itensQueNaoFecham = (itens: ItemDaAta[]) => itens.filter((i) => totalDoItem(i) !== i.homologada).map((i) => i.numero);
