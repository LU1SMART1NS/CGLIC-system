import { describe, it, expect } from 'vitest';
import { avaliarSubida, capacidadeDe, mesesDesde, ocupacao } from '../nivelGestor';

const hoje = new Date('2026-10-15T12:00:00Z');

describe('capacidade e ocupação', () => {
  it('usa 60/85/100% e Intermediário sem nível', () => {
    expect(capacidadeDe('INICIANTE')).toBe(0.6);
    expect(capacidadeDe('INTERMEDIARIO')).toBe(0.85);
    expect(capacidadeDe('AVANCADO')).toBe(1);
    expect(capacidadeDe(null)).toBe(0.85);
    expect(ocupacao(22, 0.6)).toBeCloseTo(36.67, 1);
  });

  it('conta meses completos', () => {
    expect(mesesDesde('2026-03-01T00:00:00Z', hoje)).toBe(7);
    expect(mesesDesde(undefined, hoje)).toBeNull();
  });
});

describe('avaliarSubida', () => {
  const nivel = (n: 'INICIANTE' | 'INTERMEDIARIO' | 'AVANCADO', desde: string) => ({ userId: 'u1', nivel: n, desde, motivo: 'x' });

  it('sem nível ou no topo não avalia', () => {
    expect(avaliarSubida({ nivel: null, itens: [], atrasadas: 0, hoje })).toBeNull();
    expect(avaliarSubida({ nivel: nivel('AVANCADO', '2020-01-01'), itens: [], atrasadas: 0, hoje })).toBeNull();
  });

  it('iniciante pronto: 6 meses, 1 Média há 3 meses e tarefas em dia', () => {
    const r = avaliarSubida({
      nivel: nivel('INICIANTE', '2026-03-01T00:00:00Z'),
      itens: [
        { rotulo: 'Ata 00033/2026', complexidade: 'MEDIA', gestorDesde: '2026-05-01T00:00:00Z' },
        { rotulo: 'Ata 00041/2026', complexidade: 'BAIXA', gestorDesde: '2025-01-01T00:00:00Z' }
      ],
      atrasadas: 0,
      hoje
    })!;
    expect(r.proximo).toBe('INTERMEDIARIO');
    expect(r.criterios.map((c) => c.ok)).toEqual([true, true, true]);
    expect(r.criterios[1].detalhe).toBe('Ata 00033/2026, há 5 meses');
    expect(r.pronto).toBe(true);
  });

  it('Baixa antiga não conta como experiência com Média', () => {
    const r = avaliarSubida({
      nivel: nivel('INICIANTE', '2026-01-01T00:00:00Z'),
      itens: [{ rotulo: 'Ata 1', complexidade: 'BAIXA', gestorDesde: '2024-01-01T00:00:00Z' }],
      atrasadas: 0,
      hoje
    })!;
    expect(r.criterios[1]).toMatchObject({ ok: false, detalhe: 'Nenhum na carteira vigente' });
    expect(r.pronto).toBe(false);
  });

  it('intermediário precisa de 12 meses no nível, Alta há 6 meses e no máximo 2 atrasadas', () => {
    const r = avaliarSubida({
      nivel: nivel('INTERMEDIARIO', '2025-09-01T00:00:00Z'),
      itens: [{ rotulo: 'Contrato 22/2025', complexidade: 'ALTA', gestorDesde: '2026-02-01T00:00:00Z' }],
      atrasadas: 3,
      hoje
    })!;
    expect(r.proximo).toBe('AVANCADO');
    expect(r.criterios.map((c) => c.ok)).toEqual([true, true, false]);
    expect(r.pronto).toBe(false);
  });
});
