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

export function toSentenceCaseIfAllCaps(text: string | null | undefined): string {
  if (!text) return '';
  if (HAS_LOWERCASE.test(text)) return text;

  const lowered = text.replace(UPPER_WORD, (word, offset: number) => {
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

  // Maiúscula no começo do texto e depois de ponto final
  return lowered.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_m, before: string, letter: string) => before + letter.toUpperCase());
}
