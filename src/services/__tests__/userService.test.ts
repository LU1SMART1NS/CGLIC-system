import { describe, it, expect, beforeEach } from 'vitest';
import { fetchSystemUsers, saveSystemUser, deleteSystemUser, resetUsersInMemory } from '../userService';

describe('userService - Testes Unitários de Gestão de Usuários e Perfis', () => {
  beforeEach(() => {
    resetUsersInMemory();
  });

  it('deve retornar lista vazia (sem usuários de demonstração) quando storage estiver vazio', () => {
    const users = fetchSystemUsers();
    expect(users).toEqual([]);
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

  it('deve consolidar por e-mail (não duplicar) ao editar um usuário real cujo único registro local tem outro id', () => {
    // Simula o cenário de um usuário do Supabase (id em UUID) cujo registro local
    // preexistente foi salvo com um id diferente (ex.: um id sintético antigo).
    const legacyLocal = saveSystemUser({
      nome: 'Nome Antigo',
      email: 'servidor.real@mj.gov.br',
      perfil: 'gestor',
      ativo: true
    });

    const realSupabaseId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(legacyLocal.id).not.toBe(realSupabaseId);

    const updated = saveSystemUser({
      id: realSupabaseId,
      nome: 'Nome Novo',
      email: 'servidor.real@mj.gov.br',
      perfil: 'coordenador',
      ativo: true
    });

    expect(updated.nome).toBe('Nome Novo');
    expect(updated.id).toBe(realSupabaseId);

    const list = fetchSystemUsers();
    const matches = list.filter(u => u.email.toLowerCase() === 'servidor.real@mj.gov.br');
    expect(matches).toHaveLength(1);
    expect(matches[0].nome).toBe('Nome Novo');
    expect(matches[0].id).toBe(realSupabaseId);
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
