/** "2026-10-07" → "07/10/2026"; vazio → "—". */
export function dataBR(v?: string | null): string {
  if (!v) return '—';
  const [a, m, d] = v.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : v;
}

/** Dias corridos de uma data (AAAA-MM-DD) até hoje. */
export function diasDesde(v: string, hoje: Date = new Date()): number {
  const [a, m, d] = v.slice(0, 10).split('-').map(Number);
  const inicio = Date.UTC(a, m - 1, d);
  const fim = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.max(0, Math.round((fim - inicio) / 86_400_000));
}

/** Busca sem acento e sem caixa. */
export function normalizarBusca(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-11" → "novembro/2026". */
export function rotuloDoMes(mes: string): string {
  return `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
}
