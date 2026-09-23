import { SYSTEM_ROLES, type RoleDefinition } from '../types/user';

const ROLES_STORAGE_KEY = 'saldoarp:system_roles';

let inMemoryRoles: RoleDefinition[] = [...SYSTEM_ROLES];

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

export function resetRolesInMemory(): void {
  inMemoryRoles = [...SYSTEM_ROLES];
}

export function fetchSystemRoles(): RoleDefinition[] {
  try {
    const raw = getStorageItem(ROLES_STORAGE_KEY);
    if (!raw) {
      return inMemoryRoles;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : inMemoryRoles;
  } catch {
    return inMemoryRoles;
  }
}

export function saveSystemRole(role: Partial<RoleDefinition> & { nome: string; permissoes: RoleDefinition['permissoes'] }): RoleDefinition {
  const roles = fetchSystemRoles();

  if (role.id) {
    const idx = roles.findIndex(r => r.id === role.id);
    if (idx >= 0) {
      const updated: RoleDefinition = {
        ...roles[idx],
        ...role,
        nome: role.nome.trim(),
        descricao: role.descricao ? role.descricao.trim() : roles[idx].descricao,
        badgeColor: role.badgeColor || roles[idx].badgeColor,
        permissoes: {
          ...roles[idx].permissoes,
          ...role.permissoes
        }
      };
      roles[idx] = updated;
      inMemoryRoles = [...roles];
      setStorageItem(ROLES_STORAGE_KEY, JSON.stringify(roles));
      return updated;
    }
  }

  const defaultPerms: RoleDefinition['permissoes'] = {
    distribuirContratos: false,
    editarTarefasContratuais: false,
    aplicarTemplates: false,
    gerenciarDepartamentos: false,
    exportarRelatorios: true,
    visualizarTodosContratos: true,
    gerenciarUsuarios: false
  };

  const generatedId = `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const newRole: RoleDefinition = {
    id: generatedId,
    nome: role.nome.trim(),
    descricao: role.descricao?.trim() || 'Perfil personalizado de acesso.',
    badgeColor: role.badgeColor || '#6366f1',
    isCustom: true,
    permissoes: {
      ...defaultPerms,
      ...role.permissoes
    }
  };

  const nextRoles = [...roles, newRole];
  inMemoryRoles = nextRoles;
  setStorageItem(ROLES_STORAGE_KEY, JSON.stringify(nextRoles));
  return newRole;
}

export function deleteSystemRole(id: string): void {
  const roles = fetchSystemRoles();
  // Não permitir exclusão de perfis do sistema padrão
  const roleToDelete = roles.find(r => r.id === id);
  if (!roleToDelete || !roleToDelete.isCustom) {
    return;
  }
  const filtered = roles.filter(r => r.id !== id);
  inMemoryRoles = filtered;
  setStorageItem(ROLES_STORAGE_KEY, JSON.stringify(filtered));
}
