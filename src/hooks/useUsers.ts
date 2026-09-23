import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSystemUsers, saveSystemUser, deleteSystemUser } from '../services/userService';
import type { SystemUser } from '../types/user';

export const USERS_QUERY_KEY = ['system-users'] as const;

export function useUsers() {
  return useQuery<SystemUser[], Error>({
    queryKey: USERS_QUERY_KEY,
    queryFn: async () => fetchSystemUsers(),
    staleTime: 5 * 60 * 1000
  });
}

export function useSaveUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (user: Partial<SystemUser> & { nome: string; email: string }) => {
      return saveSystemUser(user);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    }
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      deleteSystemUser(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    }
  });
}
