import { describe, expect, it } from 'vitest';
import { agregarNivel, nivelAlocacao, nivelEmpenho, passaFiltroNivel } from '../itemAtendimento';

describe('nivelAlocacao', () => {
  it('sem alocação quando nada foi alocado', () => {
    expect(nivelAlocacao(0, 100)).toBe('SEM');
  });
  it('parcial quando o alocado fica abaixo do quantitativo SENASP', () => {
    expect(nivelAlocacao(40, 100)).toBe('PARCIAL');
  });
  it('total quando o alocado alcança ou passa o quantitativo SENASP', () => {
    expect(nivelAlocacao(100, 100)).toBe('TOTAL');
    expect(nivelAlocacao(120, 100)).toBe('TOTAL');
  });
  it('total quando há alocação e o quantitativo SENASP é zero', () => {
    expect(nivelAlocacao(5, 0)).toBe('TOTAL');
  });
});

describe('nivelEmpenho', () => {
  it('sem empenho quando nada foi empenhado', () => {
    expect(nivelEmpenho(0, 50)).toBe('SEM');
    expect(nivelEmpenho(0, null)).toBe('SEM');
  });
  it('parcial quando o empenhado fica abaixo do contratado', () => {
    expect(nivelEmpenho(20, 50)).toBe('PARCIAL');
  });
  it('total quando o empenhado alcança o contratado', () => {
    expect(nivelEmpenho(50, 50)).toBe('TOTAL');
    expect(nivelEmpenho(60, 50)).toBe('TOTAL');
  });
  it('parcial quando há empenho mas a quantidade contratada ainda não foi lida', () => {
    expect(nivelEmpenho(10, null)).toBe('PARCIAL');
  });
});

describe('agregarNivel', () => {
  it('nulo sem itens conhecidos', () => {
    expect(agregarNivel([])).toBeNull();
  });
  it('total só quando todos os itens estão totais', () => {
    expect(agregarNivel(['TOTAL', 'TOTAL'])).toBe('TOTAL');
  });
  it('sem só quando nenhum item tem', () => {
    expect(agregarNivel(['SEM', 'SEM'])).toBe('SEM');
  });
  it('parcial em qualquer mistura', () => {
    expect(agregarNivel(['TOTAL', 'SEM'])).toBe('PARCIAL');
    expect(agregarNivel(['PARCIAL'])).toBe('PARCIAL');
    expect(agregarNivel(['TOTAL', 'PARCIAL'])).toBe('PARCIAL');
  });
});

describe('passaFiltroNivel', () => {
  it('TODOS deixa passar até o que não tem nível', () => {
    expect(passaFiltroNivel(null, 'TODOS')).toBe(true);
  });
  it('um nível específico exige o mesmo nível', () => {
    expect(passaFiltroNivel('PARCIAL', 'PARCIAL')).toBe(true);
    expect(passaFiltroNivel('TOTAL', 'PARCIAL')).toBe(false);
    expect(passaFiltroNivel(null, 'SEM')).toBe(false);
  });
});
