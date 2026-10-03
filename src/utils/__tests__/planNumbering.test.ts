import { describe, expect, it } from 'vitest';
import { numeroEtapa, numeroTarefa, stripNumeracaoManual } from '../planNumbering';

describe('planNumbering', () => {
  it('remove numeração digitada à mão', () => {
    expect(stripNumeracaoManual('1. Verificar última proposta de preços')).toBe('Verificar última proposta de preços');
    expect(stripNumeracaoManual('1.2. Consultar o PNCP')).toBe('Consultar o PNCP');
    expect(stripNumeracaoManual('1.2 Consultar o PNCP')).toBe('Consultar o PNCP');
    expect(stripNumeracaoManual('3) Publicar')).toBe('Publicar');
  });

  it('não mexe em nome que só começa com número', () => {
    expect(stripNumeracaoManual('2 pessoas assinam')).toBe('2 pessoas assinam');
    expect(stripNumeracaoManual('90 dias antes do vencimento')).toBe('90 dias antes do vencimento');
    expect(stripNumeracaoManual('')).toBe('');
    expect(stripNumeracaoManual(undefined)).toBe('');
  });

  it('numera etapa e tarefa pela posição', () => {
    expect(numeroEtapa(0)).toBe('1');
    expect(numeroTarefa(1, 2)).toBe('2.3');
  });
});
