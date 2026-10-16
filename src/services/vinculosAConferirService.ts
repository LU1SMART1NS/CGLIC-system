/**
 * Vínculos automáticos entre contrato e item da ata que a fonte desmentiu mas que têm trabalho do gestor
 * (quantidade ajustada ou divisão entre unidades). O cron não os apaga: eles ficam marcados em
 * vinculo_automatico_a_conferir (migration 112) e o coordenador decide manter ou retirar.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';

export interface VinculoAConferir {
  itemKey: string;
  contractKey: string;
  /** Número da ata como nas telas ("00043/2026"). */
  numeroAta: string;
  uasg: string;
  numeroItem: string;
  motivo: string;
  detectadoEm: string;
  gestorAta?: string;
  gestorContrato?: string;
  quantidadeFonte?: number;
  quantidadeAjustada?: number;
  ajusteJustificativa?: string;
  ajustadoPorNome?: string;
  divididoPorNome?: string;
  quantidadeDividida: number;
}

interface LinhaVinculoAConferir {
  item_key: string;
  contract_key: string;
  motivo: string;
  detectado_em: string;
  gestor_ata: string | null;
  gestor_contrato: string | null;
  quantidade_fonte: number | string | null;
  quantidade_ajustada: number | string | null;
  ajuste_justificativa: string | null;
  ajustado_por_nome: string | null;
  dividido_por_nome: string | null;
  quantidade_dividida: number | string | null;
}

const COLUNAS =
  'item_key, contract_key, motivo, detectado_em, gestor_ata, gestor_contrato, quantidade_fonte, quantidade_ajustada, ajuste_justificativa, ajustado_por_nome, dividido_por_nome, quantidade_dividida';

const MOTIVOS: Record<string, string> = {
  ITEM_SAIU_DO_CONTRATO: 'o item deixou de constar nos itens do contrato na fonte oficial',
  OUTRO_FORNECEDOR: 'o fornecedor do contrato não é o da ata',
  VALOR_FORA_DO_LIMITE: 'preço ou quantidade do contrato passou do limite de 25% sobre a ata',
  ITEM_FORA_DA_ATA: 'o contrato tem item que não está na ata',
  ITEM_SEM_NUMERO: 'o contrato tem item sem número na fonte',
  NAO_CONFIRMA: 'os dados da fonte já não confirmam o vínculo'
};

/** Motivo em linguagem simples. Motivo novo que a tela ainda não conhece cai numa frase genérica. */
export function textoDoMotivoVinculo(motivo: string): string {
  return MOTIVOS[motivo] ?? 'os dados da fonte já não confirmam o vínculo';
}

function numeroOuUndefined(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** "00043/2026-200331-00003" → ata "00043/2026", UASG "200331", item "00003". */
export function partesDoItemKey(itemKey: string): { numeroAta: string; uasg: string; numeroItem: string } {
  const m = /^(\d{5}\/\d{4})-(\d{6})-(\d+)$/.exec(itemKey.trim());
  return m ? { numeroAta: m[1], uasg: m[2], numeroItem: m[3] } : { numeroAta: '', uasg: '', numeroItem: '' };
}

/** "200331-00297-2026" → "00297/2026". */
export function numeroDoContrato(contractKey: string): string {
  const m = /^\d{6}-(.+)-(\d{4})$/.exec((contractKey || '').trim());
  return m ? `${m[1]}/${m[2]}` : contractKey;
}

/** O que o gestor fez neste vínculo e se perderia com a retirada, em uma frase. */
export function trabalhoDoGestor(v: VinculoAConferir): string {
  const partes: string[] = [];
  if (v.quantidadeAjustada !== undefined) {
    partes.push(`quantidade ajustada para ${v.quantidadeAjustada.toLocaleString('pt-BR')}${v.ajustadoPorNome ? ` por ${v.ajustadoPorNome}` : ''}`);
  }
  if (v.quantidadeDividida > 0) {
    partes.push(`${v.quantidadeDividida.toLocaleString('pt-BR')} divididos entre unidades${v.divididoPorNome ? ` por ${v.divididoPorNome}` : ''}`);
  }
  return partes.join(' e ');
}

export function vinculoDaLinha(r: LinhaVinculoAConferir): VinculoAConferir {
  const { numeroAta, uasg, numeroItem } = partesDoItemKey(r.item_key);
  return {
    itemKey: r.item_key,
    contractKey: r.contract_key,
    numeroAta,
    uasg,
    numeroItem,
    motivo: r.motivo,
    detectadoEm: r.detectado_em,
    gestorAta: r.gestor_ata ?? undefined,
    gestorContrato: r.gestor_contrato ?? undefined,
    quantidadeFonte: numeroOuUndefined(r.quantidade_fonte),
    quantidadeAjustada: numeroOuUndefined(r.quantidade_ajustada),
    ajusteJustificativa: r.ajuste_justificativa ?? undefined,
    ajustadoPorNome: r.ajustado_por_nome ?? undefined,
    divididoPorNome: r.dividido_por_nome ?? undefined,
    quantidadeDividida: numeroOuUndefined(r.quantidade_dividida) ?? 0
  };
}

export async function fetchVinculosAConferir(): Promise<VinculoAConferir[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from('v_vinculos_a_conferir').select(COLUNAS);
  if (error) throw error;
  return ((data || []) as unknown as LinhaVinculoAConferir[]).map(vinculoDaLinha);
}
