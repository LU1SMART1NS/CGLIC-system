import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveContractManagerRpc,
  saveContractTaskTemplateRpc,
  deleteContractTaskTemplateRpc,
  saveContractTaskTemplateMacrotaskRpc,
  deleteContractTaskTemplateMacrotaskRpc,
  saveContractTaskTemplateTaskRpc,
  deleteContractTaskTemplateTaskRpc,
  applyContractTaskTemplateRpc,
  updateContractTaskRpc
} from '../contractManagementRpcAdapter';
import * as supabaseClientModule from '../../services/supabaseClient';

describe('contractManagementRpcAdapter', () => {
  let mockRpc: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = vi.fn();
    const mockSupabase = { rpc: mockRpc } as any;
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
    vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);
  });

  describe('saveContractManagerRpc (atribuir gestor)', () => {
    it('deve chamar save_contract_manager_atomic com parâmetros normalizados', async () => {
      const mockResult = {
        success: true,
        manager: {
          contract_key: '200331-15-2026',
          uasg: '200331',
          numero: '15',
          ano: 2026,
          gestor_nome: 'João Silva',
          created_at: '2026-09-22T12:00:00Z',
          updated_at: '2026-09-22T12:00:00Z'
        }
      };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await saveContractManagerRpc({ uasg: ' 200331 ', numero: ' 15 ', ano: 2026, gestorNome: ' João Silva ' });

      expect(mockRpc).toHaveBeenCalledWith('save_contract_manager_atomic', {
        p_uasg: '200331',
        p_numero: '15',
        p_ano: 2026,
        p_gestor_nome: 'João Silva'
      });
      expect(result).toEqual(mockResult);
    });

    it('deve rejeitar se o nome do gestor estiver vazio', async () => {
      await expect(
        saveContractManagerRpc({ uasg: '200331', numero: '15', ano: 2026, gestorNome: '  ' })
      ).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('saveContractTaskTemplateRpc (criar template)', () => {
    it('deve criar um template com sucesso', async () => {
      const mockResult = {
        success: true,
        template: { id: 'tpl-1', nome: 'Gestão de Contrato Administrativo', descricao: null, ativo: true, created_at: 'x', updated_at: 'x' }
      };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await saveContractTaskTemplateRpc({ nome: 'Gestão de Contrato Administrativo', ativo: true });

      expect(mockRpc).toHaveBeenCalledWith('save_contract_task_template_atomic', {
        p_id: null,
        p_nome: 'Gestão de Contrato Administrativo',
        p_descricao: null,
        p_ativo: true
      });
      expect(result.template.id).toBe('tpl-1');
    });

    it('deve mapear erro DUPLICATE_TEMPLATE', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'DUPLICATE_TEMPLATE: Já existe um template cadastrado com o nome "X".', code: '23505' }
      });

      await expect(saveContractTaskTemplateRpc({ nome: 'X' })).rejects.toMatchObject({ code: 'DUPLICATE_TEMPLATE' });
    });
  });

  describe('deleteContractTaskTemplateRpc', () => {
    it('deve mapear erro TEMPLATE_NOT_FOUND', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'TEMPLATE_NOT_FOUND: Template com ID "tpl-x" não encontrado.', code: 'P0002' }
      });

      await expect(deleteContractTaskTemplateRpc('tpl-x')).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
    });
  });

  describe('saveContractTaskTemplateMacrotaskRpc (criar macrotarefa)', () => {
    it('deve criar uma macrotarefa vinculada ao template', async () => {
      const mockResult = { success: true, macrotask: { id: 'tplmt-1', template_id: 'tpl-1', nome: 'Garantia Contratual', ordem: 0 } };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await saveContractTaskTemplateMacrotaskRpc({ templateId: 'tpl-1', nome: 'Garantia Contratual', ordem: 0 });

      expect(mockRpc).toHaveBeenCalledWith('save_contract_task_template_macrotask_atomic', {
        p_id: null,
        p_template_id: 'tpl-1',
        p_nome: 'Garantia Contratual',
        p_ordem: 0
      });
      expect(result.macrotask.nome).toBe('Garantia Contratual');
    });
  });

  describe('deleteContractTaskTemplateMacrotaskRpc', () => {
    it('deve chamar delete_contract_task_template_macrotask_atomic', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true, id: 'tplmt-1', message: 'ok' }, error: null });
      await deleteContractTaskTemplateMacrotaskRpc('tplmt-1');
      expect(mockRpc).toHaveBeenCalledWith('delete_contract_task_template_macrotask_atomic', { p_id: 'tplmt-1' });
    });
  });

  describe('saveContractTaskTemplateTaskRpc (criar tarefa)', () => {
    it('deve criar uma tarefa vinculada à macrotarefa', async () => {
      const mockResult = { success: true, task: { id: 'tplt-1', macrotask_id: 'tplmt-1', nome: 'Verificar se o Contrato possui Garantia Contratual', ordem: 0 } };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await saveContractTaskTemplateTaskRpc({ macrotaskId: 'tplmt-1', nome: 'Verificar se o Contrato possui Garantia Contratual' });

      expect(mockRpc).toHaveBeenCalledWith('save_contract_task_template_task_atomic', {
        p_id: null,
        p_macrotask_id: 'tplmt-1',
        p_nome: 'Verificar se o Contrato possui Garantia Contratual',
        p_ordem: 0
      });
      expect(result.task.id).toBe('tplt-1');
    });

    it('deve rejeitar se o nome da tarefa estiver vazio', async () => {
      await expect(saveContractTaskTemplateTaskRpc({ macrotaskId: 'tplmt-1', nome: '' })).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
    });
  });

  describe('deleteContractTaskTemplateTaskRpc', () => {
    it('deve mapear erro TEMPLATE_TASK_NOT_FOUND', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'TEMPLATE_TASK_NOT_FOUND: Tarefa de template com ID "x" não encontrada.', code: 'P0002' }
      });
      await expect(deleteContractTaskTemplateTaskRpc('x')).rejects.toMatchObject({ code: 'TEMPLATE_TASK_NOT_FOUND' });
    });
  });

  describe('applyContractTaskTemplateRpc (aplicar template a contrato)', () => {
    it('deve aplicar o template e retornar as contagens de macrotarefas e tarefas copiadas', async () => {
      const mockResult = {
        success: true,
        plan_id: 'plan-1',
        contract_key: '200331-15-2026',
        template_id: 'tpl-1',
        template_nome: 'Gestão de Contrato Administrativo',
        macrotasks_count: 8,
        tasks_count: 31,
        timestamp: '2026-09-22T12:00:00Z'
      };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await applyContractTaskTemplateRpc({ uasg: '200331', numero: '15', ano: 2026, templateId: 'tpl-1' });

      expect(mockRpc).toHaveBeenCalledWith('apply_contract_task_template_atomic', {
        p_uasg: '200331',
        p_numero: '15',
        p_ano: 2026,
        p_template_id: 'tpl-1'
      });
      expect(result.macrotasks_count).toBe(8);
      expect(result.tasks_count).toBe(31);
    });

    it('deve rejeitar aplicação sem template selecionado (aplicação inválida)', async () => {
      await expect(
        applyContractTaskTemplateRpc({ uasg: '200331', numero: '15', ano: 2026, templateId: '' })
      ).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('deve mapear erro CONTRACT_PLAN_ALREADY_EXISTS (aplicação inconsistente/duplicada)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'CONTRACT_PLAN_ALREADY_EXISTS: O contrato "200331-15-2026" já possui um plano de gestão aplicado.', code: '23505' }
      });

      await expect(
        applyContractTaskTemplateRpc({ uasg: '200331', numero: '15', ano: 2026, templateId: 'tpl-1' })
      ).rejects.toMatchObject({ code: 'CONTRACT_PLAN_ALREADY_EXISTS' });
    });
  });

  describe('updateContractTaskRpc (alterar status / concluir tarefa)', () => {
    it('deve alterar o status de uma tarefa para EM_ANDAMENTO', async () => {
      const mockResult = {
        success: true,
        task: {
          id: 'ctt-1', macrotask_id: 'ctmt-1', nome: 'Elaborar minuta', ordem: 0,
          status: 'EM_ANDAMENTO', responsavel_nome: 'João Silva', prazo: null, observacao: null,
          criado_em: 'x', atualizado_em: 'x', concluido_em: null, concluido_por: null
        }
      };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await updateContractTaskRpc({ taskId: 'ctt-1', status: 'EM_ANDAMENTO' });

      expect(mockRpc).toHaveBeenCalledWith('update_contract_task_atomic', {
        p_task_id: 'ctt-1',
        p_status: 'EM_ANDAMENTO',
        p_responsavel_nome: null,
        p_prazo: null,
        p_observacao: null,
        p_concluido_por: null
      });
      expect(result.task.status).toBe('EM_ANDAMENTO');
    });

    it('deve marcar uma tarefa como concluída', async () => {
      const mockResult = {
        success: true,
        task: {
          id: 'ctt-2', macrotask_id: 'ctmt-1', nome: 'Publicar contrato', ordem: 1,
          status: 'CONCLUIDA', responsavel_nome: 'João Silva', prazo: null, observacao: null,
          criado_em: 'x', atualizado_em: 'x', concluido_em: '2026-09-22T12:00:00Z', concluido_por: 'João Silva'
        }
      };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await updateContractTaskRpc({ taskId: 'ctt-2', status: 'CONCLUIDA' });

      expect(result.task.status).toBe('CONCLUIDA');
      expect(result.task.concluido_em).toBeTruthy();
    });

    it('deve mapear erro INVALID_TASK_STATUS', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'INVALID_TASK_STATUS: Status de tarefa inválido ("INVALIDO").', code: '22023' }
      });

      await expect(
        updateContractTaskRpc({ taskId: 'ctt-1', status: 'INVALIDO' as any })
      ).rejects.toMatchObject({ code: 'INVALID_TASK_STATUS' });
    });

    it('deve rejeitar se o ID da tarefa estiver vazio', async () => {
      await expect(updateContractTaskRpc({ taskId: '' })).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });
});
