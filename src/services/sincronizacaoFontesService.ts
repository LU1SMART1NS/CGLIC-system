/**
 * Controle das sincronizações com as fontes oficiais (tabela sincronizacao_fontes, migration 72).
 *
 * Cada recurso ('contratos', 'atas') tem, por UASG, uma trava, a última tentativa e o último sucesso.
 * A trava garante que só um navegador sincroniza por vez, e só quando os dados passaram da validade.
 * Forçar (botão "Atualizar") é só para o coordenador: a função do banco recusa para os outros perfis.
 *
 * Provisório: a sincronização roda no navegador de quem tem perfil de gravação (gestor/coordenador).
 * Ela vai para uma Edge Function agendada (PLANO_PERSISTENCIA_CONTRATOS_E_CACHE.md).
 */

import { supabase } from './supabaseClient';

export type RecursoSincronizado = 'contratos' | 'atas' | 'saldos_itens' | 'itens_contratos' | 'empenhos' | 'faturas' | 'ordens_bancarias';

/**
 * UASG usada nos recursos que valem para todas as carteiras (ex.: 'saldos_itens', que lê os contratos
 * vinculados de todas as atas). A tabela exige 6 dígitos; "000000" não é uma UASG real.
 */
export const UASG_TODAS = '000000';
export type StatusConclusao = 'SUCESSO' | 'PARCIAL' | 'ERRO';

/** Validade dos dados no banco: passado isso, a próxima abertura de quem pode gravar sincroniza. */
export const VALIDADE_PADRAO = '6 hours';

export type ResultadoSincronizacao =
  | { status: 'NAO_RESERVADO' }
  | { status: 'SUCESSO' | 'PARCIAL'; total: number; fontesComFalha: string[]; mensagem?: string }
  | { status: 'ERRO'; erro: string };

export type ResultadoConcluido = Exclude<ResultadoSincronizacao, { status: 'NAO_RESERVADO' }>;

export interface SincronizacaoFonteStatus {
  recurso: string;
  uasg: string;
  emAndamentoDesde: string | null;
  ultimaTentativaEm: string | null;
  ultimoSucessoEm: string | null;
  ultimoStatus: StatusConclusao | null;
  fontesComFalha: string[];
  totalRegistros: number | null;
  mensagem: string | null;
}

function linhaParaStatus(row: any): SincronizacaoFonteStatus {
  return {
    recurso: row.recurso,
    uasg: row.uasg,
    emAndamentoDesde: row.em_andamento_desde ?? null,
    ultimaTentativaEm: row.ultima_tentativa_em ?? null,
    ultimoSucessoEm: row.ultimo_sucesso_em ?? null,
    ultimoStatus: row.ultimo_status ?? null,
    fontesComFalha: row.fontes_com_falha ?? [],
    totalRegistros: row.total_registros ?? null,
    mensagem: row.mensagem ?? null
  };
}

/** Situação da última sincronização de cada UASG para o recurso. */
export async function fetchSincronizacaoStatus(recurso: RecursoSincronizado): Promise<SincronizacaoFonteStatus[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('sincronizacao_fontes').select('*').eq('recurso', recurso);
  if (error) throw error;
  return (data ?? []).map(linhaParaStatus);
}

export function mensagemDeErro(err: unknown): string {
  const texto = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  // Mensagem crua do navegador para falha de rede: troca por uma que diga o que houve.
  if (/^(failed to fetch|networkerror.*|load failed)$/i.test(texto.trim())) {
    return 'Sem conexão com a fonte oficial (falha de rede ou servidor local fora do ar).';
  }
  return texto;
}

// ------------------------------------------------------------------------------
// O que está sincronizando neste navegador agora (para os cabeçalhos mostrarem "Atualizando")
// ------------------------------------------------------------------------------

const emAndamento = new Map<RecursoSincronizado, Set<string>>();
const instantaneos = new Map<RecursoSincronizado, readonly string[]>();
const ouvintes = new Set<() => void>();
const VAZIO: readonly string[] = [];

function marcar(recurso: RecursoSincronizado, uasg: string, ativo: boolean) {
  const uasgs = emAndamento.get(recurso) ?? new Set<string>();
  if (ativo) uasgs.add(uasg);
  else uasgs.delete(uasg);
  emAndamento.set(recurso, uasgs);
  instantaneos.set(recurso, Array.from(uasgs).sort());
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function assinarSincronizacaoLocal(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** UASGs do recurso sincronizando neste navegador. Mesmo array enquanto nada muda (useSyncExternalStore). */
export function uasgsSincronizandoAgoraDe(recurso: RecursoSincronizado): readonly string[] {
  return instantaneos.get(recurso) ?? VAZIO;
}

// ------------------------------------------------------------------------------
// Execução com a trava
// ------------------------------------------------------------------------------

/**
 * Reserva a sincronização do recurso na UASG, executa a tarefa e registra o resultado.
 * Devolve NAO_RESERVADO, sem executar nada, quando outra pessoa já está sincronizando ou os dados
 * ainda estão na validade (sem forçar). A trava é sempre liberada, mesmo se a tarefa falhar.
 */
export async function executarComReserva(
  recurso: RecursoSincronizado,
  uasg: string,
  opts: { forcar?: boolean; validade?: string },
  tarefa: () => Promise<ResultadoConcluido>
): Promise<ResultadoSincronizacao> {
  const cleanUasg = (uasg || '').trim();
  if (!supabase || !cleanUasg) return { status: 'NAO_RESERVADO' };
  if (uasgsSincronizandoAgoraDe(recurso).includes(cleanUasg)) return { status: 'NAO_RESERVADO' };

  const { data: reservou, error: erroReserva } = await supabase.rpc('reservar_sincronizacao', {
    p_recurso: recurso,
    p_uasg: cleanUasg,
    p_validade: opts.validade ?? VALIDADE_PADRAO,
    p_forcar: Boolean(opts.forcar)
  });
  if (erroReserva) return { status: 'ERRO', erro: mensagemDeErro(erroReserva) };
  if (!reservou) return { status: 'NAO_RESERVADO' };

  marcar(recurso, cleanUasg, true);
  let resultado: ResultadoConcluido = { status: 'ERRO', erro: 'Sincronização interrompida.' };
  try {
    resultado = await tarefa();
    return resultado;
  } catch (err) {
    resultado = { status: 'ERRO', erro: mensagemDeErro(err) };
    return resultado;
  } finally {
    const { error } = await supabase.rpc('concluir_sincronizacao', {
      p_recurso: recurso,
      p_uasg: cleanUasg,
      p_status: resultado.status,
      p_fontes_com_falha: 'fontesComFalha' in resultado ? resultado.fontesComFalha : [],
      p_total: 'total' in resultado ? resultado.total : null,
      p_mensagem: resultado.status === 'ERRO' ? resultado.erro : resultado.mensagem ?? null
    });
    if (error) console.warn(`[sincronizacao] não foi possível concluir ${recurso} da UASG ${cleanUasg}:`, error);
    marcar(recurso, cleanUasg, false);
  }
}
