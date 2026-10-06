/**
 * Comparação de fornecedor entre contrato e ata.
 *
 * Fornecedor brasileiro: CNPJ/CPF (11 ou 14 dígitos). Fornecedor estrangeiro não tem documento fiscal: o
 * Contratos.gov.br o identifica por um código genérico (ex.: "EXAXONEN1") e o Compras.gov.br por outro
 * (ex.: "ESTRANG0000348"). Os códigos nunca coincidem, então, sem documento válido, a comparação passa a ser
 * pelo nome da empresa, tolerando sufixos societários, acentos e pequenos erros de digitação
 * ("AXON INTERPRISE" × "Axon Enterprise, Inc.").
 */

const onlyDigits = (v?: string | number | null) => String(v ?? '').replace(/\D/g, '');

/** CNPJ (14) ou CPF (11): o que serve de chave de comparação. Código genérico de estrangeiro não serve. */
export function documentoFiscalValido(v?: string | number | null): boolean {
  const d = onlyDigits(v);
  return d.length === 11 || d.length === 14;
}

/** Palavras que não distinguem uma empresa da outra. */
const PALAVRAS_SOCIETARIAS = new Set([
  'LTDA', 'LTD', 'LIMITED', 'INC', 'INCORPORATED', 'LLC', 'LLP', 'CORP', 'CORPORATION', 'CO', 'COMPANY',
  'SA', 'AS', 'AG', 'SRL', 'SPA', 'GMBH', 'BV', 'NV', 'PLC', 'EIRELI', 'EPP', 'ME', 'SARL', 'OY', 'AB',
  'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'AND', 'THE', 'UND', 'DER', 'DIE'
]);

export function tokensDoNome(nome?: string | null): string[] {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !PALAVRAS_SOCIETARIAS.has(t));
}

function distancia(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Palavras iguais ou com erro de digitação (até 2 letras em palavra longa, 1 em palavra média). */
function palavrasParecidas(a: string, b: string): boolean {
  if (a === b) return true;
  const menor = Math.min(a.length, b.length);
  if (menor < 4) return false;
  return distancia(a, b) <= (menor >= 7 ? 2 : 1);
}

/**
 * Mesma empresa pelo nome: a palavra que abre o nome tem de ser a mesma e ao menos 3/4 das palavras do nome
 * mais curto têm de aparecer no outro (cobre o nome truncado pelo sistema de origem). Nome de uma palavra só
 * casa apenas com nome de uma palavra.
 */
export function nomesDeFornecedorParecidos(a?: string | null, b?: string | null): boolean {
  const ta = tokensDoNome(a);
  const tb = tokensDoNome(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (!palavrasParecidas(ta[0], tb[0])) return false;
  const [curto, longo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // Uma palavra só é pouco para afirmar que é a mesma empresa ("BRANDS" casaria "R.BRANDS" com "BRANDS GROUP").
  if (curto.length === 1 && longo.length > 1) return false;
  const achadas = curto.filter((t) => longo.some((o) => palavrasParecidas(t, o))).length;
  return achadas / curto.length >= 0.75;
}

export interface FornecedorDoContrato {
  cnpj?: string | null;
  nome?: string | null;
}

export interface FornecedoresDaAta {
  /** Documentos (CNPJ/CPF ou código genérico) dos fornecedores dos itens da ata. */
  cnpjs?: Array<string | null | undefined>;
  /** Razões sociais dos fornecedores dos itens da ata. */
  nomes?: Array<string | null | undefined>;
}

/** A ata tem informação de fornecedor? Sem ela não há como excluir nenhum contrato. */
export function ataTemFornecedorConhecido(ata: FornecedoresDaAta): boolean {
  return (ata.cnpjs || []).some((c) => onlyDigits(c)) || (ata.nomes || []).some((n) => tokensDoNome(n).length > 0);
}

/**
 * O contrato é de um dos fornecedores da ata? Com documento fiscal válido, vale só o documento. Sem ele
 * (fornecedor estrangeiro), vale o nome.
 */
export function contratoDoFornecedorDaAta(contrato: FornecedorDoContrato, ata: FornecedoresDaAta): boolean {
  if (documentoFiscalValido(contrato.cnpj)) {
    const doc = onlyDigits(contrato.cnpj);
    return (ata.cnpjs || []).some((c) => onlyDigits(c) === doc);
  }
  return (ata.nomes || []).some((n) => nomesDeFornecedorParecidos(contrato.nome, n));
}
