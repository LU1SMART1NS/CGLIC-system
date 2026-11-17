import { differenceInBusinessDays, formatDateBR, parseDateBRT } from '../services/temporalEngineService';

/** A partir de quantos dias úteis sem leitura nova o saldo do Tesouro conta como atrasado (decisão de 17/11/2026). */
export const DIAS_UTEIS_TESOURO_ATRASADO = 3;

/** Dias úteis entre a última atualização do Tesouro (`atualizado_tesouro`) e hoje; null sem data. */
export function diasUteisDesdeTesouro(atualizadoEm: string | null | undefined, hoje: Date = new Date()): number | null {
  if (!atualizadoEm) return null;
  const data = parseDateBRT(atualizadoEm.slice(0, 10));
  if (!data) return null;
  return Math.max(0, differenceInBusinessDays(hoje, data));
}

/**
 * Aviso para quando o Tesouro não é lido há mais de DIAS_UTEIS_TESOURO_ATRASADO dias úteis. Liquidado e pago das notas
 * continuam os da última leitura boa (migration 324); o pagamento mais novo aparece na OB da fatura.
 */
export function avisoTesouroAtrasado(atualizadoEm: string | null | undefined, hoje: Date = new Date()): string | null {
  const dias = diasUteisDesdeTesouro(atualizadoEm, hoje);
  if (dias === null || dias <= DIAS_UTEIS_TESOURO_ATRASADO) return null;
  return `O Tesouro não é lido há ${dias} dias úteis: liquidado e pago são os de ${formatDateBR(atualizadoEm!.slice(0, 10))}. Pagamentos mais novos aparecem nas faturas (OB).`;
}
