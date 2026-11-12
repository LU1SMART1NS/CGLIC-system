import { describe, it, expect } from 'vitest';
import type { ContratoFiscalizacao } from '../../services/fiscalizacaoService';
import { linhaParaContrato } from '../../services/fiscalizacaoService';
import { cargaPorFiscal, mediaDaEquipeFiscal, podeSerFiscal, decisaoPedeMotivo, decisaoSugerida, ehDoFiscal, hojeEmBrasilia, numeroDoContrato, pendenciasDoContrato, segmentoDoContrato } from '../fiscalizacao';

const base: ContratoFiscalizacao = {
  contractKey: '200331-00055-2026', uasg: '200331', numero: '00055/2026', fornecedor: 'CONDOR', objeto: null, assinatura: '2026-01-29', vigenciaFim: '2027-01-29',
  emendas: ['27960009'], situacao: 'A_DEFINIR', motivo: null, fiscalUserId: null, fiscalNome: null,
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

  it('é do fiscal', () => {
    const x = c({ situacao: 'SFC', fiscalUserId: 'u1' });
    expect(ehDoFiscal(x, 'u1')).toBe(true);
    expect(ehDoFiscal(x, 'u2')).toBe(false);
    expect(ehDoFiscal(x, 'u3')).toBe(false);
    expect(ehDoFiscal(x, undefined)).toBe(false);
  });

  it('carga por fiscal conta contratos, a autuar e sem portaria', () => {
    const lista = [
      c({ contractKey: 'a', situacao: 'SFC', fiscalUserId: 'u1' }),
      c({ contractKey: 'b', situacao: 'MISTA', fiscalUserId: 'u1', processoSei: '1234567', autuadoEm: '2026-01-01' }),
      c({ contractKey: 'c', situacao: 'AREA', fiscalUserId: null })
    ];
    const carga = cargaPorFiscal(lista, [{ id: 'u2', nome: 'Bia' }, { id: 'u1', nome: 'Ana' }]);
    expect(carga[0]).toEqual({ userId: 'u1', nome: 'Ana', contratos: 2, aAutuar: 1, semPortaria: 2 });
    expect(carga[1]).toEqual({ userId: 'u2', nome: 'Bia', contratos: 0, aAutuar: 0, semPortaria: 0 });
  });

  it('quem tem contrato como fiscal aparece, seja qual for o perfil; sem contrato, só o Gestor de Fiscalização', () => {
    const lista = [c({ contractKey: 'a', situacao: 'SFC', fiscalUserId: 'coord' }), c({ contractKey: 'b', situacao: 'SFC', fiscalUserId: 'gest' })];
    const servidores = [
      { id: 'fisc', nome: 'Ana', perfil: 'gestor_fiscalizacao' },
      { id: 'coord', nome: 'Hugo', perfil: 'coordenador' },
      { id: 'coord2', nome: 'Dani', perfil: 'coordenador' },
      { id: 'gest', nome: 'Edu', perfil: 'gestor' },
      { id: 'cons', nome: 'Lia', perfil: 'consulta' }
    ];
    const carga = cargaPorFiscal(lista, servidores);
    expect(carga.map((f) => [f.nome, f.outroPerfil ?? null, f.contratos])).toEqual([
      ['Edu', 'Gestor', 1],
      ['Hugo', 'Coordenador', 1],
      ['Ana', null, 0]
    ]);
  });

  it('média da equipe de fiscais: coordenador com metade da capacidade, outro perfil fora', () => {
    const f = (userId: string, contratos: number, outroPerfil?: string) => ({ userId, nome: userId, contratos, aAutuar: 0, semPortaria: 0, ...(outroPerfil ? { outroPerfil } : {}) });
    // Ocupações: a 60, b 40, c 20, coord 30÷0,5 = 60. Média 45. Eden (Gestor) fica fora.
    const { media, porFiscal } = mediaDaEquipeFiscal([f('a', 60), f('b', 40), f('c', 20), f('coord', 30, 'Coordenador'), f('eden', 8, 'Gestor'), f('zero', 0)]);
    expect(media).toBe(45);
    expect(porFiscal.get('coord')).toEqual({ ocupacao: 60, relacao: 'ACIMA' });
    expect(porFiscal.get('b')?.relacao).toBe('NA_MEDIA');
    expect(porFiscal.get('c')?.relacao).toBe('ABAIXO');
    expect(porFiscal.get('eden')?.relacao).toBeNull();
    expect(mediaDaEquipeFiscal([f('a', 10), f('eden', 5, 'Gestor')]).media).toBeNull();
  });

  it('pode receber contratos como fiscal: Gestor de Fiscalização e Coordenador', () => {
    expect(podeSerFiscal('gestor_fiscalizacao')).toBe(true);
    expect(podeSerFiscal('coordenador')).toBe(true);
    expect(podeSerFiscal('gestor')).toBe(false);
    expect(podeSerFiscal('consulta')).toBe(false);
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
