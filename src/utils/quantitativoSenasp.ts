import { isUasgCglic } from '../config/unidadesGestoras';

/**
 * Quantitativo SENASP de um item: o que a ata registrou para as UASGs que o CGLIC gerencia (200330 e 200331).
 * Na ata da CGLIC conta também a unidade gerenciadora (é a própria SENASP). Na ata de outro órgão em que a
 * SENASP participa (migration 106), a gerenciadora é o outro órgão e NÃO conta. É a base de toda régua e saldo
 * do sistema; o total da ata (todos os órgãos participantes) é só referência. Mesma regra de
 * public.senasp_das_unidades().
 */
const digits = (v?: string | number | null) => String(v ?? '').replace(/\D/g, '');

export function isUnidadeSenasp(
  unidade: { codigoUnidade?: string | number | null; tipoUnidade?: string | null },
  ugUasg?: string | number | null
): boolean {
  const codigo = digits(unidade.codigoUnidade);
  const ug = digits(ugUasg);
  if (isUasgCglic(codigo)) return true;
  const ataDaCglic = ug === '' || isUasgCglic(ug);
  return ataDaCglic && (unidade.tipoUnidade === 'GERENCIADORA' || (ug !== '' && codigo === ug));
}

/** Soma o registrado das unidades SENASP; sem nenhuma unidade SENASP na lista, usa `fallback` (ex.: homologado do item). */
export function quantitativoSenasp(
  unidades: Array<{ codigoUnidade?: string | number | null; tipoUnidade?: string | null; quantidadeRegistrada?: number | null }>,
  ugUasg?: string | number | null,
  fallback = 0
): number {
  const proprias = unidades.filter((u) => isUnidadeSenasp(u, ugUasg));
  if (proprias.length === 0) return fallback;
  return proprias.reduce((s, u) => s + (Number(u.quantidadeRegistrada) || 0), 0);
}

/**
 * Base do saldo de uma linha da view v_arp_item_saldo_detalhado: o quantitativo SENASP gravado ou, enquanto
 * o item não foi sincronizado, o homologado da ata.
 */
export function quantidadeBaseSenasp(row: {
  quantidade_base_senasp?: number | null;
  quantidade_senasp?: number | null;
  quantidade_homologada?: number | null;
}): number {
  return Number(row.quantidade_base_senasp ?? row.quantidade_senasp ?? row.quantidade_homologada ?? 0) || 0;
}
