import { describe, it, expect } from 'vitest';
import { documentoSeiValido, lerValorBR, mascaraDocumentoSei, mascaraProcessoSei, mascaraValorBR, processoSeiValido } from '../mascaras';

describe('mascaraProcessoSei', () => {
  it('monta a máscara enquanto se digita', () => {
    expect(mascaraProcessoSei('08020')).toBe('08020');
    expect(mascaraProcessoSei('080200')).toBe('08020.0');
    expect(mascaraProcessoSei('080200123452')).toBe('08020.012345/2');
    expect(mascaraProcessoSei('0802001234520251')).toBe('08020.012345/2025-1');
    expect(mascaraProcessoSei('08020012345202511')).toBe('08020.012345/2025-11');
  });
  it('corta o 18º dígito e aceita colar já formatado', () => {
    expect(mascaraProcessoSei('08020.012345/2025-119')).toBe('08020.012345/2025-11');
    expect(mascaraProcessoSei(' 08020.012345/2025-11 ')).toBe('08020.012345/2025-11');
  });
  it('só vale com 17 dígitos', () => {
    expect(processoSeiValido('08020.012345/2025-11')).toBe(true);
    expect(processoSeiValido('08020.012345/2025-1')).toBe(false);
  });
});

describe('mascaraDocumentoSei', () => {
  it('fica só com os dígitos, até 10', () => {
    expect(mascaraDocumentoSei('SEI 41.234.567')).toBe('41234567');
    expect(mascaraDocumentoSei('123456789012')).toBe('1234567890');
  });
  it('vale com 7 a 10 dígitos', () => {
    expect(documentoSeiValido('1234567')).toBe(true);
    expect(documentoSeiValido('123456')).toBe(false);
    expect(documentoSeiValido('12345678a')).toBe(false);
  });
});

describe('mascaraValorBR', () => {
  it('põe o milhar enquanto se digita', () => {
    expect(mascaraValorBR('1200')).toBe('1.200');
    expect(mascaraValorBR('1.2005', '1.200')).toBe('12.005');
    expect(mascaraValorBR('123.4567', '123.456')).toBe('1.234.567');
  });
  it('ponto digitado por último ou com 1–2 dígitos vira vírgula', () => {
    expect(mascaraValorBR('12.', '12')).toBe('12,');
    expect(mascaraValorBR('1200000.50')).toBe('1.200.000,50');
    expect(mascaraValorBR('1.200,5', '1.200,')).toBe('1.200,5');
  });
  it('colado do SIOP ou sem centavos', () => {
    expect(mascaraValorBR('R$ 1.200.000,00')).toBe('1.200.000,00');
    expect(mascaraValorBR('1.200.000')).toBe('1.200.000');
    expect(mascaraValorBR('1200000')).toBe('1.200.000');
  });
  it('apagar não troca o milhar por vírgula', () => {
    expect(mascaraValorBR('1.20', '1.200')).toBe('120');
  });
  it('corta os centavos em 2 casas e tira zeros à esquerda', () => {
    expect(mascaraValorBR('10,555')).toBe('10,55');
    expect(mascaraValorBR('00012')).toBe('12');
    expect(mascaraValorBR(',5')).toBe('0,5');
    expect(mascaraValorBR('')).toBe('');
  });
  it('lerValorBR devolve o número', () => {
    expect(lerValorBR('1.200.000,50')).toBe(1200000.5);
    expect(lerValorBR('1.200')).toBe(1200);
    expect(lerValorBR('')).toBeNull();
  });
});
