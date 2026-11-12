import { describe, it, expect } from 'vitest';
import { atribuicaoValida, idsDosGestoresAtivos, outrosPerfisComCarteira } from '../useGestoresAtivos';
import type { SystemUser } from '../../types/user';

const usuario = (id: string, perfil: string, ativo = true) => ({ id, perfil, ativo }) as unknown as SystemUser;

describe('gestores ativos nas carteiras', () => {
  it('gestor e coordenador ativos entram; consulta e inativo ficam de fora', () => {
    const ids = idsDosGestoresAtivos([usuario('g1', 'gestor'), usuario('g2', 'gestor', false), usuario('c1', 'coordenador'), usuario('c2', 'coordenador', false), usuario('l1', 'consulta')]);
    expect([...(ids || [])]).toEqual(['g1', 'c1']);
  });

  it('atribuição ao coordenador continua com ele; a de quem foi inativado vale como "Sem gestor"', () => {
    const ids = idsDosGestoresAtivos([usuario('g1', 'gestor'), usuario('g2', 'gestor', false), usuario('c1', 'coordenador')]);
    expect(atribuicaoValida('c1', ids)).toBe(true);
    expect(atribuicaoValida('g2', ids)).toBe(false);
  });

  it('coordenador ativo leva a etiqueta "Coordenador"', () => {
    const m = outrosPerfisComCarteira([usuario('g1', 'gestor'), usuario('c1', 'coordenador'), usuario('c2', 'coordenador', false)]);
    expect([...m]).toEqual([['c1', 'Coordenador']]);
  });

  it('sem a lista de usuários (carregando ou perfil sem acesso), a atribuição vale como está', () => {
    expect(idsDosGestoresAtivos(undefined)).toBeNull();
    expect(atribuicaoValida('c1', null)).toBe(true);
  });
});
