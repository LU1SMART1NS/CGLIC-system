import {
  SYSTEM_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  type RoleDefinition,
  type RolePermissions,
  type ContractScope
} from '../types/user';

const ROLES_STORAGE_KEY = 'saldoarp:system_roles';

let inMemoryRoles: RoleDefinition[] = SYSTEM_ROLES.map(r => ({
  ...r,
  permissoes: { ...r.permissoes }
}));

function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage.getItem(key);
    }
  } catch {}
  return null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    } else if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      (globalThis as any).localStorage.setItem(key, value);
    }
  } catch {}
}

/**
 * Normaliza e consolida um conjunto de permissões brutas (ex.: carregadas de versões antigas do localStorage),
 * garantindo compatibilidade retroativa, preenchimento de campos ausentes e determinação determinística do escopo
 * sob o princípio do menor privilégio.
 */
export function normalizeRolePermissions(raw: any, roleId?: string): RolePermissions {
  // 1. Perfis Nativos do Sistema: preservam estritamente seus defaults canônicos de autorização
  if (roleId === 'coordenador') {
    return {
      ...SYSTEM_ROLES[0].permissoes,
      ...(raw || {}),
      contractScope: 'GLOBAL',
      visualizarTodosContratos: true
    };
  }
  if (roleId === 'gestor') {
    return {
      ...SYSTEM_ROLES[1].permissoes,
      ...(raw || {}),
      contractScope: 'ASSIGNED',
      visualizarTodosContratos: false
    };
  }
  if (roleId === 'consulta') {
    return {
      ...SYSTEM_ROLES[2].permissoes,
      ...(raw || {}),
      contractScope: 'GLOBAL',
      visualizarTodosContratos: true
    };
  }

  // 2. Perfis Customizados: determinação segura do escopo (Princípio do Menor Privilégio)
  let scope: ContractScope = 'ASSIGNED';

  if (raw?.contractScope === 'GLOBAL' || raw?.contractScope === 'UNIT') {
    scope = raw.contractScope;
  } else if (raw?.contractScope === 'ASSIGNED') {
    scope = 'ASSIGNED';
  } else if (
    raw?.visualizarTodosContratos === true &&
    raw?.distribuirContratos !== true &&
    raw?.editarTarefasContratuais === false
  ) {
    // Perfil legado estritamente de consulta/auditoria (somente leitura sem operações de escrita)
    scope = 'GLOBAL';
  } else {
    // Fallback defensivo: perfis antigos sem escopo explícito recaem em escopo ASSIGNED
    scope = 'ASSIGNED';
  }

  return {
    ...DEFAULT_ROLE_PERMISSIONS,
    ...(raw || {}),
    contractScope: scope,
    visualizarTodosContratos: scope === 'GLOBAL',
    visualizarContratos: raw?.visualizarContratos ?? true,
    visualizarAtas: raw?.visualizarAtas ?? true,
    visualizarItens: raw?.visualizarItens ?? true,
    distribuirContratos: Boolean(raw?.distribuirContratos),
    editarTarefasContratuais: Boolean(raw?.editarTarefasContratuais),
    aplicarTemplates: Boolean(raw?.aplicarTemplates),
    visualizarEmpenhos: raw?.visualizarEmpenhos ?? true,
    sincronizarEmpenhos: Boolean(raw?.sincronizarEmpenhos),
    visualizarPagamentos: raw?.visualizarPagamentos ?? true,
    registrarPagamentos: Boolean(raw?.registrarPagamentos),
    visualizarPrazos: raw?.visualizarPrazos ?? true,
    gerenciarEventosContratuais: Boolean(raw?.gerenciarEventosContratuais),
    gerenciarDepartamentos: Boolean(raw?.gerenciarDepartamentos),
    exportarRelatorios: raw?.exportarRelatorios ?? true,
    gerenciarUsuarios: Boolean(raw?.gerenciarUsuarios),
    gerenciarPerfis: Boolean(raw?.gerenciarPerfis)
  };
}

/**
 * Normaliza um objeto RoleDefinition garantindo estrutura canônica completa.
 */
export function normalizeRoleDefinition(role: RoleDefinition): RoleDefinition {
  return {
    ...role,
    permissoes: normalizeRolePermissions(role.permissoes, role.id)
  };
}

