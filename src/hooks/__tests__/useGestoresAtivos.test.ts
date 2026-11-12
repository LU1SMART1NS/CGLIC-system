import { describe, it, expect } from 'vitest';
import { atribuicaoValida, idsDosGestoresAtivos } from '../useGestoresAtivos';
import type { SystemUser } from '../../types/user';

const usuario = (id: string, perfil: string, ativo = true) => ({ id, perfil, ativo }) as unknown as SystemUser;

describe('gestores ativos nas carteiras', () => {
  it('só gestor ativo entra; coordenador, consulta e inativo ficam de fora', () => {
    const ids = idsDosGestoresAtivos([usuario('g1', 'gestor'), usuario('g2', 'gestor', false), usuario('c1', 'coordenador'), usuario('l1', 'consulta')]);
    expect([...(ids || [])]).toEqual(['g1']);
  });

  it('atribuição a quem virou coordenador vale como "Sem gestor"', () => {
    const ids = idsDosGestoresAtivos([usuario('g1', 'gestor'), usuario('c1', 'coordenador')]);
    expect(atribuicaoValida('g1', ids)).toBe(true);
    expect(atribuicaoValida('c1', ids)).toBe(false);
  });

  it('sem a lista de usuários (carregando ou perfil sem acesso), a atribuição vale como está', () => {
    expect(idsDosGestoresAtivos(undefined)).toBeNull();
    expect(atribuicaoValida('c1', null)).toBe(true);
  });
});
