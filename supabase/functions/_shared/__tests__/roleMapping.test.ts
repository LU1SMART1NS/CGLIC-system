import { describe, it, expect } from 'vitest';
import { mapPerfilToDbRole } from '../roleMapping';

describe('mapPerfilToDbRole — Fase 0.1 (fail-closed RBAC)', () => {
  it('Caso 1: perfil "coordenador" -> "admin"', () => {
    expect(mapPerfilToDbRole('coordenador')).toBe('admin');
  });

  it('perfil "gestor" -> "gestor" (mapeamento explícito, não é fallback)', () => {
    expect(mapPerfilToDbRole('gestor')).toBe('gestor');
  });

  it('Caso 2: perfil "consulta" -> "leitor"', () => {
    expect(mapPerfilToDbRole('consulta')).toBe('leitor');
  });

  it('Fase 3A: perfil "gestor_saldos" -> "gestor_saldos"', () => {
    expect(mapPerfilToDbRole('gestor_saldos')).toBe('gestor_saldos');
  });

  it('Caso 3: perfil customizado explicitamente não mapeado -> null (nenhuma role)', () => {
    expect(mapPerfilToDbRole('custom-1700000000-123')).toBeNull();
    expect(mapPerfilToDbRole('gestor_saldo')).toBeNull();
  });

  it('Caso 4: perfil inexistente/desconhecido -> null (nenhuma role)', () => {
    expect(mapPerfilToDbRole('perfil-que-nao-existe')).toBeNull();
    expect(mapPerfilToDbRole('Gestor')).toBeNull(); // case-sensitive: não normaliza silenciosamente
  });

  it('Caso 5: usuário sem perfil -> null (nenhuma role)', () => {
    expect(mapPerfilToDbRole(undefined)).toBeNull();
    expect(mapPerfilToDbRole(null)).toBeNull();
    expect(mapPerfilToDbRole('')).toBeNull();
    expect(mapPerfilToDbRole('   ')).toBeNull();
  });

  it('rejeita tipos inesperados sem lançar exceção (fail-closed também para input malformado)', () => {
    expect(mapPerfilToDbRole(123 as unknown)).toBeNull();
    expect(mapPerfilToDbRole({} as unknown)).toBeNull();
    expect(mapPerfilToDbRole(['coordenador'] as unknown)).toBeNull();
  });

  it('Caso 6: nenhum valor de entrada resulta em "gestor" a menos que seja EXATAMENTE o perfil "gestor"', () => {
    const inputsQueNuncaDevemVirarGestor = [
      undefined,
      null,
      '',
      'admin',
      'leitor',
      'coordenador ',
      ' consulta',
      'GESTOR',
      'gestor-fiscal',
      'gestor_saldo',
      'qualquer-coisa',
      'custom-999-abc'
    ];

    for (const input of inputsQueNuncaDevemVirarGestor) {
      expect(mapPerfilToDbRole(input)).not.toBe('gestor');
    }

    // única entrada que legitimamente produz 'gestor'
    expect(mapPerfilToDbRole('gestor')).toBe('gestor');
  });

  it('só retorna um dos 3 valores conhecidos ou null — nunca um valor arbitrário', () => {
    const amostras = ['coordenador', 'gestor', 'consulta', 'x', '', undefined, 'admin'];
    for (const input of amostras) {
      const result = mapPerfilToDbRole(input);
      expect(['admin', 'gestor', 'leitor', 'gestor_saldos', null]).toContain(result);
    }
  });
});
