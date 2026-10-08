import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * Avisos marcados como resolvidos (✓) na Visão Geral e nas Ações da ata e do contrato
 * (tabela avisos_resolvidos, migration 101). Os avisos são calculados na tela; a chave
 * embute o que faz o aviso voltar: o nível do saldo, o ciclo do reajuste ou a vigência
 * do lembrete. Tarefa se resolve concluindo-a no plano; pagamento, registrando a etapa.
 */
export type AvisoResolvivelTipo = 'SALDO' | 'REAJUSTE' | 'LEMBRETE';

export interface AvisoResolvido {
  chave: string;
  tipo: AvisoResolvivelTipo;
  justificativa: string;
  resolvidoPorNome?: string;
  resolvidoEm: string;
}

/** Justificativa: mínimo exigido também no banco (resolver_aviso). */
export const JUSTIFICATIVA_MIN = 10;
export const JUSTIFICATIVA_MAX = 500;

/** Número do item sem zeros à esquerda: a Ata 360 e a Visão Geral leem o item de formas diferentes. */
function numeroItemCanonico(numeroItem: string | number): string {
  const s = String(numeroItem ?? '').trim();
  return /^\d+$/.test(s) ? String(Number(s)) : s;
}

/** Saldo do item: o nível entra na chave, então o aviso volta se o saldo piorar. */
export function chaveAvisoSaldo(numeroAta: string, uasg: string, numeroItem: string | number, nivel: string): string {
  return `SALDO::${numeroAta}-${uasg}::${numeroItemCanonico(numeroItem)}::${nivel}`;
}

/** Reajuste: vale para o ciclo; o próximo ciclo avisa de novo. */
export function chaveAvisoReajuste(contractKey: string, ciclo: string | number): string {
  return `REAJUSTE::${contractKey}::${ciclo}`;
}

/** Lembrete de vigência: o id do lembrete já embute a UASG e a data de fim (VIG_<fim>). */
export function chaveAvisoLembrete(lembreteId: string): string {
  return `LEMBRETE::${lembreteId}`;
}

export function tipoDaChave(chave: string): AvisoResolvivelTipo {
  return chave.split('::')[0] as AvisoResolvivelTipo;
}

export async function fetchAvisosResolvidos(): Promise<AvisoResolvido[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('avisos_resolvidos')
      .select('chave, tipo, justificativa, resolvido_por_nome, resolvido_em');
    if (error) throw error;
    return (data || []).map((row: { chave: string; tipo: AvisoResolvivelTipo; justificativa: string; resolvido_por_nome: string | null; resolvido_em: string }) => ({
      chave: row.chave,
      tipo: row.tipo,
      justificativa: row.justificativa,
      resolvidoPorNome: row.resolvido_por_nome || undefined,
      resolvidoEm: row.resolvido_em
    }));
  } catch (err) {
    console.warn('[avisosResolvidosService] Falha ao consultar avisos resolvidos:', err);
    return [];
  }
}
