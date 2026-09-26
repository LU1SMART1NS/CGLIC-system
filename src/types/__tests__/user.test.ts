import { describe, it, expect } from 'vitest';
import {
  getPerfilDisplayLabel,
  UNASSIGNED_ROLE_ID,
  UNASSIGNED_ROLE_LABEL,
  SYSTEM_ROLES,
  type RoleDefinition
} from '../user';

describe('getPerfilDisplayLabel — Fase 0.2 (representação de usuário sem role)', () => {
  const roles: RoleDefinition[] = SYSTEM_ROLES;

  it('Caso 1: usuário com role "gestor" continua sendo apresentado como "Gestor / Fiscal de Contrato"', () => {
    expect(getPerfilDisplayLabel('gestor', roles)).toBe('Gestor / Fiscal de Contrato');
  });

  it('Caso 2: usuário com role "consulta" (leitor) continua sendo apresentado corretamente', () => {
    expect(getPerfilDisplayLabel('consulta', roles)).toBe('Consulta / Auditoria');
  });

  it('Caso 3: usuário com role "coordenador" (admin) continua sendo apresentado corretamente', () => {
    expect(getPerfilDisplayLabel('coordenador', roles)).toBe('Coordenador / Diretor');
  });

  it('Caso 4: usuário sem nenhuma role -> "Não atribuído", NUNCA "gestor" ou qualquer rótulo de gestor', () => {
    const label = getPerfilDisplayLabel(UNASSIGNED_ROLE_ID, roles);
    expect(label).toBe('Não atribuído');
    expect(label).toBe(UNASSIGNED_ROLE_LABEL);
    expect(label.toLowerCase()).not.toContain('gestor');
  });

  it('nunca resolve o sentinel de "sem role" para o rótulo de um perfil real', () => {
    for (const role of roles) {
      expect(getPerfilDisplayLabel(UNASSIGNED_ROLE_ID, roles)).not.toBe(role.nome);
    }
  });

  it('perfil customizado/desconhecido sem correspondência em `roles` exibe o próprio id como fallback (comportamento pré-existente, não é o sentinel)', () => {
    expect(getPerfilDisplayLabel('custom-123-abc', roles)).toBe('custom-123-abc');
  });

  it('o sentinel UNASSIGNED_ROLE_ID nunca aparece no catálogo de perfis atribuíveis (SYSTEM_ROLES)', () => {
    expect(roles.some(r => r.id === UNASSIGNED_ROLE_ID)).toBe(false);
  });
});
