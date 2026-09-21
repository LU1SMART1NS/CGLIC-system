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

export const DEFAULT_DEPARTMENTS: InternalDepartment[] = [
  {
    id: 'dep-dfnsp',
    sigla: 'DFNSP',
    nomeCompleto: 'Diretoria da Força Nacional de Segurança Pública',
    ativo: true
  },
  {
    id: 'dep-dsusp',
    sigla: 'DSUSP',
    nomeCompleto: 'Diretoria do Sistema Único de Segurança Pública',
    ativo: true
  },
  {
    id: 'dep-dpoa',
    sigla: 'DPOA',
    nomeCompleto: 'Diretoria de Operações Integradas e de Inteligência',
    ativo: true
  },
  {
    id: 'dep-dge',
    sigla: 'DGE',
    nomeCompleto: 'Diretoria de Gestão e Ensino em Segurança Pública',
    ativo: true
  },
  {
    id: 'dep-cgoe',
    sigla: 'CGOE',
    nomeCompleto: 'Coordenação-Geral de Operações Especiais',
    ativo: true
  },
  {
    id: 'dep-cgpo',
    sigla: 'CGPO',
    nomeCompleto: 'Coordenação-Geral de Planejamento e Orçamento',
    ativo: true
  },
  {
    id: 'dep-emendas',
    sigla: 'Emendas Parlamentares',
    nomeCompleto: 'Alocação para Emendas Parlamentares e Convênios',
    ativo: true
  },
  {
    id: 'dep-gabinete',
    sigla: 'Gabinete / SENASP',
    nomeCompleto: 'Gabinete da Secretaria Nacional de Segurança Pública',
    ativo: true
  }
];

const STORAGE_KEY = 'saldoarp-internal-departments';

/**
 * Consulta o catálogo canônico de departamentos internos no PostgreSQL (SaldoARP 3.0)
 */
export async function fetchDepartments(): Promise<InternalDepartment[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('internal_departments')
        .select('*')
        .order('sigla');

      if (!error && data && data.length > 0) {
        const departments = data.map((d: any) => ({
          id: d.id,
          sigla: d.sigla,
          nomeCompleto: d.nome_completo || d.nomeCompleto || '',
          descricao: d.descricao || '',
          ativo: d.ativo !== false,
          criadoEm: d.created_at
        }));

        // Atualiza espelhamento local pós-sucesso
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(departments));
        } catch {}

        return departments;
      }
    } catch (e) {
      console.warn('Erro ao carregar departamentos do Supabase, usando fallback', e);
    }
  }

  // LocalStorage Fallback
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  return DEFAULT_DEPARTMENTS;
}

/**
 * @deprecated [LEGACY COMPATIBILITY] Utilize `useSaveDepartment` via React Query / `saveDepartmentRpc`
 */
export async function saveDepartments(departments: InternalDepartment[]): Promise<void> {
  console.warn('[DEPRECATED] saveDepartments em lote é obsoleto. Utilize useSaveDepartment individual.');
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(departments));
  } catch {}
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
