import { describe, it, expect } from 'vitest';
import { summarizeAllocationExecution } from '../allocationExecution';
import type { ItemEmpenhoVinculo } from '../../types/itemEmpenhoVinculo';

const v = (numero: string, quantidade: number | null, sugerida: number | null = null): ItemEmpenhoVinculo => ({
  id: numero, itemKey: 'k', empenhoId: numero, quantidade, fonte: quantidade == null ? null : 'API',
  quantidadeSugerida: sugerida, contractKey: 'c',
  empenho: { canonicalKey: numero, numero, ano: 2026, uasg: '200331', valorEmpenhado: 0 }
});

const allocations = [{ id: 'a1' }, { id: 'a2' }];

describe('summarizeAllocationExecution', () => {
  it('soma por unidade as quantidades confirmadas dos empenhos vinculados', () => {
    const r = summarizeAllocationExecution(
      allocations,
      [v('2026NE000039', 8), v('2026NE000040', 21), v('2026NE000051', 5)],
      { '2026NE000039': 'a1', '2026NE000040': 'a1', '2026NE000051': 'a2' }
    );
    expect(r.porAlocacao.get('a1')?.empenhado).toBe(29);
    expect(r.porAlocacao.get('a2')?.empenhado).toBe(5);
    expect(r.semUnidade).toEqual({ empenhado: 0, count: 0 });
  });

  it('empenho pendente vinculado à unidade não conta no empenhado, mas é sinalizado', () => {
    const r = summarizeAllocationExecution(allocations, [v('2026NE000039', 8), v('2026NE000096', null, 4)], {
      '2026NE000039': 'a1', '2026NE000096': 'a1'
    });
    expect(r.porAlocacao.get('a1')).toEqual({ empenhado: 8, pendentes: 1, pendentesSugerido: 4, vinculados: 2 });
  });

  it('empenho confirmado sem unidade vai para semUnidade; pendente sem unidade não', () => {
    const r = summarizeAllocationExecution(allocations, [v('2026NE000039', 8), v('2026NE000096', null, 4)], {});
    expect(r.semUnidade).toEqual({ empenhado: 8, count: 1 });
    expect(r.porAlocacao.get('a1')?.empenhado).toBe(0);
  });

  it('o número casa ignorando zeros à esquerda e o vínculo para alocação inexistente vira sem unidade', () => {
    const r = summarizeAllocationExecution(allocations, [v('2026NE000039', 8), v('2026NE000040', 3)], {
      '2026NE39': 'a2', '2026NE000040': 'removida'
    });
    expect(r.porAlocacao.get('a2')?.empenhado).toBe(8);
    expect(r.semUnidade).toEqual({ empenhado: 3, count: 1 });
  });
});
