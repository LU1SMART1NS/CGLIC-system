import { describe, it, expect } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { temSenhaPendente } from '../senhaPendente';

const com = (user_metadata: Record<string, unknown>) => ({ id: 'u', user_metadata }) as unknown as User;

describe('temSenhaPendente', () => {
  it('é verdadeiro só para convite com a senha ainda por criar', () => {
    expect(temSenhaPendente(com({ senha_pendente: true }))).toBe(true);
  });
  it('é falso depois que a senha foi criada', () => {
    expect(temSenhaPendente(com({ senha_pendente: false }))).toBe(false);
  });
  it('não afeta usuários antigos nem sem sessão', () => {
    expect(temSenhaPendente(com({ nome: 'Ana' }))).toBe(false);
    expect(temSenhaPendente(null)).toBe(false);
  });
});
