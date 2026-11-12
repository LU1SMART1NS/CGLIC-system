import type { StatusBadgeVariant } from '../../../design-system/components/StatusBadge';
import type { SituacaoDaSobra } from '../../../utils/emendasSobra';

/** Cor da etiqueta da situação da sobra (migration 204), igual em Parlamentares e no Parlamentar 360. */
export const VARIANTE_SOBRA: Record<SituacaoDaSobra, StatusBadgeVariant> = { sobra: 'warning', conferir: 'info', informar: 'info', acima: 'danger', executada: 'success', semValor: 'neutral', naoEmpenhado: 'neutral' };
