/**
 * Leitura dos textos usados na projeção de reajuste das atas (migration 158). Só funções puras sobre o
 * texto já extraído dos PDFs: o download e a extração ficam com reajusteAtasSyncService.
 *
 * Edital (cláusula do modelo da AGU): "Os preços inicialmente contratados são fixos e irreajustáveis no
 * prazo de um ano contado da data do orçamento estimado, em 23/09/2024 ... índice IPCA ...". A data do
 * edital é só uma sugestão: a CGLIC conta do Termo de Conformidade da pesquisa de preços.
 *
 * Apostilamentos e termos aditivos publicados no PNCP (formas vistas em 80 documentos, 23/10/2026):
 *   "reajustados pelo IPCA de 5,17% (34108953), considerando o período do orçamento estimado de 10/2024 a
 *    09/2025 (29255776), para aplicação no novo ciclo de vigência da Ata 09/01/2026 a 08/01/2027."
 *   "... de 10/2024 a 09/2025, de acordo com a conformidade da pesquisa de preços à época (29378565) ..."
 *   "IPCA de 4,44% (36006809), considerandoa variação acumulada do IPCA apurada entre 02/2025 a 01/2026"
 *   "IPCA/IBGE, apurado no período de fevereiro de 2025 a janeiro de 2026, no percentual de 4,44%
 *    (34985144) ... valores unitários aplicáveis a partir da assinatura do presente termo de apostilamento"
 * O texto extraído do PDF às vezes repete trechos e troca a ligadura "ti" por "!" ou "=" ("es!mado").
 */

export type IndiceReajuste = 'IPCA' | 'ICTI' | 'INPC' | 'IST' | 'IGPM' | 'INCC';

export interface ClausulaDoEdital {
  /** Índice da cláusula de reajuste; null quando o texto não deixa claro. */
  indice: IndiceReajuste | null;
  /** Todos os índices citados na cláusula (alguns editais citam dois). */
  indicesCitados: IndiceReajuste[];
  /** Data do orçamento estimado escrita no edital (AAAA-MM-DD); null se ausente, em branco ou ambígua. */
  dataOrcamento: string | null;
  /** A cláusula traz "fixos e irreajustáveis" e um índice. */
  temClausula: boolean;
  /** O campo da data está em branco no edital ("__/__/__"). */
  dataEmBranco: boolean;
}

export interface ReajusteDoDocumento {
  indice: IndiceReajuste | null;
  /** Percentual aplicado; null quando o documento não traz o número. */
  percentual: number | null;
  /** Primeiro e último mês do índice (AAAA-MM-01); null quando o período não pôde ser lido. */
  periodoInicio: string | null;
  periodoFim: string | null;
  /** Documento SEI citado logo depois do período (em geral, o Termo de Conformidade ou o cálculo). */
  seiCitado: string | null;
  /** O texto diz que o SEI citado é a conformidade da pesquisa de preços. */
  seiEhConformidade: boolean;
  /** Início dos efeitos escrito no documento ("novo ciclo de vigência da Ata 09/01/2026 a ..."). */
  efeitoInicio: string | null;
  /** "para aplicação no novo ciclo de vigência" sem a data. */
  noNovoCiclo: boolean;
  /** "aplicáveis a partir da assinatura do presente termo". */
  aPartirDaAssinatura: boolean;
}

export interface LeituraDoDocumento {
  reajustes: ReajusteDoDocumento[];
  /** Primeira data de assinatura eletrônica do documento (AAAA-MM-DD). */
  dataAssinatura: string | null;
  /** O documento fala de reajuste, mas nenhum percentual ou período foi reconhecido. */
  citaReajusteSemLeitura: boolean;
  /** O documento aplica um reajuste ("reajustados pelo", "REAJUSTAR o valor"), mas o percentual não foi lido. */
  aplicaReajusteSemPercentual: boolean;
}

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
};

/** Texto numa linha só, sem os defeitos de extração vistos nos PDFs do SEI. */
export function normalizarTexto(texto: string): string {
  return texto
    .replace(/\s+/g, ' ')
    .replace(/es[!=]mado/gi, 'estimado')
    .replace(/considerandoa /gi, 'considerando a ')
    .trim();
}

