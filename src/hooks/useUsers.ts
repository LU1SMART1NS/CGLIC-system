import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSystemUsersAsync,
  saveSystemUserAsync,
  deleteSystemUserAsync,
  deactivateSystemUser,
  reactivateSystemUser,
  inviteSystemUser,
  reinviteSystemUser
} from '../services/userService';
import type { SystemUser, UserRole } from '../types/user';

export const USERS_QUERY_KEY = ['system-users'] as const;

export function useUsers() {
  return useQuery<SystemUser[], Error>({
    queryKey: USERS_QUERY_KEY,
    queryFn: async () => fetchSystemUsersAsync(),
    staleTime: 5 * 60 * 1000
  });
}

export function useInviteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { email: string; nome: string; perfil: UserRole }) => {
      return inviteSystemUser(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    }
  });
}

export function useReinviteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { email: string; nome: string; perfil: UserRole }) => {
      return reinviteSystemUser(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    }
  });
}

export function useSaveUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (user: Partial<SystemUser> & { id: string; nome: string; email: string; perfil: UserRole }) => {
      return saveSystemUserAsync(user);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    }
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (user: SystemUser) => {
      return deleteSystemUserAsync(user);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    }
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (user: SystemUser) => {
      return deactivateSystemUser(user);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    }
  });
}

export function useReactivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (user: SystemUser) => {
      return reactivateSystemUser(user);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    }
  });
}

