import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRolesQueryOptions, ROLES_QUERY_KEY } from '../useRoles';
import * as roleService from '../../services/roleService';

vi.mock('../../services/roleService', () => ({
  fetchSystemRoles: vi.fn(),
  saveSystemRole: vi.fn(),
  deleteSystemRole: vi.fn()
}));

describe('useRoles Query Options & Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve definir a queryKey canônica e staleTime de 5 minutos', () => {
    const options = getRolesQueryOptions();
    expect(options.queryKey).toEqual(ROLES_QUERY_KEY);
    expect(options.staleTime).toBe(300000);
  });

  it('deve chamar fetchSystemRoles e retornar os perfis', async () => {
    const mockRoles = [
      {
        id: 'coordenador',
        nome: 'Coordenador',
        badgeColor: '#0c326f',
        descricao: 'Coordenador geral',
        permissoes: {
          distribuirContratos: true,
          editarTarefasContratuais: true,
          aplicarTemplates: true,
          gerenciarDepartamentos: true,
          exportarRelatorios: true,
          visualizarTodosContratos: true,
          gerenciarUsuarios: true
        }
      }
    ];

    vi.mocked(roleService.fetchSystemRoles).mockReturnValueOnce(mockRoles as any);

    const options = getRolesQueryOptions();
    const result = await options.queryFn();

    expect(roleService.fetchSystemRoles).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockRoles);
  });
});
