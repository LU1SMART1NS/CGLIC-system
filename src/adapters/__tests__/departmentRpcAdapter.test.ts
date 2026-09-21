import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  saveDepartmentRpc, 
  deleteDepartmentRpc, 
  mergeDepartmentAllocationsRpc 
} from '../departmentRpcAdapter';
import * as supabaseClientModule from '../../services/supabaseClient';

describe('departmentRpcAdapter', () => {
  let mockRpc: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = vi.fn();
    const mockSupabase = { rpc: mockRpc } as any;
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
    vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);
  });

  describe('saveDepartmentRpc', () => {
    it('deve chamar a RPC save_internal_department_atomic com parâmetros normalizados', async () => {
      const mockResult = {
        success: true,
        department: {
          id: 'dep-123',
          sigla: 'DFNSP',
          nome_completo: 'Diretoria da Força Nacional',
          descricao: 'Desc',
          ativo: true,
          created_at: '2026-09-18T12:00:00Z',
          updated_at: '2026-09-18T12:00:00Z'
        }
      };

      mockRpc.mockResolvedValueOnce({
        data: mockResult,
        error: null
      });

      const result = await saveDepartmentRpc({
        sigla: 'dfnsp ',
        nomeCompleto: ' Diretoria da Força Nacional ',
        descricao: ' Desc ',
        ativo: true
      });

      expect(mockRpc).toHaveBeenCalledWith(
        'save_internal_department_atomic',
        {
          p_id: null,
          p_sigla: 'DFNSP',
          p_nome_completo: 'Diretoria da Força Nacional',
          p_descricao: 'Desc',
          p_ativo: true
        }
      );
      expect(result).toEqual(mockResult);
    });

    it('deve passar o id se for uma atualização', async () => {
      const mockResult = {
        success: true,
        department: {
          id: 'dep-existing',
          sigla: 'DPOA',
          nome_completo: 'Diretoria de Operações',
          descricao: null,
          ativo: true,
          created_at: '2026-09-18T12:00:00Z',
          updated_at: '2026-09-18T12:00:00Z'
        }
      };

      mockRpc.mockResolvedValueOnce({
        data: mockResult,
        error: null
      });

      const result = await saveDepartmentRpc({
        id: 'dep-existing',
        sigla: 'dpoa',
        nomeCompleto: 'Diretoria de Operações'
      });

      expect(mockRpc).toHaveBeenCalledWith(
        'save_internal_department_atomic',
        {
          p_id: 'dep-existing',
          p_sigla: 'DPOA',
          p_nome_completo: 'Diretoria de Operações',
          p_descricao: null,
          p_ativo: true
        }
      );
      expect(result.department.id).toBe('dep-existing');
    });

    it('deve rejeitar se sigla estiver vazia', async () => {
      await expect(
        saveDepartmentRpc({ sigla: '', nomeCompleto: 'Teste' })
      ).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD'
      });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('deve mapear erro DUPLICATE_DEPARTMENT da RPC', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'DUPLICATE_DEPARTMENT: Já existe um departamento cadastrado com a sigla "DFNSP".',
          code: '23505'
        }
      });

      await expect(
        saveDepartmentRpc({ sigla: 'DFNSP', nomeCompleto: 'Força Nacional' })
      ).rejects.toMatchObject({
        code: 'DUPLICATE_DEPARTMENT'
      });
    });
  });

  describe('deleteDepartmentRpc', () => {
    it('deve executar hard delete via RPC quando não houver vínculos', async () => {
      const mockResult = {
        success: true,
        deleted: true,
        deactivated: false,
        id: 'dep-test',
        sigla: 'TEST',
        allocations_count: 0,
        message: 'Departamento excluído com sucesso.'
      };

      mockRpc.mockResolvedValueOnce({
        data: mockResult,
        error: null
      });

      const result = await deleteDepartmentRpc('dep-test', false);

      expect(mockRpc).toHaveBeenCalledWith(
        'delete_internal_department_atomic',
        {
          p_id: 'dep-test',
          p_force_deactivate: false
        }
      );
      expect(result.deleted).toBe(true);
    });

    it('deve executar soft delete (desativação) quando forceDeactivate = true', async () => {
      const mockResult = {
        success: true,
        deleted: false,
        deactivated: true,
        id: 'dep-test',
        sigla: 'TEST',
        allocations_count: 5,
        message: 'Departamento desativado com sucesso devido a vínculos existentes.'
      };

      mockRpc.mockResolvedValueOnce({
        data: mockResult,
        error: null
      });

      const result = await deleteDepartmentRpc('dep-test', true);

      expect(mockRpc).toHaveBeenCalledWith(
        'delete_internal_department_atomic',
        {
          p_id: 'dep-test',
          p_force_deactivate: true
        }
      );
      expect(result.deactivated).toBe(true);
    });

    it('deve mapear erro CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS quando houver vínculos e forceDeactivate for false', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS: O departamento "DFNSP" possui alocações vinculadas.',
          code: '23503'
        }
      });

      await expect(
        deleteDepartmentRpc('dep-dfnsp', false)
      ).rejects.toMatchObject({
        code: 'CANNOT_DELETE_DEPARTMENT_WITH_ALLOCATIONS'
      });
    });
  });

  describe('mergeDepartmentAllocationsRpc', () => {
    it('deve chamar merge_internal_department_allocations_atomic com parâmetros normalizados', async () => {
      const mockResult = {
        success: true,
        old_name: 'DFNSPdddd',
        target_sigla: 'DFNSP',
        rows_updated: 4,
        timestamp: '2026-09-18T12:00:00Z'
      };

      mockRpc.mockResolvedValueOnce({
        data: mockResult,
        error: null
      });

      const result = await mergeDepartmentAllocationsRpc(' DFNSPdddd ', ' dfnsp ');

      expect(mockRpc).toHaveBeenCalledWith(
        'merge_internal_department_allocations_atomic',
        {
          p_old_name: 'DFNSPdddd',
          p_target_sigla: 'DFNSP'
        }
      );
      expect(result.rows_updated).toBe(4);
    });

    it('deve rejeitar se oldName ou targetSigla estiverem vazios', async () => {
      await expect(
        mergeDepartmentAllocationsRpc('', 'DFNSP')
      ).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD'
      });

      await expect(
        mergeDepartmentAllocationsRpc('DFNSPdddd', '')
      ).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD'
      });
    });

    it('deve mapear erro TARGET_DEPARTMENT_INACTIVE se destino for inativo', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'TARGET_DEPARTMENT_INACTIVE: Departamento de destino com sigla "OLD" está inativo.',
          code: '22023'
        }
      });

      await expect(
        mergeDepartmentAllocationsRpc('OldTypo', 'OLD')
      ).rejects.toMatchObject({
        code: 'TARGET_DEPARTMENT_INACTIVE'
      });
    });
  });
});
