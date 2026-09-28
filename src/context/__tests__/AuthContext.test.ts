import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveOwnAppRole } from '../AuthContext';
import * as supabaseClientModule from '../../services/supabaseClient';

function mockUserRolesQuery(result: { data: unknown; error: unknown }) {
  const eqMock = vi.fn().mockResolvedValue(result);
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue({ from: fromMock } as any);
  return { eqMock, selectMock, fromMock };
}

describe('resolveOwnAppRole — resolução da role real do backend (public.user_roles)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
  });

  it('resolve a role quando existe exatamente uma linha em user_roles', async () => {
    mockUserRolesQuery({ data: [{ role_id: 'gestor_saldos' }], error: null });

    const role = await resolveOwnAppRole('user-1');

    expect(role).toBe('gestor_saldos');
  });

  it('prioriza "admin" quando o usuário tem múltiplas linhas (defensivo, não é o fluxo real hoje)', async () => {
    mockUserRolesQuery({ data: [{ role_id: 'leitor' }, { role_id: 'admin' }], error: null });

    const role = await resolveOwnAppRole('user-2');

    expect(role).toBe('admin');
  });

  it('retorna null (fail-closed) quando o usuário autenticado não tem nenhuma linha em user_roles', async () => {
    mockUserRolesQuery({ data: [], error: null });

    const role = await resolveOwnAppRole('user-3');

    expect(role).toBeNull();
  });

  it('ignora role_id desconhecido/nulo em vez de repassar um valor inválido para a UI', async () => {
    mockUserRolesQuery({ data: [{ role_id: null }], error: null });

    const role = await resolveOwnAppRole('user-4');

    expect(role).toBeNull();
  });

  it('propaga o erro da consulta em vez de mascará-lo como "sem role"', async () => {
    mockUserRolesQuery({ data: null, error: { message: 'RLS negou a consulta' } });

    await expect(resolveOwnAppRole('user-5')).rejects.toEqual({ message: 'RLS negou a consulta' });
  });

  it('consulta a tabela user_roles filtrando por user_id (nunca lista roles de terceiros)', async () => {
    const { fromMock, selectMock, eqMock } = mockUserRolesQuery({ data: [{ role_id: 'admin' }], error: null });

    await resolveOwnAppRole('user-6');

    expect(fromMock).toHaveBeenCalledWith('user_roles');
    expect(selectMock).toHaveBeenCalledWith('role_id');
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-6');
  });
});
