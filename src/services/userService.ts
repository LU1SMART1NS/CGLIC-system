import type { SystemUser } from '../types/user';

const USERS_STORAGE_KEY = 'saldoarp:system_users';

const INITIAL_USERS: SystemUser[] = [
  {
    id: 'user-1',
    nome: 'Carlos Silva',
    email: 'carlos.silva@mj.gov.br',
    matricula: '1984201',
    cargo: 'Analista de Planejamento e Orçamento',
    departamento: 'Coordenação Geral de Licitações e Contratos (CGLIC)',
    perfil: 'gestor',
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
        email: user.email.trim()
      };
      users[idx] = updated;
      inMemoryUsers = [...users];
      setStorageItem(USERS_STORAGE_KEY, JSON.stringify(users));
      return updated;
    }
  }

  const newUser: SystemUser = {
    id: `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    nome: user.nome.trim(),
    email: user.email.trim(),
    matricula: user.matricula?.trim() || '',
    cargo: user.cargo?.trim() || 'Servidor Público',
    departamento: user.departamento?.trim() || 'SENASP / MJSP',
    perfil: user.perfil || 'gestor',
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
