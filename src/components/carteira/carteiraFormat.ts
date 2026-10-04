import { formatCurrency } from '../../utils/format';

export { formatCurrency, formatCurrencyCompact } from '../../utils/format';

/** Moeda, ou "—" quando o valor não veio (ex.: valor unitário de item da ata ainda não sincronizado). */
export function formatCurrencyOrDash(val?: number | null): string {
  return typeof val === 'number' && !isNaN(val) ? formatCurrency(val) : '—';
}
