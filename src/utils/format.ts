/**
 * Formatadores pt-BR compartilhados (moeda, número, percentual, data, CNPJ/CPF).
 * Fonte única: não recriar `Intl.NumberFormat('pt-BR', ...)` nos componentes.
 */
import { formatDateBR } from '../services/temporalEngineService';

export { formatDateBR };

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlInteiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brlCompacto = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 2
});
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** R$ 1.528,80 */
export function formatCurrency(val?: number | null): string {
  return brl.format(val || 0);
}

/** R$ 7.434.554 (sem centavos) */
export function formatCurrencyRounded(val?: number | null): string {
  return brlInteiro.format(val || 0);
}

/** R$ 1,23 bi — para legendas de cards. */
export function formatCurrencyCompact(val?: number | null): string {
  return brlCompacto.format(val || 0);
}

/** 4.863 (até 2 casas decimais) */
export function formatNumber(val?: number | null): string {
  return numero.format(val || 0);
}

/** 42,5% — recebe o valor já em pontos percentuais (42.5). */
export function formatPercent(val?: number | null, fractionDigits = 1): string {
  return `${(val || 0).toLocaleString('pt-BR', { maximumFractionDigits: fractionDigits })}%`;
}

/** CNPJ (14 dígitos) ou CPF (11); qualquer outro valor volta como veio. */
export function formatCnpj(doc?: string | null): string {
  const digits = (doc || '').replace(/\D/g, '');
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc || '';
}

/** Data e hora no horário de Brasília: "07/10/2026 às 14:32". Texto inválido volta como veio. */
export function formatDataHoraBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const opts = { timeZone: 'America/Sao_Paulo' } as const;
  const data = d.toLocaleDateString('pt-BR', opts);
  const hora = d.toLocaleTimeString('pt-BR', { ...opts, hour: '2-digit', minute: '2-digit' });
  return `${data} às ${hora}`;
}
