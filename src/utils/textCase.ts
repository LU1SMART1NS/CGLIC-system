/**
 * Caixa do texto exibido no topo das telas 360.
 *
 * O objeto do contrato (Contratos.gov.br) e a descrição do item (catálogo de materiais) chegam
 * todos em maiúsculas; o objeto da ata chega em frase normal. Para as três telas lerem igual,
 * o texto que vem TODO em maiúsculas é exibido em frase normal. Texto que já tem alguma
 * minúscula não é alterado. É só exibição: o dado não muda.
 *
 * Limite conhecido: nomes próprios que não estão na lista de siglas perdem a maiúscula
 * (ex.: "CAMPO GRANDE" vira "campo grande"). A lista precisa de manutenção.
 */

/** Siglas que continuam em maiúsculas. */
export const SIGLAS_MANTIDAS = [
  'ARF', 'ABSM', 'AGU', 'CNPJ', 'CPF', 'UASG', 'SENASP', 'PNCP', 'IPCA', 'IBGE',
  'SEI', 'DOU', 'TR', 'ETP', 'CV', 'KVA', 'USB', 'GPS', 'LED'
];

const SIGLAS = new Set(SIGLAS_MANTIDAS);

const HAS_LOWERCASE = /[a-zà-ÿ]/;
const UPPER_WORD = /[A-ZÀ-Ý0-9]+/g;

/** Passa para minúsculas as palavras em maiúsculas, menos siglas, UF depois de barra e palavras com número. */
function baixarMaiusculas(text: string): string {
  return text.replace(UPPER_WORD, (word, offset: number) => {
    const prev = text.charAt(offset - 1);
    const next = text.charAt(offset + word.length);
    if (SIGLAS.has(word)) return word;
    // Sigla curta entre parênteses, ex.: (ARF)
    if (prev === '(' && next === ')' && word.length <= 5 && /[A-ZÀ-Ý]/.test(word)) return word;
    // UF depois de barra, ex.: CAMPO GRANDE/MS
    if (prev === '/' && word.length === 2) return word;
    // Palavras com número (quantidades, modelos, códigos)
    if (/\d/.test(word)) return word;
    return word.toLowerCase();
  });
}

/** Maiúscula no começo do texto e depois de ponto final. */
const capitalizarFrases = (text: string) =>
  text.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_m, before: string, letter: string) => before + letter.toUpperCase());

export function toSentenceCaseIfAllCaps(text: string | null | undefined): string {
  if (!text) return '';
  if (HAS_LOWERCASE.test(text)) return text;
  return capitalizarFrases(baixarMaiusculas(text));
}

const LETRA = /[A-Za-zÀ-ÖØ-öø-ÿ]/g;
const MAIUSCULA = /[A-ZÀ-ÖØ-Ý]/;
const PALAVRA_LONGA = /[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/g;
const PALAVRA = /[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g;

/**
 * Descrição do item (catálogo de materiais) em frase normal nas listas. O catálogo manda o texto em três jeitos:
 * todo em maiúsculas, quase todo em maiúsculas com alguma minúscula ("C/", "mm") e Com Cada Palavra Maiúscula.
 * Os três viram frase normal; texto que já é frase normal fica como está. Siglas e palavras com número são mantidas.
 */
export function descricaoItemEmFrase(text: string | null | undefined): string {
  if (!text) return '';
  const letras = text.match(LETRA) ?? [];
  if (letras.length === 0) return text;
  const maiusculas = letras.filter((l) => MAIUSCULA.test(l)).length;
  if (maiusculas / letras.length >= 0.6) return capitalizarFrases(baixarMaiusculas(text));

  const palavras = text.match(PALAVRA_LONGA) ?? [];
  const comInicial = palavras.filter((w) => MAIUSCULA.test(w.charAt(0))).length;
  if (palavras.length < 2 || comInicial / palavras.length < 0.7) return text;
  const emFrase = text.replace(PALAVRA, (w) => {
    // Sigla (duas letras ou mais, todas maiúsculas) e palavra com número ficam como estão.
    if (w.length >= 2 && w === w.toUpperCase() && /[A-ZÀ-Ý]/.test(w)) return w;
    if (/\d/.test(w)) return w;
    return w.toLowerCase();
  });
  return capitalizarFrases(emFrase);
}

const PARTICULAS_DE_NOME = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'a', 'o', 'por']);

/** A Receita manda sem acento; palavras comuns de órgãos de segurança voltam com acento. */
const ACENTOS_DE_NOME: Record<string, string> = {
  policia: 'Polícia', publica: 'Pública', seguranca: 'Segurança', municipio: 'Município', secretaria: 'Secretaria',
  batalhao: 'Batalhão', policial: 'Policial', penal: 'Penal', cientifica: 'Científica', tecnica: 'Técnica',
  federal: 'Federal', rodoviaria: 'Rodoviária', judiciaria: 'Judiciária', criminalistica: 'Criminalística',
  periciais: 'Periciais', pericia: 'Perícia', medico: 'Médico', legal: 'Legal', instituto: 'Instituto',
  administracao: 'Administração', coordenadoria: 'Coordenadoria', diretoria: 'Diretoria', delegacia: 'Delegacia',
  'sao': 'São', 'goias': 'Goiás', 'para': 'Pará', 'amapa': 'Amapá', 'ceara': 'Ceará', 'piaui': 'Piauí',
  'maranhao': 'Maranhão', 'paraiba': 'Paraíba', 'rondonia': 'Rondônia', 'brasilia': 'Brasília', 'espirito': 'Espírito'
};

/**
 * Nome de órgão/unidade em maiúsculas (razão social da Receita) no padrão dos cadastros:
 * cada palavra com inicial maiúscula, menos "de/do/da/e…" (ex.: "Polícia Civil do Estado de Minas Gerais").
 * Texto que já tem minúscula não é alterado. Siglas conhecidas e palavras com número ficam como estão.
 */
export function nomeProprioEmTitulo(text: string | null | undefined): string {
  if (!text) return '';
  if (HAS_LOWERCASE.test(text)) return text;
  return text.replace(/[A-ZÀ-Ý0-9ºª]+/g, (word, offset: number) => {
    if (SIGLAS.has(word) || /\d/.test(word)) return word;
    const baixa = word.toLowerCase();
    if (ACENTOS_DE_NOME[baixa]) return ACENTOS_DE_NOME[baixa];
    if (offset > 0 && PARTICULAS_DE_NOME.has(baixa)) return baixa;
    return baixa.charAt(0).toUpperCase() + baixa.slice(1);
  });
}
