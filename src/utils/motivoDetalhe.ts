import { REAJUSTE_RULES } from '../config/alertRules';
import type { ReajusteRadarPriorityLevel } from '../types/contractReajusteRadar';
import type { DashboardAttentionItem } from '../types/managementDashboard';

/**
 * Motivo do filtro "Motivo" do Início. Nas abas de uma categoria só (Reajustes, Lembretes) a categoria não
 * separa nada; o motivo detalhado vem de campos que o painel já calcula: a regra do lembrete e a situação da
 * data-base do reajuste. Valor no endereço: "CATEGORIA" ou "CATEGORIA.chave".
 */
export type MotivoDetalhe = NonNullable<DashboardAttentionItem['motivoDetalhe']>;

/** "Início da Análise de Prorrogação (180d)" → "inicio-da-analise-de-prorrogacao" (sem o prazo entre parênteses). */
function slug(texto: string): string {
  return texto
    .replace(/\s*\([^)]*\)\s*$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Lembrete: o motivo é a regra que o gerou (nome da regra, como aparece no título). */
export function motivoDoLembrete(regraNome: string | undefined | null): MotivoDetalhe | undefined {
  const nome = (regraNome || '').trim();
  if (!nome) return undefined;
  return { chave: slug(nome) || 'regra', label: nome };
}

/** Rótulo lido na hora: os prazos de REAJUSTE_RULES podem ser ajustados nas regras de alerta. */
function rotuloReajuste(nivel: ReajusteRadarPriorityLevel): string {
  switch (nivel) {
    case 'VENCIDA': return 'Data-base vencida';
    case 'HOJE': return 'Data-base hoje';
    case 'URGENTE': return `Data-base em até ${REAJUSTE_RULES.urgenteAteDias} dias`;
    case 'PROXIMA': return `Data-base em mais de ${REAJUSTE_RULES.urgenteAteDias} dias`;
  }
}

const NIVEIS_REAJUSTE: readonly ReajusteRadarPriorityLevel[] = ['VENCIDA', 'HOJE', 'URGENTE', 'PROXIMA'];

/** Reajuste: o motivo é a situação da data-base (mesmos níveis do radar). */
export function motivoDoReajuste(nivel: ReajusteRadarPriorityLevel | undefined | null): MotivoDetalhe | undefined {
  if (!nivel || !NIVEIS_REAJUSTE.includes(nivel)) return undefined;
  return { chave: nivel, label: rotuloReajuste(nivel) };
}

/** Valor do motivo de um aviso no filtro (e no endereço). */
export function chaveDoMotivo(item: Pick<DashboardAttentionItem, 'category' | 'motivoDetalhe'>): string {
  return item.motivoDetalhe ? `${item.category}.${item.motivoDetalhe.chave}` : item.category;
}
