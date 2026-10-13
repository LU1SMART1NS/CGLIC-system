import { describe, it, expect } from 'vitest';
import { formatCurrency, formatCurrencyRounded, formatNumber, formatPercent, formatCnpj, formatDateBR, formatProcessoSei, primeiraMaiuscula } from '../format';

const nbsp = (s: string) => s.replace(/ /g, ' ');

describe('format', () => {
  it('formata moeda', () => {
    expect(nbsp(formatCurrency(1528.8))).toBe('R$ 1.528,80');
    expect(nbsp(formatCurrency(undefined))).toBe('R$ 0,00');
    expect(nbsp(formatCurrencyRounded(7434554.4))).toBe('R$ 7.434.554');
  });
  it('formata número e percentual', () => {
    expect(formatNumber(4863)).toBe('4.863');
    expect(formatNumber(null)).toBe('0');
    expect(formatPercent(42.54)).toBe('42,5%');
  });
  it('formata o número do processo SEI vindo do PNCP (17 dígitos)', () => {
    expect(formatProcessoSei('08020001450202479')).toBe('08020.001450/2024-79');
    expect(formatProcessoSei('08020.001450/2024-79')).toBe('08020.001450/2024-79');
    expect(formatProcessoSei('123/2024')).toBe('123/2024');
    expect(formatProcessoSei('')).toBe('');
    expect(formatProcessoSei(undefined)).toBe('');
  });
  it('formata CNPJ e CPF', () => {
    expect(formatCnpj('27975551000399')).toBe('27.975.551/0003-99');
    expect(formatCnpj('12345678901')).toBe('123.456.789-01');
    expect(formatCnpj('abc')).toBe('abc');
    expect(formatCnpj(undefined)).toBe('');
  });
  it('reexporta a data canônica', () => {
    expect(formatDateBR('2026-10-01T10:00:00')).toBe('01/10/2026');
    expect(formatDateBR(null)).toBe('-');
  });
});

describe('primeiraMaiuscula', () => {
  it('texto todo em maiúsculas vira minúsculas com a primeira maiúscula', () => {
    expect(primeiraMaiuscula('O OBJETO DO PRESENTE INSTRUMENTO É A AQUISIÇÃO DE MIRA OPTRÔNICA')).toBe('O objeto do presente instrumento é a aquisição de mira optrônica');
  });
  it('texto que mistura os dois só ganha a primeira maiúscula e preserva o resto', () => {
    expect(primeiraMaiuscula('registro de preços para a Secretaria Nacional de Segurança Pública')).toBe('Registro de preços para a Secretaria Nacional de Segurança Pública');
    expect(primeiraMaiuscula('Aquisição para a SENASP')).toBe('Aquisição para a SENASP');
  });
  it('começa pela primeira letra, mesmo depois de aspas ou número', () => {
    expect(primeiraMaiuscula('"aquisição" de mira')).toBe('"Aquisição" de mira');
    expect(primeiraMaiuscula('ÁGUA MINERAL')).toBe('Água mineral');
  });
  it('vazio, nulo e sem letras voltam sem erro', () => {
    expect(primeiraMaiuscula(undefined)).toBe('');
    expect(primeiraMaiuscula('  ')).toBe('');
    expect(primeiraMaiuscula('123/2026')).toBe('123/2026');
  });
});
