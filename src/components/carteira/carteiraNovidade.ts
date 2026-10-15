import { differenceInDays, parseDateBRT } from '../../services/temporalEngineService';
import type { ArpRecord, ContractDashboardRecord } from '../../types';

/** Quantos dias a ata, o contrato ou o item continua com a etiqueta "Nova"/"Novo". */
export const DIAS_NOVIDADE = 45;

/**
 * Começou há no máximo 45 dias, pela data da fonte (não pela data em que entrou no sistema, que é a da
 * carga inicial para quase tudo). Data no futuro (assinada, vigência ainda por começar) também conta.
 */
export function ehNovidade(data: string | null | undefined, hoje?: Date): boolean {
  const d = parseDateBRT(data);
  if (!d) return false;
  return differenceInDays(d, hoje) >= -DIAS_NOVIDADE;
}

/** Ata nova: assinatura ou, sem ela (atas vindas do banco), início da vigência. */
export function ataEhNova(arp: Pick<ArpRecord, 'dataAssinatura' | 'dataVigenciaInicial'>, hoje?: Date): boolean {
  return ehNovidade(arp.dataAssinatura || arp.dataVigenciaInicial, hoje);
}

/** Contrato novo: assinatura ou, sem ela, início da vigência. */
export function contratoEhNovo(c: Pick<ContractDashboardRecord, 'dataAssinatura' | 'dataVigenciaInicio'>, hoje?: Date): boolean {
  return ehNovidade(c.dataAssinatura || c.dataVigenciaInicio, hoje);
}
