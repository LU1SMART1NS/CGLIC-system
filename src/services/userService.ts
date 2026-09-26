import type { SystemUser, UserRole, AllocationScopeType } from '../types/user';
import { UNASSIGNED_ROLE_ID } from '../types/user';
import { supabase, isSupabaseConfigured } from './supabaseClient';

/** Fase 3A: atribuição de escopo enviada ao backend (manage-user/invite-user). */
export interface AllocationScopeInput {
  scopeType: AllocationScopeType;
  scopeValue: string;
}

function toScopePayload(scope?: AllocationScopeInput) {
  if (!scope || !scope.scopeType || !scope.scopeValue?.trim()) return undefined;
  return { domain: 'allocations', scopeType: scope.scopeType, scopeValue: scope.scopeValue.trim() };
}

const USERS_STORAGE_KEY = 'saldoarp:system_users';

/**
 * Fallback local usado apenas quando o Supabase não está configurado (ambiente
 * offline/dev). Não deve conter usuários de demonstração fixos: qualquer
 * usuário exibido na tela de gestão precisa ser uma conta real do Supabase
 * Auth (via RPC get_system_users) ou um registro criado pela própria UI.
 */
const INITIAL_USERS: SystemUser[] = [];

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
            nome: u.nome || localMatch?.nome || u.email.split('@')[0],
            email: u.email,
            // Fase 0.2: nunca usar 'gestor' como fallback de exibição — get_system_users()
            // já retorna UNASSIGNED_ROLE_ID quando o usuário não tem nenhuma role real.
            perfil: (u.perfil as UserRole) || localMatch?.perfil || UNASSIGNED_ROLE_ID,
            matricula: localMatch?.matricula,
            cargo: localMatch?.cargo,
            departamento: localMatch?.departamento,
            status: (u.status as any) || (u.ativo ? 'ativo' : 'inativo'),
            ativo: u.ativo ?? true,
            createdAt: u.created_at,
            lastSignInAt: u.last_sign_in_at,
            // Fase 3A: escopo de alocação (não é departamento/lotação do
            // usuário — é só o valor de autorização, quando aplicável).
            allocationScopeType: (u.allocation_scope_type as AllocationScopeType) || undefined,
            allocationScopeValue: u.allocation_scope_value || undefined
          };
        });

        // Não complementa com usuários locais que não vieram do Supabase: a RPC
        // já consulta auth.users diretamente, então qualquer conta real aparece
        // aqui. Um registro presente só no localStorage é resíduo de uso local
        // (ex.: convite salvo antes de confirmar) e não deve ser exibido como
        // se fosse um usuário do sistema.
        return mappedRemote;
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
  const cleanEmail = user.email.trim().toLowerCase();

  // Procura primeiro pelo id (caso normal). Se não encontrar — por exemplo, um
  // usuário real do Supabase (id em UUID) cujo único registro local ainda é um
  // registro antigo com outro id — cai para busca por e-mail, que é a chave de
  // identidade real usada em todo o resto do serviço. Sem esse fallback, cada
  // edição criaria um registro local duplicado e a edição "desapareceria" da
  // tela (o merge com o Supabase sempre exibe o primeiro registro local
  // encontrado por e-mail, que continuaria sendo o antigo).
  const idx = user.id
    ? users.findIndex(u => u.id === user.id)
    : -1;
  const matchIdx = idx >= 0 ? idx : users.findIndex(u => u.email.toLowerCase() === cleanEmail);

  if (matchIdx >= 0) {
    const updated: SystemUser = {
      ...users[matchIdx],
      ...user,
      id: user.id || users[matchIdx].id,
      nome: user.nome.trim(),
      email: user.email.trim(),
      status: user.status || users[matchIdx].status || 'ativo'
    };
    users[matchIdx] = updated;
    inMemoryUsers = [...users];
    setStorageItem(USERS_STORAGE_KEY, JSON.stringify(users));
    return updated;
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
  const filtered = users.filter(u => u.id !== id && u.email.toLowerCase() !== id.toLowerCase());
  inMemoryUsers = filtered;
  setStorageItem(USERS_STORAGE_KEY, JSON.stringify(filtered));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Distingue servidores reais (contas no Supabase Auth, id em UUID) dos registros locais de demonstração. */
function isRealSupabaseUser(id: string): boolean {
  return UUID_RE.test(id);
}

async function callManageUserFunction(body: Record<string, unknown>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  const session = (await supabase.auth.getSession()).data.session;
  const { error } = await supabase.functions.invoke('manage-user', {
    body,
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined
  });

  if (error) {
    const serverMessage = await extractFunctionErrorMessage(error);
    throw new Error(serverMessage || error.message || 'Falha ao processar a solicitação no servidor.');
  }
}

/**
 * Atualiza dados do servidor. Quando o registro corresponde a uma conta real do Supabase Auth,
 * sincroniza nome e perfil no backend antes de gravar localmente — evita que a tela mostre dados
 * desatualizados ou sem efeito no Supabase Auth / RBAC.
 */
export async function saveSystemUserAsync(
  user: Partial<SystemUser> & { id: string; nome: string; email: string; perfil: UserRole },
  scope?: AllocationScopeInput
): Promise<SystemUser> {
  if (isRealSupabaseUser(user.id)) {
    try {
      await callManageUserFunction({
        action: 'update-user',
        userId: user.id,
        nome: user.nome.trim(),
        email: user.email.trim(),
        perfil: user.perfil,
        scope: toScopePayload(scope)
      });
    } catch (err: any) {
      const msg = err?.message?.toLowerCase() || '';
      if (!msg.includes('user not found') && !msg.includes('not found')) {
        throw err;
      }
    }
  }

  return saveSystemUser(user);
}

/**
 * Exclui permanentemente o servidor ou convite pendente.
 * Para contas do Supabase Auth, remove a conta e seus papéis no backend.
 */
export async function deleteSystemUserAsync(user: SystemUser): Promise<void> {
  try {
    if (isRealSupabaseUser(user.id)) {
      await callManageUserFunction({
        action: 'delete-user',
        userId: user.id
      });
    }
  } catch (err: any) {
    const msg = err?.message?.toLowerCase() || '';
    if (!msg.includes('user not found') && !msg.includes('not found')) {
      throw err;
    }
  } finally {
    deleteSystemUser(user.id);
    if (user.email) {
      deleteSystemUser(user.email);
    }
  }
}

/**
 * Desativa o acesso do servidor. Para contas reais do Supabase Auth, revoga o login no backend
 * (banimento reversível) antes de refletir o status localmente — sem isso, a pessoa continuaria
 * conseguindo autenticar mesmo após ser "removida" na tela.
 */
export async function deactivateSystemUser(user: SystemUser): Promise<SystemUser> {
  if (isRealSupabaseUser(user.id)) {
    await callManageUserFunction({ action: 'deactivate', userId: user.id });
  }

  return saveSystemUser({ ...user, status: 'inativo', ativo: false });
}

/** Reativa o acesso de um servidor previamente desativado. */
export async function reactivateSystemUser(user: SystemUser): Promise<SystemUser> {
  if (isRealSupabaseUser(user.id)) {
    await callManageUserFunction({ action: 'reactivate', userId: user.id });
  }

  return saveSystemUser({ ...user, status: 'ativo', ativo: true });
}

export async function inviteSystemUser(params: {
  email: string;
  nome: string;
  perfil: UserRole;
  action?: 'invite' | 'reinvite';
  scope?: AllocationScopeInput;
}): Promise<SystemUser> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanNome = params.nome.trim();

  if (isSupabaseConfigured && supabase) {
    const session = (await supabase.auth.getSession()).data.session;
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: {
        email: cleanEmail,
        nome: cleanNome,
        perfil: params.perfil,
        action: params.action || 'invite',
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        scope: toScopePayload(params.scope)
      },
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined
    });

    if (error) {
      // Tenta extrair a mensagem de erro real retornada pela Edge Function (não apenas o status HTTP genérico)
      const serverMessage = await extractFunctionErrorMessage(error);
      throw new Error(serverMessage || error.message || 'Falha ao processar convite no servidor.');
    }

    if (!data?.user) {
      throw new Error('Resposta inesperada do servidor ao processar o convite.');
    }

    return saveSystemUser({
      id: data.user.id,
      nome: cleanNome,
      email: cleanEmail,
      perfil: params.perfil,
      status: 'pendente',
      ativo: true
    });
  }

  // Fallback exclusivo para ambiente offline/local (sem backend Supabase configurado)
  return saveSystemUser({
    nome: cleanNome,
    email: cleanEmail,
    perfil: params.perfil,
    status: 'pendente',
    ativo: true
  });
}

/**
 * As Edge Functions do Supabase retornam erro HTTP não-2xx como FunctionsHttpError,
 * cuja `.message` padrão é genérica ("Edge Function returned a non-2xx status code").
 * O corpo JSON real com a mensagem de negócio fica em `error.context` (Response).
 */
async function extractFunctionErrorMessage(error: any): Promise<string | null> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      if (body?.error) return body.error;
    }
  } catch {
    // corpo não é JSON ou já foi consumido; usa a mensagem padrão do erro
  }
  return null;
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

