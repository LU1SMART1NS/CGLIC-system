import { describe, it, expect } from 'vitest';
import { descricaoItemEmFrase, toSentenceCaseIfAllCaps } from '../textCase';

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

describe('descricaoItemEmFrase', () => {
  it('todo em maiúsculas: igual ao toSentenceCaseIfAllCaps', () => {
    expect(descricaoItemEmFrase('LANTERNA ELÉTRICA, MATERIAL ALUMÍNIO, TIPO TÁTICA')).toBe('Lanterna elétrica, material alumínio, tipo tática');
  });

  it('quase todo em maiúsculas com alguma minúscula também vira frase', () => {
    expect(descricaoItemEmFrase('ACESSÓRIO / PEÇA MERGULHO, TIPO COLETE C/ LASTRO, 12 mm')).toBe('Acessório / peça mergulho, tipo colete c/ lastro, 12 mm');
  });

  it('Cada Palavra Maiúscula vira frase, mantendo siglas e números', () => {
    expect(descricaoItemEmFrase('Projetil E Componentes Munição')).toBe('Projetil e componentes munição');
    expect(descricaoItemEmFrase('Equipamento Laboratório Tipo: P/ Análise De DNA, Modelo X200')).toBe(
      'Equipamento laboratório tipo: p/ análise de DNA, modelo X200'
    );
  });

  it('frase normal fica como está', () => {
    const frase = 'Caminhão, tipo pipa, potência motor 230 CV';
    expect(descricaoItemEmFrase(frase)).toBe(frase);
    expect(descricaoItemEmFrase('Aeronaves teleguiadas')).toBe('Aeronaves teleguiadas');
  });

  it('vazio ou ausente vira vazio', () => {
    expect(descricaoItemEmFrase('')).toBe('');
    expect(descricaoItemEmFrase(null)).toBe('');
  });
});
