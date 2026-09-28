import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { type AppRole, isAppRole } from '../types/rbac';

/**
 * Estado de resolução da role real do usuário (public.user_roles.role_id):
 *   'loading' -> ainda consultando o backend (ou aguardando a sessão resolver).
 *   'ready'   -> role resolvida com sucesso (`role` populado).
 *   'none'    -> usuário autenticado mas sem nenhuma linha em user_roles
 *                (fail-closed: ausência de role = ausência de autoridade).
 *   'error'   -> falha ao consultar o backend (rede, RLS inesperado, etc.).
 */
export type RoleStatus = 'loading' | 'ready' | 'none' | 'error';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Role real do backend (public.user_roles.role_id), nunca o `perfil` legado do frontend. */
  role: AppRole | null;
  roleStatus: RoleStatus;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: false,
  role: null,
  roleStatus: 'loading',
  signOut: async () => {}
});

/**
 * Resolve a role real do usuário autenticado lendo diretamente
 * public.user_roles (RLS "Self Read or Admin", 20260917000002_rbac_and_rls.sql
 * linha 57) — não existe RPC dedicada para "qual é a minha role" e não é
 * necessário criar uma: a própria tabela já permite ao usuário ler sua
 * própria linha. Se houver mais de uma linha (não ocorre hoje no fluxo real
 * de atribuição de perfil, que remove roles antigas), prioriza 'admin'.
 */
export async function resolveOwnAppRole(userId: string): Promise<AppRole | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  const roleIds = (data ?? []).map((row: { role_id: string | null }) => row.role_id).filter(isAppRole);
  if (roleIds.length === 0) return null;
  return roleIds.includes('admin') ? 'admin' : roleIds[0];
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleStatus, setRoleStatus] = useState<RoleStatus>('loading');

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    // Obter sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Ouvir alterações na sessão oficial do Supabase Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Resolve a role sempre que o usuário autenticado mudar (login, refresh
  // com sessão restaurada, ou troca de conta). Reage a logout limpando o
  // estado imediatamente, sem esperar nenhuma requisição.
  useEffect(() => {
    if (!user) {
      // Sem usuário autenticado (ainda não resolvido, ou deslogado) — não há
      // role para resolver. Consumidores devem checar `loading` (autenticação)
      // antes de `roleStatus`; este estado nunca fica "preso" em 'loading'.
      setRole(null);
      setRoleStatus('none');
      return;
    }

    let cancelled = false;
    setRoleStatus('loading');

    resolveOwnAppRole(user.id)
      .then((resolved) => {
        if (cancelled) return;
        setRole(resolved);
        setRoleStatus(resolved ? 'ready' : 'none');
      })
      .catch(() => {
        if (cancelled) return;
        setRole(null);
        setRoleStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
    setRole(null);
    setRoleStatus('none');
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, roleStatus, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
