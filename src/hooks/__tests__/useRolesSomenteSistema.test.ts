import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/supabaseClient', () => ({ isSupabaseConfigured: false, supabase: null }));

import { getRolesQueryOptions } from '../useRoles';
import { resetRolesInMemory } from '../../services/roleService';
import { SYSTEM_ROLES } from '../../types/user';

/**
 * Item 9 (14/10/2026): perfil "customizado" guardado no navegador por uma versão antiga da tela Perfis não existe no
 * banco; escolhê-lo para um servidor faria o manage-user retirar todos os perfis da pessoa. A lista das telas só tem os
 * perfis do sistema.
 */
describe('lista de perfis das telas', () => {
  beforeEach(() => {
    const armazenado: Record<string, string> = {
      'saldoarp:system_roles': JSON.stringify([{ id: 'perfil-antigo', nome: 'Perfil Antigo', permissoes: {} }])
    };
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => armazenado[k] ?? null,
      setItem: (k: string, v: string) => { armazenado[k] = v; },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 1
    });
    resetRolesInMemory();
  });

  it('ignora perfil criado no navegador e mantém os do sistema', async () => {
    const roles = await getRolesQueryOptions().queryFn();
    expect(roles.some((r) => r.id === 'perfil-antigo')).toBe(false);
    expect(roles.map((r) => r.id).sort()).toEqual(SYSTEM_ROLES.map((r) => r.id).sort());
  });
});
