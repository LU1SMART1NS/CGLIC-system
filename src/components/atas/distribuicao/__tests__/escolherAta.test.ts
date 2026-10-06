import { describe, it, expect } from 'vitest';
import { opcoesDeAta } from '../escolherAta';
import type { FilaAta } from '../contratosSemAta';

const ata = (numeroAta: string, extra: Partial<FilaAta> = {}): FilaAta => ({
  numeroAta,
  uasg: '200331',
  numeroCompra: '90099',
  anoCompra: '2024',
  cnpjs: ['99999999000199'],
  fornecedorNomes: ['Outro Fornecedor LTDA'],
  faixa: 'REGULAR',
  dias: 100,
  itens: 1,
  ...extra
});
// idCompra = UASG + modalidade + número + ano
const contrato = { idCompra: '20033105900252025', fornecedorCnpj: '11.111.111/0001-11', fornecedorNome: 'Fornecedor A LTDA' };
const numeros = (l: ReturnType<typeof opcoesDeAta>) => l.map((o) => o.ata.numeroAta);

describe('opcoesDeAta', () => {
  it('traz todas as atas, inclusive as sem pista e as encerradas', () => {
    const r = opcoesDeAta(contrato, [ata('00001/2024'), ata('00002/2024', { faixa: 'EXPIRADO' })]);
    expect(r).toHaveLength(2);
    expect(r.find((o) => o.ata.numeroAta === '00002/2024')).toMatchObject({ encerrada: true, motivo: undefined });
  });

  it('ordena por pista: compra e fornecedor, só compra, só fornecedor, nenhuma', () => {
    const r = opcoesDeAta(contrato, [
      ata('00001/2024'),
      ata('00002/2024', { cnpjs: ['11111111000111'] }),
      ata('00003/2024', { numeroCompra: '90025', anoCompra: '2025' }),
      ata('00004/2024', { numeroCompra: '90025', anoCompra: '2025', cnpjs: ['11111111000111'] })
    ]);
    expect(numeros(r)).toEqual(['00004/2024', '00003/2024', '00002/2024', '00001/2024']);
    expect(r.map((o) => o.motivo)).toEqual(['COMPRA_E_FORNECEDOR', 'COMPRA', 'FORNECEDOR', undefined]);
  });

  it('sem pista, as vigentes antes das encerradas e as mais novas primeiro', () => {
    const r = opcoesDeAta(contrato, [ata('00009/2023'), ata('00002/2025', { faixa: 'EXPIRADO' }), ata('00010/2024'), ata('00011/2024')]);
    expect(numeros(r)).toEqual(['00011/2024', '00010/2024', '00009/2023', '00002/2025']);
  });

  it('a ata descartada para o contrato vai para o fim, mesmo com pista', () => {
    const forte = ata('00004/2024', { numeroCompra: '90025', anoCompra: '2025', cnpjs: ['11111111000111'] });
    const r = opcoesDeAta(contrato, [forte, ata('00001/2024')], { descartadas: new Set(['00004/2024-200331']) });
    expect(numeros(r)).toEqual(['00001/2024', '00004/2024']);
    expect(r[1]).toMatchObject({ descartada: true, motivo: 'COMPRA_E_FORNECEDOR' });
  });

  it('busca por número (com ou sem zeros), objeto, fornecedor, compra e gestor, sem acento', () => {
    const atas = [
      ata('00051/2024', { objeto: 'Aquisição de câmeras corporais', fornecedorNomes: ['Axon Enterprise, Inc.'], numeroCompra: '90033', gestorNome: 'Maria Souza' }),
      ata('00079/2024', { objeto: 'Máscaras de proteção' })
    ];
    expect(numeros(opcoesDeAta(contrato, atas, { busca: '51/2024' }))).toEqual(['00051/2024']);
    expect(numeros(opcoesDeAta(contrato, atas, { busca: 'cameras' }))).toEqual(['00051/2024']);
    expect(numeros(opcoesDeAta(contrato, atas, { busca: 'axon' }))).toEqual(['00051/2024']);
    expect(numeros(opcoesDeAta(contrato, atas, { busca: '90033/2024' }))).toEqual(['00051/2024']);
    expect(numeros(opcoesDeAta(contrato, atas, { busca: 'maria' }))).toEqual(['00051/2024']);
    expect(numeros(opcoesDeAta(contrato, atas, { busca: 'mascaras' }))).toEqual(['00079/2024']);
    expect(opcoesDeAta(contrato, atas, { busca: 'inexistente' })).toEqual([]);
  });

  it('fornecedor estrangeiro: a pista por fornecedor vem pelo nome', () => {
    const estrangeiro = { idCompra: '20033105900332024', fornecedorCnpj: 'EXAXONEN1', fornecedorNome: 'AXON  INTERPRISE' };
    const r = opcoesDeAta(estrangeiro, [ata('00001/2024'), ata('00051/2024', { numeroCompra: '90033', cnpjs: ['0000348'], fornecedorNomes: ['Axon Enterprise, Inc.'] })]);
    expect(r[0]).toMatchObject({ ata: { numeroAta: '00051/2024' }, motivo: 'COMPRA_E_FORNECEDOR' });
  });
});
