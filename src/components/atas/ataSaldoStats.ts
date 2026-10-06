import { classifyArpItemSaldo } from '../../services/balanceService';
import { quantidadeBaseSenasp } from '../../utils/quantitativoSenasp';

/** Resumo do consumo de saldo dos itens de uma Ata (a partir de arp_item_saldos). */
export interface AtaSaldoStats {
  /** Maior percentual de consumo entre os itens (um item a 91% já é alerta, independente da média). */
  maxPct: number | null;
  criticos: number;
  atencao: number;
  /** Percentual consumido por número de item (normalizado, sem zeros à esquerda). */
  pctByItem: Record<string, number>;
}

export function normalizeItemNumber(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value ?? '');
}

/** Agrupa os saldos por item por número de ata e calcula o resumo de consumo de cada uma. */
export function buildAtaSaldoStats(saldos: Array<any> = []): Record<string, AtaSaldoStats> {
  const result: Record<string, AtaSaldoStats> = {};

  for (const saldo of saldos) {
    const numeroAta: string | undefined = saldo.numero_ata || saldo.numeroAta;
    if (!numeroAta) continue;

    const qtdHomologada = quantidadeBaseSenasp(saldo);
    const qtdConsumida = Number(saldo.quantidade_consumida || 0);
    const rawPct =
      typeof saldo.percentual_consumido === 'number'
        ? saldo.percentual_consumido
        : qtdHomologada > 0
          ? (qtdConsumida / qtdHomologada) * 100
          : 0;
    const { percentualConsumido, isCritico, isProximoLimite } = classifyArpItemSaldo(rawPct);

    const stats = (result[numeroAta] ||= { maxPct: null, criticos: 0, atencao: 0, pctByItem: {} });
    stats.maxPct = stats.maxPct === null ? percentualConsumido : Math.max(stats.maxPct, percentualConsumido);
    if (isCritico) stats.criticos++;
    else if (isProximoLimite) stats.atencao++;
    stats.pctByItem[normalizeItemNumber(saldo.numero_item ?? saldo.numeroItem)] = percentualConsumido;
  }

  return result;
}

export function saldoBarColor(pct: number | null): string {
  if (pct === null) return '#cbd5e1';
  const { isCritico, isProximoLimite } = classifyArpItemSaldo(pct);
  if (isCritico) return 'var(--color-danger)';
  if (isProximoLimite) return 'var(--color-warning)';
  return 'var(--color-success-solid)';
}
