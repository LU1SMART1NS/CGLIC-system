import { describe, it, expect } from 'vitest';
import type { ContratoFiscalizacao } from '../../services/fiscalizacaoService';
import { linhaParaContrato } from '../../services/fiscalizacaoService';
import { cargaPorFiscal, decisaoPedeMotivo, decisaoSugerida, ehDoFiscal, hojeEmBrasilia, numeroDoContrato, pendenciasDoContrato, segmentoDoContrato, substitutosDoTitular } from '../fiscalizacao';

const base: ContratoFiscalizacao = {
  contractKey: '200331-00055-2026', uasg: '200331', numero: '00055/2026', fornecedor: 'CONDOR', objeto: null, assinatura: '2026-01-29', vigenciaFim: '2027-01-29',
  emendas: ['27960009'], situacao: 'A_DEFINIR', motivo: null, fiscalUserId: null, fiscalNome: null, substitutoUserId: null, substitutoNome: null,
  portariaSei: null, processoSei: null, autuadoEm: null, definidoPorNome: null, definidoEm: null
};
const c = (p: Partial<ContratoFiscalizacao>): ContratoFiscalizacao => ({ ...base, ...p });

describe('fiscalização do contrato', () => {
  it('área requisitante junta a decisão e o padrão no trilho', () => {
    expect(segmentoDoContrato(c({ situacao: 'AREA_PADRAO' }))).toBe('AREA');
    expect(segmentoDoContrato(c({ situacao: 'AREA' }))).toBe('AREA');
    expect(segmentoDoContrato(c({ situacao: 'MISTA' }))).toBe('MISTA');
  });

  it('motivo só quando a decisão foge do padrão', () => {
    expect(decisaoPedeMotivo(c({}), 'SFC')).toBe(false);
    expect(decisaoPedeMotivo(c({}), 'AREA')).toBe(true);
    expect(decisaoPedeMotivo(c({ emendas: [] }), 'AREA')).toBe(false);
    expect(decisaoPedeMotivo(c({ emendas: [] }), 'MISTA')).toBe(true);
  });

  it('sugere SFC/CGLIC para emenda e área requisitante para o resto; mantém a decisão que existe', () => {
    expect(decisaoSugerida(c({}))).toBe('SFC');
    expect(decisaoSugerida(c({ emendas: [], situacao: 'AREA_PADRAO' }))).toBe('AREA');
    expect(decisaoSugerida(c({ situacao: 'MISTA' }))).toBe('MISTA');
  });

  it('pendências só nos contratos com a SFC/CGLIC', () => {
    expect(pendenciasDoContrato(c({ situacao: 'AREA' }))).toEqual([]);
    expect(pendenciasDoContrato(c({ situacao: 'SFC', fiscalUserId: 'u1' })).map((p) => p.tipo)).toEqual(['AUTUAR', 'PORTARIA']);
    expect(pendenciasDoContrato(c({ situacao: 'SFC', fiscalUserId: 'u1', processoSei: '34472015', autuadoEm: '2026-02-05', portariaSei: '34152364' }))).toEqual([]);
  });

  it('fiscal ou substituto', () => {
    const x = c({ situacao: 'SFC', fiscalUserId: 'u1', substitutoUserId: 'u2' });
    expect(ehDoFiscal(x, 'u1')).toBe(true);
    expect(ehDoFiscal(x, 'u2')).toBe(true);
    expect(ehDoFiscal(x, 'u3')).toBe(false);
    expect(ehDoFiscal(x, undefined)).toBe(false);
  });

  it('carga por fiscal conta titular, substituto, a autuar e sem portaria', () => {
    const lista = [
      c({ contractKey: 'a', situacao: 'SFC', fiscalUserId: 'u1', substitutoUserId: 'u2' }),
      c({ contractKey: 'b', situacao: 'MISTA', fiscalUserId: 'u1', processoSei: '1234567', autuadoEm: '2026-01-01' }),
      c({ contractKey: 'c', situacao: 'AREA', fiscalUserId: null })
    ];
    const carga = cargaPorFiscal(lista, [{ id: 'u2', nome: 'Bia' }, { id: 'u1', nome: 'Ana' }]);
    expect(carga[0]).toEqual({ userId: 'u1', nome: 'Ana', contratos: 2, comoSubstituto: 0, aAutuar: 1, semPortaria: 2 });
    expect(carga[1]).toEqual({ userId: 'u2', nome: 'Bia', contratos: 0, comoSubstituto: 1, aAutuar: 0, semPortaria: 0 });
  });

  it('número do contrato pela chave quando a fonte não traz', () => {
    expect(numeroDoContrato(c({ numero: '' }))).toBe('00055/2026');
  });

  it('hoje em Brasília', () => {
    expect(hojeEmBrasilia(new Date('2026-11-11T02:30:00Z'))).toBe('2026-11-10');
  });

  it('lê a linha da RPC', () => {
    const x = linhaParaContrato({ contract_key: 'k', uasg: '200331', numero: '1/2026', emendas: ['1', null], situacao: 'SFC', fiscal_user_id: 'u1', fiscal_nome: 'Ana' });
    expect(x.emendas).toEqual(['1']);
    expect(x.fiscalNome).toBe('Ana');
    expect(x.processoSei).toBeNull();
  });
});

describe('substitutosDoTitular', () => {
  it('lista os substitutos dos contratos do titular, do mais frequente ao menos, só com a SFC/CGLIC', () => {
    const lista = [
      c({ contractKey: 'a', situacao: 'SFC', fiscalUserId: 'u1', substitutoUserId: 's1', substitutoNome: 'Bia' }),
      c({ contractKey: 'b', situacao: 'SFC', fiscalUserId: 'u1', substitutoUserId: 's2', substitutoNome: 'Ana' }),
      c({ contractKey: 'c', situacao: 'MISTA', fiscalUserId: 'u1', substitutoUserId: 's2', substitutoNome: 'Ana' }),
      c({ contractKey: 'd', situacao: 'SFC', fiscalUserId: 'u1', substitutoUserId: null }),
      c({ contractKey: 'e', situacao: 'SFC', fiscalUserId: 'u9', substitutoUserId: 's1', substitutoNome: 'Bia' }),
      c({ contractKey: 'f', situacao: 'AREA', fiscalUserId: null, substitutoUserId: null })
    ];
    expect(substitutosDoTitular(lista, 'u1')).toEqual([
      { userId: 's2', nome: 'Ana', contratos: 2 },
      { userId: 's1', nome: 'Bia', contratos: 1 }
    ]);
    expect(substitutosDoTitular(lista, 'u3')).toEqual([]);
  });
});