export function resetRolesInMemory(): void {
  inMemoryRoles = SYSTEM_ROLES.map(r => ({
    ...r,
    permissoes: { ...r.permissoes }
  }));
}

export function fetchSystemRoles(): RoleDefinition[] {
  try {
    const raw = getStorageItem(ROLES_STORAGE_KEY);
    if (!raw) {
      return inMemoryRoles.map(normalizeRoleDefinition);
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return inMemoryRoles.map(normalizeRoleDefinition);
    }

    // Normaliza todos os perfis armazenados
    const normalizedList: RoleDefinition[] = parsed.map((item: any) => {
      const native = SYSTEM_ROLES.find(s => s.id === item.id);
      if (native) {
        return {
          ...native,
          nome: item.nome?.trim() || native.nome,
          descricao: item.descricao?.trim() || native.descricao,
          badgeColor: item.badgeColor || native.badgeColor,
          permissoes: normalizeRolePermissions(item.permissoes, native.id)
        };
      }

      return {
        id: item.id,
        nome: String(item.nome || 'Perfil Customizado').trim(),
        descricao: String(item.descricao || '').trim(),
        badgeColor: item.badgeColor || '#7c3aed',
        isCustom: true,
        permissoes: normalizeRolePermissions(item.permissoes, item.id)
      };
    });

    // Assegura que os 3 perfis nativos estejam sempre presentes
    for (const native of SYSTEM_ROLES) {
      if (!normalizedList.some(r => r.id === native.id)) {
        normalizedList.push(normalizeRoleDefinition(native));
      }
    }

    return normalizedList;
  } catch {
    return inMemoryRoles.map(normalizeRoleDefinition);
  }
}

export function saveSystemRole(
  role: Omit<Partial<RoleDefinition>, 'permissoes'> & {
    nome: string;
    permissoes: Partial<RolePermissions>;
  }
): RoleDefinition {
  const roles = fetchSystemRoles();

  if (role.id) {
    const idx = roles.findIndex(r => r.id === role.id);
    if (idx >= 0) {
      const mergedPerms = normalizeRolePermissions(
        {
          ...roles[idx].permissoes,
          ...role.permissoes
        },
        roles[idx].id
      );

      const updated: RoleDefinition = {
        ...roles[idx],
        ...role,
        nome: role.nome.trim(),
        descricao: role.descricao ? role.descricao.trim() : roles[idx].descricao,
        badgeColor: role.badgeColor || roles[idx].badgeColor,
        permissoes: mergedPerms
      };

      roles[idx] = updated;
      inMemoryRoles = [...roles];
      setStorageItem(ROLES_STORAGE_KEY, JSON.stringify(roles));
      return updated;
    }
  }

  const generatedId = `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const newPerms = normalizeRolePermissions(
    {
      ...DEFAULT_ROLE_PERMISSIONS,
      ...role.permissoes
    },
    generatedId
  );

  const newRole: RoleDefinition = {
    id: generatedId,
    nome: role.nome.trim(),
    descricao: role.descricao?.trim() || 'Perfil personalizado de acesso.',
    badgeColor: role.badgeColor || '#6366f1',
    isCustom: true,
    permissoes: newPerms
  };

  const nextRoles = [...roles, newRole];
  inMemoryRoles = nextRoles;
  setStorageItem(ROLES_STORAGE_KEY, JSON.stringify(nextRoles));
  return newRole;
}

/**
 * Resolve o rótulo real do perfil operacional de um usuário (ex.: "Gestor / Fiscal de Contrato"),
 * a partir do catálogo de perfis vigente. Usar sempre que um nome de usuário for exibido junto de
 * seu papel no sistema — nunca campos de texto livre (cargo/departamento) sem lastro no RBAC.
 */
export function resolveRoleLabel(roles: RoleDefinition[], perfil?: string | null): string {
  if (!perfil) return 'Sem perfil definido';
  return roles.find((r) => r.id === perfil)?.nome || perfil;
}

export function deleteSystemRole(id: string): void {
  const roles = fetchSystemRoles();
  // Não permitir exclusão de perfis nativos do sistema
  const roleToDelete = roles.find(r => r.id === id);
  if (!roleToDelete || !roleToDelete.isCustom) {
    return;
  }
  const filtered = roles.filter(r => r.id !== id);
  inMemoryRoles = filtered;
  setStorageItem(ROLES_STORAGE_KEY, JSON.stringify(filtered));
}
