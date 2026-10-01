import { describe, it, expect } from 'vitest';
import { classifyPrazo, comparePrazo, matchesStatusFilter } from '../carteiraPrazo';
import { buildAtaSaldoStats } from '../../atas/ataSaldoStats';

describe('carteiraPrazo — faixas únicas (crítico ≤30, atenção 31–90)', () => {
  it('classifica pelas faixas da Visão Geral', () => {
    expect(classifyPrazo(-1)).toBe('EXPIRADO');
    expect(classifyPrazo(0)).toBe('CRITICO');
    expect(classifyPrazo(30)).toBe('CRITICO');
    expect(classifyPrazo(31)).toBe('ATENCAO');
    expect(classifyPrazo(90)).toBe('ATENCAO');
    expect(classifyPrazo(91)).toBe('REGULAR');
    expect(classifyPrazo(null)).toBe('SEM_DATA');
    expect(classifyPrazo(200, true)).toBe('EXPIRADO');
  });

  it('filtro "Vigentes" inclui crítico/atenção e exclui histórico e sem data', () => {
    expect(matchesStatusFilter('CRITICO', 'VIGENTES')).toBe(true);
    expect(matchesStatusFilter('ATENCAO', 'VIGENTES')).toBe(true);
    expect(matchesStatusFilter('REGULAR', 'VIGENTES')).toBe(true);
    expect(matchesStatusFilter('EXPIRADO', 'VIGENTES')).toBe(false);
    expect(matchesStatusFilter('SEM_DATA', 'VIGENTES')).toBe(false);
    expect(matchesStatusFilter('SEM_DATA', 'TODOS')).toBe(true);
    expect(matchesStatusFilter('EXPIRADO', 'HISTORICO')).toBe(true);
  });

  it('ordena vigentes pelo vencimento mais próximo e encerrados por último (mais recente primeiro)', () => {
    const ordenado = [200, -400, 5, null, -10, 40].sort(comparePrazo);
    expect(ordenado).toEqual([5, 40, 200, null, -10, -400]);
  });
});

describe('ataSaldoStats — consumo de saldo por ata', () => {
  it('resume maior consumo, itens críticos e em atenção por ata', () => {
    const stats = buildAtaSaldoStats([
      { numero_ata: '00001/2025', numero_item: '00001', percentual_consumido: 91 },
      { numero_ata: '00001/2025', numero_item: 2, percentual_consumido: 75 },
      { numero_ata: '00001/2025', numero_item: 3, percentual_consumido: 10 },
      { numero_ata: '00002/2025', numero_item: 1, quantidade_homologada: 100, quantidade_consumida: 20 }
    ]);

    expect(stats['00001/2025']).toMatchObject({ maxPct: 91, criticos: 1, atencao: 1 });
    expect(stats['00001/2025'].pctByItem['1']).toBe(91);
    expect(stats['00002/2025'].maxPct).toBe(20);
    expect(stats['00003/2025']).toBeUndefined();
  });
});
