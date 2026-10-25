import { describe, it, expect } from 'vitest';
import { lerNumeroSei, descreverNumeroSei } from '../numeroSei';

describe('lerNumeroSei', () => {
  it('aceita documento de 7 a 10 dígitos', () => {
    expect(lerNumeroSei(' 28451237 ')).toEqual({ tipo: 'DOCUMENTO', valor: '28451237' });
    expect(lerNumeroSei('1234567')).toEqual({ tipo: 'DOCUMENTO', valor: '1234567' });
    expect(lerNumeroSei('1234567890')).toEqual({ tipo: 'DOCUMENTO', valor: '1234567890' });
  });

  it('aceita processo com ou sem máscara e grava com a máscara', () => {
    expect(lerNumeroSei('08020012345202511')).toEqual({ tipo: 'PROCESSO', valor: '08020.012345/2025-11' });
    expect(lerNumeroSei('08020.012345/2025-11')).toEqual({ tipo: 'PROCESSO', valor: '08020.012345/2025-11' });
  });

  it('vazio não é erro (o número é opcional)', () => {
    expect(lerNumeroSei('   ')).toEqual({ tipo: 'VAZIO' });
  });

  it('recusa quantidade errada de dígitos e texto', () => {
    expect(lerNumeroSei('123456').tipo).toBe('INVALIDO');
    expect(lerNumeroSei('12345678901').tipo).toBe('INVALIDO');
    expect(lerNumeroSei('Doc 28451237').tipo).toBe('INVALIDO');
  });

  it('descreve o que entendeu', () => {
    expect(descreverNumeroSei(lerNumeroSei('28451237'))).toBe('Documento SEI 28451237');
    expect(descreverNumeroSei(lerNumeroSei('08020012345202511'))).toBe('Processo SEI 08020.012345/2025-11');
  });
});
