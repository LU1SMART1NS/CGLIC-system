import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  saveProcessoSeiRpc, 
  deleteProcessoSeiRpc 
} from '../seiRpcAdapter';
import * as supabaseClientModule from '../../services/supabaseClient';

describe('seiRpcAdapter', () => {
  let mockRpc: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = vi.fn();
    const mockSupabase = { rpc: mockRpc } as any;
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
    vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);
  });

  describe('saveProcessoSeiRpc', () => {
    it('deve chamar a RPC save_processo_sei_atomic com parâmetros normalizados', async () => {
      const mockResult = {
        success: true,
        processo: {
          id: 'sei-123',
          numero_processo_sei: '10154.000123/2024-11',
          descricao_objeto: 'Aquisição de viaturas',
          unidade_requisitante: 'SENASP / CGOE',
          responsavel_nome: 'Cap. Oliveira',
          status_processo: 'Em Instrução',
          created_at: '2026-09-18T12:00:00Z',
          updated_at: '2026-09-18T12:00:00Z'
        }
      };

      mockRpc.mockResolvedValueOnce({
        data: mockResult,
        error: null
      });

      const result = await saveProcessoSeiRpc({
        numeroProcessoSei: ' 10154.000123/2024-11 ',
        descricaoObjeto: ' Aquisição de viaturas ',
        unidadeRequisitante: ' SENASP / CGOE ',
        responsavelNome: ' Cap. Oliveira ',
        statusProcesso: 'Em Instrução'
      });

      expect(mockRpc).toHaveBeenCalledWith(
        'save_processo_sei_atomic',
        {
          p_id: null,
          p_numero_processo_sei: '10154.000123/2024-11',
          p_descricao_objeto: 'Aquisição de viaturas',
          p_unidade_requisitante: 'SENASP / CGOE',
          p_responsavel_nome: 'Cap. Oliveira',
          p_status_processo: 'Em Instrução'
        }
      );
      expect(result).toEqual(mockResult);
    });

    it('deve passar o id se for uma atualização', async () => {
      const mockResult = {
        success: true,
        processo: {
          id: 'sei-existing',
          numero_processo_sei: '10154.000123/2024-11',
          descricao_objeto: 'Atualizado',
          unidade_requisitante: null,
          responsavel_nome: null,
          status_processo: 'Aprovado',
          created_at: '2026-09-18T12:00:00Z',
          updated_at: '2026-09-18T12:00:00Z'
        }
      };

      mockRpc.mockResolvedValueOnce({
        data: mockResult,
        error: null
      });

      const result = await saveProcessoSeiRpc({
        id: 'sei-existing',
        numeroProcessoSei: '10154.000123/2024-11',
        descricaoObjeto: 'Atualizado',
        statusProcesso: 'Aprovado'
      });

      expect(mockRpc).toHaveBeenCalledWith(
        'save_processo_sei_atomic',
        {
          p_id: 'sei-existing',
          p_numero_processo_sei: '10154.000123/2024-11',
          p_descricao_objeto: 'Atualizado',
          p_unidade_requisitante: null,
          p_responsavel_nome: null,
          p_status_processo: 'Aprovado'
        }
      );
      expect(result.processo.id).toBe('sei-existing');
    });

    it('deve rejeitar se numeroProcessoSei estiver vazio', async () => {
      await expect(
        saveProcessoSeiRpc({ numeroProcessoSei: '' })
      ).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD'
      });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('deve mapear erro DUPLICATE_PROCESS_SEI da RPC', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'DUPLICATE_PROCESS_SEI: Já existe um processo SEI cadastrado com este número.',
          code: '23505'
        }
      });

      await expect(
        saveProcessoSeiRpc({ numeroProcessoSei: '10154.000123/2024-11' })
      ).rejects.toMatchObject({
        code: 'DUPLICATE_PROCESS_SEI'
      });
    });

    it('deve mapear erro INVALID_PROCESS_SEI_STATUS da RPC', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'INVALID_PROCESS_SEI_STATUS: Status do processo SEI inválido.',
          code: '22023'
        }
      });

      await expect(
        saveProcessoSeiRpc({ numeroProcessoSei: '10154.000123/2024-11', statusProcesso: 'Invalido' as any })
      ).rejects.toMatchObject({
        code: 'INVALID_PROCESS_SEI_STATUS'
      });
    });
  });

  describe('deleteProcessoSeiRpc', () => {
    it('deve executar delete via RPC com sucesso', async () => {
      const mockResult = {
        success: true,
        id: 'sei-test',
        numero_processo_sei: '10154.000123/2024-11',
        message: 'Processo SEI excluído com sucesso.'
      };

      mockRpc.mockResolvedValueOnce({
        data: mockResult,
        error: null
      });

      const result = await deleteProcessoSeiRpc('sei-test');

      expect(mockRpc).toHaveBeenCalledWith(
        'delete_processo_sei_atomic',
        {
          p_id: 'sei-test'
        }
      );
      expect(result.success).toBe(true);
    });

    it('deve rejeitar se id estiver vazio', async () => {
      await expect(
        deleteProcessoSeiRpc('')
      ).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD'
      });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('deve mapear erro PROCESS_SEI_NOT_FOUND', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'PROCESS_SEI_NOT_FOUND: Processo SEI com ID "sei-inexistente" não encontrado.',
          code: 'P0002'
        }
      });

      await expect(
        deleteProcessoSeiRpc('sei-inexistente')
      ).rejects.toMatchObject({
        code: 'PROCESS_SEI_NOT_FOUND'
      });
    });
  });
});
