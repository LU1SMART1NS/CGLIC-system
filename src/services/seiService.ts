import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { DbProcessoSei } from './supabaseClient';
import type { ProcessoSei } from '../types';
import { saveProcessoSeiRpc, deleteProcessoSeiRpc } from '../adapters/seiRpcAdapter';

const STORAGE_KEY = 'saldoarp-processos-sei';

/**
 * Busca todos os processos SEI cadastrados (do Supabase com fallback seguro em localStorage)
 */
export async function fetchProcessosSei(): Promise<ProcessoSei[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('processos_sei')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        const processos = data.map((d: DbProcessoSei) => ({
          id: d.id,
          numeroProcessoSei: d.numero_processo_sei,
          descricaoObjeto: d.descricao_objeto || '',
          unidadeRequisitante: d.unidade_requisitante || '',
          responsavelNome: d.responsavel_nome || '',
          statusProcesso: (d.status_processo as any) || 'Em Instrução',
          createdAt: d.created_at,
          updatedAt: d.updated_at
        }));

        // Atualiza espelhamento local pós-sucesso
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(processos));
        } catch {}

        return processos;
      }
    } catch (e) {
      console.warn('Erro ao consultar processos SEI no Supabase. Utilizando fallback local.', e);
    }
  }

  // Fallback LocalStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Erro no fallback do localStorage para Processos SEI', e);
  }

  return [];
}

/**
 * @deprecated [LEGACY COMPATIBILITY] Utilize `useSaveProcessoSei` via React Query / `saveProcessoSeiRpc`
 */
export async function saveProcessoSei(processo: Omit<ProcessoSei, 'id'> & { id?: string }): Promise<ProcessoSei> {
  console.warn('[DEPRECATED] saveProcessoSei é obsoleto. Redirecionando para saveProcessoSeiRpc.');
  const res = await saveProcessoSeiRpc({
    id: processo.id,
    numeroProcessoSei: processo.numeroProcessoSei,
    descricaoObjeto: processo.descricaoObjeto,
    unidadeRequisitante: processo.unidadeRequisitante,
    responsavelNome: processo.responsavelNome,
    statusProcesso: processo.statusProcesso
  });

  return {
    id: res.processo.id,
    numeroProcessoSei: res.processo.numero_processo_sei,
    descricaoObjeto: res.processo.descricao_objeto || '',
    unidadeRequisitante: res.processo.unidade_requisitante || '',
    responsavelNome: res.processo.responsavel_nome || '',
    statusProcesso: (res.processo.status_processo as any) || 'Em Instrução',
    createdAt: res.processo.created_at,
    updatedAt: res.processo.updated_at
  };
}

/**
 * @deprecated [LEGACY COMPATIBILITY] Utilize `useDeleteProcessoSei` via React Query / `deleteProcessoSeiRpc`
 */
export async function deleteProcessoSei(id: string): Promise<void> {
  console.warn('[DEPRECATED] deleteProcessoSei é obsoleto. Redirecionando para deleteProcessoSeiRpc.');
  await deleteProcessoSeiRpc(id);
}
