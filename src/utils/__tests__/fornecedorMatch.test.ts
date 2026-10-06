import { describe, it, expect } from 'vitest';
import {
  ataTemFornecedorConhecido,
  contratoDoFornecedorDaAta,
  documentoFiscalValido,
  nomesDeFornecedorParecidos
} from '../fornecedorMatch';

describe('documentoFiscalValido', () => {
  it('aceita CNPJ e CPF, com ou sem máscara', () => {
    expect(documentoFiscalValido('11.111.111/0001-11')).toBe(true);
    expect(documentoFiscalValido('40437906191')).toBe(true);
  });
  it('recusa código genérico de estrangeiro e vazio', () => {
    expect(documentoFiscalValido('EXAXONEN1')).toBe(false);
    expect(documentoFiscalValido('ESTRANG0000348')).toBe(false);
    expect(documentoFiscalValido('')).toBe(false);
    expect(documentoFiscalValido(undefined)).toBe(false);
  });
});

describe('nomesDeFornecedorParecidos', () => {
  it('ignora caixa, acento, pontuação e sufixo societário', () => {
    expect(nomesDeFornecedorParecidos('3M GLOBAL CHANNEL SERVICES', '3M Global Channel Services, Inc.')).toBe(true);
    expect(nomesDeFornecedorParecidos('CESKÁ ZBROJOVKA A.S.', 'Ceska Zbrojovka AS')).toBe(true);
  });
  it('tolera erro de digitação no cadastro', () => {
    expect(nomesDeFornecedorParecidos('AXON  INTERPRISE', 'Axon Enterprise, Inc.')).toBe(true);
  });
  it('aceita nome truncado por um dos sistemas', () => {
    expect(nomesDeFornecedorParecidos('HAIX SCHUCHE PRODUKTIONS UND VERTRIEBS', 'HAIX Schuhe Produktions und Vertriebs GmbH')).toBe(true);
  });
  it('não junta empresas diferentes', () => {
    expect(nomesDeFornecedorParecidos('AXON ENTERPRISE', 'AXIS COMMUNICATIONS')).toBe(false);
    expect(nomesDeFornecedorParecidos('BRASIL TELECOM SA', 'BRASIL SEGUROS SA')).toBe(false);
    expect(nomesDeFornecedorParecidos('3M GLOBAL CHANNEL SERVICES', '3M DO BRASIL LTDA')).toBe(false);
    expect(nomesDeFornecedorParecidos('BRANDS GROUP BV', 'R.BRANDS LTDA')).toBe(false);
  });
  it('nome vazio nunca casa', () => {
    expect(nomesDeFornecedorParecidos('', 'AXON')).toBe(false);
    expect(nomesDeFornecedorParecidos('LTDA', 'LTDA')).toBe(false);
  });
});

describe('contratoDoFornecedorDaAta', () => {
  const ata = { cnpjs: ['11111111000111', 'ESTRANG0000348'], nomes: ['Fornecedor BR LTDA', 'Axon Enterprise, Inc.'] };

  it('com CNPJ válido, só o documento vale (nome parecido não basta)', () => {
    expect(contratoDoFornecedorDaAta({ cnpj: '11.111.111/0001-11', nome: 'Outro nome' }, ata)).toBe(true);
    expect(contratoDoFornecedorDaAta({ cnpj: '22.222.222/0001-22', nome: 'Axon Enterprise, Inc.' }, ata)).toBe(false);
  });
  it('estrangeiro (código genérico) casa pelo nome', () => {
    expect(contratoDoFornecedorDaAta({ cnpj: 'EXAXONEN1', nome: 'AXON  INTERPRISE' }, ata)).toBe(true);
    expect(contratoDoFornecedorDaAta({ cnpj: '', nome: 'AXON  INTERPRISE' }, ata)).toBe(true);
  });
  it('estrangeiro de outra empresa não casa', () => {
    expect(contratoDoFornecedorDaAta({ cnpj: 'EXCESKAZB', nome: 'CESKÁ ZBROJOVKA A.S.' }, ata)).toBe(false);
  });
  it('código genérico de um lado e de outro não casa por si só', () => {
    expect(contratoDoFornecedorDaAta({ cnpj: '1', nome: 'X' }, { cnpjs: ['1'], nomes: [] })).toBe(false);
  });
});

describe('ataTemFornecedorConhecido', () => {
  it('conhecido por documento ou por nome', () => {
    expect(ataTemFornecedorConhecido({ cnpjs: ['ESTRANG0000348'] })).toBe(true);
    expect(ataTemFornecedorConhecido({ nomes: ['Axon Enterprise, Inc.'] })).toBe(true);
  });
  it('desconhecido quando não há nada', () => {
    expect(ataTemFornecedorConhecido({})).toBe(false);
    expect(ataTemFornecedorConhecido({ cnpjs: [''], nomes: ['  '] })).toBe(false);
  });
});
