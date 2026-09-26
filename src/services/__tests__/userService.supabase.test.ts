import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token-123' } } })
    },
    functions: {
      invoke: vi.fn()
    }
  }
}));

import {
  inviteSystemUser,
  saveSystemUserAsync,
  deleteSystemUserAsync,
  deactivateSystemUser,
  reactivateSystemUser,
  resetUsersInMemory,
  fetchSystemUsers
} from '../userService';
import { supabase } from '../supabaseClient';

const invokeMock = supabase!.functions.invoke as ReturnType<typeof vi.fn>;

describe('userService — integração com Supabase (convite, papéis e desativação)', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const localStorageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] || null),
      setItem: vi.fn((key: string, val: string) => { mockStorage[key] = val; }),
      removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
      clear: vi.fn(() => { mockStorage = {}; }),
      length: 0,
      key: vi.fn()
    };
    vi.stubGlobal('localStorage', localStorageMock);
    invokeMock.mockReset();
    resetUsersInMemory();
  });

  describe('inviteSystemUser', () => {
    it('propaga o erro da Edge Function em vez de salvar um registro local falso de "sucesso"', async () => {
      invokeMock.mockResolvedValue({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: { json: async () => ({ error: 'Acesso negado. Apenas gestores e administradores podem convidar usuários.' }) }
        }
      });

      await expect(
        inviteSystemUser({ email: 'novo@mj.gov.br', nome: 'Novo Servidor', perfil: 'gestor' })
      ).rejects.toThrow('Acesso negado. Apenas gestores e administradores podem convidar usuários.');
    });

    it('grava o usuário localmente apenas quando a Edge Function confirma sucesso', async () => {
      invokeMock.mockResolvedValue({
        data: { success: true, user: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } },
        error: null
      });

      const created = await inviteSystemUser({ email: 'novo@mj.gov.br', nome: 'Novo Servidor', perfil: 'gestor' });

      expect(created.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(created.status).toBe('pendente');
    });
  });

  describe('saveSystemUserAsync', () => {
    it('sincroniza o novo nome e perfil no backend antes de salvar localmente para contas reais do Supabase (id em UUID)', async () => {
      invokeMock.mockResolvedValue({ data: { success: true }, error: null });

      await saveSystemUserAsync({
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        nome: 'Servidor Real Atualizado',
        email: 'real@mj.gov.br',
        perfil: 'coordenador'
      });

      expect(invokeMock).toHaveBeenCalledWith('manage-user', expect.objectContaining({
        body: expect.objectContaining({
          action: 'update-user',
          userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          nome: 'Servidor Real Atualizado',
          email: 'real@mj.gov.br',
          perfil: 'coordenador'
        })
      }));
    });

    it('não chama o backend para registros locais de demonstração (id fora do padrão UUID)', async () => {
      await saveSystemUserAsync({
        id: 'user-1',
        nome: 'Carlos Silva',
        email: 'carlos.silva@mj.gov.br',
        perfil: 'coordenador'
      });

      expect(invokeMock).not.toHaveBeenCalled();
    });

    it('propaga o erro do backend sem persistir a alteração local quando a sincronização de papel falha', async () => {
      invokeMock.mockResolvedValue({
        data: null,
        error: { message: 'Falha', context: { json: async () => ({ error: 'Apenas administradores podem atribuir o perfil de administrador.' }) } }
      });

      await expect(
        saveSystemUserAsync({
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          nome: 'Servidor Real',
          email: 'real@mj.gov.br',
          perfil: 'coordenador'
        })
      ).rejects.toThrow('Apenas administradores podem atribuir o perfil de administrador.');
    });
  });

  describe('deleteSystemUserAsync', () => {
    const realUser = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      nome: 'Servidor Convidado',
      email: 'convidado@mj.gov.br',
      perfil: 'gestor' as const,
      ativo: true,
      status: 'pendente' as const
    };

    it('chama manage-user com action delete-user para usuários reais do Supabase e remove do storage local', async () => {
      invokeMock.mockResolvedValue({ data: { success: true }, error: null });

      await deleteSystemUserAsync(realUser);

      expect(invokeMock).toHaveBeenCalledWith('manage-user', expect.objectContaining({
        body: { action: 'delete-user', userId: realUser.id }
      }));
      expect(fetchSystemUsers().find(u => u.id === realUser.id)).toBeUndefined();
    });

    it('apenas remove localmente quando for usuário de demonstração', async () => {
      const demoUser = {
        id: 'user-1',
        nome: 'Carlos Silva',
        email: 'carlos.silva@mj.gov.br',
        perfil: 'gestor' as const,
        ativo: true
      };

      await deleteSystemUserAsync(demoUser);

      expect(invokeMock).not.toHaveBeenCalled();
      expect(fetchSystemUsers().find(u => u.id === 'user-1')).toBeUndefined();
    });
  });

  describe('deactivateSystemUser / reactivateSystemUser', () => {
    const realUser = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      nome: 'Servidor Real',
      email: 'real@mj.gov.br',
      perfil: 'gestor' as const,
      ativo: true
    };

    it('revoga o acesso real no Supabase (ban) antes de marcar o usuário como inativo localmente', async () => {
      invokeMock.mockResolvedValue({ data: { success: true }, error: null });

      const result = await deactivateSystemUser(realUser);

      expect(invokeMock).toHaveBeenCalledWith('manage-user', expect.objectContaining({
        body: { action: 'deactivate', userId: realUser.id }
      }));
      expect(result.ativo).toBe(false);
      expect(result.status).toBe('inativo');
    });

    it('reativa o acesso real no Supabase antes de marcar o usuário como ativo localmente', async () => {
      invokeMock.mockResolvedValue({ data: { success: true }, error: null });

      const result = await reactivateSystemUser({ ...realUser, ativo: false, status: 'inativo' });

      expect(invokeMock).toHaveBeenCalledWith('manage-user', expect.objectContaining({
        body: { action: 'reactivate', userId: realUser.id }
      }));
      expect(result.ativo).toBe(true);
      expect(result.status).toBe('ativo');
    });

    it('não revoga acesso real ao desativar um registro local de demonstração, mas atualiza o estado local', async () => {
      const localOnlyUser = { ...realUser, id: 'user-4' };

      const result = await deactivateSystemUser(localOnlyUser);

      expect(invokeMock).not.toHaveBeenCalled();
      expect(result.ativo).toBe(false);
    });
  });
});
