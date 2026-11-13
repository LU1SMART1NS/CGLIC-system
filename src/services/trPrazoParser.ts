/**
 * Leitura do prazo de entrega no Termo de Referência (ou no edital com o TR dentro), a mesma regra da carga de
 * 13/11/2026 (migration 301), agora também para as atas novas (sincronização, recurso 'prazo_tr').
 *
 * Medição na carga (74 compras, texto do unpdf): 26 claras, 33 a conferir e 15 sem cláusula. A leitura só sugere: o
 * gestor da ata confirma na Ata 360. Nos casos claros ela bateu com a classificação manual da amostra.
 *
 * O resultado é CLARO (um prazo, um ponto de partida), CONFERIR (trechos que se contradizem, prazo escalonado, mais de
 * um prazo no mesmo trecho, sem dizer a partir de quando) ou SEM_CLAUSULA.
 */
import type { ContagemPrazo, InicioPrazo } from '../utils/fiscalizacaoPrazo';

export type LeituraDoTr = 'CLARO' | 'CONFERIR' | 'SEM_CLAUSULA';

export interface PrazoLidoDoTr {
  leitura: LeituraDoTr;
  motivo: string | null;
  dias: number | null;
  contagem: ContagemPrazo | null;
  /** O TR disse "corridos" ou "úteis"; sem isso, vale corridos (Lei 14.133, art. 183). */
  contagemDita: boolean;
  inicio: InicioPrazo | null;
  /** Até 3 trechos do TR (o principal primeiro), para o gestor conferir. */
  trechos: string[];
}

interface Candidato {
  varios: boolean;
  dias: number;
  inicio: InicioPrazo | null;
  contagem: ContagemPrazo | null;
  trecho: string;
}

const FRASE = /[^.;]{0,200}?prazo\s+(?:m[aá]ximo\s+)?(?:de\s+|para\s+(?:a\s+)?)?entrega[^.;]{0,260}|[^.;]{0,80}entreg\p{L}*[^.;]{0,60}no\s+prazo\s+(?:m[aá]ximo\s+)?de[^.;]{0,220}/giu;
const NAO = /recolhid|amostra|convoca|garantia|pagamento|recurso|substitui|reparo|assist[eê]ncia|prot[oó]tipo|certifica|propost|habilita|impugna|esclarec|documenta|nota fiscal|corrig|defeito|v[ií]cio|devolu/iu;
const DIAS = /(\d{1,3})\s*(?:\([^)]{0,40}\))?\s*(?:dias|\(?\s*dias)/iu;
const TODOS_OS_DIAS = /(\d{1,3})\s*(?:\([^)]{0,40}\))?\s*dias/giu;
const EXERCITO = /prazo[^.]{0,80}entrega[^.]{0,120}(?:autoriza\p{L}*\s+(?:do|pelo)\s+ex[eé]rcito)|contagem iniciada ap[oó]s[^.]{0,60}ex[eé]rcito/iu;
const TRECHO_EXERCITO = /[^.]{0,120}contagem iniciada ap[oó]s[^.]{0,80}|[^.]{0,120}prazo[^.]{0,80}entrega[^.]{0,120}autoriza\p{L}*\s+(?:do|pelo)\s+ex[eé]rcito[^.]{0,40}/iu;
const ESCALONADO = /acr[eé]scimo de \d+\s*dias a cada|parcela faixa/iu;
const PRINCIPAL = /prazo\s+(?:m[aá]ximo\s+)?de\s+entrega\s+d[oa]s?\s+(?:bens|equipamentos|materiais|objetos?|itens|produtos)/iu;

function diasDe(s: string): number | null {
  const m = DIAS.exec(s);
  return m ? Number(m[1]) : null;
}

function inicioDe(s: string): InicioPrazo | null {
  const t = s.toLowerCase();
  if (/autoriza\p{L}*\s+(?:do|pelo)\s+ex[eé]rcito/u.test(t)) return 'EXERCITO';
  if (/assinatura\s+do\s+(?:contrato|instrumento)/u.test(t) && !/ordem|solicita|ofb|empenho/u.test(t)) return 'ASSINATURA';
  if (/recebimento\s+d[ao]\s+(?:respectiva\s+)?(?:ordem|solicita|ofb|nota de empenho|empenho|autoriza)/u.test(t)) return 'OF_RECEBIMENTO';
  if (/(?:emiss[aã]o|solicita[cç][aã]o feita)[^,;]{0,40}(?:ordem|ofb|empenho|autoriza)|contados?\s+d[ao]\(?a?\)?\s+(?:ordem|solicita)/u.test(t)) return 'OF_EMISSAO';
  if (/assinatura/u.test(t)) return 'ASSINATURA';
  return null;
}

