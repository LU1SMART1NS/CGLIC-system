import type { PncpContract } from '../../types';
import { formatPncpContractUrl } from '../../utils/pncpUtils';

export function formatCurrency(val: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

export function formatNumber(val: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(val || 0);
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const cleanDate = dateStr.split('T')[0];
  const parts = cleanDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

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
