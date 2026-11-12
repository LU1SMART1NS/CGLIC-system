import { describe, it, expect } from 'vitest';
import {
  dataBRparaISO,
  documentoSeiValido,
  isoParaBR,
  lerValorBR,
  mascaraCep,
  mascaraCnpj,
  mascaraDataBR,
  mascaraDocumentoSei,
  mascaraMesBR,
  mascaraOrdemBancaria,
  mascaraPercentual,
  mascaraProcessoSei,
  mascaraTelefone,
  mascaraValorBR,
  mesBRparaISO,
  ordemBancariaValida,
  processoSeiValido
} from '../mascaras';

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

describe('mascaraCnpj, mascaraCep e mascaraTelefone', () => {
  it('CNPJ aos poucos e colado', () => {
    expect(mascaraCnpj('123')).toBe('12.3');
    expect(mascaraCnpj('123456789')).toBe('12.345.678/9');
    expect(mascaraCnpj('12345678000195')).toBe('12.345.678/0001-95');
    expect(mascaraCnpj('12.345.678/0001-95x9')).toBe('12.345.678/0001-95');
  });
  it('CEP', () => {
    expect(mascaraCep('70064')).toBe('70064');
    expect(mascaraCep('700649009')).toBe('70064-900');
  });
  it('telefone fixo, celular e com +55', () => {
    expect(mascaraTelefone('6')).toBe('(6');
    expect(mascaraTelefone('613')).toBe('(61) 3');
    expect(mascaraTelefone('6133331111')).toBe('(61) 3333-1111');
    expect(mascaraTelefone('61999990000')).toBe('(61) 99999-0000');
    expect(mascaraTelefone('+55 61 99999-0000')).toBe('(61) 99999-0000');
    expect(mascaraTelefone('')).toBe('');
  });
});

describe('mascaraPercentual', () => {
  it('ponto vira vírgula e limita as casas', () => {
    expect(mascaraPercentual('4.44')).toBe('4,44');
    expect(mascaraPercentual('4,724919')).toBe('4,72491');
    expect(mascaraPercentual('123')).toBe('12');
    expect(mascaraPercentual(',5')).toBe('0,5');
    expect(mascaraPercentual('4,4,4')).toBe('4,44');
  });
});

describe('mascaraOrdemBancaria', () => {
  it('põe o OB depois do ano', () => {
    expect(mascaraOrdemBancaria('202')).toBe('202');
    expect(mascaraOrdemBancaria('2026')).toBe('2026OB');
    expect(mascaraOrdemBancaria('2026ob800123')).toBe('2026OB800123');
    expect(mascaraOrdemBancaria('2026800123')).toBe('2026OB800123');
    expect(ordemBancariaValida('2026OB800123')).toBe(true);
    expect(ordemBancariaValida('2026OB80012')).toBe(false);
  });
  it('apagar o OB volta ao ano', () => {
    expect(mascaraOrdemBancaria('2026O', '2026OB')).toBe('202');
  });
});

describe('datas digitadas', () => {
  it('monta dd/mm/aaaa e mm/aaaa', () => {
    expect(mascaraDataBR('2810')).toBe('28/10');
    expect(mascaraDataBR('28102026')).toBe('28/10/2026');
    expect(mascaraMesBR('102026')).toBe('10/2026');
  });
  it('só converte data que existe', () => {
    expect(dataBRparaISO('28/10/2026')).toBe('2026-10-28');
    expect(dataBRparaISO('29/02/2024')).toBe('2024-02-29');
    expect(dataBRparaISO('31/02/2026')).toBe('');
    expect(dataBRparaISO('28/10/202')).toBe('');
    expect(mesBRparaISO('10/2026')).toBe('2026-10');
    expect(mesBRparaISO('13/2026')).toBe('');
  });
  it('volta do ISO', () => {
    expect(isoParaBR('2026-10-28')).toBe('28/10/2026');
    expect(isoParaBR('2026-10-28T12:00:00Z')).toBe('28/10/2026');
    expect(isoParaBR('2026-10')).toBe('10/2026');
    expect(isoParaBR('')).toBe('');
  });
});
