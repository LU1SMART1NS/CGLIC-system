/**
 * Unidades gestoras do CGLIC e os dados de cadastro que dependem delas.
 *
 * Fonte única para UASG, CNPJ e código de órgão. Código de tela ou de hook não
 * deve escrever esses valores no corpo: se a UASG não vier da chave da Ata/Contrato
 * ou de um parâmetro, a consulta fica desabilitada em vez de assumir a SENASP.
 */

/** UASGs que o CGLIC gerencia (Gestão de Instrumentos consolida as duas). */
export const UASGS_CGLIC: readonly string[] = ['200330', '200331'];

/**
 * UASG usada apenas quando um link antigo chega sem UASG na chave (ex.: "/atas/detalhe/00059%2F2025").
 * Não usar como valor padrão de parâmetro de hook ou de serviço.
 */
export const UASG_LINK_LEGADO = '200331';

/** Código do órgão (MJSP) das UASGs do CGLIC no Compras.gov.br. */
export const CODIGO_ORGAO_CGLIC = '30911';

/** CNPJ da SENASP/MJSP, órgão gerenciador das atas do CGLIC. */
export const CNPJ_SENASP = '00394494000136';

/** CNPJ do órgão por UASG, para consultas ao PNCP. */
export const CNPJ_POR_UASG: Readonly<Record<string, string>> = {
  '200330': CNPJ_SENASP,
  '200331': CNPJ_SENASP
};

const onlyDigits = (v?: string | number | null) => String(v ?? '').replace(/\D/g, '');

/** A UASG é uma das unidades gerenciadas pelo CGLIC? */
export function isUasgCglic(uasg?: string | number | null): boolean {
  return UASGS_CGLIC.includes(onlyDigits(uasg));
}

/** CNPJ do órgão da UASG; vazio se a UASG não estiver cadastrada. */
export function cnpjDaUasg(uasg?: string | number | null): string {
  return CNPJ_POR_UASG[onlyDigits(uasg)] || '';
}

/** Código do órgão no Compras.gov.br; vazio fora das UASGs do CGLIC. */
export function codigoOrgaoDaUasg(uasg?: string | number | null): string {
  return isUasgCglic(uasg) ? CODIGO_ORGAO_CGLIC : '';
}
