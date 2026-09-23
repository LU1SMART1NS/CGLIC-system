import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoleDefinition } from '../types/user';
import { fetchSystemRoles, saveSystemRole, deleteSystemRole } from '../services/roleService';

export const ROLES_QUERY_KEY = ['system_roles'] as const;

export function getRolesQueryOptions() {
  return {
    queryKey: ROLES_QUERY_KEY,
    queryFn: async () => fetchSystemRoles(),
    staleTime: 5 * 60 * 1000
  };
}

export function useRoles() {
  return useQuery<RoleDefinition[], Error>(getRolesQueryOptions());
}

export function useSaveRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (role: Partial<RoleDefinition> & { nome: string; permissoes: RoleDefinition['permissoes'] }) => {
      return saveSystemRole(role);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    }
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      deleteSystemRole(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    }
  });
}