const dois = (n: number) => String(n).padStart(2, '0');

function dataValida(ano: number, mes: number, dia: number): string | null {
  if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1) return null;
  return `${ano}-${dois(mes)}-${dois(dia)}`;
}

function mesValido(ano: number, mes: number): string | null {
  return dataValida(ano, mes, 1);
}

function numeroBr(valor: string): number | null {
  const limpo = valor.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function indiceDoNome(trecho: string): IndiceReajuste[] {
  const achados: Array<[number, IndiceReajuste]> = [];
  const testes: Array<[RegExp, IndiceReajuste]> = [
    [/\bIPCA\b|Consumidor Amplo/g, 'IPCA'],
    [/\bICTI\b|Custo da Tecnologia da Informa/g, 'ICTI'],
    [/\bINPC\b/g, 'INPC'],
    [/\bIST\b|Setorial de Telecomunica/g, 'IST'],
    [/\bIGP-?M\b/g, 'IGPM'],
    [/\bINCC\b/g, 'INCC']
  ];
  for (const [re, nome] of testes) {
    const m = re.exec(trecho);
    if (m) achados.push([m.index, nome]);
  }
  return achados.sort((a, b) => a[0] - b[0]).map(([, n]) => n);
}

/** Cláusula de reajuste do edital (ou do termo de referência / minuta). */
export function lerClausulaDoEdital(textoBruto: string): ClausulaDoEdital {
  const texto = normalizarTexto(textoBruto);

  const indices = new Set<IndiceReajuste>();
  for (const m of texto.matchAll(/irreajust[áa]veis.{0,700}/gi)) {
    for (const i of indiceDoNome(m[0])) indices.add(i);
  }
  const indicesCitados = [...indices];
  // Alguns editais citam dois índices (ex.: ICTI e IPCA); os reajustes publicados dessas atas usaram o IPCA.
  const indice = indicesCitados.length === 0 ? null : indicesCitados.includes('IPCA') ? 'IPCA' : indicesCitados[0];

  const contagem = new Map<string, number>();
  for (const m of texto.matchAll(/data do or[çc]amento estimado,?\s*(?:em\s*)?(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/gi)) {
    const d = dataValida(Number(m[3]), Number(m[2]), Number(m[1]));
    if (d) contagem.set(d, (contagem.get(d) ?? 0) + 1);
  }
  const ordenadas = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  // Duas datas diferentes com a mesma frequência: ambígua, não sugere nenhuma.
  const dataOrcamento = ordenadas.length === 0 || (ordenadas.length > 1 && ordenadas[0][1] === ordenadas[1][1]) ? null : ordenadas[0][0];
  const dataEmBranco = /data do or[çc]amento estimado,?\s*(?:em\s*)?[._\s]*_{2,}/i.test(texto) || /data do or[çc]amento estimado,?\s*(?:em\s*)?\.?\s*_*\s*\(DD\/MM\/AAAA\)/i.test(texto);

  return { indice, indicesCitados, dataOrcamento, temClausula: indice !== null, dataEmBranco };
}

function depoisDoPeriodo(texto: string, fim: number): Pick<ReajusteDoDocumento, 'seiCitado' | 'seiEhConformidade' | 'efeitoInicio' | 'noNovoCiclo' | 'aPartirDaAssinatura'> {
  const resto = texto.slice(fim, fim + 600);
  const sei = /^[\s,]*(?:(de acordo com a conformidade da pesquisa de pre[çc]os[^(]{0,30}))?\(+\s*(\d{7,10})\s*\)/i.exec(resto);
  const ciclo = /novo ciclo de vig[êe]ncia da (?:Ata|ARP)\s*(?:de Registro de Pre[çc]os\s*)?\(?\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(resto);
  return {
    seiCitado: sei ? sei[2] : null,
    seiEhConformidade: Boolean(sei && sei[1]),
    efeitoInicio: ciclo ? dataValida(Number(ciclo[3]), Number(ciclo[2]), Number(ciclo[1])) : null,
    noNovoCiclo: /novo ciclo de vig[êe]ncia/i.test(resto),
    aPartirDaAssinatura: /a partir da assinatura do presente termo/i.test(texto.slice(fim, fim + 1200))
  };
}

/** Reajustes de um apostilamento ou termo aditivo da ata. */
export function lerReajustesDoDocumento(textoBruto: string): LeituraDoDocumento {
  const texto = normalizarTexto(textoBruto);
  const vistos = new Set<string>();
  const reajustes: ReajusteDoDocumento[] = [];
  const guardar = (r: ReajusteDoDocumento) => {
    const chave = `${r.percentual}|${r.periodoInicio}|${r.periodoFim}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    reajustes.push(r);
  };

  // "IPCA de 5,17% (...), considerando o período ... de 10/2024 a 09/2025" e "apurada entre 02/2025 a 01/2026"
  const comMesNumerico = /\b(IPCA|ICTI|INPC|IST|IGP-?M|INCC)(?:\/IBGE)?\s+de\s+(\d{1,2}(?:,\d{1,6})?)\s*%?[^.]{0,220}?(?:per[íi]odo[^.]{0,60}?\bde|apurad[ao] entre|entre)\s+(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{4})/gi;
  for (const m of texto.matchAll(comMesNumerico)) {
    const inicio = mesValido(Number(m[4]), Number(m[3]));
    const fim = mesValido(Number(m[6]), Number(m[5]));
    if (!inicio || !fim || fim < inicio) continue;
    guardar({
      indice: indiceDoNome(m[1].toUpperCase())[0] ?? null,
      percentual: numeroBr(m[2]),
      periodoInicio: inicio,
      periodoFim: fim,
      ...depoisDoPeriodo(texto, (m.index ?? 0) + m[0].length)
    });
  }

  // "IPCA/IBGE, apurado no período de fevereiro de 2025 a janeiro de 2026, no percentual de 4,44%"
  const comMesPorExtenso = /per[íi]odo de ([a-zç]+) de (\d{4}) a ([a-zç]+) de (\d{4}),?\s*no percentual de (\d{1,2}(?:,\d{1,6})?)\s*%/gi;
  for (const m of texto.matchAll(comMesPorExtenso)) {
    const mi = MESES[m[1].toLowerCase()];
    const mf = MESES[m[3].toLowerCase()];
    if (!mi || !mf) continue;
    const inicio = mesValido(Number(m[2]), mi);
    const fim = mesValido(Number(m[4]), mf);
    if (!inicio || !fim || fim < inicio) continue;
    const antes = texto.slice(Math.max(0, (m.index ?? 0) - 300), m.index ?? 0);
    const posicao = (m.index ?? 0) + m[0].length;
    const sei = /^\s*\(\s*(\d{7,10})\s*\)/.exec(texto.slice(posicao, posicao + 40));
    guardar({
      indice: indiceDoNome(antes).at(-1) ?? null,
      percentual: numeroBr(m[5]),
      periodoInicio: inicio,
      periodoFim: fim,
      ...depoisDoPeriodo(texto, posicao),
      seiCitado: sei ? sei[1] : null,
      seiEhConformidade: false
    });
  }

  // Texto embaralhado pela extração (camadas repetidas letra a letra): o percentual ainda aparece inteiro
  // no começo ("reajustados pelo IPCA de 5,23% (IPCA de 5,23% (3403285434032854)..."), o período não.
  const aplica = /reajustados pelo|REAJUSTAR o valor|valores unit[áa]rios reajustados|reajuste contratual anual/i.test(texto);
  if (reajustes.length === 0 && aplica) {
    const m = /reajustados pelo (IPCA|ICTI|INPC|IST|IGP-?M|INCC)(?:\/IBGE)?\s+de\s+(\d{1,2},\d{1,6})\s*%/i.exec(texto);
    if (m) {
      const posicao = (m.index ?? 0) + m[0].length;
      guardar({
        indice: indiceDoNome(m[1].toUpperCase())[0] ?? null,
        percentual: numeroBr(m[2]),
        periodoInicio: null,
        periodoFim: null,
        ...depoisDoPeriodo(texto, posicao),
        seiCitado: null,
        seiEhConformidade: false,
        efeitoInicio: null
      });
    }
  }

  const assinatura = /assinado eletronicamente por .{3,200}? em (\d{2})\/(\d{2})\/(\d{4})/i.exec(texto);
  return {
    reajustes,
    dataAssinatura: assinatura ? dataValida(Number(assinatura[3]), Number(assinatura[2]), Number(assinatura[1])) : null,
    citaReajusteSemLeitura: reajustes.length === 0 && /\breajust(e|ar|ados?)\b/i.test(texto) && /\b(IPCA|ICTI|INPC|IST)\b/.test(texto),
    aplicaReajusteSemPercentual: reajustes.length === 0 && aplica
  };
}

const somarAnos = (iso: string, anos: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(Date.UTC(y + anos, m - 1, d));
  return x.toISOString().slice(0, 10);
};
const menosDias = (iso: string, dias: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);

/**
 * Início dos efeitos de um reajuste lido. Com a data no texto, ela vale. "No novo ciclo de vigência" sem
 * data: o início do ciclo da ata (aniversário da vigência) mais próximo depois de 90 dias antes da
 * publicação, porque o termo aditivo sai pouco antes da prorrogação. "A partir da assinatura": a data da
 * assinatura eletrônica ou, sem ela, a da publicação.
 */
export function resolverEfeito(
  r: Pick<ReajusteDoDocumento, 'efeitoInicio' | 'noNovoCiclo' | 'aPartirDaAssinatura'>,
  ctx: { inicioVigencia: string; publicadoEm: string | null; dataAssinatura: string | null; tituloFalaDeAditivo: boolean }
): string | null {
  if (r.efeitoInicio) return r.efeitoInicio;
  const referencia = ctx.publicadoEm ?? ctx.dataAssinatura;
  if (r.aPartirDaAssinatura && !r.noNovoCiclo) return ctx.dataAssinatura ?? ctx.publicadoEm;
  if (r.noNovoCiclo || ctx.tituloFalaDeAditivo) {
    if (!referencia) return null;
    const limite = menosDias(referencia, 90);
    for (let k = 0; k <= 4; k++) {
      const ciclo = somarAnos(ctx.inicioVigencia, k);
      if (ciclo >= limite) return ciclo;
    }
    return null;
  }
  return ctx.dataAssinatura ?? ctx.publicadoEm;
}

// ------------------------------------------------------------------------------
// Termo aditivo de prorrogação: o que ele diz sobre o saldo (migration 222)
// ------------------------------------------------------------------------------

/**
 * SALDO: o 2º ano usa só o saldo não contratado ("abrange apenas o saldo remanescente", "restabelece o saldo
 * remanescente"; 84 de 99 termos da CGLIC lidos em 27/10/2026). RENOVA: o termo renova os quantitativos registrados.
 * A_CONFERIR: é um termo de prorrogação, mas o texto não diz (ou não deu para ler).
 */
export type CoberturaDaProrrogacao = 'SALDO' | 'RENOVA' | 'A_CONFERIR';

export interface TermoDeProrrogacao {
  cobertura: CoberturaDaProrrogacao;
  /** A frase do termo que diz isso (até 300 letras). */
  trecho: string | null;
}

/** Lê um documento da ata; nulo quando ele não é um termo de prorrogação. */
export function lerTermoDeProrrogacao(textoBruto: string, titulo = ''): TermoDeProrrogacao | null {
  const texto = normalizarTexto(textoBruto);
  const ehProrrogacao = /prorroga/i.test(texto) && (/termo\s+aditivo/i.test(texto) || /aditivo|prorroga/i.test(titulo));
  if (!ehProrrogacao) return null;
  const frase = (re: RegExp) => {
    const m = texto.match(re);
    return m ? m[0].trim().replace(/^(\d+\.)+\s*/, '').slice(0, 300) : null;
  };
  const renova = frase(/[^.;]*renova\w*\s+(?:d?os\s+)?quantitativ[^.;]*[.;]?|[^.;]*quantitativ\w*\s+(?:originalmente|inicialmente)\s+registrad[^.;]*[.;]?/i);
  if (renova) return { cobertura: 'RENOVA', trecho: renova };
  const saldo = frase(/[^.;]*saldo\s+remanescente[^.;]*[.;]?/i);
  if (saldo) return { cobertura: 'SALDO', trecho: saldo };
  return { cobertura: 'A_CONFERIR', trecho: null };
}
