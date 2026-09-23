import { describe, it, expect, beforeEach } from 'vitest';
import {
  fetchSystemRoles,
  saveSystemRole,
  deleteSystemRole,
  resetRolesInMemory
} from '../roleService';

describe('roleService', () => {
  beforeEach(() => {
    resetRolesInMemory();
  });

  it('should return initial 3 system roles by default', () => {
    const roles = fetchSystemRoles();
    expect(roles.length).toBeGreaterThanOrEqual(3);
    const ids = roles.map(r => r.id);
    expect(ids).toContain('coordenador');
    expect(ids).toContain('gestor');
    expect(ids).toContain('consulta');
  });

  it('should create a new custom role', () => {
    const newRole = saveSystemRole({
      nome: 'Fiscal Técnico Setorial',
      descricao: 'Fiscal designado para conferência técnica de entregáveis',
      badgeColor: '#10b981',
      permissoes: {
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

    const allRoles = fetchSystemRoles();
    expect(allRoles.find(r => r.id === newRole.id)).toBeDefined();
  });

  it('should update an existing role', () => {
    const custom = saveSystemRole({
      nome: 'Fiscal Administrativo',
      descricao: 'Perfil inicial',
      badgeColor: '#8b5cf6',
      permissoes: {
        distribuirContratos: false,
        editarTarefasContratuais: true,
        aplicarTemplates: false,
        gerenciarDepartamentos: false,
        exportarRelatorios: true,
        visualizarTodosContratos: true,
        gerenciarUsuarios: false
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

    const allRoles = fetchSystemRoles();
    const found = allRoles.find(r => r.id === custom.id);
    expect(found?.nome).toBe('Fiscal Administrativo e Financeiro');
  });

  it('should delete custom roles but not standard system roles', () => {
    const custom = saveSystemRole({
      nome: 'Perfil Temporario',
      descricao: 'Para teste de exclusão',
      badgeColor: '#ec4899',
      permissoes: {
        distribuirContratos: false,
        editarTarefasContratuais: false,
        aplicarTemplates: false,
        gerenciarDepartamentos: false,
        exportarRelatorios: false,
        visualizarTodosContratos: false,
        gerenciarUsuarios: false
      }
    });

    deleteSystemRole(custom.id);
    let all = fetchSystemRoles();
    expect(all.find(r => r.id === custom.id)).toBeUndefined();

    // Trying to delete system role should do nothing
    deleteSystemRole('coordenador');
    all = fetchSystemRoles();
    expect(all.find(r => r.id === 'coordenador')).toBeDefined();
  });
});
