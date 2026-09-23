import { describe, it, expect, beforeEach } from 'vitest';
import { fetchSystemUsers, saveSystemUser, deleteSystemUser, resetUsersInMemory } from '../userService';

describe('userService - Testes Unitários de Gestão de Usuários e Perfis', () => {
  beforeEach(() => {
    resetUsersInMemory();
  });

  it('deve retornar lista inicial padrão se storage estiver vazio', () => {
    const users = fetchSystemUsers();
    expect(users.length).toBeGreaterThan(0);
    expect(users.some(u => u.perfil === 'coordenador')).toBe(true);
    expect(users.some(u => u.perfil === 'gestor')).toBe(true);
  });

  it('deve criar um novo usuário com perfil atribuído corretamente', () => {
    const created = saveSystemUser({
      nome: 'José Oliveira',
      email: 'jose.oliveira@mj.gov.br',
      cargo: 'Auditor',
      departamento: 'CGLIC',
      perfil: 'gestor',
      ativo: true
    });

    expect(created.id).toBeDefined();
    expect(created.nome).toBe('José Oliveira');
    expect(created.perfil).toBe('gestor');

    const list = fetchSystemUsers();
    expect(list.some(u => u.id === created.id)).toBe(true);
  });

  it('deve atualizar um usuário existente', () => {
    const created = saveSystemUser({
      nome: 'Mariana Lima',
      email: 'mariana.lima@mj.gov.br',
      perfil: 'consulta',
      ativo: true
    });

    const updated = saveSystemUser({
      id: created.id,
      nome: 'Mariana Lima Santos',
      email: 'mariana.lima@mj.gov.br',
      perfil: 'coordenador',
      ativo: true
    });

    expect(updated.nome).toBe('Mariana Lima Santos');
    expect(updated.perfil).toBe('coordenador');
  });

  it('deve remover um usuário corretamente', () => {
    const created = saveSystemUser({
      nome: 'Temporario Teste',
      email: 'temp@mj.gov.br',
      perfil: 'consulta'
    });

    deleteSystemUser(created.id);
    const list = fetchSystemUsers();
    expect(list.some(u => u.id === created.id)).toBe(false);
  });
});
