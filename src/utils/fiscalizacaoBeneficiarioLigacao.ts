// Itens da planilha (carga de 11/11/2026) com o beneficiário escrito à mão: grupos por nome e UF e sugestões do cadastro.
import type { EntregaFiscalizacao } from '../services/fiscalizacaoService';
import type { BeneficiarioEmenda } from '../services/emendasService';
import { NOME_DA_UF } from './emendasBeneficiarios';

const UFS = 'ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to'.split(' ');

/** Minúsculas, sem acento, só letras e números. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** O nome sem a UF no fim ("Polícia Civil - DF" → "policia civil"): a UF já vem na coluna própria da planilha. */
export function semUfNoFim(s: string): string {
  const p = normalizar(s).split(' ');
  return p.length > 1 && UFS.includes(p[p.length - 1]) ? p.slice(0, -1).join(' ') : p.join(' ');
}

export interface GrupoSemCadastro {
  /** nome normalizado sem a UF + UF */
  chave: string;
  /** Como foi escrito na planilha (a grafia do primeiro item). */
  texto: string;
  uf: string | null;
  es: EntregaFiscalizacao[];
}

export const semCadastroDaPlanilha = (e: EntregaFiscalizacao) => !e.beneficiarioId && Boolean(e.beneficiarioTexto?.trim());

/** Agrupa por nome escrito (sem acento, caixa e UF no fim) e UF: uma escolha liga todos os itens do grupo. Maiores primeiro. */
export function gruposSemCadastro(es: EntregaFiscalizacao[]): GrupoSemCadastro[] {
  const m = new Map<string, GrupoSemCadastro>();
  for (const e of es.filter(semCadastroDaPlanilha)) {
    const uf = e.uf?.toUpperCase() ?? null;
    const chave = `${semUfNoFim(e.beneficiarioTexto ?? '')}|${uf ?? ''}`;
    const g = m.get(chave) ?? { chave, texto: e.beneficiarioTexto ?? '', uf, es: [] };
    g.es.push(e);
    m.set(chave, g);
  }
  return [...m.values()].sort((a, b) => b.es.length - a.es.length || a.texto.localeCompare(b.texto, 'pt-BR'));
}

// Abreviações comuns na planilha, para comparar palavra com palavra.
const ABREVIACOES: Record<string, string> = {
  pm: 'policia militar',
  pc: 'policia civil',
  pcac: 'policia civil',
  cbm: 'corpo bombeiros militar',
  cbmerj: 'corpo bombeiros militar',
  bm: 'bombeiros militar',
  gm: 'guarda municipal',
  gcm: 'guarda civil municipal',
  sejusp: 'secretaria justica seguranca publica',
  ssp: 'secretaria seguranca publica',
  sesp: 'secretaria seguranca publica',
  pf: 'policia federal',
  prf: 'policia rodoviaria federal',
  pp: 'policia penal'
};
const VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'estado', 'cidade', 'municipio', 'municipal', 'geral']);

function palavras(s: string | null | undefined): Set<string> {
  const ws = semUfNoFim(s ?? '')
    .split(' ')
    .flatMap((w) => (ABREVIACOES[w] ?? w).split(' '))
    .filter((w) => w && !VAZIAS.has(w) && !UFS.includes(w));
  return new Set(ws);
}

const nomesDoCadastro = (b: BeneficiarioEmenda) => [b.nome, b.sigla, b.razaoSocial, ...(b.outrosNomes ?? [])].filter((x): x is string => Boolean(x));
const daUf = (b: BeneficiarioEmenda, uf: string | null) => !uf || !b.entregaUf || b.entregaUf.toUpperCase() === uf;

export interface Sugestao {
  b: BeneficiarioEmenda;
  /** Nome, sigla, razão social ou outra grafia igual ao escrito na planilha. */
  igual: boolean;
}

/**
 * Até 4 cadastros ativos da mesma UF, os iguais primeiro e depois os parecidos. Parecido: a maior parte das palavras do
 * nome mais curto aparece no outro (abreviações por extenso e o nome do estado contam), mais um ponto quando a cidade
 * do cadastro está escrita na planilha ("PM - MG (Cidade de Formiga)" → 63º BPM de Formiga). Nenhum parecido é
 * escolhido sozinho; o igual só quando é o único.
 */
export function sugestoesDoCadastro(texto: string, uf: string | null, lista: BeneficiarioEmenda[]): Sugestao[] {
  const alvo = semUfNoFim(texto);
  const pa = palavras(`${texto} ${uf ? NOME_DA_UF[uf] ?? '' : ''}`);
  const escrito = ` ${normalizar(texto)} `;
  const notas: { b: BeneficiarioEmenda; igual: boolean; nota: number }[] = [];
  for (const b of lista) {
    if (!b.ativo || !daUf(b, uf)) continue;
    const nomes = nomesDoCadastro(b);
    if (nomes.some((n) => semUfNoFim(n) === alvo)) {
      notas.push({ b, igual: true, nota: 9 });
      continue;
    }
    let melhor = 0;
    for (const n of nomes) {
      const pb = palavras(`${n} ${b.entregaUf ? NOME_DA_UF[b.entregaUf] ?? '' : ''}`);
      const comuns = [...pa].filter((w) => pb.has(w)).length;
      if (comuns) melhor = Math.max(melhor, comuns / Math.min(pa.size, pb.size));
    }
    const cidade = normalizar(b.entregaMunicipio);
    const naCidade = Boolean(cidade) && escrito.includes(` ${cidade} `);
    const nota = melhor + (naCidade ? 0.5 : 0);
    if (nota >= 0.8) notas.push({ b, igual: false, nota });
  }
  return notas
    .sort((x, y) => y.nota - x.nota || x.b.nome.localeCompare(y.b.nome, 'pt-BR'))
    .slice(0, 4)
    .map(({ b, igual }) => ({ b, igual }));
}

/** O cadastro que já vem escolhido: só quando um único cadastro tem o nome igual. */
export function escolhaInicial(sugestoes: Sugestao[]): string | null {
  const iguais = sugestoes.filter((s) => s.igual);
  return iguais.length === 1 ? iguais[0].b.id : null;
}

/** Nome para começar um cadastro novo: o escrito na planilha sem a UF no fim. */
export function nomeParaCadastro(texto: string): string {
  return texto.replace(/\s*[-–—/]\s*[A-Za-z]{2}\s*$/, '').trim();
}
