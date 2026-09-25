import { describe, it, expect, beforeEach } from 'vitest';
import {
  fetchSystemRoles,
  saveSystemRole,
  deleteSystemRole,
  resetRolesInMemory,
  normalizeRolePermissions,
  resolveRoleLabel
} from '../roleService';

describe('roleService — Modelo Canônico de RBAC & Escopo', () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    resetRolesInMemory();
    for (const key in mockStorage) {
      delete mockStorage[key];
    }
    (globalThis as any).localStorage = {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => { mockStorage[k] = v; },
      removeItem: (k: string) => { delete mockStorage[k]; },
      clear: () => {
        for (const key in mockStorage) delete mockStorage[key];
      }
    };
  });

  describe('1. Perfis Nativos e Separação Permissão ≠ Escopo', () => {
    it('deve retornar os 3 perfis nativos com configurações canônicas', () => {
      const roles = fetchSystemRoles();
      expect(roles.length).toBeGreaterThanOrEqual(3);
      const ids = roles.map(r => r.id);
      expect(ids).toContain('coordenador');
      expect(ids).toContain('gestor');
      expect(ids).toContain('consulta');
    });

    it('coordenador deve possuir escopo GLOBAL e visualizarTodosContratos = true', () => {
      const roles = fetchSystemRoles();
      const coordenador = roles.find(r => r.id === 'coordenador');
      expect(coordenador).toBeDefined();
      expect(coordenador?.permissoes.contractScope).toBe('GLOBAL');
      expect(coordenador?.permissoes.visualizarTodosContratos).toBe(true);
      expect(coordenador?.permissoes.distribuirContratos).toBe(true);
      expect(coordenador?.permissoes.sincronizarEmpenhos).toBe(true);
    });

    it('gestor deve possuir escopo ASSIGNED e visualizarTodosContratos = false', () => {
      const roles = fetchSystemRoles();
      const gestor = roles.find(r => r.id === 'gestor');
      expect(gestor).toBeDefined();
      expect(gestor?.permissoes.contractScope).toBe('ASSIGNED');
      expect(gestor?.permissoes.visualizarTodosContratos).toBe(false);
      expect(gestor?.permissoes.visualizarContratos).toBe(true);
      expect(gestor?.permissoes.distribuirContratos).toBe(false);
    });

    it('consulta/auditoria deve possuir escopo GLOBAL (somente leitura) e visualizarTodosContratos = true', () => {
      const roles = fetchSystemRoles();
      const consulta = roles.find(r => r.id === 'consulta');
      expect(consulta).toBeDefined();
      expect(consulta?.permissoes.contractScope).toBe('GLOBAL');
      expect(consulta?.permissoes.visualizarTodosContratos).toBe(true);
      expect(consulta?.permissoes.editarTarefasContratuais).toBe(false);
      expect(consulta?.permissoes.distribuirContratos).toBe(false);
    });

    it('gestor deve ter sincronizarEmpenhos = true e consulta deve ter sincronizarEmpenhos = false', () => {
      const roles = fetchSystemRoles();
      const gestor = roles.find(r => r.id === 'gestor');
      const consulta = roles.find(r => r.id === 'consulta');

      expect(gestor?.permissoes.sincronizarEmpenhos).toBe(true);
      expect(consulta?.permissoes.sincronizarEmpenhos).toBe(false);
    });
  });

  describe('2. Normalização e Compatibilidade com Perfis Legados / LocalStorage', () => {
    it('perfil antigo sem contractScope deve receber fallback seguro ASSIGNED (menor privilégio)', () => {
      const legacyPerms = {
        distribuirContratos: false,
        editarTarefasContratuais: true,
        aplicarTemplates: false,
        visualizarTodosContratos: true // legado antigo com bug
      };

      const normalized = normalizeRolePermissions(legacyPerms, 'custom-legacy-123');

      // Não deve conceder GLOBAL silenciosamente para perfil com poderes operacionais
      expect(normalized.contractScope).toBe('ASSIGNED');
      expect(normalized.visualizarTodosContratos).toBe(false);
      expect(normalized.editarTarefasContratuais).toBe(true);
      expect(normalized.visualizarContratos).toBe(true);
    });

    it('perfil legado estritamente de consulta (somente leitura) preserva escopo GLOBAL', () => {
      const legacyReadOnly = {
        distribuirContratos: false,
        editarTarefasContratuais: false,
        aplicarTemplates: false,
        visualizarTodosContratos: true
      };

      const normalized = normalizeRolePermissions(legacyReadOnly, 'custom-auditoria');

      expect(normalized.contractScope).toBe('GLOBAL');
      expect(normalized.visualizarTodosContratos).toBe(true);
      expect(normalized.editarTarefasContratuais).toBe(false);
    });

    it('perfil com contractScope explícito deve ter sua escolha preservada', () => {
      const unitScoped = {
        contractScope: 'UNIT' as const,
        visualizarTodosContratos: false,
        distribuirContratos: false
      };

      const normalized = normalizeRolePermissions(unitScoped, 'custom-unit');
      expect(normalized.contractScope).toBe('UNIT');
      expect(normalized.visualizarTodosContratos).toBe(false);
    });

    it('perfil legado de gestor gravado em localStorage com visualizarTodosContratos: true deve ser saneado', () => {
      // Simula estado corrompido pré-existente no localStorage
      const corruptRoles = [
        {
          id: 'gestor',
          nome: 'Gestor de Contrato',
          badgeColor: '#0284c7',
          descricao: 'Gestor corrompido antigo',
          permissoes: {
            visualizarTodosContratos: true,
            distribuirContratos: false
          }
        }
      ];

      localStorage.setItem('saldoarp:system_roles', JSON.stringify(corruptRoles));

      const loadedRoles = fetchSystemRoles();
      const gestor = loadedRoles.find(r => r.id === 'gestor');

      expect(gestor?.permissoes.contractScope).toBe('ASSIGNED');
      expect(gestor?.permissoes.visualizarTodosContratos).toBe(false);
    });
  });

  describe('3. Criação, Atualização e Exclusão de Perfis Customizados', () => {
    it('deve criar um novo perfil customizado preservando permissões e aplicando defaults', () => {
      const newRole = saveSystemRole({
        nome: 'Fiscal Técnico Setorial',
        descricao: 'Fiscal designado para conferência técnica de entregáveis',
        badgeColor: '#10b981',
        permissoes: {
          contractScope: 'ASSIGNED',
          distribuirContratos: false,
          editarTarefasContratuais: true,
          aplicarTemplates: false,
          gerenciarDepartamentos: false,
          exportarRelatorios: true,
          visualizarTodosContratos: false,
          gerenciarUsuarios: false
        }
      });

      expect(newRole.id).toMatch(/^custom-/);
      expect(newRole.isCustom).toBe(true);
      expect(newRole.nome).toBe('Fiscal Técnico Setorial');
      expect(newRole.permissoes.contractScope).toBe('ASSIGNED');
      expect(newRole.permissoes.visualizarContratos).toBe(true);

      const allRoles = fetchSystemRoles();
      expect(allRoles.find(r => r.id === newRole.id)).toBeDefined();
    });

    it('deve atualizar um perfil existente mantendo coerência de permissões', () => {
      const custom = saveSystemRole({
        nome: 'Fiscal Administrativo',
        descricao: 'Perfil inicial',
        badgeColor: '#8b5cf6',
        permissoes: {
          contractScope: 'ASSIGNED',
          distribuirContratos: false,
          editarTarefasContratuais: true
        }
      });

      const updated = saveSystemRole({
        id: custom.id,
        nome: 'Fiscal Administrativo e Financeiro',
        descricao: 'Descrição atualizada',
        badgeColor: '#7c3aed',
        permissoes: {
          ...custom.permissoes,
          distribuirContratos: true
        }
      });

      expect(updated.nome).toBe('Fiscal Administrativo e Financeiro');
      expect(updated.permissoes.distribuirContratos).toBe(true);
      expect(updated.permissoes.contractScope).toBe('ASSIGNED');

      const allRoles = fetchSystemRoles();
      const found = allRoles.find(r => r.id === custom.id);
      expect(found?.nome).toBe('Fiscal Administrativo e Financeiro');
    });

    it('deve excluir perfis customizados mas proteger perfis nativos do sistema', () => {
      const custom = saveSystemRole({
        nome: 'Perfil Temporário',
        descricao: 'Para teste de exclusão',
        badgeColor: '#ec4899',
        permissoes: {
          contractScope: 'ASSIGNED'
        }
      });

      deleteSystemRole(custom.id);
      let all = fetchSystemRoles();
      expect(all.find(r => r.id === custom.id)).toBeUndefined();

      // Tentativa de excluir perfil nativo não deve ter efeito
      deleteSystemRole('coordenador');
      all = fetchSystemRoles();
      expect(all.find(r => r.id === 'coordenador')).toBeDefined();
    });
  });

  describe('resolveRoleLabel — rótulo real do perfil operacional (bug: Gestor Titular exibia cargo/departamento mock)', () => {
    it('resolve o nome real do perfil a partir do catálogo (ex.: "gestor" -> "Gestor / Fiscal de Contrato")', () => {
      const roles = fetchSystemRoles();
      expect(resolveRoleLabel(roles, 'gestor')).toBe('Gestor / Fiscal de Contrato');
      expect(resolveRoleLabel(roles, 'coordenador')).toBe('Coordenador / Diretor');
      expect(resolveRoleLabel(roles, 'consulta')).toBe('Consulta / Auditoria');
    });

    it('cai para o próprio id do perfil quando ele não existe mais no catálogo (nunca inventa um rótulo)', () => {
      const roles = fetchSystemRoles();
      expect(resolveRoleLabel(roles, 'perfil-removido')).toBe('perfil-removido');
    });

    it('retorna um rótulo neutro quando o usuário não tem perfil definido', () => {
      const roles = fetchSystemRoles();
      expect(resolveRoleLabel(roles, undefined)).toBe('Sem perfil definido');
      expect(resolveRoleLabel(roles, null)).toBe('Sem perfil definido');
    });
  });
});
