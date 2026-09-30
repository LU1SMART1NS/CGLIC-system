import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  startContractTaskPlanRpc,
  saveContractTaskMacrotaskRpc,
  deleteContractTaskMacrotaskRpc,
  createContractTaskRpc,
  deleteContractTaskRpc,
  updateContractTaskRpc
} from '../contractManagementRpcAdapter';
import {
  startAtaTaskPlanRpc,
  saveAtaTaskMacrotaskRpc,
  deleteAtaTaskMacrotaskRpc,
  createAtaTaskRpc,
  deleteAtaTaskRpc,
  updateAtaTaskRpc
} from '../ataManagementRpcAdapter';
import * as supabaseClientModule from '../../services/supabaseClient';

describe('Plano de gestão editável pelo gestor (adapters)', () => {
  let mockRpc: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    vi.spyOn(supabaseClientModule, 'isSupabaseConfigured', 'get').mockReturnValue(true);
    vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue({ rpc: mockRpc } as any);
  });

  describe('contratos', () => {
    it('inicia plano vazio', async () => {
      await startContractTaskPlanRpc({ uasg: ' 200331 ', numero: '15', ano: 2026 });
      expect(mockRpc).toHaveBeenCalledWith('start_contract_task_plan_atomic', {
        p_uasg: '200331', p_numero: '15', p_ano: 2026
      });
    });

    it('cria etapa no plano e renomeia etapa existente', async () => {
      await saveContractTaskMacrotaskRpc({ planId: 'plan-1', nome: ' Nova etapa ' });
      expect(mockRpc).toHaveBeenLastCalledWith('save_contract_task_macrotask_atomic', {
        p_id: null, p_plan_id: 'plan-1', p_nome: 'Nova etapa'
      });
      await saveContractTaskMacrotaskRpc({ id: 'ctmt-1', nome: 'Renomeada' });
      expect(mockRpc).toHaveBeenLastCalledWith('save_contract_task_macrotask_atomic', {
        p_id: 'ctmt-1', p_plan_id: null, p_nome: 'Renomeada'
      });
    });

    it('cria tarefa avulsa', async () => {
      await createContractTaskRpc({ macrotaskId: 'ctmt-1', nome: ' Pedir parecer ', prazo: '2026-12-01' });
      expect(mockRpc).toHaveBeenCalledWith('create_contract_task_atomic', {
        p_macrotask_id: 'ctmt-1',
        p_nome: 'Pedir parecer',
        p_prazo: '2026-12-01',
        p_observacao: null,
        p_responsavel_nome: null
      });
    });

    it('exclui tarefa e etapa', async () => {
      await deleteContractTaskRpc('ctt-1');
      expect(mockRpc).toHaveBeenLastCalledWith('delete_contract_task_atomic', { p_id: 'ctt-1' });
      await deleteContractTaskMacrotaskRpc('ctmt-1');
      expect(mockRpc).toHaveBeenLastCalledWith('delete_contract_task_macrotask_atomic', { p_id: 'ctmt-1' });
    });

    it('rejeita nome vazio e ids vazios sem chamar a RPC', async () => {
      await expect(createContractTaskRpc({ macrotaskId: 'ctmt-1', nome: '  ' })).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
      await expect(saveContractTaskMacrotaskRpc({ planId: 'p', nome: '' })).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
      await expect(deleteContractTaskRpc('')).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('update: string vazia limpa o responsável (herda o gestor); undefined mantém; nome é encaminhado', async () => {
      await updateContractTaskRpc({ taskId: 'ctt-1', responsavelNome: '', nome: ' Novo nome ' });
      expect(mockRpc).toHaveBeenLastCalledWith('update_contract_task_atomic', expect.objectContaining({
        p_responsavel_nome: '', p_nome: 'Novo nome'
      }));
      await updateContractTaskRpc({ taskId: 'ctt-1', status: 'CONCLUIDA' });
      expect(mockRpc).toHaveBeenLastCalledWith('update_contract_task_atomic', expect.objectContaining({
        p_responsavel_nome: null, p_nome: null
      }));
    });
  });

  describe('atas', () => {
    it('inicia plano vazio', async () => {
      await startAtaTaskPlanRpc({ ataKey: ' 12/2025 ' });
      expect(mockRpc).toHaveBeenCalledWith('start_ata_task_plan_atomic', { p_ata_key: '12/2025' });
    });

    it('cria/renomeia/exclui etapa', async () => {
      await saveAtaTaskMacrotaskRpc({ planId: 'ataplan-1', nome: 'Etapa' });
      expect(mockRpc).toHaveBeenLastCalledWith('save_ata_task_macrotask_atomic', {
        p_id: null, p_plan_id: 'ataplan-1', p_nome: 'Etapa'
      });
      await deleteAtaTaskMacrotaskRpc('atmt-1');
      expect(mockRpc).toHaveBeenLastCalledWith('delete_ata_task_macrotask_atomic', { p_id: 'atmt-1' });
    });

    it('cria e exclui tarefa avulsa', async () => {
      await createAtaTaskRpc({ macrotaskId: 'atmt-1', nome: 'Conferir saldo', observacao: 'x' });
      expect(mockRpc).toHaveBeenLastCalledWith('create_ata_task_atomic', {
        p_macrotask_id: 'atmt-1', p_nome: 'Conferir saldo', p_prazo: null, p_observacao: 'x', p_responsavel_nome: null
      });
      await deleteAtaTaskRpc('at-1');
      expect(mockRpc).toHaveBeenLastCalledWith('delete_ata_task_atomic', { p_id: 'at-1' });
    });

    it('update: string vazia limpa o responsável', async () => {
      await updateAtaTaskRpc({ taskId: 'at-1', responsavelNome: '' });
      expect(mockRpc).toHaveBeenLastCalledWith('update_ata_task_atomic', expect.objectContaining({ p_responsavel_nome: '' }));
    });
  });
});
