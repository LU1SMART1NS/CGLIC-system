/** Valor em reais compacto para legendas de cards (ex.: "R$ 1,23 bi"). */
export function formatCurrencyCompact(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 2 });
}
