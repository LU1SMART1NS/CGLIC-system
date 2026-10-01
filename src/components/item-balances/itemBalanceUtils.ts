import type { PncpContract } from '../../types';
import { formatPncpContractUrl } from '../../utils/pncpUtils';

export { formatCurrency, formatNumber, formatDateBR as formatDate } from '../../utils/format';

export function getProgressColorClass(percent: number): string {
  if (percent < 20) return 'fill-danger';
  if (percent < 50) return 'fill-warning';
  return 'fill-success';
}

export function isGerenciadoraUasg(uasg?: string | number, gerenciadoraUasg?: string | number): boolean {
  const clean = String(uasg || '').replace(/\D/g, '');
  const cleanGer = gerenciadoraUasg ? String(gerenciadoraUasg).replace(/\D/g, '') : '';
  return clean === '200331' || clean === '200330' || (cleanGer !== '' && clean === cleanGer);
}

export function isAllowedEmpenhoUasg(uasg?: string | number): boolean {
  const clean = String(uasg || '').replace(/\D/g, '');
  return clean === '200331' || clean === '200330';
}

export function getContractPncpUrl(contrato: PncpContract): string {
  return formatPncpContractUrl(
    contrato.numeroControlePncp,
    contrato.linkVisualizacao
  );
}
