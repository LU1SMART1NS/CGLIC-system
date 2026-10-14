import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoleDefinition } from '../types/user';
import { fetchSystemRoles } from '../services/roleService';
import { fetchRoleLabels, renameRole } from '../services/roleLabelService';

export const ROLES_QUERY_KEY = ['system_roles'] as const;

export function getRolesQueryOptions() {
  return {
    queryKey: ROLES_QUERY_KEY,
    queryFn: async () => {
      // Só os 4 perfis do sistema: um perfil "customizado" guardado no navegador (versão antiga da tela) não existe no
      // banco, e escolhê-lo para um servidor faria o manage-user retirar todos os perfis da pessoa.
      const roles = fetchSystemRoles().filter((r) => !r.isCustom);
      const labels = await fetchRoleLabels().catch(() => ({}) as Record<string, string>);
      return roles.map((r) => (labels[r.id] ? { ...r, nome: labels[r.id] } : r));
    },
    staleTime: 5 * 60 * 1000
  };
}

export function useRoles() {
  return useQuery<RoleDefinition[], Error>(getRolesQueryOptions());
}

export function useRenameRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nome }: { id: string; nome: string }) => renameRole(id, nome),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    }
  });
}
