import { describe, it, expect } from 'vitest';
import {
  ataTemFornecedorConhecido,
  contratoDoFornecedorDaAta,
  documentoFiscalValido,
  nomesDeFornecedorParecidos,
  credorDiferenteDoFornecedor
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

describe('credorDiferenteDoFornecedor', () => {
  const equilibrio = { cnpj: '12.124.712/0001-00', nome: 'EQUILIBRIO EQUIPAMENTOS DE PROTECAO AMBIENTAL LTDA' };

  it('acusa a NE da HPE no contrato da Equilíbrio (caso real do contrato 00145/2025)', () => {
    expect(credorDiferenteDoFornecedor({ cnpj: '54.305.743/0011-70', nome: 'HPE AUTOMOTORES DO BRASIL LTDA' }, equilibrio)).toBe(true);
  });

  it('matriz e filial são a mesma empresa (mesma raiz de CNPJ)', () => {
    expect(credorDiferenteDoFornecedor({ cnpj: '12124712000281', nome: 'OUTRO NOME' }, equilibrio)).toBe(false);
  });

  it('CPF compara o documento inteiro; CPF × CNPJ é diferente', () => {
    expect(credorDiferenteDoFornecedor({ cnpj: '123.456.789-09' }, { cnpj: '12345678909' })).toBe(false);
    expect(credorDiferenteDoFornecedor({ cnpj: '123.456.789-09' }, { cnpj: '123.456.789-10' })).toBe(true);
    expect(credorDiferenteDoFornecedor({ cnpj: '12345678909' }, equilibrio)).toBe(true);
  });

  it('sem documento válido, compara o nome (estrangeiro)', () => {
    expect(credorDiferenteDoFornecedor({ cnpj: 'EXAXONEN1', nome: 'AXON ENTERPRISE, INC.' }, { cnpj: 'ESTRANG0000348', nome: 'Axon Interprise' })).toBe(false);
    expect(credorDiferenteDoFornecedor({ cnpj: 'EXAXONEN1', nome: 'AXON ENTERPRISE, INC.' }, { cnpj: '', nome: 'MOTOROLA SOLUTIONS' })).toBe(true);
  });

  it('sem dado suficiente não acusa', () => {
    expect(credorDiferenteDoFornecedor({}, equilibrio)).toBe(false);
    expect(credorDiferenteDoFornecedor({ cnpj: '54.305.743/0011-70' }, {})).toBe(false);
  });
});
