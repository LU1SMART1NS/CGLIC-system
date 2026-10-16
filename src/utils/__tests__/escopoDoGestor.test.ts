import { describe, it, expect } from 'vitest';
import { escopoDoGestor, listarGestores } from '../escopoDoGestor';

const contratos = [
  { contractKey: 'C1', gestorUserId: 'ana', gestorNome: 'Ana' },
  { contractKey: 'C2', gestorUserId: 'bruno', gestorNome: 'Bruno' },
  { contractKey: 'C3', gestorUserId: undefined, gestorNome: 'Sem usuário' }
];
const atas = [
  { ataKey: '00010/2025', gestorUserId: 'ana', gestorNome: 'Ana' },
  { ataKey: '00020/2025', gestorUserId: 'bruno', gestorNome: 'Bruno' }
];
const vinculos = [
  { ataKey: '00010/2025', contractKey: 'C5' }, // contrato da ata da Ana
  { ataKey: '00030/2025', contractKey: 'C1' } // ata de onde vem o contrato da Ana
];

describe('escopoDoGestor', () => {
  it('soma o que é atribuído direto e o que vem pelos vínculos ata ↔ contrato', () => {
    const e = escopoDoGestor('ana', contratos, atas, vinculos);
    expect([...e.contractKeys].sort()).toEqual(['C1', 'C5']);
    expect([...e.ataKeys].sort()).toEqual(['00010/2025', '00030/2025']);
  });

  it('gestor sem nada atribuído tem carteira vazia', () => {
    const e = escopoDoGestor('carla', contratos, atas, vinculos);
    expect(e.contractKeys.size).toBe(0);
    expect(e.ataKeys.size).toBe(0);
  });
});

describe('listarGestores', () => {
  it('lista quem tem usuário, sem repetir, em ordem alfabética', () => {
    expect(listarGestores(contratos, atas)).toEqual([
      { userId: 'ana', nome: 'Ana' },
      { userId: 'bruno', nome: 'Bruno' }
    ]);
  });

  it('com idsPermitidos, deixa de fora quem não está no conjunto (inativo/coordenador)', () => {
    // Só Ana é gestora ativa; Bruno (inativo ou coordenador) tem atribuição antiga mas não entra.
    expect(listarGestores(contratos, atas, new Set(['ana']))).toEqual([{ userId: 'ana', nome: 'Ana' }]);
  });

  it('conjunto vazio não lista ninguém', () => {
    expect(listarGestores(contratos, atas, new Set())).toEqual([]);
  });
});
