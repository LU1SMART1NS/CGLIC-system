import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveAtaTaskTemplateRpc,
  deleteAtaTaskTemplateRpc,
  saveAtaTaskTemplateMacrotaskRpc,
  deleteAtaTaskTemplateMacrotaskRpc,
  saveAtaTaskTemplateTaskRpc,
  deleteAtaTaskTemplateTaskRpc,
  applyAtaTaskTemplateRpc,
  updateAtaTaskRpc
} from '../ataManagementRpcAdapter';
import * as supabaseClientModule from '../../services/supabaseClient';

describe('ataManagementRpcAdapter', () => {
  let mockRpc: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = vi.fn();
    const mockSupabase = { rpc: mockRpc } as any;
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
    vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase);
  });

  describe('saveAtaTaskTemplateRpc (criar template)', () => {
    it('deve criar um template com sucesso', async () => {
      const mockResult = {
        success: true,
        template: { id: 'atatpl-1', nome: 'Gestão de Ata de Equipamentos', descricao: null, ativo: true, created_at: 'x', updated_at: 'x' }
      };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await saveAtaTaskTemplateRpc({ nome: 'Gestão de Ata de Equipamentos', ativo: true });

      expect(mockRpc).toHaveBeenCalledWith('save_ata_task_template_atomic', {
        p_id: null,
        p_nome: 'Gestão de Ata de Equipamentos',
        p_descricao: null,
        p_ativo: true
      });
      expect(result.template.id).toBe('atatpl-1');
    });

    it('deve mapear erro DUPLICATE_TEMPLATE', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'DUPLICATE_TEMPLATE: Já existe um template cadastrado com o nome "X".', code: '23505' }
      });

      await expect(saveAtaTaskTemplateRpc({ nome: 'X' })).rejects.toMatchObject({ code: 'DUPLICATE_TEMPLATE' });
    });

    it('deve rejeitar se o nome do template estiver vazio', async () => {
      await expect(saveAtaTaskTemplateRpc({ nome: '  ' })).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('deleteAtaTaskTemplateRpc', () => {
    it('deve mapear erro TEMPLATE_NOT_FOUND', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'TEMPLATE_NOT_FOUND: Template com ID "atatpl-x" não encontrado.', code: 'P0002' }
      });

      await expect(deleteAtaTaskTemplateRpc('atatpl-x')).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
    });
  });

  describe('saveAtaTaskTemplateMacrotaskRpc (criar macrotarefa)', () => {
    it('deve criar uma macrotarefa vinculada ao template', async () => {
      const mockResult = { success: true, macrotask: { id: 'atatplmt-1', template_id: 'atatpl-1', nome: 'Planejamento de Prorrogação', ordem: 0 } };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await saveAtaTaskTemplateMacrotaskRpc({ templateId: 'atatpl-1', nome: 'Planejamento de Prorrogação', ordem: 0 });

      expect(mockRpc).toHaveBeenCalledWith('save_ata_task_template_macrotask_atomic', {
        p_id: null,
        p_template_id: 'atatpl-1',
        p_nome: 'Planejamento de Prorrogação',
        p_ordem: 0
      });
      expect(result.macrotask.nome).toBe('Planejamento de Prorrogação');
    });
  });

  describe('deleteAtaTaskTemplateMacrotaskRpc', () => {
    it('deve chamar delete_ata_task_template_macrotask_atomic', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true, id: 'atatplmt-1', message: 'ok' }, error: null });
      await deleteAtaTaskTemplateMacrotaskRpc('atatplmt-1');
      expect(mockRpc).toHaveBeenCalledWith('delete_ata_task_template_macrotask_atomic', { p_id: 'atatplmt-1' });
    });
  });

  describe('saveAtaTaskTemplateTaskRpc (criar tarefa)', () => {
    it('deve criar uma tarefa vinculada à macrotarefa', async () => {
      const mockResult = { success: true, task: { id: 'atatplt-1', macrotask_id: 'atatplmt-1', nome: 'Verificar saldo físico', ordem: 0 } };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await saveAtaTaskTemplateTaskRpc({ macrotaskId: 'atatplmt-1', nome: 'Verificar saldo físico' });

      expect(mockRpc).toHaveBeenCalledWith('save_ata_task_template_task_atomic', {
        p_id: null,
        p_macrotask_id: 'atatplmt-1',
        p_nome: 'Verificar saldo físico',
        p_ordem: 0,
        p_execution_mode: null
      });
      expect(result.task.id).toBe('atatplt-1');
    });

    it('deve encaminhar executionMode ao criar uma tarefa de template', async () => {
      const mockResult = {
        success: true,
        task: { id: 'atatplt-2', macrotask_id: 'atatplmt-1', nome: 'Consultar PNCP', ordem: 1, execution_mode: 'EXTERNA' }
      };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await saveAtaTaskTemplateTaskRpc({
        macrotaskId: 'atatplmt-1',
        nome: 'Consultar PNCP',
        ordem: 1,
        executionMode: 'EXTERNA'
      });

      expect(mockRpc).toHaveBeenCalledWith('save_ata_task_template_task_atomic', expect.objectContaining({
        p_execution_mode: 'EXTERNA'
      }));
      expect(result.task.execution_mode).toBe('EXTERNA');
    });

    it('deve rejeitar se o nome da tarefa estiver vazio', async () => {
      await expect(saveAtaTaskTemplateTaskRpc({ macrotaskId: 'atatplmt-1', nome: '' })).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
    });
  });

  describe('deleteAtaTaskTemplateTaskRpc', () => {
    it('deve mapear erro TEMPLATE_TASK_NOT_FOUND', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'TEMPLATE_TASK_NOT_FOUND: Tarefa de template com ID "x" não encontrada.', code: 'P0002' }
      });
      await expect(deleteAtaTaskTemplateTaskRpc('x')).rejects.toMatchObject({ code: 'TEMPLATE_TASK_NOT_FOUND' });
    });
  });

  describe('applyAtaTaskTemplateRpc (aplicar template a uma Ata)', () => {
    it('deve aplicar o template e retornar as contagens de macrotarefas e tarefas copiadas', async () => {
      const mockResult = {
        success: true,
        plan_id: 'ataplan-1',
        ata_key: '00011/2026',
        template_id: 'atatpl-1',
        template_nome: 'Gestão de Ata de Equipamentos',
        macrotasks_count: 4,
        tasks_count: 12,
        timestamp: '2026-09-30T12:00:00Z'
      };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await applyAtaTaskTemplateRpc({ ataKey: '00011/2026', templateId: 'atatpl-1' });

      expect(mockRpc).toHaveBeenCalledWith('apply_ata_task_template_atomic', {
        p_ata_key: '00011/2026',
        p_template_id: 'atatpl-1'
      });
      expect(result.macrotasks_count).toBe(4);
      expect(result.tasks_count).toBe(12);
    });

    it('deve rejeitar aplicação sem template selecionado', async () => {
      await expect(
        applyAtaTaskTemplateRpc({ ataKey: '00011/2026', templateId: '' })
      ).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('deve rejeitar aplicação sem ataKey', async () => {
      await expect(
        applyAtaTaskTemplateRpc({ ataKey: '', templateId: 'atatpl-1' })
      ).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('deve mapear erro ATA_PLAN_ALREADY_EXISTS (aplicação duplicada)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'ATA_PLAN_ALREADY_EXISTS: A Ata "00011/2026" já possui um plano de gestão aplicado.', code: '23505' }
      });

      await expect(
        applyAtaTaskTemplateRpc({ ataKey: '00011/2026', templateId: 'atatpl-1' })
      ).rejects.toMatchObject({ code: 'ATA_PLAN_ALREADY_EXISTS' });
    });
  });

  describe('updateAtaTaskRpc (alterar status / concluir tarefa)', () => {
    it('deve alterar o status de uma tarefa para EM_ANDAMENTO', async () => {
      const mockResult = {
        success: true,
        task: {
          id: 'at-1', macrotask_id: 'atmt-1', nome: 'Verificar adesões', ordem: 0,
          status: 'EM_ANDAMENTO', responsavel_nome: 'João Silva', prazo: null, observacao: null,
          criado_em: 'x', atualizado_em: 'x', concluido_em: null, concluido_por: null
        }
      };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await updateAtaTaskRpc({ taskId: 'at-1', status: 'EM_ANDAMENTO' });

      expect(mockRpc).toHaveBeenCalledWith('update_ata_task_atomic', {
        p_task_id: 'at-1',
        p_status: 'EM_ANDAMENTO',
        p_responsavel_nome: null,
        p_prazo: null,
        p_observacao: null,
        p_concluido_por: null,
        p_responsavel_user_id: null,
        p_nome: null
      });
      expect(result.task.status).toBe('EM_ANDAMENTO');
    });

    it('deve marcar uma tarefa como concluída', async () => {
      const mockResult = {
        success: true,
        task: {
          id: 'at-2', macrotask_id: 'atmt-1', nome: 'Publicar aditivo', ordem: 1,
          status: 'CONCLUIDA', responsavel_nome: 'João Silva', prazo: null, observacao: null,
          criado_em: 'x', atualizado_em: 'x', concluido_em: '2026-09-30T12:00:00Z', concluido_por: 'João Silva'
        }
      };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await updateAtaTaskRpc({ taskId: 'at-2', status: 'CONCLUIDA' });

      expect(result.task.status).toBe('CONCLUIDA');
      expect(result.task.concluido_em).toBeTruthy();
    });

    it('deve encaminhar responsavelUserId, preservando responsavelNome legado', async () => {
      const mockResult = {
        success: true,
        task: {
          id: 'at-3', macrotask_id: 'atmt-1', nome: 'Analisar processo', ordem: 1,
          status: 'EM_ANDAMENTO', responsavel_nome: 'Maria Souza', responsavel_user_id: 'user-uuid-123',
          prazo: null, observacao: null, criado_em: 'x', atualizado_em: 'x', concluido_em: null, concluido_por: null
        }
      };
      mockRpc.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await updateAtaTaskRpc({
        taskId: 'at-3',
        status: 'EM_ANDAMENTO',
        responsavelNome: 'Maria Souza',
        responsavelUserId: 'user-uuid-123'
      });

      expect(mockRpc).toHaveBeenCalledWith('update_ata_task_atomic', expect.objectContaining({
        p_responsavel_nome: 'Maria Souza',
        p_responsavel_user_id: 'user-uuid-123'
      }));
      expect(result.task.responsavel_user_id).toBe('user-uuid-123');
      expect(result.task.responsavel_nome).toBe('Maria Souza');
    });

    it('deve mapear erro INVALID_TASK_STATUS', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'INVALID_TASK_STATUS: Status de tarefa inválido ("INVALIDO").', code: '22023' }
      });

      await expect(
        updateAtaTaskRpc({ taskId: 'at-1', status: 'INVALIDO' as any })
      ).rejects.toMatchObject({ code: 'INVALID_TASK_STATUS' });
    });

    it('deve rejeitar se o ID da tarefa estiver vazio', async () => {
      await expect(updateAtaTaskRpc({ taskId: '' })).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });
});
