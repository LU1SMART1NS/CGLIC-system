import { describe, it, expect } from 'vitest';
import { cruzarItensComVinculos, type ItemDoContrato, type VinculoDoContrato } from '../itensContratoService';

const item = (posicao: number, numeroItem: number | null): ItemDoContrato => ({
  posicao, numeroItem, descricao: null, tipo: null, quantidade: 1, valorUnitario: 1, valorTotal: 1
});
const vinculo = (numeroItem: number): VinculoDoContrato => ({
  itemKey: `00067/2025-200331-${String(numeroItem).padStart(5, '0')}`,
  numeroAta: '00067/2025',
  uasgAta: '200331',
  numeroItem
});

describe('cruzarItensComVinculos', () => {
  it('liga cada item do contrato ao vínculo do mesmo número de item', () => {
    const r = cruzarItensComVinculos({ itens: [item(1, 4), item(2, 5)], vinculos: [vinculo(4)] });
    expect(r.vinculoPorPosicao.get(1)?.numeroItem).toBe(4);
    expect(r.vinculoPorPosicao.has(2)).toBe(false);
    expect(r.vinculosSemItem).toEqual([]);
  });

  it('aponta o vínculo para um item que o contrato não tem', () => {
    const r = cruzarItensComVinculos({ itens: [item(1, 4)], vinculos: [vinculo(4), vinculo(7)] });
    expect(r.vinculosSemItem.map((v) => v.numeroItem)).toEqual([7]);
  });

  it('item sem número não casa com vínculo; sem itens lidos, nenhum vínculo é apontado como sobra', () => {
    expect(cruzarItensComVinculos({ itens: [item(1, null)], vinculos: [vinculo(1)] }).vinculoPorPosicao.size).toBe(0);
    expect(cruzarItensComVinculos({ itens: [], vinculos: [vinculo(1)] }).vinculosSemItem).toEqual([]);
  });
});
