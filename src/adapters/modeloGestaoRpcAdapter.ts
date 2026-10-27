import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import type { AcaoGestor, PrazoAncora } from '../types';
import { mapPostgresErrorToAppError } from './rpcErrorAdapter';

/**
 * RPCs do modelo de gestão da CCGA (migrations 210 e 215), iguais para Atas e Contratos:
 * as duas marcas do orientar, o ajuste da data, os dados do módulo e a regra do modelo.
 */
export type TipoInstrumento = 'contrato' | 'ata';

async function chamar<T = { success: boolean }>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured || !supabase) {
    throw mapPostgresErrorToAppError(new Error('SUPABASE_NOT_CONFIGURED: Supabase não configurado.'));
  }
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw mapPostgresErrorToAppError(error);
    if (!data || typeof data !== 'object') {
      throw mapPostgresErrorToAppError(new Error(`INVALID_PAYLOAD: Resposta inválida da RPC ${fn}`));
    }
    return data as T;
  } catch (err: any) {
    if (err && err.code && typeof err.code === 'string') throw err;
    throw mapPostgresErrorToAppError(err);
  }
}

export interface MarcaTarefaInput {
  taskId: string;
  /** Número SEI do pedido ou da resposta (documento ou processo); opcional. */
  sei?: string | null;
  /** AAAA-MM-DD; vazio = hoje. */
  data?: string | null;
}

/** Orientar, 1ª marca: pedido enviado (a tarefa passa a "em andamento" e conta a resposta). */
export function marcarPedidoTarefaRpc(tipo: TipoInstrumento, input: MarcaTarefaInput) {
  return chamar(`marcar_pedido_tarefa_${tipo}`, {
    p_task_id: input.taskId.trim(),
    p_sei: input.sei?.trim() || null,
    p_data: input.data || null
  });
}

/** Orientar, 2ª marca: resposta recebida (conclui a tarefa e move as seguintes). */
export function registrarRespostaTarefaRpc(tipo: TipoInstrumento, input: MarcaTarefaInput) {
  return chamar(`registrar_resposta_tarefa_${tipo}`, {
    p_task_id: input.taskId.trim(),
    p_sei: input.sei?.trim() || null,
    p_data: input.data || null
  });
}

/** Data ajustada pelo gestor; `prazo` null volta à regra do modelo. */
export function ajustarPrazoTarefaRpc(tipo: TipoInstrumento, input: { taskId: string; prazo: string | null }) {
  return chamar(`ajustar_prazo_tarefa_${tipo}`, { p_task_id: input.taskId.trim(), p_prazo: input.prazo || null });
}

export interface AtualizarModuloInput {
  moduloId: string;
  /** Data de partida das tarefas "após a partida" (AAAA-MM-DD). */
  ancora?: string | null;
  /** Processo SEI do módulo (NNNNN.NNNNNN/AAAA-DD). */
  processoSei?: string | null;
  variante?: string | null;
}

export function atualizarModuloRpc(tipo: TipoInstrumento, input: AtualizarModuloInput) {
  return chamar(`atualizar_modulo_${tipo}`, {
    p_modulo_id: input.moduloId.trim(),
    p_ancora: input.ancora || null,
    p_processo_sei: input.processoSei?.trim() || null,
    p_variante: input.variante?.trim() || null
  });
}

export interface RegraTarefaModeloInput {
  id: string;
  acao: AcaoGestor | null;
  comQuem?: string | null;
  lista?: string[] | null;
  nota?: string | null;
  modeloSei?: string | null;
  prazoTexto?: string | null;
  prazoAncora?: PrazoAncora | null;
  prazoDias?: number | null;
  prazoUteis?: boolean | null;
  respostaTexto?: string | null;
  respostaDias?: number | null;
  respostaUteis?: boolean | null;
  esforcoMin?: number | null;
  doPregao?: boolean;
}

/** Coordenador: grava a ação, a lista e a regra de prazo de uma tarefa do modelo (migration 215). */
export function salvarRegraTarefaModeloRpc(tipo: TipoInstrumento, input: RegraTarefaModeloInput) {
  return chamar(`salvar_regra_tarefa_modelo_${tipo}`, {
    p_id: input.id.trim(),
    p_acao: input.acao,
    p_com_quem: input.comQuem ?? null,
    p_lista: input.lista && input.lista.length > 0 ? input.lista : null,
    p_nota: input.nota ?? null,
    p_modelo_sei: input.modeloSei ?? null,
    p_prazo_texto: input.prazoTexto ?? null,
    p_prazo_ancora: input.prazoAncora ?? null,
    p_prazo_dias: input.prazoDias ?? null,
    p_prazo_uteis: input.prazoUteis ?? null,
    p_resposta_texto: input.respostaTexto ?? null,
    p_resposta_dias: input.respostaDias ?? null,
    p_resposta_uteis: input.respostaUteis ?? null,
    p_esforco_min: input.esforcoMin ?? null,
    p_do_pregao: input.doPregao ?? false
  });
}

export interface DetalhesModeloInput {
  id: string;
  quando?: string | null;
  base?: string | null;
  processoTipo?: string | null;
  variantes?: string[] | null;
}

/** Coordenador: quando o módulo entra, base normativa, processo SEI e variantes (migration 215). */
export function salvarDetalhesModeloRpc(tipo: TipoInstrumento, input: DetalhesModeloInput) {
  return chamar(`salvar_detalhes_modelo_${tipo}`, {
    p_id: input.id.trim(),
    p_quando: input.quando ?? null,
    p_base: input.base ?? null,
    p_processo_tipo: input.processoTipo ?? null,
    p_variantes: input.variantes && input.variantes.length > 0 ? input.variantes : null
  });
}
