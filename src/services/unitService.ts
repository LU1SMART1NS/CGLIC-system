import { supabase, isSupabaseConfigured } from './supabaseClient';
import { 
  saveDepartmentRpc, 
  deleteDepartmentRpc, 
  mergeDepartmentAllocationsRpc 
} from '../adapters/departmentRpcAdapter';

export interface InternalDepartment {
  id: string;
  sigla: string;
  nomeCompleto: string;
  descricao?: string;
  ativo: boolean;
  criadoEm?: string;
}

/**
 * Consulta o catálogo de departamentos internos no PostgreSQL (CGLIC 3.0).
 *
 * É a única fonte: o catálogo vazio devolve lista vazia (nada é inventado) e falha de leitura ou de configuração
 * vira erro, para a tela mostrar o problema em vez de oferecer unidades que o banco não conhece.
 */
export async function fetchDepartments(): Promise<InternalDepartment[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('CONFIG_ERROR: Supabase não está configurado.');
  }

  const { data, error } = await supabase
    .from('internal_departments')
    .select('*')
    .order('sigla');

  if (error) {
    console.error('Erro ao carregar o catálogo de departamentos internos:', error);
    throw error;
  }

  return (data || []).map((d: any) => ({
    id: d.id,
    sigla: d.sigla,
    nomeCompleto: d.nome_completo || d.nomeCompleto || '',
    descricao: d.descricao || '',
    ativo: d.ativo !== false,
    criadoEm: d.created_at
  }));
}

/**
 * @deprecated [LEGACY COMPATIBILITY] Utilize `useSaveDepartment` via React Query / `saveDepartmentRpc`
 */
export async function addDepartment(sigla: string, nomeCompleto: string): Promise<InternalDepartment> {
  console.warn('[DEPRECATED] addDepartment é obsoleto. Redirecionando para saveDepartmentRpc.');
  const res = await saveDepartmentRpc({ sigla, nomeCompleto });
  return {
    id: res.department.id,
    sigla: res.department.sigla,
    nomeCompleto: res.department.nome_completo,
    descricao: res.department.descricao || '',
    ativo: res.department.ativo,
    criadoEm: res.department.created_at
  };
}

/**
 * @deprecated [LEGACY COMPATIBILITY] Utilize `useSaveDepartment` via React Query / `saveDepartmentRpc`
 */
export async function updateDepartment(id: string, sigla: string, nomeCompleto: string): Promise<void> {
  console.warn('[DEPRECATED] updateDepartment é obsoleto. Redirecionando para saveDepartmentRpc.');
  await saveDepartmentRpc({ id, sigla, nomeCompleto });
}

/**
 * @deprecated [LEGACY COMPATIBILITY] Utilize `useDeleteDepartment` via React Query / `deleteDepartmentRpc`
 */
export async function deleteDepartment(id: string): Promise<void> {
  console.warn('[DEPRECATED] deleteDepartment é obsoleto. Redirecionando para deleteDepartmentRpc.');
  await deleteDepartmentRpc(id, false);
}

/**
 * @deprecated [LEGACY COMPATIBILITY] Utilize `useMergeDepartment` via React Query / `mergeDepartmentAllocationsRpc`
 */
export async function mergeDepartmentName(oldName: string, targetSigla: string): Promise<number> {
  console.warn('[DEPRECATED] mergeDepartmentName é obsoleto. Redirecionando para mergeDepartmentAllocationsRpc.');
  const res = await mergeDepartmentAllocationsRpc(oldName, targetSigla);
  return res.rows_updated;
}
