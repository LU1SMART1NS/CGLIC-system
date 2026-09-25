import type { SystemUser, UserRole } from '../types/user';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const USERS_STORAGE_KEY = 'saldoarp:system_users';

const INITIAL_USERS: SystemUser[] = [
  {
    id: 'user-0-real',
    nome: 'Luís Martins (Operador Real)',
    email: 'luis.martins@mj.gov.br',
    matricula: '2003310',
    cargo: 'Gestor Titular de Contratos e Atas',
    departamento: 'Coordenação-Geral de Licitações e Contratos (CGLIC / SENASP)',
    perfil: 'gestor',
    status: 'ativo',
    ativo: true,
    createdAt: '2026-09-24T00:00:00.000Z'
  },
  {
    id: 'user-1',
    nome: 'Carlos Silva',
    email: 'carlos.silva@mj.gov.br',
    matricula: '1984201',
    cargo: 'Analista de Planejamento e Orçamento',
    departamento: 'Coordenação Geral de Licitações e Contratos (CGLIC)',
    perfil: 'gestor',
    status: 'ativo',
    ativo: true,
    createdAt: '2024-01-15T08:00:00.000Z'
  },
  {
    id: 'user-2',
    nome: 'Maria Santos',
    email: 'maria.santos@mj.gov.br',
    matricula: '2049182',
    cargo: 'Especialista em Políticas Públicas',
    departamento: 'Diretoria de Tecnologia e Informação (DTI)',
    perfil: 'gestor',
    status: 'ativo',
    ativo: true,
    createdAt: '2024-02-10T09:30:00.000Z'
  },
  {
    id: 'user-3',
    nome: 'Coordenação Geral CGLIC',
    email: 'cglic.senasp@mj.gov.br',
    matricula: '1002930',
    cargo: 'Coordenador-Geral',
    departamento: 'SENASP / MJSP',
    perfil: 'coordenador',
    status: 'ativo',
    ativo: true,
    createdAt: '2023-11-01T10:00:00.000Z'
  },
  {
    id: 'user-4',
    nome: 'Ana Oliveira',
    email: 'ana.oliveira@mj.gov.br',
    matricula: '3194820',
    cargo: 'Auditor Federal de Controle',
    departamento: 'Assessoria Especial de Controle Interno (AECI)',
    perfil: 'consulta',
    status: 'ativo',
    ativo: true,
    createdAt: '2024-03-01T14:00:00.000Z'
  }
];

let inMemoryUsers: SystemUser[] = [...INITIAL_USERS];

function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {}
  return null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {}
}

export function resetUsersInMemory(): void {
  inMemoryUsers = [...INITIAL_USERS];
}

export function fetchSystemUsers(): SystemUser[] {
  try {
    const raw = getStorageItem(USERS_STORAGE_KEY);
    if (!raw) {
      return inMemoryUsers;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : inMemoryUsers;
  } catch {
    return inMemoryUsers;
  }
}

export async function fetchSystemUsersAsync(): Promise<SystemUser[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('get_system_users');
      if (!error && Array.isArray(data) && data.length > 0) {
        const localList = fetchSystemUsers();
        const mappedRemote: SystemUser[] = data.map((u: any) => {
          const localMatch = localList.find(l => l.email.toLowerCase() === u.email?.toLowerCase());
          return {
            id: u.id,
            nome: localMatch?.nome || u.nome || u.email.split('@')[0],
            email: u.email,
            perfil: (u.perfil as UserRole) || localMatch?.perfil || 'gestor',
            matricula: localMatch?.matricula,
            cargo: localMatch?.cargo,
            departamento: localMatch?.departamento,
            status: (u.status as any) || (u.ativo ? 'ativo' : 'inativo'),
            ativo: u.ativo ?? true,
            createdAt: u.created_at,
            lastSignInAt: u.last_sign_in_at
          };
        });

        // Complementa com usuários locais se não estiverem no Supabase
        const result = [...mappedRemote];
        for (const local of localList) {
          if (!result.some(r => r.email.toLowerCase() === local.email.toLowerCase())) {
            result.push(local);
          }
        }
        return result;
      }
    } catch {
      // Falha graciosa para fallback local
    }
  }
  return fetchSystemUsers();
}

export function saveSystemUser(user: Partial<SystemUser> & { nome: string; email: string }): SystemUser {
  const users = fetchSystemUsers();
  const now = new Date().toISOString();

  if (user.id) {
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) {
      const updated: SystemUser = {
        ...users[idx],
        ...user,
        nome: user.nome.trim(),
        email: user.email.trim(),
        status: user.status || users[idx].status || 'ativo'
      };
      users[idx] = updated;
      inMemoryUsers = [...users];
      setStorageItem(USERS_STORAGE_KEY, JSON.stringify(users));
      return updated;
    }
  }

  const newUser: SystemUser = {
    id: user.id || `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    nome: user.nome.trim(),
    email: user.email.trim(),
    matricula: user.matricula?.trim() || '',
    cargo: user.cargo?.trim() || 'Servidor Público',
    departamento: user.departamento?.trim() || 'SENASP / MJSP',
    perfil: user.perfil || 'gestor',
    status: user.status || 'ativo',
    ativo: user.ativo ?? true,
    createdAt: now
  };

  const nextUsers = [...users, newUser];
  inMemoryUsers = nextUsers;
  setStorageItem(USERS_STORAGE_KEY, JSON.stringify(nextUsers));
  return newUser;
}

export function deleteSystemUser(id: string): void {
  const users = fetchSystemUsers();
  const filtered = users.filter(u => u.id !== id);
  inMemoryUsers = filtered;
  setStorageItem(USERS_STORAGE_KEY, JSON.stringify(filtered));
}

export async function inviteSystemUser(params: {
  email: string;
  nome: string;
  perfil: UserRole;
  action?: 'invite' | 'reinvite';
}): Promise<SystemUser> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanNome = params.nome.trim();

  if (isSupabaseConfigured && supabase) {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: cleanEmail,
          nome: cleanNome,
          perfil: params.perfil,
          action: params.action || 'invite'
        },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined
      });

      if (error) {
        throw new Error(error.message || 'Falha ao processar convite no servidor.');
      }

      if (data?.user) {
        return saveSystemUser({
          id: data.user.id,
          nome: cleanNome,
          email: cleanEmail,
          perfil: params.perfil,
          status: 'pendente',
          ativo: true
        });
      }
    } catch (err: any) {
      // Se a Edge Function falhar por restrição de rede no ambiente de desenvolvimento, preserva fallback local
      console.warn('Falha na chamada da Edge Function, aplicando salvamento local:', err);
    }
  }

  // Fallback offline / ambiente de testes
  return saveSystemUser({
    nome: cleanNome,
    email: cleanEmail,
    perfil: params.perfil,
    status: 'pendente',
    ativo: true
  });
}

export async function reinviteSystemUser(params: {
  email: string;
  nome: string;
  perfil: UserRole;
}): Promise<SystemUser> {
  return inviteSystemUser({ ...params, action: 'reinvite' });
}

export async function resetUserPassword(email: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${origin}/redefinir-senha`
    });
    if (error) {
      throw new Error(error.message || 'Erro ao enviar e-mail de recuperação de senha.');
    }
  }
}

