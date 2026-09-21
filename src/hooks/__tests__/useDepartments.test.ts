import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDepartmentsQueryOptions } from '../useDepartments';
import * as unitService from '../../services/unitService';

vi.mock('../../services/unitService', () => ({
  fetchDepartments: vi.fn()
}));

describe('useDepartments Hook / Query Options - Testes Unitários de Catálogo Global', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve definir a queryKey canônica global e staleTime de 5 minutos', () => {
    const options = getDepartmentsQueryOptions();
    expect(options.queryKey).toEqual(['internal-departments']);
    expect(options.staleTime).toBe(300000);
  });

  it('deve chamar fetchDepartments e retornar a lista de departamentos com sucesso', async () => {
    const mockDepartments = [
      {
        id: 'dep-cgd',
        sigla: 'CGD',
        nomeCompleto: 'Coordenação-Geral de Administração',
        descricao: '',
        ativo: true
      },
      {
        id: 'dep-dti',
        sigla: 'DTI',
        nomeCompleto: 'Diretoria de Tecnologia da Informação',
        descricao: '',
        ativo: true
      }
    ];

    vi.mocked(unitService.fetchDepartments).mockResolvedValueOnce(mockDepartments as any);

    const options = getDepartmentsQueryOptions();
    const result = await options.queryFn();

    expect(unitService.fetchDepartments).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockDepartments);
  });

  it('deve retornar lista vazia quando o serviço retornar lista vazia', async () => {
    vi.mocked(unitService.fetchDepartments).mockResolvedValueOnce([]);

    const options = getDepartmentsQueryOptions();
    const result = await options.queryFn();

    expect(unitService.fetchDepartments).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it('deve propagar o erro caso fetchDepartments lance uma exceção', async () => {
    vi.mocked(unitService.fetchDepartments).mockRejectedValueOnce(
      new Error('Erro de conexão com o banco de dados')
    );

    const options = getDepartmentsQueryOptions();
    await expect(options.queryFn()).rejects.toThrow('Erro de conexão com o banco de dados');
    expect(unitService.fetchDepartments).toHaveBeenCalledTimes(1);
  });
});
