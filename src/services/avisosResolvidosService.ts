import { supabase, isSupabaseConfigured } from './supabaseClient';
import { lerTodasAsPaginas } from './lerTodasAsPaginas';

/**
 * Avisos marcados como resolvidos (✓) na Visão Geral e nas Ações da ata e do contrato
 * (tabela avisos_resolvidos, migration 101). Os avisos são calculados na tela; a chave
 * embute o que faz o aviso voltar: o nível do saldo, o ciclo do reajuste ou a vigência
 * do lembrete. Tarefa se resolve concluindo-a no plano; pagamento, registrando a etapa.
 */
export type AvisoResolvivelTipo = 'SALDO' | 'REAJUSTE' | 'LEMBRETE' | 'FONTE';

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

/**
 * Contratado sem unidade interna ou divisão a conferir (migration 103). Usa o tipo SALDO; o motivo e a quantidade
 * entram na chave, então o aviso volta se mudar (mais contratado sem unidade, outra divisão a conferir).
 */
export function chaveAvisoUnidade(numeroAta: string, uasg: string, numeroItem: string | number, motivo: 'SEM_UNIDADE' | 'CONFERIR', quantidade: number): string {
  return `SALDO::${numeroAta}-${uasg}::${numeroItemCanonico(numeroItem)}::UNIDADE-${motivo}-${quantidade}`;
}

/**
 * Quantitativos do item a conferir (migration 109). Usa o tipo SALDO; os motivos e os números entram na chave, então o
 * aviso volta se a situação mudar (outro órgão fora da ata, cota própria diferente).
 */
export function chaveAvisoQuantitativos(numeroAta: string, uasg: string, numeroItem: string | number, assinatura: string): string {
  return `SALDO::${numeroAta}-${uasg}::${numeroItemCanonico(numeroItem)}::QUANTITATIVOS-${assinatura}`;
}

/**
 * Ata da CGLIC com alocação feita sem a qtd. da ata assinada (migration 116). Usa o tipo SALDO, por ata; o número de
 * itens nessa situação entra na chave, então o aviso volta se mais itens forem alocados antes de informar.
 */
export function chaveAvisoAtaAssinada(numeroAta: string, uasg: string, itensAlocados: number): string {
  return `SALDO::${numeroAta}-${uasg}::ATA-ASSINADA-${itensAlocados}`;
}

/**
 * Vínculo automático desmentido pela fonte que tem trabalho do gestor (migration 112). Usa o tipo SALDO; o contrato, o
 * motivo e o momento em que a marca foi criada entram na chave, então o aviso volta se mudar o motivo ou se a marca
 * for refeita depois de a fonte confirmar o par.
 */
export function chaveAvisoVinculo(numeroAta: string, uasg: string, numeroItem: string | number, contractKey: string, motivo: string, detectadoEm: string): string {
  const epoch = Math.floor(new Date(detectadoEm).getTime() / 1000) || 0;
  return `SALDO::${numeroAta}-${uasg}::${numeroItemCanonico(numeroItem)}::VINCULO-${contractKey}-${motivo}-${epoch}`;
}

/**
 * Nota ou fatura que a fonte deixou de listar e que tem trabalho da equipe (migration 113). O momento em que a marca
 * foi criada entra na chave: se a fonte voltar a listar e depois tirar de novo, o aviso volta.
 */
export function chaveAvisoFonte(contractKey: string, tipo: 'NOTA' | 'FATURA', chave: string, detectadoEm: string): string {
  const epoch = Math.floor(new Date(detectadoEm).getTime() / 1000) || 0;
  return `FONTE::${contractKey}::${tipo}-${chave}-${epoch}`;
}

/**
 * Empenhado acima do contratado num item do contrato (migration 133). Usa o tipo FONTE (notas do contrato); a
 * quantidade empenhada entra na chave, então o aviso volta se o excesso mudar.
 */
export function chaveAvisoEmpenhoAcima(contractKey: string, numeroItem: number, quantidadeEmpenhada: number): string {
  return `FONTE::${contractKey}::ACIMA-${numeroItem}-${Math.round(quantidadeEmpenhada * 100) / 100}`;
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
    // Cresce sem parar (cada ✓ Resolvido é uma linha): todas as páginas, em ordem fixa.
    const db = supabase;
    const data = await lerTodasAsPaginas<any>((de, ate) =>
      db.from('avisos_resolvidos').select('chave, tipo, justificativa, resolvido_por_nome, resolvido_em').order('chave').range(de, ate)
    );
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