function contagemDe(s: string): ContagemPrazo | null {
  const t = s.toLowerCase();
  if (t.includes('úteis') || t.includes('uteis')) return 'UTEIS';
  if (t.includes('corridos')) return 'CORRIDOS';
  return null;
}

/** Tira o pedaço da frase anterior (o trecho começa na primeira maiúscula) e corta em 280 letras. */
const limparTrecho = (t: string) => t.replace(/^[^A-ZÀ-Ú]*/u, '').replace(/[\u0000-\u001f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 280);

function maisFrequente<T>(valores: T[]): T | null {
  const conta = new Map<T, number>();
  for (const v of valores) conta.set(v, (conta.get(v) ?? 0) + 1);
  let melhor: T | null = null;
  let n = 0;
  for (const [v, c] of conta) if (c > n) [melhor, n] = [v, c];
  return melhor;
}

export function lerPrazoDoTr(textoBruto: string): PrazoLidoDoTr {
  const texto = textoBruto.replace(/[\u0000-\u001f]/gu, ' ').replace(/\s+/gu, ' ');
  const vazio: PrazoLidoDoTr = { leitura: 'SEM_CLAUSULA', motivo: 'cláusula de entrega não encontrada', dias: null, contagem: null, contagemDita: false, inicio: null, trechos: [] };
  if (!texto.trim()) return { ...vazio, motivo: 'sem texto do edital no PNCP' };

  const cands: Candidato[] = [];
  for (const m of texto.matchAll(FRASE)) {
    const s = m[0].trim();
    if (NAO.test(s) || !/dias/iu.test(s)) continue;
    const d = diasDe(s);
    if (!d) continue;
    const nums = new Set([...s.matchAll(TODOS_OS_DIAS)].map((x) => Number(x[1])));
    cands.push({ varios: nums.size > 1, dias: d, inicio: inicioDe(s), contagem: contagemDe(s), trecho: s.slice(-300).trim() });
  }
  if (!cands.length) return vazio;

  const exercito = EXERCITO.test(texto);
  const escalonado = ESCALONADO.test(texto);
  const dias = new Set(cands.map((c) => c.dias));
  const inicios = new Set(cands.map((c) => c.inicio).filter(Boolean));
  const contagens = new Set(cands.map((c) => c.contagem).filter(Boolean));
  const algumComInicio = cands.some((c) => c.inicio);

  let leitura: LeituraDoTr = 'CLARO';
  let motivo: string | null = null;
  if (escalonado) [leitura, motivo] = ['CONFERIR', 'prazo escalonado pela quantidade'];
  else if (cands.some((c) => c.varios)) [leitura, motivo] = ['CONFERIR', 'o mesmo trecho tem mais de um prazo (por destino ou por item)'];
  else if (dias.size > 1) [leitura, motivo] = ['CONFERIR', `trechos com prazos diferentes: ${[...dias].sort((a, b) => a - b).map((d) => `${d} dias`).join(', ')}`];
  else if (inicios.size > 1 && !exercito) [leitura, motivo] = ['CONFERIR', 'trechos contam de pontos diferentes'];
  else if (contagens.size > 1) [leitura, motivo] = ['CONFERIR', 'um trecho diz dias corridos e outro dias úteis'];
  else if (!algumComInicio && !exercito) [leitura, motivo] = ['CONFERIR', 'não diz a partir de quando conta'];

  const principais = cands.filter((c) => PRINCIPAL.test(c.trecho));
  const d = maisFrequente((principais.length ? principais : cands).map((c) => c.dias))!;
  const inicio: InicioPrazo | null = exercito ? 'EXERCITO' : maisFrequente(cands.filter((c) => c.inicio && c.dias === d).map((c) => c.inicio!));
  const contagem = maisFrequente(cands.filter((c) => c.contagem).map((c) => c.contagem!));

  const trechos: string[] = [];
  for (const c of [...cands.filter((x) => x.dias === d), ...cands]) {
    const t = limparTrecho(c.trecho);
    if (t && !trechos.includes(t)) trechos.push(t);
  }
  if (exercito) {
    const m = TRECHO_EXERCITO.exec(texto);
    if (m) trechos.splice(trechos.length ? 1 : 0, 0, limparTrecho(m[0]));
  }
  if (!trechos.length) trechos.push(limparTrecho(cands[0].trecho) || cands[0].trecho.slice(0, 280));
  return { leitura, motivo, dias: d, contagem: contagem ?? 'CORRIDOS', contagemDita: Boolean(contagem), inicio, trechos: trechos.slice(0, 3) };
}
