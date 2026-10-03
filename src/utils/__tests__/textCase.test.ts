import { describe, it, expect } from 'vitest';
import { toSentenceCaseIfAllCaps } from '../textCase';

describe('toSentenceCaseIfAllCaps', () => {
  it('converte o objeto do contrato que vem todo em maiúsculas', () => {
    expect(
      toSentenceCaseIfAllCaps('O OBJETO DO PRESENTE INSTRUMENTO É A AQUISIÇÃO DE TABLETS, NAS CONDIÇÕES ESPECIFICADAS NO TERMO DE REFERÊNCIA.')
    ).toBe('O objeto do presente instrumento é a aquisição de tablets, nas condições especificadas no termo de referência.');
  });

  it('mantém sigla curta entre parênteses', () => {
    expect(toSentenceCaseIfAllCaps('VEÍCULO ESPECIAL, TIPO AUTO RÁPIDO FLORESTAL (ARF), TIPO MOTOR DIE…')).toBe(
      'Veículo especial, tipo auto rápido florestal (ARF), tipo motor die…'
    );
  });

  it('mantém siglas da lista, UF depois de barra e palavras com número', () => {
    expect(toSentenceCaseIfAllCaps('PARA ATENDER ÀS DEMANDAS DA AGU EM CAMPO GRANDE/MS.')).toBe(
      'Para atender às demandas da AGU em campo grande/MS.'
    );
    expect(toSentenceCaseIfAllCaps('CAMINHÃO, POTÊNCIA MOTOR 230 CV, CAPACIDADE 12.000 L')).toBe(
      'Caminhão, potência motor 230 CV, capacidade 12.000 l'
    );
  });

  it('não mexe em texto que já tem minúscula (objeto da ata)', () => {
    const ata = 'Registro de preços para aquisição de Tablets, para atender demanda da Secretaria Nacional de Segurança Pública';
    expect(toSentenceCaseIfAllCaps(ata)).toBe(ata);
    expect(toSentenceCaseIfAllCaps('Veículo Auto Busca e Salvamento Médio')).toBe('Veículo Auto Busca e Salvamento Médio');
  });

  it('põe maiúscula depois de ponto final', () => {
    expect(toSentenceCaseIfAllCaps('PRIMEIRA FRASE. SEGUNDA FRASE.')).toBe('Primeira frase. Segunda frase.');
  });

  it('texto vazio ou ausente vira vazio', () => {
    expect(toSentenceCaseIfAllCaps('')).toBe('');
    expect(toSentenceCaseIfAllCaps(undefined)).toBe('');
    expect(toSentenceCaseIfAllCaps(null)).toBe('');
  });
});
